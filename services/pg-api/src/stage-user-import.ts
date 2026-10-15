// V8.5 W7: stage-only DISABLED employee identity preprovision.
// This is NOT OIDC proof/SSO enrollment and never grants login or teams.
// All source data is read from a verified offline PocketBase backup.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"
import {contentHash} from "./stage-agent-import.ts"
import {isUuid,type SqlPool} from "./contracts.ts"

export class StageUserError extends Error {
  constructor(code:string){super(code)}
}
function fail(code:string):never{throw new StageUserError(code)}
const sha=/^[a-f0-9]{64}$/
const legacy=/^[A-Za-z0-9_-]{1,120}$/
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const live=path.join(repo,"pocketbase","pb_data")
function safeFile(input:string,label:string){
  const real=fs.realpathSync(path.resolve(input))
  const st=fs.lstatSync(real)
  if(!st.isFile()||!st.size)fail("invalid_"+label)
  const realLive=fs.existsSync(live)?fs.realpathSync(live):live
  const normal=(v:string)=>process.platform==="win32"?v.toLowerCase():v
  if(normal(real)===normal(realLive)||
     normal(real).startsWith(normal(realLive+path.sep)))
    fail("live_pocketbase_data_forbidden")
  if(label!=="snapshot"&&st.size>5_000_000)
    fail("identity_review_file_too_large")
  return {real,size:st.size,mtimeMs:st.mtimeMs}
}
function digest(file:string):string{
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
function json(file:string):Record<string,unknown>{
  try{
    const value=JSON.parse(fs.readFileSync(file,"utf8"))
    if(!value||Array.isArray(value)||typeof value!=="object")
      fail("invalid_approved_document")
    return value as Record<string,unknown>
  }catch{return fail("invalid_approved_document")}
}
function verifiedAt(value:unknown):value is string{
  return typeof value==="string"&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&
    Number.isFinite(Date.parse(value))
}
function expectedIssuer(value:unknown):string{
  if(typeof value!=="string"||value.length>350)
    return fail("approved_issuer_invalid")
  let url:URL
  try{url=new URL(value)}catch{return fail("approved_issuer_invalid")}
  // OIDC issuer is an EXACT URL string, frequently with a tenant path
  // (Azure Entra /<tenant>/v2.0, Okta /oauth2/default). Reducing to origin
  // would silently map identities across IdP tenants.
  if(url.protocol!=="https:"||url.username||url.password||
     url.search||url.hash||url.hostname.length<3||url.port)
    fail("approved_issuer_invalid")
  if(value!==url.href&&value+"/"!==url.href)
    fail("approved_issuer_invalid")
  return value
}
type ApprovedProvisionRow={
  legacy_id:string
  target_user_id:string
  issuer:string
  subject:string
  reviewed_by:string
  reviewed_at:string
  identity_sha256:string
}
export interface ApprovedProvisionPlan{
  source_snapshot_sha256:string
  reviewed_mapping_sha256:string
  reviewed_idp_sha256:string
  rows:ApprovedProvisionRow[]
}
const issued=new WeakMap<ApprovedProvisionPlan,string>()

export function prepareDisabledUserProvision(
  snapshotPath:string,manifestPath:string,identityPath:string,
  oidcPath:string):ApprovedProvisionPlan{
  const files=[
    safeFile(snapshotPath,"snapshot"),
    safeFile(manifestPath,"manifest"),
    safeFile(identityPath,"mapping"),
    safeFile(oidcPath,"oidc"),
  ]
  if(new Set(files.map(v=>v.real)).size!==4)
    fail("identity_inputs_not_distinct")
  const [source,manifest,mapping,oidc]=files as [
    typeof files[0],typeof files[0],typeof files[0],typeof files[0],
  ]
  if(["-wal","-shm","-journal"].some(x=>fs.existsSync(source.real+x)))
    fail("sqlite_sidecar_not_frozen")
  const info=json(manifest.real)
  if(info.format!=="agent-studio-sqlite-snapshot-v1"||
     typeof info.sha256!=="string"||!sha.test(info.sha256)||
     info.bytes!==source.size||
     !info.tables||typeof info.tables!=="object"||
     Array.isArray(info.tables))
    fail("identity_snapshot_manifest_invalid")
  const fingerprint=digest(source.real)
  if(fingerprint!==info.sha256)
    fail("identity_snapshot_sha_mismatch")
  const map=json(mapping.real)
  const idp=json(oidc.real)
  if(map.schema_version!=="studio-approved-identity-map-v2"||
     map.source_sha256!==fingerprint||!Array.isArray(map.records)||
     idp.schema_version!=="studio-reviewed-oidc-provision-v1"||
     idp.source_sha256!==fingerprint||!Array.isArray(idp.records))
    fail("identity_review_not_bound_to_snapshot")
  const db=new DatabaseSync(source.real,{readOnly:true})
  let users:Set<string>
  try{
    const valid=db.prepare("PRAGMA quick_check").get()
    if(Object.values(valid||{})[0]!=="ok")fail("sqlite_integrity_failed")
    const list=db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' "+
      "AND name NOT LIKE 'sqlite_%'").all()
    const tables=new Set(list.map(x=>String(x.name)))
    if(!tables.has("studio_users"))fail("source_users_missing")
    const columns=db.prepare('PRAGMA table_info("studio_users")').all()
    if(!columns.some(col=>col.name==="id"))
      fail("source_users_schema_invalid")
    for(const [name,total] of Object.entries(
      info.tables as Record<string,unknown>)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,120}$/.test(name)||
         !tables.has(name)||!Number.isSafeInteger(total)||
         Number(total)<0)
        fail("source_manifest_rows_invalid")
      const row=db.prepare('SELECT count(*) AS n FROM "'+name+'"').get()
      if(Number(row?.n)!==total)fail("source_manifest_rows_mismatch")
    }
    if((info.tables as Record<string,unknown>).studio_users===undefined)
      fail("source_users_not_manifested")
    users=new Set(db.prepare("SELECT id FROM studio_users").all()
      .map(row=>String(row.id||"")))
    if(users.size>5000)fail("identity_stage_batch_too_large")
    if(!users.size||[...users].some(x=>!legacy.test(x)))
      fail("source_users_invalid")
  }finally{db.close()}
  const reviewed=new Map<string,string>()
  const taken=new Set<string>()
  for(const entry of map.records){
    const row=entry as Record<string,unknown>
    if(!row||typeof row.old_id!=="string"||
       !legacy.test(row.old_id)||!users.has(row.old_id)||
       !isUuid(row.new_studio_user_id)||
       typeof row.verified_by!=="string"||
       row.verified_by.trim().length<2||
       !verifiedAt(row.approved_at))
      fail("identity_mapping_invalid")
    const old=row.old_id,target=row.new_studio_user_id.toLowerCase()
    if(reviewed.has(old)||taken.has(target))
      fail("identity_mapping_duplicate")
    reviewed.set(old,target)
    taken.add(target)
  }
  if(reviewed.size!==users.size)
    fail("identity_mapping_incomplete")
  const verified:ApprovedProvisionRow[]=[]
  const found=new Set<string>(), subjects=new Set<string>()
  for(const entry of idp.records){
    const row=entry as Record<string,unknown>
    if(!row||typeof row.old_id!=="string"||
       !reviewed.has(row.old_id)||
       !isUuid(row.new_studio_user_id)||
       reviewed.get(row.old_id)!==row.new_studio_user_id.toLowerCase()||
       typeof row.external_subject!=="string"||
       row.external_subject.length<1||
       row.external_subject.length>256||
       /[\u0000-\u001f]/.test(row.external_subject)||
       typeof row.reviewed_by!=="string"||
       row.reviewed_by.trim().length<2||
       !verifiedAt(row.reviewed_at))
      fail("oidc_mapping_not_reviewed")
    const issuer=expectedIssuer(row.external_issuer)
    const key=issuer+"\0"+row.external_subject
    if(found.has(row.old_id)||subjects.has(key))
      fail("oidc_duplicate_identity")
    found.add(row.old_id);subjects.add(key)
    const base={
      legacy_id:row.old_id,target_user_id:reviewed.get(row.old_id)!,
      issuer,subject:row.external_subject,
      reviewed_by:row.reviewed_by,reviewed_at:row.reviewed_at,
    }
    verified.push({...base,identity_sha256:contentHash(base)})
  }
  if(found.size!==users.size)fail("oidc_mapping_incomplete")
  verified.sort((a,b)=>a.legacy_id.localeCompare(b.legacy_id))
  for(const file of files){
    const stat=fs.statSync(file.real)
    if(stat.size!==file.size||stat.mtimeMs!==file.mtimeMs)
      fail("identity_sources_changed_during_scan")
  }
  const plan:ApprovedProvisionPlan={
    source_snapshot_sha256:fingerprint,
    reviewed_mapping_sha256:digest(mapping.real),
    reviewed_idp_sha256:digest(oidc.real),
    rows:verified,
  }
  issued.set(plan,contentHash(plan))
  return plan
}
export async function provisionDisabledStageUsers(pool:SqlPool,
  plan:ApprovedProvisionPlan):Promise<{
    stage_only:true;new_accounts_active:false;production_cutover_allowed:false;
    users_created:number;users_replayed:number;users_reconciled:number
  }>{
  if(!issued.has(plan)||issued.get(plan)!==contentHash(plan)||
     !sha.test(plan.source_snapshot_sha256)||
     !sha.test(plan.reviewed_mapping_sha256)||
     !sha.test(plan.reviewed_idp_sha256)||
     !plan.rows.length||plan.rows.length>5000)
    fail("identity_unverified_or_mutated_plan")
  const rows=structuredClone(plan.rows)
  const db=await pool.connect()
  let begun=false
  try{
    await db.query("BEGIN");begun=true
    await db.query("SET LOCAL lock_timeout='5s'")
    const verify=await db.query<{
      database:string;login:string;admin:boolean;version:number
    }>("SELECT current_database() AS database,session_user AS login,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,"+
      "current_setting('server_version_num')::integer AS version")
    const target=verify.rows[0]
    if(target?.database!=="agentstudio_stage"||
       target?.login!=="agentstudio_admin"||target.admin!==true||
       Number(target.version)<170000||Number(target.version)>=180000)
      fail("refuse_nonisolated_identity_target")
    const version=await db.query<{ok:boolean}>(
      "SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v8_011') AS ok")
    if(version.rows[0]?.ok!==true)
      fail("identity_stage_schema_missing")
    await db.query("LOCK TABLE agentstudio.users,"+
      "agentstudio.legacy_user_imports,"+
      "agentstudio.jobs IN EXCLUSIVE MODE")
    const running=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.jobs "+
      "WHERE status IN ('queued','leased')")
    if(Number(running.rows[0]?.n)!==0)
      fail("identity_stage_jobs_not_drained")
    const existing=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.users AS u "+
      "LEFT JOIN agentstudio.legacy_user_imports AS m "+
      "ON m.target_user_id=u.id WHERE m.target_user_id IS NULL")
    if(Number(existing.rows[0]?.n)!==0)
      fail("identity_target_has_untracked_users")
    const other=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.legacy_user_imports "+
      "WHERE source_snapshot_sha256<>$1::text OR "+
      "reviewed_mapping_sha256<>$2::text OR reviewed_idp_sha256<>$3::text",
      [plan.source_snapshot_sha256,plan.reviewed_mapping_sha256,
        plan.reviewed_idp_sha256])
    if(Number(other.rows[0]?.n)!==0)
      fail("identity_source_or_approval_conflict")
    let created=0,replayed=0
    for(const row of rows){
      const current=await db.query<{
        target_user_id:string;identity_row_sha256:string
      }>("SELECT target_user_id,identity_row_sha256 "+
        "FROM agentstudio.legacy_user_imports "+
        "WHERE legacy_user_id=$1::text FOR UPDATE",
        [row.legacy_id])
      const previous=current.rows[0]
      if(previous){
        if(previous.target_user_id!==row.target_user_id||
           previous.identity_row_sha256!==row.identity_sha256)
          fail("identity_existing_row_mismatch")
        replayed++
      }else{
        await db.query(
          "INSERT INTO agentstudio.users "+
          "(id,external_issuer,external_subject,display_name,status) "+
          "VALUES($1::uuid,$2::text,$3::text,'','disabled')",
          [row.target_user_id,row.issuer,row.subject],
        )
        await db.query(
          "INSERT INTO agentstudio.legacy_user_imports "+
          "(source_snapshot_sha256,legacy_user_id,target_user_id,"+
          "reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) "+
          "VALUES($1::text,$2::text,$3::uuid,$4::text,$5::text,$6::text)",
          [plan.source_snapshot_sha256,row.legacy_id,row.target_user_id,
            plan.reviewed_mapping_sha256,plan.reviewed_idp_sha256,
            row.identity_sha256],
        )
        created++
      }
      const currentUser=await db.query<{
        id:string;external_issuer:string;external_subject:string;
        status:string;identity_row_sha256:string
      }>("SELECT u.id,u.external_issuer,u.external_subject,u.status,"+
        "m.identity_row_sha256 "+
        "FROM agentstudio.users AS u "+
        "JOIN agentstudio.legacy_user_imports AS m ON "+
        "m.target_user_id=u.id WHERE m.legacy_user_id=$1::text "+
        "AND m.source_snapshot_sha256=$2::text",
        [row.legacy_id,plan.source_snapshot_sha256])
      const value=currentUser.rows[0]
      if(!value||value.id!==row.target_user_id||
         value.external_issuer!==row.issuer||
         value.external_subject!==row.subject||
         value.status!=="disabled"||
         value.identity_row_sha256!==row.identity_sha256)
        fail("identity_stage_reconciliation_failed")
    }
    const count=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.legacy_user_imports "+
      "WHERE source_snapshot_sha256=$1::text",
      [plan.source_snapshot_sha256])
    if(Number(count.rows[0]?.n)!==rows.length)
      fail("identity_stage_batch_incomplete")
    await db.query("COMMIT");begun=false
    return {stage_only:true,new_accounts_active:false,
      production_cutover_allowed:false,users_created:created,
      users_replayed:replayed,users_reconciled:rows.length}
  }catch(error){
    if(begun)await db.query("ROLLBACK").catch(()=>undefined)
    if(error instanceof StageUserError)throw error
    throw new StageUserError("identity_stage_sql_failed")
  }finally{db.release()}
}
