'use client'

type WakeLockSentinel = { release: () => Promise<void> }

let refCount = 0
let wakeLock: WakeLockSentinel | null = null

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export type UploadWakeLockSnapshot = {
  /** Screen Wake Lock API available in this browser. */
  supported: boolean
  /** A screen wake lock is currently held. */
  active: boolean
  /** Number of active upload sessions (each file pipeline from queue through prepare). */
  sessions: number
}

/** Stable reference for SSR; useSyncExternalStore requires getServerSnapshot identity stability. */
const SERVER_UPLOAD_WAKE_LOCK_SNAPSHOT: UploadWakeLockSnapshot = Object.freeze({
  supported: false,
  active: false,
  sessions: 0,
})

/** Reuse the same object when values are unchanged so useSyncExternalStore does not loop (React #185). */
let clientSnapshotCache: UploadWakeLockSnapshot = {
  supported: false,
  active: false,
  sessions: 0,
}

export function subscribeUploadWakeLock(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getUploadWakeLockSnapshot(): UploadWakeLockSnapshot {
  const supported =
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock
      ?.request === 'function'
  const active = wakeLock !== null
  const sessions = refCount
  if (
    clientSnapshotCache.supported === supported &&
    clientSnapshotCache.active === active &&
    clientSnapshotCache.sessions === sessions
  ) {
    return clientSnapshotCache
  }
  clientSnapshotCache = { supported, active, sessions }
  return clientSnapshotCache
}

export function getServerUploadWakeLockSnapshot(): UploadWakeLockSnapshot {
  return SERVER_UPLOAD_WAKE_LOCK_SNAPSHOT
}

async function releaseScreenLock() {
  if (!wakeLock) return
  try {
    await wakeLock.release()
  } catch {
    // ignore
  }
  wakeLock = null
  emit()
}

async function acquireScreenLock() {
  if (!('wakeLock' in navigator) || typeof navigator.wakeLock?.request !== 'function') return
  if (wakeLock) return
  try {
    const lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => {
      if (wakeLock === lock) {
        wakeLock = null
        emit()
      }
    })
    wakeLock = lock
  } catch {
    // Denied, unsupported context, or battery saver — uploads still proceed.
  }
  emit()
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && refCount > 0) {
    void acquireScreenLock()
  }
}

function onPageShow() {
  if (refCount > 0) void acquireScreenLock()
}

function onWindowFocus() {
  if (refCount > 0) void acquireScreenLock()
}

let globalHandlersAttached = false

function attachGlobalReacquireHandlers() {
  if (globalHandlersAttached) return
  globalHandlersAttached = true
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('focus', onWindowFocus)
}

function detachGlobalReacquireHandlers() {
  if (!globalHandlersAttached) return
  globalHandlersAttached = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pageshow', onPageShow)
  window.removeEventListener('focus', onWindowFocus)
}

/** Call once per library upload pipeline (from queue through storage + prepare). */
export function uploadWakeLockAcquire() {
  refCount++
  emit()
  if (refCount === 1) {
    attachGlobalReacquireHandlers()
    void acquireScreenLock()
  }
}

export function uploadWakeLockRelease() {
  refCount = Math.max(0, refCount - 1)
  emit()
  if (refCount === 0) {
    detachGlobalReacquireHandlers()
    void releaseScreenLock()
  }
}
