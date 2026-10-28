// Focused static SSR/structure checks; no browser, provider or authenticated-acceptance claim.
import test, {before, after} from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {parse} from '@babel/parser'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {agentDescriptivePatchPreview, agentDescriptivePatchOriginal, agentDescriptivePatchReceipt} from '../src/lib/pgNativeAgentDescriptivePatch.ts'
import {emptyAgentDescriptivePatchView} from '../src/lib/pgNativeAgentDescriptivePatchSession.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = 'src/pages/PgNativePilot/PgNativeAgentDescriptivePatchPanel.tsx'
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), h = c => c.repeat(64)
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ?
  '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v)
const hash = v => createHash('sha256').update(canonical(v)).digest('hex')
const target = {review_id: id(1), spec_id: id(2), target_run_id: id(10)}
let server, Panel, Presentation, preview, original, receipt
before(async () => {
  const before = {goal: '原目标', task_scope: '原范围', deliverables: ['原交付'], task_plan: ['<script>window.marker=1</script>'], done_criteria: ['原标准']}
  const descriptive = {goal: '原目标', task_scope: '', deliverables: [], done_criteria: ['新标准']}, provided_keys = ['goal', 'task_scope', 'deliverables', 'done_criteria']
  const feedback_sources = [{run_id: id(20), feedback_id: id(30), feedback_sha256: h('a'), feedback_revision: 2, feedback_source_sha256: h('b'), statement_sha256: h('c')}]
  const binding = {source_kind: 'feedback_generated_descriptive_patch', mode: 'provided_fields',
    source: {purpose: 'optimize', ...target, review_request_sha256: h('1'), input_sha256: h('2'), content_sha256: h('3'), result_sha256: h('4'), completion_sha256: h('5'), source_owner_epoch: 5, source_protocol: 'employee_statement_anchor_v1'},
    feedback_sources, feedback_sources_sha256: hash({protocol: 'agent_descriptive_patch_feedback_v1', sources: feedback_sources}), anchor: {run_id: id(20), feedback_id: id(30)},
    before: {revision: 41, source_sha256: h('6'), descriptive: before},
    model_patch: {provided_keys, descriptive, patch_sha256: hash({protocol: 'agent_descriptive_patch_model_v1', provided_keys, descriptive})},
    candidate: {descriptive: {...before, ...descriptive}, candidate_sha256: h('8')}, changed_keys: ['task_scope', 'deliverables', 'done_criteria']}
  preview = await agentDescriptivePatchPreview({protocol: 'agent_descriptive_patch_preview_v1', ...binding,
    preview_sha256: hash({protocol: 'agent_descriptive_patch_preview_binding_v1', ...binding}), recorded: false}, target)
  original = agentDescriptivePatchOriginal(preview, id(99))
  const {before: _before, model_patch: _model, candidate: _candidate, ...common} = binding
  const core = {protocol: 'agent_descriptive_patch_receipt_v1', ...common, request_id: id(99),
    request_sha256: hash({protocol: 'agent_descriptive_patch_accept_intent_v1', ...original}),
    before: {revision: 41, source_sha256: h('6'), revision_id: id(90)}, after: {revision: 42, source_sha256: h('7'), revision_id: id(91)},
    provided_keys, patch_sha256: binding.model_patch.patch_sha256, candidate_sha256: h('8'), preview_sha256: preview.preview_sha256,
    acceptance_owner_epoch: 5, created_at: '2026-10-28T01:02:03.123Z'}
  receipt = await agentDescriptivePatchReceipt({...core, receipt_sha256: hash(core), recorded: true, replayed: true}, {original, replayed: true})
  server = await createServer({configFile: false, envFile: false, root, mode: 'test', plugins: [react()],
    cacheDir: path.join(root, '.tmp/pg-migration-completion/descriptive-patch-ui-ssr-cache'),
    resolve: {alias: {'@': path.join(root, 'src')}}, optimizeDeps: {noDiscovery: true, include: [], entries: []},
    ssr: {optimizeDeps: {noDiscovery: true, include: [], entries: []}}, server: {middlewareMode: true, hmr: false, watch: null}})
  const module = await server.ssrLoadModule('/' + file)
  Panel = module.default; Presentation = module.PgNativeAgentDescriptivePatchPresentation
})
after(async () => {await server?.close()})
const noop = () => {}
function render(view = {}, extra = {}) {
  return renderToStaticMarkup(createElement(Presentation, {view: {...emptyAgentDescriptivePatchView(), target, ...view},
    target, available: true, acceptanceEnabled: true, active: true, confirmed: false, onConfirmation: noop,
    onPreview: noop, onRefresh: noop, onAccept: noop, onConfirmOriginal: noop, onRetryOriginal: noop, ...extra}))
}
function button(html, label) {const found = html.match(new RegExp('<button\\b[^>]*>' + label + '</button>')); assert.ok(found, label); return found[0]}
const disabled = tag => /\sdisabled=""/.test(tag)

