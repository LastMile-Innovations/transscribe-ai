'use client'

import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import {
  ArrowLeft,
  Folder as FolderIcon,
  FolderPlus,
  Menu,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateShort } from '@/lib/format-date'

type WorkspaceSummary = {
  id: string
  name: string
  createdAt: Date
}

export function LibraryHeader({
  hasWorkspace,
  viewerLocked,
  onBack,
  onCreateWorkspace,
  onOpenPeople,
  onOpenUpload,
}: {
  hasWorkspace: boolean
  viewerLocked: boolean
  onBack: () => void
  onCreateWorkspace: () => void
  onOpenPeople: () => void
  onOpenUpload: () => void
}) {
  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 rounded-2xl border border-white/45 bg-background/78 px-4 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-brand)_55%,black))] shadow-[0_10px_24px_-12px_var(--color-brand)]">
            <Sparkles className="size-4 text-brand-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Studio</span>
            <span className="text-base font-semibold tracking-tight">TranscriptAI</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            {hasWorkspace && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="size-4" />
                Workspaces
              </Button>
            )}
            <ThemeToggle />
            <Button variant="outline" size="sm" className="border-white/50 bg-background/80" onClick={onCreateWorkspace}>
              <FolderPlus className="size-4" />
              New workspace
            </Button>
            {hasWorkspace && (
              <Button variant="outline" size="sm" className="border-white/50 bg-background/80" onClick={onOpenPeople}>
                <Users className="size-4" />
                People
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" className="border-white/50 bg-background/80">
                  <Menu className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {hasWorkspace && (
                  <>
                    <DropdownMenuItem onClick={onBack}>
                      <ArrowLeft className="mr-2 size-4" />
                      Workspaces
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={onCreateWorkspace}>
                  <FolderPlus className="mr-2 size-4" />
                  New workspace
                </DropdownMenuItem>
                {hasWorkspace && (
                  <DropdownMenuItem onClick={onOpenPeople}>
                    <Users className="mr-2 size-4" />
                    People
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {hasWorkspace && (
            <Button
              size="sm"
              className="bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-brand)_60%,black))] text-brand-foreground shadow-[0_18px_34px_-18px_var(--color-brand)] hover:brightness-105"
              disabled={viewerLocked}
              title={viewerLocked ? 'Viewers cannot upload' : 'Add one or more videos from your device'}
              onClick={onOpenUpload}
            >
              <UploadCloud className="size-4" />
              <span className="hidden sm:inline">Upload videos</span>
              <span className="sm:hidden">Add videos</span>
            </Button>
          )}
          <Show when="signed-out">
            <SignInButton />
            <SignUpButton />
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  )
}

export function WorkspaceList({
  workspaces,
  onCreateWorkspace,
  onOpenWorkspace,
}: {
  workspaces: WorkspaceSummary[]
  onCreateWorkspace: () => void
  onOpenWorkspace: (workspaceId: string) => void
}) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_14%,white),color-mix(in_oklab,var(--color-background)_88%,white))] px-6 py-8 shadow-[0_28px_70px_-40px_rgba(0,0,0,0.35)] sm:px-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--color-brand)_18%,transparent),transparent_62%)]" />
        <div className="relative mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand/80">Workspace Library</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Workspaces</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each workspace holds folders and video files. Upload multiple videos and add more than
            one transcript per file from the editor.
          </p>
        </div>
        <Button
          className="shrink-0 bg-[linear-gradient(135deg,var(--color-brand),color-mix(in_oklab,var(--color-brand)_60%,black))] text-brand-foreground shadow-[0_18px_34px_-18px_var(--color-brand)] hover:brightness-105"
          onClick={onCreateWorkspace}
        >
          <FolderPlus className="size-4" />
          New workspace
        </Button>
      </div>
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.length === 0 ? (
          <div className="col-span-full rounded-[1.6rem] border border-dashed border-brand/25 bg-white/55 py-20 text-center shadow-inner">
            <p className="text-sm text-muted-foreground">
              No workspaces yet. Create one to get started.
            </p>
          </div>
        ) : (
          workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => onOpenWorkspace(workspace.id)}
              className="group flex flex-col gap-3 rounded-[1.5rem] border border-white/60 bg-white/72 p-5 text-left shadow-[0_18px_44px_-34px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:bg-white hover:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--color-brand)_26%,black)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand)_16%,white),white)] text-brand shadow-inner">
                  <FolderIcon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{workspace.name}</span>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDateShort(workspace.createdAt)}
              </span>
            </button>
          ))
        )}
      </div>
      </section>
    </main>
  )
}
