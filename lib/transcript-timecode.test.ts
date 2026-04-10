import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTimecodeToMs } from './transcript-timecode'

test('parseTimecodeToMs parses HH:MM:SS.mmm', () => {
  assert.equal(parseTimecodeToMs('00:00:01.500'), 1500)
  assert.equal(parseTimecodeToMs('01:02:03.000'), 3_723_000)
})

test('parseTimecodeToMs returns null for invalid input', () => {
  assert.equal(parseTimecodeToMs(''), null)
  assert.equal(parseTimecodeToMs('not-a-time'), null)
  assert.equal(parseTimecodeToMs('00:99:00.000'), null)
})
