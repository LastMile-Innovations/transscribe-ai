'use client'

import { useEffect } from 'react'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import type { BrowseFilter } from '@/lib/types'

export function useLibraryUrlSync(
  wpId: string | null,
  browseFilter: BrowseFilter,
  replace: (href: string) => void,
  searchParams: ReadonlyURLSearchParams,
) {
  useEffect(() => {
    if (!wpId) return
    const currentFolder = searchParams.get('folder')
    const nextFolder = browseFilter.mode === 'folder' ? (browseFilter.folderId ?? 'root') : null
    if (currentFolder === nextFolder || (!currentFolder && nextFolder === null)) {
      return
    }
    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextFolder === null) {
      nextParams.delete('folder')
    } else {
      nextParams.set('folder', nextFolder)
    }
    replace(`/?${nextParams.toString()}`)
  }, [browseFilter, replace, searchParams, wpId])
}
