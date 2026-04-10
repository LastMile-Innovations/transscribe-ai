import assert from 'node:assert/strict'
import test from 'node:test'
import { getProjectDataTranscriptLoadStrategy } from './project-transcript-resolution'

test('getProjectDataTranscriptLoadStrategy prefers URL transcript over preferred', () => {
  assert.equal(
    getProjectDataTranscriptLoadStrategy('from-url', 'preferred-uuid'),
    'by_explicit_id',
  )
})

test('getProjectDataTranscriptLoadStrategy uses preferred when no URL param', () => {
  assert.equal(getProjectDataTranscriptLoadStrategy(undefined, 'preferred-uuid'), 'by_preferred_or_newest')
  assert.equal(getProjectDataTranscriptLoadStrategy(null, 'preferred-uuid'), 'by_preferred_or_newest')
})

test('getProjectDataTranscriptLoadStrategy treats empty string as absent URL', () => {
  assert.equal(getProjectDataTranscriptLoadStrategy('', 'preferred-uuid'), 'by_preferred_or_newest')
})

test('getProjectDataTranscriptLoadStrategy falls back to newest when no preferred', () => {
  assert.equal(getProjectDataTranscriptLoadStrategy(undefined, null), 'by_newest_only')
  assert.equal(getProjectDataTranscriptLoadStrategy(undefined, undefined), 'by_newest_only')
})
