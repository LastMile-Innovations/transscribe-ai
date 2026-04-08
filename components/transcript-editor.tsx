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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp } from '@/lib/app-context'
import type { TranscriptSegment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateSegmentAction, addSegmentAction, deleteSegmentAction, mergeSegmentsAction } from '@/lib/actions'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const msRemaining = ms % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(Math.floor(msRemaining / 100))}`
}

const SPEAKER_COLORS: Record<string, string> = {
  'Speaker A': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Speaker B': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Interviewer': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  'Candidate': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Host': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'Guest': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
}

function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker] ?? 'bg-muted text-muted-foreground border-border'
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

function SegmentRow({
  segment,
  index,
  isActive,
  isNextMergeable,
  nextSegmentId,
  onSeek,
  onSaveStatus,
}: {
  segment: TranscriptSegment
  index: number
  isActive: boolean
  isNextMergeable: boolean
  nextSegmentId: string | null
  onSeek: (ms: number) => void
  onSaveStatus: (status: 'saving' | 'saved' | 'error') => void
}) {
  const { state, dispatch } = useApp()
  const rowRef = useRef<HTMLDivElement>(null)
  const [editingSpeaker, setEditingSpeaker] = useState(false)
  const [speakerValue, setSpeakerValue] = useState(segment.speaker)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-scroll active segment into view
  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive])

  const updateText = useCallback(
    (text: string) => {
      dispatch({ type: 'UPDATE_SEGMENT', id: segment.id, updates: { text } })
      onSaveStatus('saving')
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        updateSegmentAction(segment.id, { text })
          .then(() => onSaveStatus('saved'))
          .catch(() => {
            onSaveStatus('error')
            toast.error('Failed to save segment text.')
          })
      }, 1000)
    },
    [dispatch, segment.id, onSaveStatus],
  )

  const commitSpeaker = useCallback(() => {
    const trimmed = speakerValue.trim()
    if (trimmed && trimmed !== segment.speaker) {
      dispatch({ type: 'UPDATE_SEGMENT', id: segment.id, updates: { speaker: trimmed } })
      onSaveStatus('saving')
      updateSegmentAction(segment.id, { speaker: trimmed })
        .then(() => onSaveStatus('saved'))
        .catch(() => {
          onSaveStatus('error')
          toast.error('Failed to save speaker.')
        })
    }
    setEditingSpeaker(false)
  }, [dispatch, segment.id, segment.speaker, speakerValue, onSaveStatus])

  const handleDelete = () => {
    dispatch({ type: 'DELETE_SEGMENT', id: segment.id })
    onSaveStatus('saving')
    deleteSegmentAction(segment.id)
      .then(() => onSaveStatus('saved'))
      .catch(() => {
        onSaveStatus('error')
        toast.error('Failed to delete segment.')
      })
  }

  const handleAddAfter = () => {
    const newSeg: TranscriptSegment = {
      id: `seg-new-${Date.now()}`,
      start: segment.end + 100,
      end: segment.end + 5000,
      text: '',
      speaker: segment.speaker,
      confidence: 1,
    }
    dispatch({ type: 'ADD_SEGMENT', segment: newSeg, afterId: segment.id })
    if (state.transcript) {
      onSaveStatus('saving')
      addSegmentAction(state.transcript.id, newSeg)
        .then(() => onSaveStatus('saved'))
        .catch(() => {
          onSaveStatus('error')
          toast.error('Failed to add segment.')
        })
    }
  }

  const handleMerge = () => {
    if (!nextSegmentId) return
    const nextSeg = state.transcript?.segments.find((s) => s.id === nextSegmentId)
    if (!nextSeg) return
    const mergedText = `${segment.text} ${nextSeg.text}`
    const mergedEnd = nextSeg.end
    const mergedConfidence = (segment.confidence + nextSeg.confidence) / 2
    dispatch({ type: 'MERGE_SEGMENTS', id1: segment.id, id2: nextSegmentId })
    onSaveStatus('saving')
    mergeSegmentsAction(segment.id, nextSegmentId, mergedText, mergedEnd, mergedConfidence)
      .then(() => onSaveStatus('saved'))
      .catch(() => {
        onSaveStatus('error')
        toast.error('Failed to merge segments.')
      })
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`[${formatTime(segment.start)} → ${formatTime(segment.end)}] ${segment.speaker}\n${segment.text}`)
    toast.success('Copied to clipboard.')
  }

  return (
    <div ref={rowRef}>
      <div
        className={cn(
          'group relative rounded-lg border p-3 transition-all duration-150',
          isActive
            ? 'border-brand/50 bg-brand/5 shadow-sm shadow-brand/10'
            : 'border-transparent bg-muted/30 hover:border-border hover:bg-muted/50',
        )}
      >
        {/* Active indicator */}
        {isActive && (
          <div className="absolute left-0 top-2 h-[calc(100%-16px)] w-0.5 rounded-full bg-brand" />
        )}

        {/* Header row */}
        <div className="mb-2 flex items-center gap-2 pl-2">
          {/* Timestamp — click to seek */}
          <button
            type="button"
            onClick={() => onSeek(segment.start)}
            className="shrink-0 font-mono text-xs text-muted-foreground hover:text-brand hover:bg-brand/10 px-1 py-0.5 rounded transition-colors"
            title="Seek to start"
          >
            {formatTime(segment.start)}
          </button>

          <span className="text-[10px] text-muted-foreground/40">–</span>

          <button
            type="button"
            onClick={() => onSeek(segment.end)}
            className="shrink-0 font-mono text-xs text-muted-foreground hover:text-brand hover:bg-brand/10 px-1 py-0.5 rounded transition-colors"
            title="Seek to end"
          >
            {formatTime(segment.end)}
          </button>

          {/* Speaker badge */}
          {editingSpeaker ? (
            <input
              autoFocus
              value={speakerValue}
              onChange={(e) => setSpeakerValue(e.target.value)}
              onBlur={commitSpeaker}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSpeaker()
                if (e.key === 'Escape') setEditingSpeaker(false)
              }}
              className="h-5 w-28 rounded border border-brand bg-background px-1.5 font-mono text-xs outline-none ring-1 ring-brand/30"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setSpeakerValue(segment.speaker); setEditingSpeaker(true) }}
              className={cn(
                'rounded border px-1.5 py-0.5 font-mono text-xs transition-opacity hover:opacity-80',
                getSpeakerColor(segment.speaker),
              )}
              title="Click to rename speaker"
            >
              {segment.speaker}
            </button>
          )}

          {/* Actions — visible on hover on desktop, always visible on mobile */}
          <div className="ml-auto flex items-center gap-0.5 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={handleCopy} className="size-6">
                  <Copy className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy segment</TooltipContent>
            </Tooltip>

            {isNextMergeable && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={handleMerge} className="size-6">
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
                  onClick={handleDelete}
                  className="size-6 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete segment</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Text editor */}
        <textarea
          value={segment.text}
          onChange={(e) => updateText(e.target.value)}
          rows={Math.max(2, Math.ceil(segment.text.length / 65))}
          className="w-full resize-none rounded bg-transparent pl-2 font-sans text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:bg-background/50 transition-colors"
          placeholder="Transcript text..."
        />

        <div className="pl-2">
          <ConfidenceBar value={segment.confidence} />
        </div>
      </div>

      {/* "Add segment" button between rows */}
      <div className="flex items-center justify-center py-0.5 opacity-100 md:opacity-0 transition-opacity md:hover:opacity-100 group/add">
        <button
          type="button"
          onClick={handleAddAfter}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-brand/50 hover:text-brand transition-colors"
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const transcript = state.transcript
  const playerTime = state.playerTime

  const seek = useCallback(
    (ms: number) => {
      window.dispatchEvent(new CustomEvent('app:seek', { detail: { timeMs: ms } }))
      dispatch({ type: 'SET_PLAYER_TIME', time: ms })
    },
    [dispatch],
  )

  const handleSaveStatus = useCallback((status: 'saving' | 'saved' | 'error') => {
    setSaveStatus(status)
    if (status === 'saved') {
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'saving') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveStatus])

  const handleExportClipboard = () => {
    if (!transcript) return
    const text = transcript.segments
      .map((s) => `[${formatTime(s.start)} → ${formatTime(s.end)}] ${s.speaker}\n${s.text}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    toast.success('Full transcript copied to clipboard.')
  }

  const filtered = useMemo(() => {
    if (!transcript) return []
    if (!searchTerm) return transcript.segments
    const lowerSearch = searchTerm.toLowerCase()
    return transcript.segments.filter(
      (s) =>
        s.text.toLowerCase().includes(lowerSearch) ||
        s.speaker.toLowerCase().includes(lowerSearch),
    )
  }, [transcript, searchTerm])

  const activeSegmentId = useMemo(() => {
    if (!transcript) return null
    return transcript.segments.find(
      (s) => playerTime >= s.start && playerTime <= s.end,
    )?.id
  }, [transcript, playerTime])

  if (!transcript) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No transcript available.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
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
        <Button variant="outline" size="sm" onClick={handleExportClipboard} className="h-7 px-2 text-xs">
          <Copy className="size-3 md:mr-1" />
          <span className="hidden md:inline">Copy all</span>
        </Button>
        <div className="flex items-center justify-center w-16 shrink-0">
          {saveStatus === 'saving' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>Saving</span>
            </div>
          )}
          {saveStatus === 'saved' && (
            <div className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 className="size-3" />
              <span>Saved</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3" />
              <span>Error</span>
            </div>
          )}
        </div>
      </div>

      {/* Segments */}
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-3">
          {filtered.map((seg, i) => {
            const nextSeg = filtered[i + 1] ?? null
            return (
              <SegmentRow
                key={seg.id}
                segment={seg}
                index={i}
                isActive={seg.id === activeSegmentId}
                isNextMergeable={nextSeg !== null && nextSeg.speaker === seg.speaker}
                nextSegmentId={nextSeg?.id ?? null}
                onSeek={seek}
                onSaveStatus={handleSaveStatus}
              />
            )
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No segments match your search.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
