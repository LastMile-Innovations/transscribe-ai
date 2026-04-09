'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Play,
  Pause,
  Captions,
  Scissors,
  Keyboard,
} from 'lucide-react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import { useAuthedFetch } from '@/lib/authed-fetch'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'
import { VideoTimeline } from './video-timeline'
import { VideoControls } from './video-controls'

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

export function VideoPlayer({ layout = 'default' }: { layout?: 'default' | 'sidebar' }) {
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

  const [localTime, setLocalTime] = useState(state.playerTime)
  const lastGlobalSyncRef = useRef(state.playerTime)

  // Sync local time when global time changes (e.g., from clicking a segment)
  useEffect(() => {
    if (Math.abs(state.playerTime - localTime) > 500) {
      setLocalTime(state.playerTime)
      lastGlobalSyncRef.current = state.playerTime
    }
  }, [state.playerTime, localTime])

  // Time update listener
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      const ms = Math.round(video.currentTime * 1000)
      setLocalTime(ms)

      // Throttle global state updates to ~500ms to reduce re-renders
      if (Math.abs(ms - lastGlobalSyncRef.current) >= 500) {
        dispatch({ type: 'SET_PLAYER_TIME', time: ms })
        lastGlobalSyncRef.current = ms
      }

      // Respect trim out-point
      if (trimRange && ms >= trimRange.end) {
        video.pause()
        video.currentTime = (trimRange.start ?? 0) / 1000
        dispatch({ type: 'SET_PLAYING', isPlaying: false })
        dispatch({ type: 'SET_PLAYER_TIME', time: trimRange.start ?? 0 })
        setLocalTime(trimRange.start ?? 0)
        lastGlobalSyncRef.current = trimRange.start ?? 0
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
      setLocalTime(clamped)
      lastGlobalSyncRef.current = clamped
      dispatch({ type: 'SET_PLAYER_TIME', time: clamped })
    },
    [dispatch, duration, trimRange],
  )

  const togglePlay = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', isPlaying: !isPlaying })
  }, [dispatch, isPlaying])

  const skipBack = useCallback(() => seek(localTime - 5000), [seek, localTime])
  const skipForward = useCallback(() => seek(localTime + 5000), [seek, localTime])

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
    const resumeTimeSec = localTime / 1000
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
  }, [localTime, dispatch, isPlaying, project, refreshPlaybackUrl])

  // Visible overlays at current time
  const visibleOverlays = overlays.filter(
    (o) => localTime >= o.startTime && localTime <= o.endTime,
  )

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[inherit] bg-zinc-950"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleTouch}
    >
      {layout === 'default' ? (
        <CardHeader className="shrink-0 gap-3 border-b border-white/10 bg-gradient-to-r from-white/6 via-white/3 to-transparent px-4 py-3 text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold tracking-[0.16em] uppercase text-white/45">Review Surface</p>
              <CardTitle className="mt-1 text-sm text-white/90">{project?.title ?? 'Playback preview'}</CardTitle>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className="border-white/10 bg-white/6 text-white/80">
                <Captions className="size-3.5" />
                {visibleOverlays.length} overlays visible
              </Badge>
              <Badge variant="outline" className="border-white/10 bg-white/6 text-white/80">
                <Scissors className="size-3.5" />
                {Math.max(0, trimRange?.end ?? duration) > 0 && trimRange
                  ? `${formatTime(trimRange?.start ?? 0)} - ${formatTime(trimRange?.end ?? duration)}`
                  : 'Full clip'}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            <Badge variant="outline" className="border-white/10 bg-white/6 text-white/80">
              <Captions className="size-3.5" />
              {visibleOverlays.length} overlays
            </Badge>
            <Badge variant="outline" className="border-white/10 bg-white/6 text-white/80">
              <Scissors className="size-3.5" />
              {trimRange ? 'Trim active' : 'Full clip'}
            </Badge>
          </div>
        </CardHeader>
      ) : (
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2 text-white/80">
          <div className="truncate text-xs font-medium text-white/90">{project?.title ?? 'Playback preview'}</div>
          <div className="flex shrink-0 items-center gap-2">
            {trimRange && (
              <Badge variant="outline" className="border-white/10 bg-white/6 text-[10px] text-white/80">
                <Scissors className="size-3" />
                Trimmed
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden px-4 py-4">
        <AspectRatio ratio={16 / 9} className="size-full overflow-hidden rounded-2xl border border-white/10 bg-black">
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
            <div
              className="flex size-full cursor-pointer items-center justify-center bg-zinc-950"
              onClick={togglePlay}
            >
              <Card className="border-white/10 bg-white/5 py-0 text-center shadow-none backdrop-blur">
                <CardContent className="px-8 py-8">
                  <div className={cn(
                    'mx-auto mb-3 flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-transform duration-150',
                    isPlaying ? 'scale-95' : 'scale-100',
                  )}>
                    {isPlaying
                      ? <Pause className="size-7 text-white/80" />
                      : <Play className="size-7 translate-x-0.5 text-white/80" />}
                  </div>
                  <p className="text-xs text-white/60">{project?.title ?? 'No video selected'}</p>
                  <p className="mt-1 text-xs text-white/35">Click to toggle playback simulation</p>
                </CardContent>
              </Card>
            </div>
          )}

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
        </AspectRatio>
      </div>

      <div className={cn(
        'flex flex-col gap-3 border-t border-white/10 bg-black/88 px-4 py-4 transition-opacity duration-300',
        !showControls && isPlaying ? 'opacity-75' : 'opacity-100',
      )}>
        <VideoTimeline
          currentTime={localTime}
          duration={duration}
          trimRange={trimRange ?? null}
          overlays={overlays}
          seek={seek}
          formatTime={formatTime}
        />

        <VideoControls
          isPlaying={isPlaying}
          togglePlay={togglePlay}
          skipBack={skipBack}
          skipForward={skipForward}
          currentTime={localTime}
          duration={duration}
          muted={muted}
          setMuted={setMuted}
          volume={volume}
          setVolume={setVolume}
          fullscreen={fullscreen}
          formatTime={formatTime}
        />

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/45">
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-white/60">
            <Keyboard className="size-3.5" />
            Shortcuts
          </Badge>
          <Kbd className="border-white/10 bg-white/5 text-white/70">Space</Kbd>
          <Kbd className="border-white/10 bg-white/5 text-white/70">J</Kbd>
          <Kbd className="border-white/10 bg-white/5 text-white/70">L</Kbd>
          <span>Play / back 5s / forward 5s</span>
        </div>
      </div>
    </div>
  )
}
