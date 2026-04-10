'use client'

import { useSyncExternalStore } from 'react'
import {
  getServerUploadWakeLockSnapshot,
  getUploadWakeLockSnapshot,
  subscribeUploadWakeLock,
  type UploadWakeLockSnapshot,
} from '@/lib/upload-wake-lock'

export function useUploadWakeLockUi(): UploadWakeLockSnapshot {
  return useSyncExternalStore(
    subscribeUploadWakeLock,
    getUploadWakeLockSnapshot,
    getServerUploadWakeLockSnapshot,
  )
}
