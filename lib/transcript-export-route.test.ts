import assert from 'node:assert/strict'
import test from 'node:test'
import { NextResponse } from 'next/server'
import { handleTranscriptExportRequest } from './transcript-export-route'

test('handleTranscriptExportRequest returns unauthorized responses from access control', async () => {
  const response = await handleTranscriptExportRequest(new Request('https://example.com/api/export'), {
    projectId: 'proj-1',
    deps: {
      requireProjectAccessForRoute: async () =>
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      loadTranscriptForExport: async () => {
        throw new Error('should not load transcript when access fails')
      },
    },
  })

  assert.equal(response.status, 401)
})

test('handleTranscriptExportRequest returns a 404 when no transcript exists', async () => {
  const response = await handleTranscriptExportRequest(new Request('https://example.com/api/export'), {
    projectId: 'proj-1',
    deps: {
      requireProjectAccessForRoute: async () => ({
        project: { id: 'proj-1', title: 'Case File' },
      }),
      loadTranscriptForExport: async () => null,
    },
  })

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Transcript not found' })
})

test('handleTranscriptExportRequest returns attachment headers for successful exports', async () => {
  const response = await handleTranscriptExportRequest(
    new Request('https://example.com/api/export?transcriptId=tx-1'),
    {
      projectId: 'proj-1',
      deps: {
        requireProjectAccessForRoute: async () => ({
          project: { id: 'proj-1', title: 'Case File' },
        }),
        loadTranscriptForExport: async (_projectId, transcriptId) => {
          assert.equal(transcriptId, 'tx-1')

          return {
            id: 'tx-1',
            label: 'Latest',
            language: 'en',
            totalDuration: 10_000,
            segments: [
              {
                id: 'seg-1',
                start: 0,
                end: 1_000,
                text: 'hello',
                speaker: 'Speaker A',
                confidence: 0.95,
                words: [{ text: 'hello', start: 0, end: 1_000, confidence: 0.95 }],
              },
            ],
          }
        },
      },
    },
  )

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/)
  assert.match(response.headers.get('content-disposition') ?? '', /attachment;/)

  const body = (await response.json()) as { transcriptId: string; sentences: Array<{ words: unknown[] }> }
  assert.equal(body.transcriptId, 'tx-1')
  assert.equal(body.sentences[0].words.length, 1)
})
