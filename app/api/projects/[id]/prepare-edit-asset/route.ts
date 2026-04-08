import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { ffprobeFullReport, transcodeOrRemuxToMp4 } from '@/lib/ffmpeg-transcode'
import { parseClientMediaCaptureFromJson } from '@/lib/client-media-capture'
import { buildStoredMediaMetadata } from '@/lib/media-metadata'
import { buildEditObjectKey, isValidOriginalObjectKey } from '@/lib/media-keys'
import { downloadObjectToFileAndHash, publicObjectUrl, uploadFileToObjectKey } from '@/lib/s3-storage'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export const maxDuration = 300

async function safeUnlink(p: string) {
  try {
    await unlink(p)
  } catch {
    /* ignore */
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const access = await requireProjectAccessForRoute(projectId, 'editor')
  if (access instanceof NextResponse) return access

  let body: { originalKey?: string; clientCapture?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientCapture = parseClientMediaCaptureFromJson(body.clientCapture)

  const originalKey = body.originalKey
  if (!originalKey || typeof originalKey !== 'string') {
    return NextResponse.json({ error: 'Missing originalKey' }, { status: 400 })
  }

  const proj = access.project

  if (proj.workspaceProjectId !== access.workspaceProjectId) {
    return NextResponse.json({ error: 'Project workspace mismatch' }, { status: 403 })
  }

  if (!isValidOriginalObjectKey(proj.workspaceProjectId, projectId, originalKey)) {
    return NextResponse.json({ error: 'Invalid originalKey for this project' }, { status: 400 })
  }

  const tmpBase = path.join(os.tmpdir(), `prep-${projectId}-${randomBytes(8).toString('hex')}`)
  const inputPath = `${tmpBase}-in`
  const outputPath = `${tmpBase}-out.mp4`

  try {
    const sha256 = await downloadObjectToFileAndHash(originalKey, inputPath)
    const originalReport = await ffprobeFullReport(inputPath)
    await transcodeOrRemuxToMp4(inputPath, outputPath, originalReport)
    const editReport = await ffprobeFullReport(outputPath)

    const editKey = buildEditObjectKey(proj.workspaceProjectId, projectId)
    await uploadFileToObjectKey(outputPath, editKey, 'video/mp4')

    const originalFileUrl = publicObjectUrl(originalKey)
    const fileUrl = publicObjectUrl(editKey)

    const mediaMetadata = buildStoredMediaMetadata(
      originalKey,
      editKey,
      originalReport,
      editReport,
      clientCapture,
    )
    const nextDuration =
      mediaMetadata.derived.sourceDurationMs != null && mediaMetadata.derived.sourceDurationMs > 0
        ? mediaMetadata.derived.sourceDurationMs
        : proj.duration

    const [row] = await db
      .update(projects)
      .set({
        originalFileUrl,
        sha256Hash: sha256,
        fileUrl,
        duration: nextDuration,
        mediaMetadata,
        status: 'transcribing',
        transcriptionProgress: 50,
      })
      .where(eq(projects.id, projectId))
      .returning()

    if (!row) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({
      fileUrl,
      originalFileUrl,
      sha256Hash: sha256,
      editKey,
      duration: nextDuration,
      mediaMetadata,
    })
  } catch (e) {
    console.error('prepare-edit-asset:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Media processing failed' },
      { status: 500 },
    )
  } finally {
    await safeUnlink(inputPath)
    await safeUnlink(outputPath)
  }
}
