import Link from 'next/link'
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  FileStack,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

export function TopBar({
  project,
  initialTranscriptList = [],
}: {
  project: VideoProject
  initialTranscriptList?: TranscriptSummary[]
}) {
  const libraryHref = project.workspaceProjectId ? `/?wp=${project.workspaceProjectId}` : '/'

  return (
    <header className="border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="flex min-h-14 items-center gap-3 px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button variant="ghost" size="icon-sm" asChild>
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

          <div className="flex min-w-0 flex-1 items-center gap-3">
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

          <EditorTopBarStatus />
        </div>

        <EditorTopBarActions project={project} initialTranscriptList={initialTranscriptList} />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-t border-border/40 px-3 py-2 text-xs text-muted-foreground md:px-4">
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
        <span className="hidden md:inline">Core loop: play, seek, and edit transcript without leaving the page.</span>
      </div>
    </header>
  )
}
