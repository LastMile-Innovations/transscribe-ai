import { AssemblyAI } from 'assemblyai'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  projects,
  transcripts,
  type ProjectRow,
  type TranscriptRow,
} from '@/lib/db/schema'
import { transcriptionProgressFromAssemblyStatus } from '@/lib/assemblyai-transcript-sync'
import { buildEditObjectKey } from '@/lib/media-keys'
import { projectHasPreparedEdit } from '@/lib/project-prepare'
import {
  activeTranscriptionReservationDisposition,
} from '@/lib/transcription-reservation'
import {
  getObjectBodyStream,
  objectUrlUnreachableFromAssemblyAi,
  presignGetObject,
  publicObjectUrl,
  transcriptionObjectUrlMode,
} from '@/lib/s3-storage'
import {
  normalizeTranscriptionOptions,
  validateTranscriptionOptions,
  type TranscriptionRequestOptions,
} from '@/lib/transcription-options'

/**
 * Pre-recorded transcription: submit then poll (and/or webhook). `speech_models` is always sent.
 * @see https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio
 * @see https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/webhooks
 * @see https://www.assemblyai.com/docs/pre-recorded-audio/universal-3-pro
 * @see https://www.assemblyai.com/docs/pre-recorded-audio/prompting
 */
const apiKey = process.env.ASSEMBLYAI_API_KEY || ''
const baseUrl = process.env.ASSEMBLYAI_BASE_URL || undefined
const client = new AssemblyAI({ apiKey, baseUrl })

export class ProjectTranscriptionStartError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'ProjectTranscriptionStartError'
    this.statusCode = statusCode
  }
}

export type SubmitProjectTranscriptionResult = {
  assemblyAiId: string
  transcriptId: string
  status: string
  normalizedOptions: TranscriptionRequestOptions
}

function resolveEditKey(project: Pick<ProjectRow, 'id' | 'workspaceProjectId' | 'status' | 'mediaMetadata'>) {
  const hasPreparedAsset =
    projectHasPreparedEdit(project) ||
    project.status === 'awaiting_transcript' ||
    project.status === 'ready'

  if (!hasPreparedAsset) {
    throw new ProjectTranscriptionStartError('Editor MP4 is not ready for transcription yet.')
  }

  return project.mediaMetadata?.editKey ?? buildEditObjectKey(project.workspaceProjectId, project.id)
}

type ReservedTranscriptionStart =
  | {
      kind: 'existing'
      transcriptId: string
      assemblyAiId: string
    }
  | {
      kind: 'reserved'
      project: ProjectRow
      transcriptId: string
    }

async function reserveProjectTranscriptionStart(input: {
  projectId: string
  project?: ProjectRow | null
  label: string | null
}): Promise<ReservedTranscriptionStart> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from projects where id = ${input.projectId} for update`)

    const lockedProject =
      (
        await tx.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
      )[0] ?? null

    if (!lockedProject) {
      throw new ProjectTranscriptionStartError('Project not found', 404)
    }

    let activeTranscript: TranscriptRow | null = null
    if (lockedProject.activeTranscriptId) {
      activeTranscript =
        (
          await tx
            .select()
            .from(transcripts)
            .where(eq(transcripts.id, lockedProject.activeTranscriptId))
            .limit(1)
        )[0] ?? null
    } else if (lockedProject.status === 'transcribing') {
      activeTranscript =
        (
          await tx
            .select()
            .from(transcripts)
            .where(
              and(
                eq(transcripts.projectId, lockedProject.id),
                eq(transcripts.totalDuration, 0),
              ),
            )
            .orderBy(desc(transcripts.createdAt))
            .limit(1)
        )[0] ?? null
    }

    const disposition = activeTranscriptionReservationDisposition({
      projectStatus: lockedProject.status,
      activeTranscriptId: lockedProject.activeTranscriptId ?? null,
      transcript: activeTranscript,
    })

    if (disposition === 'reuse' && activeTranscript?.assemblyAiTranscriptId) {
      return {
        kind: 'existing',
        transcriptId: activeTranscript.id,
        assemblyAiId: activeTranscript.assemblyAiTranscriptId,
      }
    }

    if (disposition === 'wait') {
      throw new ProjectTranscriptionStartError(
        'A transcription start is already in progress. Try again in a moment.',
        409,
      )
    }

    if (disposition === 'cleanup') {
      if (lockedProject.activeTranscriptId) {
        await tx
          .update(projects)
          .set({ activeTranscriptId: null })
          .where(eq(projects.id, lockedProject.id))
      }
      if (activeTranscript) {
        await tx.delete(transcripts).where(eq(transcripts.id, activeTranscript.id))
      }
    }

    const [placeholder] = await tx
      .insert(transcripts)
      .values({
        projectId: lockedProject.id,
        language: 'en',
        totalDuration: 0,
        label: input.label,
      })
      .returning()

    await tx
      .update(projects)
      .set({ activeTranscriptId: placeholder.id })
      .where(eq(projects.id, lockedProject.id))

    return {
      kind: 'reserved',
      project: lockedProject,
      transcriptId: placeholder.id,
    }
  })
}

async function clearReservedTranscriptionStart(projectId: string, transcriptId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from projects where id = ${projectId} for update`)
    await tx
      .update(projects)
      .set({ activeTranscriptId: null })
      .where(and(eq(projects.id, projectId), eq(projects.activeTranscriptId, transcriptId)))
    await tx.delete(transcripts).where(eq(transcripts.id, transcriptId))
  })
}

