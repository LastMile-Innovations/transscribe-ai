import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canRetryPrepare,
  isPrepareBusyStatus,
  isPreparingProjectStale,
  projectHasPreparedEdit,
} from './project-prepare'

test('projectHasPreparedEdit detects the prepared edit key', () => {
  assert.equal(projectHasPreparedEdit({ mediaMetadata: null }), false)
  assert.equal(projectHasPreparedEdit({ mediaMetadata: { editKey: '' } }), false)
  assert.equal(projectHasPreparedEdit({ mediaMetadata: { editKey: 'wp/proj/edit.mp4' } }), true)
})

test('canRetryPrepare only allows errored projects without an edit asset', () => {
  assert.equal(canRetryPrepare({ status: 'error', mediaMetadata: null }), true)
  assert.equal(
    canRetryPrepare({ status: 'error', mediaMetadata: { editKey: 'wp/proj/edit.mp4' } }),
    false,
  )
  assert.equal(canRetryPrepare({ status: 'queued_prepare', mediaMetadata: null }), false)
})

test('prepare state helpers expose busy and stale states', () => {
  assert.equal(isPrepareBusyStatus('queued_prepare'), true)
  assert.equal(isPrepareBusyStatus('preparing'), true)
  assert.equal(isPrepareBusyStatus('ready'), false)

  assert.equal(
    isPreparingProjectStale(
      {
        status: 'preparing',
        prepareStartedAt: new Date('2026-04-08T10:00:00.000Z'),
      },
      new Date('2026-04-08T10:20:00.000Z').getTime(),
      15 * 60 * 1000,
    ),
    true,
  )
  assert.equal(
    isPreparingProjectStale(
      {
        status: 'preparing',
        prepareStartedAt: new Date('2026-04-08T10:10:00.000Z'),
      },
      new Date('2026-04-08T10:20:00.000Z').getTime(),
      15 * 60 * 1000,
    ),
    false,
  )
})
