import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceProjectId } from './workspace-project-id'

test('buildWorkspaceProjectId prefixes a generated id with wp-', () => {
  assert.equal(buildWorkspaceProjectId(() => 'abc123'), 'wp-abc123')
})

test('buildWorkspaceProjectId does not depend on timestamps', () => {
  const generated = buildWorkspaceProjectId(() => '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(generated, 'wp-550e8400-e29b-41d4-a716-446655440000')
  assert.match(generated, /^wp-[0-9a-f-]+$/)
})
