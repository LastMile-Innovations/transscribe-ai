'use client'

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Type,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field'
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

  const previewStyle = {
    left: `${overlay.x}%`,
    top: `${overlay.y}%`,
    width: `${overlay.width ?? 80}%`,
    transform: 'translate(-50%, -50%)',
  } as const

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden border transition-all duration-150 shadow-none',
        isActive ? 'border-brand/50 bg-brand/5' : 'border-border bg-muted/30',
      )}
    >
      <CardHeader className="cursor-pointer gap-3 px-4 py-4 hover:bg-muted/20" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted/50">
            <Type className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-sm">{overlay.text || '(empty)'}</CardTitle>
              {isActive && (
                <Badge className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                  Live
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1 font-mono text-xs">
              {formatTime(overlay.startTime)} – {formatTime(overlay.endTime)}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-full"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Collapse overlay settings' : 'Expand overlay settings'}
            >
              {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-full hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              aria-label="Delete overlay"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <>
          <Separator />
          <CardContent className="space-y-5 px-4 py-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Text content</FieldLabel>
                <FieldContent>
                  <Textarea
                    value={overlay.text}
                    onChange={(e) => update({ text: e.target.value })}
                    rows={2}
                    className="min-h-0 resize-none bg-background text-sm"
                  />
                </FieldContent>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel>Start (mm:ss)</FieldLabel>
                  <FieldContent>
                    <Input
                      type="text"
                      defaultValue={formatTime(overlay.startTime)}
                      onBlur={(e) => update({ startTime: msFromInput(e.target.value) })}
                      className="h-8 bg-background px-2.5 font-mono text-sm"
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>End (mm:ss)</FieldLabel>
                  <FieldContent>
                    <Input
                      type="text"
                      defaultValue={formatTime(overlay.endTime)}
                      onBlur={(e) => update({ endTime: msFromInput(e.target.value) })}
                      className="h-8 bg-background px-2.5 font-mono text-sm"
                    />
                  </FieldContent>
                </Field>
              </div>
            </FieldGroup>

            <Separator />

            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel className="justify-between">
                    <span>Horizontal</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{Math.round(overlay.x)}%</Badge>
                  </FieldLabel>
                  <FieldContent>
                    <Slider min={0} max={100} step={1} value={[overlay.x]} onValueChange={([v]) => update({ x: v })} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel className="justify-between">
                    <span>Vertical</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{Math.round(overlay.y)}%</Badge>
                  </FieldLabel>
                  <FieldContent>
                    <Slider min={0} max={100} step={1} value={[overlay.y]} onValueChange={([v]) => update({ y: v })} />
                  </FieldContent>
                </Field>
              </div>

              <Field>
                <FieldLabel className="justify-between">
                  <span>Font size</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{overlay.fontSize}px</Badge>
                </FieldLabel>
                <FieldContent>
                  <Slider min={10} max={72} step={1} value={[overlay.fontSize]} onValueChange={([v]) => update({ fontSize: v })} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel className="justify-between">
                  <span>Text width</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{Math.round(overlay.width ?? 80)}%</Badge>
                </FieldLabel>
                <FieldContent>
                  <Slider min={20} max={100} step={1} value={[overlay.width ?? 80]} onValueChange={([v]) => update({ width: v })} />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel className="justify-between">
                  <span>Background opacity</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{Math.round(overlay.bgOpacity * 100)}%</Badge>
                </FieldLabel>
                <FieldContent>
                  <Slider min={0} max={1} step={0.05} value={[overlay.bgOpacity]} onValueChange={([v]) => update({ bgOpacity: v })} />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Separator />

            <Field>
              <FieldLabel>Weight</FieldLabel>
              <FieldContent>
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
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Font color</FieldLabel>
              <FieldContent>
              <div className="flex flex-wrap gap-1.5">
                {FONT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => update({ fontColor: c.value })}
                    className={cn(
                      'size-8 rounded-full border-2 transition-transform hover:scale-110',
                      overlay.fontColor === c.value ? 'border-brand scale-110' : 'border-border',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Background color</FieldLabel>
              <FieldContent>
              <div className="flex flex-wrap gap-1.5">
                {BG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => update({ bgColor: c.value })}
                    className={cn(
                      'size-8 rounded-full border-2 transition-transform hover:scale-110',
                      overlay.bgColor === c.value ? 'border-brand scale-110' : 'border-border',
                      c.value === 'transparent' && 'bg-gradient-to-br from-muted to-background',
                    )}
                    style={c.value !== 'transparent' ? { backgroundColor: c.value } : undefined}
                  />
                ))}
              </div>
              </FieldContent>
            </Field>

            <Card className="gap-0 overflow-hidden rounded-xl border-border bg-zinc-900 py-0 shadow-none">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Frame Preview</CardTitle>
              </CardHeader>
              <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4">
                <div className="pointer-events-none absolute inset-4 rounded border border-dashed border-white/15" />
                <div className="pointer-events-none absolute inset-7 rounded border border-dashed border-amber-200/20" />
                <span
                  className="absolute inline-block text-center"
                  style={{
                    ...previewStyle,
                    fontSize: `${Math.min(overlay.fontSize, 24)}px`,
                    color: overlay.fontColor,
                    fontWeight: overlay.fontWeight,
                    backgroundColor: overlay.bgColor !== 'transparent'
                      ? `${overlay.bgColor}${Math.round(overlay.bgOpacity * 255).toString(16).padStart(2, '0')}`
                      : 'transparent',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    lineHeight: 1.4,
                    maxWidth: `${overlay.width ?? 80}%`,
                  }}
                >
                  {overlay.text || 'Preview'}
                </span>
              </div>
              <CardContent className="px-4 py-3 text-xs text-muted-foreground">
                Placement mirrors the current horizontal, vertical, and width settings.
              </CardContent>
            </Card>
          </CardContent>
        </>
      )}
    </Card>
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

  const visibleIds = useMemo(() => {
    return new Set(
      state.overlays
        .filter((o) => currentTime >= o.startTime && currentTime <= o.endTime)
        .map((o) => o.id),
    )
  }, [state.overlays, currentTime])

  return (
    <div className="flex h-full flex-col">
      <Card className="m-4 mb-0 shrink-0 gap-0 border-border/60 bg-background/70 py-0 shadow-none">
        <CardHeader className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overlay Inspector</p>
              <CardTitle className="mt-1 text-sm">{state.overlays.length} overlay{state.overlays.length !== 1 ? 's' : ''}</CardTitle>
              <CardDescription>
                {visibleIds.size} visible at {formatTime(currentTime)}
              </CardDescription>
            </div>
            <Button size="sm" className="h-9 rounded-full bg-brand px-4 text-xs text-brand-foreground hover:bg-brand/90" onClick={handleAdd}>
              <Plus className="size-3" />
              Add overlay
            </Button>
          </div>
        </CardHeader>
      </Card>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {state.overlays.length === 0 ? (
            <Empty className="border-border/60 bg-muted/10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Type className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No overlays yet</EmptyTitle>
                <EmptyDescription>Use overlays for subtitles, lower-thirds, and on-screen notes tied to playback timing.</EmptyDescription>
              </EmptyHeader>
              <Button size="sm" className="rounded-full" onClick={handleAdd}>
                <Plus className="size-3" />
                Add first overlay
              </Button>
            </Empty>
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
