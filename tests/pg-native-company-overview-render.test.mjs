// Static SSR/structure only; no browser, network, actual admin or database proof.
import test, {before, after} from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {parse} from '@babel/parser'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parsePgNativeCompanyOverview, parsePgNativeCompanyEmployeePage} from '../src/lib/pgNativeCompanyOverview.ts'
import {emptyCompanyOverviewView} from '../src/lib/pgNativeCompanyOverviewSession.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), sourcePath = 'src/pages/PgNativePilot/CompanyOverviewPanel.tsx'
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), at = '2026-10-28T01:02:03.123Z', pageAt = '2026-10-28T01:02:04.000Z'
const counts = extra => ({agent_running: 0, workflow_running: 0, pending_approvals: 0, human_input: 0, failed_7d: 0, overdue_schedules: 0, knowledge_bases: 0, ...extra})
const employee = (n, extra = {}) => ({employee_id: id(n), display_name: '员工' + n, is_admin: false, enabled: true, status: 'active', ...counts(), ...extra})
const global = parsePgNativeCompanyOverview({protocol: 'native_company_overview_v1', scope: 'company_metadata_only', as_of: at, window_days: 7,
  totals: {employees: 205, active: 203, ...counts({agent_running: 7})}, worker: {availability: 'unavailable', reason: 'telemetry_not_installed'}})
const makePage = (items, more = true) => parsePgNativeCompanyEmployeePage({protocol: 'native_company_employee_stats_v1', scope: 'company_metadata_only', as_of: pageAt,
  limit: 2, items, has_more: more, next_after: more ? items.at(-1).employee_id : null}, {limit: 2, after: null})
const rows = [employee(1, {display_name: '停用甲', enabled: false, agent_running: 7}), employee(2, {display_name: '停用乙', status: 'disabled', pending_approvals: 3})]
const ready = extra => ({...emptyCompanyOverviewView(id(100)), active: true, currentAdmin: true, available: true, query: {limit: 2, after: null},
  overview: {status: 'ready', data: global, error: ''}, employees: {status: 'ready', data: makePage(rows), error: ''}, canNextPage: true, ...extra})
let server, Panel, Presentation
before(async () => {
  server = await createServer({configFile: false, envFile: false, root, mode: 'test', plugins: [react()],
    cacheDir: path.join(root, '.tmp/pg-migration-completion/company-overview-panel-ssr-cache'), resolve: {alias: {'@': path.join(root, 'src')}},
    optimizeDeps: {noDiscovery: true, include: [], entries: []}, ssr: {optimizeDeps: {noDiscovery: true, include: [], entries: []}},
    server: {middlewareMode: true, host: '127.0.0.1', hmr: false, ws: false, watch: null}})
  const module = await server.ssrLoadModule('/' + sourcePath); Panel = module.default; Presentation = module.CompanyOverviewPresentation
})
after(async () => {await server?.close()})
const noop = () => {}
const render = (view = ready(), extra = {}) => renderToStaticMarkup(createElement(Presentation, {view, active: true, currentAdmin: true,
  available: true, bound: true, onRefresh: noop, onFirstPage: noop, onNextPage: noop, onPageSize: noop, ...extra}))
const tag = (html, label) => {const match = html.match(new RegExp('<button\\b[^>]*>' + label + '</button>')); assert.ok(match); return match[0]}
const disabled = value => /\sdisabled=""/.test(value)

