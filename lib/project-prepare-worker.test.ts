import assert from 'node:assert/strict'
import test from 'node:test'
import {
  finalizePreparedProject,
  prepareProjectMedia,
  type PrepareableProject,
  type PreparedMediaResult,
} from './project-prepare-worker'
import type { TranscriptionRequestOptions } from './transcription-options'

const baseProject: PrepareableProject = {
  id: 'proj-1',
  workspaceProjectId: 'wp-1',
  fileName: 'hearing.mov',
  duration: 1234,
  pendingClientCapture: null,
  pendingAutoTranscriptionOptions: null,
}

function buildProbe(durationSec: string) {
  return {
    format: { duration: durationSec, format_name: 'mov,mp4,m4a,3gp,3g2,mj2', bit_rate: '2000000' },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        r_frame_rate: '30/1',
      },
      {
        codec_type: 'audio',
        codec_name: 'aac',
      },
    ],
    chapters: [],
  }
}

test('prepareProjectMedia builds prepared URLs and metadata with injected deps', async () => {
  const cleanedPaths: string[] = []
  const uploaded: Array<{ localPath: string; key: string; contentType: string }> = []

  const result = await prepareProjectMedia(baseProject, {
    makeTempBase: () => '/tmp/prepare-proj-1',
    safeUnlink: async (filePath) => {
      cleanedPaths.push(filePath)
    },
    downloadObjectToFileAndHash: async () => 'abc123',
    ffprobeFullReport: async (filePath) =>
      filePath.endsWith('-out.mp4') ? buildProbe('2.0') : buildProbe('1.5'),
    transcodeOrRemuxToMp4: async () => undefined,
    uploadFileToObjectKey: async (localPath, key, contentType) => {
      uploaded.push({ localPath, key, contentType })
    },
    browserObjectUrl: async (key) => `https://browser.example/${key}`,
    publicObjectUrl: (key) => `https://public.example/${key}`,
    now: () => 1234,
  })

  assert.equal(result.originalKey, 'wp-1/proj-1/original/hearing.mov')
  assert.equal(result.editKey, 'wp-1/proj-1/edit.mp4')
  assert.equal(result.sha256Hash, 'abc123')
  assert.equal(result.duration, 1500)
  assert.equal(result.fileUrl, 'https://browser.example/wp-1/proj-1/edit.mp4')
  assert.equal(result.originalFileUrl, 'https://browser.example/wp-1/proj-1/original/hearing.mov')
  assert.equal(result.storedFileUrl, 'https://public.example/wp-1/proj-1/edit.mp4')
  assert.equal(result.mediaMetadata.originalKey, result.originalKey)
  assert.deepEqual(uploaded, [
    {
      localPath: '/tmp/prepare-proj-1-out.mp4',
      key: 'wp-1/proj-1/edit.mp4',
      contentType: 'video/mp4',
    },
  ])
  assert.deepEqual(cleanedPaths, ['/tmp/prepare-proj-1-in', '/tmp/prepare-proj-1-out.mp4'])
})

test('prepareProjectMedia cleans up temp files when preparation fails', async () => {
  const cleanedPaths: string[] = []

  await assert.rejects(
    prepareProjectMedia(baseProject, {
      makeTempBase: () => '/tmp/prepare-proj-1',
      safeUnlink: async (filePath) => {
        cleanedPaths.push(filePath)
      },
      downloadObjectToFileAndHash: async () => 'abc123',
      ffprobeFullReport: async () => buildProbe('1.5'),
      transcodeOrRemuxToMp4: async () => {
        throw new Error('ffmpeg failed')
      },
      uploadFileToObjectKey: async () => undefined,
      browserObjectUrl: async (key) => `https://browser.example/${key}`,
      publicObjectUrl: (key) => `https://public.example/${key}`,
      now: () => 1234,
    }),
    /ffmpeg failed/,
  )

  assert.deepEqual(cleanedPaths, ['/tmp/prepare-proj-1-in', '/tmp/prepare-proj-1-out.mp4'])
})

