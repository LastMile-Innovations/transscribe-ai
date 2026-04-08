import { z } from 'zod'
import { projectStatusEnum } from '@/lib/db/schema'
import type { ProjectStatus } from '@/lib/db/schema'

const projectStatusTuple = projectStatusEnum.enumValues as [
  ProjectStatus,
  ...ProjectStatus[],
]

export const projectStatusSchema = z.enum(projectStatusTuple)

export const insertProjectBodySchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  workspaceProjectId: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  duration: z.number().int().nonnegative(),
  status: projectStatusSchema,
  thumbnailUrl: z.string().trim().min(1),
  fileUrl: z.string().nullable().optional(),
  originalFileUrl: z.string().nullable().optional(),
  sha256Hash: z.string().nullable().optional(),
  mediaMetadata: z.unknown().nullable().optional(),
  transcriptionProgress: z.number().int().min(0).max(100).optional(),
  folderId: z.string().nullable().optional(),
})

export type InsertProjectBody = z.infer<typeof insertProjectBodySchema>

export const patchProjectBodySchema = z
  .object({
    fileUrl: z.string().nullable().optional(),
    originalFileUrl: z.string().nullable().optional(),
    sha256Hash: z.string().nullable().optional(),
    mediaMetadata: z.unknown().nullable().optional(),
    status: projectStatusSchema.optional(),
    transcriptionProgress: z.number().int().min(0).max(100).optional(),
    duration: z.number().int().nonnegative().optional(),
    title: z.string().trim().min(1).optional(),
    thumbnailUrl: z.string().trim().min(1).optional(),
    folderId: z.string().nullable().optional(),
  })
  .refine(
    (o) =>
      o.fileUrl !== undefined ||
      o.originalFileUrl !== undefined ||
      o.sha256Hash !== undefined ||
      o.mediaMetadata !== undefined ||
      o.status !== undefined ||
      o.transcriptionProgress !== undefined ||
      o.duration !== undefined ||
      o.title !== undefined ||
      o.thumbnailUrl !== undefined ||
      o.folderId !== undefined,
    { message: 'At least one field required' },
  )

export type PatchProjectBody = z.infer<typeof patchProjectBodySchema>
