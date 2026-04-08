import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { findFolderById } from '@/lib/db/queries'
import type { ProjectStatus } from '@/lib/db/schema'
import { projects } from '@/lib/db/schema'
import type { StoredMediaMetadata } from '@/lib/media-metadata'
import { storageObjectKeysToDeleteForProject } from '@/lib/media-keys'
import { deleteStorageObjectsByKeys } from '@/lib/s3-storage'
import { patchProjectBodySchema } from '@/lib/validation/projects'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await requireProjectAccessForRoute(id, 'editor')
    if (access instanceof NextResponse) return access

    const raw = await request.json()
    const parsed = patchProjectBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid patch payload', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const body = parsed.data

    const patch: Partial<{
      fileUrl: string | null
      originalFileUrl: string | null
      sha256Hash: string | null
      mediaMetadata: StoredMediaMetadata | null
      status: ProjectStatus
      transcriptionProgress: number
      duration: number
      title: string
      thumbnailUrl: string
      folderId: string | null
    }> = {
      ...(body.fileUrl !== undefined ? { fileUrl: body.fileUrl } : {}),
      ...(body.originalFileUrl !== undefined ? { originalFileUrl: body.originalFileUrl } : {}),
      ...(body.sha256Hash !== undefined ? { sha256Hash: body.sha256Hash } : {}),
      ...(body.mediaMetadata !== undefined
        ? { mediaMetadata: body.mediaMetadata as StoredMediaMetadata | null }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.transcriptionProgress !== undefined
        ? { transcriptionProgress: body.transcriptionProgress }
        : {}),
      ...(body.duration !== undefined ? { duration: body.duration } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl } : {}),
      ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    if (patch.folderId !== undefined && patch.folderId !== null) {
      const f = await findFolderById(patch.folderId)
      if (!f || f.workspaceProjectId !== access.workspaceProjectId) {
        return NextResponse.json({ error: 'Invalid folder for this workspace' }, { status: 400 })
      }
    }

    const [row] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning()

    if (!row) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(row)
  } catch (error) {
    console.error('Error patching project:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await requireProjectAccessForRoute(id, 'editor')
    if (access instanceof NextResponse) return access

    const keys = storageObjectKeysToDeleteForProject(access.project)
    await db.delete(projects).where(eq(projects.id, id))
    await deleteStorageObjectsByKeys(keys)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
