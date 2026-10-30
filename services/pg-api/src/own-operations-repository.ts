import {readOriginalInternalOverview} from './original-internal-overview-read.ts'
// Owner metadata projections. No task bodies, mutations or action authority.
import {HttpError,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActorClient,assertOwnedAdmissionContext} from "./repository.ts"
import {ownCountKeys,ownCategoryRanks,ownDatabaseCount,ownId,ownStamp,ownPublicStamp,ownUnavailable,
  parseOwnTodoQuery,parseOwnCursor,parseOwnRunMeta,parseOwnTodoItem,parseOwnOverview,parseOwnTodoPage,
  ownCursor,compareOwnPositions,type OwnTodoQuery,type OwnOverview,type OwnTodoPage,type OwnPosition,type OwnCounts} from "./own-operations-contract.ts"
import {parseOriginalAgentMeta,parseOriginalAgentPendingQuery,parseOriginalAgentPendingPage,parseOriginalAgentWorkspace,
 type OriginalAgentMeta,type OriginalAgentWorkspace,type OriginalAgentPendingPage} from './original-agent-inbox-contract.ts'

// Existing052 guard is audited in place, not trusted merely by its name. No
// direct account/password/session SELECT or additional grant is introduced.
export const ownOperationsGuardSql=`SELECT p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof AND NOT p.proretset
 AND p.prorettype='bigint'::regtype AND p.pronargs=0 AND l.lanname='plpgsql' AND p.provolatile='v'
 AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
 AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='89ce1baff61beb31f8fef5195a710893568fb40c30e1f4b4c0300944374be36d'
 AND (SELECT r.rolsuper AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles m WHERE NOT m.rolsuper AND pg_has_role(m.oid,r.oid,'MEMBER')) FROM pg_catalog.pg_roles r WHERE r.oid=p.proowner)
 AND (SELECT count(*)=2 AND bool_and(a.grantor=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable AND a.grantee IN(p.proowner,'agentstudio_api'::regrole)) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)
 AND has_function_privilege('agentstudio_api',p.oid,'EXECUTE') AS ok
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid=to_regprocedure('agentstudio.agent_memory_outcome_epoch()')`
export const ownOperationsTables=["runs","jobs","agent_specs","workflows","knowledge_bases","schedules","external_effects"]
export const ownOperationsSchemaSql=`SELECT c.relname AS name,c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AS ok
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname=ANY($1::text[])`
export const ownOperationsReadColumns:Readonly<Record<string,Readonly<Record<string,readonly [string,boolean]>>>>={
 runs:{id:['uuid',true],owner_user_id:['uuid',true],kind:['text',true],agent_spec_id:['uuid',false],workflow_id:['uuid',false],status:['text',true],checkpoint:['jsonb',true],created_at:['timestamp with time zone',true],updated_at:['timestamp with time zone',true],finished_at:['timestamp with time zone',false]},
 jobs:{run_id:['uuid',false],owner_user_id:['uuid',true],kind:['text',true],payload:['jsonb',true]},
 agent_specs:{id:['uuid',true],owner_user_id:['uuid',true],name:['text',true]},
 workflows:{id:['uuid',true],owner_user_id:['uuid',true],name:['text',true]},
 knowledge_bases:{id:['uuid',true],owner_user_id:['uuid',true]},
 schedules:{id:['uuid',true],owner_user_id:['uuid',true],kind:['text',true],agent_spec_id:['uuid',false],workflow_id:['uuid',false],name:['text',true],enabled:['boolean',true],next_at:['timestamp with time zone',false],deleted_at:['timestamp with time zone',false]},
 external_effects:{run_id:['uuid',true],owner_user_id:['uuid',true],step_key:['text',true],status:['text',true],updated_at:['timestamp with time zone',true]}
}
Object.freeze(ownOperationsReadColumns)
export const ownOperationsColumnsSql=`SELECT a.attname AS name,a.atttypid::regtype::text AS type,a.attnotnull AS required,
 a.attidentity='' AND a.attgenerated='' AS plain,has_column_privilege('agentstudio_api',a.attrelid,a.attnum,'SELECT') AS readable
 FROM pg_catalog.pg_attribute a WHERE a.attrelid=to_regclass('agentstudio.'||$1::text) AND a.attnum>0 AND NOT a.attisdropped AND a.attname=ANY($2::text[])`
