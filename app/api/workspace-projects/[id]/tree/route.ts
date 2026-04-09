import { after, NextResponse } from 'next/server'
import { projectRowToVideoProject } from '@/lib/db/mappers'
import { getWorkspaceTree } from '@/lib/db/queries'
import { kickPrepareWorker } from '@/lib/project-prepare-worker'
import { withAccessibleMediaUrls } from '@/lib/s3-storage'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const access = await requireWorkspaceAccessForRoute(id, 'viewer')
    if (access instanceof NextResponse) return access

    const tree = await getWorkspaceTree(id)
    if (!tree) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const media = await Promise.all(
      tree.media.map((project) => withAccessibleMediaUrls(projectRowToVideoProject(project))),
    )

    after(() => {
      void kickPrepareWorker().catch((error) => {
        console.error('workspace tree worker kick failed:', error)
      })
    })

    return NextResponse.json({
      workspace: tree.workspace,
      folders: tree.folders,
      media,
    })
  } catch (error) {
    console.error('Error loading workspace tree:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
