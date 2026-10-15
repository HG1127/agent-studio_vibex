import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import path from "node:path"
import {createHash} from "node:crypto"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const hooks = path.join(root, "pocketbase", "pb_hooks")

function record(collection, id, fields = {}) {
  const value = { collection, id, ...fields }
  return {
    id,
    collection,
    get(key) { return value[key] },
    getString(key) { return value[key] == null ? "" : typeof value[key] === "object" ? JSON.stringify(value[key]) : String(value[key]) },
    getBool(key) { return Boolean(value[key]) },
    getInt(key) { return Number(value[key] || 0) },
    set(key, v) { value[key] = v },
    publicExport() { return { ...value } },
    values: value,
  }
}

function harness(file, seeds = {}, opts = {}) {
  const routes = new Map()
  const collections = {}
  for (const [collection, entries] of Object.entries(seeds)) {
    collections[collection] = entries.map(e => record(collection, e.id, e))
  }
  let created = 0
  const $app = {
    findCollectionByNameOrId(name) { return { name } },
    findFirstRecordByFilter(collection, filter, params = {}) {
      let rows = collections[collection] || []
      if (filter.includes("request_id = {:r}")) rows = rows.filter(r => r.get("request_id") === params.r)
      if (filter.includes("rh_user_id = {:uid}")) rows = rows.filter(r => r.get("rh_user_id") === params.uid)
      if (!rows.length) throw new Error("record not found")
      return rows[0]
    },
    findRecordById(collection, id) {
      const found = (collections[collection] || []).find(r => r.id === id)
      if (!found) throw new Error("record not found")
      return found
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      let list = [...(collections[collection] || [])]
      if (filter.includes("rh_user_id = {:owner_uid}")) list = list.filter(r => r.get("rh_user_id") === params.owner_uid)
      if (filter.includes("rh_user_id = {:uid}")) list = list.filter(r => r.get("rh_user_id") === params.uid)
      if (filter.includes("spec_id = {:spec_id}")) list = list.filter(r => r.get("spec_id") === params.spec_id)
      if (filter.includes("spec_id = {:sid}")) list = list.filter(r => r.get("spec_id") === params.sid)
      if (filter.includes("run_id = {:run_id}")) list = list.filter(r => r.get("run_id") === params.run_id)
      if (filter.includes("run_id = {:rid}")) list = list.filter(r => r.get("run_id") === params.rid)
      if (filter.includes("status = {:status}")) list = list.filter(r => r.get("status") === params.status)
      return list.slice(offset || 0, (offset || 0) + (limit || 100))
    },
    save(rec) { (collections[rec.collection] ||= []).push(rec) },
    delete(rec) {
      const rows = collections[rec.collection] || []
      const at = rows.indexOf(rec)
      if (at >= 0) rows.splice(at, 1)
    },
    logger() { return { error() {}, info() {} } },
    runInTransaction(fn) { return fn($app) },
  }
  class Record {
    constructor(col) {
      return record(col.name, "new" + (++created))
    }
  }
  // Agent owner PATCH now records transactional safe-text revisions. Stub
  // only the two internal helpers in the pure JSVM security unit harness;
  // actual SQL/JWT history is exercised by the real PocketBase E2E tests.
  const mockModules={
    collab:{
      decode(rec) {
        try {const obj=JSON.parse(rec.getString("spec")||"{}")
          return obj&&typeof obj==="object"&&!Array.isArray(obj)?obj:{}}
        catch {return {}}
      },
      digest(spec) {
        return createHash("sha256").update(JSON.stringify(spec||{})).digest("hex")
      },
      fail(code,status) {
        const e=new Error(code);e.code=code;e.httpStatus=status;throw e
      },
    },
    history:{record() {return "synthetic_safe_history"}},
  }
  function loadModule(modulePath) {
    const path=String(modulePath||"")
    if(path.endsWith("/modules/agent_collab.js"))return mockModules.collab
    if(path.endsWith("/modules/agent_collab_history.js"))return mockModules.history
    throw new Error("unsupported_mock_hook_module")
  }
  const scope = {
    routerAdd(method, route, callback) { routes.set(method + " " + route, callback) },
    onBootstrap() {},
    $os: { getenv(name) { return opts.env?.[name] || "" } },
    $app,
    __hooks:hooks,
    require:loadModule,
    Record,
    Collection: class {},
    Field: class {},
    console,
  }
  vm.runInNewContext(fs.readFileSync(path.join(hooks, file + ".pb.js"), "utf8"), scope, { filename: file + ".pb.js", timeout: 1000 })
  return {
    rows: collections,
    call(method, route, { user, query = {}, body = {}, id } = {}) {
      const handler = routes.get(method + " " + route)
      assert.ok(handler, "route exists " + method + " " + route)
      const e = {
        requestInfo() { return { headers: user ? { x_rh_user_id: user } : {}, query, body } },
        request: { pathValue(name) { return id || "" } },
        json(status, result) { return { status, ...result } },
      }
      return handler(e)
    },
  }
}

