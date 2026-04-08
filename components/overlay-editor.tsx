'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Type,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useApp } from '@/lib/app-context'
import type { TextOverlay } from '@/lib/types'
import { cn } from '@/lib/utils'

const FONT_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#fbbf24' },
  { label: 'Cyan', value: '#22d3ee' },
  { label: 'Red', value: '#f87171' },
  { label: 'Black', value: '#000000' },
  { label: 'Brand', value: 'oklch(0.68 0.18 280)' },
]

const BG_COLORS = [
  { label: 'Black', value: '#000000' },
  { label: 'White', value: '#ffffff' },
  { label: 'Dark', value: '#1a1a1a' },
  { label: 'Brand', value: 'oklch(0.62 0.19 280)' },
  { label: 'Transparent', value: 'transparent' },
]

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function msFromInput(value: string): number {
  const parts = value.split(':')
  if (parts.length === 2) {
    const minutes = parseInt(parts[0] ?? '0', 10) || 0
    const seconds = parseInt(parts[1] ?? '0', 10) || 0
    return (minutes * 60 + seconds) * 1000
  }
  return 0
}

const DEFAULT_OVERLAY: Omit<TextOverlay, 'id'> = {
  text: 'New overlay text',
  x: 50,
  y: 85,
  fontSize: 18,
  fontColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.6,
  startTime: 0,
  endTime: 5000,
  fontWeight: 'normal',
  width: 80,
}

function OverlayCard({
  overlay,
  isActive,
}: {
  overlay: TextOverlay
  isActive: boolean
}) {
  const { dispatch } = useApp()
  const [expanded, setExpanded] = useState(false)

  const update = useCallback(
    (updates: Partial<TextOverlay>) => {
      dispatch({ type: 'UPDATE_OVERLAY', id: overlay.id, updates })
    },
    [dispatch, overlay.id],
  )

  const handleDelete = () => {
    dispatch({ type: 'DELETE_OVERLAY', id: overlay.id })
    toast.success('Overlay deleted.')
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-150',
        isActive ? 'border-brand/50 bg-brand/5' : 'border-border bg-muted/30',
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded bg-muted">
          <Type className="size-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{overlay.text || '(empty)'}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatTime(overlay.startTime)} – {formatTime(overlay.endTime)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {expanded && (
        <>
          <Separator />
          <div className="space-y-4 px-3 py-3">
            {/* Text */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Text content</label>
              <textarea
                value={overlay.text}
                onChange={(e) => update({ text: e.target.value })}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/50"
              />
            </div>

            {/* Timing */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Start (mm:ss)</label>
                <input
                  type="text"
                  defaultValue={formatTime(overlay.startTime)}
                  onBlur={(e) => update({ startTime: msFromInput(e.target.value) })}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">End (mm:ss)</label>
                <input
                  type="text"
                  defaultValue={formatTime(overlay.endTime)}
                  onBlur={(e) => update({ endTime: msFromInput(e.target.value) })}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                />
              </div>
            </div>

            {/* Position */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Horizontal</span>
                  <span className="font-mono">{Math.round(overlay.x)}%</span>
                </label>
                <Slider
                  min={0} max={100} step={1}
                  value={[overlay.x]}
                  onValueChange={([v]) => update({ x: v })}
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Vertical</span>
                  <span className="font-mono">{Math.round(overlay.y)}%</span>
                </label>
                <Slider
                  min={0} max={100} step={1}
                  value={[overlay.y]}
                  onValueChange={([v]) => update({ y: v })}
                />
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Font size</span>
                <span className="font-mono">{overlay.fontSize}px</span>
              </label>
              <Slider
                min={10} max={72} step={1}
                value={[overlay.fontSize]}
                onValueChange={([v]) => update({ fontSize: v })}
              />
            </div>

            {/* Background opacity */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Background opacity</span>
                <span className="font-mono">{Math.round(overlay.bgOpacity * 100)}%</span>
              </label>
              <Slider
                min={0} max={1} step={0.05}
                value={[overlay.bgOpacity]}
                onValueChange={([v]) => update({ bgOpacity: v })}
              />
            </div>

            {/* Font weight */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Weight</span>
              <div className="flex gap-1">
                {(['normal', 'bold'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => update({ fontWeight: w })}
                    className={cn(
                      'rounded border px-2 py-0.5 text-xs transition-colors',
                      overlay.fontWeight === w
                        ? 'border-brand/50 bg-brand/10 text-brand'
                        : 'border-border text-muted-foreground hover:border-muted-foreground',
                    )}
                    style={{ fontWeight: w }}
                  >
                    {w.charAt(0).toUpperCase() + w.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Font color */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Font color</label>
              <div className="flex flex-wrap gap-1.5">
                {FONT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => update({ fontColor: c.value })}
                    className={cn(
                      'size-6 rounded-full border-2 transition-transform hover:scale-110',
                      overlay.fontColor === c.value ? 'border-brand scale-110' : 'border-border',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>

            {/* Background color */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Background color</label>
              <div className="flex flex-wrap gap-1.5">
                {BG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => update({ bgColor: c.value })}
                    className={cn(
                      'size-6 rounded-full border-2 transition-transform hover:scale-110',
                      overlay.bgColor === c.value ? 'border-brand scale-110' : 'border-border',
                      c.value === 'transparent' && 'bg-gradient-to-br from-muted to-background',
                    )}
                    style={c.value !== 'transparent' ? { backgroundColor: c.value } : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center justify-center rounded-md bg-zinc-900 py-4">
              <span
                style={{
                  fontSize: `${Math.min(overlay.fontSize, 24)}px`,
                  color: overlay.fontColor,
                  fontWeight: overlay.fontWeight,
                  backgroundColor: overlay.bgColor !== 'transparent'
                    ? `${overlay.bgColor}${Math.round(overlay.bgOpacity * 255).toString(16).padStart(2, '0')}`
                    : 'transparent',
                  padding: '4px 12px',
                  borderRadius: '4px',
                }}
              >
                {overlay.text || 'Preview'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function OverlayEditor() {
  const { state, dispatch } = useApp()
  const currentTime = state.playerTime

  const handleAdd = () => {
    const newOverlay: TextOverlay = {
      ...DEFAULT_OVERLAY,
      id: `overlay-${Date.now()}`,
      startTime: currentTime,
      endTime: currentTime + 5000,
    }
    dispatch({ type: 'ADD_OVERLAY', overlay: newOverlay })
    toast.success('Overlay added at current time.')
  }

  const visibleIds = new Set(
    state.overlays
      .filter((o) => currentTime >= o.startTime && currentTime <= o.endTime)
      .map((o) => o.id),
  )

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-xs font-medium">{state.overlays.length} overlay{state.overlays.length !== 1 ? 's' : ''}</p>
          <p className="text-xs text-muted-foreground">
            {visibleIds.size} visible at {formatTime(currentTime)}
          </p>
        </div>
        <Button size="sm" className="h-7 bg-brand text-brand-foreground hover:bg-brand/90 text-xs" onClick={handleAdd}>
          <Plus className="size-3" />
          Add overlay
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {state.overlays.length === 0 ? (
            <div className="py-12 text-center">
              <Type className="mx-auto mb-3 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No overlays yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click &ldquo;Add overlay&rdquo; to place text on the video.
              </p>
            </div>
          ) : (
            state.overlays.map((overlay) => (
              <OverlayCard
                key={overlay.id}
                overlay={overlay}
                isActive={visibleIds.has(overlay.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