test('global205 and employee page2 remain distinct, with separate server timestamps and disabled real counts', () => {
  const html = render()
  assert.match(html, /<dd[^>]*>205<\/dd>/); assert.match(html, /当前页 2 人，每页最多 2 人/)
  assert.match(html, /可用员工账号/); assert.doesNotMatch(html, /在职员工/)
  assert.ok(html.includes('dateTime="' + at + '"')); assert.ok(html.includes('dateTime="' + pageAt + '"'))
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1], allRows = body.match(/<tr[\s\S]*?<\/tr>/g)
  assert.equal(allRows.length, 2)
  assert.match(allRows[0], /停用甲/); assert.match(allRows[0], />已停用<\/td>/); assert.match(allRows[0], />7<\/td>/)
  assert.match(allRows[1], /停用乙/); assert.match(allRows[1], />已停用<\/td>/); assert.match(allRows[1], />3<\/td>/)
  assert.doesNotMatch(html, /<a\b|href=|run_id|resource_id|owner_user_id|api_key|lease_token/)
  assert.equal(disabled(tag(html, '下一页员工')), false)
})
test('Worker explicitly remains unavailable even when company running counters are nonzero', () => {
  const html = render()
  assert.match(html, /Worker 心跳暂不可用（尚未接入真实遥测）/)
  assert.doesNotMatch(html, /正常响应|后台运行中|最后心跳|心跳年龄|已启用但离线/)
})
test('permission closure or a mismatched employee/API binding suppresses stale data before effects', () => {
  for (const scope of [{currentAdmin: false}, {available: false}, {bound: false}]) {
    const html = render(ready(), scope)
    assert.doesNotMatch(html, /停用甲|停用乙|<dd[^>]*>205<\/dd>/)
    assert.equal((html.match(/<dd[^>]*>未知<\/dd>/g) ?? []).length, 9)
    assert.equal(disabled(tag(html, '刷新公司总数与员工首页')), true)
    assert.equal(disabled(tag(html, '下一页员工')), true)
  }
  assert.equal(render(ready(), {active: false}), '')
})
test('403 denies Company without describing a personal-session expiration or keeping old counts', () => {
  const html = render(ready({forbidden: true, available: false}))
  assert.match(html, /公司统计已清空/); assert.match(html, /可继续使用个人工作台/)
  assert.doesNotMatch(html, /员工登录已失效|重新登录|停用甲|停用乙|<dd[^>]*>205<\/dd>/)
  assert.equal(disabled(tag(html, '刷新员工首页')), true)
})
test('unknown/loading regions show unknown rather than successful zeros and do not derive totals from rows', () => {
  const unknown = render(ready({overview: {status: 'unknown', data: null, error: '公司计数未知。'}}))
  assert.equal((unknown.match(/<dd[^>]*>未知<\/dd>/g) ?? []).length, 9)
  assert.match(unknown, /停用甲/); assert.doesNotMatch(unknown, /<dd[^>]*>2<\/dd>|<dd[^>]*>0<\/dd>/)
  const loading = render(ready({employees: {status: 'loading', data: null, error: ''}, canNextPage: false}))
  assert.match(loading, /正在读取员工当前页，数量未知/); assert.match(loading, /<dd[^>]*>205<\/dd>/)
  assert.equal(disabled(tag(loading, '下一页员工')), true); assert.equal(disabled(tag(loading, '刷新公司总数与员工首页')), true)
})
test('an actual empty last page is labelled independently and pagination respects last/invalid state', () => {
  const html = render(ready({employees: {status: 'ready', data: makePage([], false), error: ''}, canNextPage: false}))
  assert.match(html, /当前页 0 人/); assert.match(html, /当前页没有员工记录/); assert.match(html, /<dd[^>]*>205<\/dd>/)
  assert.equal(disabled(tag(html, '下一页员工')), true)
  const invalid = render(ready({queryValid: false, employees: {status: 'unknown', data: null, error: '页大小无效。'}, canNextPage: false}))
  assert.match(invalid, /请选择1至20/); assert.equal(disabled(tag(invalid, '下一页员工')), true)
  assert.equal((html.match(/<option\b/g) ?? []).length, 20)
})
test('employee text is escaped and default SSR cannot issue Company requests', () => {
  const unsafe = employee(1, {display_name: '<img src=x onerror=alert(1)>', is_admin: true})
  const html = render(ready({employees: {status: 'ready', data: makePage([unsafe], false), error: ''}, canNextPage: false}))
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img\b|<script\b/); assert.match(html, /管理员/)
  assert.match(html, />可用<\/td>/)
  const api = new Proxy({}, {get() {throw Error('SSR must not access API methods')}})
  const initial = renderToStaticMarkup(createElement(Panel, {api, employeeId: id(100), active: true, currentAdmin: true, available: true, onExpired: noop}))
  assert.doesNotMatch(initial, /停用甲|停用乙|<dd[^>]*>205<\/dd>/)
})
test('actual hook lifetime is employee/API scoped with disposal, hidden clearing and latest expiration callback', () => {
  const source = readFileSync(path.join(root, sourcePath), 'utf8'), tree = parse(source, {sourceType: 'module', plugins: ['typescript', 'jsx']})
  const nodes = (value, predicate) => {
    if (!value || typeof value !== 'object') return []
    const found = predicate(value) ? [value] : []
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(n => found.push(...nodes(n, predicate)))
    else if (child && typeof child === 'object') found.push(...nodes(child, predicate))
    return found
  }
  const calls = (value, name) => nodes(value, n => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name)
  const effects = calls(tree, 'useEffect'), setup = effects.find(effect => calls(effect.arguments[0], 'createPgNativeCompanyOverviewSession').length)
  assert.deepEqual(setup.arguments[1].elements.map(n => n.name), ['api', 'employeeId'])
  assert.ok(nodes(setup.arguments[0], n => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'session' && n.callee.property.name === 'dispose').length)
  assert.match(source, /latest\.api === api && latest\.employeeId === employeeId/)
  assert.match(source, /binding\?\.api === api && binding\.employeeId === employeeId && binding\.model\.matchesScope/)
  assert.match(source, /model\.setActive\(active\)/); assert.match(source, /model\.setAvailability\(\{currentAdmin, company_overview_available: available\}\)/)
  assert.match(source, /if \(active && currentAdmin && available\) void model\.refresh\(\)/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|dangerouslySetInnerHTML|setInterval|onAccepted|PgNativePilotApi/)
})
