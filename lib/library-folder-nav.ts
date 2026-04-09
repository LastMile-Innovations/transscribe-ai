import type { Folder } from '@/lib/types'

/** Depth-first folder rows matching sidebar tree order (array order among siblings). */
export function flattenFolderTreeForSelect(
  folders: Folder[],
  parentId: string | null,
  depth: number,
): { id: string; name: string; depth: number }[] {
  const children = folders.filter((f) =>
    parentId === null ? f.parentFolderId == null : f.parentFolderId === parentId,
  )
  const out: { id: string; name: string; depth: number }[] = []
  for (const c of children) {
    out.push({ id: c.id, name: c.name, depth })
    out.push(...flattenFolderTreeForSelect(folders, c.id, depth + 1))
  }
  return out
}

/** Path from root to folder, e.g. ["Work", "Clips"] — empty if id missing. */
export function folderBreadcrumbParts(folders: Folder[], folderId: string | null): string[] {
  if (folderId == null) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const parts: string[] = []
  let id: string | null = folderId
  const guard = new Set<string>()
  while (id && !guard.has(id)) {
    guard.add(id)
    const f = byId.get(id)
    if (!f) break
    parts.unshift(f.name)
    id = f.parentFolderId ?? null
  }
  return parts
}
