import { NextResponse } from 'next/server'
import {
  findFolderById,
  insertFolder,
  isParentFolderValidForWorkspace,
  listFoldersByParent,
} from '@/lib/db/queries'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceProjectId = searchParams.get('workspaceProjectId')
    if (!workspaceProjectId) {
      return NextResponse.json({ error: 'workspaceProjectId required' }, { status: 400 })
    }
    const access = await requireWorkspaceAccessForRoute(workspaceProjectId, 'viewer')
    if (access instanceof NextResponse) return access

    const parentRaw = searchParams.get('parentFolderId')
    const parentFolderId =
      parentRaw === null || parentRaw === '' || parentRaw === 'root' ? null : parentRaw

    const rows = await listFoldersByParent(workspaceProjectId, parentFolderId)

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error listing folders:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const workspaceProjectId = body.workspaceProjectId as string
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const parentFolderId =
      body.parentFolderId === undefined || body.parentFolderId === null || body.parentFolderId === ''
        ? null
        : (body.parentFolderId as string)

    if (!workspaceProjectId || !name) {
      return NextResponse.json({ error: 'workspaceProjectId and name required' }, { status: 400 })
    }

    const access = await requireWorkspaceAccessForRoute(workspaceProjectId, 'editor')
    if (access instanceof NextResponse) return access

    if (parentFolderId) {
      const parent = await findFolderById(parentFolderId)
      if (!isParentFolderValidForWorkspace(parent, workspaceProjectId)) {
        return NextResponse.json({ error: 'Invalid parent folder' }, { status: 400 })
      }
    }

    const id = `fld-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const row = await insertFolder({
      id,
      workspaceProjectId,
      parentFolderId,
      name,
    })

    return NextResponse.json(row)
  } catch (error) {
    console.error('Error creating folder:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
