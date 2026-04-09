'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { useApp } from '@/lib/app-context'
import type { TranscriptSegment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateSegmentAction } from '@/lib/actions'
import { getSpeakerColorClass } from '@/lib/transcript-editing'

export type SegmentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const msRemaining = ms % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(Math.floor(msRemaining / 100))}`
}

export function ConfidenceBar({ value }: { value: number }) {
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

export function SaveStateBadge({ state }: { state: SegmentSaveState }) {
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

export const SegmentRow = React.memo(function SegmentRow({
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
    <div ref={rowRef} className="group/row">
      <Card
        className={cn(
          'relative gap-0 overflow-hidden border p-0 transition-all duration-300 shadow-none',
          isActive
            ? 'border-brand/40 bg-brand/[0.03] shadow-sm shadow-brand/5 ring-1 ring-brand/20'
            : 'border-border/40 bg-muted/10 hover:border-border/80 hover:bg-muted/30',
        )}
      >
        {isActive && <div className="absolute left-0 top-0 h-full w-0.5 bg-brand shadow-[0_0_8px_rgba(var(--brand),0.8)]" />}

        <CardContent className="space-y-2.5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSeek(segment.start)}
              className="shrink-0 rounded px-1 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
              title="Seek to start"
            >
              {formatTime(segment.start)}
            </button>
            <span className="text-[11px] text-muted-foreground/40">–</span>
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
                    className="h-7 rounded-full px-2.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:bg-muted/50"
                    title="Rename this speaker across the whole transcript"
                  >
                    all
                  </Button>
              </>
            )}

            <SaveStateBadge state={saveState} />

            <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 focus-within:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={handleCopy} className="size-8 rounded-full" aria-label="Copy segment">
                    <Copy className="size-3.5 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy segment</TooltipContent>
              </Tooltip>

              {previousMergeId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => onMerge(previousMergeId, segment.id)} className="size-8 rounded-full" aria-label="Merge with previous segment">
                      <Merge className="size-3.5 rotate-180 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Merge with previous</TooltipContent>
                </Tooltip>
              )}

              {nextMergeId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={() => onMerge(segment.id, nextMergeId)} className="size-8 rounded-full" aria-label="Merge with next segment">
                      <Merge className="size-3.5 text-muted-foreground" />
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
                    <Scissors className="size-3.5 text-muted-foreground" />
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
                    <Trash2 className="size-3.5" />
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
            className="min-h-[3rem] w-full resize-none border-transparent bg-transparent px-2 py-1.5 font-sans text-sm leading-relaxed text-foreground shadow-none focus-visible:border-brand/20 focus-visible:ring-1 focus-visible:ring-brand/30 focus-visible:bg-background/50 rounded-md transition-colors"
            placeholder="Transcript text..."
          />

          {showWordTimings && (
            <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.16em]">
                  Word timings
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">
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
                      className="rounded-lg border border-border/60 bg-background px-2 py-1 text-left font-mono text-[11px] transition-colors hover:border-brand/40 hover:bg-brand/5"
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
              <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px] font-mono text-muted-foreground">
                {Math.round(segment.confidence * 100)}% conf
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Shortcuts</span>
              <Kbd>Alt+Space</Kbd>
              <Kbd>Alt+J</Kbd>
              <Kbd>Alt+L</Kbd>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center py-1.5 opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => onAddAfter(segment)}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-border/80 bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand/5 hover:text-brand"
        >
          <Plus className="size-3.5" />
          Add segment
        </button>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.segment === nextProps.segment &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.saveState === nextProps.saveState &&
    prevProps.previousMergeId === nextProps.previousMergeId &&
    prevProps.nextMergeId === nextProps.nextMergeId &&
    prevProps.showWordTimings === nextProps.showWordTimings
  )
})
