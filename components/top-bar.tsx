'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { UserButton, SignInButton, SignUpButton, Show } from '@clerk/nextjs'
import {
  ArrowLeft,
  Sparkles,
  Download,
  FileText,
  CheckCircle,
  ChevronRight,
  Briefcase,
  FileStack,
  Loader2,
  PlusCircle,
  Info,
  Menu,
  Bot,
  HelpCircle,
  ChevronDown,
  Clapperboard,
  FileArchive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/app-context'
import { getProjectData, listTranscriptsForMediaAction } from '@/lib/actions'
import { preferredDurationMs, resolutionLabel } from '@/lib/media-metadata'
import { errorMessageFromResponse } from '@/lib/api-error-message'
import { pollTranscriptionUntilComplete } from '@/lib/transcription-poll-client'
import type { TranscriptSummary, VideoProject } from '@/lib/types'

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function canDownloadOriginalProject(project: VideoProject): boolean {
  return Boolean(
    project.mediaMetadata?.originalKey || project.originalFileUrl || project.sha256Hash,
  )
}

function canDownloadEditedProject(project: VideoProject): boolean {
  return Boolean(
    project.mediaMetadata?.editKey ||
      ((project.status === 'ready' || project.status === 'awaiting_transcript') && project.fileUrl),
  )
}

function formatTranscriptLabel(t: TranscriptSummary): string {
  if (t.label?.trim()) return t.label.trim()
  const d = t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)
  return `${t.language} · ${d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
}

function MetaRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="grid grid-cols-[minmax(0,118px)_1fr] gap-x-2 gap-y-0.5 text-xs">
      <dt className="shrink-0 font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-[11px] text-foreground">{String(value)}</dd>
    </div>
  )
}

function MediaMetadataDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  project: VideoProject
}) {
  const m = project.mediaMetadata
  const d = m?.derived
  const tagEntries = d ? Object.entries(d.tags).sort(([a], [b]) => a.localeCompare(b)) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Media metadata</DialogTitle>
        </DialogHeader>
        {!m || !d ? (
          <p className="text-sm text-muted-foreground">No extracted metadata for this file yet.</p>
        ) : (
          <>
            <ScrollArea className="min-h-0 flex-1 pr-3">
              <div className="space-y-4 pb-2">
                <section>
                  <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Summary
                  </h4>
                  <dl className="space-y-1.5">
                    <MetaRow
                      label="Duration"
                      value={`${formatDuration(preferredDurationMs(project))} (${preferredDurationMs(project)} ms)`}
                    />
                    <MetaRow label="Resolution" value={resolutionLabel(project)} />
                    <MetaRow label="Frame rate" value={d.frameRate} />
                    <MetaRow label="SHA-256" value={project.sha256Hash} />
                    <MetaRow label="Source container" value={d.sourceContainer} />
                    <MetaRow label="Source video" value={d.sourceVideoCodec} />
                    <MetaRow label="Source audio" value={d.sourceAudioCodec} />
                    <MetaRow label="Source bitrate" value={d.sourceBitRate} />
                    <MetaRow label="Edit container" value={d.editContainer} />
                    <MetaRow label="Edit video" value={d.editVideoCodec} />
                    <MetaRow label="Edit audio" value={d.editAudioCodec} />
                    <MetaRow label="Edit bitrate" value={d.editBitRate} />
                    <MetaRow label="Chapters" value={d.chaptersCount} />
                    <MetaRow label="Extracted at" value={m.extractedAt} />
                    <MetaRow label="Original key" value={m.originalKey} />
                    <MetaRow label="Edit key" value={m.editKey} />
                  </dl>
                </section>
                {m.clientCapture ? (
                  <section>
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Browser &amp; device (upload)
                    </h4>
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Captured in the browser when the file was chosen. OS file times often match
                      recording or export on phones (e.g. iPhone).
                    </p>
                    <dl className="space-y-1.5">
                      <MetaRow label="File name" value={m.clientCapture.file.name} />
                      <MetaRow label="File size" value={formatFileSize(m.clientCapture.file.size)} />
                      <MetaRow label="MIME (browser)" value={m.clientCapture.file.type} />
                      <MetaRow label="Last modified (file)" value={m.clientCapture.file.lastModifiedIso} />
                      <MetaRow label="Capture time (browser)" value={m.clientCapture.capturedAt} />
                      {m.clientCapture.video ? (
                        <>
                          <MetaRow
                            label="Video element size"
                            value={`${m.clientCapture.video.videoWidth}×${m.clientCapture.video.videoHeight}`}
                          />
                          <MetaRow
                            label="Video element duration"
                            value={`${m.clientCapture.video.durationMs} ms`}
                          />
                        </>
                      ) : null}
                      {m.clientCapture.environment ? (
                        <>
                          <MetaRow label="Platform" value={m.clientCapture.environment.platform} />
                          <MetaRow label="Language" value={m.clientCapture.environment.language} />
                          <MetaRow
                            label="User agent"
                            value={m.clientCapture.environment.userAgent}
                          />
                          {m.clientCapture.environment.hardwareConcurrency != null ? (
                            <MetaRow
                              label="CPU cores (hint)"
                              value={m.clientCapture.environment.hardwareConcurrency}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </dl>
                  </section>
                ) : null}
                {tagEntries.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Tags ({tagEntries.length})
                    </h4>
                    <dl className="space-y-1">
                      {tagEntries.map(([k, v]) => (
                        <MetaRow key={k} label={k} value={v} />
                      ))}
                    </dl>
                  </section>
                )}
                <section className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Raw ffprobe
                  </h4>
                  <details className="rounded-md border bg-muted/30 px-2 py-1 text-xs">
                    <summary className="cursor-pointer font-medium">Original (vault file)</summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px]">
                      {JSON.stringify(m.original, null, 2)}
                    </pre>
                  </details>
                  <details className="rounded-md border bg-muted/30 px-2 py-1 text-xs">
                    <summary className="cursor-pointer font-medium">Edit (MP4)</summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px]">
                      {JSON.stringify(m.edit, null, 2)}
                    </pre>
                  </details>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TopBar({ onOpenAi }: { onOpenAi?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { state, dispatch } = useApp()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [transcriptList, setTranscriptList] = useState<TranscriptSummary[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [startingTranscribe, setStartingTranscribe] = useState(false)
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false)

  const project = state.projects.find((p) => p.id === state.activeProjectId)
  const mediaId = project?.id

  useEffect(() => {
    if (!mediaId) return
    const safeId = mediaId
    let cancelled = false
    async function load() {
      setListLoading(true)
      try {
        const rows = await listTranscriptsForMediaAction(safeId)
        if (!cancelled) setTranscriptList(rows)
      } catch {
        if (!cancelled) setTranscriptList([])
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [mediaId])

  const switchTranscript = useCallback(
    async (transcriptId: string) => {
      if (!mediaId) return
      try {
        const data = await getProjectData(mediaId, transcriptId)
        if (!data) {
          toast.error('Transcript not found.')
          return
        }
        dispatch({ type: 'SET_TRANSCRIPT', transcript: data.transcript })
        dispatch({ type: 'SET_OVERLAYS', overlays: data.overlays ?? [] })
        router.replace(`/editor/${mediaId}?t=${transcriptId}`)
      } catch {
        toast.error('Failed to load transcript.')
      }
    },
    [dispatch, mediaId, router],
  )

  const startNewTranscription = useCallback(async () => {
    if (!mediaId || (project?.status !== 'ready' && project?.status !== 'awaiting_transcript')) {
      toast.error('Editor MP4 is not ready for transcription yet.')
      return
    }
    if (!project?.mediaMetadata?.editKey) {
      toast.error('The upload preview is ready, but the editor MP4 is still preparing.')
      return
    }
    setStartingTranscribe(true)
    try {
      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: mediaId,
          options: {
            speechModel: 'best',
            speakerLabels: true,
            languageDetection: true,
            temperature: 0.1,
            transcriptLabel: newLabel.trim() || undefined,
          },
        }),
      })
      if (!transcribeRes.ok) {
        const msg = await errorMessageFromResponse(transcribeRes, 'Could not start transcription.')
        throw new Error(msg)
      }
      const body = (await transcribeRes.json()) as {
        assemblyAiId?: string
        transcriptId?: string
      }
      const { assemblyAiId, transcriptId } = body
      if (!assemblyAiId || !transcriptId) {
        throw new Error('Transcription service returned an incomplete response.')
      }

      const pollResult = await pollTranscriptionUntilComplete(assemblyAiId, mediaId, transcriptId)
      if (pollResult.ok) {
        setTranscriptList(await listTranscriptsForMediaAction(mediaId))
        await switchTranscript(transcriptId)
        toast.success('New transcript ready.')
      } else if (pollResult.reason === 'error') {
        const desc = pollResult.assemblyError?.trim() || 'Transcription failed.'
        toast.error('Transcription did not complete', { description: desc, duration: 10_000 })
        return
      } else if (pollResult.reason === 'timeout') {
        toast.error('Transcription timed out', {
          description: 'Try again or use a shorter recording.',
          duration: 10_000,
        })
        return
      } else {
        toast.message('Transcription check stopped')
        return
      }
      setNewDialogOpen(false)
      setNewLabel('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transcription failed.'
      toast.error('Transcription failed', { description: msg, duration: 10_000 })
    } finally {
      setStartingTranscribe(false)
    }
  }, [newLabel, project?.mediaMetadata?.editKey, project?.status, mediaId, switchTranscript])

  const selectValue = state.transcript?.id ?? searchParams.get('t') ?? ''

  if (!project) return null

  const libraryHref = project.workspaceProjectId ? `/?wp=${project.workspaceProjectId}` : '/'

  const handleTitleClick = () => {
    setTitleValue(project.title)
    setEditingTitle(true)
  }

  const commitTitle = async () => {
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
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      if (!res.ok) throw new Error('save failed')
      dispatch({ type: 'UPDATE_PROJECT', id: project.id, updates: { title: trimmed } })
      toast.success('Project renamed.')
    } catch {
      toast.error('Could not save name.')
      setTitleValue(project.title)
    }
    setEditingTitle(false)
  }

  const exportTranscript = () => {
    if (!state.transcript) {
      toast.error('No transcript to export.')
      return
    }
    const lines = state.transcript.segments.map((s) => {
      const start = formatDuration(s.start)
      const end = formatDuration(s.end)
      return `[${start} → ${end}] ${s.speaker}\n${s.text}\n`
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.title.replace(/\s+/g, '-')}-transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Transcript exported.')
  }

  const exportSRT = () => {
    if (!state.transcript) {
      toast.error('No transcript to export.')
      return
    }
    const toSRTTime = (ms: number) => {
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      const mss = ms % 1000
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mss).padStart(3, '0')}`
    }
    const lines = state.transcript.segments.map((s, i) => {
      return `${i + 1}\n${toSRTTime(s.start)} --> ${toSRTTime(s.end)}\n${s.text}\n`
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.title.replace(/\s+/g, '-')}.srt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('SRT file exported.')
  }

  const downloadVideo = (variant: 'original' | 'edit') => {
    if (variant === 'original' && !canDownloadOriginalProject(project)) {
      toast.error('Original file is not available yet.')
      return
    }
    if (variant === 'edit' && !canDownloadEditedProject(project)) {
      toast.error('Edited video is not available yet.')
      return
    }
    window.location.assign(`/api/projects/${project.id}/download?variant=${variant}`)
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={libraryHref} aria-label="Back to library">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href={libraryHref} className="flex items-center gap-1.5 transition-colors hover:text-brand">
            <Sparkles className="size-3.5 text-brand" />
            <span className="hidden font-medium sm:inline">Library</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitTitle()
                }
                if (e.key === 'Escape') {
                  setTitleValue(project.title)
                  setEditingTitle(false)
                }
              }}
              className="min-w-0 flex-1 rounded border border-brand bg-background px-2 py-0.5 text-sm font-medium outline-none ring-2 ring-brand/30"
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={handleTitleClick}
                className="truncate text-sm font-bold transition-colors hover:text-brand"
                title="Click to rename"
              >
                {project.title}
              </button>

              {(project.caseId || project.exhibitNumber) && (
                <div className="hidden shrink-0 items-center gap-2 md:flex">
                  {project.caseId && (
                    <Badge variant="secondary" className="h-5 gap-1 px-1.5 font-mono text-[10px]">
                      <Briefcase className="size-2.5" />
                      {project.caseId}
                    </Badge>
                  )}
                  {project.exhibitNumber && (
                    <Badge
                      variant="outline"
                      className="h-5 gap-1 border-brand/30 px-1.5 font-mono text-[10px] text-brand"
                    >
                      <FileStack className="size-2.5" />
                      EX-{project.exhibitNumber}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {listLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Select
              value={selectValue || (transcriptList[0]?.id ?? '')}
              onValueChange={(v) => void switchTranscript(v)}
              disabled={transcriptList.length === 0}
            >
              <SelectTrigger className="h-8 w-[min(220px,28vw)] text-xs">
                <SelectValue placeholder="Transcript" />
              </SelectTrigger>
              <SelectContent>
                {transcriptList.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {formatTranscriptLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setNewDialogOpen(true)}>
            <PlusCircle className="size-3.5" />
            New transcript
          </Button>
        </div>

        <Badge
          variant={state.transcript ? 'default' : 'secondary'}
          className="h-5 shrink-0 gap-1 text-[10px] font-bold uppercase tracking-tight hidden sm:flex"
        >
          <CheckCircle className="size-3" />
          {state.transcript ? `${state.transcript.segments.length} segments` : 'Processing'}
        </Badge>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={exportTranscript} className="hidden sm:flex">
              <FileText className="size-4" />
              Export TXT
            </Button>
          </TooltipTrigger>
          <TooltipContent>Includes latest unsaved changes</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={exportSRT} className="hidden sm:flex">
              <Download className="size-4" />
              Export SRT
            </Button>
          </TooltipTrigger>
          <TooltipContent>Includes latest unsaved changes</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 gap-1 px-2 text-xs sm:flex"
              title="Download original upload or edited MP4 from storage"
            >
              <Download className="size-4" />
              Video
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Download video
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canDownloadOriginalProject(project)}
              onSelect={(e) => {
                e.preventDefault()
                downloadVideo('original')
              }}
            >
              <FileArchive className="mr-2 size-4" />
              Original (unedited)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canDownloadEditedProject(project)}
              onSelect={(e) => {
                e.preventDefault()
                downloadVideo('edit')
              }}
            >
              <Clapperboard className="mr-2 size-4" />
              Edited MP4
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="icon-sm"
          className="shrink-0 hidden sm:flex"
          aria-label="Media metadata"
          title="Media metadata"
          onClick={() => setMediaInfoOpen(true)}
          disabled={!project.mediaMetadata}
        >
          <Info className="size-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" className="hidden sm:flex">
              <HelpCircle className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <h4 className="mb-2 text-sm font-semibold">Keyboard Shortcuts</h4>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Play / Pause</span>
                <kbd className="rounded bg-muted px-1.5 font-mono">Space</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skip back 5s</span>
                <kbd className="rounded bg-muted px-1.5 font-mono">J</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skip forward 5s</span>
                <kbd className="rounded bg-muted px-1.5 font-mono">L</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Search transcript</span>
                <kbd className="rounded bg-muted px-1.5 font-mono">/</kbd>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <ThemeToggle />
        
        {/* Mobile Menu */}
        <div className="sm:hidden flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm">
                <Menu className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onOpenAi && (
                <>
                  <DropdownMenuItem onClick={onOpenAi} className="lg:hidden text-brand font-medium">
                    <Bot className="mr-2 size-4" />
                    AI Assistant
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="lg:hidden" />
                </>
              )}
              
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Transcript
              </DropdownMenuLabel>
              {transcriptList.map((t) => (
                <DropdownMenuItem 
                  key={t.id} 
                  onClick={() => void switchTranscript(t.id)}
                  className={t.id === selectValue ? 'bg-muted' : ''}
                >
                  <FileText className="mr-2 size-4" />
                  {formatTranscriptLabel(t)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => setNewDialogOpen(true)}>
                <PlusCircle className="mr-2 size-4" />
                New transcript
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Export & Info
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={exportTranscript} disabled={!state.transcript}>
                <FileText className="mr-2 size-4" />
                Export TXT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSRT} disabled={!state.transcript}>
                <Download className="mr-2 size-4" />
                Export SRT
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Download video
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!canDownloadOriginalProject(project)}
                onSelect={(e) => {
                  e.preventDefault()
                  downloadVideo('original')
                }}
              >
                <FileArchive className="mr-2 size-4" />
                Original (unedited)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDownloadEditedProject(project)}
                onSelect={(e) => {
                  e.preventDefault()
                  downloadVideo('edit')
                }}
              >
                <Clapperboard className="mr-2 size-4" />
                Edited MP4
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMediaInfoOpen(true)} disabled={!project.mediaMetadata}>
                <Info className="mr-2 size-4" />
                Media metadata
              </DropdownMenuItem>

              {(project.caseId || project.exhibitNumber) && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 flex flex-col gap-1.5">
                    {project.caseId && (
                      <Badge variant="secondary" className="w-fit h-5 gap-1 px-1.5 font-mono text-[10px]">
                        <Briefcase className="size-2.5" />
                        {project.caseId}
                      </Badge>
                    )}
                    {project.exhibitNumber && (
                      <Badge variant="outline" className="w-fit h-5 gap-1 border-brand/30 px-1.5 font-mono text-[10px] text-brand">
                        <FileStack className="size-2.5" />
                        EX-{project.exhibitNumber}
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Show when="signed-out">
          <SignInButton />
          <SignUpButton />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>

      <MediaMetadataDialog
        open={mediaInfoOpen}
        onOpenChange={setMediaInfoOpen}
        project={project}
      />

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New transcription</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Runs AssemblyAI again on this video and saves an additional transcript you can switch between.
            Uses the default &quot;Universal-3 Pro&quot; model. To customize settings, go back to the Library.
          </p>
          <div className="flex flex-col gap-2 py-2">
            <Label>Optional label</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Re-run, Spanish"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setNewDialogOpen(false)} disabled={startingTranscribe}>
              Cancel
            </Button>
            <Button onClick={() => void startNewTranscription()} disabled={startingTranscribe}>
              {startingTranscribe ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Working…
                </>
              ) : (
                'Start'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
