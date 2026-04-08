'use client'

import { useUser, UserButton, SignInButton, SignUpButton, Show } from '@clerk/nextjs'
import { useAuthedFetch } from '@/lib/authed-fetch'
import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react'
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
  ArrowLeft,
  Folder as FolderIcon,
  FolderPlus,
  Trash2,
  Users,
  Menu,
  Pencil,
  Mic,
  AlertCircle,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useApp } from '@/lib/app-context'
import type { VideoProject, ProjectStatus, WorkspaceProject, Folder } from '@/lib/types'
import { errorMessageFromResponse, friendlyHttpMessage } from '@/lib/api-error-message'
import {
  mediaSummaryLine,
  preferredDurationMs,
  type StoredMediaMetadata,
} from '@/lib/media-metadata'
import { buildClientMediaCapture } from '@/lib/client-media-capture'
import { buildOriginalUploadKey } from '@/lib/media-keys'
import { runTranscriptionFlow } from '@/lib/transcription-client'
import {
  DEFAULT_TRANSCRIPTION_OPTIONS,
  DEFAULT_TRANSCRIPTION_PROMPT,
} from '@/lib/transcription-options'
import { cn } from '@/lib/utils'

type UploadHandle = {
  abort: () => void
}

type SingleUploadPlan = {
  uploadType: 'single'
  signedUrl: string
  url: string | null
  thresholdBytes: number
}

type MultipartUploadPlan = {
  uploadType: 'multipart'
  uploadId: string
  partSize: number
  maxParallelParts: number
  parts: Array<{ partNumber: number; signedUrl: string }>
  url: string | null
  thresholdBytes: number
}

