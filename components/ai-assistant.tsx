'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Sparkles,
  Send,
  Trash2,
  Wand2,
  Check,
  Loader2,
  Bot,
  User,
  AlertCircle,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/lib/app-context'
import type { TextOverlay } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuthedFetch } from '@/lib/authed-fetch'
import { bulkUpdateSegmentsAction } from '@/lib/actions'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from 'ai'

const SUGGESTED_PROMPTS = [
  'Fix grammar in transcript',
  'Remove filler words (um, uh)',
  'Find all sections by Speaker A',
  'Add subtitle overlays',
  'Trim silence at start and end',
  'Summarise this video',
]

function renderMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    const lines = part.split('\n')
    return lines.map((line, j) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < lines.length - 1 && <br />}
      </span>
    ))
  })
}

function ToolCallCard({
  toolName,
  state,
  errorText,
}: {
  toolName: string
  state: string
  errorText?: string
}) {
  const ACTION_ICONS: Record<string, string> = {
    addOverlay: 'Add overlays',
    trimVideo: 'Trim video',
    removeFillerWords: 'Remove filler words',
    fixGrammar: 'Fix grammar',
  }

  const doneOk = state === 'output-available'
  const failed = state === 'output-error'
  const denied = state === 'output-denied'
  const inFlight =
    !doneOk &&
    !failed &&
    !denied &&
    (state === 'input-streaming' ||
      state === 'input-available' ||
      state === 'approval-requested' ||
      state === 'approval-responded')

  return (
    <div
      className={cn(
        'mt-2 overflow-hidden rounded-lg border bg-muted/30',
        failed && 'border-destructive/40 bg-destructive/5',
        doneOk && 'border-brand/30 bg-brand/5',
        !failed && !doneOk && 'border-border',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Wand2
          className={cn(
            'size-3.5 shrink-0',
            failed ? 'text-destructive' : 'text-brand',
          )}
        />
        <span
          className={cn(
            'flex-1 text-xs font-medium',
            failed ? 'text-destructive' : 'text-brand',
          )}
        >
          {ACTION_ICONS[toolName] ?? toolName}
        </span>
        {inFlight && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {doneOk && (
        <div className="flex items-center gap-1 border-t border-brand/20 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-500">
          <Check className="size-3" />
          Execution applied
        </div>
      )}
      {failed && errorText && (
        <div className="flex items-start gap-1.5 border-t border-destructive/20 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="leading-relaxed">{errorText}</span>
        </div>
      )}
      {denied && (
        <div className="border-t border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
          This action was not approved.
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs',
          isUser ? 'bg-secondary' : 'bg-brand/20',
        )}
      >
        {isUser ? (
          <User className="size-3.5 text-muted-foreground" />
        ) : (
          <Bot className="size-3.5 text-brand" />
        )}
      </div>

      <div className={cn('flex max-w-[85%] flex-col gap-1', isUser && 'items-end')}>
        {message.parts.map((part, i) => {
          if (isTextUIPart(part) && part.text.trim()) {
            return (
              <div
                key={`${message.id}-t-${i}`}
                className={cn(
                  'rounded-2xl px-3 py-2 text-sm leading-relaxed',
                  isUser
                    ? 'rounded-tr-sm bg-secondary text-foreground'
                    : 'rounded-tl-sm bg-muted text-foreground',
                )}
              >
                <>{renderMarkdown(part.text)}</>
              </div>
            )
          }
          if (isToolUIPart(part)) {
            const name = getToolName(part)
            const errText =
              part.state === 'output-error' && 'errorText' in part
                ? part.errorText
                : undefined
            return (
              <ToolCallCard
                key={part.toolCallId}
                toolName={name}
                state={part.state}
                errorText={errText}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

export function AIAssistant() {
  const authedFetch = useAuthedFetch()
  const { state, dispatch } = useApp()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const transcriptTextRef = useRef('')
  const activeProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    transcriptTextRef.current =
      state.transcript?.segments.map((s) => s.text).join(' ') ?? ''
  }, [state.transcript])

  useEffect(() => {
    activeProjectIdRef.current = state.activeProjectId
  }, [state.activeProjectId])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        credentials: 'include',
        fetch: authedFetch,
        prepareSendMessagesRequest: ({ body }) => ({
          body: {
            ...body,
            data: {
              transcriptText: transcriptTextRef.current,
              projectId: activeProjectIdRef.current ?? '',
            },
          },
        }),
      }),
    [authedFetch],
  )

  const applyToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      switch (toolName) {
        case 'removeFillerWords': {
          if (!state.transcript) break
          const find = (args.find as string[] | undefined) ?? ['um', 'uh']
          const previousSegments = state.transcript.segments
          const nextSegments = previousSegments.map((seg) => {
            let cleaned = seg.text
            find.forEach((f: string) => {
              const regex = new RegExp(`,?\\s+${f}\\b`, 'gi')
              cleaned = cleaned.replace(regex, '')
            })
            cleaned = cleaned.replace(/\s+/g, ' ').trim()
            return cleaned !== seg.text ? { ...seg, text: cleaned } : seg
          })
          const changed = nextSegments.filter((seg, index) => seg.text !== previousSegments[index].text)
          if (changed.length === 0) {
            toast.message('No filler words found in the transcript.')
            break
          }
          dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
          try {
            await bulkUpdateSegmentsAction(
              state.transcript.id,
              changed.map((segment) => ({
                id: segment.id,
                updates: { text: segment.text },
              })),
            )
          } catch {
            dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
            toast.error('Could not save the filler word cleanup.')
            break
          }
          toast.success('Filler words removed from transcript.')
          break
        }
        case 'fixGrammar': {
          if (!state.transcript) break
          const previousSegments = state.transcript.segments
          const nextSegments = previousSegments.map((seg) => {
            const fixed = seg.text
              .replace(/^([a-z])/, (c) => c.toUpperCase())
              .replace(/([.!?])\s+([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`)
              .trim()
            return fixed !== seg.text ? { ...seg, text: fixed } : seg
          })
          const changed = nextSegments.filter((seg, index) => seg.text !== previousSegments[index].text)
          if (changed.length === 0) {
            toast.message('Grammar cleanup did not change any transcript text.')
            break
          }
          dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: nextSegments })
          try {
            await bulkUpdateSegmentsAction(
              state.transcript.id,
              changed.map((segment) => ({
                id: segment.id,
                updates: { text: segment.text },
              })),
            )
          } catch {
            dispatch({ type: 'SET_TRANSCRIPT_SEGMENTS', segments: previousSegments })
            toast.error('Could not save the grammar cleanup.')
            break
          }
          toast.success('Grammar fixes applied.')
          break
        }
        case 'addOverlay': {
          if (!state.transcript) break
          const count = (args.count as number | undefined) ?? state.transcript.segments.length
          const newOverlays: TextOverlay[] = state.transcript.segments
            .slice(0, Math.min(count, state.transcript.segments.length))
            .map((seg) => ({
              id: `overlay-auto-${seg.id}`,
              text: seg.text,
              x: 50,
              y: 85,
              fontSize: 18,
              fontColor: '#ffffff',
              bgColor: '#000000',
              bgOpacity: 0.6,
              startTime: seg.start,
              endTime: seg.end,
              fontWeight: 'normal' as const,
              width: 80,
            }))
          dispatch({ type: 'SET_OVERLAYS', overlays: newOverlays })
          toast.success(`${newOverlays.length} subtitle overlays added.`)
          break
        }
        case 'trimVideo': {
          dispatch({
            type: 'SET_TRIM',
            trimRange: {
              start: args.start as number,
              end: args.end as number,
            },
          })
          toast.success('Trim range applied.')
          break
        }
      }
    },
    [state.transcript, dispatch],
  )

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat({
    id: 'transcript-ai-editor',
    transport,
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : 'The assistant could not complete your request.'
      toast.error(message)
    },
    onToolCall: ({ toolCall }) => {
      const tc = toolCall as {
        toolName: string
        input?: Record<string, unknown>
      }
      const inputArgs =
        tc.input ??
        (toolCall as { args?: Record<string, unknown> }).args ??
        {}
      void applyToolCall(tc.toolName, inputArgs)
    },
  })

  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submitMessage()
    }
  }

  const submitMessage = async () => {
    const t = input.trim()
    if (!t || busy) return
    if (!state.activeProjectId) {
      toast.error('Open a media file before using the assistant.')
      return
    }
    setInput('')
    try {
      await sendMessage({ text: t })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'The assistant could not complete your request.'
      toast.error(message)
    }
  }

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt)
    textareaRef.current?.focus()
  }

  const handleClear = () => {
    setMessages([])
  }

  const isEmpty = messages.length === 0
  const transcriptSegmentCount = state.transcript?.segments.length ?? 0
  const overlayCount = state.overlays.length

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 border-b border-border/60 bg-card/50 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand/15">
              <Sparkles className="size-4 text-brand" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Assistant</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Draft cleanup, overlay generation, and trim suggestions without leaving the edit.</p>
              <div className="mt-2 flex items-center gap-1.5">
                <div
                  className={cn(
                    'size-1.5 rounded-full',
                    busy ? 'animate-pulse bg-amber-400' : 'bg-green-400',
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {busy ? 'Thinking...' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
          {!isEmpty && (
            <Button variant="ghost" size="icon-sm" onClick={handleClear} className="size-8 rounded-full" aria-label="Clear assistant conversation">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
            <p className="text-muted-foreground">Transcript</p>
            <p className="mt-1 font-semibold text-foreground">{transcriptSegmentCount} segments</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-2">
            <p className="text-muted-foreground">Overlays</p>
            <p className="mt-1 font-semibold text-foreground">{overlayCount} current</p>
          </div>
          <div className="col-span-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 xl:col-span-1">
            <p className="text-muted-foreground">Best for</p>
            <p className="mt-1 font-semibold text-foreground">Cleanup, subtitle generation, and quick editorial passes</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 p-5">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/10">
              <Sparkles className="size-6 text-brand" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Ask me anything</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                I can edit transcripts, add overlays, trim video, and more — just describe what you need.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="h-auto justify-start rounded-xl bg-muted/30 px-3 py-2.5 text-left text-xs font-normal text-muted-foreground hover:border-brand/30 hover:bg-brand/5 hover:text-foreground"
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.slice(0, 3).map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="h-auto rounded-full border-border/70 bg-background px-3 py-1 text-xs font-normal text-muted-foreground hover:border-brand/40 hover:text-foreground"
                >
                  {prompt}
                </Button>
              ))}
            </div>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-border/60 bg-background/95 p-4 backdrop-blur-sm"
        onSubmit={(e) => {
          e.preventDefault()
          void submitMessage()
        }}
      >
        {error && (
          <Alert variant="destructive" className="mb-3 pr-10">
            <AlertCircle />
            <AlertTitle className="text-sm">Something went wrong</AlertTitle>
            <AlertDescription className="text-xs">
              {error.message || 'The assistant could not complete your request.'}
            </AlertDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2 size-7"
              onClick={() => clearError()}
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </Button>
          </Alert>
        )}
        <div className="relative rounded-2xl border border-input bg-muted/30 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to edit the transcript, add overlays, trim video..."
            rows={3}
            disabled={busy}
            className="min-h-0 resize-none border-0 bg-transparent px-4 pt-4 pb-2 text-sm shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <span className="text-xs text-muted-foreground/50">
              {input.length > 0 ? `${input.length} chars · ` : ''}
              Cmd+Enter to send
            </span>
            <Button
              size="icon-sm"
              type="submit"
              disabled={!input.trim() || busy}
              className="size-9 rounded-xl bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
