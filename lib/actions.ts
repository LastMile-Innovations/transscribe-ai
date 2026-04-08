'use server'

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from './db'
import {
  projectRowToVideoProject,
  textOverlayRowToOverlay,
  transcriptSegmentRowToSegment,
} from './db/mappers'
import {
  findFolderById,
  findProjectIdForSegment,
  insertFolder,
  insertWorkspaceProjectWithOwner,
  isParentFolderValidForWorkspace,
  updateFolderName,
  updateWorkspaceProjectName,
} from './db/queries'
import { folders, projects, transcriptSegments, transcripts, textOverlays } from './db/schema'
import type { TextOverlay, Transcript, TranscriptSummary, VideoProject } from './types'
import {
  assertProjectAccess,
  assertWorkspaceAccess,
  getAuthUserId,
} from './workspace-access'

export async function getProjectData(projectId: string, transcriptId?: string | null) {
  await assertProjectAccess(projectId, 'viewer')

  const projRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (projRows.length === 0) return null
  const proj = projRows[0]

  let transcriptRows
  if (transcriptId) {
    transcriptRows = await db
      .select()
      .from(transcripts)
      .where(and(eq(transcripts.projectId, projectId), eq(transcripts.id, transcriptId)))
      .limit(1)
  } else {
    transcriptRows = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.projectId, projectId))
      .orderBy(desc(transcripts.createdAt))
      .limit(1)
  }

  let transcriptData: Transcript | null = null

  if (transcriptRows.length > 0) {
    const t = transcriptRows[0]
    const segRows = await db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.transcriptId, t.id))
      .orderBy(asc(transcriptSegments.start))

    transcriptData = {
      id: t.id,
      label: t.label,
      language: t.language,
      totalDuration: t.totalDuration,
      segments: segRows.map(transcriptSegmentRowToSegment),
    }
  }

  const overlayRows = await db.select().from(textOverlays).where(eq(textOverlays.projectId, projectId))

  return {
    project: projectRowToVideoProject(proj),
    transcript: transcriptData,
    overlays: overlayRows.map(textOverlayRowToOverlay),
  }
}

export async function listTranscriptsForMediaAction(mediaId: string): Promise<TranscriptSummary[]> {
  await assertProjectAccess(mediaId, 'viewer')

  const rows = await db
    .select({
      id: transcripts.id,
      label: transcripts.label,
      language: transcripts.language,
      totalDuration: transcripts.totalDuration,
      createdAt: transcripts.createdAt,
      assemblyAiTranscriptId: transcripts.assemblyAiTranscriptId,
    })
    .from(transcripts)
    .where(eq(transcripts.projectId, mediaId))
    .orderBy(desc(transcripts.createdAt))

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    language: r.language,
    totalDuration: r.totalDuration,
    createdAt: r.createdAt ?? new Date(),
    assemblyAiTranscriptId: r.assemblyAiTranscriptId,
  }))
}

export async function createWorkspaceProjectAction(name: string) {
  const userId = await getAuthUserId()
  if (!userId) throw new Error('Unauthorized')
  const id = `wp-${Date.now()}`
  const trimmed = name.trim() || 'Untitled project'
  return insertWorkspaceProjectWithOwner({ id, name: trimmed }, userId)
}

export async function createFolderAction(input: {
  workspaceProjectId: string
  parentFolderId: string | null
  name: string
}) {
  await assertWorkspaceAccess(input.workspaceProjectId, 'editor')

  const trimmed = input.name.trim()
  if (!trimmed) throw new Error('Folder name required')

  if (input.parentFolderId) {
    const parent = await findFolderById(input.parentFolderId)
    if (!isParentFolderValidForWorkspace(parent, input.workspaceProjectId)) {
      throw new Error('Invalid parent folder')
    }
  }

  const id = `fld-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return insertFolder({
    id,
    workspaceProjectId: input.workspaceProjectId,
    parentFolderId: input.parentFolderId,
    name: trimmed,
  })
}

export async function renameFolderAction(folderId: string, name: string) {
  const folder = await findFolderById(folderId)
  if (!folder) throw new Error('Folder not found')
  await assertWorkspaceAccess(folder.workspaceProjectId, 'editor')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('Folder name required')
  await updateFolderName(folderId, trimmed)
}

export async function deleteFolderAction(folderId: string) {
  const folder = await findFolderById(folderId)
  if (!folder) throw new Error('Folder not found')
  await assertWorkspaceAccess(folder.workspaceProjectId, 'editor')

  await db.delete(folders).where(eq(folders.id, folderId))
}

export async function renameWorkspaceProjectAction(workspaceId: string, name: string) {
  await assertWorkspaceAccess(workspaceId, 'editor')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name required')
  await updateWorkspaceProjectName(workspaceId, trimmed)
}

export async function moveMediaToFolderAction(mediaId: string, folderId: string | null) {
  await assertProjectAccess(mediaId, 'editor')

  if (folderId) {
    const f = await findFolderById(folderId)
    if (!f) throw new Error('Folder not found')
    const pRows = await db.select().from(projects).where(eq(projects.id, mediaId)).limit(1)
    if (pRows.length === 0) throw new Error('Media not found')
    if (pRows[0].workspaceProjectId !== f.workspaceProjectId) throw new Error('Folder not in same workspace')
  }
  await db.update(projects).set({ folderId }).where(eq(projects.id, mediaId))
}

export async function updateSegmentAction(segmentId: string, updates: { text?: string; speaker?: string }) {
  const projectId = await findProjectIdForSegment(segmentId)
  if (!projectId) throw new Error('Segment not found')
  await assertProjectAccess(projectId, 'editor')

  await db.update(transcriptSegments).set(updates).where(eq(transcriptSegments.id, segmentId))
}

export async function addOverlaysAction(projectId: string, overlaysPayload: TextOverlay[]) {
  await assertProjectAccess(projectId, 'editor')

  if (overlaysPayload.length === 0) return

  await db.insert(textOverlays).values(
    overlaysPayload.map((o) => ({
      id: o.id,
      projectId,
      text: o.text,
      x: o.x,
      y: o.y,
      fontSize: o.fontSize,
      fontColor: o.fontColor,
      bgColor: o.bgColor,
      bgOpacity: o.bgOpacity,
      startTime: o.startTime,
      endTime: o.endTime,
      fontWeight: o.fontWeight,
      width: o.width,
    })),
  )
}
