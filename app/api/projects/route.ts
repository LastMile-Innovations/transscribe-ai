import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceProjectId = searchParams.get('workspaceProjectId')
    if (!workspaceProjectId) {
      return NextResponse.json({ error: 'workspaceProjectId query parameter required' }, { status: 400 })
    }
    const access = await requireWorkspaceAccessForRoute(workspaceProjectId, 'viewer')
    if (access instanceof NextResponse) return access

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceProjectId, workspaceProjectId))
      .orderBy(desc(projects.uploadedAt))
    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
