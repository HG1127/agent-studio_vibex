import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createVerifiedBackup, verifySnapshot, restoreSnapshot } from "../ops/sqlite-backup.mjs"

test("WAL-consistent SQLite backup preserves journal rows and restores only to new paths", async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-sqlite-backup-test-"))
  const source=path.join(dir,"active-data.db")
  const backup=path.join(dir,"snapshots","backup.db")
  const restored=path.join(dir,"recovered","data.db")
  let active=null
  try {
    active=new DatabaseSync(source)
    active.exec("PRAGMA journal_mode=WAL")
    active.exec("CREATE TABLE agent_studio_schema_migrations(id TEXT PRIMARY KEY,applied_ms INTEGER,description TEXT)")
    active.exec("CREATE TABLE agent_studio_side_effects(kind TEXT, run_id TEXT, step_key TEXT, status TEXT)")
    active.prepare("INSERT INTO agent_studio_schema_migrations VALUES (?,?,?)")
      .run("knowledge_0001_existing_v6",100,"baseline")
    active.prepare("INSERT INTO agent_studio_side_effects VALUES (?,?,?,?)")
      .run("agent","run123","step1","unknown")
    // Active database connection and potentially uncheckpointed WAL remain open.
    const created=await createVerifiedBackup(source,backup)
    assert.equal(created.verified,true)
    assert.equal(created.tableCounts.agent_studio_schema_migrations,1)
    assert.equal(created.tableCounts.agent_studio_side_effects,1)
    assert.match(created.sha256,/^[0-9a-f]{64}$/)
    assert.ok(fs.existsSync(backup+".manifest.json"))
    assert.equal((await verifySnapshot(backup)).verified,true)
    assert.equal((await restoreSnapshot(backup,restored)).restored,true)
    let recovered=new DatabaseSync(restored,{readOnly:true})
    try {
      assert.equal(recovered.prepare("SELECT status FROM agent_studio_side_effects").get().status,"unknown")
    } finally { recovered.close() }
    active.prepare("INSERT INTO agent_studio_side_effects VALUES (?,?,?,?)").run("workflow","later","step2","started")
    assert.equal((await verifySnapshot(backup)).tableCounts.agent_studio_side_effects,1,
      "snapshot must be immutable even after live writes")
    await assert.rejects(()=>createVerifiedBackup(source,backup),/destination_exists/)
    await assert.rejects(()=>restoreSnapshot(backup,restored),/EEXIST|already exists/)
    await assert.rejects(()=>createVerifiedBackup(source,source),/source_equals_destination/)
    const manifest=backup+".manifest.json"
    const data=JSON.parse(fs.readFileSync(manifest,"utf8"))
    data.sha256="f".repeat(64)
    fs.writeFileSync(manifest,JSON.stringify(data))
    await assert.rejects(()=>verifySnapshot(backup),/backup_sha256_mismatch/)
    assert.equal(active.prepare("SELECT COUNT(*) AS n FROM agent_studio_side_effects").get().n,2,
      "source is never modified by backup/verification")
  } finally {
    if(active) active.close()
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
  }
})
