import {
  normalizeTranscriptionOptions,
  validateTranscriptionOptions,
  type TranscriptionRequestOptions,
} from '@/lib/transcription-options'

export const TRANSCRIPTION_PRESET_NAME_MAX = 120

export function parseAndValidatePresetOptions(raw: unknown): { ok: true; options: TranscriptionRequestOptions } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'options must be an object' }
  }
  const normalized = normalizeTranscriptionOptions(raw as Partial<TranscriptionRequestOptions>)
  const err = validateTranscriptionOptions(normalized)
  if (err) return { ok: false, error: err }
  return { ok: true, options: stripTranscriptLabel(normalized) }
}

function stripTranscriptLabel(o: TranscriptionRequestOptions): TranscriptionRequestOptions {
  return { ...o, transcriptLabel: '' }
}

export function parsePresetName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'name must be a string' }
  }
  const name = raw.trim()
  if (name.length === 0) return { ok: false, error: 'name is required' }
  if (name.length > TRANSCRIPTION_PRESET_NAME_MAX) {
    return { ok: false, error: `name must be at most ${TRANSCRIPTION_PRESET_NAME_MAX} characters` }
  }
  return { ok: true, name }
}

export function parsePresetScope(raw: unknown): { ok: true; scope: 'personal' | 'workspace' } | { ok: false; error: string } {
  if (raw === 'personal' || raw === 'workspace') return { ok: true, scope: raw }
  return { ok: false, error: 'scope must be "personal" or "workspace"' }
}
