import type { ProjectStatus } from './db/schema'

type PrepareProjectLike = {
  status: ProjectStatus
  mediaMetadata?: {
    editKey?: string
  } | null
  prepareStartedAt?: Date | null
}

export const DEFAULT_PREPARE_STALE_AFTER_MS = 15 * 60 * 1000

export function projectHasPreparedEdit(project: Pick<PrepareProjectLike, 'mediaMetadata'>): boolean {
  return Boolean(project.mediaMetadata?.editKey)
}

export function canRetryPrepare(project: PrepareProjectLike): boolean {
  return project.status === 'error' && !projectHasPreparedEdit(project)
}

export function isPrepareBusyStatus(status: ProjectStatus): boolean {
  return status === 'queued_prepare' || status === 'preparing'
}

export function isPreparingProjectStale(
  project: Pick<PrepareProjectLike, 'status' | 'prepareStartedAt'>,
  now = Date.now(),
  staleAfterMs = DEFAULT_PREPARE_STALE_AFTER_MS,
): boolean {
  if (project.status !== 'preparing' || !project.prepareStartedAt) return false
  return now - project.prepareStartedAt.getTime() >= staleAfterMs
}
