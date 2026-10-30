// F05 only. Actual source/lease/reservation/credential checks precede one POST;
// all source transactions end before provider await. Import starts no service.
import type {request as HttpsRequest} from 'node:https'
import {HttpError,type SqlClient,type SqlPool} from './contracts.ts'
import {withActor} from './repository.ts'
import {withModelBrokerActor} from './model-broker-actor.ts'
import {verifyOptionalCredentialBoundary} from './optional-credential-boundary.ts'
import {decryptModelSecret} from './model-connection-crypto.ts'
import type {ProviderResolver} from './model-connection-probe.ts'
import {agentPlanWorkflowObject as object,agentPlanWorkflowArray as array,agentPlanWorkflowId as id,agentPlanWorkflowRevision as revision,agentPlanWorkflowSha as sha,canonicalAgentPlanWorkflowValue as canonical,agentPlanWorkflowPurpose as purpose} from './agent-plan-workflow-contract.ts'
import {agentPlanWorkflowResultValue,normalizeAgentPlanWorkflowCompletion} from './agent-plan-workflow-result.ts'
import {agentPlanWorkflowHash as hash} from './agent-plan-workflow-source.ts'
import {AgentPlanWorkflowLedgerRepository} from './agent-plan-workflow-ledger.ts'
import {parseAgentPlanWorkflowContext,parseAgentPlanWorkflowDispatchProof,parseAgentPlanWorkflowDispatchReply} from './agent-plan-workflow-rpc-contract.ts'
import {agentPlanWorkflowExecutionEnabled,type AgentPlanWorkflowAuditVerifier} from './agent-plan-workflow-runtime-policy.ts'
import {createAgentPlanWorkflowProviderExecutor,type AgentPlanWorkflowActivation,type AgentPlanWorkflowModelMaterial} from './agent-plan-workflow-provider.ts'
type Context=ReturnType<typeof parseAgentPlanWorkflowContext>
type Model={owner_user_id:string;revision:unknown;provider:AgentPlanWorkflowModelMaterial['provider'];base_url:string;enabled:boolean;status:string;models:unknown}
type Secret=Model&{api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}
const unavailable=():never=>{throw new HttpError(409,'agent_plan_workflow_context_unavailable')}
const version=(v:unknown)=>revision(typeof v==='string'&&/^[1-9][0-9]*$/.test(v)?Number(v):v)
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
/** Value comparator only. Actual caller must obtain this row through the
 * authenticated secret role and compare to the real locked source snapshot. */
