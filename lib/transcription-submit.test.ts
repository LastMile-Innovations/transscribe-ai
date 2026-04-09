import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeTranscriptionReservationDisposition,
  isTranscriptionStartReservationStale,
} from './transcription-submit'

test('isTranscriptionStartReservationStale flags missing and expired reservations', () => {
  const now = new Date('2026-04-08T12:00:00.000Z').getTime()

  assert.equal(isTranscriptionStartReservationStale(undefined, now, 60_000), true)
  assert.equal(
    isTranscriptionStartReservationStale(new Date('2026-04-08T11:59:30.000Z'), now, 60_000),
    false,
  )
  assert.equal(
    isTranscriptionStartReservationStale(new Date('2026-04-08T11:58:59.000Z'), now, 60_000),
    true,
  )
})

test('activeTranscriptionReservationDisposition reuses, waits, or cleans up correctly', () => {
  const now = new Date('2026-04-08T12:00:00.000Z').getTime()

  assert.equal(
    activeTranscriptionReservationDisposition({
      projectStatus: 'transcribing',
      activeTranscriptId: null,
      transcript: {
        assemblyAiTranscriptId: 'asm-1',
        createdAt: new Date('2026-04-08T11:59:59.000Z'),
      },
      now,
    }),
    'reuse',
  )

  assert.equal(
    activeTranscriptionReservationDisposition({
      projectStatus: 'awaiting_transcript',
      activeTranscriptId: 'tx-1',
      transcript: {
        assemblyAiTranscriptId: 'asm-1',
        createdAt: new Date('2026-04-08T11:59:30.000Z'),
      },
      now,
      staleAfterMs: 60_000,
    }),
    'cleanup',
  )

  assert.equal(
    activeTranscriptionReservationDisposition({
      projectStatus: 'awaiting_transcript',
      activeTranscriptId: 'tx-1',
      transcript: {
        assemblyAiTranscriptId: null,
        createdAt: new Date('2026-04-08T11:59:30.000Z'),
      },
      now,
      staleAfterMs: 60_000,
    }),
    'wait',
  )

  assert.equal(
    activeTranscriptionReservationDisposition({
      projectStatus: 'awaiting_transcript',
      activeTranscriptId: 'tx-1',
      transcript: {
        assemblyAiTranscriptId: null,
        createdAt: new Date('2026-04-08T11:58:30.000Z'),
      },
      now,
      staleAfterMs: 60_000,
    }),
    'cleanup',
  )
})
