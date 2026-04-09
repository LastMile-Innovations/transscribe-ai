'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Merge,
  Copy,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Scissors,
  Users,
  Crosshair,
  FilterX,
  FileText,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/lib/app-context'
import type { TranscriptSegment } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  addSegmentAction,
  deleteSegmentAction,
  mergeSegmentsAction,
  renameSpeakerAcrossTranscriptAction,
  splitSegmentAction,
  updateSegmentAction,
} from '@/lib/actions'
import {
  getAdjacentSegmentIds,
  getSpeakerColorClass,
  mergeTranscriptSegments,
  renameSpeakerInSegments,
  splitTranscriptSegment,
  summarizeSpeakers,
} from '@/lib/transcript-editing'

type SegmentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const msRemaining = ms % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(Math.floor(msRemaining / 100))}`
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const indicatorClass =
    pct >= 90
      ? '[&_[data-slot=progress-indicator]]:bg-green-500'
      : pct >= 75
        ? '[&_[data-slot=progress-indicator]]:bg-yellow-500'
        : '[&_[data-slot=progress-indicator]]:bg-red-500'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Progress value={pct} className={cn('mt-1.5 h-1.5 flex-1 bg-muted/60', indicatorClass)} />
      </TooltipTrigger>
      <TooltipContent>{pct}% confidence</TooltipContent>
    </Tooltip>
  )
}

function SaveStateBadge({ state }: { state: SegmentSaveState }) {
  if (state === 'idle') return null

  if (state === 'saving') {
    return (
      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Saving
      </Badge>
    )
  }

  if (state === 'saved') {
    return (
      <Badge variant="outline" className="rounded-full border-green-500/30 px-2 py-0 text-[10px] text-green-500">
        <CheckCircle2 className="size-3" />
        Saved
      </Badge>
    )
  }

  if (state === 'error') {
    return (
      <Badge variant="outline" className="rounded-full border-destructive/30 px-2 py-0 text-[10px] text-destructive">
        <AlertCircle className="size-3" />
        Error
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="rounded-full border-amber-500/30 px-2 py-0 text-[10px] text-amber-600 dark:text-amber-500">
      <Loader2 className="size-3" />
      Unsaved
    </Badge>
  )
}

function SpeakerManagerDialog({
  open,
  onOpenChange,
  speakers,
  selectedSpeaker,
  renameValue,
  onSelectSpeaker,
  onRenameValueChange,
  onApply,
  busy,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  speakers: Array<{ name: string; count: number }>
  selectedSpeaker: string
  renameValue: string
  onSelectSpeaker: (speaker: string) => void
  onRenameValueChange: (value: string) => void
  onApply: () => void
  busy: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage speakers</DialogTitle>
        </DialogHeader>
        <FieldSet>
          <Card className="gap-0 border-border/60 bg-muted/30 py-0 shadow-none">
            <CardContent className="px-4 py-3 text-xs text-muted-foreground">
              Pick a speaker, rename them once, and every matching segment will update together.
            </CardContent>
          </Card>
          <FieldGroup>
            <Field>
              <FieldLabel>Current speakers</FieldLabel>
              <FieldContent>
                <div className="flex flex-wrap gap-2">
                  {speakers.map((speaker) => (
                    <button
                      key={speaker.name}
                      type="button"
                      onClick={() => onSelectSpeaker(speaker.name)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        selectedSpeaker === speaker.name
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border bg-muted/40 text-foreground hover:border-brand/40',
                        getSpeakerColorClass(speaker.name),
                      )}
                    >
                      {speaker.name} ({speaker.count})
                    </button>
                  ))}
                </div>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="speaker-rename-input">Rename selected speaker across transcript</FieldLabel>
              <FieldContent>
                <Input
                  id="speaker-rename-input"
                  value={renameValue}
                  onChange={(e) => onRenameValueChange(e.target.value)}
                  placeholder="Enter the new speaker name"
                />
                <FieldDescription>
                  Every segment assigned to the selected speaker will be updated in one action.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onApply}
            disabled={busy || !selectedSpeaker || !renameValue.trim() || renameValue.trim() === selectedSpeaker}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Applying...
              </>
            ) : (
              'Rename everywhere'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SegmentRow({
  segment,
  isActive,
  saveState,
  previousMergeId,
  nextMergeId,
  onSeek,
  onSegmentStatus,
  onDelete,
  onAddAfter,
  onMerge,
  onSplit,
  onManageSpeaker,
  showWordTimings,
}: {
  segment: TranscriptSegment
  isActive: boolean
  saveState: SegmentSaveState
  previousMergeId: string | null
  nextMergeId: string | null
  onSeek: (ms: number) => void
  onSegmentStatus: (segmentId: string, state: SegmentSaveState) => void
  onDelete: (segmentId: string) => void
  onAddAfter: (segment: TranscriptSegment) => void
  onMerge: (primaryId: string, secondaryId: string) => void
  onSplit: (segment: TranscriptSegment, splitIndex: number) => void
  onManageSpeaker: (speaker: string) => void
  showWordTimings: boolean
}) {
  const { dispatch } = useApp()
  const rowRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousSegmentIdRef = useRef(segment.id)
  const draftTextRef = useRef(segment.text)
  const lastSavedTextRef = useRef(segment.text)
  const [draftText, setDraftText] = useState(segment.text)
  const [editingSpeaker, setEditingSpeaker] = useState(false)
  const [speakerValue, setSpeakerValue] = useState(segment.speaker)

  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive])

  useEffect(() => {
    if (previousSegmentIdRef.current !== segment.id) {
      previousSegmentIdRef.current = segment.id
      draftTextRef.current = segment.text
      lastSavedTextRef.current = segment.text
      setDraftText(segment.text)
      setSpeakerValue(segment.speaker)
    }
  }, [segment.id, segment.speaker, segment.text])

  useEffect(() => {
    if (segment.text === lastSavedTextRef.current && segment.text !== draftTextRef.current) {
      draftTextRef.current = segment.text
      setDraftText(segment.text)
    }
  }, [segment.text])

  useEffect(() => {
    if (!editingSpeaker) {
      setSpeakerValue(segment.speaker)
    }
  }, [editingSpeaker, segment.speaker])

  const flushTextSave = useCallback(
    async (nextText: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      if (nextText === lastSavedTextRef.current) {
        onSegmentStatus(segment.id, 'idle')
        return
      }

      onSegmentStatus(segment.id, 'saving')
      try {
        await updateSegmentAction(segment.id, { text: nextText })
        lastSavedTextRef.current = nextText
        onSegmentStatus(segment.id, 'saved')
      } catch {
        onSegmentStatus(segment.id, 'error')
        toast.error('Failed to save segment text.')
      }
    },
    [onSegmentStatus, segment.id],
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (draftTextRef.current !== lastSavedTextRef.current) {
        void flushTextSave(draftTextRef.current)
      }
    }
  }, [flushTextSave])

  const scheduleTextSave = useCallback(
    (nextText: string) => {
      draftTextRef.current = nextText
      setDraftText(nextText)
      dispatch({ type: 'UPDATE_SEGMENT', id: segment.id, updates: { text: nextText } })

      if (nextText === lastSavedTextRef.current) {
        onSegmentStatus(segment.id, 'idle')
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        return
      }

      onSegmentStatus(segment.id, 'dirty')
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        void flushTextSave(nextText)
      }, 700)
    },
    [dispatch, flushTextSave, onSegmentStatus, segment.id],
  )

  const commitSpeaker = useCallback(async () => {
    const trimmed = speakerValue.trim()
    setEditingSpeaker(false)
    if (!trimmed || trimmed === segment.speaker) {
      setSpeakerValue(segment.speaker)
      return
    }

    dispatch({ type: 'UPDATE_SEGMENT', id: segment.id, updates: { speaker: trimmed } })
    onSegmentStatus(segment.id, 'saving')
    try {
      await updateSegmentAction(segment.id, { speaker: trimmed })
      onSegmentStatus(segment.id, 'saved')
    } catch {
      dispatch({ type: 'UPDATE_SEGMENT', id: segment.id, updates: { speaker: segment.speaker } })
      setSpeakerValue(segment.speaker)
      onSegmentStatus(segment.id, 'error')
      toast.error('Failed to save speaker.')
    }
  }, [dispatch, onSegmentStatus, segment.id, segment.speaker, speakerValue])

  const handleCopy = () => {
    navigator.clipboard.writeText(`[${formatTime(segment.start)} → ${formatTime(segment.end)}] ${segment.speaker}\n${draftText}`)
    toast.success('Copied to clipboard.')
  }

  return (
    <div ref={rowRef}>
      <Card
        className={cn(
          'relative gap-0 overflow-hidden border p-0 transition-all duration-150 shadow-none',
          isActive
            ? 'border-brand/50 bg-brand/5 shadow-sm shadow-brand/10'
            : 'border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40',
        )}
      >
        {isActive && <div className="absolute left-0 top-2 h-[calc(100%-16px)] w-0.5 rounded-full bg-brand" />}

        <CardContent className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSeek(segment.start)}
              className="shrink-0 rounded px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
              title="Seek to start"
            >
              {formatTime(segment.start)}
            </button>
            <span className="text-[10px] text-muted-foreground/40">–</span>
            <button
              type="button"
              onClick={() => onSeek(segment.end)}
              className="shrink-0 rounded px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
              title="Seek to end"
            >
              {formatTime(segment.end)}
            </button>

            {editingSpeaker ? (
              <Input
                autoFocus
                value={speakerValue}
                onChange={(e) => setSpeakerValue(e.target.value)}
                onBlur={() => void commitSpeaker()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitSpeaker()
                  }
                  if (e.key === 'Escape') {
                    setSpeakerValue(segment.speaker)
                    setEditingSpeaker(false)
                  }
                }}
                className="h-7 w-32 border-brand bg-background px-1.5 font-mono text-xs ring-1 ring-brand/30"
              />
            ) : (
              <>
                <Badge
                  asChild
                  variant="outline"
                  className={cn(
                    'cursor-pointer rounded-full px-2.5 py-0.5 font-mono text-xs transition-opacity hover:opacity-80',
                    getSpeakerColorClass(segment.speaker),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSpeakerValue(segment.speaker)
                      setEditingSpeaker(true)
                    }}
                    title="Click to rename this segment speaker"
                  >
                    {segment.speaker}
                  </button>
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onManageSpeaker(segment.speaker)}
                  className="h-7 rounded-full px-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                  title="Rename this speaker across the whole transcript"
                >
                  all
                </Button>
              </>
            )}

            <SaveStateBadge state={saveState} />

            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={handleCopy} className="size-8 rounded-full" aria-label="Copy segment">
                    <Copy className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy segment</TooltipContent>
              </Tooltip>

              {previousMergeId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => onMerge(previousMergeId, segment.id)} className="size-8 rounded-full" aria-label="Merge with previous segment">
                      <Merge className="size-3 rotate-180" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Merge with previous</TooltipContent>
                </Tooltip>
              )}

              {nextMergeId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => onMerge(segment.id, nextMergeId)} className="size-8 rounded-full" aria-label="Merge with next segment">
                      <Merge className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Merge with next</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onSplit(segment, textareaRef.current?.selectionStart ?? Math.floor(draftText.length / 2))}
                    className="size-8 rounded-full"
                    aria-label="Split segment at cursor"
                  >
                    <Scissors className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Split at cursor</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDelete(segment.id)}
                    className="size-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete segment"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete segment</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => scheduleTextSave(e.target.value)}
            onBlur={() => void flushTextSave(draftTextRef.current)}
            rows={Math.max(2, Math.ceil(Math.max(draftText.length, 1) / 65))}
            className="min-h-0 w-full resize-none border-transparent bg-transparent px-0 py-0 font-sans text-[13px] leading-relaxed text-foreground shadow-none focus-visible:border-brand/20 focus-visible:ring-0 focus-visible:bg-transparent"
            placeholder="Transcript text..."
          />

          {showWordTimings && (
            <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.16em]">
                  Word timings
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {segment.words?.length ?? 0} words
                </span>
              </div>
              {segment.words && segment.words.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {segment.words.map((word, index) => (
                    <button
                      key={`${segment.id}-word-${index}-${word.start}`}
                      type="button"
                      onClick={() => onSeek(word.start)}
                      className="rounded-lg border border-border/60 bg-background px-2 py-1 text-left font-mono text-[10px] transition-colors hover:border-brand/40 hover:bg-brand/5"
                      title={`Seek to ${word.text}`}
                    >
                      <span className="block text-muted-foreground">
                        {formatTime(word.start)}-{formatTime(word.end)}
                      </span>
                      <span className="block text-foreground">{word.text}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="font-mono text-[11px] text-muted-foreground">No word timestamps</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <ConfidenceBar value={segment.confidence} />
              <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-mono text-muted-foreground">
                {Math.round(segment.confidence * 100)}% conf
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Shortcuts</span>
              <Kbd>Alt+Space</Kbd>
              <Kbd>Alt+J</Kbd>
              <Kbd>Alt+L</Kbd>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => onAddAfter(segment)}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
        >
          <Plus className="size-3" />
          Add segment
        </button>
      </div>
    </div>
  )
}

export function TranscriptEditor() {
  const { state, dispatch } = useApp()
  const [searchTerm, setSearchTerm] = useState('')
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null)
  const [showWordTimings, setShowWordTimings] = useState(false)
  const [segmentStates, setSegmentStates] = useState<Record<string, SegmentSaveState>>({})
  const [speakerDialogOpen, setSpeakerDialogOpen] = useState(false)
  const [selectedSpeaker, setSelectedSpeaker] = useState('')
  const [speakerRenameValue, setSpeakerRenameValue] = useState('')
  const [speakerRenameBusy, setSpeakerRenameBusy] = useState(false)
  const resetTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const transcript = state.transcript
  const playerTime = state.playerTime
  const activeProjectId = state.activeProjectId

  const setSegmentStatus = useCallback((segmentId: string, status: SegmentSaveState) => {
    const currentTimer = resetTimersRef.current[segmentId]
    if (currentTimer) {
      clearTimeout(currentTimer)
      delete resetTimersRef.current[segmentId]
    }

    setSegmentStates((prev) => ({ ...prev, [segmentId]: status }))

    if (status === 'saved') {
      resetTimersRef.current[segmentId] = setTimeout(() => {
        setSegmentStates((prev) => ({ ...prev, [segmentId]: 'idle' }))
        delete resetTimersRef.current[segmentId]
      }, 1800)
    }
  }, [])

  useEffect(() => {
    const resetTimers = resetTimersRef.current
    return () => {
      Object.values(resetTimers).forEach((timer) => clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    if (!transcript) {
      setSegmentStates({})
      return
    }

    setSegmentStates((prev) => {
      const next: Record<string, SegmentSaveState> = {}
      transcript.segments.forEach((segment) => {
        if (prev[segment.id]) {
          next[segment.id] = prev[segment.id]
        }
      })
      return next
    })
  }, [transcript])

  useEffect(() => {
    if (!speakerFilter || !transcript) return
    if (!transcript.segments.some((segment) => segment.speaker === speakerFilter)) {
      setSpeakerFilter(null)
    }
  }, [speakerFilter, transcript])

  const seek = useCallback(
    (ms: number) => {
      window.dispatchEvent(new CustomEvent('app:seek', { detail: { timeMs: ms } }))
      dispatch({ type: 'SET_PLAYER_TIME', time: ms })
    },
    [dispatch],
  )

  const filtered = useMemo(() => {
    if (!transcript) return []
    const lowerSearch = searchTerm.toLowerCase()
    return transcript.segments.filter((segment) => {
      const matchesSearch =
        !searchTerm ||
        segment.text.toLowerCase().includes(lowerSearch) ||
        segment.speaker.toLowerCase().includes(lowerSearch)
      const matchesSpeaker = !speakerFilter || segment.speaker === speakerFilter
      return matchesSearch && matchesSpeaker
    })
  }, [speakerFilter, transcript, searchTerm])

  const activeSegmentId = useMemo(() => {
    if (!transcript) return null
    return transcript.segments.find((segment) => playerTime >= segment.start && playerTime <= segment.end)?.id ?? null
  }, [transcript, playerTime])

  const speakerSummary = useMemo(() => summarizeSpeakers(transcript?.segments ?? []), [transcript])
  const pendingChanges = useMemo(
    () => Object.values(segmentStates).filter((stateValue) => stateValue === 'dirty' || stateValue === 'saving').length,
    [segmentStates],
  )
  const errorCount = useMemo(
    () => Object.values(segmentStates).filter((stateValue) => stateValue === 'error').length,
    [segmentStates],
  )

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingChanges])

  const handleExportClipboard = () => {
    if (!transcript) return
    const text = transcript.segments
      .map((segment) => `[${formatTime(segment.start)} → ${formatTime(segment.end)}] ${segment.speaker}\n${segment.text}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    toast.success('Full transcript copied to clipboard.')
  }

  const handleExportJson = useCallback(() => {
    if (!transcript || !activeProjectId) {
      toast.error('No transcript to export.')
      return
    }

    const url = new URL(`/api/projects/${activeProjectId}/transcript-export`, window.location.origin)
    url.searchParams.set('transcriptId', transcript.id)
    const anchor = document.createElement('a')
    anchor.href = url.toString()
    anchor.click()
  }, [activeProjectId, transcript])

  const openSpeakerManager = useCallback((speaker: string) => {
    setSelectedSpeaker(speaker)
    setSpeakerRenameValue(speaker)
    setSpeakerDialogOpen(true)
  }, [])

  const jumpToActive = useCallback(() => {
    if (!activeSegmentId || !transcript) return
    const activeSegment = transcript.segments.find((segment) => segment.id === activeSegmentId)
    if (activeSegment) {
      seek(activeSegment.start)
    }
  }, [activeSegmentId, seek, transcript])

  const handleDelete = useCallback(
    async (segmentId: string) => {
      if (!transcript) return
      const previousSegments = transcript.segments
      const nextSegments = previousSegments.filter((segment) => segment.id !== segmentId)
      dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
      setSegmentStatus(segmentId, 'saving')
      try {
        await deleteSegmentAction(segmentId)
        setSegmentStates((prev) => {
          const next = { ...prev }
          delete next[segmentId]
          return next
        })
      } catch {
        dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
        setSegmentStatus(segmentId, 'error')
        toast.error('Failed to delete segment.')
      }
    },
    [dispatch, setSegmentStatus, transcript],
  )

  const handleAddAfter = useCallback(
    async (segment: TranscriptSegment) => {
      if (!transcript) return
      const newSegment: TranscriptSegment = {
        id: `seg-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        start: segment.end + 100,
        end: segment.end + 5000,
        text: '',
        speaker: segment.speaker,
        confidence: 1,
      }

      const previousSegments = transcript.segments
      const index = previousSegments.findIndex((entry) => entry.id === segment.id)
      const nextSegments = [...previousSegments]
      nextSegments.splice(index + 1, 0, newSegment)
      dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
      setSegmentStatus(newSegment.id, 'saving')
      try {
        await addSegmentAction(transcript.id, newSegment)
        setSegmentStatus(newSegment.id, 'saved')
      } catch {
        dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
        setSegmentStates((prev) => {
          const next = { ...prev }
          delete next[newSegment.id]
          return next
        })
        toast.error('Failed to add segment.')
      }
    },
    [dispatch, setSegmentStatus, transcript],
  )

  const handleMerge = useCallback(
    async (primaryId: string, secondaryId: string) => {
      if (!transcript) return
      const previousSegments = transcript.segments
      const firstIndex = previousSegments.findIndex((segment) => segment.id === primaryId)
      const secondIndex = previousSegments.findIndex((segment) => segment.id === secondaryId)
      if (firstIndex === -1 || secondIndex !== firstIndex + 1) {
        toast.error('Only adjacent transcript segments can be merged.')
        return
      }

      const mergedSegment = mergeTranscriptSegments(previousSegments[firstIndex], previousSegments[secondIndex])
      const nextSegments = [...previousSegments]
      nextSegments.splice(firstIndex, 2, mergedSegment)
      dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
      setSegmentStatus(primaryId, 'saving')
      setSegmentStates((prev) => {
        const next = { ...prev }
        delete next[secondaryId]
        return next
      })

      try {
        await mergeSegmentsAction(primaryId, secondaryId)
        setSegmentStatus(primaryId, 'saved')
      } catch (error) {
        dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
        setSegmentStatus(primaryId, 'error')
        toast.error(error instanceof Error ? error.message : 'Failed to merge segments.')
      }
    },
    [dispatch, setSegmentStatus, transcript],
  )

  const handleSplit = useCallback(
    async (segment: TranscriptSegment, splitIndex: number) => {
      if (!transcript) return
      const ids = {
        leftId: `${segment.id}-a-${Date.now()}`,
        rightId: `${segment.id}-b-${Date.now()}`,
      }
      const split = splitTranscriptSegment(segment, splitIndex, ids)
      if (!split) {
        toast.error('Place the cursor inside the segment text before splitting.')
        return
      }

      const previousSegments = transcript.segments
      const index = previousSegments.findIndex((entry) => entry.id === segment.id)
      if (index === -1) return
      const nextSegments = [...previousSegments]
      nextSegments.splice(index, 1, split.left, split.right)
      dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
      setSegmentStates((prev) => {
        const next = { ...prev }
        delete next[segment.id]
        next[split.left.id] = 'saving'
        next[split.right.id] = 'saving'
        return next
      })

      try {
        await splitSegmentAction(transcript.id, segment.id, splitIndex, ids)
        setSegmentStatus(split.left.id, 'saved')
        setSegmentStatus(split.right.id, 'saved')
      } catch (error) {
        dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
        setSegmentStates((prev) => {
          const next = { ...prev }
          delete next[split.left.id]
          delete next[split.right.id]
          next[segment.id] = 'error'
          return next
        })
        toast.error(error instanceof Error ? error.message : 'Failed to split segment.')
      }
    },
    [dispatch, setSegmentStatus, transcript],
  )

  const applySpeakerRename = useCallback(async () => {
    if (!transcript || !selectedSpeaker) return

    const trimmed = speakerRenameValue.trim()
    if (!trimmed || trimmed === selectedSpeaker) {
      return
    }

    const previousSegments = transcript.segments
    const nextSegments = renameSpeakerInSegments(previousSegments, selectedSpeaker, trimmed)
    dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
    setSpeakerRenameBusy(true)
    nextSegments
      .filter((segment, index) => segment.speaker !== previousSegments[index].speaker)
      .forEach((segment) => setSegmentStatus(segment.id, 'saving'))

    try {
      const result = await renameSpeakerAcrossTranscriptAction(transcript.id, selectedSpeaker, trimmed)
      if (result.updatedCount === 0) {
        dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
        toast.message('That speaker name was already up to date.')
      } else {
        nextSegments
          .filter((segment, index) => segment.speaker !== previousSegments[index].speaker)
          .forEach((segment) => setSegmentStatus(segment.id, 'saved'))
        toast.success(`Renamed ${selectedSpeaker} to ${trimmed}.`)
        setSelectedSpeaker(trimmed)
        setSpeakerRenameValue(trimmed)
        setSpeakerDialogOpen(false)
      }
    } catch (error) {
      dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
      nextSegments
        .filter((segment, index) => segment.speaker !== previousSegments[index].speaker)
        .forEach((segment) => setSegmentStatus(segment.id, 'error'))
      toast.error(error instanceof Error ? error.message : 'Failed to rename speaker.')
    } finally {
      setSpeakerRenameBusy(false)
    }
  }, [dispatch, selectedSpeaker, setSegmentStatus, speakerRenameValue, transcript])

  if (!transcript) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty className="max-w-lg border-border/60 bg-muted/10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No transcript available</EmptyTitle>
            <EmptyDescription>Import or generate a transcript to start editing timed dialogue and speaker labels.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Card className="m-4 mb-0 shrink-0 gap-0 border-border/60 bg-background/70 py-0 shadow-none">
        <CardHeader className="gap-3 px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="min-w-0">
              <InputGroup className="h-10 rounded-full bg-background">
                <InputGroupAddon align="inline-start" className="pl-4 pr-1">
                  <Search className="size-4" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Search transcript or speakers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-1 text-sm"
                />
                {searchTerm && (
                  <InputGroupAddon align="inline-end" className="pr-2">
                    <InputGroupButton
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear transcript search"
                    >
                      <X className="size-3" />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
            </div>
            <Badge variant="outline" className="h-9 w-fit rounded-full px-3 font-mono text-xs text-muted-foreground">
              {filtered.length} / {transcript.segments.length}
            </Badge>
            <div className="min-w-[7rem] text-left text-xs lg:text-right">
              {errorCount > 0 ? (
                <Badge variant="outline" className="rounded-full border-destructive/30 px-3 text-destructive">
                  {errorCount} errors
                </Badge>
              ) : pendingChanges > 0 ? (
                <Badge variant="outline" className="rounded-full px-3 text-muted-foreground">
                  {pendingChanges} pending
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full border-green-500/30 px-3 text-green-500">
                  All saved
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ButtonGroup className="flex-wrap">
              {activeSegmentId && (
                <Button variant="outline" size="sm" onClick={jumpToActive} className="h-9 gap-1 rounded-full px-3 text-xs">
                  <Crosshair className="size-3.5" />
                  Jump to active
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportClipboard} className="h-9 gap-1 rounded-full px-3 text-xs">
                <Copy className="size-3" />
                Copy all
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJson} className="h-9 gap-1 rounded-full px-3 text-xs">
                <Download className="size-3.5" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const firstSpeaker = speakerSummary[0]?.name ?? ''
                  setSelectedSpeaker((current) => current || firstSpeaker)
                  setSpeakerRenameValue((current) => current || firstSpeaker)
                  setSpeakerDialogOpen(true)
                }}
                className="h-9 gap-1 rounded-full px-3 text-xs"
              >
                <Users className="size-3.5" />
                Manage speakers
              </Button>
            </ButtonGroup>
            <div className="flex items-center gap-3 rounded-full border border-border/60 bg-background px-3 py-1.5">
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Word timings</span>
              <Switch
                checked={showWordTimings}
                onCheckedChange={setShowWordTimings}
                aria-label="Toggle per-word transcript timings"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="rounded-full px-3 text-[11px]">
              Speakers
            </Badge>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setSpeakerFilter(null)
              }}
              className={cn(
                'rounded-full border px-3 py-1 transition-colors',
                !searchTerm && !speakerFilter
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border hover:border-brand/40 hover:text-foreground',
              )}
            >
              All segments
            </button>
            {speakerSummary.map((speaker) => (
              <button
                key={speaker.name}
                type="button"
                onClick={() => {
                  setSpeakerFilter((current) => (current === speaker.name ? null : speaker.name))
                }}
                className={cn(
                  'rounded-full border px-3 py-1 transition-colors',
                  getSpeakerColorClass(speaker.name),
                  speakerFilter === speaker.name && 'ring-1 ring-brand/60',
                )}
              >
                {speaker.name} ({speaker.count})
              </button>
            ))}
            {(searchTerm || speakerFilter) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('')
                  setSpeakerFilter(null)
                }}
                className="h-7 rounded-full border border-border px-3 text-xs"
              >
                <FilterX className="size-3" />
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-4">
          {filtered.map((segment) => {
            const adjacentIds = getAdjacentSegmentIds(transcript.segments, segment.id)
            const previousSegment =
              adjacentIds.previousSegmentId != null
                ? transcript.segments.find((entry) => entry.id === adjacentIds.previousSegmentId) ?? null
                : null
            const nextSegment =
              adjacentIds.nextSegmentId != null
                ? transcript.segments.find((entry) => entry.id === adjacentIds.nextSegmentId) ?? null
                : null

            return (
              <SegmentRow
                key={segment.id}
                segment={segment}
                isActive={segment.id === activeSegmentId}
                saveState={segmentStates[segment.id] ?? 'idle'}
                previousMergeId={previousSegment?.speaker === segment.speaker ? previousSegment.id : null}
                nextMergeId={nextSegment?.speaker === segment.speaker ? nextSegment.id : null}
                onSeek={seek}
                onSegmentStatus={setSegmentStatus}
                onDelete={handleDelete}
                onAddAfter={handleAddAfter}
                onMerge={handleMerge}
                onSplit={handleSplit}
                onManageSpeaker={openSpeakerManager}
                showWordTimings={showWordTimings}
              />
            )
          })}
          {filtered.length === 0 && (
            <Empty className="border-border/60 bg-muted/10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilterX className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No matching segments</EmptyTitle>
                <EmptyDescription>Adjust the text search or speaker filter to bring transcript rows back into view.</EmptyDescription>
              </EmptyHeader>
              <div className="flex gap-2">
                {searchTerm && (
                  <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                    Clear search
                  </Button>
                )}
                {speakerFilter && (
                  <Button variant="outline" size="sm" onClick={() => setSpeakerFilter(null)}>
                    Show all speakers
                  </Button>
                )}
              </div>
            </Empty>
          )}
        </div>
      </ScrollArea>

      <SpeakerManagerDialog
        open={speakerDialogOpen}
        onOpenChange={setSpeakerDialogOpen}
        speakers={speakerSummary}
        selectedSpeaker={selectedSpeaker}
        renameValue={speakerRenameValue}
        onSelectSpeaker={(speaker) => {
          setSelectedSpeaker(speaker)
          setSpeakerRenameValue(speaker)
        }}
        onRenameValueChange={setSpeakerRenameValue}
        onApply={() => void applySpeakerRename()}
        busy={speakerRenameBusy}
      />
    </div>
  )
}
