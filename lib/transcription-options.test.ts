import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appendUniqueKnownSpeakerCsv,
  normalizeTranscriptionOptions,
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
  assert.equal(appendUniqueKnownSpeakerCsv('', 'Debra'), 'Debra')
  assert.equal(appendUniqueKnownSpeakerCsv('Debra', 'Scott'), 'Debra, Scott')
  assert.equal(appendUniqueKnownSpeakerCsv('Debra, Scott', 'debra'), 'Debra, Scott')
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
