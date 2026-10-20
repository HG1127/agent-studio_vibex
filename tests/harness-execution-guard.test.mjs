import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { DatabaseSync } from "node:sqlite"

const loaded = { module: { exports: {} } }
vm.runInNewContext(
  fs.readFileSync("pocketbase/pb_hooks/modules/harness_execution_guard.js", "utf8"),
  loaded, { timeout: 1200 },
)
const guard = loaded.module.exports
const OWNER = "test-owner"
const AGENT = "agenttest000001"
const WORKFLOW = "flowtest0000001"
const A = "A".repeat(40)
const B = "B".repeat(40)

function appHarness() {
  const db = new DatabaseSync(":memory:")
  db.exec(
    "CREATE TABLE agent_runs (id TEXT PRIMARY KEY,rh_user_id TEXT,status TEXT,checkpoint TEXT);" +
    "CREATE TABLE workflow_runs (id TEXT PRIMARY KEY,rh_user_id TEXT,status TEXT,checkpoint TEXT);" +
    "CREATE TABLE agent_studio_run_leases (" +
      "kind TEXT NOT NULL,run_id TEXT NOT NULL,lease_token TEXT NOT NULL," +
      "acquired_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,attempts INTEGER NOT NULL," +
      "PRIMARY KEY(kind,run_id));"
  )
  for (const [kind, runId] of [["agent", AGENT], ["workflow", WORKFLOW]]) {
    db.prepare("INSERT INTO " + kind + "_runs VALUES(?,?,?,?)").run(runId, OWNER, "running", '{"seq":0}')
  }
  function query(sql) {
    let bindings = {}
    return {
      bind(params) { bindings = params; return this },
      execute() {
        const stmt = db.prepare(sql.replace(/\{:([a-z_]+)\}/g, ":$1"))
        const r = stmt.run(bindings)
        return { rowsAffected: () => r.changes }
      },
    }
  }
  const app = {
    db() { return { newQuery: query } },
    findRecordById(kind, id) {
      if (kind !== "agent_runs" && kind !== "workflow_runs")
        throw Error("unexpected_collection")
      const row = db.prepare("SELECT * FROM " + kind + " WHERE id=?").get(id)
      if (!row) throw Error("run_not_found")
      return {
        kind,
        data: { ...row },
        get(field) { return this.data[field] },
        set(field, value) { this.data[field] = value },
      }
    },
    save(record) {
      db.prepare("UPDATE " + record.kind + " SET status=?,checkpoint=? WHERE id=?")
        .run(record.data.status, JSON.stringify(record.data.checkpoint), record.data.id)
    },
    runInTransaction(fn) {
      db.exec("BEGIN IMMEDIATE")
      try {
        const result = fn(this)
        db.exec("COMMIT")
        return result
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
  }
  return { app, db }
}

const lifecycleLoaded = { module: { exports: {} } }
vm.runInNewContext(
  fs.readFileSync("pocketbase/pb_hooks/modules/harness_run_lifecycle.js", "utf8"),
  lifecycleLoaded, { timeout: 1200 },
)
const lifecycle = lifecycleLoaded.module.exports

test("shared lifecycle validates bounded optional wall-clock runtime", () => {
  assert.equal(lifecycle.normalizeRuntimeMinutes(undefined).minutes, 0)
  assert.equal(lifecycle.normalizeRuntimeMinutes("").minutes, 0)
  assert.equal(lifecycle.normalizeRuntimeMinutes(1).minutes, 1)
  assert.equal(lifecycle.normalizeRuntimeMinutes(1440).minutes, 1440)
  for (const input of [0, -1, 1.5, 1441, "bad", NaN]) {
    assert.equal(lifecycle.normalizeRuntimeMinutes(input).ok, false)
  }
  assert.equal(lifecycle.deadlineFromMinutes(2, 100000).deadline_ms, 220000)
  assert.equal(lifecycle.deadlineFromMinutes(undefined, 100000).deadline_ms, 0)
  assert.equal(lifecycle.deadlineFromMinutes(5, NaN).ok, false)
  assert.equal(lifecycle.withinDeadline({ execution_deadline_ms: 10000 }, 9999), true)
  assert.equal(lifecycle.withinDeadline({ execution_deadline_ms: 10000 }, 10000), false)
  assert.equal(lifecycle.withinDeadline({ execution_deadline_ms: 0 }, 20000), true)
  assert.equal(lifecycle.withinDeadline({}, 20000), true)
  assert.equal(lifecycle.withinDeadline({ execution_deadline_ms: "broken" }, 20000), false)
  assert.equal(lifecycle.ownershipLost(new Error("execution_lease_lost")), true)
  assert.equal(lifecycle.ownershipLost(new Error("execution_run_not_running")), true)
  assert.equal(lifecycle.ownershipLost(new Error("random")), false)
})

test("Agent and Workflow share atomic admission and preserve prior checkpoint fields", () => {
  const { app, db } = appHarness()
  try {
    for (const [kind, id] of [["agent", AGENT], ["workflow", WORKFLOW]]) {
      db.prepare("UPDATE " + kind + "_runs SET checkpoint=? WHERE id=?")
        .run(JSON.stringify({ seq: 2, evidence_refs: [{ locator: "doc:a" }], legacy: "preserved", claim_until: 9999999999999 }), id)
      const entered = lifecycle.enter(app, guard, {
        kind, runId: id, owner: OWNER, token: A,
        loadCheckpoint: (r) => JSON.parse(String(r.get("checkpoint"))),
      })
      assert.equal(entered.acquired, true)
      assert.equal(entered.deadlineExceeded, false)
      assert.equal(entered.checkpoint.legacy, "preserved")
      assert.equal(entered.checkpoint.evidence_refs[0].locator, "doc:a")
      const cp = JSON.parse(db.prepare("SELECT checkpoint FROM " + kind + "_runs WHERE id=?").get(id).checkpoint)
      assert.equal(cp.legacy, "preserved")
      assert.ok(cp.claim_until > Date.now())
      const busy = lifecycle.enter(app, guard, {
        kind, runId: id, owner: OWNER, token: B,
        loadCheckpoint: (r) => JSON.parse(String(r.get("checkpoint"))),
      })
      assert.equal(busy.acquired, false)
      assert.equal(busy.busy, true)
      assert.equal(lifecycle.leave(app, guard, { kind, runId: id, owner: OWNER, token: A }), true)
    }
  } finally { db.close() }
})

test("expired Agent and Workflow run deadlines fail admission without erasing evidence", () => {
  const { app, db } = appHarness()
  try {
    for (const [kind, id] of [["agent", AGENT], ["workflow", WORKFLOW]]) {
      db.prepare("UPDATE " + kind + "_runs SET checkpoint=? WHERE id=?")
        .run(JSON.stringify({ seq: 9, outputs: { n1: "already done" },
          evidence_refs: [{ locator: "source:1" }], execution_deadline_ms: Date.now() - 1000 }), id)
      const admission = lifecycle.enter(app, guard, {
        kind, runId: id, owner: OWNER, token: A,
        loadCheckpoint: (r) => JSON.parse(String(r.get("checkpoint"))),
      })
      assert.equal(admission.acquired, true)
      assert.equal(admission.deadlineExceeded, true)
      const persisted = db.prepare("SELECT status,checkpoint FROM " + kind + "_runs WHERE id=?").get(id)
      assert.equal(persisted.status, "failed")
      const saved = JSON.parse(persisted.checkpoint)
      assert.equal(saved.claim_until, 0)
      assert.equal(saved.seq, 9)
      assert.equal(saved.outputs.n1, "already done")
      assert.equal(saved.evidence_refs[0].locator, "source:1")
      assert.equal(lifecycle.leave(app, guard, { kind, runId: id, owner: OWNER, token: A }), true)
    }
  } finally { db.close() }
})

test("shared lifecycle refuses to start a step if lease state changed before checkpoint lock", () => {
  const { app, db } = appHarness()
  try {
    const guarded = {
      ...guard,
      claim(...args) {
        const acquired = guard.claim(...args)
        if (acquired) db.prepare("UPDATE agent_runs SET status='cancelled' WHERE id=?").run(AGENT)
        return acquired
      },
    }
    assert.throws(() => lifecycle.enter(app, guarded, {
      kind: "agent", runId: AGENT, owner: OWNER, token: A,
      loadCheckpoint: (r) => JSON.parse(String(r.get("checkpoint"))),
    }), /execution_run_not_running/)
    const lease = db.prepare("SELECT lease_token FROM agent_studio_run_leases WHERE kind='agent'").get()
    assert.equal(lease.lease_token, "", "admission cleanup only releases the acquired token")
    assert.equal(db.prepare("SELECT status FROM agent_runs WHERE id=?").get(AGENT).status, "cancelled")
  } finally { db.close() }
})
test("shared Agent/Workflow CAS lease excludes concurrent owner and fences takeovers", () => {
  const { app, db } = appHarness()
  try {
    for (const [kind, id] of [["agent", AGENT], ["workflow", WORKFLOW]]) {
      const now = Date.now()
      assert.equal(guard.claim(app, kind, id, OWNER, A, now, 600000), true)
      assert.equal(guard.claim(app, kind, id, OWNER, B, now + 1, 600000), false)
      guard.mutate(app, kind, id, OWNER, A, (tx, run) => {
        run.set("checkpoint", { seq: 1 })
        tx.save(run)
      })
      assert.equal(JSON.parse(db.prepare("SELECT checkpoint FROM " + kind + "_runs WHERE id=?")
        .get(id).checkpoint).seq, 1)
      db.prepare("UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind=? AND run_id=?")
        .run(Date.now() - 10, kind, id)
      assert.equal(guard.claim(app, kind, id, OWNER, B, Date.now(), 600000), true)
      assert.throws(() => guard.mutate(app, kind, id, OWNER, A, (tx, run) => {
        run.set("checkpoint", { seq: 99 })
        tx.save(run)
      }), /execution_lease_lost/)
      assert.equal(JSON.parse(db.prepare("SELECT checkpoint FROM " + kind + "_runs WHERE id=?")
        .get(id).checkpoint).seq, 1, "stale owner must not overwrite state")
      assert.equal(guard.release(app, kind, id, OWNER, A), false)
      assert.equal(guard.renew(app, kind, id, OWNER, A, 30000), false)
      assert.equal(guard.renew(app, kind, id, OWNER, B, 30000), true)
      assert.equal(guard.release(app, kind, id, OWNER, B), true)
    }
  } finally { db.close() }
})
test("same lease cannot mutate cancelled or foreign-owned run", () => {
  const { app, db } = appHarness()
  try {
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, A, Date.now()), true)
    db.prepare("UPDATE agent_runs SET status='cancelled' WHERE id=?").run(AGENT)
    assert.equal(guard.renew(app, "agent", AGENT, OWNER, A, 30000), false,
      "A cancelled task must not extend its former execution lease")
    assert.throws(() => guard.mutate(app, "agent", AGENT, OWNER, A, (tx, rec) => {
      rec.set("status", "succeeded")
      tx.save(rec)
    }), /execution_run_not_running/)
    assert.equal(db.prepare("SELECT status FROM agent_runs WHERE id=?").get(AGENT).status, "cancelled")
    db.prepare("UPDATE agent_runs SET status='running',rh_user_id='other-user' WHERE id=?")
      .run(AGENT)
    assert.throws(() => guard.mutate(app, "agent", AGENT, OWNER, A, () => {}),
      /execution_run_not_running/)
  } finally { db.close() }
})
test("failed guarded mutation rolls back checkpoint without consuming ownership", () => {
  const { app, db } = appHarness()
  try {
    assert.equal(guard.claim(app, "workflow", WORKFLOW, OWNER, A, Date.now()), true)
    assert.throws(() => guard.mutate(app, "workflow", WORKFLOW, OWNER, A, (tx, rec) => {
      rec.set("checkpoint", { seq: 50 })
      tx.save(rec)
      throw Error("simulated_write_failure")
    }), /simulated_write_failure/)
    assert.equal(JSON.parse(db.prepare("SELECT checkpoint FROM workflow_runs WHERE id=?")
      .get(WORKFLOW).checkpoint).seq, 0, "Checkpoint must remain unchanged")
    guard.mutate(app, "workflow", WORKFLOW, OWNER, A, (tx, rec) => {
      rec.set("checkpoint", { seq: 1 })
      tx.save(rec)
    })
    assert.equal(JSON.parse(db.prepare("SELECT checkpoint FROM workflow_runs WHERE id=?")
      .get(WORKFLOW).checkpoint).seq, 1)
  } finally { db.close() }
})

test("recovery contract rejects invalid owners, timeouts and tokens", () => {
  const { app, db } = appHarness()
  try {
    assert.throws(() => guard.claim(app, "unknown", AGENT, OWNER, A, Date.now()),
      /execution_lease_invalid_identity/)
    assert.throws(() => guard.claim(app, "agent", AGENT, OWNER, "short", Date.now()),
      /execution_lease_invalid_identity/)
    assert.throws(() => guard.claim(app, "agent", AGENT, OWNER, A, Date.now(), 999999),
      /execution_lease_invalid_time/)
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, A, Date.now()), true)
    db.prepare("UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind='agent'")
      .run(Date.now()-10)
    assert.equal(guard.renew(app, "agent", AGENT, OWNER, A, 30000), false)
  } finally { db.close() }
})
