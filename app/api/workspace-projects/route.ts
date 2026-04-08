import { NextResponse } from 'next/server'
import { insertWorkspaceProjectWithOwner, listWorkspaceProjectsForUser } from '@/lib/db/queries'
import { requireUserIdForRoute } from '@/lib/workspace-access'

export async function GET() {
  try {
    const userId = await requireUserIdForRoute()
    if (userId instanceof NextResponse) return userId
    const rows = await listWorkspaceProjectsForUser(userId)
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error listing workspace projects:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserIdForRoute()
    if (userId instanceof NextResponse) return userId
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const id = `wp-${Date.now()}`
    const row = await insertWorkspaceProjectWithOwner(
      { id, name: name || 'Untitled project' },
      userId,
    )
    return NextResponse.json(row)
  } catch (error) {
    console.error('Error creating workspace project:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
