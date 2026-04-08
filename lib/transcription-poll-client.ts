/**
 * Polls /api/transcribe/:assemblyAiId until AssemblyAI completes or errors.
 * Uses exponential backoff between polls (cap 30s).
 */

export type TranscriptionPollResult =
  | { ok: true; duration: number }
  | { ok: false; reason: 'error'; assemblyError?: string }
  | { ok: false; reason: 'timeout' | 'aborted' }

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
  options?: {
    maxAttempts?: number
    signal?: AbortSignal
    /** Fired when the poll API reports queue/processing progress (50–99). */
    onProgress?: (transcriptionProgress: number) => void
    /** Override fetch (e.g. Clerk-authenticated client fetch). */
    fetchImpl?: typeof fetch
  },
): Promise<TranscriptionPollResult> {
  const maxAttempts = options?.maxAttempts ?? 100
  const signal = options?.signal
  const onProgress = options?.onProgress
  const fetchImpl = options?.fetchImpl ?? fetch
  let delayMs = 1500

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sleep(delayMs, signal)
    } catch {
      return { ok: false, reason: 'aborted' }
    }

    delayMs = Math.min(25_000, Math.round(delayMs * 1.38))

    const pollRes = await fetchImpl(`/api/transcribe/${assemblyAiId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, transcriptId }),
      signal,
    })

    let pollData: {
      status?: string
      duration?: number
      error?: string
      transcriptionProgress?: number
    }
    try {
      pollData = (await pollRes.json()) as typeof pollData
    } catch {
      pollData = {}
    }

    if (!pollRes.ok) {
      const hint =
        typeof pollData.error === 'string' && pollData.error.trim()
          ? pollData.error.trim()
          : pollRes.status >= 500
            ? 'Could not check transcription status (server error).'
            : 'Could not check transcription status.'
      return {
        ok: false,
        reason: 'error',
        assemblyError: hint,
      }
    }

    if (
      typeof pollData.transcriptionProgress === 'number' &&
      pollData.transcriptionProgress > 0 &&
      onProgress
    ) {
      onProgress(pollData.transcriptionProgress)
    }

    if (pollData.status === 'completed') {
      return { ok: true, duration: pollData.duration ?? 0 }
    }
    if (pollData.status === 'error') {
      return {
        ok: false,
        reason: 'error',
        assemblyError: typeof pollData.error === 'string' ? pollData.error : undefined,
      }
    }
  }

  return { ok: false, reason: 'timeout' }
}
