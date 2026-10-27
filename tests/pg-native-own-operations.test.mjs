import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {pathToFileURL, fileURLToPath} from 'node:url'
import {resolve, dirname} from 'node:path'
import {ownCountKeys, ownTodoQuery, ownOperationsCanonical, parseOwnOperationsJson, parseOwnOverview, parseOwnRunMeta, parseOwnTodoItem, parseOwnTodoCursor, parseOwnTodoPage, ownOriginalTodo, ownOriginalRun, createPgNativeOwnOperationsApi} from '../src/lib/pgNativeOwnOperations.ts'

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const at = '2026-10-27T01:02:03.123Z', micro = '2026-10-27T01:02:03.123456Z'
const clone = v => structuredClone(v)
const query = extra => ownTodoQuery({limit: 1, ...extra})
const run = extra => ({run_id: id(1), kind: 'agent_single', resource_id: id(10), resource_name: '资源名称', status: 'succeeded', created_at: at, updated_at: at, finished_at: at, ...extra})
const item = extra => ({category: 'approval', kind: 'agent_single', id: id(1), resource_id: id(10), resource_name: '资源名称', step_key: null, status: 'awaiting_approval', observed_at: at, ...extra})
const overview = extra => ({protocol: 'native_own_overview_v1', scope: 'current_user', as_of: at, window_days: 7, counts: Object.fromEntries(ownCountKeys.map(k => [k, 0])), recent: [run()], delegated_approvals: 'unavailable', ...extra})
const rank = {approval: 1, human_input: 2, paused: 3, effect_review: 4, schedule_overdue: 5, failed: 6}
const hashQuery = q => createHash('sha256').update(ownOperationsCanonical({category: q.category, kind: q.kind, q: q.q}), 'utf8').digest('hex')
const cursorBody = (q, row = item(), extra = {}) => ({category: q.category, kind: q.kind, query_sha256: hashQuery(q), as_of: micro, observed_at: row.observed_at.slice(0, 23) + '456Z', id: row.id, category_rank: rank[row.category], step_key: row.step_key, ...extra})
const encode = body => 'v1.' + Buffer.from(typeof body === 'string' ? body : ownOperationsCanonical(body)).toString('base64url')
const cursor = (q, row = item(), extra = {}) => encode(cursorBody(q, row, extra))
const page = (q, rows = [item()], more = false) => ({protocol: 'native_own_todos_v1', scope: 'current_user', as_of: at, category: q.category, kind: q.kind, q: q.q, limit: q.limit, items: rows, has_more: more, next_cursor: more ? cursor(q, rows.at(-1)) : null})
const bad = fn => assert.throws(fn, /invalid_own_operations_projection/)
const badAsync = fn => assert.rejects(fn, /invalid_own_operations_projection/)