type UploadPlan = SingleUploadPlan | MultipartUploadPlan

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
  onCancelUpload,
  onDeleteMedia,
}: {
  project: VideoProject
  onOpen: (id: string) => void
  folderOptions?: { id: string | null; label: string }[]
  onMoveToFolder?: (mediaId: string, folderId: string | null) => void
  onRenameTitle?: (mediaId: string, title: string) => Promise<void>
  onStartTranscription?: (mediaId: string) => void
  onCancelUpload?: (mediaId: string) => void
  onDeleteMedia?: (mediaId: string) => Promise<void>
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { label, variant, icon } = STATUS_CONFIG[project.status]
  const isReady = project.status === 'ready'
  const canOpenInEditor =
    project.status === 'ready' || project.status === 'awaiting_transcript' || Boolean(project.fileUrl)
  const isProcessing = project.status === 'uploading' || project.status === 'transcribing'

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
              {project.uploadProgress
                ? 'Step 1 of 3: Uploading to vault…'
                : project.mediaStep === 'prepare' ||
                    (project.status === 'transcribing' && !project.mediaMetadata?.editKey)
                  ? 'Step 2 of 3: Preparing editor MP4…'
                  : project.mediaStep === 'transcribe'
                    ? 'Step 3 of 3: Transcribing with AssemblyAI…'
                    : 'Processing…'}
            </span>
            {project.uploadProgress ? (
              <VaultUploadStats up={project.uploadProgress} />
            ) : null}
            <div className="w-44 max-w-full">
              <Progress value={project.transcriptionProgress} className="h-1.5" />
            </div>
            <span className="text-xs text-white/70 tabular-nums">{project.transcriptionProgress}%</span>
            
            {project.status === 'uploading' && project.uploadProgress && onCancelUpload && (
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

        {project.feedbackError ? (
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
              {project.status === 'error' ? 'Something went wrong' : 'Could not finish transcription'}
            </AlertTitle>
            <AlertDescription className="text-xs leading-snug">{project.feedbackError}</AlertDescription>
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

function mapApiMedia(p: VideoProject & { uploadedAt: string | Date }): VideoProject {
  return {
    ...p,
    uploadedAt: p.uploadedAt instanceof Date ? p.uploadedAt : new Date(p.uploadedAt as string),
  }
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

const FULL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

function looksLikeFullEmail(s: string): boolean {
  return FULL_EMAIL_RE.test(s.trim())
}

function LibraryPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wpId = searchParams.get('wp')
  const { user } = useUser()
  const authedFetch = useAuthedFetch()
  const { state, dispatch } = useApp()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [workspaces, setWorkspaces] = useState<WorkspaceProject[]>([])
  const [tree, setTree] = useState<{
    workspace: WorkspaceProject
    folders: Folder[]
    media: VideoProject[]
  } | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const folderId = urlParams.get('folder')
      if (folderId) {
        return { mode: 'folder', folderId: folderId === 'root' ? null : folderId }
      }
    }
    return { mode: 'all' }
  })

  // Update URL when browseFilter changes
  useEffect(() => {
    if (!wpId) return
    const url = new URL(window.location.href)
    if (browseFilter.mode === 'folder') {
      url.searchParams.set('folder', browseFilter.folderId ?? 'root')
    } else {
      url.searchParams.delete('folder')
    }
    window.history.replaceState({}, '', url.toString())
  }, [browseFilter, wpId])

  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
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

  const refetchTree = useCallback(async () => {
    if (!wpId) return
    try {
      const res = await authedFetch(`/api/workspace-projects/${wpId}/tree`)
      if (!res.ok) return
      const data = await res.json()
      setTree({
        workspace: {
          ...data.workspace,
          createdAt: new Date(data.workspace.createdAt),
        },
        folders: data.folders,
        media: (data.media as (VideoProject & { uploadedAt: string })[]).map(mapApiMedia),
      })
    } catch (e) {
      console.error(e)
    }
  }, [wpId, authedFetch])

  const transcriptionBusyRef = useRef<string | null>(null)

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

        const patchRes = await authedFetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'transcribing', transcriptionProgress: 50 }),
        })
        if (!patchRes.ok) {
          const msg = await errorMessageFromResponse(patchRes, 'Could not update project status.')
          await revertToAwaiting(msg)
          toast.error('Could not start transcription', { description: msg, duration: 9000 })
          return
        }

        const result = await runTranscriptionFlow({
          projectId,
          fetchImpl: authedFetch,
          options: {
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
          },
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
          await refetchTree()
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
      refetchTree,
      speechModel,
      speakerLabels,
      languageDetection,
      temperature,
      keyterms,
      customPrompt,
      speakersExpected,
      minSpeakers,
      maxSpeakers,
      knownSpeakers,
      redactPii,
      authedFetch,
    ],
  )

  const fetchWorkspaceMembers = useCallback(async () => {
    if (!wpId) return
    setMembersLoading(true)
    try {
      const res = await authedFetch(`/api/workspace-projects/${wpId}/members`)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as WorkspaceMemberRow[]
      setMembers(data)
    } catch {
      toast.error('Could not load workspace members.')
    } finally {
      setMembersLoading(false)
    }
  }, [wpId, authedFetch])

  useEffect(() => {
    if (!wpId) {
      setMembers([])
      return
    }
    void fetchWorkspaceMembers()
  }, [wpId, fetchWorkspaceMembers])

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
      const res = await authedFetch(`/api/workspace-projects/${wpId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, role: inviteRole }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || 'Request failed')
      }
      toast.success('Member added.')
      setInviteQuery('')
      setDebouncedInviteQuery('')
      setMemberSearchResults([])
      setInviteUserId('')
      await fetchWorkspaceMembers()
    },
    [wpId, inviteRole, fetchWorkspaceMembers, authedFetch],
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
        const res = await authedFetch(
          `/api/workspace-projects/${wpId}/members/${encodeURIComponent(targetUserId)}`,
          { method: 'DELETE' },
        )
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || 'Request failed')
        }
        toast.success('Member removed.')
        await fetchWorkspaceMembers()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not remove member.')
      }
    },
    [wpId, fetchWorkspaceMembers, authedFetch],
  )

  const changeMemberRole = useCallback(
    async (targetUserId: string, role: 'owner' | 'editor' | 'viewer') => {
      if (!wpId) return
      try {
        const res = await authedFetch(
          `/api/workspace-projects/${wpId}/members/${encodeURIComponent(targetUserId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role }),
          },
        )
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || 'Request failed')
        }
        toast.success('Role updated.')
        await fetchWorkspaceMembers()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not update role.')
      }
    },
    [wpId, fetchWorkspaceMembers, authedFetch],
  )

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const res = await authedFetch('/api/workspace-projects')
        if (res.ok) {
          const data = await res.json()
          setWorkspaces(
            data.map((w: WorkspaceProject & { createdAt: string }) => ({
              ...w,
              createdAt: new Date(w.createdAt),
            })),
          )
        }
      } catch (err) {
        console.error('Failed to load workspaces:', err)
        toast.error('Could not connect to the evidence vault.')
      }
    }
    loadWorkspaces()
  }, [authedFetch])

  useEffect(() => {
    if (!wpId) {
      setTree(null)
      setBrowseFilter({ mode: 'all' })
      return
    }
    let cancelled = false
    async function load() {
      setTreeLoading(true)
      try {
        const res = await authedFetch(`/api/workspace-projects/${wpId}/tree`)
        if (!res.ok) {
          toast.error('Workspace not found')
          router.replace('/')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setTree({
          workspace: {
            ...data.workspace,
            createdAt: new Date(data.workspace.createdAt),
          },
          folders: data.folders,
          media: (data.media as (VideoProject & { uploadedAt: string })[]).map(mapApiMedia),
        })
      } catch (e) {
        console.error(e)
        toast.error('Failed to load workspace.')
      } finally {
        if (!cancelled) setTreeLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [wpId, router, authedFetch])

  // Background polling for stuck/ongoing jobs
  useEffect(() => {
    if (!tree || !wpId) return
    const hasBusy = tree.media.some(m => m.status === 'uploading' || m.status === 'transcribing')
    if (!hasBusy) return

    const interval = setInterval(() => {
      void refetchTree()
    }, 10000)
    return () => clearInterval(interval)
  }, [tree, wpId, refetchTree])

  const activeUploadsRef = useRef<Map<string, UploadHandle>>(new Map())

  const cancelUpload = useCallback(async (id: string) => {
    const xhr = activeUploadsRef.current.get(id)
    if (xhr) {
      xhr.abort()
      activeUploadsRef.current.delete(id)
    }
    
    // Remove from local state
    dispatch({ type: 'DELETE_PROJECT', id })
    setTree((prev) => {
      if (!prev) return prev
      return { ...prev, media: prev.media.filter((m) => m.id !== id) }
    })

    // Try to delete from DB
    try {
      await authedFetch(`/api/projects/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Failed to delete cancelled project from db', e)
    }
  }, [dispatch, authedFetch])

  const processSingleFile = useCallback(
    async (file: File) => {
      if (!wpId) return

      const targetFolderId = browseFilter.mode === 'folder' ? browseFilter.folderId : null

      const id = `proj-${crypto.randomUUID()}`
      const originalKey = buildOriginalUploadKey(wpId, id, file.name)
      const objectUrl = URL.createObjectURL(file)

      // Start presign in parallel
      const presignPromise = authedFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceProjectId: wpId,
          filename: originalKey,
          contentType: file.type,
          fileSize: file.size,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const msg = await errorMessageFromResponse(res, 'Failed to get upload URL.')
          throw new Error(msg)
        }
        return res.json() as Promise<UploadPlan>
      })

      // Initialize video element for metadata & thumbnail
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = objectUrl

      // Capture duration, thumbnail, and intrinsic video dimensions (helps correlate with ffprobe / device)
      const { duration, thumbnailUrl, videoWidth, videoHeight } = await new Promise<{
        duration: number
        thumbnailUrl: string
        videoWidth: number
        videoHeight: number
      }>((resolve) => {
        let duration = 0
        let thumb = `https://picsum.photos/seed/${id}/640/360`
        let resolved = false
        let safetyTimeout: number

        const finish = (d: number, t: string) => {
          if (resolved) return
          resolved = true
          const vw = video.videoWidth || 0
          const vh = video.videoHeight || 0
          window.clearTimeout(safetyTimeout)
          URL.revokeObjectURL(objectUrl)
          video.src = ''
          resolve({ duration: d, thumbnailUrl: t, videoWidth: vw, videoHeight: vh })
        }

        safetyTimeout = window.setTimeout(() => finish(duration || 60000, thumb), 10_000)

        video.onloadedmetadata = () => {
          const sec = video.duration
          if (Number.isFinite(sec) && sec > 0) {
            duration = Math.round(sec * 1000)
          }
        }

        video.onloadeddata = () => {
          const sec = video.duration
          if (!Number.isFinite(sec) || sec <= 0) {
            finish(duration || 60000, thumb)
            return
          }
          const seekTime = Math.min(1, Math.max(0, sec - 0.1))
          video.currentTime = seekTime || 0
        }

        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            canvas.width = video.videoWidth / 4
            canvas.height = video.videoHeight / 4
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
            thumb = canvas.toDataURL('image/jpeg', 0.7)
          } catch (e) {
            console.error('Failed to generate thumbnail', e)
          }
          finish(duration, thumb)
        }

        video.onerror = () => finish(60000, thumb)
      })

      let presignData: UploadPlan
      try {
        presignData = await presignPromise
      } catch (e) {
        console.error('Presign error:', e)
        toast.error(
          e instanceof Error ? e.message : 'Failed to generate secure upload link.',
          { duration: 8000 },
        )
        return
      }
      const clientCapture = buildClientMediaCapture(
        file,
        videoWidth > 0 && videoHeight > 0
          ? { videoWidth, videoHeight, durationMs: duration }
          : undefined,
      )

      const updateUploadProgress = (loaded: number, total: number, uploadStartedAt: number) => {
        if (!Number.isFinite(total) || total <= 0) return
        const elapsedSec = Math.max((performance.now() - uploadStartedAt) / 1000, 0.05)
        const speedBps = loaded / elapsedSec
        const percent = Math.round((loaded / total) * 40) + 10 // 10% to 50%
        const uploadProgress = {
          loaded,
          total,
          speedBps,
        }
        dispatch({
          type: 'UPDATE_PROJECT',
          id,
          updates: { transcriptionProgress: percent, uploadProgress, mediaStep: 'upload' },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === id
                ? { ...m, transcriptionProgress: percent, uploadProgress, mediaStep: 'upload' }
                : m,
            ),
          }
        })
      }

      const newProject: VideoProject = {
        id,
        title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        fileName: file.name,
        duration,
        uploadedAt: new Date(),
        status: 'uploading',
        thumbnailUrl,
        fileUrl: null,
        transcriptionProgress: 0,
        workspaceProjectId: wpId,
        folderId: targetFolderId,
      }

      dispatch({ type: 'ADD_PROJECT', project: newProject })
      setTree((prev) => {
        if (!prev) return prev
        return { ...prev, media: [newProject, ...prev.media] }
      })

      try {
        const insertRes = await authedFetch('/api/projects/insert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newProject),
        })
        if (!insertRes.ok) {
          const msg = await errorMessageFromResponse(insertRes, 'Failed to save project to the database.')
          throw new Error(msg)
        }
      } catch (err) {
        console.error('DB Persistence Error:', err)
        dispatch({ type: 'DELETE_PROJECT', id })
        setTree((prev) => {
          if (!prev) return prev
          return { ...prev, media: prev.media.filter((m) => m.id !== id) }
        })
        toast.error(
          err instanceof Error ? err.message : 'Failed to create project.',
          { duration: 8000 },
        )
        return
      }

      try {
        dispatch({
          type: 'UPDATE_PROJECT',
          id,
          updates: { status: 'uploading', transcriptionProgress: 10, mediaStep: 'upload' },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === id
                ? { ...m, status: 'uploading', transcriptionProgress: 10, mediaStep: 'upload' }
                : m,
            ),
          }
        })

        await authedFetch(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'uploading', transcriptionProgress: 10 }),
        })

        const uploadStartedAt = performance.now()

        if (presignData.uploadType === 'single') {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            activeUploadsRef.current.set(id, xhr)

            xhr.open('PUT', presignData.signedUrl)
            xhr.setRequestHeader('Content-Type', file.type)

            xhr.upload.onprogress = (e) => {
              if (!e.lengthComputable || e.total <= 0) return
              updateUploadProgress(e.loaded, e.total, uploadStartedAt)
            }

            xhr.onload = () => {
              activeUploadsRef.current.delete(id)
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
              } else {
                reject(
                  new Error(
                    xhr.status
                      ? `Upload to storage failed (HTTP ${xhr.status}). Check file size and try again.`
                      : 'Upload to storage was rejected. Try again.',
                  ),
                )
              }
            }

            xhr.onerror = () => {
              activeUploadsRef.current.delete(id)
              reject(new Error('Network error during upload. Check your connection and try again.'))
            }

            xhr.onabort = () => {
              activeUploadsRef.current.delete(id)
              reject(new Error('Upload cancelled.'))
            }

            xhr.send(file)
          })
        } else {
          let cancelled = false
          let completed = false
          const activePartXhrs = new Map<number, XMLHttpRequest>()
          const partLoadedBytes = new Map<number, number>()
          const uploadedParts = new Map<number, string>()

          const syncMultipartProgress = () => {
            const loaded = Array.from(partLoadedBytes.values()).reduce((sum, value) => sum + value, 0)
            updateUploadProgress(Math.min(loaded, file.size), file.size, uploadStartedAt)
          }

          const abortActivePartUploads = () => {
            cancelled = true
            for (const xhr of activePartXhrs.values()) {
              xhr.abort()
            }
            activePartXhrs.clear()
          }

          activeUploadsRef.current.set(id, {
            abort: abortActivePartUploads,
          })

          try {
            const uploadPart = (part: { partNumber: number; signedUrl: string }) =>
              new Promise<string>((resolve, reject) => {
                const start = (part.partNumber - 1) * presignData.partSize
                const end = Math.min(start + presignData.partSize, file.size)
                const chunk = file.slice(start, end)
                const chunkSize = end - start

                const xhr = new XMLHttpRequest()
                activePartXhrs.set(part.partNumber, xhr)
                xhr.open('PUT', part.signedUrl)
                xhr.setRequestHeader('Content-Type', file.type)

                xhr.upload.onprogress = (e) => {
                  const loaded = e.lengthComputable ? Math.min(e.loaded, chunkSize) : 0
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
                    reject(new Error(`Storage did not return an ETag for part ${part.partNumber}.`))
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

            const maxParallelParts = Math.max(
              1,
              Math.min(presignData.maxParallelParts, presignData.parts.length),
            )
            let nextPartIndex = 0

            const runMultipartWorker = async () => {
              while (true) {
                if (cancelled) throw new Error('Upload cancelled.')
                const part = presignData.parts[nextPartIndex++]
                if (!part) return
                const etag = await uploadPart(part)
                uploadedParts.set(part.partNumber, etag)
              }
            }

            await Promise.all(
              Array.from({ length: maxParallelParts }, () => runMultipartWorker()),
            )
            if (cancelled) throw new Error('Upload cancelled.')

            const completedParts = presignData.parts
              .map((part) => ({
                ETag: uploadedParts.get(part.partNumber) ?? '',
                PartNumber: part.partNumber,
              }))
              .filter((part) => part.ETag)
            if (completedParts.length !== presignData.parts.length) {
              throw new Error('Multipart upload finished with missing parts.')
            }

            const completeRes = await authedFetch('/api/upload/multipart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'complete',
                workspaceProjectId: wpId,
                filename: originalKey,
                uploadId: presignData.uploadId,
                parts: completedParts,
              }),
            })
            if (!completeRes.ok) {
              const msg = await errorMessageFromResponse(
                completeRes,
                'Could not finalize the multipart upload.',
              )
              throw new Error(msg)
            }

            completed = true
          } catch (error) {
            if (!cancelled) {
              abortActivePartUploads()
            }
            if (!completed) {
              await authedFetch('/api/upload/multipart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'abort',
                  workspaceProjectId: wpId,
                  filename: originalKey,
                  uploadId: presignData.uploadId,
                }),
              }).catch(() => {})
            }
            throw error
          } finally {
            activeUploadsRef.current.delete(id)
          }
        }

        const originalPlaybackUrl = presignData.url
        dispatch({
          type: 'UPDATE_PROJECT',
          id,
          updates: {
            status: 'transcribing',
            fileUrl: originalPlaybackUrl,
            originalFileUrl: originalPlaybackUrl,
            transcriptionProgress: 48,
            uploadProgress: undefined,
            mediaStep: 'prepare',
            feedbackError: undefined,
          },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === id
                ? {
                    ...m,
                    status: 'transcribing',
                    fileUrl: originalPlaybackUrl,
                    originalFileUrl: originalPlaybackUrl,
                    transcriptionProgress: 48,
                    uploadProgress: undefined,
                    mediaStep: 'prepare',
                    feedbackError: undefined,
                  }
                : m,
            ),
          }
        })

        await authedFetch(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'transcribing',
            fileUrl: originalPlaybackUrl,
            originalFileUrl: originalPlaybackUrl,
            transcriptionProgress: 48,
          }),
        }).catch((error) => {
          console.error('Failed to persist prepare-in-background state:', error)
        })

        void (async () => {
          try {
            const prepRes = await authedFetch(`/api/projects/${id}/prepare-edit-asset`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ originalKey, clientCapture }),
            })
            const prepBody = (await prepRes.json().catch(() => null)) as {
              error?: string
              fileUrl?: string
              originalFileUrl?: string
              sha256Hash?: string
              duration?: number
              mediaMetadata?: StoredMediaMetadata
              playbackUrlRefreshedAt?: number | null
              playbackUrlExpiresAt?: number | null
            } | null
            if (!prepRes.ok || !prepBody?.fileUrl) {
              const fromApi =
                prepBody && typeof prepBody.error === 'string' && prepBody.error.trim()
                  ? prepBody.error.trim()
                  : null
              throw new Error(
                fromApi ||
                  friendlyHttpMessage(
                    prepRes.status,
                    'Could not prepare the editor video (transcode or storage).',
                  ),
              )
            }

            const {
              fileUrl: editFileUrl,
              originalFileUrl,
              sha256Hash,
              duration: probeDuration,
              mediaMetadata,
              playbackUrlRefreshedAt,
              playbackUrlExpiresAt,
            } = prepBody as {
              fileUrl: string
              originalFileUrl: string
              sha256Hash: string
              duration: number
              mediaMetadata: StoredMediaMetadata
              playbackUrlRefreshedAt?: number | null
              playbackUrlExpiresAt?: number | null
            }

            dispatch({
              type: 'UPDATE_PROJECT',
              id,
              updates: {
                status: 'awaiting_transcript',
                fileUrl: editFileUrl,
                originalFileUrl,
                sha256Hash,
                duration: probeDuration,
                mediaMetadata,
                playbackUrlRefreshedAt,
                playbackUrlExpiresAt,
                transcriptionProgress: 0,
                uploadProgress: undefined,
                mediaStep: undefined,
                feedbackError: undefined,
              },
            })
            setTree((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                media: prev.media.map((m) =>
                  m.id === id
                    ? {
                        ...m,
                        status: 'awaiting_transcript',
                        fileUrl: editFileUrl,
                        originalFileUrl,
                        sha256Hash,
                        duration: probeDuration,
                        mediaMetadata,
                        playbackUrlRefreshedAt,
                        playbackUrlExpiresAt,
                        transcriptionProgress: 0,
                        uploadProgress: undefined,
                        mediaStep: undefined,
                        feedbackError: undefined,
                      }
                    : m,
                ),
              }
            })

            await refetchTree()

            if (autoTranscribe) {
              toast.success('Editor MP4 is ready. Starting transcription automatically...')
              void startTranscriptionForProject(id)
            } else {
              toast.success(
                'Editor MP4 ready. Adjust Transcription Settings if needed, then tap Transcribe on this file.',
              )
            }
          } catch (prepError) {
            console.error('Prepare-edit-asset error:', prepError)
            const message =
              prepError instanceof Error
                ? prepError.message
                : 'Could not prepare the editor video (transcode or storage).'
            dispatch({
              type: 'UPDATE_PROJECT',
              id,
              updates: {
                status: 'error',
                fileUrl: originalPlaybackUrl,
                originalFileUrl: originalPlaybackUrl,
                mediaStep: undefined,
                feedbackError: `${message} The original upload is still available for preview.`,
              },
            })
            setTree((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                media: prev.media.map((m) =>
                  m.id === id
                    ? {
                        ...m,
                        status: 'error',
                        fileUrl: originalPlaybackUrl,
                        originalFileUrl: originalPlaybackUrl,
                        mediaStep: undefined,
                        feedbackError: `${message} The original upload is still available for preview.`,
                      }
                    : m,
                ),
              }
            })
            await authedFetch(`/api/projects/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'error',
                fileUrl: originalPlaybackUrl,
                originalFileUrl: originalPlaybackUrl,
              }),
            }).catch(() => {})
            await refetchTree()
            toast.error('Upload finished, but background preparation failed', {
              description: message,
              duration: 10_000,
            })
          }
        })()

        toast.success(
          originalPlaybackUrl
            ? 'Upload complete. Preview is ready while the editor MP4 prepares in the background.'
            : 'Upload complete. Preparing the editor MP4 in the background.',
        )

      } catch (err) {
        console.error('Upload error:', err)
        if (err instanceof Error && err.message === 'Upload cancelled.') {
          // Handled by cancelUpload
          return
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Upload failed. Please check your connection and try again.'
        dispatch({
          type: 'UPDATE_PROJECT',
          id,
          updates: { status: 'error', mediaStep: undefined, feedbackError: message },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === id
                ? { ...m, status: 'error', mediaStep: undefined, feedbackError: message }
                : m,
            ),
          }
        })
        await authedFetch(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'error' }),
        }).catch(() => {})
        toast.error('Upload failed', { description: message, duration: 10_000 })
      }
    },
    [
      dispatch,
      wpId,
      browseFilter,
      refetchTree,
      autoTranscribe,
      startTranscriptionForProject,
      authedFetch,
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

      // Process files concurrently
      validFiles.forEach(file => {
        void processSingleFile(file)
      })
    },
    [wpId, myMembership?.role, processSingleFile],
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
        const res = await authedFetch(`/api/projects/${mediaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId }),
        })
        if (!res.ok) throw new Error('move failed')
        await refetchTree()
        toast.success('Media moved.')
      } catch {
        toast.error('Could not move media.')
      }
    },
    [refetchTree, authedFetch],
  )

  const renameMediaProject = useCallback(
    async (mediaId: string, title: string) => {
      const res = await authedFetch(`/api/projects/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) {
        toast.error('Could not rename.')
        throw new Error('rename failed')
      }
      await refetchTree()
      dispatch({ type: 'UPDATE_PROJECT', id: mediaId, updates: { title } })
      toast.success('Project renamed.')
    },
    [refetchTree, dispatch, authedFetch],
  )

  const deleteMediaProject = useCallback(
    async (mediaId: string) => {
      const res = await authedFetch(`/api/projects/${mediaId}`, { method: 'DELETE' })
      if (!res.ok) {
        const msg = await errorMessageFromResponse(res, 'Could not delete media.')
        toast.error(msg)
        throw new Error(msg)
      }
      dispatch({ type: 'DELETE_PROJECT', id: mediaId })
      setTree((prev) => {
        if (!prev) return prev
        return { ...prev, media: prev.media.filter((m) => m.id !== mediaId) }
      })
      toast.success('Media deleted.')
    },
    [dispatch, authedFetch],
  )

  const createWorkspace = useCallback(async () => {
    const res = await authedFetch('/api/workspace-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New project' }),
    })
    if (!res.ok) {
      toast.error('Could not create workspace.')
      return
    }
    const w = await res.json()
    setWorkspaces((prev) => [{ ...w, createdAt: new Date(w.createdAt) }, ...prev])
    router.push(`/?wp=${w.id}`)
  }, [router, authedFetch])

  const deleteFolderById = useCallback(
    async (folderId: string) => {
      if (!confirm('Delete this folder? Subfolders are removed; files move to library root.')) return
      try {
        const res = await authedFetch(`/api/folders/${folderId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('delete failed')
        await refetchTree()
        setBrowseFilter({ mode: 'all' })
        toast.success('Folder deleted.')
      } catch {
        toast.error('Could not delete folder.')
      }
    },
    [refetchTree, authedFetch],
  )

  const submitNewFolder = useCallback(async () => {
    if (!wpId || !newFolderName.trim()) return
    const res = await authedFetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceProjectId: wpId,
        parentFolderId: newFolderParentId,
        name: newFolderName.trim(),
      }),
    })
    if (!res.ok) {
      toast.error('Could not create folder.')
      return
    }
    setNewFolderName('')
    setFolderDialogOpen(false)
    await refetchTree()
    toast.success('Folder created.')
  }, [wpId, newFolderName, newFolderParentId, refetchTree, authedFetch])

  const hasFilter = search.length > 0 || statusFilter !== 'all'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand">
              <Sparkles className="size-4 text-brand-foreground" />
            </div>
            <span className="text-base font-bold tracking-tight">TranscriptAI</span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Desktop actions */}
            <div className="hidden sm:flex items-center gap-2">
              {wpId && (
                <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
                  <ArrowLeft className="size-4" />
                  Workspaces
                </Button>
              )}
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={createWorkspace}>
                <FolderPlus className="size-4" />
                New workspace
              </Button>
              {wpId && (
                <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                  <Users className="size-4" />
                  People
                </Button>
              )}
            </div>

            {/* Mobile actions menu */}
            <div className="sm:hidden flex items-center gap-2">
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <Menu className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {wpId && (
                    <>
                      <DropdownMenuItem onClick={() => router.push('/')}>
                        <ArrowLeft className="mr-2 size-4" />
                        Workspaces
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={createWorkspace}>
                    <FolderPlus className="mr-2 size-4" />
                    New workspace
                  </DropdownMenuItem>
                  {wpId && (
                    <DropdownMenuItem onClick={() => setShareOpen(true)}>
                      <Users className="mr-2 size-4" />
                      People
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {wpId && (
              <Button
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
                disabled={viewerLocked}
                title={viewerLocked ? 'Viewers cannot upload' : undefined}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="size-4" />
                <span className="hidden sm:inline">Upload video</span>
                <span className="sm:hidden">Upload</span>
              </Button>
            )}
            <Show when="signed-out">
              <SignInButton />
              <SignUpButton />
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      {!wpId ? (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 sm:py-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-balance">Workspaces</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Each workspace holds folders and video files. Upload multiple videos and add more than one transcript per
                file from the editor.
              </p>
            </div>
            <Button className="shrink-0 bg-brand text-brand-foreground hover:bg-brand/90" onClick={createWorkspace}>
              <FolderPlus className="size-4" />
              New workspace
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed bg-muted/20 py-16 text-center">
                <p className="text-sm text-muted-foreground">No workspaces yet. Create one to get started.</p>
              </div>
            ) : (
              workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => router.push(`/?wp=${w.id}`)}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-left transition-colors hover:border-brand/40 hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <FolderIcon className="size-5 text-brand" />
                    <span className="font-semibold">{w.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(w.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </main>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 border-r bg-muted/15 lg:flex lg:flex-col">
            <div className="border-b p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
              <p className="mt-0.5 truncate text-sm font-semibold" title={tree?.workspace.name}>
                {treeLoading ? '…' : tree?.workspace.name}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-2 py-2 text-left text-sm',
                    browseFilter.mode === 'all' ? 'bg-brand/15 font-medium text-brand' : 'hover:bg-muted',
                  )}
                  onClick={() => setBrowseFilter({ mode: 'all' })}
                >
                  All media
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-2 py-2 text-left text-sm',
                    browseFilter.mode === 'folder' && browseFilter.folderId === null
                      ? 'bg-brand/15 font-medium text-brand'
                      : 'hover:bg-muted',
                  )}
                  onClick={() => setBrowseFilter({ mode: 'folder', folderId: null })}
                >
                  Library root
                </button>
              </div>
              <div className="mt-2 border-t pt-2">
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
              <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-start gap-2 text-xs"
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
                    className="h-8 w-full justify-start gap-2 text-xs"
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
          </aside>
          <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mb-6 lg:hidden flex items-end gap-2">
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
                <Button variant="outline" size="icon" className="shrink-0 mb-px">
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-balance">Video Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload media, tune transcription options, then start AssemblyAI from each file when you are ready.
          </p>
        </div>

        {/* Upload zone */}
        <div
          className={cn(
            'mb-8 flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 ease-out',
            isDragOver
              ? 'border-brand bg-brand/10 scale-[1.02] shadow-lg shadow-brand/5'
              : 'border-border bg-muted/20 hover:border-brand/40 hover:bg-muted/40',
          )}
          onDragOver={(e) => {
            e.preventDefault()
            if (!viewerLocked) setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={viewerLocked ? (e) => { e.preventDefault(); setIsDragOver(false) } : onDrop}
        >
          <div className={cn(
            'flex size-16 items-center justify-center rounded-3xl transition-all duration-300 shadow-sm',
            isDragOver ? 'bg-brand text-brand-foreground shadow-brand/20 scale-110' : 'bg-background border text-muted-foreground',
          )}>
            <UploadCloud className={cn('size-8', isDragOver ? 'animate-bounce' : '')} />
          </div>
          <div className="space-y-1.5">
            <p className="text-lg font-semibold tracking-tight">
              {isDragOver ? 'Drop videos to upload' : 'Drag & drop your videos here'}
            </p>
            <p className="text-sm text-muted-foreground">
              or{' '}
              <button
                type="button"
                className="font-medium text-brand underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50 transition-all"
                disabled={viewerLocked}
                onClick={() => fileInputRef.current?.click()}
              >
                browse files
              </button>
              {' '}&mdash; MP4, MOV, WebM, AVI supported
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-full border bg-background/50 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
            <Sparkles className="size-3.5 text-brand" />
            AssemblyAI transcription + AI editing assistant
          </div>
        </div>

        {/* Transcription Settings */}
        <div className="mb-8">
          <Accordion type="single" collapsible className="w-full rounded-2xl border bg-card px-6">
            <AccordionItem value="settings" className="border-0">
              <AccordionTrigger className="hover:no-underline py-5 text-sm font-semibold">
                Transcription Settings
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <p className="mb-4 text-xs text-muted-foreground">
                  These options apply when you click <span className="font-medium text-foreground">Transcribe</span>{' '}
                  on a file marked “Needs transcript”.
                </p>
                <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Recommended default workflow</p>
                    <p className="text-xs text-muted-foreground">
                      Start with the best model, speaker labels on, and leave speaker tuning blank unless you already
                      know the roster or expected count.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
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
                  >
                    Reset to recommended
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                      <Label>Speech Model</Label>
                      <Select value={speechModel} onValueChange={setSpeechModel}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="best">Universal-3 Pro (Highest Accuracy)</SelectItem>
                          <SelectItem value="fast">Universal-2 (Fastest & 99 Languages)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Universal-3 Pro is best for complex legal terminology.</p>
                    </div>
                    
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <Label>Speaker Labels (Diarization)</Label>
                        <p className="text-xs text-muted-foreground">Automatically identify who is speaking.</p>
                      </div>
                      <Switch checked={speakerLabels} onCheckedChange={setSpeakerLabels} />
                    </div>

                    {/* Advanced Speaker Settings Conditional Section */}
                    {speakerLabels && (
                      <div className="flex flex-col gap-4 rounded-xl border border-brand/20 bg-brand/5 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
                          <Sparkles className="size-3" />
                          Advanced Speaker Tuning
                        </div>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          Optional. Leave these blank unless you need to force a specific number of speakers or help the
                          model map speakers to known names.
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-2">
                            <Label className="text-[11px]">Expected Count</Label>
                            <Input 
                              type="number" 
                              placeholder="e.g. 2" 
                              value={speakersExpected}
                              onChange={(e) => {
                                setSpeakersExpected(e.target.value)
                                if (e.target.value) { setMinSpeakers(''); setMaxSpeakers(''); }
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label className="text-[11px]">Speaker Range</Label>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                placeholder="Min" 
                                value={minSpeakers}
                                onChange={(e) => {
                                  setMinSpeakers(e.target.value)
                                  if (e.target.value) setSpeakersExpected('')
                                }}
                                className="h-8 text-xs"
                              />
                              <Input 
                                type="number" 
                                placeholder="Max" 
                                value={maxSpeakers}
                                onChange={(e) => {
                                  setMaxSpeakers(e.target.value)
                                  if (e.target.value) setSpeakersExpected('')
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label className="text-[11px]">Identified Names (Known Values)</Label>
                          <Input 
                            placeholder="John Doe, Jane Smith..." 
                            value={knownSpeakers}
                            onChange={(e) => setKnownSpeakers(e.target.value)}
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Replace &quot;Speaker A&quot; with these names using Speaker Identification.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <Label>Language Detection</Label>
                        <p className="text-xs text-muted-foreground">Auto-detect the primary language spoken.</p>
                      </div>
                      <Switch checked={languageDetection} onCheckedChange={setLanguageDetection} />
                    </div>

                    <div className="flex flex-col gap-4 pt-2">
                      <div className="flex items-center justify-between">
                        <Label>Temperature</Label>
                        <span className="font-mono text-xs text-brand">{temperature[0]}</span>
                      </div>
                      <Slider 
                        value={temperature} 
                        onValueChange={setTemperature} 
                        max={1} 
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground">Lower values maximize determinism, higher explores more.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                      <Label>Boosted Vocabulary (Keyterms)</Label>
                      <Textarea 
                        value={keyterms}
                        onChange={(e) => setKeyterms(e.target.value)}
                        className="min-h-[80px] resize-none border-dashed bg-muted/50 font-mono text-[11px]"
                        placeholder="Anktiva, Glicoside, Ramipril..."
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated list of names, brands, or jargon to boost accuracy.</p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <Label>System Prompt Configuration</Label>
                        <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wider">Experimental</Badge>
                      </div>
                      <Textarea 
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="min-h-[260px] resize-none border-dashed bg-muted/50 font-mono text-[11px] leading-relaxed"
                        placeholder="Enter a custom prompt here..."
                      />
                      <p className="text-xs text-muted-foreground leading-snug">
                        Use authoritative language (Mandatory:, Non-negotiable:) to format transcript style, tell it to preserve filler words, or apply the [unclear] tag to unresolvable audio. Keep empty for default settings.
                      </p>
                    </div>

                    <div className="flex flex-col gap-4 rounded-xl border border-blue-200/50 bg-blue-50/30 p-4 dark:border-blue-500/20 dark:bg-blue-900/10 transition-colors">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        <Sparkles className="size-3" />
                        Security & Privacy
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs font-medium">PII Redaction</Label>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Identify and mask person names, SSNs, phone numbers, and addresses.
                          </p>
                        </div>
                        <Switch checked={redactPii} onCheckedChange={setRedactPii} />
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 rounded-xl border border-brand/20 bg-brand/5 p-4 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs font-medium">Auto-transcribe after upload</Label>
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Automatically start transcription using these settings when a new video finishes uploading.
                          </p>
                        </div>
                        <Switch checked={autoTranscribe} onCheckedChange={setAutoTranscribe} />
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Search & filter */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="awaiting_transcript">Needs transcript</SelectItem>
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

      <Dialog
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
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace people</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[min(60vh,480px)] flex-col gap-3 overflow-y-auto py-2">
            {membersLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members loaded.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {members.map((m) => {
                  const label =
                    m.displayName?.trim() ||
                    m.email?.trim() ||
                    m.userId
                  const subtitle = m.displayName?.trim()
                    ? m.email?.trim() || m.userId
                    : m.email?.trim()
                      ? m.userId
                      : null
                  const initials = (m.displayName || m.email || m.userId)
                    .split(/\s+/)
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                  return (
                    <li
                      key={m.userId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <Avatar className="size-8">
                          {m.imageUrl ? (
                            <AvatarImage src={m.imageUrl} alt="" />
                          ) : null}
                          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm" title={m.userId}>
                            {label}
                            {user?.id === m.userId ? ' (you)' : ''}
                          </p>
                          {subtitle && subtitle !== label ? (
                            <p
                              className="truncate font-mono text-[11px] text-muted-foreground"
                              title={m.userId}
                            >
                              {subtitle}
                            </p>
                          ) : null}
                          {isWorkspaceOwner ? (
                            <Select
                              value={m.role}
                              onValueChange={(v) =>
                                void changeMemberRole(m.userId, v as 'owner' | 'editor' | 'viewer')
                              }
                            >
                              <SelectTrigger className="mt-1 h-8 w-[140px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="mt-1 inline-block text-xs capitalize text-muted-foreground">
                              {m.role}
                            </span>
                          )}
                        </div>
                      </div>
                      {(isWorkspaceOwner || user?.id === m.userId) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() => void removeWorkspaceMember(m.userId)}
                        >
                          {user?.id === m.userId ? 'Leave' : 'Remove'}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {isWorkspaceOwner && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-muted-foreground leading-relaxed">
                  Access is granted instantly in this app for people who already have an account. We do
                  not send invitation emails—tell them separately if they should sign up or open this
                  workspace.
                </p>
                <Label className="text-xs">Search by email or name</Label>
                <div className="relative mt-1">
                  <Input
                    className="text-sm pr-9"
                    placeholder="name@example.com"
                    value={inviteQuery}
                    onChange={(e) => setInviteQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {memberSearchLoading ? (
                    <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                {memberSearchResults.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-sm">
                    {memberSearchResults.map((hit) => {
                      const initials = hit.displayName
                        .split(/\s+/)
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                      return (
                        <li key={hit.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => void inviteWorkspaceMemberFromSearchHit(hit)}
                          >
                            <Avatar className="size-7">
                              {hit.imageUrl ? (
                                <AvatarImage src={hit.imageUrl} alt="" />
                              ) : null}
                              <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-medium">{hit.displayName}</span>
                              {hit.email ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {hit.email}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as 'editor' | 'viewer')}
                  >
                    <SelectTrigger className="w-full sm:w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" onClick={() => void inviteWorkspaceMemberFromField()}>
                    Add by email
                  </Button>
                </div>
                <Collapsible open={inviteAdvancedOpen} onOpenChange={setInviteAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-8 gap-1 px-0 text-xs text-muted-foreground"
                    >
                      <ChevronDown
                        className={cn('size-3.5 transition-transform', inviteAdvancedOpen && 'rotate-180')}
                      />
                      Advanced: Clerk user ID
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      From Clerk Dashboard → Users, if you need to add by raw ID.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Input
                        className="font-mono text-xs"
                        placeholder="user_…"
                        value={inviteUserId}
                        onChange={(e) => setInviteUserId(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={() => void inviteWorkspaceMemberByUserId()}>
                        Add
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          Loading library…
        </div>
      }
    >
      <LibraryPageContent />
    </Suspense>
  )
}
