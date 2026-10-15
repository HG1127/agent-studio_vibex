// Runs against real PocketBase hooks and an isolated temporary SQLite database.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"

const root = process.cwd()
const pb = process.env.POCKETBASE_BIN || path.join(root, "vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb), "PocketBase binary is required for knowledge integration tests")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-knowledge-test-"))
const port = Number(process.env.PB_KNOWLEDGE_TEST_PORT || 7291)
const origin = "http://127.0.0.1:" + port
const server = spawnHeadlessPocketBase(pb, [
  "serve", "--http=127.0.0.1:" + port, "--dir=" + dir,
  "--hooksDir=" + path.join(root, "pocketbase/pb_hooks"),
], { cwd: path.join(root, "pocketbase"), windowsHide: true,
  env: { ...process.env, AGENT_STUDIO_ALLOW_ANON: "false" } })
let logs = ""
let modelServer = null
server.stdout.on("data", x => { logs = (logs + x).slice(-15000) })
server.stderr.on("data", x => { logs = (logs + x).slice(-15000) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function call(method, endpoint, body, user = "A") {
  const headers = { "Content-Type": "application/json" }
  if (user) headers["X-Rh-User-Id"] = user
  const response = await fetch(origin + endpoint, {
    method, headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  })
  return { status: response.status, data: await response.json().catch(() => ({})) }
}
async function expectStatus(method, endpoint, body, status = 200, user = "A") {
  const got = await call(method, endpoint, body, user)
  assert.equal(got.status, status, method + " " + endpoint + " => " + JSON.stringify(got.data))
  return got.data
}

try {
  let ready = false
  for (let i = 0; i < 130; i++) {
    try {
      if ((await fetch(origin + "/api/health", { signal: AbortSignal.timeout(700) })).ok) {
        ready = true; break
      }
    } catch {}
    await sleep(150)
  }
  assert.ok(ready, "PocketBase start failed " + logs.slice(-3000))

  await expectStatus("GET", "/api/knowledge-bases", undefined, 401, "")
  await expectStatus("POST", "/api/knowledge-bases/search", { base_ids: ["abc"], query: "x" }, 401, "")
  const base = await expectStatus("POST", "/api/knowledge-bases/manage", {
    action: "create", name: "产品与合规手册", description: "内部验证资料",
  })
  assert.match(base.id, /^[A-Za-z0-9]{15}$/)

  const own = await expectStatus("GET", "/api/knowledge-bases")
  assert.equal(own.items.length, 1)
  assert.equal(own.items[0].document_count, 0)
  assert.deepEqual((await expectStatus("GET", "/api/knowledge-bases", undefined, 200, "B")).items, [])

  await expectStatus("POST", "/api/knowledge-bases/documents", {
    action: "upload", base_id: base.id, filename: "test.exe", content: "unsafe",
  }, 400)
  await expectStatus("POST", "/api/knowledge-bases/documents", {
    action: "upload", base_id: base.id, filename: "empty.txt", content: "",
  }, 400)
  await expectStatus("POST", "/api/knowledge-bases/documents", {
    action: "upload", base_id: base.id, filename: "other.txt", content: "unauthorized",
  }, 404, "B")

  const uploaded = await expectStatus("POST", "/api/knowledge-bases/documents", {
    action: "upload", base_id: base.id, filename: "500IPO产品说明.md",
    content: "500IPO 将 AI 原生研究系统用于发现长期成长机会。\n" +
      "系统生成可核验的研究记录，并以基金等产品形式承接。\n" +
      "知识库文档包含权属与资料出处，禁止将未知信息编造成事实。\n".repeat(90),
  })
  assert.match(uploaded.id, /^[A-Za-z0-9]{15}$/)
  assert.ok(uploaded.chunk_count >= 2, "text should be chunked")

  const docs = await expectStatus("GET", "/api/knowledge-bases/documents?base_id=" + base.id)
  assert.equal(docs.items.length, 1)
  assert.equal(docs.items[0].chunk_count, uploaded.chunk_count)
  const list = await expectStatus("GET", "/api/knowledge-bases")
  assert.equal(list.items[0].chunk_count, uploaded.chunk_count)
  assert.equal(list.items[0].document_count, 1)

  // A failing second-chunk write must rollback the document and first chunk together.
  // This simulates an interrupted/invalid SQL write in a real SQLite transaction.
  const beforeFailure = await expectStatus("GET", "/api/knowledge-bases")
  const beforeDocs = beforeFailure.items[0].document_count
  const beforeChunks = beforeFailure.items[0].chunk_count
  const sqlite = new DatabaseSync(path.join(dir, "data.db"), { timeout: 5000 })
  try {
    sqlite.exec("CREATE TRIGGER fail_second_chunk_for_test BEFORE INSERT ON agent_studio_kb_chunks " +
      "WHEN NEW.chunk_index=2 BEGIN SELECT RAISE(ABORT,'forced_second_chunk_error'); END")
  } finally { sqlite.close() }
  try {
    const failedWrite = await call("POST", "/api/knowledge-bases/documents", {
      action:"upload", base_id:base.id, filename:"failure-rollback.md",
      content:"用于验证原子写入的多段文本。".repeat(150),
    })
    assert.equal(failedWrite.status, 500, "mid-write failure should return 500 without partial publication")
  } finally {
    const resetDb = new DatabaseSync(path.join(dir, "data.db"), { timeout: 5000 })
    try { resetDb.exec("DROP TRIGGER IF EXISTS fail_second_chunk_for_test") }
    finally { resetDb.close() }
  }
  const afterFailure = await expectStatus("GET", "/api/knowledge-bases")
  assert.equal(afterFailure.items[0].document_count, beforeDocs, "document insert must rollback")
  assert.equal(afterFailure.items[0].chunk_count, beforeChunks, "partial chunks must rollback")
  assert.equal((await expectStatus("GET", "/api/knowledge-bases/documents?base_id="+base.id))
    .items.some(row => row.filename === "failure-rollback.md"), false)

  const hits = await expectStatus("POST", "/api/knowledge-bases/search", {
    base_ids: [base.id], query: "AI 原生研究系统", limit: 4,
  })
  assert.equal(hits.retrieval, "lexical")
  assert.equal(hits.candidate_limit_reached, false)
  assert.ok(hits.scanned_candidates >= 1)
  await expectStatus("POST", "/api/knowledge-bases/search", { base_ids:[base.id], query:"AI", limit:99 }, 400)
  await expectStatus("POST", "/api/knowledge-bases/search", { base_ids:[base.id], query:"AI", limit:"bad" }, 400)
  assert.ok(hits.items.length >= 1, "source passages should be found")
  assert.match(hits.items[0].citation, /500IPO产品说明\.md.*片段/)
  assert.match(hits.items[0].text, /AI 原生研究系统/)
  assert.equal((await expectStatus("POST", "/api/knowledge-bases/search", {
    base_ids: [base.id], query: "星际火箭燃料", limit: 4,
  })).items.length, 0)

  // A forged knowledge base id must never reveal another tenant's document chunks.
  await expectStatus("POST", "/api/knowledge-bases/search", {
    base_ids: [base.id], query: "AI 原生研究系统",
  }, 404, "B")
  await expectStatus("GET", "/api/knowledge-bases/documents?base_id=" + base.id, undefined, 404, "B")
  await expectStatus("POST", "/api/knowledge-bases/documents", {
    action: "delete", base_id: base.id, document_id: uploaded.id,
  }, 404, "B")
  await expectStatus("POST", "/api/knowledge-bases/manage", {
    action: "delete", id: base.id,
  }, 404, "B")


  // Real workflow: the chosen data source must be the actual uploaded document, not the
  // generic workflow description or prompt. The end node must receive cited passages.
  const graphFor = baseIds => ({
    nodes: [
      { id: "begin", type: "start", data: { title: "开始" }, position: { x: 0, y: 0 } },
      { id: "kbsearch", type: "tool", data: {
        title: "检索", tool: "knowledge_search",
        knowledge_base_ids: baseIds, params_template: '{"query":"AI 原生研究系统"}',
      }, position: { x: 180, y: 0 } },
      { id: "finish", type: "end", data: {
        title: "结束", output_template: "{{检索.output}}",
      }, position: { x: 360, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "begin", target: "kbsearch" },
      { id: "e2", source: "kbsearch", target: "finish" },
    ],
  })
  async function runWorkflow(user, graph, expectedOutcome) {
    const wf = await expectStatus("POST", "/api/workflow-studio/create", {
      name: "知识库检索工作流", graph,
    }, 200, user)
    const run = await expectStatus("POST", "/api/workflow-runs/start", {
      workflow_id: wf.id, instruction: "查询产品信息并保留出处",
    }, 200, user)
    let row
    for (let index = 0; index < 7; index++) {
      await expectStatus("POST", "/api/llm/workflow-engine/" + run.run_id + "/tick", {}, 200, user)
      const detail = await expectStatus("GET", "/api/workflow-runs/" + run.run_id + "/detail", undefined, 200, user)
      row = detail.run
      if (row.status === "succeeded" || row.status === "failed") break
    }
    assert.equal(row.status, "succeeded", JSON.stringify(row))
    assert.match(row.result, expectedOutcome)
    return row
  }
  const citedWorkflow = await runWorkflow("A", graphFor([base.id]), /500IPO产品说明\.md.*片段/)
  assert.match(citedWorkflow.result, /AI 原生研究系统/)
  const isolatedWorkflow = await runWorkflow("B", graphFor([base.id]), /无权访问|已删除/)
  assert.doesNotMatch(isolatedWorkflow.result, /500IPO产品说明|AI 原生研究系统/)

  // Model-backed Agent must really call its builtin retrieval tool on an owned
  // linked knowledge base; the mock refuses to fabricate its evidence.
  let modelCalls = 0, sawCitationInModelContext = false
  modelServer = createServer(async (request, response) => {
    let data = ""
    for await (const chunk of request) data += chunk.toString()
    modelCalls++
    const payload = JSON.parse(data || "{}")
    const userPrompt = (payload.messages || []).filter(item => item.role === "user")
      .map(item => String(item.content || "")).join("\n")
    const initial = userPrompt.includes("（尚无，这是第一步）")
    if (!initial && userPrompt.includes("500IPO产品说明.md")) sawCitationInModelContext = true
    const content = initial
      ? JSON.stringify({ thought: "首先检索关联知识库", action: "tool",
          tool: "knowledge_search", tool_input: { query: "AI 原生研究系统" } })
      : JSON.stringify({ thought: "引用已经检索的原文", action: "final",
          final_answer: "已引用知识库证据：[500IPO产品说明.md · 片段1]" })
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }))
  })
  const modelPort = Number(process.env.PB_KNOWLEDGE_MODEL_TEST_PORT || 7292)
  await new Promise(resolve => modelServer.listen(modelPort, "127.0.0.1", resolve))
  const conn = await expectStatus("POST", "/api/model-connections", {
    name: "知识库检索集成模型", provider: "openai",
    base_url: "http://127.0.0.1:" + modelPort + "/v1",
    api_key: "mock-test-key", models: ["kb-test-model"],
  })
  const spec = await expectStatus("POST", "/api/agent_specs", {
    name: "知识库 Agent", spec: {
      goal: "从指定知识库中找到有依据的产品介绍",
      task_scope: "只使用关联知识库资料",
      deliverables: ["带出处的回答"], tools: ["knowledge_search"],
      task_plan: ["检索知识库", "依据原文作答"], done_criteria: ["标注文档出处"],
      knowledge_base_ids: [base.id],
    },
  })
  const agent = await expectStatus("POST", "/api/agent-runs/start", {
    spec_id: spec.id, instruction: "请检索 AI 原生研究系统并引用来源",
    model: "kb-test-model", config: {
      max_steps: 4, tools: { knowledge_search: true },
      custom_model: { connection_id: conn.item.id, model_id: "kb-test-model" },
    },
  })
  let agentRow
  for (let index = 0; index < 5; index++) {
    await expectStatus("POST", "/api/llm/agent-engine/" + agent.run_id + "/tick", {})
    agentRow = await expectStatus("GET", "/api/agent_runs/" + agent.run_id)
    if (agentRow.status === "succeeded" || agentRow.status === "failed") break
  }
  assert.equal(agentRow.status, "succeeded", JSON.stringify(agentRow))
  assert.match(agentRow.result, /\[500IPO产品说明\.md · 片段1\]/)
  assert.ok(modelCalls >= 2, "Agent must plan retrieval then finalize")
  assert.ok(sawCitationInModelContext, "Agent's second LLM call must receive actual cited retrieval result")
  await expectStatus("POST", "/api/knowledge-bases/manage", {
    action: "update", id: base.id, name: "更新后的知识库", description: "更新简介",
  })
  assert.equal((await expectStatus("GET", "/api/knowledge-bases")).items[0].name, "更新后的知识库")

  await expectStatus("POST", "/api/knowledge-bases/documents", {
    action: "delete", base_id: base.id, document_id: uploaded.id,
  })
  assert.deepEqual((await expectStatus("GET", "/api/knowledge-bases/documents?base_id=" + base.id)).items, [])
  assert.deepEqual((await expectStatus("POST", "/api/knowledge-bases/search", {
    base_ids: [base.id], query: "AI 原生研究系统",
  })).items, [])

  await expectStatus("POST", "/api/knowledge-bases/manage", { action: "delete", id: base.id })
  assert.deepEqual((await expectStatus("GET", "/api/knowledge-bases")).items, [])
  await expectStatus("POST", "/api/knowledge-bases/search", { base_ids: [base.id], query: "资料" }, 404)
  console.log("PASS knowledge: CRUD, chunk ingestion, citations, search and cross-tenant isolation")
} finally {
  await stopHeadlessPocketBase(server)
  if (modelServer) await new Promise(resolve => modelServer.close(resolve))
  await sleep(100)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}
