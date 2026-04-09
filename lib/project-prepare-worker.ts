import { and, eq, lt, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ClientMediaCapture } from '@/lib/client-media-capture'
import { db } from '@/lib/db'
import { findProjectById } from '@/lib/db/queries'
import { projects, type ProjectRow } from '@/lib/db/schema'
import { ffprobeFullReport, transcodeOrRemuxToMp4 } from '@/lib/ffmpeg-transcode'
import { buildStoredMediaMetadata } from '@/lib/media-metadata'
import { buildEditObjectKey, buildOriginalUploadKey, isValidOriginalObjectKey } from '@/lib/media-keys'
import { DEFAULT_PREPARE_STALE_AFTER_MS, projectHasPreparedEdit } from '@/lib/project-prepare'
import {
  browserObjectUrl,
  browserObjectUrlExpiresInSec,
  browserObjectUrlMode,
  downloadObjectToFileAndHash,
  publicObjectUrl,
  uploadFileToObjectKey,
} from '@/lib/s3-storage'
import {
  submitProjectTranscription,
  type SubmitProjectTranscriptionResult,
} from '@/lib/transcription-submit'
import type { TranscriptionRequestOptions } from '@/lib/transcription-options'

export type PrepareableProject = Pick<
  ProjectRow,
  | 'id'
  | 'workspaceProjectId'
  | 'fileName'
  | 'duration'
  | 'pendingClientCapture'
  | 'pendingAutoTranscriptionOptions'
>

export type PreparedMediaResult = {
  originalKey: string
  editKey: string
  sha256Hash: string
  duration: number
  mediaMetadata: ReturnType<typeof buildStoredMediaMetadata>
  storedOriginalFileUrl: string
  storedFileUrl: string
  originalFileUrl: string
  fileUrl: string
  playbackUrlRefreshedAt: number
  playbackUrlExpiresAt: number | null
}

type PrepareMediaDeps = {
  makeTempBase: (projectId: string) => string
  safeUnlink: (filePath: string) => Promise<void>
  downloadObjectToFileAndHash: typeof downloadObjectToFileAndHash
  ffprobeFullReport: typeof ffprobeFullReport
  transcodeOrRemuxToMp4: typeof transcodeOrRemuxToMp4
  uploadFileToObjectKey: typeof uploadFileToObjectKey
  browserObjectUrl: typeof browserObjectUrl
  publicObjectUrl: typeof publicObjectUrl
  now: () => number
}

async function safeUnlink(filePath: string) {
  try {
    await unlink(filePath)
  } catch {
    /* ignore */
  }
}

const defaultPrepareMediaDeps: PrepareMediaDeps = {
  makeTempBase: (projectId) =>
    path.join(os.tmpdir(), `prep-${projectId}-${randomBytes(8).toString('hex')}`),
  safeUnlink,
  downloadObjectToFileAndHash,
  ffprobeFullReport,
  transcodeOrRemuxToMp4,
  uploadFileToObjectKey,
  browserObjectUrl,
  publicObjectUrl,
  now: () => Date.now(),
}

let activePrepareWorker: Promise<void> | null = null

export function assertOriginalKeyForProject(project: Pick<ProjectRow, 'workspaceProjectId' | 'id'>, originalKey: string) {
  return isValidOriginalObjectKey(project.workspaceProjectId, project.id, originalKey)
}

