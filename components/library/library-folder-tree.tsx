'use client'

import { Folder as FolderIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BrowseFilter, Folder } from '@/lib/types'
import { cn } from '@/lib/utils'

export function LibraryFolderTreeNode({
  folders,
  parentId,
  depth,
  browseFilter,
  setBrowseFilter,
  onDelete,
  canEditFolders,
}: {
  folders: Folder[]
  parentId: string | null
  depth: number
  browseFilter: BrowseFilter
  setBrowseFilter: (b: BrowseFilter) => void
  onDelete: (id: string) => void
  canEditFolders: boolean
}) {
  const children = folders.filter((f) =>
    parentId === null ? f.parentFolderId == null : f.parentFolderId === parentId,
  )
  return (
    <ul className={cn('space-y-0.5', depth > 0 && 'ml-2 border-l border-border pl-2')}>
      {children.map((f) => {
        const selected = browseFilter.mode === 'folder' && browseFilter.folderId === f.id
        return (
          <li key={f.id}>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  selected ? 'bg-brand/15 font-medium text-brand' : 'hover:bg-muted',
                )}
                onClick={() => setBrowseFilter({ mode: 'folder', folderId: f.id })}
              >
                <FolderIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{f.name}</span>
              </button>
              {canEditFolders && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(f.id)
                  }}
                  aria-label={`Delete folder ${f.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
            <LibraryFolderTreeNode
              folders={folders}
              parentId={f.id}
              depth={depth + 1}
              browseFilter={browseFilter}
              setBrowseFilter={setBrowseFilter}
              onDelete={onDelete}
              canEditFolders={canEditFolders}
            />
          </li>
        )
      })}
    </ul>
  )
}
