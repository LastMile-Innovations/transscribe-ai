import { NextResponse } from 'next/server'
import { presignMultipartUploadParts } from '@/lib/s3-storage'
import { isUploadKeyForWorkspace, requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workspaceProjectId?: string
      filename?: string
      uploadId?: string
      partNumbers?: unknown
    }
    const workspaceProjectId = body.workspaceProjectId
    const filename = body.filename
    const uploadId = body.uploadId
    const rawParts = body.partNumbers

    if (!filename || !workspaceProjectId || !uploadId) {
      return NextResponse.json(
        { error: 'Missing filename, workspaceProjectId, or uploadId' },
        { status: 400 },
      )
    }

    if (!Array.isArray(rawParts) || rawParts.length === 0) {
      return NextResponse.json({ error: 'partNumbers must be a non-empty array' }, { status: 400 })
    }

    const partNumbers = rawParts
      .map((n) => (typeof n === 'number' ? n : Number(n)))
      .filter((n) => Number.isInteger(n) && n >= 1)

    if (partNumbers.length === 0) {
      return NextResponse.json({ error: 'No valid part numbers' }, { status: 400 })
    }

    const access = await requireWorkspaceAccessForRoute(workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    if (!isUploadKeyForWorkspace(workspaceProjectId, filename)) {
      return NextResponse.json(
        { error: `filename must be under prefix "${workspaceProjectId}/"` },
        { status: 400 },
      )
    }

    const parts = await presignMultipartUploadParts(filename, uploadId, partNumbers)
    return NextResponse.json({ parts })
  } catch (error) {
    console.error('Error presigning multipart parts:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
