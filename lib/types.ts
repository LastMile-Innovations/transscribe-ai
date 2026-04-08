import type { OverlayFontWeight, ProjectStatus } from './db/schema'
import type { StoredMediaMetadata } from './media-metadata'

export type { OverlayFontWeight, ProjectStatus }

export interface WorkspaceProject {
  id: string
  name: string
  createdAt: Date
}

export interface Folder {
  id: string
  workspaceProjectId: string
  parentFolderId: string | null
  name: string
  sortOrder: number
}

export interface VideoProject {
  id: string
  title: string
  fileName: string
  duration: number // milliseconds
  uploadedAt: Date
  status: ProjectStatus
  thumbnailUrl: string
  fileUrl: string | null
  /** Public URL of the immutable original upload (same bytes as SHA-256). */
  originalFileUrl?: string | null
  /** Lowercase hex SHA-256 of the original object in object storage. */
  sha256Hash?: string | null
  /** ffprobe payloads + derived summary (original vault file + edit MP4). */
  mediaMetadata?: StoredMediaMetadata | null
  transcriptionProgress: number // 0–100
  /** Client-only while uploading to storage; not persisted. */
  uploadProgress?: {
    loaded: number
    total: number
    speedBps: number
  }
  workspaceProjectId: string
  folderId: string | null
  caseId?: string | null
  exhibitNumber?: string | null
}

export interface TranscriptWord {
  text: string
  start: number // ms
  end: number // ms
  confidence: number // 0–1
}

export interface TranscriptSegment {
  id: string
  start: number // ms
  end: number // ms
  text: string
  speaker: string
  confidence: number // 0–1
  words?: TranscriptWord[]
}

export interface Transcript {
  id: string
  label: string | null
  segments: TranscriptSegment[]
  language: string
  totalDuration: number // ms
}

export interface TranscriptSummary {
  id: string
  label: string | null
  language: string
  totalDuration: number
  createdAt: Date
  assemblyAiTranscriptId: string | null
}

export interface TextOverlay {
  id: string
  text: string
  x: number // percent 0–100
  y: number // percent 0–100
  fontSize: number // px
  fontColor: string
  bgColor: string
  bgOpacity: number // 0–1
  startTime: number // ms
  endTime: number // ms
  fontWeight: OverlayFontWeight
  width: number // percent, max width of the overlay relative to video width
}

export interface TrimRange {
  start: number // ms
  end: number // ms
}

export type AIMessageRole = 'user' | 'assistant'

export interface AIToolCall {
  name: 'editSegment' | 'addOverlay' | 'trimVideo' | 'removeFillerWords' | 'fixGrammar'
  description: string
  params: Record<string, unknown>
}

export interface AIMessage {
  id: string
  role: AIMessageRole
  content: string
  timestamp: Date
  toolCall?: AIToolCall
  isStreaming?: boolean
}

export interface AppState {
  projects: VideoProject[]
  activeProjectId: string | null
  transcript: Transcript | null
  overlays: TextOverlay[]
  trimRange: TrimRange | null
  aiMessages: AIMessage[]
  playerTime: number // ms
  isPlaying: boolean
}

export type AppAction =
  | { type: 'SET_PROJECTS'; projects: VideoProject[] }
  | { type: 'ADD_PROJECT'; project: VideoProject }
  | { type: 'DELETE_PROJECT'; id: string }
  | { type: 'UPDATE_PROJECT'; id: string; updates: Partial<VideoProject> }
  | { type: 'SET_ACTIVE_PROJECT'; id: string }
  | { type: 'SET_TRANSCRIPT'; transcript: Transcript | null }
  | { type: 'UPDATE_SEGMENT'; id: string; updates: Partial<TranscriptSegment> }
  | { type: 'ADD_SEGMENT'; segment: TranscriptSegment; afterId: string }
  | { type: 'DELETE_SEGMENT'; id: string }
  | { type: 'MERGE_SEGMENTS'; id1: string; id2: string }
  | { type: 'SET_OVERLAYS'; overlays: TextOverlay[] }
  | { type: 'ADD_OVERLAY'; overlay: TextOverlay }
  | { type: 'UPDATE_OVERLAY'; id: string; updates: Partial<TextOverlay> }
  | { type: 'DELETE_OVERLAY'; id: string }
  | { type: 'SET_TRIM'; trimRange: TrimRange }
  | { type: 'RESET_TRIM' }
  | { type: 'SET_PLAYER_TIME'; time: number }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'ADD_AI_MESSAGE'; message: AIMessage }
  | { type: 'UPDATE_AI_MESSAGE'; id: string; updates: Partial<AIMessage> }
  | { type: 'CLEAR_AI_MESSAGES' }
