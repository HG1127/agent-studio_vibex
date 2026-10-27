import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {ownCountKeys, ownTodoItemKey, ownOperationsCanonical, OwnOperationsError} from '../src/lib/pgNativeOwnOperations.ts'
import {createPgNativeOwnOperationsSession} from '../src/lib/pgNativeOwnOperationsSession.ts'

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), alice = id(100), bob = id(200)
const at = '2026-10-27T01:02:03.123Z', micro = '2026-10-27T01:02:03.123456Z'
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b}); return {promise, resolve, reject}}
const tick = () => new Promise(done => setImmediate(done))
const item = (n = 1, name = 'Alice 的资源') => ({category: 'approval', kind: 'agent_single', id: id(n), resource_id: id(10), resource_name: name, step_key: null, status: 'awaiting_approval', observed_at: at})
const run = (n = 1, name = 'Alice 的资源') => ({run_id: id(n), kind: 'agent_single', resource_id: id(10), resource_name: name, status: 'succeeded', created_at: at, updated_at: at, finished_at: at})
const overview = (name = 'Alice 的资源') => ({protocol: 'native_own_overview_v1', scope: 'current_user', as_of: at, window_days: 7, counts: Object.fromEntries(ownCountKeys.map(k => [k, 0])), recent: [run(1, name)], delegated_approvals: 'unavailable'})
const cursor = (q, row) => 'v1.' + Buffer.from(ownOperationsCanonical({category: q.category, kind: q.kind, query_sha256: createHash('sha256').update(ownOperationsCanonical({category: q.category, kind: q.kind, q: q.q})).digest('hex'), as_of: micro, observed_at: micro, id: row.id, category_rank: 1, step_key: null})).toString('base64url')
const page = (q, rows = [item()], more = false) => ({protocol: 'native_own_todos_v1', scope: 'current_user', as_of: at, category: q.category, kind: q.kind, q: q.q, limit: q.limit, items: rows, has_more: more, next_cursor: more ? cursor(q, rows.at(-1)) : null})
function fixture({enabled = true, debounceMs = 0} = {}) {
  const calls = [], opened = []; let expired = 0
  const api = {getOwnOverview: async options => {calls.push(['overview', options]); return overview()}, listOwnTodos: async (q, options) => {calls.push(['todos', structuredClone(q), options]); return page(q)}}
  const model = createPgNativeOwnOperationsSession(api, {employeeId: alice, debounceMs, onExpired: () => expired++, onOpenOriginal: task => opened.push(task)})
  model.setAvailability(enabled ? {own_overview_available: true, own_todos_available: true} : {})
  model.setNavigation({destinationBusy: false, onOpenOriginal: task => opened.push(task)})
  model.setActive(true)
  return {api, model, calls, opened, expired: () => expired}
}

