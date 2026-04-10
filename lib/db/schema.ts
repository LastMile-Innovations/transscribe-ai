import { relations, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { ClientMediaCapture } from '@/lib/client-media-capture'
import type { StoredMediaMetadata } from '@/lib/media-metadata'
import type { TranscriptionRequestOptions } from '@/lib/transcription-options'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/** JSONB shape for `transcript_segments.words` (matches `TranscriptWord` in app types). */
export type StoredTranscriptWord = {
  text: string
  start: number
  end: number
  confidence: number
}

export const projectStatusEnum = pgEnum('project_status', [
  'uploading',
  'queued_prepare',
  'preparing',
  'transcribing',
  'awaiting_transcript',
  'ready',
  'error',
])

export const overlayFontWeightEnum = pgEnum('overlay_font_weight', ['normal', 'bold'])

export const workspaceMemberRoleEnum = pgEnum('workspace_member_role', ['owner', 'editor', 'viewer'])

export const transcriptionPresetScopeEnum = pgEnum('transcription_preset_scope', ['personal', 'workspace'])

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number]
export type OverlayFontWeight = (typeof overlayFontWeightEnum.enumValues)[number]
export type WorkspaceMemberRole = (typeof workspaceMemberRoleEnum.enumValues)[number]
export type TranscriptionPresetScope = (typeof transcriptionPresetScopeEnum.enumValues)[number]

export const workspaceProjects = pgTable('workspace_projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceProjectId: text('workspace_project_id')
      .notNull()
      .references(() => workspaceProjects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: workspaceMemberRoleEnum('role').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceProjectId, t.userId] }),
    userIdIdx: index('workspace_members_user_id_idx').on(t.userId),
  }),
)

export const transcriptionPresets = pgTable(
  'transcription_presets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceProjectId: text('workspace_project_id')
      .notNull()
      .references(() => workspaceProjects.id, { onDelete: 'cascade' }),
    scope: transcriptionPresetScopeEnum('scope').notNull(),
    name: text('name').notNull(),
    options: jsonb('options').$type<TranscriptionRequestOptions>().notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    workspaceUserIdx: index('transcription_presets_workspace_user_idx').on(t.workspaceProjectId, t.createdByUserId),
    workspaceScopeIdx: index('transcription_presets_workspace_scope_idx').on(t.workspaceProjectId, t.scope),
  }),
)

export const folders = pgTable('folders', {
  id: text('id').primaryKey(),
  workspaceProjectId: text('workspace_project_id')
    .notNull()
    .references(() => workspaceProjects.id, { onDelete: 'cascade' }),
  parentFolderId: text('parent_folder_id').references((): AnyPgColumn => folders.id, {
    onDelete: 'cascade',
  }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  workspaceProjectSortIdx: index('folders_workspace_project_sort_idx').on(
    t.workspaceProjectId,
    t.sortOrder,
    t.name,
  ),
  workspaceParentSortIdx: index('folders_workspace_parent_sort_idx').on(
    t.workspaceProjectId,
    t.parentFolderId,
    t.sortOrder,
    t.name,
  ),
}))

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    duration: integer('duration').notNull(),
    uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
    status: projectStatusEnum('status').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull(),
    fileUrl: text('file_url'),
    /** Browser-accessible URL of byte-identical original upload (evidence vault). */
    originalFileUrl: text('original_file_url'),
    transcriptionProgress: integer('transcription_progress').notNull().default(0),
    processingError: text('processing_error'),
    prepareAttempts: integer('prepare_attempts').notNull().default(0),
    prepareStartedAt: timestamp('prepare_started_at'),
    prepareCompletedAt: timestamp('prepare_completed_at'),
    pendingClientCapture: jsonb('pending_client_capture').$type<ClientMediaCapture | null>(),
    pendingAutoTranscriptionOptions: jsonb('pending_auto_transcription_options')
      .$type<TranscriptionRequestOptions | null>(),
    activeTranscriptId: uuid('active_transcript_id').references(
      (): AnyPgColumn => transcripts.id,
      { onDelete: 'set null' },
    ),
    preferredTranscriptId: uuid('preferred_transcript_id').references(
      (): AnyPgColumn => transcripts.id,
      { onDelete: 'set null' },
    ),
    workspaceProjectId: text('workspace_project_id')
      .notNull()
      .references(() => workspaceProjects.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    caseId: text('case_id'),
    exhibitNumber: text('exhibit_number'),
    sha256Hash: text('sha256_hash'),
    /** ffprobe JSON (original + edit) and derived fields for UI. */
    mediaMetadata: jsonb('media_metadata').$type<StoredMediaMetadata | null>(),
  },
  (t) => ({
    workspaceProjectUploadedAtIdx: index('projects_workspace_project_uploaded_at_idx').on(
      t.workspaceProjectId,
      t.uploadedAt,
    ),
    statusPrepareStartedIdx: index('projects_status_prepare_started_idx').on(
      t.status,
      t.prepareStartedAt,
      t.uploadedAt,
    ),
  }),
)

