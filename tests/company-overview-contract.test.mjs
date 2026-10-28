import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {
  CompanyOverviewContractError, companyOperationalCountKeys, companyTotalCountKeys,
  companyCount, companyDatabaseCount, parseCompanyTotals, parseCompanyWorkerHealth,
  normalizeCompanyDisplayName, parseCompanyEmployeeItem, companyEmployeeIsActive,
  parseCompanyOverviewQuery, parseCompanyEmployeeQuery, parseCompanyOverviewUrl,
  parseCompanyOverview, parseCompanyEmployeePage,
} from '../services/pg-api/src/company-overview-contract.ts'

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const at = '2026-10-28T01:02:03.123Z'
const counts = extra => ({agent_running: 0, workflow_running: 0, pending_approvals: 0,
  human_input: 0, failed_7d: 0, overdue_schedules: 0, knowledge_bases: 0, ...extra})
const employee = (n = 1, extra = {}) => ({employee_id: id(n), display_name: '员工甲',
  is_admin: false, enabled: true, status: 'active', ...counts(), ...extra})
const overview = extra => ({protocol: 'native_company_overview_v1', scope: 'company_metadata_only',
  as_of: at, window_days: 7, totals: {employees: 205, active: 203, ...counts()},
  worker: {availability: 'unavailable', reason: 'telemetry_not_installed'}, ...extra})
const page = (rows = [], extra = {}) => ({protocol: 'native_company_employee_stats_v1',
  scope: 'company_metadata_only', as_of: at, limit: 20, items: rows,
  has_more: false, next_after: null, ...extra})
const bad = fn => assert.throws(fn, error => error instanceof CompanyOverviewContractError &&
  error.status === 409 && error.code === 'invalid_company_overview_projection')
const badQuery = fn => assert.throws(fn, error => error instanceof CompanyOverviewContractError &&
  error.status === 400 && /^invalid_company_(?:employee|overview)_query$/.test(error.code))

test('only the two proposed read routes and canonical employee queries decode', () => {
  assert.deepEqual(parseCompanyOverviewUrl('/api/v2/company-overview'), {route: 'overview'})
  assert.deepEqual(parseCompanyOverviewQuery(), {})
  assert.deepEqual(parseCompanyOverviewUrl('/api/v2/company-overview/employees'),
    {route: 'employees', query: {limit: 20, after: null}})
  for (const limit of [1, 9, 10, 19, 20]) {
    assert.deepEqual(parseCompanyOverviewUrl('/api/v2/company-overview/employees?after=' + id(3) + '&limit=' + limit),
      {route: 'employees', query: {limit, after: id(3)}})
  }
  for (const suffix of ['?', '?limit=', '?after=', '?limit=0', '?limit=21', '?limit=01', '?limit=+1',
    '?limit=1.0', '?limit=1e1', '?limit=%32', '?limit=1&limit=2', '?after=' + id(1) + '&after=' + id(2),
    '?limit=1&', '?limit=1&&after=' + id(1), '?owner_id=' + id(1), '?admin=true', '?%6cimit=2',
    '?after=%30' + id(1).slice(1), '?after=aaaaaaaa-AAAA-4000-8000-000000000001', '?after=null']) {
    badQuery(() => parseCompanyOverviewUrl('/api/v2/company-overview/employees' + suffix))
  }
  for (const value of ['/api/v2/company-overview?', '/api/v2/company-overview?limit=1',
    '/api/v2/company-overview/', '/api/v2/company-overview/employees/', '/api/v2/company-overview#x',
    'https://example.test/api/v2/company-overview', '/api/v2/company-overview\n',
    '/api/v2/company-overview/员工', 'x'.repeat(257), null, {}]) badQuery(() => parseCompanyOverviewUrl(value))
})

test('typed query objects are closed and default only absent values', () => {
  assert.deepEqual(parseCompanyEmployeeQuery(Object.create(null)), {limit: 20, after: null})
  assert.deepEqual(parseCompanyEmployeeQuery({limit: 1, after: id(9)}), {limit: 1, after: id(9)})
  for (const value of [null, [], {limit: '20'}, {limit: undefined}, {after: undefined}, {limit: -0},
    {limit: 1.5}, {limit: 21}, {limit: NaN}, {after: ''}, {after: id(1).toUpperCase().replace('4000', 'A000')},
    {employee_id: id(1)}, {actor: id(1)}, {is_admin: true}]) badQuery(() => parseCompanyEmployeeQuery(value))
  for (const value of [null, [], {limit: 20}, {owner_id: id(2)}, {is_admin: true}]) badQuery(() => parseCompanyOverviewQuery(value))
})

