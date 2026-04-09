'use client'

import { useCallback } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TrimRange, Overlay } from '@/lib/types'

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
}: {
  currentTime: number
  duration: number
  trimRange: TrimRange | null
  overlays: Overlay[]
  seek: (ms: number) => void
  formatTime: (ms: number) => string
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
      className="group relative cursor-pointer gap-0 rounded-xl border border-white/10 bg-white/[0.03] py-0 shadow-none"
      onClick={handleProgressClick}
      onTouchEnd={handleProgressClick}
    >
      <CardHeader className="mb-0 flex-row items-center justify-between px-3 py-3 text-[11px] uppercase tracking-[0.16em] text-white/45">
        <span>Timeline</span>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      </CardHeader>

      <CardContent className="relative px-3 pb-3">
        <div className="relative flex h-8 items-end gap-[2px] overflow-hidden rounded-md">
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
              'absolute bottom-3 top-8 overflow-hidden rounded-sm border text-left text-[10px] leading-none text-white/80 transition-colors',
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
          className="absolute bottom-3 top-8 h-auto w-0.5 bg-brand shadow-lg shadow-brand/50 transition-none"
          style={{ left: `${progressPct}%` }}
        >
          <div className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-brand ring-2 ring-background" />
        </div>

        {duration > 0 && (trimStartPct > 0 || trimEndPct < 100) && (
          <>
            <div
              className="pointer-events-none absolute inset-y-8 left-0 rounded-l-md bg-black/50"
              style={{ width: `${trimStartPct}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-8 right-0 rounded-r-md bg-black/50"
              style={{ width: `${100 - trimEndPct}%` }}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
