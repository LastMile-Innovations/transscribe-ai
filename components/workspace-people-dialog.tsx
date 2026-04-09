'use client'

import { ChevronDown, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { cn } from '@/lib/utils'

type WorkspaceMemberRow = {
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  createdAt: string
  email?: string | null
  displayName?: string | null
  imageUrl?: string | null
}

type MemberSearchHit = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  displayName: string
}

export function WorkspacePeopleDialog({
  open,
  onOpenChange,
  members,
  currentUserId,
  isWorkspaceOwner,
  inviteQuery,
  setInviteQuery,
  memberSearchLoading,
  memberSearchResults,
  inviteRole,
  setInviteRole,
  inviteAdvancedOpen,
  setInviteAdvancedOpen,
  inviteUserId,
  setInviteUserId,
  onInviteFromSearch,
  onInviteByEmail,
  onInviteByUserId,
  onChangeMemberRole,
  onRemoveMember,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: WorkspaceMemberRow[]
  currentUserId?: string
  isWorkspaceOwner: boolean
  inviteQuery: string
  setInviteQuery: (value: string) => void
  memberSearchLoading: boolean
  memberSearchResults: MemberSearchHit[]
  inviteRole: 'editor' | 'viewer'
  setInviteRole: (value: 'editor' | 'viewer') => void
  inviteAdvancedOpen: boolean
  setInviteAdvancedOpen: (open: boolean) => void
  inviteUserId: string
  setInviteUserId: (value: string) => void
  onInviteFromSearch: (hit: MemberSearchHit) => void
  onInviteByEmail: () => void
  onInviteByUserId: () => void
  onChangeMemberRole: (userId: string, role: 'owner' | 'editor' | 'viewer') => void
  onRemoveMember: (userId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Workspace people</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[min(60vh,480px)] flex-col gap-3 overflow-y-auto py-2">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members loaded.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => {
                const label = member.displayName?.trim() || member.email?.trim() || member.userId
                const subtitle = member.displayName?.trim()
                  ? member.email?.trim() || member.userId
                  : member.email?.trim()
                    ? member.userId
                    : null
                const initials = (member.displayName || member.email || member.userId)
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
                return (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <Avatar className="size-8">
                        {member.imageUrl ? <AvatarImage src={member.imageUrl} alt="" /> : null}
                        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={member.userId}>
                          {label}
                          {currentUserId === member.userId ? ' (you)' : ''}
                        </p>
                        {subtitle && subtitle !== label ? (
                          <p
                            className="truncate font-mono text-[11px] text-muted-foreground"
                            title={member.userId}
                          >
                            {subtitle}
                          </p>
                        ) : null}
                        {isWorkspaceOwner ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              onChangeMemberRole(member.userId, value as 'owner' | 'editor' | 'viewer')
                            }
                          >
                            <SelectTrigger className="mt-1 h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">Owner</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="mt-1 inline-block text-xs capitalize text-muted-foreground">
                            {member.role}
                          </span>
                        )}
                      </div>
                    </div>
                    {(isWorkspaceOwner || currentUserId === member.userId) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => onRemoveMember(member.userId)}
                      >
                        {currentUserId === member.userId ? 'Leave' : 'Remove'}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {isWorkspaceOwner && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                Access is granted instantly in this app for people who already have an account. We
                do not send invitation emails.
              </p>
              <Label className="text-xs">Search by email or name</Label>
              <div className="relative mt-1">
                <Input
                  className="pr-9 text-sm"
                  placeholder="name@example.com"
                  value={inviteQuery}
                  onChange={(e) => setInviteQuery(e.target.value)}
                  autoComplete="off"
                />
                {memberSearchLoading ? (
                  <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              {memberSearchResults.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-sm">
                  {memberSearchResults.map((hit) => {
                    const initials = hit.displayName
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    return (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => onInviteFromSearch(hit)}
                        >
                          <Avatar className="size-7">
                            {hit.imageUrl ? <AvatarImage src={hit.imageUrl} alt="" /> : null}
                            <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{hit.displayName}</span>
                            {hit.email ? (
                              <span className="block truncate text-xs text-muted-foreground">
                                {hit.email}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as 'editor' | 'viewer')}
                >
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" onClick={onInviteByEmail}>
                  Add by email
                </Button>
              </div>
              <Collapsible open={inviteAdvancedOpen} onOpenChange={setInviteAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 gap-1 px-0 text-xs text-muted-foreground"
                  >
                    <ChevronDown
                      className={cn('size-3.5 transition-transform', inviteAdvancedOpen && 'rotate-180')}
                    />
                    Advanced: Clerk user ID
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    From Clerk Dashboard → Users, if you need to add by raw ID.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Input
                      className="font-mono text-xs"
                      placeholder="user_…"
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={onInviteByUserId}>
                      Add
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
