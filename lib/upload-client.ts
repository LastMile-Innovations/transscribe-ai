'use client'

import type { VideoProject } from './types'

export type UploadHandle = {
  abort: () => void
}

export type SingleUploadPlan = {
  uploadType: 'single'
  signedUrl: string
  url: string | null
  thresholdBytes: number
}

export type MultipartUploadPlan = {
  uploadType: 'multipart'
  uploadId: string
  partSize: number
  maxParallelParts: number
  /** Part URLs for the first batch (or all parts when totalParts equals this list length). */
  parts: Array<{ partNumber: number; signedUrl: string }>
  url: string | null
  thresholdBytes: number
  /** Total S3 part count; may be greater than parts.length when URLs are presigned in batches. */
  totalParts: number
  /** Server batch size for aligned follow-up presign requests. */
  partPresignBatchSize?: number
}

export type UploadPlan = SingleUploadPlan | MultipartUploadPlan

const UPLOAD_XHR_MAX_ATTEMPTS = 4
const UPLOAD_XHR_BASE_DELAY_MS = 800
const UPLOAD_CANCELLED_MESSAGE = 'Upload cancelled.'

class UploadHttpError extends Error {
  readonly uploadHttpStatus: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'UploadHttpError'
    this.uploadHttpStatus = status
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isTransientHttpStatus(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status < 600)
}

function uploadHttpError(message: string, status: number): UploadHttpError {
  return new UploadHttpError(message, status)
}

function shouldRetryAfterError(error: unknown): boolean {
  if (!(error instanceof UploadHttpError)) return false
  return isTransientHttpStatus(error.uploadHttpStatus)
}

async function runWithUploadRetries<T>(
  isCancelled: () => boolean,
  runOnce: () => Promise<T>,
  onBeforeRetry?: () => void | Promise<void>,
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt < UPLOAD_XHR_MAX_ATTEMPTS; attempt++) {
    if (isCancelled()) throw new Error(UPLOAD_CANCELLED_MESSAGE)
    if (attempt > 0) {
      await onBeforeRetry?.()
      await sleep(UPLOAD_XHR_BASE_DELAY_MS * 2 ** (attempt - 1))
    }
    try {
      return await runOnce()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      if (err.message === UPLOAD_CANCELLED_MESSAGE) throw err
      lastError = err
      if (!shouldRetryAfterError(error)) throw err
    }
  }
  throw lastError ?? new Error('Upload failed after retries.')
}

/** Coalesce progress callbacks to one emit per animation frame (reduces React churn during multipart). */
function createUploadProgressThrottle(onProgress: (loaded: number, total: number) => void) {
  let raf = 0
  let pending: { loaded: number; total: number } | null = null
  const tick = () => {
    raf = 0
    if (!pending) return
    const p = pending
    pending = null
    onProgress(p.loaded, p.total)
  }
  return {
    emit(loaded: number, total: number) {
      pending = { loaded, total }
      if (!raf) raf = requestAnimationFrame(tick)
    },
    flush() {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      if (pending) {
        const p = pending
        pending = null
        onProgress(p.loaded, p.total)
      }
    },
  }
}

export function createUploadProjectStub(input: {
  id: string
  workspaceProjectId: string
  folderId: string | null
  file: File
  duration: number
  thumbnailUrl: string
}): VideoProject {
  const { file } = input
  return {
    id: input.id,
    title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
    fileName: file.name,
    duration: input.duration,
    uploadedAt: new Date(),
    status: 'uploading',
    thumbnailUrl: input.thumbnailUrl,
    fileUrl: null,
    transcriptionProgress: 0,
    workspaceProjectId: input.workspaceProjectId,
    folderId: input.folderId,
    uploadQueueState: 'queued',
  }
}

