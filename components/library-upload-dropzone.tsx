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
        'library-dropzone relative mb-0 flex flex-col items-center justify-center gap-5 overflow-hidden p-8 text-center transition-all duration-300 ease-out sm:p-12',
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
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-3">
        <p className="text-xl font-semibold tracking-tight">
          {isDragOver ? 'Drop videos to upload' : 'Drag & drop videos here (computer)'}
        </p>

        <label
          htmlFor={fileInputId}
          className={cn(
            buttonVariants({ size: 'lg' }),
            'min-h-12 w-full cursor-pointer justify-center gap-2 border-0 px-6 text-base font-semibold shadow-[0_18px_34px_-18px_var(--color-brand)] sm:w-auto',
            'bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-brand)_60%,black))] text-brand-foreground hover:brightness-105',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <UploadCloud className="size-5 shrink-0" />
          Choose videos to upload
        </label>

        <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          On a phone or tablet, you can usually pick several videos at once: look for &ldquo;Select&rdquo; or checkboxes,
          then tap each video, then confirm. For large files, keep this tab in the foreground until the transfer finishes;
          plug in if you can. iOS Low Power Mode may slow uploads.
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
