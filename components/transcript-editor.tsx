'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  Merge,
  Copy,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Scissors,
  Users,
  Crosshair,
  FilterX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  const color = pct >= 90 ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/50">
          <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{pct}% confidence</TooltipContent>
    </Tooltip>
  )
}

function SaveStateBadge({ state }: { state: SegmentSaveState }) {
  if (state === 'idle') return null

  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Saving
      </span>
    )
  }

  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 px-1.5 py-0.5 text-[10px] text-green-500">
        <CheckCircle2 className="size-3" />
        Saved
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 px-1.5 py-0.5 text-[10px] text-destructive">
        <AlertCircle className="size-3" />
        Error
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-500">
      <Loader2 className="size-3" />
      Unsaved
    </span>
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
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Pick a speaker, rename them once, and every matching segment will update together.
          </div>
          <div className="space-y-2">
            <Label>Current speakers</Label>
            <div className="flex flex-wrap gap-2">
              {speakers.map((speaker) => (
                <button
                  key={speaker.name}
                  type="button"
                  onClick={() => onSelectSpeaker(speaker.name)}
                  className={cn(
                    'rounded-full border px-2 py-1 text-xs transition-colors',
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="speaker-rename-input">Rename selected speaker across transcript</Label>
            <Input
              id="speaker-rename-input"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              placeholder="Enter the new speaker name"
            />
          </div>
        </div>
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
      <div
        className={cn(
          'relative rounded-lg border p-3 transition-all duration-150',
          isActive
            ? 'border-brand/50 bg-brand/5 shadow-sm shadow-brand/10'
            : 'border-transparent bg-muted/30 hover:border-border hover:bg-muted/50',
        )}
      >
        {isActive && <div className="absolute left-0 top-2 h-[calc(100%-16px)] w-0.5 rounded-full bg-brand" />}

        <div className="mb-2 flex flex-wrap items-center gap-2 pl-2">
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
            <input
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
              className="h-5 w-32 rounded border border-brand bg-background px-1.5 font-mono text-xs outline-none ring-1 ring-brand/30"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setSpeakerValue(segment.speaker)
                  setEditingSpeaker(true)
                }}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-xs transition-opacity hover:opacity-80',
                  getSpeakerColorClass(segment.speaker),
                )}
                title="Click to rename this segment speaker"
              >
                {segment.speaker}
              </button>
              <button
                type="button"
                onClick={() => onManageSpeaker(segment.speaker)}
                className="rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Rename this speaker across the whole transcript"
              >
                all
              </button>
            </>
          )}

          <SaveStateBadge state={saveState} />

          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleCopy} className="size-6">
                  <Copy className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy segment</TooltipContent>
            </Tooltip>

            {previousMergeId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => onMerge(previousMergeId, segment.id)} className="size-6">
                    <Merge className="size-3 rotate-180" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Merge with previous</TooltipContent>
              </Tooltip>
            )}

            {nextMergeId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => onMerge(segment.id, nextMergeId)} className="size-6">
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
                  className="size-6"
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
                  className="size-6 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete segment</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={(e) => scheduleTextSave(e.target.value)}
          onBlur={() => void flushTextSave(draftTextRef.current)}
          rows={Math.max(2, Math.ceil(Math.max(draftText.length, 1) / 65))}
          className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 font-sans text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground transition-colors focus:border-brand/20 focus:bg-background/70"
          placeholder="Transcript text..."
        />

        <div className="flex items-center justify-between gap-2 pl-2">
          <ConfidenceBar value={segment.confidence} />
          <p className="text-[10px] text-muted-foreground">Use `Alt+Space`, `Alt+J`, or `Alt+L` while typing.</p>
        </div>
      </div>

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
  const [segmentStates, setSegmentStates] = useState<Record<string, SegmentSaveState>>({})
  const [speakerDialogOpen, setSpeakerDialogOpen] = useState(false)
  const [selectedSpeaker, setSelectedSpeaker] = useState('')
  const [speakerRenameValue, setSpeakerRenameValue] = useState('')
  const [speakerRenameBusy, setSpeakerRenameBusy] = useState(false)
  const resetTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const transcript = state.transcript
  const playerTime = state.playerTime

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
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No transcript available.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="search"
              placeholder="Search transcript..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 w-full rounded-md border border-input bg-transparent pl-2.5 pr-6 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/50"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm opacity-50 hover:opacity-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {transcript.segments.length}
          </span>
          {activeSegmentId && (
            <Button variant="outline" size="sm" onClick={jumpToActive} className="h-7 gap-1 px-2 text-xs">
              <Crosshair className="size-3.5" />
              <span className="hidden md:inline">Jump to active</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportClipboard} className="h-7 px-2 text-xs">
            <Copy className="size-3 md:mr-1" />
            <span className="hidden md:inline">Copy all</span>
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
            className="h-7 gap-1 px-2 text-xs"
          >
            <Users className="size-3.5" />
            <span className="hidden md:inline">Manage speakers</span>
          </Button>
          <div className="w-28 shrink-0 text-right text-xs">
            {errorCount > 0 ? (
              <span className="text-destructive">{errorCount} errors</span>
            ) : pendingChanges > 0 ? (
              <span className="text-muted-foreground">{pendingChanges} pending</span>
            ) : (
              <span className="text-green-500">All saved</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Filters:</span>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('')
              setSpeakerFilter(null)
            }}
            className={cn(
              'rounded-full border px-2 py-0.5 transition-colors',
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
                'rounded-full border px-2 py-0.5 transition-colors',
                getSpeakerColorClass(speaker.name),
                speakerFilter === speaker.name && 'ring-1 ring-brand/60',
              )}
            >
              {speaker.name} ({speaker.count})
            </button>
          ))}
          {(searchTerm || speakerFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setSpeakerFilter(null)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:border-brand/40 hover:text-foreground"
            >
              <FilterX className="size-3" />
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-muted-foreground">Current view</p>
            <p className="font-medium text-foreground">
              {speakerFilter ? `${speakerFilter} segments` : 'All speakers'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-muted-foreground">Editing flow</p>
            <p className="font-medium text-foreground">Click speaker for one row, use “Manage speakers” for all rows</p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-muted-foreground">Keyboard</p>
            <p className="font-medium text-foreground">`/` to search, `Alt+Space/J/L` while typing</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-3">
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
              />
            )
          })}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">No segments match the current search or speaker filter.</p>
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
            </div>
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
