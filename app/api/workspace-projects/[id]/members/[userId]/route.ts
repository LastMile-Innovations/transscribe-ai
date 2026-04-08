import { NextResponse } from 'next/server'
import {
  countOwnersInWorkspace,
  deleteWorkspaceMember,
  findMembership,
  updateWorkspaceMemberRole,
} from '@/lib/db/queries'
import type { WorkspaceMemberRole } from '@/lib/db/schema'
import { getAuthUserId, requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

function parseRole(v: unknown): WorkspaceMemberRole | null {
  if (v === 'owner' || v === 'editor' || v === 'viewer') return v
  return null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id: workspaceId, userId: targetUserId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'owner')
    if (access instanceof NextResponse) return access

    const body = await request.json()
    const nextRole = parseRole(body.role)
    if (!nextRole) {
      return NextResponse.json({ error: 'role must be owner, editor, or viewer' }, { status: 400 })
    }

    const decodedTarget = decodeURIComponent(targetUserId)
    const current = await findMembership(decodedTarget, workspaceId)
    if (!current) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (current.role === 'owner' && nextRole !== 'owner') {
      const owners = await countOwnersInWorkspace(workspaceId)
      if (owners <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last owner' }, { status: 400 })
      }
    }

    const row = await updateWorkspaceMemberRole(workspaceId, decodedTarget, nextRole)
    if (!row) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (error) {
    console.error('Error updating workspace member:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id: workspaceId, userId: targetUserId } = await params
    const decodedTarget = decodeURIComponent(targetUserId)

    const authUserId = await getAuthUserId()
    if (!authUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requesterMembership = await findMembership(authUserId, workspaceId)
    if (!requesterMembership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isSelf = decodedTarget === authUserId
    const isOwner = requesterMembership.role === 'owner'

    if (!isSelf && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const targetMember = await findMembership(decodedTarget, workspaceId)
    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (targetMember.role === 'owner') {
      const owners = await countOwnersInWorkspace(workspaceId)
      if (owners <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 })
      }
    }

    const deleted = await deleteWorkspaceMember(workspaceId, decodedTarget)
    if (!deleted) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error removing workspace member:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
