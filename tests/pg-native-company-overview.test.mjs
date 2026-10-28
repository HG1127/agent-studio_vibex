// Pure browser transport/DTO tests. All requests use local mocks, never network.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createPgNativeCompanyOverviewApi, PgNativeCompanyOverviewError, companyOverviewEmployeeQuery,
  parsePgNativeCompanyOverview, parsePgNativeCompanyEmployeePage, parseCompanyOverviewJson,
  companyEmployeeIsActive} from '../src/lib/pgNativeCompanyOverview.ts'

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), at = '2026-10-28T01:02:03.123Z'
const counts = extra => ({agent_running: 0, workflow_running: 0, pending_approvals: 0, human_input: 0, failed_7d: 0, overdue_schedules: 0, knowledge_bases: 0, ...extra})
const row = (n = 1, extra = {}) => ({employee_id: id(n), display_name: '员工甲', is_admin: false, enabled: true, status: 'active', ...counts(), ...extra})
const overview = extra => ({protocol: 'native_company_overview_v1', scope: 'company_metadata_only', as_of: at,
  window_days: 7, totals: {employees: 205, active: 203, ...counts({agent_running: 7})}, worker: {availability: 'unavailable', reason: 'telemetry_not_installed'}, ...extra})
const page = (items = [], extra = {}) => ({protocol: 'native_company_employee_stats_v1', scope: 'company_metadata_only', as_of: at,
  limit: 20, items, has_more: false, next_after: null, ...extra})
const response = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}})
const error = (status, code) => caught => caught instanceof PgNativeCompanyOverviewError && caught.status === status && (!code || caught.code === code)
const bad = action => assert.throws(action, error(503, 'invalid_company_overview_response'))
const badAsync = action => assert.rejects(action, error(503, 'invalid_company_overview_response'))

