type NetworkInformation = {
  effectiveType?: string
  saveData?: boolean
}

/** Hard ceiling for parallel library uploads (preview + presign + transfer). */
export const LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP = 48

export type LibraryUploadQueueConcurrencyOptions = {
  /** Override `NEXT_PUBLIC_UPLOAD_MAX_CONCURRENT` (for tests). */
  envValue?: string | undefined
  /** Override global navigator (for tests). */
  navigator?: Navigator
}

function defaultConcurrencyFromHardware(nav?: Navigator): number {
  if (!nav) {
    return Math.min(LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP, 12)
  }
  const hc = nav.hardwareConcurrency
  const cores = typeof hc === 'number' && hc >= 1 ? hc : 8
  return Math.min(LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP, Math.max(4, cores * 2))
}

/** Max parallel library uploads (preview + presign + transfer). Tunable via env; capped for safety. */
export function libraryUploadQueueConcurrency(opts?: LibraryUploadQueueConcurrencyOptions): number {
  const raw = Number(
    opts && 'envValue' in opts ? opts.envValue : process.env.NEXT_PUBLIC_UPLOAD_MAX_CONCURRENT,
  )
  const nav =
    opts && 'navigator' in opts
      ? opts.navigator
      : typeof globalThis.navigator !== 'undefined'
        ? (globalThis.navigator as Navigator)
        : undefined

  let n =
    Number.isFinite(raw) && raw >= 1
      ? Math.min(LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP, Math.trunc(raw))
      : defaultConcurrencyFromHardware(nav)

  if (nav) {
    const conn = (nav as Navigator & { connection?: NetworkInformation }).connection
    const ect = conn?.effectiveType
    if (conn?.saveData === true) {
      n = Math.min(n, 2)
    } else if (ect === 'slow-2g' || ect === '2g') {
      n = Math.min(n, 2)
    } else if (ect === '3g') {
      n = Math.min(n, 3)
    }
  }
  return Math.max(1, n)
}