test('provided and changed are distinct, omitted values inherit, and explicit empties show clearing', () => {
  const html = render({preview, canAccept: true})
  assert.match(html, /模型提供 4 项 · 实际变化 3 项/)
  assert.match(html, /目标 · 模型已提供 · 与当前值一致/)
  assert.match(html, /任务范围 · 模型已提供 · 将修改/)
  assert.match(html, /任务计划 · 模型未提供 · 沿用当前值/)
  assert.match(html, /明确空文本：接受后清空此字段。/)
  assert.match(html, /明确空列表：接受后清空此字段。/)
  assert.equal((html.match(/&lt;script&gt;window.marker=1&lt;\/script&gt;/g) ?? []).length, 2)
  assert.doesNotMatch(html, /<script|<textarea|<select|contenteditable/i)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /type="(?:text|radio|number)"/)
})
test('the independent configuration checkbox starts unchecked and fresh writes fail closed', () => {
  const html = render({preview, canAccept: true})
  assert.match(html, /此处勾选只同意配置修改/)
  const checkbox = html.match(/<input\b[^>]*>/)[0]
  assert.doesNotMatch(checkbox, /\schecked=""/)
  assert.equal(disabled(button(html, '确认接受描述补丁并修改配置')), true)
  assert.equal(disabled(button(render({preview, canAccept: true}, {confirmed: true}), '确认接受描述补丁并修改配置')), false)
  assert.equal(disabled(button(render({preview, canAccept: false}, {confirmed: true, acceptanceEnabled: false}), '确认接受描述补丁并修改配置')), true)
  for (const scope of [{available: false}, {acceptanceEnabled: false}])
    assert.equal(disabled(button(render({preview, canAccept: true}, {confirmed: true, ...scope}), '确认接受描述补丁并修改配置')), true)
  assert.equal(disabled(button(render({preview, canAccept: true, busy: true}, {confirmed: true}), '确认接受描述补丁并修改配置')), true)
})
test('unknown original remains visible with capability closed and another incoming target; recovery stays explicit', () => {
  const html = render({pending: {original, unknown: true}}, {available: false, acceptanceEnabled: false, target: {...target, review_id: id(77)}})
  assert.match(html, /配置修改结果尚未确认/)
  assert.ok(html.includes(original.request_id)); assert.ok(html.includes(original.review_id)); assert.ok(html.includes(original.expected_patch_sha256))
  assert.equal(disabled(button(html, '核对原描述补丁请求')), false)
  assert.equal(disabled(button(html, '重交完全相同的描述补丁请求')), false)
  assert.doesNotMatch(html, /type="checkbox"|确认接受描述补丁并修改配置/)
  const busy = render({pending: {original, unknown: true}, busy: true}, {available: false})
  assert.equal(disabled(button(busy, '核对原描述补丁请求')), true)
  assert.equal(disabled(button(busy, '重交完全相同的描述补丁请求')), true)
})
test('readonly historical receipt keeps its original attribution without creating a pending form', () => {
  const html = render({receipt}, {target: null, available: false, acceptanceEnabled: false})
  assert.match(html, /修订 41 → 42/)
  assert.match(html, /模型提供：目标、任务范围、交付内容、完成标准/)
  assert.match(html, /实际变更：任务范围、交付内容、完成标准/)
  assert.ok(html.includes(receipt.source.review_id)); assert.ok(html.includes(receipt.request_id))
  assert.match(html, /<time\b[^>]*\sdateTime="2026-10-28T01:02:03.123Z"/)
  assert.doesNotMatch(html, /type="checkbox"|待核对的原描述补丁请求|确认接受描述补丁并修改配置/)
  assert.equal(disabled(button(html, '读取已有描述补丁回执')), false)
})
test('hidden/empty scopes render no private view and a new target cannot display the old comparison', () => {
  assert.equal(render({preview, pending: {original, unknown: true}, receipt}, {active: false}), '')
  assert.equal(render({}, {available: false, target: null}), '')
  assert.doesNotMatch(render({preview, canAccept: true}, {target: {...target, review_id: id(77)}}), /描述补丁提供字段与实际变化|type="checkbox"/)
  const api = new Proxy({}, {get() {throw Error('SSR must not invoke API')}})
  const html = renderToStaticMarkup(createElement(Panel, {api, ownerId: 'alice', target, available: true, acceptanceEnabled: true,
    active: true, onExpired: () => {throw Error('unexpected expiration')}, onAccepted: () => {throw Error('unexpected acceptance')}}))
  assert.doesNotMatch(html, /type="checkbox"|原请求编号/)
})
test('actual hook lifetime keys employee/API, retains pending and tracks the latest accepted callback', () => {
  const source = readFileSync(path.join(root, file), 'utf8'), tree = parse(source, {sourceType: 'module', plugins: ['typescript', 'jsx']})
  const nodes = (value, predicate) => {
    if (!value || typeof value !== 'object') return []
    const found = predicate(value) ? [value] : []
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(n => found.push(...nodes(n, predicate)))
    else if (child && typeof child === 'object') found.push(...nodes(child, predicate))
    return found
  }
  const calls = (value, name) => nodes(value, n => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name)
  const effects = calls(tree, 'useEffect'), controller = effects.find(effect => calls(effect.arguments[0], 'createPgNativeAgentDescriptivePatchSession').length)
  assert.deepEqual(controller.arguments[1].elements.map(n => n.name), ['api', 'ownerId', 'onExpired'])
  assert.deepEqual(calls(controller.arguments[0], 'watchPgNativeOriginalTaskController')[0].arguments.map(n => n.name), ['api', 'current'])
  const callback = effects.find(effect => nodes(effect.arguments[0], n => n.type === 'AssignmentExpression' && n.left.object?.name === 'acceptedCallback').length)
  assert.deepEqual(callback.arguments[1].elements.map(n => n.name), ['onAccepted'])
  assert.match(source, /state\.api === api && state\.ownerId === ownerId/)
  assert.match(source, /if \(!active \|\| view\.pending \|\| view\.busy \|\| !target && view\.receipt\) return/)
  assert.match(source, /consent\.context !== context\) setConsent/)
  assert.match(source, /agentDescriptivePatchCanonical\(preview\)/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|dangerouslySetInnerHTML|fee_acknowledgement|human_patch|selected_keys/)
})
