'use client'

import { memo, useState } from 'react'
import { toast } from 'sonner'
import {
  Play,
  Clock,
  Calendar,
  FileVideo,
  Loader2,
  CheckCircle,
  XCircle,
  Sparkles,
  ChevronRight,
  Trash2,
  Pencil,
  Mic,
  AlertCircle,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { VideoProject, ProjectStatus } from '@/lib/types'
import { formatDateShort } from '@/lib/format-date'
import { formatDataSize, formatDurationMs, formatEtaSeconds, formatTransferSpeed } from '@/lib/format-media'
import { mediaSummaryLine, preferredDurationMs } from '@/lib/media-metadata'
import { canRetryPrepare, isPrepareBusyStatus, projectHasPreparedEdit } from '@/lib/project-prepare'
import { cn } from '@/lib/utils'
import { ProjectSpeakerRosterEditor } from '@/components/project-speaker-roster-editor'
import type { TranscriptionRequestOptions } from '@/lib/transcription-options'

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

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }
> = {
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

export type LibraryProjectCardProps = {
  project: VideoProject
  onOpen: (id: string) => void
  folderOptions?: { id: string | null; label: string }[]
  onMoveToFolder?: (mediaId: string, folderId: string | null) => void
  onRenameTitle?: (mediaId: string, title: string) => Promise<void>
  onStartTranscription?: (mediaId: string) => void
  onRetryPrepare?: (mediaId: string) => void
  onCancelUpload?: (mediaId: string) => void
  onDeleteMedia?: (mediaId: string) => Promise<void>
  /** Baseline library transcription options when merging per-file speaker roster. */
  getTranscriptionOptionsForRoster?: () => TranscriptionRequestOptions
  onSavePerFileTranscription?: (mediaId: string, options: TranscriptionRequestOptions) => Promise<void>
}

function LibraryProjectCardInner({
  project,
  onOpen,
  folderOptions,
  onMoveToFolder,
  onRenameTitle,
  onStartTranscription,
  onRetryPrepare,
  onCancelUpload,
  onDeleteMedia,
  getTranscriptionOptionsForRoster,
  onSavePerFileTranscription,
}: LibraryProjectCardProps) {
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

  const dur = preferredDurationMs(project)

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
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <img
          src={project.thumbnailUrl}
          alt={project.title}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {canOpenInEditor && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-100 lg:opacity-0 transition-opacity duration-200 lg:group-hover:opacity-100">
            <div className="flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg">
              <Play className="size-6 translate-x-0.5" />
            </div>
          </div>
        )}
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
        <div className="absolute bottom-2 right-2">
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
            {formatDurationMs(dur)}
          </span>
        </div>
      </div>

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
            {formatDurationMs(dur)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {formatDateShort(project.uploadedAt)}
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
              className={project.status === 'error' ? '' : 'text-amber-600 dark:text-amber-500'}
            />
            <AlertTitle className="text-xs font-medium">{projectErrorTitle}</AlertTitle>
            <AlertDescription className="text-xs leading-snug">{projectErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        {mediaSummaryLine(project) && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">
            {mediaSummaryLine(project)}
          </p>
        )}

        {getTranscriptionOptionsForRoster &&
          onSavePerFileTranscription &&
          (project.status === 'queued_prepare' ||
            project.status === 'preparing' ||
            project.status === 'awaiting_transcript') && (
            <ProjectSpeakerRosterEditor
              projectId={project.id}
              pendingOptions={project.pendingAutoTranscriptionOptions}
              getBaselineOptions={getTranscriptionOptionsForRoster}
              onSave={(opts) => onSavePerFileTranscription(project.id, opts)}
            />
          )}

        {project.status === 'error' &&
          project.fileUrl &&
          project.mediaMetadata?.editKey &&
          onStartTranscription && (
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
              Uses <span className="font-medium text-foreground">People in this video</span> on this card if you saved
              one; otherwise the library <span className="font-medium text-foreground">Transcription Settings</span>{' '}
              above.
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
                    This removes the file from your library and deletes stored video objects, transcripts, and
                    overlays. This cannot be undone.
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

export const LibraryProjectCard = memo(LibraryProjectCardInner)
