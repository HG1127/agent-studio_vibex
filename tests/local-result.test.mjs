import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { mcpResult, desktopResult } from '../local-executor/result.mjs'
import { executeClaim } from '../local-executor/connection.mjs'
const scope = { module: { exports: {} } }
vm.runInNewContext(fs.readFileSync(new URL('../pocketbase/pb_hooks/modules/local_result.js', import.meta.url), 'utf8'), scope)
const { encode, decode } = scope.module.exports
const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
test('MCP image survives local transport without textual coercion or truncation', () => {
  const value = mcpResult({ content: [{ type: 'text', text: 'actual screenshot' }, { type: 'image', mimeType: 'image/png', data }] }, true)
  assert.deepEqual(JSON.parse(JSON.stringify(decode(encode(value)))), value)
  assert.equal(decode('legacy text').text, 'legacy text')
  assert.equal(decode(encode('\u001eSTUDIO_LOCAL_V1:malformed')).text, '\u001eSTUDIO_LOCAL_V1:malformed')
})
test('both boundaries reject unsupported, oversized, malformed and multiple images', () => {
  const valid = { type: 'image', mimeType: 'image/png', data }
  assert.throws(() => mcpResult({ content: [valid] }), /not_enabled/)
  for (const image of [{ ...valid, mimeType: 'image/svg+xml' }, { ...valid, data: '<svg>danger</svg>' }, { ...valid, data: 'A'.repeat(1398108) }, { ...valid, mimeType: 'image/jpeg' }]) {
    assert.throws(() => mcpResult({ content: [image] }, true))
    assert.throws(() => encode({ text: '', images: [image] }))
  }
  assert.throws(() => encode({ text: '', images: [valid, valid] }))
  assert.throws(() => mcpResult({ content: [valid, valid] }, true))
  assert.throws(() => mcpResult({ isError: true, content: [valid] }, true))
})
test('desktop takeover stops the claim and returns a safe actionable reason without retry', async () => {
  let calls = 0, completion
  const api = async (route, body) => {
    if (route.endsWith('/check')) return { active: true }
    completion = body; return { ok: true }
  }
  await executeClaim(api, { execute: async () => { calls++; throw Error('desktop_user_control', { cause: 'private desktop content' }) } },
    { id: 'fixture', claim: 'fixture', deadline_ms: Date.now() + 10000, input: {} })
  assert.equal(calls, 1)
  assert.equal(completion.ok, false)
  assert.match(completion.result, /用户操作或已被接管/)
  assert.ok(!completion.result.includes('private desktop content'))
})

test('Windows MCP ownership errors map safely while unrelated errors retain failure semantics', () => {
  for (const code of ['USER_CONTROL', 'TAKEOVER_PENDING', 'CONTROL_UNAVAILABLE', 'PHYSICAL_INPUT_HELD']) {
    assert.throws(() => desktopResult({ isError: true, content: [{ type: 'text', text: code + ': private detail' }] }),
      e => e.message === 'desktop_user_control' && e.cause === undefined)
  }
  assert.throws(() => desktopResult({ isError: true, content: [{ type: 'text', text: 'unrelated error' }] }), /mcp_tool_failed/)
  assert.equal(desktopResult({ content: [{ type: 'text', text: 'USER_CONTROL in document text' }] }), 'USER_CONTROL in document text')
})

test('inactive claims never execute and missing completion acknowledgements never repeat an effect', async () => {
  const job = { id: 'fixture', claim: 'fixture', deadline_ms: Date.now() + 10000, input: {} }
  let effects = 0, completions = 0
  const runtime = { execute: async () => { effects++; return 'already performed' } }
  await executeClaim(async () => ({ active: false }), runtime, job)
  assert.equal(effects, 0)
  await assert.rejects(() => executeClaim(async route => {
    if (route.endsWith('/check')) return { active: true }
    completions++; throw Error('acknowledgement_lost')
  }, runtime, job), /acknowledgement_lost/)
  assert.equal(effects, 1)
  assert.equal(completions, 1)
})
