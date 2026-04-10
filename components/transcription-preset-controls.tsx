'use client'

import { useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TranscriptionRequestOptions } from '@/lib/transcription-options'
import { TRANSCRIPTION_BUILTIN_TEMPLATES } from '@/lib/transcription-prompt-templates'
import { cn } from '@/lib/utils'

export type SavedTranscriptionPresetRow = {
  id: string
  scope: 'personal' | 'workspace'
  name: string
  options: TranscriptionRequestOptions
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export function TranscriptionPresetPicker({
  selectedKey,
  onSelectKey,
  personalPresets,
  workspacePresets,
  triggerClassName,
  contentClassName,
}: {
  selectedKey: string
  onSelectKey: (key: string) => void
  personalPresets: SavedTranscriptionPresetRow[]
  workspacePresets: SavedTranscriptionPresetRow[]
  triggerClassName?: string
  contentClassName?: string
}) {
  return (
    <Select value={selectedKey} onValueChange={onSelectKey}>
      <SelectTrigger className={cn('h-auto min-h-9 w-full', triggerClassName)}>
        <SelectValue placeholder="Choose a preset" />
      </SelectTrigger>
      <SelectContent className={cn('max-h-[min(70vh,420px)]', contentClassName)}>
        <SelectGroup>
          <SelectLabel>General</SelectLabel>
          <SelectItem value="custom">Custom (edited)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Built-in templates</SelectLabel>
          {TRANSCRIPTION_BUILTIN_TEMPLATES.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.title}
            </SelectItem>
          ))}
        </SelectGroup>
        {personalPresets.length > 0 && (
          <SelectGroup>
            <SelectLabel>My presets</SelectLabel>
            {personalPresets.map((p) => (
              <SelectItem key={p.id} value={`personal:${p.id}`}>
                {p.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {workspacePresets.length > 0 && (
          <SelectGroup>
            <SelectLabel>Workspace presets</SelectLabel>
            {workspacePresets.map((p) => (
              <SelectItem key={p.id} value={`workspace:${p.id}`}>
                {p.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

export function TranscriptionPresetControls({
  selectedKey,
  onSelectKey,
  personalPresets,
  workspacePresets,
  canSave,
  canDeleteSavedPreset,
  onSave,
  onDelete,
}: {
  selectedKey: string
  onSelectKey: (key: string) => void
  personalPresets: SavedTranscriptionPresetRow[]
  workspacePresets: SavedTranscriptionPresetRow[]
  canSave: boolean
  canDeleteSavedPreset: (preset: SavedTranscriptionPresetRow) => boolean
  onSave: (name: string, scope: 'personal' | 'workspace') => Promise<void>
  onDelete: (preset: SavedTranscriptionPresetRow) => Promise<void>
}) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveScope, setSaveScope] = useState<'personal' | 'workspace'>('personal')
  const [saveBusy, setSaveBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavedTranscriptionPresetRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const selectedSaved = (() => {
    if (selectedKey.startsWith('personal:')) {
      const id = selectedKey.slice('personal:'.length)
      return personalPresets.find((p) => p.id === id) ?? null
    }
    if (selectedKey.startsWith('workspace:')) {
      const id = selectedKey.slice('workspace:'.length)
      return workspacePresets.find((p) => p.id === id) ?? null
    }
    return null
  })()

  const canDeleteSelected = Boolean(selectedSaved && canDeleteSavedPreset(selectedSaved))

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-[1.25rem] border border-white/60 bg-background/60 p-4">
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">Prompt &amp; options preset</Label>
        <p className="text-[11px] text-muted-foreground">
          Built-in templates, your saved presets, or workspace-shared presets. Editing any field below
          switches to Custom.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <TranscriptionPresetPicker
          selectedKey={selectedKey}
          onSelectKey={onSelectKey}
          personalPresets={personalPresets}
          workspacePresets={workspacePresets}
          triggerClassName="border-white/60 bg-background/80 py-2 sm:flex-1"
        />
        <div className="flex flex-wrap gap-2">
          {canSave && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSaveOpen(true)}>
              <Save className="size-3.5" />
              Save as preset
            </Button>
          )}
          {canSave && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={!canDeleteSelected || deleteBusy}
              onClick={() => selectedSaved && setDeleteTarget(selectedSaved)}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save transcription preset</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="preset-name">Name</Label>
              <Input
                id="preset-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Deposition verbatim"
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Visibility</Label>
              <RadioGroup
                value={saveScope}
                onValueChange={(v) => setSaveScope(v as 'personal' | 'workspace')}
                className="flex flex-col gap-2"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value="personal" id="scope-personal" />
                  <span>Personal (only you)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value="workspace" id="scope-workspace" />
                  <span>Workspace (all members can use)</span>
                </label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveBusy || saveName.trim() === ''}
              onClick={async () => {
                const name = saveName.trim()
                if (!name) return
                setSaveBusy(true)
                try {
                  await onSave(name, saveScope)
                  setSaveOpen(false)
                  setSaveName('')
                  setSaveScope('personal')
                } finally {
                  setSaveBusy(false)
                }
              }}
            >
              {saveBusy ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{deleteTarget?.name}&quot; for everyone who could see it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteTarget) return
                setDeleteBusy(true)
                try {
                  await onDelete(deleteTarget)
                  setDeleteTarget(null)
                } finally {
                  setDeleteBusy(false)
                }
              }}
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
