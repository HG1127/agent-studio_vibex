// V7 migration rehearsal against a V6-compatible SQLite database.
// Tests non-destructive startup upgrade, idempotent reboots and cascade integrity.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { DatabaseSync } from "node:sqlite"

const root = process.cwd()
const pbBin = process.env.POCKETBASE_BIN || path.join(root, "vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pbBin), "PocketBase binary required")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-v7-migrations-"))
const dbFile = path.join(tmp, "data.db")
const baseId = "originalbase001"
const docId = "originaldocu000"
const chunkId = "originalchunk01"
const user = "legacy-user"
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function queryCount(db, table, clause = "", args = []) {
  return Number(db.prepare("SELECT COUNT(*) as n FROM " + table + (clause ? " WHERE " + clause : "")).get(...args).n)
}
function seedLegacy() {
  const db = new DatabaseSync(dbFile)
  try {
    db.exec(
      "CREATE TABLE agent_studio_kb_bases (" +
      "id TEXT PRIMARY KEY, rh_user_id TEXT NOT NULL, name TEXT NOT NULL," +
      "description TEXT NOT NULL DEFAULT '', created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL);" +
      "CREATE TABLE agent_studio_kb_documents (" +
      "id TEXT PRIMARY KEY, base_id TEXT NOT NULL, rh_user_id TEXT NOT NULL," +
      "filename TEXT NOT NULL, size_chars INTEGER NOT NULL, chunk_count INTEGER NOT NULL, created_ms INTEGER NOT NULL);" +
      "CREATE TABLE agent_studio_kb_chunks (" +
      "id TEXT PRIMARY KEY, base_id TEXT NOT NULL, document_id TEXT NOT NULL," +
      "rh_user_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, text_content TEXT NOT NULL);"
    )
    db.prepare(
      "INSERT INTO agent_studio_kb_bases(id,rh_user_id,name,description,created_ms,updated_ms) VALUES (?,?,?,?,?,?)"
    ).run(baseId, user, "V6 存量资料", "old", 100, 100)
    db.prepare(
      "INSERT INTO agent_studio_kb_documents(id,base_id,rh_user_id,filename,size_chars,chunk_count,created_ms) VALUES (?,?,?,?,?,?,?)"
    ).run(docId, baseId, user, "legacy.md", 50, 1, 100)
    db.prepare(
      "INSERT INTO agent_studio_kb_chunks(id,base_id,document_id,rh_user_id,chunk_index,text_content) VALUES (?,?,?,?,?,?)"
    ).run(chunkId, baseId, docId, user, 1, "V6 的资料必须在 V7 升级后仍能检索。")
    // V6 scheduler, lease and side-effect records are seeded before startup.
    // Upgrade must never rewrite, reset or drop these operational records.
    db.exec(
      "CREATE TABLE agent_studio_schedules (" +
      "id TEXT PRIMARY KEY,rh_user_id TEXT NOT NULL,name TEXT NOT NULL," +
      "target_kind TEXT NOT NULL CHECK(target_kind IN ('agent','workflow')),target_id TEXT NOT NULL," +
      "instruction TEXT NOT NULL,recurrence_kind TEXT NOT NULL," +
      "interval_minutes INTEGER NOT NULL DEFAULT 60,time_zone TEXT NOT NULL,local_time TEXT NOT NULL," +
      "weekday INTEGER NOT NULL DEFAULT 1,start_at_ms INTEGER NOT NULL,next_at_ms INTEGER NOT NULL," +
      "model_connection_id TEXT NOT NULL DEFAULT '',model_id TEXT NOT NULL DEFAULT ''," +
      "max_steps INTEGER NOT NULL DEFAULT 10,enabled INTEGER NOT NULL DEFAULT 1," +
      "deleted INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1," +
      "created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,last_due_ms INTEGER NOT NULL DEFAULT 0);" +
      "CREATE TABLE agent_studio_schedule_occurrences (" +
      "id TEXT PRIMARY KEY,schedule_id TEXT NOT NULL,rh_user_id TEXT NOT NULL," +
      "scheduled_for_ms INTEGER NOT NULL,schedule_revision INTEGER NOT NULL,run_id TEXT NOT NULL," +
      "status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,locked_until_ms INTEGER NOT NULL DEFAULT 0," +
      "next_retry_ms INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT ''," +
      "created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,UNIQUE(schedule_id,scheduled_for_ms));" +
      "CREATE TABLE agent_studio_run_leases (" +
      "kind TEXT NOT NULL CHECK(kind IN ('agent','workflow')),run_id TEXT NOT NULL," +
      "lease_token TEXT NOT NULL,acquired_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL," +
      "attempts INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(kind,run_id));" +
      "CREATE TABLE agent_studio_side_effects (" +
      "kind TEXT NOT NULL CHECK(kind IN ('agent','workflow')),run_id TEXT NOT NULL," +
      "step_key TEXT NOT NULL,tool_name TEXT NOT NULL,args_hash TEXT NOT NULL," +
      "idempotency_key TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('started','succeeded','unknown'))," +
      "result_text TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL," +
      "PRIMARY KEY(kind,run_id,step_key));"
    )
    db.prepare(
      "INSERT INTO agent_studio_schedules(" +
      "id,rh_user_id,name,target_kind,target_id,instruction,recurrence_kind," +
      "time_zone,local_time,start_at_ms,next_at_ms,enabled,created_ms,updated_ms) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run("schedulelegacy1",user,"V6 周期计划","workflow","legacyworkflow1",
      "Original historical instruction","daily","Asia/Tokyo","10:00",1850000000000,1850000000000,0,100,100)
    db.prepare(
      "INSERT INTO agent_studio_schedule_occurrences(" +
      "id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,run_id,status,created_ms,updated_ms) " +
      "VALUES(?,?,?,?,?,?,?,?,?)"
    ).run("abababababababababab","schedulelegacy1",user,1850000000000,1,
      "0123456789abcde","started",100,100)
    db.prepare(
      "INSERT INTO agent_studio_run_leases(kind,run_id,lease_token,acquired_ms,expires_ms,attempts) VALUES(?,?,?,?,?,?)"
    ).run("agent","0123456789abcde","legacy-lease-token",100,1850000000000,2)
    db.prepare(
      "INSERT INTO agent_studio_side_effects(kind,run_id,step_key,tool_name,args_hash,idempotency_key,status,result_text,created_ms,updated_ms) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).run("agent","0123456789abcde","step-1","legacy-write","old-hash","old-key",
      "unknown","",100,100)

  } finally { db.close() }
}
async function startServer(port) {
  let logs = ""
  const origin = "http://127.0.0.1:" + port
  const child = spawnHeadlessPocketBase(pbBin, ["serve", "--http=127.0.0.1:" + port,
    "--dir=" + tmp, "--hooksDir=" + path.join(root,"pocketbase/pb_hooks")], {
    cwd: path.join(root,"pocketbase"),
    env: { ...process.env, AGENT_STUDIO_ALLOW_ANON: "false" },
    windowsHide: true,
  })
  // Close fires after stdio streams are closed, unlike exit; this matters for
  // Windows SQLite file-lock release before the temporary database is removed.
  const fullyClosed = new Promise(resolve => child.once("close", resolve))
  child.stdout.on("data", chunk => { logs = (logs + chunk).slice(-14000) })
  child.stderr.on("data", chunk => { logs = (logs + chunk).slice(-14000) })
  let healthy = false
  for (let i = 0; i < 125; i++) {
    if (child.exitCode !== null) break
    try {
      const response = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(550) })
      if (response.ok) { healthy = true; break }
    } catch {}
    await sleep(160)
  }
  assert.ok(healthy, "PocketBase did not start " + logs.slice(-3500))
  return { origin, child, fullyClosed }
}
async function stopServer(server) {
  if (!server) return
  if (server.child.exitCode === null) server.child.kill()
  await Promise.race([server.fullyClosed, sleep(6500)])
}
async function cleanTempFolder(folder) {
  for (let attempt=0;attempt<9;attempt++) {
    try {
      fs.rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:300})
      return
    } catch (error) {
      if (!["EPERM","EBUSY","ENOTEMPTY"].includes(error?.code) || attempt===8) throw error
      await sleep(350 * (attempt+1))
    }
  }
}
async function call(origin, route, method = "GET", body, asUser = user) {
  const resp = await fetch(origin + route, {
    method,
    headers: { "Content-Type": "application/json", "X-Rh-User-Id": asUser },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  return { status: resp.status, data: await resp.json().catch(() => ({})) }
}
let server = null
try {
  seedLegacy()
  const port = Number(process.env.PB_SCHEMA_TEST_PORT || 7301)
  server = await startServer(port)
  let db = new DatabaseSync(dbFile)
  try {
    assert.equal(queryCount(db,"agent_studio_schema_migrations"), 14, "All fourteen knowledge/runtime/internal migrations must apply exactly once")
    const versions = db.prepare("SELECT id FROM agent_studio_schema_migrations ORDER BY id").all().map(row => row.id)
    assert.deepEqual(versions, [
      "execution_0001_v6_baseline",
      "execution_0002_monitor_indexes",
      "execution_0003_trace_spans",
      "execution_0004_worker_lease_attribution",
      "internal_0001_template_invites",
      "internal_0002_template_snapshot",
      "knowledge_0001_existing_v6",
      "knowledge_0002_additive_indexes",
      "knowledge_0003_cascade_triggers",
      "knowledge_0004_embedding_index",
      "knowledge_0005_employee_sharing",
      "knowledge_0006_shared_semantic_consent",
      "schedule_0001_v6_baseline",
      "schedule_0002_owner_indexes"
    ])
    assert.equal(queryCount(db,"agent_studio_kb_documents"),1)
    assert.equal(queryCount(db,"agent_studio_kb_chunks"),1)
    assert.equal(queryCount(db,"agent_studio_schedules"),1)
    assert.equal(queryCount(db,"agent_studio_schedule_occurrences"),1)
    assert.equal(queryCount(db,"agent_studio_run_leases"),1)
    assert.equal(queryCount(db, "pragma_table_info('agent_studio_run_leases')",
      "name = ?", ["owner_instance"]), 1, "Worker lease owner column added without deleting existing lease")
    assert.equal(queryCount(db,"agent_studio_side_effects"),1)
    assert.equal(queryCount(db,"agent_studio_execution_spans"),0)
    assert.equal(queryCount(db,"agent_studio_template_invites"),0)
    assert.equal(queryCount(db,"sqlite_master","type = ? AND name = ?",["table","agent_studio_template_invites"]),1)
    assert.equal(queryCount(db,"pragma_table_info('agent_studio_template_invites')","name = ?",["snapshot_json"]),1)
    assert.equal(db.prepare("SELECT instruction FROM agent_studio_schedules").get().instruction,
      "Original historical instruction")
    assert.equal(db.prepare("SELECT status FROM agent_studio_side_effects").get().status,"unknown")
    for (const name of [
      "idx_as_schedule_owner_due","idx_as_schedule_owner_target",
      "idx_as_occ_owner_schedule","idx_as_effects_run","idx_as_effects_status_created",
      "idx_as_spans_owner_run","idx_as_spans_created",
    ]) assert.equal(queryCount(db,"sqlite_master","type = ? AND name = ?",["index",name]),1,name)

    assert.equal(queryCount(db, "sqlite_master", "type = ? AND name = ?", ["trigger","trg_as_kb_doc_cleanup"]),1)
    for (const name of ["agent_studio_kb_embedding_settings","agent_studio_kb_vectors",
      "agent_studio_kb_embedding_queue"]) {
      assert.equal(queryCount(db,"sqlite_master","type = ? AND name = ?",["table",name]),1,name)
    }
    for(const name of ["trg_kb_vector_chunk_delete","trg_kb_embedding_base_delete",
      "trg_kb_vector_document_delete"]) {
      assert.equal(queryCount(db,"sqlite_master","type = ? AND name = ?",["trigger",name]),1,name)
    }
    for(const name of ["agent_studio_kb_access","agent_studio_kb_access_events"]) {
      assert.equal(queryCount(db,"sqlite_master","type = ? AND name = ?",["table",name]),1,name)
    }
    assert.equal(queryCount(db,"sqlite_master","type = ? AND name = ?",["trigger","trg_kb_access_base_delete"]),1)
    assert.equal(queryCount(db,"pragma_table_info('agent_studio_kb_access')","name = ?",["semantic_allowed"]),1)
  } finally { db.close() }
  const list = await call(server.origin, "/api/knowledge-bases")
  assert.equal(list.status, 200, JSON.stringify(list.data))
  assert.equal(list.data.items[0].document_count, 1)
  const search = await call(server.origin, "/api/knowledge-bases/search","POST",{
    base_ids:[baseId],query:"V7 升级",limit:5,
  })
  assert.equal(search.status,200,JSON.stringify(search.data))
  assert.match(search.data.items[0]?.text || "",/V6 的资料必须在 V7 升级后仍能检索/)
  const schedules = await call(server.origin, "/api/schedules")
  assert.equal(schedules.status, 200, JSON.stringify(schedules.data))
  assert.equal(schedules.data.items[0].name, "V6 周期计划")
  assert.equal(schedules.data.history[0].status,"started")
  const otherUser = await call(server.origin,"/api/schedules","GET",undefined,"other-user")
  assert.equal(otherUser.status,200)
  assert.equal(otherUser.data.items.length,0)
  assert.equal(otherUser.data.history.length,0)


  await stopServer(server)
  server = null
  // Emulate an existing V7 deployment: only the three knowledge migrations
  // were in the version ledger; legacy schedule/lease tables and rows persist.
  db = new DatabaseSync(dbFile)
  try {
    db.exec(
      "DELETE FROM agent_studio_schema_migrations WHERE id LIKE 'schedule_%' OR id LIKE 'execution_%';" +
      "DROP INDEX IF EXISTS idx_as_schedule_owner_target;" +
      "DROP INDEX IF EXISTS idx_as_schedule_owner_due;" +
      "DROP INDEX IF EXISTS idx_as_occ_owner_schedule;" +
      "DROP INDEX IF EXISTS idx_as_effects_run;" +
      "DROP INDEX IF EXISTS idx_as_effects_status_created;"
    )
    assert.equal(queryCount(db,"agent_studio_schema_migrations"),8)
  } finally { db.close() }
  server = await startServer(port + 1)
  db = new DatabaseSync(dbFile)
  try {
    assert.equal(queryCount(db,"agent_studio_schema_migrations"),14,"Journal must upgrade to fourteen migrations")
    assert.equal(queryCount(db,"agent_studio_kb_chunks"),1,"V6 data should survive multiple boots")
    assert.equal(queryCount(db,"agent_studio_schedules"),1,"Old schedule survives multiple boots")
    assert.equal(queryCount(db,"agent_studio_schedule_occurrences"),1,"Old occurrence remains auditable")
    assert.equal(queryCount(db,"agent_studio_run_leases"),1,"Active lease is not deleted")
    assert.equal(queryCount(db,"agent_studio_side_effects"),1,"Unknown write outcome is preserved")

  } finally { db.close() }
  await stopServer(server)
  server = null
  server = await startServer(port + 2)
  db = new DatabaseSync(dbFile)
  try {
    assert.equal(queryCount(db,"agent_studio_schema_migrations"),14,"Reboot with all versions must not repeat writes")
    assert.equal(queryCount(db,"agent_studio_schedules"),1)
    assert.equal(queryCount(db,"agent_studio_side_effects"),1)
  } finally { db.close() }
  const deleted = await call(server.origin,"/api/knowledge-bases/manage","POST",{action:"delete",id:baseId})
  assert.equal(deleted.status,200,JSON.stringify(deleted.data))
  db = new DatabaseSync(dbFile)
  try {
    assert.equal(queryCount(db,"agent_studio_kb_bases"),0)
    assert.equal(queryCount(db,"agent_studio_kb_documents"),0)
    assert.equal(queryCount(db,"agent_studio_kb_chunks"),0)
  } finally { db.close() }
  console.log("PASS V7.1 migration ledger: knowledge, schedules, occurrences, leases, side-effects preserved and idempotent")
} finally {
  await stopServer(server)
  await sleep(300)
  await cleanTempFolder(tmp)
}