// The boolean must come from the existing complete052 inspection in Native
// startup, not an environment or request flag. Missing optional052 stays off.
// No epoch function/business query executes during this READ ONLY inspection.
export async function inspectOwnOperationsSchema(pool:SqlPool,outcomeSchemaAvailable:boolean):Promise<boolean>{
 if(outcomeSchemaAvailable===false)return false
 if(outcomeSchemaAvailable!==true)return ownUnavailable()
 let db:SqlClient;try{db=await pool.connect()}catch{return ownUnavailable()}
 try{
  await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_api')
  const guard=(await db.query<{ok:boolean}>(ownOperationsGuardSql)).rows
  if(guard.length!==1||guard[0]?.ok!==true)return ownUnavailable()
  const tables=(await db.query<{name:string;ok:boolean}>(ownOperationsSchemaSql,[ownOperationsTables])).rows
  if(tables.length!==ownOperationsTables.length||new Set(tables.map(t=>t.name)).size!==tables.length||tables.some(t=>!ownOperationsTables.includes(t.name)||t.ok!==true))return ownUnavailable()
  for(const table of ownOperationsTables){
   const wanted=ownOperationsReadColumns[table]!,keys=Object.keys(wanted)
   const columns=(await db.query<{name:string;type:string;required:boolean;plain:boolean;readable:boolean}>(ownOperationsColumnsSql,[table,keys])).rows
   if(columns.length!==keys.length||new Set(columns.map(c=>c.name)).size!==keys.length||columns.some(c=>!Object.hasOwn(wanted,c.name)||c.type!==wanted[c.name]![0]||c.required!==wanted[c.name]![1]||c.plain!==true||c.readable!==true))return ownUnavailable()
  }
  return true
 }catch{return ownUnavailable()}
 finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
}
export const ownOperationsNowSql=`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of`
const micro=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
// Scalar mode is evaluated in SQL; the checkpoint never enters the driver result.
export const ownOperationsRunCte=`WITH owned_runs AS (
 SELECT r.id,coalesce(r.agent_spec_id,r.workflow_id) AS resource_id,
 CASE WHEN r.kind='agent' THEN CASE WHEN r.checkpoint->>'execution_mode'='agent_native_v2' THEN 'agent_autonomous' ELSE 'agent_single' END
 WHEN r.kind='workflow' AND r.checkpoint->>'execution_mode'='workflow_native_v2' THEN 'workflow_v2'
 WHEN r.kind='workflow' AND r.checkpoint->>'execution_mode'='start_end_only' AND EXISTS(SELECT 1 FROM agentstudio.jobs j WHERE j.run_id=r.id AND j.owner_user_id=r.owner_user_id AND j.kind='workflow_tick' AND j.payload->>'phase'='workflow_safe_v1') THEN 'workflow_safe' ELSE NULL END AS kind,
 coalesce(CASE WHEN btrim(a.name)<>'' THEN a.name END,CASE WHEN btrim(w.name)<>'' THEN w.name END,(CASE WHEN r.kind='agent' THEN 'Agent ' ELSE '工作流 ' END)||left(coalesce(r.agent_spec_id,r.workflow_id)::text,8)) AS resource_name_full,
 r.status,r.created_at,r.updated_at,r.finished_at
 FROM agentstudio.runs r LEFT JOIN agentstudio.agent_specs a ON a.id=r.agent_spec_id AND a.owner_user_id=r.owner_user_id
 LEFT JOIN agentstudio.workflows w ON w.id=r.workflow_id AND w.owner_user_id=r.owner_user_id WHERE r.owner_user_id=$1::uuid)`
