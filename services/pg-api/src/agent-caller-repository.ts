// Independent caller authentication and same-client original Agent admission.
// Public methods never accept an Owner, Native identity, model or resource ID.
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActor} from './repository.ts'
import {applyKnowledgeScope} from './knowledge-scope-policy.ts'
import {AutonomousAgentRunRepository} from './autonomous-agent-run-repository.ts'
import {agentTemplateMarketObject as O} from './agent-template-market-contract.ts'
import {agentCallerCanonical,agentCallerId,agentCallerOrigin,agentCallerOwnerIntent,parseAgentCallerOwnerChoice,parseAgentCallerOwnerTest,parseAgentCallerSecret,parseAgentCallerRunChoice,parseAgentCallerRunReply,parseAgentCallerPublicStatus,matchAgentCallerRunReceipt,parseAgentCallerWorkspace,parseAgentCallerHistory,parseAgentCallerOwnerReply,parseAgentCallerEmbed,type AgentCallerRunChoice} from '../../../shared/agent-caller-contract.ts'
import {redactResultText} from './public-result-text.ts'
import {verifyWorkflowV2Snapshot,checkedWorkflowV2StoredState,workflowV2RunColumns,type WorkflowV2RunRow} from './workflow-v2-run-repository.ts'
import {verifyAgentCallerCredentials} from './agent-caller-audit.ts'
export type AgentCallerOptions={enabled?:boolean;allowAdmission?:boolean;allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean;allowHumanInput?:boolean}
type Auth={raw:string|null;credential_id:string;generation:number;origin:string;mode:'public'|'owner_test'}
const fingerprint=(value:unknown)=>createHash('sha256').update(agentCallerCanonical(value)).digest('hex')
function failure(error:unknown):never{
 if(error instanceof HttpError)throw error
 if(error&&typeof error==='object'&&'code'in error&&error.code==='P0001'&&'message'in error){const code=String(error.message);if(['agent_design_native_owner_required','agent_internal_share_member_required'].includes(code))throw new HttpError(401,'agent_caller_authorization_required');if(/^agent_caller_[a-z_]{1,64}$/.test(code)){const status=code==='agent_caller_not_found'?404:code.includes('authorization')||code.includes('actor_required')?401:code.includes('invalid_')?400:409;throw new HttpError(status,code)}}
 throw new HttpError(503,'agent_caller_outcome_unknown')
}
function redactPublic(text:string){return redactResultText(text).replace(/acs_(?:api|embed)_[a-f0-9-]{36}_g[1-9][0-9]{0,15}_[A-Za-z0-9_-]{43}/g,'***')}
export class AgentCallerRepository{
 readonly pool:SqlPool;readonly enabled:boolean;readonly allowAdmission:boolean;readonly agents:AutonomousAgentRunRepository
 constructor(pool:SqlPool,options:AgentCallerOptions={}){this.pool=pool;this.enabled=options.enabled===true;this.allowAdmission=options.allowAdmission===true;this.agents=new AutonomousAgentRunRepository(pool,{allowMcpExecution:options.allowMcpExecution,allowKnowledgeExecution:options.allowKnowledgeExecution,allowHumanInput:options.allowHumanInput})}
 private available(){if(!this.enabled)throw new HttpError(404,'agent_caller_not_found')}
 private async ready(db:SqlClient){await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'");if(await verifyAgentCallerCredentials(db)!==true)throw new HttpError(503,'agent_caller_not_installed')}
 private async owned<T>(identity:Identity,body:(db:SqlClient,owner:string)=>Promise<T>){this.available();try{return await withActor(this.pool,identity,async(db,owner)=>{await this.ready(db);return body(db,owner)})}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='P0001'&&'message'in error&&['agent_caller_authorization_required','agent_design_native_owner_required','agent_internal_share_member_required'].includes(String(error.message)))throw new HttpError(409,'agent_caller_key_unavailable');return failure(error)}}
 private async anonymous<T>(body:(db:SqlClient)=>Promise<T>){this.available();const db=await this.pool.connect();let begun=false;try{await db.query('BEGIN');begun=true;await applyKnowledgeScope(db,this.pool);await db.query('SET LOCAL ROLE agentstudio_api');await db.query("SELECT set_config('agentstudio.actor_id','',true)");await this.ready(db);const result=await body(db);await db.query('COMMIT');begun=false;return result}catch(error){if(begun)await db.query('ROLLBACK').catch(()=>undefined);return failure(error)}finally{db.release()}}
 workspace(identity:Identity){return this.owned(identity,async db=>parseAgentCallerWorkspace((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_owner_rows() AS value')).rows[0]?.value))}
 history(identity:Identity){return this.owned(identity,async db=>{
  const value=parseAgentCallerHistory((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_owner_history() AS value')).rows[0]?.value),items=value.items.map(item=>({...item,result:redactPublic(item.result)})),result={...value,items}
  // The database retains every invocation; this bounded recent projection
  // never makes a long answer history exceed the transport's actual EOF cap.
  while(result.items.length&&Buffer.byteLength(JSON.stringify(result))>524288)result.items.pop()
  return result
 })}
 ownerConfirm(identity:Identity,rawId:unknown){const id=agentCallerId(rawId);return this.owned(identity,async db=>{const value=(await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_owner_receipt($1::uuid) AS value',[id])).rows[0]?.value;if(value===null)throw new HttpError(404,'agent_caller_not_found');const v=O(value,['protocol','receipt','replayed']);return parseAgentCallerOwnerReply({...v,secret:null})})}
 async change(identity:Identity,raw:unknown){const choice=parseAgentCallerOwnerChoice(raw);let key:string|null=null;const result=await this.owned(identity,async db=>{
  let id:string|null=null
  if(choice.action==='create'){id=randomUUID();key='acs_'+choice.kind+'_'+id+'_g1_'+randomBytes(32).toString('base64url')}
  else if(choice.action==='rotate'){
   // No secret reads: the owner workspace contains only metadata. A concurrent
   // revision/generation change is rejected by the same SQL write transaction.
   const workspace=O((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_owner_rows() AS value')).rows[0]?.value,['protocol','budget','credentials','agents','owner_epoch']);if(!Array.isArray(workspace.credentials))throw Error();const current=workspace.credentials.find(x=>x&&typeof x==='object'&&'id'in x&&x.id===choice.credential_id) as {generation?:unknown}|undefined
   if(!current||!Number.isSafeInteger(current.generation))throw new HttpError(404,'agent_caller_not_found');id=choice.credential_id;key='acs_'+choice.kind+'_'+id+'_g'+(Number(current.generation)+1)+'_'+randomBytes(32).toString('base64url')
  }
  const v=O((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_owner_change($1::jsonb,$2::uuid,$3::text) AS value',[agentCallerCanonical(choice),id,key])).rows[0]?.value,['protocol','receipt','replayed']);if(v.protocol!=='agent_caller_owner_reply_v1'||typeof v.replayed!=='boolean')throw Error();const receipt=O(v.receipt,['protocol','request_id','request_sha256','action','outcome','provider_called','secret_recoverable']);if(receipt.protocol!=='agent_caller_owner_receipt_v1'||receipt.request_id!==choice.request_id||receipt.request_sha256!==fingerprint(agentCallerOwnerIntent(choice))||receipt.action!==choice.action||receipt.provider_called!==false||receipt.secret_recoverable!==false)throw Error();return v
 });return parseAgentCallerOwnerReply({...result,secret:result.replayed?null:key})}
 private auth(rawKey:string,origin:string):Auth{const key=parseAgentCallerSecret(rawKey);return{raw:key.raw,credential_id:key.credential_id,generation:key.generation,origin:agentCallerOrigin(origin),mode:'public'}}
 private async admit(db:SqlClient,auth:Auth,choice:AgentCallerRunChoice){
  if(!this.allowAdmission)throw new HttpError(403,'agent_caller_admission_disabled')
  const args=[auth.raw,auth.credential_id,auth.generation,auth.origin,auth.mode,agentCallerCanonical(choice)],v=O((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_begin($1::text,$2::uuid,$3::bigint,$4::text,$5::text,$6::jsonb) AS value',args)).rows[0]?.value,['recorded'],['receipt','owner_user_id','source_id','invocation_id','run_id','max_steps','version_id','version_sha256'])
  let result:unknown
  if(v.recorded===true)result={protocol:'agent_caller_run_reply_v1',receipt:v.receipt,replayed:true}
  else if(v.recorded===false){const owner=agentCallerId(v.owner_user_id),source=agentCallerId(v.source_id),run=agentCallerId(v.run_id);await this.agents.admitOwned(db,owner,source,{expected_revision:1,idempotency_key:'caller_'+fingerprint({credential_id:auth.credential_id,generation:auth.generation,origin:auth.origin,mode:auth.mode,choice}),instruction:choice.input,max_steps:v.max_steps},run);result=(await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_finish($1::uuid,$2::bigint,$3::uuid) AS value',[auth.credential_id,auth.generation,choice.request_id])).rows[0]?.value}
  else throw Error()
  const parsed=parseAgentCallerRunReply(result);await matchAgentCallerRunReceipt(parsed.receipt,choice,auth,auth.origin,auth.mode);return parsed
 }
 run(rawKey:string,origin:string,raw:unknown){const auth=this.auth(rawKey,origin),choice=parseAgentCallerRunChoice(raw);return this.anonymous(db=>this.admit(db,auth,choice))}
 ownerTest(identity:Identity,origin:string,raw:unknown){const request=parseAgentCallerOwnerTest(raw),auth:Auth={raw:null,credential_id:request.credential_id,generation:request.generation,origin:agentCallerOrigin(origin),mode:'owner_test'};return this.owned(identity,db=>this.admit(db,auth,request.choice))}
 ownerTestConfirm(identity:Identity,origin:string,raw:unknown){const request=parseAgentCallerOwnerTest(raw),auth:Auth={raw:null,credential_id:request.credential_id,generation:request.generation,origin:agentCallerOrigin(origin),mode:'owner_test'};return this.owned(identity,async db=>{const result=parseAgentCallerRunReply((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_confirm($1::text,$2::uuid,$3::bigint,$4::text,$5::text,$6::jsonb) AS value',[null,auth.credential_id,auth.generation,auth.origin,auth.mode,agentCallerCanonical(request.choice)])).rows[0]?.value);await matchAgentCallerRunReceipt(result.receipt,request.choice,auth,auth.origin,auth.mode);if(!result.replayed)throw Error();return result})}
 confirm(rawKey:string,origin:string,raw:unknown){const auth=this.auth(rawKey,origin),choice=parseAgentCallerRunChoice(raw);return this.anonymous(async db=>{const result=parseAgentCallerRunReply((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_confirm($1::text,$2::uuid,$3::bigint,$4::text,$5::text,$6::jsonb) AS value',[auth.raw,auth.credential_id,auth.generation,auth.origin,auth.mode,agentCallerCanonical(choice)])).rows[0]?.value);await matchAgentCallerRunReceipt(result.receipt,choice,auth,origin);if(!result.replayed)throw Error();return result})}
 private async pollOn(db:SqlClient,auth:Auth,id:string){
  const internal=O((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_poll($1::text,$2::uuid,$3::bigint,$4::text,$5::text,$6::uuid) AS value',[auth.raw,auth.credential_id,auth.generation,auth.origin,auth.mode,id])).rows[0]?.value,['owner_user_id','run_id','projection']),owner=agentCallerId(internal.owner_user_id),runId=agentCallerId(internal.run_id),value=parseAgentCallerPublicStatus(internal.projection)
  if(value.invocation_id!==id)throw Error()
  // The authenticated SQL projection supplies the scope; no HTTP Owner is
  // accepted. Repeat original model/tool/knowledge ACL checks before output.
  await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])
  const run=(await db.query<WorkflowV2RunRow>('SELECT '+workflowV2RunColumns+' FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid',[runId,owner])).rows[0]
  if(!run)throw new HttpError(404,'agent_caller_not_found')
  await verifyWorkflowV2Snapshot(db,owner,run,checkedWorkflowV2StoredState(run.checkpoint,run.instruction))
  await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[auth.mode==='public'?'':owner])
  return{...value,result:redactPublic(value.result)}
 }
 poll(rawKey:string,origin:string,rawId:unknown){const auth=this.auth(rawKey,origin),id=agentCallerId(rawId);return this.anonymous(db=>this.pollOn(db,auth,id))}
 ownerPoll(identity:Identity,origin:string,rawId:unknown){const id=agentCallerId(rawId),actualOrigin=agentCallerOrigin(origin);return this.owned(identity,async db=>{const v=O((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_owner_test_scope($1::uuid) AS value',[id])).rows[0]?.value,['credential_id','generation','origin']);if(v.origin!==actualOrigin)throw new HttpError(404,'agent_caller_not_found');return this.pollOn(db,{raw:null,credential_id:agentCallerId(v.credential_id),generation:Number(v.generation),origin:actualOrigin,mode:'owner_test'},id)})}
 embed(rawId:unknown){const id=agentCallerId(rawId);return this.anonymous(async db=>parseAgentCallerEmbed((await db.query<{value:unknown}>('SELECT agentstudio.agent_caller_embed($1::uuid) AS value',[id])).rows[0]?.value))}
 preflight(origin:string){const parsed=agentCallerOrigin(origin);return this.anonymous(async db=>(await db.query<{ok:boolean}>('SELECT agentstudio.agent_caller_preflight($1::text) AS ok',[parsed])).rows[0]?.ok===true)}
}