async function persistSubmittedTranscriptId(transcriptId: string, assemblyAiTranscriptId: string): Promise<void> {
  const [updated] = await db
    .update(transcripts)
    .set({ assemblyAiTranscriptId })
    .where(and(eq(transcripts.id, transcriptId), isNull(transcripts.assemblyAiTranscriptId)))
    .returning({ id: transcripts.id })

  if (!updated) {
    throw new ProjectTranscriptionStartError(
      'Could not persist the AssemblyAI job locally after it was accepted.',
      500,
    )
  }
}

async function activateProjectTranscription(input: {
  projectId: string
  transcriptId: string
  transcriptionProgress: number
  clearPendingAutoTranscription?: boolean
}): Promise<void> {
  const updated = await db
    .update(projects)
    .set({
      status: 'transcribing',
      transcriptionProgress: input.transcriptionProgress,
      processingError: null,
      ...(input.clearPendingAutoTranscription
        ? { pendingAutoTranscriptionOptions: null }
        : {}),
    })
    .where(and(eq(projects.id, input.projectId), eq(projects.activeTranscriptId, input.transcriptId)))
    .returning({ id: projects.id })

  if (updated.length === 0) {
    throw new Error(
      'activateProjectTranscription: no row updated (projectId / activeTranscriptId mismatch)',
    )
  }
}

const ACTIVATE_TRANSCRIPTION_RETRY_DELAYS_MS = [0, 50, 150] as const

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function activateProjectTranscriptionWithRetries(input: {
  projectId: string
  transcriptId: string
  transcriptionProgress: number
  clearPendingAutoTranscription?: boolean
}): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < ACTIVATE_TRANSCRIPTION_RETRY_DELAYS_MS.length; i++) {
    const waitMs = ACTIVATE_TRANSCRIPTION_RETRY_DELAYS_MS[i]
    if (waitMs > 0) await delay(waitMs)
    try {
      await activateProjectTranscription(input)
      return
    } catch (error) {
      lastError = error
      console.warn(`[transcribe] activateProjectTranscription attempt ${i + 1} failed:`, error)
    }
  }
  throw lastError
}