export function startPlannedUpload(input: {
  file: File
  /** When the File has an empty type (common on some mobile pickers), use this for the PUT Content-Type. */
  contentType?: string
  plan: UploadPlan
  onProgress: (loaded: number, total: number) => void
  onMultipartComplete: (parts: Array<{ ETag: string; PartNumber: number }>, uploadId: string) => Promise<void>
  onMultipartAbort: (uploadId: string) => Promise<void>
  /** Required when multipart plan has fewer signed URLs than totalParts; fetches presigned PUT URLs for part numbers. */
  fetchMultipartPartUrls?: (partNumbers: number[]) => Promise<Array<{ partNumber: number; signedUrl: string }>>
}): UploadHandle & { done: Promise<void> } {
  const putContentType = (input.contentType ?? input.file.type).trim() || 'application/octet-stream'
  const progress = createUploadProgressThrottle(input.onProgress)

  if (input.plan.uploadType === 'single') {
    const plan = input.plan
    let activeXhr: XMLHttpRequest | null = null
    let cancelled = false

    const sendOnce = () =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        activeXhr = xhr
        xhr.open('PUT', plan.signedUrl)
        xhr.setRequestHeader('Content-Type', putContentType)

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable || event.total <= 0) return
          progress.emit(event.loaded, event.total)
        }

        xhr.onload = () => {
          activeXhr = null
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
            return
          }
          reject(
            uploadHttpError(
              xhr.status
                ? `Upload to storage failed (HTTP ${xhr.status}). Check file size and try again.`
                : 'Upload to storage was rejected. Try again.',
              xhr.status,
            ),
          )
        }
        xhr.onerror = () => {
          activeXhr = null
          reject(uploadHttpError('Network error during upload. Check your connection and try again.', 0))
        }
        xhr.onabort = () => {
          activeXhr = null
          reject(new Error(UPLOAD_CANCELLED_MESSAGE))
        }

        xhr.send(input.file)
      })

    const done = runWithUploadRetries(() => cancelled, sendOnce).finally(() => {
      progress.flush()
    })

    return {
      abort: () => {
        cancelled = true
        activeXhr?.abort()
      },
      done,
    }
  }

  const plan = input.plan
  const totalParts = plan.totalParts
  const urlBatchSize = Math.max(1, plan.partPresignBatchSize ?? 64)

  if (totalParts > plan.parts.length && !input.fetchMultipartPartUrls) {
    throw new Error('fetchMultipartPartUrls is required when multipart URLs are presigned in batches.')
  }

  let cancelled = false
  let completed = false
  const activePartXhrs = new Map<number, XMLHttpRequest>()
  const partLoadedBytes = new Map<number, number>()
  const uploadedParts = new Map<number, string>()
  const urlByPart = new Map<number, string>(plan.parts.map((p) => [p.partNumber, p.signedUrl]))

  let urlFetchChain: Promise<void> = Promise.resolve()

  /** Sum of last-reported bytes per part — updated incrementally (O(1)) instead of scanning the map each progress tick. */
  let multipartLoadedTotal = 0

  const setPartLoaded = (partNo: number, loaded: number) => {
    const prev = partLoadedBytes.get(partNo) ?? 0
    multipartLoadedTotal += loaded - prev
    partLoadedBytes.set(partNo, loaded)
  }

  const schedulePrefetchAfterBatchEnd = (batchEnd: number) => {
    const fetchMore = input.fetchMultipartPartUrls
    if (!fetchMore || cancelled) return
    const nextStart = batchEnd + 1
    if (nextStart > totalParts || urlByPart.has(nextStart)) return
    urlFetchChain = urlFetchChain.then(async () => {
      if (cancelled) return
      if (nextStart > totalParts || urlByPart.has(nextStart)) return
      const batchStart = Math.floor((nextStart - 1) / urlBatchSize) * urlBatchSize + 1
      const batchEndInner = Math.min(batchStart + urlBatchSize - 1, totalParts)
      const need: number[] = []
      for (let i = batchStart; i <= batchEndInner; i++) {
        if (!urlByPart.has(i)) need.push(i)
      }
      if (need.length === 0) return
      const fetched = await fetchMore(need)
      for (const p of fetched) {
        urlByPart.set(p.partNumber, p.signedUrl)
      }
      schedulePrefetchAfterBatchEnd(batchEndInner)
    })
  }

  const ensurePartUrlsFor = async (partNo: number) => {
    if (urlByPart.has(partNo)) return
    urlFetchChain = urlFetchChain.then(async () => {
      if (cancelled) throw new Error(UPLOAD_CANCELLED_MESSAGE)
      if (urlByPart.has(partNo)) return
      const batchStart = Math.floor((partNo - 1) / urlBatchSize) * urlBatchSize + 1
      const batchEnd = Math.min(batchStart + urlBatchSize - 1, totalParts)
      const need: number[] = []
      for (let i = batchStart; i <= batchEnd; i++) {
        if (!urlByPart.has(i)) need.push(i)
      }
      if (need.length === 0) return
      const fetched = await input.fetchMultipartPartUrls!(need)
      for (const p of fetched) {
        urlByPart.set(p.partNumber, p.signedUrl)
      }
      schedulePrefetchAfterBatchEnd(batchEnd)
    })
    await urlFetchChain
    if (!urlByPart.has(partNo)) {
      throw new Error(`Could not presign multipart part ${partNo}.`)
    }
  }

  if (totalParts > plan.parts.length && input.fetchMultipartPartUrls) {
    const lastSeeded = plan.parts.reduce((m, p) => Math.max(m, p.partNumber), 0)
    if (lastSeeded < totalParts) {
      schedulePrefetchAfterBatchEnd(lastSeeded)
    }
  }

  const syncMultipartProgress = () => {
    progress.emit(Math.min(multipartLoadedTotal, input.file.size), input.file.size)
  }

  const abort = () => {
    cancelled = true
    for (const xhr of activePartXhrs.values()) {
      xhr.abort()
    }
    activePartXhrs.clear()
  }

  const uploadPart = async (partNo: number) => {
    await ensurePartUrlsFor(partNo)
    const signedUrl = urlByPart.get(partNo)
    if (!signedUrl) {
      throw new Error(`Missing signed URL for multipart part ${partNo}.`)
    }

    const start = (partNo - 1) * plan.partSize
    const end = Math.min(start + plan.partSize, input.file.size)
    const chunk = input.file.slice(start, end)
    const chunkSize = end - start

    const sendPartOnce = () =>
      new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        activePartXhrs.set(partNo, xhr)
        xhr.open('PUT', signedUrl)
        xhr.setRequestHeader('Content-Type', putContentType)

        xhr.upload.onprogress = (event) => {
          const loaded = event.lengthComputable ? Math.min(event.loaded, chunkSize) : 0
          setPartLoaded(partNo, loaded)
          syncMultipartProgress()
        }

        xhr.onload = () => {
          activePartXhrs.delete(partNo)
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(
              uploadHttpError(
                xhr.status
                  ? `Multipart upload failed on part ${partNo} (HTTP ${xhr.status}).`
                  : `Multipart upload was rejected on part ${partNo}.`,
                xhr.status,
              ),
            )
            return
          }

          const etagHeader = xhr.getResponseHeader('ETag')
          if (!etagHeader) {
            reject(
              new Error(
                `Storage did not return an ETag for part ${partNo}. Check bucket CORS to expose ETag.`,
              ),
            )
            return
          }

          setPartLoaded(partNo, chunkSize)
          syncMultipartProgress()
          resolve(etagHeader)
        }

        xhr.onerror = () => {
          activePartXhrs.delete(partNo)
          reject(uploadHttpError(`Network error during multipart upload (part ${partNo}).`, 0))
        }
        xhr.onabort = () => {
          activePartXhrs.delete(partNo)
          reject(new Error(UPLOAD_CANCELLED_MESSAGE))
        }

        xhr.send(chunk)
      })

    return runWithUploadRetries(
      () => cancelled,
      sendPartOnce,
      async () => {
        const prev = partLoadedBytes.get(partNo) ?? 0
        partLoadedBytes.delete(partNo)
        multipartLoadedTotal -= prev
        syncMultipartProgress()
      },
    )
  }

  const done = (async () => {
    try {
      const maxParallelParts = Math.max(1, Math.min(plan.maxParallelParts, totalParts))
      let nextPartNumber = 1

      const runMultipartWorker = async () => {
        while (true) {
          if (cancelled) throw new Error(UPLOAD_CANCELLED_MESSAGE)
          const partNo = nextPartNumber
          nextPartNumber += 1
          if (partNo > totalParts) return
          const etag = await uploadPart(partNo)
          uploadedParts.set(partNo, etag)
        }
      }

      await Promise.all(Array.from({ length: maxParallelParts }, () => runMultipartWorker()))
      if (cancelled) throw new Error(UPLOAD_CANCELLED_MESSAGE)

      const completedParts = Array.from({ length: totalParts }, (_, i) => i + 1)
        .map((partNumber) => ({
          ETag: uploadedParts.get(partNumber) ?? '',
          PartNumber: partNumber,
        }))
        .filter((p) => p.ETag)

      if (completedParts.length !== totalParts) {
        throw new Error('Multipart upload finished with missing parts.')
      }

      progress.flush()
      await input.onMultipartComplete(completedParts, plan.uploadId)
      completed = true
    } catch (error) {
      progress.flush()
      if (!cancelled) {
        abort()
      }
      if (!completed) {
        await input.onMultipartAbort(plan.uploadId).catch(() => undefined)
      }
      throw error
    }
  })()

  return { abort, done }
}