export async function prepareProjectMedia(
  project: PrepareableProject,
  deps: PrepareMediaDeps = defaultPrepareMediaDeps,
): Promise<PreparedMediaResult> {
  const originalKey = buildOriginalUploadKey(project.workspaceProjectId, project.id, project.fileName)
  const editKey = buildEditObjectKey(project.workspaceProjectId, project.id)
  const tmpBase = deps.makeTempBase(project.id)
  const inputPath = `${tmpBase}-in`
  const outputPath = `${tmpBase}-out.mp4`

  try {
    const sha256Hash = await deps.downloadObjectToFileAndHash(originalKey, inputPath)
    const originalReport = await deps.ffprobeFullReport(inputPath)
    await deps.transcodeOrRemuxToMp4(inputPath, outputPath, originalReport)
    const editReport = await deps.ffprobeFullReport(outputPath)
    await deps.uploadFileToObjectKey(outputPath, editKey, 'video/mp4')

    const storedOriginalFileUrl = deps.publicObjectUrl(originalKey)
    const storedFileUrl = deps.publicObjectUrl(editKey)
    const [originalFileUrl, fileUrl] = await Promise.all([
      deps.browserObjectUrl(originalKey).catch(() => storedOriginalFileUrl),
      deps.browserObjectUrl(editKey).catch(() => storedFileUrl),
    ])
    const playbackUrlRefreshedAt = deps.now()
    const playbackUrlExpiresAt =
      browserObjectUrlMode() === 'presigned'
        ? playbackUrlRefreshedAt + browserObjectUrlExpiresInSec() * 1000
        : null

    const mediaMetadata = buildStoredMediaMetadata(
      originalKey,
      editKey,
      originalReport,
      editReport,
      (project.pendingClientCapture ?? undefined) as ClientMediaCapture | undefined,
    )
    const duration =
      mediaMetadata.derived.sourceDurationMs != null && mediaMetadata.derived.sourceDurationMs > 0
        ? mediaMetadata.derived.sourceDurationMs
        : project.duration

    return {
      originalKey,
      editKey,
      sha256Hash,
      duration,
      mediaMetadata,
      storedOriginalFileUrl,
      storedFileUrl,
      originalFileUrl,
      fileUrl,
      playbackUrlRefreshedAt,
      playbackUrlExpiresAt,
    }
  } finally {
    await deps.safeUnlink(inputPath)
    await deps.safeUnlink(outputPath)
  }
}

export async function enqueueProjectPreparation(input: {
  project: ProjectRow
  originalKey: string
  clientCapture?: ClientMediaCapture
  transcriptionOptions: TranscriptionRequestOptions | null
}): Promise<ProjectRow> {
  if (!assertOriginalKeyForProject(input.project, input.originalKey)) {
    throw new Error('Invalid originalKey for this project')
  }

  if (projectHasPreparedEdit(input.project)) {
    return input.project
  }

  if (input.project.status === 'queued_prepare' || input.project.status === 'preparing') {
    if (input.clientCapture) {
      const [updated] = await db
        .update(projects)
        .set({
          pendingClientCapture: input.clientCapture,
          pendingAutoTranscriptionOptions: input.transcriptionOptions,
        })
        .where(eq(projects.id, input.project.id))
        .returning()
      return updated ?? input.project
    }
    if (input.project.pendingAutoTranscriptionOptions !== input.transcriptionOptions) {
      const [updated] = await db
        .update(projects)
        .set({ pendingAutoTranscriptionOptions: input.transcriptionOptions })
        .where(eq(projects.id, input.project.id))
        .returning()
      return updated ?? input.project
    }
    return input.project
  }

  const [updated] = await db
    .update(projects)
    .set({
      status: 'queued_prepare',
      transcriptionProgress: 50,
      processingError: null,
      prepareStartedAt: null,
      prepareCompletedAt: null,
      pendingClientCapture: input.clientCapture ?? input.project.pendingClientCapture ?? null,
      pendingAutoTranscriptionOptions: input.transcriptionOptions,
    })
    .where(eq(projects.id, input.project.id))
    .returning()

  if (!updated) {
    throw new Error('Project not found')
  }

  return updated
}

export async function requeueStalePreparingProjects(
  now = new Date(),
  staleAfterMs = DEFAULT_PREPARE_STALE_AFTER_MS,
): Promise<number> {
  const staleBefore = new Date(now.getTime() - staleAfterMs)
  const rows = await db
    .update(projects)
    .set({
      status: 'queued_prepare',
      prepareStartedAt: null,
      processingError: null,
    })
    .where(and(eq(projects.status, 'preparing'), lt(projects.prepareStartedAt, staleBefore)))
    .returning({ id: projects.id, status: projects.status })

  return rows.length
}

export async function claimNextQueuedPrepareProject(): Promise<ProjectRow | null> {
  const result = await db.execute(sql<{ id: string }>`
    with next_project as (
      select id
      from projects
      where status = 'queued_prepare'
      order by uploaded_at asc
      for update skip locked
      limit 1
    )
    update projects as p
    set
      status = 'preparing',
      transcription_progress = 55,
      processing_error = null,
      prepare_started_at = now(),
      prepare_completed_at = null,
      prepare_attempts = p.prepare_attempts + 1
    from next_project
    where p.id = next_project.id
    returning p.id
  `)

  const claimedId = (result[0] as { id?: string } | undefined)?.id
  if (!claimedId) return null
  return findProjectById(claimedId)
}

