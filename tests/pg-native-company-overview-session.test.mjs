import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeCompanyOverviewSession} from '../src/lib/pgNativeCompanyOverviewSession.ts'
import {PgNativeCompanyOverviewError} from '../src/lib/pgNativeCompanyOverview.ts'

const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), at = '2026-10-28T01:02:03.123Z'
const counts = extra => ({agent_running: 0, workflow_running: 0, pending_approvals: 0, human_input: 0, failed_7d: 0, overdue_schedules: 0, knowledge_bases: 0, ...extra})
const row = (n = 1, extra = {}) => ({employee_id: id(n), display_name: '员工甲', is_admin: false, enabled: true, status: 'active', ...counts(), ...extra})
const overview = extra => ({protocol: 'native_company_overview_v1', scope: 'company_metadata_only', as_of: at, window_days: 7,
  totals: {employees: 205, active: 203, ...counts({agent_running: 7})}, worker: {availability: 'unavailable', reason: 'telemetry_not_installed'}, ...extra})
const page = (query = {limit: 20, after: null}, extra = {}) => ({protocol: 'native_company_employee_stats_v1', scope: 'company_metadata_only', as_of: at,
  limit: query.limit, items: [row(1)], has_more: false, next_after: null, ...extra})
function deferred() {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b}); return {promise, resolve, reject}}
const fault = status => new PgNativeCompanyOverviewError(status, 'SQL_PRIVATE_SENTINEL')
function fixture({activate = true, admin = true, available = true} = {}) {
  let expired = 0
  const calls = [], api = {
    getCompanyOverview: async options => {calls.push(['overview', options]); return overview()},
    listCompanyEmployees: async (query, options) => {calls.push(['employees', query, options]); return page(query)},
  }
  const model = createPgNativeCompanyOverviewSession(api, {employeeId: id(100), onExpired: () => expired++})
  model.setAvailability({currentAdmin: admin, company_overview_available: available}); model.setActive(activate)
  return {api, model, calls, expired: () => expired}
}

