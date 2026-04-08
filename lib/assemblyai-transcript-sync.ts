import { AssemblyAI } from 'assemblyai'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects, transcripts, transcriptSegments } from '@/lib/db/schema'

type TranscriptRow = typeof transcripts.$inferSelect

const apiKey = process.env.ASSEMBLYAI_API_KEY || ''
const baseUrl = process.env.ASSEMBLYAI_BASE_URL || undefined
const client = new AssemblyAI({ apiKey, baseUrl })

export type TranscriptPollSyncResult =
  | {
      status: 'completed'
      transcriptId: string
      duration: number
      speechModelUsed?: string | null
    }
  | { status: 'error'; error?: string }
  | {
      status: 'pending'
      assemblyStatus: string
      transcriptionProgress: number
      error?: string
    }

/** Map AssemblyAI queue state to UI progress between 50 and 99 while transcribing. */
export function transcriptionProgressFromAssemblyStatus(assemblyStatus: string): number {
  switch (assemblyStatus) {
    case 'queued':
      return 56
    case 'processing':
      return 78
    default:
      return 60
  }
}

export async function insertSegmentsFromTranscriptResult(
  transcriptUuid: string,
  transcriptResult: Awaited<ReturnType<typeof client.transcripts.get>>,
) {
  if (transcriptResult.utterances?.length) {
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
    return
  }

  const words = transcriptResult.words
  if (words?.length) {
    const text = words.map((w) => w.text).join(' ')
    const start = words[0].start
    const end = words[words.length - 1].end
    const confidence = words.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / words.length
    await db.insert(transcriptSegments).values([
      {
        id: `seg-${transcriptUuid}-0`,
        transcriptId: transcriptUuid,
        start,
        end,
        text,
        speaker: 'Speaker A',
        confidence,
        words: words.map((w) => ({
          start: w.start,
          end: w.end,
          text: w.text,
          confidence: w.confidence,
        })),
      },
    ])
    return
  }

  const text = transcriptResult.text?.trim()
  if (!text) return

  const durationMs = (transcriptResult.audio_duration || 0) * 1000
  await db.insert(transcriptSegments).values([
    {
      id: `seg-${transcriptUuid}-0`,
      transcriptId: transcriptUuid,
      start: 0,
      end: durationMs,
      text,
      speaker: 'Speaker A',
      confidence: transcriptResult.confidence ?? 1,
      words: null,
    },
  ])
}

function isSafeDuplicateSegmentInsertError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('duplicate key') &&
    (message.includes('transcript_segments') || message.includes('pkey'))
  )
}

async function ensureSegmentsPersisted(
  transcriptUuid: string,
  transcriptResult: Awaited<ReturnType<typeof client.transcripts.get>>,
) {
  try {
    await insertSegmentsFromTranscriptResult(transcriptUuid, transcriptResult)
  } catch (error) {
    if (!isSafeDuplicateSegmentInsertError(error)) {
      throw error
    }
  }
}

async function persistCompletedTranscript(
  projectId: string,
  dbTranscript: TranscriptRow | undefined,
  transcriptResult: Awaited<ReturnType<typeof client.transcripts.get>>,
  assemblyAiIdForInsert: string,
): Promise<{ transcriptId: string; duration: number; speechModelUsed?: string | null }> {
  const durationMs = (transcriptResult.audio_duration || 0) * 1000

  if (!dbTranscript) {
    const [legacy] = await db
      .insert(transcripts)
      .values({
        projectId,
        language: transcriptResult.language_code || 'en',
        totalDuration: durationMs,
        speechModel: transcriptResult.speech_model_used,
        assemblyAiTranscriptId: assemblyAiIdForInsert,
      })
      .returning()

    await ensureSegmentsPersisted(legacy.id, transcriptResult)

    await db
      .update(projects)
      .set({
        status: 'ready',
        duration: durationMs,
        transcriptionProgress: 100,
      })
      .where(eq(projects.id, projectId))

    return {
      transcriptId: legacy.id,
      duration: durationMs,
      speechModelUsed: transcriptResult.speech_model_used,
    }
  }

  const existingSegs = await db
    .select({ id: transcriptSegments.id })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, dbTranscript.id))
    .limit(1)

  if (existingSegs.length === 0) {
    await ensureSegmentsPersisted(dbTranscript.id, transcriptResult)
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

  return {
    transcriptId: dbTranscript.id,
    duration: durationMs,
    speechModelUsed: transcriptResult.speech_model_used,
  }
}

