import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { findMembership, findProjectById } from '@/lib/db/queries'
import type { WorkspaceMemberRole } from '@/lib/db/schema'

const ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

export function roleAtLeast(role: WorkspaceMemberRole, min: WorkspaceMemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId ?? null
}

export function jsonUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function jsonForbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function requireUserIdForRoute(): Promise<string | NextResponse> {
  const userId = await getAuthUserId()
  if (!userId) return jsonUnauthorized()
  return userId
}

export async function requireWorkspaceAccessForRoute(
  workspaceId: string,
  minRole: WorkspaceMemberRole,
): Promise<{ userId: string; role: WorkspaceMemberRole } | NextResponse> {
  const userId = await getAuthUserId()
  if (!userId) return jsonUnauthorized()
  const row = await findMembership(userId, workspaceId)
  if (!row || !roleAtLeast(row.role, minRole)) return jsonForbidden()
  return { userId, role: row.role }
}

export async function requireProjectAccessForRoute(
  projectId: string,
  minRole: WorkspaceMemberRole,
) {
  const userId = await getAuthUserId()
  if (!userId) return jsonUnauthorized()
  const proj = await findProjectById(projectId)
  if (!proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const row = await findMembership(userId, proj.workspaceProjectId)
  if (!row || !roleAtLeast(row.role, minRole)) return jsonForbidden()
  return { userId, role: row.role, workspaceProjectId: proj.workspaceProjectId, project: proj }
}

export async function assertWorkspaceAccess(workspaceId: string, minRole: WorkspaceMemberRole): Promise<void> {
  const userId = await getAuthUserId()
  if (!userId) throw new Error('Unauthorized')
  const row = await findMembership(userId, workspaceId)
  if (!row || !roleAtLeast(row.role, minRole)) throw new Error('Forbidden')
}

export async function assertProjectAccess(projectId: string, minRole: WorkspaceMemberRole): Promise<void> {
  const userId = await getAuthUserId()
  if (!userId) throw new Error('Unauthorized')
  const proj = await findProjectById(projectId)
  if (!proj) throw new Error('Project not found')
  const row = await findMembership(userId, proj.workspaceProjectId)
  if (!row || !roleAtLeast(row.role, minRole)) throw new Error('Forbidden')
}

/** Validates upload object key is under the workspace prefix. */
export function isUploadKeyForWorkspace(workspaceProjectId: string, filename: string): boolean {
  const prefix = `${workspaceProjectId}/`
  return filename.startsWith(prefix) && filename.length > prefix.length
}

export async function getProjectWorkspaceId(projectId: string): Promise<string | null> {
  const proj = await findProjectById(projectId)
  return proj?.workspaceProjectId ?? null
}
