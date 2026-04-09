'use client'

import { useUser, UserButton, SignInButton, SignUpButton, Show } from '@clerk/nextjs'
import { useAuthedFetch } from '@/lib/authed-fetch'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  UploadCloud,
  Search,
  Play,
  Clock,
  Calendar,
  Filter,
  FileVideo,
  Loader2,
  CheckCircle,
  XCircle,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderPlus,
  Trash2,
  Pencil,
  Mic,
  AlertCircle,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LibraryHeader, WorkspaceList } from '@/components/library-header'
import { LibraryUploadDropzone } from '@/components/library-upload-dropzone'
import { TranscriptionSettingsPanel } from '@/components/transcription-settings-panel'
import { WorkspacePeopleDialog } from '@/components/workspace-people-dialog'
import { useApp } from '@/lib/app-context'
import type { VideoProject, ProjectStatus, WorkspaceProject, Folder } from '@/lib/types'
import { errorMessageFromResponse } from '@/lib/api-error-message'
import {
  addWorkspaceMemberAction,
  createFolderAction,
  createWorkspaceProjectAction,
  deleteFolderAction,
  deleteProjectAction,
  moveMediaToFolderAction,
  queueProjectPreparationAction,
  removeWorkspaceMemberAction,
  renameProjectAction,
  updateWorkspaceMemberRoleAction,
} from '@/lib/actions'
import {
  mediaSummaryLine,
  preferredDurationMs,
} from '@/lib/media-metadata'
import { createConcurrencyQueue } from '@/lib/async-queue'
import { buildClientMediaCapture } from '@/lib/client-media-capture'
import { buildOriginalUploadKey } from '@/lib/media-keys'
import { canRetryPrepare, isPrepareBusyStatus, projectHasPreparedEdit } from '@/lib/project-prepare'
import { runTranscriptionFlow } from '@/lib/transcription-client'
import {
  DEFAULT_TRANSCRIPTION_OPTIONS,
  DEFAULT_TRANSCRIPTION_PROMPT,
  normalizeTranscriptionOptions,
  type TranscriptionRequestOptions,
} from '@/lib/transcription-options'
import {
  createUploadProjectStub,
  startPlannedUpload,
  type UploadHandle,
  type UploadPlan,
} from '@/lib/upload-client'
import { cn } from '@/lib/utils'

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatDataSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTransferSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '—'
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatEtaSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 90) return `${Math.max(1, Math.ceil(seconds))}s left`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return `${m}m ${s}s left`
}

