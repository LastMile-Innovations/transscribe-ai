import type { TranscriptSegment } from './types'
import { formatTranscriptTimecode } from './transcript-export'

export type NumberedTranscriptLine = {
  lineNumber: number
  segmentId: string
  startMs: number
  endMs: number
  speaker: string
  /** Full line including timecode and speaker prefix */
  text: string
}

/** Greedy word wrap; overlong tokens are hard-split. */
export function wrapTranscriptLine(text: string, maxContentChars: number): string[] {
  const normalized = text.trim() || ' '
  if (maxContentChars < 8) return [normalized]
  const words = normalized.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (!w) continue
    const next = current ? `${current} ${w}` : w
    if (next.length <= maxContentChars) {
      current = next
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
    }
    if (w.length <= maxContentChars) {
      current = w
    } else {
      for (let i = 0; i < w.length; i += maxContentChars) {
        lines.push(w.slice(i, i + maxContentChars))
      }
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

export function buildNumberedTranscriptLines(
  segments: TranscriptSegment[],
  opts?: { contentWidth?: number },
): NumberedTranscriptLine[] {
  const contentWidth = opts?.contentWidth ?? 72
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
  const out: NumberedTranscriptLine[] = []
  let lineNumber = 1
  const numW = 5

  for (const seg of sorted) {
    const tc = formatTranscriptTimecode(seg.start)
    const speakerPrefix = `[${tc}] ${seg.speaker}: `
    const innerWidth = Math.max(24, contentWidth - numW - 2 - speakerPrefix.length)
    const chunks = wrapTranscriptLine(seg.text, innerWidth)
    for (const chunk of chunks) {
      out.push({
        lineNumber: lineNumber++,
        segmentId: seg.id,
        startMs: seg.start,
        endMs: seg.end,
        speaker: seg.speaker,
        text: `${speakerPrefix}${chunk}`,
      })
    }
  }
  return out
}

export function numberedTranscriptToPlainText(
  lines: NumberedTranscriptLine[],
  header: { title: string; transcriptId: string; exportedIso: string },
): string {
  const banner = [
    `Title: ${header.title}`,
    `Transcript ID: ${header.transcriptId}`,
    `Exported: ${header.exportedIso}`,
    '',
    'Line numbers are for reference only; verify against source media before filing.',
    '',
    '---',
    '',
  ]
  const body = lines.map((l) => `${String(l.lineNumber).padStart(5, ' ')}  ${l.text}`)
  return [...banner, ...body].join('\n')
}

function escapeTsvField(s: string): string {
  const t = s.replace(/\r?\n/g, ' ').replace(/\t/g, ' ')
  if (/["\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`
  return t
}

export function buildClipListTsv(segments: TranscriptSegment[]): string {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
  const header = [
    'segment_index',
    'segment_id',
    'time_in',
    'time_out',
    'start_ms',
    'end_ms',
    'speaker',
    'char_count',
    'excerpt',
  ]
  const rows = sorted.map((s, i) => {
    const excerpt = s.text.replace(/\s+/g, ' ').trim().slice(0, 240)
    return [
      String(i + 1),
      s.id,
      formatTranscriptTimecode(s.start),
      formatTranscriptTimecode(s.end),
      String(s.start),
      String(s.end),
      escapeTsvField(s.speaker),
      String(s.text.length),
      escapeTsvField(excerpt),
    ].join('\t')
  })
  return [header.join('\t'), ...rows].join('\n')
}
