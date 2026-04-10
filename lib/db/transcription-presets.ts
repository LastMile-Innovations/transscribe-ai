import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { transcriptionPresets } from '@/lib/db/schema'
import type { TranscriptionPresetScope, TranscriptionPresetRow } from '@/lib/db/schema'
import type { TranscriptionRequestOptions } from '@/lib/transcription-options'

export const MAX_TRANSCRIPTION_PRESETS_PER_USER_WORKSPACE = 50

export async function countPersonalPresetsForUser(workspaceProjectId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(transcriptionPresets)
    .where(
      and(
        eq(transcriptionPresets.workspaceProjectId, workspaceProjectId),
        eq(transcriptionPresets.scope, 'personal'),
        eq(transcriptionPresets.createdByUserId, userId),
      ),
    )
  return Number(row?.c ?? 0)
}

export async function listPersonalPresets(
  workspaceProjectId: string,
  userId: string,
): Promise<TranscriptionPresetRow[]> {
  return db
    .select()
    .from(transcriptionPresets)
    .where(
      and(
        eq(transcriptionPresets.workspaceProjectId, workspaceProjectId),
        eq(transcriptionPresets.scope, 'personal'),
        eq(transcriptionPresets.createdByUserId, userId),
      ),
    )
    .orderBy(asc(transcriptionPresets.name), asc(transcriptionPresets.createdAt))
}

export async function listWorkspaceSharedPresets(workspaceProjectId: string): Promise<TranscriptionPresetRow[]> {
  return db
    .select()
    .from(transcriptionPresets)
    .where(
      and(
        eq(transcriptionPresets.workspaceProjectId, workspaceProjectId),
        eq(transcriptionPresets.scope, 'workspace'),
      ),
    )
    .orderBy(asc(transcriptionPresets.name), asc(transcriptionPresets.createdAt))
}

export async function findTranscriptionPresetById(id: string): Promise<TranscriptionPresetRow | undefined> {
  const [row] = await db.select().from(transcriptionPresets).where(eq(transcriptionPresets.id, id)).limit(1)
  return row
}

export async function insertTranscriptionPreset(input: {
  workspaceProjectId: string
  scope: TranscriptionPresetScope
  name: string
  options: TranscriptionRequestOptions
  createdByUserId: string
}): Promise<TranscriptionPresetRow> {
  const [row] = await db
    .insert(transcriptionPresets)
    .values({
      workspaceProjectId: input.workspaceProjectId,
      scope: input.scope,
      name: input.name,
      options: input.options,
      createdByUserId: input.createdByUserId,
    })
    .returning()
  return row
}

export async function updateTranscriptionPreset(
  id: string,
  patch: { name?: string; options?: TranscriptionRequestOptions },
): Promise<TranscriptionPresetRow | undefined> {
  const [row] = await db
    .update(transcriptionPresets)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.options !== undefined ? { options: patch.options } : {}),
      updatedAt: new Date(),
    })
    .where(eq(transcriptionPresets.id, id))
    .returning()
  return row
}

export async function deleteTranscriptionPresetById(id: string): Promise<boolean> {
  const deleted = await db.delete(transcriptionPresets).where(eq(transcriptionPresets.id, id)).returning({ id: transcriptionPresets.id })
  return deleted.length > 0
}
