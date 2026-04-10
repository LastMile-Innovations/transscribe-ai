import { NextResponse } from 'next/server'
import {
  countPersonalPresetsForUser,
  insertTranscriptionPreset,
  listPersonalPresets,
  listWorkspaceSharedPresets,
  MAX_TRANSCRIPTION_PRESETS_PER_USER_WORKSPACE,
} from '@/lib/db/transcription-presets'
import type { TranscriptionPresetRow } from '@/lib/db/schema'
import {
  parseAndValidatePresetOptions,
  parsePresetName,
  parsePresetScope,
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'viewer')
    if (access instanceof NextResponse) return access

    const [personal, workspace] = await Promise.all([
      listPersonalPresets(workspaceId, access.userId),
      listWorkspaceSharedPresets(workspaceId),
    ])

    return NextResponse.json({
      personal: personal.map(serializePreset),
      workspace: workspace.map(serializePreset),
    })
  } catch (error) {
    console.error('Error listing transcription presets:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: workspaceId } = await params
    const access = await requireWorkspaceAccessForRoute(workspaceId, 'editor')
    if (access instanceof NextResponse) return access

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
    const scopeParsed = parsePresetScope(b.scope)
    if (!scopeParsed.ok) {
      return NextResponse.json({ error: scopeParsed.error }, { status: 400 })
    }

    const nameParsed = parsePresetName(b.name)
    if (!nameParsed.ok) {
      return NextResponse.json({ error: nameParsed.error }, { status: 400 })
    }

    const optionsParsed = parseAndValidatePresetOptions(b.options)
    if (!optionsParsed.ok) {
      return NextResponse.json({ error: optionsParsed.error }, { status: 400 })
    }

    if (scopeParsed.scope === 'personal') {
      const n = await countPersonalPresetsForUser(workspaceId, access.userId)
      if (n >= MAX_TRANSCRIPTION_PRESETS_PER_USER_WORKSPACE) {
        return NextResponse.json(
          { error: `You can save at most ${MAX_TRANSCRIPTION_PRESETS_PER_USER_WORKSPACE} personal presets per workspace.` },
          { status: 400 },
        )
      }
    }

    const row = await insertTranscriptionPreset({
      workspaceProjectId: workspaceId,
      scope: scopeParsed.scope,
      name: nameParsed.name,
      options: optionsParsed.options,
      createdByUserId: access.userId,
    })

    return NextResponse.json(serializePreset(row))
  } catch (error) {
    console.error('Error creating transcription preset:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