test('only two fixed same-origin GET methods use Cookie credentials without token or owner headers', async () => {
  for (const rootPath of ['', '/__pg_native']) {
    const seen = [], transport = async (url, init) => {seen.push({url, init}); return response(url.includes('/employees?') ? page([], {limit: 2}) : overview())}
    const api = createPgNativeCompanyOverviewApi({transport, rootPath})
    assert.deepEqual(Object.keys(api).sort(), ['getCompanyOverview', 'listCompanyEmployees'])
    assert.equal(Object.isFrozen(api), true)
    assert.deepEqual(await api.getCompanyOverview(), overview())
    assert.equal((await api.listCompanyEmployees({limit: 2, after: id(9)})).limit, 2)
    assert.deepEqual(seen.map(item => item.url), [rootPath + '/api/v2/company-overview', rootPath + '/api/v2/company-overview/employees?limit=2&after=' + id(9)])
    for (const {init} of seen) {
      assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store')
      assert.deepEqual(init.headers, {Accept: 'application/json'}); assert.equal(init.body, undefined); assert.ok(init.signal instanceof AbortSignal)
    }
  }
})
test('constructor refuses arbitrary roots, credentials, owner options and accessor configuration', () => {
  let requests = 0, getter = 0
  const transport = async () => {requests++; return response(overview())}
  for (const rootPath of ['https://company.test', '//company.test', '/', '/api', '/__pg_native/', '/__pg_native?owner=x', '/__pg_native#x', 0])
    assert.throws(() => createPgNativeCompanyOverviewApi({transport, rootPath}), error(400))
  for (const value of [{ownerId: id(1)}, {token: 'PRIVATE_SENTINEL'}, {authorization: 'Bearer PRIVATE_SENTINEL'},
    {timeoutMs: 0}, {timeoutMs: 60001}, {timeoutMs: 0.5}, {transport: null}])
    assert.throws(() => createPgNativeCompanyOverviewApi({...value, ...(Object.hasOwn(value, 'transport') ? {} : {transport})}), error(400))
  const config = Object.defineProperty({}, 'rootPath', {enumerable: true, get() {getter++; return ''}})
  assert.throws(() => createPgNativeCompanyOverviewApi(config), error(400))
  assert.equal(requests, 0); assert.equal(getter, 0)
})
test('invalid page query/read options reject before transport and never select another owner', async () => {
  let requests = 0
  const api = createPgNativeCompanyOverviewApi({transport: async () => {requests++; return response(page())}})
  for (const query of [{limit: 21}, {limit: '20'}, {after: 'bad'}, {after: 'AAAAAAAA-0000-4000-8000-000000000001'},
    {owner_id: id(2)}, {employee_id: id(2)}, {admin: true}, 'limit=20&limit=1', null, []])
    await assert.rejects(() => api.listCompanyEmployees(query), error(400))
  for (const options of [{owner: id(3)}, {headers: {Authorization: 'Bearer PRIVATE_SENTINEL'}}, {signal: {aborted: false}}, null])
    await assert.rejects(() => api.getCompanyOverview(options), error(400))
  assert.equal(requests, 0)
  assert.deepEqual(companyOverviewEmployeeQuery(), {limit: 20, after: null})
})
test('duplicate JSON keys and escaped aliases are rejected before projection without prototype pollution', () => {
  for (const value of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"totals":{"active":0,"active":1}}',
    '{"items":[{"employee_id":"x","employee_\\u0069d":"y"}]}', '[1,]', '{"a":1,}', '{}{}', '\ufeff{}', '{"a":NaN}', '{"a":1e10000}',
    '"unterminated', '', '0'.repeat(131073), '['.repeat(14) + '0' + ']'.repeat(14), '[' + Array(5001).fill('0').join(',') + ']'])
    bad(() => parseCompanyOverviewJson(value))
  const record = parseCompanyOverviewJson('{"__proto__":{"polluted":true},"x":[true,false,null,"value",2]}')
  assert.equal(Object.getPrototypeOf(record), null); assert.equal(Object.prototype.polluted, undefined)
  assert.deepEqual(record.x, [true, false, null, 'value', 2])
})
test('damaged successful JSON or DTO always becomes fixed503, never successful zero', async () => {
  const wires = [new Response('not JSON'), new Response('{"protocol":"x","protocol":"native_company_overview_v1"}'),
    response(overview({totals: {...overview().totals, active: '0'}})), response(overview({totals: {...overview().totals, agent_running: 9007199254740992}})),
    response(overview({worker: {availability: 'unavailable', reason: 'telemetry_not_installed', alive: false}})),
    response(overview({email: 'PRIVATE_SENTINEL'})), response(overview({as_of: '2026-02-30T00:00:00.000Z'}))]
  for (const wire of wires) {
    const api = createPgNativeCompanyOverviewApi({transport: async () => wire})
    await badAsync(() => api.getCompanyOverview())
  }
  bad(() => parsePgNativeCompanyOverview({...overview(), totals: {...overview().totals, active: -0}}))
  bad(() => parsePgNativeCompanyEmployeePage(page([row(1, {instruction: 'PRIVATE_SENTINEL'})])))
})
test('401 and403 preserve identity/demotion status even for corrupt error bodies; server messages never escape', async () => {
  for (const status of [401, 403]) {
    for (const body of ['bad JSON PRIVATE_SENTINEL', '{"error":"SQL PRIVATE_SENTINEL"}']) {
      const api = createPgNativeCompanyOverviewApi({transport: async () => new Response(body, {status})})
      await assert.rejects(() => api.getCompanyOverview(), caught => error(status)(caught) && !caught.message.includes('PRIVATE_SENTINEL'))
    }
  }
  const api = createPgNativeCompanyOverviewApi({transport: async () => new Response('SQL PRIVATE_SENTINEL', {status: 500})})
  await assert.rejects(() => api.getCompanyOverview(), caught => error(500, 'company_overview_read_failed')(caught) && !caught.message.includes('SQL'))
})
test('transport failures are fixed unknown status0 and abort/timeout signals compose', async () => {
  const failed = createPgNativeCompanyOverviewApi({transport: async () => {throw Error('PRIVATE_SENTINEL')}})
  await assert.rejects(() => failed.getCompanyOverview(), error(0, 'company_overview_connection_unavailable'))
  const abort = new AbortController(); let delivered
  const api = createPgNativeCompanyOverviewApi({timeoutMs: 100, transport: async (_, init) => {delivered = init.signal; return response(overview())}})
  await api.getCompanyOverview({signal: abort.signal}); assert.equal(delivered.aborted, false); abort.abort(); assert.equal(delivered.aborted, true)
})
test('requested limit/after and returned next cursor are bound; duplicate, reverse and prior IDs fail', async () => {
  const query = {limit: 2, after: id(1)}
  const valid = page([row(2), row(3)], {limit: 2, has_more: true, next_after: id(3)})
  for (const value of [page([row(2)], {limit: 1}), page([row(1)], {limit: 2}), page([row(3), row(2)], {limit: 2}),
    page([row(2), row(2)], {limit: 2}), {...valid, next_after: id(4)}, {...valid, has_more: false}, {...valid, items: [row(2)]}]) {
    const api = createPgNativeCompanyOverviewApi({transport: async () => response(value)})
    await badAsync(() => api.listCompanyEmployees(query))
  }
  const api = createPgNativeCompanyOverviewApi({transport: async () => response(valid)})
  assert.deepEqual(await api.listCompanyEmployees(query), valid)
})
test('request query is detached before await and disabled subject counts remain real', async () => {
  let release, requested
  const pending = new Promise(resolve => {release = resolve}), query = {limit: 2, after: id(1)}
  const rows = [row(2, {enabled: false, agent_running: 7}), row(3, {status: 'disabled', pending_approvals: 2})]
  const api = createPgNativeCompanyOverviewApi({transport: async url => {requested = url; await pending; return response(page(rows, {limit: 2}))}})
  const work = api.listCompanyEmployees(query); query.after = id(999); query.limit = 20; release()
  const result = await work
  assert.ok(requested.endsWith('?limit=2&after=' + id(1))); assert.equal(result.items[0].agent_running, 7); assert.equal(result.items[1].pending_approvals, 2)
  assert.equal(companyEmployeeIsActive(result.items[0]), false); assert.equal(companyEmployeeIsActive(result.items[1]), false)
})
test('browser module reuses only the explicitly allowed zero-import contract and has no runtime backend dependency', () => {
  const source = readFileSync(new URL('../src/lib/pgNativeCompanyOverview.ts', import.meta.url), 'utf8')
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1])
  assert.deepEqual(imports, ['../../services/pg-api/src/company-overview-contract.ts'])
  const shared = readFileSync(new URL('../services/pg-api/src/company-overview-contract.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(shared, /^import\s/m)
  assert.doesNotMatch(source, /node:|\bBuffer\b|process\.|localStorage|sessionStorage|Bearer|X-Rh|owner_user_id/)
})
