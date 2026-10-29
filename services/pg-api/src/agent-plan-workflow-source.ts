// Optional064 candidate: actual reads on the original Native owner transaction.
// The mandatory real auditor is pending Root/DB-author wiring. Digests are
// values, never a replacement for these reads, admission locks or SQL checks.
import {createHash} from 'node:crypto'
import {HttpError,safeAgentSpec,type Identity,type SqlClient,type SqlPool,type AgentSpecInput} from './contracts.ts'
import {assertOwnedAdmissionContext,verifyAgentSpecResources,withActor} from './repository.ts'
import {exactProviderEndpoint} from './model-connection-probe.ts'
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowObject as object,agentPlanWorkflowArray as array,agentPlanWorkflowId as id,agentPlanWorkflowSha as sha,agentPlanWorkflowRevision as revision,agentPlanWorkflowText as text,canonicalAgentPlanWorkflowValue as canonical,agentPlanWorkflowJsonValue,parseAgentPlanWorkflowChoice,parseAgentPlanWorkflowModel,type AgentPlanWorkflowModel} from './agent-plan-workflow-contract.ts'
import {parseAgentPlanWorkflowSourceValues,prepareAgentPlanWorkflowInput} from './agent-plan-workflow-result.ts'
import {parseAgentPlanWorkflowPrepared} from './agent-plan-workflow-rpc-contract.ts'
import type {AgentPlanWorkflowAuditVerifier} from './agent-plan-workflow-runtime-policy.ts'
export const agentPlanWorkflowHash=(value:unknown):string=>createHash('sha256').update(canonical(value),'utf8').digest('hex')
export function requireAgentPlanWorkflowNative(identity:Identity):void{
 if(identity?.issuer!=='urn:agentstudio:local:v1'||typeof identity.subject!=='string'||!identity.subject)throw new HttpError(403,'native_employee_identity_required')
}
const unavailable=():never=>{throw new HttpError(409,'agent_plan_workflow_source_changed')}
const projection=():never=>{throw new HttpError(503,'agent_plan_workflow_source_projection_unavailable')}
function version(raw:unknown):number{return revision(typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)?Number(raw):raw)}
export type AgentPlanWorkflowOwnerState={owner_user_id:string;governance_revision:number;epoch:number}
type Selection={purpose:typeof purpose;spec_id:string;generation_model:AgentPlanWorkflowModel}
type AgentRow={id:string;owner_user_id:string;name:string;spec:unknown;revision:unknown}
type ModelRow={owner_user_id:string;revision:unknown;models:unknown;provider:'openai'|'anthropic'|'gemini';base_url:string;enabled:boolean;status:string}
type Snapshot={kind:'http'|'mcp'|'knowledge_base'|'knowledge_retrieval'|'membership'|'consent';id:string;revision:number|null;sha256:string}
const resourceKeys=['tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','model_binding','require_approval','require_plan_review'] as const
function resources(spec:AgentSpecInput){return Object.fromEntries(resourceKeys.filter(k=>Object.hasOwn(spec,k)).map(k=>[k,spec[k]]))}
function selection(raw:unknown):Selection{
 const v=object(raw,['purpose','spec_id','generation_model']);if(v.purpose!==purpose)return unavailable()
 return {purpose,spec_id:id(v.spec_id),generation_model:parseAgentPlanWorkflowModel(v.generation_model)}
}
function canonicalSpec(raw:unknown):AgentSpecInput{
 try{const v=object(agentPlanWorkflowJsonValue(raw));if(v.require_approval!==true)return unavailable();const {require_approval:_approval,...rest}=v,checked=safeAgentSpec(rest);if(canonical(v)!==canonical(checked))return unavailable();return checked}catch{return unavailable()}
}
export class AgentPlanWorkflowSourceRepository{
 readonly pool:SqlPool;readonly audit?:AgentPlanWorkflowAuditVerifier
 constructor(pool:SqlPool,audit?:AgentPlanWorkflowAuditVerifier){this.pool=pool;this.audit=audit}
 async contextOnClient(identity:Identity,db:SqlClient,owner:string):Promise<AgentPlanWorkflowOwnerState>{
  requireAgentPlanWorkflowNative(identity);await assertOwnedAdmissionContext(db,owner)
  if(typeof this.audit!=='function'||await this.audit(db)!==true)throw new HttpError(503,'agent_plan_workflow_actual_auditor_required')
  const rows=(await db.query<{value:unknown}>('SELECT agentstudio.agent_plan_workflow_owner_state() AS value')).rows
  if(rows.length!==1)return projection()
  const v=object(rows[0]!.value,['owner_user_id','governance_revision','epoch'])
  if(v.owner_user_id!==owner)throw new HttpError(403,'native_employee_identity_required')
  const governance_revision=version(v.governance_revision),epoch=version(v.epoch);if(epoch!==governance_revision)return unavailable()
  return {owner_user_id:id(owner),governance_revision,epoch}
 }
 private async agent(db:SqlClient,owner:string,specId:string,mode:'share'|'update'){
  // Save takes UPDATE immediately: no shared-to-exclusive lock upgrade.
  const rows=(await db.query<AgentRow>('SELECT id,owner_user_id,name,spec,revision FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR '+(mode==='update'?'UPDATE':'SHARE'),[specId,owner])).rows,row=rows[0]
  if(rows.length!==1||!row||row.id!==specId||row.owner_user_id!==owner)throw new HttpError(404,'agent_spec_not_found')
  const spec=canonicalSpec(row.spec);await verifyAgentSpecResources(db,owner,spec)
  return {spec_id:specId,owner_user_id:owner,name:text(row.name,120,true),spec,revision:version(row.revision)}
 }
 private async models(db:SqlClient,owner:string,generation:AgentPlanWorkflowModel,spec:AgentSpecInput){
  const bindings=[generation,...(spec.model_binding?[spec.model_binding]:[])],ids=[...new Set(bindings.map(b=>b.connection_id))].sort(),snapshots=[]
  for(const connection_id of ids){
   const rows=(await db.query<ModelRow>('SELECT owner_user_id,revision,models,provider,base_url,enabled,status FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE',[connection_id,owner])).rows,row=rows[0]
   if(rows.length!==1||!row||row.owner_user_id!==owner||row.enabled!==true||row.status!=='ok')return unavailable()
   const connection_revision=version(row.revision),models=array(row.models,1000).map(v=>text(v,120,true))
   if(new Set(models).size!==models.length||bindings.filter(b=>b.connection_id===connection_id).some(b=>b.connection_revision!==connection_revision||!models.includes(b.model_id)))return unavailable()
   try{exactProviderEndpoint(row)}catch{return unavailable()}
   snapshots.push({connection_id,connection_revision,metadata_sha256:agentPlanWorkflowHash({protocol:'agent_plan_workflow_model_metadata_v1',connection_id,owner_user_id:owner,connection_revision,models,provider:row.provider,base_url:row.base_url,enabled:row.enabled,status:row.status})})
  }
  return snapshots
 }
 private resourceSnapshot(raw:unknown,spec:AgentSpecInput,owner:string):Snapshot[]{
  const expected=new Map<string,number|null>(),add=(kind:Snapshot['kind'],key:string,rev:number|null)=>{const k=kind+':'+key;if(expected.has(k)&&expected.get(k)!==rev)return projection();expected.set(k,rev)}
  for(const r of spec.http_tools??[])add('http',r.connection_id,r.connection_revision)
  for(const r of spec.mcp_tools??[])add('mcp',r.connection_id,r.connection_revision)
  for(const key of spec.knowledge_base_ids){add('knowledge_base',key,null);add('membership',key,null)}
  if(spec.knowledge_retrieval){add('knowledge_retrieval',spec.knowledge_retrieval.profile_id,spec.knowledge_retrieval.profile_revision);add('consent',owner,spec.knowledge_retrieval.consent_revision)}
  const list=array(raw,100).map(item=>{const v=object(item,['kind','id','revision','sha256']),kind=v.kind as Snapshot['kind'],key=id(v.id),rev=v.revision===null?null:version(v.revision)
   if(!expected.has(kind+':'+key)||expected.get(kind+':'+key)!==rev)return projection()
   return {kind,id:key,revision:rev,sha256:sha(v.sha256)}
  }),keys=list.map(v=>v.kind+':'+v.id)
  if(list.length!==expected.size||new Set(keys).size!==keys.length||canonical(keys)!==canonical([...keys].sort()))return projection()
  return list
 }
 async currentOnClient(identity:Identity,db:SqlClient,owner:string,rawSelection:unknown,mode:'share'|'update'='share'){
  const selected=selection(rawSelection),state=await this.contextOnClient(identity,db,owner),agent=await this.agent(db,owner,selected.spec_id,mode),models=await this.models(db,owner,selected.generation_model,agent.spec)
  // This audited SECURITY DEFINER RPC must read and lock actual selected rows,
  // ACL/consent and ciphertext envelopes itself. API has no secret-column grant.
  // The encrypted hash is never accepted from caller data or computed metadata.
  const rows=(await db.query<{value:unknown}>('SELECT agentstudio.agent_plan_workflow_source($1::jsonb,$2::boolean) AS value',[JSON.stringify(selected),mode==='update'])).rows
  if(rows.length!==1)return projection()
  const v=object(agentPlanWorkflowJsonValue(rows[0]!.value),['protocol','owner','source_values','resource_snapshot','model_snapshot'])
  if(v.protocol!=='agent_plan_workflow_source_material_v1'||canonical(v.owner)!==canonical(state))return projection()
  const resource_snapshot=this.resourceSnapshot(v.resource_snapshot,agent.spec,owner),model_snapshot=array(v.model_snapshot,2).map(item=>{
   const m=object(item,['connection_id','connection_revision','metadata_sha256','encrypted_envelope_sha256'])
   return {connection_id:id(m.connection_id),connection_revision:version(m.connection_revision),metadata_sha256:sha(m.metadata_sha256),encrypted_envelope_sha256:sha(m.encrypted_envelope_sha256)}
  })
  if(model_snapshot.length!==models.length||model_snapshot.some((m,i)=>m.connection_id!==models[i]!.connection_id||m.connection_revision!==models[i]!.connection_revision||m.metadata_sha256!==models[i]!.metadata_sha256))return projection()
  const source={spec_id:agent.spec_id,spec_revision:agent.revision,source_sha256:agentPlanWorkflowHash({protocol:'agent_plan_workflow_source_binding_v1',owner:state,agent}),resources_sha256:agentPlanWorkflowHash({protocol:'agent_plan_workflow_resource_values_v1',resources:resources(agent.spec)}),resource_versions_sha256:agentPlanWorkflowHash({protocol:'agent_plan_workflow_resource_versions_v1',owner:state,resource_snapshot,model_snapshot})}
  const source_values={source,name:agent.name,spec:agent.spec}
  if(canonical(v.source_values)!==canonical(source_values))return projection()
  parseAgentPlanWorkflowSourceValues(source_values)
  return {owner:state,source_values,model_versions_sha256:agentPlanWorkflowHash({protocol:'agent_plan_workflow_model_versions_v1',owner:state,model_snapshot})}
 }
 async prepareOnClient(identity:Identity,db:SqlClient,owner:string,rawChoice:unknown,mode:'share'|'update'='share'){
  const choice=parseAgentPlanWorkflowChoice(rawChoice),current=await this.currentOnClient(identity,db,owner,{purpose,spec_id:choice.source.spec_id,generation_model:choice.generation_model},mode)
  if(canonical(choice.source)!==canonical(current.source_values.source))return unavailable()
  const prepared=prepareAgentPlanWorkflowInput(choice,current.source_values)
  return parseAgentPlanWorkflowPrepared({protocol:'agent_plan_workflow_prepared_v1',purpose,choice,source_values:current.source_values,messages:prepared.messages,input_sha256:agentPlanWorkflowHash(prepared.input_value),content_sha256:agentPlanWorkflowHash(prepared.content_value),model_versions_sha256:current.model_versions_sha256,owner_user_id:owner,owner_governance_revision:current.owner.governance_revision,owner_epoch:current.owner.epoch,byte_length:new TextEncoder().encode(canonical(prepared.input_value)).length,authority:false})
 }
 async reference(identity:Identity,rawSelection:unknown){requireAgentPlanWorkflowNative(identity);const selected=selection(rawSelection);return withActor(this.pool,identity,async(db,owner)=>{
  const current=await this.currentOnClient(identity,db,owner,selected);return {protocol:'agent_plan_workflow_source_v1' as const,purpose,source:current.source_values.source,name:current.source_values.name,generation_model:selected.generation_model,recorded:false as const}
 })}
 async preview(identity:Identity,rawChoice:unknown){requireAgentPlanWorkflowNative(identity);const choice=parseAgentPlanWorkflowChoice(rawChoice);return withActor(this.pool,identity,(db,owner)=>this.prepareOnClient(identity,db,owner,choice))}
}
