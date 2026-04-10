import { NextResponse } from 'next/server'
import { isExhibitOcrEnabled } from '@/lib/video-exhibit-ocr'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

/**
 * Reserved route for future frame-based OCR on video (exhibits on screen).
 * Returns 501 until EXHIBIT_OCR_ENABLED and a provider are wired.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const access = await requireProjectAccessForRoute(projectId, 'editor')
  if (access instanceof NextResponse) return access

  if (!isExhibitOcrEnabled()) {
    return NextResponse.json(
      {
        error: 'not_configured',
        message: 'Video exhibit OCR is not enabled. See docs/legal-media-analysis.md.',
      },
      { status: 501 },
    )
  }

  return NextResponse.json(
    {
      error: 'not_implemented',
      message: 'OCR provider is not wired yet.',
    },
    { status: 501 },
  )
}
