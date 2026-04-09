'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Scissors, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TrimRange, TextOverlay } from '@/lib/types'
import { buildTimelineOverlayMarkers, getTimelinePointerTime } from '@/lib/video-playback'

export function VideoTimeline({
  currentTime,
  duration,
  trimRange,
  overlays,
  seek,
  isScrubbing,
  previewTime,
  onPreviewChange,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
  formatTime,
  compact = false,
}: {
  currentTime: number
  duration: number
  trimRange: TrimRange | null
  overlays: TextOverlay[]
  seek: (ms: number) => void
  isScrubbing: boolean
  previewTime: number | null
  onPreviewChange: (ms: number | null) => void
  onScrubStart: (ms: number) => void
  onScrubChange: (ms: number) => void
  onScrubEnd: (ms: number) => void
  formatTime: (ms: number) => string
  compact?: boolean
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const pointerIdRef = useRef<number | null>(null)
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)
  const [previewClamped, setPreviewClamped] = useState(false)

  const trimStartPct = duration > 0 ? ((trimRange?.start ?? 0) / duration) * 100 : 0
  const trimEndPct = duration > 0 ? ((trimRange?.end ?? duration) / duration) * 100 : 100
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const playedLeftPct = trimRange ? trimStartPct : 0
  const playedWidthPct = Math.max(0, playheadPct - playedLeftPct)
  const markers = buildTimelineOverlayMarkers(overlays, duration, trimRange, currentTime)

  const setPreviewFromClientX = useCallback(
    (clientX: number) => {
      const rail = railRef.current
      if (!rail) return null

      const next = getTimelinePointerTime(clientX, rail.getBoundingClientRect(), duration, trimRange)
      setPreviewRatio(next.ratio)
      setPreviewClamped(next.clampedByTrim)
      onPreviewChange(next.time)
      return next
    },
    [duration, onPreviewChange, trimRange],
  )

  const clearPreview = useCallback(() => {
    setPreviewRatio(null)
    setPreviewClamped(false)
    onPreviewChange(null)
  }, [onPreviewChange])

  useEffect(() => {
    return () => {
      onPreviewChange(null)
    }
  }, [onPreviewChange])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (duration <= 0) return

      e.preventDefault()
      pointerIdRef.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)

      const next = setPreviewFromClientX(e.clientX)
      if (!next) return
      onScrubStart(next.time)
    },
    [duration, onScrubStart, setPreviewFromClientX],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (duration <= 0) return

      const next = setPreviewFromClientX(e.clientX)
      if (!next) return

      if (pointerIdRef.current === e.pointerId) {
        onScrubChange(next.time)
      }
    },
    [duration, onScrubChange, setPreviewFromClientX],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return

      const next = setPreviewFromClientX(e.clientX)
      pointerIdRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }

      onScrubEnd(next?.time ?? currentTime)
      clearPreview()
    },
    [clearPreview, currentTime, onScrubEnd, setPreviewFromClientX],
  )

  const handlePointerLeave = useCallback(() => {
    if (pointerIdRef.current != null) return
    clearPreview()
  }, [clearPreview])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return

      const delta = e.shiftKey ? 10_000 : 5_000
      let nextTime: number | null = null

      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        nextTime = currentTime - delta
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        nextTime = currentTime + delta
      } else if (e.key === 'Home') {
        nextTime = trimRange?.start ?? 0
      } else if (e.key === 'End') {
        nextTime = trimRange?.end ?? duration
      }

      if (nextTime == null) return

      e.preventDefault()
      clearPreview()
      seek(nextTime)
    },
    [clearPreview, currentTime, duration, seek, trimRange],
  )

  const previewLabel = previewTime != null ? formatTime(previewTime) : formatTime(currentTime)
  const previewLeft = previewRatio != null ? previewRatio * 100 : previewTime != null && duration > 0 ? (previewTime / duration) * 100 : null

  return (
    <Card
      className={cn(
        'gap-0 border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-timeline-bg)] py-0 shadow-none',
        compact ? 'rounded-lg' : 'rounded-xl',
      )}
    >
      <CardHeader
        className={cn(
          'mb-0 flex-row items-center justify-between gap-3',
          compact ? 'px-2 py-1.5' : 'px-3 py-3',
        )}
      >
        <div className="flex items-center gap-2">
          {!compact && (
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--editor-video-chrome-muted)]">
              Timeline
            </span>
          )}
          {trimRange && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--editor-video-chrome-muted)]">
              <Scissors className="size-3" />
              Trim aware
            </span>
          )}
        </div>

        <div className="text-right">
          <div className="font-mono text-xs tabular-nums text-[color:var(--editor-video-chrome-fg)]">{previewLabel}</div>
          {!compact && (
            <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--editor-video-chrome-muted)]">
              {isScrubbing ? 'Scrubbing' : previewTime != null ? 'Preview' : `of ${formatTime(duration)}`}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className={cn('space-y-3', compact ? 'px-2 pb-2' : 'px-3 pb-3')}>
        <div className={cn('relative', compact ? 'h-5' : 'h-6')}>
          {markers.map((marker) => (
            <button
              key={marker.id}
              type="button"
              className={cn(
                'absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-full border px-1.5 text-left text-[10px] leading-none transition-colors',
                compact ? 'h-2.5 min-w-2.5 justify-center px-0' : 'h-4',
                marker.active
                  ? 'border-sky-200/80 bg-sky-300/35 text-[color:var(--editor-video-chrome-fg)]'
                  : 'border-sky-200/25 bg-sky-300/15 text-[color:var(--editor-video-chrome-muted)] hover:bg-sky-300/25',
              )}
              style={{ left: `${marker.left}%`, width: `${marker.width}%` }}
              onClick={() => seek(marker.startTime)}
              title={`${marker.label} at ${formatTime(marker.startTime)}`}
              aria-label={`Seek to overlay ${marker.label}`}
            >
              {compact ? null : (
                <>
                  <Sparkles className="mr-1 size-2.5 shrink-0" />
                  <span className="truncate">{marker.label}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <div
          ref={railRef}
          className={cn(
            'relative touch-none select-none rounded-2xl border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)]',
            compact ? 'h-12' : 'h-16',
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          role="slider"
          tabIndex={0}
          aria-label="Video timeline"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          aria-valuetext={formatTime(currentTime)}
          onKeyDown={handleKeyDown}
        >
          <div className={cn('absolute inset-x-3 rounded-full bg-white/6', compact ? 'top-1/2 h-2 -translate-y-1/2' : 'top-8 h-2.5')}>
            <div className="absolute inset-0 rounded-full bg-white/6" />

            <div
              className="absolute inset-y-0 rounded-full bg-white/14 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
              style={{ left: `${trimStartPct}%`, width: `${Math.max(0, trimEndPct - trimStartPct)}%` }}
            />

            <div
              className="absolute inset-y-0 rounded-full bg-brand shadow-[0_0_22px_rgba(244,114,35,0.35)]"
              style={{ left: `${playedLeftPct}%`, width: `${playedWidthPct}%` }}
            />

            {trimStartPct > 0 && (
              <div className="absolute inset-y-0 left-0 rounded-full bg-black/50" style={{ width: `${trimStartPct}%` }} />
            )}
            {trimEndPct < 100 && (
              <div className="absolute inset-y-0 right-0 rounded-full bg-black/50" style={{ width: `${100 - trimEndPct}%` }} />
            )}
          </div>

          {previewLeft != null && (
            <div
              className="pointer-events-none absolute bottom-2 top-2"
              style={{ left: `${previewLeft}%` }}
            >
              <div
                className={cn(
                  'absolute inset-y-2 -translate-x-1/2 border-l',
                  previewClamped ? 'border-amber-300/80' : 'border-white/30',
                )}
              />
              <div
                className={cn(
                  'absolute left-1/2 top-0 -translate-x-1/2 rounded-full px-2 py-1 font-mono text-[10px] tabular-nums shadow-lg',
                  previewClamped
                    ? 'bg-amber-300 text-black'
                    : 'bg-[color:var(--editor-video-controls-bg)] text-[color:var(--editor-video-chrome-fg)]',
                )}
              >
                {previewLabel}
              </div>
            </div>
          )}

          <div
            className="pointer-events-none absolute bottom-2 top-2"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="absolute inset-y-1 -translate-x-1/2 border-l border-brand shadow-[0_0_18px_rgba(244,114,35,0.35)]" />
            <div
              className={cn(
                'absolute left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-[color:var(--brand)] shadow-[0_0_18px_rgba(244,114,35,0.45)]',
                compact ? 'top-1/2 size-4 -translate-y-1/2' : 'top-7 size-5',
              )}
            />
          </div>

          <div className="absolute inset-x-3 bottom-2 flex items-center justify-between font-mono text-[10px] tabular-nums text-[color:var(--editor-video-chrome-muted)]">
            <span>{formatTime(trimRange?.start ?? 0)}</span>
            <span>{formatTime(trimRange?.end ?? duration)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
