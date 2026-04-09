'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Folder } from '@/lib/types'

export function LibraryNewFolderDialog({
  open,
  onOpenChange,
  folders,
  newFolderName,
  setNewFolderName,
  newFolderParentId,
  setNewFolderParentId,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: Folder[]
  newFolderName: string
  setNewFolderName: (v: string) => void
  newFolderParentId: string | null
  setNewFolderParentId: (v: string | null) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-2">
            <Label>Inside</Label>
            <Select
              value={newFolderParentId ?? '__root__'}
              onValueChange={(v) => setNewFolderParentId(v === '__root__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Library root</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Name</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit()
              }}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
