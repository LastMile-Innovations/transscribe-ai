'use client'

import { FileText, Layers, Scissors } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TranscriptEditor } from './transcript-editor'
import { OverlayEditor } from './overlay-editor'
import { TrimEditor } from './trim-editor'
import { useApp } from '@/lib/app-context'

export function EditorTabs() {
  const { state } = useApp()

  const overlayCount = state.overlays.length
  const segmentCount = state.transcript?.segments.length ?? 0
  const trimActive = Boolean(state.trimRange && state.projects.find((p) => p.id === state.activeProjectId)?.duration !== (state.trimRange.end - state.trimRange.start))

  return (
    <Tabs defaultValue="transcript" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 bg-card/40 px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Editor Workspace</p>
            <p className="text-sm font-medium text-foreground">Transcript stays primary. Trim and overlays live alongside it.</p>
          </div>
        </div>
        <TabsList className="h-auto min-w-max gap-1 rounded-xl p-1">
          <TabsTrigger value="transcript" className="h-10 gap-2 rounded-lg px-4 text-xs">
            <FileText className="size-3.5 shrink-0" />
            <span>Transcript</span>
            {segmentCount > 0 && (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono leading-none text-muted-foreground">
                {segmentCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="overlays" className="h-10 gap-2 rounded-lg px-4 text-xs">
            <Layers className="size-3.5 shrink-0" />
            <span>Overlays</span>
            {overlayCount > 0 && (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono leading-none text-muted-foreground">
                {overlayCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="trim" className="h-10 gap-2 rounded-lg px-4 text-xs">
            <Scissors className="size-3.5 shrink-0" />
            <span>Trim</span>
            {trimActive && (
              <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                Active
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="transcript" className="m-0 flex-1 overflow-hidden">
        <TranscriptEditor />
      </TabsContent>
      <TabsContent value="overlays" className="m-0 flex-1 overflow-hidden">
        <OverlayEditor />
      </TabsContent>
      <TabsContent value="trim" className="m-0 flex-1 overflow-hidden">
        <TrimEditor />
      </TabsContent>
    </Tabs>
  )
}
