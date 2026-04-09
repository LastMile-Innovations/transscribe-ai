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
  Captions,
  Scissors,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useAuthedFetch } from '@/lib/authed-fetch'
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

const PLAYBACK_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000

export function VideoPlayer() {
  const authedFetch = useAuthedFetch()
  const { state, dispatch } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null)
  const playbackRetryRef = useRef(false)

  const project = state.projects.find((p) => p.id === state.activeProjectId)
  const duration = project?.duration ?? 0
  const currentTime = state.playerTime
  const isPlaying = state.isPlaying
  const trimRange = state.trimRange
  const overlays = state.overlays

  const refreshPlaybackUrl = useCallback(
    async (force = false): Promise<string | null> => {
      if (!project) return null

      const hasFreshUrl =
        project.fileUrl &&
        (project.playbackUrlExpiresAt == null ||
          project.playbackUrlExpiresAt - Date.now() > PLAYBACK_URL_REFRESH_BUFFER_MS)

      if (!force && hasFreshUrl) return project.fileUrl

      if (refreshInFlightRef.current) return refreshInFlightRef.current

      const task = authedFetch(`/api/projects/${project.id}/playback-url`)
        .then(async (res) => {
          if (!res.ok) throw new Error('Could not refresh playback URL.')
          return res.json() as Promise<{
            fileUrl: string | null
            originalFileUrl: string | null
            playbackUrlRefreshedAt?: number | null
            playbackUrlExpiresAt?: number | null
          }>
        })
        .then((data) => {
          dispatch({
            type: 'UPDATE_PROJECT',
            id: project.id,
            updates: {
              fileUrl: data.fileUrl,
              originalFileUrl: data.originalFileUrl,
              playbackUrlRefreshedAt: data.playbackUrlRefreshedAt ?? Date.now(),
              playbackUrlExpiresAt: data.playbackUrlExpiresAt ?? null,
            },
          })
          return data.fileUrl
        })
        .finally(() => {
          refreshInFlightRef.current = null
        })

      refreshInFlightRef.current = task
      return task
    },
    [authedFetch, dispatch, project],
  )

  // Global seek listener
  useEffect(() => {
    const handleSeek = (e: Event) => {
      const ce = e as CustomEvent<{ timeMs: number }>
      if (videoRef.current) {
        videoRef.current.currentTime = ce.detail.timeMs / 1000
      }
    }
    window.addEventListener('app:seek', handleSeek)
    return () => window.removeEventListener('app:seek', handleSeek)
  }, [])

  // Sync play/pause state with video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!isPlaying) {
      video.pause()
      return
    }

    let cancelled = false

    async function startPlayback() {
      try {
        const refreshedUrl = await refreshPlaybackUrl(false)
        const currentVideo = videoRef.current
        if (!currentVideo) return
        if (cancelled) return
        if (refreshedUrl && project?.fileUrl && refreshedUrl !== project.fileUrl) {
          return
        }
        await currentVideo.play()
      } catch {
        if (!cancelled) {
          dispatch({ type: 'SET_PLAYING', isPlaying: false })
        }
      }
    }

    void startPlayback()

    return () => {
      cancelled = true
    }
  }, [dispatch, isPlaying, project?.fileUrl, project?.id, refreshPlaybackUrl])

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

  const handleVideoError = useCallback(() => {
    if (!project || playbackRetryRef.current) {
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
      return
    }

    playbackRetryRef.current = true
    const resumeTimeSec = currentTime / 1000
    const shouldResume = isPlaying
    const video = videoRef.current

    void refreshPlaybackUrl(true)
      .then((nextUrl) => {
        if (!video || !nextUrl) {
          dispatch({ type: 'SET_PLAYING', isPlaying: false })
          return
        }

        const restorePlayback = () => {
          if (resumeTimeSec > 0) {
            try {
              video.currentTime = resumeTimeSec
            } catch {
              /* ignore restore failure */
            }
          }
          if (shouldResume) {
            video.play().catch(() => {
              dispatch({ type: 'SET_PLAYING', isPlaying: false })
            })
          }
        }

        video.addEventListener('loadedmetadata', restorePlayback, { once: true })
        video.load()
      })
      .catch(() => {
        dispatch({ type: 'SET_PLAYING', isPlaying: false })
      })
  }, [currentTime, dispatch, isPlaying, project, refreshPlaybackUrl])

  // Visible overlays at current time
  const visibleOverlays = overlays.filter(
    (o) => currentTime >= o.startTime && currentTime <= o.endTime,
  )

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const trimStartPct = duration > 0 ? ((trimRange?.start ?? 0) / duration) * 100 : 0
  const trimEndPct = duration > 0 ? ((trimRange?.end ?? duration) / duration) * 100 : 100

  const WAVEFORM_BARS = 80
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
    <div
      className="relative flex flex-col bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleTouch}
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-white/6 via-white/3 to-transparent px-4 py-2 text-xs text-white/72">
        <div>
          <p className="font-semibold tracking-[0.16em] uppercase text-white/45">Review Surface</p>
          <p className="text-sm text-white/88">{project?.title ?? 'Playback preview'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-2.5 py-1">
            <Captions className="size-3.5" />
            {visibleOverlays.length} overlays visible
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/6 px-2.5 py-1">
            <Scissors className="size-3.5" />
            {Math.max(0, trimRange?.end ?? duration) > 0 && trimRange
              ? `${formatTime(trimRange.start)} - ${formatTime(trimRange.end)}`
              : 'Full clip'}
          </span>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {project?.fileUrl ? (
          <video
            ref={videoRef}
            src={project.fileUrl}
            className="size-full object-contain"
            onClick={togglePlay}
            onError={handleVideoError}
            onLoadedData={() => {
              playbackRetryRef.current = false
            }}
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

      <div className={cn(
        'flex flex-col gap-3 border-t border-white/10 bg-black/88 px-4 py-4 transition-opacity duration-300',
        !showControls && isPlaying ? 'opacity-75' : 'opacity-100',
      )}>
        <div
          className="group relative cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-3"
          onClick={handleProgressClick}
          onTouchEnd={handleProgressClick}
        >
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/45">
            <span>Timeline</span>
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>

          <div className="relative flex h-10 items-end gap-px overflow-hidden rounded-md">
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] p-1.5 backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={skipBack}
              className="size-10 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
              aria-label="Skip back 5 seconds"
            >
              <SkipBack className="size-4" />
            </Button>

            <Button
              size="icon"
              onClick={togglePlay}
              className="size-12 rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/20 transition-transform hover:scale-105 hover:bg-brand/90"
              aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
            >
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={skipForward}
              className="size-10 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
              aria-label="Skip forward 5 seconds"
            >
              <SkipForward className="size-4" />
            </Button>
          </div>

          <div className="min-w-[11rem] rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 font-mono text-xs font-medium tracking-wider text-white/85">
            <div className="flex items-center justify-between gap-3">
              <span>Current</span>
              <span>{formatTime(currentTime)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-white/55">
              <span>Duration</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] p-1.5 backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMuted(!muted)}
              className="size-10 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
              aria-label={muted || volume === 0 ? 'Unmute video' : 'Mute video'}
            >
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
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
            <div className="w-px h-4 bg-white/20 mx-1" />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={fullscreen}
              className="size-10 rounded-full text-white/80 hover:bg-white/20 hover:text-white"
              aria-label="Toggle fullscreen"
            >
              <Maximize className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
