'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { getSpeakerColorClass } from '@/lib/transcript-editing'

export function SpeakerManagerDialog({
  open,
  onOpenChange,
  speakers,
  selectedSpeaker,
  renameValue,
  onSelectSpeaker,
  onRenameValueChange,
  onApply,
  busy,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  speakers: Array<{ name: string; count: number }>
  selectedSpeaker: string
  renameValue: string
  onSelectSpeaker: (speaker: string) => void
  onRenameValueChange: (value: string) => void
  onApply: () => void
  busy: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage speakers</DialogTitle>
        </DialogHeader>
        <FieldSet>
          <Card className="gap-0 border-border/60 bg-muted/30 py-0 shadow-none">
            <CardContent className="px-4 py-3 text-xs text-muted-foreground">
              Pick a speaker, rename them once, and every matching segment will update together.
            </CardContent>
          </Card>
          <FieldGroup>
            <Field>
              <FieldLabel>Current speakers</FieldLabel>
              <FieldContent>
                <div className="flex flex-wrap gap-2">
                  {speakers.map((speaker) => (
                    <button
                      key={speaker.name}
                      type="button"
                      onClick={() => onSelectSpeaker(speaker.name)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        selectedSpeaker === speaker.name
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border bg-muted/40 text-foreground hover:border-brand/40',
                        getSpeakerColorClass(speaker.name),
                      )}
                    >
                      {speaker.name} ({speaker.count})
                    </button>
                  ))}
                </div>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="speaker-rename-input">Rename selected speaker across transcript</FieldLabel>
              <FieldContent>
                <Input
                  id="speaker-rename-input"
                  value={renameValue}
                  onChange={(e) => onRenameValueChange(e.target.value)}
                  placeholder="Enter the new speaker name"
                />
                <FieldDescription>
                  Every segment assigned to the selected speaker will be updated in one action.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onApply}
            disabled={busy || !selectedSpeaker || !renameValue.trim() || renameValue.trim() === selectedSpeaker}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Applying...
              </>
            ) : (
              'Rename everywhere'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
