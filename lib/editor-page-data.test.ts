import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEditorPageData } from './editor-page-data'

test('loadEditorPageData returns transcript list when both loaders succeed', async () => {
  const result = await loadEditorPageData({
    id: 'proj-1',
    transcriptId: 'tx-1',
    getProjectData: async (projectId, transcriptId) => ({
      project: { id: projectId, title: 'Case File' },
      transcript: { id: transcriptId ?? 'tx-1' },
      overlays: [],
    }),
    listTranscriptsForMediaAction: async () => [{ id: 'tx-1', label: 'Latest' }],
  })

  assert.deepEqual(result, {
    data: {
      project: { id: 'proj-1', title: 'Case File' },
      transcript: { id: 'tx-1' },
      overlays: [],
    },
    transcriptList: [{ id: 'tx-1', label: 'Latest' }],
  })
})

test('loadEditorPageData falls back to an empty transcript list when transcript loading fails', async () => {
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const result = await loadEditorPageData({
      id: 'proj-1',
      getProjectData: async () => ({
        project: { id: 'proj-1', title: 'Case File' },
        transcript: null,
        overlays: [],
      }),
      listTranscriptsForMediaAction: async () => {
        throw new Error('transcript list failed')
      },
    })

    assert.deepEqual(result, {
      data: {
        project: { id: 'proj-1', title: 'Case File' },
        transcript: null,
        overlays: [],
      },
      transcriptList: [],
    })
  } finally {
    console.error = originalConsoleError
  }
})

test('loadEditorPageData returns null when the project data is missing', async () => {
  const result = await loadEditorPageData({
    id: 'proj-1',
    getProjectData: async () => null,
    listTranscriptsForMediaAction: async () => {
      throw new Error('should not run')
    },
  })

  assert.equal(result, null)
})