export const transcripts = pgTable(
  'transcripts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    totalDuration: integer('total_duration').notNull(),
    speechModel: text('speech_model'),
    label: text('label'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    assemblyAiTranscriptId: text('assembly_ai_transcript_id'),
  },
  (t) => ({
    projectCreatedAtIdx: index('transcripts_project_created_at_idx').on(t.projectId, t.createdAt),
    /** One pending row per AssemblyAI job; multiple NULLs allowed for legacy rows. */
    assemblyAiTranscriptIdUq: uniqueIndex('transcripts_assembly_ai_transcript_id_uq')
      .on(t.assemblyAiTranscriptId)
      .where(sql`${t.assemblyAiTranscriptId} IS NOT NULL`),
  }),
)

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: text('id').primaryKey(),
    transcriptId: uuid('transcript_id').notNull().references(() => transcripts.id, { onDelete: 'cascade' }),
    start: integer('start').notNull(),
    end: integer('end').notNull(),
    text: text('text').notNull(),
    speaker: text('speaker').notNull(),
    confidence: real('confidence').notNull(),
    words: jsonb('words').$type<StoredTranscriptWord[] | null>(),
  },
  (t) => ({
    transcriptStartIdx: index('transcript_segments_transcript_start_idx').on(t.transcriptId, t.start),
  }),
)

export const textOverlays = pgTable('text_overlays', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  fontSize: integer('font_size').notNull(),
  fontColor: text('font_color').notNull(),
  bgColor: text('bg_color').notNull(),
  bgOpacity: real('bg_opacity').notNull(),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time').notNull(),
  fontWeight: overlayFontWeightEnum('font_weight').notNull(),
  width: integer('width').notNull(),
}, (t) => ({
  projectIdIdx: index('text_overlays_project_id_idx').on(t.projectId),
}))

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaceProjects, {
    fields: [workspaceMembers.workspaceProjectId],
    references: [workspaceProjects.id],
  }),
}))

export const workspaceProjectsRelations = relations(workspaceProjects, ({ many }) => ({
  folders: many(folders),
  media: many(projects),
  members: many(workspaceMembers),
  transcriptionPresets: many(transcriptionPresets),
}))

export const transcriptionPresetsRelations = relations(transcriptionPresets, ({ one }) => ({
  workspace: one(workspaceProjects, {
    fields: [transcriptionPresets.workspaceProjectId],
    references: [workspaceProjects.id],
  }),
}))

export const foldersRelations = relations(folders, ({ one, many }) => ({
  workspace: one(workspaceProjects, {
    fields: [folders.workspaceProjectId],
    references: [workspaceProjects.id],
  }),
  parent: one(folders, {
    fields: [folders.parentFolderId],
    references: [folders.id],
    relationName: 'folder_tree',
  }),
  children: many(folders, { relationName: 'folder_tree' }),
  projects: many(projects),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaceProjects, {
    fields: [projects.workspaceProjectId],
    references: [workspaceProjects.id],
  }),
  folder: one(folders, {
    fields: [projects.folderId],
    references: [folders.id],
  }),
  transcripts: many(transcripts),
  textOverlays: many(textOverlays),
}))

export const transcriptsRelations = relations(transcripts, ({ one, many }) => ({
  project: one(projects, {
    fields: [transcripts.projectId],
    references: [projects.id],
  }),
  segments: many(transcriptSegments),
}))

export const transcriptSegmentsRelations = relations(transcriptSegments, ({ one }) => ({
  transcript: one(transcripts, {
    fields: [transcriptSegments.transcriptId],
    references: [transcripts.id],
  }),
}))

export const textOverlaysRelations = relations(textOverlays, ({ one }) => ({
  project: one(projects, {
    fields: [textOverlays.projectId],
    references: [projects.id],
  }),
}))

export type WorkspaceProjectRow = typeof workspaceProjects.$inferSelect
export type WorkspaceProjectInsert = typeof workspaceProjects.$inferInsert
export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect
export type WorkspaceMemberInsert = typeof workspaceMembers.$inferInsert
export type FolderRow = typeof folders.$inferSelect
export type FolderInsert = typeof folders.$inferInsert
export type ProjectRow = typeof projects.$inferSelect
export type ProjectInsert = typeof projects.$inferInsert
export type TranscriptRow = typeof transcripts.$inferSelect
export type TranscriptInsert = typeof transcripts.$inferInsert
export type TranscriptSegmentRow = typeof transcriptSegments.$inferSelect
export type TranscriptSegmentInsert = typeof transcriptSegments.$inferInsert
export type TextOverlayRow = typeof textOverlays.$inferSelect
export type TextOverlayInsert = typeof textOverlays.$inferInsert
export type TranscriptionPresetRow = typeof transcriptionPresets.$inferSelect
export type TranscriptionPresetInsert = typeof transcriptionPresets.$inferInsert
