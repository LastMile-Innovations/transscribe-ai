import { randomUUID } from 'node:crypto'

export function buildWorkspaceProjectId(makeId: () => string = randomUUID): string {
  return `wp-${makeId()}`
}
