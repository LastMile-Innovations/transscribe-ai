import {
  DEFAULT_TRANSCRIPTION_OPTIONS,
  normalizeTranscriptionOptions,
  type TranscriptionRequestOptions,
} from '@/lib/transcription-options'

export type BuiltinTranscriptionTemplate = {
  id: string
  title: string
  description: string
  /** Merged over defaults then normalized; omit fields to keep recommended toggles. */
  options: Partial<TranscriptionRequestOptions>
}

/** Former app default — now a named template (court / legal). */
export const LEGAL_TRANSCRIPTION_PROMPT =
  'Mandatory: Transcribe legal proceedings and evidentiary files with precise terminology intact. Preserve all profanity exactly as spoken. Required: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms. Strict requirement: Always transcribe speech exactly as heard. If uncertain or audio is unclear, mark as [unclear] instead of guessing. Non-negotiable: Distinguish between speakers through clear role-based attribution. Label participants by role when identifiable (judge, counsel, witness). Mark overlapping speech as [CROSSTALK].'

export const TRANSCRIPTION_BUILTIN_TEMPLATES: BuiltinTranscriptionTemplate[] = [
  {
    id: 'builtin:recommended',
    title: 'Recommended (API default prompt)',
    description:
      'Best model, diarization, and language detection with no custom prompt — Universal-3 Pro uses AssemblyAI’s built-in default.',
    options: {
      prompt: '',
      keyterms: '',
    },
  },
  {
    id: 'builtin:verbatim-multilingual',
    title: 'Verbatim + multilingual',
    description: 'Preserve code-switching, disfluencies, and colloquial speech (AssemblyAI recommended pattern).',
    options: {
      prompt: `Required: Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.

Mandatory: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms in the spoken language.

Always: Transcribe speech with your best guess based on context in all possible scenarios where speech is present in the audio.`,
    },
  },
  {
    id: 'builtin:unclear-quality',
    title: 'Flag uncertain audio ([unclear])',
    description: 'Reduces forced guesses on poor audio; review flagged spans in post.',
    options: {
      prompt: `Always: Transcribe speech exactly as heard. If uncertain or audio is unclear, mark as [unclear]. After the first output, review the transcript again. Pay close attention to hallucinations, misspellings, or errors, and revise them like a computer performing spell and grammar checks. Ensure words and phrases make grammatical sense in sentences.`,
    },
  },
  {
    id: 'builtin:legal',
    title: 'Legal / courtroom',
    description: 'Proceedings, depositions, role-based attribution, crosstalk tags.',
    options: {
      prompt: LEGAL_TRANSCRIPTION_PROMPT,
    },
  },
  {
    id: 'builtin:medical',
    title: 'Medical / clinical',
    description: 'Clinical terminology, medications, disfluencies, speaker roles when clear.',
    options: {
      prompt: `Mandatory: Preserve all clinical terminology exactly as spoken including drug names, dosages, and diagnostic terms.

Required: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms in the spoken language.

Label physician and patient speech clearly when identifiable.`,
    },
  },
  {
    id: 'builtin:financial',
    title: 'Earnings / financial',
    description: 'Financial vocabulary, numbers, executive vs analyst roles.',
    options: {
      prompt: `Mandatory: Transcribe this corporate earnings or financial discussion with precise financial terminology.

Required: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms in the spoken language.

Non-negotiable: Financial term accuracy across all financial terminology, acronyms, and industry-standard phrases.

Format numerical data with standard notation. Label executives and speakers by role when identifiable (CEO, CFO, Analyst).`,
    },
  },
  {
    id: 'builtin:technical',
    title: 'Technical / engineering',
    description: 'Software, frameworks, acronyms; preserve natural meeting speech.',
    options: {
      prompt: `Mandatory: Transcribe this technical meeting with multiple participants.

Required: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms in the spoken language.

Non-negotiable: Technical terminology accuracy across all software names, frameworks, and industry acronyms.

Mark transitions between participants explicitly. Capture self-corrections and restarts from speech.`,
    },
  },
  {
    id: 'builtin:support',
    title: 'Customer support',
    description: 'Names, account details, balances, crosstalk awareness.',
    options: {
      prompt: `Context: a customer support call. Prioritize accurately transcribing names, account details, and balance amounts.

Mandatory: Transcribe any overlapping speech across channels including crosstalk.

Required: Pay attention to proper nouns like names, balance amounts, and bank name being correct.

Non-negotiable: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms in the spoken language.`,
    },
  },
  {
    id: 'builtin:bilingual',
    title: 'Bilingual (e.g. English / Spanish)',
    description: 'Keep code-switching; resolve sound-alikes using bilingual context.',
    options: {
      prompt: `Mandatory: Transcribe verbatim, preserving natural code-switching between English and Spanish.

Required: Retain spoken language as-is without translation. Preserve words in the language they are spoken.

Non-negotiable: Preserve linguistic speech patterns including disfluencies, filler words, hesitations, repetitions, stutters, false starts, and colloquialisms in the spoken language.

Resolve sound-alike errors using bilingual context for maximum accuracy.`,
    },
  },
]

