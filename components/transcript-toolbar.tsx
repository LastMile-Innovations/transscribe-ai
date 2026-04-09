'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Copy,
  Download,
  Users,
  Crosshair,
  FilterX,
  Search,
  X,
  MoreVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { getSpeakerColorClass } from '@/lib/transcript-editing'

export function TranscriptToolbar({
  searchTerm,
  setSearchTerm,
  filteredCount,
  totalCount,
  errorCount,
  pendingChanges,
  activeSegmentId,
  jumpToActive,
  handleExportClipboard,
  handleExportJson,
  speakerSummary,
  setSelectedSpeaker,
  setSpeakerRenameValue,
  setSpeakerDialogOpen,
  showWordTimings,
  setShowWordTimings,
  speakerFilter,
  setSpeakerFilter,
}: {
  searchTerm: string
  setSearchTerm: (term: string) => void
  filteredCount: number
  totalCount: number
  errorCount: number
  pendingChanges: number
  activeSegmentId: string | null
  jumpToActive: () => void
  handleExportClipboard: () => void
  handleExportJson: () => void
  speakerSummary: Array<{ name: string; count: number }>
  setSelectedSpeaker: (speaker: string) => void
  setSpeakerRenameValue: (value: string) => void
  setSpeakerDialogOpen: (open: boolean) => void
  showWordTimings: boolean
  setShowWordTimings: (show: boolean) => void
  speakerFilter: string | null
  setSpeakerFilter: (speaker: string | null) => void
}) {
  return (
    <div className="shrink-0 border-b border-border/60 bg-background/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="w-full max-w-sm">
            <InputGroup className="h-8 rounded-full bg-background">
              <InputGroupAddon align="inline-start" className="pl-3 pr-1">
                <Search className="size-3.5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                placeholder="Search transcript or speakers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-1 text-xs"
              />
              {searchTerm && (
                <InputGroupAddon align="inline-end" className="pr-1.5">
                  <InputGroupButton
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear transcript search"
                  >
                    <X className="size-3" />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </div>
          <Badge variant="outline" className="h-8 rounded-full px-2.5 font-mono text-[11px] text-muted-foreground">
            {filteredCount} / {totalCount}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs">
            {errorCount > 0 ? (
              <Badge variant="outline" className="rounded-full border-destructive/30 px-2.5 py-0.5 text-destructive">
                {errorCount} errors
              </Badge>
            ) : pendingChanges > 0 ? (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-muted-foreground">
                {pendingChanges} pending
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full border-green-500/30 px-2.5 py-0.5 text-green-500">
                All saved
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="size-8 rounded-full">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {activeSegmentId && (
                <DropdownMenuItem onClick={jumpToActive}>
                  <Crosshair className="mr-2 size-4" />
                  Jump to active
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleExportClipboard}>
                <Copy className="mr-2 size-4" />
                Copy all
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJson}>
                <Download className="mr-2 size-4" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const firstSpeaker = speakerSummary[0]?.name ?? ''
                  setSelectedSpeaker(firstSpeaker)
                  setSpeakerRenameValue(firstSpeaker)
                  setSpeakerDialogOpen(true)
                }}
              >
                <Users className="mr-2 size-4" />
                Manage speakers
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault()
                  setShowWordTimings(!showWordTimings)
                }}
              >
                <div className="flex flex-1 items-center justify-between">
                  <span>Word timings</span>
                  <Switch checked={showWordTimings} onCheckedChange={setShowWordTimings} />
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {(searchTerm || speakerFilter || speakerSummary.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="rounded-full px-2.5 py-0 text-[11px]">
            Speakers
          </Badge>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('')
              setSpeakerFilter(null)
            }}
            className={cn(
              'rounded-full border px-3 py-1 transition-colors text-[11px]',
              !searchTerm && !speakerFilter
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-border hover:border-brand/40 hover:text-foreground',
            )}
          >
            All
          </button>
          {speakerSummary.map((speaker) => (
            <button
              key={speaker.name}
              type="button"
              onClick={() => {
                setSpeakerFilter((current) => (current === speaker.name ? null : speaker.name))
              }}
              className={cn(
                'rounded-full border px-3 py-1 transition-colors text-[11px]',
                getSpeakerColorClass(speaker.name),
                speakerFilter === speaker.name && 'ring-1 ring-brand/60',
              )}
            >
              {speaker.name} ({speaker.count})
            </button>
          ))}
          {(searchTerm || speakerFilter) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('')
                setSpeakerFilter(null)
              }}
              className="h-6 rounded-full border border-border px-2.5 text-[11px]"
            >
              <FilterX className="mr-1 size-3.5" />
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
