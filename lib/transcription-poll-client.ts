/**
 * Polls /api/transcribe/:assemblyAiId until AssemblyAI completes or errors.
 * Uses exponential backoff between polls (cap 30s).
 */

export type TranscriptionPollResult =
  | { ok: true; duration: number }
  | { ok: false; reason: 'error' | 'timeout' | 'aborted' }

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function pollTranscriptionUntilComplete(
  assemblyAiId: string,
  projectId: string,
  transcriptId: string,
  options?: { maxAttempts?: number; signal?: AbortSignal },
): Promise<TranscriptionPollResult> {
  const maxAttempts = options?.maxAttempts ?? 100
  const signal = options?.signal
  let delayMs = 3000

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sleep(delayMs, signal)
    } catch {
      return { ok: false, reason: 'aborted' }
    }

    delayMs = Math.min(30_000, Math.round(delayMs * 1.45))

    const pollRes = await fetch(`/api/transcribe/${assemblyAiId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, transcriptId }),
      signal,
    })

    const pollData = (await pollRes.json()) as {
      status?: string
      duration?: number
    }

    if (pollData.status === 'completed') {
      return { ok: true, duration: pollData.duration ?? 0 }
    }
    if (pollData.status === 'error') {
      return { ok: false, reason: 'error' }
    }
  }

  return { ok: false, reason: 'timeout' }
}