export function bindAgentPlanWorkflowCredential(raw:Secret,selected:Context,expectedEnvelope:string,key:Buffer):AgentPlanWorkflowModelMaterial{
 const row=object(raw,['owner_user_id','revision','provider','base_url','enabled','status','models','api_key_ciphertext','api_key_nonce','api_key_tag']),b=selected.choice.generation_model
 if(row.owner_user_id!==selected.owner_user_id||version(row.revision)!==b.connection_revision||row.enabled!==true||row.status!=='ok'||!array(row.models,1000).includes(b.model_id))return unavailable()
 if(!(row.api_key_ciphertext instanceof Uint8Array)||!(row.api_key_nonce instanceof Uint8Array)||!(row.api_key_tag instanceof Uint8Array))return unavailable()
 const encrypted={ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)}
 try{
  const digest=hash({protocol:'agent_plan_workflow_encrypted_envelope_v1',owner_user_id:selected.owner_user_id,connection_id:b.connection_id,connection_revision:b.connection_revision,ciphertext_hex:encrypted.ciphertext.toString('hex'),nonce_hex:encrypted.nonce.toString('hex'),tag_hex:encrypted.tag.toString('hex')})
  if(digest!==sha(expectedEnvelope))return unavailable()
  return {provider:raw.provider,base_url:raw.base_url,model_id:b.model_id,api_key:decryptModelSecret(encrypted,key)}
 }finally{for(const bytes of Object.values(encrypted))bytes.fill(0)}
}
async function secretLogin(db:SqlClient):Promise<void>{
 const flags='rolcanlogin AS login,rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypassrls,rolcreatedb AS createdb,rolcreaterole AS createrole,rolreplication AS replication',safe=(v:Record<string,unknown>)=>[v.inherit,v.superuser,v.bypassrls,v.createdb,v.createrole,v.replication].every(x=>x===false)
 const login=(await db.query<Record<string,unknown>>('SELECT '+flags+',current_user=session_user AS initial_role FROM pg_catalog.pg_roles WHERE rolname=session_user')).rows,r=login[0]
 if(login.length!==1||!r||r.login!==true||r.initial_role!==true||!safe(r))return unavailable()
 const target=(await db.query<Record<string,unknown>>('SELECT '+flags+" FROM pg_catalog.pg_roles WHERE rolname='agentstudio_model_broker'")).rows,t=target[0]
 if(target.length!==1||!t||t.login!==false||!safe(t))return unavailable()
 const reachable=(await db.query<{name:string}>("SELECT r.rolname AS name FROM pg_catalog.pg_roles r WHERE r.rolname<>session_user AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') ORDER BY r.rolname")).rows
 const direct=(await db.query<{name:string;admin:boolean;inherit:boolean;set:boolean}>('SELECT r.rolname AS name,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS "set" FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles r ON r.oid=m.roleid WHERE member.rolname=session_user ORDER BY r.rolname,m.grantor')).rows,g=direct[0]
 if(reachable.length!==1||reachable[0]?.name!=='agentstudio_model_broker'||direct.length!==1||!g||g.name!=='agentstudio_model_broker'||g.admin!==false||g.inherit!==false||g.set!==true)return unavailable()
}
type Options=AgentPlanWorkflowActivation&{audit?:AgentPlanWorkflowAuditVerifier;resolver?:ProviderResolver;request?:typeof HttpsRequest}
export class AgentPlanWorkflowBroker{
 readonly enabled:boolean;readonly ledger:AgentPlanWorkflowLedgerRepository
 readonly businessPool:SqlPool;readonly dispatchPool:SqlPool;readonly secretPool:SqlPool
 private readonly options:Options
 private readonly key:Buffer;private readonly execute:ReturnType<typeof createAgentPlanWorkflowProviderExecutor>|null;private readonly active=new Map<string,AbortController>();private closed=false
 constructor(businessPool:SqlPool,dispatchPool:SqlPool,secretPool:SqlPool,key:Buffer,options:Options={}){
  this.businessPool=businessPool;this.dispatchPool=dispatchPool;this.secretPool=secretPool;this.options=Object.freeze({...options})
  this.enabled=agentPlanWorkflowExecutionEnabled(options)
  if(!businessPool||!dispatchPool||!secretPool||businessPool===dispatchPool||businessPool===secretPool||dispatchPool===secretPool||!Buffer.isBuffer(key)||key.length!==32||this.enabled&&typeof options.audit!=='function')throw Error('agent_plan_workflow_independent_pools_and_audit_required')
  this.key=Buffer.from(key);this.ledger=new AgentPlanWorkflowLedgerRepository(businessPool,{...options,dispatchPool});this.execute=this.enabled?createAgentPlanWorkflowProviderExecutor(options,options.resolver,options.request):null
 }
 close(){if(this.closed)return;this.closed=true;for(const controller of this.active.values())controller.abort();this.key.fill(0)}
 private async check(selected:Context,credential=false):Promise<AgentPlanWorkflowModelMaterial|null>{
  if(this.closed)return unavailable()
  return withActor(this.businessPool,selected.identity,async(db,owner)=>{
   if(owner!==selected.owner_user_id)return unavailable()
   const p=await this.ledger.source.prepareOnClient(selected.identity,db,owner,selected.choice);if(!same(p,selected.prepared))return unavailable()
   if(!credential)return null
   // The approved source RPC returns private digests, never encrypted bytes.
   // Rebind its exact model snapshot hash on THIS original locked transaction.
   const rows=(await db.query<{value:unknown}>('SELECT agentstudio.agent_plan_workflow_source($1::jsonb,$2::boolean) AS value',[JSON.stringify({purpose,spec_id:selected.choice.source.spec_id,generation_model:selected.choice.generation_model}),false])).rows
   if(rows.length!==1)return unavailable();const material=object(rows[0]!.value,['protocol','owner','source_values','resource_snapshot','model_snapshot']),state={owner_user_id:owner,governance_revision:p.owner_governance_revision,epoch:p.owner_epoch}
   if(material.protocol!=='agent_plan_workflow_source_material_v1'||!same(material.owner,state)||!same(material.source_values,p.source_values))return unavailable()
   const models=array(material.model_snapshot,2).map(raw=>{const v=object(raw,['connection_id','connection_revision','metadata_sha256','encrypted_envelope_sha256']);return {connection_id:id(v.connection_id),connection_revision:version(v.connection_revision),metadata_sha256:sha(v.metadata_sha256),encrypted_envelope_sha256:sha(v.encrypted_envelope_sha256)}})
   if(hash({protocol:'agent_plan_workflow_model_versions_v1',owner:state,model_snapshot:models})!==p.model_versions_sha256)return unavailable()
   const b=selected.choice.generation_model,matches=models.filter(m=>m.connection_id===b.connection_id&&m.connection_revision===b.connection_revision);if(matches.length!==1)return unavailable();const expected=matches[0]!
   const checkedPool:SqlPool={connect:async()=>{const client=await this.secretPool.connect();try{await secretLogin(client);return client}catch(error){client.release();throw error}}}
   // No provider/network wait here. Business SHARE locks stay held only while
   // the separate minimum secret role reads and authenticates the same bytes.
   const result=await withModelBrokerActor(checkedPool,selected.identity,async(client,actor)=>{
    if(actor!==owner||this.closed)return unavailable();await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='8s'");await verifyOptionalCredentialBoundary(client,'broker')
    const secrets=(await client.query<Secret>('SELECT owner_user_id,revision,provider,base_url,enabled,status,models,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid',[b.connection_id,owner])).rows,row=secrets[0]
    if(secrets.length!==1||!row||hash({protocol:'agent_plan_workflow_model_metadata_v1',connection_id:b.connection_id,owner_user_id:owner,connection_revision:version(row.revision),models:row.models,provider:row.provider,base_url:row.base_url,enabled:row.enabled,status:row.status})!==expected.metadata_sha256||this.closed)return unavailable()
    return bindAgentPlanWorkflowCredential(row,selected,expected.encrypted_envelope_sha256,this.key)
   })
   if(this.closed){result.api_key='';return unavailable()}return result
  })
 }
 private unknown(requestId:string){return parseAgentPlanWorkflowDispatchReply({protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:requestId,state:'unknown',result_sha256:null,completion_sha256:null})}
 private async recover(selected:Context,completion:ReturnType<typeof normalizeAgentPlanWorkflowCompletion>|null){
  if(completion?.status==='succeeded'&&'result' in completion)try{const view=await this.ledger.view(selected.identity,selected.request_id),expected=agentPlanWorkflowResultValue({request_id:selected.request_id,purpose,source:selected.choice.source,input_sha256:selected.prepared.input_sha256,generation_model:selected.choice.generation_model},completion.result)
   if(view.receipt.request_sha256===selected.request_sha256&&view.result&&view.result.result_sha256===hash(expected)&&same(view.result.value,expected))return parseAgentPlanWorkflowDispatchReply({protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:selected.request_id,state:'succeeded',result_sha256:view.result.result_sha256,completion_sha256:hash({protocol:'agent_plan_workflow_completion_v1',purpose,request_id:selected.request_id,completion})})
  }catch{}
  return this.unknown(selected.request_id)
 }
 async dispatch(raw:unknown){
  if(!this.enabled||this.closed||!this.execute)throw Error('agent_plan_workflow_execution_disabled')
  const proof=parseAgentPlanWorkflowDispatchProof(raw);if(this.active.has(proof.request_id))throw Error('agent_plan_workflow_dispatch_busy')
  const controller=new AbortController();this.active.set(proof.request_id,controller);let selected:Context|null=null,reserveSent=false,reserved=false,attempted=false,finishSent=false,completion:ReturnType<typeof normalizeAgentPlanWorkflowCompletion>|null=null,material:AgentPlanWorkflowModelMaterial|null=null
  try{
   selected=await this.ledger.context(proof);await this.check(selected)
   reserveSent=true;await this.ledger.reserve(proof);reserved=true
   const original=selected,recheck=async()=>{controller.signal.throwIfAborted();const fresh=await this.ledger.context(proof);if(!same(fresh,original))return unavailable();await this.check(original);controller.signal.throwIfAborted()}
   await recheck();material=await this.check(original,true);if(!material)return unavailable();await recheck();let beforePostUsed=false,timer:ReturnType<typeof setTimeout>|undefined
   let modelJson:string
   try{modelJson=await Promise.race([this.execute(material,{messages:original.prepared.messages,output_token_limit:original.choice.output_token_limit},controller.signal,async()=>{if(beforePostUsed)return unavailable();beforePostUsed=true;await recheck();attempted=true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('agent_plan_workflow_provider_unknown'))},30000)})])}finally{if(timer)clearTimeout(timer);material.api_key=''}
   completion=normalizeAgentPlanWorkflowCompletion({status:'succeeded',model_json:modelJson});await recheck();finishSent=true;const reply=await this.ledger.finish(proof,{status:'succeeded',model_json:modelJson})
   if(reply.state==='succeeded'&&(completion.status!=='succeeded'||!('result' in completion)||reply.result_sha256!==hash(agentPlanWorkflowResultValue({request_id:proof.request_id,purpose,source:original.choice.source,input_sha256:original.prepared.input_sha256,generation_model:original.choice.generation_model},completion.result))))return unavailable()
   return reply
  }catch(error){
   controller.abort()
   if(finishSent&&selected)return this.recover(selected,completion)
   if(!reserveSent)throw error
   if(!reserved)return this.unknown(proof.request_id)
   try{finishSent=true;return await this.ledger.finish(proof,{status:attempted?'unknown':'failed',failure_code:attempted?'provider_outcome_unknown':'source_or_credential_unavailable'})}catch{return this.unknown(proof.request_id)}
  }finally{controller.abort();if(material)material.api_key='';this.active.delete(proof.request_id)}
 }
}