test('public and database counts preserve zero and the safe maximum without coercion or rounding', () => {
  assert.equal(Object.isFrozen(companyOperationalCountKeys), true)
  assert.equal(Object.isFrozen(companyTotalCountKeys), true)
  for (const value of [0, 1, Number.MAX_SAFE_INTEGER]) {
    assert.equal(companyCount(value), value)
    assert.equal(companyDatabaseCount(String(value)), value)
  }
  for (const value of [-0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', null, undefined, true, 1n]) bad(() => companyCount(value))
  for (const value of ['', '00', '01', '-0', '-1', ' 0', '0 ', '+1', '1.0', '1e2',
    '9007199254740992', '999999999999999999999999999999999999', 0, 1n, null]) bad(() => companyDatabaseCount(value))
  const result = parseCompanyTotals({employees: 1, active: 1, ...counts({agent_running: Number.MAX_SAFE_INTEGER})})
  assert.equal(result.agent_running, Number.MAX_SAFE_INTEGER) // Runs are not bounded by employee count.
  bad(() => parseCompanyTotals({employees: 1, active: 2, ...counts()}))
  for (const key of companyTotalCountKeys) {
    for (const value of [null, undefined, '0', -1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1])
      bad(() => parseCompanyTotals({...overview().totals, [key]: value}))
    const missing = {...overview().totals}; delete missing[key]
    bad(() => parseCompanyTotals(missing))
  }
})

test('overview uses canonical protocol, scope, date and fixed seven-day window', () => {
  assert.deepEqual(parseCompanyOverview(overview()), overview())
  for (const value of ['2026-02-30T01:02:03.123Z', '2026-10-28T01:02:03Z',
    '2026-10-28T01:02:03.123456Z', '2026-10-28T09:02:03.123+08:00',
    '0000-01-01T00:00:00.000Z', '2026-13-28T01:02:03.123Z', at + ' ', 0, null]) {
    bad(() => parseCompanyOverview(overview({as_of: value})))
    bad(() => parseCompanyEmployeePage(page([], {as_of: value})))
  }
  for (const extra of [{protocol: 'native_company_overview_v2'}, {scope: 'current_user'},
    {window_days: '7'}, {window_days: 30}]) bad(() => parseCompanyOverview(overview(extra)))
})

test('privacy rejection covers extra metadata and bodies at every DTO level', () => {
  const forbidden = ['owner_id', 'actor_id', 'client_owner', 'email', 'password_record', 'session', 'token',
    'instruction', 'prompt', 'checkpoint', 'payload', 'result', 'question', 'run_id', 'resource_id',
    'lease_owner', 'lease_token', 'hostname', 'pid', 'queue', 'employees']
  for (const key of forbidden) {
    bad(() => parseCompanyOverview(overview({[key]: 'PRIVATE_SENTINEL'})))
    bad(() => parseCompanyOverview(overview({totals: {...overview().totals, [key]: 'PRIVATE_SENTINEL'}})))
    bad(() => parseCompanyEmployeeItem(employee(1, {[key]: 'PRIVATE_SENTINEL'})))
    bad(() => parseCompanyEmployeePage(page([], {[key]: 'PRIVATE_SENTINEL'})))
  }
  const input = overview({instruction: 'PRIVATE_SENTINEL'})
  assert.throws(() => parseCompanyOverview(input), error => !error.message.includes('PRIVATE_SENTINEL'))
  for (const key of ['protocol', 'scope', 'as_of', 'window_days', 'totals', 'worker']) {
    const value = overview(); delete value[key]; bad(() => parseCompanyOverview(value))
  }
})

test('worker accepts only truthful unavailable and rejects inferred liveness even with zero values', () => {
  assert.deepEqual(parseCompanyWorkerHealth(overview().worker), overview().worker)
  for (const extra of [{alive: true}, {alive: false}, {configured: false}, {age_ms: 0}, {last_seen: at},
    {healthy: true}, {instances: []}, {heartbeat: null}]) {
    bad(() => parseCompanyOverview(overview({worker: {...overview().worker, ...extra}})))
  }
  for (const value of [null, {}, {availability: 'fresh', reason: 'telemetry_not_installed'},
    {availability: 'unavailable', reason: 'api_healthy'}, {availability: 'unavailable'}]) bad(() => parseCompanyWorkerHealth(value))
})

test('disabled subject combinations retain actual counts without granting caller authority', () => {
  for (const enabled of [false, true]) for (const status of ['active', 'disabled']) {
    const input = employee(1, {enabled, status, is_admin: true, agent_running: 4, pending_approvals: 2})
    const output = parseCompanyEmployeeItem(input)
    assert.deepEqual(output, input)
    assert.equal(companyEmployeeIsActive(output), enabled && status === 'active')
    assert.equal(output.agent_running, 4)
    assert.equal(output.pending_approvals, 2)
  }
  for (const extra of [{enabled: 'false'}, {enabled: 0}, {is_admin: 1}, {is_admin: null},
    {status: 'inactive'}, {status: false}]) bad(() => parseCompanyEmployeeItem(employee(1, extra)))
  for (const key of companyOperationalCountKeys) {
    bad(() => parseCompanyEmployeeItem(employee(1, {[key]: '0'})))
    bad(() => parseCompanyEmployeeItem(employee(1, {[key]: Number.MAX_SAFE_INTEGER + 1})))
  }
})

test('display normalization is explicit and DTO decoding never truncates or falls back to email', () => {
  assert.equal(normalizeCompanyDisplayName(' \t '), '员工')
  assert.equal(normalizeCompanyDisplayName('  员工甲  '), '员工甲')
  assert.equal(normalizeCompanyDisplayName('😀'.repeat(101)), '😀'.repeat(100))
  assert.equal(normalizeCompanyDisplayName('a'.repeat(199) + '😀'), 'a'.repeat(199))
  const truncated = normalizeCompanyDisplayName('a'.repeat(199) + ' b')
  assert.equal(parseCompanyEmployeeItem(employee(1, {display_name: truncated})).display_name, 'a'.repeat(199))
  for (const name of ['', ' ', ' 员工', '员工 ', 'a'.repeat(201), '\ud800', '\udfff', '员工\0'])
    bad(() => parseCompanyEmployeeItem(employee(1, {display_name: name})))
  for (const name of [null, 1, '\ud800', '员工\0']) bad(() => normalizeCompanyDisplayName(name))
  assert.equal(parseCompanyEmployeeItem(employee(1, {display_name: '😀'.repeat(100)})).display_name.length, 200)
})

test('205-staff DTO fixture pages independently from the all-company total', () => {
  const all = Array.from({length: 205}, (_, index) => employee(index + 1,
    index === 203 ? {enabled: false, agent_running: 7} : index === 204 ? {status: 'disabled', workflow_running: 3} : {}))
  const total = parseCompanyOverview(overview({totals: {employees: 205, active: 203, ...counts({agent_running: 7, workflow_running: 3})}}))
  const seen = [], pages = []
  let after = null
  for (let offset = 0; offset < all.length; offset += 20) {
    const rows = all.slice(offset, offset + 20), has_more = offset + 20 < all.length
    const parsed = parseCompanyEmployeePage(page(rows, {has_more, next_after: has_more ? rows.at(-1).employee_id : null}), {limit: 20, after})
    pages.push(parsed); seen.push(...parsed.items.map(row => row.employee_id)); after = parsed.next_after
  }
  assert.equal(pages.length, 11)
  assert.equal(pages[0].items.length, 20)
  assert.equal(pages.at(-1).items.length, 5)
  assert.equal(new Set(seen).size, 205)
  assert.deepEqual(seen, all.map(row => row.employee_id))
  assert.equal(total.totals.employees, 205)
  assert.notEqual(total.totals.employees, pages[0].items.length)
  assert.equal(pages.at(-1).items.at(-2).agent_running, 7)
  assert.equal(pages.at(-1).items.at(-1).workflow_running, 3)
  assert.equal(companyEmployeeIsActive(pages.at(-1).items.at(-1)), false)
  // This fixture proves decoder behavior only; SQL population/authorization remain untested.
})

test('employee page binds limit and strictly increasing UUIDs to the requested cursor', () => {
  const q = {limit: 2, after: id(1)}, rows = [employee(2), employee(3)]
  assert.equal(parseCompanyEmployeePage(page(rows, {limit: 2, has_more: true, next_after: id(3)}), q).next_after, id(3))
  for (const badRows of [[employee(3), employee(2)], [employee(2), employee(2)],
    [employee(1), employee(2)], [employee(0)], [employee(2), employee(3), employee(4)]])
    bad(() => parseCompanyEmployeePage(page(badRows, {limit: 2}), q))
  for (const extra of [{limit: 1}, {limit: '2'}, {has_more: 'false'}, {next_after: id(3)},
    {has_more: true, next_after: id(4)}, {has_more: true, next_after: null}])
    bad(() => parseCompanyEmployeePage(page(rows, {limit: 2, ...extra}), q))
  for (const badRows of [[], [employee(2)]])
    bad(() => parseCompanyEmployeePage(page(badRows, {limit: 2, has_more: true, next_after: id(2)}), q))
  assert.deepEqual(parseCompanyEmployeePage(page([], {limit: 2}), q).items, [])
  assert.equal(parseCompanyEmployeePage(page(rows, {limit: 2, as_of: '2026-10-28T01:02:04.000Z'}), q).as_of,
    '2026-10-28T01:02:04.000Z') // Different HTTP pages do not promise one historical snapshot.
})

test('employee pages reject wrong protocols, IDs, extra keys and missing metadata', () => {
  for (const extra of [{protocol: 'native_company_employee_stats_v2'}, {scope: 'current_user'},
    {items: null}, {items: {}}, {items: Array.from({length: 21}, (_, n) => employee(n + 1))}]) bad(() => parseCompanyEmployeePage(page([], extra)))
  for (const value of ['AAAAAAAA-0000-4000-8000-000000000001', ' ' + id(1), id(1) + ' ', 'invalid', null])
    bad(() => parseCompanyEmployeeItem(employee(1, {employee_id: value})))
  for (const key of Object.keys(employee())) {
    const item = employee(); delete item[key]; bad(() => parseCompanyEmployeeItem(item))
  }
  for (const key of Object.keys(page())) {
    const input = page(); delete input[key]; bad(() => parseCompanyEmployeePage(input))
  }
})

test('plain dense data rejects getters, symbols, hidden fields and inherited records without executing them', () => {
  let reads = 0
  const accessor = overview()
  Object.defineProperty(accessor, 'totals', {enumerable: true, get() {reads++; throw Error('PRIVATE_SENTINEL')}})
  bad(() => parseCompanyOverview(accessor))
  const query = Object.defineProperty({}, 'limit', {enumerable: true, get() {reads++; return 1}})
  badQuery(() => parseCompanyEmployeeQuery(query))
  for (const input of [Object.assign(Object.create({secret: true}), overview()),
    Object.defineProperty(overview(), 'private', {value: true}),
    Object.assign(overview(), {[Symbol('private')]: true})]) bad(() => parseCompanyOverview(input))
  const sparse = new Array(1), getter = [employee()], hidden = [employee()], tagged = [employee()]
  Object.defineProperty(getter, '0', {enumerable: true, get() {reads++; return employee()}})
  Object.defineProperty(hidden, '0', {value: employee(), enumerable: false})
  tagged.private = 'PRIVATE_SENTINEL'
  for (const items of [sparse, getter, hidden, tagged]) bad(() => parseCompanyEmployeePage(page(items)))
  assert.equal(reads, 0)
  assert.deepEqual(parseCompanyOverview(Object.assign(Object.create(null), overview())), overview())
})

test('decoded metadata is detached and does not mutate or retain the input records', () => {
  const input = overview(), inputPage = page([employee()])
  const before = structuredClone(input), beforePage = structuredClone(inputPage)
  const result = parseCompanyOverview(input), resultPage = parseCompanyEmployeePage(inputPage)
  assert.deepEqual(input, before); assert.deepEqual(inputPage, beforePage)
  input.totals.agent_running = 100; input.worker.reason = 'changed'
  inputPage.items[0].display_name = 'changed'; inputPage.items.push(employee(2))
  assert.deepEqual(result, before); assert.deepEqual(resultPage, beforePage)
})

test('the pure contract executes with browser globals and no process, Buffer, require or network', () => {
  const source = readFileSync(new URL('../services/pg-api/src/company-overview-contract.ts', import.meta.url), 'utf8')
  const script = stripTypeScriptTypes(source).replace(/^export (?=(?:class|const|function)\b)/gm, '')
  const result = runInNewContext(script + '\nJSON.stringify({overview:parseCompanyOverview(' + JSON.stringify(overview()) +
    '), query:parseCompanyOverviewUrl("/api/v2/company-overview/employees?limit=2")})', {
    process: undefined, Buffer: undefined, require: undefined,
    fetch() {throw Error('network_not_allowed')},
  }, {timeout: 1000})
  assert.deepEqual(JSON.parse(result), {overview: overview(), query: {route: 'employees', query: {limit: 2, after: null}}})
})
