import { NextResponse } from 'next/server'
import { syncTranscriptFromWebhook } from '@/lib/assemblyai-transcript-sync'

/**
 * AssemblyAI transcript completed / error webhook.
 * Configure ASSEMBLYAI_WEBHOOK_URL to this route's absolute URL and optional ASSEMBLYAI_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET?.trim()
  if (secret) {
    const headerName = (process.env.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME || 'X-AssemblyAI-Webhook-Secret').trim()
    const received = request.headers.get(headerName)
    if (received !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    'status' in body &&
    (body as { status?: string }).status === 'redacted_audio_ready'
  ) {
    return NextResponse.json({ ok: true, ignored: 'redacted_audio' })
  }

  const transcriptId =
    typeof body === 'object' && body !== null && 'transcript_id' in body
      ? (body as { transcript_id?: string }).transcript_id
      : undefined

  if (!transcriptId || typeof transcriptId !== 'string') {
    return NextResponse.json({ error: 'Missing transcript_id' }, { status: 400 })
  }

  try {
    await syncTranscriptFromWebhook(transcriptId)
  } catch (e) {
    console.error('[AssemblyAI webhook]', e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
