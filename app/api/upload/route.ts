import { NextResponse } from 'next/server'
import { presignPutObject, publicObjectUrl } from '@/lib/s3-storage'
import { isUploadKeyForWorkspace, requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const filename = body.filename as string | undefined
    const contentType = body.contentType as string | undefined
    const workspaceProjectId = body.workspaceProjectId as string | undefined

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 })
    }
    if (!contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'Only video files are allowed' }, { status: 400 })
    }
    if (!workspaceProjectId) {
      return NextResponse.json({ error: 'Missing workspaceProjectId' }, { status: 400 })
    }

    const access = await requireWorkspaceAccessForRoute(workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    if (!isUploadKeyForWorkspace(workspaceProjectId, filename)) {
      return NextResponse.json(
        { error: `filename must be under prefix "${workspaceProjectId}/"` },
        { status: 400 },
      )
    }

    const signedUrl = await presignPutObject(filename, contentType)

    return NextResponse.json({
      signedUrl,
      url: publicObjectUrl(filename),
    })
  } catch (error) {
    console.error('Error generating presigned URL:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
