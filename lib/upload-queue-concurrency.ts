type NetworkInformation = {
  effectiveType?: string
  saveData?: boolean
}

/** Max parallel library uploads (preview + presign + transfer). Tunable via env; capped for safety. */
export function libraryUploadQueueConcurrency(): number {
  const raw = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_CONCURRENT)
  let n =
    Number.isFinite(raw) && raw >= 1 ? Math.min(8, Math.trunc(raw)) : 3
  if (typeof navigator !== 'undefined') {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection
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
