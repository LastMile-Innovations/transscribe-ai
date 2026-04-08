/**
 * Media metadata from ffprobe: stored in DB (full JSON) + derived fields for UI.
 * Safe to import from client or server (no Node-only APIs).
 */

export type MediaMetadataDerived = {
  sourceDurationMs: number | null
  editDurationMs: number | null
  width: number | null
  height: number | null
  displayAspectRatio: string | null
  frameRate: string | null
  sourceVideoCodec: string | null
  sourceAudioCodec: string | null
  sourceContainer: string | null
  sourceBitRate: number | null
  editVideoCodec: string | null
  editAudioCodec: string | null
  editContainer: string | null
  editBitRate: number | null
  chaptersCount: number
  /** Flattened tags from format + streams (string values only). */
  tags: Record<string, string>
}

export type StoredMediaMetadata = {
  extractedAt: string
  originalKey: string
  editKey: string
  /** Raw ffprobe JSON: format, streams, chapters. */
  original: unknown
  edit: unknown
  derived: MediaMetadataDerived
}

type LooseProbe = {
  format?: Record<string, unknown>
  streams?: Array<Record<string, unknown>>
  chapters?: unknown[]
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toInt(v: unknown): number | null {
  const n = toNum(v)
  if (n == null) return null
  const i = Math.round(n)
  return Number.isFinite(i) ? i : null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function durationMsFromProbe(probe: unknown): number | null {
  const p = probe as LooseProbe
  const sec = toNum(p.format?.duration)
  if (sec == null || sec < 0) return null
  return Math.round(sec * 1000)
}

function firstStream(probe: unknown, codecType: string): Record<string, unknown> | null {
  const p = probe as LooseProbe
  const s = p.streams?.find((x) => x.codec_type === codecType)
  return s ?? null
}

function collectTags(probe: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const p = probe as LooseProbe
  const fmtTags = p.format?.tags as Record<string, unknown> | undefined
  if (fmtTags) {
    for (const [k, v] of Object.entries(fmtTags)) {
      if (typeof v === 'string' && v.length > 0) out[`format.${k}`] = v
    }
  }
  p.streams?.forEach((s, i) => {
    const tags = s.tags as Record<string, unknown> | undefined
    if (!tags) return
    const type = asString(s.codec_type) ?? 'unknown'
    for (const [k, v] of Object.entries(tags)) {
      if (typeof v === 'string' && v.length > 0) out[`stream${i}.${type}.${k}`] = v
    }
  })
  return out
}

function deriveOneSide(probe: unknown): {
  durationMs: number | null
  width: number | null
  height: number | null
  displayAspectRatio: string | null
  frameRate: string | null
  videoCodec: string | null
  audioCodec: string | null
  container: string | null
  bitRate: number | null
} {
  const p = probe as LooseProbe
  const video = firstStream(probe, 'video')
  const audio = firstStream(probe, 'audio')
  const rate =
    asString(video?.r_frame_rate) ||
    asString(video?.avg_frame_rate) ||
    null
  return {
    durationMs: durationMsFromProbe(probe),
    width: toInt(video?.width),
    height: toInt(video?.height),
    displayAspectRatio: asString(video?.display_aspect_ratio),
    frameRate: rate,
    videoCodec: asString(video?.codec_name),
    audioCodec: asString(audio?.codec_name),
    container: asString(p.format?.format_name),
    bitRate: toNum(p.format?.bit_rate),
  }
}

export function deriveMediaMetadataFromReports(
  originalReport: unknown,
  editReport: unknown,
): MediaMetadataDerived {
  const src = deriveOneSide(originalReport)
  const ed = deriveOneSide(editReport)
  const pOrig = originalReport as LooseProbe
  const chapters = Array.isArray(pOrig.chapters) ? pOrig.chapters.length : 0
  const tags = collectTags(originalReport)
  const editTags = collectTags(editReport)
  for (const [k, v] of Object.entries(editTags)) {
    const key = `edit.${k}`
    if (!(key in tags)) tags[key] = v
  }
  return {
    sourceDurationMs: src.durationMs,
    editDurationMs: ed.durationMs,
    width: src.width,
    height: src.height,
    displayAspectRatio: src.displayAspectRatio,
    frameRate: src.frameRate,
    sourceVideoCodec: src.videoCodec,
    sourceAudioCodec: src.audioCodec,
    sourceContainer: src.container,
    sourceBitRate: src.bitRate,
    editVideoCodec: ed.videoCodec,
    editAudioCodec: ed.audioCodec,
    editContainer: ed.container,
    editBitRate: ed.bitRate,
    chaptersCount: chapters,
    tags,
  }
}

export function buildStoredMediaMetadata(
  originalKey: string,
  editKey: string,
  originalReport: unknown,
  editReport: unknown,
): StoredMediaMetadata {
  return {
    extractedAt: new Date().toISOString(),
    originalKey,
    editKey,
    original: originalReport,
    edit: editReport,
    derived: deriveMediaMetadataFromReports(originalReport, editReport),
  }
}

/** Prefer ffprobe duration when present (authoritative for the file). */
export function preferredDurationMs(project: {
  duration: number
  mediaMetadata?: StoredMediaMetadata | null
}): number {
  const d = project.mediaMetadata?.derived.sourceDurationMs
  if (d != null && d > 0) return d
  return project.duration
}

export function resolutionLabel(project: {
  mediaMetadata?: StoredMediaMetadata | null
}): string | null {
  const { width, height } = project.mediaMetadata?.derived ?? {}
  if (width && height) return `${width}×${height}`
  return null
}

export function mediaSummaryLine(project: {
  mediaMetadata?: StoredMediaMetadata | null
}): string | null {
  const m = project.mediaMetadata?.derived
  if (!m) return null
  const parts: string[] = []
  const res = resolutionLabel(project)
  if (res) parts.push(res)
  if (m.sourceVideoCodec) parts.push(m.sourceVideoCodec)
  if (m.sourceAudioCodec) parts.push(m.sourceAudioCodec)
  if (m.sourceContainer) parts.push(m.sourceContainer)
  if (m.chaptersCount > 0) parts.push(`${m.chaptersCount} ch.`)
  return parts.length ? parts.join(' · ') : null
}
