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
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonGroup className="rounded-full border border-white/10 bg-white/[0.05] p-1.5 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={skipBack}
          className="size-8 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
          aria-label="Skip back 5 seconds"
        >
          <SkipBack className="size-3.5" />
        </Button>

        <Button
          size="icon"
          onClick={togglePlay}
          className="size-10 rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/20 transition-transform hover:scale-105 hover:bg-brand/90"
          aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={skipForward}
          className="size-8 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
          aria-label="Skip forward 5 seconds"
        >
          <SkipForward className="size-3.5" />
        </Button>
      </ButtonGroup>

      <Card className="min-w-[10rem] gap-0 rounded-2xl border border-white/10 bg-white/[0.05] py-0 font-mono text-xs font-medium tracking-wider text-white/85 shadow-none">
        <CardContent className="px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span>Current</span>
            <span>{formatTime(currentTime)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-white/55">
            <span>Duration</span>
            <span>{formatTime(duration)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="ml-auto gap-0 rounded-2xl border border-white/10 bg-white/[0.05] py-0 shadow-none backdrop-blur-md">
        <CardContent className="flex items-center gap-2 px-2 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMuted(!muted)}
            className="size-8 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
            aria-label={muted || volume === 0 ? 'Unmute video' : 'Mute video'}
          >
            {muted || volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
          <div className="w-24 pr-3">
            <Slider
              min={0}
              max={100}
              step={1}
              value={[muted ? 0 : volume]}
              onValueChange={([v]) => {
                setVolume(v)
                setMuted(v === 0)
              }}
              className="[&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-white hover:[&_[data-slot=slider-thumb]]:scale-110 transition-transform"
            />
          </div>
          <Separator orientation="vertical" className="h-4 bg-white/20" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={fullscreen}
            className="size-8 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
            aria-label="Toggle fullscreen"
          >
            <Maximize className="size-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