test("all PocketBase hook files have valid JS syntax", () => {
  const files = fs.readdirSync(hooks).filter(x => x.endsWith(".pb.js"))
  assert.equal(files.length >= 28, true)
  for (const f of files) assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(hooks, f), "utf8"), { filename: f }), f)
})

test("V7 shared PocketBase modules parse as standalone CommonJS", () => {
  const moduleDir = path.join(hooks, "modules")
  const names = fs.readdirSync(moduleDir).filter(name => name.endsWith(".js"))
  assert.ok(names.includes("knowledge_search.js"))
  assert.ok(names.includes("knowledge_schema.js"))
  assert.ok(names.includes("schema_journal.js"))
  assert.ok(names.includes("runtime_schema.js"))
  assert.ok(names.includes("model_wire.js"))
  for (const name of names) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(moduleDir, name), "utf8"), { filename: name }), name)
  }
})

test("agent specs require authentication, filter listings and enforce immutable ownership", () => {
  const h = harness("agent_specs", { agent_specs: [
    { id: "mine", rh_user_id: "A", name: "A spec" },
    { id: "other", rh_user_id: "B", name: "B spec" },
  ] })
  assert.equal(h.call("GET", "/api/agent_specs").status, 401)
  const list = h.call("GET", "/api/agent_specs", { user: "A", query: { rh_user_id: "B" } })
  assert.equal(list.status, 200)
  assert.deepEqual(Array.from(list.items, x => x.id), ["mine"])
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const res = h.call(method, "/api/agent_specs/{id}", { user: "A", id: "other", body: { name: "bad" } })
    assert.equal(res.status, 404, method)
  }
  const permitted = h.call("PATCH","/api/agent_specs/{id}",{
    user:"A",id:"mine",body:{name:"A updated spec"}
  })
  assert.equal(permitted.status,200,"Owner may still change their own Agent")
  assert.equal(permitted.rh_user_id,"A")
  const create = h.call("POST", "/api/agent_specs", { user: "A", body: { rh_user_id: "B", name: "mine", spec: {} } })
  assert.equal(create.status, 200)
  assert.equal(create.rh_user_id, "A")
})

test("run records and event listings cannot be read across tenants", () => {
  const fixtures = { agent_runs: [
    { id: "r1", rh_user_id: "A", status: "running" },
    { id: "r2", rh_user_id: "B", status: "running" },
  ] }
  const h = harness("agent_runs", fixtures)
  assert.equal(h.call("GET", "/api/agent_runs/{id}", { user: "A", id: "r2" }).status, 404)
  assert.deepEqual(Array.from(h.call("GET", "/api/agent_runs", { user: "A", query: { rh_user_id: "B" } }).items, x => x.id), ["r1"])
  assert.equal(h.call("PATCH", "/api/agent_runs/{id}", { user: "A", id: "r2" }).status, 403)
  assert.equal(h.call("POST", "/api/agent_runs", { user: "A", body: {} }).status, 403)
  const ev = harness("run_events", { ...fixtures, run_events: [
    { id: "e1", run_id: "r1", event_type: "status" },
    { id: "e2", run_id: "r2", event_type: "status" },
  ] })
  assert.equal(ev.call("GET", "/api/run_events", { user: "A", query: { run_id: "r2" } }).status, 404)
  assert.equal(ev.call("GET", "/api/run_events/{id}", { user: "A", id: "e2" }).status, 404)
  assert.deepEqual(Array.from(ev.call("GET", "/api/run_events", { user: "A", query: { run_id: "r1" } }).items, x => x.id), ["e1"])
})

