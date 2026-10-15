// PostgreSQL V8.3: approved, stage-only PocketBase Agent configuration import.
// Only a strict lossless first slice. Unknown fields or non-empty knowledge
// bindings are NOT silently dropped. No API endpoints or production exports.
import {createHash} from "node:crypto"
import {safeAgentSpec,isUuid,type AgentSpecInput,
  type SqlClient,type SqlPool} from "./contracts.ts"

const digest=/^[a-f0-9]{64}$/
const oldId=/^[a-zA-Z0-9_-]{1,64}$/
const fields=[
  "goal","task_scope","deliverables","task_plan","done_criteria",
  "tools","knowledge_base_ids","require_approval",
]
export type LegacyAgentRow={
  legacy_id:string
  owner_user_id:string
  name:string
  spec:AgentSpecInput
  created_at:string
  updated_at:string
  payload_sha256:string
}
export class StageImportError extends Error {
  constructor(code:string){super(code)}
}
function fail(code:string):never{throw new StageImportError(code)}
function canonical(value:unknown):string{
  if(value===null)return "null"
  if(typeof value==="string"||typeof value==="boolean"||
     (typeof value==="number"&&Number.isFinite(value)))
    return JSON.stringify(value)
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]"
  if(value&&typeof value==="object"){
    const obj=value as Record<string,unknown>
    const keys=Object.keys(obj).sort()
    if(keys.some(k=>k==="__proto__"||k==="constructor"||k==="prototype"))
      fail("legacy_unsafe_json_key")
    return "{"+keys.map(key=>
      JSON.stringify(key)+":"+canonical(obj[key])).join(",")+"}"
  }
  return fail("legacy_invalid_json_value")
}
export function contentHash(value:unknown):string{
  return createHash("sha256").update(canonical(value)).digest("hex")
}
export function normalizeLegacyAgent(raw:Record<string,unknown>,
  owners:ReadonlyMap<string,string>):LegacyAgentRow{
  const legacy=raw.id
  const owner=raw.rh_user_id
  if(typeof legacy!=="string"||!oldId.test(legacy) ||
     typeof owner!=="string"||!oldId.test(owner)||
     !owners.has(owner)||!isUuid(owners.get(owner)))
    fail("legacy_agent_identity_not_mapped")
  const name=raw.name
  if(typeof name!=="string"||!name.trim()||name!==name.trim()||
     name.length>120||name.includes("\0"))
    fail("legacy_agent_name_incompatible")
  // Present in the old PocketBase record, but not represented in new API.
  if((raw.source!==undefined&&raw.source!==null&&raw.source!=="")||
     (raw.template_key!==undefined&&raw.template_key!==null&&raw.template_key!==""))
    fail("legacy_source_metadata_not_supported")
  if(typeof raw.spec==="string"&&raw.spec.length>50000)
    fail("legacy_spec_payload_too_large")
  let parsed:unknown
  try{
    parsed=typeof raw.spec==="string"?JSON.parse(raw.spec):raw.spec
  }catch{fail("legacy_spec_json_invalid")}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
    fail("legacy_spec_not_object")
  const data=parsed as Record<string,unknown>
  if(Object.keys(data).length!==fields.length||
     Object.keys(data).some(key=>!fields.includes(key))||
     fields.some(key=>!Object.hasOwn(data,key))||
     data.require_approval!==true||
     !Array.isArray(data.knowledge_base_ids)||
     data.knowledge_base_ids.length!==0)
    fail("legacy_spec_requires_lossless_feature_mapping")
  let checked:AgentSpecInput
  try{
    const safe=Object.fromEntries(fields.filter(key=>
      key!=="knowledge_base_ids"&&key!=="require_approval")
      .map(key=>[key,data[key]]))
    checked=safeAgentSpec(safe)
  }catch{fail("legacy_spec_invalid_or_unsupported_tool")}
  if(canonical(checked)!==canonical(data))
    fail("legacy_spec_would_be_normalized")
  function timestamp(value:unknown):string{
    if(typeof value!=="string"||
      !/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))
      fail("legacy_agent_timestamp_incompatible")
    const date=new Date(value.replace(" ","T"))
    if(!Number.isFinite(date.valueOf())||
       date.toISOString().slice(0,10)!==value.slice(0,10))
      fail("legacy_agent_timestamp_incompatible")
    return date.toISOString()
  }
  const created=timestamp(raw.created)
  const updated=timestamp(raw.updated)
  if(Date.parse(updated)<Date.parse(created))
    fail("legacy_agent_clock_order_invalid")
  const spec=checked
  const ownerId=owners.get(owner)!
  return {
    legacy_id:legacy,owner_user_id:ownerId,name,spec,
    created_at:created,updated_at:updated,
    payload_sha256:contentHash({
      legacy_id:legacy,owner_user_id:ownerId,name,spec,
      created_at:created,updated_at:updated,
    }),
  }
}
export async function importLegacyAgentsToStage(pool:SqlPool,
  sourceSha:string,rows:readonly LegacyAgentRow[]):Promise<{
    stage_only:true;imported:number;replayed:number;reconciled:number;
    source_snapshot_sha256:string;production_cutover_allowed:false
  }>{
  if(!digest.test(sourceSha)||!Array.isArray(rows)||
     rows.length<1||rows.length>5000)
    fail("invalid_stage_batch")
  const uniques=new Set<string>()
  for(const row of rows){
    if(!oldId.test(row.legacy_id)||!isUuid(row.owner_user_id)||
      !digest.test(row.payload_sha256)||uniques.has(row.legacy_id)||
      normalizeLegacyAgent({
        id:row.legacy_id,rh_user_id:row.owner_user_id,name:row.name,
        spec:row.spec,source:"",template_key:"",
        created:row.created_at,updated:row.updated_at,
      },new Map([[row.owner_user_id,row.owner_user_id]])).payload_sha256!==
        row.payload_sha256)
      fail("stage_batch_tampered_or_duplicate")
    uniques.add(row.legacy_id)
  }
  const db=await pool.connect()
  let begun=false
  try{
    await db.query("BEGIN")
    begun=true
    const guard=await db.query<{
      database:string;login:string;admin:boolean;version:number
    }>(
      "SELECT current_database() AS database,session_user AS login,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,"+
      "current_setting('server_version_num')::integer AS version",
    )
    const stage=guard.rows[0]
    if(!stage||stage.database!=="agentstudio_stage"||
       stage.login!=="agentstudio_admin"||stage.admin!==true||
       Number(stage.version)<170000||Number(stage.version)>=180000)
      fail("refuse_nonisolated_postgres_database")
    const version=await db.query<{ok:boolean}>(
      "SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v8_005') AS ok")
    if(!version.rows[0]?.ok)fail("missing_stage_import_schema")
    const blocking=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.jobs "+
      "WHERE status IN ('queued','leased')",
    )
    if(Number(blocking.rows[0]?.n)>0)
      fail("stage_jobs_must_be_drained")
    const rowCount=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.agent_specs AS a "+
      "LEFT JOIN agentstudio.legacy_agent_imports AS m "+
      "ON a.id=m.target_spec_id "+
      "WHERE m.target_spec_id IS NULL",
    )
    if(Number(rowCount.rows[0]?.n)>0)
      fail("stage_existing_untracked_agents")
    const otherSources=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.legacy_agent_imports "+
      "WHERE source_snapshot_sha256<>$1::text",
      [sourceSha],
    )
    if(Number(otherSources.rows[0]?.n)>0)
      fail("stage_import_source_conflict")
    const owners=[...new Set(rows.map(row=>row.owner_user_id))]
    const checked=await db.query<{id:string}>(
      "SELECT id FROM agentstudio.users WHERE id=ANY($1::uuid[])",
      [owners],
    )
    if(checked.rows.length!==owners.length)
      fail("stage_users_not_preprovisioned")
    let imported=0,replayed=0
    for(const row of rows){
      const prev=await db.query<{
        target_spec_id:string;owner_user_id:string;payload_sha256:string
      }>(
        "SELECT target_spec_id,owner_user_id,payload_sha256 "+
        "FROM agentstudio.legacy_agent_imports "+
        "WHERE legacy_spec_id=$1::text FOR UPDATE",
        [row.legacy_id],
      )
      const existing=prev.rows[0]
      if(existing){
        if(existing.owner_user_id!==row.owner_user_id||
           existing.payload_sha256!==row.payload_sha256)
          fail("stage_import_existing_mismatch")
        replayed++
      }else{
        const created=await db.query<{id:string}>(
          "INSERT INTO agentstudio.agent_specs "+
          "(owner_user_id,name,spec,requires_approval,created_at,updated_at) "+
          "VALUES($1::uuid,$2::text,$3::jsonb,true,$4::timestamptz,"+
          "$5::timestamptz) RETURNING id",
          [row.owner_user_id,row.name,JSON.stringify(row.spec),
            row.created_at,row.updated_at],
        )
        const target=created.rows[0]?.id
        if(!isUuid(target))fail("stage_insert_returned_invalid_id")
        await db.query(
          "INSERT INTO agentstudio.legacy_agent_imports "+
          "(source_snapshot_sha256,legacy_spec_id,owner_user_id,"+
          "target_spec_id,payload_sha256) "+
          "VALUES($1::text,$2::text,$3::uuid,$4::uuid,$5::text)",
          [sourceSha,row.legacy_id,row.owner_user_id,target,row.payload_sha256],
        )
        imported++
      }
      const confirmed=await db.query<{
        name:string;spec:AgentSpecInput;owner_user_id:string;
        created_at:string|Date;updated_at:string|Date
      }>(
        "SELECT a.name,a.spec,a.owner_user_id,a.created_at,a.updated_at "+
        "FROM agentstudio.agent_specs AS a "+
        "JOIN agentstudio.legacy_agent_imports AS m "+
        "ON m.target_spec_id=a.id AND m.owner_user_id=a.owner_user_id "+
        "WHERE m.source_snapshot_sha256=$1::text AND "+
        "m.legacy_spec_id=$2::text",
        [sourceSha,row.legacy_id],
      )
      const match=confirmed.rows[0]
      if(!match)fail("stage_agent_reconciliation_missing")
      const date=(v:string|Date)=>new Date(v).toISOString()
      const persisted=contentHash({
        legacy_id:row.legacy_id,owner_user_id:match.owner_user_id,
        name:match.name,spec:match.spec,
        created_at:date(match.created_at),
        updated_at:date(match.updated_at),
      })
      if(persisted!==row.payload_sha256)
        fail("stage_agent_reconciliation_mismatch")
    }
    const mapped=await db.query<{n:string}>(
      "SELECT count(*)::text AS n FROM agentstudio.legacy_agent_imports "+
      "WHERE source_snapshot_sha256=$1::text",[sourceSha])
    if(Number(mapped.rows[0]?.n)!==rows.length)
      fail("stage_agent_batch_incomplete")
    await db.query("COMMIT")
    begun=false
    return {stage_only:true,imported,replayed,reconciled:rows.length,
      source_snapshot_sha256:sourceSha,production_cutover_allowed:false}
  }catch(error){
    if(begun)await db.query("ROLLBACK").catch(()=>undefined)
    if(error instanceof StageImportError)throw error
    throw new StageImportError("stage_import_sql_failed")
  }finally{db.release()}
}
