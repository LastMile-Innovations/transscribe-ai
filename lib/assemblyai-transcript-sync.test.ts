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
})

test('transcriptOwnsProjectState legacy path requires matching AssemblyAI job id', () => {
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: null },
      'tx-legacy',
    ),
    false,
  )
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: null },
      'tx-legacy',
      { assemblyAiJobId: 'job-a', transcriptAssemblyAiId: 'job-a' },
    ),
    true,
  )
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: null },
      'tx-legacy',
      { assemblyAiJobId: 'job-a', transcriptAssemblyAiId: 'job-b' },
    ),
    false,
  )
  assert.equal(
    transcriptOwnsProjectState(
      { status: 'transcribing', activeTranscriptId: null },
      'tx-legacy',
      { assemblyAiJobId: 'job-a', transcriptAssemblyAiId: null },
    ),
    false,
  )
})

test('projectStatusAfterTranscriptFailure preserves ready projects when another transcript exists', () => {
  assert.equal(projectStatusAfterTranscriptFailure(true), 'ready')
  assert.equal(projectStatusAfterTranscriptFailure(false), 'error')
})
