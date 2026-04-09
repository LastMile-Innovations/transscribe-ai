'use client'

import { useEffect } from 'react'
import { useState } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { VideoPlayer } from '@/components/video-player'
import { EditorTabs } from '@/components/editor-tabs'
import { AIAssistant } from '@/components/ai-assistant'
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
        {/* Desktop Layout */}
        <div className="hidden h-full lg:block">
          <ResizablePanelGroup orientation="horizontal" className="gap-4">
            <ResizablePanel defaultSize={60} minSize={40}>
              <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border/70 rounded-xl bg-background/90 shadow-sm">
                <EditorTabs />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="hidden lg:flex" />

            <ResizablePanel defaultSize={40} minSize={28}>
              <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border/70 rounded-xl bg-background/90 shadow-sm">
                <VideoPlayer layout="sidebar" />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Mobile Layout */}
        <div className="flex h-full flex-col gap-4 lg:hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 rounded-xl bg-background/90 shadow-sm">
            <div className="min-h-0 flex-1">
              <EditorTabs />
            </div>
            <div className="h-[35vh] min-h-[17rem] shrink-0 border-t border-border/60 bg-background/60">
              <VideoPlayer layout="sidebar" />
            </div>
          </div>
        </div>
      </div>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md md:max-w-xl">
          <AIAssistant />
        </SheetContent>
      </Sheet>
    </div>
  )
}
