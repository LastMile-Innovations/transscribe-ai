import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildClipListTsv,
  buildNumberedTranscriptLines,
  numberedTranscriptToPlainText,
  wrapTranscriptLine,
} from './legal-transcript-export'
import type { TranscriptSegment } from './types'

test('wrapTranscriptLine respects width', () => {
  const lines = wrapTranscriptLine('one two three four five', 10)
  assert.ok(lines.every((l) => l.length <= 10))
})

test('buildNumberedTranscriptLines assigns rising line numbers', () => {
  const segments: TranscriptSegment[] = [
    {
      id: 'a',
      start: 0,
      end: 1000,
      speaker: 'A',
      text: 'Short.',
      confidence: 1,
    },
    {
      id: 'b',
      start: 1000,
      end: 2000,
      speaker: 'B',
      text: 'Also short.',
      confidence: 1,
    },
  ]
  const lines = buildNumberedTranscriptLines(segments, { contentWidth: 120 })
  assert.equal(lines.length, 2)
  assert.equal(lines[0].lineNumber, 1)
  assert.equal(lines[1].lineNumber, 2)
  assert.ok(lines[0].text.includes('A'))
  assert.ok(lines[1].text.includes('B'))
})

test('numberedTranscriptToPlainText includes banner', () => {
  const lines = buildNumberedTranscriptLines([])
  const text = numberedTranscriptToPlainText(lines, {
    title: 'Matter X',
    transcriptId: 'tr-1',
    exportedIso: '2026-01-01T00:00:00.000Z',
  })
  assert.match(text, /Matter X/)
  assert.match(text, /tr-1/)
})

test('buildClipListTsv has header and rows', () => {
  const segments: TranscriptSegment[] = [
    {
      id: 's1',
      start: 0,
      end: 500,
      speaker: 'Q',
      text: 'Hello\tworld',
      confidence: 1,
    },
  ]
  const tsv = buildClipListTsv(segments)
  assert.ok(tsv.startsWith('segment_index\t'))
  assert.ok(tsv.includes('s1'))
  assert.ok(!tsv.includes('\t\n')) // excerpt should not embed raw tab from text
})