export const ownOperationsCountsSql=ownOperationsRunCte+` SELECT
 (SELECT count(*)::text FROM agentstudio.agent_specs WHERE owner_user_id=$1::uuid) AS owned_agents,
 (SELECT count(*)::text FROM agentstudio.knowledge_bases WHERE owner_user_id=$1::uuid) AS knowledge_bases,
 count(*) FILTER(WHERE kind IS NOT NULL AND status='queued')::text AS queued,
 count(*) FILTER(WHERE kind IS NOT NULL AND status='running')::text AS running,
 count(*) FILTER(WHERE kind IS NOT NULL AND status='awaiting_approval')::text AS awaiting_approval,
 count(*) FILTER(WHERE kind IS NOT NULL AND status='awaiting_input')::text AS awaiting_input,
 count(*) FILTER(WHERE kind IS NOT NULL AND status='paused')::text AS paused,
 count(*) FILTER(WHERE kind IS NOT NULL AND status='failed' AND created_at >= $2::timestamptz-interval '7 days')::text AS failed_7d,
 (SELECT count(*)::text FROM agentstudio.schedules WHERE owner_user_id=$1::uuid AND deleted_at IS NULL AND enabled) AS schedules_active,
 (SELECT count(*)::text FROM agentstudio.schedules WHERE owner_user_id=$1::uuid AND deleted_at IS NULL AND enabled AND next_at<$2::timestamptz-interval '60 seconds') AS schedules_overdue,
 (SELECT count(*)::text FROM agentstudio.external_effects e JOIN owned_runs r ON r.id=e.run_id AND r.kind IS NOT NULL WHERE e.owner_user_id=$1::uuid AND (e.status='unknown' OR e.status='started' AND e.updated_at<$2::timestamptz-interval '10 minutes')) AS effects_need_review,
 count(*) FILTER(WHERE kind IS NULL)::text AS unsupported_runs FROM owned_runs`
export const ownOperationsRecentSql=ownOperationsRunCte+` SELECT id AS run_id,kind,resource_id,left(resource_name_full,120) AS resource_name,status,
 ${micro("created_at")} AS created_at_us,${micro("updated_at")} AS updated_at_us,${micro("finished_at")} AS finished_at_us
 FROM owned_runs WHERE kind IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 12`
