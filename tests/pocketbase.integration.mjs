import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { DatabaseSync } from "node:sqlite"

const root = process.cwd()
const pbDir = path.join(root, "pocketbase")
const bin = process.env.POCKETBASE_BIN || path.join(root, "vibex-local", "bin", "windows", "pocketbase.exe")
assert.ok(fs.existsSync(bin), "PocketBase binary missing; configure POCKETBASE_BIN")
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-e2e-"))
const port = Number(process.env.POCKETBASE_SMOKE_PORT || "7133")
const url = "http://127.0.0.1:" + port
const key = "0123456789abcdef0123456789abcdef"
const env = { ...process.env, AGENT_STUDIO_SECRET_KEY: key, AGENT_STUDIO_STRICT_SECRETS: "true", AGENT_STUDIO_ALLOW_ANON: "false" }
const server = spawnHeadlessPocketBase(bin, ["serve", "--http=127.0.0.1:" + port, "--dir=" + dataDir, "--hooksDir=" + path.join(pbDir, "pb_hooks")], { cwd: pbDir, env, windowsHide: true })
let logs = ""
server.stdout.on("data", d => { logs = (logs + d.toString()).slice(-12000) })
server.stderr.on("data", d => { logs = (logs + d.toString()).slice(-12000) })
let count = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function request(method, endpoint, user = "", body) {
  const response = await fetch(url + endpoint, { method, headers: { "Content-Type": "application/json", ...(user ? { "X-Rh-User-Id": user } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) })
  let payload
  try { payload = await response.json() } catch { payload = {} }
  return { httpStatus: response.status, body: payload }
}
async function expected(method, endpoint, user, body, status) {
  const result = await request(method, endpoint, user, body)
  assert.equal(result.httpStatus, status, method + " " + endpoint + " expected " + status + " but got " + result.httpStatus + " " + JSON.stringify(result.body).slice(0, 240))
  count += 1
  return result.body
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("PocketBase terminated while starting")
    try { if ((await fetch(url + "/api/health", { signal: AbortSignal.timeout(500) })).ok) { ready = true; break } } catch {}
    await pause(200)
  }
  assert.ok(ready, "PocketBase did not become healthy")
  assert.doesNotMatch(logs, /\/_\/#\/pbinstall\/|Launch the URL below|create your first superuser account/i,
    "Headless tests must never emit a PocketBase browser installer link")
  await expected("GET", "/api/agent_specs", "", undefined, 401)
  const a = await expected("POST", "/api/agent_specs", "A", { rh_user_id: "B", name: "A private spec", spec: { goal: "research" } }, 200)
  assert.equal(a.rh_user_id, "A")
  const b = await expected("POST", "/api/agent_specs", "B", { name: "B private spec", spec: { goal: "analysis" } }, 200)
  const listA = await expected("GET", "/api/agent_specs?rh_user_id=B", "A", undefined, 200)
  assert.equal(listA.items.length, 1)
  assert.equal(listA.items[0].id, a.id)
  await expected("GET", "/api/agent_specs/" + encodeURIComponent(a.id), "B", undefined, 404)
  await expected("PATCH", "/api/agent_specs/" + encodeURIComponent(a.id), "B", { name: "hacked" }, 404)
  const wf = await expected("POST", "/api/workflow-studio/create", "A", { name: "Private workflow" }, 200)
  await expected("GET", "/api/workflow-studio/get?id=" + encodeURIComponent(wf.id), "B", undefined, 404)
  const conn = await expected("POST", "/api/model-connections", "B", { name: "Private model", provider: "openai", base_url: "https://example.com/v1", api_key: "test-secret-not-real", models: ["model-x"] }, 200)
  const connA = await expected("GET", "/api/model-connections", "A", undefined, 200)
  assert.equal(connA.items.length, 0)
  const llmA = await expected("GET", "/api/llm/models", "A", undefined, 200)
  assert.equal(llmA.models.length, 0)
  const llmB = await expected("GET", "/api/llm/models", "B", undefined, 200)
  assert.equal(llmB.models.length, 1)
  await expected("POST", "/api/llm/chat", "A", { connection_id: conn.item.id, model: "model-x", request_id: "unique-id-smoke", messages: [{ role: "user", content: "do not call" }] }, 400)
  await expected("POST", "/api/agent_runs", "A", { rh_user_id: "B", status: "running" }, 403)
  await expected("POST", "/api/llm/poll", "", { request_id: "fake" }, 401)
  const db = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  try {
    const stored = db.prepare("SELECT api_key FROM model_connections WHERE rh_user_id = 'B' LIMIT 1").get()
    assert.ok(stored?.api_key?.startsWith("gcm1:"), "model API Key was not AES-GCM encrypted at rest")
    assert.equal(stored.api_key.includes("test-secret-not-real"), false)
  } finally { db.close() }
  const version = await expected("POST", "/api/spec-versions", "B", { spec_id: b.id, note: "smoke" }, 200)
  await expected("POST", "/api/spec-versions/" + encodeURIComponent(version.item.id) + "/publish", "B", {}, 200)
  const token = await expected("POST", "/api/integrate/keys", "B", { agent_id: b.id, name: "Smoke API" }, 200)
  assert.ok(/^rhk_[A-Za-z0-9]+$/.test(token.token))
  assert.ok(token.token.length >= 40)
  const db2 = new DatabaseSync(path.join(dataDir, "data.db"), { readOnly: true })
  try {
    const raw = db2.prepare("SELECT token_hash FROM integration_tokens WHERE rh_user_id = 'B' AND kind = 'api' LIMIT 1").get()
    assert.ok(raw?.token_hash?.startsWith("sha256:"), "API token was not hashed")
    assert.equal(raw.token_hash.includes(token.token), false)
  } finally { db2.close() }
  await expected("GET", "/api/integrate/keys?agent_id=" + encodeURIComponent(b.id), "A", undefined, 404)
  console.log(JSON.stringify({ result: "PASS", checks: count, pocketbase: "0.40.5", details: "tenant ownership, direct CRUD guards, AES-GCM, model isolation, API token hash and version publication" }))
} catch (err) {
  console.error("INTEGRATION FAILURE:", err.stack || String(err))
  console.error("SERVER LOG TAIL:", logs.slice(-1000).replace(/\/pbinstall\/[A-Za-z0-9._-]+/g, "/pbinstall/***"))
  process.exitCode = 1
} finally {
  server.kill()
  await Promise.race([new Promise(resolve => server.once("exit", resolve)), pause(2000)])
  try { fs.rmSync(dataDir, { recursive: true, force: true }) } catch {}
}
