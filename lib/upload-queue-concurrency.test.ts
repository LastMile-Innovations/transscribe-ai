import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP,
  libraryUploadQueueConcurrency,
} from './upload-queue-concurrency'

test('hard cap constant', () => {
  assert.equal(LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP, 48)
})

/** Empty string = treat as no env var (tests stay independent of process.env). */
const noEnv = ''

test('no navigator: uses SSR-style default', () => {
  assert.equal(libraryUploadQueueConcurrency({ envValue: noEnv, navigator: undefined }), 12)
})

test('hardwareConcurrency scales default before network cap', () => {
  const nav = {
    hardwareConcurrency: 8,
  } as Navigator
  assert.equal(libraryUploadQueueConcurrency({ envValue: noEnv, navigator: nav }), 16)
})

test('env value is clamped to hard cap', () => {
  assert.equal(
    libraryUploadQueueConcurrency({ envValue: '999', navigator: undefined }),
    LIBRARY_UPLOAD_CONCURRENCY_HARD_CAP,
  )
})

test('saveData limits concurrency', () => {
  const nav = {
    hardwareConcurrency: 16,
    connection: { saveData: true as const, effectiveType: '4g' as const },
  } as unknown as Navigator
  assert.equal(libraryUploadQueueConcurrency({ envValue: noEnv, navigator: nav }), 2)
})

test('2g limits concurrency', () => {
  const nav = {
    hardwareConcurrency: 16,
    connection: { effectiveType: '2g' as const },
  } as unknown as Navigator
  assert.equal(libraryUploadQueueConcurrency({ envValue: noEnv, navigator: nav }), 2)
})

test('3g limits concurrency', () => {
  const nav = {
    hardwareConcurrency: 16,
    connection: { effectiveType: '3g' as const },
  } as unknown as Navigator
  assert.equal(libraryUploadQueueConcurrency({ envValue: noEnv, navigator: nav }), 3)
})
