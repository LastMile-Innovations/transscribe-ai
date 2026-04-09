'use client'

import { Sparkles, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LibraryUploadDropzone({
  disabled,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
}: {
  disabled: boolean
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onBrowse: () => void
}) {
  return (
    <div
      className={cn(
        'relative mb-8 flex flex-col items-center justify-center gap-5 overflow-hidden rounded-[1.75rem] border p-12 text-center transition-all duration-300 ease-out',
        isDragOver
          ? 'border-brand/40 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_14%,white),white)] scale-[1.01] shadow-[0_28px_65px_-40px_var(--color-brand)]'
          : 'border-white/60 bg-white/65 shadow-[0_24px_60px_-46px_rgba(0,0,0,0.45)] hover:border-brand/30 hover:bg-white/80',
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
      <div className="relative z-10 space-y-1.5">
        <p className="text-xl font-semibold tracking-tight">
          {isDragOver ? 'Drop videos to upload' : 'Drag & drop your videos here'}
        </p>
        <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
          or{' '}
          <button
            type="button"
            className="font-semibold text-brand underline-offset-4 transition-all hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onBrowse}
          >
            browse files
          </button>{' '}
          &mdash; MP4, MOV, WebM, AVI supported
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-2.5 rounded-full border border-white/60 bg-background/70 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
        <Sparkles className="size-3.5 text-brand" />
        AssemblyAI transcription + AI editing assistant
      </div>
    </div>
  )
}
