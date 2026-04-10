import { NextResponse } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { buildTranscriptDigestContext } from '@/lib/legal-digest-context'
import { legalDigestSchema } from '@/lib/legal-digest-schema'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { transcriptSegmentRowToSegment } from '@/lib/db/mappers'
import { transcriptSegments, transcripts } from '@/lib/db/schema'
import type { Transcript } from '@/lib/types'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export const maxDuration = 120

async function loadTranscriptForDigest(
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const access = await requireProjectAccessForRoute(projectId, 'editor')
  if (access instanceof NextResponse) return access

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'Legal digest requires OPENAI_API_KEY to be configured.' },
      { status: 503 },
    )
  }

  let body: { transcriptId?: string; focus?: string } = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object') body = raw as typeof body
  } catch {
    body = {}
  }

  const transcriptId =
    typeof body.transcriptId === 'string' && body.transcriptId.trim() !== ''
      ? body.transcriptId.trim()
      : undefined
  const focus =
    typeof body.focus === 'string' && body.focus.trim() !== '' ? body.focus.trim().slice(0, 2000) : undefined

  const transcript = await loadTranscriptForDigest(projectId, transcriptId)
  if (!transcript || transcript.segments.length === 0) {
    return NextResponse.json({ error: 'No transcript segments found for this project.' }, { status: 404 })
  }

  const context = buildTranscriptDigestContext(transcript)

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o'),
      schema: legalDigestSchema,
      temperature: 0.2,
      prompt: `You are assisting with litigation and compliance document review. Produce a factual, neutral digest of the transcript below. Do not state legal conclusions or predict case outcomes.

${focus ? `Reviewer focus (prioritize themes related to this when segmenting):\n${focus}\n\n` : ''}Transcript:
${context}`,
    })

    return NextResponse.json({ digest: object })
  } catch (e) {
    console.error('[legal-digest]', e)
    const message = e instanceof Error ? e.message : 'Digest generation failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
