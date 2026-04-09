import type { VideoProject } from '@/lib/types'

export function mergeLocalQueuedProjects(
  previousMedia: VideoProject[] | undefined,
  serverMedia: VideoProject[],
  queuedUploads: Map<string, { persisted: boolean }>,
): VideoProject[] {
  if (!previousMedia || previousMedia.length === 0) return serverMedia

  const serverIds = new Set(serverMedia.map((project) => project.id))
  const localOnlyQueued = previousMedia.filter((project) => {
    const queued = queuedUploads.get(project.id)
    return queued && !queued.persisted && !serverIds.has(project.id)
  })

  return [...localOnlyQueued, ...serverMedia]
}