/**
 * Resolve DB transcript row for polling: by AssemblyAI id, scoped to project.
 * Rejects stale/wrong client transcriptId or cross-project assembly id reuse.
 */
async function resolveTranscriptRowForPoll(
  assemblyAiId: string,
  projectId: string,
  transcriptId: string | undefined,
): Promise<{ ok: true; row: TranscriptRow | undefined } | { ok: false; error: string }> {
  const [found] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.assemblyAiTranscriptId, assemblyAiId))
    .limit(1)

  if (!found) {
    return { ok: true, row: undefined }
  }
  if (found.projectId !== projectId) {
    return { ok: false, error: 'Transcript does not belong to this project' }
  }
  if (transcriptId !== undefined && transcriptId !== '' && transcriptId !== found.id) {
    return { ok: false, error: 'Transcript id does not match AssemblyAI job' }
  }
  return { ok: true, row: found }
}

/**
 * Poll handler + webhook: load AssemblyAI transcript, update DB for completed / error / in-progress.
 */
export async function syncTranscriptFromAssemblyAi(
  assemblyAiId: string,
  projectId: string,
  transcriptId: string | undefined,
): Promise<TranscriptPollSyncResult> {
  if (!apiKey) {
    return { status: 'error', error: 'Missing AssemblyAI API key' }
  }

  const transcriptResult = await client.transcripts.get(assemblyAiId)

  const resolved = await resolveTranscriptRowForPoll(assemblyAiId, projectId, transcriptId)
  if (!resolved.ok) {
    return { status: 'error', error: resolved.error }
  }
  const dbTranscript = resolved.row

  if (transcriptResult.status === 'completed') {
    const out = await persistCompletedTranscript(projectId, dbTranscript, transcriptResult, assemblyAiId)
    return {
      status: 'completed',
      transcriptId: out.transcriptId,
      duration: out.duration,
      speechModelUsed: out.speechModelUsed,
    }
  }

  if (transcriptResult.status === 'error') {
    console.error(`[AssemblyAI] Transcription failed: ${transcriptResult.error}`)
    await db
      .update(projects)
      .set({ status: 'error' })
      .where(eq(projects.id, projectId))
    return { status: 'error', error: transcriptResult.error }
  }

  const progress = transcriptionProgressFromAssemblyStatus(transcriptResult.status)
  await db
    .update(projects)
    .set({ transcriptionProgress: progress })
    .where(eq(projects.id, projectId))

  return {
    status: 'pending',
    assemblyStatus: transcriptResult.status,
    transcriptionProgress: progress,
    error: transcriptResult.error,
  }
}

/**
 * Webhook path: AssemblyAI POSTs `{ transcript_id, status }` (completed | error); we fetch the
 * full transcript by ID and persist. Idempotent if called multiple times.
 */
export async function syncTranscriptFromWebhook(assemblyAiId: string): Promise<void> {
  if (!apiKey) {
    console.error('[AssemblyAI webhook] Missing API key')
    return
  }

  const matchedRows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.assemblyAiTranscriptId, assemblyAiId))
    .limit(1)

  const dbTranscript = matchedRows[0]
  if (!dbTranscript) {
    console.warn('[AssemblyAI webhook] No transcript row for', assemblyAiId)
    return
  }

  const projectId = dbTranscript.projectId
  const transcriptResult = await client.transcripts.get(assemblyAiId)

  if (transcriptResult.status === 'completed') {
    await persistCompletedTranscript(projectId, dbTranscript, transcriptResult, assemblyAiId)
    return
  }

  if (transcriptResult.status === 'error') {
    console.error(`[AssemblyAI webhook] Transcription failed: ${transcriptResult.error}`)
    await db.update(projects).set({ status: 'error' }).where(eq(projects.id, projectId))
  }
}