export function getBuiltinTemplateById(id: string): BuiltinTranscriptionTemplate | undefined {
  return TRANSCRIPTION_BUILTIN_TEMPLATES.find((t) => t.id === id)
}

export function optionsFromBuiltinTemplate(template: BuiltinTranscriptionTemplate): TranscriptionRequestOptions {
  return normalizeTranscriptionOptions({ ...DEFAULT_TRANSCRIPTION_OPTIONS, ...template.options })
}

export type TranscriptionFormState = {
  speechModel: string
  speakerLabels: boolean
  languageDetection: boolean
  temperature: number[]
  keyterms: string
  customPrompt: string
  speakersExpected: string
  minSpeakers: string
  maxSpeakers: string
  knownSpeakers: string
  redactPii: boolean
}

/** Apply normalized API options to the library transcription panel state shape. */
export function transcriptionOptionsToFormState(o: TranscriptionRequestOptions): TranscriptionFormState {
  return {
    speechModel: o.speechModel,
    speakerLabels: o.speakerLabels,
    languageDetection: o.languageDetection,
    temperature: [o.temperature],
    keyterms: o.keyterms ?? '',
    customPrompt: o.prompt ?? '',
    speakersExpected: o.speakersExpected != null ? String(o.speakersExpected) : '',
    minSpeakers: o.minSpeakers != null ? String(o.minSpeakers) : '',
    maxSpeakers: o.maxSpeakers != null ? String(o.maxSpeakers) : '',
    knownSpeakers: o.knownSpeakers ?? '',
    redactPii: o.redactPii ?? false,
  }
}

export type TranscriptionPresetRowMinimal = {
  id: string
  options: TranscriptionRequestOptions
}

/** Returns normalized options for a preset key, or `null` for `custom` (no change). */
export function resolveTranscriptionPresetSelection(
  key: string,
  personal: TranscriptionPresetRowMinimal[],
  workspace: TranscriptionPresetRowMinimal[],
): TranscriptionRequestOptions | null {
  if (key === 'custom') return null
  if (key.startsWith('builtin:')) {
    const t = getBuiltinTemplateById(key)
    return t ? optionsFromBuiltinTemplate(t) : null
  }
  if (key.startsWith('personal:')) {
    const id = key.slice('personal:'.length)
    const p = personal.find((x) => x.id === id)
    return p ? normalizeTranscriptionOptions(p.options) : null
  }
  if (key.startsWith('workspace:')) {
    const id = key.slice('workspace:'.length)
    const p = workspace.find((x) => x.id === id)
    return p ? normalizeTranscriptionOptions(p.options) : null
  }
  return null
}
