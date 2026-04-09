import { NextResponse } from 'next/server'
import { buildTranscriptExportFileName, serializeTranscriptExport } from './transcript-export'
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
  } catch (error) {
    console.error('transcript export:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
