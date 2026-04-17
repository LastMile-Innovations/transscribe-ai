import type { ProjectStatus, TranscriptRow } from '@/lib/db/schema'

export const TRANSCRIPTION_START_STALE_AFTER_MS = 2 * 60 * 1000

export function isTranscriptionStartReservationStale(
  createdAt: Date | null | undefined,
  now = Date.now(),
  staleAfterMs = TRANSCRIPTION_START_STALE_AFTER_MS,
): boolean {
  if (!createdAt) return true
  return now - createdAt.getTime() >= staleAfterMs
}

export function activeTranscriptionReservationDisposition(input: {
  projectStatus: ProjectStatus
  activeTranscriptId: string | null
  transcript: Pick<TranscriptRow, 'assemblyAiTranscriptId' | 'createdAt'> | null
  now?: number
  staleAfterMs?: number
}): 'none' | 'reuse' | 'wait' | 'cleanup' {
  if (!input.activeTranscriptId) {
    return input.projectStatus === 'transcribing' && input.transcript?.assemblyAiTranscriptId
      ? 'reuse'
      : 'none'
  }
  if (input.transcript?.assemblyAiTranscriptId) {
    return input.projectStatus === 'transcribing' ? 'reuse' : 'cleanup'
  }
  if (
    input.transcript &&
    !isTranscriptionStartReservationStale(input.transcript.createdAt, input.now, input.staleAfterMs)
  ) {
    return 'wait'
  }
  return 'cleanup'
}
