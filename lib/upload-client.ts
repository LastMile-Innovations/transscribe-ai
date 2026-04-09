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
  parts: Array<{ partNumber: number; signedUrl: string }>
  url: string | null
  thresholdBytes: number
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
}): UploadHandle & { done: Promise<void> } {
  const putContentType = (input.contentType ?? input.file.type).trim() || 'application/octet-stream'

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
          input.onProgress(event.loaded, event.total)
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

    const done = runWithUploadRetries(() => cancelled, sendOnce)

    return {
      abort: () => {
        cancelled = true
        activeXhr?.abort()
      },
      done,
    }
  }

  const plan = input.plan
  let cancelled = false
  let completed = false
  const activePartXhrs = new Map<number, XMLHttpRequest>()
  const partLoadedBytes = new Map<number, number>()
  const uploadedParts = new Map<number, string>()

  const syncMultipartProgress = () => {
    let loaded = 0
    for (const n of partLoadedBytes.values()) loaded += n
    input.onProgress(Math.min(loaded, input.file.size), input.file.size)
  }

  const abort = () => {
    cancelled = true
    for (const xhr of activePartXhrs.values()) {
      xhr.abort()
    }
    activePartXhrs.clear()
  }

  const uploadPart = (part: { partNumber: number; signedUrl: string }) => {
    const start = (part.partNumber - 1) * plan.partSize
    const end = Math.min(start + plan.partSize, input.file.size)
    const chunk = input.file.slice(start, end)
    const chunkSize = end - start
    const partNo = part.partNumber

    const sendPartOnce = () =>
      new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        activePartXhrs.set(partNo, xhr)
        xhr.open('PUT', part.signedUrl)
        xhr.setRequestHeader('Content-Type', putContentType)

        xhr.upload.onprogress = (event) => {
          const loaded = event.lengthComputable ? Math.min(event.loaded, chunkSize) : 0
          partLoadedBytes.set(partNo, loaded)
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

          partLoadedBytes.set(partNo, chunkSize)
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
        partLoadedBytes.delete(partNo)
        syncMultipartProgress()
      },
    )
  }

  const done = (async () => {
    try {
      const maxParallelParts = Math.max(1, Math.min(plan.maxParallelParts, plan.parts.length))
      let nextPartIndex = 0

      const runMultipartWorker = async () => {
        while (true) {
          if (cancelled) throw new Error(UPLOAD_CANCELLED_MESSAGE)
          const part = plan.parts[nextPartIndex++]
          if (!part) return
          const etag = await uploadPart(part)
          uploadedParts.set(part.partNumber, etag)
        }
      }

      await Promise.all(Array.from({ length: maxParallelParts }, () => runMultipartWorker()))
      if (cancelled) throw new Error(UPLOAD_CANCELLED_MESSAGE)

      const completedParts = plan.parts
        .map((p) => ({
          ETag: uploadedParts.get(p.partNumber) ?? '',
          PartNumber: p.partNumber,
        }))
        .filter((p) => p.ETag)

      if (completedParts.length !== plan.parts.length) {
        throw new Error('Multipart upload finished with missing parts.')
      }

      await input.onMultipartComplete(completedParts, plan.uploadId)
      completed = true
    } catch (error) {
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