async function markPrepareSuccess(projectId: string, prepared: PreparedMediaResult): Promise<void> {
  await db
    .update(projects)
    .set({
      status: 'awaiting_transcript',
      transcriptionProgress: 0,
      processingError: null,
      originalFileUrl: prepared.storedOriginalFileUrl,
      fileUrl: prepared.storedFileUrl,
      sha256Hash: prepared.sha256Hash,
      duration: prepared.duration,
      mediaMetadata: prepared.mediaMetadata,
      prepareCompletedAt: new Date(),
      pendingClientCapture: null,
    })
    .where(eq(projects.id, projectId))
}

function autoTranscriptionStartFailureMessage(error: unknown): string {
  const detail =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : 'Please review the transcription settings and start it manually.'
  return `Editor MP4 is ready, but automatic transcription could not be started. ${detail}`
}

async function markAutoTranscriptionStartFailure(projectId: string, message: string): Promise<void> {
  await db
    .update(projects)
    .set({
      status: 'awaiting_transcript',
      transcriptionProgress: 0,
      processingError: message,
      pendingAutoTranscriptionOptions: null,
    })
    .where(eq(projects.id, projectId))
}

async function markPrepareFailure(project: ProjectRow, message: string): Promise<void> {
  const originalKey = buildOriginalUploadKey(project.workspaceProjectId, project.id, project.fileName)
  const storedOriginalFileUrl = publicObjectUrl(originalKey)
  await db
    .update(projects)
    .set({
      status: 'error',
      transcriptionProgress: 0,
      processingError: message,
      fileUrl: project.fileUrl ?? storedOriginalFileUrl,
      originalFileUrl: project.originalFileUrl ?? storedOriginalFileUrl,
      prepareCompletedAt: new Date(),
    })
    .where(eq(projects.id, project.id))
}

type FinalizePreparedProjectDeps = {
  markPrepareSuccess: (projectId: string, prepared: PreparedMediaResult) => Promise<void>
  submitProjectTranscription: (input: {
    projectId: string
    options?: Partial<TranscriptionRequestOptions>
    clearPendingAutoTranscription?: boolean
  }) => Promise<SubmitProjectTranscriptionResult>
  markAutoTranscriptionStartFailure: (projectId: string, message: string) => Promise<void>
}

const defaultFinalizePreparedProjectDeps: FinalizePreparedProjectDeps = {
  markPrepareSuccess,
  submitProjectTranscription,
  markAutoTranscriptionStartFailure,
}

export async function finalizePreparedProject(
  input: {
    projectId: string
    prepared: PreparedMediaResult
    pendingAutoTranscriptionOptions: TranscriptionRequestOptions | null
  },
  deps: FinalizePreparedProjectDeps = defaultFinalizePreparedProjectDeps,
): Promise<{ status: 'awaiting_transcript' | 'transcribing'; processingError: string | null }> {
  await deps.markPrepareSuccess(input.projectId, input.prepared)

  if (!input.pendingAutoTranscriptionOptions) {
    return { status: 'awaiting_transcript', processingError: null }
  }

  try {
    await deps.submitProjectTranscription({
      projectId: input.projectId,
      options: input.pendingAutoTranscriptionOptions,
      clearPendingAutoTranscription: true,
    })
    return { status: 'transcribing', processingError: null }
  } catch (error) {
    const message = autoTranscriptionStartFailureMessage(error)
    await deps.markAutoTranscriptionStartFailure(input.projectId, message)
    return { status: 'awaiting_transcript', processingError: message }
  }
}

async function processPrepareProject(project: ProjectRow): Promise<void> {
  try {
    const prepared = await prepareProjectMedia(project)
    const latestProject = (await findProjectById(project.id)) ?? project
    await finalizePreparedProject({
      projectId: project.id,
      prepared,
      pendingAutoTranscriptionOptions: latestProject.pendingAutoTranscriptionOptions ?? null,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not prepare the editor video (transcode or storage).'
    console.error('project prepare worker:', error)
    await markPrepareFailure(project, message)
  }
}

async function drainPrepareQueue(): Promise<void> {
  await requeueStalePreparingProjects()

  while (true) {
    const nextProject = await claimNextQueuedPrepareProject()
    if (!nextProject) return
    await processPrepareProject(nextProject)
  }
}

export function kickPrepareWorker(): Promise<void> {
  if (!activePrepareWorker) {
    activePrepareWorker = drainPrepareQueue().finally(() => {
      activePrepareWorker = null
    })
  }
  return activePrepareWorker
}
