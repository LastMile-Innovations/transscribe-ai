/**
 * Parse `{ error: string }` from a failed fetch Response body.
 */
export async function readApiErrorFromResponse(res: Response): Promise<string | null> {
  try {
    const text = await res.text()
    if (!text.trim()) return null
    const data = JSON.parse(text) as { error?: unknown }
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

export function friendlyHttpMessage(status: number, fallback: string): string {
  if (status === 401) return 'You need to sign in again.'
  if (status === 403) return 'You do not have permission for this action.'
  if (status === 404) return 'The requested item was not found.'
  if (status === 408 || status === 504) return 'The request timed out. Try again.'
  if (status === 413) return 'The file is too large.'
  if (status >= 500) return 'Something went wrong on the server. Please try again shortly.'
  if (status === 0) return 'Network error. Check your connection and try again.'
  return fallback
}

/** Prefer API JSON `error`, else status-based copy, else fallback. */
export async function errorMessageFromResponse(
  res: Response,
  fallback: string,
): Promise<string> {
  const fromBody = await readApiErrorFromResponse(res)
  if (fromBody) return fromBody
  return friendlyHttpMessage(res.status, fallback)
}
