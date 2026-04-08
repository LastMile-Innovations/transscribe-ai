/** S3 object keys for original upload vs edit MP4 (under workspace prefix). */

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
