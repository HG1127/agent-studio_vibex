import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const loaded = { module: { exports: {} } }
vm.runInNewContext(
  fs.readFileSync("pocketbase/pb_hooks/modules/harness_worker_scheduler.js", "utf8"),
  loaded, { timeout: 1500 },
)
const scheduler = loaded.module.exports
const SOURCES = [
  { collection: "agent_runs", kind: "agent", endpoint: "/api/llm/agent-engine/" },
  { collection: "workflow_runs", kind: "workflow", endpoint: "/api/llm/workflow-engine/" },
]

function mockRecord(kind, index, owner = "employee1") {
  const id = kind + String(index).padStart(12, "0")
  const updated = "2026-10-20T12:" + String(Math.floor(index / 60)).padStart(2, "0") +
    ":" + String(index % 60).padStart(2, "0") + ".000Z"
  return {
    id,
    get(field) { return field === "rh_user_id" ? owner : "" },
    getString(field) { return field === "updated" || field === "created" ? updated : "" },
  }
}
function appFor(agentRows, workflowRows, failKind = "") {
  const pages = []
  return {
    pages,
    findRecordsByFilter(collection, query, order, limit, offset) {
      assert.equal(query, "status = 'running'")
      assert.equal(order, "updated")
      if (collection === failKind) throw Error("test_collection_unavailable")
      pages.push({ collection, limit, offset })
      const rows = collection === "agent_runs" ? agentRows : workflowRows
      return rows.slice(offset, offset + limit)
    },
  }
}

test("worker scans beyond 60 leased oldest runs instead of declaring queue idle", () => {
  const records = Array.from({ length: 77 }, (_, i) => mockRecord("a", i))
  const app = appFor(records, [])
  const leases = {}
  for (let i = 0; i < 65; i++) leases["agent:" + records[i].id] = true
  const result = scheduler.discover(app, SOURCES, leases)
  assert.equal(result.candidates.length, 8)
  assert.equal(result.candidates[0].id, records[65].id)
  assert.ok(app.pages.some(p => p.collection === "agent_runs" && p.offset === 60))
  assert.equal(result.scan_capped, false)
  assert.equal(result.source_errors, 0)
})

test("scheduler combines both run types in stable oldest-first order", () => {
  const agent = [mockRecord("a", 1)]
  const wf = [mockRecord("w", 0)]
  const result = scheduler.discover(appFor(agent, wf), SOURCES, {})
  assert.equal(result.candidates.length, 2)
  assert.equal(result.candidates[0].source.kind, "workflow")
  assert.equal(result.candidates[1].source.kind, "agent")
})

test("bounded scan reports backlog cap when 300 oldest records are leased", () => {
  const all = Array.from({ length: 304 }, (_, i) => mockRecord("a", i))
  const leases = {}
  for (let i = 0; i < all.length; i++) leases["agent:" + all[i].id] = true
  const app = appFor(all, [])
  const result = scheduler.discover(app, SOURCES, leases)
  assert.equal(result.candidates.length, 0)
  assert.equal(result.scan_capped, true)
  assert.equal(result.examined, scheduler.PAGE_SIZE * scheduler.MAX_PAGES)
  assert.equal(app.pages.filter(x => x.collection === "agent_runs").length, scheduler.MAX_PAGES)
})

test("missing collections and records with no owner are isolated", () => {
  const broken = scheduler.discover(appFor([], [], "agent_runs"), SOURCES, {})
  assert.equal(broken.source_errors, 1)
  const records = [mockRecord("a", 0, ""), mockRecord("a", 1, "owner")]
  const good = scheduler.discover(appFor(records, []), SOURCES, {})
  assert.equal(good.candidates.length, 1)
  assert.equal(good.candidates[0].owner, "owner")
})
