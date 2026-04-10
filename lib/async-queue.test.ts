import assert from 'node:assert/strict'
import test from 'node:test'
import { createConcurrencyQueue } from './async-queue'

test('createConcurrencyQueue enforces the configured concurrency cap', async () => {
  const queue = createConcurrencyQueue(2)
  let active = 0
  let maxActive = 0

  const runTask = async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 20))
    active -= 1
  }

  const first = queue.enqueue(runTask).promise
  const second = queue.enqueue(runTask).promise
  const third = queue.enqueue(runTask).promise

  await Promise.all([first, second, third])

  assert.equal(maxActive, 2)
  assert.deepEqual(queue.stats(), { running: 0, queued: 0 })
})

test('createConcurrencyQueue can cancel a queued entry before it starts', async () => {
  const queue = createConcurrencyQueue(1)
  let releaseFirst: (() => void) | undefined

  const first = queue.enqueue(
    () =>
      new Promise<void>((resolve) => {
        releaseFirst = resolve
      }),
  )
  const second = queue.enqueue(async () => {
    throw new Error('second task should not run')
  })

  second.cancel()
  releaseFirst?.()

  await first.promise
  await assert.rejects(second.promise, /Queue entry cancelled\./)
})

test('setMaxConcurrency raises the cap and drains waiting tasks', async () => {
  const queue = createConcurrencyQueue(1)
  let active = 0
  let maxActive = 0

  const runTask = () =>
    new Promise<void>((resolve) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      setTimeout(() => {
        active -= 1
        resolve()
      }, 15)
    })

  const p1 = queue.enqueue(runTask).promise
  const p2 = queue.enqueue(runTask).promise
  const p3 = queue.enqueue(runTask).promise

  queue.setMaxConcurrency(3)

  await Promise.all([p1, p2, p3])

  assert.equal(maxActive, 3)
  assert.deepEqual(queue.stats(), { running: 0, queued: 0 })
})
