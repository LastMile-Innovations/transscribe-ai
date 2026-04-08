import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import {
  clerkUserToMemberEnrichment,
  normalizeEmail,
  resolveUserIdFromNormalizedEmail,
} from '@/lib/clerk-workspace-members'
import {
  findMembership,
  insertWorkspaceMember,
  listMembersForWorkspace,
} from '@/lib/db/queries'
import type { WorkspaceMemberRole } from '@/lib/db/schema'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'viewer')
    if (access instanceof NextResponse) return access

    const members = await listMembersForWorkspace(workspaceId)
    const ids = members.map((m) => m.userId)
    if (ids.length === 0) {
      return NextResponse.json(members)
    }

    const clerk = await clerkClient()
    const { data: clerkUsers } = await clerk.users.getUserList({
      userId: ids,
      limit: Math.min(500, Math.max(ids.length, 1)),
    })
    const byId = new Map(clerkUsers.map((u) => [u.id, u]))

    const enriched = members.map((m) => {
      const u = byId.get(m.userId)
      if (!u) {
        return {
          ...m,
          createdAt:
            m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
          email: null as string | null,
          displayName: null as string | null,
          imageUrl: null as string | null,
        }
      }
      const extra = clerkUserToMemberEnrichment(u)
      return {
        ...m,
        createdAt:
          m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        email: extra.email,
        displayName: extra.displayName,
        imageUrl: extra.imageUrl,
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error listing workspace members:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'owner')
    if (access instanceof NextResponse) return access

    const body = await request.json()
    const userIdRaw = typeof body.userId === 'string' ? body.userId.trim() : ''
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : ''
    const roleRaw = body.role as string | undefined
    const role: WorkspaceMemberRole =
      roleRaw === 'viewer' ? 'viewer' : roleRaw === 'editor' ? 'editor' : 'editor'

    if (roleRaw === 'owner') {
      return NextResponse.json({ error: 'Cannot add member as owner via POST; promote with PATCH' }, { status: 400 })
    }

    let newUserId = ''
    if (userIdRaw && emailRaw) {
      return NextResponse.json({ error: 'Provide either userId or email, not both' }, { status: 400 })
    }
    if (emailRaw) {
      const normalized = normalizeEmail(emailRaw)
      if (!normalized.includes('@')) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
      }
      const clerk = await clerkClient()
      const resolved = await resolveUserIdFromNormalizedEmail(clerk, normalized)
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.message }, { status: resolved.status })
      }
      newUserId = resolved.userId
    } else if (userIdRaw) {
      newUserId = userIdRaw
    } else {
      return NextResponse.json({ error: 'userId or email required' }, { status: 400 })
    }

    const existing = await findMembership(newUserId, workspaceId)
    if (existing) {
      return NextResponse.json({ error: 'User is already a member' }, { status: 409 })
    }

    const row = await insertWorkspaceMember({
      workspaceProjectId: workspaceId,
      userId: newUserId,
      role,
    })
    return NextResponse.json(row)
  } catch (error) {
    console.error('Error adding workspace member:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
