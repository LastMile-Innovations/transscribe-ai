'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  normalizeTranscriptionOptions,
  parseKnownSpeakersCsv,
  PRESET_KNOWN_SPEAKER_NAMES,
  togglePresetInKnownSpeakersCsv,
  type TranscriptionRequestOptions,
  validateTranscriptionOptions,
} from '@/lib/transcription-options'

export type ProjectSpeakerRosterEditorProps = {
  projectId: string
  pendingOptions: TranscriptionRequestOptions | null | undefined
  getBaselineOptions: () => TranscriptionRequestOptions
  onSave: (options: TranscriptionRequestOptions) => Promise<void>
}

export function ProjectSpeakerRosterEditor({
  projectId,
  pendingOptions,
  getBaselineOptions,
  onSave,
}: ProjectSpeakerRosterEditorProps) {
  const [knownSpeakers, setKnownSpeakers] = useState('')
  const [addName, setAddName] = useState('')
  const [saving, setSaving] = useState(false)

  const serverKnownRaw = pendingOptions?.knownSpeakers

  useEffect(() => {
    if (serverKnownRaw != null && serverKnownRaw !== '') {
      setKnownSpeakers(serverKnownRaw)
      return
    }
    setKnownSpeakers(getBaselineOptions().knownSpeakers ?? '')
  }, [projectId, serverKnownRaw, getBaselineOptions])

  const presetChecked = (name: string) =>
    parseKnownSpeakersCsv(knownSpeakers).some((p) => p.toLowerCase() === name.toLowerCase())

  const onTogglePreset = (name: string, checked: boolean) => {
    setKnownSpeakers(togglePresetInKnownSpeakersCsv(knownSpeakers, name, checked))
  }

  const addCustom = () => {
    const t = addName.trim()
    if (!t) return
    const next = togglePresetInKnownSpeakersCsv(knownSpeakers, t, true)
    setKnownSpeakers(next)
    setAddName('')
  }

  const handleSave = async () => {
    const base = pendingOptions ?? getBaselineOptions()
    const merged = normalizeTranscriptionOptions({ ...base, knownSpeakers })
    const err = validateTranscriptionOptions(merged)
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    try {
      await onSave(merged)
      toast.success('Speaker list saved for this file.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="mt-2 rounded-lg border border-brand/20 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_8%,white),white)] p-3"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-brand">
        <Users className="size-3.5" />
        People in this video
      </div>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
        Choose who appears in this recording for Speaker Identification. Saved only for this file; you can add names
        not in the list below.
      </p>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PRESET_KNOWN_SPEAKER_NAMES.map((name) => (
          <label
            key={name}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-xs hover:bg-background/60"
          >
            <Checkbox
              checked={presetChecked(name)}
              onCheckedChange={(v) => onTogglePreset(name, v === true)}
              className="size-3.5"
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
      <div className="mb-2 flex flex-col gap-1.5">
        <Label className="text-[10px] text-muted-foreground">Other names (optional)</Label>
        <div className="flex gap-2">
          <Input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="e.g. witness name"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
          />
          <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0 text-xs" onClick={addCustom}>
            Add
          </Button>
        </div>
      </div>
      <div className="mb-2">
        <Label className="text-[10px] text-muted-foreground">Sent to the API (edit freely)</Label>
        <Input
          value={knownSpeakers}
          onChange={(e) => setKnownSpeakers(e.target.value)}
          placeholder="Comma-separated names"
          className="mt-1 h-8 font-mono text-[11px]"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" className="h-8 flex-1 text-xs" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save for this file'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={saving}
          onClick={() => {
            if (serverKnownRaw != null && serverKnownRaw !== '') {
              setKnownSpeakers(serverKnownRaw)
              return
            }
            setKnownSpeakers(getBaselineOptions().knownSpeakers ?? '')
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}