// Original Home is Agent-only. Counts precede every bounded list/page SELECT.
const originalAgentCte=ownOperationsRunCte+`, agent_rows AS (SELECT * FROM owned_runs WHERE kind IN('agent_single','agent_autonomous'))`
const originalMetaColumns=`id AS run_id,kind,resource_id,left(resource_name_full,120) AS resource_name,status,${micro('created_at')} AS created_at_us,${micro('updated_at')} AS updated_at_us`
export const originalAgentWorkspaceCountSql=originalAgentCte+` SELECT count(*)::text AS total,count(*) FILTER(WHERE status IN('awaiting_input','awaiting_approval'))::text AS pending FROM agent_rows`
export const originalAgentRecentSql=originalAgentCte+` SELECT ${originalMetaColumns} FROM agent_rows ORDER BY created_at DESC,id DESC LIMIT 12`
export const originalAgentPendingSnippetSql=originalAgentCte+` SELECT ${originalMetaColumns} FROM agent_rows WHERE status IN('awaiting_input','awaiting_approval') ORDER BY updated_at DESC,id DESC LIMIT 20`
const originalPendingWhere=` FROM agent_rows WHERE status IN('awaiting_input','awaiting_approval') AND ($2::text='all' OR status=$2::text) AND resource_name_full ILIKE $3::text ESCAPE chr(92)`
export const originalAgentPendingCountSql=originalAgentCte+` SELECT count(*)::text AS total`+originalPendingWhere
export const originalAgentPendingPageSql=originalAgentCte+` SELECT ${originalMetaColumns}`+originalPendingWhere+` ORDER BY updated_at DESC,id DESC LIMIT $4::integer OFFSET $5::integer`
export const ownOperationsTodosSql=ownOperationsRunCte+`, attention AS (
 SELECT CASE status WHEN 'awaiting_approval' THEN 'approval' WHEN 'awaiting_input' THEN 'human_input' WHEN 'paused' THEN 'paused' ELSE 'failed' END AS category,
 kind,id,resource_id,resource_name_full,NULL::text AS step_key,status,updated_at AS observed_at,
 CASE status WHEN 'awaiting_approval' THEN 1 WHEN 'awaiting_input' THEN 2 WHEN 'paused' THEN 3 ELSE 6 END AS category_rank
 FROM owned_runs WHERE kind IS NOT NULL AND (status IN('awaiting_approval','awaiting_input','paused') OR status='failed' AND created_at >= $2::timestamptz-interval '7 days')
 UNION ALL SELECT 'effect_review',r.kind,e.run_id,r.resource_id,r.resource_name_full,e.step_key,e.status,e.updated_at,4
 FROM agentstudio.external_effects e JOIN owned_runs r ON r.id=e.run_id AND r.kind IS NOT NULL
 WHERE e.owner_user_id=$1::uuid AND (e.status='unknown' OR e.status='started' AND e.updated_at<$2::timestamptz-interval '10 minutes')
 UNION ALL SELECT 'schedule_overdue','schedule',s.id,coalesce(s.agent_spec_id,s.workflow_id),
 coalesce(CASE WHEN btrim(s.name)<>'' THEN s.name END,'计划 '||left(s.id::text,8)),NULL::text,'overdue',s.next_at,5 FROM agentstudio.schedules s
 WHERE s.owner_user_id=$1::uuid AND s.deleted_at IS NULL AND s.enabled AND s.next_at<$2::timestamptz-interval '60 seconds')
 SELECT category,kind,id,resource_id,left(resource_name_full,120) AS resource_name,step_key,status,
 ${micro("observed_at")} AS observed_at_us,category_rank FROM attention
 WHERE ($3::text='all' OR category=$3::text) AND ($4::text='all' OR kind=$4::text)
 AND resource_name_full ILIKE $5::text ESCAPE chr(92)
 AND ($6::timestamptz IS NULL OR (observed_at,id,category_rank,coalesce(step_key,'') COLLATE "C")<($6::timestamptz,$7::uuid,$8::integer,$9::text COLLATE "C"))
 ORDER BY observed_at DESC,id DESC,category_rank DESC,coalesce(step_key,'') COLLATE "C" DESC LIMIT $10::integer`
