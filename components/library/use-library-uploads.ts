'use client'

import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { AppAction, BrowseFilter, VideoProject, WorkspaceTreeData } from '@/lib/types'
import { errorMessageFromResponse } from '@/lib/api-error-message'
import { createConcurrencyQueue } from '@/lib/async-queue'
import { buildClientMediaCapture } from '@/lib/client-media-capture'
import { extractLocalVideoPreview } from '@/lib/client-video-preview'
import { buildOriginalUploadKey } from '@/lib/media-keys'
import { projectHasPreparedEdit } from '@/lib/project-prepare'
import type { TranscriptionRequestOptions } from '@/lib/transcription-options'
import { createUploadProjectStub, startPlannedUpload, type UploadHandle, type UploadPlan } from '@/lib/upload-client'
import { uploadWakeLockAcquire, uploadWakeLockRelease } from '@/lib/upload-wake-lock'
import { inferVideoContentType, isVideoFileCandidate } from '@/lib/video-upload-mime'

type AuthedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function useLibraryUploads({
  wpId,
  browseFilter,
  authedFetch,
  dispatch,
  setTree,
  refreshServerData,
}: {
  wpId: string | null
  browseFilter: BrowseFilter
  authedFetch: AuthedFetch
  dispatch: React.Dispatch<AppAction>
  setTree: React.Dispatch<React.SetStateAction<WorkspaceTreeData | null>>
  refreshServerData: () => void
}) {
  const uploadQueueRef = useRef(createConcurrencyQueue(2))
  const activeUploadsRef = useRef<Map<string, UploadHandle>>(new Map())
  const queuedUploadsRef = useRef<
    Map<string, { cancel: () => void; persisted: boolean; cancelled: boolean }>
  >(new Map())
  const uploadTransferCountRef = useRef(0)
  const uploadBackgroundedDuringTransferRef = useRef(false)

  const runWithUploadSession = useCallback(async (fn: () => Promise<void>) => {
    uploadWakeLockAcquire()
    uploadTransferCountRef.current += 1
    try {
      await fn()
    } finally {
      uploadTransferCountRef.current -= 1
      uploadWakeLockRelease()
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadTransferCountRef.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (uploadTransferCountRef.current > 0) uploadBackgroundedDuringTransferRef.current = true
        return
      }
      if (!uploadBackgroundedDuringTransferRef.current) return
      uploadBackgroundedDuringTransferRef.current = false
      if (uploadTransferCountRef.current > 0) {
        toast.info('Upload may have paused while you were away—check progress.', { duration: 6000 })
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const addProjectLocally = useCallback(
    (project: VideoProject) => {
      dispatch({ type: 'ADD_PROJECT', project })
      setTree((prev) => {
        if (!prev) return prev
        return { ...prev, media: [project, ...prev.media] }
      })
    },
    [dispatch, setTree],
  )

  const updateProjectLocally = useCallback(
    (id: string, updates: Partial<VideoProject>) => {
      dispatch({ type: 'UPDATE_PROJECT', id, updates })
      setTree((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          media: prev.media.map((media) => (media.id === id ? { ...media, ...updates } : media)),
        }
      })
    },
    [dispatch, setTree],
  )

  const removeProjectLocally = useCallback(
    (id: string) => {
      dispatch({ type: 'DELETE_PROJECT', id })
      setTree((prev) => {
        if (!prev) return prev
        return { ...prev, media: prev.media.filter((media) => media.id !== id) }
      })
    },
    [dispatch, setTree],
  )

  const cancelUpload = useCallback(
    async (id: string) => {
      const queued = queuedUploadsRef.current.get(id)
      if (queued) {
        queued.cancelled = true
        queued.cancel()
        queuedUploadsRef.current.delete(id)
      }

      const handle = activeUploadsRef.current.get(id)
      if (handle) {
        handle.abort()
        activeUploadsRef.current.delete(id)
      }

      removeProjectLocally(id)

      if (!queued?.persisted) return

      try {
        await authedFetch(`/api/projects/${id}`, { method: 'DELETE' })
      } catch (error) {
        console.error('Failed to delete cancelled project from db', error)
      }
    },
    [authedFetch, removeProjectLocally],
  )

  const runQueuedUpload = useCallback(
    async (input: {
      file: File
      contentType: string
      project: VideoProject
      originalKey: string
      clientCapture: ReturnType<typeof buildClientMediaCapture>
      transcriptionOptions: TranscriptionRequestOptions | null
    }) => {
      if (!wpId) return

      const queueEntry = queuedUploadsRef.current.get(input.project.id)
      let originalPlaybackUrl: string | null = null

      try {
        if (!queueEntry || queueEntry.cancelled) {
          throw new Error('Upload cancelled.')
        }

        const presignRes = await authedFetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceProjectId: wpId,
            filename: input.originalKey,
            contentType: input.contentType,
            fileSize: input.file.size,
          }),
        })
        if (!presignRes.ok) {
          throw new Error(await errorMessageFromResponse(presignRes, 'Failed to get upload URL.'))
        }
        const presignData = (await presignRes.json()) as UploadPlan
        if (queueEntry?.cancelled) {
          throw new Error('Upload cancelled.')
        }

        const insertRes = await authedFetch('/api/projects/insert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input.project),
        })
        if (!insertRes.ok) {
          throw new Error(
            await errorMessageFromResponse(insertRes, 'Failed to save project to the database.'),
          )
        }
        if (queueEntry) {
          queueEntry.persisted = true
        }
        if (queueEntry?.cancelled) {
          throw new Error('Upload cancelled.')
        }

        updateProjectLocally(input.project.id, {
          status: 'uploading',
          transcriptionProgress: 10,
          mediaStep: 'upload',
          uploadQueueState: 'running',
          uploadProgress: {
            loaded: 0,
            total: input.file.size,
            speedBps: 0,
          },
          feedbackError: undefined,
          processingError: null,
        })

        await authedFetch(`/api/projects/${input.project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'uploading', transcriptionProgress: 10 }),
        })

        const uploadStartedAt = performance.now()
        const startedUpload = startPlannedUpload({
          file: input.file,
          contentType: input.contentType,
          plan: presignData,
          onProgress: (loaded, total) => {
            if (!Number.isFinite(total) || total <= 0) return
            const elapsedSec = Math.max((performance.now() - uploadStartedAt) / 1000, 0.05)
            const speedBps = loaded / elapsedSec
            const transcriptionProgress = Math.round((loaded / total) * 40) + 10
            updateProjectLocally(input.project.id, {
              transcriptionProgress,
              mediaStep: 'upload',
              uploadProgress: { loaded, total, speedBps },
              uploadQueueState: 'running',
            })
          },
          onMultipartComplete: async (parts, uploadId) => {
            const completeRes = await authedFetch('/api/upload/multipart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'complete',
                workspaceProjectId: wpId,
                filename: input.originalKey,
                uploadId,
                parts,
              }),
            })
            if (!completeRes.ok) {
              throw new Error(
                await errorMessageFromResponse(
                  completeRes,
                  'Could not finalize the multipart upload.',
                ),
              )
            }
          },
          onMultipartAbort: async (uploadId) => {
            await authedFetch('/api/upload/multipart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'abort',
                workspaceProjectId: wpId,
                filename: input.originalKey,
                uploadId,
              }),
            })
          },
        })

        activeUploadsRef.current.set(input.project.id, startedUpload)
        await startedUpload.done
        activeUploadsRef.current.delete(input.project.id)

        originalPlaybackUrl = presignData.url
        updateProjectLocally(input.project.id, {
          status: 'queued_prepare',
          fileUrl: originalPlaybackUrl,
          originalFileUrl: originalPlaybackUrl,
          transcriptionProgress: 55,
          uploadProgress: undefined,
          uploadQueueState: undefined,
          mediaStep: 'prepare',
          feedbackError: undefined,
          processingError: null,
        })

        await authedFetch(`/api/projects/${input.project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'queued_prepare',
            fileUrl: originalPlaybackUrl,
            originalFileUrl: originalPlaybackUrl,
            transcriptionProgress: 55,
          }),
        }).catch((error) => {
          console.error('Failed to persist queued prepare state:', error)
        })

        const prepareRes = await authedFetch(`/api/projects/${input.project.id}/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalKey: input.originalKey,
            clientCapture: input.clientCapture,
            ...(input.transcriptionOptions ? { transcriptionOptions: input.transcriptionOptions } : {}),
          }),
        })
        if (!prepareRes.ok) {
          throw new Error(
            await errorMessageFromResponse(
              prepareRes,
              'Could not queue the editor video preparation.',
            ),
          )
        }

        toast.success(
          originalPlaybackUrl
            ? 'Upload complete. Preview is ready while the editor MP4 prepares in the background.'
            : 'Upload complete. Preparing the editor MP4 in the background.',
        )
        refreshServerData()
      } catch (error) {
        console.error('Upload error:', error)
        const message = error instanceof Error ? error.message : 'Upload failed. Please try again.'

        if (message === 'Upload cancelled.' || message === 'Queue entry cancelled.') {
          if (queueEntry?.persisted) {
            await authedFetch(`/api/projects/${input.project.id}`, { method: 'DELETE' }).catch(() => undefined)
          }
          return
        }

        if (!queueEntry?.persisted) {
          removeProjectLocally(input.project.id)
          toast.error(message, { duration: 8000 })
          return
        }

        updateProjectLocally(input.project.id, {
          status: 'error',
          fileUrl: originalPlaybackUrl,
          originalFileUrl: originalPlaybackUrl,
          uploadProgress: undefined,
          uploadQueueState: undefined,
          mediaStep: undefined,
          feedbackError:
            originalPlaybackUrl && !projectHasPreparedEdit(input.project)
              ? `${message} The original upload is still available for preview.`
              : message,
          processingError: message,
        })
        await authedFetch(`/api/projects/${input.project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'error',
            fileUrl: originalPlaybackUrl,
            originalFileUrl: originalPlaybackUrl,
            processingError: message,
          }),
        }).catch(() => undefined)
        toast.error('Upload failed', { description: message, duration: 10_000 })
      } finally {
        activeUploadsRef.current.delete(input.project.id)
        queuedUploadsRef.current.delete(input.project.id)
      }
    },
    [authedFetch, refreshServerData, removeProjectLocally, updateProjectLocally, wpId],
  )

  const queueSingleFile = useCallback(
    async (file: File, pendingAutoTranscriptionOptions: TranscriptionRequestOptions | null) => {
      if (!wpId) return

      const targetFolderId = browseFilter.mode === 'folder' ? browseFilter.folderId : null
      const id = `proj-${crypto.randomUUID()}`
      const originalKey = buildOriginalUploadKey(wpId, id, file.name)

      const placeholderProject = createUploadProjectStub({
        id,
        workspaceProjectId: wpId,
        folderId: targetFolderId,
        file,
        duration: 60_000,
        thumbnailUrl: `https://picsum.photos/seed/${id}/640/360`,
      })
      addProjectLocally(placeholderProject)

      const queuedTask = uploadQueueRef.current.enqueue(async () => {
        await runWithUploadSession(async () => {
          updateProjectLocally(id, {
            uploadQueueState: 'running',
            mediaStep: 'upload',
            feedbackError: undefined,
            processingError: null,
          })

          const preview = await extractLocalVideoPreview(file, id)
          const queueEntry = queuedUploadsRef.current.get(id)
          if (!queueEntry || queueEntry.cancelled) {
            throw new Error('Upload cancelled.')
          }

          const uploadContentType = inferVideoContentType(file.name, file.type)
          if (!uploadContentType) {
            removeProjectLocally(id)
            toast.error('This file does not look like a supported video. Try MP4, MOV, WebM, or AVI.')
            return
          }

          const clientCapture = buildClientMediaCapture(
            file,
            preview.videoWidth > 0 && preview.videoHeight > 0
              ? {
                  videoWidth: preview.videoWidth,
                  videoHeight: preview.videoHeight,
                  durationMs: preview.duration,
                }
              : undefined,
            { uploadContentType },
          )

          const project = {
            ...placeholderProject,
            duration: preview.duration,
            thumbnailUrl: preview.thumbnailUrl,
            uploadQueueState: 'running' as const,
            mediaStep: 'upload' as const,
          }

          updateProjectLocally(id, {
            duration: preview.duration,
            thumbnailUrl: preview.thumbnailUrl,
            uploadQueueState: 'running',
            mediaStep: 'upload',
          })

          await runQueuedUpload({
            file,
            contentType: uploadContentType,
            project,
            originalKey,
            clientCapture,
            transcriptionOptions: pendingAutoTranscriptionOptions,
          })
        })
      })
      queuedUploadsRef.current.set(id, {
        cancel: queuedTask.cancel,
        persisted: false,
        cancelled: false,
      })

      void queuedTask.promise.catch((error) => {
        if (
          error instanceof Error &&
          (error.message === 'Queue entry cancelled.' || error.message === 'Upload cancelled.')
        ) {
          return
        }
        console.error('Queued upload task failed unexpectedly:', error)
      })
    },
    [
      addProjectLocally,
      browseFilter,
      removeProjectLocally,
      runQueuedUpload,
      runWithUploadSession,
      updateProjectLocally,
      wpId,
    ],
  )

  const handleFiles = useCallback(
    async (
      files: File[],
      options: {
        viewerLocked: boolean
        autoTranscribe: boolean
        getTranscriptionOptions: () => TranscriptionRequestOptions
      },
    ) => {
      if (!wpId) {
        toast.error('Open or create a workspace before uploading.')
        return
      }
      if (options.viewerLocked) {
        toast.error('Viewers cannot upload media.')
        return
      }

      const validFiles = files.filter(isVideoFileCandidate)
      if (validFiles.length === 0) {
        toast.error('Please choose video files only (for example MP4, MOV, WebM, or AVI).')
        return
      }
      if (validFiles.length < files.length) {
        toast.warning(`Skipped ${files.length - validFiles.length} files that are not supported videos.`)
      }

      const mobileHint =
        'Keep this tab open and in the foreground for large files; plug in if you can. On iOS, Low Power Mode may slow uploads. We keep your screen awake while transferring when the browser allows.'

      if (validFiles.length > 1) {
        toast.info(`Preparing ${validFiles.length} uploads (up to 2 at a time)…`, {
          description: mobileHint,
          duration: 10_000,
        })
      } else {
        toast.info('Preparing upload…', { description: mobileHint, duration: 10_000 })
      }

      const pendingAutoTranscriptionOptions = options.autoTranscribe ? options.getTranscriptionOptions() : null

      validFiles.forEach((file) => {
        void queueSingleFile(file, pendingAutoTranscriptionOptions)
      })
    },
    [queueSingleFile, wpId],
  )

  return {
    queuedUploadsRef,
    updateProjectLocally,
    removeProjectLocally,
    cancelUpload,
    handleFiles,
  }
}
