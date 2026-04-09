import type { TextOverlay, TrimRange } from './types'

export type TimelinePointerTime = {
  time: number
  rawTime: number
  ratio: number
  clampedByTrim: boolean
}

export type TimelineOverlayMarker = {
  id: string
  left: number
  width: number
  label: string
  active: boolean
  startTime: number
  displayStartTime: number
  displayEndTime: number
}

export function clampPlaybackTime(time: number, duration: number, trimRange: TrimRange | null): number {
  const safeDuration = Math.max(0, duration)
  const boundedTime = Math.max(0, Math.min(safeDuration, time))
  const trimStart = trimRange?.start ?? 0
  const trimEnd = trimRange?.end ?? safeDuration
  return Math.max(trimStart, Math.min(trimEnd, boundedTime))
}

export function getTimelinePointerTime(
  clientX: number,
  rect: Pick<DOMRect, 'left' | 'width'>,
  duration: number,
  trimRange: TrimRange | null,
): TimelinePointerTime {
  if (rect.width <= 0 || duration <= 0) {
    return {
      time: 0,
      rawTime: 0,
      ratio: 0,
      clampedByTrim: false,
    }
  }

  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const rawTime = Math.round(ratio * duration)
  const time = clampPlaybackTime(rawTime, duration, trimRange)

  return {
    time,
    rawTime,
    ratio,
    clampedByTrim: time !== rawTime,
  }
}

export function buildTimelineOverlayMarkers(
  overlays: TextOverlay[],
  duration: number,
  trimRange: TrimRange | null,
  currentTime: number,
): TimelineOverlayMarker[] {
  if (duration <= 0) return []

  const trimStart = trimRange?.start ?? 0
  const trimEnd = trimRange?.end ?? duration

  return overlays
    .map((overlay) => {
      const boundedStart = Math.max(0, Math.min(duration, overlay.startTime))
      const boundedEnd = Math.max(boundedStart, Math.min(duration, overlay.endTime))
      const displayStartTime = Math.max(trimStart, boundedStart)
      const displayEndTime = Math.min(trimEnd, boundedEnd)

      if (displayEndTime <= displayStartTime) {
        return null
      }

      return {
        id: overlay.id,
        left: (displayStartTime / duration) * 100,
        width: Math.max(1, ((displayEndTime - displayStartTime) / duration) * 100),
        label: overlay.text.trim() || 'Overlay',
        active: currentTime >= boundedStart && currentTime <= boundedEnd,
        startTime: clampPlaybackTime(overlay.startTime, duration, trimRange),
        displayStartTime,
        displayEndTime,
      }
    })
    .filter((marker): marker is TimelineOverlayMarker => marker !== null)
}
