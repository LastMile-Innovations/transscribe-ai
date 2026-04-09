'use client'

import dynamic from 'next/dynamic'

export const WorkspacePeopleDialogLazy = dynamic(
  () =>
    import('@/components/workspace-people-dialog').then((mod) => ({
      default: mod.WorkspacePeopleDialog,
    })),
  { ssr: false },
)

export const LibraryNewFolderDialogLazy = dynamic(
  () =>
    import('@/components/library/library-new-folder-dialog').then((mod) => ({
      default: mod.LibraryNewFolderDialog,
    })),
  { ssr: false },
)
