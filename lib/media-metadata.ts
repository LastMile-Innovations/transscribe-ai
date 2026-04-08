/**
 * Media metadata from ffprobe: stored in DB (full JSON) + derived fields for UI.
 * Optional browser-side capture (File + video element + navigator) is merged under `clientCapture`
 * and flattened into `derived.tags` with a `client.*` prefix.
 * Safe to import from client or server (no Node-only APIs).
 */

import type { ClientMediaCapture } from './client-media-capture'

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
  /** Optional snapshot from the uploader’s browser (not from the file binary). */
  clientCapture?: ClientMediaCapture
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

function collectProgramTags(probe: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const p = probe as { programs?: Array<{ tags?: Record<string, unknown> }> }
  p.programs?.forEach((prog, i) => {
    const tags = prog.tags
    if (!tags) return
    for (const [k, v] of Object.entries(tags)) {
      if (typeof v === 'string' && v.length > 0) out[`program${i}.${k}`] = v
    }
  })
  return out
}

function collectStreamSideDataTags(probe: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const p = probe as LooseProbe
  p.streams?.forEach((s, i) => {
    const list = s.side_data_list as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(list)) return
    list.forEach((sd, j) => {
      const typ = asString(sd.side_data_type) ?? `entry${j}`
      const rot = toInt(sd.rotation)
      if (rot != null) {
        out[`stream${i}.side_data.${typ}.rotation`] = String(rot)
      }
      const dm = asString(sd.displaymatrix)
      if (dm && dm.length < 400) {
        out[`stream${i}.side_data.${typ}.displaymatrix`] = dm
      }
    })
  })
  return out
}

function mergeProbeExtraTags(probe: unknown, into: Record<string, string>): void {
  for (const [k, v] of Object.entries(collectProgramTags(probe))) {
    if (!(k in into)) into[k] = v
  }
  for (const [k, v] of Object.entries(collectStreamSideDataTags(probe))) {
    if (!(k in into)) into[k] = v
  }
}

function applyClientCaptureToDerived(derived: MediaMetadataDerived, c: ClientMediaCapture): void {
  const t = derived.tags
  const set = (suffix: string, v: string) => {
    t[`client.${suffix}`] = v
  }
  set('file.name', c.file.name)
  set('file.size_bytes', String(c.file.size))
  set('file.mime', c.file.type)
  set('file.last_modified_iso', c.file.lastModifiedIso)
  if (c.video) {
    set('video.element_width', String(c.video.videoWidth))
    set('video.element_height', String(c.video.videoHeight))
    set('video.element_duration_ms', String(c.video.durationMs))
  }
  if (c.environment) {
    set('browser.user_agent', c.environment.userAgent)
    set('browser.platform', c.environment.platform)
    set('browser.language', c.environment.language)
    set('browser.languages', c.environment.languages.join(', '))
    if (c.environment.hardwareConcurrency != null) {
      set('browser.hardware_concurrency', String(c.environment.hardwareConcurrency))
    }
    if (c.environment.deviceMemoryGb != null) {
      set('browser.device_memory_gb_hint', String(c.environment.deviceMemoryGb))
    }
  }
  set('browser.capture_iso', c.capturedAt)
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
  mergeProbeExtraTags(originalReport, tags)
  const editTags = collectTags(editReport)
  for (const [k, v] of Object.entries(editTags)) {
    const key = `edit.${k}`
    if (!(key in tags)) tags[key] = v
  }
  mergeProbeExtraTags(editReport, tags)
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
  clientCapture?: ClientMediaCapture | null,
): StoredMediaMetadata {
  const derived = deriveMediaMetadataFromReports(originalReport, editReport)
  if (clientCapture) {
    applyClientCaptureToDerived(derived, clientCapture)
  }
  return {
    extractedAt: new Date().toISOString(),
    originalKey,
    editKey,
    original: originalReport,
    edit: editReport,
    derived,
    ...(clientCapture ? { clientCapture } : {}),
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
