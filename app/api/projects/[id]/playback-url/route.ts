import { NextResponse } from 'next/server'
import { withAccessibleMediaUrls } from '@/lib/s3-storage'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await requireProjectAccessForRoute(id, 'viewer')
    if (access instanceof NextResponse) return access

    const project = await withAccessibleMediaUrls(access.project)
    return NextResponse.json({
      fileUrl: project.fileUrl,
      originalFileUrl: project.originalFileUrl ?? null,
      playbackUrlRefreshedAt: project.playbackUrlRefreshedAt ?? null,
      playbackUrlExpiresAt: project.playbackUrlExpiresAt ?? null,
    })
  } catch (error) {
    console.error('Error refreshing playback URL:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
