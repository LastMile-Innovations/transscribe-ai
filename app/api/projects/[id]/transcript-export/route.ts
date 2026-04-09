import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { transcriptSegmentRowToSegment } from '@/lib/db/mappers'
import { transcriptSegments, transcripts } from '@/lib/db/schema'
import { handleTranscriptExportRequest } from '@/lib/transcript-export-route'
import type { Transcript } from '@/lib/types'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

async function loadTranscriptForExport(
  projectId: string,
  transcriptId?: string | null,
): Promise<Transcript | null> {
  const transcriptRows = transcriptId
    ? await db
        .select()
        .from(transcripts)
        .where(and(eq(transcripts.projectId, projectId), eq(transcripts.id, transcriptId)))
        .limit(1)
    : await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.projectId, projectId))
        .orderBy(desc(transcripts.createdAt))
        .limit(1)

  const transcriptRow = transcriptRows[0]
  if (!transcriptRow) return null

  const segmentRows = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, transcriptRow.id))
    .orderBy(asc(transcriptSegments.start))

  return {
    id: transcriptRow.id,
    label: transcriptRow.label,
    language: transcriptRow.language,
    totalDuration: transcriptRow.totalDuration,
    segments: segmentRows.map(transcriptSegmentRowToSegment),
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  return handleTranscriptExportRequest(request, {
    projectId: id,
    deps: {
      requireProjectAccessForRoute,
      loadTranscriptForExport,
    },
  })
}
