'use client'

import { useCallback } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TrimRange, TextOverlay } from '@/lib/types'

const WAVEFORM_BARS = 80

function waveBarHeight(index: number, total: number): number {
  const x = Math.sin(index * 2.3 + total * 0.7) * 0.5 + 0.5
  const y = Math.sin(index * 5.1) * 0.3 + 0.3
  return Math.max(0.15, Math.min(1, x * 0.6 + y * 0.4))
}

export function VideoTimeline({
  currentTime,
  duration,
  trimRange,
  overlays,
  seek,
  formatTime,
  compact = false,
}: {
  currentTime: number
  duration: number
  trimRange: TrimRange | null
  overlays: TextOverlay[]
  seek: (ms: number) => void
  formatTime: (ms: number) => string
  compact?: boolean
}) {
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const clientX = 'touches' in e ? e.changedTouches[0]?.clientX : e.clientX
      if (clientX === undefined) return
      const ratio = (clientX - rect.left) / rect.width
      seek(Math.round(ratio * duration))
    },
    [seek, duration],
  )

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const trimStartPct = duration > 0 ? ((trimRange?.start ?? 0) / duration) * 100 : 0
  const trimEndPct = duration > 0 ? ((trimRange?.end ?? duration) / duration) * 100 : 100

  const overlayMarkerPositions = duration > 0
    ? overlays.map((overlay) => ({
        id: overlay.id,
        left: (overlay.startTime / duration) * 100,
        width: Math.max(1.5, ((overlay.endTime - overlay.startTime) / duration) * 100),
        label: overlay.text.trim() || 'Overlay',
        active: currentTime >= overlay.startTime && currentTime <= overlay.endTime,
        startTime: overlay.startTime,
      }))
    : []

  return (
    <Card
      className={cn(
        'group relative cursor-pointer gap-0 border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-timeline-bg)] py-0 shadow-none',
        compact ? 'rounded-lg' : 'rounded-xl',
      )}
      onClick={handleProgressClick}
      onTouchEnd={handleProgressClick}
    >
      <CardHeader
        className={cn(
          'mb-0 flex-row items-center justify-between text-[11px] uppercase tracking-[0.16em] text-[color:var(--editor-video-chrome-muted)]',
          compact ? 'px-2 py-1.5 text-[10px] normal-case tracking-normal' : 'px-3 py-3',
        )}
      >
        {!compact && <span>Timeline</span>}
        <span className={cn(compact && 'w-full text-center')}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </CardHeader>

      <CardContent className={cn('relative', compact ? 'px-2 pb-2' : 'px-3 pb-3')}>
        <div className={cn('relative flex items-end gap-[2px] overflow-hidden rounded-md', compact ? 'h-6' : 'h-8')}>
          {Array.from({ length: WAVEFORM_BARS }, (_, i) => {
            const barPct = (i / WAVEFORM_BARS) * 100
            const isInTrim = barPct >= trimStartPct && barPct <= trimEndPct
            const isPast = barPct <= progressPct
            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-colors"
                style={{
                  height: `${waveBarHeight(i, WAVEFORM_BARS) * 100}%`,
                  backgroundColor: isPast
                    ? isInTrim ? 'oklch(0.66 0.17 32)' : 'rgb(251 146 60 / 0.35)'
                    : isInTrim ? 'rgb(255 255 255 / 0.28)' : 'rgb(255 255 255 / 0.08)',
                }}
              />
            )
          })}
        </div>

        {overlayMarkerPositions.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={cn(
              'absolute overflow-hidden rounded-sm border text-left text-[10px] leading-none text-[color:var(--editor-video-chrome-fg)] transition-colors',
              compact ? 'bottom-2 top-6' : 'bottom-3 top-8',
              marker.active
                ? 'border-sky-200/80 bg-sky-300/30'
                : 'border-sky-200/30 bg-sky-300/15 hover:bg-sky-300/25',
            )}
            style={{ left: `${marker.left}%`, width: `${marker.width}%` }}
            onClick={(e) => {
              e.stopPropagation()
              seek(marker.startTime)
            }}
            title={`${marker.label} at ${formatTime(marker.startTime)}`}
            aria-label={`Seek to overlay ${marker.label}`}
          >
            <span className="block truncate px-1.5 pt-0.5">{marker.label}</span>
          </button>
        ))}

        <div
          className={cn(
            'absolute h-auto w-0.5 bg-brand shadow-lg shadow-brand/50 transition-none',
            compact ? 'bottom-2 top-6' : 'bottom-3 top-8',
          )}
          style={{ left: `${progressPct}%` }}
        >
          <div
            className={cn(
              'absolute left-1/2 -translate-x-1/2 rounded-full bg-brand ring-2 ring-background',
              compact ? '-top-0.5 size-2.5' : '-top-1 size-3',
            )}
          />
        </div>

        {duration > 0 && (trimStartPct > 0 || trimEndPct < 100) && (
          <>
            <div
              className={cn(
                'pointer-events-none absolute left-0 rounded-l-md bg-black/50',
                compact ? 'inset-y-6' : 'inset-y-8',
              )}
              style={{ width: `${trimStartPct}%` }}
            />
            <div
              className={cn(
                'pointer-events-none absolute right-0 rounded-r-md bg-black/50',
                compact ? 'inset-y-6' : 'inset-y-8',
              )}
              style={{ width: `${100 - trimEndPct}%` }}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
