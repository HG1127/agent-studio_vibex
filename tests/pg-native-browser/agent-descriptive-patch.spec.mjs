import {test, expect, chromium} from '@playwright/test'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {requireNativeBrowserCi} from './ci-guard.mjs'

// Actual Cookie/HTTP and protected057/045/055/060 fixture paths. This is a
// hosted-CI story, not independent TCP PG18/Worker/provider evidence.
test('Native descriptive patch: provided fields, explicit clearing, lost original recovery and employee isolation', async ({}, testInfo) => {
  const approved = requireNativeBrowserCi(), root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]))
  Object.assign(env, {AGENT_STUDIO_PG_BROWSER_FIXTURE: 'SYNTHETIC_LOCAL_ONLY'})
  for (const name of ['AUTONOMOUS', 'HUMAN', 'MEMORY', 'OUTCOME_MEMORY', 'DERIVED_MEMORY', 'FAILURE_SOURCE', 'FEEDBACK', 'OPTIMIZATION', 'REVIEW', 'GENERATED_ACCEPTANCE', 'DESCRIPTIVE_PATCH'])
    env['AGENT_STUDIO_PG_BROWSER_' + name] = 'true'
  const child = spawn(process.execPath, ['--experimental-strip-types', path.join(root, 'services/pg-api/tests/helpers/native-run-browser-fixture.mjs')], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true})
  let output = '', timer, browser, context, page, control, releaseLate, lateDelivery
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('synthetic_descriptive_patch_fixture_timeout')), 45000)
    const chunk = data => {
      output = (output + data.toString()).slice(-32768)
      for (const line of output.split(/\r?\n/)) if (line.startsWith('{"synthetic_only":true,')) try {resolve(JSON.parse(line))} catch {}
    }
    child.stdout.on('data', chunk); child.stderr.on('data', chunk); child.once('error', reject)
    child.once('exit', code => reject(Error('synthetic_descriptive_patch_fixture_exit_' + code + ' ' + output.slice(-1500))))
  })
  try {
    const info = await ready; clearTimeout(timer)
    expect(new URL(info.url).origin).toBe(approved.origin)
    expect(Number.isSafeInteger(info.apiPort) && info.apiPort > 1024 && info.apiPort < 65536).toBe(true)
    control = async (name, method = 'POST') => {
      const reply = await fetch('http://127.0.0.1:' + info.apiPort + '/__fixture/' + name, {method,
        headers: {'X-AgentStudio-Synthetic-Fixture': '1'}, signal: AbortSignal.timeout(15000)})
      expect(reply.status).toBe(200); return reply.json()
    }
    browser = await chromium.launch({headless: true})
    context = await browser.newContext({viewport: {width: 1280, height: 1000}, serviceWorkers: 'block'})
    const external = [], submitted = []
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== approved.origin) {external.push(route.request().url()); await route.abort()}
      else await route.continue()
    })
    page = await context.newPage()
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname
      if (request.method() === 'POST' && /\/api\/v2\/agent-descriptive-patches\/(accept|confirm)$/.test(pathname))
        submitted.push({path: pathname, body: request.postData()})
    })
    await page.goto(info.url, {waitUntil: 'domcontentloaded'})
    const login = async who => {
      await page.getByRole('textbox', {name: '员工邮箱', exact: true}).fill(who + '@example.com')
      await page.getByLabel('密码', {exact: true}).fill(who === 'alice' ? 'SyntheticAlicePassword#2026' : 'SyntheticBobPassword#2026')
      await page.getByRole('button', {name: '登录独立工作台', exact: true}).click()
      await expect(page.getByRole('button', {name: '多轮 Agent', exact: true})).toBeVisible()
    }
    await login('alice'); await page.getByRole('button', {name: '多轮 Agent', exact: true}).click()
    await page.getByRole('combobox', {name: '多轮 Agent 角色', exact: true}).selectOption({label: 'Alice Browser Agent · gpt-4.1-mini'})
    await page.getByRole('combobox', {name: '本次方案审核', exact: true}).selectOption('off')
    await page.getByRole('combobox', {name: '最多规划轮数', exact: true}).selectOption('1')
    await page.getByRole('textbox', {name: '多轮任务要求', exact: true}).fill('合成描述补丁任务：仅应用模型已提供字段，未提供字段沿用，空交付列表明确清空。')
    await page.getByRole('button', {name: '提交多轮任务', exact: true}).click()
    await page.getByRole('button', {name: '取消任务', exact: true}).click()
    await page.getByRole('button', {name: '确认取消此任务', exact: true}).click()
    const review = page.getByRole('region', {name: 'AI 任务评估与优化建议', exact: true})
    await review.getByRole('button', {name: '查看与准备 AI 意见', exact: true}).click()
    const purpose = review.getByRole('combobox', {name: 'AI 意见用途', exact: true})
    const prepareOpinion = async selectedPurpose => {
      await purpose.selectOption(selectedPurpose)
      await review.getByRole('combobox', {name: 'AI 意见模型连接', exact: true}).selectOption((await control('state', 'GET')).reviewModel)
      await review.getByRole('combobox', {name: 'AI 意见模型', exact: true}).selectOption('synthetic-review-b')
      if (selectedPurpose === 'optimize') await review.getByRole('checkbox', {name: '选用本次任务的当前反馈', exact: true}).check()
      await review.getByRole('button', {name: '预览这次 AI 意见', exact: true}).click()
      const fee = review.getByRole('checkbox', {name: '确认本次 AI 意见的模型费用', exact: true})
      await expect(fee).not.toBeChecked(); await fee.check()
      await review.getByRole('button', {name: selectedPurpose === 'evaluate' ? '确认费用并提交任务评估' : '确认费用并提交角色优化建议', exact: true}).click()
      await expect(review.getByRole('button', {name: '核对当前来源与状态', exact: true})).toBeEnabled()
      await control('review-complete'); await review.getByRole('button', {name: '核对当前来源与状态', exact: true}).click()
      await expect(review.getByLabel(selectedPurpose === 'evaluate' ? 'AI 任务评估结果' : 'AI 角色优化建议', {exact: true})).toBeVisible()
      return (await control('state', 'GET')).reviewScopes.find(row => row.purpose === selectedPurpose).request_id
    }
    const evaluationId = await prepareOpinion('evaluate')
    const feedback = page.getByRole('region', {name: '任务反馈', exact: true})
    await feedback.getByRole('combobox', {name: '任务评价', exact: true}).selectOption('down')
    await feedback.getByRole('textbox', {name: '反馈补充意见', exact: true}).fill('合成当前反馈：改进目标；显式清空交付列表；其余字段保持当前值。')
    await feedback.getByRole('checkbox', {name: '确认提交此反馈', exact: true}).check()
    await feedback.getByRole('button', {name: '提交任务反馈', exact: true}).click()
    await expect(feedback.getByRole('button', {name: '删除此任务反馈及教训', exact: true})).toBeEnabled()
    const reviewId = await prepareOpinion('optimize')
    const patch = page.getByRole('region', {name: '接受模型提供的描述补丁', exact: true})
    const previewButton = patch.getByRole('button', {name: '预览描述补丁对角色的修改', exact: true})
    await expect(previewButton).toBeEnabled()
    let state = await control('state', 'GET')
    const before = structuredClone(state.optimizationCurrent), beforeRevision = Number(before.revision)
    expect(before.deliverables.length).toBeGreaterThan(0)
    expect(state.descriptivePatchHashes).toEqual([])
    expect(state.descriptivePatchAcceptances).toBe(0); expect(state.descriptivePatchRefs).toBe(0); expect(state.descriptivePatchAudits).toBe(0)
    expect(state.optimizationLinks).toBe(0); expect(state.optimizationIntents).toBe(0); expect(state.generatedAcceptances).toBe(0)
    // The legacy complete-five-field family must reject this actual partial result.
    const legacy = await page.evaluate(async target => {
      const response = await fetch('/__pg_native/api/v2/agent-generated-acceptances/preview', {method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-AgentStudio-Request': '1'}, body: JSON.stringify({action: 'preview', ...target})})
      return {status: response.status, body: await response.json()}
    }, {review_id: reviewId, spec_id: state.optimizationRole, target_run_id: state.reviewScopes.find(row => row.request_id === reviewId).run_id})
    expect(legacy.status).toBe(409); expect(legacy.body.error).toBe('agent_generated_complete_output_required')
    const [previewReply] = await Promise.all([
      page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith('/api/v2/agent-descriptive-patches/preview') && reply.status() === 200), previewButton.click(),
    ])
    const wire = await previewReply.json()
    expect(wire.protocol).toBe('agent_descriptive_patch_preview_v1'); expect(wire.mode).toBe('provided_fields')
    expect(wire.source.review_id).toBe(reviewId); expect(wire.model_patch.provided_keys).toEqual(['goal', 'deliverables'])
    expect(wire.changed_keys).toEqual(['goal', 'deliverables'])
    expect(Object.keys(wire.model_patch.descriptive).sort()).toEqual(['deliverables', 'goal'])
    expect(wire.before.descriptive.deliverables).toEqual(before.deliverables); expect(wire.candidate.descriptive.deliverables).toEqual([])
    expect(wire.candidate.descriptive.goal).not.toBe(wire.before.descriptive.goal)
    for (const key of ['task_scope', 'task_plan', 'done_criteria']) expect(wire.candidate.descriptive[key]).toEqual(wire.before.descriptive[key])
    const comparison = patch.getByRole('region', {name: '描述补丁提供字段与实际变化', exact: true})
    await expect(comparison).toBeVisible(); await expect(comparison).toContainText('模型提供 2 项 · 实际变化 2 项')
    await expect(patch.getByRole('region', {name: '交付内容补丁对比', exact: true})).toContainText('明确空列表：接受后清空此字段。')
    for (const label of ['任务范围', '任务计划', '完成标准']) await expect(patch.getByRole('region', {name: label + '补丁对比', exact: true})).toContainText('模型未提供 · 沿用当前值')
    const consent = patch.getByRole('checkbox', {name: '同意应用这份描述补丁修改配置', exact: true})
    const accept = patch.getByRole('button', {name: '确认接受描述补丁并修改配置', exact: true})
    await expect(consent).not.toBeChecked(); await expect(accept).toBeDisabled()
    await expect(patch.locator('input')).toHaveCount(1); await expect(patch.locator('textarea, select, [contenteditable="true"]')).toHaveCount(0)
    state = await control('state', 'GET')
    expect(state.descriptivePatchAcceptances).toBe(0); expect(state.optimizationIntents).toBe(0); expect(submitted).toHaveLength(0)
    expect(Number(state.optimizationCurrent.revision)).toBe(beforeRevision)
    await patch.scrollIntoViewIfNeeded(); await page.screenshot({path: testInfo.outputPath('native-descriptive-patch-preview-desktop.png'), fullPage: true})
    await page.setViewportSize({width: 390, height: 844}); await expect(comparison).toBeVisible()
    const mobileBox = await patch.boundingBox(); expect(mobileBox).not.toBeNull(); expect(mobileBox.x).toBeGreaterThanOrEqual(0); expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(391)
    await patch.scrollIntoViewIfNeeded(); await page.screenshot({path: testInfo.outputPath('native-descriptive-patch-preview-mobile.png'), fullPage: true})
    await page.setViewportSize({width: 1280, height: 1000}); await expect(consent).not.toBeChecked()
    const readsBeforeAccept = (await control('state', 'GET')).generatedAcceptanceAgentsReads
    await consent.check(); await control('drop-next-descriptive-patch'); await accept.click()
    const confirm = patch.getByRole('button', {name: '核对原描述补丁请求', exact: true})
    const pending = patch.getByRole('region', {name: '待核对的原描述补丁请求', exact: true})
    await expect(confirm).toBeEnabled(); await expect(pending).toContainText('配置修改结果尚未确认')
    expect(submitted).toHaveLength(1)
    const originalBody = submitted[0].body, original = JSON.parse(originalBody)
    expect(Object.keys(original).sort()).toEqual(['action', 'request_id', 'review_id', 'spec_id', 'target_run_id', 'anchor_run_id', 'anchor_feedback_id',
      'expected_preview_sha256', 'expected_result_sha256', 'expected_patch_sha256', 'expected_spec_revision', 'expected_spec_sha256', 'expected_candidate_sha256', 'confirm', 'acceptance_acknowledgement'].sort())
    expect(original.review_id).toBe(reviewId); expect(original.expected_patch_sha256).toBe(wire.model_patch.patch_sha256)
    expect(original.expected_preview_sha256).toBe(wire.preview_sha256); expect(original.acceptance_acknowledgement).toBe('APPROVE_EXACT_GENERATED_DESCRIPTIVE_PATCH_V1')
    state = await control('state', 'GET')
    expect(state.descriptivePatchAcceptances).toBe(1); expect(state.descriptivePatchRefs).toBe(1); expect(state.descriptivePatchAudits).toBe(1)
    expect(state.optimizationLinks).toBe(1); expect(state.optimizationIntents).toBe(1); expect(Number(state.optimizationCurrent.revision)).toBe(beforeRevision + 1)
    expect(state.optimizationCurrent.goal).toBe(wire.candidate.descriptive.goal); expect(state.optimizationCurrent.deliverables).toEqual([])
    for (const key of ['name', 'scope', 'plan', 'criteria', 'tools']) expect(state.optimizationCurrent[key]).toEqual(before[key])
    expect(state.optimizationCurrent.model_preserved).toBe(true); expect(state.generatedAcceptances).toBe(0)
    expect(state.generatedAcceptanceAgentsReads).toBe(readsBeforeAccept)
    // An incoming evaluation selection must not replace the unknown original.
    await purpose.selectOption('evaluate'); await review.getByRole('button', {name: '读取历史意见 ' + evaluationId, exact: true}).click()
    await expect(pending).toContainText(reviewId); await expect(pending).toContainText(original.request_id)
    // First establish success above; erase only through the existing owner privacy flow.
    await purpose.selectOption('optimize'); await review.getByRole('button', {name: '读取历史意见 ' + reviewId, exact: true}).click()
    await review.getByRole('button', {name: '删除本次意见正文', exact: true}).click()
    await review.getByRole('checkbox', {name: '确认删除本次 AI 意见正文', exact: true}).check()
    await review.getByRole('button', {name: '确认删除正文', exact: true}).click()
    await expect(review.getByText('本次意见的输入与结果正文已删除，历史请求和执行摘要保留。', {exact: true})).toBeVisible()
    await expect(pending).toContainText(original.request_id)
    state = await control('state', 'GET'); expect(state.reviewOutputs).toBe(1); expect(state.reviewTombstones).toBe(1)
    await page.getByRole('button', {name: /^Agent 配置/}).first().click(); await expect(patch).toBeHidden()
    await control('deny-descriptive-patch'); await control('deny-generated-acceptance'); await control('disable-review-model'); await control('deny-review')
    const refresh = page.getByRole('button', {name: '刷新', exact: true})
    await control('drop-next-descriptive-patch-capabilities')
    await Promise.all([page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith('/api/native-auth/capabilities') && reply.status() === 503), refresh.click()])
    await expect(refresh).toBeEnabled()
    const [closed] = await Promise.all([page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith('/api/native-auth/capabilities') && reply.status() === 200), refresh.click()])
    const capabilities = await closed.json()
    expect(capabilities.agent_descriptive_patch_available).toBe(true); expect(capabilities.agent_descriptive_patch_enabled).toBe(false)
    await expect(refresh).toBeEnabled(); await page.getByRole('button', {name: '多轮 Agent', exact: true}).click()
    await expect(confirm).toBeEnabled(); await expect(pending).toContainText(original.request_id)
    state = await control('state', 'GET'); const readsBeforeConfirm = state.generatedAcceptanceAgentsReads
    const [confirmedReply] = await Promise.all([
      page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith('/api/v2/agent-descriptive-patches/confirm') && reply.status() === 200), confirm.click(),
    ])
    const recorded = await confirmedReply.json(), receipt = patch.getByRole('region', {name: '描述补丁配置接受回执', exact: true})
    await expect(receipt).toBeVisible(); await expect(receipt).toContainText(original.request_id)
    expect(recorded.recorded).toBe(true); expect(recorded.replayed).toBe(true); expect(recorded.provided_keys).toEqual(['goal', 'deliverables'])
    expect(recorded.changed_keys).toEqual(['goal', 'deliverables']); expect(recorded.patch_sha256).toBe(original.expected_patch_sha256)
    expect(submitted).toHaveLength(2); expect(submitted[1].path).toMatch(/\/confirm$/); expect(submitted[1].body).toBe(originalBody)
    await expect.poll(async () => (await control('state', 'GET')).generatedAcceptanceAgentsReads).toBe(readsBeforeConfirm + 1)
    state = await control('state', 'GET')
    expect(state.descriptivePatchHashes.map(row => row.operation)).toEqual(['accept', 'confirm'])
    expect(state.descriptivePatchHashes.map(row => row.request_id)).toEqual([original.request_id, original.request_id])
    const originalSha = createHash('sha256').update(originalBody).digest('hex')
    expect(state.descriptivePatchHashes.map(row => row.sha256)).toEqual([originalSha, originalSha])
    expect(state.descriptivePatchAcceptances).toBe(1); expect(state.descriptivePatchRefs).toBe(1); expect(state.descriptivePatchAudits).toBe(1)
    expect(state.optimizationLinks).toBe(1); expect(state.optimizationIntents).toBe(1); expect(state.optimizationHistory).toHaveLength(1)
    expect(Number(state.optimizationHistory[0].before_revision)).toBe(beforeRevision); expect(Number(state.optimizationHistory[0].after_revision)).toBe(beforeRevision + 1)
    expect(state.descriptivePatchWitnesses).toHaveLength(1)
    const witness = state.descriptivePatchWitnesses[0]
    expect(witness.request_id).toBe(original.request_id); expect(witness.review_id).toBe(reviewId); expect(witness.spec_id).toBe(original.spec_id)
    expect(witness.target_run_id).toBe(original.target_run_id); expect(witness.source_kind).toBe('feedback_generated_descriptive_patch'); expect(witness.source_protocol).toBe('employee_statement_anchor_v1')
    expect(witness.anchor_run_id).toBe(original.anchor_run_id); expect(witness.anchor_feedback_id).toBe(original.anchor_feedback_id)
    expect(witness.provided_keys).toEqual(['goal', 'deliverables']); expect(witness.changed_keys).toEqual(['goal', 'deliverables']); expect(witness.patch_sha256).toBe(original.expected_patch_sha256)
    expect(Number(witness.before_spec_revision)).toBe(beforeRevision); expect(Number(witness.after_spec_revision)).toBe(beforeRevision + 1)
    expect(witness.before_revision_id).not.toBe(witness.after_revision_id); expect(witness.receipt_sha256).toBe(recorded.receipt_sha256)
    expect(state.generatedAcceptances).toBe(0); expect(state.generatedAcceptanceRefs).toBe(0); expect(state.generatedAcceptanceAudits).toBe(0)
    const stable = state => ({current: state.optimizationCurrent, history: state.optimizationHistory, links: state.optimizationLinks, intents: state.optimizationIntents,
      acceptances: state.descriptivePatchAcceptances, refs: state.descriptivePatchRefs, audits: state.descriptivePatchAudits, witnesses: state.descriptivePatchWitnesses,
      hashes: state.descriptivePatchHashes, agentReads: state.generatedAcceptanceAgentsReads, reviewRequests: state.reviewRequests, reviewEffects: state.reviewEffects,
      reviewOutputs: state.reviewOutputs, reviewTombstones: state.reviewTombstones, reviewSyntheticCompletions: state.reviewSyntheticCompletions})
    const beforeGet = stable(state), known = patch.getByRole('button', {name: '读取已有描述补丁回执', exact: true})
    await Promise.all([page.waitForResponse(reply => new URL(reply.url()).pathname.endsWith('/api/v2/agent-descriptive-patches/reviews/' + reviewId) && reply.status() === 200), known.click()])
    await expect(receipt).toContainText(original.request_id); expect(stable(await control('state', 'GET'))).toEqual(beforeGet)
    expect(submitted).toHaveLength(2); expect(state.reviewSyntheticCompletions).toBe(2)
    expect(await page.evaluate(async id => (await fetch('/__pg_native/api/v2/agent-generated-acceptances/reviews/' + id)).status, reviewId)).toBe(404)
    expect(await patch.textContent()).not.toMatch(/SyntheticBrowser.*Key|"messages"|lease_token|owner_user_id|api_key/)
    await receipt.scrollIntoViewIfNeeded(); await page.screenshot({path: testInfo.outputPath('native-descriptive-patch-accepted-receipt.png'), fullPage: true})
    // Hold one actual Alice response. New Bob requests continue normally; do
    // not unroute an active handler or manufacture a successful receipt body.
    let heldResponse, delivered, rejected, claimed = false
    const held = new Promise(resolve => {heldResponse = resolve}), late = new Promise(resolve => {releaseLate = resolve})
    lateDelivery = new Promise((resolve, reject) => {delivered = resolve; rejected = reject}); void lateDelivery.catch(() => {})
    const receiptPath = '/__pg_native/api/v2/agent-descriptive-patches/reviews/' + reviewId
    const hold = async route => {
      if (claimed) {await route.continue(); return}
      claimed = true
      try {
        const response = await route.fetch(); expect(response.status()).toBe(200); expect((await response.json()).request_id).toBe(original.request_id)
        heldResponse(); await late; await route.fulfill({response}); delivered()
      } catch (error) {rejected(error); throw error}
    }
    await context.route('**' + receiptPath, hold)
    const lateReceipt = page.waitForResponse(response => new URL(response.url()).pathname === receiptPath && response.status() === 200)
    await known.click(); await held
    await page.getByRole('button', {name: '退出', exact: true}).click(); await login('bob')
    releaseLate(); await lateDelivery; expect(await (await lateReceipt).finished()).toBeNull()
    await context.unroute('**' + receiptPath, hold)
    await page.getByRole('button', {name: '多轮 Agent', exact: true}).click()
    await expect(page.getByRole('region', {name: '描述补丁配置接受回执', exact: true})).toHaveCount(0)
    await expect(page.getByRole('region', {name: '待核对的原描述补丁请求', exact: true})).toHaveCount(0)
    await expect(page.getByRole('button', {name: '核对原描述补丁请求', exact: true})).toHaveCount(0)
    expect(await page.evaluate(async id => (await fetch('/__pg_native/api/v2/agent-descriptive-patches/reviews/' + id)).status, reviewId)).toBe(404)
    expect(external).toEqual([])
  } finally {
    releaseLate?.(); clearTimeout(timer)
    if (context) await context.close(); if (browser) await browser.close(); if (control) await control('stop').catch(() => {})
    if (typeof child.pid === 'number' && child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
      let forced, deadline
      const done = () => {clearTimeout(forced); clearTimeout(deadline); child.off('exit', done); resolve()}
      child.once('exit', done); forced = setTimeout(() => child.kill('SIGTERM'), 5000); deadline = setTimeout(() => {child.kill('SIGKILL'); done()}, 10000)
    })
  }
})
