// Bounded owner metadata only. Never returns prompts, args, response bodies,
// URLs, headers, credentials or another employee's rows. Counts are samples.
import {HttpError,isUuid,type Identity,type SqlPool} from './contracts.ts'
import {withActor} from './repository.ts'
import {requireToolHubNativeIdentity,requireToolHubOwnerContext} from './tool-trial-repository.ts'
import {trialObject} from './tool-trial-contract.ts'
import type {ToolHubInvocation,ToolHubInvocations,ToolHubStats,ToolHubHarness} from '../../../shared/tool-hub-public-types.ts'
import {maxToolHubRecordedDurationMs} from '../../../shared/tool-hub-public-types.ts'
const statuses=['started','succeeded','failed','unknown'] as const,kinds=['builtin','http','mcp','unavailable'] as const
export type InvocationQuery={kind:'any'|typeof kinds[number];status:'any'|typeof statuses[number];tool:string;after:string;limit:number}
function invalid():never{throw new HttpError(400,'invalid_tool_invocation_query')}
function unavailable():never{throw new HttpError(503,'tool_invocation_projection_unavailable')}
function label(value:unknown,max:number):value is string{return typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const step=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_:-]{1,160}$/.test(v)
const builtin=(v:unknown):v is string=>typeof v==='string'&&['calculate','summarize','knowledge_search','web_fetch','web_search'].includes(v)
export function parseInvocationQuery(raw:unknown):InvocationQuery{
 const item=trialObject(raw,[],['kind','status','tool','after','limit']),kind=item.kind??'any',status=item.status??'any',tool=item.tool??'',after=item.after??'',limit=item.limit??30
 if(typeof kind!=='string'||!['any',...kinds].includes(kind)||typeof status!=='string'||!['any',...statuses].includes(status)||!label(tool,120)||typeof after!=='string'||after.length>500||!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>50)invalid()
 if(after)parseInvocationCursor(after)
 return {kind:kind as InvocationQuery['kind'],status:status as InvocationQuery['status'],tool,after,limit:limit as number}
}
export function parseInvocationCursor(value:string):{run_id:string;step_key:string}{
 if(!/^[A-Za-z0-9_-]{1,500}$/.test(value))invalid()
 let raw:unknown;try{raw=JSON.parse(Buffer.from(value,'base64url').toString('utf8'))}catch{invalid()}
 const data=trialObject(raw,['run_id','step_key']);if(!isUuid(data.run_id)||!step(data.step_key)||Buffer.from(JSON.stringify(data)).toString('base64url')!==value)invalid()
 return {run_id:data.run_id,step_key:data.step_key}
}
const cursor=(row:{run_id:string;step_key:string})=>Buffer.from(JSON.stringify({run_id:row.run_id,step_key:row.step_key})).toString('base64url')
const json=(field:string,max:number)=>`CASE WHEN octet_length(${field})<=${max} AND pg_input_is_valid(${field},'jsonb') THEN ${field}::jsonb ELSE '{}'::jsonb END`
// These expressions are fixed source literals. No caller-provided SQL/path is used.
const plannerJson=json('m.result_reference',20000),parentJson=json('p.result_reference',524288)
export const invocationReadSql=`WITH recent AS(
 SELECT e.run_id,e.step_key,e.status,e.arguments_sha256,e.created_at,e.updated_at,e.tool_name,r.kind AS run_kind,t.request_id,
  s.metadata->>'parent_step_key' AS parent_key,s.metadata->>'node_id' AS node_id,r.checkpoint,
  (${plannerJson})->>'output' AS planner_output,(${parentJson})#>'{agent_snapshot,spec}' AS archived_spec
 FROM agentstudio.external_effects e
 JOIN agentstudio.runs r ON r.id=e.run_id AND r.owner_user_id=e.owner_user_id
 LEFT JOIN agentstudio.toolhub_trials t ON t.run_id=e.run_id AND t.owner_user_id=e.owner_user_id
 LEFT JOIN agentstudio.run_steps s ON s.run_id=e.run_id AND s.owner_user_id=e.owner_user_id AND s.step_key=e.step_key
 LEFT JOIN agentstudio.external_effects m ON m.run_id=e.run_id AND m.owner_user_id=e.owner_user_id AND e.step_key~'_a[0-9]{2}t$' AND m.step_key=left(e.step_key,-1)||'m'
 LEFT JOIN agentstudio.external_effects p ON p.run_id=e.run_id AND p.owner_user_id=e.owner_user_id AND p.step_key=s.metadata->>'parent_step_key' AND p.tool_name='workflow:agent'
 -- One invocation is the canonical Worker effect. The private Broker writes
 -- a second reservation receipt (workflow.tool_bound_dispatch); counting it
 -- would double every call and invent a missing tool identity for that row.
 WHERE e.owner_user_id=$1::uuid AND e.tool_name IN('workflow:tool','calculate','summarize','knowledge_search','web_fetch','web_search')
 AND ($2::uuid IS NULL OR (e.created_at,e.run_id,e.step_key)<(SELECT a.created_at,a.run_id,a.step_key FROM agentstudio.external_effects a WHERE a.owner_user_id=$1::uuid AND a.run_id=$2::uuid AND a.step_key=$3::text))
 ORDER BY e.created_at DESC,e.run_id DESC,e.step_key DESC LIMIT 501
), selected AS(
 SELECT a.*,CASE WHEN octet_length(planner_output)<=20000 AND pg_input_is_valid(planner_output,'jsonb') THEN planner_output::jsonb ELSE '{}'::jsonb END AS action,
 CASE WHEN checkpoint#>>'{agent_state,parent_step_key}'=parent_key THEN checkpoint#>'{agent_state,spec}' ELSE archived_spec END AS agent_spec,
 (SELECT n->'data' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(checkpoint#>'{graph,nodes}')='array' THEN checkpoint#>'{graph,nodes}' ELSE '[]'::jsonb END)n WHERE n->>'id'=node_id LIMIT 1) AS node
 FROM recent a
), resolved_identity AS(
 SELECT b.*,CASE WHEN jsonb_typeof(action->'tool')='string' AND action->>'action'='tool' THEN action->>'tool' ELSE NULL END AS alias,
 (SELECT x->'binding' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(agent_spec->'mcp_tools')='array' THEN agent_spec->'mcp_tools' ELSE '[]'::jsonb END)x WHERE x->>'name'=action->>'tool' LIMIT 1) AS agent_mcp,
 (SELECT jsonb_build_object('connection_id',x->'connection_id','connection_revision',x->'connection_revision') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(agent_spec->'http_tools')='array' THEN agent_spec->'http_tools' ELSE '[]'::jsonb END)x WHERE x->>'name'=action->>'tool' LIMIT 1) AS agent_http
 FROM selected b
)
SELECT run_id::text,step_key,status,arguments_sha256,run_kind,request_id::text,
 to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
 CASE WHEN status IN('succeeded','failed') THEN greatest(0,round(extract(epoch FROM(updated_at-created_at))*1000))::text ELSE NULL END AS recorded_duration_ms,
 jsonb_build_object('builtin',CASE WHEN parent_key IS NOT NULL THEN alias ELSE coalesce(node->>'tool',CASE WHEN tool_name IN('calculate','summarize','knowledge_search','web_fetch','web_search') THEN tool_name END) END,
 'http',CASE WHEN parent_key IS NOT NULL THEN agent_http ELSE node->'tool_binding' END,
 'mcp',CASE WHEN parent_key IS NOT NULL THEN agent_mcp ELSE node->'mcp_binding' END) AS identity
 FROM resolved_identity ORDER BY resolved_identity.created_at DESC,resolved_identity.run_id DESC,resolved_identity.step_key DESC`
