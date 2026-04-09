import { NextResponse } from 'next/server'
import {
  browserObjectUrl,
  createMultipartUploadPlan,
  multipartUploadThresholdBytes,
  presignPutObject,
  shouldUseMultipartUpload,
} from '@/lib/s3-storage'
import { inferVideoContentType, objectKeyBasename } from '@/lib/video-upload-mime'
import { isUploadKeyForWorkspace, requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const filename = body.filename as string | undefined
    const contentType = body.contentType as string | undefined
    const fileSize = typeof body.fileSize === 'number' ? body.fileSize : null
    const workspaceProjectId = body.workspaceProjectId as string | undefined

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 })
    }

    const baseName = objectKeyBasename(filename)
    const effectiveContentType =
      contentType.trim().toLowerCase().startsWith('video/')
        ? contentType.trim()
        : contentType.trim().toLowerCase() === 'application/octet-stream'
          ? inferVideoContentType(baseName, '')
          : null

    if (!effectiveContentType) {
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

    const url = await browserObjectUrl(filename).catch(() => null)
    const thresholdBytes = multipartUploadThresholdBytes()

    if (fileSize != null && shouldUseMultipartUpload(fileSize)) {
      const multipart = await createMultipartUploadPlan(filename, effectiveContentType, fileSize)
      return NextResponse.json({
        uploadType: 'multipart' as const,
        url,
        thresholdBytes,
        ...multipart,
      })
    }

    const signedUrl = await presignPutObject(filename, effectiveContentType)

    return NextResponse.json({
      uploadType: 'single' as const,
      signedUrl,
      url,
      thresholdBytes,
    })
  } catch (error) {
    console.error('Error generating presigned URL:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
