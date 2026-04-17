import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeTranscriptionReservationDisposition,
  isTranscriptionStartReservationStale,
} from './transcription-reservation'

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

test('reservation decisions follow the locked project state rather than a stale caller snapshot', () => {
  const now = new Date('2026-04-08T12:00:00.000Z').getTime()

  const staleSnapshotDecision = activeTranscriptionReservationDisposition({
    projectStatus: 'awaiting_transcript',
    activeTranscriptId: null,
    transcript: null,
    now,
  })

  const lockedRowDecision = activeTranscriptionReservationDisposition({
    projectStatus: 'transcribing',
    activeTranscriptId: 'tx-locked',
    transcript: {
      assemblyAiTranscriptId: null,
      createdAt: new Date('2026-04-08T11:59:45.000Z'),
    },
    now,
    staleAfterMs: 60_000,
  })

  assert.equal(staleSnapshotDecision, 'none')
  assert.equal(lockedRowDecision, 'wait')
})
