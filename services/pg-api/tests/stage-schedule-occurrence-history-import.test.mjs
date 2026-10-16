import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {createHash} from "node:crypto"
import {fileURLToPath} from "node:url"
import {DatabaseSync} from "node:sqlite"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {contentHash} from "../src/stage-agent-import.ts"
import {prepareScheduleOccurrenceHistory,
  importLegacyScheduleOccurrenceHistoryToStage} from "../src/stage-schedule-occurrence-history-import.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=f=>fs.readFileSync(path.join(root,f),"utf8")
  .split(/\r?\n/).filter(l=>!l.trim().startsWith("\\")).join("\n")
const sha=(x)=>createHash("sha256").update(x).digest("hex")
const alice="aaaaaaaaaaaaaaa",bob="bbbbbbbbbbbbbbb",schedule="ccccccccccccccc",runId="ddddddddddddddd",occurrence="eeeeeeeeeeeeeee"
const ua="11111111-1111-4111-8111-111111111111"
const ub="22222222-2222-4222-8222-222222222222"
const approval={verified_by:"Synthetic independent source reviewer",approved_at:"2026-10-16T00:00:00Z"}
const sample=()=>({id:occurrence,schedule_id:schedule,rh_user_id:alice,
  scheduled_for_ms:1792090200123,schedule_revision:3,run_id:runId,
  status:"running",attempts:2,locked_until_ms:1792090270000,
  next_retry_ms:1792090299000,error:" synthetic timeout, not executed ",
  created_ms:1792090200200,updated_ms:1792090200300})
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"w28-occurrence-"))
  const snapshot=path.join(dir,"snapshot.sqlite"),manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"approved-map.json")
  const db=new DatabaseSync(snapshot)
  db.exec("CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);"+
    "CREATE TABLE agent_studio_schedules(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE agent_runs(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE agent_studio_schedule_occurrences("+
    "id TEXT PRIMARY KEY,schedule_id TEXT,rh_user_id TEXT,"+
    "scheduled_for_ms INTEGER,schedule_revision INTEGER,run_id TEXT,status TEXT,"+
    "attempts INTEGER,locked_until_ms INTEGER,next_retry_ms INTEGER,error TEXT,"+
    "created_ms INTEGER,updated_ms INTEGER)")
  db.prepare("INSERT INTO studio_users VALUES(?,?)").run(alice,"SYNTHETIC_DO_NOT_ARCHIVE_PASSWORD")
  db.prepare("INSERT INTO studio_users VALUES(?,?)").run(bob,"SYNTHETIC_DO_NOT_ARCHIVE_PASSWORD")
  db.prepare("INSERT INTO agent_studio_schedules VALUES(?,?)").run(schedule,alice)
  db.prepare("INSERT INTO agent_runs VALUES(?,?)").run(runId,alice)
  const values=sample()
  db.prepare("INSERT INTO agent_studio_schedule_occurrences VALUES("+
    Object.keys(values).map(()=>"?").join(",")+")").run(...Object.values(values))
  db.close()
  function mutate(change){const db=new DatabaseSync(snapshot);try{change(db)}finally{db.close()}}
  function refresh(){
    const db=new DatabaseSync(snapshot,{readOnly:true})
    let tables,receipts
    try{
      tables=Object.fromEntries(db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'").all()
        .map(({name})=>[name,Number(db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n)]))
      receipts=db.prepare("SELECT * FROM agent_studio_schedule_occurrences ORDER BY id").all().map(contentHash)
    }finally{db.close()}
    const source=sha(fs.readFileSync(snapshot))
    fs.writeFileSync(mapping,JSON.stringify({schema_version:"studio-approved-identity-map-v2",source_sha256:source,
      records:[[alice,ua],[bob,ub]].map(([old_id,new_studio_user_id])=>({old_id,new_studio_user_id,...approval}))}))
    fs.writeFileSync(manifest,JSON.stringify({format:"agent-studio-sqlite-snapshot-v1",
      sha256:source,bytes:fs.statSync(snapshot).size,tables,
      schedule_occurrence_archive_review:{source_sha256:source,
        identity_mapping_sha256:sha(fs.readFileSync(mapping)),credentials_absent:true,
        ...approval,tables:{agent_studio_schedule_occurrences:{row_sha256:receipts}}},
    }))
  }
  refresh()
  return {dir,snapshot,manifest,mapping,mutate,refresh,
    plan:()=>prepareScheduleOccurrenceHistory(snapshot,manifest,mapping),
    close:()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}
}
function adapt(src,pgDb,login){
  return src.replaceAll("current_database()<>'agentstudio_stage'","false")
    .replaceAll("session_user<>'agentstudio_admin'","false")
    .replaceAll("NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)","false")
    .replaceAll("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999","false")
}
async function postgres(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read("db/postgres/001_stage_schema.sql"))
  await pg.exec("INSERT INTO agentstudio.schema_migrations(version,description) VALUES"+
    "('pg_v8_008','synthetic'),('pg_v8_011','synthetic') ON CONFLICT DO NOTHING")
  await pg.exec(adapt(read("db/postgres/migrations/pg_v9_018_legacy_schedule_occurrence_history.sql")))
  await pg.exec(adapt(read("db/postgres/migrations/pg_v8_011_legacy_user_provision.sql")))
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) "+
    "VALUES($1,'https://synthetic.invalid','alice','disabled'),"+
    "($2,'https://synthetic.invalid','bob','disabled')",[ua,ub])
  return pg
}
async function bindUsers(pg,f){
  for(const [old,target] of [[alice,ua],[bob,ub]])
    await pg.query("INSERT INTO agentstudio.legacy_user_imports"+
      "(source_snapshot_sha256,legacy_user_id,target_user_id,"+
      "reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) "+
      "VALUES($1,$2,$3,$4,$5,$5)",[
        sha(fs.readFileSync(f.snapshot)),old,target,
        sha(fs.readFileSync(f.mapping)),"c".repeat(64)])
}
function pool(pg,{failReadback=false,guard={}}={}){
  return {async connect(){return {
    release(){},
    async query(sql,vars=[]){
      if(sql.startsWith("SELECT current_database() AS database"))
        return {rows:[{database:"agentstudio_stage",login:"agentstudio_admin",
          admin:true,version:170004,...guard}]}
      if(failReadback&&sql.startsWith("SELECT * FROM agentstudio.legacy_schedule_occurrence_history"))
        throw Error("SYNTHETIC_UNSAFE_SQL_ERROR_NOT_FOR_LOGGING")
      return pg.query(sql,vars)
    },
  }}}
}
const tableCount=async(pg,t)=>(await pg.query(
  "SELECT COUNT(*)::int AS n FROM agentstudio."+t)).rows[0].n
