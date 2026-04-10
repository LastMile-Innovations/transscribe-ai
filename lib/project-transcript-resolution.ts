export type GetProjectDataTranscriptLoadStrategy =
  | 'by_explicit_id'
  | 'by_preferred_or_newest'
  | 'by_newest_only'

/**
 * Branching used by `getProjectData` when choosing which transcript row to load.
 */
export function getProjectDataTranscriptLoadStrategy(
  transcriptIdFromUrl: string | null | undefined,
  preferredTranscriptId: string | null | undefined,
): GetProjectDataTranscriptLoadStrategy {
  if (transcriptIdFromUrl) return 'by_explicit_id'
  if (preferredTranscriptId) return 'by_preferred_or_newest'
  return 'by_newest_only'
}
