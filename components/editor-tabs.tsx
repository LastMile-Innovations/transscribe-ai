'use client'

import { FileText, Layers, Scissors } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
    <Tabs defaultValue="transcript" className="flex h-full flex-col bg-[color:var(--editor-canvas)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--editor-panel-border)] bg-[color:var(--editor-chrome)] px-4 py-2">
        <TabsList className="h-auto min-w-max gap-1 rounded-xl p-1 bg-transparent">
          <TabsTrigger value="transcript" className="h-9 gap-2 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText className="size-3.5 shrink-0" />
            <span>Transcript</span>
            {segmentCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-mono">
                {segmentCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overlays" className="h-9 gap-2 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Layers className="size-3.5 shrink-0" />
            <span>Overlays</span>
            {overlayCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-mono">
                {overlayCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trim" className="h-9 gap-2 rounded-lg px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Scissors className="size-3.5 shrink-0" />
            <span>Trim</span>
            {trimActive && (
              <Badge className="rounded-full bg-brand/90 px-1.5 py-0 text-[10px] text-brand-foreground">
                Active
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="transcript" className="m-0 min-h-0 flex-1 overflow-hidden bg-[color:var(--editor-canvas)]">
        <TranscriptEditor />
      </TabsContent>
      <TabsContent value="overlays" className="m-0 min-h-0 flex-1 overflow-hidden bg-[color:var(--editor-canvas)]">
        <OverlayEditor />
      </TabsContent>
      <TabsContent value="trim" className="m-0 min-h-0 flex-1 overflow-hidden bg-[color:var(--editor-canvas)]">
        <TrimEditor />
      </TabsContent>
    </Tabs>
  )
}
