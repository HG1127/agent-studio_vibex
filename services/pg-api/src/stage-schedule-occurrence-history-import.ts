// W28 — archive ONLY. No scheduler, Worker, run or external-effect activation.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {fileURLToPath} from "node:url"
import {DatabaseSync} from "node:sqlite"
import {contentHash} from "./stage-agent-import.ts"
import {isApprovedStageMigrationOwner} from "./stage-migration-identity.ts"
import type {SqlPool} from "./contracts.ts"

export class ScheduleOccurrenceHistoryError extends Error {}
const fail=(code:string):never=>{throw new ScheduleOccurrenceHistoryError("occurrence_history_"+code)}
const id=/^[A-Za-z0-9]{15}$/
const shaPattern=/^[0-9a-f]{64}$/
const sourceTable="agent_studio_schedule_occurrences"
const keys=[
  "id","schedule_id","rh_user_id","scheduled_for_ms","schedule_revision",
  "run_id","status","attempts","locked_until_ms","next_retry_ms",
  "error","created_ms","updated_ms",
] as const
const integerKeys=new Set<string>([
  "scheduled_for_ms","schedule_revision","attempts",
  "locked_until_ms","next_retry_ms","created_ms","updated_ms",
])
type Row=Record<string,unknown>
type ArchiveRow={
  legacy_id:string; legacy_schedule_id:string; legacy_run_id:string;
  owner_user_id:string; source_record:Row; payload_sha256:string
}
export type OccurrenceHistoryPlan={
  source_snapshot_sha256:string;identity_mapping_sha256:string;
  manifest_sha256:string; rows:ArchiveRow[]
}
const issued=new WeakMap<OccurrenceHistoryPlan,string>()
const hash=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex")
function approved(review:Row){
  return typeof review?.verified_by==="string"&&
    review.verified_by.trim().length>=2&&review.verified_by.length<=120&&
    typeof review.approved_at==="string"&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(review.approved_at)&&
    Number.isFinite(Date.parse(review.approved_at))
}
const secret=/(?:password|passwd|secret|credential|private[_ -]?key|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer\s|-----BEGIN.*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,})/i
function safeFile(p:string){
  const actual=fs.realpathSync(path.resolve(p))
  const livePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../pocketbase/pb_data")
  const live=fs.existsSync(livePath)?fs.realpathSync(livePath):livePath
  const norm=(name:string)=>process.platform==="win32"?name.toLowerCase():name
  if(!fs.statSync(actual).isFile()||norm(actual)===norm(live)||
    norm(actual).startsWith(norm(live+path.sep)))fail("live_or_invalid_file")
  return actual
}
export function prepareScheduleOccurrenceHistory(
  snapshotPath:string,manifestPath:string,mappingPath:string,
):OccurrenceHistoryPlan {
 try{return prepare(snapshotPath,manifestPath,mappingPath)}catch(error){
   if(error instanceof ScheduleOccurrenceHistoryError)throw error
   return fail("source_invalid")
 }
}
function prepare(snapshotPath:string,manifestPath:string,mappingPath:string):OccurrenceHistoryPlan{
  const files=[snapshotPath,manifestPath,mappingPath].map(safeFile)
  if(new Set(files.map(x=>x.toLowerCase())).size!==3)fail("duplicate_input")
  const [snapshot,manifestPath2,mappingPath2]=files as [string,string,string]
  if(["-wal","-shm","-journal"].some(s=>fs.existsSync(snapshot+s)))fail("source_not_frozen")
  if(fs.statSync(manifestPath2).size>5_000_000||fs.statSync(mappingPath2).size>5_000_000)
    fail("review_file_too_large")
  const before=files.map(f=>hash(fs.readFileSync(f)))
  const info=JSON.parse(fs.readFileSync(manifestPath2,"utf8")) as Row
  const mapping=JSON.parse(fs.readFileSync(mappingPath2,"utf8")) as Row
  if(info.format!=="agent-studio-sqlite-snapshot-v1"||
    info.sha256!==before[0]||info.bytes!==fs.statSync(snapshot).size||
    !shaPattern.test(String(info.sha256))||
    !info.tables||typeof info.tables!=="object"||Array.isArray(info.tables))
    fail("snapshot_manifest_mismatch")
  if(mapping.schema_version!=="studio-approved-identity-map-v2"||
    mapping.source_sha256!==before[0]||!Array.isArray(mapping.records))
    fail("identity_review_missing")
  const review=info.schedule_occurrence_archive_review as Row
  if(!review||review.source_sha256!==before[0]||
    review.identity_mapping_sha256!==before[2]||
    review.credentials_absent!==true||!approved(review))
    fail("independent_row_review_missing")
  const db=new DatabaseSync(snapshot,{readOnly:true})
  try{
    db.exec("BEGIN")
    if(Object.values(db.prepare("PRAGMA quick_check").get()??{})[0]!=="ok")
      fail("sqlite_integrity_failed")
    const sqliteTables=db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' "+
      "AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(x=>String(x.name))
    const tableCounts=info.tables as Row
    if(sqliteTables.length===0||Object.keys(tableCounts).length!==sqliteTables.length||
      sqliteTables.some(t=>!Object.hasOwn(tableCounts,t)))fail("manifest_missing_tables")
    for(const t of sqliteTables){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(t)||
        !Number.isSafeInteger(tableCounts[t])||Number(tableCounts[t])<0)
        fail("unknown_table_or_invalid_count")
      if(db.prepare('SELECT COUNT(*) AS n FROM "'+t+'"').get()?.n!==tableCounts[t])
        fail("manifest_count_mismatch")
    }
    for(const need of [sourceTable,"studio_users","agent_studio_schedules"])
      if(!Object.hasOwn(tableCounts,need))fail("source_table_missing")
    const cols=db.prepare("PRAGMA table_xinfo("+sourceTable+")").all()
    if(cols.length!==keys.length||cols.some(c=>Number(c.hidden)!==0||
      !keys.includes(String(c.name) as typeof keys[number])))fail("source_fields_unsupported")
    for(const c of cols){
      const expected=integerKeys.has(String(c.name))?/^(?:INTEGER|NUMERIC|REAL)$/i:/^TEXT$/i
      if(!expected.test(String(c.type)))fail("source_field_types_unsupported")
    }
    const users=new Set(db.prepare("SELECT id FROM studio_users").all().map(x=>String(x.id)))
    const owners=new Map<string,string>(),targetOwners=new Set<string>()
    for(const r of mapping.records as Row[]){
      const old=String(r.old_id),user=String(r.new_studio_user_id).toLowerCase()
      if(!id.test(old)||!users.has(old)||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(user)||
        !approved(r)||owners.has(old)||targetOwners.has(user))fail("unapproved_owner")
      owners.set(old,user);targetOwners.add(user)
    }
    if(!users.size||owners.size!==users.size)fail("incomplete_identity_map")
    const n=Number(tableCounts[sourceTable])
    if(n<=0||n>10000)fail("row_count_unsupported")
    const rowReview=(review.tables as Row)?.[sourceTable] as Row|undefined
    const receipts=rowReview?.row_sha256
    if(!Array.isArray(receipts)||receipts.length!==n||
      new Set(receipts as string[]).size!==n||
      receipts.some(v=>typeof v!=="string"||!shaPattern.test(v)))
      fail("row_review_missing_or_extra")
    const reviewed=new Set(receipts as string[])
    const archiveRows:ArchiveRow[]=[],seen=new Set<string>()
    for(const source of db.prepare("SELECT * FROM "+sourceTable+" ORDER BY id").all() as Row[]){
      if(Object.keys(source).length!==keys.length||keys.some(k=>!Object.hasOwn(source,k)))
        fail("source_fields_unsupported")
      for(const k of integerKeys){
        if(!Number.isSafeInteger(source[k])||Number(source[k])<0||
          Object.is(source[k],-0))fail("number_not_lossless")
      }
      for(const k of keys.filter(x=>!integerKeys.has(x))){
        if(typeof source[k]!=="string"||(source[k] as string).includes("\0")||
          (source[k] as string).length>32768)fail("text_not_lossless")
      }
      if(!id.test(String(source.id))||seen.has(String(source.id))||
        !id.test(String(source.schedule_id))||!id.test(String(source.rh_user_id))||
        !id.test(String(source.run_id)))fail("source_reference_invalid")
      seen.add(String(source.id))
      if(!owners.has(String(source.rh_user_id))||
        Number(source.schedule_revision)<1||
        String(source.status).length===0||String(source.status).length>128||
        secret.test(String(source.error)))fail("source_record_unsafe")
      const parent=db.prepare(
        "SELECT id,rh_user_id FROM agent_studio_schedules WHERE id=?").all(String(source.schedule_id))
      if(parent.length!==1||parent[0]?.rh_user_id!==source.rh_user_id)
        fail("parent_schedule_missing_or_foreign")
      const runs:Row[]=[]
      for(const table of ["agent_runs","workflow_runs"]){
        if(Object.hasOwn(tableCounts,table)){
          const columns=db.prepare("PRAGMA table_info("+table+")").all()
            .map(x=>String(x.name))
          if(!columns.includes("id")||!columns.includes("rh_user_id"))
            fail("run_owner_column_missing")
          runs.push(...(db.prepare("SELECT id,rh_user_id FROM "+table+
            " WHERE id=?").all(String(source.run_id)) as Row[]))
        }
      }
      if(runs.length!==1||runs[0]?.rh_user_id!==source.rh_user_id)
        fail("parent_run_missing_or_foreign")
      const payload_sha256=contentHash(source)
      if(!reviewed.has(payload_sha256))fail("unreviewed_row_content")
      archiveRows.push({legacy_id:String(source.id),
        legacy_schedule_id:String(source.schedule_id),
        legacy_run_id:String(source.run_id),
        owner_user_id:owners.get(String(source.rh_user_id))!,
        source_record:structuredClone(source),payload_sha256})
    }
    if(seen.size!==n||new Set(archiveRows.map(x=>x.payload_sha256)).size!==n)
      fail("row_review_mismatch")
    if(files.some((p,i)=>hash(fs.readFileSync(p))!==before[i])||
       ["-wal","-shm","-journal"].some(s=>fs.existsSync(snapshot+s)))
      fail("frozen_source_changed")
    const plan:OccurrenceHistoryPlan={
      source_snapshot_sha256:String(info.sha256),
      identity_mapping_sha256:before[2]!,
      manifest_sha256:before[1]!,
      rows:archiveRows,
    }
    issued.set(plan,contentHash(plan))
    return plan
  }finally{db.close()}
}
export async function importLegacyScheduleOccurrenceHistoryToStage(
 pool:SqlPool,plan:OccurrenceHistoryPlan,
){
  if(!issued.has(plan)||issued.get(plan)!==contentHash(plan)||
    !plan.rows.length)fail("unverified_or_mutated_plan")
  const batch=structuredClone(plan)
  const db=await pool.connect().catch(()=>fail("sql_failed"))
  let begun=false
  try{
    await db.query("BEGIN");begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    await db.query("SET LOCAL statement_timeout='30s'")
    const g=(await db.query<{database:string;login:string;admin:boolean;version:number}>(
      "SELECT current_database() AS database,session_user AS login,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,"+
      "current_setting('server_version_num')::integer AS version")).rows[0]
    if(!g||g.database!=="agentstudio_stage"||g.login!=="agentstudio_admin"||
      g.admin!==true||g.version<170000||g.version>=180000)
      fail("wrong_stage_database_or_version")
    await db.query("LOCK TABLE agentstudio.legacy_schedule_occurrence_history,"+
      "agentstudio.legacy_user_imports,agentstudio.users,"+
      "agentstudio.jobs,agentstudio.runs,agentstudio.schedules,"+
      "agentstudio.schedule_occurrences IN EXCLUSIVE MODE")
    if((await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v9_018'")).rows.length!==1||
       (await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version='pg_v8_011'")).rows.length!==1)
      fail("missing_archive_or_identity_schema")
    if((await db.query(
      "SELECT 1 FROM agentstudio.jobs WHERE status IN ('queued','leased') UNION ALL "+
      "SELECT 1 FROM agentstudio.runs WHERE status IN ('queued','running','awaiting_approval','paused') UNION ALL "+
      "SELECT 1 FROM agentstudio.schedules WHERE enabled=true UNION ALL "+
      "SELECT 1 FROM agentstudio.schedule_occurrences")).rows.length)
      fail("active_stage_runtime")
    if((await db.query(
      "SELECT 1 FROM agentstudio.legacy_schedule_occurrence_history "+
      "WHERE source_snapshot_sha256<>$1 OR identity_mapping_sha256<>$2 OR manifest_sha256<>$3",
      [batch.source_snapshot_sha256,batch.identity_mapping_sha256,batch.manifest_sha256])).rows.length)
      fail("source_or_review_conflict")
    let imported=0,replayed=0
    for(const row of batch.rows){
      const ok=await isApprovedStageMigrationOwner(db,row.owner_user_id,batch.source_snapshot_sha256)
      if(!ok)fail("unapproved_stage_owner")
      const prior=(await db.query<Row>(
        "SELECT * FROM agentstudio.legacy_schedule_occurrence_history "+
        "WHERE legacy_occurrence_id=$1",[row.legacy_id])).rows[0]
      if(!prior){
        await db.query(
          "INSERT INTO agentstudio.legacy_schedule_occurrence_history "+
          "(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,"+
          "legacy_occurrence_id,legacy_schedule_id,legacy_run_id,owner_user_id,"+
          "payload_sha256,source_record) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9::jsonb)",
          [batch.source_snapshot_sha256,batch.identity_mapping_sha256,batch.manifest_sha256,
            row.legacy_id,row.legacy_schedule_id,row.legacy_run_id,
            row.owner_user_id,row.payload_sha256,JSON.stringify(row.source_record)])
        imported++
      }else replayed++
      const stored=(await db.query<Row>(
        "SELECT * FROM agentstudio.legacy_schedule_occurrence_history "+
        "WHERE legacy_occurrence_id=$1",[row.legacy_id])).rows[0]
      if(!stored||stored.source_snapshot_sha256!==batch.source_snapshot_sha256||
        stored.identity_mapping_sha256!==batch.identity_mapping_sha256||
        stored.manifest_sha256!==batch.manifest_sha256||
        stored.legacy_schedule_id!==row.legacy_schedule_id||
        stored.legacy_run_id!==row.legacy_run_id||
        stored.owner_user_id!==row.owner_user_id||
        stored.payload_sha256!==row.payload_sha256||
        stored.evidence_status!=="historical_unverified"||
        stored.execution_enabled!==false||stored.lease_reactivated!==false||
        contentHash(stored.source_record)!==row.payload_sha256)
        fail("readback_reconciliation_failed")
    }
    const count=(await db.query<{n:number}>(
      "SELECT count(*)::int AS n FROM agentstudio.legacy_schedule_occurrence_history")).rows[0]?.n
    if(count!==batch.rows.length)fail("batch_incomplete")
    await db.query("COMMIT");begun=false
    return {stage_only:true,imported,replayed,reconciled:batch.rows.length,
      execution_enabled:false,lease_reactivated:false,jobs_created:0,
      production_cutover_allowed:false}
  }catch(error){
    if(begun)await db.query("ROLLBACK").catch(()=>undefined)
    if(error instanceof ScheduleOccurrenceHistoryError)throw error
    return fail("sql_failed")
  }finally{db.release()}
}
