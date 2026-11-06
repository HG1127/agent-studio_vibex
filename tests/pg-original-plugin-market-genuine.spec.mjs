// AUTHORED / UNRUN. One case per fresh disposable PG service. Actual original
// page actions and verified owner repositories/Worker/mTLS; terminal vendor DATA.
import { test, expect, chromium } from '@playwright/test';
import { startOriginalPluginMarketBrowserFixture } from './helpers/pg-original-plugin-market-browser-fixture.mjs';
import { pluginSmitheryKeyData, pluginOwnedNamespace, pluginOwnedSetupUrl } from './helpers/pg-original-plugin-market-terminal-data.mjs';

test('actual original PluginMarket full action paths keep owner, source, consent and original-task boundaries', async ({}, testInfo) => {
  const f = await startOriginalPluginMarketBrowserFixture();
  let browser, page;
  const contexts = [], errors = [], consoleErrors = [], failed = [], bad = [], outside = [];
  const headers = who => ({ 'X-AgentStudio-Expected-Employee': f.users[who], 'X-AgentStudio-Original-Plugins': 'native_original_plugin_market_v1' });
  const attach = p => {
    p.on('pageerror', error => errors.push(String(error)));
    p.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    p.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText }));
    p.on('response', response => { if (response.status() >= 400) bad.push({ url: response.url(), status: response.status() }); });
    p.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== f.browserOrigin) outside.push(request.url()); });
  };
  const wire = (p, route, method, status = 200) => {
    const result = p.waitForResponse(response => new URL(response.url()).pathname === '/__pg_native' + route && response.request().method() === method).then(async response => {
      expect(response.status()).toBe(status); expect(await response.finished()).toBe(null); return response.json();
    }); void result.catch(() => {}); return result;
  };
  const confirm = async (title = '确认本次操作', value) => {
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    if (value !== undefined) await dialog.getByRole('textbox', { name: '提示输入', exact: true }).fill(value);
    await dialog.getByRole('button', { name: '确认', exact: true }).click();
  };
  const login = async (who, p) => {
    await p.goto(f.browserOrigin + '/login?next=%2Fplugin-market');
    await p.getByRole('textbox', { name: '工作邮箱', exact: true }).fill(f.credentials[who].email);
    await p.getByLabel('密码', { exact: true }).fill(f.credentials[who].password);
    await p.getByRole('button', { name: '登录', exact: true }).click();
    await expect(p).toHaveURL(f.url); await expect(p.getByRole('heading', { name: '插件市场', exact: true })).toBeVisible();
    await expect(p.getByRole('heading', { name: '探索插件', exact: true })).toBeVisible();
  };
  const connectionSection = p => p.getByRole('heading', { name: /^我的连接/ }).locator('xpath=ancestor::section[1]');
  const connection = (p, name) => connectionSection(p).locator('li').filter({ has: p.getByText(name, { exact: true }) });
  const marketSection = () => page.getByRole('heading', { name: '工具市场', exact: true }).locator('xpath=ancestor::section[1]');
  const advanced = async () => { const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '高级功能 · MCP 公共注册表' }) }); if (await details.getAttribute('open') === null) await details.locator('summary').click(); await expect(page.getByRole('heading', { name: '工具市场', exact: true })).toBeVisible(); };
  const ownedCount = async who => (await f.db.query('SELECT count(*)::integer AS value FROM agentstudio.mcp_connections WHERE owner_user_id=$1::uuid', [f.users[who]])).rows[0].value;
  const createSeed = async (who, name, suffix) => {
    const reply = await f.request(who, '/api/v2/mcp-connections', { request_id: crypto.randomUUID(), name, description: 'Owned fresh CI seed; no tool execution', url: 'https://tools.example.com/seed/' + suffix, headers: [], enabled: true }, { headers: headers(who) });
    expect(reply.status).toBe(201); return reply.body.item;
  };
  const discoverSeed = async (who, row) => {
    const reply = await f.request(who, '/api/v2/mcp-connections/' + row.id + '/discover', { expected_revision: row.revision }, { headers: headers(who) });
    expect(reply.status).toBe(200); return reply.body.item;
  };
  try {
    const before = await f.counts();
    let aliceSeed, bobSeed;
    if (f.pluginStory === 'registry_connections') {
      for (let i = 0; i < 51; i++) { const row = await createSeed('alice', 'Alice seed MCP ' + i, 'alice-' + i); if (!i) aliceSeed = row; }
      bobSeed = await createSeed('bob', 'Bob isolated MCP', 'bob');
    } else if (f.pluginStory === 'invoke_translation') aliceSeed = await discoverSeed('alice', await createSeed('alice', 'Alice owned invocation MCP', 'invoke'));
    browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors-spki-list=' + f.spki] });
    const context = await browser.newContext({ viewport: { width: 1360, height: 1100 }, serviceWorkers: 'block' }); contexts.push(context);
    page = await context.newPage(); attach(page); await login('alice', page);

    if (f.pluginStory === 'registry_connections') {
      await expect(connectionSection(page).locator('li')).toHaveCount(51);
      await expect(page.getByText('Alice seed MCP 50', { exact: true })).toBeVisible();
      const seedDiscovery = wire(page, '/api/v2/mcp-connections/' + aliceSeed.id + '/discover', 'POST');
      await connection(page, aliceSeed.name).getByRole('button', { name: '重新探测', exact: true }).click(); await confirm(); await seedDiscovery;
      await expect(connection(page, aliceSeed.name).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      await advanced();
      const market = marketSection();
      await expect(market.getByRole('button', { name: '加载更多', exact: true })).toBeEnabled();
      const next = wire(page, '/api/v2/tool-hub/registry', 'GET'); await market.getByRole('button', { name: '加载更多', exact: true }).click(); await next;
      await expect(market.getByText('Synthetic Plugin 7', { exact: true }).first()).toBeVisible();
      await market.getByRole('textbox', { name: '搜索插件', exact: true }).fill('weather');
      const searched = wire(page, '/api/v2/tool-hub/registry', 'GET'); await market.getByRole('button', { name: '搜索', exact: true }).click(); await searched;
      const detail = wire(page, '/api/v2/tool-hub/registry/detail', 'GET'); await market.getByRole('button', { name: '连接 Synthetic Weather', exact: true }).first().click(); await detail;
      await page.getByRole('button', { name: '加一行', exact: true }).click();
      await page.getByPlaceholder('Header 名，如 Authorization', { exact: true }).fill('Authorization');
      await page.getByPlaceholder('Header 值', { exact: true }).fill('Bearer synthetic-registry-preview-only');
      const priorProbeCount = await ownedCount('alice'), ledger = await f.counts();
      const preview = wire(page, '/api/v2/original-ui/plugin-market/discover-preview', 'POST');
      await page.getByRole('button', { name: '探测能力', exact: true }).click(); await confirm('仅发现工具能力'); await preview;
      await expect(page.getByText('echo', { exact: true }).last()).toBeVisible();
      expect(await ownedCount('alice')).toBe(priorProbeCount); expect(await f.counts()).toEqual(ledger);
      const imported = wire(page, '/api/v2/mcp-connections', 'POST', 201);
      await page.getByRole('button', { name: '连接该插件', exact: true }).click(); await confirm();
      const importedRow = (await imported).item;
      const importedDiscovery = wire(page, '/api/v2/mcp-connections/' + importedRow.id + '/discover', 'POST'); await confirm(); await importedDiscovery;
      await page.getByRole('button', { name: '关闭详情', exact: true }).click();
      await expect(connectionSection(page).locator('li')).toHaveCount(52);
      await page.getByRole('button', { name: '高级：连接自建 / 企业内部 MCP', exact: true }).click();
      await page.getByPlaceholder('例如 内部文档检索', { exact: true }).fill('Original owned custom MCP');
      await page.getByPlaceholder('https://mcp.example.com/mcp', { exact: true }).fill('https://tools.example.com/custom-mcp');
      await page.getByPlaceholder('仅发送服务端进行加密连接', { exact: true }).fill('synthetic-custom-private-header');
      const created = wire(page, '/api/v2/mcp-connections', 'POST', 201);
      await page.getByRole('button', { name: '验证并连接', exact: true }).click(); await confirm();
      const custom = (await created).item;
      const customDiscovery = wire(page, '/api/v2/mcp-connections/' + custom.id + '/discover', 'POST'); await confirm(); await customDiscovery;
      const row = connection(page, 'Original owned custom MCP'); await expect(row).toBeVisible();
      const disabled = wire(page, '/api/v2/mcp-connections/' + custom.id, 'PATCH'); await row.getByRole('switch').click(); await confirm(); await disabled;
      await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      const enabled = wire(page, '/api/v2/mcp-connections/' + custom.id, 'PATCH'); await row.getByRole('switch').click(); await confirm(); await enabled;
      await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      await row.getByRole('button', { name: '断开', exact: true }).click(); await row.getByRole('button', { name: '取消', exact: true }).click(); await expect(row).toBeVisible();
      const removed = wire(page, '/api/v2/mcp-connections/' + custom.id, 'DELETE'); await row.getByRole('button', { name: '断开', exact: true }).click(); await row.getByRole('button', { name: '确认', exact: true }).click(); await confirm(); await removed;
      await expect(row).toHaveCount(0); expect(await ownedCount('alice')).toBe(52); expect(await f.counts()).toEqual(before);
      expect(f.terminalData.snapshot().calls.filter(call => call.rpc === 'tools/call')).toHaveLength(0);
    } else if (f.pluginStory === 'smithery_management') {
      await page.getByPlaceholder('粘贴你的 Smithery API Key', { exact: true }).fill(pluginSmitheryKeyData);
      const saved = wire(page, '/api/v2/smithery/key', 'POST'); await page.getByRole('button', { name: '验证并保存', exact: true }).click(); await confirm(); await saved;
      await expect(page.locator('#smithery-namespace')).toBeEnabled(); await page.locator('#smithery-namespace').selectOption(pluginOwnedNamespace);
      await page.getByRole('textbox', { name: '搜索 Smithery 插件名称和功能', exact: true }).fill('weather');
      const search = wire(page, '/api/v2/smithery/catalog', 'POST'); await page.getByRole('button', { name: '搜索插件', exact: true }).click(); await search;
      const more = wire(page, '/api/v2/smithery/catalog', 'POST'); await page.getByRole('button', { name: '加载下一页', exact: true }).click(); await more;
      await expect(page.getByText('Synthetic Page Two', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Synthetic Weather/ }).first().click();
      const connected = wire(page, '/api/v2/smithery/connections', 'POST', 201); await page.getByRole('button', { name: '创建托管连接', exact: true }).click(); await confirm();
      const managed = (await connected).item; expect(managed.state).toBe('auth_required');
      await expect(page.locator('a[href="' + pluginOwnedSetupUrl + '"]')).toBeVisible();
      f.terminalData.authorizeRemoteDATA();
      const refreshed = wire(page, '/api/v2/smithery/connections/' + managed.id + '/refresh', 'POST');
      const discovered = wire(page, '/api/v2/mcp-connections/' + managed.id + '/discover', 'POST');
      await page.getByRole('button', { name: '授权完成，检查工具', exact: true }).click(); await confirm(); await refreshed; await confirm('仅发现工具能力'); await discovered;
      await page.getByRole('button', { name: '关闭插件详情', exact: true }).first().click();
      const row = connection(page, managed.name); await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      const paused = wire(page, '/api/v2/smithery/connections/' + managed.id + '/pause', 'POST'); await row.getByRole('switch').click(); await confirm(); await paused;
      await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      const resumed = wire(page, '/api/v2/smithery/connections/' + managed.id + '/refresh', 'POST'); const rediscovered = wire(page, '/api/v2/mcp-connections/' + managed.id + '/discover', 'POST');
      await row.getByRole('switch').click(); await confirm(); await resumed; await confirm('仅发现工具能力'); await rediscovered;
      await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      const revoked = wire(page, '/api/v2/smithery/connections/' + managed.id + '/revoke', 'POST'); await row.getByRole('button', { name: '断开', exact: true }).click(); await row.getByRole('button', { name: '确认', exact: true }).click(); await confirm(); await revoked;
      const owned = await f.request('alice', '/api/v2/smithery/connections/' + managed.id, undefined, { headers: headers('alice') }); expect(owned.status).toBe(200); expect(owned.body.item.state).toBe('revoked');
      const keyRemoved = wire(page, '/api/v2/smithery/key', 'DELETE'); await page.getByRole('button', { name: '移除 Key', exact: true }).click(); await confirm(); await keyRemoved;
      await expect(page.getByPlaceholder('粘贴你的 Smithery API Key', { exact: true })).toBeVisible();
      expect(await f.counts()).toEqual(before); expect(f.terminalData.snapshot().calls.filter(call => call.rpc === 'tools/call')).toHaveLength(0);
      expect(await page.locator('body').innerText()).not.toContain(pluginSmitheryKeyData);
    } else {
      await expect(connection(page, aliceSeed.name)).toBeVisible(); await advanced(); await connection(page, aliceSeed.name).getByRole('button', { name: '试调', exact: true }).click();
      const invoke = page.getByRole('heading', { name: '在线试调', exact: true }).locator('xpath=ancestor::section[1]');
      await invoke.getByRole('combobox').nth(1).selectOption('echo'); await invoke.locator('textarea').fill('{"text":"hello original page"}');
      const run = () => invoke.getByRole('button', { name: '准备 / 核对这次试调', exact: true });
      const submission = wire(page, '/api/v2/tool-hub/trials', 'POST', 201); await run().click(); await confirm('确认本次可能的费用'); await confirm();
      const receipt = (await submission).receipt; expect(receipt.worker_started_by_api).toBe(false);
      expect(f.terminalData.snapshot().calls.filter(call => call.rpc === 'tools/call')).toHaveLength(0);
      expect((await f.drive(receipt.run_id)).run.status).toBe('awaiting_approval');
      const decision = wire(page, '/api/v2/workflow-v2-runs/' + receipt.run_id + '/decision', 'POST'); await run().click(); await confirm('批准原任务这一步'); await decision;
      expect((await f.drive(receipt.run_id, ['succeeded', 'failed', 'paused'])).run.status).toBe('succeeded');
      await expect(invoke.locator('pre')).toContainText('Owned MCP DATA: hello original page');
      expect(f.terminalData.snapshot().calls.filter(call => call.rpc === 'tools/call')).toHaveLength(1);
      await advanced(); const market = marketSection();
      await market.getByRole('textbox', { name: '搜索插件', exact: true }).fill('weather'); const search = wire(page, '/api/v2/tool-hub/registry', 'GET'); await market.getByRole('button', { name: '搜索', exact: true }).click(); await search;
      const translation = wire(page, '/api/v2/tool-hub/trials', 'POST', 201); await market.getByRole('button', { name: '翻译简介', exact: true }).click();
      await confirm('选择本人模型', '1'); await confirm('确认本次可能的费用'); await confirm();
      const translated = (await translation).receipt; expect((await f.drive(translated.run_id)).run.status).toBe('awaiting_approval');
      const translatedDecision = wire(page, '/api/v2/workflow-v2-runs/' + translated.run_id + '/decision', 'POST'); await market.getByRole('button', { name: '翻译简介', exact: true }).click(); await confirm('批准原任务这一步'); await translatedDecision;
      expect((await f.drive(translated.run_id, ['succeeded', 'failed', 'paused'])).run.status).toBe('succeeded');
      await expect(market.getByText('合成天气目录', { exact: true }).first()).toBeVisible();
      const log = page.getByRole('heading', { name: '调用留档', exact: true }).locator('xpath=ancestor::section[1]');
      await expect(log.locator('li')).toHaveCount(1); await log.locator('li').first().getByRole('button').click();
      await expect(log).toContainText(receipt.run_id);
      expect((await f.counts()).trials).toBe(before.trials + 2); expect(f.network.model).toBe(1);
    }
    await page.screenshot({ path: testInfo.outputPath('original-plugin-market-' + f.pluginStory + '.png'), fullPage: true });
    const bobContext = await browser.newContext({ viewport: { width: 375, height: 950 }, serviceWorkers: 'block' }); contexts.push(bobContext);
    const bobPage = await bobContext.newPage(); attach(bobPage); await login('bob', bobPage);
    expect(await bobPage.locator('body').innerText()).not.toContain('Original owned custom MCP');
    expect(await bobPage.locator('body').innerText()).not.toContain('Alice seed MCP 50');
    if (bobSeed) await expect(connection(bobPage, bobSeed.name)).toBeVisible();
    if (aliceSeed) { const foreign = await f.request('bob', '/api/v2/mcp-connections/' + aliceSeed.id, undefined, { headers: headers('bob') }); expect(foreign.status).toBe(404); }
    expect(errors).toEqual([]); expect(consoleErrors).toEqual([]); expect(failed).toEqual([]); expect(bad).toEqual([]); expect(outside).toEqual([]);
  } finally { for (const context of contexts) await context.close(); await browser?.close(); await f.close(); }
});
