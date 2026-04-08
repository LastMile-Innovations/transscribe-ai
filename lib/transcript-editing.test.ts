import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAdjacentSegmentIds,
  mergeTranscriptSegments,
  renameSpeakerInSegments,
  splitTranscriptSegment,
} from './transcript-editing'
import type { TranscriptSegment } from './types'

const baseSegment: TranscriptSegment = {
  id: 'seg-1',
  start: 0,
  end: 4000,
  text: 'hello there general kenobi',
  speaker: 'Speaker A',
  confidence: 0.9,
  words: [
    { text: 'hello', start: 0, end: 800, confidence: 0.9 },
    { text: 'there', start: 800, end: 1600, confidence: 0.9 },
    { text: 'general', start: 1600, end: 2600, confidence: 0.9 },
    { text: 'kenobi', start: 2600, end: 4000, confidence: 0.9 },
  ],
}

test('mergeTranscriptSegments merges text, duration, and words', () => {
  const merged = mergeTranscriptSegments(baseSegment, {
    ...baseSegment,
    id: 'seg-2',
    start: 4000,
    end: 7000,
    text: 'you are a bold one',
    words: [{ text: 'you', start: 4000, end: 4500, confidence: 0.8 }],
  })

  assert.equal(merged.start, 0)
  assert.equal(merged.end, 7000)
  assert.equal(merged.text, 'hello there general kenobi you are a bold one')
  assert.equal(merged.words?.length, 5)
})

test('splitTranscriptSegment uses the cursor boundary and preserves word groups', () => {
  const split = splitTranscriptSegment(baseSegment, 12, {
    leftId: 'left',
    rightId: 'right',
  })

  assert.ok(split)
  assert.equal(split?.left.text, 'hello there')
  assert.equal(split?.right.text, 'general kenobi')
  assert.deepEqual(
    split?.left.words?.map((word) => word.text),
    ['hello', 'there'],
  )
  assert.deepEqual(
    split?.right.words?.map((word) => word.text),
    ['general', 'kenobi'],
  )
})

test('renameSpeakerInSegments renames all matching speakers only', () => {
  const renamed = renameSpeakerInSegments(
    [
      baseSegment,
      { ...baseSegment, id: 'seg-2', speaker: 'Speaker B' },
      { ...baseSegment, id: 'seg-3', speaker: 'Speaker A' },
    ],
    'Speaker A',
    'Judge',
  )

  assert.deepEqual(
    renamed.map((segment) => segment.speaker),
    ['Judge', 'Speaker B', 'Judge'],
  )
})

test('getAdjacentSegmentIds returns transcript-order neighbors', () => {
  const segments = [
    { ...baseSegment, id: 'seg-a' },
    { ...baseSegment, id: 'seg-b' },
    { ...baseSegment, id: 'seg-c' },
  ]

  assert.deepEqual(getAdjacentSegmentIds(segments, 'seg-b'), {
    previousSegmentId: 'seg-a',
    nextSegmentId: 'seg-c',
  })
})
