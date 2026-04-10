'use client'

import { Sparkles, UploadCloud } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LibraryUploadDropzone({
  disabled,
  fileInputId,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
}: {
  disabled: boolean
  fileInputId: string
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onBrowse: () => void
}) {
  return (
    <div
      className={cn(
        'library-dropzone relative mb-0 flex flex-col items-center justify-center gap-4 overflow-hidden p-5 text-center transition-all duration-300 ease-out sm:gap-5 sm:p-8 md:p-12',
        isDragOver
          ? 'border-brand/40 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_14%,white),white)] scale-[1.01] shadow-[0_28px_65px_-40px_var(--color-brand)] dark:bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_22%,var(--card)),var(--card))]'
          : 'hover:border-brand/30',
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--color-brand)_12%,transparent),transparent_58%)]" />
      <div
        className={cn(
          'relative z-10 flex size-18 items-center justify-center rounded-[1.7rem] transition-all duration-300 shadow-sm',
          isDragOver
            ? 'bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-brand)_58%,black))] text-brand-foreground shadow-[0_20px_40px_-20px_var(--color-brand)] scale-110'
            : 'border border-white/60 bg-background/90 text-muted-foreground',
        )}
      >
        <UploadCloud className={cn('size-8', isDragOver && 'animate-bounce')} />
      </div>
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-2.5 sm:gap-3">
        <p className="text-lg font-semibold tracking-tight sm:text-xl">
          {isDragOver ? 'Drop videos to upload' : (
            <>
              <span className="md:hidden">Add videos from your device</span>
              <span className="hidden md:inline">Drag & drop videos here (computer)</span>
            </>
          )}
        </p>

        <label
          htmlFor={fileInputId}
          className={cn(
            buttonVariants({ size: 'lg' }),
            'min-h-11 w-full cursor-pointer touch-manipulation justify-center gap-2 border-0 px-5 text-[15px] font-semibold shadow-[0_18px_34px_-18px_var(--color-brand)] sm:min-h-12 sm:px-6 sm:text-base md:w-auto',
            'bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-brand)_60%,black))] text-brand-foreground hover:brightness-105',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <UploadCloud className="size-5 shrink-0" />
          Choose videos to upload
        </label>

        <p className="hidden max-w-md text-pretty text-sm leading-relaxed text-muted-foreground md:block">
          On a phone or tablet, you can usually pick several videos at once: look for &ldquo;Select&rdquo; or checkboxes,
          then tap each video, then confirm. A banner appears while uploads run explaining whether we can keep your
          screen awake; plug in for long batches. iOS Low Power Mode may still slow transfers.
        </p>
        <p className="max-w-md text-pretty text-xs leading-relaxed text-muted-foreground md:hidden">
          You can select multiple videos in the picker. While uploading, stay on this page when you can—a banner shows
          wake-lock status.
        </p>

        <p className="text-sm leading-6 text-muted-foreground">
          <span className="hidden sm:inline">You can also </span>
          <button
            type="button"
            className="font-semibold text-brand underline-offset-4 transition-all hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onBrowse}
          >
            open the file picker again
          </button>
          <span className="hidden sm:inline"> — MP4, MOV, WebM, AVI, and similar formats</span>
          <span className="sm:hidden"> — MP4, MOV, WebM, AVI</span>
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-2.5 rounded-full border border-white/60 bg-background/70 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
        <Sparkles className="size-3.5 text-brand" />
        AssemblyAI transcription + AI editing assistant
      </div>
    </div>
  )
}
