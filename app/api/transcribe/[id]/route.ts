import { NextResponse } from 'next/server'
import { syncTranscriptFromAssemblyAi } from '@/lib/assemblyai-transcript-sync'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assemblyAiId } = await params
    const body = await request.json().catch(() => ({}))
    const projectId = body.projectId as string | undefined
    const transcriptId = body.transcriptId as string | undefined

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    const access = await requireProjectAccessForRoute(projectId, 'editor')
    if (access instanceof NextResponse) return access

    const result = await syncTranscriptFromAssemblyAi(assemblyAiId, projectId, transcriptId)

    if (result.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        transcriptId: result.transcriptId,
        duration: result.duration,
        speechModelUsed: result.speechModelUsed,
        transcriptionProgress: 100,
      })
    }

    if (result.status === 'error') {
      return NextResponse.json({
        status: 'error',
        error: result.error,
      })
    }

    return NextResponse.json({
      status: result.assemblyStatus,
      error: result.error,
      transcriptionProgress: result.transcriptionProgress,
    })
  } catch (error) {
    console.error('Error polling AssemblyAI:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
