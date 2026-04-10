import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAndValidatePresetOptions, parsePresetName, parsePresetScope } from './transcription-preset-api'

test('parsePresetScope accepts personal and workspace', () => {
  assert.deepEqual(parsePresetScope('personal'), { ok: true, scope: 'personal' })
  assert.deepEqual(parsePresetScope('workspace'), { ok: true, scope: 'workspace' })
  assert.equal(parsePresetScope('x').ok, false)
})

test('parsePresetName rejects empty and long names', () => {
  assert.equal(parsePresetName('').ok, false)
  assert.equal(parsePresetName('  ').ok, false)
  assert.deepEqual(parsePresetName('  My preset '), { ok: true, name: 'My preset' })
  assert.equal(parsePresetName('a'.repeat(200)).ok, false)
})

test('parseAndValidatePresetOptions normalizes and validates', () => {
  const bad = parseAndValidatePresetOptions(null)
  assert.equal(bad.ok, false)

  const range = parseAndValidatePresetOptions({
    speechModel: 'best',
    speakerLabels: true,
    languageDetection: true,
    temperature: 0.1,
    minSpeakers: 9,
    maxSpeakers: 2,
  })
  assert.equal(range.ok, false)

  const good = parseAndValidatePresetOptions({
    speechModel: 'fast',
    speakerLabels: true,
    prompt: '',
    keyterms: '',
  })
  assert.equal(good.ok, true)
  if (good.ok) {
    assert.equal(good.options.transcriptLabel, '')
    assert.equal(good.options.speechModel, 'fast')
  }
})
