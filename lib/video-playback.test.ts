import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTimelineOverlayMarkers,
  clampPlaybackTime,
  getTimelinePointerTime,
} from './video-playback'
import type { TextOverlay } from './types'

test('clampPlaybackTime respects trim bounds and duration bounds', () => {
  assert.equal(clampPlaybackTime(-500, 30_000, null), 0)
  assert.equal(clampPlaybackTime(40_000, 30_000, null), 30_000)
  assert.equal(clampPlaybackTime(2_000, 30_000, { start: 5_000, end: 20_000 }), 5_000)
  assert.equal(clampPlaybackTime(25_000, 30_000, { start: 5_000, end: 20_000 }), 20_000)
  assert.equal(clampPlaybackTime(12_500, 30_000, { start: 5_000, end: 20_000 }), 12_500)
})

test('getTimelinePointerTime returns raw and clamped values', () => {
  const result = getTimelinePointerTime(10, { left: 0, width: 100 }, 10_000, {
    start: 2_000,
    end: 8_000,
  })

  assert.equal(result.rawTime, 1_000)
  assert.equal(result.time, 2_000)
  assert.equal(result.ratio, 0.1)
  assert.equal(result.clampedByTrim, true)
})

test('buildTimelineOverlayMarkers clips markers to trim window and clamps seek target', () => {
  const overlays: TextOverlay[] = [
    {
      id: 'overlay-a',
      text: 'Opening title',
      x: 50,
      y: 50,
      fontSize: 18,
      fontColor: '#fff',
      bgColor: '#000',
      bgOpacity: 0.5,
      startTime: 1_000,
      endTime: 4_000,
      fontWeight: 'normal',
      width: 80,
    },
    {
      id: 'overlay-b',
      text: 'Witness label',
      x: 50,
      y: 50,
      fontSize: 18,
      fontColor: '#fff',
      bgColor: '#000',
      bgOpacity: 0.5,
      startTime: 6_000,
      endTime: 9_000,
      fontWeight: 'bold',
      width: 80,
    },
  ]

  const markers = buildTimelineOverlayMarkers(overlays, 10_000, { start: 2_000, end: 8_000 }, 6_500)

  assert.equal(markers.length, 2)
  assert.equal(markers[0]?.displayStartTime, 2_000)
  assert.equal(markers[0]?.displayEndTime, 4_000)
  assert.equal(markers[0]?.startTime, 2_000)
  assert.equal(markers[1]?.active, true)
  assert.equal(markers[1]?.displayStartTime, 6_000)
  assert.equal(markers[1]?.displayEndTime, 8_000)
})
