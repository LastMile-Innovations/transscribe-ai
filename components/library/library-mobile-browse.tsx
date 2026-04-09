'use client'

import { useState } from 'react'
import { FolderPlus, FolderTree, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LibraryFolderTreeNode } from '@/components/library/library-folder-tree'
import { flattenFolderTreeForSelect, folderBreadcrumbParts } from '@/lib/library-folder-nav'
import { cn } from '@/lib/utils'
import type { BrowseFilter, Folder } from '@/lib/types'

export function LibraryMobileBrowse({
  folders,
  browseFilter,
  setBrowseFilter,
  viewerLocked,
  onNewFolder,
  onSubfolderHere,
  onDeleteCurrentFolder,
  onDeleteFolder,
}: {
  folders: Folder[]
  browseFilter: BrowseFilter
  setBrowseFilter: (b: BrowseFilter) => void
  viewerLocked: boolean
  onNewFolder: () => void
  onSubfolderHere: () => void
  onDeleteCurrentFolder: () => void
  onDeleteFolder: (id: string) => void
}) {
  const [folderSheetOpen, setFolderSheetOpen] = useState(false)
  const folderRows = flattenFolderTreeForSelect(folders, null, 0)
  const breadcrumb =
    browseFilter.mode === 'folder' && browseFilter.folderId != null
      ? folderBreadcrumbParts(folders, browseFilter.folderId).join(' / ')
      : null

  const closeSheetAndBrowse = (b: BrowseFilter) => {
    setBrowseFilter(b)
    setFolderSheetOpen(false)
  }

  return (
    <div className="library-panel mb-3 p-3 md:hidden">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label className="text-xs text-muted-foreground">Browse</Label>
          {breadcrumb ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={breadcrumb}>
              {breadcrumb}
            </p>
          ) : null}
          <div className="mt-1 flex gap-2">
            <Select
              value={
                browseFilter.mode === 'all'
                  ? '__all__'
                  : browseFilter.folderId === null
                    ? '__root__'
                    : browseFilter.folderId
              }
              onValueChange={(v) => {
                if (v === '__all__') setBrowseFilter({ mode: 'all' })
                else if (v === '__root__') setBrowseFilter({ mode: 'folder', folderId: null })
                else setBrowseFilter({ mode: 'folder', folderId: v })
              }}
            >
              <SelectTrigger className="min-w-0 w-full flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All media</SelectItem>
                <SelectItem value="__root__">Library root</SelectItem>
                {folderRows.map((row) => (
                  <SelectItem
                    key={row.id}
                    value={row.id}
                    textValue={row.name}
                    style={{ paddingLeft: `calc(0.65rem + ${row.depth} * 0.75rem)` }}
                    className="relative"
                  >
                    <span className="truncate">{row.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 border-[var(--library-panel-border)] bg-background/80"
              aria-label="Open folder tree"
              title="Folder tree"
              onClick={() => setFolderSheetOpen(true)}
            >
              <FolderTree className="size-4" />
            </Button>

            <Sheet open={folderSheetOpen} onOpenChange={setFolderSheetOpen}>
              <SheetContent
                side="bottom"
                className="flex max-h-[min(88dvh,32rem)] flex-col rounded-t-2xl p-0"
              >
                <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
                  <SheetTitle>Folders</SheetTitle>
                  <SheetDescription>
                    Choose a folder. Delete controls match the desktop sidebar.
                  </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className={cn(
                        'rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                        browseFilter.mode === 'all'
                          ? 'bg-brand/15 font-medium text-brand'
                          : 'hover:bg-muted/70',
                      )}
                      onClick={() => closeSheetAndBrowse({ mode: 'all' })}
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
                      onClick={() => closeSheetAndBrowse({ mode: 'folder', folderId: null })}
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
                      setBrowseFilter={closeSheetAndBrowse}
                      onDelete={onDeleteFolder}
                      canEditFolders={!viewerLocked}
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {!viewerLocked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="mb-px shrink-0 border-[var(--library-panel-border)] bg-background/80"
              >
                <FolderPlus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onNewFolder}>
                <FolderPlus className="mr-2 size-4" />
                New folder
              </DropdownMenuItem>
              {browseFilter.mode === 'folder' && browseFilter.folderId != null && (
                <DropdownMenuItem onClick={onSubfolderHere}>
                  <FolderPlus className="mr-2 size-4" />
                  Subfolder here
                </DropdownMenuItem>
              )}
              {browseFilter.mode === 'folder' && browseFilter.folderId != null && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onDeleteCurrentFolder}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete folder
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
