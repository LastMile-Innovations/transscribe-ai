import type { TranscriptSegment, TranscriptWord } from './types'

type SegmentLike = Pick<TranscriptSegment, 'id' | 'start' | 'end' | 'text' | 'speaker' | 'confidence' | 'words'>

export type SpeakerSummary = {
  name: string
  count: number
}

export type SplitSegmentResult = {
  left: TranscriptSegment
  right: TranscriptSegment
}

const SPEAKER_COLOR_CLASSES = [
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
  'bg-lime-500/20 text-lime-400 border-lime-500/30',
]

function normalizeWordArray(words: TranscriptWord[] | undefined): TranscriptWord[] | undefined {
  return words && words.length > 0 ? words : undefined
}

function buildFallbackSplitPoint(segment: SegmentLike, leftTextLength: number): number {
  const duration = Math.max(1, segment.end - segment.start)
  const ratio = Math.min(0.85, Math.max(0.15, leftTextLength / Math.max(segment.text.length, 1)))
  const splitAt = segment.start + Math.round(duration * ratio)
  return Math.max(segment.start + 1, Math.min(segment.end - 1, splitAt))
}

function sanitizeBoundary(text: string, rawIndex: number): number {
  const trimmed = text.trim()
  if (!trimmed) return -1

  const min = 1
  const max = text.length - 1
  if (rawIndex <= min || rawIndex >= max) return -1

  if (/\s/.test(text[rawIndex])) {
    let i = rawIndex
    while (i < max && /\s/.test(text[i])) i += 1
    return i >= max ? -1 : i
  }

  const previousWhitespace = text.lastIndexOf(' ', rawIndex)
  const nextWhitespace = text.indexOf(' ', rawIndex)

  const previousBoundary =
    previousWhitespace > min && previousWhitespace < max
      ? (() => {
          let i = previousWhitespace
          while (i < max && /\s/.test(text[i])) i += 1
          return i >= max ? -1 : i
        })()
      : -1

  const nextBoundary =
    nextWhitespace > min && nextWhitespace < max
      ? (() => {
          let i = nextWhitespace
          while (i < max && /\s/.test(text[i])) i += 1
          return i >= max ? -1 : i
        })()
      : -1

  if (previousBoundary === -1) return nextBoundary
  if (nextBoundary === -1) return previousBoundary

  const previousDistance = Math.abs(rawIndex - previousBoundary)
  const nextDistance = Math.abs(nextBoundary - rawIndex)
  return previousDistance <= nextDistance ? previousBoundary : nextBoundary

  return -1
}

export function getSpeakerColorClass(speaker: string): string {
  const normalized = speaker.trim()
  if (!normalized) return 'bg-muted text-muted-foreground border-border'

  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0
  }
  return SPEAKER_COLOR_CLASSES[hash % SPEAKER_COLOR_CLASSES.length]
}

export function summarizeSpeakers(segments: TranscriptSegment[]): SpeakerSummary[] {
  const counts = new Map<string, number>()
  segments.forEach((segment) => {
    const key = segment.speaker.trim() || 'Unknown speaker'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function renameSpeakerInSegments(
  segments: TranscriptSegment[],
  previousSpeaker: string,
  nextSpeaker: string,
): TranscriptSegment[] {
  return segments.map((segment) =>
    segment.speaker === previousSpeaker ? { ...segment, speaker: nextSpeaker } : segment,
  )
}

export function getAdjacentSegmentIds(segments: TranscriptSegment[], segmentId: string): {
  previousSegmentId: string | null
  nextSegmentId: string | null
} {
  const index = segments.findIndex((segment) => segment.id === segmentId)
  if (index === -1) {
    return { previousSegmentId: null, nextSegmentId: null }
  }

  return {
    previousSegmentId: index > 0 ? segments[index - 1].id : null,
    nextSegmentId: index < segments.length - 1 ? segments[index + 1].id : null,
  }
}

export function mergeTranscriptSegments(first: SegmentLike, second: SegmentLike): TranscriptSegment {
  const mergedWords = normalizeWordArray([...(first.words ?? []), ...(second.words ?? [])])

  return {
    ...first,
    end: Math.max(first.end, second.end),
    text: `${first.text.trimEnd()} ${second.text.trimStart()}`.trim(),
    confidence: (first.confidence + second.confidence) / 2,
    words: mergedWords,
  }
}

export function splitTranscriptSegment(
  segment: SegmentLike,
  rawIndex: number,
  ids: { leftId: string; rightId: string },
): SplitSegmentResult | null {
  const splitIndex = sanitizeBoundary(segment.text, rawIndex)
  if (splitIndex === -1) return null

  const leftText = segment.text.slice(0, splitIndex).trim()
  const rightText = segment.text.slice(splitIndex).trim()
  if (!leftText || !rightText) return null

  const leftWordCount = leftText.split(/\s+/).filter(Boolean).length
  const words = normalizeWordArray(segment.words)
  const leftWords = words?.slice(0, leftWordCount)
  const rightWords = words?.slice(leftWordCount)

  let splitAt = buildFallbackSplitPoint(segment, leftText.length)
  if (leftWords && rightWords && leftWords.length > 0 && rightWords.length > 0) {
    splitAt = Math.max(leftWords[leftWords.length - 1].end, segment.start + 1)
    splitAt = Math.min(splitAt, rightWords[0].start - 1)
    if (splitAt <= segment.start || splitAt >= segment.end) {
      splitAt = buildFallbackSplitPoint(segment, leftText.length)
    }
  }

  const left: TranscriptSegment = {
    ...segment,
    id: ids.leftId,
    end: splitAt,
    text: leftText,
    words: normalizeWordArray(leftWords),
  }

  const right: TranscriptSegment = {
    ...segment,
    id: ids.rightId,
    start: splitAt,
    text: rightText,
    words: normalizeWordArray(rightWords),
  }

  return { left, right }
}
