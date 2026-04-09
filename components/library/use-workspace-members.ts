'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  addWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  updateWorkspaceMemberRoleAction,
} from '@/lib/actions'
import type { MemberSearchHit, WorkspaceMemberRow } from '@/lib/types'

const FULL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

function looksLikeFullEmail(s: string): boolean {
  return FULL_EMAIL_RE.test(s.trim())
}

type AuthedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function useWorkspaceMembers({
  wpId,
  shareOpen,
  currentUserId,
  authedFetch,
  refreshServerData,
  initialMembers,
}: {
  wpId: string | null
  shareOpen: boolean
  currentUserId: string | undefined
  authedFetch: AuthedFetch
  refreshServerData: () => void
  initialMembers: WorkspaceMemberRow[]
}) {
  const [members, setMembers] = useState<WorkspaceMemberRow[]>(initialMembers)
  const myMembership = useMemo(() => {
    if (!currentUserId) return null
    return members.find((m) => m.userId === currentUserId) ?? null
  }, [members, currentUserId])
  const isWorkspaceOwner = myMembership?.role === 'owner'
  const viewerLocked = myMembership != null && myMembership.role === 'viewer'
  const [inviteQuery, setInviteQuery] = useState('')
  const [debouncedInviteQuery, setDebouncedInviteQuery] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchHit[]>([])
  const [memberSearchLoading, setMemberSearchLoading] = useState(false)
  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteAdvancedOpen, setInviteAdvancedOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')

  useEffect(() => {
    setMembers(initialMembers)
  }, [initialMembers])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInviteQuery(inviteQuery), 300)
    return () => clearTimeout(t)
  }, [inviteQuery])

  useEffect(() => {
    if (!shareOpen || !wpId) {
      if (!shareOpen) {
        setMemberSearchResults([])
        setMemberSearchLoading(false)
      }
      return
    }
    if (!isWorkspaceOwner) {
      setMemberSearchResults([])
      setMemberSearchLoading(false)
      return
    }
    if (debouncedInviteQuery.trim().length < 2) {
      setMemberSearchResults([])
      setMemberSearchLoading(false)
      return
    }
    const ac = new AbortController()
    setMemberSearchLoading(true)
    void (async () => {
      try {
        const res = await authedFetch(
          `/api/workspace-projects/${wpId}/members/search?q=${encodeURIComponent(debouncedInviteQuery.trim())}`,
          { signal: ac.signal },
        )
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || 'Search failed')
        }
        const data = (await res.json()) as { users: MemberSearchHit[] }
        if (!ac.signal.aborted) setMemberSearchResults(data.users ?? [])
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (!ac.signal.aborted) {
          setMemberSearchResults([])
          toast.error(e instanceof Error ? e.message : 'Search failed.')
        }
      } finally {
        if (!ac.signal.aborted) setMemberSearchLoading(false)
      }
    })()
    return () => ac.abort()
  }, [debouncedInviteQuery, shareOpen, wpId, isWorkspaceOwner, authedFetch])

  const resetInviteFields = useCallback(() => {
    setInviteQuery('')
    setDebouncedInviteQuery('')
    setMemberSearchResults([])
    setInviteUserId('')
    setInviteAdvancedOpen(false)
  }, [])

  const postAddMember = useCallback(
    async (body: Record<string, unknown>) => {
      if (!wpId) throw new Error('No workspace selected')
      const nextMembers = (await addWorkspaceMemberAction({
        workspaceId: wpId,
        userId: typeof body.userId === 'string' ? body.userId : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        role: inviteRole,
      })) as WorkspaceMemberRow[]
      toast.success('Member added.')
      setInviteQuery('')
      setDebouncedInviteQuery('')
      setMemberSearchResults([])
      setInviteUserId('')
      setMembers(nextMembers)
      refreshServerData()
    },
    [refreshServerData, wpId, inviteRole],
  )

  const inviteWorkspaceMemberByEmail = useCallback(
    async (email: string) => {
      const trimmed = email.trim()
      if (!wpId || !trimmed) return
      try {
        await postAddMember({ email: trimmed })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add member.')
      }
    },
    [wpId, postAddMember],
  )

  const inviteWorkspaceMemberFromSearchHit = useCallback(
    async (hit: MemberSearchHit) => {
      if (!wpId) return
      try {
        if (hit.email) {
          await postAddMember({ email: hit.email })
        } else {
          await postAddMember({ userId: hit.id })
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add member.')
      }
    },
    [wpId, postAddMember],
  )

  const inviteWorkspaceMemberByUserId = useCallback(async () => {
    if (!wpId || !inviteUserId.trim()) return
    try {
      await postAddMember({ userId: inviteUserId.trim() })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add member.')
    }
  }, [wpId, inviteUserId, postAddMember])

  const inviteWorkspaceMemberFromField = useCallback(async () => {
    const q = inviteQuery.trim()
    if (!q) {
      toast.error('Enter an email or pick someone from the list.')
      return
    }
    if (!looksLikeFullEmail(q)) {
      toast.error('Enter a complete email address, or choose a person from search results.')
      return
    }
    await inviteWorkspaceMemberByEmail(q)
  }, [inviteQuery, inviteWorkspaceMemberByEmail])

  const removeWorkspaceMember = useCallback(
    async (targetUserId: string) => {
      if (!wpId) return
      if (!confirm('Remove this person from the workspace?')) return
      try {
        const nextMembers = (await removeWorkspaceMemberAction(wpId, targetUserId)) as WorkspaceMemberRow[]
        toast.success('Member removed.')
        setMembers(nextMembers)
        refreshServerData()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not remove member.')
      }
    },
    [refreshServerData, wpId],
  )

  const changeMemberRole = useCallback(
    async (targetUserId: string, role: 'owner' | 'editor' | 'viewer') => {
      if (!wpId) return
      try {
        const nextMembers = (await updateWorkspaceMemberRoleAction(wpId, targetUserId, role)) as WorkspaceMemberRow[]
        toast.success('Role updated.')
        setMembers(nextMembers)
        refreshServerData()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not update role.')
      }
    },
    [refreshServerData, wpId],
  )

  return {
    members,
    isWorkspaceOwner,
    viewerLocked,
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
    resetInviteFields,
    inviteWorkspaceMemberFromSearchHit,
    inviteWorkspaceMemberFromField,
    inviteWorkspaceMemberByUserId,
    removeWorkspaceMember,
    changeMemberRole,
  }
}
