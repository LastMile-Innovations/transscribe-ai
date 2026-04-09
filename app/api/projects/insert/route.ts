import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectRowToVideoProject } from '@/lib/db/mappers'
import { projects } from '@/lib/db/schema'
import type { StoredMediaMetadata } from '@/lib/media-metadata'
import { insertProjectBodySchema } from '@/lib/validation/projects'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request) {
  try {
    const raw = await request.json()
    const parsed = insertProjectBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid project payload', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const projectData = parsed.data

    const access = await requireWorkspaceAccessForRoute(projectData.workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    const [newProject] = await db
      .insert(projects)
      .values({
        id: projectData.id,
        title: projectData.title,
        fileName: projectData.fileName,
        duration: projectData.duration,
        status: projectData.status,
        thumbnailUrl: projectData.thumbnailUrl,
        fileUrl: projectData.fileUrl ?? null,
        originalFileUrl: projectData.originalFileUrl ?? null,
        sha256Hash: projectData.sha256Hash ?? null,
        mediaMetadata: (projectData.mediaMetadata ?? null) as StoredMediaMetadata | null,
        transcriptionProgress: projectData.transcriptionProgress ?? 0,
        uploadedAt: new Date(),
        workspaceProjectId: projectData.workspaceProjectId,
        folderId: projectData.folderId ?? null,
      })
      .returning()

    return NextResponse.json(projectRowToVideoProject(newProject))
  } catch (error) {
    console.error('Error inserting project:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
