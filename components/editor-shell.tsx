'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Columns2, GripVertical, PanelTop, PictureInPicture2 } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { EditorTabs } from '@/components/editor-tabs'
import { VideoPlayer } from '@/components/video-player'

const STORAGE_KEY_DESKTOP = 'editor.layout.v1'
const STORAGE_KEY_MOBILE = 'editor.layout.mobile.v1'
const LG_MIN = 1024

function layoutStorageKey(): string {
  if (typeof window === 'undefined') return STORAGE_KEY_DESKTOP
  return window.innerWidth < LG_MIN ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP
}

export type EditorLayoutMode = 'split' | 'stacked' | 'focus'

const MODES: EditorLayoutMode[] = ['split', 'stacked', 'focus']

function isEditorLayoutMode(v: string): v is EditorLayoutMode {
  return v === 'split' || v === 'stacked' || v === 'focus'
}

function usePersistedEditorLayout() {
  const [mode, setModeState] = useState<EditorLayoutMode>('split')
  const [hydrated, setHydrated] = useState(false)

  useLayoutEffect(() => {
    try {
      const mobile = window.innerWidth < LG_MIN
      const key = mobile ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP
      const raw = localStorage.getItem(key)
      if (raw && isEditorLayoutMode(raw)) {
        setModeState(raw)
      } else if (mobile) {
        setModeState('stacked')
      }
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  const persistMode = useCallback((m: EditorLayoutMode) => {
    try {
      localStorage.setItem(layoutStorageKey(), m)
    } catch {
      /* ignore */
    }
  }, [])

  const setMode = useCallback(
    (m: EditorLayoutMode) => {
      setModeState(m)
      persistMode(m)
    },
    [persistMode],
  )

  const cycle = useCallback(() => {
    setModeState((prev) => {
      const idx = MODES.indexOf(prev)
      const next = MODES[(idx + 1) % MODES.length]!
      try {
        localStorage.setItem(layoutStorageKey(), next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return { mode, setMode, cycle, hydrated }
}

function EditorFloatingPlayer({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ right: 16, bottom: 16 })
  const dragRef = useRef<{
    startX: number
    startY: number
    startR: number
    startB: number
  } | null>(null)

  const clampPosition = useCallback((right: number, bottom: number) => {
    const el = rootRef.current
    const w = el?.offsetWidth ?? 320
    const h = el?.offsetHeight ?? 200
    const vw = typeof window !== 'undefined' ? window.innerWidth : w + 32
    const vh = typeof window !== 'undefined' ? window.innerHeight : h + 32
    const pad = 8
    const maxR = Math.max(pad, vw - w - pad)
    const maxB = Math.max(pad, vh - h - pad)
    return {
      right: Math.max(pad, Math.min(maxR, right)),
      bottom: Math.max(pad, Math.min(maxB, bottom)),
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPosition(p.right, p.bottom))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampPosition])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startR: pos.right,
      startB: pos.bottom,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const nextR = dragRef.current.startR - dx
    const nextB = dragRef.current.startB - dy
    setPos(clampPosition(nextR, nextB))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Floating video preview"
      className="editor-workspace-panel pointer-events-auto fixed z-50 flex w-[min(100vw-1.5rem,22rem)] flex-col overflow-hidden rounded-xl"
      style={{
        right: `max(${pos.right}px, env(safe-area-inset-right, 0px))`,
        bottom: `max(${pos.bottom}px, env(safe-area-inset-bottom, 0px))`,
        maxHeight: 'min(45vh, 22rem)',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-drag-handle
        className="flex cursor-grab touch-none items-center gap-1 border-b border-[color:var(--editor-video-border)] bg-[color:var(--editor-video-bg)] px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="size-4 shrink-0 text-[color:var(--editor-video-chrome-muted)]" aria-hidden />
        <span className="truncate text-xs font-medium text-[color:var(--editor-video-chrome-fg)]">
          Drag to reposition
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

const LAYOUT_MODES: {
  value: EditorLayoutMode
  icon: ReactNode
  label: string
  tip: string
}[] = [
  {
    value: 'split',
    icon: <Columns2 className="size-3.5" />,
    label: 'Split',
    tip: 'Side-by-side editor and video',
  },
  {
    value: 'stacked',
    icon: <PanelTop className="size-3.5" />,
    label: 'Stacked',
    tip: 'Video above editor',
  },
  {
    value: 'focus',
    icon: <PictureInPicture2 className="size-3.5" />,
    label: 'Focus',
    tip: 'Maximize editor; video in a dock',
  },
]

function LayoutToolbar({
  mode,
  setMode,
  layoutTooltipsEnabled,
}: {
  mode: EditorLayoutMode
  setMode: (m: EditorLayoutMode) => void
  /** When false (compact editor width), show visible labels and skip hover tooltips for touch. */
  layoutTooltipsEnabled: boolean
}) {
  return (
    <div
      className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2"
      role="toolbar"
      aria-label="Editor workspace layout"
    >
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (v && isEditorLayoutMode(v)) setMode(v)
        }}
        variant="outline"
        size="sm"
        className="rounded-lg bg-card/40 p-0.5"
      >
        {LAYOUT_MODES.map(({ value, icon, label, tip }) => {
          const item = (
            <ToggleGroupItem
              value={value}
              className="min-h-10 gap-1.5 px-2.5 text-xs touch-manipulation lg:min-h-8"
              aria-label={`${label} view`}
            >
              {icon}
              <span className={layoutTooltipsEnabled ? 'hidden sm:inline' : 'inline'}>{label}</span>
            </ToggleGroupItem>
          )
          return layoutTooltipsEnabled ? (
            <Tooltip key={value}>
              <TooltipTrigger asChild>{item}</TooltipTrigger>
              <TooltipContent side="bottom">{tip}</TooltipContent>
            </Tooltip>
          ) : (
            <Fragment key={value}>{item}</Fragment>
          )
        })}
      </ToggleGroup>
      {layoutTooltipsEnabled ? (
        <p className="text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border/80 bg-muted/50 px-1 py-0.5 font-mono">⌘</kbd>
          <span className="mx-0.5">/</span>
          <kbd className="rounded border border-border/80 bg-muted/50 px-1 py-0.5 font-mono">Ctrl</kbd>
          <kbd className="ml-0.5 rounded border border-border/80 bg-muted/50 px-1 py-0.5 font-mono">\</kbd>
          <span className="ml-1.5">Cycle layout</span>
        </p>
      ) : (
        <p className="w-full min-w-0 text-[10px] leading-snug text-muted-foreground sm:max-w-[18rem]">
          Tap the video to play or pause. With a keyboard: J/L skip 5s, Space play/pause, ⌘/Ctrl+\ cycles layout.
        </p>
      )}
    </div>
  )
}

function WorkPanel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('editor-workspace-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl', className)}>
      {children}
    </div>
  )
}

export function EditorShell() {
  const { mode, setMode, cycle, hydrated } = usePersistedEditorLayout()

  useEffect(() => {
    const onCycle = () => cycle()
    window.addEventListener('editor:cycle-layout', onCycle)
    return () => window.removeEventListener('editor:cycle-layout', onCycle)
  }, [cycle])

  const renderVideo = (
    layout: 'sidebar' | 'dock',
    opts?: { omitDockHeader?: boolean; showTouchPlaybackHint?: boolean },
  ) => (
    <VideoPlayer
      layout={layout}
      omitDockHeader={opts?.omitDockHeader}
      showTouchPlaybackHint={opts?.showTouchPlaybackHint}
    />
  )

  /* Desktop: split */
  const desktopSplit = (
    <ResizablePanelGroup orientation="horizontal" className="gap-4" aria-label="Editor and video panels">
      <ResizablePanel defaultSize={60} minSize={36}>
        <WorkPanel>
          <EditorTabs />
        </WorkPanel>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={40} minSize={26}>
        <WorkPanel>
          {renderVideo('sidebar')}
        </WorkPanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  )

  /* Desktop: stacked — video top, capped height */
  const desktopStacked = (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="editor-workspace-panel flex max-h-[42vh] min-h-[12rem] shrink-0 flex-col overflow-hidden rounded-xl">
        {renderVideo('sidebar')}
      </div>
      <div className="min-h-0 flex-1">
        <WorkPanel className="h-full">
          <EditorTabs />
        </WorkPanel>
      </div>
    </div>
  )

  /* Desktop: focus — full editor + floating dock */
  const desktopFocus = (
    <div className="relative h-full min-h-0">
      <WorkPanel className="h-full">
        <EditorTabs />
      </WorkPanel>
      <EditorFloatingPlayer>{renderVideo('dock', { omitDockHeader: true })}</EditorFloatingPlayer>
    </div>
  )

  /* Mobile: split — editor top, video strip bottom (dvh keeps toolbar/chrome in view) */
  const mobileSplit = (
    <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-xl editor-workspace-panel">
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorTabs />
      </div>
      <div className="h-[min(34dvh,220px)] min-h-[13rem] max-h-[38dvh] shrink-0 border-t border-[color:var(--editor-panel-border)] bg-[color:var(--editor-canvas)]">
        {renderVideo('sidebar', { showTouchPlaybackHint: true })}
      </div>
    </div>
  )

  /* Mobile: stacked — video top */
  const mobileStacked = (
    <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-xl editor-workspace-panel">
      <div className="h-[min(38dvh,260px)] min-h-[12rem] max-h-[42dvh] shrink-0 border-b border-[color:var(--editor-panel-border)]">
        {renderVideo('sidebar', { showTouchPlaybackHint: true })}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorTabs />
      </div>
    </div>
  )

  /* Mobile: focus — editor + sticky dock */
  const mobileFocus = (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="editor-workspace-panel min-h-0 flex-1 overflow-hidden rounded-t-xl rounded-b-none border-b-0">
        <EditorTabs />
      </div>
      <div
        className="editor-workspace-panel max-h-[min(38dvh,280px)] min-h-[12rem] shrink-0 overflow-hidden rounded-b-xl border-t border-[color:var(--editor-panel-border)] shadow-lg"
        style={{
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        }}
      >
        {renderVideo('dock', { showTouchPlaybackHint: true })}
      </div>
    </div>
  )

  let desktopBody = desktopSplit
  if (mode === 'stacked') desktopBody = desktopStacked
  if (mode === 'focus') desktopBody = desktopFocus

  let mobileBody = mobileSplit
  if (mode === 'stacked') mobileBody = mobileStacked
  if (mode === 'focus') mobileBody = mobileFocus

  return (
    <main
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Transcript editor workspace"
    >
      <div className="mb-2 hidden shrink-0 justify-end sm:justify-start lg:mb-3 lg:flex lg:justify-between">
        <LayoutToolbar
          mode={hydrated ? mode : 'split'}
          setMode={setMode}
          layoutTooltipsEnabled
        />
      </div>
      <div className="mb-2 flex shrink-0 justify-end sm:justify-start lg:hidden">
        <LayoutToolbar
          mode={hydrated ? mode : 'stacked'}
          setMode={setMode}
          layoutTooltipsEnabled={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="hidden h-full lg:block">{desktopBody}</div>
        <div className="h-full lg:hidden">{mobileBody}</div>
      </div>
    </main>
  )
}
