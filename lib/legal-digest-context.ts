import { formatTranscriptTimecode } from '@/lib/transcript-export'
import type { Transcript } from '@/lib/types'

const DEFAULT_MAX_CHARS = 120_000

export function buildTranscriptDigestContext(transcript: Transcript, maxChars = DEFAULT_MAX_CHARS): string {
  const lines = [...transcript.segments]
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))
    .map(
      (s) =>
        `${formatTranscriptTimecode(s.start)}–${formatTranscriptTimecode(s.end)} | ${s.speaker}: ${s.text}`,
    )
  let out = lines.join('\n')
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars)}\n\n[… transcript truncated for digest generation …]`
  }
  return out
}
