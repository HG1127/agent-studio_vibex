// Uses ONLY the original Native client's fixed same-origin get/post transport.
import {trialObject,safeToolTrialRequest,type ToolTrialRequest} from '../../services/pg-api/src/tool-trial-contract.ts'
import {safeRegistryTranslationRequest,type RegistryTranslationRequest} from '../../services/pg-api/src/registry-translation-trial.ts'
import {canonicalMcpJson} from '../../services/pg-api/src/mcp-catalog.ts'
import {maxToolHubRecordedDurationMs} from '../../shared/tool-hub-public-types.ts'
import type {ToolTrialReceipt,RegistryEntry,RegistryPage,ToolHubStats,ToolHubHarness,ToolHubInvocations} from '../../shared/tool-hub-public-types.ts'
export type {ToolTrialReceipt,RegistryEntry,RegistryPage,ToolHubStats,ToolHubHarness,ToolHubInvocations} from '../../shared/tool-hub-public-types.ts'
export type ToolHubIntent=ToolTrialRequest|RegistryTranslationRequest
export const toolHubModelKey=(binding:{connection_id:string;connection_revision:number;model_id:string})=>JSON.stringify([binding.connection_id,binding.connection_revision,binding.model_id])
export type ToolHubRoute='/api/v2/tool-hub'|`/api/v2/tool-hub/${string}`
export type ToolHubRegistry=RegistryPage&{chinese:{server_name:string;zh_title:string;zh_desc:string;source_sha256:string}[]}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/,name=/^[a-z0-9][a-z0-9.-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,version=/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/
function invalid():never{throw Error('unconfirmed_tool_hub_response')}
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)
const count=(v:unknown,max=100000000)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max
const object=trialObject
export function freezeToolHubIntent(raw:unknown):Readonly<ToolHubIntent>{
 const purpose=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'purpose'):undefined
 const value=purpose&&'value'in purpose&&purpose.value==='tool'?safeToolTrialRequest(raw):safeRegistryTranslationRequest(raw)
 const deepFreeze=(item:unknown):unknown=>{if(item&&typeof item==='object'){for(const child of Object.values(item))deepFreeze(child);Object.freeze(item)}return item}
 return deepFreeze(JSON.parse(canonicalMcpJson(value))) as ToolHubIntent
}
export async function toolHubIntentHash(raw:unknown):Promise<string>{const data=new TextEncoder().encode(canonicalMcpJson(freezeToolHubIntent(raw))),digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}
export function toolHubReceipt(raw:unknown,expected?:{id?:string;hash?:string;graph?:string}):ToolTrialReceipt{
 const r=object(raw,['request_id','purpose','source_kind','target','request_sha256','arguments_sha256','graph_sha256','workflow_id','run_id','fee_confirmed','created_at','execution_mode','worker_started_by_api'])
 if(!uuid.test(String(r.request_id))||!uuid.test(String(r.workflow_id))||!uuid.test(String(r.run_id))||typeof r.request_id!=='string'||typeof r.workflow_id!=='string'||typeof r.run_id!=='string'||typeof r.request_sha256!=='string'||!hash.test(r.request_sha256)||typeof r.arguments_sha256!=='string'||!hash.test(r.arguments_sha256)||typeof r.graph_sha256!=='string'||!hash.test(r.graph_sha256)||typeof r.fee_confirmed!=='boolean'||typeof r.created_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.created_at)||!Number.isFinite(Date.parse(r.created_at))||r.execution_mode!=='workflow_native_v2'||r.worker_started_by_api!==false||expected?.id&&r.request_id!==expected.id||expected?.hash&&r.request_sha256!==expected.hash||expected?.graph&&r.graph_sha256!==expected.graph)invalid()
 if(r.purpose==='tool'){
  const t=object(r.target,['kind'],['tool','connection_id','connection_revision','tool_name','catalog_sha256'])
  if(t.kind!==r.source_kind)invalid()
  if(t.kind==='builtin'){object(t,['kind','tool']);if(typeof t.tool!=='string'||!['calculate','summarize','knowledge_search','web_fetch','web_search'].includes(t.tool))invalid()}
  else if(t.kind==='http'||t.kind==='mcp'){object(t,['kind','connection_id','connection_revision',...(t.kind==='mcp'?['tool_name','catalog_sha256']:[])]);if(typeof t.connection_id!=='string'||!uuid.test(t.connection_id)||!Number.isSafeInteger(t.connection_revision)||Number(t.connection_revision)<1||t.kind==='mcp'&&(!text(t.tool_name,120)||!t.tool_name||typeof t.catalog_sha256!=='string'||!hash.test(t.catalog_sha256)))invalid()}
  else invalid()
 }else if(r.purpose==='registry_translation'){
  if(r.source_kind!=='registry_translation'||r.fee_confirmed!==true)invalid()
  safeRegistryTranslationRequest({purpose:r.purpose,request_id:r.request_id,target:r.target,effect_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT',fee_consent:'APPROVE_ONE_OWNER_TOOL_TRIAL_POSSIBLE_CHARGES'})
 }else invalid()
 return r as ToolTrialReceipt
}
function registryEntry(raw:unknown):RegistryEntry{
 const r=object(raw,['name','title','description','version','status','remotes','packages','source_sha256'])
 if(!text(r.name,255)||!name.test(r.name)||r.name.includes('..')||!text(r.title,200)||!text(r.description,4000)||!text(r.version,80)||!version.test(r.version)||!['active','deprecated'].includes(typeof r.status==='string'?r.status:'')||typeof r.source_sha256!=='string'||!hash.test(r.source_sha256)||!Array.isArray(r.remotes)||r.remotes.length>5||!Array.isArray(r.packages)||r.packages.length>5)invalid()
 for(const raw of r.remotes){const remote=object(raw,['type','url']);if(remote.type!=='streamable-http'||!text(remote.url,1000))invalid();const url=new URL(remote.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)invalid()}
 for(const raw of r.packages){const pkg=object(raw,['registry','identifier','version']);if(!text(pkg.registry,40)||!text(pkg.identifier,200)||!text(pkg.version,80))invalid()}
 return r as RegistryEntry
}
function registry(raw:unknown,query:string):ToolHubRegistry{
 const r=object(raw,['items','next_cursor','query','source','is_execution_authority','chinese'])
 if(r.source!=='official_mcp_registry'||r.is_execution_authority!==false||r.query!==query||!text(r.next_cursor,300)||/[\s]/.test(r.next_cursor)||!Array.isArray(r.items)||r.items.length>24||!Array.isArray(r.chinese)||r.chinese.length>24)invalid()
 const items=r.items.map(registryEntry);if(new Set(items.map(i=>i.name)).size!==items.length)invalid()
 for(const raw of r.chinese){const c=object(raw,['server_name','zh_title','zh_desc','source_sha256']);if(!text(c.server_name,255)||!text(c.zh_title,200)||!text(c.zh_desc,600)||typeof c.source_sha256!=='string'||!items.some(e=>e.name===c.server_name&&e.source_sha256===c.source_sha256))invalid()}
 return {...r,items} as ToolHubRegistry
}
export function toolHubInvocations(raw:unknown):ToolHubInvocations{
 const r=object(raw,['items','next_after','scope','scan_limit','scanned','sampled','worker_liveness','automatic_replay_allowed'])
 if(!Array.isArray(r.items)||r.items.length>50||r.scope!=='owner_only'||r.scan_limit!==500||!Number.isSafeInteger(r.scanned)||!count(r.scanned,500)||typeof r.sampled!=='boolean'||r.worker_liveness!=='not_inferred'||r.automatic_replay_allowed!==false||r.next_after!==null&&(!text(r.next_after,500)||!/^[A-Za-z0-9_-]+$/.test(r.next_after)))invalid()
 for(const raw of r.items){const i=object(raw,['run_id','step_key','status','arguments_sha256','origin','trial_request_id','kind','tool','connection_id','created_at','recorded_duration_ms','error','retry_count','may_replay']);if(typeof i.run_id!=='string'||!uuid.test(i.run_id)||!text(i.step_key,160)||!['started','succeeded','failed','unknown'].includes(typeof i.status==='string'?i.status:'')||typeof i.arguments_sha256!=='string'||!hash.test(i.arguments_sha256)||!['trial','agent','workflow'].includes(typeof i.origin==='string'?i.origin:'')||!['builtin','http','mcp','unavailable'].includes(typeof i.kind==='string'?i.kind:'')||!text(i.tool,160)||i.connection_id!==null&&(typeof i.connection_id!=='string'||!uuid.test(i.connection_id))||i.trial_request_id!==null&&(typeof i.trial_request_id!=='string'||!uuid.test(i.trial_request_id))||!text(i.created_at,30)||i.recorded_duration_ms!==null&&!count(i.recorded_duration_ms,maxToolHubRecordedDurationMs)||i.retry_count!==null||i.may_replay!==false||i.error!==(i.status==='unknown'?'outcome_unknown':i.status==='failed'?'tool_failed':null))invalid()}
 return r as ToolHubInvocations
}
export function toolHubStats(raw:unknown):ToolHubStats{
 const r=object(raw,['calls','started','succeeded','failed','unknown','tools','retry_count','scope','sample_limit','sampled','metrics','worker_liveness'])
 if(r.scope!=='owner_only'||r.sample_limit!==500||typeof r.sampled!=='boolean'||r.metrics!=='recorded_external_effects_only'||r.worker_liveness!=='not_inferred'||r.retry_count!==null||!Array.isArray(r.tools)||r.tools.length>50||!['calls','started','succeeded','failed','unknown'].every(k=>Number.isSafeInteger(r[k])&&count(r[k],500))||Number(r.calls)!==Number(r.started)+Number(r.succeeded)+Number(r.failed)+Number(r.unknown))invalid()
 for(const raw of r.tools){const t=object(raw,['kind','tool','calls','started','succeeded','failed','unknown','average_recorded_duration_ms','retry_count']);if(!['builtin','http','mcp','unavailable'].includes(typeof t.kind==='string'?t.kind:'')||!text(t.tool,160)||!['calls','started','succeeded','failed','unknown'].every(k=>Number.isSafeInteger(t[k])&&count(t[k],500))||Number(t.calls)!==Number(t.started)+Number(t.succeeded)+Number(t.failed)+Number(t.unknown)||t.average_recorded_duration_ms!==null&&!count(t.average_recorded_duration_ms,maxToolHubRecordedDurationMs)||t.retry_count!==null)invalid()}
 return r as ToolHubStats
}
export function toolHubHarness(raw:unknown):ToolHubHarness{
 const r=object(raw,['totals','scope','run_sample_per_kind','unrecorded_metrics','worker_liveness']),t=object(r.totals,['runs','succeeded','failed','cancelled','average_recorded_steps','average_completed_duration_ms','stuck_loop_failures','estimated_tokens','compressions','truncations','retries'])
 if(r.scope!=='owner_only'||r.run_sample_per_kind!==100||r.unrecorded_metrics!=='unavailable'||r.worker_liveness!=='not_inferred'||!['runs','succeeded','failed','cancelled','stuck_loop_failures'].every(k=>Number.isSafeInteger(t[k])&&count(t[k],200))||Number(t.succeeded)+Number(t.failed)+Number(t.cancelled)>Number(t.runs)||t.average_recorded_steps!==null&&!count(t.average_recorded_steps)||t.average_completed_duration_ms!==null&&!count(t.average_completed_duration_ms,maxToolHubRecordedDurationMs)||['estimated_tokens','compressions','truncations','retries'].some(k=>t[k]!==null))invalid()
 return r as ToolHubHarness
}
export function createPgNativeToolHubApi(transport:{get<T>(route:ToolHubRoute):Promise<T>;post<T>(route:ToolHubRoute,body:Record<string,unknown>):Promise<T>}){
 const id=(v:string)=>{if(!uuid.test(v))invalid();return v.toLowerCase()}
 return {
  capabilities:async()=>{const r=object(await transport.get('/api/v2/tool-hub'),['available','trials','registry','scope','worker_started_by_api','worker_liveness']);if(['available','trials','registry'].some(k=>typeof r[k]!=='boolean')||r.scope!=='owner_only'||r.worker_started_by_api!==false||r.worker_liveness!=='not_inferred')invalid();return {available:r.available as boolean,trials:r.trials as boolean,registry:r.registry as boolean}},
  registry:async(search='',cursor='')=>{if(!text(search,100)||search&&Array.from(search.trim()).length<3||!text(cursor,300)||/\s/.test(cursor))invalid();return registry(await transport.get(`/api/v2/tool-hub/registry?${new URLSearchParams({search,cursor})}`),search.trim())},
  registryDetail:async(server:string,v='latest')=>{if(!text(server,255)||!name.test(server)||server.includes('..')||!version.test(v))invalid();const r=registry(await transport.get(`/api/v2/tool-hub/registry/detail?${new URLSearchParams({name:server,version:v})}`), '');if(r.items.length!==1||r.items[0]!.name!==server||v!=='latest'&&r.items[0]!.version!==v)invalid();return r},
  preview:async(raw:unknown)=>{const body=freezeToolHubIntent(raw),expected=await toolHubIntentHash(body),r=object(await transport.post('/api/v2/tool-hub/trials/preview',body),['request_id','purpose','request_sha256','arguments_sha256','graph_sha256','input_sha256','kind','requires_original_step_approval','possible_charges','worker_started_by_api']);if(r.request_id!==body.request_id||r.purpose!==body.purpose||r.request_sha256!==expected||!['arguments_sha256','graph_sha256','input_sha256'].every(k=>typeof r[k]==='string'&&hash.test(r[k]))||!['tool','model'].includes(typeof r.kind==='string'?r.kind:'')||r.requires_original_step_approval!==true||typeof r.possible_charges!=='boolean'||r.worker_started_by_api!==false)invalid();return {body,request_sha256:expected,graph_sha256:r.graph_sha256 as string}},
  submit:async(raw:unknown,graph:string)=>{const body=freezeToolHubIntent(raw),expected=await toolHubIntentHash(body),r=object(await transport.post('/api/v2/tool-hub/trials',body),['receipt','replayed','worker_started_by_api']);if(typeof r.replayed!=='boolean'||r.worker_started_by_api!==false)invalid();return {receipt:toolHubReceipt(r.receipt,{id:body.request_id,hash:expected,graph}),replayed:r.replayed}},
  confirm:async(request:string,expected:string)=>{if(!hash.test(expected))invalid();const requestId=id(request),r=object(await transport.get(`/api/v2/tool-hub/trials/${requestId}/confirm?${new URLSearchParams({request_sha256:expected})}`),['confirmed','receipt','worker_started_by_api']);if(typeof r.confirmed!=='boolean'||r.worker_started_by_api!==false||!r.confirmed&&r.receipt!==null)invalid();return {confirmed:r.confirmed,receipt:r.confirmed?toolHubReceipt(r.receipt,{id:requestId,hash:expected}):null}},
  list:async(after='')=>{if(after)id(after);const r=object(await transport.get(`/api/v2/tool-hub/trials?${new URLSearchParams(after?{after}:{})}`),['items','next_after','worker_started_by_api']);if(!Array.isArray(r.items)||r.items.length>50||r.worker_started_by_api!==false||r.next_after!==null&&(typeof r.next_after!=='string'||!uuid.test(r.next_after)))invalid();return {items:r.items.map(v=>toolHubReceipt(v)),next_after:r.next_after as string|null}},
  invocations:async(filters:{kind?:string;status?:string;tool?:string;after?:string}={})=>{if(Object.keys(filters).some(k=>!['kind','status','tool','after'].includes(k))||Object.values(filters).some(v=>!text(v,500)))invalid();return toolHubInvocations(await transport.get(`/api/v2/tool-hub/invocations?${new URLSearchParams(filters)}`))},
  stats:async()=>toolHubStats(await transport.get('/api/v2/tool-hub/stats')),
  harness:async()=>toolHubHarness(await transport.get('/api/v2/tool-hub/harness')),
 }
}
export type PgNativeToolHubApi=ReturnType<typeof createPgNativeToolHubApi>
