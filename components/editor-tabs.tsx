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

  return (
    <Tabs defaultValue="transcript" className="flex h-full flex-col">
      <div className="shrink-0 border-b bg-background px-3 pt-2 overflow-x-auto no-scrollbar">
        <TabsList className="h-8 gap-0.5 min-w-max">
          <TabsTrigger value="transcript" className="h-7 gap-1.5 px-3 text-xs">
            <FileText className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">Transcript</span>
            <span className="sm:hidden">Trans.</span>
            {segmentCount > 0 && (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono leading-none text-muted-foreground">
                {segmentCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="overlays" className="h-7 gap-1.5 px-3 text-xs">
            <Layers className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">Overlays</span>
            <span className="sm:hidden">Over.</span>
            {overlayCount > 0 && (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono leading-none text-muted-foreground">
                {overlayCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="trim" className="h-7 gap-1.5 px-3 text-xs">
            <Scissors className="size-3.5 shrink-0" />
            Trim
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