function buildPreparedResult(): PreparedMediaResult {
  return {
    originalKey: 'wp-1/proj-1/original/hearing.mov',
    editKey: 'wp-1/proj-1/edit.mp4',
    sha256Hash: 'abc123',
    duration: 1500,
    mediaMetadata: {
      extractedAt: '2026-04-08T00:00:00.000Z',
      originalKey: 'wp-1/proj-1/original/hearing.mov',
      editKey: 'wp-1/proj-1/edit.mp4',
      original: buildProbe('1.5'),
      edit: buildProbe('2.0'),
      derived: {
        sourceDurationMs: 1500,
        editDurationMs: 2000,
        width: 1920,
        height: 1080,
        displayAspectRatio: null,
        frameRate: '30/1',
        sourceContainer: 'mov',
        sourceVideoCodec: 'h264',
        sourceAudioCodec: 'aac',
        sourceBitRate: 2000000,
        editContainer: 'mp4',
        editVideoCodec: 'h264',
        editAudioCodec: 'aac',
        editBitRate: 2000000,
        chaptersCount: 0,
        tags: {},
      },
    },
    storedOriginalFileUrl: 'https://public.example/wp-1/proj-1/original/hearing.mov',
    storedFileUrl: 'https://public.example/wp-1/proj-1/edit.mp4',
    originalFileUrl: 'https://browser.example/wp-1/proj-1/original/hearing.mov',
    fileUrl: 'https://browser.example/wp-1/proj-1/edit.mp4',
    playbackUrlRefreshedAt: 1234,
    playbackUrlExpiresAt: null,
  }
}

const autoOptions: TranscriptionRequestOptions = {
  speechModel: 'best',
  speakerLabels: true,
  languageDetection: true,
  temperature: 0.1,
  prompt: 'Use the upload-time snapshot.',
  keyterms: 'hearing, exhibit',
  knownSpeakers: 'Judge, Witness',
  redactPii: false,
}

test('finalizePreparedProject leaves prepared media awaiting manual transcription when auto-start is off', async () => {
  const calls: string[] = []

  const result = await finalizePreparedProject(
    {
      projectId: 'proj-1',
      prepared: buildPreparedResult(),
      pendingAutoTranscriptionOptions: null,
    },
    {
      markPrepareSuccess: async () => {
        calls.push('markPrepareSuccess')
      },
      submitProjectTranscription: async () => {
        throw new Error('submitProjectTranscription should not run')
      },
      markAutoTranscriptionStartFailure: async () => {
        throw new Error('markAutoTranscriptionStartFailure should not run')
      },
    },
  )

  assert.deepEqual(calls, ['markPrepareSuccess'])
  assert.deepEqual(result, { status: 'awaiting_transcript', processingError: null })
})

test('finalizePreparedProject auto-starts transcription after prepare success when a snapshot is queued', async () => {
  const calls: string[] = []

  const result = await finalizePreparedProject(
    {
      projectId: 'proj-1',
      prepared: buildPreparedResult(),
      pendingAutoTranscriptionOptions: autoOptions,
    },
    {
      markPrepareSuccess: async () => {
        calls.push('markPrepareSuccess')
      },
      submitProjectTranscription: async (input) => {
        calls.push(`submit:${input.clearPendingAutoTranscription ? 'clear' : 'keep'}`)
        assert.deepEqual(input.options, autoOptions)
        return {
          assemblyAiId: 'asm-1',
          transcriptId: 'tx-1',
          status: 'queued',
          normalizedOptions: autoOptions,
        }
      },
      markAutoTranscriptionStartFailure: async () => {
        throw new Error('markAutoTranscriptionStartFailure should not run')
      },
    },
  )

  assert.deepEqual(calls, ['markPrepareSuccess', 'submit:clear'])
  assert.deepEqual(result, { status: 'transcribing', processingError: null })
})

test('finalizePreparedProject falls back to awaiting_transcript with a persisted error when auto-start fails', async () => {
  let failureMessage = ''

  const result = await finalizePreparedProject(
    {
      projectId: 'proj-1',
      prepared: buildPreparedResult(),
      pendingAutoTranscriptionOptions: autoOptions,
    },
    {
      markPrepareSuccess: async () => undefined,
      submitProjectTranscription: async () => {
        throw new Error('Missing AssemblyAI API key')
      },
      markAutoTranscriptionStartFailure: async (_projectId, message) => {
        failureMessage = message
      },
    },
  )

  assert.match(
    failureMessage,
    /Editor MP4 is ready, but automatic transcription could not be started\./,
  )
  assert.match(failureMessage, /Missing AssemblyAI API key/)
  assert.deepEqual(result, { status: 'awaiting_transcript', processingError: failureMessage })
})
