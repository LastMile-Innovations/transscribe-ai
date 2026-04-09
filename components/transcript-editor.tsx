'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { FilterX, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useApp } from '@/lib/app-context'
import type { TranscriptSegment } from '@/lib/types'
import { cn } from '@/lib/utils'
import { clampPlaybackTime } from '@/lib/video-playback'
import {
  addSegmentAction,
  deleteSegmentAction,
  mergeSegmentsAction,
  renameSpeakerAcrossTranscriptAction,
  splitSegmentAction,
} from '@/lib/actions'
import {
  getAdjacentSegmentIds,
  getSpeakerColorClass,
  mergeTranscriptSegments,
  renameSpeakerInSegments,
  splitTranscriptSegment,
  summarizeSpeakers,
} from '@/lib/transcript-editing'
import { SegmentRow, SegmentSaveState, formatTime } from './transcript-segment-row'
import { SpeakerManagerDialog } from './speaker-manager-dialog'

import { TranscriptToolbar } from './transcript-toolbar'

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
  const projectDuration = state.projects.find((project) => project.id === activeProjectId)?.duration ?? 0

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
      const clamped = clampPlaybackTime(ms, projectDuration, state.trimRange)
      window.dispatchEvent(new CustomEvent('app:seek', { detail: { timeMs: clamped } }))
      dispatch({ type: 'SET_PLAYER_TIME', time: clamped })
    },
    [dispatch, projectDuration, state.trimRange],
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
      <TranscriptToolbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filteredCount={filtered.length}
        totalCount={transcript.segments.length}
        errorCount={errorCount}
        pendingChanges={pendingChanges}
        activeSegmentId={activeSegmentId}
        jumpToActive={jumpToActive}
        handleExportClipboard={handleExportClipboard}
        handleExportJson={handleExportJson}
        speakerSummary={speakerSummary}
        setSelectedSpeaker={setSelectedSpeaker}
        setSpeakerRenameValue={setSpeakerRenameValue}
        setSpeakerDialogOpen={setSpeakerDialogOpen}
        showWordTimings={showWordTimings}
        setShowWordTimings={setShowWordTimings}
        speakerFilter={speakerFilter}
        setSpeakerFilter={setSpeakerFilter}
      />

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3 pb-32">
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
            <Empty className="mt-8 border-border/40 bg-muted/5">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-muted/10 text-muted-foreground">
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
