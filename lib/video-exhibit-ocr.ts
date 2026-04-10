/**
 * Placeholder for on-screen exhibit text extraction (depositions, screen shares).
 * Wire FFmpeg frame sampling + a vision API here when `EXHIBIT_OCR_ENABLED` is set.
 */

export class ExhibitOcrNotConfiguredError extends Error {
  constructor() {
    super(
      'Video exhibit OCR is not enabled. See docs/legal-media-analysis.md for setup notes.',
    )
    this.name = 'ExhibitOcrNotConfiguredError'
  }
}

export function isExhibitOcrEnabled(): boolean {
  return process.env.EXHIBIT_OCR_ENABLED === '1' || process.env.EXHIBIT_OCR_ENABLED === 'true'
}

export async function requestExhibitOcrFromVideo(_input: {
  projectId: string
  /** Prepared editor MP4 object key or HTTPS URL */
  videoSource: string
}): Promise<{ pages: Array<{ timeMs: number; text: string }> }> {
  if (!isExhibitOcrEnabled()) {
    throw new ExhibitOcrNotConfiguredError()
  }
  throw new ExhibitOcrNotConfiguredError()
}
