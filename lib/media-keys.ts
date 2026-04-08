/** S3 object keys for original upload vs edit MP4 (under workspace prefix). */

import type { StoredMediaMetadata } from './media-metadata'

export function buildOriginalUploadKey(
  workspaceProjectId: string,
  projectId: string,
  fileName: string,
): string {
  const base = fileName.replace(/^.*[/\\]/, '')
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload'
  return `${workspaceProjectId}/${projectId}/original/${safe}`
}

export function buildEditObjectKey(workspaceProjectId: string, projectId: string): string {
  return `${workspaceProjectId}/${projectId}/edit.mp4`
}

/** Ensures key is exactly under .../original/<single segment> with no traversal. */
export function isValidOriginalObjectKey(
  workspaceProjectId: string,
  projectId: string,
  key: string,
): boolean {
  const expectedPrefix = `${workspaceProjectId}/${projectId}/original/`
  if (!key.startsWith(expectedPrefix)) return false
  const rest = key.slice(expectedPrefix.length)
  if (!rest || rest.includes('/') || rest.includes('..')) return false
  return true
}

/** True when `key` is the edit asset or a single-segment original under this project prefix. */
export function isProjectScopedStorageKey(
  workspaceProjectId: string,
  projectId: string,
  key: string,
): boolean {
  const prefix = `${workspaceProjectId}/${projectId}/`
  if (!key.startsWith(prefix)) return false
  if (key === `${prefix}edit.mp4`) return true
  return isValidOriginalObjectKey(workspaceProjectId, projectId, key)
}

/** Keys to remove from object storage when deleting a project (deduped, ownership-checked). */
export function storageObjectKeysToDeleteForProject(row: {
  workspaceProjectId: string
  id: string
  fileName: string
  mediaMetadata: StoredMediaMetadata | null
}): string[] {
  const keys = new Set<string>()
  keys.add(buildOriginalUploadKey(row.workspaceProjectId, row.id, row.fileName))
  keys.add(buildEditObjectKey(row.workspaceProjectId, row.id))
  if (row.mediaMetadata?.originalKey) keys.add(row.mediaMetadata.originalKey)
  if (row.mediaMetadata?.editKey) keys.add(row.mediaMetadata.editKey)
  return [...keys].filter((k) => isProjectScopedStorageKey(row.workspaceProjectId, row.id, k))
}
