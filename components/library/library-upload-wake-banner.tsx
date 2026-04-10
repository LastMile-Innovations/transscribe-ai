'use client'

import { MonitorSmartphone, SunMedium } from 'lucide-react'
import { useUploadWakeLockUi } from '@/hooks/use-upload-wake-lock'
import { cn } from '@/lib/utils'

export function LibraryUploadWakeBanner({ uploadCount }: { uploadCount: number }) {
  const { supported, active } = useUploadWakeLockUi()

  if (uploadCount <= 0) return null

  const detail =
    !supported
      ? 'This browser cannot keep the display on. Plug in your device for long uploads and avoid switching away from this tab.'
      : active
        ? 'We are using the screen wake lock so your display stays on while uploads run.'
        : 'Wake lock is not active yet (permission, battery saver, or another tab may block it). Stay on this page and tap the window if the screen sleeps—we retry automatically.'

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mb-4 flex gap-3 rounded-xl border px-3.5 py-3 text-left shadow-sm sm:px-4 sm:py-3.5',
        active
          ? 'border-emerald-500/35 bg-emerald-500/[0.08] text-foreground dark:border-emerald-400/30 dark:bg-emerald-500/[0.12]'
          : 'border-amber-500/35 bg-amber-500/[0.07] text-foreground dark:border-amber-400/25 dark:bg-amber-500/[0.1]',
      )}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
        )}
      >
        {active ? <SunMedium className="size-5" aria-hidden /> : <MonitorSmartphone className="size-5" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold leading-snug">
          {uploadCount === 1 ? '1 video uploading' : `${uploadCount} videos uploading`}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
