import { NextResponse } from 'next/server'
import { AssemblyAI } from 'assemblyai'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, transcripts, transcriptSegments } from '@/lib/db/schema'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY || '' })

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

    const transcriptResult = await client.transcripts.get(assemblyAiId)

    const rowConditions = [eq(transcripts.assemblyAiTranscriptId, assemblyAiId)]
    if (transcriptId) {
      rowConditions.push(eq(transcripts.id, transcriptId))
    }

    const matchedRows = await db
      .select()
      .from(transcripts)
      .where(and(...rowConditions))
      .limit(1)

    let dbTranscript = matchedRows[0]

    if (transcriptResult.status === 'completed') {
      const durationMs = (transcriptResult.audio_duration || 0) * 1000

      if (!dbTranscript) {
        const [legacy] = await db
          .insert(transcripts)
          .values({
            projectId,
            language: transcriptResult.language_code || 'en',
            totalDuration: durationMs,
            speechModel: transcriptResult.speech_model_used,
            assemblyAiTranscriptId: assemblyAiId,
          })
          .returning()

        await insertSegmentsFromUtterances(legacy.id, transcriptResult)

        await db
          .update(projects)
          .set({
            status: 'ready',
            duration: durationMs,
            transcriptionProgress: 100,
          })
          .where(eq(projects.id, projectId))

        return NextResponse.json({
          status: transcriptResult.status,
          transcriptId: legacy.id,
          duration: durationMs,
          speechModelUsed: transcriptResult.speech_model_used,
        })
      }

      const existingSegs = await db
        .select({ id: transcriptSegments.id })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.transcriptId, dbTranscript.id))
        .limit(1)

      if (existingSegs.length === 0 && transcriptResult.utterances && transcriptResult.utterances.length > 0) {
        await insertSegmentsFromUtterances(dbTranscript.id, transcriptResult)
      }

      await db
        .update(transcripts)
        .set({
          language: transcriptResult.language_code || dbTranscript.language,
          totalDuration: durationMs,
          speechModel: transcriptResult.speech_model_used ?? dbTranscript.speechModel,
        })
        .where(eq(transcripts.id, dbTranscript.id))

      await db
        .update(projects)
        .set({
          status: 'ready',
          duration: durationMs,
          transcriptionProgress: 100,
        })
        .where(eq(projects.id, projectId))

      return NextResponse.json({
        status: transcriptResult.status,
        transcriptId: dbTranscript.id,
        duration: durationMs,
        speechModelUsed: transcriptResult.speech_model_used,
      })
    }

    if (transcriptResult.status === 'error') {
      console.error(`[AssemblyAI] Transcription failed: ${transcriptResult.error}`)
    }

    return NextResponse.json({ status: transcriptResult.status, error: transcriptResult.error })
  } catch (error) {
    console.error('Error polling AssemblyAI:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

async function insertSegmentsFromUtterances(
  transcriptUuid: string,
  transcriptResult: Awaited<ReturnType<typeof client.transcripts.get>>,
) {
  if (!transcriptResult.utterances?.length) return

  const segmentsToInsert = transcriptResult.utterances.map((u, i) => ({
    id: `seg-${transcriptUuid}-${i}`,
    transcriptId: transcriptUuid,
    start: u.start,
    end: u.end,
    text: u.text,
    speaker: u.speaker || 'Speaker A',
    confidence: u.confidence,
    words: (u.words || []).map((w) => ({
      start: w.start,
      end: w.end,
      text: w.text,
      confidence: w.confidence,
    })),
  }))

  await db.insert(transcriptSegments).values(segmentsToInsert)
}
