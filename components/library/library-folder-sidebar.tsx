'use client'

import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BrowseFilter, Folder } from '@/lib/types'
import { cn } from '@/lib/utils'
import { LibraryFolderTreeNode } from '@/components/library/library-folder-tree'

export function LibraryFolderSidebar({
  workspaceName,
  folders,
  browseFilter,
  setBrowseFilter,
  onDeleteFolder,
  canEditFolders,
  onNewFolder,
  onSubfolderHere,
}: {
  workspaceName: string | undefined
  folders: Folder[]
  browseFilter: BrowseFilter
  setBrowseFilter: (b: BrowseFilter) => void
  onDeleteFolder: (id: string) => void
  canEditFolders: boolean
  onNewFolder: () => void
  onSubfolderHere: () => void
}) {
  return (
    <aside className="hidden w-72 shrink-0 lg:flex lg:flex-col">
      <div className="library-panel-sidebar sticky top-24 overflow-hidden">
        <div className="border-b border-border/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
          <p className="mt-1 truncate text-lg font-semibold tracking-tight" title={workspaceName}>
            {workspaceName ?? 'Workspace'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className={cn(
                'rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                browseFilter.mode === 'all' ? 'bg-brand/15 font-medium text-brand' : 'hover:bg-muted/70',
              )}
              onClick={() => setBrowseFilter({ mode: 'all' })}
            >
              All media
            </button>
            <button
              type="button"
              className={cn(
                'rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                browseFilter.mode === 'folder' && browseFilter.folderId === null
                  ? 'bg-brand/15 font-medium text-brand'
                  : 'hover:bg-muted/70',
              )}
              onClick={() => setBrowseFilter({ mode: 'folder', folderId: null })}
            >
              Library root
            </button>
          </div>
          <div className="mt-3 border-t border-border/60 pt-3">
            <LibraryFolderTreeNode
              folders={folders}
              parentId={null}
              depth={0}
              browseFilter={browseFilter}
              setBrowseFilter={setBrowseFilter}
              onDelete={onDeleteFolder}
              canEditFolders={canEditFolders}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full justify-start gap-2 rounded-xl border-[var(--library-panel-border)] bg-background/80 text-xs"
              disabled={!canEditFolders}
              onClick={onNewFolder}
            >
              <FolderPlus className="size-3.5" />
              New folder
            </Button>
            {browseFilter.mode === 'folder' && browseFilter.folderId != null && (
              <Button
                variant="secondary"
                size="sm"
                className="h-9 w-full justify-start gap-2 rounded-xl text-xs"
                disabled={!canEditFolders}
                onClick={onSubfolderHere}
              >
                <FolderPlus className="size-3.5" />
                Subfolder here
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
