import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createVerifiedBackup } from "../ops/sqlite-backup.mjs"
import { planFromFile, applyRetention } from "../ops/trace-retention.mjs"

test("trace retention is dry-run by default, owner-scoped, and requires verified backup for destructive action",async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-trace-retention-"))
  const database=path.join(temp,"data.db")
  const snap=path.join(temp,"data-snapshot","data.db")
  const now=Date.now()
  const old=now-110*86400_000
  const recent=now-10*86400_000
  const db=new DatabaseSync(database)
  try{
    db.exec(
      "CREATE TABLE agent_runs(id TEXT PRIMARY KEY,rh_user_id TEXT,status TEXT);" +
      "CREATE TABLE workflow_runs(id TEXT PRIMARY KEY,rh_user_id TEXT,status TEXT);" +
      "CREATE TABLE agent_studio_execution_spans(" +
      "id TEXT PRIMARY KEY,rh_user_id TEXT,run_kind TEXT,run_id TEXT,created_ms INTEGER);"
    )
    for(const [id,owner,status] of [
      ["a-terminal","A","succeeded"],["a-running","A","running"],
      ["b-terminal","B","failed"],["a-recent","A","succeeded"],
    ])db.prepare("INSERT INTO agent_runs VALUES(?,?,?)").run(id,owner,status)
    db.prepare("INSERT INTO workflow_runs VALUES(?,?,?)").run("wf-terminal","A","failed")
    const insert=db.prepare("INSERT INTO agent_studio_execution_spans VALUES(?,?,?,?,?)")
    for(const [id,owner,kind,run,created] of [
      ["a-old","A","agent","a-terminal",old],
      ["wf-old","A","workflow","wf-terminal",old],
      ["active-old","A","agent","a-running",old],
      ["other-old","B","agent","b-terminal",old],
      ["recent-new","A","agent","a-recent",recent],
      ["orphan-old","A","agent","not-present",old],
    ]) insert.run(id,owner,kind,run,created)
  } finally {db.close()}
  try{
    const plan=await planFromFile(database,{owner:"A",days:90,now})
    assert.equal(plan.eligible,2)
    assert.equal((await planFromFile(database,{owner:"B",days:90,now})).eligible,1)
    await assert.rejects(()=>applyRetention(database,{owner:"A",days:90,maxRows:500}),/explicit_confirmation_required/)
    await assert.rejects(()=>applyRetention(database,{owner:"A",days:90,maxRows:1,confirm:"DELETE_TRACE_SPANS:A"}),/verified_separate_backup_required/)
    await createVerifiedBackup(database,snap)
    const applied=await applyRetention(database,{
      owner:"A",days:90,maxRows:1,confirm:"DELETE_TRACE_SPANS:A",backup:snap,now,
    })
    assert.equal(applied.deleted,1)
    assert.equal(applied.remaining,1)
    await assert.rejects(()=>applyRetention(database,{
      owner:"A",days:90,maxRows:1,confirm:"DELETE_TRACE_SPANS:A",backup:snap,now,
    }),/snapshot_retention_mismatch/)
    const read=new DatabaseSync(database,{readOnly:true})
    try {
      assert.equal(Number(read.prepare("SELECT COUNT(*) AS n FROM agent_studio_execution_spans").get().n),5)
      assert.equal(Number(read.prepare("SELECT COUNT(*) AS n FROM agent_studio_execution_spans WHERE rh_user_id='B'").get().n),1)
      assert.equal(Number(read.prepare("SELECT COUNT(*) AS n FROM agent_studio_execution_spans WHERE id IN ('active-old','recent-new','orphan-old')").get().n),3)
    } finally {read.close()}
  } finally {fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150})}
})
