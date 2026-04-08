import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import type { ProjectStatus } from '@/lib/types'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function POST(request: Request) {
  try {
    const projectData = await request.json()

    if (!projectData.id || !projectData.title || !projectData.workspaceProjectId) {
      return NextResponse.json(
        { error: 'Missing required project fields (id, title, workspaceProjectId)' },
        { status: 400 },
      )
    }

    const access = await requireWorkspaceAccessForRoute(projectData.workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    const [newProject] = await db
      .insert(projects)
      .values({
        id: projectData.id,
        title: projectData.title,
        fileName: projectData.fileName,
        duration: projectData.duration,
        status: projectData.status as ProjectStatus,
        thumbnailUrl: projectData.thumbnailUrl,
        fileUrl: projectData.fileUrl ?? null,
        originalFileUrl: projectData.originalFileUrl ?? null,
        sha256Hash: projectData.sha256Hash ?? null,
        mediaMetadata: projectData.mediaMetadata ?? null,
        transcriptionProgress: projectData.transcriptionProgress || 0,
        uploadedAt: new Date(),
        workspaceProjectId: projectData.workspaceProjectId,
        folderId: projectData.folderId ?? null,
      })
      .returning()

    return NextResponse.json(newProject)
  } catch (error) {
    console.error('Error inserting project:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
