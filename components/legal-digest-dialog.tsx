'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { LegalDigest } from '@/lib/legal-digest-schema'
import { parseTimecodeToMs } from '@/lib/transcript-timecode'

type LegalDigestDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  transcriptId: string
  fetchImpl: typeof fetch
  onSeekToMs: (ms: number) => void
}

export function LegalDigestDialog({
  open,
  onOpenChange,
  projectId,
  transcriptId,
  fetchImpl,
  onSeekToMs,
}: LegalDigestDialogProps) {
  const [focus, setFocus] = useState('')
  const [loading, setLoading] = useState(false)
  const [digest, setDigest] = useState<LegalDigest | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runDigest = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchImpl(`/api/projects/${projectId}/legal-digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptId,
          focus: focus.trim() || undefined,
        }),
      })
      const data = (await res.json()) as { digest?: LegalDigest; error?: string }
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`)
      }
      if (!data.digest) {
        throw new Error('Invalid response')
      }
      setDigest(data.digest)
      toast.success('Digest generated.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Digest failed.'
      setError(msg)
      toast.error('Legal digest failed', { description: msg, duration: 10_000 })
    } finally {
      setLoading(false)
    }
  }, [fetchImpl, focus, projectId, transcriptId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(640px,85vh)] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <div className="border-b border-border/60 px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle>Legal issue digest</DialogTitle>
            <DialogDescription>
              Neutral topic outline with approximate timecodes and short quotes. Assistive only—not legal
              advice. Requires OPENAI_API_KEY.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="legal-digest-focus" className="text-xs">
              Optional reviewer focus
            </Label>
            <Textarea
              id="legal-digest-focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. objections, medical causation, contract termination…"
              className="min-h-[72px] resize-none text-xs"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <ScrollArea className="min-h-[200px] flex-1 rounded-md border border-border/60">
            <div className="space-y-4 p-3 pr-4">
              {!digest && !loading && (
                <p className="text-xs text-muted-foreground">
                  Generate a structured digest from the current transcript. Long recordings may be truncated for
                  the model context window.
                </p>
              )}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Generating digest…
                </div>
              )}
              {digest && (
                <>
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Overview
                    </h4>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{digest.overview}</p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Chapters
                    </h4>
                    {digest.chapters.map((ch, i) => {
                      const startMs = parseTimecodeToMs(ch.approximateStartTimecode)
                      return (
                        <div
                          key={`${ch.title}-${i}`}
                          className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-medium">{ch.title}</p>
                            {startMs != null && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 shrink-0 text-xs"
                                onClick={() => onSeekToMs(startMs)}
                              >
                                Seek to start
                              </Button>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {ch.approximateStartTimecode} – {ch.approximateEndTimecode}
                          </p>
                          <p className="mt-2 leading-relaxed">{ch.summary}</p>
                          <blockquote className="mt-2 border-l-2 border-brand/40 pl-3 text-xs italic text-muted-foreground">
                            {ch.keyQuote}
                          </blockquote>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDigest(null)} disabled={loading}>
            Clear result
          </Button>
          <Button type="button" size="sm" onClick={() => void runDigest()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Working…
              </>
            ) : (
              'Generate digest'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
