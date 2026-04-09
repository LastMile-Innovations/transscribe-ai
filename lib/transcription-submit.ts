import { AssemblyAI } from 'assemblyai'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { findProjectById } from '@/lib/db/queries'
import { projects, transcripts, type ProjectRow } from '@/lib/db/schema'
import { transcriptionProgressFromAssemblyStatus } from '@/lib/assemblyai-transcript-sync'
import { buildEditObjectKey } from '@/lib/media-keys'
import { projectHasPreparedEdit } from '@/lib/project-prepare'
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

    const project = input.project ?? (await findProjectById(input.projectId))
    if (!project) {
      throw new ProjectTranscriptionStartError('Project not found', 404)
    }

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

    const submitted = await client.transcripts.submit(params as never)
    const label =
      normalizedOptions.transcriptLabel && normalizedOptions.transcriptLabel !== ''
        ? normalizedOptions.transcriptLabel
        : null

    const [pendingRow] = await db
      .insert(transcripts)
      .values({
        projectId: project.id,
        language: 'en',
        totalDuration: 0,
        assemblyAiTranscriptId: submitted.id,
        label,
      })
      .returning()

    await db
      .update(projects)
      .set({
        status: 'transcribing',
        transcriptionProgress: transcriptionProgressFromAssemblyStatus(submitted.status),
        processingError: null,
        ...(input.clearPendingAutoTranscription
          ? { pendingAutoTranscriptionOptions: null }
          : {}),
      })
      .where(eq(projects.id, project.id))

    return {
      assemblyAiId: submitted.id,
      transcriptId: pendingRow.id,
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
