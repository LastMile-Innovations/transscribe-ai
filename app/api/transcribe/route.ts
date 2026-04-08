import { NextResponse } from 'next/server'
import { AssemblyAI } from 'assemblyai'
import { db } from '@/lib/db'
import { transcripts } from '@/lib/db/schema'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'
import { buildEditObjectKey } from '@/lib/media-keys'
import { getObjectBodyStream } from '@/lib/s3-storage'

export const maxDuration = 300

const apiKey = process.env.ASSEMBLYAI_API_KEY || ''
const client = new AssemblyAI({ apiKey })

export async function POST(request: Request) {
  let stream: NodeJS.ReadableStream | null = null
  try {
    const { projectId, options } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    const access = await requireProjectAccessForRoute(projectId, 'editor')
    if (access instanceof NextResponse) return access

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing AssemblyAI API key' }, { status: 500 })
    }

    const editKey = buildEditObjectKey(access.workspaceProjectId, projectId)
    stream = await getObjectBodyStream(editKey)

    const speechModelsArray =
      options?.speechModel === 'fast' ? ['universal-2'] : ['universal-3-pro', 'universal-2']

    const params: Record<string, unknown> = {
      audio: stream,
      speech_models: speechModelsArray,
      language_detection: options?.languageDetection ?? true,
      speaker_labels: options?.speakerLabels ?? true,
      temperature: options?.temperature ?? 0.1,
    }

    const keytermsInput = options?.keyterms as string | undefined
    const keytermsArray = keytermsInput
      ? keytermsInput.split(',').map((t) => t.trim()).filter((t) => t !== '')
      : []

    if (options?.prompt && options.prompt.trim() !== '') {
      let finalPrompt = options.prompt
      if (keytermsArray.length > 0) {
        finalPrompt += `\n\nContext: ${keytermsArray.join(', ')}`
      }
      params.prompt = finalPrompt
    } else if (keytermsArray.length > 0) {
      params.keyterms_prompt = keytermsArray
    }

    if (params.speaker_labels) {
      if (options?.speakersExpected) {
        params.speakers_expected = options.speakersExpected
      } else if (options?.minSpeakers || options?.maxSpeakers) {
        params.speaker_options = {
          min_speakers_expected: options.minSpeakers,
          max_speakers_expected: options.maxSpeakers,
        }
      }

      const knownSpeakersArray = options?.knownSpeakers
        ? (options.knownSpeakers as string).split(',').map((n) => n.trim()).filter((n) => n !== '')
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

    if (options?.redactPii) {
      params.redact_pii = true
      params.redact_pii_audio = false
      params.redact_pii_sub = 'mask'
      params.redact_pii_policies = [
        'person_name',
        'phone_number',
        'email_address',
        'us_social_security_number',
        'us_drivers_license_number',
        'credit_card_number',
        'mailing_address',
        'medical_condition',
        'date_of_birth',
      ]
    }

    // AssemblyAI client expects a specific params shape; options above are built dynamically.
    const submitted = await client.transcripts.submit(params as never)

    const label =
      typeof options?.transcriptLabel === 'string' && options.transcriptLabel.trim() !== ''
        ? options.transcriptLabel.trim()
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
