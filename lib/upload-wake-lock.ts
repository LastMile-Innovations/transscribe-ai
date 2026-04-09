'use client'

type WakeLockSentinel = { release: () => Promise<void> }

let refCount = 0
let wakeLock: WakeLockSentinel | null = null

async function releaseScreenLock() {
  if (!wakeLock) return
  try {
    await wakeLock.release()
  } catch {
    // ignore
  }
  wakeLock = null
}

async function acquireScreenLock() {
  if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') return
  if (wakeLock) return
  try {
    const lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null
    })
    wakeLock = lock
  } catch {
    // Denied, unsupported context, or battery saver — uploads still proceed.
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && refCount > 0) {
    void acquireScreenLock()
  }
}

/** Call once per concurrent upload queue worker (preview + transfer). */
export function uploadWakeLockAcquire() {
  refCount++
  if (refCount === 1) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    void acquireScreenLock()
  }
}

export function uploadWakeLockRelease() {
  refCount = Math.max(0, refCount - 1)
  if (refCount === 0) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void releaseScreenLock()
  }
}
