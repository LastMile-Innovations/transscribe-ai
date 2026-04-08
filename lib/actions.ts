'use server'

import { and, asc, desc, eq, inArray } from 'drizzle-orm'
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
import {
  folders,
  projects,
  type StoredTranscriptWord,
  transcriptSegments,
  transcripts,
  textOverlays,
} from './db/schema'
import { withAccessibleMediaUrls } from './s3-storage'
import type { TextOverlay, Transcript, TranscriptSummary, VideoProject } from './types'
import {
  mergeTranscriptSegments,
  renameSpeakerInSegments,
  splitTranscriptSegment,
} from './transcript-editing'
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
    project: await withAccessibleMediaUrls(projectRowToVideoProject(proj)),
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

export type SegmentUpdateInput = {
  text?: string
  speaker?: string
  start?: number
  end?: number
  confidence?: number
  words?: StoredTranscriptWord[] | null
}

async function getTranscriptForEdit(transcriptId: string) {
  const rows = await db.select().from(transcripts).where(eq(transcripts.id, transcriptId)).limit(1)
  const transcript = rows[0]
  if (!transcript) {
    throw new Error('Transcript not found')
  }
  await assertProjectAccess(transcript.projectId, 'editor')
  return transcript
}

export async function updateSegmentAction(segmentId: string, updates: SegmentUpdateInput) {
  const projectId = await findProjectIdForSegment(segmentId)
  if (!projectId) throw new Error('Segment not found')
  await assertProjectAccess(projectId, 'editor')

  await db.update(transcriptSegments).set(updates).where(eq(transcriptSegments.id, segmentId))
}

export type NewTranscriptSegmentInput = {
  id: string
  start: number
  end: number
  text: string
  speaker: string
  confidence: number
  words?: StoredTranscriptWord[] | null
}

export async function addSegmentAction(transcriptId: string, segment: NewTranscriptSegmentInput) {
  await getTranscriptForEdit(transcriptId)

  const words = segment.words === undefined ? null : segment.words

  await db.insert(transcriptSegments).values({
    id: segment.id,
    transcriptId,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    speaker: segment.speaker,
    confidence: segment.confidence,
    words,
  })
}

export async function deleteSegmentAction(segmentId: string) {
  const projectId = await findProjectIdForSegment(segmentId)
  if (!projectId) throw new Error('Segment not found')
  await assertProjectAccess(projectId, 'editor')

  await db.delete(transcriptSegments).where(eq(transcriptSegments.id, segmentId))
}

export async function mergeSegmentsAction(id1: string, id2: string) {
  const projectId = await findProjectIdForSegment(id1)
  if (!projectId) throw new Error('Segment not found')
  await assertProjectAccess(projectId, 'editor')

  const rows = await db
    .select()
    .from(transcriptSegments)
    .where(inArray(transcriptSegments.id, [id1, id2]))

  if (rows.length !== 2) {
    throw new Error('Could not load segments to merge')
  }

  const orderedRows = [...rows].sort((a, b) => a.start - b.start)
  if (orderedRows[0].id !== id1 || orderedRows[1].id !== id2) {
    throw new Error('Segments must be merged in transcript order')
  }
  if (orderedRows[0].transcriptId !== orderedRows[1].transcriptId) {
    throw new Error('Segments must belong to the same transcript')
  }

  const transcriptSegmentsForOrder = await db
    .select({ id: transcriptSegments.id })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, orderedRows[0].transcriptId))
    .orderBy(asc(transcriptSegments.start))

  const firstIndex = transcriptSegmentsForOrder.findIndex((segment) => segment.id === id1)
  if (firstIndex === -1 || transcriptSegmentsForOrder[firstIndex + 1]?.id !== id2) {
    throw new Error('Segments must be adjacent to merge')
  }

  const mergedSegment = mergeTranscriptSegments(
    transcriptSegmentRowToSegment(orderedRows[0]),
    transcriptSegmentRowToSegment(orderedRows[1]),
  )

  await db.transaction(async (tx) => {
    await tx
      .update(transcriptSegments)
      .set({
        text: mergedSegment.text,
        end: mergedSegment.end,
        confidence: mergedSegment.confidence,
        words: mergedSegment.words ?? null,
      })
      .where(eq(transcriptSegments.id, id1))
    await tx.delete(transcriptSegments).where(eq(transcriptSegments.id, id2))
  })
}

export async function splitSegmentAction(
  transcriptId: string,
  segmentId: string,
  splitIndex: number,
  ids: { leftId: string; rightId: string },
) {
  await getTranscriptForEdit(transcriptId)

  const rows = await db
    .select()
    .from(transcriptSegments)
    .where(and(eq(transcriptSegments.transcriptId, transcriptId), eq(transcriptSegments.id, segmentId)))
    .limit(1)

  const row = rows[0]
  if (!row) {
    throw new Error('Segment not found')
  }

  const split = splitTranscriptSegment(transcriptSegmentRowToSegment(row), splitIndex, ids)
  if (!split) {
    throw new Error('Pick a split point inside the segment text')
  }

  await db.transaction(async (tx) => {
    await tx.delete(transcriptSegments).where(eq(transcriptSegments.id, segmentId))
    await tx.insert(transcriptSegments).values([
      {
        id: split.left.id,
        transcriptId,
        start: split.left.start,
        end: split.left.end,
        text: split.left.text,
        speaker: split.left.speaker,
        confidence: split.left.confidence,
        words: split.left.words ?? null,
      },
      {
        id: split.right.id,
        transcriptId,
        start: split.right.start,
        end: split.right.end,
        text: split.right.text,
        speaker: split.right.speaker,
        confidence: split.right.confidence,
        words: split.right.words ?? null,
      },
    ])
  })

  return split
}

export async function renameSpeakerAcrossTranscriptAction(
  transcriptId: string,
  previousSpeaker: string,
  nextSpeaker: string,
) {
  const transcript = await getTranscriptForEdit(transcriptId)
  const trimmedNext = nextSpeaker.trim()
  if (!trimmedNext) {
    throw new Error('Speaker name required')
  }

  const rows = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, transcript.id))
    .orderBy(asc(transcriptSegments.start))

  const updatedSegments = renameSpeakerInSegments(
    rows.map(transcriptSegmentRowToSegment),
    previousSpeaker,
    trimmedNext,
  )

  const changedIds = updatedSegments
    .filter((segment, index) => segment.speaker !== rows[index].speaker)
    .map((segment) => segment.id)

  if (changedIds.length === 0) {
    return { updatedCount: 0 }
  }

  await db
    .update(transcriptSegments)
    .set({ speaker: trimmedNext })
    .where(
      and(
        eq(transcriptSegments.transcriptId, transcript.id),
        eq(transcriptSegments.speaker, previousSpeaker),
      ),
    )

  return { updatedCount: changedIds.length }
}

export async function bulkUpdateSegmentsAction(
  transcriptId: string,
  updates: Array<{ id: string; updates: SegmentUpdateInput }>,
) {
  if (updates.length === 0) {
    return
  }

  await getTranscriptForEdit(transcriptId)

  const rows = await db
    .select({ id: transcriptSegments.id })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.transcriptId, transcriptId),
        inArray(
          transcriptSegments.id,
          updates.map((entry) => entry.id),
        ),
      ),
    )

  if (rows.length !== updates.length) {
    throw new Error('One or more transcript segments could not be updated')
  }

  await db.transaction(async (tx) => {
    for (const entry of updates) {
      await tx
        .update(transcriptSegments)
        .set(entry.updates)
        .where(eq(transcriptSegments.id, entry.id))
    }
  })
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
