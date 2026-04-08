const POSTGRES_INVALID_TEXT_REPRESENTATION = '22P02'
const PROJECT_STATUS_ENUM_NAME = 'project_status'
const AWAITING_TRANSCRIPT_STATUS = 'awaiting_transcript'

function extractErrorChain(error: unknown): Array<{ code?: string; message?: string }> {
  const chain: Array<{ code?: string; message?: string }> = []
  let current: unknown = error

  while (current && typeof current === 'object') {
    const candidate = current as { code?: string; message?: string; cause?: unknown }
    chain.push({ code: candidate.code, message: candidate.message })
    current = candidate.cause
  }

  return chain
}

export function isMissingAwaitingTranscriptStatusError(error: unknown): boolean {
  return extractErrorChain(error).some(
    ({ code, message }) =>
      code === POSTGRES_INVALID_TEXT_REPRESENTATION &&
      typeof message === 'string' &&
      message.includes(PROJECT_STATUS_ENUM_NAME) &&
      message.includes(AWAITING_TRANSCRIPT_STATUS),
  )
}

export const missingAwaitingTranscriptStatusMessage =
  'Database schema is out of date for this deployment. Run the latest Drizzle migrations so project_status includes awaiting_transcript.'
