import {test, expect, chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

// Real Native Cookie -> global allowlist -> Company handler -> audited061 SQL.
// This synthetic hosted browser story does not establish production readiness,
// independent TCP PostgreSQL credentials, Worker liveness or provider execution.
test('Native company overview: global205, disabled counts, keyset pages, current admin and late employee isolation', async ({}, testInfo) => {
  const approved = requireNativeBrowserCi()
  const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))
  Object.assign(env, {AGENT_STUDIO_PG_BROWSER_FIXTURE: 'SYNTHETIC_LOCAL_ONLY'})
  for (const name of ['AUTONOMOUS', 'HUMAN', 'MEMORY', 'OUTCOME_MEMORY', 'DERIVED_MEMORY', 'FAILURE_SOURCE', 'FEEDBACK', 'OPTIMIZATION', 'REVIEW', 'GENERATED_ACCEPTANCE', 'DESCRIPTIVE_PATCH', 'COMPANY_OVERVIEW'])
    env['AGENT_STUDIO_PG_BROWSER_' + name] = 'true'
  const child = spawn(process.execPath, ['--experimental-strip-types', path.join(root, 'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true})
  let output = '', timer, browser, context, page, control, held, lateTransportTimer
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('synthetic_company_fixture_timeout')), 45000)
    const chunk = data => {
      output = (output + data.toString()).slice(-32768)
      for (const line of output.split(/\r?\n/)) if (line.startsWith('{"synthetic_only":true,')) try {resolve(JSON.parse(line))} catch {}
    }
    child.stdout.on('data', chunk); child.stderr.on('data', chunk); child.once('error', reject)
    child.once('exit', code => reject(Error('synthetic_company_fixture_exit_' + code + ' ' + output.slice(-1500))))
  })
  try {
    const info = await ready; clearTimeout(timer)
    expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort) && info.apiPort > 1024 && info.apiPort < 65536).toBe(true)
    control = async (name, method = 'POST') => {
      const response = await fetch('http://127.0.0.1:' + info.apiPort + '/__fixture/' + name, {method,
        headers: {'X-AgentStudio-Synthetic-Fixture': '1'}, signal: AbortSignal.timeout(15000)})
      expect(response.status).toBe(200); return response.json()
    }
    browser = await chromium.launch({headless: true})
    context = await browser.newContext({viewport: {width: 1280, height: 1000}, serviceWorkers: 'block'})
    const external = [], businessWrites = [], companyRequests = []
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== approved.origin) {external.push(route.request().url()); await route.abort()}
      else await route.continue()
    })
    page = await context.newPage()
    const base = '/__pg_native/api/v2/company-overview', employees = base + '/employees'
    const caps = '/__pg_native/api/native-auth/capabilities'
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/__pg_native/api/v2/') && !['GET', 'HEAD'].includes(request.method())) businessWrites.push({path: url.pathname, method: request.method()})
      if (url.pathname === base || url.pathname === employees) companyRequests.push({path: url.pathname, method: request.method(), search: url.search})
    })
    const responseFor = pathname => page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() === 'GET')
    const readJson = async response => {expect(response.status()).toBe(200); return response.json()}
    const login = async who => {
      await page.getByRole('textbox', {name: '员工邮箱', exact: true}).fill(who + '@example.com')
      await page.getByLabel('密码', {exact: true}).fill(who === 'alice' ? 'SyntheticAlicePassword#2026' : 'SyntheticBobPassword#2026')
      await page.getByRole('button', {name: '登录独立工作台', exact: true}).click()
      await expect(page.getByRole('button', {name: /^Agent 配置/})).toBeVisible()
    }
    const panel = page.getByRole('region', {name: '公司运行统计与员工当前页', exact: true})
    const global = panel.getByRole('region', {name: '公司全局统计', exact: true})
    const currentPage = panel.getByRole('region', {name: '员工运营统计当前页', exact: true})
    const total = label => global.locator('dl > div').filter({has: page.getByText(label, {exact: true})}).locator('dd')
    const pair = async action => {
      const all = responseFor(base), slice = responseFor(employees)
      await action()
      const [overview, employeePage] = await Promise.all([all.then(readJson), slice.then(readJson)])
      await expect(global.locator('time')).toHaveAttribute('datetime', overview.as_of)
      await expect(currentPage.locator('time')).toHaveAttribute('datetime', employeePage.as_of)
      return {overview, employeePage}
    }
    const refreshCapabilities = async () => {
      const pending = responseFor(caps)
      await page.getByRole('button', {name: '刷新', exact: true}).first().click()
      return readJson(await pending)
    }
    const cleared = async () => {
      await expect(panel.locator('time')).toHaveCount(0)
      await expect(total('员工账号总数')).toHaveText('未知')
      await expect(total('Agent 执行中')).toHaveText('未知')
      await expect(panel.getByText('当前页数据未知。', {exact: true})).toBeVisible()
      await expect(panel.getByRole('row', {name: /合成停用账号/})).toHaveCount(0)
    }
    await page.goto(info.url, {waitUntil: 'domcontentloaded'})
    const initialCaps = responseFor(caps)
    await login('alice')
    expect((await readJson(await initialCaps)).company_overview_available).toBe(true)
    const before = await control('state', 'GET')
    expect(before.companyOverviewAvailable).toBe(true)
    expect(before.companyStaff).toEqual({total: 205, active: 203})
    expect(before.runs).toBe(15)
    const first = await pair(() => page.getByRole('button', {name: '公司概览', exact: true}).click())
    expect(first.overview).toMatchObject({protocol: 'native_company_overview_v1', scope: 'company_metadata_only', window_days: 7,
      totals: {employees: 205, active: 203, agent_running: 15}, worker: {availability: 'unavailable', reason: 'telemetry_not_installed'}})
    expect(first.employeePage).toMatchObject({protocol: 'native_company_employee_stats_v1', scope: 'company_metadata_only', limit: 20, has_more: true})
    expect(first.employeePage.items).toHaveLength(20)
    const firstIds = first.employeePage.items.map(row => row.employee_id)
    expect(firstIds).toEqual([...firstIds].sort())
    expect(first.employeePage.next_after).toBe(firstIds.at(-1))
    const disabled = first.employeePage.items.filter(row => !row.enabled || row.status === 'disabled')
    expect(disabled.map(row => row.employee_id)).toEqual(before.companySeedIds.slice(0, 2))
    expect(disabled.map(row => row.agent_running)).toEqual([7, 3])
    expect(first.employeePage.items.reduce((sum, row) => sum + row.agent_running, 0)).toBe(10)
    expect(first.overview.totals.agent_running).toBeGreaterThan(10)
    await expect(total('员工账号总数')).toHaveText('205')
    await expect(total('可用员工账号')).toHaveText('203')
    await expect(total('Agent 执行中')).toHaveText('15')
    for (const [name, count] of [['合成停用账号甲', '7'], ['合成停用账号乙', '3']]) {
      const row = currentPage.getByRole('row', {name: new RegExp(name)})
      await expect(row.getByRole('cell').nth(0)).toHaveText('已停用')
      await expect(row.getByRole('cell').nth(1)).toHaveText(count)
    }
    await expect(panel.getByText('Worker 心跳暂不可用（尚未接入真实遥测）。', {exact: true})).toBeVisible()
    expect(await page.evaluate(async () => (await fetch('/__pg_native/healthz')).status)).toBe(200)
    expect(first.overview.worker).toEqual({availability: 'unavailable', reason: 'telemetry_not_installed'})
    expect(JSON.stringify(first)).not.toMatch(/COMPANY_BROWSER_PRIVATE|password_record|@example\.com|instruction|checkpoint|model_binding/)
    await page.screenshot({path: testInfo.outputPath('native-company-overview-desktop.png'), fullPage: true})
    await page.setViewportSize({width: 390, height: 900})
    await page.screenshot({path: testInfo.outputPath('native-company-overview-mobile.png'), fullPage: true})
    await page.setViewportSize({width: 1280, height: 1000})

    const nextResponse = responseFor(employees)
    await currentPage.getByRole('button', {name: '下一页员工', exact: true}).click()
    const next = await readJson(await nextResponse)
    expect(next.items).toHaveLength(20)
    expect(next.items.every(row => row.employee_id > first.employeePage.next_after && !firstIds.includes(row.employee_id))).toBe(true)
    await expect(currentPage.locator('time')).toHaveAttribute('datetime', next.as_of)
    await expect(global.locator('time')).toHaveAttribute('datetime', first.overview.as_of)
    await expect(total('员工账号总数')).toHaveText('205')
    await expect(total('Agent 执行中')).toHaveText('15')
    const resetResponse = responseFor(employees)
    await currentPage.getByRole('button', {name: '刷新员工首页', exact: true}).click()
    const reset = await readJson(await resetResponse)
    expect(reset.items.map(row => row.employee_id)).toEqual(firstIds)
    await expect(currentPage.locator('time')).toHaveAttribute('datetime', reset.as_of)
    await expect(global.locator('time')).toHaveAttribute('datetime', first.overview.as_of)
    // Hiding removes both Company snapshots. Reopening requires actual reads.
    await page.getByRole('button', {name: /^Agent 配置/}).click()
    await expect(panel).toHaveCount(0)
    await pair(() => page.getByRole('button', {name: '公司概览', exact: true}).click())

    // Actual SQL demotion while the browser's old admin hint remains true.
    // The Company repository must reject it without expiring personal Cookie auth.
    await control('company-demote-alice')
    const denials = await page.evaluate(async paths => Promise.all(paths.map(async url => {
      const response = await fetch(url); return {status: response.status, body: await response.json()}
    })), [base, employees + '?limit=20'])
    expect(denials).toEqual([{status: 403, body: {error: 'admin_required'}}, {status: 403, body: {error: 'admin_required'}}])
    // The first UI403 deliberately aborts its sibling read. Assert that real
    // rejection, rather than requiring an already-cancelled sibling response.
    const deniedUi = page.waitForResponse(response => [base, employees].includes(new URL(response.url()).pathname) && response.status() === 403)
    await panel.getByRole('button', {name: '刷新公司总数与员工首页', exact: true}).click()
    expect((await deniedUi).status()).toBe(403)
    await cleared()
    await expect(panel.getByRole('alert').filter({hasText: '公司统计已清空。请重新核对公司访问权限；可继续使用个人工作台。'})).toBeVisible()
    const stillAlice = await page.evaluate(async () => {const response = await fetch('/__pg_native/api/native-auth/me'); return {status: response.status, body: await response.json()}})
    expect(stillAlice.status).toBe(200)
    expect(stillAlice.body).toMatchObject({authenticated: true, user: {id: before.companyAliceId, is_admin: false}})
    await expect(page.getByRole('button', {name: '登录独立工作台', exact: true})).toHaveCount(0)
    await page.screenshot({path: testInfo.outputPath('native-company-overview-denial.png'), fullPage: true})
    expect((await refreshCapabilities()).company_overview_available).toBeUndefined()
    await expect(page.getByRole('button', {name: '公司概览', exact: true})).toHaveCount(0)
    await cleared()
    await page.getByRole('button', {name: /^Agent 配置/}).click()
    await expect(page.getByText('Alice Browser Agent', {exact: true}).first()).toBeVisible()
    await control('company-restore-alice')
    expect((await refreshCapabilities()).company_overview_available).toBe(true)
    await pair(() => page.getByRole('button', {name: '公司概览', exact: true}).click())

    // Audited schema is still installed; closing the server feature removes the
    // capability and clears Company counters while personal configuration works.
    await control('deny-company-overview')
    expect((await refreshCapabilities()).company_overview_available).toBeUndefined()
    await cleared()
    await expect(panel.getByText('当前未开放公司统计，计数未知。', {exact: true})).toBeVisible()
    await expect(page.getByRole('button', {name: '公司概览', exact: true})).toHaveCount(0)
    expect(await page.evaluate(async paths => Promise.all(paths.map(async url => (await fetch(url)).status)), [base, employees + '?limit=20'])).toEqual([503, 503])
    await control('allow-company-overview')
    const restoredAll = responseFor(base), restoredPage = responseFor(employees)
    expect((await refreshCapabilities()).company_overview_available).toBe(true)
    await Promise.all([restoredAll.then(readJson), restoredPage.then(readJson)])
    await expect(total('员工账号总数')).toHaveText('205')

    // Hold only a genuine, fully fetched Alice200. Keep its handler registered
    // through delivery/settlement after Bob login. Native session cancellation
    // may abort the transport; only the precise browser ERR_ABORTED is accepted.
    let reached, release, done, transportDone, claimed = false, request, actualAlice200 = false
    const fetched = new Promise(resolve => {reached = resolve}), gate = new Promise(resolve => {release = resolve})
    const delivered = new Promise(resolve => {done = resolve})
    const transport = new Promise(resolve => {transportDone = resolve})
    const finished = candidate => {if (candidate === request) transportDone({failure: candidate.failure()})}
    page.on('requestfinished', finished); page.on('requestfailed', finished)
    const hold = async route => {
      if (claimed || route.request().method() !== 'GET') {await route.continue(); return}
      claimed = true; request = route.request()
      try {
        const response = await route.fetch()
        expect(response.status()).toBe(200)
        expect((await response.json()).totals.employees).toBe(205)
        actualAlice200 = true
        reached(); await gate; await route.fulfill({response}); done({error: null})
      } catch (error) {reached(); done({error})}
    }
    held = {release, delivered, transport, claimed: () => claimed, unroute: () => page.unroute('**' + base, hold),
      disposeListeners: () => {page.off('requestfinished', finished); page.off('requestfailed', finished)}}
    await page.route('**' + base, hold)
    await panel.getByRole('button', {name: '刷新公司总数与员工首页', exact: true}).click()
    await fetched
    expect(actualAlice200).toBe(true)
    await expect(total('员工账号总数')).toHaveText('未知')
    await page.getByRole('button', {name: '退出', exact: true}).click()
    await login('bob')
    release()
    const settled = await delivered
    const transportResult = await Promise.race([transport, new Promise((_, reject) => {lateTransportTimer = setTimeout(() => reject(Error('company_late_transport_unsettled')), 15000)})])
    clearTimeout(lateTransportTimer)
    held.disposeListeners()
    if (transportResult.failure) expect(transportResult.failure.errorText).toBe('net::ERR_ABORTED')
    if (settled.error) expect(transportResult.failure?.errorText).toBe('net::ERR_ABORTED')
    await held.unroute(); held = null
    await expect(page.getByRole('button', {name: '公司概览', exact: true})).toHaveCount(0)
    await expect(page.getByText('合成停用账号甲', {exact: true})).toHaveCount(0)
    await expect(page.getByText('合成停用账号乙', {exact: true})).toHaveCount(0)
    await expect(panel.locator('time')).toHaveCount(0)
    const bob = await page.evaluate(async paths => Promise.all(paths.map(async url => {const response = await fetch(url); return {status: response.status, body: await response.json()}})), [base, employees + '?limit=20'])
    expect(bob).toEqual([{status: 403, body: {error: 'admin_required'}}, {status: 403, body: {error: 'admin_required'}}])
    expect((await page.evaluate(async () => (await fetch('/__pg_native/api/native-auth/capabilities')).json())).company_overview_available).toBeUndefined()
    await page.getByRole('button', {name: /^Agent 配置/}).click()
    await expect(page.getByText('Bob Browser Agent', {exact: true}).first()).toBeVisible()

    const after = await control('state', 'GET')
    expect(after.companyBusinessSnapshot).toEqual(before.companyBusinessSnapshot)
    expect(after.companyStaff).toEqual({total: 205, active: 203})
    for (const key of ['submissions', 'configRequests', 'generated', 'httpCalls', 'mcpCalls', 'mcpDiscoveries', 'smitheryWrites', 'reviewSyntheticCompletions']) expect(after[key]).toBe(0)
    expect(businessWrites).toEqual([]); expect(external).toEqual([])
    expect(companyRequests.every(request => request.method === 'GET')).toBe(true)
    expect(companyRequests.some(request => new URLSearchParams(request.search).get('after') === first.employeePage.next_after)).toBe(true)
    await testInfo.attach('company-overview-evidence.json', {body: Buffer.from(JSON.stringify({synthetic_only: true, staff: after.companyStaff,
      first_ids: firstIds, next_ids: next.items.map(row => row.employee_id), overview_as_of: first.overview.as_of,
      employee_as_of: first.employeePage.as_of, worker: first.overview.worker, disabled_counts: disabled.map(row => row.agent_running),
      admin_demoted_statuses: denials.map(response => response.status), late_transport: transportResult, business_writes: businessWrites,
      business_snapshot_unchanged: true}, null, 2)), contentType: 'application/json'})
  } finally {
    clearTimeout(timer); clearTimeout(lateTransportTimer)
    const cleanupErrors = [], cleanup = async action => {try {await action()} catch (error) {cleanupErrors.push(error)}}
    if (held) {
      held.release()
      if (held.claimed()) {
        await cleanup(() => held.delivered)
        await cleanup(async () => {
          let deadline
          try {await Promise.race([held.transport, new Promise((_, reject) => {deadline = setTimeout(() => reject(Error('company_cleanup_transport_unsettled')), 15000)})])}
          finally {clearTimeout(deadline)}
        })
      }
      held.disposeListeners()
      await cleanup(() => held.unroute())
    }
    if (context) await cleanup(() => context.close())
    if (browser) await cleanup(() => browser.close())
    if (control) await cleanup(() => control('stop'))
    if (typeof child.pid === 'number' && child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
      let forced, deadline
      const done = () => {clearTimeout(forced); clearTimeout(deadline); child.off('exit', done); resolve()}
      child.once('exit', done); forced = setTimeout(() => child.kill('SIGTERM'), 5000); deadline = setTimeout(() => {child.kill('SIGKILL'); done()}, 10000)
    })
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'synthetic_company_browser_cleanup_failed')
  }
})
