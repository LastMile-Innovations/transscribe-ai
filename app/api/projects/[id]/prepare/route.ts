import { after, NextResponse } from 'next/server'
import { parseClientMediaCaptureFromJson } from '@/lib/client-media-capture'
import { enqueueProjectPreparation, kickPrepareWorker } from '@/lib/project-prepare-worker'
import {
  normalizeTranscriptionOptions,
  validateTranscriptionOptions,
} from '@/lib/transcription-options'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const access = await requireProjectAccessForRoute(projectId, 'editor')
  if (access instanceof NextResponse) return access

  let body: { originalKey?: string; clientCapture?: unknown; transcriptionOptions?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const originalKey = body.originalKey
  if (!originalKey || typeof originalKey !== 'string') {
    return NextResponse.json({ error: 'Missing originalKey' }, { status: 400 })
  }

  try {
    const clientCapture = parseClientMediaCaptureFromJson(body.clientCapture)
    const transcriptionOptions =
      body.transcriptionOptions === undefined
        ? null
        : normalizeTranscriptionOptions(
            body.transcriptionOptions as Parameters<typeof normalizeTranscriptionOptions>[0],
          )
    const transcriptionValidationError =
      transcriptionOptions == null ? null : validateTranscriptionOptions(transcriptionOptions)
    if (transcriptionValidationError) {
      return NextResponse.json({ error: transcriptionValidationError }, { status: 400 })
    }

    const project = await enqueueProjectPreparation({
      project: access.project,
      originalKey,
      clientCapture,
      transcriptionOptions,
    })

    after(() => {
      void kickPrepareWorker().catch((error) => {
        console.error('prepare enqueue worker kick failed:', error)
      })
    })

    return NextResponse.json({
      success: true,
      projectId: project.id,
      status: project.status,
      alreadyPrepared: project.status !== 'queued_prepare' && project.mediaMetadata?.editKey != null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not queue preparation.' },
      { status: 400 },
    )
  }
}
