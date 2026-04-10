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

/** Empty = omit `prompt` on the API so Universal-3 Pro uses AssemblyAI’s built-in default. */
export const DEFAULT_TRANSCRIPTION_PROMPT = ''

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

/** Preset roster for Speaker Identification (known_values); append via UI dropdown. */
export const PRESET_KNOWN_SPEAKER_NAMES = [
  'Greyson Paynter',
  'Debra Paynter',
  'Jessica Clark',
  'Collin Clark',
  'Alana Martinez',
  'Scott Lepman',
  'Tonia',
] as const

export function parseKnownSpeakersCsv(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Append a name to comma-separated known speakers; skips case-insensitive duplicates. */
export function appendUniqueKnownSpeakerCsv(current: string, name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return current
  const parts = parseKnownSpeakersCsv(current)
  const lower = trimmed.toLowerCase()
  if (parts.some((p) => p.toLowerCase() === lower)) return current
  return [...parts, trimmed].join(', ')
}

export function removeFromKnownSpeakersCsv(current: string, nameToRemove: string): string {
  const target = nameToRemove.trim().toLowerCase()
  if (!target) return current
  return parseKnownSpeakersCsv(current)
    .filter((p) => p.toLowerCase() !== target)
    .join(', ')
}

export function togglePresetInKnownSpeakersCsv(
  current: string,
  presetName: string,
  checked: boolean,
): string {
  if (checked) return appendUniqueKnownSpeakerCsv(current, presetName)
  return removeFromKnownSpeakersCsv(current, presetName)
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
