// Real disposable PocketBase + real stdio Playwright MCP. No company data or paid model.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { spawnHeadlessPocketBase } from './helpers/headless-pocketbase.mjs'
import { createRuntime } from '../local-executor/runtime.mjs'
import { connection, executeClaim } from '../local-executor/connection.mjs'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

const root = process.cwd(), secret = randomBytes(32).toString('hex')
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstudio-local-computer-'))
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'agentstudio-local-files-'))
let pb, runtime, uiServer, uiBrowser, desktopFixture, desktopRuntime, desktopGeometry, logs = '', remoteRequests = 0, modelCalls = 0, imageRequests = 0, lastImageUrl = ''
const desktopPython = process.env.AGENT_STUDIO_DESKTOP_PYTHON
const pause = ms => new Promise(r => setTimeout(r, ms))
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return 'http://127.0.0.1:' + server.address().port }
const forbidden = createServer((_req, res) => { remoteRequests++; res.end('must not be accessed') })
const forbiddenUrl = await listen(forbidden)
let officeSubmission = null
const website = createServer(async (req, res) => {
  if (req.url === '/office-submit' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk
    officeSubmission = Object.fromEntries(new URLSearchParams(body))
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<p>录入成功，单号 OFFICE-TEST-001</p>'); return
  }
  if (req.url === '/office') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<!doctype html><title>办公录入验收</title><form method="POST" action="/office-submit"><label>报告标题<input name="title"></label><label>统计标签<input name="period"></label><label>记录数<input name="count"></label><label>合计<input name="total"></label><button type="submit">确认录入</button></form>'); return
  }
  if (req.url === '/drop') { req.socket.destroy(); return }
  if (req.url === '/redirect') { res.writeHead(302, { location: forbiddenUrl }); res.end(); return }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html><title>Local computer test</title><body><h1>本地浏览器验证</h1><label>姓名<input aria-label="姓名" id="name"></label><button onclick="document.querySelector(\'#result\').textContent=\'Hello \'+document.querySelector(\'#name\').value">提交</button><p id="result"></p></body></html>')
})
const websiteUrl = await listen(website)
const model = createServer(async (req, res) => {
  let raw = ''; for await (const b of req) raw += b
  const messages = JSON.parse(raw).messages, text = messages.map(m => Array.isArray(m.content) ? m.content.filter(b => b.type === 'text').map(b => b.text).join('\n') : m.content).join('\n')
  const images = messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(b => b.type === 'image_url') : [])
  if (images.length) { assert.match(images[0].image_url.url, /^data:image\/png;base64,iVBORw0KGgo/); lastImageUrl = images[0].image_url.url; imageRequests++ }
  modelCalls++
  const response = text.includes('VISION_FIXTURE')
    ? (images.length ? { action: 'final', final_answer: '截图已完整到达模型接口' } : { action: 'tool', tool: 'local_computer', tool_input: { tool: 'browser.browser_take_screenshot', arguments: { type: 'png' } } })
    : text.includes('（尚无，这是第一步）')
    ? { thought: 'Write the requested local file', action: 'tool', tool: 'local_computer', tool_input: { tool: 'files.write', arguments: { root: 'work', path: 'agent-result.txt', text: 'Agent local execution verified' } } }
    : { thought: 'The tool returned a confirmed result', action: 'final', final_answer: '文件已成功创建' }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(response) } }] }))
})
const modelUrl = await listen(model)
const portProbe = createServer(); const pbOrigin = await listen(portProbe); await new Promise(r => portProbe.close(r))
const report = []
function passed(name) { report.push(name); console.log('PASS ' + name) }
let employeeToken, otherToken
async function request(method, route, body, token = employeeToken, extra = {}) {
  const res = await fetch(pbOrigin + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
async function ok(method, route, body, token) {
  const r = await request(method, route, body, token)
  assert.ok(r.status >= 200 && r.status < 300, route + ': ' + JSON.stringify(r)); return r.data
}
try {
  pb = spawnHeadlessPocketBase(process.env.POCKETBASE_BIN || path.join(root, 'vibex-local/bin/windows/pocketbase.exe'), [
    'serve', '--http=' + new URL(pbOrigin).host, '--dir=' + data, '--hooksDir=' + path.join(root, 'pocketbase/pb_hooks'),
  ], { cwd: path.join(root, 'pocketbase'), env: { AGENT_STUDIO_AUTH_MODE: 'standalone', AGENT_STUDIO_BOOTSTRAP_SECRET: secret, AGENT_STUDIO_ALLOW_ANON: 'false' } })
  pb.stdout.on('data', b => { logs = (logs + b).slice(-12000) }); pb.stderr.on('data', b => { logs = (logs + b).slice(-12000) })
  let ready = false
  for (let n = 0; n < 140; n++) {
    try { if ((await fetch(pbOrigin + '/api/health')).ok) { ready = true; break } } catch {}
    await pause(150)
  }
  assert.ok(ready, logs)
  const bootstrap = await request('POST', '/api/studio/bootstrap', { email: 'local@example.test', password: 'S3cure-local-test-2026', display_name: '本地测试' }, '', { 'X-Agent-Studio-Setup-Key': secret })
  assert.equal(bootstrap.status, 201, JSON.stringify(bootstrap))
  employeeToken = (await ok('POST', '/api/collections/studio_users/auth-with-password', { identity: 'local@example.test', password: 'S3cure-local-test-2026' })).token
  await ok('POST', '/api/studio/users', { email: 'other@example.test', password: 'S3cure-local-test-2026', display_name: '另一员工', role: 'employee' })
  otherToken = (await ok('POST', '/api/collections/studio_users/auth-with-password', { identity: 'other@example.test', password: 'S3cure-local-test-2026' })).token
  assert.equal((await request('GET', '/api/local-devices', undefined, '', { 'X-Rh-User-Id': 'forged' })).status, 401)
  const pairedDevice = await ok('POST', '/api/local-devices', { name: '隔离测试电脑' })
  const paired = await connection(pbOrigin)('/pair', { code: pairedDevice.pairing_code })
  await assert.rejects(() => connection(pbOrigin)('/pair', { code: pairedDevice.pairing_code }), /401/)
  const api = connection(pbOrigin, paired.token)
  assert.equal((await ok('GET', '/api/local-devices', undefined, otherToken)).items.length, 0)
  passed('verified employee identity, owner scoping and one-use device pairing')

  await fs.writeFile(path.join(work, 'input.txt'), '本地文件测试')
  const appScript = path.join(work, 'launch-fixture.mjs')
  await fs.writeFile(appScript, 'import fs from "node:fs";fs.writeFileSync(process.argv[2],"launched")')
  runtime = await createRuntime({ roots: [{ name: 'work', path: work }], office: { enabled: true },
    browser: { enabled: true, headless: true, images: true, channel: 'chrome', allowedOrigins: [websiteUrl] },
    apps: { test_app: { command: process.execPath, args: [appScript, path.join(work, 'app-started.txt')] } } })
  assert.ok(runtime.tools.some(t => t.name === 'browser.browser_navigate'))
  for (const tool of runtime.tools.filter(t => t.name.startsWith('browser.'))) {
    assert.equal(tool.inputSchema.properties?.filename, undefined)
    assert.ok(!tool.inputSchema.required?.includes('filename'))
  }
  await assert.rejects(() => runtime.execute({ tool: 'browser.browser_take_screenshot', arguments: { filename: 'not-allowed.png' } }), /browser_output_path_denied/)
  await api('/poll', { tools: runtime.tools })
  async function submit(tool, args, requestId = randomUUID()) {
    return ok('POST', '/api/local-devices/' + paired.device_id + '/jobs', { tool, arguments: args, confirm: true, request_id: requestId })
  }
  async function perform(tool, args) {
    const job = await submit(tool, args)
    const claimed = await api('/poll', { tools: runtime.tools })
    assert.equal(claimed.job.id, job.id)
    await executeClaim(api, { ...runtime, execute: async (...args) => {
      try { return await runtime.execute(...args) } catch (e) { console.error('FIXTURE_TOOL_ERROR', e.message); throw e }
    } }, claimed.job)
    const done = await ok('GET', '/api/local-jobs/' + job.id)
    assert.equal(done.status, 'succeeded', JSON.stringify({ status: done.status, error: done.error })); return done.images?.length ? done : done.result
  }
  assert.equal((await request('POST', '/api/local-devices/' + paired.device_id + '/jobs', { tool: 'files.read', arguments: {}, request_id: randomUUID() })).status, 409)
  assert.equal((await request('POST', '/api/local-devices/' + paired.device_id + '/jobs', { tool: 'files.read', arguments: {}, confirm: true, request_id: randomUUID() }, otherToken)).status, 409)
  assert.match(await perform('files.list', { root: 'work', path: '.' }), /input.txt/)
  assert.equal(await perform('files.read', { root: 'work', path: 'input.txt' }), '本地文件测试')
  await perform('files.write', { root: 'work', path: 'result.txt', text: '写入成功' })
  assert.equal(await fs.readFile(path.join(work, 'result.txt'), 'utf8'), '写入成功')
  for (const candidate of ['../outside.txt', '.env.local', 'C:\\Windows\\win.ini', 'result.txt:stream', '.git/config']) {
    await assert.rejects(() => runtime.execute({ tool: 'files.read', arguments: { root: 'work', path: candidate } }))
  }
  await assert.rejects(() => runtime.execute({ tool: 'files.write', arguments: { root: 'work', path: 'result.txt', text: 'overwrite' } }))
  const link = path.join(work, 'linked.txt'); await fs.link(path.join(work, 'input.txt'), link)
  await assert.rejects(() => runtime.execute({ tool: 'files.read', arguments: { root: 'work', path: 'linked.txt' } }), /linked/)
  passed('real file read/write, approval gate, traversal/secrets/ADS/hardlink/overwrite rejection')

  const csv = '编号,部门,金额\r\nA001,销售,1200.10\r\nA002,运营,800.20\r\nA003,销售,99.90\r\nA004,运营,-50.20\r\nA005,研发,450.00\r\n'
  await fs.writeFile(path.join(work, 'ledger.csv'), csv)
  const officeInput = { root: 'work', source_path: 'ledger.csv', group_by: '部门', amount_column: '金额' }
  const officeSummary = JSON.parse(await perform('office.table_summary', officeInput))
  assert.equal(officeSummary.total, '2500.00'); assert.equal(officeSummary.row_count, 5)
  const officeReportInput = { ...officeInput, expected_sha256: officeSummary.source_sha256, output_directory: 'office-report', title: '部门业务汇总报告', period: '样例验收' }
  assert.equal((await request('POST', '/api/local-devices/' + paired.device_id + '/jobs', { tool: 'office.create_report', arguments: officeReportInput, request_id: randomUUID() })).status, 409)
  await assert.rejects(() => fs.access(path.join(work, 'office-report')), { code: 'ENOENT' })
  await perform('office.create_report', officeReportInput)
  const manifest = JSON.parse(await perform('files.read', { root: 'work', path: 'office-report/summary.json' }))
  assert.equal(manifest.total, '2500.00'); assert.equal(manifest.source_sha256, officeSummary.source_sha256)
  const reportBook = new ExcelJS.Workbook(); await reportBook.xlsx.readFile(path.join(work, 'office-report/summary.xlsx'))
  assert.equal(reportBook.getWorksheet('汇总').getCell('C8').result, 2500)
  const reportZip = await JSZip.loadAsync(await fs.readFile(path.join(work, 'office-report/report.docx')))
  assert.match(await reportZip.file('word/document.xml').async('string'), /2500\.00/)
  passed('approved office aggregation → real XLSX/DOCX bundle → manifest reread with matching source digest and totals')
  let officeSnapshot = await perform('browser.browser_navigate', { url: websiteUrl + '/office' })
  for (const [label, value] of [['报告标题', '部门业务汇总报告'], ['统计标签', '样例验收'], ['记录数', String(manifest.row_count)], ['合计', manifest.total]]) {
    const target = new RegExp('textbox "' + label + '" \\[ref=([^\\]]+)\\]').exec(officeSnapshot)?.[1]
    assert.ok(target, officeSnapshot)
    officeSnapshot = await perform('browser.browser_type', { target, text: value })
  }
  assert.match(officeSnapshot, /2500\.00/); assert.equal(officeSubmission, null, 'Filling must not submit')
  const submitTarget = /button "确认录入" \[ref=([^\]]+)\]/.exec(officeSnapshot)?.[1]
  assert.ok(submitTarget, officeSnapshot)
  officeSnapshot = await perform('browser.browser_click', { target: submitTarget })
  assert.match(officeSnapshot, /OFFICE-TEST-001/)
  assert.deepEqual(officeSubmission, { title: '部门业务汇总报告', period: '样例验收', count: '5', total: '2500.00' })
  passed('real browser form fill, pre-submit verification, separate approved submission and server receipt')

  const requestId = randomUUID(), input = { root: 'work', path: 'input.txt' }
  const onceJob = await submit('files.read', input, requestId)
  assert.equal((await submit('files.read', input, requestId)).id, onceJob.id)
  const claims = await Promise.all([api('/poll', { tools: runtime.tools }), api('/poll', { tools: runtime.tools })])
  assert.equal(claims.filter(c => c.job).length, 1)
  const claim = claims.find(c => c.job).job
  assert.equal((await request('GET', '/api/local-jobs/' + claim.id, undefined, otherToken)).status, 404)
  await assert.rejects(() => api('/jobs/' + claim.id + '/complete', { claim: 'wrong', ok: true, result: 'forged' }), /409/)
  await assert.rejects(() => api('/jobs/' + claim.id + '/complete', { claim: claim.claim, ok: true, result: { text: '', images: [{ mimeType: 'image/svg+xml', data: '<svg/>' }] } }), /400/)
  await executeClaim(api, runtime, claim)
  assert.equal((await api('/poll', { tools: runtime.tools })).job, null)
  passed('idempotent submission, exclusive claim, forged completion and cross-owner read rejection')

  let snapshot = await perform('browser.browser_navigate', { url: websiteUrl })
  assert.match(snapshot, /本地浏览器验证/)
  let ref = /textbox "姓名" \[ref=([^\]]+)\]/.exec(snapshot)?.[1]
  assert.ok(ref, snapshot)
  await perform('browser.browser_type', { target: ref, text: 'Agent Studio' })
  snapshot = await perform('browser.browser_snapshot', {})
  ref = /button "提交" \[ref=([^\]]+)\]/.exec(snapshot)?.[1]
  assert.ok(ref, snapshot)
  snapshot = await perform('browser.browser_click', { target: ref })
  assert.match(snapshot, /Hello Agent Studio/)
  await assert.rejects(() => runtime.execute({ tool: 'browser.browser_navigate', arguments: { url: forbiddenUrl } }), /origin_denied/)
  await assert.rejects(() => runtime.execute({ tool: 'browser.browser_navigate', arguments: { url: websiteUrl + '/redirect' } }))
  await assert.rejects(() => runtime.execute({ tool: 'browser.browser_evaluate', arguments: { function: '() => 1' } }), /tool_denied/)
  assert.equal(remoteRequests, 0)
  passed('real Playwright MCP browser navigation, typing, click, observation and blocked cross-origin redirect')
  const failedNavigation=await submit('browser.browser_navigate',{url:websiteUrl+'/drop'})
  const failedClaim=(await api('/poll',{tools:runtime.tools})).job
  assert.equal(failedClaim.id,failedNavigation.id)
  await executeClaim(api,runtime,failedClaim)
  const failedReceipt=await ok('GET','/api/local-jobs/'+failedNavigation.id)
  assert.equal(failedReceipt.status,'failed','a dropped main-frame request must never be recorded as a successful visit')
  assert.ok(!String(failedReceipt.result||'').includes('本地浏览器验证'))
  assert.match(failedReceipt.result,/browser_navigation_failed|browser_connection_refused|browser_navigation_timeout/,'safe navigation reason must survive the executor boundary')
  await assert.rejects(()=>runtime.execute({tool:'browser.browser_snapshot',arguments:{}}),/^Error: browser_navigation_failed$/,'a failed browser document cannot masquerade as a healthy page snapshot')
  const recoveredSnapshot=await perform('browser.browser_navigate',{url:websiteUrl})
  assert.match(recoveredSnapshot,/本地浏览器验证/,'a later approved navigation must recover after the failed request')
  passed('failed navigation yields explicit workbench diagnostics, never a fake successful page, and an approved retry recovers')
  await perform('apps.launch', { app: 'test_app' })
  for (let i = 0; i < 30; i++) { try { if (await fs.readFile(path.join(work, 'app-started.txt'), 'utf8') === 'launched') break } catch {} await pause(100) }
  assert.equal(await fs.readFile(path.join(work, 'app-started.txt'), 'utf8'), 'launched')
  await assert.rejects(() => runtime.execute({ tool: 'apps.launch', arguments: { app: 'powershell' } }), /denied/)
  passed('real allowlisted application launch without model-controlled commands')

  const modelConnection = await ok('POST', '/api/model-connections', { name: 'Local fixture', provider: 'openai', api_key: 'test-only', base_url: modelUrl + '/v1', models: ['fixture'] })
  const spec = await ok('POST', '/api/agent_specs', { name: '本地文件 Agent', spec: { goal: '创建文件', tools: [], task_plan: ['创建文件', '总结'], deliverables: ['文件'], done_criteria: ['文件创建成功'] } })
  const run = await ok('POST', '/api/agent-runs/start', { spec_id: spec.id, instruction: '创建 agent-result.txt', model: 'fixture', config: { local_device_id: paired.device_id, max_steps: 6, tools: {}, custom_model: { connection_id: modelConnection.item.id, model_id: 'fixture' } } })
  const tick = () => ok('POST', '/api/llm/agent-engine/' + run.run_id + '/tick', {})
  await tick()
  let state = await ok('GET', '/api/agent_runs/' + run.run_id)
  assert.equal(state.status, 'awaiting_approval', JSON.stringify(state))
  assert.equal((await api('/poll', { tools: runtime.tools })).job, null)
  await ok('POST', '/api/agent-runs/' + run.run_id + '/approve', { decision: 'approve' })
  await tick()
  const beforeWait = modelCalls
  await tick()
  assert.equal(modelCalls, beforeWait, 'Waiting must not invoke the model')
  const localJob = (await api('/poll', { tools: runtime.tools })).job
  assert.ok(localJob, JSON.stringify(await ok('GET', '/api/agent_runs/' + run.run_id)))
  await executeClaim(api, runtime, localJob)
  await tick(); await tick()
  state = await ok('GET', '/api/agent_runs/' + run.run_id)
  assert.equal(state.status, 'succeeded', JSON.stringify(state))
  assert.equal(await fs.readFile(path.join(work, 'agent-result.txt'), 'utf8'), 'Agent local execution verified')
  passed('Agent planning → approval → queued local execution → real file → observation → final result')

  // Real raster bytes traverse MCP → executor → private job → provider request.
  await perform('browser.browser_navigate', { url: websiteUrl })
  const visualRun = await ok('POST', '/api/agent-runs/start', { spec_id: spec.id, instruction: 'VISION_FIXTURE 截图验证', model: 'fixture', config: { local_device_id: paired.device_id, max_steps: 6, tools: {}, custom_model: { connection_id: modelConnection.item.id, model_id: 'fixture' } } })
  const visionTick = () => ok('POST', '/api/llm/agent-engine/' + visualRun.run_id + '/tick', {})
  await visionTick()
  assert.equal((await ok('GET', '/api/agent_runs/' + visualRun.run_id)).status, 'awaiting_approval')
  await ok('POST', '/api/agent-runs/' + visualRun.run_id + '/approve', { decision: 'approve' })
  await visionTick()
  const visualJob = (await api('/poll', { tools: runtime.tools })).job
  await executeClaim(api, runtime, visualJob)
  const visualResult = await ok('GET', '/api/local-jobs/' + visualJob.id)
  assert.equal(visualResult.status, 'succeeded', visualResult.error)
  assert.ok(visualResult.images[0].data.length > 1000)
  assert.equal((await request('GET', '/api/local-jobs/' + visualJob.id, undefined, otherToken)).status, 404)
  await visionTick(); await visionTick()
  const visualState = await ok('GET', '/api/agent_runs/' + visualRun.run_id)
  assert.equal(visualState.status, 'succeeded', JSON.stringify(visualState))
  assert.equal(imageRequests, 1)
  assert.equal(lastImageUrl, 'data:image/png;base64,' + visualResult.images[0].data, 'Model must receive exactly the private job screenshot')
  assert.equal(visualState.checkpoint.harness_stats.image_inputs, 1)
  assert.ok(!JSON.stringify(visualState).includes('iVBORw0KGgo'), 'Screenshot bytes must not enter checkpoint/events')
  passed('real MCP screenshot, private owner access, vision request and metadata-only Agent checkpoint')

  if (desktopPython) {
    desktopFixture = spawn(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-WindowStyle', 'Hidden', '-File', path.join(root, 'tests/helpers/local-desktop-fixture.ps1'), '-FixtureDirectory', work], { windowsHide: false, stdio: 'ignore' })
    for (let i = 0; i < 100; i++) {
      try { desktopGeometry = JSON.parse((await fs.readFile(path.join(work, 'desktop-geometry.json'), 'utf8')).replace(/^\uFEFF/, '')); break } catch {}
      await pause(150)
    }
    assert.ok(desktopGeometry, 'Disposable Windows fixture must start')
    desktopRuntime = await createRuntime({ roots: [{ name: 'work', path: work }], desktop: { enabled: true, python: desktopPython, region: desktopGeometry.region } })
    assert.deepEqual(desktopRuntime.tools.filter(t => t.name.startsWith('desktop.')).map(t => t.name).sort(), ['Click', 'ControlStatus', 'Screenshot', 'Scroll', 'Snapshot', 'Type'].map(t => 'desktop.' + t).sort())
    await assert.rejects(() => desktopRuntime.execute({ tool: 'desktop.Click', arguments: { loc: desktopGeometry.button } }), /observation_expired/)
    await api('/poll', { tools: desktopRuntime.tools })
    // Honor the MCP's physical-user ownership guard. Read status while idle;
    // never disable the guard or retry an input effect.
    let desktopReady = false
    for (let i = 0; i < 30; i++) {
      const control = JSON.parse(await desktopRuntime.execute({ tool: 'desktop.ControlStatus', arguments: {} }))
      if (control.state === 'ready' || control.state === 'ai') { desktopReady = true; break }
      await pause(1000)
    }
    assert.ok(desktopReady, 'Windows MCP remained under user control; no native input attempted')
    const desktopPerform = async (tool, args) => {
      const job = await submit(tool, args)
      await executeClaim(api, { ...desktopRuntime, execute: async (...args) => {
        try { return await desktopRuntime.execute(...args) } catch (e) { console.error('DESKTOP_FIXTURE_ERROR', e.message, String(e.cause || '').slice(0, 800)); throw e }
      } }, (await api('/poll', { tools: desktopRuntime.tools })).job)
      const result = await ok('GET', '/api/local-jobs/' + job.id)
      assert.equal(result.status, 'succeeded', result.error)
      assert.ok(result.images?.length, 'Desktop observations require raster output')
      return result
    }
    let native = await desktopPerform('desktop.Snapshot', { use_annotation: false })
    await fs.writeFile(path.join(root, '.tmp/local-desktop-before.png'), Buffer.from(native.images[0].data, 'base64'))
    assert.match(native.result, /Agent Studio isolated desktop fixture/)
    await assert.rejects(() => desktopRuntime.execute({ tool: 'desktop.Click', arguments: { loc: [-10000, -10000] } }), /coordinate_denied/)
    await desktopPerform('desktop.Type', { loc: desktopGeometry.input, text: 'Desktop MCP verified', clear: true })
    native = await desktopPerform('desktop.Click', { loc: desktopGeometry.button })
    assert.equal(await fs.readFile(path.join(work, 'desktop-result.txt'), 'utf8'), 'Desktop MCP verified')
    await fs.writeFile(path.join(root, '.tmp/local-desktop-after.png'), Buffer.from(native.images[0].data, 'base64'))
    await fs.writeFile(path.join(work, 'desktop-stop'), '')
    await desktopRuntime.close(); desktopRuntime = null
    await api('/poll', { tools: runtime.tools })
    passed('real Windows-MCP screenshot → approved native typing → click → app result → screenshot; coordinate/freshness restrictions')
  }

  process.env.AGENT_STUDIO_PB_ORIGIN = pbOrigin
  const { preview } = await import('vite')
  const { chromium, expect } = await import('playwright/test')
  await fs.access(path.join(root, 'dist/index.html'))
  uiServer = await preview({ configFile: path.join(root, 'vibex-local/vite.local.config.ts'),
    preview: { port: 0, strictPort: false, open: false }, logLevel: 'error' })
  uiBrowser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await uiBrowser.newPage({ viewport: { width: 1440, height: 1100 } })
  const uiErrors = []; page.on('pageerror', e => uiErrors.push(e.message))
  const uiOrigin = 'http://127.0.0.1:' + uiServer.httpServer.address().port
  await page.goto(uiOrigin + '/login?next=/tool-hub')
  await page.getByLabel('工作邮箱').fill('local@example.test')
  await page.getByLabel('密码', { exact: true }).fill('S3cure-local-test-2026')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const panel = page.getByRole('region', { name: '我的电脑与浏览器', exact: true })
  try { await expect(panel).toBeVisible({ timeout: 30000 }) }
  catch (e) {
    console.error('OFFICE_UI_DIAGNOSTIC', JSON.stringify({ url: page.url(), errors: uiErrors, text: (await page.locator('body').innerText()).slice(-3500) }))
    await page.screenshot({ path: path.join(root, '.tmp/local-office-ui-failed.png'), fullPage: true })
    throw e
  }
  await api('/poll', { tools: runtime.tools })
  await panel.getByRole('button', { name: '刷新设备' }).click()
  await panel.locator('[data-device-id="'+paired.device_id+'"]').getByRole('button',{name:'检查连接',exact:true}).click()
  const workspace=panel.getByRole('region',{name:'系统内文件工作区',exact:true})
  const tabs=panel.getByRole('tablist',{name:'电脑工作区功能',exact:true})
  const claimFromUi=async expectedTool=>{
    let claimed
    await expect.poll(async()=>{if(!claimed)claimed=(await api('/poll',{tools:runtime.tools})).job;return claimed?.input?.tool||''},{timeout:12000}).toBe(expectedTool)
    await executeClaim(api,runtime,claimed)
  }
  await expect(panel.getByLabel('操作参数（JSON）')).toHaveCount(0)
  assert.equal((await api('/poll',{tools:runtime.tools})).job,null,'opening workspace never enqueues work')
  await workspace.getByRole('button',{name:'新建文件',exact:true}).click()
  await workspace.getByLabel('文件操作目标位置').fill('declined-ui.txt')
  await workspace.getByLabel('新建文本内容').fill('must not be written')
  await workspace.getByRole('button',{name:'确认新建',exact:true}).click()
  await page.locator('[data-studio-dialog]').getByRole('button',{name:'取消',exact:true}).click()
  assert.equal((await api('/poll',{tools:runtime.tools})).job,null,'declined plain form must not enqueue')
  await assert.rejects(fs.access(path.join(work,'declined-ui.txt')),{code:'ENOENT'})
  await workspace.getByRole('button',{name:'收起',exact:true}).click()
  await page.locator('[data-studio-dialog]').getByRole('button',{name:'放弃草稿',exact:true}).click()
  await workspace.getByRole('button',{name:'读取目录',exact:true}).click()
  await claimFromUi('files.list')
  await expect(workspace.getByRole('button',{name:'result.txt',exact:true})).toBeVisible({timeout:12000})
  await workspace.getByRole('button',{name:'result.txt',exact:true}).click()
  await workspace.getByRole('button',{name:'读取内容',exact:true}).click()
  await claimFromUi('files.stat');await claimFromUi('files.read')
  await expect(workspace.getByLabel('文件文本编辑器')).toHaveValue(/写入成功/,{timeout:12000})
  await tabs.getByRole('tab',{name:'浏览器',exact:true}).click()
  const quick=panel.getByRole('region',{name:'无需 JSON 的连接检查'})
  const result=quick.getByRole('status',{name:'连接检查结果'})
  await expect(quick.getByLabel('当前自动化浏览器')).toContainText('Google Chrome')
  await quick.getByRole('button',{name:'查看当前网页截图',exact:true}).click()
  await page.locator('[data-studio-dialog]').getByRole('button',{name:'批准这次检查',exact:true}).click()
  await expect(result).toContainText('等待本机连接器领取')
  await executeClaim(api,runtime,(await api('/poll',{tools:runtime.tools})).job)
  await expect(quick.getByAltText('本地操作返回的截图')).toBeVisible({timeout:20000})
  assert.ok(await quick.getByAltText('本地操作返回的截图').evaluate(img=>img.naturalWidth>0))
  await page.screenshot({ path: path.join(root, '.tmp/local-computer-ui.png'), fullPage: true })
  await tabs.getByRole('tab',{name:'办公与 Agent',exact:true}).click()
  await panel.getByText('办公流程：表格汇总 → 文档报告 → 网页录入', { exact: true }).click()
  await panel.getByLabel('办公电脑').selectOption(paired.device_id)
  await panel.getByLabel('源表相对路径').fill('ledger.csv')
  await panel.getByLabel('表单网址（选填）').fill(websiteUrl + '/office')
  await panel.getByRole('button', { name: '创建办公助手并试跑', exact: true }).click()
  await expect(page.getByLabel('本次 Agent 运行任务指令')).toHaveValue(/office\.table_summary/)
  await expect(page.getByLabel('本次可操作的电脑')).toHaveValue(paired.device_id)
  // The resources panel is on-demand below 2xl in the task-first workspace.
  // Verify the exact local device contract without clicking through its modal overlay.
  const config = page.getByRole('region', { name: '本次运行配置', exact: true })
  const showConfig = page.getByRole('button', { name: '打开本次 Agent 配置' })
  const closeConfig = page.getByRole('button', { name: '关闭配置面板' })
  await showConfig.click()
  await expect(config.getByRole('button', { name: /本机已连接/ })).toBeVisible()
  await expect(config.getByRole('button', { name: /项待连接/ })).toHaveCount(0)
  await closeConfig.click()
  await page.getByLabel('本次可操作的电脑').selectOption('')
  await showConfig.click()
  await expect(config.getByRole('button', { name: '1 项待连接', exact: true })).toBeVisible()
  await closeConfig.click()
  await page.getByLabel('本次可操作的电脑').selectOption(paired.device_id)
  await showConfig.click()
  await expect(config.getByRole('button', { name: /本机已连接/ })).toBeVisible()
  await closeConfig.click()
  assert.equal(await page.getByRole('region', { name: '待处理的工具审批', exact: true }).count(), 0)
  await page.screenshot({ path: path.join(root, '.tmp/local-office-ui.png'), fullPage: true })
  passed('real React office configuration → saved employee Agent → prefilled instruction/device without automatic execution')
  await page.goto(uiOrigin + '/agent-run?spec=' + spec.id)
  await expect(page.getByLabel('快速选择 Agent')).toHaveValue(spec.id)
  // This legacy Agent has no local_computer binding. Keep ad-hoc device use
  // available behind an explicit disclosure rather than forcing it on all tasks.
  await expect(page.getByLabel('本次可操作的电脑')).toHaveCount(0)
  await page.getByText('为本次任务使用电脑（可选）', { exact: true }).click()
  await expect(page.getByLabel('本次可操作的电脑')).toBeVisible({ timeout: 15000 })
  await page.getByLabel('本次可操作的电脑').selectOption(paired.device_id)
  await page.goto(uiOrigin + '/agent-run?run=' + visualRun.run_id)
  await expect(page.getByRole('region', { name: '本次任务摘要' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByLabel('本次 Agent 运行任务指令')).toHaveCount(0)
  await expect(page.getByLabel('本次可操作的电脑')).toHaveCount(0)
  await page.getByRole('tab', { name: /^执行过程/ }).click({ timeout: 15000 })
  await page.getByRole('button', { name: '查看本地截图', exact: true }).click({ timeout: 15000 })
  await expect(page.getByAltText('本地操作返回的截图')).toBeVisible()
  assert.ok(await page.getByAltText('本地操作返回的截图').evaluate(img => img.naturalWidth > 0))
  assert.equal(uiErrors.length, 0, uiErrors.join('\n'))
  passed('real React employee login, device list, explicit approval, local execution result and Agent device selection')

  const cancelled = await submit('files.write', { root: 'work', path: 'cancelled.txt', text: 'must not exist' })
  await ok('POST', '/api/local-jobs/' + cancelled.id + '/cancel', {})
  assert.equal((await api('/poll', { tools: runtime.tools })).job, null)
  await assert.rejects(() => fs.access(path.join(work, 'cancelled.txt')), { code: 'ENOENT' })

  const running = await submit('files.write', { root: 'work', path: 'cancel-running.txt', text: 'must not exist' })
  const runningClaim = (await api('/poll', { tools: runtime.tools })).job
  assert.equal(runningClaim.id, running.id)
  const started = Promise.withResolvers()
  let sawAbort = false, runningCompletions = 0
  // A cooperative long-running MCP fixture, with a real server cancellation.
  const executing = executeClaim(async (route, ...args) => {
    if (route.endsWith('/complete')) runningCompletions++
    return api(route, ...args)
  }, { execute: async (_input, signal) => {
    started.resolve()
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('cancellation_not_propagated')), 5000)
      signal.addEventListener('abort', () => { clearTimeout(timeout); sawAbort = true; resolve() }, { once: true })
    })
    return 'cancelled before effect'
  } }, runningClaim)
  await started.promise
  await ok('POST', '/api/local-jobs/' + running.id + '/cancel', {})
  await executing
  assert.equal(sawAbort, true)
  assert.equal(runningCompletions, 0)
  assert.equal((await ok('GET', '/api/local-jobs/' + running.id)).status, 'cancelled')
  await assert.rejects(() => fs.access(path.join(work, 'cancel-running.txt')), { code: 'ENOENT' })
  assert.equal((await api('/poll', { tools: runtime.tools })).job, null)
  passed('running cancellation propagates to the executor without completion overwrite or replay')

  const lostAck = await submit('files.write', { root: 'work', path: 'lost-ack.txt', text: 'performed exactly once' })
  const lostClaim = (await api('/poll', { tools: runtime.tools })).job
  assert.equal(lostClaim.id, lostAck.id)
  let effects = 0, completions = 0
  await assert.rejects(() => executeClaim(async (route, ...args) => {
    const response = await api(route, ...args)
    if (route.endsWith('/complete')) { completions++; throw Error('fixture_ack_lost') }
    return response
  }, { execute: async (...args) => { effects++; return runtime.execute(...args) } }, lostClaim), /fixture_ack_lost/)
  assert.equal(effects, 1)
  assert.equal(completions, 1)
  assert.equal(await fs.readFile(path.join(work, 'lost-ack.txt'), 'utf8'), 'performed exactly once')
  assert.equal((await ok('GET', '/api/local-jobs/' + lostAck.id)).status, 'succeeded')
  assert.equal((await api('/poll', { tools: runtime.tools })).job, null)
  passed('lost completion response does not repeat an actual filesystem effect or redeliver the job')

  const unknown = await submit('files.write', { root: 'work', path: 'unknown.txt', text: 'never retry' })
  await api('/poll', { tools: runtime.tools })
  const db = new DatabaseSync(path.join(data, 'data.db'))
  db.prepare('UPDATE studio_local_jobs SET deadline_ms=0 WHERE id=?').run(unknown.id); db.close()
  assert.equal((await ok('GET', '/api/local-jobs/' + unknown.id)).status, 'unknown')
  assert.equal((await api('/poll', { tools: runtime.tools })).job, null)
  await ok('POST', '/api/local-devices/' + paired.device_id + '/revoke', {})
  await assert.rejects(() => api('/poll', { tools: runtime.tools }), /401/)
  passed('cancellation, expired execution marked unknown without replay, device revocation')
  console.log(JSON.stringify({ status: 'PASS', checks: report.length, realBrowser: true, realPocketBase: true, realDesktop: !!desktopPython, model: 'deterministic fixture; no paid inference' }))
} catch (e) {
  console.error(e.stack)
  console.error(logs.replace(/\/pbinstall\/\S+/g, '/pbinstall/[redacted]').slice(-4000))
  process.exitCode = 1
} finally {
  await uiBrowser?.close()
  if (uiServer) { uiServer.httpServer.closeAllConnections(); await new Promise(r => uiServer.httpServer.close(r)) }
  await runtime?.close()
  await desktopRuntime?.close()
  if (desktopFixture) { await fs.writeFile(path.join(work, 'desktop-stop'), ''); desktopFixture.kill() }
  if (pb) { pb.kill(); await Promise.race([once(pb, 'exit'), pause(3000)]) }
  for (const server of [website, forbidden, model]) { server.closeAllConnections(); await new Promise(r => server.close(r)) }
  for (const dir of [data, work]) {
    const real = await fs.realpath(dir), parent = await fs.realpath(os.tmpdir())
    if (path.dirname(real).toLowerCase() === parent.toLowerCase() && path.basename(real).startsWith('agentstudio-local-'))
      await fs.rm(real, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
