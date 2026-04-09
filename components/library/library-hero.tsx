'use client'

export function LibraryHero() {
  return (
    <div className="mb-4 md:mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand/80 md:text-[11px]">
        Editorial Workspace
      </p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance md:mt-2 md:text-3xl lg:text-4xl">
        Video Library
      </h1>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground md:mt-2 md:text-sm md:leading-6">
        <span className="md:hidden">Upload videos, open a file to edit, then transcribe when ready.</span>
        <span className="hidden md:inline">
          Add one or many videos, tune transcription options, then start AssemblyAI from each file when you are
          ready.
        </span>
      </p>
    </div>
  )
}
