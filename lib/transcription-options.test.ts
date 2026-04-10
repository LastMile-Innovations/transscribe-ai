import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendUniqueKnownSpeakerCsv,
  normalizeTranscriptionOptions,
  removeFromKnownSpeakersCsv,
  togglePresetInKnownSpeakersCsv,
  validateTranscriptionOptions,
} from './transcription-options'

test('normalizeTranscriptionOptions drops speaker-specific tuning when diarization is off', () => {
  const normalized = normalizeTranscriptionOptions({
    speakerLabels: false,
    knownSpeakers: 'Judge, Witness',
    speakersExpected: 3,
    minSpeakers: 2,
    maxSpeakers: 4,
  })

  assert.equal(normalized.speakerLabels, false)
  assert.equal(normalized.knownSpeakers, '')
  assert.equal(normalized.speakersExpected, undefined)
  assert.equal(normalized.minSpeakers, undefined)
  assert.equal(normalized.maxSpeakers, undefined)
})

test('appendUniqueKnownSpeakerCsv appends and dedupes case-insensitively', () => {
  assert.equal(appendUniqueKnownSpeakerCsv('', 'Jessica Clark'), 'Jessica Clark')
  assert.equal(appendUniqueKnownSpeakerCsv('Jessica Clark', 'Scott Lepman'), 'Jessica Clark, Scott Lepman')
  assert.equal(appendUniqueKnownSpeakerCsv('Jessica Clark, Scott Lepman', 'jessica clark'), 'Jessica Clark, Scott Lepman')
})

test('removeFromKnownSpeakersCsv and togglePresetInKnownSpeakersCsv', () => {
  assert.equal(removeFromKnownSpeakersCsv('A, B, C', 'b'), 'A, C')
  assert.equal(togglePresetInKnownSpeakersCsv('', 'Tonia', true), 'Tonia')
  assert.equal(togglePresetInKnownSpeakersCsv('Tonia', 'Tonia', false), '')
})

test('validateTranscriptionOptions rejects an invalid speaker range', () => {
  const message = validateTranscriptionOptions(
    normalizeTranscriptionOptions({
      speakerLabels: true,
      minSpeakers: 5,
      maxSpeakers: 2,
    }),
  )

  assert.equal(message, 'Minimum speakers cannot be greater than maximum speakers.')
})