test("agent execution and approval cannot operate on another user's runs", () => {
  const h = harness("agent_engine", {
    agent_specs: [{ id: "owned-by-b", rh_user_id: "B", spec: {} }],
    agent_runs: [{ id: "run-b", rh_user_id: "B", status: "running" }],
  })
  assert.equal(h.call("POST", "/api/agent-runs/start", { user: "A", body: { spec_id: "owned-by-b", instruction: "test", model: "claude-opus-4.8" } }).status, 404)
  for (const route of ["/api/llm/agent-engine/{id}/tick", "/api/agent-runs/{id}/pause", "/api/agent-runs/{id}/resume", "/api/agent-runs/{id}/cancel", "/api/agent-runs/{id}/approve", "/api/agent-runs/{id}/feedback", "/api/agent-runs/{id}/evaluate"]) {
    const result = h.call("POST", route, { user: "A", id: "run-b", body: { decision: "approve" } })
    assert.equal(result.status, 404, route)
  }
})

test("workflow access and plugin switches require record ownership", () => {
  const wf = harness("workflow_api", { workflows: [{ id: "w-b", rh_user_id: "B", graph: { nodes: [], edges: [] } }] })
  assert.equal(wf.call("GET", "/api/workflow-studio/get", { user: "A", query: { id: "w-b" } }).status, 404)
  assert.equal(wf.call("DELETE", "/api/workflow-studio/delete", { user: "A", query: { id: "w-b" } }).status, 404)
  const pm = harness("plugin_market", { market_connections: [{ id: "c-b", rh_user_id: "B", enabled: true }] })
  assert.equal(pm.call("POST", "/api/market/toggle", { user: "A", body: { id: "c-b", enabled: false } }).status, 404)
})

test("legacy direct APIs cannot mutate model, tool, token or workflow collections", () => {
  for (const name of ["model_connections", "tool_connections", "integration_tokens", "workflows", "workflow_runs", "tool_invocations"]) {
    const h = harness(name)
    assert.equal(h.call("POST", "/api/" + name, { user: "A" }).status, 403, name)
  }
})

test("legacy shared anonymous identity is disabled unless explicit opt-in", () => {
  const h = harness("agent_specs")
  assert.equal(h.call("GET", "/api/agent_specs").status, 401)
  const local = harness("agent_specs", {}, { env: { AGENT_STUDIO_ALLOW_ANON: "true" } })
  assert.equal(local.call("GET", "/api/agent_specs").status, 200)
})

test("LLM polling requires authentication and isolates generated text and paid model connections", () => {
  const h = harness("llm", { llm_jobs: [
    { id: "job1", request_id: "id-shared", rh_user_id: "B", status: "success", result_text: "private-result", model_name: "model-x" },
  ], model_connections: [
    { id: "conn1", rh_user_id: "B", enabled: true, models: ["model-x"], api_key: "secret" },
  ] })
  const target = { body: { request_id: "id-shared" } }
  assert.equal(h.call("POST", "/api/llm/poll", target).status, 401)
  const notFound = h.call("POST", "/api/llm/poll", { user: "A", ...target })
  assert.equal(notFound.status, "not_found")
  assert.equal(notFound.text, undefined)
  assert.equal(notFound.ok, false)
  const allowed = h.call("POST", "/api/llm/poll", { user: "B", ...target })
  assert.equal(allowed.ok, true)
  assert.equal(allowed.text, "private-result")
  assert.deepEqual(Array.from(h.call("GET", "/api/llm/models", { user: "A" }).models), [])
  assert.equal(h.call("POST", "/api/llm/chat", { user: "A", body: { connection_id: "conn1", messages: [{ role: "user", content: "hi" }], request_id: "some-uuid" } }).status, 400)
})
