#!/usr/bin/env node
// Validate operator-approved PocketBase -> PG employee UUID mapping on one
// VERIFIED offline SQLite backup. NO automatic identity guessing, user
// provisioning, secret export, DB writes, or production connections.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const liveDir=path.resolve(root,"pocketbase","pb_data")
const name=/^[A-Za-z0-9_-]{1,120}$/
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idColumns=new Set([
  "rh_user_id","owner_uid","owner_user_id","member_uid",
  "recipient_uid","reviewer_uid","author_uid","actor_uid",
])
const allowed=new Set(["--snapshot","--manifest","--mapping"])
const fail=x=>{throw Error(x)}
function parse(argv){
  const config={}
  for(let i=0;i<argv.length;i++){
    const flag=argv[i]
    if(!allowed.has(flag)||Object.hasOwn(config,flag)||
       !argv[i+1]||argv[i+1].startsWith("--"))
      fail("invalid_arguments")
    config[flag]=argv[++i]
  }
  for(const key of allowed)if(!config[key])fail("missing_"+key.slice(2))
  return config
}
function safeFile(file,kind){
  const real=fs.realpathSync(path.resolve(file))
  const stat=fs.statSync(real)
  if(!stat.isFile()||stat.size<1)fail("invalid_"+kind)
  const dir=fs.existsSync(liveDir)?fs.realpathSync(liveDir):liveDir
  const normalize=x=>process.platform==="win32"?x.toLowerCase():x
  if(normalize(real).startsWith(normalize(dir+path.sep)))
    fail("refuse_live_pocketbase_database")
  if(kind==="mapping" && stat.size>5_000_000)fail("mapping_too_large")
  return {real,size:stat.size,mtimeMs:stat.mtimeMs}
}
async function hashFile(file){
  const sha=createHash("sha256")
  for await(const part of fs.createReadStream(file))sha.update(part)
  return sha.digest("hex")
}
const quote=s=>'"'+String(s).replaceAll('"','""')+'"'
function collect(db){
  const exists=db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='studio_users'"
  ).get()
  if(!exists)fail("studio_users_missing")
  const names=new Set(db.prepare("SELECT id FROM studio_users").all()
    .map(row=>String(row.id||"").trim()))
  if(!names.size)fail("no_source_employees")
  if([...names].some(x=>!name.test(x)))fail("unexpected_source_user_id")
  const references=new Set()
  const tables=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' "+
    "AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  for(const table of tables){
    const n=String(table.name)
    const columns=db.prepare("PRAGMA table_info("+quote(n)+")").all()
      .map(c=>String(c.name)).filter(x=>idColumns.has(x))
    for(const field of columns){
      for(const row of db.prepare("SELECT DISTINCT "+quote(field)+" AS id "+
        "FROM "+quote(n)+" WHERE "+quote(field)+" IS NOT NULL "+
        "AND LENGTH(TRIM(CAST("+quote(field)+" AS TEXT)))>0").all()){
        const value=String(row.id).trim()
        if(!name.test(value))fail("unexpected_owner_reference")
        references.add(value)
        if(references.size>100000)fail("identity_cardinality_unexpected")
      }
    }
  }
  return {names,references}
}
export async function audit(argv){
  const args=parse(argv)
  const source=safeFile(args["--snapshot"],"snapshot")
  const manifestPath=safeFile(args["--manifest"],"manifest")
  const mappingPath=safeFile(args["--mapping"],"mapping")
  if(new Set([source.real,manifestPath.real,mappingPath.real]).size!==3)
    fail("identity_input_paths_not_distinct")
  let manifest, mapping
  try{
    manifest=JSON.parse(fs.readFileSync(manifestPath.real,"utf8"))
    mapping=JSON.parse(fs.readFileSync(mappingPath.real,"utf8"))
  }catch{fail("invalid_identity_manifest_or_mapping")}
  if(manifest?.format!=="agent-studio-sqlite-snapshot-v1" ||
     !/^[a-f0-9]{64}$/.test(String(manifest.sha256))||
     source.size!==manifest.bytes)
    fail("verified_snapshot_manifest_required")
  if(await hashFile(source.real)!==manifest.sha256)
    fail("snapshot_fingerprint_mismatch")
  if(mapping?.schema_version!=="studio-approved-identity-map-v2" ||
     mapping?.source_sha256!==manifest.sha256 ||
     !Array.isArray(mapping.records))
    fail("approved_mapping_bound_to_snapshot_required")
  let users,refs
  const db=new DatabaseSync(source.real,{readOnly:true})
  try{
    const check=db.prepare("PRAGMA quick_check").get()
    if(Object.values(check||{})[0]!=="ok")fail("sqlite_integrity_failed")
    const result=collect(db)
    users=result.names; refs=result.references
  }finally{db.close()}
  const uniqueOld=new Set(),uniqueNew=new Set()
  let malformed=0,duplicate=0
  for(const item of mapping.records){
    if(!item||typeof item!=="object"||
       !name.test(String(item.old_id||""))||
       !uuid.test(String(item.new_studio_user_id||""))||
       typeof item.verified_by!=="string"||
       item.verified_by.trim().length<2 ||
       item.verified_by.length>120 ||
       typeof item.approved_at!=="string" ||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(item.approved_at)||
       !Number.isFinite(Date.parse(item.approved_at))){
      malformed++;continue
    }
    const old=String(item.old_id),next=String(item.new_studio_user_id).toLowerCase()
    if(uniqueOld.has(old)||uniqueNew.has(next)){duplicate++;continue}
    uniqueOld.add(old);uniqueNew.add(next)
  }
  const missed=[...users].filter(id=>!uniqueOld.has(id)).length
  const orphaned=[...refs].filter(id=>!users.has(id)).length
  const extraneous=[...uniqueOld].filter(id=>!users.has(id)).length
  const unverified=[...refs].filter(id=>!uniqueOld.has(id)).length
  const hasIssues=malformed+duplicate+missed+orphaned+extraneous+unverified>0
  const result={
    format:"agentstudio-identity-mapping-audit-v1",
    read_only:true,source_sha256:manifest.sha256,
    source_users:users.size,referenced_source_ids:refs.size,
    approved_unique_pairs:uniqueOld.size,
    malformed_records:malformed,duplicate_records:duplicate,
    unmapped_source_users:missed,orphaned_owner_references:orphaned,
    extraneous_mappings:extraneous,unmapped_owner_references:unverified,
    mapping_structurally_complete:!hasIssues,
    oidc_provisioning_verified:false,
    ready_for_production_cutover:false,
    warning:"Mapping shape/coverage only. Operator signoff, actual OIDC identity proof, and PostgreSQL RLS verification are still required.",
  }
  for(const item of [source,manifestPath,mappingPath]){
    const now=fs.statSync(item.real)
    if(now.size!==item.size||now.mtimeMs!==item.mtimeMs)
      fail("identity_inputs_changed_during_check")
  }
  console.log(JSON.stringify(result,null,2))
  if(hasIssues)process.exitCode=2
  return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  audit(process.argv.slice(2)).catch(error=>{
    const known=new Set([
      "invalid_arguments","missing_snapshot","missing_manifest","missing_mapping",
      "invalid_snapshot","invalid_manifest","invalid_mapping",
      "mapping_too_large","refuse_live_pocketbase_database",
      "identity_input_paths_not_distinct","invalid_identity_manifest_or_mapping",
      "verified_snapshot_manifest_required","snapshot_fingerprint_mismatch",
      "approved_mapping_bound_to_snapshot_required","studio_users_missing",
      "no_source_employees","unexpected_source_user_id",
      "unexpected_owner_reference","identity_cardinality_unexpected",
      "sqlite_integrity_failed","identity_inputs_changed_during_check",
    ])
    console.error("Identity audit refused: "+
      (known.has(error?.message)?error.message:"identity_audit_failed"))
    process.exitCode=1
  })
}
