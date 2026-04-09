import { LibraryPageClient } from '@/components/library-page-client'
import { AppProvider } from '@/lib/app-context'
import { listWorkspaceMembersAction } from '@/lib/actions'
import { projectRowToVideoProject } from '@/lib/db/mappers'
import { getWorkspaceTree, listWorkspaceProjectsForUser } from '@/lib/db/queries'
import type {
  BrowseFilter,
  Folder,
  VideoProject,
  WorkspaceMemberRow,
  WorkspaceProject,
  WorkspaceTreeData,
} from '@/lib/types'
import { withAccessibleMediaUrls } from '@/lib/s3-storage'
import { getAuthUserId } from '@/lib/workspace-access'

function parseBrowseFilter(folder?: string): BrowseFilter {
  if (!folder) return { mode: 'all' }
  return { mode: 'folder', folderId: folder === 'root' ? null : folder }
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ wp?: string; folder?: string }>
}) {
  const { wp, folder } = await searchParams
  const browseFilter = parseBrowseFilter(folder)
  const userId = await getAuthUserId()

  let workspaces: WorkspaceProject[] = []
  let tree: WorkspaceTreeData | null = null
  let members: WorkspaceMemberRow[] = []

  if (userId) {
    workspaces = await listWorkspaceProjectsForUser(userId)

    if (wp && workspaces.some((workspace) => workspace.id === wp)) {
      const rawTree = await getWorkspaceTree(wp)
      if (rawTree) {
        const media = await Promise.all(
          rawTree.media.map((project) =>
            withAccessibleMediaUrls(projectRowToVideoProject(project)),
          ),
        )
        tree = {
          workspace: rawTree.workspace,
          folders: rawTree.folders,
          media,
        }
        members = (await listWorkspaceMembersAction(wp)) as WorkspaceMemberRow[]
      }
    }
  }

  return (
    <AppProvider
      key={`${wp ?? 'none'}:${folder ?? 'all'}`}
      initialState={{ projects: tree?.media ?? [] }}
    >
      <LibraryPageClient
        initialWorkspaces={workspaces}
        initialTree={tree}
        initialMembers={members}
        initialBrowseFilter={browseFilter}
      />
    </AppProvider>
  )
}
