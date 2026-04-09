'use client'

import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
  muted: boolean
  setMuted: (muted: boolean) => void
  volume: number
  setVolume: (volume: number) => void
  fullscreen: () => void
  formatTime: (ms: number) => string
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', compact && 'gap-2')}>
      <ButtonGroup
        className={cn(
          'rounded-full border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] p-1.5 backdrop-blur-md',
          compact && 'p-1',
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={skipBack}
          className={cn('size-8 rounded-full', chromeBtn)}
          aria-label="Skip back 5 seconds"
        >
          <SkipBack className={cn('size-3.5', compact && 'size-3')} />
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
          className={cn('size-8 rounded-full', chromeBtn)}
          aria-label="Skip forward 5 seconds"
        >
          <SkipForward className={cn('size-3.5', compact && 'size-3')} />
        </Button>
      </ButtonGroup>

      {!compact && (
        <Card className="min-w-[10rem] gap-0 rounded-2xl border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] py-0 font-mono text-xs font-medium tracking-wider text-[color:var(--editor-video-chrome-fg)] shadow-none">
          <CardContent className="px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span>Current</span>
              <span>{formatTime(currentTime)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[color:var(--editor-video-chrome-muted)]">
              <span>Duration</span>
              <span>{formatTime(duration)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {compact && (
        <span className="font-mono text-[10px] text-[color:var(--editor-video-chrome-muted)]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      )}

      <Card className="ml-auto gap-0 rounded-2xl border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] py-0 shadow-none backdrop-blur-md">
        <CardContent className={cn('flex items-center gap-2 px-2 py-2', compact && 'px-1.5 py-1.5')}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMuted(!muted)}
            className={cn('rounded-full', chromeBtn, compact ? 'size-7' : 'size-8')}
            aria-label={muted || volume === 0 ? 'Unmute video' : 'Mute video'}
          >
            {muted || volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
          <div className={cn('pr-3', compact ? 'w-16' : 'w-24')}>
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
          <Separator orientation="vertical" className="h-4 bg-[color:var(--editor-video-border)]" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={fullscreen}
            className={cn('rounded-full', chromeBtn, compact ? 'size-7' : 'size-8')}
            aria-label="Toggle fullscreen"
          >
            <Maximize className="size-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
