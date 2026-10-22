/**
 * Isolated employee-authenticated UI acceptance. Uses temporary PocketBase SQLite,
 * a deterministic local model/MCP fixture, and real Chromium. This checks product
 * wiring and persistence, not model intelligence, external services, or deployment.
 * POCKETBASE_BIN, AGENT_STUDIO_UI_CHROME_BIN and AGENT_STUDIO_PLAYWRIGHT_MODULE
 * may override locally installed test dependencies. Screenshots stay in os.tmpdir().
 */
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const playwrightPath = process.env.AGENT_STUDIO_PLAYWRIGHT_MODULE || path.join(root, "node_modules", "playwright", "index.mjs")
function firstExisting(paths, label) {
  const found = paths.filter(Boolean).find(candidate => fs.existsSync(candidate))
  assert.ok(found, `Missing ${label}. Checked: ${paths.filter(Boolean).join(", ")}`)
  return found
}
function pocketBaseBinary() {
  return firstExisting([
    process.env.POCKETBASE_BIN,
    path.join(root, "vibex-local", "bin", "windows", "pocketbase.exe"),
    "/tmp/agentstudio-test-bin/pocketbase",
  ], "PocketBase test binary")
}
function chromeBinaryPath() {
  const localBrowsers = process.env.LOCALAPPDATA && fs.existsSync(path.join(process.env.LOCALAPPDATA, "ms-playwright"))
    ? fs.readdirSync(path.join(process.env.LOCALAPPDATA, "ms-playwright"))
      .filter(name => name.startsWith("chromium-"))
      .flatMap(name => [
        path.join(process.env.LOCALAPPDATA, "ms-playwright", name, "chrome-win64", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA, "ms-playwright", name, "chrome-win", "chrome.exe"),
      ])
    : []
  return firstExisting([
    process.env.AGENT_STUDIO_UI_CHROME_BIN,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    ...localBrowsers,
    "/tmp/agentstudio-test-bin/chrome-linux64/chrome",
  ], "Chromium/Chrome test executable")
}async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function ready(url, child, logs) {
  const deadline = Date.now() + 35_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Fixture server exited: " + logs().slice(-400))
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).status < 500) return } catch {}
    await delay(150)
  }
  throw new Error("Fixture server did not become ready: " + logs().slice(-400))
}
async function visible(locator) { await locator.waitFor({ state: "visible", timeout: 30_000 }) }

