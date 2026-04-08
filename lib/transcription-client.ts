import { errorMessageFromResponse } from './api-error-message'
import { pollTranscriptionUntilComplete } from './transcription-poll-client'
import {
  normalizeTranscriptionOptions,
  type TranscriptionRequestOptions,
} from './transcription-options'

export type RunTranscriptionFlowResult =
  | {
      ok: true
      assemblyAiId: string
      transcriptId: string
      duration: number
    }
  | {
      ok: false
      reason: 'start_error' | 'error' | 'timeout' | 'aborted'
      message: string
    }

export async function runTranscriptionFlow(input: {
  projectId: string
  options?: Partial<TranscriptionRequestOptions>
  signal?: AbortSignal
  onProgress?: (transcriptionProgress: number) => void
  /** Clerk-authenticated fetch from the client (cookies + Bearer). */
  fetchImpl?: typeof fetch
}): Promise<RunTranscriptionFlowResult> {
  const f = input.fetchImpl ?? fetch
  const transcribeRes = await f('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      options: normalizeTranscriptionOptions(input.options),
    }),
    signal: input.signal,
  })

  if (!transcribeRes.ok) {
    return {
      ok: false,
      reason: 'start_error',
      message: await errorMessageFromResponse(transcribeRes, 'Could not start transcription.'),
    }
  }

  const transcribeJson = (await transcribeRes.json()) as {
    assemblyAiId?: string
    transcriptId?: string
  }
  const { assemblyAiId, transcriptId } = transcribeJson
  if (!assemblyAiId || !transcriptId) {
    return {
      ok: false,
      reason: 'start_error',
      message: 'Transcription service returned an incomplete response.',
    }
  }

  const pollResult = await pollTranscriptionUntilComplete(assemblyAiId, input.projectId, transcriptId, {
    signal: input.signal,
    onProgress: input.onProgress,
    fetchImpl: input.fetchImpl,
  })

  if (pollResult.ok) {
    return {
      ok: true,
      assemblyAiId,
      transcriptId,
      duration: pollResult.duration,
    }
  }

  if (pollResult.reason === 'error') {
    return {
      ok: false,
      reason: 'error',
      message: pollResult.assemblyError?.trim() || 'Transcription failed.',
    }
  }

  if (pollResult.reason === 'timeout') {
    return {
      ok: false,
      reason: 'timeout',
      message: 'Transcription is taking too long. Try again, or use a shorter clip.',
    }
  }

  return {
    ok: false,
    reason: 'aborted',
    message: 'Transcription check stopped.',
  }
}
