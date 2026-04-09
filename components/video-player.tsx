'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Play, Pause, Captions, Scissors, Keyboard } from 'lucide-react'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import { useAuthedFetch } from '@/lib/authed-fetch'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'
import { clampPlaybackTime } from '@/lib/video-playback'
import { VideoTimeline } from './video-timeline'
import { VideoControls } from './video-controls'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const PLAYBACK_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000

export function VideoPlayer({
  layout = 'default',
  omitDockHeader = false,
  showTouchPlaybackHint = false,
}: {
  layout?: 'default' | 'sidebar' | 'dock'
  /** When layout is dock inside a floating shell, hide the inner title row (parent supplies chrome). */
  omitDockHeader?: boolean
  /** When true (compact editor layouts), add tap-to-play copy next to keyboard shortcuts. */
  showTouchPlaybackHint?: boolean
}) {
  const authedFetch = useAuthedFetch()
  const { state, dispatch } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null)
  const playbackRetryRef = useRef(false)
  const [localTime, setLocalTime] = useState(state.playerTime)
  const lastGlobalSyncRef = useRef(state.playerTime)

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

  const syncSeek = useCallback(
    (
      ms: number,
      options?: {
        pausePlayback?: boolean
        updateVideoElement?: boolean
      },
    ) => {
      const clamped = clampPlaybackTime(ms, duration, trimRange ?? null)

      if (options?.pausePlayback && isPlaying) {
        dispatch({ type: 'SET_PLAYING', isPlaying: false })
      }

      if (options?.updateVideoElement !== false && videoRef.current) {
        videoRef.current.currentTime = clamped / 1000
      }

      setLocalTime(clamped)
      lastGlobalSyncRef.current = clamped
      dispatch({ type: 'SET_PLAYER_TIME', time: clamped })
      return clamped
    },
    [dispatch, duration, isPlaying, trimRange],
  )

  useEffect(() => {
    const handleSeek = (e: Event) => {
      const ce = e as CustomEvent<{ timeMs: number }>
      syncSeek(ce.detail.timeMs)
    }

    window.addEventListener('app:seek', handleSeek)
    return () => window.removeEventListener('app:seek', handleSeek)
  }, [syncSeek])

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

  useEffect(() => {
    if (isScrubbing) return
    if (Math.abs(state.playerTime - localTime) > 500) {
      setLocalTime(state.playerTime)
      lastGlobalSyncRef.current = state.playerTime
    }
  }, [isScrubbing, state.playerTime, localTime])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => {
      if (isScrubbing) return

      const ms = Math.round(video.currentTime * 1000)
      setLocalTime(ms)

      if (Math.abs(ms - lastGlobalSyncRef.current) >= 500) {
        dispatch({ type: 'SET_PLAYER_TIME', time: ms })
        lastGlobalSyncRef.current = ms
      }

      if (trimRange && ms >= trimRange.end) {
        video.pause()
        syncSeek(trimRange.start ?? 0, { pausePlayback: true })
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
  }, [dispatch, isScrubbing, syncSeek, trimRange])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = muted ? 0 : volume / 100
    video.muted = muted
  }, [volume, muted])

  const seek = useCallback((ms: number) => syncSeek(ms), [syncSeek])

  const togglePlay = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', isPlaying: !isPlaying })
  }, [dispatch, isPlaying])

  const skipBack = useCallback(() => seek(localTime - 5000), [seek, localTime])
  const skipForward = useCallback(() => seek(localTime + 5000), [seek, localTime])

  const handleScrubStart = useCallback(
    (ms: number) => {
      setIsScrubbing(true)
      setPreviewTime(ms)
      syncSeek(ms, { pausePlayback: true })
    },
    [syncSeek],
  )

  const handleScrubChange = useCallback(
    (ms: number) => {
      setPreviewTime(ms)
      syncSeek(ms, { pausePlayback: true })
    },
    [syncSeek],
  )

  const handleScrubEnd = useCallback(
    (ms: number) => {
      syncSeek(ms, { pausePlayback: true })
      setIsScrubbing(false)
      setPreviewTime(null)
    },
    [syncSeek],
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

  const visibleOverlays = overlays.filter((overlay) => localTime >= overlay.startTime && localTime <= overlay.endTime)
  const isDock = layout === 'dock'
  const badgeClass =
    'border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] text-[color:var(--editor-video-chrome-fg)]'

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[inherit] bg-[color:var(--editor-video-bg)] text-[color:var(--editor-video-chrome-fg)]"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleTouch}
    >
      {layout === 'default' ? (
        <CardHeader className="shrink-0 gap-3 border-b border-[color:var(--editor-video-border)] bg-gradient-to-r from-[color:var(--editor-video-controls-bg)] via-[color:var(--editor-video-bg)] to-transparent px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold tracking-[0.16em] uppercase text-[color:var(--editor-video-chrome-muted)]">
                Review Surface
              </p>
              <CardTitle className="mt-1 text-sm text-[color:var(--editor-video-chrome-fg)]">
                {project?.title ?? 'Playback preview'}
              </CardTitle>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant="outline" className={badgeClass}>
                <Captions className="size-3.5" />
                {visibleOverlays.length} overlays visible
              </Badge>
              <Badge variant="outline" className={badgeClass}>
                <Scissors className="size-3.5" />
                {Math.max(0, trimRange?.end ?? duration) > 0 && trimRange
                  ? `${formatTime(trimRange.start ?? 0)} - ${formatTime(trimRange.end ?? duration)}`
                  : 'Full clip'}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            <Badge variant="outline" className={badgeClass}>
              <Captions className="size-3.5" />
              {visibleOverlays.length} overlays
            </Badge>
            <Badge variant="outline" className={badgeClass}>
              <Scissors className="size-3.5" />
              {trimRange ? 'Trim active' : 'Full clip'}
            </Badge>
          </div>
        </CardHeader>
      ) : isDock ? (
        omitDockHeader ? null : (
          <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] px-2 py-1.5">
            <div className="truncate text-[11px] font-medium text-[color:var(--editor-video-chrome-fg)]">
              {project?.title ?? 'Preview'}
            </div>
            {trimRange && (
              <Badge variant="outline" className={cn(badgeClass, 'px-1.5 py-0 text-[9px]')}>
                <Scissors className="size-2.5" />
                Trim
              </Badge>
            )}
          </div>
        )
      ) : (
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] px-4 py-2">
          <div className="truncate text-xs font-medium text-[color:var(--editor-video-chrome-fg)]">
            {project?.title ?? 'Playback preview'}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {trimRange && (
              <Badge variant="outline" className={cn(badgeClass, 'text-[10px]')}>
                <Scissors className="size-3" />
                Trimmed
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className={cn('relative flex-1 overflow-hidden', isDock ? 'px-2 py-2' : 'px-4 py-4')}>
        <AspectRatio
          ratio={16 / 9}
          className={cn(
            'size-full overflow-hidden border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-surface)]',
            isDock ? 'max-h-[140px] rounded-lg' : 'rounded-2xl',
          )}
        >
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
              className="flex size-full cursor-pointer items-center justify-center bg-[color:var(--editor-video-surface)]"
              onClick={togglePlay}
            >
              <Card className="border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] py-0 text-center shadow-none backdrop-blur">
                <CardContent className={cn('px-8 py-8', isDock && 'px-4 py-4')}>
                  <div
                    className={cn(
                      'mx-auto mb-3 flex items-center justify-center rounded-full border border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] transition-transform duration-150',
                      isDock ? 'size-12' : 'size-16',
                      isPlaying ? 'scale-95' : 'scale-100',
                    )}
                  >
                    {isPlaying ? (
                      <Pause className={cn('text-[color:var(--editor-video-chrome-fg)]', isDock ? 'size-5' : 'size-7')} />
                    ) : (
                      <Play
                        className={cn(
                          'translate-x-0.5 text-[color:var(--editor-video-chrome-fg)]',
                          isDock ? 'size-5' : 'size-7',
                        )}
                      />
                    )}
                  </div>
                  <p className="text-xs text-[color:var(--editor-video-chrome-muted)]">
                    {project?.title ?? 'No video selected'}
                  </p>
                  {!isDock && (
                    <p className="mt-1 text-xs opacity-70 text-[color:var(--editor-video-chrome-muted)]">
                      Click to toggle playback simulation
                    </p>
                  )}
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
                  backgroundColor: `${overlay.bgColor}${Math.round(overlay.bgOpacity * 255)
                    .toString(16)
                    .padStart(2, '0')}`,
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

      <div
        className={cn(
          'flex flex-col gap-3 border-t border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-timeline-bg)] transition-opacity duration-300',
          isDock ? 'gap-2 px-2 py-2' : 'px-4 py-4',
          !showControls && isPlaying ? 'opacity-75' : 'opacity-100',
        )}
      >
        <VideoTimeline
          currentTime={localTime}
          duration={duration}
          trimRange={trimRange ?? null}
          overlays={overlays}
          seek={seek}
          isScrubbing={isScrubbing}
          previewTime={previewTime}
          onPreviewChange={setPreviewTime}
          onScrubStart={handleScrubStart}
          onScrubChange={handleScrubChange}
          onScrubEnd={handleScrubEnd}
          formatTime={formatTime}
          compact={isDock}
        />

        <VideoControls
          isPlaying={isPlaying}
          togglePlay={togglePlay}
          skipBack={skipBack}
          skipForward={skipForward}
          currentTime={localTime}
          duration={duration}
          previewTime={previewTime}
          isScrubbing={isScrubbing}
          muted={muted}
          setMuted={setMuted}
          volume={volume}
          setVolume={setVolume}
          fullscreen={fullscreen}
          formatTime={formatTime}
          compact={isDock}
        />

        {!isDock && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--editor-video-chrome-muted)]">
            {showTouchPlaybackHint && (
              <span className="w-full text-[color:var(--editor-video-chrome-fg)] sm:w-auto">
                Tap the video to play or pause.
              </span>
            )}
            <Badge variant="outline" className={cn(badgeClass, 'text-[color:var(--editor-video-chrome-muted)]')}>
              <Keyboard className="size-3.5" />
              Shortcuts
            </Badge>
            <Kbd className="border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] text-[color:var(--editor-video-chrome-fg)]">
              Space
            </Kbd>
            <Kbd className="border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] text-[color:var(--editor-video-chrome-fg)]">
              J
            </Kbd>
            <Kbd className="border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-controls-bg)] text-[color:var(--editor-video-chrome-fg)]">
              L
            </Kbd>
            <span>
              {showTouchPlaybackHint ? 'With a keyboard: play / back 5s / forward 5s' : 'Play / back 5s / forward 5s'}
            </span>
            <span className="hidden sm:inline">{` · ⌘ + \\ cycle layout`}</span>
          </div>
        )}
      </div>
    </div>
  )
}
