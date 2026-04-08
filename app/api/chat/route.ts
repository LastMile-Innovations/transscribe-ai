import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { requireProjectAccessForRoute, requireUserIdForRoute } from '@/lib/workspace-access'
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai'
import { z } from 'zod'

export const maxDuration = 60

const chatTools = {
  removeFillerWords: tool({
    description: 'Removes filler words like "um" and "uh" from transcript segments.',
    inputSchema: z.object({
      find: z.array(z.string()).describe('List of filler words to remove'),
    }),
  }),
  fixGrammar: tool({
    description: 'Fixes capitalization and punctuation grammar across the transcript.',
    inputSchema: z.object({}),
  }),
  addOverlay: tool({
    description: 'Auto-generates subtitle text overlays based on transcript segments.',
    inputSchema: z.object({
      count: z
        .number()
        .describe('Number of segments to subtitle. Default to all if not specified.'),
    }),
  }),
  trimVideo: tool({
    description: 'Sets a trim range on the video timeline.',
    inputSchema: z.object({
      start: z.number().describe('Start time in milliseconds'),
      end: z.number().describe('End time in milliseconds'),
    }),
  }),
}

export async function POST(req: NextRequest) {
  const authResult = await requireUserIdForRoute()
  if (authResult instanceof NextResponse) return authResult

  const body = (await req.json()) as {
    messages?: UIMessage[]
    data?: { transcriptText?: string; projectId?: string }
  }

  if (body.data?.projectId) {
    const access = await requireProjectAccessForRoute(body.data.projectId, 'editor')
    if (access instanceof NextResponse) return access
  }

  const messages = body.messages ?? []
  const transcriptContext = body.data?.transcriptText?.trim() || 'No transcript provided.'

  const modelMessages = await convertToModelMessages(messages, {
    tools: chatTools,
  })

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are an expert AI video editing assistant. You help the user summarize, fix grammar, remove filler words, add subtitles, and trim videos based on an attached transcript.

Current Context Transcript Text:
${transcriptContext}

When users ask to perform actions like adding overlays or fixing grammar, immediately call the appropriate tool. Give brief, professional responses.`,
    messages: modelMessages,
    tools: chatTools,
    stopWhen: stepCountIs(10),
  })

  return result.toUIMessageStreamResponse()
}
