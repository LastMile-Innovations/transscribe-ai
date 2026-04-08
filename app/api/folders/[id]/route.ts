import { NextResponse } from 'next/server'
import { deleteFolderById, findFolderById, updateFolderName } from '@/lib/db/queries'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const folder = await findFolderById(id)
    if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const access = await requireWorkspaceAccessForRoute(folder.workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const row = await updateFolderName(id, name)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (error) {
    console.error('Error patching folder:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const folder = await findFolderById(id)
    if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const access = await requireWorkspaceAccessForRoute(folder.workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    const deleted = await deleteFolderById(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting folder:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