test('missing flags default closed; metadata reads require no config/submission writes', async () => {
  const f = fixture({enabled: false})
  try {
    await f.model.refresh(); assert.equal(f.calls.length, 0); assert.equal(f.model.snapshot().overview.status, 'unavailable'); assert.equal(f.model.snapshot().todos.data, null)
    f.model.setAvailability({own_overview_available: true}); await f.model.refresh()
    assert.equal(f.calls.filter(v => v[0] === 'overview').length, 1); assert.equal(f.calls.filter(v => v[0] === 'todos').length, 0)
    assert.equal(f.model.snapshot().overview.data.counts.running, 0)
    f.model.setAvailability({own_todos_available: true}); await f.model.refresh()
    assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().todos.status, 'ready')
    assert.ok(f.calls.every(v => ['overview', 'todos'].includes(v[0])))
  } finally {f.model.dispose()}
})
test('only validated current rows open typed original targets; pending original busy blocks all navigation', async () => {
  const f = fixture()
  try {
    await f.model.refresh(); const key = ownTodoItemKey(item())
    await f.model.openTodo('not-a-row'); assert.equal(f.opened.length, 0)
    f.model.setNavigation({destinationBusy: true, onOpenOriginal: task => f.opened.push(task)})
    await f.model.openTodo(key); await f.model.openRecent(id(1)); assert.equal(f.opened.length, 0)
    f.model.setNavigation({destinationBusy: false, onOpenOriginal: task => f.opened.push(task)})
    await f.model.openTodo(key, true); assert.equal(f.opened.length, 0)
    await f.model.openTodo(key); assert.deepEqual(f.opened[0], {kind: 'agent_single', runId: id(1), resourceId: id(10)}); assert.ok(Object.isFrozen(f.opened[0]))
    await f.model.openRecent(id(1)); assert.equal(f.opened.length, 2)
    assert.equal(f.opened[0].href, undefined); assert.equal(f.opened[0].owner_id, undefined)
  } finally {f.model.dispose()}
})
test('caller mutation of snapshots cannot replace internal rows or frozen request filters', async () => {
  const f = fixture()
  try {
    f.api.listOwnTodos = async q => {assert.ok(Object.isFrozen(q)); return page(q)}
    await f.model.refresh(); const view = f.model.snapshot()
    view.todos.data.items[0].id = id(999); view.overview.data.recent[0].run_id = id(999); view.query.q = 'foreign'
    await f.model.openTodo(ownTodoItemKey(view.todos.data.items[0])); await f.model.openRecent(id(999)); assert.equal(f.opened.length, 0)
    await f.model.openTodo(ownTodoItemKey(item())); assert.equal(f.opened.length, 1); assert.equal(f.model.snapshot().query.q, '')
  } finally {f.model.dispose()}
})
test('refresh discards actionable stale data before await; errors stay unknown rather than zero', async () => {
  const f = fixture()
  try {
    await f.model.refresh(); const gate = deferred()
    f.api.getOwnOverview = () => gate.promise; f.api.listOwnTodos = async () => {throw new OwnOperationsError(0, 'offline')}
    const work = f.model.refresh()
    assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().overview.status, 'loading'); assert.equal(f.model.snapshot().canOpenRecent, false)
    gate.reject(Error('private SQL must not surface')); await work
    const view = f.model.snapshot(); assert.equal(view.overview.status, 'unknown'); assert.equal(view.overview.data, null); assert.equal(view.todos.status, 'unknown'); assert.equal(view.todos.data, null)
    assert.doesNotMatch(view.overview.error, /SQL/); assert.equal(view.canOpenTodo, false)
  } finally {f.model.dispose()}
})
test('unavailable 403/409 clears data without manufacturing successful zero counts', async () => {
  for (const code of [403, 409]) {
    const f = fixture()
    try {await f.model.refresh(); f.api.getOwnOverview = f.api.listOwnTodos = async () => {throw new OwnOperationsError(code, 'own_overview_unavailable')}; await f.model.refresh(); const view = f.model.snapshot(); assert.equal(view.overview.status, 'unavailable'); assert.equal(view.todos.status, 'unavailable'); assert.equal(view.overview.data, null); assert.equal(view.todos.data, null); assert.equal(f.expired(), 0)} finally {f.model.dispose()}
  }
})
test('malformed matching-looking success refuses whole region and never restores buttons', async () => {
  const f = fixture()
  try {
    f.api.getOwnOverview = async () => ({...overview(), counts: {...overview().counts, running: '0'}})
    f.api.listOwnTodos = async q => ({...page(q), items: [{...item(), question: 'private'}]})
    await f.model.refresh(); assert.equal(f.model.snapshot().overview.status, 'unknown'); assert.equal(f.model.snapshot().todos.status, 'unknown'); assert.equal(f.model.snapshot().canOpenTodo, false)
  } finally {f.model.dispose()}
})
test('late Alice responses after Bob identity change cannot restore Alice rows or navigation', async () => {
  const f = fixture(), oldOverview = deferred(), oldTodos = deferred()
  f.api.getOwnOverview = () => oldOverview.promise; f.api.listOwnTodos = () => oldTodos.promise
  const work = f.model.refresh()
  const bobApi = {getOwnOverview: async () => overview('Bob 的资源'), listOwnTodos: async q => page(q, [item(2, 'Bob 的资源')])}
  f.model.setIdentity({api: bobApi, employeeId: bob})
  f.model.setAvailability({own_overview_available: true, own_todos_available: true}); f.model.setActive(true)
  const opened = []; f.model.setNavigation({destinationBusy: false, onOpenOriginal: task => opened.push(task)})
  await f.model.refresh()
  oldOverview.resolve(overview()); oldTodos.resolve(page({category: 'all', kind: 'all', q: '', limit: 20})); await work
  try {
    const view = f.model.snapshot(); assert.equal(view.employeeId, bob); assert.equal(view.overview.data.recent[0].resource_name, 'Bob 的资源'); assert.equal(view.todos.data.items[0].id, id(2))
    assert.equal(f.model.matchesScope(f.api, alice), false); await f.model.openTodo(ownTodoItemKey(item())); assert.equal(opened.length, 0)
    await f.model.openTodo(ownTodoItemKey(item(2, 'Bob 的资源'))); assert.equal(opened.length, 1)
  } finally {f.model.dispose()}
})
test('same employee with replacement API is a new closed lifetime; old 401 cannot expire it', async () => {
  const f = fixture(), gate = deferred(); f.api.getOwnOverview = () => gate.promise
  const old = f.model.refreshOverview(), nextApi = {getOwnOverview: async () => overview('新接口'), listOwnTodos: async q => page(q, [])}
  f.model.setIdentity({api: nextApi, employeeId: alice}); assert.equal(f.model.snapshot().active, false)
  f.model.setActive(true); await f.model.refresh(); assert.equal(f.model.snapshot().overview.status, 'unavailable')
  f.model.setAvailability({own_overview_available: true}); await f.model.refreshOverview()
  gate.reject(new OwnOperationsError(401, 'session_required')); await old
  try {assert.equal(f.expired(), 0); assert.equal(f.model.snapshot().overview.data.recent[0].resource_name, '新接口'); assert.equal(f.model.snapshot().canOpenRecent, false)} finally {f.model.dispose()}
})
test('401 from superseded same-owner read expires once and clears all projections', async () => {
  const f = fixture(), gate = deferred(); f.api.getOwnOverview = () => gate.promise
  const old = f.model.refreshOverview(); f.api.getOwnOverview = async () => overview(); await f.model.refresh()
  gate.reject(new OwnOperationsError(401, 'session_required')); await old
  assert.equal(f.expired(), 1); assert.equal(f.model.snapshot().active, false); assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().todos.data, null); assert.match(f.model.snapshot().overview.error, /登录已失效/)
  await f.model.refresh(); assert.equal(f.expired(), 1)
})
test('dispose and active/capability closure abort pending reads and deny late data', async () => {
  for (const close of [m => m.dispose(), m => m.setActive(false), m => m.setAvailability({})]) {
    const f = fixture(), gate = deferred(); f.api.listOwnTodos = (q, options) => {f.calls.push(['held', q, options]); return gate.promise}
    const work = f.model.refreshTodos(); const held = f.calls.at(-1)
    close(f.model); assert.equal(held[2].signal.aborted, true)
    gate.resolve(page(held[1])); await work
    assert.equal(f.model.snapshot().todos.data, null); assert.equal(f.model.snapshot().canOpenTodo, false); f.model.dispose()
  }
})
test('search debounce resets cursor immediately and cannot revive old filtered response', async () => {
  const f = fixture({debounceMs: 0}), gate = deferred()
  try {
    await f.model.refresh(); f.model.setFilters({q: '第一次'}); await new Promise(done => setTimeout(done, 1)); await tick()
    f.api.listOwnTodos = (q, options) => {f.calls.push(['held', structuredClone(q), options]); return gate.promise}
    const old = f.model.refreshTodos(), oldQuery = f.calls.at(-1)[1]
    f.model.setFilters({q: '  第二次_%\\😀  ', category: 'all', kind: 'all', limit: 20})
    assert.equal(f.model.snapshot().todos.data, null); assert.equal(f.model.snapshot().searchPending, true); assert.equal(f.model.snapshot().canOpenTodo, false); assert.equal(f.model.snapshot().query.before, undefined)
    f.api.listOwnTodos = async q => {f.calls.push(['new', structuredClone(q)]); return page(q, [item(9, '第二次_%\\😀')])}
    gate.resolve(page(oldQuery)); await old; await new Promise(done => setTimeout(done, 2)); await tick()
    assert.equal(f.model.snapshot().query.q, '第二次_%\\😀'); assert.equal(f.model.snapshot().todos.data.q, '第二次_%\\😀'); assert.equal(f.model.snapshot().todos.data.items[0].id, id(9))
    assert.equal(f.calls.filter(v => v[0] === 'new').length, 1)
  } finally {f.model.dispose()}
})
test('invalid query rejects without truncation or falling back to previously valid search', async () => {
  const f = fixture()
  try {
    await f.model.refresh(); const count = f.calls.length
    f.model.setFilters({q: 'a'.repeat(101)})
    assert.equal(f.model.snapshot().filtersValid, false); assert.equal(f.model.snapshot().todos.data, null)
    await f.model.refreshTodos(); assert.equal(f.calls.length, count)
    f.model.setFilters({q: '有效', category: 'all', kind: 'all'}); await new Promise(done => setTimeout(done, 1)); await tick()
    assert.equal(f.model.snapshot().filtersValid, true); assert.equal(f.model.snapshot().todos.data.q, '有效')
  } finally {f.model.dispose()}
})
test('single bounded next page replaces current page; refresh resets to first without scan or append', async () => {
  const f = fixture()
  try {
    f.model.setFilters({limit: 2}); await tick(); f.calls.length = 0
    f.api.listOwnTodos = async q => {f.calls.push(['bounded', structuredClone(q)]); return q.before ? page(q, [item(1)], false) : page(q, [item(3), item(2)], true)}
    await f.model.refreshTodos(); const first = f.model.snapshot().todos.data.next_cursor
    await f.model.nextPage(); const view = f.model.snapshot()
    assert.deepEqual(view.todos.data.items.map(r => r.id), [id(1)]); assert.equal(view.query.before, first); assert.equal(f.calls.length, 2)
    await f.model.nextPage(); assert.equal(f.calls.length, 2)
    await f.model.refreshTodos(); assert.equal(f.model.snapshot().query.before, undefined); assert.equal(f.calls.length, 3); assert.deepEqual(f.model.snapshot().todos.data.items.map(r => r.id), [id(3), id(2)])
    f.model.setFilters({category: 'approval', limit: 2}); assert.equal(f.model.snapshot().query.before, undefined)
  } finally {f.model.dispose()}
})
test('filter mismatch and invalid next cursor do not publish rows or issue a followup scan', async () => {
  const f = fixture()
  try {
    f.api.listOwnTodos = async q => ({...page(q), q: 'foreign-filter'})
    await f.model.refreshTodos(); assert.equal(f.model.snapshot().todos.status, 'unknown')
    await f.model.nextPage(); assert.equal(f.model.snapshot().todos.data, null)
    f.api.listOwnTodos = async q => ({...page(q), has_more: true, next_cursor: 'v1.bad'})
    await f.model.refreshTodos(); assert.equal(f.model.snapshot().canOpenTodo, false)
  } finally {f.model.dispose()}
})
test('navigation callback is single-flight and observer rejection cannot expose another employee', async () => {
  const f = fixture(), gate = deferred(); let opened = 0
  try {
    await f.model.refresh(); f.model.setNavigation({destinationBusy: false, onOpenOriginal: () => {opened++; return gate.promise}})
    const work = f.model.openTodo(ownTodoItemKey(item()))
    await f.model.openRecent(id(1)); assert.equal(opened, 1); assert.equal(f.model.snapshot().canOpenTodo, false)
    f.model.setIdentity({api: f.api, employeeId: bob}); gate.reject(Error('old private detail')); await work
    assert.equal(f.model.snapshot().employeeId, bob); assert.equal(f.model.snapshot().navigationError, ''); assert.equal(f.model.snapshot().opening, false)
  } finally {gate.resolve(); f.model.dispose()}
})
test('dispose or capability closure cancels debounced discovery before any API call', async () => {
  for (const close of [m => m.dispose(), m => m.setAvailability({})]) {
  const f = fixture({debounceMs: 5})
  try {
    f.model.setFilters({q: '资源'}); assert.equal(f.model.snapshot().searchPending, true)
    close(f.model); await new Promise(done => setTimeout(done, 10))
    assert.equal(f.calls.length, 0); assert.equal(f.model.snapshot().todos.data, null)
  } finally {f.model.dispose()}
  }
})
