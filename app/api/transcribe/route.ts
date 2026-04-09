import { NextResponse } from 'next/server'
import {
  ProjectTranscriptionStartError,
  submitProjectTranscription,
} from '@/lib/transcription-submit'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const { projectId, options } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    const access = await requireProjectAccessForRoute(projectId, 'editor')
    if (access instanceof NextResponse) return access

    const result = await submitProjectTranscription({
      projectId,
      options,
      project: access.project,
    })

    return NextResponse.json({
      assemblyAiId: result.assemblyAiId,
      transcriptId: result.transcriptId,
      status: result.status,
    })
  } catch (error) {
    if (error instanceof ProjectTranscriptionStartError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Error submitting to AssemblyAI:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
