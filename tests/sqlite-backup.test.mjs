import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createVerifiedBackup, verifySnapshot, restoreSnapshot } from "../ops/sqlite-backup.mjs"

test("complete manifests cover every discovered PocketBase/business table and reject an omitted table",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-full-manifest-"))
  const source=path.join(dir,"synthetic-source.sqlite")
  const backupFile=path.join(dir,"snapshot.sqlite")
  const recovered=path.join(dir,"restored.sqlite")
  const privateSecret="SYNTHETIC_PRIVATE_MODEL_KEY_DO_NOT_OUTPUT"
  const db=new DatabaseSync(source)
  try{
    db.exec("PRAGMA journal_mode=WAL;"+
      "CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);"+
      "CREATE TABLE agent_specs(id TEXT PRIMARY KEY,owner TEXT);"+
      "CREATE TABLE model_connections(id TEXT,api_key TEXT);"+
      "CREATE TABLE agent_studio_kb_vectors(id TEXT,vector_json TEXT);"+
      "CREATE TABLE company_custom_module(id TEXT,payload TEXT);"+
      "CREATE TABLE _collections(id TEXT PRIMARY KEY)")
    db.prepare("INSERT INTO studio_users VALUES(?,?)").run("private_employee",privateSecret)
    db.prepare("INSERT INTO model_connections VALUES(?,?)").run("synthetic","not_a_real_key")
    db.prepare("INSERT INTO agent_studio_kb_vectors VALUES(?,?)").run("vector","[0.1,0.2]")
    db.prepare("INSERT INTO company_custom_module VALUES(?,?)").run("module","PRIVATE_DATA")
    const result=await createVerifiedBackup(source,backupFile)
    assert.equal(result.verified,true)
    assert.deepEqual(result.tableCounts,{
      _collections:0,agent_specs:0,agent_studio_kb_vectors:1,
      company_custom_module:1,model_connections:1,studio_users:1,
    })
    const manifest=JSON.parse(fs.readFileSync(backupFile+".manifest.json","utf8"))
    assert.deepEqual(manifest.tables,result.tableCounts)
    assert.ok(!JSON.stringify(manifest).includes(privateSecret))
    assert.ok(!JSON.stringify(manifest).includes("PRIVATE_DATA"))
    assert.ok(!Object.keys(manifest.tables).some(x=>x.startsWith("sqlite_")))
    assert.equal((await restoreSnapshot(backupFile,recovered)).restored,true)
    let target=new DatabaseSync(recovered,{readOnly:true})
    try{assert.equal(target.prepare("SELECT COUNT(*) AS n FROM company_custom_module").get().n,1)}
    finally{target.close()}
    // A manifest omitting even an UNKNOWN source table must not verify.
    delete manifest.tables.company_custom_module
    fs.writeFileSync(backupFile+".manifest.json",JSON.stringify(manifest))
    await assert.rejects(()=>verifySnapshot(backupFile),/backup_table_counts_mismatch/)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM studio_users").get().n,1)
  }finally{
    db.close()
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
  }
})

test("unsupported nonidentifier SQLite table names cannot be silently dropped",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-bad-table-"))
  const source=path.join(dir,"source.sqlite")
  const output=path.join(dir,"backup.sqlite")
  const db=new DatabaseSync(source)
  try{
    db.exec('CREATE TABLE "unsafe-hyphen-table"(id TEXT)')
    await assert.rejects(()=>createVerifiedBackup(source,output),
      /snapshot_unknown_table_name/)
    assert.equal(fs.existsSync(output),false,"no unverifiable snapshot is emitted")
    assert.equal(fs.existsSync(output+".manifest.json"),false)
  }finally{
    db.close()
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
  }
})
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
