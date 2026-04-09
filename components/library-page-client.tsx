'use client'

import { useUser } from '@clerk/nextjs'
import { useAuthedFetch } from '@/lib/authed-fetch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Search, Filter } from 'lucide-react'
import { LibraryHeader, WorkspaceList } from '@/components/library-header'
import { LibraryUploadDropzone } from '@/components/library-upload-dropzone'
import { TranscriptionSettingsPanel } from '@/components/transcription-settings-panel'
import { LibraryEmptyState } from '@/components/library/library-empty-state'
import { LibraryFolderSidebar } from '@/components/library/library-folder-sidebar'
import { LibraryHero } from '@/components/library/library-hero'
import {
  LibraryNewFolderDialogLazy,
  WorkspacePeopleDialogLazy,
} from '@/components/library/library-lazy-dialogs'
import { LibraryMobileBrowse } from '@/components/library/library-mobile-browse'
import { LibraryProjectCard } from '@/components/library/library-project-card'
import { useLibraryUploads } from '@/components/library/use-library-uploads'
import { useLibraryUrlSync } from '@/components/library/use-library-url-sync'
import { useWorkspaceMembers } from '@/components/library/use-workspace-members'
import { useApp } from '@/lib/app-context'
import {
  createFolderAction,
  createWorkspaceProjectAction,
  deleteFolderAction,
  deleteProjectAction,
  moveMediaToFolderAction,
  queueProjectPreparationAction,
  renameProjectAction,
} from '@/lib/actions'
import { folderPathOptions } from '@/lib/library-folder-path'
import { mergeLocalQueuedProjects } from '@/lib/library-merge'
import { buildOriginalUploadKey } from '@/lib/media-keys'
import { canRetryPrepare } from '@/lib/project-prepare'
import { runTranscriptionFlow } from '@/lib/transcription-client'
import {
  DEFAULT_TRANSCRIPTION_OPTIONS,
  DEFAULT_TRANSCRIPTION_PROMPT,
  normalizeTranscriptionOptions,
} from '@/lib/transcription-options'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import type {
  BrowseFilter,
  WorkspaceMemberRow,
  WorkspaceProject,
  WorkspaceTreeData,
} from '@/lib/types'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function LibraryPageClient({
  initialWorkspaces,
  initialTree,
  initialMembers,
  initialBrowseFilter,
}: {
  initialWorkspaces: WorkspaceProject[]
  initialTree: WorkspaceTreeData | null
  initialMembers: WorkspaceMemberRow[]
  initialBrowseFilter: BrowseFilter
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wpId = searchParams.get('wp')
  const { user } = useUser()
  const authedFetch = useAuthedFetch()
  const { state, dispatch } = useApp()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [workspaces, setWorkspaces] = useState<WorkspaceProject[]>(initialWorkspaces)
  const [tree, setTree] = useState<WorkspaceTreeData | null>(initialTree)
  const [browseFilter, setBrowseFilter] = useState<BrowseFilter>(initialBrowseFilter)

  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null)

  const [shareOpen, setShareOpen] = useState(false)

  const [speechModel, setSpeechModel] = useState<string>(DEFAULT_TRANSCRIPTION_OPTIONS.speechModel)
  const [speakerLabels, setSpeakerLabels] = useState(DEFAULT_TRANSCRIPTION_OPTIONS.speakerLabels)
  const [languageDetection, setLanguageDetection] = useState(DEFAULT_TRANSCRIPTION_OPTIONS.languageDetection)
  const [temperature, setTemperature] = useState([DEFAULT_TRANSCRIPTION_OPTIONS.temperature])
  const [keyterms, setKeyterms] = useState('')
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_TRANSCRIPTION_PROMPT)
  const [speakersExpected, setSpeakersExpected] = useState<string>('')
  const [minSpeakers, setMinSpeakers] = useState<string>('')
  const [maxSpeakers, setMaxSpeakers] = useState<string>('')
  const [knownSpeakers, setKnownSpeakers] = useState<string>('')
  const [redactPii, setRedactPii] = useState(false)
  const [autoTranscribe, setAutoTranscribe] = useState(false)

  const refreshServerData = useCallback(() => {
    router.refresh()
  }, [router])

  const {
    queuedUploadsRef,
    updateProjectLocally,
    cancelUpload,
    handleFiles,
  } = useLibraryUploads({
    wpId,
    browseFilter,
    authedFetch,
    dispatch,
    setTree,
    refreshServerData,
  })

  const {
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
  } = useWorkspaceMembers({
    wpId,
    shareOpen,
    currentUserId: user?.id,
    authedFetch,
    refreshServerData,
    initialMembers,
  })

  useLibraryUrlSync(wpId, browseFilter, router.replace, searchParams)

  const currentTranscriptionOptions = useCallback(
    () =>
      normalizeTranscriptionOptions({
        speechModel: speechModel === 'fast' ? 'fast' : 'best',
        speakerLabels,
        languageDetection,
        temperature: temperature[0],
        keyterms,
        prompt: customPrompt,
        speakersExpected: speakersExpected ? parseInt(speakersExpected, 10) : undefined,
        minSpeakers: minSpeakers ? parseInt(minSpeakers, 10) : undefined,
        maxSpeakers: maxSpeakers ? parseInt(maxSpeakers, 10) : undefined,
        knownSpeakers,
        redactPii,
      }),
    [
      customPrompt,
      keyterms,
      knownSpeakers,
      languageDetection,
      maxSpeakers,
      minSpeakers,
      redactPii,
      speakerLabels,
      speakersExpected,
      speechModel,
      temperature,
    ],
  )

  const runHandleFiles = useCallback(
    (files: File[]) => {
      void handleFiles(files, {
        viewerLocked,
        autoTranscribe,
        getTranscriptionOptions: currentTranscriptionOptions,
      })
    },
    [handleFiles, viewerLocked, autoTranscribe, currentTranscriptionOptions],
  )

  useEffect(() => {
    dispatch({ type: 'SET_PROJECTS', projects: tree?.media ?? [] })
  }, [dispatch, tree])

  useEffect(() => {
    setWorkspaces(initialWorkspaces)
  }, [initialWorkspaces])

  useEffect(() => {
    setTree((prev) => {
      if (!initialTree) return null
      return {
        workspace: initialTree.workspace,
        folders: initialTree.folders,
        media: mergeLocalQueuedProjects(prev?.media, initialTree.media, queuedUploadsRef.current),
      }
    })
  }, [initialTree])

  useEffect(() => {
    setBrowseFilter(initialBrowseFilter)
  }, [initialBrowseFilter])

  const transcriptionBusyRef = useRef<string | null>(null)

  const startTranscriptionForProject = useCallback(
    async (projectId: string) => {
      if (viewerLocked) {
        toast.error('Viewers cannot start transcription.')
        return
      }
      if (transcriptionBusyRef.current) return
      const proj = state.projects.find((p) => p.id === projectId) ?? tree?.media.find((p) => p.id === projectId)
      const canRetryTranscription = proj?.status === 'error' && proj.mediaMetadata?.editKey
      if (!proj || !proj.mediaMetadata?.editKey || (proj.status !== 'awaiting_transcript' && !canRetryTranscription)) {
        toast.error('That file is not waiting for transcription.')
        return
      }
      transcriptionBusyRef.current = projectId

      const revertToAwaiting = async (feedbackError?: string) => {
        await authedFetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'awaiting_transcript', transcriptionProgress: 0 }),
        }).catch(() => {})
        dispatch({
          type: 'UPDATE_PROJECT',
          id: projectId,
          updates: {
            status: 'awaiting_transcript',
            transcriptionProgress: 0,
            mediaStep: undefined,
            feedbackError,
          },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === projectId
                ? {
                    ...m,
                    status: 'awaiting_transcript',
                    transcriptionProgress: 0,
                    mediaStep: undefined,
                    feedbackError,
                  }
                : m,
            ),
          }
        })
      }

      try {
        dispatch({
          type: 'UPDATE_PROJECT',
          id: projectId,
          updates: {
            status: 'transcribing',
            transcriptionProgress: 50,
            mediaStep: 'transcribe',
            feedbackError: undefined,
          },
        })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((m) =>
              m.id === projectId
                ? {
                    ...m,
                    status: 'transcribing',
                    transcriptionProgress: 50,
                    mediaStep: 'transcribe',
                    feedbackError: undefined,
                  }
                : m,
            ),
          }
        })

        const result = await runTranscriptionFlow({
          projectId,
          fetchImpl: authedFetch,
          options: currentTranscriptionOptions(),
          onProgress: (pct) => {
            dispatch({
              type: 'UPDATE_PROJECT',
              id: projectId,
              updates: { transcriptionProgress: pct, mediaStep: 'transcribe' },
            })
            setTree((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                media: prev.media.map((m) =>
                  m.id === projectId ? { ...m, transcriptionProgress: pct, mediaStep: 'transcribe' } : m,
                ),
              }
            })
          },
        })

        if (result.ok) {
          dispatch({
            type: 'UPDATE_PROJECT',
            id: projectId,
            updates: {
              status: 'ready',
              transcriptionProgress: 100,
              duration: result.duration,
              mediaStep: undefined,
              feedbackError: undefined,
            },
          })
          setTree((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              media: prev.media.map((m) =>
                m.id === projectId
                  ? {
                      ...m,
                      status: 'ready',
                      transcriptionProgress: 100,
                      duration: result.duration,
                      mediaStep: undefined,
                      feedbackError: undefined,
                    }
                  : m,
              ),
            }
          })
          refreshServerData()
          toast.success('Transcription complete', {
            description: 'Open the editor to review and edit.',
          })
          return
        }

        if (result.reason === 'aborted') {
          await revertToAwaiting()
          toast.message('Transcription check stopped', {
            description: 'Start again when you are ready.',
          })
          return
        }

        const failMsg = result.message
        await revertToAwaiting(failMsg)
        toast.error('Transcription did not complete', { description: failMsg, duration: 12_000 })
      } catch (err) {
        console.error('Transcription error:', err)
        const message =
          err instanceof Error ? err.message : 'Something went wrong during transcription.'
        await revertToAwaiting(message)
        toast.error('Transcription error', { description: message, duration: 10_000 })
      } finally {
        transcriptionBusyRef.current = null
      }
    },
    [
      viewerLocked,
      state.projects,
      tree,
      dispatch,
      refreshServerData,
      currentTranscriptionOptions,
      authedFetch,
    ],
  )

  useEffect(() => {
    if (!tree || !wpId) return
    const hasBusy = tree.media.some(
      (m) =>
        m.status === 'uploading' ||
        m.status === 'transcribing' ||
        m.status === 'queued_prepare' ||
        m.status === 'preparing',
    )
    if (!hasBusy) return

    const interval = setInterval(() => {
      refreshServerData()
    }, 10000)
    return () => clearInterval(interval)
  }, [refreshServerData, tree, wpId])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files?.length > 0) {
        runHandleFiles(Array.from(e.dataTransfer.files))
      }
    },
    [runHandleFiles],
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        runHandleFiles(Array.from(e.target.files))
      }
      e.target.value = ''
    },
    [runHandleFiles],
  )

  const handleOpen = useCallback(
    (id: string) => {
      dispatch({ type: 'SET_ACTIVE_PROJECT', id })
      router.push(`/editor/${id}`)
    },
    [dispatch, router],
  )

  const folderOpts = tree ? folderPathOptions(tree.folders) : []

  const filteredMedia = useMemo(() => {
    if (!tree) return []
    let list = tree.media
    if (browseFilter.mode === 'folder') {
      const fid = browseFilter.folderId
      list = list.filter((m) => (fid === null ? m.folderId == null : m.folderId === fid))
    }
    const q = debouncedSearch.toLowerCase()
    return list.filter((p) => {
      const matchesSearch =
        q.length === 0 ||
        p.title.toLowerCase().includes(q) ||
        p.fileName.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [tree, browseFilter, debouncedSearch, statusFilter])

  const moveMediaToFolder = useCallback(
    async (mediaId: string, folderId: string | null) => {
      try {
        const updated = await moveMediaToFolderAction(mediaId, folderId)
        updateProjectLocally(mediaId, { folderId: updated.folderId })
        refreshServerData()
        toast.success('Media moved.')
      } catch {
        toast.error('Could not move media.')
      }
    },
    [refreshServerData, updateProjectLocally],
  )

  const renameMediaProject = useCallback(
    async (mediaId: string, title: string) => {
      try {
        const updated = await renameProjectAction(mediaId, title)
        dispatch({ type: 'UPDATE_PROJECT', id: mediaId, updates: { title: updated.title } })
        setTree((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            media: prev.media.map((media) =>
              media.id === mediaId ? { ...media, title: updated.title } : media,
            ),
          }
        })
        refreshServerData()
        toast.success('Project renamed.')
      } catch {
        toast.error('Could not rename.')
        throw new Error('rename failed')
      }
    },
    [dispatch, refreshServerData],
  )

  const deleteMediaProject = useCallback(
    async (mediaId: string) => {
      try {
        await deleteProjectAction(mediaId)
        dispatch({ type: 'DELETE_PROJECT', id: mediaId })
        setTree((prev) => {
          if (!prev) return prev
          return { ...prev, media: prev.media.filter((m) => m.id !== mediaId) }
        })
        refreshServerData()
        toast.success('Media deleted.')
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Could not delete media.'
        toast.error(msg)
        throw new Error(msg)
      }
    },
    [dispatch, refreshServerData],
  )

  const createWorkspace = useCallback(async () => {
    try {
      const w = await createWorkspaceProjectAction('New project')
      setWorkspaces((prev) => [{ ...w, createdAt: new Date(w.createdAt) }, ...prev])
      router.push(`/?wp=${w.id}`)
    } catch {
      toast.error('Could not create workspace.')
    }
  }, [router])

  const deleteFolderById = useCallback(
    async (folderId: string) => {
      if (!confirm('Delete this folder? Subfolders are removed; files move to library root.')) return
      try {
        await deleteFolderAction(folderId)
        setBrowseFilter({ mode: 'all' })
        refreshServerData()
        toast.success('Folder deleted.')
      } catch {
        toast.error('Could not delete folder.')
      }
    },
    [refreshServerData],
  )

  const submitNewFolder = useCallback(async () => {
    if (!wpId || !newFolderName.trim()) return
    try {
      await createFolderAction({
        workspaceProjectId: wpId,
        parentFolderId: newFolderParentId,
        name: newFolderName.trim(),
      })
      setNewFolderName('')
      setFolderDialogOpen(false)
      refreshServerData()
      toast.success('Folder created.')
    } catch {
      toast.error('Could not create folder.')
    }
  }, [newFolderName, newFolderParentId, refreshServerData, wpId])

  const retryPrepare = useCallback(
    async (projectId: string) => {
      const project =
        tree?.media.find((media) => media.id === projectId) ??
        state.projects.find((media) => media.id === projectId)
      if (!project) return
      if (!canRetryPrepare(project)) {
        toast.error('That file is not waiting for a preparation retry.')
        return
      }

      const originalKey = buildOriginalUploadKey(project.workspaceProjectId, project.id, project.fileName)
      updateProjectLocally(projectId, {
        status: 'queued_prepare',
        transcriptionProgress: 55,
        mediaStep: 'prepare',
        feedbackError: undefined,
        processingError: null,
      })

      try {
        const updated = await queueProjectPreparationAction({
          projectId,
          originalKey,
          ...(autoTranscribe ? { transcriptionOptions: currentTranscriptionOptions() } : {}),
        })
        updateProjectLocally(projectId, {
          status: updated.status,
          transcriptionProgress: updated.transcriptionProgress,
          fileUrl: updated.fileUrl,
          originalFileUrl: updated.originalFileUrl ?? null,
          playbackUrlRefreshedAt: updated.playbackUrlRefreshedAt ?? null,
          playbackUrlExpiresAt: updated.playbackUrlExpiresAt ?? null,
          mediaMetadata: updated.mediaMetadata ?? null,
          processingError: updated.processingError ?? null,
        })
        toast.success('Preparation retry queued.')
      } catch (error) {
        updateProjectLocally(projectId, {
          status: 'error',
          mediaStep: undefined,
        })
        toast.error(error instanceof Error ? error.message : 'Could not queue the preparation retry.', {
          duration: 8000,
        })
      }
    },
    [autoTranscribe, currentTranscriptionOptions, state.projects, tree, updateProjectLocally],
  )

  const hasFilter = debouncedSearch.length > 0 || statusFilter !== 'all'

  const openNewFolder = useCallback(() => {
    setNewFolderParentId(null)
    setNewFolderName('')
    setFolderDialogOpen(true)
  }, [])

  const openSubfolderHere = useCallback(() => {
    if (browseFilter.mode !== 'folder' || browseFilter.folderId == null) return
    setNewFolderParentId(browseFilter.folderId)
    setNewFolderName('')
    setFolderDialogOpen(true)
  }, [browseFilter])

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--color-brand)_14%,transparent),transparent_62%)]" />
      <LibraryHeader
        hasWorkspace={Boolean(wpId)}
        viewerLocked={viewerLocked}
        onBack={() => router.push('/')}
        onCreateWorkspace={() => void createWorkspace()}
        onOpenPeople={() => setShareOpen(true)}
        onOpenUpload={() => fileInputRef.current?.click()}
      />

      {!wpId ? (
        <WorkspaceList
          workspaces={workspaces}
          onCreateWorkspace={() => void createWorkspace()}
          onOpenWorkspace={(workspaceId) => router.push(`/?wp=${workspaceId}`)}
        />
      ) : (
        <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 px-3 pb-4 sm:px-5">
          <LibraryFolderSidebar
            workspaceName={tree?.workspace.name}
            folders={tree?.folders ?? []}
            browseFilter={browseFilter}
            setBrowseFilter={setBrowseFilter}
            onDeleteFolder={deleteFolderById}
            canEditFolders={!viewerLocked}
            onNewFolder={openNewFolder}
            onSubfolderHere={openSubfolderHere}
          />
          <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6 lg:px-8">
            <div className="flex flex-col gap-8">
              <LibraryMobileBrowse
                folders={tree?.folders ?? []}
                browseFilter={browseFilter}
                setBrowseFilter={setBrowseFilter}
                viewerLocked={viewerLocked}
                onNewFolder={openNewFolder}
                onSubfolderHere={openSubfolderHere}
                onDeleteCurrentFolder={() => {
                  if (browseFilter.mode === 'folder' && browseFilter.folderId != null) {
                    void deleteFolderById(browseFilter.folderId)
                  }
                }}
              />

              <LibraryHero />

              <LibraryUploadDropzone
                disabled={viewerLocked}
                isDragOver={isDragOver}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!viewerLocked) setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={
                  viewerLocked
                    ? (e) => {
                        e.preventDefault()
                        setIsDragOver(false)
                      }
                    : onDrop
                }
                onBrowse={() => fileInputRef.current?.click()}
              />

              <TranscriptionSettingsPanel
                speechModel={speechModel}
                setSpeechModel={setSpeechModel}
                speakerLabels={speakerLabels}
                setSpeakerLabels={setSpeakerLabels}
                languageDetection={languageDetection}
                setLanguageDetection={setLanguageDetection}
                temperature={temperature}
                setTemperature={setTemperature}
                keyterms={keyterms}
                setKeyterms={setKeyterms}
                customPrompt={customPrompt}
                setCustomPrompt={setCustomPrompt}
                speakersExpected={speakersExpected}
                setSpeakersExpected={setSpeakersExpected}
                minSpeakers={minSpeakers}
                setMinSpeakers={setMinSpeakers}
                maxSpeakers={maxSpeakers}
                setMaxSpeakers={setMaxSpeakers}
                knownSpeakers={knownSpeakers}
                setKnownSpeakers={setKnownSpeakers}
                redactPii={redactPii}
                setRedactPii={setRedactPii}
                autoTranscribe={autoTranscribe}
                setAutoTranscribe={setAutoTranscribe}
                onResetRecommended={() => {
                  setSpeechModel(DEFAULT_TRANSCRIPTION_OPTIONS.speechModel)
                  setSpeakerLabels(DEFAULT_TRANSCRIPTION_OPTIONS.speakerLabels)
                  setLanguageDetection(DEFAULT_TRANSCRIPTION_OPTIONS.languageDetection)
                  setTemperature([DEFAULT_TRANSCRIPTION_OPTIONS.temperature])
                  setKeyterms(DEFAULT_TRANSCRIPTION_OPTIONS.keyterms ?? '')
                  setCustomPrompt(DEFAULT_TRANSCRIPTION_PROMPT)
                  setSpeakersExpected('')
                  setMinSpeakers('')
                  setMaxSpeakers('')
                  setKnownSpeakers(DEFAULT_TRANSCRIPTION_OPTIONS.knownSpeakers ?? '')
                  setRedactPii(DEFAULT_TRANSCRIPTION_OPTIONS.redactPii ?? false)
                }}
              />

              <div className="library-panel flex flex-wrap items-center gap-3 p-4">
                <div className="relative min-w-48 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border-[var(--library-panel-border)] bg-background/80 pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="size-4 text-muted-foreground" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40 border-[var(--library-panel-border)] bg-background/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="awaiting_transcript">Needs transcript</SelectItem>
                      <SelectItem value="preparing">Preparing</SelectItem>
                      <SelectItem value="queued_prepare">Queued for prep</SelectItem>
                      <SelectItem value="transcribing">Transcribing</SelectItem>
                      <SelectItem value="uploading">Uploading</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-sm text-muted-foreground">
                  {filteredMedia.length} file{filteredMedia.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredMedia.length === 0 ? (
                  <LibraryEmptyState hasFilter={hasFilter} />
                ) : (
                  filteredMedia.map((project) => (
                    <LibraryProjectCard
                      key={project.id}
                      project={project}
                      onOpen={handleOpen}
                      folderOptions={folderOpts}
                      onMoveToFolder={viewerLocked ? undefined : moveMediaToFolder}
                      onRenameTitle={viewerLocked ? undefined : renameMediaProject}
                      onStartTranscription={viewerLocked ? undefined : startTranscriptionForProject}
                      onRetryPrepare={viewerLocked ? undefined : retryPrepare}
                      onCancelUpload={viewerLocked ? undefined : cancelUpload}
                      onDeleteMedia={viewerLocked ? undefined : deleteMediaProject}
                    />
                  ))
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={onFileChange}
      />

      <WorkspacePeopleDialogLazy
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open)
          if (!open) resetInviteFields()
        }}
        members={members}
        currentUserId={user?.id}
        isWorkspaceOwner={isWorkspaceOwner}
        inviteQuery={inviteQuery}
        setInviteQuery={setInviteQuery}
        memberSearchLoading={memberSearchLoading}
        memberSearchResults={memberSearchResults}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        inviteAdvancedOpen={inviteAdvancedOpen}
        setInviteAdvancedOpen={setInviteAdvancedOpen}
        inviteUserId={inviteUserId}
        setInviteUserId={setInviteUserId}
        onInviteFromSearch={(hit) => void inviteWorkspaceMemberFromSearchHit(hit)}
        onInviteByEmail={() => void inviteWorkspaceMemberFromField()}
        onInviteByUserId={() => void inviteWorkspaceMemberByUserId()}
        onChangeMemberRole={(memberUserId, role) => void changeMemberRole(memberUserId, role)}
        onRemoveMember={(memberUserId) => void removeWorkspaceMember(memberUserId)}
      />

      <LibraryNewFolderDialogLazy
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        folders={tree?.folders ?? []}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        newFolderParentId={newFolderParentId}
        setNewFolderParentId={setNewFolderParentId}
        onSubmit={() => void submitNewFolder()}
      />
    </div>
  )
}
