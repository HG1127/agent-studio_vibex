// V8.4 W2: legacy PocketBase Knowledge Base metadata -> isolated PG stage.
// This slice imports EMPTY private KB bases only. Documents/chunks/vectors/ACL
// must first get their own lossless importer and are therefore fail-closed.
import {contentHash,isUuid,type SqlPool} from "./stage-knowledge-base-primitives.ts"

const hash64=/^[0-9a-f]{64}$/
const id64=/^[A-Za-z0-9_-]{1,64}$/
export class StageKnowledgeError extends Error {
  constructor(code:string){super(code)}
}
function fail(code:string):never{throw new StageKnowledgeError(code)}
export type LegacyKbRow={
  legacy_id:string;owner_user_id:string;name:string;description:string
  created_at:string;updated_at:string;payload_sha256:string
}
function timeFromMs(raw:unknown):string{
  if(typeof raw!=="number"||!Number.isSafeInteger(raw)||
     raw<946684800000||raw>4102444800000)
    fail("legacy_kb_invalid_timestamp")
  return new Date(raw).toISOString()
}
export function normalizeLegacyKb(raw:Record<string,unknown>,
  owners:ReadonlyMap<string,string>,hasRelatedData=false):LegacyKbRow{
  const id=raw.id,user=raw.rh_user_id
  if(typeof id!=="string"||!id64.test(id) ||
     typeof user!=="string"||!id64.test(user)||
     !owners.has(user)||!isUuid(owners.get(user)))
    fail("legacy_kb_identity_unmapped")
  if(hasRelatedData)fail("legacy_kb_documents_vectors_or_acl_not_migrated")
  const name=raw.name
  const desc=raw.description
  if(typeof name!=="string"||!name.trim()||name!==name.trim()||
     name.length>120||name.includes("\0")||
     typeof desc!=="string"||desc.length>1000||desc.includes("\0"))
    fail("legacy_kb_name_description_invalid")
  const created_at=timeFromMs(raw.created_ms)
  const updated_at=timeFromMs(raw.updated_ms)
  if(Date.parse(updated_at)<Date.parse(created_at))
    fail("legacy_kb_updated_before_created")
  const owner_user_id=owners.get(user)!
  const item={
    legacy_id:id,owner_user_id,name,description:desc,created_at,updated_at,
  }
  return {...item,payload_sha256:contentHash(item)}
}
export async function importLegacyKbsToStage(pool:SqlPool,sourceSha:string,
  rows:readonly LegacyKbRow[]):Promise<{
    stage_only:true;production_cutover_allowed:false
    imported:number;replayed:number;reconciled:number
  }>{
  if(!hash64.test(sourceSha)||!Array.isArray(rows)||
     rows.length<1||rows.length>3000)
    fail("invalid_stage_kb_batch")
  const seen=new Set<string>()
  for(const row of rows){
    if(!id64.test(row.legacy_id)||!isUuid(row.owner_user_id)||
       !hash64.test(row.payload_sha256)||
       seen.has(row.legacy_id))
      fail("stage_kb_invalid_or_duplicate")
    const expected=normalizeLegacyKb({
      id:row.legacy_id,rh_user_id:row.owner_user_id,
      name:row.name,description:row.description,
      created_ms:Date.parse(row.created_at),
      updated_ms:Date.parse(row.updated_at),
    },new Map([[row.owner_user_id,row.owner_user_id]]))
    if(row.created_at!==expected.created_at||
       row.updated_at!==expected.updated_at ||
       expected.payload_sha256!==row.payload_sha256)
      fail("stage_kb_payload_tampered")
    seen.add(row.legacy_id)
  }
  const db=await pool.connect()
  let begun=false
  try{
    await db.query("BEGIN");begun=true
    const result=await db.query<{
      database:string;login:string;admin:boolean;version:number
    }>("SELECT current_database() AS database,session_user AS login,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin,"+
      "current_setting('server_version_num')::integer AS version")
    const target=result.rows[0]
    if(target?.database!=="agentstudio_stage"||
       target?.login!=="agentstudio_admin"||target.admin!==true||
       !(Number(target.version)>=170000 && Number(target.version)<180000))
      fail("refuse_nonisolated_pg17_target")
    const ready=await db.query<{ok:boolean}>(
      "SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v8_007') AS ok")
    if(ready.rows[0]?.ok!==true)
      fail("missing_kb_migration_crosswalk")
    const active=await db.query<{count:string}>(
      "SELECT COUNT(*)::text AS count FROM agentstudio.jobs "+
      "WHERE status IN ('queued','leased')")
    if(Number(active.rows[0]?.count)!==0)
      fail("active_stage_jobs_must_stop")
    const untracked=await db.query<{count:string}>(
      "SELECT COUNT(*)::text AS count "+
      "FROM agentstudio.knowledge_bases b "+
      "LEFT JOIN agentstudio.legacy_knowledge_base_imports m "+
      "ON m.target_base_id=b.id WHERE m.target_base_id IS NULL")
    if(Number(untracked.rows[0]?.count)!==0)
      fail("stage_has_untracked_knowledge_bases")
    const foreign=await db.query<{count:string}>(
      "SELECT COUNT(*)::text AS count "+
      "FROM agentstudio.legacy_knowledge_base_imports "+
      "WHERE source_snapshot_sha256<>$1::text",[sourceSha])
    if(Number(foreign.rows[0]?.count)!==0)
      fail("stage_kb_source_snapshot_conflict")
    const owners=[...new Set(rows.map(r=>r.owner_user_id))]
    const users=await db.query<{id:string}>(
      "SELECT id FROM agentstudio.users WHERE id=ANY($1::uuid[])",[owners])
    if(users.rows.length!==owners.length)
      fail("stage_kb_user_not_preprovisioned")
    let imported=0,replayed=0
    for(const row of rows){
      const old=await db.query<{
        target_base_id:string;owner_user_id:string;payload_sha256:string
      }>("SELECT target_base_id,owner_user_id,payload_sha256 "+
        "FROM agentstudio.legacy_knowledge_base_imports "+
        "WHERE legacy_base_id=$1::text FOR UPDATE",[row.legacy_id])
      const existing=old.rows[0]
      if(existing){
        if(existing.owner_user_id!==row.owner_user_id||
           existing.payload_sha256!==row.payload_sha256)
          fail("stage_kb_existing_content_conflict")
        replayed++
      }else{
        const result=await db.query<{id:string}>(
          "INSERT INTO agentstudio.knowledge_bases "+
          "(owner_user_id,name,description,visibility,created_at,updated_at) "+
          "VALUES($1::uuid,$2::text,$3::text,'private',"+
          "$4::timestamptz,$5::timestamptz) RETURNING id",
          [row.owner_user_id,row.name,row.description,
            row.created_at,row.updated_at])
        const targetId=result.rows[0]?.id
        if(!isUuid(targetId))fail("stage_kb_insert_missing_id")
        await db.query("INSERT INTO agentstudio.legacy_knowledge_base_imports "+
          "(source_snapshot_sha256,legacy_base_id,owner_user_id,"+
          "target_base_id,payload_sha256) "+
          "VALUES($1::text,$2::text,$3::uuid,$4::uuid,$5::text)",
          [sourceSha,row.legacy_id,row.owner_user_id,targetId,
            row.payload_sha256])
        imported++
      }
      const read=await db.query<{
        owner_user_id:string;name:string;description:string;
        created_at:Date|string;updated_at:Date|string;
        visibility:string;team_id:string|null
      }>(
        "SELECT b.owner_user_id,b.name,b.description,b.created_at,"+
        "b.updated_at,b.visibility,b.team_id "+
        "FROM agentstudio.legacy_knowledge_base_imports AS m "+
        "JOIN agentstudio.knowledge_bases AS b "+
        "ON b.id=m.target_base_id AND b.owner_user_id=m.owner_user_id "+
        "WHERE m.source_snapshot_sha256=$1::text "+
        "AND m.legacy_base_id=$2::text",
        [sourceSha,row.legacy_id])
      const record=read.rows[0]
      if(!record || record.visibility!=="private"||
         record.team_id!==null ||
         contentHash({
           legacy_id:row.legacy_id,owner_user_id:record.owner_user_id,
           name:record.name,description:record.description,
           created_at:new Date(record.created_at).toISOString(),
           updated_at:new Date(record.updated_at).toISOString(),
         })!==row.payload_sha256)
        fail("stage_kb_reconciliation_failure")
    }
    const total=await db.query<{count:string}>(
      "SELECT COUNT(*)::text AS count "+
      "FROM agentstudio.legacy_knowledge_base_imports "+
      "WHERE source_snapshot_sha256=$1::text",[sourceSha])
    if(Number(total.rows[0]?.count)!==rows.length)
      fail("stage_kb_source_batch_incomplete")
    await db.query("COMMIT");begun=false
    return {stage_only:true,production_cutover_allowed:false,
      imported,replayed,reconciled:rows.length}
  }catch(error){
    if(begun)await db.query("ROLLBACK").catch(()=>undefined)
    if(error instanceof StageKnowledgeError)throw error
    throw new StageKnowledgeError("stage_kb_sql_failed")
  }finally{db.release()}
}
