'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
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
import { Slider } from '@/components/ui/slider'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Deterministic pseudo-random waveform heights based on index
function waveBarHeight(index: number, total: number): number {
  const x = Math.sin(index * 2.3 + total * 0.7) * 0.5 + 0.5
  const y = Math.sin(index * 5.1) * 0.3 + 0.3
  return Math.max(0.15, Math.min(1, x * 0.6 + y * 0.4))
}

export function VideoPlayer() {
  const { state, dispatch } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const project = state.projects.find((p) => p.id === state.activeProjectId)
  const duration = project?.duration ?? 0
  const currentTime = state.playerTime
  const isPlaying = state.isPlaying
  const trimRange = state.trimRange
  const overlays = state.overlays

  // Sync play/pause state with video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.play().catch(() => {
        dispatch({ type: 'SET_PLAYING', isPlaying: false })
      })
    } else {
      video.pause()
    }
  }, [isPlaying, dispatch])

  // Time update listener
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      const ms = Math.round(video.currentTime * 1000)
      dispatch({ type: 'SET_PLAYER_TIME', time: ms })

      // Respect trim out-point
      if (trimRange && ms >= trimRange.end) {
        video.pause()
        video.currentTime = (trimRange.start ?? 0) / 1000
        dispatch({ type: 'SET_PLAYING', isPlaying: false })
        dispatch({ type: 'SET_PLAYER_TIME', time: trimRange.start ?? 0 })
      }
    }

    const onEnded = () => {
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
    }
  }, [dispatch, trimRange])

  // Sync volume
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = muted ? 0 : volume / 100
    video.muted = muted
  }, [volume, muted])

  const seek = useCallback(
    (ms: number) => {
      const video = videoRef.current
      if (!video) return
      const clamped = Math.max(trimRange?.start ?? 0, Math.min(trimRange?.end ?? duration, ms))
      video.currentTime = clamped / 1000
      dispatch({ type: 'SET_PLAYER_TIME', time: clamped })
    },
    [dispatch, duration, trimRange],
  )

  const togglePlay = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', isPlaying: !isPlaying })
  }, [dispatch, isPlaying])

  const skipBack = useCallback(() => seek(currentTime - 5000), [seek, currentTime])
  const skipForward = useCallback(() => seek(currentTime + 5000), [seek, currentTime])

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

  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }

  const handleTouch = () => {
    setShowControls((prev) => {
      if (!prev) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
        controlsTimeoutRef.current = setTimeout(() => {
          if (isPlaying) setShowControls(false)
        }, 4000)
        return true
      }
      return prev
    })
  }

  const fullscreen = () => {
    const video = videoRef.current
    if (!video) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      video.requestFullscreen().catch(() => {})
    }
  }

  // Visible overlays at current time
  const visibleOverlays = overlays.filter(
    (o) => currentTime >= o.startTime && currentTime <= o.endTime,
  )

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const trimStartPct = duration > 0 ? ((trimRange?.start ?? 0) / duration) * 100 : 0
  const trimEndPct = duration > 0 ? ((trimRange?.end ?? duration) / duration) * 100 : 100

  const WAVEFORM_BARS = 80

  return (
    <div
      className="relative flex flex-col bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleTouch}
    >
      {/* Video area */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {project?.fileUrl ? (
          <video
            ref={videoRef}
            src={project.fileUrl}
            className="size-full object-contain"
            onClick={togglePlay}
            playsInline
          />
        ) : (
          // Placeholder when no real file
          <div
            className="flex size-full cursor-pointer items-center justify-center bg-zinc-950"
            onClick={togglePlay}
          >
            <div className="text-center">
              <div className={cn(
                'mx-auto mb-3 flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-transform duration-150',
                isPlaying ? 'scale-95' : 'scale-100',
              )}>
                {isPlaying
                  ? <Pause className="size-7 text-white/80" />
                  : <Play className="size-7 translate-x-0.5 text-white/80" />}
              </div>
              <p className="text-xs text-white/30">{project?.title ?? 'No video selected'}</p>
              <p className="mt-1 text-xs text-white/20">Click to toggle playback simulation</p>
            </div>
          </div>
        )}

        {/* Text overlays */}
        {visibleOverlays.map((overlay) => (
          <div
            key={overlay.id}
            className="pointer-events-none absolute"
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              style={{
                fontSize: `${overlay.fontSize}px`,
                color: overlay.fontColor,
                fontWeight: overlay.fontWeight,
                backgroundColor: `${overlay.bgColor}${Math.round(overlay.bgOpacity * 255).toString(16).padStart(2, '0')}`,
                padding: '4px 10px',
                borderRadius: '4px',
                display: 'inline-block',
                lineHeight: 1.4,
                maxWidth: `${overlay.width ?? 80}%`,
                textAlign: 'center',
              }}
            >
              {overlay.text}
            </span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className={cn(
        'flex flex-col gap-2 border-t border-white/10 bg-black/90 px-4 py-3 transition-opacity duration-300',
        !showControls && isPlaying ? 'opacity-0' : 'opacity-100',
      )}>
        {/* Waveform + timeline */}
        <div 
          className="group relative cursor-pointer" 
          onClick={handleProgressClick}
          onTouchEnd={handleProgressClick}
        >
          {/* Waveform bars */}
          <div className="flex h-8 items-end gap-px overflow-hidden rounded-sm">
            {Array.from({ length: WAVEFORM_BARS }, (_, i) => {
              const barPct = (i / WAVEFORM_BARS) * 100
              const isInTrim = barPct >= trimStartPct && barPct <= trimEndPct
              const isPast = barPct <= progressPct
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-colors"
                  style={{
                    height: `${waveBarHeight(i, WAVEFORM_BARS) * 100}%`,
                    backgroundColor: isPast
                      ? isInTrim ? 'oklch(0.68 0.18 280)' : 'oklch(0.68 0.18 280 / 0.4)'
                      : isInTrim ? 'rgb(255 255 255 / 0.25)' : 'rgb(255 255 255 / 0.08)',
                  }}
                />
              )
            })}
          </div>
          {/* Playhead */}
          <div
            className="absolute top-0 h-full w-0.5 bg-brand shadow-lg shadow-brand/50 transition-none"
            style={{ left: `${progressPct}%` }}
          >
            <div className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-brand ring-2 ring-background" />
          </div>
          {/* Trim region overlay */}
          {duration > 0 && (trimStartPct > 0 || trimEndPct < 100) && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-black/50"
                style={{ width: `${trimStartPct}%` }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 bg-black/50"
                style={{ width: `${100 - trimEndPct}%` }}
              />
            </>
          )}
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={skipBack}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <SkipBack className="size-4" />
            </Button>

            <Button
              size="icon"
              onClick={togglePlay}
              className="size-9 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={skipForward}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <SkipForward className="size-4" />
            </Button>

            <span className="font-mono text-xs text-white/60">
              {formatTime(currentTime)}{' '}
              <span className="text-white/30">/</span>{' '}
              {formatTime(duration)}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMuted(!muted)}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <div className="w-20">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[muted ? 0 : volume]}
                onValueChange={([v]) => {
                  setVolume(v)
                  setMuted(v === 0)
                }}
                className="[&_[data-slot=slider-range]]:bg-white/60 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-white/60"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={fullscreen}
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Maximize className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