export function projectInvocationRow(raw:unknown):ToolHubInvocation{
 const value=trialObject(raw,['run_id','step_key','status','arguments_sha256','run_kind','request_id','created_at','recorded_duration_ms','identity'])
 if(!isUuid(value.run_id)||!step(value.step_key)||typeof value.status!=='string'||!statuses.includes(value.status as typeof statuses[number])||!hash(value.arguments_sha256)||!['agent','workflow'].includes(typeof value.run_kind==='string'?value.run_kind:'')||value.request_id!==null&&!isUuid(value.request_id)||typeof value.created_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.created_at)||!Number.isFinite(Date.parse(value.created_at)))unavailable()
 const identity=trialObject(value.identity,['builtin','http','mcp']);let kind:typeof kinds[number]='unavailable',tool='未记录工具身份',connection_id:string|null=null
 try{if(identity.mcp!==null){const ref=trialObject(identity.mcp,['connection_id','connection_revision','tool_name','catalog_sha256']);if(!isUuid(ref.connection_id)||!Number.isSafeInteger(ref.connection_revision)||Number(ref.connection_revision)<1||!label(ref.tool_name,120)||!ref.tool_name||!hash(ref.catalog_sha256))unavailable();kind='mcp';tool=ref.tool_name;connection_id=ref.connection_id}
 else if(identity.http!==null){const ref=trialObject(identity.http,['connection_id','connection_revision']);if(!isUuid(ref.connection_id)||!Number.isSafeInteger(ref.connection_revision)||Number(ref.connection_revision)<1)unavailable();kind='http';tool='HTTP '+ref.connection_id;connection_id=ref.connection_id}
 else if(builtin(identity.builtin)){kind='builtin';tool=identity.builtin}}
 catch{/* Legacy rows missing a complete source pin stay explicitly unavailable. */}
 const duration=value.recorded_duration_ms;let recorded_duration_ms:number|null=null
 if(typeof duration==='string'&&/^[0-9]{1,16}$/.test(duration)&&Number.isSafeInteger(Number(duration))&&Number(duration)<=maxToolHubRecordedDurationMs)recorded_duration_ms=Number(duration)
 else if(duration!==null)unavailable()
 return {run_id:value.run_id,step_key:value.step_key,status:value.status as typeof statuses[number],arguments_sha256:value.arguments_sha256,origin:value.request_id?'trial':value.run_kind as 'agent'|'workflow',trial_request_id:value.request_id as string|null,kind,tool,connection_id,created_at:value.created_at,recorded_duration_ms,error:value.status==='unknown'?'outcome_unknown':value.status==='failed'?'tool_failed':null,retry_count:null as null,may_replay:false as const}
}
type Invocation=ReturnType<typeof projectInvocationRow>
export function invocationSummary(items:readonly Invocation[]){
 const tools=new Map<string,{kind:Invocation['kind'];tool:string;calls:number;started:number;succeeded:number;failed:number;unknown:number;duration_total:number;duration_samples:number}>()
 for(const item of items){const key=item.kind+'\0'+item.tool,row=tools.get(key)??{kind:item.kind,tool:item.tool,calls:0,started:0,succeeded:0,failed:0,unknown:0,duration_total:0,duration_samples:0};row.calls++;row[item.status]++;if(item.recorded_duration_ms!==null){row.duration_total+=item.recorded_duration_ms;row.duration_samples++}tools.set(key,row)}
 return [...tools.values()].map(({duration_total,duration_samples,...row})=>({...row,average_recorded_duration_ms:duration_samples?Math.round(duration_total/duration_samples):null,retry_count:null})).sort((a,b)=>b.calls-a.calls||a.tool.localeCompare(b.tool)).slice(0,50)
}
export class OwnerToolInvocationRepository{
 readonly pool:SqlPool
 constructor(pool:SqlPool){this.pool=pool}
 private async read(identity:Identity,after=''){
  requireToolHubNativeIdentity(identity);const position=after?parseInvocationCursor(after):null
  return withActor(this.pool,identity,async(db,owner)=>{await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'");await requireToolHubOwnerContext(db,owner)
   if(position&&(await db.query('SELECT run_id FROM agentstudio.external_effects WHERE owner_user_id=$1::uuid AND run_id=$2::uuid AND step_key=$3::text',[owner,position.run_id,position.step_key])).rows.length!==1)invalid()
   const rows=(await db.query(invocationReadSql,[owner,position?.run_id??null,position?.step_key??null])).rows
   return {items:rows.slice(0,500).map(projectInvocationRow),sampled:rows.length>500}
  })
 }
 async list(identity:Identity,raw:unknown):Promise<ToolHubInvocations>{const query=parseInvocationQuery(raw),sample=await this.read(identity,query.after),filtered=sample.items.filter(item=>(query.kind==='any'||item.kind===query.kind)&&(query.status==='any'||item.status===query.status)&&(!query.tool||item.tool===query.tool)),items=filtered.slice(0,query.limit),last=filtered.length>query.limit?items.at(-1):sample.sampled?sample.items.at(-1):null;return {items,next_after:last?cursor(last):null,scope:'owner_only' as const,scan_limit:500,scanned:sample.items.length,sampled:sample.sampled,worker_liveness:'not_inferred' as const,automatic_replay_allowed:false}}
 async stats(identity:Identity):Promise<ToolHubStats>{const sample=await this.read(identity);return {calls:sample.items.length,started:sample.items.filter(i=>i.status==='started').length,succeeded:sample.items.filter(i=>i.status==='succeeded').length,failed:sample.items.filter(i=>i.status==='failed').length,unknown:sample.items.filter(i=>i.status==='unknown').length,tools:invocationSummary(sample.items),retry_count:null,scope:'owner_only' as const,sample_limit:500,sampled:sample.sampled,metrics:'recorded_external_effects_only',worker_liveness:'not_inferred' as const}}
 async harness(identity:Identity):Promise<ToolHubHarness>{
  requireToolHubNativeIdentity(identity)
  return withActor(this.pool,identity,async(db,owner)=>{await db.query("SET LOCAL statement_timeout='8000ms'; SET LOCAL lock_timeout='3000ms'");await requireToolHubOwnerContext(db,owner)
   const rows=(await db.query<{kind:unknown;status:unknown;step_count:unknown;duration_ms:unknown;stuck:unknown}>("SELECT kind,status,step_count,CASE WHEN finished_at IS NOT NULL THEN greatest(0,round(extract(epoch FROM(finished_at-created_at))*1000))::text ELSE NULL END AS duration_ms,last_error_code='workflow_stuck_loop_detected' AS stuck FROM (SELECT * FROM(SELECT kind,status,step_count,created_at,finished_at,last_error_code FROM agentstudio.runs WHERE owner_user_id=$1::uuid AND kind='agent' ORDER BY created_at DESC,id DESC LIMIT 100)a UNION ALL SELECT * FROM(SELECT kind,status,step_count,created_at,finished_at,last_error_code FROM agentstudio.runs WHERE owner_user_id=$1::uuid AND kind='workflow' ORDER BY created_at DESC,id DESC LIMIT 100)w)sample",[owner])).rows
   let steps=0,completed=0,duration=0,stuck=0;const totals={runs:rows.length,succeeded:0,failed:0,cancelled:0}
   for(const row of rows){if(typeof row.kind!=='string'||!['agent','workflow'].includes(row.kind)||typeof row.status!=='string'||!['queued','running','awaiting_approval','awaiting_input','paused','succeeded','failed','cancelled'].includes(row.status)||!Number.isSafeInteger(row.step_count)||Number(row.step_count)<0||typeof row.stuck!=='boolean')unavailable();steps+=Number(row.step_count);if(row.status==='succeeded'||row.status==='failed'||row.status==='cancelled')totals[row.status]++;if(row.stuck)stuck++;if(row.duration_ms!==null){if(typeof row.duration_ms!=='string'||!/^\d{1,16}$/.test(row.duration_ms)||!Number.isSafeInteger(Number(row.duration_ms))||Number(row.duration_ms)>maxToolHubRecordedDurationMs)unavailable();completed++;duration+=Number(row.duration_ms)}}
   return {totals:{...totals,average_recorded_steps:rows.length?steps/rows.length:null,average_completed_duration_ms:completed?Math.round(duration/completed):null,stuck_loop_failures:stuck,estimated_tokens:null,compressions:null,truncations:null,retries:null},scope:'owner_only' as const,run_sample_per_kind:100,unrecorded_metrics:'unavailable' as const,worker_liveness:'not_inferred' as const}
  })
 }
}
