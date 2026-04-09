'use client'

import { useEffect } from 'react'
import { useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TopBar } from '@/components/top-bar'
import { VideoPlayer } from '@/components/video-player'
import { EditorTabs } from '@/components/editor-tabs'
import { AIAssistant } from '@/components/ai-assistant'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/app-context'
import type { TranscriptSummary } from '@/lib/types'

export default function EditorPageClient({
  projectId,
  initialTranscriptList,
}: {
  projectId: string
  initialTranscriptList: TranscriptSummary[]
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

  if (!project)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-brand">Loading project...</div>
      </div>
    )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar onOpenAi={() => setAiOpen(true)} initialTranscriptList={initialTranscriptList} />

      <div className="flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 gap-4 p-3 md:p-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="flex min-h-0 flex-col overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/80 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Active Edit
                </p>
                <h2 className="text-sm font-semibold text-foreground md:text-base">
                  Playback and transcript stay in view while you edit
                </h2>
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

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(17rem,36vh)_minmax(0,1fr)] lg:grid-rows-[minmax(20rem,40vh)_minmax(0,1fr)]">
              <div className="min-h-0 border-b border-border/60 bg-card/40">
                <VideoPlayer />
              </div>
              <div className="min-h-0">
                <EditorTabs />
              </div>
            </div>
          </main>

          <aside className="hidden min-h-0 lg:flex lg:flex-col">
            <div className="mb-4 rounded-[1.25rem] border border-border/70 bg-card/70 p-4 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <div className="flex items-center gap-2 text-brand">
                <Sparkles className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Utility Rail</p>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">Use AI, cleanup, and review tools without stealing space from the main edit.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-[1.25rem] border border-border/70 bg-card/80 shadow-[0_18px_70px_-36px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <AIAssistant />
            </div>
          </aside>
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
