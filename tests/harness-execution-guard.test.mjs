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
      "owner_instance TEXT NOT NULL DEFAULT '',PRIMARY KEY(kind,run_id));"
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
test("verified Worker instance attribution is atomically replaced only by the fenced lease winner", () => {
  const { app, db } = appHarness()
  const workerA = "w-" + "a".repeat(24)
  const workerB = "w-" + "b".repeat(24)
  try {
    const now = Date.now()
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, A, now, 600000, workerA), true)
    assert.equal(db.prepare("SELECT owner_instance FROM agent_studio_run_leases WHERE kind='agent'").get().owner_instance, workerA)
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, B, now + 1, 600000, workerB), false)
    assert.equal(db.prepare("SELECT owner_instance FROM agent_studio_run_leases WHERE kind='agent'").get().owner_instance, workerA,
      "losing contender must not change the recorded owner")
    db.prepare("UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind='agent'").run(Date.now() - 1)
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, B, Date.now(), 600000, workerB), true)
    assert.equal(db.prepare("SELECT owner_instance FROM agent_studio_run_leases WHERE kind='agent'").get().owner_instance, workerB)
    assert.equal(guard.renew(app, "agent", AGENT, OWNER, A, 30000), false)
    assert.equal(guard.renew(app, "agent", AGENT, OWNER, B, 30000), true)
    assert.equal(db.prepare("SELECT owner_instance FROM agent_studio_run_leases WHERE kind='agent'").get().owner_instance, workerB)
    assert.throws(() => guard.claim(app, "workflow", WORKFLOW, OWNER, A, Date.now(), 600000, "attacker-instance"),
      /execution_lease_invalid_instance/)
    assert.equal(guard.release(app, "agent", AGENT, OWNER, B), true)
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
test("fenced status mutation can cancel an awaiting step but never overwrite a terminal or stale run", () => {
  const { app, db } = appHarness()
  try {
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, A, Date.now()), true)
    db.prepare("UPDATE agent_runs SET status='awaiting_input',checkpoint=? WHERE id=?")
      .run(JSON.stringify({ cancel_requested: true, pending_input: { question: "confirm" }, seq: 3 }), AGENT)
    assert.throws(() => guard.mutateStatuses(app, "agent", AGENT, OWNER, B,
      ["running", "awaiting_input", "awaiting_approval"], () => {}),
    /execution_lease_lost/)
    guard.mutateStatuses(app, "agent", AGENT, OWNER, A,
      ["running", "awaiting_input", "awaiting_approval"], (tx, rec) => {
        const cp = JSON.parse(rec.get("checkpoint"))
        cp.cancel_requested = false
        cp.pending_input = null
        rec.set("checkpoint", cp)
        rec.set("status", "cancelled")
        tx.save(rec)
      })
    const cancelled = db.prepare("SELECT status,checkpoint FROM agent_runs WHERE id=?").get(AGENT)
    assert.equal(cancelled.status, "cancelled")
    assert.equal(JSON.parse(cancelled.checkpoint).cancel_requested, false)
    assert.equal(JSON.parse(cancelled.checkpoint).pending_input, null)
    assert.throws(() => guard.mutateStatuses(app, "agent", AGENT, OWNER, A,
      ["running", "awaiting_input", "awaiting_approval"], (tx, rec) => {
        rec.set("status", "succeeded")
        tx.save(rec)
      }), /execution_run_state_changed/)
    assert.equal(db.prepare("SELECT status FROM agent_runs WHERE id=?").get(AGENT).status, "cancelled")
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

test("outbound lease renewal is token-fenced, bounded, and fails closed on expired deadline or takeover", () => {
  const { app, db } = appHarness()
  try {
    const now = Date.now()
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, A, now, 2000), true)
    assert.equal(guard.renewForDispatch(app, "agent", AGENT, OWNER, A,
      { ttlMs: 600000, maxCallMs: 120000 }), true)
    const extended = db.prepare(
      "SELECT expires_ms,lease_token FROM agent_studio_run_leases WHERE kind='agent'").get()
    assert.ok(extended.expires_ms > now + 120000)
    assert.equal(extended.lease_token, A)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, OWNER, A,
      { ttlMs: 600000, maxCallMs: 590000 }), /execution_dispatch_invalid_window/)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, OWNER, B,
      { ttlMs: 600000 }), /execution_lease_lost/)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, "another-tenant", A,
      { ttlMs: 600000 }), /execution_lease_lost/)
    db.prepare("UPDATE agent_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify({ execution_deadline_ms: Date.now() - 1 }), AGENT)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, OWNER, A),
      /run_runtime_deadline_exceeded/)
    assert.equal(db.prepare("SELECT expires_ms FROM agent_studio_run_leases WHERE kind='agent'").get().expires_ms,
      extended.expires_ms, "a failed deadline check must roll back any lease extension")
    db.prepare("UPDATE agent_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify({ seq: 0 }), AGENT)
    db.prepare("UPDATE agent_studio_run_leases SET expires_ms=? WHERE kind='agent'")
      .run(Date.now() - 1)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, OWNER, A),
      /execution_lease_lost/)
    assert.equal(guard.claim(app, "agent", AGENT, OWNER, B, Date.now()), true)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, OWNER, A),
      /execution_lease_lost/)
    assert.equal(guard.renewForDispatch(app, "agent", AGENT, OWNER, B), true)
    db.prepare("UPDATE agent_runs SET status='cancelled' WHERE id=?").run(AGENT)
    assert.throws(() => guard.renewForDispatch(app, "agent", AGENT, OWNER, B),
      /execution_lease_lost/)
  } finally { db.close() }
})

test("an accepted cancel/pause prevents renewing the next outbound attempt even with a live token", () => {
  const { app, db } = appHarness()
  try {
    for (const [kind, id] of [["agent", AGENT], ["workflow", WORKFLOW]]) {
      const token = kind === "agent" ? A : B
      assert.equal(guard.claim(app, kind, id, OWNER, token, Date.now()), true)
      const leaseBefore = db.prepare(
        "SELECT expires_ms FROM agent_studio_run_leases WHERE kind=? AND run_id=?"
      ).get(kind, id).expires_ms
      const checkpoint = { cancel_requested: true, pause_requested: false }
      db.prepare("UPDATE " + kind + "_runs SET checkpoint=? WHERE id=?")
        .run(JSON.stringify(checkpoint), id)
      assert.throws(() => guard.renewForDispatch(app, kind, id, OWNER, token),
        /execution_stop_requested/)
      assert.equal(db.prepare(
        "SELECT expires_ms FROM agent_studio_run_leases WHERE kind=? AND run_id=?"
      ).get(kind, id).expires_ms, leaseBefore,
      "rejected retry must not extend the lease")
      checkpoint.cancel_requested = false
      checkpoint.pause_requested = true
      db.prepare("UPDATE " + kind + "_runs SET checkpoint=? WHERE id=?")
        .run(JSON.stringify(checkpoint), id)
      if (kind === "agent") {
        assert.throws(() => guard.renewForDispatch(app, kind, id, OWNER, token),
          /execution_stop_requested/)
      } else {
        assert.equal(guard.renewForDispatch(app, kind, id, OWNER, token), true,
          "Workflow does not implement pause; an unrelated legacy flag must not block it")
      }
      db.prepare("UPDATE " + kind + "_runs SET checkpoint=? WHERE id=?")
        .run(JSON.stringify({ cancel_requested: false, pause_requested: false }), id)
      assert.equal(guard.renewForDispatch(app, kind, id, OWNER, token), true)
    }
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