export async function submitProjectTranscription(input: {
  projectId: string
  options?: Partial<TranscriptionRequestOptions>
  project?: ProjectRow | null
  clearPendingAutoTranscription?: boolean
}): Promise<SubmitProjectTranscriptionResult> {
  let stream: NodeJS.ReadableStream | null = null

  try {
    const normalizedOptions = normalizeTranscriptionOptions(input.options)
    const validationError = validateTranscriptionOptions(normalizedOptions)
    if (validationError) {
      throw new ProjectTranscriptionStartError(validationError)
    }
    if (!apiKey) {
      throw new ProjectTranscriptionStartError('Missing AssemblyAI API key', 500)
    }

    const label =
      normalizedOptions.transcriptLabel && normalizedOptions.transcriptLabel !== ''
        ? normalizedOptions.transcriptLabel
        : null
    const reserved = await reserveProjectTranscriptionStart({
      projectId: input.projectId,
      project: input.project,
      label,
    })

    if (reserved.kind === 'existing') {
      return {
        assemblyAiId: reserved.assemblyAiId,
        transcriptId: reserved.transcriptId,
        status: 'queued',
        normalizedOptions,
      }
    }

    const project = reserved.project
    const editKey = resolveEditKey(project)
    const urlMode = transcriptionObjectUrlMode()
    const presignExpires = Number(process.env.MINIO_TRANSCRIPTION_PRESIGN_EXPIRES_SEC) || 172800

    let resolvedAudioUrl: string | null = null
    if (urlMode === 'presigned') {
      try {
        const signed = await presignGetObject(editKey, presignExpires)
        if (!objectUrlUnreachableFromAssemblyAi(signed)) {
          resolvedAudioUrl = signed
        }
      } catch (error) {
        console.error('presignGetObject for transcription failed:', error)
      }
    }
    if (resolvedAudioUrl == null) {
      const pub = publicObjectUrl(editKey)
      if (pub && !objectUrlUnreachableFromAssemblyAi(pub)) {
        resolvedAudioUrl = pub
      }
    }

    const speechModelsArray =
      normalizedOptions.speechModel === 'fast' ? ['universal-2'] : ['universal-3-pro', 'universal-2']
    const isUniversal2Only = speechModelsArray.length === 1 && speechModelsArray[0] === 'universal-2'

    const params: Record<string, unknown> = {
      speech_models: speechModelsArray,
      language_detection: normalizedOptions.languageDetection,
      speaker_labels: normalizedOptions.speakerLabels,
    }

    if (!isUniversal2Only) {
      params.temperature = normalizedOptions.temperature
    }

    if (resolvedAudioUrl) {
      params.audio_url = resolvedAudioUrl
    } else {
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[transcribe] Falling back to streaming audio from object storage to AssemblyAI. ' +
            'Set MINIO_PUBLIC_ENDPOINT / MINIO_PUBLIC_BASE_URL to a public HTTPS host, or use MINIO_TRANSCRIPTION_URL_MODE=presigned.',
        )
      }
      stream = await getObjectBodyStream(editKey)
      params.audio = stream
    }

    const webhookUrl = process.env.ASSEMBLYAI_WEBHOOK_URL?.trim()
    if (webhookUrl) {
      params.webhook_url = webhookUrl
      const whSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET?.trim()
      if (whSecret) {
        params.webhook_auth_header_name =
          process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME?.trim() || 'X-AssemblyAI-Webhook-Secret'
        params.webhook_auth_header_value = whSecret
      }
    }

    const keytermsArray = normalizedOptions.keyterms
      ? normalizedOptions.keyterms.split(',').map((t) => t.trim()).filter((t) => t !== '')
      : []

    // Universal-3 Pro: `prompt` and `keyterms_prompt` are mutually exclusive on the API.
    // When both are provided in the UI, we follow AssemblyAI’s suggested workaround: a single
    // `prompt` with a trailing `Context: …` line (see async Prompting guide).
    if (normalizedOptions.prompt && normalizedOptions.prompt !== '') {
      let finalPrompt = normalizedOptions.prompt
      if (keytermsArray.length > 0) {
        finalPrompt += `\n\nContext: ${keytermsArray.join(', ')}`
      }
      params.prompt = finalPrompt
    } else if (keytermsArray.length > 0) {
      params.keyterms_prompt = keytermsArray
    }

    if (params.speaker_labels) {
      if (normalizedOptions.speakersExpected) {
        params.speakers_expected = normalizedOptions.speakersExpected
      } else {
        const min = normalizedOptions.minSpeakers
        const max = normalizedOptions.maxSpeakers
        if (
          typeof min === 'number' &&
          Number.isFinite(min) &&
          typeof max === 'number' &&
          Number.isFinite(max)
        ) {
          params.speaker_options = {
            min_speakers_expected: min,
            max_speakers_expected: max,
          }
        }
      }

      const knownSpeakersArray = normalizedOptions.knownSpeakers
        ? normalizedOptions.knownSpeakers.split(',').map((n) => n.trim()).filter((n) => n !== '')
        : []

      if (knownSpeakersArray.length > 0) {
        params.speech_understanding = {
          request: {
            speaker_identification: {
              speaker_type: 'name',
              known_values: knownSpeakersArray,
            },
          },
        }
      }
    }

    if (normalizedOptions.redactPii) {
      params.redact_pii = true
      params.redact_pii_audio = false
      params.redact_pii_sub = 'hash'
      params.redact_pii_policies = [
        'person_name',
        'phone_number',
        'email_address',
        'us_social_security_number',
        'drivers_license',
        'credit_card_number',
        'location',
        'medical_condition',
        'date_of_birth',
      ]
    }

    let submitted: Awaited<ReturnType<typeof client.transcripts.submit>>
    try {
      submitted = await client.transcripts.submit(params as never)
    } catch (error) {
      await clearReservedTranscriptionStart(project.id, reserved.transcriptId).catch(() => undefined)
      throw error
    }

    try {
      await persistSubmittedTranscriptId(reserved.transcriptId, submitted.id)
    } catch (error) {
      await client.transcripts.delete(submitted.id).catch((deleteError) => {
        console.error('Failed to delete AssemblyAI transcript after local persist failure:', deleteError)
      })
      await clearReservedTranscriptionStart(project.id, reserved.transcriptId).catch(() => undefined)
      throw error
    }

    await activateProjectTranscriptionWithRetries({
      projectId: project.id,
      transcriptId: reserved.transcriptId,
      transcriptionProgress: transcriptionProgressFromAssemblyStatus(submitted.status),
      clearPendingAutoTranscription: input.clearPendingAutoTranscription,
    })

    return {
      assemblyAiId: submitted.id,
      transcriptId: reserved.transcriptId,
      status: submitted.status,
      normalizedOptions,
    }
  } catch (error) {
    if (error instanceof ProjectTranscriptionStartError) {
      throw error
    }
    console.error('Error submitting to AssemblyAI:', error)
    throw new ProjectTranscriptionStartError('Internal Server Error', 500)
  } finally {
    const destroyableStream = stream as { destroy?: () => void } | null
    if (destroyableStream && typeof destroyableStream.destroy === 'function') {
      destroyableStream.destroy()
    }
  }
}
