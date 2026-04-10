import { NextResponse } from 'next/server'
import {
  deleteTranscriptionPresetById,
  findTranscriptionPresetById,
  updateTranscriptionPreset,
} from '@/lib/db/transcription-presets'
import type { TranscriptionPresetRow } from '@/lib/db/schema'
import {
  parseAndValidatePresetOptions,
  parsePresetName,
} from '@/lib/transcription-preset-api'
import { requireWorkspaceAccessForRoute } from '@/lib/workspace-access'

function serializePreset(row: TranscriptionPresetRow) {
  return {
    id: row.id,
    workspaceProjectId: row.workspaceProjectId,
    scope: row.scope,
    name: row.name,
    options: row.options,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

function canMutatePreset(input: {
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  preset: TranscriptionPresetRow
}): boolean {
  if (input.preset.scope === 'personal') {
    return input.preset.createdByUserId === input.userId
  }
  // workspace-shared: creator or workspace owner
  if (input.preset.createdByUserId === input.userId) return true
  return input.role === 'owner'
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  try {
    const { id: workspaceId, presetId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'editor')
    if (access instanceof NextResponse) return access

    const preset = await findTranscriptionPresetById(presetId)
    if (!preset || preset.workspaceProjectId !== workspaceId) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    if (!canMutatePreset({ userId: access.userId, role: access.role, preset })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const patch: { name?: string; options?: import('@/lib/transcription-options').TranscriptionRequestOptions } = {}

    if (b.name !== undefined) {
      const nameParsed = parsePresetName(b.name)
      if (!nameParsed.ok) {
        return NextResponse.json({ error: nameParsed.error }, { status: 400 })
      }
      patch.name = nameParsed.name
    }

    if (b.options !== undefined) {
      const optionsParsed = parseAndValidatePresetOptions(b.options)
      if (!optionsParsed.ok) {
        return NextResponse.json({ error: optionsParsed.error }, { status: 400 })
      }
      patch.options = optionsParsed.options
    }

    if (patch.name === undefined && patch.options === undefined) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const updated = await updateTranscriptionPreset(presetId, patch)
    if (!updated) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    return NextResponse.json(serializePreset(updated))
  } catch (error) {
    console.error('Error updating transcription preset:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; presetId: string }> },
) {
  try {
    const { id: workspaceId, presetId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'editor')
    if (access instanceof NextResponse) return access

    const preset = await findTranscriptionPresetById(presetId)
    if (!preset || preset.workspaceProjectId !== workspaceId) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    if (!canMutatePreset({ userId: access.userId, role: access.role, preset })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ok = await deleteTranscriptionPresetById(presetId)
    if (!ok) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting transcription preset:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
