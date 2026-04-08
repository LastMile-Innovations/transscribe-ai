import { after, NextResponse } from 'next/server'
import { syncTranscriptFromWebhook } from '@/lib/assemblyai-transcript-sync'

/**
 * AssemblyAI pre-recorded transcription webhooks.
 *
 * @see https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/webhooks
 *
 * Delivery: POST JSON `{ transcript_id, status }` where `status` is `completed` or `error`.
 * Respond with 2xx within ~10s or AssemblyAI retries (up to 10 times, 10s apart).
 * 4xx responses are not retried (use 401 only for bad auth — intentional).
 *
 * Configure `ASSEMBLYAI_WEBHOOK_URL` to this route; optional `ASSEMBLYAI_WEBHOOK_SECRET`
 * must match `webhook_auth_header_*` sent from `/api/transcribe` (custom header name supported).
 */
export async function POST(request: Request) {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET?.trim()
  if (process.env.NODE_ENV === 'production' && !secret) {
    console.error('[AssemblyAI webhook] ASSEMBLYAI_WEBHOOK_SECRET is required in production')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }
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

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const payload = body as { status?: string; transcript_id?: string }

  if (payload.status === 'redacted_audio_ready') {
    return NextResponse.json({ ok: true, ignored: 'redacted_audio' })
  }

  const transcriptId =
    typeof payload.transcript_id === 'string' && payload.transcript_id.trim() !== ''
      ? payload.transcript_id.trim()
      : undefined

  if (!transcriptId) {
    return NextResponse.json({ error: 'Missing transcript_id' }, { status: 400 })
  }

  const status = payload.status
  if (status !== undefined && status !== 'completed' && status !== 'error') {
    return NextResponse.json({ ok: true, ignored: true, status })
  }

  after(() => {
    void syncTranscriptFromWebhook(transcriptId).catch((e) => {
      console.error('[AssemblyAI webhook] Background sync failed:', e)
    })
  })

  return NextResponse.json({ ok: true, accepted: true })
}
