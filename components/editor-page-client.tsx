'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { EditorShell } from '@/components/editor-shell'
import { AIAssistant } from '@/components/ai-assistant'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'
import { clampPlaybackTime } from '@/lib/video-playback'

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
      const allowWhileTyping =
        (e.altKey && (e.key === ' ' || e.key.toLowerCase() === 'j' || e.key.toLowerCase() === 'l')) ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a')

      if (isTypingTarget && !allowWhileTyping) {
        return
      }

      if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('editor:cycle-layout'))
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setAiOpen((open) => !open)
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        dispatch({ type: 'SET_PLAYING', isPlaying: !state.isPlaying })
      } else if (e.key === 'j') {
        e.preventDefault()
        const newTime = clampPlaybackTime(state.playerTime - 5000, project?.duration ?? 0, state.trimRange)
        window.dispatchEvent(new CustomEvent('app:seek', { detail: { timeMs: newTime } }))
        dispatch({ type: 'SET_PLAYER_TIME', time: newTime })
      } else if (e.key === 'l') {
        e.preventDefault()
        const newTime = clampPlaybackTime(state.playerTime + 5000, project?.duration ?? 0, state.trimRange)
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
  }, [state.isPlaying, state.playerTime, state.trimRange, project?.duration, dispatch])

  useEffect(() => {
    const handleOpenAi = () => setAiOpen(true)
    window.addEventListener('editor:open-ai', handleOpenAi)
    return () => window.removeEventListener('editor:open-ai', handleOpenAi)
  }, [])

  if (!project)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-background">
        <div className="animate-pulse text-brand">Loading project...</div>
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3 md:p-4">
        <EditorShell />
      </div>

      {!aiOpen && (
        <Button
          type="button"
          size="lg"
          className={cn(
            'fixed z-40 h-12 w-12 touch-manipulation rounded-full border border-border/80 bg-card p-0 shadow-lg',
            // Bottom-right avoids overlap with video timeline/controls (anchored bottom on mobile)
            'bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))]',
            'max-lg:h-14 max-lg:w-14 max-lg:shadow-xl max-lg:[&_svg]:size-[1.35rem]',
            'hover:bg-accent hover:text-accent-foreground',
          )}
          onClick={() => setAiOpen(true)}
          aria-label="Open AI assistant"
          title="Open AI assistant (⌘⇧A)"
        >
          <Sparkles className="size-5 text-brand" />
        </Button>
      )}

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md md:max-w-xl">
          <AIAssistant />
        </SheetContent>
      </Sheet>
    </div>
  )
}
