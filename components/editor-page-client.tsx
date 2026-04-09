'use client'

import { useEffect } from 'react'
import { useState } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TopBar } from '@/components/top-bar'
import { VideoPlayer } from '@/components/video-player'
import { EditorTabs } from '@/components/editor-tabs'
import { AIAssistant } from '@/components/ai-assistant'
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

      <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        <ResizablePanel defaultSize={22} minSize={16} maxSize={35} className="hidden lg:block min-w-0">
          <AIAssistant />
        </ResizablePanel>

        <ResizableHandle withHandle className="hidden lg:flex" />

        <ResizablePanel defaultSize={78} minSize={50} className="min-w-0 flex-1">
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel 
              defaultSize={48} 
              minSize={28} 
              maxSize={70} 
              className="max-lg:!flex-none max-lg:min-h-[200px] max-lg:h-[38vh] max-lg:max-h-[50vh] min-h-0"
            >
              <VideoPlayer />
            </ResizablePanel>

            <ResizableHandle withHandle className="hidden lg:flex" />

            <ResizablePanel 
              defaultSize={52} 
              minSize={30} 
              className="max-lg:!flex-1 min-h-0"
            >
              <EditorTabs />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="bottom" className="h-[85vh] p-0 lg:hidden">
          <AIAssistant />
        </SheetContent>
      </Sheet>
    </div>
  )
}