test("design workspace: real login, editable capabilities, role grants, resource return and versioned trial", { timeout: 300_000 }, async () => {
  const pbBinary = pocketBaseBinary()
  const chromeBinary = chromeBinaryPath()
  const vite = path.join(root, "node_modules/vite/bin/vite.js")
  for (const file of [vite, playwrightPath]) assert.ok(fs.existsSync(file), "Missing local test dependency: " + file)
  const { chromium } = await import(pathToFileURL(playwrightPath).href)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-design-db-"))
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-design-evidence-"))
  const [pbPort, uiPort] = await Promise.all([freePort(), freePort()])
  const apiOrigin = `http://127.0.0.1:${pbPort}`
  const webOrigin = `http://127.0.0.1:${uiPort}`
  const setupKey = randomBytes(32).toString("hex")
  const email = `design-${randomBytes(6).toString("hex")}@example.test`
  const password = "Fixture-" + randomBytes(20).toString("hex") + "!"
  let pb, frontend, fixture, browser, page, token = "", pbLogs = "", viteLogs = "", selectedToolId = ""
  let designCalls = 0, revisionCalls = 0, approvalModelCalls = 0, inputModelCalls = 0, mcpCalls = 0
  const complexToolCalls = { browser_page_inspect: 0, document_extract: 0, spreadsheet_analyze: 0, send_email: 0 }
  const complexRoleTurns = { researcher: 0, documenter: 0, analyst: 0, reviewer: 0, sender: 0 }
  const complexToolIds = { browser_page_inspect: "", document_extract: "", spreadsheet_analyze: "", send_email: "" }
  const errors = []
  const results = []
  const capabilityRequirements = [
    { id: "browser_need", title: "浏览器操作", purpose: "读取授权网页", kind: "browser", access: "read", required: true, role_ids: [], search_terms: ["browser"], suggested_tool_ids: [] },
    { id: "desktop_need", title: "电脑软件操作", purpose: "整理本地表格", kind: "desktop", access: "write", required: false, role_ids: [], search_terms: ["desktop"], suggested_tool_ids: [] },
  ]
  const screenshot = async (name, target = page) => {
    const file = path.join(evidenceDir, name + ".png")
    await target.screenshot({ path: file, fullPage: false, animations: "disabled" })
    return file
  }
  async function api(method, route, body) {
    const response = await fetch(apiOrigin + route, {
      method, headers: { "Content-Type": "application/json", Authorization: token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
    })
    const data = await response.json().catch(() => ({}))
    assert.equal(response.status, 200, `${route}: ${data.error || response.status}`)
    return data
  }
  try {
    fixture = createServer(async (req, res) => {
      try {
        let raw = ""
        for await (const part of req) raw += part
        const input = JSON.parse(raw || "{}")
        res.setHeader("Content-Type", "application/json")
        if (req.url === "/mcp") {
          let result
          if (input.method === "tools/list") result = { tools: [
            { name: "browser_page_inspect", description: "Inspect a test browser page", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: { query: { type: "string" } } } },
            { name: "send_email", description: "Send email through the local acceptance fixture; no email is delivered", annotations: { readOnlyHint: false, destructiveHint: false }, inputSchema: { type: "object", properties: { body: { type: "string" } } } },
            { name: "document_extract", description: "Extract text and source locations from an authorized local PDF fixture", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: { document_id: { type: "string" } } } },
            { name: "spreadsheet_analyze", description: "Analyze a bounded local spreadsheet fixture and return deterministic totals", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: { sheet_id: { type: "string" } } } },
          ] }
          else if (input.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "design-ui-fixture", version: "1" } }
          else {
            if (input.method === "tools/call") {
              mcpCalls++
              const name = input.params?.name
              if (Object.hasOwn(complexToolCalls, name)) complexToolCalls[name]++
            }
            const name = input.params?.name
            const evidence = name === "browser_page_inspect" ? "SOURCE_EVIDENCE: fixture issuer reported revenue 120 and risk factor R1; source URL https://fixture.invalid/issuer" :
              name === "document_extract" ? "PDF_EVIDENCE: audited note 7 confirms liabilities 30; page 4; document fixture-report.pdf" :
              name === "spreadsheet_analyze" ? "SHEET_EVIDENCE: revenue 120 - liabilities 30 = net metric 90; row references 2,4" :
              name === "send_email" ? "LOCAL_EMAIL_FIXTURE: message accepted by fixture only; no real email sent" :
              "FIXTURE_TOOL_EVIDENCE: approved local MCP call completed"
            result = { content: [{ type: "text", text: evidence }] }
          }
          res.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result })); return
        }
        if (req.method === "GET" && req.url?.endsWith("/models")) { res.end(JSON.stringify({ data: [{ id: "design-ui-fixture-model" }] })); return }
        const system = (input.messages || []).filter(item => item.role === "system").map(item => item.content).join("\n")
        const user = (input.messages || []).filter(item => item.role === "user").map(item => item.content).join("\n")
        let content = "Local UI fixture response; no external intelligence evaluation."
        if (system.includes("助手方案设计器")) {
          designCalls++
          content = JSON.stringify({ name: "设计工作台验收助手", goal: "规划浏览器资料读取与电脑软件表格整理，交付可核验报告", task_scope: "只设计和核验授权步骤，不自行扩大工具权限", deliverables: ["研究报告", "来源记录"], tools: ["calculate"], task_plan: ["读取批准的页面", "用电脑软件整理表格", "核验报告"], done_criteria: ["报告包含核心结论和来源"], roles: [], require_plan_review: false,
            capability_requirements: capabilityRequirements })
        } else if (system.includes("助手方案修订器")) {
          revisionCalls++
          const request = JSON.parse(user)
          content = JSON.stringify({ ...request.current, name: "设计工作台验收助手（已修订）", goal: request.current.goal + "；补充证据索引" })
        } else if (system.includes("助手执行引擎") && user.includes("COMPLEX_AGENT_ACCEPTANCE")) {
          const roleId = ["researcher", "documenter", "analyst", "reviewer", "sender"].find(id => system.includes("（" + id + "）")) || "unknown"
          const plan = {
            researcher: { tool: "browser_page_inspect", input: { query: "issuer revenue and risk" }, output: "Research evidence captured with source URL." },
            documenter: { tool: "document_extract", input: { document_id: "fixture-report.pdf" }, output: "PDF note 7 extracted with page citation." },
            analyst: { tool: "spreadsheet_analyze", input: { sheet_id: "fixture-financials.xlsx" }, output: "Spreadsheet arithmetic cross-checked." },
            reviewer: { output: "Reviewed source URL, PDF page 4 and spreadsheet rows 2,4; revenue 120, liabilities 30, derived metric 90. No unsupported claims." },
            sender: { tool: "send_email", input: { body: "Approved local acceptance report: revenue 120; liabilities 30; metric 90; source fixture.invalid; PDF p.4; sheet rows 2,4." }, output: "FINAL_DUE_DILIGENCE_REPORT: revenue 120; liabilities 30; metric 90; source https://fixture.invalid/issuer; PDF p.4; spreadsheet rows 2,4; risk R1; LOCAL_EMAIL_FIXTURE accepted locally; no real email sent." },
          }
          const current = plan[roleId]
          if (!current) content = JSON.stringify({ action: "final", final_answer: "ERROR: unknown complex acceptance role " + roleId })
          else {
            const turn = ++complexRoleTurns[roleId]
            if (current.tool && turn === 1) content = JSON.stringify({ action: "tool", tool: complexToolIds[current.tool], tool_input: current.input, thought: "Run only the explicitly authorized local fixture action." })
            else if (roleId === "sender") content = JSON.stringify({ action: "final", final_answer: current.output, thought: "Return the reviewed report after the approved local delivery fixture." })
            else content = JSON.stringify({ action: "role_complete", role_id: roleId, role_output: current.output })
          }
        } else if (system.includes("助手执行引擎") && user.includes("DESIGN_WORKSPACE_APPROVAL")) {
          approvalModelCalls++
          content = JSON.stringify(approvalModelCalls === 1 ? { action: "tool", tool: selectedToolId, tool_input: { query: "test-only" }, thought: "Use the approved fixture tool" } : { action: "final", final_answer: "核心结论：本地审批链路已完成。来源：FIXTURE_TOOL_EVIDENCE。仅为界面验收数据。", thought: "Return the fixture evidence" })
        } else if (system.includes("助手执行引擎") && user.includes("DESIGN_WORKSPACE_INPUT")) {
          inputModelCalls++
          content = JSON.stringify(inputModelCalls === 1 ? { action: "ask_user", question: "请确认本次验收只使用本地测试数据。", thought: "Wait for the actual employee response" } : { action: "final", final_answer: "核心结论：已接收用户确认并完成测试交付。仅为界面验收数据。", thought: "The employee replied" })
        }
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }))
      } catch { res.statusCode = 500; res.end(JSON.stringify({ error: "local_fixture_failed" })) }
    })
    await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve))
    const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`
    pb = spawnHeadlessPocketBase(pbBinary, ["serve", `--http=127.0.0.1:${pbPort}`, `--dir=${dataDir}`, `--hooksDir=${path.join(root, "pocketbase/pb_hooks")}`], {
      cwd: path.join(root, "pocketbase"), stdio: ["ignore", "pipe", "pipe"], env: {
        AGENT_STUDIO_AUTH_MODE: "standalone", AGENT_STUDIO_ALLOW_ANON: "false", AGENT_STUDIO_LEGACY_TEST_ONLY: "false",
        AGENT_STUDIO_BOOTSTRAP_SECRET: setupKey, AGENT_STUDIO_SECRET_KEY: randomBytes(16).toString("hex"),
        AGENT_STUDIO_STRICT_SECRETS: "true", AGENT_STUDIO_BACKGROUND_WORKER: "false",
      },
    })
    for (const stream of [pb.stdout, pb.stderr]) stream.on("data", chunk => { pbLogs = (pbLogs + chunk).slice(-5000) })
    await ready(apiOrigin + "/api/health", pb, () => pbLogs)
    const bootstrap = await fetch(apiOrigin + "/api/studio/bootstrap", { method: "POST", headers: { "Content-Type": "application/json", "X-Agent-Studio-Setup-Key": setupKey }, body: JSON.stringify({ email, password, display_name: "Design UI Test Employee" }) })
    assert.equal(bootstrap.status, 201)
    const login = await fetch(apiOrigin + "/api/collections/studio_users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: email, password }) })
    assert.equal(login.status, 200); token = (await login.json()).token
    await api("POST", "/api/model-connections", { name: "Local design UI fixture", provider: "openai", base_url: fixtureOrigin + "/v1", api_key: "local-fixture-only", models: ["design-ui-fixture-model"] })
    frontend = spawn(process.execPath, [vite, "--config", "vibex-local/vite.local.config.ts", "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, AGENT_STUDIO_PB_ORIGIN: apiOrigin, VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED: "false" } })
    for (const stream of [frontend.stdout, frontend.stderr]) stream.on("data", chunk => { viteLogs = (viteLogs + chunk).slice(-5000) })
    await ready(webOrigin + "/login", frontend, () => viteLogs)
    browser = await chromium.launch({ executablePath: chromeBinary, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    page = await context.newPage(); page.setDefaultTimeout(25_000)
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(webOrigin + "/login?next=%2Fagent-create")
    await page.getByLabel("工作邮箱", { exact: true }).fill(email)
    await page.getByLabel("密码", { exact: true }).fill(password)
    await page.getByRole("button", { name: "登录", exact: true }).click()
    await page.waitForURL("**/agent-create")
    results.push("employee UI login without injected credentials or browser auth state")

    await page.locator("#agent-requirement").fill("DESIGN_WORKSPACE_CREATE 创建一个需要浏览器读取资料、电脑软件整理表格并核验报告的助手。")
    await page.getByRole("button", { name: "生成 Agent 方案", exact: true }).click()
    await page.getByRole("button", { name: "进入方案编辑", exact: true }).click()
    const initialModules = page.getByRole("tablist", { name: "Agent 方案设计模块" })
    await initialModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    const initialHarness = page.getByRole("region", { name: "Harness 能力规划", exact: true })
    const browserCard = initialHarness.getByRole("article", { name: "能力需求：浏览器操作", exact: true })
    await browserCard.getByRole("button", { name: "编辑需求", exact: true }).click()
    await browserCard.getByLabel(/^用途与具体动作/).fill("UNAPPLIED_CAPABILITY_DRAFT")
    await initialModules.getByRole("tab", { name: /^角色与任务/ }).click()
    await initialModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    assert.equal(await browserCard.getByLabel(/^用途与具体动作/).inputValue(), "UNAPPLIED_CAPABILITY_DRAFT", "Unapplied capability edits survive module switches")
    await browserCard.getByRole("button", { name: "取消", exact: true }).click()
    await browserCard.getByRole("button", { name: "编辑需求", exact: true }).click()
    await browserCard.getByRole("checkbox", { name: /^必需能力/ }).uncheck()
    await browserCard.getByRole("button", { name: "应用需求修改", exact: true }).click()
    await visible(browserCard.getByText(/^可选\s*·/))
    await initialHarness.getByRole("button", { name: /^重新匹配/ }).click()
    await initialModules.getByRole("tab", { name: /^角色与任务/ }).click()
    await initialModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    await visible(browserCard.getByText(/^可选\s*·/))
    await browserCard.getByRole("button", { name: "编辑需求", exact: true }).click()
    await browserCard.getByRole("checkbox", { name: /^必需能力/ }).check()
    await browserCard.getByRole("button", { name: "应用需求修改", exact: true }).click()
    await browserCard.getByRole("button", { name: "编辑需求", exact: true }).click()
    await browserCard.getByRole("button", { name: "删除需求", exact: true }).click()
    assert.equal(await browserCard.count(), 0)
    await initialModules.getByRole("tab", { name: /^角色与任务/ }).click()
    await initialModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    await initialHarness.getByRole("button", { name: "撤销删除", exact: true }).click()
    await visible(browserCard)
    const [unsavedResourcePage] = await Promise.all([
      page.waitForEvent("popup"), browserCard.getByRole("link", { name: "配置执行环境", exact: true }).click(),
    ])
    const unsavedBanner = unsavedResourcePage.getByRole("region", { name: "继续配置 Agent", exact: true })
    await visible(unsavedBanner.getByText("当前方案尚未保存，请保留原标签页。", { exact: true }))
    assert.equal(await unsavedBanner.getByRole("link", { name: "打开已保存的 Agent", exact: true }).count(), 0)
    assert.equal(new URL(unsavedResourcePage.url()).searchParams.get("agentSetup"), "1")
    assert.equal(new URL(unsavedResourcePage.url()).searchParams.get("returnCapability"), "browser_need")
    assert.equal(new URL(unsavedResourcePage.url()).searchParams.get("returnSpec"), null)
    await unsavedResourcePage.close()
    await visible(browserCard)
    results.push("unsaved capability edits survive module changes; optional/delete/undo are explicit and connection refresh preserves them; resource setup preserves the original draft")

    await initialModules.getByRole("tab", { name: /^角色与任务/ }).click()
    await page.getByRole("button", { name: "角色分工", exact: true }).click()
    const roleDesigner = page.getByRole("region", { name: "角色与任务分工", exact: true })
    const editedRole = { name: "资料研究员（界面验收）", responsibility: "仅处理授权资料；将证据交给后续角色", tasks: ["核对授权范围", "记录原始来源"], inputs: ["用户需求", "授权资料"], deliverables: ["来源记录", "未解决问题"], done_criteria: ["每条结论能追溯来源"], tools: ["calculate"] }
    for (const [key, label] of [["name", "角色名称"], ["responsibility", "职责边界"], ["tasks", "负责的任务"], ["inputs", "需要的输入"], ["deliverables", "交给下一阶段的成果"], ["done_criteria", "完成标准"]]) {
      const value = editedRole[key]
      await roleDesigner.getByLabel(new RegExp("^" + label)).fill(Array.isArray(value) ? value.join("\n") : value)
    }
    const calculatorGrant = roleDesigner.getByRole("checkbox", { name: "允许资料研究员（界面验收）调用计算器", exact: true })
    await calculatorGrant.check()
    await roleDesigner.getByRole("button", { name: "单助手", exact: true }).click()
    await initialModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    await initialModules.getByRole("tab", { name: /^角色与任务/ }).click()
    await roleDesigner.getByRole("button", { name: "恢复角色分工", exact: true }).click()
    assert.equal(await roleDesigner.getByLabel(/^角色名称/).inputValue(), editedRole.name)
    assert.equal(await roleDesigner.getByLabel(/^职责边界/).inputValue(), editedRole.responsibility)
    assert.equal(await calculatorGrant.isChecked(), true, "Restoring role organization across tabs preserves its explicit grant")
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/api/agent_specs") && response.request().method() === "POST")
    await page.getByRole("button", { name: "保存到我的助手", exact: true }).click()
    let saved = await (await savedResponse).json()
    assert.ok(saved.id); assert.ok(saved.spec.roles?.length >= 2)
    for (const [key, value] of Object.entries(editedRole)) assert.deepEqual(saved.spec.roles[0][key], value)
    const savedOnServer = await api("GET", "/api/agent_specs/" + saved.id)
    assert.deepEqual(savedOnServer.spec.roles, saved.spec.roles)
    assert.deepEqual(savedOnServer.spec.capability_requirements, capabilityRequirements)
    results.push("model-fixture creation, editable role stages, cross-tab organization recovery, and server-persisted role/capability contracts")

    await page.getByRole("button", { name: "随时调整 Agent 方案", exact: true }).click()
    const drawer = page.getByRole("dialog", { name: "随时调整 Agent 创建方案", exact: true })
    const modules = drawer.getByRole("tablist", { name: "Agent 方案设计模块" })
    assert.equal(await modules.getByRole("tab").count(), 4)
    for (const label of ["目标与交付", "角色与任务", "工具与资料", "完成标准"]) {
      const tab = modules.getByRole("tab", { name: new RegExp("^" + label) })
      await tab.click()
      assert.equal(await tab.getAttribute("aria-selected"), "true")
    }
    await modules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    const harness = drawer.getByRole("region", { name: "Harness 能力规划" })
    await visible(harness)
    assert.equal(await harness.getByRole("button", { name: /^重新匹配/ }).count(), 1, "The capability plan has one rematch entry")
    assert.equal(await drawer.getByRole("heading", { name: /AI 需求识别.*自动匹配工具/ }).count(), 0, "The old duplicate tool summary must be absent")
    await screenshot("design-workspace")
    await drawer.getByLabel("方案修改要求", { exact: true }).fill("补充证据索引并更新名称；保留我的角色和工具授权。")
    await drawer.getByRole("button", { name: "生成修改预览", exact: true }).click()
    await visible(drawer.getByRole("region", { name: "AI 方案修改预览", exact: true }))
    const nameField = drawer.getByRole("textbox", { name: "助手名称", exact: true })
    assert.equal(await nameField.inputValue(), saved.name, "A proposal must not overwrite the current draft")
    assert.deepEqual((await api("GET", "/api/agent_specs/" + saved.id)).spec, saved.spec)
    await drawer.getByRole("button", { name: "应用到草稿", exact: true }).click()
    assert.equal(await nameField.inputValue(), "设计工作台验收助手（已修订）")
    assert.deepEqual((await api("GET", "/api/agent_specs/" + saved.id)).spec, saved.spec, "Applying to a draft must not save implicitly")
    const revisionSavedResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/api/agent_specs/" + saved.id) && response.request().method() === "PATCH")
    await drawer.getByRole("button", { name: "保存到我的助手", exact: true }).click()
    const revisionResponse = await revisionSavedResponse
    assert.equal(revisionResponse.status(), 200)
    saved = await revisionResponse.json()
    assert.equal(saved.name, "设计工作台验收助手（已修订）")
    assert.match(saved.spec.goal, /补充证据索引/)
    assert.deepEqual(saved.spec.roles, savedOnServer.spec.roles)
    assert.deepEqual(saved.spec.capability_requirements, capabilityRequirements)
    await drawer.getByRole("button", { name: "Close", exact: true }).click()
    results.push("four design modules and capability recommendations; AI proposals require explicit apply and save and preserve role/capability contracts")

    await page.goto(`${webOrigin}/agent-create?spec=${saved.id}&step=3`)
    const executionLink = page.getByRole("link", { name: "配置执行环境", exact: true }).first()
    await visible(executionLink)
    const [executionPage] = await Promise.all([page.waitForEvent("popup"), executionLink.click()])
    await visible(executionPage.getByRole("heading", { name: "浏览器与电脑工具", exact: true }))
    assert.equal(new URL(executionPage.url()).searchParams.get("returnSpec"), saved.id)
    assert.equal(new URL(executionPage.url()).searchParams.get("returnCapability"), "browser_need")
    const savedReturnBanner = executionPage.getByRole("region", { name: "继续配置 Agent", exact: true })
    await visible(savedReturnBanner.getByText("此入口不包含原标签中未保存的修改", { exact: true }))
    await visible(executionPage.getByText("还没有这类连接", { exact: true }))
    assert.match(await executionPage.locator("#execution-inventory-heading").locator("..").locator("..").innerText(), /0 个连接/)
    await screenshot("execution-empty-state", executionPage)
    await savedReturnBanner.getByRole("link", { name: "打开已保存的 Agent", exact: true }).click()
    await executionPage.waitForURL(url => url.pathname === "/agent-create" && url.searchParams.get("spec") === saved.id)
    assert.equal(await executionPage.getByRole("textbox", { name: "助手名称", exact: true }).inputValue(), saved.name)
    assert.equal(new URL(executionPage.url()).searchParams.get("focusCapability"), "browser_need")
    await executionPage.waitForFunction(() => document.activeElement?.getAttribute("data-capability-id") === "browser_need")
    await executionPage.close()
    results.push("real empty execution inventory, honest saved-versus-unsaved return guidance, and exact capability focus on saved-Agent return")

    await page.goto(`${webOrigin}/agent-run?spec=${saved.id}`)
    await page.waitForFunction(id => document.querySelector("#spec-select")?.value === id && Boolean(document.querySelector("#model-select")?.value), saved.id)
    await page.locator("#agent-task-instruction").fill("验证直接进入试跑时，未接入的必需浏览器能力会阻止启动。")
    const readiness = page.getByRole("region", { name: "新任务启动检查", exact: true })
    await visible(readiness.getByText("浏览器操作：请连接工具或调整能力需求", { exact: true }))
    assert.equal(await page.getByRole("button", { name: "运行", exact: true }).isDisabled(), true)
    assert.equal(await readiness.getByRole("link", { name: "配置电脑与浏览器", exact: true }).getAttribute("href"), "/execution-connections")
    await screenshot("run-blocked-missing-capability")
    results.push("direct trial entry blocks a missing required browser capability and exposes its repair entry")

    const market = await api("POST", "/api/market/connect", { name: "design_browser_fixture", title: "本地浏览器验收连接", url: fixtureOrigin + "/mcp", headers: [] })
    assert.equal(market.ok, true); selectedToolId = `mkt__${market.connection.id}__browser_page_inspect`
    const emailToolId = `mkt__${market.connection.id}__send_email`
    complexToolIds.browser_page_inspect = selectedToolId
    complexToolIds.document_extract = `mkt__${market.connection.id}__document_extract`
    complexToolIds.spreadsheet_analyze = `mkt__${market.connection.id}__spreadsheet_analyze`
    complexToolIds.send_email = emailToolId
    const emailNeed = { id: "email_need", title: "发送邮件", purpose: "发送经用户确认的报告邮件", kind: "integration", access: "write", required: true, role_ids: [], search_terms: ["email"], suggested_tool_ids: [] }
    const mappingSpec = await api("POST", "/api/agent_specs", { name: "邮件能力映射验收助手", spec: { goal: "通过授权邮件连接发送报告", task_scope: "仅验证界面映射，不实际发送邮件", tools: [emailToolId], task_plan: ["发送确认后的邮件"], deliverables: ["邮件发送记录"], done_criteria: ["返回发送回执"], require_approval: true, capability_requirements: [emailNeed] } })
    await page.goto(`${webOrigin}/agent-create?spec=${mappingSpec.id}&step=3`)
    const emailCard = page.getByRole("region", { name: "Harness 能力规划" }).getByRole("article", { name: "能力需求：发送邮件", exact: true })
    await visible(emailCard.getByText("有候选 · 待选择", { exact: true }))
    await emailCard.locator("summary").filter({ hasText: /^选用已有连接/ }).click()
    const emailChoice = emailCard.getByRole("button", { name: /send_email.*选用工具/ })
    assert.equal(await emailChoice.getAttribute("aria-pressed"), "false", "A global tool grant alone is not a capability mapping")
    await emailChoice.click()
    await visible(emailCard.getByText("已选用", { exact: true }))
    assert.equal(await emailCard.getByRole("button", { name: /send_email/ }).getAttribute("aria-pressed"), "true")
    const mappingSavedResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/api/agent_specs/" + mappingSpec.id) && response.request().method() === "PATCH")
    await page.getByRole("button", { name: "保存到我的助手", exact: true }).click()
    assert.equal((await mappingSavedResponse).status(), 200)
    const mappingSaved = await api("GET", "/api/agent_specs/" + mappingSpec.id)
    assert.deepEqual(mappingSaved.spec.capability_requirements[0], { ...emailNeed, suggested_tool_ids: [emailToolId] })
    assert.equal(mcpCalls, 0, "Selecting a capability never invokes the sending tool")
    await screenshot("explicit-capability-mapping")
    results.push("a verified send_email tool without a suggested ID requires explicit mapping even when globally selected; the mapping persists without invoking it")

    await page.getByRole("button", { name: "随时调整 Agent 方案", exact: true }).click()
    const mappingDrawer = page.getByRole("dialog", { name: "随时调整 Agent 创建方案", exact: true })
    const mappingModules = mappingDrawer.getByRole("tablist", { name: "Agent 方案设计模块" })
    await mappingModules.getByRole("tab", { name: /^角色与任务/ }).click()
    await mappingDrawer.getByRole("button", { name: "角色分工", exact: true }).click()
    await mappingModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    const roleEmailCard = mappingDrawer.getByRole("article", { name: "能力需求：发送邮件", exact: true })
    await visible(roleEmailCard.getByText("需要分配角色", { exact: true }))
    const roleEmailChoice = roleEmailCard.getByRole("button", { name: /send_email.*选用并分配/ })
    assert.equal(await roleEmailChoice.isDisabled(), true, "An unowned capability cannot silently grant a tool to every role")
    await roleEmailCard.getByRole("checkbox", { name: "方案执行", exact: true }).check()
    assert.equal(await roleEmailChoice.isEnabled(), true)
    assert.equal(await roleEmailChoice.getAttribute("aria-pressed"), "false", "Selecting an owner is not itself a tool grant")
    await visible(roleEmailCard.getByText("需要分配角色", { exact: true }))
    await roleEmailChoice.click()
    await visible(roleEmailCard.getByText("已选用", { exact: true }))
    const roleMappingResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/api/agent_specs/" + mappingSpec.id) && response.request().method() === "PATCH")
    await mappingDrawer.getByRole("button", { name: "保存到我的助手", exact: true }).click()
    assert.equal((await roleMappingResponse).status(), 200)
    const roleMappingSaved = await api("GET", "/api/agent_specs/" + mappingSpec.id)
    assert.deepEqual(roleMappingSaved.spec.capability_requirements[0].role_ids, ["executor"])
    assert.deepEqual(roleMappingSaved.spec.capability_requirements[0].suggested_tool_ids, [emailToolId])
    for (const role of roleMappingSaved.spec.roles) assert.deepEqual(role.tools, role.id === "executor" ? [emailToolId] : [], "Only the explicitly selected owner receives the capability's tool")
    assert.equal(mcpCalls, 0)
    await screenshot("role-capability-assignment")
    await mappingDrawer.getByRole("button", { name: "Close", exact: true }).click()
    results.push("an unassigned capability requires an explicit owner and allocation action; only that role receives the tool and the grant persists")

    const runSpec = await api("POST", "/api/agent_specs", { name: "运行页面验收助手", spec: { goal: "在真实引擎中验证工具审批和用户补充流程", task_scope: "仅使用隔离的本地测试数据", tools: [selectedToolId], task_plan: ["请求工具调用并等待批准", "交付测试报告"], deliverables: ["测试报告"], done_criteria: ["结果包含核心结论"], require_approval: true, require_plan_review: false } })
    await page.goto(`${webOrigin}/agent-run?spec=${runSpec.id}`)
    await page.waitForFunction(id => document.querySelector("#spec-select")?.value === id && Boolean(document.querySelector("#model-select")?.value), runSpec.id)
    assert.equal(await page.locator("#run-config-content").isVisible(), false)
    assert.equal(await page.locator('[role="switch"]:visible').count(), 0)
    await page.getByRole("button", { name: "本次设置", exact: true }).click()
    const settings = page.getByRole("tablist", { name: "运行设置分类" })
    for (const label of ["模型与工具", "完成标准与确认", "执行预算", "方案步骤"]) {
      await settings.getByRole("tab", { name: label, exact: true }).click()
      assert.equal(await settings.getByRole("tab", { name: label, exact: true }).getAttribute("aria-selected"), "true")
    }
    await page.getByRole("button", { name: "收起本次运行设置", exact: true }).click()
    await screenshot("run-ready-summary")
    results.push("collapsed run summary and all four configuration tabs")

    async function startRun(instruction) {
      await page.locator("#agent-task-instruction").fill(instruction)
      const response = page.waitForResponse(item => new URL(item.url()).pathname.endsWith("/api/agent-runs/start") && item.request().method() === "POST")
      await page.getByRole("button", { name: "运行", exact: true }).click()
      const started = await (await response).json()
      assert.ok(started.run_id); return started.run_id
    }
    const approvalRunId = await startRun("DESIGN_WORKSPACE_APPROVAL 调用本地测试工具并交付报告。")
    const approvalButton = page.getByRole("button", { name: "批准并继续执行", exact: true })
    await visible(approvalButton); assert.equal(mcpCalls, 0)
    assert.equal((await api("GET", "/api/agent_runs/" + approvalRunId)).status, "awaiting_approval")
    const workspace = page.getByRole("tablist", { name: "运行工作区" })
    for (const name of ["成果与反馈", /^执行过程/, "验收条件", "长期记忆"]) {
      await workspace.getByRole("tab", { name }).click(); assert.equal(await approvalButton.isVisible(), true)
    }
    await workspace.getByRole("tab", { name: "验收条件", exact: true }).click()
    await page.getByRole("button", { name: "添加断言", exact: true }).click()
    const assertionInput = page.getByPlaceholder("例如：风险提示 / 核心结论", { exact: true })
    await assertionInput.fill("UNSAVED_UI_DRAFT")
    await workspace.getByRole("tab", { name: "长期记忆", exact: true }).click()
    await workspace.getByRole("tab", { name: "验收条件", exact: true }).click()
    assert.equal(await assertionInput.inputValue(), "UNSAVED_UI_DRAFT")
    await screenshot("approval-visible-with-quality-draft")
    await workspace.getByRole("tab", { name: "成果与反馈", exact: true }).click()
    await approvalButton.click()
    await visible(page.getByRole("heading", { name: "运行成果", exact: true }))
    assert.equal((await api("GET", "/api/agent_runs/" + approvalRunId)).status, "succeeded")
    assert.equal(mcpCalls, 1)
    assert.match(await page.getByRole("region", { name: "当前运行状态与下一步" }).innerText(), /资源使用，不代表完成比例/)
    await screenshot("run-result")
    results.push("approval remains visible across all run tabs, draft survives tab switches, approved MCP invocation executes once")

    const inputRunId = await startRun("DESIGN_WORKSPACE_INPUT 先请求我确认，再给出测试交付。")
    await visible(page.getByRole("region", { name: "等待人工补充", exact: true }))
    await workspace.getByRole("tab", { name: "长期记忆", exact: true }).click()
    assert.equal(await page.locator("#agent-reply").isVisible(), true)
    await page.locator("#agent-reply").fill("确认，仅使用本地测试数据。")
    await page.getByRole("button", { name: "提交信息并继续", exact: true }).click()
    await workspace.getByRole("tab", { name: "成果与反馈", exact: true }).click()
    await visible(page.getByRole("heading", { name: "运行成果", exact: true }))
    assert.equal((await api("GET", "/api/agent_runs/" + inputRunId)).status, "succeeded")
    results.push("employee reply remains visible, persists through real respond API, and resumes execution")

    // Complex multi-role Agent: all integrations terminate at a local fixture.
    const marketId = (await api("GET", "/api/market/connections")).items.find(row => row.id === market.connection.id).id
    const complexRoles = [
      { id: "researcher", name: "资料研究", responsibility: "收集公开来源并标注风险", tasks: ["读取发行人公开资料", "记录来源和风险"], inputs: ["用户任务"], deliverables: ["来源索引"], done_criteria: ["有来源 URL"], depends_on: [], tools: [selectedToolId] },
      { id: "documenter", name: "文档分析", responsibility: "提取 PDF 证据与页码", tasks: ["读取附注 7", "标注页码"], inputs: ["来源索引"], deliverables: ["PDF 证据"], done_criteria: ["包含页码"], depends_on: ["researcher"], tools: [complexToolIds.document_extract] },
      { id: "analyst", name: "财务分析", responsibility: "交叉核对财务表格并计算指标", tasks: ["分析表格", "复核计算"], inputs: ["来源索引", "PDF 证据"], deliverables: ["计算结果"], done_criteria: ["包含行号和公式"], depends_on: ["documenter"], tools: [complexToolIds.spreadsheet_analyze, "calculate"] },
      { id: "reviewer", name: "交叉审核", responsibility: "检查网页、PDF、表格数字一致性", tasks: ["核验数字", "检查引用和风险"], inputs: ["前序证据"], deliverables: ["审核意见"], done_criteria: ["没有未标注矛盾"], depends_on: ["analyst"], tools: [] },
      { id: "sender", name: "邮件交付", responsibility: "只在审批后交付本地测试邮件", tasks: ["整理最终报告", "等待审批后提交"], inputs: ["审核意见"], deliverables: ["本地交付回执"], done_criteria: ["审批和回执可追溯"], depends_on: ["reviewer"], tools: [emailToolId] },
    ]
    const complexCapabilities = [
      { id: "source_read", title: "读取发行人网页", purpose: "获取公开事实与来源 URL", kind: "browser", access: "read", required: true, role_ids: ["researcher"], search_terms: ["browser"], suggested_tool_ids: [selectedToolId] },
      { id: "pdf_read", title: "提取 PDF 证据", purpose: "读取授权 PDF 附注并保留页码", kind: "document", access: "read", required: true, role_ids: ["documenter"], search_terms: ["pdf"], suggested_tool_ids: [complexToolIds.document_extract] },
      { id: "sheet_read", title: "核对财务表格", purpose: "复核收入和负债并计算指标", kind: "document", access: "read", required: true, role_ids: ["analyst"], search_terms: ["spreadsheet"], suggested_tool_ids: [complexToolIds.spreadsheet_analyze] },
      { id: "email_write", title: "发送经批准的报告邮件", purpose: "将审核后的摘要提交给本地验收服务", kind: "integration", access: "write", required: true, role_ids: ["sender"], search_terms: ["email"], suggested_tool_ids: [emailToolId] },
    ]
    const complexSpec = await api("POST", "/api/agent_specs", { name: "复杂验证：发行人尽调与财务交付", spec: {
      goal: "基于网页、授权 PDF 和财务表格完成可追溯发行人尽调，并经人工批准后交付",
      task_scope: "只处理本地测试 fixture，不访问真实发行人、不发送真实邮件；数字必须有来源，缺证据必须标注。",
      tools: [selectedToolId, complexToolIds.document_extract, complexToolIds.spreadsheet_analyze, "calculate", emailToolId],
      task_plan: ["研究网页来源", "提取 PDF 页码证据", "复核财务表格", "交叉审核", "人工批准后邮件交付"],
      deliverables: ["结构化尽调摘要", "来源与页码索引", "财务计算结果", "风险清单", "交付回执"],
      done_criteria: ["来源 URL 明确", "PDF 结论带页码", "表格结论带行号和公式", "交付操作有审批事件"],
      roles: complexRoles, capability_requirements: complexCapabilities, require_approval: true,
      quality_checks: [{ type: "contains", expected: "revenue 120" }, { type: "contains", expected: "PDF p.4" }, { type: "contains", expected: "metric 90" }, { type: "not_contains", expected: "UNVERIFIED_CLAIM" }],
    } })
    assert.equal(marketId, market.connection.id)
    // Inspect the five-stage specification in the actual design UI before
    // running it. The fixture creates the exact owner-scoped record through
    // the public API; the user then reviews role and capability ownership.
    await page.goto(`${webOrigin}/agent-create?spec=${complexSpec.id}&step=2`)
    const complexModules = page.getByRole("tablist", { name: "Agent 方案设计模块" })
    await visible(complexModules.getByRole("tab", { name: /^角色与任务/ }))
    await complexModules.getByRole("tab", { name: /^角色与任务/ }).click()
    const complexDesigner = page.getByRole("region", { name: "角色与任务分工", exact: true })
    for (const role of complexRoles) {
      await complexDesigner.getByRole("button", { name: new RegExp("^\\d+\\s+" + role.name + "$") }).click()
      await visible(complexDesigner.getByRole("heading", { name: `编辑「${role.name}」`, exact: true }))
    }
    await complexDesigner.getByRole("button", { name: /^\d+\s+交叉审核$/ }).click()
    const reviewerGrants = complexDesigner.getByRole("checkbox", { name: /^允许交叉审核调用/ })
    assert.ok((await reviewerGrants.count()) >= 4, "The audit role must display its explicit tool scope")
    for (let i = 0; i < await reviewerGrants.count(); i++) {
      assert.equal(await reviewerGrants.nth(i).isChecked(), false, "The audit role must have no execution tool grants")
    }
    await complexDesigner.getByRole("button", { name: /^\d+\s+邮件交付$/ }).click()
    assert.equal(await complexDesigner.getByRole("checkbox", { name: /^允许邮件交付调用.*send_email/ }).isChecked(), true)
    await complexModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    const complexHarness = page.getByRole("region", { name: "Harness 能力规划", exact: true })
    for (const requirement of complexCapabilities) {
      const capability = complexHarness.getByRole("article", { name: `能力需求：${requirement.title}`, exact: true })
      await visible(capability.getByText("已选用", { exact: true }).first())
    }
    assert.deepEqual((await api("GET", "/api/agent_specs/" + complexSpec.id)).spec.roles, complexRoles,
      "Reviewing a five-stage configuration cannot mutate the saved Agent")
    results.push("five-role Agent design UI exposes role boundaries, per-role tool grants and four selected capabilities without altering the server record")
    await page.goto(`${webOrigin}/agent-run?spec=${complexSpec.id}`)
    await page.waitForFunction(id => document.querySelector("#spec-select")?.value === id && Boolean(document.querySelector("#model-select")?.value), complexSpec.id)
    await page.locator("#agent-task-instruction").fill("COMPLEX_AGENT_ACCEPTANCE 完成发行人尽调，核验 revenue 120、PDF p.4、metric 90，并仅在审批后交付本地邮件。")
    const complexReadiness = page.getByRole("region", { name: "新任务启动检查", exact: true })
    if (await complexReadiness.count()) {
      const complexReadinessText = await complexReadiness.innerText()
      assert.ok(!/(?:请连接工具|缺少必需能力|尚未测试)/.test(complexReadinessText), "Complex Agent readiness must have no blockers: " + complexReadinessText)
    }
    assert.equal(await page.getByRole("button", { name: "运行", exact: true }).isDisabled(), false, "A complex Agent with validated resources must be runnable")
    const complexToolBaseline = { ...complexToolCalls }
    const emailCallsBeforeComplexRun = complexToolCalls.send_email
    const complexRunResponse = page.waitForResponse(item => new URL(item.url()).pathname.endsWith("/api/agent-runs/start") && item.request().method() === "POST")
    await page.getByRole("button", { name: "运行", exact: true }).click()
    const complexRunId = (await (await complexRunResponse).json()).run_id
    assert.ok(complexRunId)
    const complexApproval = page.getByRole("button", { name: "批准并继续执行", exact: true })
    for (const [roleId, toolName] of [["researcher", "browser_page_inspect"], ["documenter", "document_extract"], ["analyst", "spreadsheet_analyze"], ["sender", "send_email"]]) {
      await visible(complexApproval)
      const waitingState = await api("GET", "/api/agent_runs/" + complexRunId)
      assert.equal(waitingState.status, "awaiting_approval", roleId + " must pause for human approval")
      assert.equal(waitingState.checkpoint.role_state.active_role_id, roleId)
      const approvalDetail = await page.getByRole("region", { name: "待处理的工具审批", exact: true }).innerText()
      const stageNames = { researcher: "资料研究", documenter: "文档分析", analyst: "财务分析", sender: "邮件交付" }
      assert.match(approvalDetail, new RegExp("负责阶段：" + stageNames[roleId]), "The approver must see which role owns the pending action")
      assert.match(approvalDetail, /逐次审批|本次调用/, "The approval card must explain this operation's scope")
      if (roleId === "sender") {
        assert.match(approvalDetail, /可能操作或写入/, "Email delivery must not look read-only")
        assert.equal(complexToolCalls.send_email - complexToolBaseline.send_email, 0, "No email write before approval")
      }
      await complexApproval.click()
      if (roleId !== "sender") await visible(complexApproval)
      else await visible(page.getByRole("heading", { name: "运行成果", exact: true }))
      assert.equal(complexToolCalls[toolName] - complexToolBaseline[toolName], 1, toolName + " must execute exactly once in this complex run after approval")
    }
    const complexFinal = await api("GET", "/api/agent_runs/" + complexRunId)
    assert.equal(complexFinal.status, "succeeded")
    assert.deepEqual(complexFinal.checkpoint.role_state.completed, ["researcher", "documenter", "analyst", "reviewer", "sender"])
    const complexDetail = await api("GET", "/api/agent-runs/" + complexRunId + "/detail")
    assert.equal(complexDetail.events.filter(event => event.content?.role_phase === "completed").length, 5)
    assert.equal(complexDetail.events.filter(event => event.event_type === "tool_call" && event.content?.role_id === "reviewer").length, 0)
    assert.match(complexFinal.result, /revenue 120/i)
    assert.match(complexFinal.result, /PDF p\.4/i)
    assert.match(complexFinal.result, /metric 90/i)
    assert.deepEqual(Object.fromEntries(Object.keys(complexToolCalls).map(name => [name, complexToolCalls[name] - complexToolBaseline[name]])), { browser_page_inspect: 1, document_extract: 1, spreadsheet_analyze: 1, send_email: 1 })
    assert.equal(complexToolCalls.send_email - emailCallsBeforeComplexRun, 1, "Only one local email fixture write is allowed for this run")
    assert.deepEqual(complexRoleTurns, { researcher: 2, documenter: 2, analyst: 2, reviewer: 1, sender: 2 })
    await screenshot("complex-agent-five-stage-completed")
    results.push("complex five-role due diligence Agent: source browser + PDF page extraction + spreadsheet analysis + cross-check reviewer + human-approved local-only email; all stages persisted and each tool executed exactly once")

    await page.getByRole("button", { name: "随时调整 Agent 方案", exact: true }).click()
    const quickEditor = page.getByRole("dialog", { name: "随时调整 Agent 方案", exact: true })
    await quickEditor.locator("#quick-agent-select").selectOption(mappingSpec.id)
    const quickModules = quickEditor.getByRole("tablist", { name: "Agent 方案设计模块" })
    await quickModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    const quickHarness = quickEditor.getByRole("region", { name: "Harness 能力规划", exact: true })
    const quickEmailCard = quickHarness.getByRole("article", { name: "能力需求：发送邮件", exact: true })
    await quickEmailCard.getByRole("button", { name: "编辑需求", exact: true }).click()
    await quickEmailCard.getByRole("button", { name: "删除需求", exact: true }).click()
    await visible(quickHarness.getByText(/当前清单为空/))
    await quickModules.getByRole("tab", { name: "目标与交付", exact: true }).click()
    await quickModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    await quickHarness.getByRole("button", { name: /^重新匹配/ }).click()
    await visible(quickHarness.getByText(/当前清单为空/))
    assert.equal(await quickHarness.getByRole("article").count(), 0, "Explicitly clearing all requirements must not trigger automatic reinference")
    await visible(quickHarness.getByRole("button", { name: "撤销删除", exact: true }))
    assert.equal((await api("GET", "/api/agent_specs/" + mappingSpec.id)).spec.capability_requirements.length, 1, "Unsaved deletion must not modify the server contract")
    await quickEditor.locator("#quick-agent-select").selectOption(runSpec.id)
    await quickModules.getByRole("tab", { name: "工具与资料", exact: true }).click()
    assert.equal(await quickHarness.getByRole("button", { name: "撤销删除", exact: true }).count(), 0, "Changing Agent must clear the prior Agent's undo history")
    await quickModules.getByRole("tab", { name: "目标与交付", exact: true }).click()
    const revisedRunGoal = runSpec.spec.goal + "；新增人工复核与风险清单"
    await quickEditor.getByRole("tabpanel", { name: "目标与交付", exact: true }).locator("textarea").first().fill(revisedRunGoal)
    const changedRunResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/api/agent_specs/" + runSpec.id) && response.request().method() === "PATCH")
    await quickEditor.getByRole("button", { name: "保存方案", exact: true }).click()
    assert.equal((await changedRunResponse).status(), 200)
    assert.equal((await api("GET", "/api/agent_specs/" + runSpec.id)).spec.goal, revisedRunGoal)
    await quickEditor.getByRole("button", { name: "Close", exact: true }).click()
    results.push("cleared requirements stay empty after rematch and tab changes; unsaved changes do not persist implicitly and undo state is isolated between Agents")

    await page.goto(`${webOrigin}/agent-create?spec=${runSpec.id}&step=4`)
    await visible(page.getByText("旧版本试跑成功，需重新试跑", { exact: true }))
    await visible(page.getByRole("link", { name: "重新试跑当前保存方案", exact: true }))
    assert.equal(await page.getByRole("button", { name: "下一步：发布", exact: true }).isDisabled(), true)
    assert.equal(await page.getByText("当前保存方案与成功运行快照一致，可以继续发布前验收。", { exact: true }).count(), 0)
    assert.equal(await page.getByText("当前步骤没有阻断项，可以继续", { exact: true }).count(), 0)
    assert.equal(await page.getByText("当前阶段没有阻断项，可以继续", { exact: true }).count(), 0)
    assert.equal((await api("GET", "/api/agent_runs/" + inputRunId)).status, "succeeded", "Editing a plan must not rewrite its earlier successful run")
    await screenshot("saved-revision-needs-retest")
    results.push("after a real successful run, saving a changed goal marks the prior run as stale, gives an explicit retry action, and blocks publishing without contradictory success messaging")
    assert.ok(designCalls >= 1 && revisionCalls >= 1 && approvalModelCalls >= 2 && inputModelCalls >= 2)
    assert.deepEqual(errors, [], "No unhandled browser exceptions")
    const report = { passed: true, fixtureOnly: true, independentEmployeeLogin: true, temporarySQLite: true, designCalls, revisionCalls, approvalModelCalls, inputModelCalls, mcpCalls, complexToolCalls, checks: results, evidenceDir }
    fs.writeFileSync(path.join(evidenceDir, "evidence.json"), JSON.stringify(report, null, 2))
    console.log("DESIGN_WORKSPACE_ACCEPTANCE", JSON.stringify(report))
  } catch (error) {
    if (page) await screenshot("failure").catch(() => {})
    fs.writeFileSync(path.join(evidenceDir, "failure.json"), JSON.stringify({ passed: false, message: String(error.message).slice(0, 900), completedChecks: results, browserErrors: errors, evidenceDir }, null, 2))
    console.error("DESIGN_WORKSPACE_FAILURE_EVIDENCE", evidenceDir)
    throw error
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (frontend) { frontend.kill(); await Promise.race([new Promise(resolve => frontend.once("exit", resolve)), delay(1500)]) }
    if (pb) await stopHeadlessPocketBase(pb).catch(() => {})
    if (fixture) { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)) }
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})
