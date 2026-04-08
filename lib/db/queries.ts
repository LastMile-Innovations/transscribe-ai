import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { db } from './index'
import { folders, projects, transcriptSegments, transcripts, workspaceMembers, workspaceProjects } from './schema'
import type { WorkspaceMemberRole } from './schema'

export async function listWorkspaceProjectsOrdered() {
  return db.select().from(workspaceProjects).orderBy(desc(workspaceProjects.createdAt))
}

export async function insertWorkspaceProject(input: { id: string; name: string }) {
  const [row] = await db.insert(workspaceProjects).values(input).returning()
  return row
}

export async function insertWorkspaceProjectWithOwner(input: { id: string; name: string }, ownerUserId: string) {
  return db.transaction(async (tx) => {
    const [wp] = await tx.insert(workspaceProjects).values(input).returning()
    await tx.insert(workspaceMembers).values({
      workspaceProjectId: wp.id,
      userId: ownerUserId,
      role: 'owner',
    })
    return wp
  })
}

export async function findMembership(userId: string, workspaceProjectId: string) {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceProjectId, workspaceProjectId)),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function listWorkspaceProjectsForUser(userId: string) {
  return db
    .select({
      id: workspaceProjects.id,
      name: workspaceProjects.name,
      createdAt: workspaceProjects.createdAt,
    })
    .from(workspaceProjects)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceProjectId, workspaceProjects.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaceProjects.createdAt))
}

export async function listMembersForWorkspace(workspaceProjectId: string) {
  return db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceProjectId, workspaceProjectId))
    .orderBy(asc(workspaceMembers.createdAt))
}

export async function insertWorkspaceMember(input: {
  workspaceProjectId: string
  userId: string
  role: WorkspaceMemberRole
}) {
  const [row] = await db.insert(workspaceMembers).values(input).returning()
  return row
}

export async function updateWorkspaceMemberRole(
  workspaceProjectId: string,
  userId: string,
  role: WorkspaceMemberRole,
) {
  const [row] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(eq(workspaceMembers.workspaceProjectId, workspaceProjectId), eq(workspaceMembers.userId, userId)),
    )
    .returning()
  return row ?? null
}

export async function deleteWorkspaceMember(workspaceProjectId: string, userId: string) {
  const deleted = await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceProjectId, workspaceProjectId), eq(workspaceMembers.userId, userId)),
    )
    .returning()
  return deleted[0] ?? null
}

export async function countOwnersInWorkspace(workspaceProjectId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceProjectId, workspaceProjectId), eq(workspaceMembers.role, 'owner')),
    )
  return Number(row?.n ?? 0)
}

export async function findProjectById(id: string) {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findProjectIdForSegment(segmentId: string) {
  const rows = await db
    .select({ projectId: transcripts.projectId })
    .from(transcriptSegments)
    .innerJoin(transcripts, eq(transcriptSegments.transcriptId, transcripts.id))
    .where(eq(transcriptSegments.id, segmentId))
    .limit(1)
  return rows[0]?.projectId ?? null
}

export async function updateWorkspaceProjectName(id: string, name: string) {
  const [row] = await db
    .update(workspaceProjects)
    .set({ name })
    .where(eq(workspaceProjects.id, id))
    .returning()
  return row ?? null
}

export async function listFoldersByParent(workspaceProjectId: string, parentFolderId: string | null) {
  const condition =
    parentFolderId === null
      ? and(eq(folders.workspaceProjectId, workspaceProjectId), isNull(folders.parentFolderId))
      : and(eq(folders.workspaceProjectId, workspaceProjectId), eq(folders.parentFolderId, parentFolderId))

  return db
    .select()
    .from(folders)
    .where(condition)
    .orderBy(asc(folders.sortOrder), asc(folders.name))
}

export async function findFolderById(id: string) {
  const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1)
  return rows[0] ?? null
}

export function isParentFolderValidForWorkspace(
  parent: Awaited<ReturnType<typeof findFolderById>>,
  workspaceProjectId: string,
): parent is NonNullable<typeof parent> {
  return parent !== null && parent.workspaceProjectId === workspaceProjectId
}

export async function insertFolder(input: {
  id: string
  workspaceProjectId: string
  parentFolderId: string | null
  name: string
}) {
  const [row] = await db.insert(folders).values(input).returning()
  return row
}

export async function updateFolderName(id: string, name: string) {
  const [row] = await db.update(folders).set({ name }).where(eq(folders.id, id)).returning()
  return row ?? null
}

export async function deleteFolderById(id: string) {
  const deleted = await db.delete(folders).where(eq(folders.id, id)).returning()
  return deleted[0] ?? null
}

export async function getWorkspaceById(id: string) {
  const rows = await db.select().from(workspaceProjects).where(eq(workspaceProjects.id, id)).limit(1)
  return rows[0] ?? null
}

export async function listFoldersForWorkspace(workspaceProjectId: string) {
  return db
    .select()
    .from(folders)
    .where(eq(folders.workspaceProjectId, workspaceProjectId))
    .orderBy(asc(folders.sortOrder), asc(folders.name))
}

export async function listMediaForWorkspace(workspaceProjectId: string) {
  return db.select().from(projects).where(eq(projects.workspaceProjectId, workspaceProjectId))
}

export async function getWorkspaceTree(workspaceId: string) {
  const workspace = await getWorkspaceById(workspaceId)
  if (!workspace) return null
  const folderRows = await listFoldersForWorkspace(workspaceId)
  const mediaRows = await listMediaForWorkspace(workspaceId)
  return { workspace, folders: folderRows, media: mediaRows }
}