test('overview preserves genuine zero and closed unavailable delegation without inventing health', () => {
  const result = parseOwnOverview(overview())
  assert.equal(result.counts.awaiting_approval, 0)
  assert.equal(result.delegated_approvals, 'unavailable')
  assert.equal(result.worker, undefined)
  assert.equal(result.recent[0].status, 'succeeded')
  assert.equal(result.pending_total, undefined)
  bad(() => parseOwnOverview({...overview(), worker: {alive: true}}))
  bad(() => parseOwnOverview({...overview(), delegated_approvals: 0}))
})
test('closed DTO rejects extra private data at every object level, malformed counts and arrays', () => {
  for (const mutate of [v => {v.owner_id = id(9)}, v => {v.counts.company_running = 1}, v => {v.recent[0].instruction = 'private'}, v => {delete v.counts.running}, v => {v.counts.running = Number.MAX_SAFE_INTEGER + 1}, v => {v.counts.running = -1}, v => {v.counts.running = -0}, v => {v.counts.running = '0'}, v => {v.counts.running = null}, v => {v.recent = Array(1)}, v => {v.recent = Array.from({length: 13}, (_, i) => run({run_id: id(i)}))}, v => {v.recent.push(clone(v.recent[0]))}]) {
    const v = overview(); mutate(v); bad(() => parseOwnOverview(v))
  }
  bad(() => parseOwnOverview(Object.assign(Object.create({}), overview())))
  const getter = overview(); Object.defineProperty(getter, 'counts', {get() {throw Error('must not execute getter')}})
  bad(() => parseOwnOverview(getter))
})
test('timestamps and lower UUID are literal canonical values with calendar validation', () => {
  for (const as_of of ['2026-02-30T01:02:03.123Z', '2026-10-27T01:02:03Z', '2026-10-27T01:02:03.123+00:00', '\ufeff' + at, '2026-10-27T24:02:03.123Z', '0000-10-27T01:02:03.123Z']) bad(() => parseOwnOverview(overview({as_of})))
  bad(() => parseOwnRunMeta(run({resource_id: 'ABCDEF00-0000-4000-8000-000000000001'})))
  bad(() => parseOwnRunMeta(run({finished_at: undefined})))
  bad(() => parseOwnRunMeta(run({resource_name: 'a'.repeat(121)})))
  assert.equal(parseOwnRunMeta(run({resource_name: '<img src=x onerror=x>'})).resource_name, '<img src=x onerror=x>')
  assert.equal(parseOwnRunMeta(run({resource_name: ''})).resource_name, '')
  assert.equal(parseOwnRunMeta(run({resource_name: '名称\t甲\u007f'})).resource_name, '名称\t甲\u007f')
})
test('all frozen supported run kinds accept stored human-input metadata; schedule combinations stay strict', () => {
  for (const kind of ['agent_single', 'agent_autonomous', 'workflow_v2', 'workflow_safe']) {
    assert.equal(parseOwnTodoItem(item({kind, category: 'human_input', status: 'awaiting_input'})).kind, kind)
    assert.equal(parseOwnRunMeta(run({kind, status: 'awaiting_input', finished_at: null})).status, 'awaiting_input')
  }
  for (const extra of [{kind: 'schedule'}, {category: 'approval', status: 'succeeded'}, {category: 'effect_review', status: 'unknown'}, {step_key: 'private'}, {category: 'schedule_overdue', status: 'overdue'}, {category: 'handoff'}, {status: 'awaiting_plan_review'}]) bad(() => parseOwnTodoItem(item(extra)))
  assert.equal(parseOwnTodoItem(item({kind: 'schedule', category: 'schedule_overdue', status: 'overdue'})).kind, 'schedule')
  assert.equal(parseOwnTodoItem(item({category: 'effect_review', status: 'started', step_key: '步骤😀'})).step_key, '步骤😀')
})
test('query is closed, bounded, trims only and permits valid empty filter intersections', () => {
  assert.deepEqual(ownTodoQuery(), {category: 'all', kind: 'all', q: '', limit: 20})
  assert.equal(query({q: '  e\u0301_%\\  '}).q, 'e\u0301_%\\')
  assert.equal(query({q: ' '.repeat(101) + '有效' + ' '.repeat(101)}).q, '有效')
  assert.equal(query({q: '甲\t乙\u007f'}).q, '甲\t乙\u007f')
  assert.equal(query({category: 'approval', kind: 'schedule'}).kind, 'schedule')
  for (const v of [{owner_id: id(9)}, {q: 'a'.repeat(101)}, {q: '\0'}, {q: '\ud800'}, {q: null}, {category: null}, {limit: '2'}, {limit: 0}, {limit: 21}, {before: 'v1.a='}, {category: 'completed'}, {kind: 'workflow'}, {page: 2}]) bad(() => ownTodoQuery(v))
})
test('ES2023 Unicode validation rejects isolated surrogates without replacing valid boundary pairs', () => {
  for (const value of ['\ud800', '\udbff', '\udc00', '\udfff', '\ud800x', 'x\udfff', '\ud800\ud800', '\udc00\ud800', '😀\udc00']) {
    bad(() => query({q: value}))
    bad(() => parseOwnRunMeta(run({resource_name: value})))
    bad(() => parseOwnTodoItem(item({category: 'effect_review', status: 'unknown', step_key: value})))
  }
  for (const value of ['\ud7ff', '\ue000', '\ufffd', '\ud800\udc00', '\udbff\udfff', '甲😀乙']) {
    assert.equal(query({q: value}).q, value)
    assert.equal(parseOwnRunMeta(run({resource_name: value})).resource_name, value)
    assert.equal(parseOwnTodoItem(item({category: 'effect_review', status: 'unknown', step_key: value})).step_key, value)
  }
})
test('raw JSON rejects duplicate/escaped keys and BOM before DTO parsing', () => {
  for (const raw of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":{"b":1,"b":2}}', '\ufeff{}', '{"a":1,}', '[1,]', 'true false', '1e9999', '{"a":undefined}']) bad(() => parseOwnOperationsJson(raw))
  assert.equal(parseOwnOperationsJson('{"a":"escaped \\\" key","nested":[true,false,null,2]}').nested[3], 2)
})
test('canonical cursor binds normalized q/category/kind and retains all six microsecond digits', async () => {
  const q = query({q: '😀_%\\'}), token = cursor(q)
  const parsed = await parseOwnTodoCursor(token, q)
  assert.equal(parsed.observed_at, micro)
  assert.equal(parsed.query_sha256, hashQuery(q))
  assert.equal(parsed.category_rank, 1)
  await badAsync(() => parseOwnTodoCursor(token, query({q: '😀_%'})))
  await badAsync(() => parseOwnTodoCursor(token, query({category: 'approval', q: q.q})))
  await badAsync(() => parseOwnTodoCursor(token, query({kind: 'agent_single', q: q.q})))
  // limit is a page bound, not part of the frozen filter digest.
  assert.equal((await parseOwnTodoCursor(token, query({q: q.q, limit: 20}))).id, id(1))
})
test('cursor refuses padding, noncanonical bytes, duplicate/private fields, invalid calendar/rank/step', async () => {
  const q = query(), valid = cursorBody(q)
  const tokens = [cursor(q) + '=', encode(JSON.stringify(valid)), encode('\ufeff' + ownOperationsCanonical(valid)), encode('{"category":"all",' + ownOperationsCanonical(valid).slice(1)), encode({...valid, instruction: 'private'}), encode({...valid, as_of: '2026-02-30T01:02:03.123456Z'}), encode({...valid, observed_at: at}), encode({...valid, category_rank: 0}), encode({...valid, step_key: ''}), encode({...valid, category_rank: 4, step_key: null}), encode({...valid, query_sha256: 'a'.repeat(64)}), 'v1._w', 'v1.' + 'a'.repeat(2046)]
  for (const token of tokens) await badAsync(() => parseOwnTodoCursor(token, q))
})
test('page echoes exact filter and bounds; malformed pages never turn into empty success', async () => {
  const q = query({category: 'approval'})
  for (const mutate of [v => {v.scope = 'company_metadata_only'}, v => {v.q = 'other'}, v => {v.kind = 'workflow_v2'}, v => {v.limit = 20}, v => {v.items[0].question = 'private'}, v => {v.items[0].category = 'failed'; v.items[0].status = 'failed'}, v => {v.has_more = 0}, v => {v.next_cursor = cursor(q)}, v => {v.total = 1}, v => {v.items = [item(), item({id: id(2)})]}]) {
    const v = page(q); mutate(v); await badAsync(() => parseOwnTodoPage(v, q))
  }
  const empty = await parseOwnTodoPage(page(query({kind: 'schedule', category: 'approval'}), []), query({kind: 'schedule', category: 'approval'}))
  assert.equal(empty.items.length, 0)
  const duplicateQ = query({limit: 2}); await badAsync(() => parseOwnTodoPage(page(duplicateQ, [item(), item()]), duplicateQ))
})
test('next cursor is exact final item and fixes server as_of without reconstructing public precision', async () => {
  const q = query(), first = page(q, [item()], true)
  assert.equal((await parseOwnTodoPage(first, q)).next_cursor, first.next_cursor)
  for (const extra of [{id: id(2)}, {category_rank: 3}, {as_of: '2026-10-27T01:02:04.123456Z'}, {observed_at: '2026-10-27T01:02:04.123456Z'}]) await badAsync(() => parseOwnTodoPage({...first, next_cursor: cursor(q, item(), extra)}, q))
  const nextQ = query({before: first.next_cursor}), second = page(nextQ, [item({id: id(0)})], true)
  assert.equal((await parseOwnTodoPage(second, nextQ)).items[0].id, id(0))
  await badAsync(() => parseOwnTodoPage({...second, next_cursor: cursor(nextQ, second.items[0], {as_of: micro.replace('456', '457')})}, nextQ))
  await badAsync(() => parseOwnTodoPage(page(nextQ, [item()], true), nextQ))
  await badAsync(() => parseOwnTodoPage({...second, as_of: '2026-10-27T02:02:03.123Z'}, nextQ))
})
test('effect-step ties retain opaque exact tuple; typed destinations contain no server href/action', async () => {
  const q = query(), row = item({category: 'effect_review', status: 'unknown', step_key: '步骤😀'})
  const token = cursor(q, row)
  assert.equal((await parseOwnTodoPage(page(q, [row], true), q)).next_cursor, token)
  assert.deepEqual(ownOriginalTodo(row), {kind: 'agent_single', runId: id(1), resourceId: id(10)})
  assert.deepEqual(ownOriginalTodo(item({category: 'schedule_overdue', kind: 'schedule', status: 'overdue'})), {kind: 'schedule', scheduleId: id(1)})
  assert.deepEqual(ownOriginalRun(run()), {kind: 'agent_single', runId: id(1), resourceId: id(10)})
  bad(() => ownOriginalTodo({...row, href: 'https://untrusted.invalid'}))
})
test('CT01-UI-UTF8-01: BMP/astral step ties follow UTF8 C order and refuse reverse/equal pages', async () => {
  for (const [astral, bmp] of [['\u{10000}', '\ue000'], ['\u{1f600}', '\ue000'], ['\u{10ffff}', '\ufffd']]) {
    assert.ok(Buffer.compare(Buffer.from(bmp), Buffer.from(astral)) < 0)
    assert.ok(bmp > astral, 'UTF16 comparison has the opposite order at this boundary')
    const q = query(), older = item({category: 'effect_review', status: 'unknown', step_key: bmp})
    const newer = {...older, step_key: astral}
    const olderQuery = query({before: cursor(q, newer)})
    const olderPage = page(olderQuery, [older], true)
    const result = await parseOwnTodoPage(olderPage, olderQuery)
    assert.equal(result.items[0].step_key, bmp)
    assert.equal(result.next_cursor, olderPage.next_cursor)
    const reverseQuery = query({before: cursor(q, older)})
    await badAsync(() => parseOwnTodoPage(page(reverseQuery, [newer], true), reverseQuery))
    await badAsync(() => parseOwnTodoPage(page(olderQuery, [newer], true), olderQuery))
  }
})
test('SDK only issues fixed same-origin private GETs with bounded query and closed returned DTOs', async () => {
  const calls = [], q = query({q: '百分号%_\\😀'})
  const api = createPgNativeOwnOperationsApi({transport: async (url, init) => {calls.push([url, init]); return new Response(JSON.stringify(url.includes('own-todos') ? page(q) : overview()), {status: 200})}})
  await api.getOwnOverview(); await api.listOwnTodos(q)
  assert.equal(calls[0][0], '/__pg_native/api/v2/own-overview')
  const actual = new URL(calls[1][0], 'https://same.invalid')
  assert.equal(actual.searchParams.get('q'), q.q)
  assert.equal(actual.searchParams.getAll('q').length, 1)
  for (const [, init] of calls) {assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.referrerPolicy, 'no-referrer'); assert.deepEqual(init.headers, {Accept: 'application/json'}); assert.equal(init.body, undefined)}
  await badAsync(() => api.listOwnTodos({...q, before: cursor(query({q: 'other'}))}))
  assert.equal(calls.length, 2)
  bad(() => createPgNativeOwnOperationsApi({rootPath: 'https://foreign.invalid'}))
})
test('SDK refuses duplicate/private success data and never propagates server debug text', async () => {
  const make = (body, status = 200) => createPgNativeOwnOperationsApi({transport: async () => new Response(body, {status})})
  await assert.rejects(make('{"scope":"current_user","scope":"current_user"}').getOwnOverview(), /invalid_own_operations_response/)
  await assert.rejects(make(JSON.stringify({...overview(), password_record: 'SECRET'})).getOwnOverview(), /invalid_own_operations_projection/)
  await assert.rejects(make('{"error":"own_overview_unavailable","message":"private SQL SECRET"}', 409).getOwnOverview(), error => error.code === 'own_operations_request_failed' && !error.message.includes('SECRET'))
  await assert.rejects(make('{"error":"own_overview_unavailable","message":"own_overview_unavailable"}', 409).getOwnOverview(), error => error.status === 409 && error.code === 'own_overview_unavailable')
  await assert.rejects(make('invalid private body', 401).getOwnOverview(), error => error.status === 401 && error.code === 'session_required')
})
test('unmounted Chinese panel syntax renders unavailable counts and no inline mutation/link', async () => {
  const ts = await import('typescript'), React = await import('react'), {renderToStaticMarkup} = await import('react-dom/server')
  const path = fileURLToPath(new URL('../src/pages/PgNativePilot/OwnOperationsPanel.tsx', import.meta.url))
  const source = readFileSync(path, 'utf8')
  const result = ts.default.transpileModule(source, {fileName: path, reportDiagnostics: true, compilerOptions: {module: ts.default.ModuleKind.ESNext, target: ts.default.ScriptTarget.ES2023, jsx: ts.default.JsxEmit.ReactJSX}})
  assert.deepEqual(result.diagnostics, [])
  const code = result.outputText.replace(/from "([^"]+)"/g, (_, target) => 'from ' + JSON.stringify(target.startsWith('.') ? pathToFileURL(resolve(dirname(path), target)).href : import.meta.resolve(target)))
  const {default: Panel} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  const api = {getOwnOverview: () => assert.fail('SSR must not read'), listOwnTodos: () => assert.fail('SSR must not read')}
  const html = renderToStaticMarkup(React.createElement(Panel, {api, employeeId: id(2), active: true, destinationBusy: true}))
  assert.match(html, /我的运行概览与待办/); assert.match(html, /计数未知/); assert.match(html, /受托审批：暂不可用/); assert.match(html, /尚未接入/)
  assert.equal((html.match(/<dd[^>]*>未知<\/dd>/g) ?? []).length, 12)
  assert.doesNotMatch(html, /<a\b|<form\b|dangerouslySetInnerHTML|>立即运行<|>批准<|>重试任务</)
  assert.match(html, /原任务正在处理/)
})