test("reviewed occurrence source is preserved exactly but creates ZERO live runs/jobs/leases",async()=>{
  const f=fixture(),pg=await postgres()
  try{
    await bindUsers(pg,f)
    const plan=f.plan()
    assert.deepEqual(plan.rows[0].source_record,sample())
    const first=await importLegacyScheduleOccurrenceHistoryToStage(pool(pg),plan)
    assert.deepEqual([first.imported,first.replayed,first.reconciled],[1,0,1])
    const stored=(await pg.query("SELECT * FROM agentstudio.legacy_schedule_occurrence_history")).rows[0]
    assert.deepEqual(stored.source_record,sample())
    assert.equal(stored.owner_user_id,ua)
    assert.equal(stored.evidence_status,"historical_unverified")
    assert.equal(stored.execution_enabled,false)
    assert.equal(stored.lease_reactivated,false)
    assert.equal(stored.payload_sha256,contentHash(sample()))
    assert.deepEqual([await tableCount(pg,"runs"),await tableCount(pg,"jobs"),
      await tableCount(pg,"schedule_occurrences"),await tableCount(pg,"external_effects")],[0,0,0,0])
    const replay=await importLegacyScheduleOccurrenceHistoryToStage(pool(pg),f.plan())
    assert.deepEqual([replay.imported,replay.replayed],[0,1])
    assert.equal(await tableCount(pg,"legacy_schedule_occurrence_history"),1)
  }finally{await pg.close();f.close()}
})
test("cross-owner references, missing run parent and altered reviewed row hash fail before DB",()=>{
  const f=fixture()
  try{
    f.mutate(db=>db.prepare("UPDATE agent_studio_schedules SET rh_user_id=?").run(bob))
    f.refresh()
    assert.throws(()=>f.plan(),/parent_schedule_missing_or_foreign/)
    f.mutate(db=>db.prepare("UPDATE agent_studio_schedules SET rh_user_id=?").run(alice))
    f.mutate(db=>db.prepare("DELETE FROM agent_runs").run())
    f.refresh()
    assert.throws(()=>f.plan(),/parent_run_missing_or_foreign/)
    f.mutate(db=>db.prepare("INSERT INTO agent_runs VALUES(?,?)").run(runId,alice))
    f.refresh()
    const review=JSON.parse(fs.readFileSync(f.manifest,"utf8"))
    review.schedule_occurrence_archive_review.tables.agent_studio_schedule_occurrences.row_sha256=["a".repeat(64)]
    fs.writeFileSync(f.manifest,JSON.stringify(review))
    assert.throws(()=>f.plan(),/unreviewed_row_content/)
  }finally{f.close()}
})
test("SQL fault after staged INSERT rolls back entire occurrence batch",async()=>{
  const f=fixture(),pg=await postgres()
  try{
    await bindUsers(pg,f)
    await assert.rejects(importLegacyScheduleOccurrenceHistoryToStage(
      pool(pg,{failReadback:true}),f.plan()),/occurrence_history_sql_failed/)
    assert.equal(await tableCount(pg,"legacy_schedule_occurrence_history"),0)
    const res=await importLegacyScheduleOccurrenceHistoryToStage(pool(pg),f.plan())
    assert.equal(res.imported,1)
  }finally{await pg.close();f.close()}
})
test("different reviewed snapshot cannot overwrite an existing historical occurrence",async()=>{
  const f=fixture(),pg=await postgres()
  try{
    await bindUsers(pg,f)
    await importLegacyScheduleOccurrenceHistoryToStage(pool(pg),f.plan())
    f.mutate(db=>db.prepare("UPDATE agent_studio_schedule_occurrences SET attempts=3").run())
    f.refresh()
    await assert.rejects(importLegacyScheduleOccurrenceHistoryToStage(pool(pg),f.plan()),
      /occurrence_history_source_or_review_conflict/)
    assert.equal(await tableCount(pg,"legacy_schedule_occurrence_history"),1)
  }finally{await pg.close();f.close()}
})
test("DBA archive is immutable and API/Worker cannot read, even with accidental SELECT grant",async()=>{
  const f=fixture(),pg=await postgres()
  try{
    await bindUsers(pg,f)
    await importLegacyScheduleOccurrenceHistoryToStage(pool(pg),f.plan())
    for(const role of ["agentstudio_api","agentstudio_worker"]){
      await pg.exec("SET ROLE "+role)
      try{await assert.rejects(pg.query("SELECT * FROM agentstudio.legacy_schedule_occurrence_history"),/permission denied/)}
      finally{await pg.exec("RESET ROLE")}
    }
    await pg.exec("GRANT SELECT ON agentstudio.legacy_schedule_occurrence_history TO agentstudio_api,agentstudio_worker")
    for(const role of ["agentstudio_api","agentstudio_worker"]){
      await pg.exec("SET ROLE "+role)
      try{assert.equal((await pg.query("SELECT * FROM agentstudio.legacy_schedule_occurrence_history")).rows.length,0)}
      finally{await pg.exec("RESET ROLE")}
    }
    for(const sql of [
      "UPDATE agentstudio.legacy_schedule_occurrence_history SET execution_enabled=false",
      "DELETE FROM agentstudio.legacy_schedule_occurrence_history",
      "TRUNCATE agentstudio.legacy_schedule_occurrence_history",
    ])await assert.rejects(pg.query(sql),/legacy_occurrence_history_immutable/)
  }finally{await pg.close();f.close()}
})