function VaultUploadStats({ up }: { up: NonNullable<VideoProject['uploadProgress']> }) {
  const etaSec =
    up.speedBps > 0 && up.loaded < up.total ? (up.total - up.loaded) / up.speedBps : NaN
  const etaStr = formatEtaSeconds(etaSec)
  return (
    <p className="max-w-[min(100%,14rem)] text-[11px] leading-snug text-white/85">
      <span className="font-mono tabular-nums">
        {formatDataSize(up.loaded)} / {formatDataSize(up.total)}
      </span>
      <span className="text-white/60"> · </span>
      <span className="font-mono tabular-nums">{formatTransferSpeed(up.speedBps)}</span>
      {etaStr ? (
        <>
          <span className="text-white/60"> · </span>
          <span className="tabular-nums">{etaStr}</span>
        </>
      ) : null}
    </p>
  )
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }> = {
  ready: { label: 'Ready', variant: 'default', icon: <CheckCircle className="size-3" /> },
  queued_prepare: {
    label: 'Queued',
    variant: 'outline',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  preparing: {
    label: 'Preparing',
    variant: 'secondary',
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  transcribing: { label: 'Transcribing', variant: 'secondary', icon: <Loader2 className="size-3 animate-spin" /> },
  awaiting_transcript: {
    label: 'Needs transcript',
    variant: 'outline',
    icon: <Mic className="size-3 text-muted-foreground" />,
  },
  uploading: { label: 'Uploading', variant: 'outline', icon: <Loader2 className="size-3 animate-spin" /> },
  error: { label: 'Error', variant: 'destructive', icon: <XCircle className="size-3" /> },
}

function ProjectCard({
  project,
  onOpen,
  folderOptions,
  onMoveToFolder,
  onRenameTitle,
  onStartTranscription,
  onRetryPrepare,
  onCancelUpload,
  onDeleteMedia,
}: {
  project: VideoProject
  onOpen: (id: string) => void
  folderOptions?: { id: string | null; label: string }[]
  onMoveToFolder?: (mediaId: string, folderId: string | null) => void
  onRenameTitle?: (mediaId: string, title: string) => Promise<void>
  onStartTranscription?: (mediaId: string) => void
  onRetryPrepare?: (mediaId: string) => void
  onCancelUpload?: (mediaId: string) => void
  onDeleteMedia?: (mediaId: string) => Promise<void>
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const projectErrorMessage = project.feedbackError ?? project.processingError ?? undefined
  const projectErrorTitle =
    project.status === 'awaiting_transcript'
      ? 'Automatic transcription did not start'
      : project.status === 'error' && !projectHasPreparedEdit(project)
        ? 'Could not prepare editor video'
        : project.status === 'error'
          ? 'Something went wrong'
          : 'Could not finish transcription'
  const { label, variant, icon } = STATUS_CONFIG[project.status]
  const isReady = project.status === 'ready'
  const canOpenInEditor =
    project.status === 'ready' || project.status === 'awaiting_transcript' || Boolean(project.fileUrl)
  const isProcessing =
    project.status === 'uploading' ||
    project.status === 'transcribing' ||
    isPrepareBusyStatus(project.status)

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTitleValue(project.title)
    setEditingTitle(true)
  }

  const commitCardTitle = async () => {
    const trimmed = titleValue.trim()
    if (!trimmed) {
      toast.error('Name is required.')
      setTitleValue(project.title)
      setEditingTitle(false)
      return
    }
    if (trimmed === project.title) {
      setEditingTitle(false)
      return
    }
    if (!onRenameTitle) {
      setEditingTitle(false)
      return
    }
    try {
      await onRenameTitle(project.id, trimmed)
      setEditingTitle(false)
    } catch {
      setTitleValue(project.title)
      setEditingTitle(false)
    }
  }

  return (
    <div
      role={canOpenInEditor ? 'button' : 'article'}
      tabIndex={canOpenInEditor ? 0 : undefined}
      aria-busy={isProcessing}
      onKeyDown={(e) => {
        if (canOpenInEditor && e.key === 'Enter') {
          e.preventDefault()
          onOpen(project.id)
        }
      }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-300 animate-in fade-in zoom-in-95',
        canOpenInEditor
          ? 'cursor-pointer hover:border-brand/50 hover:shadow-xl hover:shadow-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand hover:-translate-y-0.5'
          : 'cursor-default',
      )}
      onClick={() => canOpenInEditor && onOpen(project.id)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <img
          src={project.thumbnailUrl}
          alt={project.title}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Play overlay */}
        {canOpenInEditor && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-100 lg:opacity-0 transition-opacity duration-200 lg:group-hover:opacity-100">
            <div className="flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg">
              <Play className="size-6 translate-x-0.5" />
            </div>
          </div>
        )}
        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-3 py-2 text-center backdrop-blur-sm">
            <Loader2 className="size-8 shrink-0 animate-spin text-brand" />
            <span className="text-sm font-medium text-white">
              {project.status === 'uploading' && project.uploadQueueState === 'queued'
                ? 'Waiting for an upload slot…'
                : project.uploadProgress
                  ? 'Step 1 of 3: Uploading to vault…'
                  : project.status === 'uploading'
                    ? 'Step 1 of 3: Reading local preview…'
                  : project.status === 'queued_prepare'
                    ? 'Step 2 of 3: Queued for editor prep…'
                    : project.status === 'preparing' || project.mediaStep === 'prepare'
                      ? 'Step 2 of 3: Preparing editor MP4…'
                      : project.mediaStep === 'transcribe' || project.status === 'transcribing'
                        ? 'Step 3 of 3: Transcribing with AssemblyAI…'
                        : 'Processing…'}
            </span>
            {project.uploadProgress && project.uploadQueueState !== 'queued' ? (
              <VaultUploadStats up={project.uploadProgress} />
            ) : null}
            <div className="w-44 max-w-full">
              <Progress value={project.transcriptionProgress} className="h-1.5" />
            </div>
            <span className="text-xs text-white/70 tabular-nums">{project.transcriptionProgress}%</span>
            
            {project.status === 'uploading' && onCancelUpload && (
              <Button
                variant="outline"
                size="sm"
                className="mt-1 h-6 text-[10px] border-white/20 bg-white/10 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation()
                  onCancelUpload(project.id)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2">
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
            {formatDuration(preferredDurationMs(project))}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div
          className="flex items-start justify-between gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 flex-1 items-start gap-1">
            {editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={() => void commitCardTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitCardTitle()
                  }
                  if (e.key === 'Escape') {
                    setTitleValue(project.title)
                    setEditingTitle(false)
                  }
                }}
                className="line-clamp-2 min-w-0 flex-1 rounded border border-brand bg-background px-2 py-0.5 text-sm font-semibold leading-snug outline-none ring-2 ring-brand/30"
              />
            ) : (
              <>
                <h3 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug text-balance">
                  {project.title}
                </h3>
                {onRenameTitle && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Rename project"
                    title="Rename"
                    onClick={startRename}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
          <Badge variant={variant} className="shrink-0 gap-1">
            {icon}
            {label}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDuration(preferredDurationMs(project))}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {formatDate(project.uploadedAt)}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileVideo className="size-3 shrink-0" />
          <span className="truncate font-mono">{project.fileName}</span>
        </div>

        {projectErrorMessage ? (
          <Alert
            variant={project.status === 'error' ? 'destructive' : 'default'}
            className={cn(
              'mt-1 py-2 [&>svg]:size-3.5',
              project.status !== 'error' && 'border-amber-500/40 bg-amber-500/5 text-foreground',
            )}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <AlertCircle
              className={
                project.status === 'error' ? '' : 'text-amber-600 dark:text-amber-500'
              }
            />
            <AlertTitle className="text-xs font-medium">
              {projectErrorTitle}
            </AlertTitle>
            <AlertDescription className="text-xs leading-snug">{projectErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {mediaSummaryLine(project) && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">
            {mediaSummaryLine(project)}
          </p>
        )}

        {project.status === 'error' && project.fileUrl && project.mediaMetadata?.editKey && onStartTranscription && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="mt-2"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => {
                // Quick hack: reset status to awaiting_transcript so it can be transcribed
                onStartTranscription(project.id)
              }}
            >
              <Mic className="size-3.5" />
              Retry Transcription
            </Button>
          </div>
        )}

        {project.status === 'error' &&
          !projectHasPreparedEdit(project) &&
          (project.originalFileUrl || project.fileUrl) &&
          onRetryPrepare && (
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="mt-2"
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full gap-2 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                onClick={() => onRetryPrepare(project.id)}
              >
                <Sparkles className="size-3.5" />
                Retry Prepare
              </Button>
            </div>
          )}

        {project.status === 'awaiting_transcript' && onStartTranscription && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="mt-2"
          >
            <Button
              type="button"
              size="sm"
              className="w-full gap-2"
              onClick={() => onStartTranscription(project.id)}
            >
              <Mic className="size-3.5" />
              Transcribe with current settings
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Adjust options in <span className="font-medium text-foreground">Transcription Settings</span> above
              first if needed.
            </p>
          </div>
        )}

        {folderOptions && onMoveToFolder && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="mt-2"
          >
            <Select
              value={project.folderId ?? '__root__'}
              onValueChange={(v) => {
                const folderId = v === '__root__' ? null : v
                onMoveToFolder(project.id, folderId)
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Move to folder" />
              </SelectTrigger>
              <SelectContent>
                {folderOptions.map((o) => (
                  <SelectItem key={o.id ?? '__root__'} value={o.id ?? '__root__'}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {onDeleteMedia && project.status !== 'uploading' && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="mt-2"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete media
            </Button>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this media?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the file from your library and deletes stored video objects, transcripts,
                    and overlays. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => {
                      void (async () => {
                        setDeleting(true)
                        try {
                          await onDeleteMedia(project.id)
                          setDeleteOpen(false)
                        } finally {
                          setDeleting(false)
                        }
                      })()
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {canOpenInEditor && (
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-brand opacity-100 lg:opacity-0 transition-opacity lg:group-hover:opacity-100">
            {isReady ? 'Open in Editor' : 'Open preview in editor'}
            <ChevronRight className="size-3" />
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-5 py-32 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-muted/50 shadow-inner">
        <FileVideo className="size-10 text-muted-foreground/60" />
      </div>
      <div className="max-w-sm">
        <p className="text-lg font-semibold text-foreground tracking-tight">
          {hasFilter ? 'No matching projects found' : 'Your library is empty'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {hasFilter
            ? 'Try adjusting your search query or status filter to find what you are looking for.'
            : 'Upload your first video to get started. You can transcribe it, edit the text, and add overlays.'}
        </p>
      </div>
    </div>
  )
}

type BrowseFilter = { mode: 'all' } | { mode: 'folder'; folderId: string | null }

function mapApiMedia(
  p: VideoProject & {
    uploadedAt: string | Date
    prepareStartedAt?: string | Date | null
    prepareCompletedAt?: string | Date | null
  },
): VideoProject {
  return {
    ...p,
    uploadedAt: p.uploadedAt instanceof Date ? p.uploadedAt : new Date(p.uploadedAt as string),
    prepareStartedAt:
      p.prepareStartedAt == null
        ? null
        : p.prepareStartedAt instanceof Date
          ? p.prepareStartedAt
          : new Date(p.prepareStartedAt),
    prepareCompletedAt:
      p.prepareCompletedAt == null
        ? null
        : p.prepareCompletedAt instanceof Date
          ? p.prepareCompletedAt
          : new Date(p.prepareCompletedAt),
  }
}

async function extractLocalVideoPreview(
  file: File,
  id: string,
): Promise<{
  duration: number
  thumbnailUrl: string
  videoWidth: number
  videoHeight: number
}> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.src = objectUrl

  return new Promise((resolve) => {
    let duration = 0
    let thumbnailUrl = `https://picsum.photos/seed/${id}/640/360`
    let resolved = false
    let safetyTimeout: number

    const finish = (nextDuration: number, nextThumbnailUrl: string) => {
      if (resolved) return
      resolved = true
      const videoWidth = video.videoWidth || 0
      const videoHeight = video.videoHeight || 0
      window.clearTimeout(safetyTimeout)
      URL.revokeObjectURL(objectUrl)
      video.src = ''
      resolve({ duration: nextDuration, thumbnailUrl: nextThumbnailUrl, videoWidth, videoHeight })
    }

    safetyTimeout = window.setTimeout(() => finish(duration || 60000, thumbnailUrl), 10_000)

    video.onloadedmetadata = () => {
      const seconds = video.duration
      if (Number.isFinite(seconds) && seconds > 0) {
        duration = Math.round(seconds * 1000)
      }
    }

    video.onloadeddata = () => {
      const seconds = video.duration
      if (!Number.isFinite(seconds) || seconds <= 0) {
        finish(duration || 60000, thumbnailUrl)
        return
      }
      const seekTime = Math.min(1, Math.max(0, seconds - 0.1))
      video.currentTime = seekTime || 0
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth / 4
        canvas.height = video.videoHeight / 4
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
        thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7)
      } catch (error) {
        console.error('Failed to generate thumbnail', error)
      }
      finish(duration, thumbnailUrl)
    }

    video.onerror = () => finish(60000, thumbnailUrl)
  })
}

function folderPathOptions(folders: Folder[]): { id: string | null; label: string }[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  function pathFor(f: Folder): string {
    const parts: string[] = []
    let cur: Folder | undefined = f
    while (cur) {
      parts.unshift(cur.name)
      cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
    }
    return parts.join(' / ')
  }
  return [
    { id: null, label: 'Library root' },
    ...folders.map((f) => ({ id: f.id, label: pathFor(f) })),
  ]
}

function mergeLocalQueuedProjects(
  previousMedia: VideoProject[] | undefined,
  serverMedia: VideoProject[],
  queuedUploads: Map<string, { persisted: boolean }>,
): VideoProject[] {
  if (!previousMedia || previousMedia.length === 0) return serverMedia

  const serverIds = new Set(serverMedia.map((project) => project.id))
  const localOnlyQueued = previousMedia.filter((project) => {
    const queued = queuedUploads.get(project.id)
    return queued && !queued.persisted && !serverIds.has(project.id)
  })

  return [...localOnlyQueued, ...serverMedia]
}

function FolderTreeNode({
  folders,
  parentId,
  depth,
  browseFilter,
  setBrowseFilter,
  onDelete,
  canEditFolders,
}: {
  folders: Folder[]
  parentId: string | null
  depth: number
  browseFilter: BrowseFilter
  setBrowseFilter: (b: BrowseFilter) => void
  onDelete: (id: string) => void
  canEditFolders: boolean
}) {
  const children = folders.filter((f) =>
    parentId === null ? f.parentFolderId == null : f.parentFolderId === parentId,
  )
  return (
    <ul className={cn('space-y-0.5', depth > 0 && 'ml-2 border-l border-border pl-2')}>
      {children.map((f) => {
        const selected = browseFilter.mode === 'folder' && browseFilter.folderId === f.id
        return (
          <li key={f.id}>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  selected ? 'bg-brand/15 font-medium text-brand' : 'hover:bg-muted',
                )}
                onClick={() => setBrowseFilter({ mode: 'folder', folderId: f.id })}
              >
                <FolderIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{f.name}</span>
              </button>
              {canEditFolders && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(f.id)
                  }}
                  aria-label={`Delete folder ${f.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
            <FolderTreeNode
              folders={folders}
              parentId={f.id}
              depth={depth + 1}
              browseFilter={browseFilter}
              setBrowseFilter={setBrowseFilter}
              onDelete={onDelete}
              canEditFolders={canEditFolders}
            />
          </li>
        )
      })}
    </ul>
  )
}

type WorkspaceMemberRow = {
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  createdAt: string
  email?: string | null
  displayName?: string | null
  imageUrl?: string | null
}

type MemberSearchHit = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  displayName: string
}

type WorkspaceTreeData = {
  workspace: WorkspaceProject
  folders: Folder[]
  media: VideoProject[]
}

const FULL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

function looksLikeFullEmail(s: string): boolean {
  return FULL_EMAIL_RE.test(s.trim())
}

export function LibraryPageClient({
  initialWorkspaces,
  initialTree,
  initialMembers,
  initialBrowseFilter,
}: {
  initialWorkspaces: WorkspaceProject[]
  initialTree: WorkspaceTreeData | null
  initialMembers: WorkspaceMemberRow[]
  initialBrowseFilter: BrowseFilter
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wpId = searchParams.get('wp')
  const { user } = useUser()
  const authedFetch = useAuthedFetch()
  const { state, dispatch } = useApp()
  const uploadQueueRef = useRef(createConcurrencyQueue(2))
  const activeUploadsRef = useRef<Map<string, UploadHandle>>(new Map())
  const queuedUploadsRef = useRef<
    Map<string, { cancel: () => void; persisted: boolean; cancelled: boolean }>
  >(new Map())

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [workspaces, setWorkspaces] = useState<WorkspaceProject[]>(initialWorkspaces)
  const [tree, setTree] = useState<WorkspaceTreeData | null>(initialTree)
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>(initialBrowseFilter)

  useEffect(() => {
    dispatch({ type: 'SET_PROJECTS', projects: tree?.media ?? [] })
  }, [dispatch, tree])

  useEffect(() => {
    setWorkspaces(initialWorkspaces)
  }, [initialWorkspaces])

  useEffect(() => {
    setTree((prev) => {
      if (!initialTree) return null
      return {
        workspace: initialTree.workspace,
        folders: initialTree.folders,
        media: mergeLocalQueuedProjects(prev?.media, initialTree.media, queuedUploadsRef.current),
      }
    })
  }, [initialTree])

  useEffect(() => {
    setMembers(initialMembers)
  }, [initialMembers])

  useEffect(() => {
    setBrowseFilter(initialBrowseFilter)
  }, [initialBrowseFilter])

  useEffect(() => {
    if (!wpId) return
    const currentFolder = searchParams.get('folder')
    const nextFolder = browseFilter.mode === 'folder' ? browseFilter.folderId ?? 'root' : null
    if (currentFolder === nextFolder || (!currentFolder && nextFolder === null)) {
      return
    }
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextFolder === null) {
      nextParams.delete('folder')
    } else {
      nextParams.set('folder', nextFolder)
    }
    router.replace(`/?${nextParams.toString()}`)
  }, [browseFilter, router, searchParams, wpId])

  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const [members, setMembers] = useState<WorkspaceMemberRow[]>(initialMembers)
  const [inviteQuery, setInviteQuery] = useState('')
  const [debouncedInviteQuery, setDebouncedInviteQuery] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchHit[]>([])
  const [memberSearchLoading, setMemberSearchLoading] = useState(false)
  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteAdvancedOpen, setInviteAdvancedOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')

  const myMembership = useMemo(() => {
    if (!user?.id) return null
    return members.find((m) => m.userId === user.id) ?? null
  }, [members, user?.id])
  const isWorkspaceOwner = myMembership?.role === 'owner'
  const viewerLocked = myMembership !== null && myMembership.role === 'viewer'

  // Transcription Settings State
  const [speechModel, setSpeechModel] = useState<string>(DEFAULT_TRANSCRIPTION_OPTIONS.speechModel)
  const [speakerLabels, setSpeakerLabels] = useState(DEFAULT_TRANSCRIPTION_OPTIONS.speakerLabels)
  const [languageDetection, setLanguageDetection] = useState(DEFAULT_TRANSCRIPTION_OPTIONS.languageDetection)
  const [temperature, setTemperature] = useState([DEFAULT_TRANSCRIPTION_OPTIONS.temperature])
  const [keyterms, setKeyterms] = useState('')
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_TRANSCRIPTION_PROMPT)

  // Advanced Speaker State
  const [speakersExpected, setSpeakersExpected] = useState<string>('')
  const [minSpeakers, setMinSpeakers] = useState<string>('')
  const [maxSpeakers, setMaxSpeakers] = useState<string>('')
  const [knownSpeakers, setKnownSpeakers] = useState<string>('')
  const [redactPii, setRedactPii] = useState(false)
  const [autoTranscribe, setAutoTranscribe] = useState(false)

  const refreshServerData = useCallback(() => {
    router.refresh()
  }, [router])

  const transcriptionBusyRef = useRef<string | null>(null)
  const currentTranscriptionOptions = useCallback(
    (): TranscriptionRequestOptions =>
      normalizeTranscriptionOptions({
        speechModel: speechModel === 'fast' ? 'fast' : 'best',
        speakerLabels,
        languageDetection,
        temperature: temperature[0],
        keyterms,
        prompt: customPrompt,
        speakersExpected: speakersExpected ? parseInt(speakersExpected, 10) : undefined,
        minSpeakers: minSpeakers ? parseInt(minSpeakers, 10) : undefined,
        maxSpeakers: maxSpeakers ? parseInt(maxSpeakers, 10) : undefined,
        knownSpeakers,
        redactPii,
      }),
    [
      customPrompt,
      keyterms,
      knownSpeakers,
      languageDetection,
      maxSpeakers,
      minSpeakers,
      redactPii,
      speakerLabels,
      speakersExpected,
      speechModel,
      temperature,
    ],
  )

  const startTranscriptionForProject = useCallback(
    async (projectId: string) => {
      if (viewerLocked) {
        toast.error('Viewers cannot start transcription.')
        return
      }
      if (transcriptionBusyRef.current) return
      const proj = state.projects.find((p) => p.id === projectId) ?? tree?.media.find((p) => p.id === projectId)
      const canRetryTranscription = proj?.status === 'error' && proj.mediaMetadata?.editKey
      if (!proj || !proj.mediaMetadata?.editKey || (proj.status !== 'awaiting_transcript' && !canRetryTranscription)) {
        toast.error('That file is not waiting for transcription.')
        return
      }
      transcriptionBusyRef.current = projectId

      const revertToAwaiting = async (feedbackError?: string) => {
        await authedFetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'awaiting_transcript', transcriptionProgress: 0 }),
        }).catch(() => {})
        dispatch({
          type: 'UPDATE_PROJECT',
          id: projectId,
          updates: {
            status: 'awaiting_transcript',
            transcriptionProgress: 0,
            mediaStep: undefined,
            feedbackError,
          },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === projectId
                ? {
                    ...m,
                    status: 'awaiting_transcript',
                    transcriptionProgress: 0,
                    mediaStep: undefined,
                    feedbackError,
                  }
                : m,
            ),
          }
        })
      }

      try {
        dispatch({
          type: 'UPDATE_PROJECT',
          id: projectId,
          updates: {
            status: 'transcribing',
            transcriptionProgress: 50,
            mediaStep: 'transcribe',
            feedbackError: undefined,
          },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === projectId
                ? {
                    ...m,
                    status: 'transcribing',
                    transcriptionProgress: 50,
                    mediaStep: 'transcribe',
                    feedbackError: undefined,
                  }
                : m,
            ),
          }
        })

        const result = await runTranscriptionFlow({
          projectId,
          fetchImpl: authedFetch,
          options: currentTranscriptionOptions(),
          onProgress: (pct) => {
            dispatch({
              type: 'UPDATE_PROJECT',
              id: projectId,
              updates: { transcriptionProgress: pct, mediaStep: 'transcribe' },
            })
            setTree((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                media: prev.media.map((m) =>
                  m.id === projectId ? { ...m, transcriptionProgress: pct, mediaStep: 'transcribe' } : m,
                ),
              }
            })
          },
        })

        if (result.ok) {
          dispatch({
            type: 'UPDATE_PROJECT',
            id: projectId,
            updates: {
              status: 'ready',
              transcriptionProgress: 100,
              duration: result.duration,
              mediaStep: undefined,
              feedbackError: undefined,
            },
          })
          setTree((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              media: prev.media.map((m) =>
                m.id === projectId
                  ? {
                      ...m,
                      status: 'ready',
                      transcriptionProgress: 100,
                      duration: result.duration,
                      mediaStep: undefined,
                      feedbackError: undefined,
                    }
                  : m,
              ),
            }
          })
          refreshServerData()
          toast.success('Transcription complete', {
            description: 'Open the editor to review and edit.',
          })
          return
        }

        if (result.reason === 'aborted') {
          await revertToAwaiting()
          toast.message('Transcription check stopped', {
            description: 'Start again when you are ready.',
          })
          return
        }

        const failMsg = result.message
        await revertToAwaiting(failMsg)
        toast.error('Transcription did not complete', { description: failMsg, duration: 12_000 })
      } catch (err) {
        console.error('Transcription error:', err)
        const message =
          err instanceof Error ? err.message : 'Something went wrong during transcription.'
        await revertToAwaiting(message)
        toast.error('Transcription error', { description: message, duration: 10_000 })
      } finally {
        transcriptionBusyRef.current = null
      }
    },
    [
      viewerLocked,
      state.projects,
      tree,
      dispatch,
      refreshServerData,
      currentTranscriptionOptions,
      authedFetch,
    ],
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInviteQuery(inviteQuery), 300)
    return () => clearTimeout(t)
  }, [inviteQuery])

  useEffect(() => {
    if (!shareOpen || !wpId) {
      if (!shareOpen) {
        setMemberSearchResults([])
        setMemberSearchLoading(false)
      }
      return
    }
    if (!isWorkspaceOwner) {
      setMemberSearchResults([])
      setMemberSearchLoading(false)
      return
    }
    if (debouncedInviteQuery.trim().length < 2) {
      setMemberSearchResults([])
      setMemberSearchLoading(false)
      return
    }
    const ac = new AbortController()
    setMemberSearchLoading(true)
    void (async () => {
      try {
        const res = await authedFetch(
          `/api/workspace-projects/${wpId}/members/search?q=${encodeURIComponent(debouncedInviteQuery.trim())}`,
          { signal: ac.signal },
        )
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || 'Search failed')
        }
        const data = (await res.json()) as { users: MemberSearchHit[] }
        if (!ac.signal.aborted) setMemberSearchResults(data.users ?? [])
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (!ac.signal.aborted) {
          setMemberSearchResults([])
          toast.error(e instanceof Error ? e.message : 'Search failed.')
        }
      } finally {
        if (!ac.signal.aborted) setMemberSearchLoading(false)
      }
    })()
    return () => ac.abort()
  }, [debouncedInviteQuery, shareOpen, wpId, isWorkspaceOwner, authedFetch])

  const postAddMember = useCallback(
    async (body: Record<string, unknown>) => {
      if (!wpId) throw new Error('No workspace selected')
      const nextMembers = (await addWorkspaceMemberAction({
        workspaceId: wpId,
        userId: typeof body.userId === 'string' ? body.userId : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        role: inviteRole,
      })) as WorkspaceMemberRow[]
      toast.success('Member added.')
      setInviteQuery('')
      setDebouncedInviteQuery('')
      setMemberSearchResults([])
      setInviteUserId('')
      setMembers(nextMembers)
      refreshServerData()
    },
    [refreshServerData, wpId, inviteRole],
  )

  const inviteWorkspaceMemberByEmail = useCallback(
    async (email: string) => {
      const trimmed = email.trim()
      if (!wpId || !trimmed) return
      try {
        await postAddMember({ email: trimmed })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add member.')
      }
    },
    [wpId, postAddMember],
  )

  const inviteWorkspaceMemberFromSearchHit = useCallback(
    async (hit: MemberSearchHit) => {
      if (!wpId) return
      try {
        if (hit.email) {
          await postAddMember({ email: hit.email })
        } else {
          await postAddMember({ userId: hit.id })
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add member.')
      }
    },
    [wpId, postAddMember],
  )

  const inviteWorkspaceMemberByUserId = useCallback(async () => {
    if (!wpId || !inviteUserId.trim()) return
    try {
      await postAddMember({ userId: inviteUserId.trim() })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add member.')
    }
  }, [wpId, inviteUserId, postAddMember])

  const inviteWorkspaceMemberFromField = useCallback(async () => {
    const q = inviteQuery.trim()
    if (!q) {
      toast.error('Enter an email or pick someone from the list.')
      return
    }
    if (!looksLikeFullEmail(q)) {
      toast.error('Enter a complete email address, or choose a person from search results.')
      return
    }
    await inviteWorkspaceMemberByEmail(q)
  }, [inviteQuery, inviteWorkspaceMemberByEmail])

  const removeWorkspaceMember = useCallback(
    async (targetUserId: string) => {
      if (!wpId) return
      if (!confirm('Remove this person from the workspace?')) return
      try {
        const nextMembers = (await removeWorkspaceMemberAction(wpId, targetUserId)) as WorkspaceMemberRow[]
        toast.success('Member removed.')
        setMembers(nextMembers)
        refreshServerData()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not remove member.')
      }
    },
    [refreshServerData, wpId],
  )

  const changeMemberRole = useCallback(
    async (targetUserId: string, role: 'owner' | 'editor' | 'viewer') => {
      if (!wpId) return
      try {
        const nextMembers = (await updateWorkspaceMemberRoleAction(wpId, targetUserId, role)) as WorkspaceMemberRow[]
        toast.success('Role updated.')
        setMembers(nextMembers)
        refreshServerData()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not update role.')
      }
    },
    [refreshServerData, wpId],
  )

  // Background polling for stuck/ongoing jobs
  useEffect(() => {
    if (!tree || !wpId) return
    const hasBusy = tree.media.some(
      (m) =>
        m.status === 'uploading' ||
        m.status === 'transcribing' ||
        m.status === 'queued_prepare' ||
        m.status === 'preparing',
    )
    if (!hasBusy) return

    const interval = setInterval(() => {
      refreshServerData()
    }, 10000)
    return () => clearInterval(interval)
  }, [refreshServerData, tree, wpId])

  const addProjectLocally = useCallback(
    (project: VideoProject) => {
      dispatch({ type: 'ADD_PROJECT', project })
      setTree((prev) => {
        if (!prev) return prev
        return { ...prev, media: [project, ...prev.media] }
      })
    },
    [dispatch],
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
    [dispatch],
  )

  const removeProjectLocally = useCallback(
    (id: string) => {
      dispatch({ type: 'DELETE_PROJECT', id })
      setTree((prev) => {
        if (!prev) return prev
        return { ...prev, media: prev.media.filter((media) => media.id !== id) }
      })
    },
    [dispatch],
  )

  const cancelUpload = useCallback(async (id: string) => {
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
  }, [authedFetch, removeProjectLocally])

  const runQueuedUpload = useCallback(
    async (input: {
      file: File
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
            contentType: input.file.type,
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
            ...(input.transcriptionOptions
              ? { transcriptionOptions: input.transcriptionOptions }
              : {}),
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

        const clientCapture = buildClientMediaCapture(
          file,
          preview.videoWidth > 0 && preview.videoHeight > 0
            ? {
                videoWidth: preview.videoWidth,
                videoHeight: preview.videoHeight,
                durationMs: preview.duration,
              }
            : undefined,
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
          project,
          originalKey,
          clientCapture,
          transcriptionOptions: pendingAutoTranscriptionOptions,
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
    [addProjectLocally, browseFilter, runQueuedUpload, updateProjectLocally, wpId],
  )

  const retryPrepare = useCallback(
    async (projectId: string) => {
      const project =
        tree?.media.find((media) => media.id === projectId) ??
        state.projects.find((media) => media.id === projectId)
      if (!project) return
      if (!canRetryPrepare(project)) {
        toast.error('That file is not waiting for a preparation retry.')
        return
      }

      const originalKey = buildOriginalUploadKey(project.workspaceProjectId, project.id, project.fileName)
      updateProjectLocally(projectId, {
        status: 'queued_prepare',
        transcriptionProgress: 55,
        mediaStep: 'prepare',
        feedbackError: undefined,
        processingError: null,
      })

      try {
        const updated = await queueProjectPreparationAction({
          projectId,
          originalKey,
          ...(autoTranscribe ? { transcriptionOptions: currentTranscriptionOptions() } : {}),
        })
        updateProjectLocally(projectId, {
          status: updated.status,
          transcriptionProgress: updated.transcriptionProgress,
          fileUrl: updated.fileUrl,
          originalFileUrl: updated.originalFileUrl ?? null,
          playbackUrlRefreshedAt: updated.playbackUrlRefreshedAt ?? null,
          playbackUrlExpiresAt: updated.playbackUrlExpiresAt ?? null,
          mediaMetadata: updated.mediaMetadata ?? null,
          processingError: updated.processingError ?? null,
        })
        toast.success('Preparation retry queued.')
      } catch (error) {
        updateProjectLocally(projectId, {
          status: 'error',
          mediaStep: undefined,
        })
        toast.error(error instanceof Error ? error.message : 'Could not queue the preparation retry.', {
          duration: 8000,
        })
      }
    },
    [
      autoTranscribe,
      currentTranscriptionOptions,
      state.projects,
      tree,
      updateProjectLocally,
    ],
  )

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!wpId) {
        toast.error('Open or create a workspace before uploading.')
        return
      }
      if (myMembership?.role === 'viewer') {
        toast.error('Viewers cannot upload media.')
        return
      }

      const validFiles = files.filter(f => f.type.startsWith('video/'))
      if (validFiles.length === 0) {
        toast.error('Please upload video files only.')
        return
      }
      if (validFiles.length < files.length) {
        toast.warning(`Skipped ${files.length - validFiles.length} non-video files.`)
      }

      if (validFiles.length > 1) {
        toast.info(`Preparing ${validFiles.length} uploads...`)
      } else {
        toast.info('Preparing upload...')
      }

      const pendingAutoTranscriptionOptions = autoTranscribe ? currentTranscriptionOptions() : null

      validFiles.forEach((file) => {
        void queueSingleFile(file, pendingAutoTranscriptionOptions)
      })
    },
    [autoTranscribe, currentTranscriptionOptions, myMembership?.role, queueSingleFile, wpId],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files?.length > 0) {
        handleFiles(Array.from(e.dataTransfer.files))
      }
    },
    [handleFiles],
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        handleFiles(Array.from(e.target.files))
      }
      e.target.value = ''
    },
    [handleFiles],
  )

  const handleOpen = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_ACTIVE_PROJECT', id })
      router.push(`/editor/${id}`)
    },
    [dispatch, router],
  )

  const folderOpts = tree ? folderPathOptions(tree.folders) : []

  const filteredMedia = useMemo(() => {
    if (!tree) return []
    let list = tree.media
    if (browseFilter.mode === 'folder') {
      const fid = browseFilter.folderId
      list = list.filter((m) => (fid === null ? m.folderId == null : m.folderId === fid))
    }
    return list.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.fileName.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [tree, browseFilter, search, statusFilter])

  const moveMediaToFolder = useCallback(
    async (mediaId: string, folderId: string | null) => {
      try {
        const updated = await moveMediaToFolderAction(mediaId, folderId)
        updateProjectLocally(mediaId, { folderId: updated.folderId })
        refreshServerData()
        toast.success('Media moved.')
      } catch {
        toast.error('Could not move media.')
      }
    },
    [refreshServerData, updateProjectLocally],
  )

  const renameMediaProject = useCallback(
    async (mediaId: string, title: string) => {
      try {
        const updated = await renameProjectAction(mediaId, title)
        dispatch({ type: 'UPDATE_PROJECT', id: mediaId, updates: { title: updated.title } })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((media) =>
              media.id === mediaId ? { ...media, title: updated.title } : media,
            ),
          }
        })
        refreshServerData()
        toast.success('Project renamed.')
      } catch {
        toast.error('Could not rename.')
        throw new Error('rename failed')
      }
    },
    [dispatch, refreshServerData],
  )

  const deleteMediaProject = useCallback(
    async (mediaId: string) => {
      try {
        await deleteProjectAction(mediaId)
        dispatch({ type: 'DELETE_PROJECT', id: mediaId })
        setTree((prev) => {
          if (!prev) return prev
          return { ...prev, media: prev.media.filter((m) => m.id !== mediaId) }
        })
        refreshServerData()
        toast.success('Media deleted.')
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Could not delete media.'
        toast.error(msg)
        throw new Error(msg)
      }
    },
    [dispatch, refreshServerData],
  )

  const createWorkspace = useCallback(async () => {
    try {
      const w = await createWorkspaceProjectAction('New project')
      setWorkspaces((prev) => [{ ...w, createdAt: new Date(w.createdAt) }, ...prev])
      router.push(`/?wp=${w.id}`)
    } catch {
      toast.error('Could not create workspace.')
    }
  }, [router])

  const deleteFolderById = useCallback(
    async (folderId: string) => {
      if (!confirm('Delete this folder? Subfolders are removed; files move to library root.')) return
      try {
        await deleteFolderAction(folderId)
        setBrowseFilter({ mode: 'all' })
        refreshServerData()
        toast.success('Folder deleted.')
      } catch {
        toast.error('Could not delete folder.')
      }
    },
    [refreshServerData],
  )

  const submitNewFolder = useCallback(async () => {
    if (!wpId || !newFolderName.trim()) return
    try {
      await createFolderAction({
        workspaceProjectId: wpId,
        parentFolderId: newFolderParentId,
        name: newFolderName.trim(),
      })
      setNewFolderName('')
      setFolderDialogOpen(false)
      refreshServerData()
      toast.success('Folder created.')
    } catch {
      toast.error('Could not create folder.')
    }
  }, [newFolderName, newFolderParentId, refreshServerData, wpId])

  const hasFilter = search.length > 0 || statusFilter !== 'all'

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--color-brand)_14%,transparent),transparent_62%)]" />
      <LibraryHeader
        hasWorkspace={Boolean(wpId)}
        viewerLocked={viewerLocked}
        onBack={() => router.push('/')}
        onCreateWorkspace={() => void createWorkspace()}
        onOpenPeople={() => setShareOpen(true)}
        onOpenUpload={() => fileInputRef.current?.click()}
      />

      {!wpId ? (
        <WorkspaceList
          workspaces={workspaces}
          onCreateWorkspace={() => void createWorkspace()}
          onOpenWorkspace={(workspaceId) => router.push(`/?wp=${workspaceId}`)}
        />
      ) : (
        <div className="relative flex min-h-0 flex-1 px-3 pb-4 sm:px-5">
          <aside className="hidden w-72 shrink-0 lg:flex lg:flex-col">
            <div className="sticky top-24 overflow-hidden rounded-[1.8rem] border border-white/60 bg-white/72 shadow-[0_24px_64px_-46px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="border-b border-border/60 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
              <p className="mt-1 truncate text-lg font-semibold tracking-tight" title={tree?.workspace.name}>
                {tree?.workspace.name ?? 'Workspace'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    browseFilter.mode === 'all' ? 'bg-brand/15 font-medium text-brand' : 'hover:bg-muted/70',
                  )}
                  onClick={() => setBrowseFilter({ mode: 'all' })}
                >
                  All media
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    browseFilter.mode === 'folder' && browseFilter.folderId === null
                      ? 'bg-brand/15 font-medium text-brand'
                      : 'hover:bg-muted/70',
                  )}
                  onClick={() => setBrowseFilter({ mode: 'folder', folderId: null })}
                >
                  Library root
                </button>
              </div>
              <div className="mt-3 border-t border-border/60 pt-3">
                <FolderTreeNode
                  folders={tree?.folders ?? []}
                  parentId={null}
                  depth={0}
                  browseFilter={browseFilter}
                  setBrowseFilter={setBrowseFilter}
                  onDelete={deleteFolderById}
                  canEditFolders={!viewerLocked}
                />
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-start gap-2 rounded-xl border-white/60 bg-background/80 text-xs"
                  disabled={viewerLocked}
                  onClick={() => {
                    setNewFolderParentId(null)
                    setNewFolderName('')
                    setFolderDialogOpen(true)
                  }}
                >
                  <FolderPlus className="size-3.5" />
                  New folder
                </Button>
                {browseFilter.mode === 'folder' && browseFilter.folderId != null && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 w-full justify-start gap-2 rounded-xl text-xs"
                    disabled={viewerLocked}
                    onClick={() => {
                      setNewFolderParentId(browseFilter.folderId)
                      setNewFolderName('')
                      setFolderDialogOpen(true)
                    }}
                  >
                    <FolderPlus className="size-3.5" />
                    Subfolder here
                  </Button>
                )}
              </div>
            </div>
            </div>
          </aside>
          <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mb-6 rounded-[1.5rem] border border-white/60 bg-white/72 p-4 shadow-[0_22px_56px_-46px_rgba(0,0,0,0.5)] lg:hidden">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Browse</Label>
            <Select
              value={
                browseFilter.mode === 'all'
                  ? '__all__'
                  : browseFilter.folderId === null
                    ? '__root__'
                    : browseFilter.folderId
              }
              onValueChange={(v) => {
                if (v === '__all__') setBrowseFilter({ mode: 'all' })
                else if (v === '__root__') setBrowseFilter({ mode: 'folder', folderId: null })
                else setBrowseFilter({ mode: 'folder', folderId: v })
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All media</SelectItem>
                <SelectItem value="__root__">Library root</SelectItem>
                {(tree?.folders ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Mobile folder actions */}
          {!viewerLocked && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="mb-px shrink-0 border-white/60 bg-background/80">
                  <FolderPlus className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setNewFolderParentId(null)
                  setNewFolderName('')
                  setFolderDialogOpen(true)
                }}>
                  <FolderPlus className="mr-2 size-4" />
                  New folder
                </DropdownMenuItem>
                {browseFilter.mode === 'folder' && browseFilter.folderId != null && (
                  <DropdownMenuItem onClick={() => {
                    setNewFolderParentId(browseFilter.folderId)
                    setNewFolderName('')
                    setFolderDialogOpen(true)
                  }}>
                    <FolderPlus className="mr-2 size-4" />
                    Subfolder here
                  </DropdownMenuItem>
                )}
                {browseFilter.mode === 'folder' && browseFilter.folderId != null && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive"
                      onClick={() => deleteFolderById(browseFilter.folderId!)}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete folder
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        </div>
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand/80">Editorial Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Video Library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Upload media, tune transcription options, then start AssemblyAI from each file when you are ready.
          </p>
        </div>

        <LibraryUploadDropzone
          disabled={viewerLocked}
          isDragOver={isDragOver}
          onDragOver={(e) => {
            e.preventDefault()
            if (!viewerLocked) setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={
            viewerLocked
              ? (e) => {
                  e.preventDefault()
                  setIsDragOver(false)
                }
              : onDrop
          }
          onBrowse={() => fileInputRef.current?.click()}
        />

        <TranscriptionSettingsPanel
          speechModel={speechModel}
          setSpeechModel={setSpeechModel}
          speakerLabels={speakerLabels}
          setSpeakerLabels={setSpeakerLabels}
          languageDetection={languageDetection}
          setLanguageDetection={setLanguageDetection}
          temperature={temperature}
          setTemperature={setTemperature}
          keyterms={keyterms}
          setKeyterms={setKeyterms}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          speakersExpected={speakersExpected}
          setSpeakersExpected={setSpeakersExpected}
          minSpeakers={minSpeakers}
          setMinSpeakers={setMinSpeakers}
          maxSpeakers={maxSpeakers}
          setMaxSpeakers={setMaxSpeakers}
          knownSpeakers={knownSpeakers}
          setKnownSpeakers={setKnownSpeakers}
          redactPii={redactPii}
          setRedactPii={setRedactPii}
          autoTranscribe={autoTranscribe}
          setAutoTranscribe={setAutoTranscribe}
          onResetRecommended={() => {
            setSpeechModel(DEFAULT_TRANSCRIPTION_OPTIONS.speechModel)
            setSpeakerLabels(DEFAULT_TRANSCRIPTION_OPTIONS.speakerLabels)
            setLanguageDetection(DEFAULT_TRANSCRIPTION_OPTIONS.languageDetection)
            setTemperature([DEFAULT_TRANSCRIPTION_OPTIONS.temperature])
            setKeyterms(DEFAULT_TRANSCRIPTION_OPTIONS.keyterms ?? '')
            setCustomPrompt(DEFAULT_TRANSCRIPTION_PROMPT)
            setSpeakersExpected('')
            setMinSpeakers('')
            setMaxSpeakers('')
            setKnownSpeakers(DEFAULT_TRANSCRIPTION_OPTIONS.knownSpeakers ?? '')
            setRedactPii(DEFAULT_TRANSCRIPTION_OPTIONS.redactPii ?? false)
          }}
        />

        {/* Search & filter */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-white/60 bg-white/72 p-4 shadow-[0_22px_56px_-46px_rgba(0,0,0,0.45)]">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-white/60 bg-background/80 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 border-white/60 bg-background/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="awaiting_transcript">Needs transcript</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="queued_prepare">Queued for prep</SelectItem>
                <SelectItem value="transcribing">Transcribing</SelectItem>
                <SelectItem value="uploading">Uploading</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredMedia.length} file{filteredMedia.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Project grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMedia.length === 0 ? (
            <EmptyState hasFilter={hasFilter} />
          ) : (
            filteredMedia.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpen}
                folderOptions={folderOpts}
                onMoveToFolder={viewerLocked ? undefined : moveMediaToFolder}
                onRenameTitle={viewerLocked ? undefined : renameMediaProject}
                onStartTranscription={viewerLocked ? undefined : startTranscriptionForProject}
                onRetryPrepare={viewerLocked ? undefined : retryPrepare}
                onCancelUpload={viewerLocked ? undefined : cancelUpload}
                onDeleteMedia={viewerLocked ? undefined : deleteMediaProject}
              />
            ))
          )}
        </div>
          </main>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={onFileChange}
      />

      <WorkspacePeopleDialog
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open)
          if (!open) {
            setInviteQuery('')
            setDebouncedInviteQuery('')
            setMemberSearchResults([])
            setInviteUserId('')
            setInviteAdvancedOpen(false)
          }
        }}
        members={members}
        currentUserId={user?.id}
        isWorkspaceOwner={isWorkspaceOwner}
        inviteQuery={inviteQuery}
        setInviteQuery={setInviteQuery}
        memberSearchLoading={memberSearchLoading}
        memberSearchResults={memberSearchResults}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        inviteAdvancedOpen={inviteAdvancedOpen}
        setInviteAdvancedOpen={setInviteAdvancedOpen}
        inviteUserId={inviteUserId}
        setInviteUserId={setInviteUserId}
        onInviteFromSearch={(hit) => void inviteWorkspaceMemberFromSearchHit(hit)}
        onInviteByEmail={() => void inviteWorkspaceMemberFromField()}
        onInviteByUserId={() => void inviteWorkspaceMemberByUserId()}
        onChangeMemberRole={(memberUserId, role) => void changeMemberRole(memberUserId, role)}
        onRemoveMember={(memberUserId) => void removeWorkspaceMember(memberUserId)}
      />

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-2">
              <Label>Inside</Label>
              <Select
                value={newFolderParentId ?? '__root__'}
                onValueChange={(v) => setNewFolderParentId(v === '__root__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Parent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">Library root</SelectItem>
                  {(tree?.folders ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Name</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewFolder()
                }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitNewFolder()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
