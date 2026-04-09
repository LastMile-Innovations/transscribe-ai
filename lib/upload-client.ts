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
  plan: UploadPlan
  onProgress: (loaded: number, total: number) => void
  onMultipartComplete: (parts: Array<{ ETag: string; PartNumber: number }>, uploadId: string) => Promise<void>
  onMultipartAbort: (uploadId: string) => Promise<void>
}): UploadHandle & { done: Promise<void> } {
  if (input.plan.uploadType === 'single') {
    const plan = input.plan
    const xhr = new XMLHttpRequest()
    const done = new Promise<void>((resolve, reject) => {
      xhr.open('PUT', plan.signedUrl)
      xhr.setRequestHeader('Content-Type', input.file.type)

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) return
        input.onProgress(event.loaded, event.total)
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
          return
        }
        reject(
          new Error(
            xhr.status
              ? `Upload to storage failed (HTTP ${xhr.status}). Check file size and try again.`
              : 'Upload to storage was rejected. Try again.',
          ),
        )
      }
      xhr.onerror = () => {
        reject(new Error('Network error during upload. Check your connection and try again.'))
      }
      xhr.onabort = () => {
        reject(new Error('Upload cancelled.'))
      }

      xhr.send(input.file)
    })

    return {
      abort: () => xhr.abort(),
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
    const loaded = Array.from(partLoadedBytes.values()).reduce((sum, value) => sum + value, 0)
    input.onProgress(Math.min(loaded, input.file.size), input.file.size)
  }

  const abort = () => {
    cancelled = true
    for (const xhr of activePartXhrs.values()) {
      xhr.abort()
    }
    activePartXhrs.clear()
  }

  const uploadPart = (part: { partNumber: number; signedUrl: string }) =>
    new Promise<string>((resolve, reject) => {
      const start = (part.partNumber - 1) * plan.partSize
      const end = Math.min(start + plan.partSize, input.file.size)
      const chunk = input.file.slice(start, end)
      const chunkSize = end - start

      const xhr = new XMLHttpRequest()
      activePartXhrs.set(part.partNumber, xhr)
      xhr.open('PUT', part.signedUrl)
      xhr.setRequestHeader('Content-Type', input.file.type)

      xhr.upload.onprogress = (event) => {
        const loaded = event.lengthComputable ? Math.min(event.loaded, chunkSize) : 0
        partLoadedBytes.set(part.partNumber, loaded)
        syncMultipartProgress()
      }

      xhr.onload = () => {
        activePartXhrs.delete(part.partNumber)
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new Error(
              xhr.status
                ? `Multipart upload failed on part ${part.partNumber} (HTTP ${xhr.status}).`
                : `Multipart upload was rejected on part ${part.partNumber}.`,
            ),
          )
          return
        }

        const etag = xhr.getResponseHeader('ETag')
        if (!etag) {
          reject(
            new Error(
              `Storage did not return an ETag for part ${part.partNumber}. Check bucket CORS to expose ETag.`,
            ),
          )
          return
        }

        partLoadedBytes.set(part.partNumber, chunkSize)
        syncMultipartProgress()
        resolve(etag)
      }

      xhr.onerror = () => {
        activePartXhrs.delete(part.partNumber)
        reject(new Error(`Network error during multipart upload (part ${part.partNumber}).`))
      }
      xhr.onabort = () => {
        activePartXhrs.delete(part.partNumber)
        reject(new Error('Upload cancelled.'))
      }

      xhr.send(chunk)
    })

  const done = (async () => {
    try {
      const maxParallelParts = Math.max(1, Math.min(plan.maxParallelParts, plan.parts.length))
      let nextPartIndex = 0

      const runMultipartWorker = async () => {
        while (true) {
          if (cancelled) throw new Error('Upload cancelled.')
          const part = plan.parts[nextPartIndex++]
          if (!part) return
          const etag = await uploadPart(part)
          uploadedParts.set(part.partNumber, etag)
        }
      }

      await Promise.all(Array.from({ length: maxParallelParts }, () => runMultipartWorker()))
      if (cancelled) throw new Error('Upload cancelled.')

      const completedParts = plan.parts
        .map((part) => ({
          ETag: uploadedParts.get(part.partNumber) ?? '',
          PartNumber: part.partNumber,
        }))
        .filter((part) => part.ETag)

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