const exact=(raw:unknown,keys:readonly string[])=>{
 if(!raw||typeof raw!=="object"||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k)??{},"value")))return ownUnavailable()
 return raw as Record<string,unknown>
}
export const ownSearchPattern=(q:string)=>"%"+q.replace(/[\\%_]/g,c=>"\\"+c)+"%"
// SQL left(...,120) bounds decoded PostgreSQL characters. The wire bound is
// UTF16; preserve a whole final character when the current name has astrals.
function displayName(raw:unknown):string{
 if(typeof raw!=="string"||raw.length>240||raw.includes("\0")||Array.from(raw).some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff))return ownUnavailable()
 const value=raw.slice(0,120);return /[\ud800-\udbff]$/.test(value)?value.slice(0,-1):value
}
function originalMeta(raw:unknown):OriginalAgentMeta{
 const row=exact(raw,['run_id','kind','resource_id','resource_name','status','created_at_us','updated_at_us'])
 return parseOriginalAgentMeta({id:row.run_id,spec_id:row.resource_id,spec_name:displayName(row.resource_name),engine_kind:row.kind,status:row.status,
  created:ownPublicStamp(ownStamp(row.created_at_us,true)),updated:ownPublicStamp(ownStamp(row.updated_at_us,true))})
}
export class OwnOperationsRepository{
 readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 private async actor<T>(identity:Identity,body:(db:SqlClient,owner:string,now:string)=>Promise<T>):Promise<T>{
  if(identity?.issuer!=="urn:agentstudio:local:v1"||typeof identity.subject!=="string"||!identity.subject)throw new HttpError(403,"native_employee_identity_required")
  let db:SqlClient;try{db=await this.pool.connect()}catch{return ownUnavailable()};let begun=false
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');begun=true
   await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'")
   const result=await withActorClient(db,this.pool,identity,async(client,owner)=>{
    await assertOwnedAdmissionContext(client,owner)
    const guard=await client.query<{ok:boolean}>(ownOperationsGuardSql);if(guard.rows.length!==1||guard.rows[0]?.ok!==true)return ownUnavailable()
    const epochs=(await client.query<{epoch:unknown}>("SELECT agentstudio.agent_memory_outcome_epoch() AS epoch")).rows
    if(epochs.length!==1)return ownUnavailable()
    const epoch=epochs[0]?.epoch
    if(epoch===null)throw new HttpError(401,"session_required")
    if(!(typeof epoch==="string"&&/^[1-9][0-9]*$/.test(epoch)||typeof epoch==="number")||!Number.isSafeInteger(Number(epoch))||Number(epoch)<1||Number(epoch)>Number.MAX_SAFE_INTEGER-2)return ownUnavailable()
    const tables=(await client.query<{name:string;ok:boolean}>(ownOperationsSchemaSql,[ownOperationsTables])).rows
    if(tables.length!==ownOperationsTables.length||new Set(tables.map(t=>t.name)).size!==tables.length||tables.some(t=>!ownOperationsTables.includes(t.name)||t.ok!==true))return ownUnavailable()
    const nowResult=await client.query<{as_of:string}>(ownOperationsNowSql);if(nowResult.rows.length!==1)return ownUnavailable()
    return body(client,owner,ownStamp(nowResult.rows[0]?.as_of,true))
   })
   await db.query('COMMIT');begun=false;return result
  }catch(error){
   if(begun)await db.query('ROLLBACK').catch(()=>{})
   if(error instanceof HttpError&&error.status===409&&error.code==='original_internal_overview_employee_changed')throw error
    if(error instanceof HttpError&&error.status===401)throw new HttpError(401,"session_required")
   if(error instanceof HttpError&&error.status===400&&["invalid_own_todo_query","invalid_own_todo_cursor"].includes(error.code))throw error
   if(error instanceof HttpError&&error.code==="employee_not_provisioned"||error&&typeof error==="object"&&"code"in error&&error.code==="P0001"&&"message"in error&&error.message==="agent_memory_native_employee_required")throw new HttpError(401,"session_required")
   return ownUnavailable()
  }finally{db.release()}
 }
 async originalInternalOverview(identity:Identity,expectedEmployee:string){
   return this.actor(identity,async(db,owner,now)=>{if(owner!==expectedEmployee)throw new HttpError(409,'original_internal_overview_employee_changed');return readOriginalInternalOverview(db,owner,now)})
  }
  async originalAgentWorkspace(identity:Identity):Promise<OriginalAgentWorkspace>{
  return this.actor(identity,async(db,owner,now)=>{
   const count=(await db.query(originalAgentWorkspaceCountSql,[owner])).rows
   if(count.length!==1)return ownUnavailable()
   const values=exact(count[0],['total','pending']),total=ownDatabaseCount(values.total),pending=ownDatabaseCount(values.pending)
   const recent=(await db.query(originalAgentRecentSql,[owner])).rows.map(originalMeta)
   const snippet=(await db.query(originalAgentPendingSnippetSql,[owner])).rows.map(originalMeta)
   return parseOriginalAgentWorkspace({protocol:'native_original_agent_workspace_v1',scope:'current_user',employee_id:owner,as_of:ownPublicStamp(now),
    agent_run_total:total,items:recent,pending_count:pending,pending_items:snippet})
  })
 }
 async originalAgentPending(identity:Identity,raw:unknown={}):Promise<OriginalAgentPendingPage>{
  const q=parseOriginalAgentPendingQuery(raw)
  return this.actor(identity,async(db,owner,now)=>{
   const params=[owner,q.status,ownSearchPattern(q.q)],counts=(await db.query(originalAgentPendingCountSql,params)).rows
   if(counts.length!==1)return ownUnavailable()
   const total=ownDatabaseCount(exact(counts[0],['total']).total)
   const items=(await db.query(originalAgentPendingPageSql,[...params,q.perPage,(q.page-1)*q.perPage])).rows.map(originalMeta)
   return parseOriginalAgentPendingPage({protocol:'native_original_agent_pending_v1',scope:'current_user',employee_id:owner,as_of:ownPublicStamp(now),
    items,totalItems:total,totalPages:Math.max(1,Math.ceil(total/q.perPage)),...q},q)
  })
 }
 async overview(identity:Identity):Promise<OwnOverview>{
  return this.actor(identity,async(db,owner,now)=>{
   const rows=(await db.query(ownOperationsCountsSql,[owner,now])).rows;if(rows.length!==1)return ownUnavailable()
   const values=exact(rows[0],ownCountKeys),counts=Object.fromEntries(ownCountKeys.map(k=>[k,ownDatabaseCount(values[k])])) as OwnCounts
   const raw=(await db.query(ownOperationsRecentSql,[owner])).rows;if(raw.length>12)return ownUnavailable()
   const recent=raw.map(row=>{const r=exact(row,["run_id","kind","resource_id","resource_name","status","created_at_us","updated_at_us","finished_at_us"])
    return parseOwnRunMeta({run_id:r.run_id,kind:r.kind,resource_id:r.resource_id,resource_name:displayName(r.resource_name),status:r.status,created_at:ownPublicStamp(ownStamp(r.created_at_us,true)),updated_at:ownPublicStamp(ownStamp(r.updated_at_us,true)),finished_at:r.finished_at_us===null?null:ownPublicStamp(ownStamp(r.finished_at_us,true))})})
   return parseOwnOverview({protocol:"native_own_overview_v1",scope:"current_user",as_of:ownPublicStamp(now),window_days:7,counts,recent,delegated_approvals:"unavailable"})
  })
 }
 async todos(identity:Identity,raw:unknown={}):Promise<OwnTodoPage>{
  const q=parseOwnTodoQuery(raw),before=q.before?parseOwnCursor(q.before,q):null
  return this.actor(identity,async(db,owner,now)=>{
   if(before&&before.as_of>now)throw new HttpError(400,"invalid_own_todo_cursor")
   const as_of=before?.as_of??now
   const rows=(await db.query(ownOperationsTodosSql,[owner,as_of,q.category,q.kind,ownSearchPattern(q.q),before?.observed_at??null,before?.id??null,before?.category_rank??null,before?.step_key??"",q.limit+1])).rows
   if(rows.length>q.limit+1)return ownUnavailable()
   const candidates=rows.map(row=>{const v=exact(row,["category","kind","id","resource_id","resource_name","step_key","status","observed_at_us","category_rank"])
    const item=parseOwnTodoItem({category:v.category,kind:v.kind,id:v.id,resource_id:v.resource_id,resource_name:displayName(v.resource_name),step_key:v.step_key,status:v.status,observed_at:ownPublicStamp(ownStamp(v.observed_at_us,true))})
    if(v.category_rank!==ownCategoryRanks[item.category])return ownUnavailable()
    const position:OwnPosition={observed_at:ownStamp(v.observed_at_us,true),id:ownId(item.id),category_rank:v.category_rank as number,step_key:item.step_key}
    return {item,position}
   })
   for(let i=0;i<candidates.length;i++){const previous=i?candidates[i-1]!.position:before;if(previous&&compareOwnPositions(candidates[i]!.position,previous)>=0)return ownUnavailable()}
   const selected=candidates.slice(0,q.limit),has_more=candidates.length>q.limit
   return parseOwnTodoPage({protocol:"native_own_todos_v1",scope:"current_user",as_of:ownPublicStamp(as_of),category:q.category,kind:q.kind,q:q.q,limit:q.limit,items:selected.map(c=>c.item),has_more,next_cursor:has_more?ownCursor(q,as_of,selected.at(-1)!.position):null},q)
  })
 }
}
