import { NextResponse } from 'next/server'
import {
  abortMultipartUpload,
  browserObjectUrl,
  completeMultipartUpload,
} from '@/lib/s3-storage'
import { isUploadKeyForWorkspace, requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

type MultipartActionBody =
  | {
      action: 'complete'
      filename?: string
      workspaceProjectId?: string
      uploadId?: string
      parts?: Array<{ ETag?: string; PartNumber?: number }>
    }
  | {
      action: 'abort'
      filename?: string
      workspaceProjectId?: string
      uploadId?: string
    }

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MultipartActionBody
    const filename = body.filename
    const workspaceProjectId = body.workspaceProjectId
    const uploadId = body.uploadId

    if (!filename || !workspaceProjectId || !uploadId) {
      return NextResponse.json(
        { error: 'Missing filename, workspaceProjectId, or uploadId' },
        { status: 400 },
      )
    }

    const access = await requireWorkspaceAccessForRoute(workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    if (!isUploadKeyForWorkspace(workspaceProjectId, filename)) {
      return NextResponse.json(
        { error: `filename must be under prefix "${workspaceProjectId}/"` },
        { status: 400 },
      )
    }

    if (body.action === 'abort') {
      await abortMultipartUpload(filename, uploadId)
      return NextResponse.json({ success: true })
    }

    const parts = (body.parts ?? [])
      .map((part) => ({
        ETag: typeof part.ETag === 'string' ? part.ETag : '',
        PartNumber: typeof part.PartNumber === 'number' ? part.PartNumber : 0,
      }))
      .filter((part) => part.ETag && part.PartNumber > 0)
      .sort((a, b) => a.PartNumber - b.PartNumber)

    if (parts.length === 0) {
      return NextResponse.json({ error: 'Missing multipart parts' }, { status: 400 })
    }

    await completeMultipartUpload(filename, uploadId, parts)
    return NextResponse.json({
      success: true,
      url: await browserObjectUrl(filename).catch(() => null),
    })
  } catch (error) {
    console.error('Error handling multipart upload:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
