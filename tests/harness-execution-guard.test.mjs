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
