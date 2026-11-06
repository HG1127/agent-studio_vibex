// AUTHORED/UNRUN. One original ToolHub story per fresh disposable PG service.
// Actual main/App, Native Cookie, original Worker, private mTLS and Broker.
// Only final DNS and HTTP response DATA are synthetic; no public-provider claim.
import { test, expect, chromium } from '@playwright/test';
import { createHash, X509Certificate } from 'node:crypto';
import { startOriginalWebPagesFixture } from './helpers/pg-original-web-pages-fixture.mjs';
import { originalWebCitationUrl, originalWebCitationText } from './helpers/pg-original-web-terminal-data.mjs';

test('actual original Web ToolHub: fee/approval, citations, owner fences, cancellation and original unknown-result reads', async ({}, testInfo) => {
  const f = await startOriginalWebPagesFixture();
  let browser, page, inflight;
  const contexts = [], exceptions = [], consoleErrors = [], failedRequests = [], badResponses = [], outside = [], dialogs = [], unexpectedDialogs = [];
  let declineFee = f.webStory === 'search_citations';
  const attach = p => {
    p.on('pageerror', error => exceptions.push(String(error)));
    p.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    p.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    p.on('response', response => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
    p.on('request', request => { const u = new URL(request.url()); if (['http:', 'https:'].includes(u.protocol) && u.origin !== f.browserOrigin) outside.push(request.url()); });
    p.on('dialog', async dialog => {
      const message = dialog.message();
      const kind = message.startsWith('核对本次工具的费用') ? 'fee' : message.startsWith('提交这一次工具试调') ? 'effect' : message.startsWith('批准本次工具步骤') ? 'step' : message.startsWith('关闭调试台前取消这一次原任务') ? 'cancel' : 'unexpected';
      dialogs.push(kind);
      if (kind === 'unexpected') { unexpectedDialogs.push(dialog.type()); await dialog.dismiss(); }
      else if (kind === 'fee' && declineFee) { declineFee = false; await dialog.dismiss(); }
      else await dialog.accept();
    });
  };
  const login = async (who, p) => {
    await p.goto(f.browserOrigin + '/login?next=%2Ftool-hub%3Fview%3Ddebug');
    await p.getByRole('textbox', { name: '工作邮箱', exact: true }).fill(f.credentials[who].email);
    await p.getByLabel('密码', { exact: true }).fill(f.credentials[who].password);
    await p.getByRole('button', { name: '登录', exact: true }).click();
    await expect(p).toHaveURL(f.url);
    await expect(p.getByRole('heading', { name: '验证工具是否可执行', exact: true })).toBeVisible();
    await expect(p.getByRole('button', { name: '刷新当前视图', exact: true })).toBeEnabled();
  };
  const wire = (route, method, action) => {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/__pg_native' + route && r.request().method() === method);
    void response.catch(() => {});
    return (async () => { await action(); const r = await response; expect(await r.finished()).toBe(null); return r; })();
  };
  try {
    expect(f.originalHomeReadOnly).toBe(true);
    const spki = createHash('sha256').update(new X509Certificate(f.serverTls.cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors-spki-list=' + spki] });
    const context = await browser.newContext({}); contexts.push(context);
    page = await context.newPage(); attach(page); await login('alice', page);
    const debug = page.locator('#debug-console');
    const run = () => debug.getByRole('button', { name: '真实调用', exact: true });
    const search = f.webStory !== 'fetch_cancel';
    await page.getByRole('button', { name: search ? /网页搜索/ : /网页抓取/ }).click();
    if (search) { await debug.locator('#th-query').fill('synthetic original query'); await debug.locator('#th-limit').fill('5'); }
    else await debug.locator('#th-url').fill('https://public.example.com/story');
    const before = await f.counts();
    if (f.webStory === 'search_citations') {
      await run().click(); await expect.poll(() => dialogs.length).toBe(1); await expect(run()).toBeEnabled();
      expect(dialogs).toEqual(['fee']); expect(await f.counts()).toEqual(before); expect(f.webData.snapshot().calls).toHaveLength(0);
    }
    const submitted = await wire('/api/v2/tool-hub/trials', 'POST', () => run().click());
    expect(submitted.status()).toBe(201);
    const receipt = (await submitted.json()).receipt;
    expect(receipt.fee_confirmed).toBe(true); expect(receipt.worker_started_by_api).toBe(false);
    await expect(run()).toBeEnabled();
    expect((await f.counts()).trials).toBe(before.trials + 1);
    expect(f.webData.snapshot().calls).toHaveLength(0);
    const identity = await f.identityFor('alice');
    const pending = (await f.drive(receipt.run_id)).pending_effect;
    expect(pending.kind).toBe('tool'); expect(f.webData.snapshot().calls).toHaveLength(0);
    const approved = await wire('/api/v2/workflow-v2-runs/' + receipt.run_id + '/decision', 'POST', () => run().click());
    expect(approved.status()).toBe(200); await expect(run()).toBeEnabled();
    expect(dialogs.filter(kind => kind === 'effect')).toHaveLength(1); expect(dialogs.filter(kind => kind === 'step')).toHaveLength(1);
    expect(f.webData.snapshot().calls).toHaveLength(0);
    if (f.webStory === 'fetch_cancel') {
      inflight = (async () => { for (let i = 0; i < 8 && !f.webData.snapshot().dns.length; i++) await f.worker.tick(); })();
      void inflight.catch(() => {});
      let timer;
      try { await Promise.race([f.webData.entered, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('original_web_actual_worker_DNS_barrier_not_entered')), 15000); })]); }
      finally { clearTimeout(timer); }
      expect(f.webData.snapshot().calls).toHaveLength(0);
      const cancelled = await wire('/api/v2/workflow-v2-runs/' + receipt.run_id + '/cancel', 'POST', () => debug.getByRole('button', { name: '关闭调试台', exact: true }).click());
      expect(cancelled.status()).toBe(200); expect(dialogs.filter(kind => kind === 'cancel')).toHaveLength(1);
      f.webData.release(); await inflight; inflight = null;
      expect((await f.runs.get(identity, receipt.run_id)).run.status).toBe('cancelled');
      expect(f.webData.snapshot().calls).toHaveLength(0);
      await expect(debug.getByText('从左侧选一个工具，这里会出现它的真实入参表单', { exact: true })).toBeVisible();
    } else {
      for (let i = 0; i < 8 && !f.webData.snapshot().calls.length; i++) await f.worker.tick();
      expect(f.webData.snapshot().calls).toHaveLength(1);
      if (f.webStory === 'search_citations') {
        expect((await f.drive(receipt.run_id, ['succeeded', 'failed', 'paused'])).run.status).toBe('succeeded');
        const refreshed = await wire('/api/v2/workflow-v2-runs/' + receipt.run_id, 'GET', () => page.getByRole('button', { name: '刷新当前视图', exact: true }).click());
        expect(refreshed.status()).toBe(200); await expect(debug.getByText('调用成功', { exact: true })).toBeVisible();
        expect(JSON.parse(await debug.locator('pre').innerText())).toEqual([{ title: 'Owned synthetic citation', url: originalWebCitationUrl, snippet: originalWebCitationText }]);
        expect(await debug.innerText()).not.toContain('FIRST rejected snippet'); expect(await debug.innerText()).not.toContain('127.0.0.1');
      } else {
        const effects = (await f.db.query('SELECT status FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text', [f.users.alice, receipt.run_id, 'wf2_tool:' + pending.step_key])).rows;
        expect(effects).toEqual([{ status: 'unknown' }]);
        const afterUnknown = await f.counts();
        for (let i = 0; i < 2; i++) {
          const originalRead = await wire('/api/v2/workflow-v2-runs/' + receipt.run_id, 'GET', () => run().click());
          expect(originalRead.status()).toBe(200); await expect(run()).toBeEnabled();
          expect(await f.counts()).toEqual(afterUnknown); expect(f.webData.snapshot().calls).toHaveLength(1);
        }
        await expect(debug.getByText('调用成功', { exact: true })).toHaveCount(0);
        const confirmation = await f.request('alice', '/api/v2/tool-hub/trials/' + receipt.request_id + '/confirm?request_sha256=' + receipt.request_sha256);
        expect(confirmation.status).toBe(200); expect(confirmation.body.confirmed).toBe(true); expect(confirmation.body.receipt.run_id).toBe(receipt.run_id);
        expect(await f.counts()).toEqual(afterUnknown); expect(f.webData.snapshot().calls).toHaveLength(1);
      }
    }
    // Real Bob Cookie and verified expected-owner fence, not a fabricated identity.
    const foreign = await f.request('bob', '/api/v2/workflow-v2-runs/' + receipt.run_id, undefined, { headers: { 'X-AgentStudio-Expected-Employee': f.users.bob } });
    expect(foreign.status).toBe(404);
    const bobContext = await browser.newContext({}); contexts.push(bobContext);
    const bobPage = await bobContext.newPage(); attach(bobPage); await login('bob', bobPage);
    expect(await bobPage.locator('body').innerText()).not.toContain(receipt.run_id);
    expect(await bobPage.locator('body').innerText()).not.toContain(originalWebCitationText);
    expect((await f.trials.list(await f.identityFor('bob'), undefined, 50)).items).toHaveLength(0);
    expect(f.webData.snapshot().attempts).toBe(f.webStory === 'fetch_cancel' ? 0 : 1);
    expect(f.webData.snapshot().ends).toBe(f.webStory === 'fetch_cancel' ? 0 : 1);
    expect(Object.values(f.network).reduce((sum, count) => sum + count, 0)).toBe(0);
    expect(exceptions).toEqual([]); expect(consoleErrors).toEqual([]); expect(failedRequests).toEqual([]); expect(badResponses).toEqual([]); expect(outside).toEqual([]); expect(unexpectedDialogs).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('original-web-' + f.webStory + '.png'), fullPage: true });
  } finally {
    f.webData.release();
    try { await inflight; } finally { for (const context of contexts) await context.close(); await browser?.close(); await f.close(); }
  }
});
