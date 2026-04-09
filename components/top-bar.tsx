'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  FileStack,
  Info,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TranscriptSummary, VideoProject } from '@/lib/types'
import { EditorTopBarActions } from '@/components/top-bar-actions-client'
import { EditorTopBarStatus } from '@/components/top-bar-status-client'
import { EditorTopBarTitle } from '@/components/top-bar-title-client'

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function ProjectMetaBadges({ project }: { project: VideoProject }) {
  return (
    <>
      <Badge variant="outline" className="rounded-full px-2.5 py-1 font-mono">
        {formatDuration(project.duration)} runtime
      </Badge>
      {project.caseId && (
        <Badge variant="secondary" className="rounded-full px-2.5 py-1 font-mono">
          {project.caseId}
        </Badge>
      )}
      {project.exhibitNumber && (
        <Badge variant="outline" className="rounded-full border-brand/30 px-2.5 py-1 font-mono text-brand">
          EX-{project.exhibitNumber}
        </Badge>
      )}
    </>
  )
}

export function TopBar({
  project,
  initialTranscriptList = [],
}: {
  project: VideoProject
  initialTranscriptList?: TranscriptSummary[]
}) {
  const libraryHref = project.workspaceProjectId ? `/?wp=${project.workspaceProjectId}` : '/'

  return (
    <header className="shrink-0 border-b border-border/60 bg-background/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 sm:gap-x-3 sm:gap-y-2 sm:px-3 sm:py-2 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button variant="ghost" size="icon-sm" className="touch-manipulation" asChild>
            <Link href={libraryHref} aria-label="Back to library">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href={libraryHref} className="flex items-center gap-1.5 transition-colors hover:text-brand">
              <Sparkles className="size-3.5 text-brand" />
              <span className="hidden font-medium sm:inline">Library</span>
            </Link>
            <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
            <EditorTopBarTitle projectId={project.id} initialTitle={project.title} />

            {(project.caseId || project.exhibitNumber) && (
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                {project.caseId && (
                  <Badge variant="secondary" className="h-5 gap-1 px-1.5 font-mono text-[10px]">
                    <Briefcase className="size-2.5" />
                    {project.caseId}
                  </Badge>
                )}
                {project.exhibitNumber && (
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 border-brand/30 px-1.5 font-mono text-[10px] text-brand"
                  >
                    <FileStack className="size-2.5" />
                    EX-{project.exhibitNumber}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <ProjectMetaBadges project={project} />
            <span className="max-w-md truncate text-xs text-muted-foreground">
              Core loop: play, seek, and edit transcript without leaving the page.
            </span>
          </div>

          <EditorTopBarStatus />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                className="inline-flex touch-manipulation lg:hidden"
                aria-label="Project details"
              >
                <Info className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(100vw-1.5rem,20rem)] sm:w-80" align="end">
              <p className="mb-2 text-xs font-medium text-foreground">Project</p>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <ProjectMetaBadges project={project} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Core loop: play, seek, and edit transcript without leaving the page.
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <EditorTopBarActions project={project} initialTranscriptList={initialTranscriptList} />
        </div>
      </div>
    </header>
  )
}
