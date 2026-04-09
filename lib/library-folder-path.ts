import type { Folder } from '@/lib/types'

export function folderPathOptions(folders: Folder[]): { id: string | null; label: string }[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  function pathFor(f: Folder): string {
    const parts: string[] = []
    let cur: Folder | undefined = f
    while (cur) {
      parts.unshift(cur.name)
      cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined
    }
    return parts.join(' / ')
  }
  return [
    { id: null, label: 'Library root' },
    ...folders.map((f) => ({ id: f.id, label: pathFor(f) })),
  ]
}
