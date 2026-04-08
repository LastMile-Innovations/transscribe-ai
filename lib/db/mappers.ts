import type { ProjectRow, TextOverlayRow, TranscriptSegmentRow } from './schema'
import type { TextOverlay, TranscriptSegment, VideoProject } from '@/lib/types'

export function projectRowToVideoProject(row: ProjectRow): VideoProject {
  return {
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    duration: row.duration,
    uploadedAt: row.uploadedAt,
    status: row.status,
    thumbnailUrl: row.thumbnailUrl,
    fileUrl: row.fileUrl,
    originalFileUrl: row.originalFileUrl,
    sha256Hash: row.sha256Hash,
    mediaMetadata: row.mediaMetadata,
    transcriptionProgress: row.transcriptionProgress,
    workspaceProjectId: row.workspaceProjectId,
    folderId: row.folderId,
    caseId: row.caseId,
    exhibitNumber: row.exhibitNumber,
  }
}

export function transcriptSegmentRowToSegment(row: TranscriptSegmentRow): TranscriptSegment {
  return {
    id: row.id,
    start: row.start,
    end: row.end,
    text: row.text,
    speaker: row.speaker,
    confidence: row.confidence,
    words: row.words ?? undefined,
  }
}

export function textOverlayRowToOverlay(row: TextOverlayRow): TextOverlay {
  return {
    id: row.id,
    text: row.text,
    x: row.x,
    y: row.y,
    fontSize: row.fontSize,
    fontColor: row.fontColor,
    bgColor: row.bgColor,
    bgOpacity: row.bgOpacity,
    startTime: row.startTime,
    endTime: row.endTime,
    fontWeight: row.fontWeight,
    width: row.width,
  }
}
