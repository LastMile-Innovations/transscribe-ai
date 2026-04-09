import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTranscriptTimecode, serializeTranscriptExport } from './transcript-export'

test('serializeTranscriptExport nests word timings and preserves sentence order', () => {
  const exported = serializeTranscriptExport({
    projectId: 'proj-1',
    projectTitle: 'Deposition A',
    transcript: {
      id: 'tx-1',
      label: 'Latest',
      language: 'en',
      totalDuration: 12_000,
      segments: [
        {
          id: 'seg-b',
          start: 4_000,
          end: 7_500,
          text: 'second sentence',
          speaker: 'Speaker B',
          confidence: 0.8,
          words: [{ text: 'second', start: 4_000, end: 4_900, confidence: 0.75 }],
        },
        {
          id: 'seg-a',
          start: 0,
          end: 3_000,
          text: 'first sentence',
          speaker: 'Speaker A',
          confidence: 0.9,
          words: [
            { text: 'first', start: 0, end: 800, confidence: 0.95 },
            { text: 'sentence', start: 810, end: 1_700, confidence: 0.91 },
          ],
        },
      ],
    },
  })

  assert.equal(exported.projectId, 'proj-1')
  assert.equal(exported.projectTitle, 'Deposition A')
  assert.equal(exported.sentenceUnit, 'segment')
  assert.deepEqual(
    exported.sentences.map((sentence) => sentence.id),
    ['seg-a', 'seg-b'],
  )
  assert.equal(exported.sentences[0].startTimecode, '00:00:00.000')
  assert.equal(exported.sentences[0].endTimecode, '00:00:03.000')
  assert.equal(exported.sentences[0].words[0].index, 0)
  assert.equal(exported.sentences[0].words[1].text, 'sentence')
  assert.equal(exported.sentences[1].words[0].startTimecode, '00:00:04.000')
})

test('serializeTranscriptExport emits an empty word list when a segment has no word timestamps', () => {
  const exported = serializeTranscriptExport({
    projectId: 'proj-2',
    projectTitle: 'Hearing',
    transcript: {
      id: 'tx-2',
      label: null,
      language: 'en',
      totalDuration: 5_000,
      segments: [
        {
          id: 'seg-1',
          start: 250,
          end: 4_500,
          text: 'raw transcript text',
          speaker: 'Speaker A',
          confidence: 0.7,
        },
      ],
    },
  })

  assert.deepEqual(exported.sentences[0].words, [])
  assert.equal(exported.sentences[0].startTimecode, '00:00:00.250')
})

test('formatTranscriptTimecode keeps zero-padded hour-minute-second precision', () => {
  assert.equal(formatTranscriptTimecode(0), '00:00:00.000')
  assert.equal(formatTranscriptTimecode(61_234), '00:01:01.234')
  assert.equal(formatTranscriptTimecode(3_723_004), '01:02:03.004')
})
