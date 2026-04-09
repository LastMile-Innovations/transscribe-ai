'use client'

import { FileVideo } from 'lucide-react'

export function LibraryEmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-5 py-32 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-muted/50 shadow-inner">
        <FileVideo className="size-10 text-muted-foreground/60" />
      </div>
      <div className="max-w-sm">
        <p className="text-lg font-semibold text-foreground tracking-tight">
          {hasFilter ? 'No matching projects found' : 'Your library is empty'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {hasFilter
            ? 'Try adjusting your search query or status filter to find what you are looking for.'
            : 'Upload your first video to get started. You can transcribe it, edit the text, and add overlays.'}
        </p>
      </div>
    </div>
  )
}
