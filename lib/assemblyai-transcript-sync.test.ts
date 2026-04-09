import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectStatusAfterTranscriptFailure,
  transcriptOwnsProjectState,
} from './assemblyai-transcript-sync'

test('transcriptOwnsProjectState follows the active transcript when present', () => {
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: 'tx-active' },
      'tx-active',
    ),
    true,
  )
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: 'tx-active' },
      'tx-old',
    ),
    false,
  )
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: null },
      'tx-legacy',
    ),
    true,
  )
})

test('projectStatusAfterTranscriptFailure preserves ready projects when another transcript exists', () => {
  assert.equal(projectStatusAfterTranscriptFailure(true), 'ready')
  assert.equal(projectStatusAfterTranscriptFailure(false), 'error')
})
