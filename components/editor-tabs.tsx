'use client'

import { FileText, Layers, Scissors } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
    <Tabs defaultValue="transcript" className="flex h-full flex-col gap-4">
      <Card className="shrink-0 border-border/60 bg-card/55 py-0 shadow-none">
        <CardHeader className="gap-3 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Editor Workspace</p>
              <CardTitle className="mt-1 text-sm">Transcript stays primary. Trim and overlays remain one mode-switch away.</CardTitle>
              <CardDescription className="mt-1">Use the same playback context across all editorial tools.</CardDescription>
            </div>
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <Badge variant="outline" className="rounded-full px-3 font-mono text-[11px]">
                {segmentCount} transcript
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 font-mono text-[11px]">
                {overlayCount} overlays
              </Badge>
              {trimActive && (
                <Badge className="rounded-full bg-brand/90 px-3 text-[11px] text-brand-foreground">
                  Trim active
                </Badge>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="rounded-full px-3 text-[11px] uppercase tracking-[0.16em]">
              Modes
            </Badge>
            <TabsList className="h-auto min-w-max gap-1 rounded-xl p-1">
              <TabsTrigger value="transcript" className="h-10 gap-2 rounded-lg px-4 text-xs">
                <FileText className="size-3.5 shrink-0" />
                <span>Transcript</span>
                {segmentCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-mono">
                    {segmentCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="overlays" className="h-10 gap-2 rounded-lg px-4 text-xs">
                <Layers className="size-3.5 shrink-0" />
                <span>Overlays</span>
                {overlayCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-mono">
                    {overlayCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="trim" className="h-10 gap-2 rounded-lg px-4 text-xs">
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
        </CardHeader>
      </Card>

      <TabsContent value="transcript" className="m-0 min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full min-h-0 overflow-hidden border-border/60 bg-background/70 py-0 shadow-none">
          <CardContent className="min-h-0 flex-1 px-0 py-0">
            <TranscriptEditor />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="overlays" className="m-0 min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full min-h-0 overflow-hidden border-border/60 bg-background/70 py-0 shadow-none">
          <CardContent className="min-h-0 flex-1 px-0 py-0">
            <OverlayEditor />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="trim" className="m-0 min-h-0 flex-1 overflow-hidden">
        <Card className="flex h-full min-h-0 overflow-hidden border-border/60 bg-background/70 py-0 shadow-none">
          <CardContent className="min-h-0 flex-1 px-0 py-0">
            <TrimEditor />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
