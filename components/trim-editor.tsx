'use client'

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Scissors, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Deterministic bar heights for waveform preview
function waveBarHeight(index: number): number {
  return 0.15 + 0.7 * Math.abs(Math.sin(index * 2.7 + 1.3) * Math.cos(index * 0.5))
}

export function TrimEditor() {
  const { state, dispatch } = useApp()

  const duration = state.transcript?.totalDuration ?? state.projects.find(p => p.id === state.activeProjectId)?.duration ?? 0
  const trimRange = state.trimRange ?? { start: 0, end: duration }
  const currentTime = state.playerTime

  const setTrim = useCallback(
    (start: number, end: number) => {
      dispatch({ type: 'SET_TRIM', trimRange: { start, end } })
    },
    [dispatch],
  )

  const handleSliderChange = ([start, end]: number[]) => {
    setTrim(start, end)
  }

  const handleReset = () => {
    dispatch({ type: 'RESET_TRIM' })
    toast.success('Trim reset to full duration.')
  }

  const nudgeStart = (delta: number) => {
    const newStart = Math.max(0, Math.min(trimRange.start + delta, trimRange.end - 500))
    setTrim(newStart, trimRange.end)
  }

  const nudgeEnd = (delta: number) => {
    const newEnd = Math.max(trimRange.start + 500, Math.min(trimRange.end + delta, duration))
    setTrim(trimRange.start, newEnd)
  }

  const setInAtPlayhead = () => {
    const newStart = Math.min(currentTime, trimRange.end - 500)
    setTrim(newStart, trimRange.end)
    toast.success(`In-point set to ${formatTime(newStart)}`)
  }

  const setOutAtPlayhead = () => {
    const newEnd = Math.max(trimRange.start + 500, currentTime)
    setTrim(trimRange.start, newEnd)
    toast.success(`Out-point set to ${formatTime(newEnd)}`)
  }

  const trimDuration = trimRange.end - trimRange.start
  const removedStart = trimRange.start
  const removedEnd = duration - trimRange.end
  const BARS = 100

  const { startPct, endPct, currentPct } = useMemo(() => {
    return {
      startPct: duration > 0 ? (trimRange.start / duration) * 100 : 0,
      endPct: duration > 0 ? (trimRange.end / duration) * 100 : 100,
      currentPct: duration > 0 ? (currentTime / duration) * 100 : 0,
    }
  }, [duration, trimRange.start, trimRange.end, currentTime])

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Trim Workflow</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Mark the usable portion of the clip without leaving the editor.</h3>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { label: 'Total duration', value: formatTime(duration), sub: 'Original' },
              { label: 'Trim duration', value: formatTime(trimDuration), sub: 'Selected range', highlight: true },
              { label: 'Removed', value: formatTime(removedStart + removedEnd), sub: `${formatTime(removedStart)} start + ${formatTime(removedEnd)} end` },
            ].map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  'rounded-2xl border p-4 text-center',
                  stat.highlight ? 'border-brand/30 bg-brand/5' : 'border-border bg-muted/30',
                )}
              >
                <p className={cn('font-mono text-lg font-bold tabular-nums', stat.highlight && 'text-brand')}>
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Timeline</p>
            <div className="relative rounded-2xl border border-border bg-zinc-950 p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-white/60">
                <span>Selected region is bright. Removed sections stay shaded.</span>
                <span>{formatTime(trimRange.start)} to {formatTime(trimRange.end)}</span>
              </div>
              <div className="flex h-20 items-end gap-px">
                {Array.from({ length: BARS }, (_, i) => {
                  const barPct = i / BARS * 100
                  const inTrim = barPct >= startPct && barPct <= endPct
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t-[1px] transition-colors"
                      style={{
                        height: `${waveBarHeight(i) * 100}%`,
                        backgroundColor: inTrim
                          ? 'oklch(0.66 0.17 32 / 0.9)'
                          : 'rgb(255 255 255 / 0.08)',
                      }}
                    />
                  )
                })}
              </div>

              {/* Playhead */}
              {duration > 0 && (
                <div
                  className="pointer-events-none absolute bottom-0 top-4 w-px bg-brand"
                  style={{ left: `calc(16px + ${currentPct}% * (100% - 32px) / 100)` }}
                >
                  <div className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-brand" />
                </div>
              )}

              {/* Trim region shading */}
              {startPct > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-4 left-4 rounded-l-sm bg-black/60"
                  style={{ width: `calc(${startPct}% * (100% - 32px) / 100)` }}
                />
              )}
              {endPct < 100 && (
                <div
                  className="pointer-events-none absolute inset-y-4 right-4 rounded-r-sm bg-black/60"
                  style={{ width: `calc(${100 - endPct}% * (100% - 32px) / 100)` }}
                />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Trim range</p>
              <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 gap-1 rounded-full px-3 text-xs">
                <RotateCcw className="size-3" />
                Reset
              </Button>
            </div>
            <div onDoubleClick={handleReset} title="Double-click to reset trim">
              {duration > 0 ? (
                <Slider
                  min={0}
                  max={duration}
                  step={100}
                  value={[trimRange.start, trimRange.end]}
                  onValueChange={handleSliderChange}
                  className="cursor-pointer [&_[data-slot=slider-range]]:bg-brand [&_[data-slot=slider-thumb]]:size-4"
                />
              ) : (
                <div className="h-4 rounded-full bg-muted" />
              )}
            </div>
            <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>{formatTime(0)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In point</span>
                <span className="font-mono text-sm font-bold text-foreground">{formatTime(trimRange.start)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" className="size-9 rounded-full" onClick={() => nudgeStart(-1000)}>
                  <ChevronLeft className="size-3" />
                </Button>
                <Button variant="outline" size="sm" className="h-9 flex-1 rounded-full text-xs" onClick={setInAtPlayhead}>
                  <Scissors className="size-3" />
                  Set at playhead
                </Button>
                <Button variant="outline" size="icon-sm" className="size-9 rounded-full" onClick={() => nudgeStart(1000)}>
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Out point</span>
                <span className="font-mono text-sm font-bold text-foreground">{formatTime(trimRange.end)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" className="size-9 rounded-full" onClick={() => nudgeEnd(-1000)}>
                  <ChevronLeft className="size-3" />
                </Button>
                <Button variant="outline" size="sm" className="h-9 flex-1 rounded-full text-xs" onClick={setOutAtPlayhead}>
                  <Scissors className="size-3" />
                  Set at playhead
                </Button>
                <Button variant="outline" size="icon-sm" className="size-9 rounded-full" onClick={() => nudgeEnd(1000)}>
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How trim works</p>
            <p className="mt-1 leading-relaxed">
              Drag the slider handles or use &ldquo;Set at playhead&rdquo; to define the in and out points of your video.
              Nudge controls move in/out points by 1 second at a time.
              The playback will loop within the trim range.
              Grayed-out regions in the timeline indicate trimmed content.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
