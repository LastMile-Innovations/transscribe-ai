/** Inverse of `formatTranscriptTimecode` in transcript-export.ts */
export function parseTimecodeToMs(timecode: string): number | null {
  const trimmed = timecode.trim()
  const m = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  const seconds = Number(m[3])
  const frac = m[4] ?? '0'
  const msPad = frac.padEnd(3, '0').slice(0, 3)
  const ms = Number(msPad)
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(ms) ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null
  }
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms
}
