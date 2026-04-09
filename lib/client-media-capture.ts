/**
 * Captures non-sensitive hints from the browser and File API when the user picks media.
 * Intended for provenance (e.g. iPhone file name, lastModified) alongside server ffprobe.
 * Safe to import from client bundles only (uses navigator when available).
 */

export type ClientMediaCapture = {
  /** ISO time when this record was built in the browser */
  capturedAt: string
  file: {
    name: string
    size: number
    type: string
    /** File.lastModified from the OS (often near recording/export time on phones) */
    lastModified: number
    lastModifiedIso: string
  }
  video?: {
    videoWidth: number
    videoHeight: number
    durationMs: number
  }
  /** High-level environment (for support / correlation, not fingerprinting) */
  environment?: {
    userAgent: string
    platform: string
    language: string
    languages: string[]
    hardwareConcurrency: number | null
    deviceMemoryGb: number | null
  }
}

const MAX_UA = 600
const MAX_PLATFORM = 120

function clampStr(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function buildClientMediaCapture(
  file: File,
  video?: { videoWidth: number; videoHeight: number; durationMs: number },
  opts?: { uploadContentType?: string },
): ClientMediaCapture {
  const lastModified = file.lastModified
  const resolvedType =
    (opts?.uploadContentType && opts.uploadContentType.trim()) || file.type || 'application/octet-stream'
  const out: ClientMediaCapture = {
    capturedAt: new Date().toISOString(),
    file: {
      name: file.name,
      size: file.size,
      type: resolvedType,
      lastModified,
      lastModifiedIso: Number.isFinite(lastModified)
        ? new Date(lastModified).toISOString()
        : '',
    },
  }

  if (
    video &&
    video.videoWidth > 0 &&
    video.videoHeight > 0 &&
    Number.isFinite(video.durationMs) &&
    video.durationMs >= 0
  ) {
    out.video = {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      durationMs: Math.round(video.durationMs),
    }
  }

  if (typeof navigator !== 'undefined') {
    const dm = navigator as Navigator & {
      deviceMemory?: number
    }
    out.environment = {
      userAgent: clampStr(navigator.userAgent ?? '', MAX_UA),
      platform: clampStr(navigator.platform ?? '', MAX_PLATFORM),
      language: navigator.language ?? '',
      languages: [...(navigator.languages ?? [])].slice(0, 10),
      hardwareConcurrency:
        typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
      deviceMemoryGb: typeof dm.deviceMemory === 'number' ? dm.deviceMemory : null,
    }
  }

  return out
}

/** Strips environment block before sending if you want minimal payload (not used by default). */
export function clientCaptureWithoutEnvironment(c: ClientMediaCapture): ClientMediaCapture {
  const { environment: _e, ...rest } = c
  return rest
}

const MAX_NAME = 512
const MAX_MIME = 120
const MAX_ENV = 600

/** Server-side validation for JSON posted with prepare-edit-asset. */
export function parseClientMediaCaptureFromJson(raw: unknown): ClientMediaCapture | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const file = o.file
  if (!file || typeof file !== 'object') return undefined
  const f = file as Record<string, unknown>
  if (typeof f.name !== 'string' || f.name.length > MAX_NAME) return undefined
  const size = Number(f.size)
  if (!Number.isFinite(size) || size < 0 || size > 200e9) return undefined
  const type =
    typeof f.type === 'string' && f.type.length <= MAX_MIME ? f.type : 'application/octet-stream'
  const lastModified = Number(f.lastModified)
  if (!Number.isFinite(lastModified)) return undefined
  const lastModifiedIso =
    typeof f.lastModifiedIso === 'string' && f.lastModifiedIso.length <= 40 ? f.lastModifiedIso : ''
  const capturedAt =
    typeof o.capturedAt === 'string' && o.capturedAt.length <= 40 ? o.capturedAt : new Date().toISOString()

  const out: ClientMediaCapture = {
    capturedAt,
    file: { name: f.name, size, type, lastModified, lastModifiedIso },
  }

  const vid = o.video
  if (vid && typeof vid === 'object') {
    const v = vid as Record<string, unknown>
    const w = Number(v.videoWidth)
    const h = Number(v.videoHeight)
    const d = Number(v.durationMs)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && Number.isFinite(d) && d >= 0) {
      out.video = { videoWidth: Math.round(w), videoHeight: Math.round(h), durationMs: Math.round(d) }
    }
  }

  const env = o.environment
  if (env && typeof env === 'object') {
    const e = env as Record<string, unknown>
    const userAgent = typeof e.userAgent === 'string' ? e.userAgent.slice(0, MAX_ENV) : ''
    const platform = typeof e.platform === 'string' ? e.platform.slice(0, 120) : ''
    const language = typeof e.language === 'string' ? e.language.slice(0, 40) : ''
    let languages: string[] = []
    if (Array.isArray(e.languages)) {
      languages = e.languages
        .filter((x): x is string => typeof x === 'string')
        .slice(0, 12)
        .map((s) => s.slice(0, 40))
    }
    const hc = e.hardwareConcurrency
    const hardwareConcurrency = typeof hc === 'number' && Number.isFinite(hc) ? Math.min(256, hc) : null
    const dm = e.deviceMemoryGb
    const deviceMemoryGb =
      typeof dm === 'number' && Number.isFinite(dm) && dm >= 0 && dm <= 128 ? dm : null
    if (userAgent || platform || language || languages.length) {
      out.environment = {
        userAgent,
        platform,
        language,
        languages,
        hardwareConcurrency,
        deviceMemoryGb,
      }
    }
  }

  return out
}
