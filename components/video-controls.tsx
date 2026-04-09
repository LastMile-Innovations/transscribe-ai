'use client'

import { Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const chromeBtn =
  'text-[color:var(--editor-video-chrome-fg)] hover:bg-[color:var(--editor-video-controls-bg)] hover:text-[color:var(--editor-video-chrome-fg)]'

export function VideoControls({
  isPlaying,
  togglePlay,
  skipBack,
  skipForward,
  currentTime,
  duration,
  previewTime,
  isScrubbing,
  muted,
  setMuted,
  volume,
  setVolume,
  fullscreen,
  formatTime,
  compact = false,
}: {
  isPlaying: boolean
  togglePlay: () => void
  skipBack: () => void
  skipForward: () => void
  currentTime: number
  duration: number
  previewTime: number | null
  isScrubbing: boolean
  muted: boolean
  setMuted: (muted: boolean) => void
  volume: number
  setVolume: (volume: number) => void
  fullscreen: () => void
  formatTime: (ms: number) => string
  compact?: boolean
}) {
  const primaryTime = previewTime ?? currentTime
  const timeLabel = isScrubbing ? 'Scrubbing' : previewTime != null ? 'Preview' : 'Playhead'

  return (
    <div className={cn('flex flex-wrap items-center gap-3', compact && 'gap-2')}>
      <ButtonGroup
        className={cn(
          'rounded-full border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] p-1 backdrop-blur-md',
          compact && 'p-0.5',
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={skipBack}
          className={cn('rounded-full', chromeBtn, compact ? 'size-7' : 'size-8')}
          aria-label="Skip back 5 seconds"
        >
          <SkipBack className={cn(compact ? 'size-3' : 'size-3.5')} />
        </Button>

        <Button
          size="icon"
          onClick={togglePlay}
          className={cn(
            'rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/20 transition-transform hover:scale-105 hover:bg-brand/90',
            compact ? 'size-9' : 'size-10',
          )}
          aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={skipForward}
          className={cn('rounded-full', chromeBtn, compact ? 'size-7' : 'size-8')}
          aria-label="Skip forward 5 seconds"
        >
          <SkipForward className={cn(compact ? 'size-3' : 'size-3.5')} />
        </Button>
      </ButtonGroup>

      <div
        className={cn(
          'rounded-full border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] px-3 py-2 text-[color:var(--editor-video-chrome-fg)]',
          compact ? 'min-w-[7.5rem] px-2.5 py-1.5' : 'min-w-[11rem]',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--editor-video-chrome-muted)]',
              compact && 'tracking-[0.12em]',
            )}
          >
            {timeLabel}
          </span>
          <span className={cn('font-mono tabular-nums', compact ? 'text-[10px]' : 'text-xs')}>
            {formatTime(primaryTime)}
          </span>
        </div>
        {!compact && (
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--editor-video-chrome-muted)]">
              Total
            </span>
            <span className="font-mono text-xs tabular-nums text-[color:var(--editor-video-chrome-muted)]">
              {formatTime(duration)}
            </span>
          </div>
        )}
      </div>

      <div
        className={cn(
          'ml-auto flex items-center gap-2 rounded-full border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] px-2 py-1.5 shadow-none backdrop-blur-md',
          compact && 'px-1.5 py-1',
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMuted(!muted)}
          className={cn('rounded-full', chromeBtn, compact ? 'size-7' : 'size-8')}
          aria-label={muted || volume === 0 ? 'Unmute video' : 'Mute video'}
        >
          {muted || volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Button>
        <div className={cn(compact ? 'w-14 pr-1' : 'w-20 pr-2')}>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[muted ? 0 : volume]}
            onValueChange={([v]) => {
              setVolume(v)
              setMuted(v === 0)
            }}
            className="[&_[data-slot=slider-range]]:bg-[color:var(--editor-video-chrome-fg)] [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-[color:var(--editor-video-chrome-fg)] hover:[&_[data-slot=slider-thumb]]:scale-110 transition-transform"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fullscreen}
          className={cn('rounded-full', chromeBtn, compact ? 'size-7' : 'size-8')}
          aria-label="Toggle fullscreen"
        >
          <Maximize className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
