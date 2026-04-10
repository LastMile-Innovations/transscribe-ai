import { NextResponse } from 'next/server'
import {
  buildClipListTsvFileName,
  buildLegalTranscriptPdfFileName,
  buildLegalTranscriptTxtFileName,
  buildTranscriptExportFileName,
  serializeTranscriptExport,
} from './transcript-export'
import { buildClipListTsv, buildNumberedTranscriptLines, numberedTranscriptToPlainText } from './legal-transcript-export'
import { buildLegalTranscriptPdf } from './legal-transcript-pdf'
import type { Transcript } from './types'

type ProjectAccessResult = {
  project: {
    id: string
    title: string
  }
}

export type TranscriptExportRouteDeps = {
  requireProjectAccessForRoute: (
    projectId: string,
    minRole: 'viewer',
  ) => Promise<ProjectAccessResult | NextResponse>
  loadTranscriptForExport: (projectId: string, transcriptId?: string | null) => Promise<Transcript | null>
}

function contentDisposition(unicodeName: string, asciiFallback: string): string {
  const enc = encodeURIComponent(unicodeName)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${enc}`
}

export async function handleTranscriptExportRequest(
  request: Request,
  input: {
    projectId: string
    deps: TranscriptExportRouteDeps
  },
) {
  try {
    const access = await input.deps.requireProjectAccessForRoute(input.projectId, 'viewer')
    if (access instanceof NextResponse) return access

    const url = new URL(request.url)
    const transcriptId = url.searchParams.get('transcriptId')?.trim() || undefined
    const transcript = await input.deps.loadTranscriptForExport(input.projectId, transcriptId)

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    const formatRaw = (url.searchParams.get('format') || 'json').toLowerCase()
    const format = formatRaw === 'text' ? 'txt' : formatRaw

    if (format === 'json') {
      const document = serializeTranscriptExport({
        projectId: access.project.id,
        projectTitle: access.project.title,
        transcript,
      })
      const filename = buildTranscriptExportFileName(access.project.title)
      return new NextResponse(JSON.stringify(document, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': contentDisposition(filename.unicodeName, filename.asciiFallback),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const numbered = buildNumberedTranscriptLines(transcript.segments)
    const exportedIso = new Date().toISOString()
    const header = {
      title: access.project.title,
      transcriptId: transcript.id,
      exportedIso,
    }

    if (format === 'txt') {
      const body = numberedTranscriptToPlainText(numbered, header)
      const filename = buildLegalTranscriptTxtFileName(access.project.title)
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': contentDisposition(filename.unicodeName, filename.asciiFallback),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (format === 'clips' || format === 'tsv') {
      const body = buildClipListTsv(transcript.segments)
      const filename = buildClipListTsvFileName(access.project.title)
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/tab-separated-values; charset=utf-8',
          'Content-Disposition': contentDisposition(filename.unicodeName, filename.asciiFallback),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (format === 'pdf') {
      const pdfBytes = buildLegalTranscriptPdf({
        projectTitle: access.project.title,
        transcriptId: transcript.id,
        lines: numbered,
      })
      const filename = buildLegalTranscriptPdfFileName(access.project.title)
      return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': contentDisposition(filename.unicodeName, filename.asciiFallback),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    return NextResponse.json({ error: 'Unsupported format. Use json, txt, clips, or pdf.' }, { status: 400 })
  } catch (error) {
    console.error('transcript export:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
