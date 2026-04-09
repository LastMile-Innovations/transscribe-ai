'use client'

import { useEffect } from 'react'
import { useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { VideoPlayer } from '@/components/video-player'
import { EditorTabs } from '@/components/editor-tabs'
import { AIAssistant } from '@/components/ai-assistant'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/app-context'

export default function EditorPageClient({
  projectId,
}: {
  projectId: string
}) {
  const { state, dispatch } = useApp()
  const [aiOpen, setAiOpen] = useState(false)
  const project = state.projects.find((p) => p.id === projectId)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTypingTarget =
        document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'
      const allowWhileTyping = e.altKey && (e.key === ' ' || e.key.toLowerCase() === 'j' || e.key.toLowerCase() === 'l')

      if (isTypingTarget && !allowWhileTyping) {
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        dispatch({ type: 'SET_PLAYING', isPlaying: !state.isPlaying })
      } else if (e.key === 'j') {
        e.preventDefault()
        const newTime = Math.max(0, state.playerTime - 5000)
        window.dispatchEvent(new CustomEvent('app:seek', { detail: { timeMs: newTime } }))
        dispatch({ type: 'SET_PLAYER_TIME', time: newTime })
      } else if (e.key === 'l') {
        e.preventDefault()
        const duration = project?.duration ?? 0
        const newTime = Math.min(duration, state.playerTime + 5000)
        window.dispatchEvent(new CustomEvent('app:seek', { detail: { timeMs: newTime } }))
        dispatch({ type: 'SET_PLAYER_TIME', time: newTime })
      } else if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement
        if (searchInput) searchInput.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.isPlaying, state.playerTime, project?.duration, dispatch])

  useEffect(() => {
    const handleOpenAi = () => setAiOpen(true)
    window.addEventListener('editor:open-ai', handleOpenAi)
    return () => window.removeEventListener('editor:open-ai', handleOpenAi)
  }, [])

  if (!project)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-brand">Loading project...</div>
      </div>
    )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden p-3 md:p-4">
        <div className="hidden h-full lg:block">
          <ResizablePanelGroup orientation="horizontal" className="gap-4">
            <ResizablePanel defaultSize={72} minSize={56}>
              <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/70 bg-background/90 py-0 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)]">
                <CardHeader className="gap-4 px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Active Edit
                      </p>
                      <CardTitle className="mt-2 text-base">
                        Playback, transcript, overlays, and trim stay coordinated while you work.
                      </CardTitle>
                      <CardDescription className="mt-1 max-w-2xl">
                        Built as a production-style editorial console with persistent media context and faster access to cleanup tools.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 lg:hidden"
                      onClick={() => setAiOpen(true)}
                    >
                      <Bot className="size-4" />
                      Assistant
                    </Button>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="grid min-h-0 flex-1 grid-rows-[minmax(19rem,39vh)_minmax(0,1fr)] px-0 py-0 xl:grid-rows-[minmax(21rem,42vh)_minmax(0,1fr)]">
                  <div className="min-h-0 bg-card/30 px-4 py-4">
                    <Card className="h-full min-h-0 overflow-hidden border-border/60 bg-background/60 py-0 shadow-none">
                      <VideoPlayer />
                    </Card>
                  </div>
                  <div className="min-h-0 px-4 pb-4">
                    <EditorTabs />
                  </div>
                </CardContent>
              </Card>
            </ResizablePanel>

            <ResizableHandle withHandle className="hidden lg:flex" />

            <ResizablePanel defaultSize={28} minSize={22} maxSize={38}>
              <aside className="flex h-full min-h-0 flex-col gap-4">
                <Card className="border-border/70 bg-card/75 py-0 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)]">
                  <CardHeader className="gap-2 px-5 py-4">
                    <div className="flex items-center gap-2 text-brand">
                      <Sparkles className="size-4" />
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Utility Rail</p>
                    </div>
                    <CardTitle className="text-sm">Assistant and cleanup tools stay open while the edit stays primary.</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="flex min-h-0 flex-1 overflow-hidden border-border/70 bg-card/80 py-0 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)]">
                  <AIAssistant />
                </Card>
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <div className="flex h-full flex-col gap-4 lg:hidden">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/70 bg-background/90 py-0 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)]">
            <CardHeader className="gap-3 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Active Edit
                  </p>
                  <CardTitle className="mt-2 text-base">
                    Playback and transcript stay in view while you edit.
                  </CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiOpen(true)}
                >
                  <Bot className="size-4" />
                  Assistant
                </Button>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="grid min-h-0 flex-1 grid-rows-[minmax(17rem,34vh)_minmax(0,1fr)] px-4 py-4">
              <Card className="min-h-0 overflow-hidden border-border/60 bg-background/60 py-0 shadow-none">
                <VideoPlayer />
              </Card>
              <div className="min-h-0 pt-4">
                <EditorTabs />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl lg:hidden">
          <AIAssistant />
        </SheetContent>
      </Sheet>
    </div>
  )
}