test('admin/capability/active flags are cold UI prerequisites and alone issue no request', async () => {
  for (const values of [{activate: false}, {admin: false}, {available: false}]) {
    const f = fixture(values)
    try {await f.model.refresh(); await f.model.nextPage(); assert.equal(f.calls.length, 0); assert.equal(f.model.snapshot().overview.data, null)} finally {f.model.dispose()}
  }
  const f = fixture(); assert.equal(f.calls.length, 0); f.model.dispose()
})
test('global totals stay independent of the current employee page with disabled subject counts and unknown Worker', async () => {
  const f = fixture()
  try {f.api.listCompanyEmployees = async query => page(query, {items: [row(1, {enabled: false, agent_running: 7}), row(2, {status: 'disabled', pending_approvals: 3})]})
    await f.model.refresh(); const view = f.model.snapshot()
    assert.equal(view.overview.data.totals.employees, 205); assert.equal(view.employees.data.items.length, 2)
    assert.equal(view.employees.data.items[0].agent_running, 7); assert.equal(view.employees.data.items[1].pending_approvals, 3)
    assert.deepEqual(view.overview.data.worker, {availability: 'unavailable', reason: 'telemetry_not_installed'})
  } finally {f.model.dispose()}
})
test('nextPage uses only the validated current page cursor and cannot be rewritten by a public snapshot', async () => {
  const f = fixture()
  try {f.model.setPageSize(2); f.api.listCompanyEmployees = async (query, options) => {
      f.calls.push(['employees', query, options]); return page(query, query.after ? {items: [row(3)]} : {items: [row(1), row(2)], has_more: true, next_after: id(2)})}
    await f.model.refresh(); const view = f.model.snapshot(); view.employees.data.next_after = id(999); view.overview.data.totals.employees = 2
    await f.model.nextPage(); assert.deepEqual(f.calls.filter(c => c[0] === 'employees').map(c => c[1]), [{limit: 2, after: null}, {limit: 2, after: id(2)}])
    assert.equal(f.model.snapshot().overview.data.totals.employees, 205); assert.equal(f.model.snapshot().canNextPage, false)
    await f.model.nextPage(); assert.equal(f.calls.filter(c => c[0] === 'employees').length, 2)
  } finally {f.model.dispose()}
})
test('malformed cursor page or forged metadata clears that region instead of zero-filling', async () => {
  const f = fixture()
  try {await f.model.refresh(); f.api.getCompanyOverview = async () => overview({worker: {availability: 'unavailable', reason: 'telemetry_not_installed', alive: false}})
    f.api.listCompanyEmployees = async query => page(query, {items: [row(1, {email: 'PRIVATE_SENTINEL'})]})
    await f.model.refresh(); assert.equal(f.model.snapshot().overview.status, 'unknown'); assert.equal(f.model.snapshot().overview.data, null)
    assert.equal(f.model.snapshot().employees.status, 'unknown'); assert.equal(f.model.snapshot().employees.data, null); assert.equal(f.model.snapshot().canNextPage, false)
  } finally {f.model.dispose()}
})
test('page-size changes reset only employee cursor and invalid input cannot issue reads', async () => {
  const f = fixture()
  try {await f.model.refresh(); f.model.setPageSize(21); await f.model.refreshEmployees(); assert.equal(f.model.snapshot().queryValid, false)
    assert.equal(f.model.snapshot().overview.data.totals.employees, 205); assert.equal(f.calls.filter(c => c[0] === 'employees').length, 1)
    f.model.setPageSize(1); await f.model.refreshEmployees(); assert.equal(f.model.snapshot().query.limit, 1); assert.equal(f.model.snapshot().query.after, null)
  } finally {f.model.dispose()}
})
test('current403 clears both Company regions and aborts sibling read without expiring the personal session', async () => {
  for (const side of ['overview', 'employees']) {
    const f = fixture(), a = deferred(), b = deferred(); let overviewSignal, employeeSignal
    try {await f.model.refresh()
      f.api.getCompanyOverview = options => {overviewSignal = options.signal; return a.promise}
      f.api.listCompanyEmployees = (_, options) => {employeeSignal = options.signal; return b.promise}
      const work = f.model.refresh(); if (side === 'overview') a.reject(fault(403)); else b.reject(fault(403))
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(overviewSignal.aborted, true); assert.equal(employeeSignal.aborted, true); assert.equal(f.model.snapshot().forbidden, true)
      if (side === 'overview') b.resolve(page()); else a.resolve(overview())
      await work; const view = f.model.snapshot(); assert.equal(view.overview.data, null); assert.equal(view.employees.data, null)
      assert.equal(view.available, false); assert.equal(f.expired(), 0); assert.equal(f.model.matchesScope(f.api, id(100)), true)
      f.model.setAvailability({currentAdmin: true, company_overview_available: true}); await f.model.refresh(); assert.equal(f.model.snapshot().forbidden, true)
    } finally {a.resolve(overview()); b.resolve(page()); f.model.dispose()}
  }
})
test('a fresh false-to-true UI access update may retry after403 but still proves no backend admin authority', async () => {
  const f = fixture()
  try {f.api.getCompanyOverview = async () => {throw fault(403)}; await f.model.refresh(); assert.equal(f.model.snapshot().forbidden, true)
    f.model.setAvailability({currentAdmin: false, company_overview_available: true}); f.model.setAvailability({currentAdmin: true, company_overview_available: true})
    f.api.getCompanyOverview = async () => overview(); await f.model.refresh(); assert.equal(f.model.snapshot().forbidden, false); assert.equal(f.model.snapshot().overview.status, 'ready')
  } finally {f.model.dispose()}
})
test('capability or admin closure clears data immediately and fences late successful reads', async () => {
  for (const hint of [{currentAdmin: false, company_overview_available: true}, {currentAdmin: true, company_overview_available: false}]) {
    const f = fixture(), a = deferred(), b = deferred()
    try {await f.model.refresh(); f.api.getCompanyOverview = () => a.promise; f.api.listCompanyEmployees = () => b.promise
      const work = f.model.refresh(); f.model.setAvailability(hint); assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().employees.data, null)
      a.resolve(overview()); b.resolve(page()); await work; assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().employees.data, null)
      assert.equal(f.expired(), 0)
    } finally {a.resolve(overview()); b.resolve(page()); f.model.dispose()}
  }
})
test('hide/reopen clears Company data and old reads cannot restore it without explicit refresh', async () => {
  const f = fixture(), gate = deferred()
  try {await f.model.refresh(); f.api.getCompanyOverview = () => gate.promise; const work = f.model.refreshOverview()
    f.model.setActive(false); assert.equal(f.model.snapshot().overview.data, null); f.model.setActive(true); gate.resolve(overview()); await work
    assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().overview.status, 'unknown')
  } finally {gate.resolve(overview()); f.model.dispose()}
})
test('401 disposes both projections and calls expiration once even if the observer throws', async () => {
  const f = fixture()
  try {await f.model.refresh(); f.api.getCompanyOverview = f.api.listCompanyEmployees = async () => {throw fault(401)}
    await f.model.refresh(); await f.model.refresh(); assert.equal(f.expired(), 1); assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().employees.data, null)
    assert.equal(f.model.matchesScope(f.api, id(100)), false)
  } finally {f.model.dispose()}
  const model = createPgNativeCompanyOverviewSession({getCompanyOverview: async () => {throw fault(401)}, listCompanyEmployees: async () => {throw fault(401)}},
    {employeeId: id(100), onExpired: () => {throw Error('observer')}})
  model.setActive(true); model.setAvailability({currentAdmin: true, company_overview_available: true}); await model.refresh(); assert.equal(model.snapshot().overview.data, null)
  const asyncObserver = createPgNativeCompanyOverviewSession({getCompanyOverview: async () => {throw fault(401)}, listCompanyEmployees: async () => page()},
    {employeeId: id(100), onExpired: async () => {throw Error('async observer')}})
  asyncObserver.setActive(true); asyncObserver.setAvailability({currentAdmin: true, company_overview_available: true})
  await asyncObserver.refresh(); await new Promise(resolve => setImmediate(resolve)); assert.equal(asyncObserver.snapshot().overview.data, null)
})
test('late Alice success or401 cannot change Bob or a new API lifetime', async () => {
  for (const changeApi of [false, true]) for (const rejected of [false, true]) {
    const f = fixture(), gate = deferred(), previousApi = f.api, nextApi = changeApi ? {...f.api} : f.api
    try {f.api.getCompanyOverview = () => gate.promise; const work = f.model.refreshOverview()
      f.model.setIdentity({api: nextApi, employeeId: changeApi ? id(100) : id(101)})
      assert.equal(f.model.matchesScope(previousApi, changeApi ? id(100) : id(101)), !changeApi)
      f.model.setAvailability({currentAdmin: true, company_overview_available: true}); f.model.setActive(true)
      if (rejected) gate.reject(fault(401)); else gate.resolve(overview())
      await work; assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.expired(), 0); assert.equal(f.model.snapshot().active, true)
    } finally {gate.resolve(overview()); f.model.dispose()}
  }
})
test('same-access403 from an older request conservatively clears a newer successful Company page', async () => {
  const f = fixture(), old = deferred()
  try {f.api.listCompanyEmployees = () => old.promise; const work = f.model.refreshEmployees()
    f.api.listCompanyEmployees = async query => page(query, {items: [row(2)]}); await f.model.refreshEmployees()
    old.reject(fault(403)); await work; assert.equal(f.model.snapshot().employees.data, null); assert.equal(f.model.snapshot().forbidden, true); assert.equal(f.expired(), 0)
  } finally {old.resolve(page()); f.model.dispose()}
})
test('a403 from a previous access epoch cannot erase a fresh explicitly reopened Company scope', async () => {
  const f = fixture(), old = deferred()
  try {f.api.listCompanyEmployees = () => old.promise; const work = f.model.refreshEmployees()
    f.model.setAvailability({currentAdmin: false, company_overview_available: false})
    f.model.setAvailability({currentAdmin: true, company_overview_available: true})
    f.api.listCompanyEmployees = async query => page(query, {items: [row(2)]}); await f.model.refreshEmployees()
    old.reject(fault(403)); await work; assert.equal(f.model.snapshot().employees.data.items[0].employee_id, id(2)); assert.equal(f.model.snapshot().forbidden, false)
  } finally {old.resolve(page()); f.model.dispose()}
})
test('a replaced late200 cannot overwrite the newer employee page within the same identity', async () => {
  const f = fixture(), old = deferred()
  try {f.api.listCompanyEmployees = () => old.promise; const work = f.model.refreshEmployees()
    f.api.listCompanyEmployees = async query => page(query, {items: [row(2)]}); await f.model.refreshEmployees()
    old.resolve(page()); await work; assert.equal(f.model.snapshot().employees.data.items[0].employee_id, id(2))
  } finally {old.resolve(page()); f.model.dispose()}
})
test('same-lifetime stale401 still expires identity, while ordinary server errors never expose SQL text', async () => {
  const f = fixture(), old = deferred()
  try {f.api.getCompanyOverview = () => old.promise; const work = f.model.refreshOverview(); f.api.getCompanyOverview = async () => overview()
    await f.model.refreshOverview(); old.reject(fault(401)); await work; assert.equal(f.expired(), 1)
  } finally {old.resolve(overview()); f.model.dispose()}
  const unknown = fixture()
  try {unknown.api.getCompanyOverview = async () => {throw fault(500)}; await unknown.model.refreshOverview(); assert.equal(unknown.model.snapshot().overview.status, 'unknown'); assert.doesNotMatch(unknown.model.snapshot().overview.error, /SQL_PRIVATE_SENTINEL/)} finally {unknown.model.dispose()}
})
test('disposed sessions ignore all late effects and expose no totals or employee data', async () => {
  const f = fixture(), a = deferred(), b = deferred()
  f.api.getCompanyOverview = () => a.promise; f.api.listCompanyEmployees = () => b.promise
  const work = f.model.refresh(); f.model.dispose(); a.resolve(overview()); b.reject(fault(401)); await work
  assert.equal(f.expired(), 0); assert.equal(f.model.snapshot().overview.data, null); assert.equal(f.model.snapshot().employees.data, null); assert.equal(f.model.snapshot().canNextPage, false)
})
