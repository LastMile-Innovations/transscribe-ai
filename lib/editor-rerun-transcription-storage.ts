import { normalizeTranscriptionOptions, type TranscriptionRequestOptions } from '@/lib/transcription-options'
import { getBuiltinTemplateById, optionsFromBuiltinTemplate } from '@/lib/transcription-prompt-templates'

const STORAGE_KEY = 'transcriptai.editor.rerun.options.v1'

export function loadEditorRerunTranscriptionOptions(): TranscriptionRequestOptions {
  if (typeof localStorage === 'undefined') {
    const rec = getBuiltinTemplateById('builtin:recommended')
    return rec ? optionsFromBuiltinTemplate(rec) : normalizeTranscriptionOptions({})
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      return normalizeTranscriptionOptions(
        typeof parsed === 'object' && parsed !== null ? (parsed as object) : {},
      )
    }
  } catch {
    /* ignore corrupt storage */
  }
  const rec = getBuiltinTemplateById('builtin:recommended')
  return rec ? optionsFromBuiltinTemplate(rec) : normalizeTranscriptionOptions({})
}

export function persistEditorRerunTranscriptionOptions(o: TranscriptionRequestOptions): void {
  if (typeof localStorage === 'undefined') return
  try {
    const stripped = normalizeTranscriptionOptions({ ...o, transcriptLabel: '' })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped))
  } catch {
    /* ignore quota / private mode */
  }
}
