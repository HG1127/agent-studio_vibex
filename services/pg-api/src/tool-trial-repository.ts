// One immutable owner intent -> original private Workflow source/run/job.
// No direct tool/model executor, transport, credential or Worker construction.
import {createHash,randomUUID} from 'node:crypto'
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool,type WorkflowGraph} from './contracts.ts'
import {withActor,assertOwnedAdmissionContext} from './repository.ts'
import {WorkflowV2RunRepository,auditWorkflowV2} from './workflow-v2-run-repository.ts'
import {verifyWorkflowGraphResources} from './workflow-repository.ts'
import {createWorkflowV2Checkpoint,advanceWorkflowV2Checkpoint} from './workflow-v2-machine.ts'
import {prepareWorkflowTool} from './workflow-v2-tool-plan.ts'
import {verifyOwnerToolTrialCredentials} from './owner-tool-trial-audit.ts'
import {canonicalMcpJson} from './mcp-catalog.ts'
import {safeToolTrialRequest,toolTrialGraph,toolTrialPublicTarget,trialObject,TOOL_TRIAL_EFFECT_ACK,TOOL_TRIAL_FEE_ACK,type ToolTrialRequest} from './tool-trial-contract.ts'
import {safeRegistryTranslationRequest,registryTranslationGraph,registryChineseResult,type RegistryTranslationRequest} from './registry-translation-trial.ts'
import type {RegistryEntry} from './public-mcp-registry.ts'
import type {ToolTrialReceipt} from '../../../shared/tool-hub-public-types.ts'
export type {ToolTrialReceipt} from '../../../shared/tool-hub-public-types.ts'
type TrialRequest=ToolTrialRequest|RegistryTranslationRequest
const digest=(value:unknown)=>createHash('sha256').update(canonicalMcpJson(value)).digest('hex')
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const columns="t.request_id,t.purpose,t.source_kind,t.target,t.target_identity_sha256,t.arguments_sha256,t.request_sha256,t.graph_sha256,t.workflow_id,t.run_id,t.effect_consent,t.fee_consent,to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at"
function unavailable():never{throw new HttpError(503,'tool_trial_projection_unavailable')}
function native(identity:Identity){if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')}
export function parseOwnerToolTrialRequest(raw:unknown):TrialRequest{
 const descriptor=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'purpose'):undefined,purpose=descriptor&&'value'in descriptor?descriptor.value:undefined
 if(purpose==='tool')return safeToolTrialRequest(raw)
 if(purpose==='registry_translation')return safeRegistryTranslationRequest(raw)
 throw new HttpError(400,'invalid_tool_trial_purpose')
}
export function toolTrialIdentity(target:TrialRequest['target']):string{
 if(target.kind==='http')return digest(['http',target.binding.connection_id])
 if(target.kind==='mcp')return digest(['mcp',target.binding.connection_id,target.binding.tool_name])
 if(target.kind==='registry_translation')return digest(['registry_translation',target.entries.map(e=>e.name).sort()])
 return digest(['builtin',target.tool,target.model_binding?.connection_id??null,[...(target.knowledge_base_ids??[])].sort()])
}
export const toolTrialArgumentsHash=(request:TrialRequest)=>digest(request.purpose==='tool'?JSON.parse(request.arguments_json):request.target.entries)
export function toolTrialRequestHash(request:TrialRequest):string{return digest(request)}
function trialGraph(request:TrialRequest,current:readonly RegistryEntry[]):WorkflowGraph{return request.purpose==='tool'?toolTrialGraph(request):registryTranslationGraph(request,current)}
function previewEffect(graph:WorkflowGraph){
 let checkpoint=createWorkflowV2Checkpoint(graph,'本人独立试调',{finalDelivery:true})
 for(let i=0;i<4;i++){const next=advanceWorkflowV2Checkpoint(graph,checkpoint);checkpoint=next.checkpoint;if(next.view.pending){if(next.view.pending.kind==='tool')prepareWorkflowTool(next.view.pending);return {graph_sha256:checkpoint.graph_sha256,input_sha256:next.view.pending.input_sha256,kind:next.view.pending.kind}}}
 throw new HttpError(409,'tool_trial_graph_unavailable')
}
function parsedRow(raw:unknown):ToolTrialReceipt{
 const row=trialObject(raw,['request_id','purpose','source_kind','target','target_identity_sha256','arguments_sha256','request_sha256','graph_sha256','workflow_id','run_id','effect_consent','fee_consent','created_at'])
 if(!isUuid(row.request_id)||!isUuid(row.workflow_id)||!isUuid(row.run_id)||!hash(row.target_identity_sha256)||!hash(row.arguments_sha256)||!hash(row.request_sha256)||!hash(row.graph_sha256)||row.effect_consent!==true||typeof row.fee_consent!=='boolean'||typeof row.created_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.created_at)||!Number.isFinite(Date.parse(row.created_at)))return unavailable()
 const target=trialObject(row.target,['kind'],['tool','binding','model_binding','knowledge_base_ids','knowledge_retrieval','entries'])
 const request=row.purpose==='tool'?safeToolTrialRequest({purpose:'tool',request_id:row.request_id,target,arguments_json:'{}',effect_consent:TOOL_TRIAL_EFFECT_ACK,...(row.fee_consent?{fee_consent:TOOL_TRIAL_FEE_ACK}:{})}):row.purpose==='registry_translation'?safeRegistryTranslationRequest({purpose:'registry_translation',request_id:row.request_id,target,effect_consent:TOOL_TRIAL_EFFECT_ACK,fee_consent:row.fee_consent?TOOL_TRIAL_FEE_ACK:null}):unavailable()
 if(request.target.kind!==row.source_kind||toolTrialIdentity(request.target)!==row.target_identity_sha256)return unavailable()
 const projected=request.purpose==='tool'?toolTrialPublicTarget(request.target):{kind:'registry_translation' as const,model_binding:request.target.model_binding,entries:request.target.entries}
 return {request_id:row.request_id,purpose:request.purpose,source_kind:request.target.kind,target:projected,request_sha256:row.request_sha256,arguments_sha256:row.arguments_sha256,graph_sha256:row.graph_sha256,workflow_id:row.workflow_id,run_id:row.run_id,fee_confirmed:row.fee_consent,created_at:row.created_at,execution_mode:'workflow_native_v2' as const,worker_started_by_api:false as const}
}
async function requireSchemaAndEmployee(db:SqlClient,owner:string){
 await assertOwnedAdmissionContext(db,owner)
 let schema=false
 try{schema=await verifyOwnerToolTrialCredentials(db)}catch{}
 if(schema!==true)throw new HttpError(503,'owner_tool_trial_schema_required')
 const rows=(await db.query<{epoch:unknown}>('SELECT agentstudio.agent_memory_outcome_epoch() AS epoch')).rows,value=rows[0]?.epoch
 if(rows.length!==1||value===null)throw new HttpError(403,'employee_disabled')
 if(!(typeof value==='string'&&/^[1-9][0-9]*$/.test(value)||typeof value==='number')||!Number.isSafeInteger(Number(value))||Number(value)<1||Number(value)>Number.MAX_SAFE_INTEGER-2)throw new HttpError(503,'tool_trial_employee_guard_unavailable')
}
export {native as requireToolHubNativeIdentity,requireSchemaAndEmployee as requireToolHubOwnerContext}
export class OwnerToolTrialRepository{
 readonly pool:SqlPool
 readonly runs:WorkflowV2RunRepository
 constructor(pool:SqlPool,runs:WorkflowV2RunRepository){if(!(runs instanceof WorkflowV2RunRepository)||runs.pool!==pool||runs.root.mode!=='workflow_native_v2')throw Error('tool_trial_original_workflow_runtime_required');this.pool=pool;this.runs=runs}
 private async guardGraph(db:SqlClient,owner:string,graph:WorkflowGraph){
  if(!this.runs.allowMcpExecution&&graph.nodes.some(n=>n.data.mcp_binding))throw new HttpError(409,'mcp_execution_not_enabled')
  if(!this.runs.allowKnowledgeExecution&&graph.nodes.some(n=>n.data.knowledge_retrieval))throw new HttpError(409,'knowledge_execution_not_enabled')
  await verifyWorkflowGraphResources(db,owner,graph)
 }
 async preview(identity:Identity,raw:unknown,current:readonly RegistryEntry[]=[]){
  native(identity);const request=parseOwnerToolTrialRequest(raw),graph=trialGraph(request,current),effect=previewEffect(graph)
  return withActor(this.pool,identity,async(db,owner)=>{await requireSchemaAndEmployee(db,owner);await this.guardGraph(db,owner,graph);return {request_id:request.request_id,purpose:request.purpose,request_sha256:toolTrialRequestHash(request),arguments_sha256:toolTrialArgumentsHash(request),...effect,requires_original_step_approval:true,possible_charges:request.fee_consent===TOOL_TRIAL_FEE_ACK,worker_started_by_api:false}})
 }
 async submit(identity:Identity,raw:unknown,current:readonly RegistryEntry[]=[]){
  native(identity);const request=parseOwnerToolTrialRequest(raw),requestSha=toolTrialRequestHash(request),targetSha=toolTrialIdentity(request.target),argumentsSha=toolTrialArgumentsHash(request)
  return withActor(this.pool,identity,async(db,owner)=>{
   await requireSchemaAndEmployee(db,owner)
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[owner+':tool_trial:'+request.request_id])
   const prior=(await db.query('SELECT '+columns+' FROM agentstudio.toolhub_trials t WHERE t.owner_user_id=$1::uuid AND t.request_id=$2::uuid',[owner,request.request_id])).rows[0]
   if(prior){const receipt=parsedRow(prior);if(receipt.request_sha256!==requestSha)throw new HttpError(409,'tool_trial_operation_conflict');return {receipt,replayed:true,worker_started_by_api:false}}
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[owner+':tool_trial_target:'+targetSha+':'+argumentsSha])
   const unresolved=(await db.query<{id:string}>("SELECT t.run_id AS id FROM agentstudio.toolhub_trials t JOIN agentstudio.runs r ON r.id=t.run_id AND r.owner_user_id=t.owner_user_id WHERE t.owner_user_id=$1::uuid AND t.target_identity_sha256=$2::text AND t.arguments_sha256=$3::text AND (r.status NOT IN('succeeded','failed','cancelled') OR EXISTS(SELECT 1 FROM agentstudio.external_effects e WHERE e.run_id=r.id AND e.owner_user_id=t.owner_user_id AND e.status IN('started','unknown'))) LIMIT 1",[owner,targetSha,argumentsSha])).rows
   if(unresolved.length)throw new HttpError(409,'tool_trial_prior_effect_unresolved')
   const graph=trialGraph(request,current),effect=previewEffect(graph);await this.guardGraph(db,owner,graph)
   const workflowId=randomUUID(),runId=randomUUID(),name=(request.purpose==='tool'?'工具试调':'目录中文说明')+' · '+request.request_id.slice(0,8)
   await db.query("INSERT INTO agentstudio.workflows(id,owner_user_id,name,graph) VALUES($1::uuid,$2::uuid,$3::text,$4::jsonb)",[workflowId,owner,name,JSON.stringify(graph)])
   await this.runs.admitOwned(db,owner,workflowId,{expected_revision:1,idempotency_key:'tool_trial_'+request.request_id,instruction:'本人独立试调'},runId)
   const row=(await db.query("INSERT INTO agentstudio.toolhub_trials(owner_user_id,request_id,purpose,source_kind,target,target_identity_sha256,arguments_sha256,request_sha256,graph_sha256,workflow_id,run_id,effect_consent,fee_consent) VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::text,$7::text,$8::text,$9::text,$10::uuid,$11::uuid,true,$12::boolean) RETURNING request_id,purpose,source_kind,target,target_identity_sha256,arguments_sha256,request_sha256,graph_sha256,workflow_id,run_id,effect_consent,fee_consent,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at",[owner,request.request_id,request.purpose,request.target.kind,JSON.stringify(request.target),targetSha,argumentsSha,requestSha,effect.graph_sha256,workflowId,runId,request.fee_consent===TOOL_TRIAL_FEE_ACK])).rows[0]
   await auditWorkflowV2(db,owner,runId,'toolhub.trial_requested',{request_id:request.request_id,purpose:request.purpose,source_kind:request.target.kind,request_sha256:requestSha,arguments_sha256:argumentsSha,graph_sha256:effect.graph_sha256})
   return {receipt:parsedRow(row),replayed:false,worker_started_by_api:false}
  })
 }
 async confirm(identity:Identity,id:string,expected:string){
  native(identity);if(!isUuid(id)||!hash(expected))throw new HttpError(400,'invalid_tool_trial_confirmation')
  return withActor(this.pool,identity,async(db,owner)=>{await requireSchemaAndEmployee(db,owner);const row=(await db.query('SELECT '+columns+' FROM agentstudio.toolhub_trials t WHERE t.owner_user_id=$1::uuid AND t.request_id=$2::uuid',[owner,id])).rows[0];if(!row)return {confirmed:false,receipt:null,worker_started_by_api:false};const receipt=parsedRow(row);if(receipt.request_sha256!==expected)throw new HttpError(409,'tool_trial_operation_conflict');return {confirmed:true,receipt,worker_started_by_api:false}})
 }
 async list(identity:Identity,after:string|undefined,limit=30){
  native(identity);if(after!==undefined&&!isUuid(after)||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,'invalid_tool_trial_query')
  return withActor(this.pool,identity,async(db,owner)=>{await requireSchemaAndEmployee(db,owner);if(after&&(await db.query('SELECT request_id FROM agentstudio.toolhub_trials WHERE owner_user_id=$1::uuid AND request_id=$2::uuid',[owner,after])).rows.length!==1)throw new HttpError(400,'invalid_tool_trial_cursor');const rows=(await db.query('SELECT '+columns+' FROM agentstudio.toolhub_trials t WHERE t.owner_user_id=$1::uuid'+(after?' AND (t.created_at,t.request_id)<(SELECT created_at,request_id FROM agentstudio.toolhub_trials WHERE owner_user_id=$1::uuid AND request_id=$3::uuid)':'')+' ORDER BY t.created_at DESC,t.request_id DESC LIMIT $2::integer',[owner,limit+1,...(after?[after]:[])])).rows;const items=rows.slice(0,limit).map(parsedRow);return {items,next_after:rows.length>limit?items.at(-1)!.request_id:null,worker_started_by_api:false}})
 }
 async receipt(identity:Identity,id:string):Promise<ToolTrialReceipt>{
  native(identity);if(!isUuid(id))throw new HttpError(400,'invalid_tool_trial_id')
  return withActor(this.pool,identity,async(db,owner)=>{await requireSchemaAndEmployee(db,owner);const row=(await db.query('SELECT '+columns+' FROM agentstudio.toolhub_trials t WHERE t.owner_user_id=$1::uuid AND t.request_id=$2::uuid',[owner,id])).rows[0];if(!row)throw new HttpError(404,'tool_trial_not_found');return parsedRow(row)})
 }
 async detail(identity:Identity,id:string){const receipt=await this.receipt(identity,id);return {receipt,detail:await this.runs.get(identity,receipt.run_id),worker_started_by_api:false}}
 async decide(identity:Identity,id:string,body:unknown){const receipt=await this.receipt(identity,id);return {receipt,detail:await this.runs.decide(identity,receipt.run_id,body),worker_started_by_api:false}}
 async cancel(identity:Identity,id:string){const receipt=await this.receipt(identity,id);return {receipt,detail:await this.runs.cancel(identity,receipt.run_id),worker_started_by_api:false}}
 async translations(identity:Identity,current:readonly RegistryEntry[]){
  native(identity);return withActor(this.pool,identity,async(db,owner)=>{await requireSchemaAndEmployee(db,owner);const rows=(await db.query<{target:unknown;result_text:unknown}>("SELECT t.target,r.result_text FROM agentstudio.toolhub_trials t JOIN agentstudio.runs r ON r.id=t.run_id AND r.owner_user_id=t.owner_user_id WHERE t.owner_user_id=$1::uuid AND t.purpose='registry_translation' AND r.status='succeeded' ORDER BY t.created_at DESC LIMIT 50",[owner])).rows,found=new Map<string,ReturnType<typeof registryChineseResult>[number]>();for(const row of rows){try{const target=trialObject(row.target,['kind','model_binding','entries']);if(target.kind!=='registry_translation'||!Array.isArray(target.entries))continue;const request=safeRegistryTranslationRequest({purpose:'registry_translation',request_id:randomUUID(),target,effect_consent:TOOL_TRIAL_EFFECT_ACK,fee_consent:TOOL_TRIAL_FEE_ACK});for(const item of registryChineseResult(row.result_text,request.target.entries))if(!found.has(item.server_name)&&current.some(v=>v.name===item.server_name&&v.source_sha256===item.source_sha256))found.set(item.server_name,item)}catch{/* An invalid or superseded owner result never becomes a shared explanation. */}}return [...found.values()]})
 }
}
