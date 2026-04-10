import { AssemblyAI } from 'assemblyai'
import { and, eq, gt, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  projects,
  transcripts,
  transcriptSegments,
  type ProjectRow,
  type ProjectStatus,
  type StoredTranscriptWord,
} from '@/lib/db/schema'

type TranscriptRow = typeof transcripts.$inferSelect
type ProjectSyncRow = Pick<ProjectRow, 'id' | 'status' | 'activeTranscriptId'>

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

/** When `activeTranscriptId` is null during transcribing, only this AssemblyAI job may update project state. */
export type TranscriptProjectSyncContext = {
  assemblyAiJobId: string
  transcriptAssemblyAiId: string | null
}

export function transcriptOwnsProjectState(
  project: Pick<ProjectSyncRow, 'status' | 'activeTranscriptId'>,
  transcriptId: string,
  syncContext?: TranscriptProjectSyncContext,
): boolean {
  if (project.activeTranscriptId === transcriptId) return true
  if (project.activeTranscriptId != null || project.status !== 'transcribing') return false
  const job = syncContext?.assemblyAiJobId
  const stored = syncContext?.transcriptAssemblyAiId
  return Boolean(job && stored && stored === job)
}

function transcriptSyncContext(
  assemblyAiJobId: string,
  transcriptAssemblyAiId: string | null | undefined,
): TranscriptProjectSyncContext {
  return { assemblyAiJobId, transcriptAssemblyAiId: transcriptAssemblyAiId ?? null }
}

export function projectStatusAfterTranscriptFailure(hasCompletedTranscript: boolean): ProjectStatus {
  return hasCompletedTranscript ? 'ready' : 'error'
}

function storedWordsFromApi(
  words: { start: number; end: number; text: string; confidence?: number | null }[] | undefined | null,
): StoredTranscriptWord[] {
  return (words ?? []).map((w) => ({
    start: w.start,
    end: w.end,
    text: w.text,
    confidence: w.confidence ?? 0,
  }))
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
      words: storedWordsFromApi(u.words),
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
        words: storedWordsFromApi(words),
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

const READY_PROJECT_AFTER_TRANSCRIPT = {
  status: 'ready' as const,
  transcriptionProgress: 100,
  processingError: null as string | null,
  activeTranscriptId: null as null,
  pendingAutoTranscriptionOptions: null as null,
}

async function markProjectReadyAfterCompletedTranscript(
  projectId: string,
  durationMs: number,
  preferredTranscriptId: string,
): Promise<void> {
  await db
    .update(projects)
    .set({
      ...READY_PROJECT_AFTER_TRANSCRIPT,
      duration: durationMs,
      preferredTranscriptId,
    })
    .where(eq(projects.id, projectId))
}

async function persistCompletedTranscript(
  projectState: ProjectSyncRow,
  projectId: string,
  dbTranscript: TranscriptRow | undefined,
  transcriptResult: Awaited<ReturnType<typeof client.transcripts.get>>,
  assemblyAiIdForInsert: string,
): Promise<{ transcriptId: string; duration: number; speechModelUsed?: string | null }> {
  const durationMs = (transcriptResult.audio_duration || 0) * 1000
  const speechModelUsed = transcriptResult.speech_model_used

  if (!dbTranscript) {
    const [legacy] = await db
      .insert(transcripts)
      .values({
        projectId,
        language: transcriptResult.language_code || 'en',
        totalDuration: durationMs,
        speechModel: speechModelUsed,
        assemblyAiTranscriptId: assemblyAiIdForInsert,
      })
      .returning()

    await ensureSegmentsPersisted(legacy.id, transcriptResult)

    if (
      transcriptOwnsProjectState(
        projectState,
        legacy.id,
        transcriptSyncContext(assemblyAiIdForInsert, legacy.assemblyAiTranscriptId),
      )
    ) {
      await markProjectReadyAfterCompletedTranscript(projectId, durationMs, legacy.id)
    }

    return { transcriptId: legacy.id, duration: durationMs, speechModelUsed }
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
      speechModel: speechModelUsed ?? dbTranscript.speechModel,
    })
    .where(eq(transcripts.id, dbTranscript.id))

  if (
    transcriptOwnsProjectState(
      projectState,
      dbTranscript.id,
      transcriptSyncContext(assemblyAiIdForInsert, dbTranscript.assemblyAiTranscriptId),
    )
  ) {
    await markProjectReadyAfterCompletedTranscript(projectId, durationMs, dbTranscript.id)
  }

  return { transcriptId: dbTranscript.id, duration: durationMs, speechModelUsed }
}

async function getProjectSyncState(projectId: string): Promise<ProjectSyncRow | null> {
  const [project] = await db
    .select({
      id: projects.id,
      status: projects.status,
      activeTranscriptId: projects.activeTranscriptId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  return project ?? null
}

async function projectHasCompletedTranscript(projectId: string, excludingTranscriptId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.projectId, projectId),
        ne(transcripts.id, excludingTranscriptId),
        gt(transcripts.totalDuration, 0),
      ),
    )
    .limit(1)
  return Boolean(row)
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
  const projectState = await getProjectSyncState(projectId)
  if (!projectState) {
    return { status: 'error', error: 'Project not found' }
  }

  if (transcriptResult.status === 'completed') {
    const out = await persistCompletedTranscript(
      projectState,
      projectId,
      dbTranscript,
      transcriptResult,
      assemblyAiId,
    )
    return {
      status: 'completed',
      transcriptId: out.transcriptId,
      duration: out.duration,
      speechModelUsed: out.speechModelUsed,
    }
  }

  const rowSyncContext = transcriptSyncContext(assemblyAiId, dbTranscript?.assemblyAiTranscriptId)

  if (transcriptResult.status === 'error') {
    console.error(`[AssemblyAI] Transcription failed: ${transcriptResult.error}`)
    if (dbTranscript && transcriptOwnsProjectState(projectState, dbTranscript.id, rowSyncContext)) {
      const hasCompletedTranscript = await projectHasCompletedTranscript(projectId, dbTranscript.id)
      await db
        .update(projects)
        .set({
          status: projectStatusAfterTranscriptFailure(hasCompletedTranscript),
          processingError: hasCompletedTranscript
            ? null
            : (transcriptResult.error ?? 'Transcription failed.'),
          activeTranscriptId: null,
          pendingAutoTranscriptionOptions: null,
        })
        .where(eq(projects.id, projectId))
    }
    return { status: 'error', error: transcriptResult.error }
  }

  const progress = transcriptionProgressFromAssemblyStatus(transcriptResult.status)
  if (dbTranscript && transcriptOwnsProjectState(projectState, dbTranscript.id, rowSyncContext)) {
    await db
      .update(projects)
      .set({ transcriptionProgress: progress })
      .where(eq(projects.id, projectId))
  }

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

  const [row] = await db
    .select({ id: transcripts.id, projectId: transcripts.projectId })
    .from(transcripts)
    .where(eq(transcripts.assemblyAiTranscriptId, assemblyAiId))
    .limit(1)

  if (!row) {
    console.warn('[AssemblyAI webhook] No transcript row for', assemblyAiId)
    return
  }

  await syncTranscriptFromAssemblyAi(assemblyAiId, row.projectId, row.id)
}
