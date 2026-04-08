import { NextResponse } from 'next/server'
import { AssemblyAI } from 'assemblyai'
import { db } from '@/lib/db'
import { transcripts } from '@/lib/db/schema'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'
import { buildEditObjectKey } from '@/lib/media-keys'
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
} from '@/lib/transcription-options'

export const maxDuration = 300

const apiKey = process.env.ASSEMBLYAI_API_KEY || ''
const baseUrl = process.env.ASSEMBLYAI_BASE_URL || undefined
const client = new AssemblyAI({ apiKey, baseUrl })

export async function POST(request: Request) {
  let stream: NodeJS.ReadableStream | null = null
  try {
    const { projectId, options } = await request.json()
    const normalizedOptions = normalizeTranscriptionOptions(options)
    const validationError = validateTranscriptionOptions(normalizedOptions)

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const access = await requireProjectAccessForRoute(projectId, 'editor')
    if (access instanceof NextResponse) return access

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing AssemblyAI API key' }, { status: 500 })
    }

    const editKey = buildEditObjectKey(access.workspaceProjectId, projectId)

    const urlMode = transcriptionObjectUrlMode()
    const presignExpires = Number(process.env.MINIO_TRANSCRIPTION_PRESIGN_EXPIRES_SEC) || 172800

    let resolvedAudioUrl: string | null = null
    if (urlMode === 'presigned') {
      try {
        const signed = await presignGetObject(editKey, presignExpires)
        if (!objectUrlUnreachableFromAssemblyAi(signed)) {
          resolvedAudioUrl = signed
        }
      } catch (e) {
        console.error('presignGetObject for transcription failed:', e)
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

    const keytermsInput = normalizedOptions.keyterms
    const keytermsArray = keytermsInput
      ? keytermsInput.split(',').map((t) => t.trim()).filter((t) => t !== '')
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

    // AssemblyAI client expects a specific params shape; options above are built dynamically.
    const submitted = await client.transcripts.submit(params as never)

    const label =
      normalizedOptions.transcriptLabel && normalizedOptions.transcriptLabel !== ''
        ? normalizedOptions.transcriptLabel
        : null

    const [pendingRow] = await db
      .insert(transcripts)
      .values({
        projectId,
        language: 'en',
        totalDuration: 0,
        assemblyAiTranscriptId: submitted.id,
        label,
      })
      .returning()

    return NextResponse.json({
      assemblyAiId: submitted.id,
      transcriptId: pendingRow.id,
      status: submitted.status,
    })
  } catch (error) {
    console.error('Error submitting to AssemblyAI:', error)
    if (stream && typeof (stream as any).destroy === 'function') {
      ;(stream as any).destroy()
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
