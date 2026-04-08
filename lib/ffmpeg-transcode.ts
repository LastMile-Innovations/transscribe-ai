import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type FfprobeStream = {
  codec_type?: string
  codec_name?: string
}

type FfprobeJson = {
  format?: { format_name?: string }
  streams?: FfprobeStream[]
}

function asTranscodeProbe(report: unknown): FfprobeJson {
  return report as FfprobeJson
}

/** Full ffprobe JSON for storage (format, streams, chapters, etc.). */
export async function ffprobeFullReport(inputPath: string): Promise<unknown> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    '-show_chapters',
    inputPath,
  ])
  return JSON.parse(stdout) as unknown
}

/**
 * Remux-only when container is MP4/MOV-like, video is H.264, and any audio is AAC (or absent).
 * Avoids re-encoding when the edit asset is already suitable for the browser.
 */
export function canRemuxToFaststartMp4(probe: unknown): boolean {
  const p = asTranscodeProbe(probe)
  const fmt = (p.format?.format_name ?? '').toLowerCase()
  const movLike =
    fmt.includes('mov') || fmt.includes('mp4') || fmt.includes('isom') || fmt.includes('m4v')
  if (!movLike) return false
  const video = p.streams?.find((s) => s.codec_type === 'video')
  if (!video || (video.codec_name ?? '').toLowerCase() !== 'h264') return false
  const audio = p.streams?.find((s) => s.codec_type === 'audio')
  if (!audio) return true
  return (audio.codec_name ?? '').toLowerCase() === 'aac'
}

/**
 * Produce web-friendly MP4 with faststart (remux or transcode).
 * Pass `existingReport` to avoid a second ffprobe pass when you already have the full report.
 */
export async function transcodeOrRemuxToMp4(
  inputPath: string,
  outputPath: string,
  existingReport?: unknown,
): Promise<void> {
  const probe = existingReport ?? (await ffprobeFullReport(inputPath))
  if (canRemuxToFaststartMp4(probe)) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ])
    return
  }
  // H.264 @ CRF 23 / fast preset is a reasonable default for editorial preview.
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outputPath,
  ])
}
