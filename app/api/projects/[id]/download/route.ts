import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { getObjectBodyStream } from '@/lib/s3-storage'
import {
  buildEditObjectKey,
  buildOriginalUploadKey,
  isProjectScopedStorageKey,
} from '@/lib/media-keys'
import { requireProjectAccessForRoute } from '@/lib/workspace-access'

export const maxDuration = 600

const VIDEO_EXT = /^\.[a-zA-Z0-9]{1,10}$/

function extFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '')
  const i = base.lastIndexOf('.')
  if (i <= 0 || i >= base.length - 1) return '.bin'
  const ext = base.slice(i)
  return VIDEO_EXT.test(ext) ? ext.toLowerCase() : '.bin'
}

/** ASCII-only fallback for RFC 2183 filename= */
function asciiFilenameBase(title: string): string {
  const stripped = title
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '')
  return stripped || 'video'
}

function contentDisposition(unicodeName: string, asciiFallback: string): string {
  const enc = encodeURIComponent(unicodeName)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${enc}`
}

function resolveObjectKey(
  variant: 'original' | 'edit',
  project: {
    id: string
    workspaceProjectId: string
    fileName: string
    mediaMetadata: { originalKey?: string; editKey?: string } | null
  },
): string | null {
  const { id, workspaceProjectId, fileName, mediaMetadata } = project
  const originalKey =
    mediaMetadata?.originalKey ?? buildOriginalUploadKey(workspaceProjectId, id, fileName)
  const editKey = mediaMetadata?.editKey ?? buildEditObjectKey(workspaceProjectId, id)

  const key = variant === 'original' ? originalKey : editKey
  if (!isProjectScopedStorageKey(workspaceProjectId, id, key)) return null
  return key
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params
    const url = new URL(request.url)
    const variantRaw = url.searchParams.get('variant')
    if (variantRaw !== 'original' && variantRaw !== 'edit') {
      return NextResponse.json(
        { error: 'Query parameter "variant" must be "original" or "edit".' },
        { status: 400 },
      )
    }
    const variant = variantRaw

    const access = await requireProjectAccessForRoute(projectId, 'viewer')
    if (access instanceof NextResponse) return access

    const project = access.project
    const key = resolveObjectKey(variant, project)
    if (!key) {
      return NextResponse.json({ error: 'Invalid storage key for project.' }, { status: 400 })
    }

    const title = project.title.trim() || 'video'
    const ext = variant === 'edit' ? '.mp4' : extFromFileName(project.fileName)
    const unicodeName =
      variant === 'original' ? `${title}-original${ext}` : `${title}-edited.mp4`
    const asciiFallback =
      variant === 'original'
        ? `${asciiFilenameBase(title)}-original${ext}`
        : `${asciiFilenameBase(title)}-edited.mp4`

    const contentType =
      variant === 'edit' ? 'video/mp4' : ext === '.mp4' ? 'video/mp4' : 'application/octet-stream'

    const nodeStream = await getObjectBodyStream(key)
    const webStream = Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream<Uint8Array>

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition(unicodeName, asciiFallback),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
    const code = err.Code ?? err.name
    const status = err.$metadata?.httpStatusCode
    if (code === 'NoSuchKey' || code === 'NotFound' || status === 404) {
      return NextResponse.json({ error: 'File not found in storage.' }, { status: 404 })
    }
    console.error('project download:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
