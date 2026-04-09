/** Maps common video extensions to a stable video/* MIME for presigned uploads and filtering. */

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ogv: 'video/ogg',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
}

function fileExtensionLower(fileName: string): string | null {
  const base = fileName.split('/').pop() ?? fileName
  const dot = base.lastIndexOf('.')
  if (dot < 0 || dot >= base.length - 1) return null
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Returns a video/* MIME type suitable for S3 Content-Type when the browser
 * reports an empty or non-video type but the extension is a known video format.
 */
export function inferVideoContentType(fileName: string, declaredType: string): string | null {
  const dt = declaredType.trim()
  if (dt.length > 0 && dt.toLowerCase().startsWith('video/')) {
    return dt
  }
  const ext = fileExtensionLower(fileName)
  if (!ext) return null
  return EXT_TO_MIME[ext] ?? null
}

export function isVideoFileCandidate(file: File): boolean {
  return inferVideoContentType(file.name, file.type) !== null
}

export function objectKeyBasename(keyOrName: string): string {
  return keyOrName.includes('/') ? keyOrName.slice(keyOrName.lastIndexOf('/') + 1) : keyOrName
}
