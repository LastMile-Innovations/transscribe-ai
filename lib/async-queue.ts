export type QueueTask<T> = () => Promise<T>

type QueueEntry<T> = {
  task: QueueTask<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  cancelled: boolean
}

export function createConcurrencyQueue(concurrency: number) {
  const maxConcurrent = Math.max(1, Math.trunc(concurrency) || 1)
  let running = 0
  const pending: Array<QueueEntry<unknown>> = []

  const drain = () => {
    while (running < maxConcurrent) {
      const next = pending.shift()
      if (!next) return
      if (next.cancelled) {
        next.reject(new Error('Queue entry cancelled.'))
        continue
      }

      running += 1
      void next
        .task()
        .then((value) => {
          running -= 1
          drain()
          next.resolve(value)
        })
        .catch((error) => {
          running -= 1
          drain()
          next.reject(error)
        })
    }
  }

  return {
    enqueue<T>(task: QueueTask<T>) {
      const entry: QueueEntry<T> = {
        task,
        resolve: () => undefined,
        reject: () => undefined,
        cancelled: false,
      }

      const promise = new Promise<T>((resolve, reject) => {
        entry.resolve = resolve
        entry.reject = reject
      })

      pending.push(entry as QueueEntry<unknown>)
      drain()

      return {
        promise,
        cancel() {
          entry.cancelled = true
        },
      }
    },
    stats() {
      return {
        running,
        queued: pending.filter((entry) => !entry.cancelled).length,
      }
    },
  }
}
