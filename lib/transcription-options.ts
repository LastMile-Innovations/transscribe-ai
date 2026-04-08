export type SpeechModelOption = 'best' | 'fast'

export type TranscriptionRequestOptions = {
  speechModel: SpeechModelOption
  speakerLabels: boolean
  languageDetection: boolean
  temperature: number
  keyterms?: string
  prompt?: string
  speakersExpected?: number
  minSpeakers?: number
  maxSpeakers?: number
  knownSpeakers?: string
  redactPii?: boolean
  transcriptLabel?: string
}

export const DEFAULT_TRANSCRIPTION_PROMPT =
  'Mandatory: Transcribe legal proceedings and evidentiary files with precise terminology intact. Preserve all profanity exactly as spoken. Required: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms. Strict requirement: Always transcribe speech exactly as heard. If uncertain or audio is unclear, mark as [unclear] instead of guessing. Non-negotiable: Distinguish between speakers through clear role-based attribution. Label participants by role when identifiable (judge, counsel, witness). Mark overlapping speech as [CROSSTALK].'

export const DEFAULT_TRANSCRIPTION_OPTIONS: TranscriptionRequestOptions = {
  speechModel: 'best',
  speakerLabels: true,
  languageDetection: true,
  temperature: 0.1,
  prompt: DEFAULT_TRANSCRIPTION_PROMPT,
  keyterms: '',
  knownSpeakers: '',
  redactPii: false,
}

function normalizeWholeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }

  return undefined
}

export function normalizeTranscriptionOptions(
  raw: Partial<TranscriptionRequestOptions> | undefined,
): TranscriptionRequestOptions {
  const speakerLabels = raw?.speakerLabels ?? DEFAULT_TRANSCRIPTION_OPTIONS.speakerLabels
  const speakersExpected = speakerLabels ? normalizeWholeNumber(raw?.speakersExpected) : undefined
  const minSpeakers =
    speakerLabels && speakersExpected === undefined ? normalizeWholeNumber(raw?.minSpeakers) : undefined
  const maxSpeakers =
    speakerLabels && speakersExpected === undefined ? normalizeWholeNumber(raw?.maxSpeakers) : undefined

  return {
    speechModel: raw?.speechModel === 'fast' ? 'fast' : DEFAULT_TRANSCRIPTION_OPTIONS.speechModel,
    speakerLabels,
    languageDetection: raw?.languageDetection ?? DEFAULT_TRANSCRIPTION_OPTIONS.languageDetection,
    temperature:
      typeof raw?.temperature === 'number' && Number.isFinite(raw.temperature)
        ? Math.max(0, Math.min(1, raw.temperature))
        : DEFAULT_TRANSCRIPTION_OPTIONS.temperature,
    keyterms: raw?.keyterms?.trim() ?? '',
    prompt: raw?.prompt?.trim() ?? '',
    speakersExpected,
    minSpeakers,
    maxSpeakers,
    knownSpeakers: speakerLabels ? raw?.knownSpeakers?.trim() ?? '' : '',
    redactPii: raw?.redactPii ?? DEFAULT_TRANSCRIPTION_OPTIONS.redactPii,
    transcriptLabel: raw?.transcriptLabel?.trim() ?? '',
  }
}

export function validateTranscriptionOptions(options: TranscriptionRequestOptions): string | null {
  if (!options.speakerLabels) return null
  if (
    options.minSpeakers !== undefined &&
    options.maxSpeakers !== undefined &&
    options.minSpeakers > options.maxSpeakers
  ) {
    return 'Minimum speakers cannot be greater than maximum speakers.'
  }
  return null
}
