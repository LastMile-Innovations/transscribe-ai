import { NextResponse } from 'next/server'
import { updateWorkspaceProjectName } from '@/lib/db/queries'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const access = await requireWorkspaceAccessForRoute(id, 'editor')
    if (access instanceof NextResponse) return access
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const row = await updateWorkspaceProjectName(id, name)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (error) {
    console.error('Error patching workspace:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
