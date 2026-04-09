'use client'

import { FolderPlus, Trash2 } from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { BrowseFilter, Folder } from '@/lib/types'

export function LibraryMobileBrowse({
  folders,
  browseFilter,
  setBrowseFilter,
  viewerLocked,
  onNewFolder,
  onSubfolderHere,
  onDeleteCurrentFolder,
}: {
  folders: Folder[]
  browseFilter: BrowseFilter
  setBrowseFilter: (b: BrowseFilter) => void
  viewerLocked: boolean
  onNewFolder: () => void
  onSubfolderHere: () => void
  onDeleteCurrentFolder: () => void
}) {
  return (
    <div className="library-panel mb-6 p-4 lg:hidden">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Browse</Label>
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
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All media</SelectItem>
              <SelectItem value="__root__">Library root</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
