import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { listMembersForWorkspace } from '@/lib/db/queries'
import {
  clerkUserToSearchHit,
  isLikelyFullEmail,
  normalizeEmail,
} from '@/lib/clerk-workspace-members'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

const MIN_QUERY_LEN = 2
const SEARCH_LIMIT = 10

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'owner')
    if (access instanceof NextResponse) return access

    const { searchParams } = new URL(request.url)
    const rawQ = searchParams.get('q') ?? ''
    const q = rawQ.trim()
    if (q.length < MIN_QUERY_LEN) {
      return NextResponse.json(
        { error: `Query must be at least ${MIN_QUERY_LEN} characters` },
        { status: 400 },
      )
    }

    const clerk = await clerkClient()
    const { data: clerkUsers } = isLikelyFullEmail(q)
      ? await clerk.users.getUserList({
          emailAddress: [normalizeEmail(q)],
          limit: SEARCH_LIMIT,
        })
      : await clerk.users.getUserList({
          query: q,
          limit: SEARCH_LIMIT,
        })

    const members = await listMembersForWorkspace(workspaceId)
    const memberIds = new Set(members.map((m) => m.userId))

    const users = clerkUsers
      .filter((u) => !memberIds.has(u.id))
      .map((u) => clerkUserToSearchHit(u))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Error searching workspace members:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
