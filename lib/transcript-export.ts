import type { Transcript, TranscriptSegment, TranscriptWord } from './types'

export type TranscriptExportWord = {
  index: number
  text: string
  confidence: number
  startMs: number
  endMs: number
  startTimecode: string
  endTimecode: string
}

export type TranscriptExportSentence = {
  id: string
  index: number
  speaker: string
  text: string
  confidence: number
  startMs: number
  endMs: number
  startTimecode: string
  endTimecode: string
  words: TranscriptExportWord[]
}

export type TranscriptExportDocument = {
  projectId: string
  projectTitle: string
  transcriptId: string
  language: string
  totalDurationMs: number
  sentenceUnit: 'segment'
  sentences: TranscriptExportSentence[]
}

export function formatTranscriptTimecode(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const hours = Math.floor(safeMs / 3_600_000)
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1_000)
  const milliseconds = safeMs % 1_000

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

function serializeWord(word: TranscriptWord, index: number): TranscriptExportWord {
  return {
    index,
    text: word.text,
    confidence: word.confidence,
    startMs: word.start,
    endMs: word.end,
    startTimecode: formatTranscriptTimecode(word.start),
    endTimecode: formatTranscriptTimecode(word.end),
  }
}

function serializeSentence(segment: TranscriptSegment, index: number): TranscriptExportSentence {
  const words = (segment.words ?? []).map(serializeWord)

  return {
    id: segment.id,
    index,
    speaker: segment.speaker,
    text: segment.text,
    confidence: segment.confidence,
    startMs: segment.start,
    endMs: segment.end,
    startTimecode: formatTranscriptTimecode(segment.start),
    endTimecode: formatTranscriptTimecode(segment.end),
    words,
  }
}

export function serializeTranscriptExport(input: {
  projectId: string
  projectTitle: string
  transcript: Transcript
}): TranscriptExportDocument {
  const sentences = [...input.transcript.segments]
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
    .map(serializeSentence)

  return {
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    transcriptId: input.transcript.id,
    language: input.transcript.language,
    totalDurationMs: input.transcript.totalDuration,
    sentenceUnit: 'segment',
    sentences,
  }
}

/** ASCII-only fallback for RFC 2183 filename= */
function asciiFilenameBase(title: string): string {
  const stripped = title
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '')
  return stripped || 'transcript'
}

export function buildTranscriptExportFileName(title: string): {
  unicodeName: string
  asciiFallback: string
} {
  const base = title.trim() || 'transcript'
  const asciiBase = asciiFilenameBase(base)

  return {
    unicodeName: `${base}-timestamps.json`,
    asciiFallback: `${asciiBase}-timestamps.json`,
  }
}
