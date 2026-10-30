// Optional064 candidate. Only fixed F05 RPCs; no F01 fee/result/save authority.
// Actual064 SQL/auditor is pending. Pure tests cannot prove DB atomicity/grants.
import {HttpError,type Identity,type SqlClient,type SqlPool} from './contracts.ts'
import {withActorClient} from './repository.ts'
import {verifyWorkflowGraphResources} from './workflow-repository.ts'
import {AgentPlanWorkflowSourceRepository,requireAgentPlanWorkflowNative,agentPlanWorkflowHash as hash} from './agent-plan-workflow-source.ts'
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowFeeAcknowledgement,agentPlanWorkflowId as id,canonicalAgentPlanWorkflowValue as canonical,parseAgentPlanWorkflowChoice,parseAgentPlanWorkflowSubmission,parseAgentPlanWorkflowSaveIntent,agentPlanWorkflowPaidIntentValue,agentPlanWorkflowSaveIntentValue,type AgentPlanWorkflowSubmission} from './agent-plan-workflow-contract.ts'
import {prepareAgentPlanWorkflowInput,deriveAgentPlanWorkflowDraft,normalizeAgentPlanWorkflowCompletion} from './agent-plan-workflow-result.ts'
import {AgentPlanWorkflowProjectionError,parseAgentPlanWorkflowReceipt,parseAgentPlanWorkflowResultData,parseAgentPlanWorkflowView,parseAgentPlanWorkflowControl,parseAgentPlanWorkflowControlReceipt,parseAgentPlanWorkflowSavePreviewInput,parseAgentPlanWorkflowSavePreview,parseAgentPlanWorkflowSaveReceipt,parseAgentPlanWorkflowDispatchProof,parseAgentPlanWorkflowClaim,parseAgentPlanWorkflowContext,parseAgentPlanWorkflowReservation,parseAgentPlanWorkflowDispatchReply,type AgentPlanWorkflowReceipt,type AgentPlanWorkflowSavePreview,type AgentPlanWorkflowDispatchProof} from './agent-plan-workflow-rpc-contract.ts'
import {assertAgentPlanWorkflowSession,requireAgentPlanWorkflowAudit,agentPlanWorkflowExecutionEnabled,type AgentPlanWorkflowAuditVerifier,type AgentPlanWorkflowDatabaseRole} from './agent-plan-workflow-runtime-policy.ts'
const bad=():never=>{throw new AgentPlanWorkflowProjectionError()}
const conflict=():never=>{throw new HttpError(409,'agent_plan_workflow_request_conflict')}
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
/** Unknown COMMIT ACK never means failed effect, authorization or permission to
 * retry a POST. Read the original UUID; do not manufacture a new request. */
export class AgentPlanWorkflowAcknowledgementUnknown extends HttpError{
 readonly request_id:string|null;readonly retry_allowed=false
 constructor(requestId:string|null){super(503,'agent_plan_workflow_acknowledgement_unknown');this.request_id=requestId}
}
type Options={allowSubmissions?:boolean;allowSaves?:boolean;audit?:AgentPlanWorkflowAuditVerifier;workerPool?:SqlPool;dispatchPool?:SqlPool;executionEnabled?:boolean;executionApproval?:string}
export class AgentPlanWorkflowLedgerRepository{
 readonly pool:SqlPool;readonly source:AgentPlanWorkflowSourceRepository;readonly submitting:boolean;readonly saving:boolean
 private readonly options:Options;private readonly executing:boolean
 constructor(pool:SqlPool,options:Options={}){
  if(options.workerPool===pool||options.dispatchPool===pool||options.workerPool&&options.workerPool===options.dispatchPool)throw Error('agent_plan_workflow_distinct_pools_required')
  this.pool=pool;this.options={...options};this.source=new AgentPlanWorkflowSourceRepository(pool,options.audit);this.submitting=options.allowSubmissions===true;this.saving=options.allowSaves===true;this.executing=agentPlanWorkflowExecutionEnabled(options)
 }
 private async transaction<T>(pool:SqlPool,requestId:string|null,body:(db:SqlClient)=>Promise<T>):Promise<T>{
  const db=await pool.connect();let begun=false,committing=false
  try{await db.query('BEGIN');begun=true;const result=await body(db);committing=true;await db.query('COMMIT');begun=false;return result}
  catch(error){if(begun)await db.query('ROLLBACK').catch(()=>undefined);if(committing)throw new AgentPlanWorkflowAcknowledgementUnknown(requestId);throw error}
  finally{db.release()}
 }
 private async actor<T>(identity:Identity,requestId:string|null,body:(db:SqlClient,owner:string)=>Promise<T>):Promise<T>{
  requireAgentPlanWorkflowNative(identity)
  return this.transaction(this.pool,requestId,db=>withActorClient(db,this.pool,identity,async(client,owner)=>{await this.source.contextOnClient(identity,client,owner);return body(client,owner)}))
 }
 private async lock(db:SqlClient,owner:string,requestId:string){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,640))',[owner+':plan-workflow:'+requestId])}
 private async receiptLock(db:SqlClient,owner:string,family:'control'|'save',requestId:string){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,641))',[owner+':plan-workflow:'+family+':'+requestId])}
 private async value(db:SqlClient,sql:string,values:unknown[]):Promise<unknown>{const rows=(await db.query<{value:unknown}>(sql,values)).rows;if(rows.length!==1)return bad();return rows[0]!.value}
 private async receipt(db:SqlClient,requestId:string){const raw=await this.value(db,'SELECT agentstudio.agent_plan_workflow_receipt($1::uuid) AS value',[requestId]);if(raw===null)return null;const r=parseAgentPlanWorkflowReceipt(raw);if(r.request_id!==requestId)return bad();return r}
 private matches(r:AgentPlanWorkflowReceipt,v:AgentPlanWorkflowSubmission){
  if(r.request_id!==v.request_id||r.request_sha256!==hash(agentPlanWorkflowPaidIntentValue(v))||r.input_sha256!==v.expected_input_sha256||!same(r.source,v.source)||!same(r.generation_model,v.generation_model)||r.output_token_limit!==v.output_token_limit)return conflict()
 }
 async preview(identity:Identity,rawChoice:unknown){const choice=parseAgentPlanWorkflowChoice(rawChoice);return this.actor(identity,null,(db,owner)=>this.source.prepareOnClient(identity,db,owner,choice))}
 async confirm(identity:Identity,raw:unknown){const v=parseAgentPlanWorkflowSubmission(raw);return this.actor(identity,v.request_id,async db=>{const r=await this.receipt(db,v.request_id);if(!r)throw new HttpError(404,'agent_plan_workflow_receipt_not_found');this.matches(r,v);return {...r,replayed:true}})}
 async submit(identity:Identity,raw:unknown){const v=parseAgentPlanWorkflowSubmission(raw);return this.actor(identity,v.request_id,async(db,owner)=>{
  await this.lock(db,owner,v.request_id);const old=await this.receipt(db,v.request_id);if(old){this.matches(old,v);return {...old,replayed:true}}
  if(!this.submitting)throw new HttpError(403,'agent_plan_workflow_submission_disabled')
  const {action:_action,request_id:_id,expected_input_sha256:_input,confirm:_confirm,fee_acknowledgement:_fee,...fields}=v,p=await this.source.prepareOnClient(identity,db,owner,{...fields,action:'preview'})
  if(p.input_sha256!==v.expected_input_sha256)throw new HttpError(409,'agent_plan_workflow_input_changed')
  if(await this.value(db,'SELECT agentstudio.agent_plan_workflow_record($1::jsonb,$2::jsonb) AS value',[JSON.stringify(v),JSON.stringify(p)])!==v.request_id)return bad()
  const r=await this.receipt(db,v.request_id);if(!r)return bad();this.matches(r,v)
  if(r.content_sha256!==p.content_sha256||r.model_versions_sha256!==p.model_versions_sha256||r.owner_epoch!==p.owner_epoch||r.owner_governance_revision!==p.owner_governance_revision)return bad()
  return {...r,replayed:false}
 })}
 private async result(db:SqlClient,r:AgentPlanWorkflowReceipt){
  const raw=await this.value(db,'SELECT agentstudio.agent_plan_workflow_read_result($1::uuid) AS value',[r.request_id]);if(raw===null)return null
  const result=parseAgentPlanWorkflowResultData(raw),ref=result.value.reference
  if(result.request_id!==r.request_id||hash(result.value)!==result.result_sha256||ref.input_sha256!==r.input_sha256||!same(ref.source,r.source)||!same(ref.generation_model,r.generation_model))return bad()
  return result
 }
 private async current(identity:Identity,db:SqlClient,owner:string,r:AgentPlanWorkflowReceipt,mode:'share'|'update'='share'){
  const current=await this.source.currentOnClient(identity,db,owner,{purpose,spec_id:r.source.spec_id,generation_model:r.generation_model},mode)
  if(!same(current.source_values.source,r.source)||current.model_versions_sha256!==r.model_versions_sha256||current.owner.epoch!==r.owner_epoch||current.owner.governance_revision!==r.owner_governance_revision)throw new HttpError(409,'agent_plan_workflow_source_changed')
  return current
 }
 async view(identity:Identity,rawId:unknown){const requestId=id(rawId);return this.actor(identity,requestId,async(db,owner)=>{
  await this.lock(db,owner,requestId);const receipt=await this.receipt(db,requestId);if(!receipt)throw new HttpError(404,'agent_plan_workflow_receipt_not_found')
  const base={protocol:'agent_plan_workflow_view_v1',receipt,result:null},view=(result_status:string,result:unknown=null)=>parseAgentPlanWorkflowView({...base,result_status,result})
  if(receipt.body_erased)return view('erased')
  if(['queued','claimed','reserved'].includes(receipt.state))return view('pending')
  if(['paused','unknown'].includes(receipt.state))return view('unknown')
  if(receipt.state!=='succeeded')return view('unavailable')
  const result=await this.result(db,receipt);if(!result)return view('unavailable')
  try{await this.current(identity,db,owner,receipt)}catch(error){
   // Preserve the original paid artifact when actual resources become stale.
   // Missing auditor, malformed projection or SQL failure must remain errors.
   if(error instanceof HttpError&&[404,409].includes(error.status))return view('stale',result)
   throw error
  }
  return view('available',result)
 })}
 private async controlReceipt(db:SqlClient,requestId:string){const raw=await this.value(db,'SELECT agentstudio.agent_plan_workflow_control_receipt($1::uuid) AS value',[requestId]);if(raw===null)return null;const r=parseAgentPlanWorkflowControlReceipt(raw);if(r.request_id!==requestId)return bad();return r}
 async control(identity:Identity,raw:unknown,confirmOnly=false){const v=parseAgentPlanWorkflowControl(raw),request_sha256=hash({protocol:'agent_plan_workflow_control_intent_v1',purpose,intent:v,authority:false});return this.actor(identity,v.request_id,async(db,owner)=>{
  await this.receiptLock(db,owner,'control',v.request_id);const old=await this.controlReceipt(db,v.request_id)
  const matches=(r:NonNullable<typeof old>)=>{if(r.request_sha256!==request_sha256||r.generation_request_id!==v.generation_request_id||r.action!==v.action)return conflict()}
  if(old){matches(old);return {...old,replayed:true}}
  if(confirmOnly)throw new HttpError(404,'agent_plan_workflow_control_receipt_not_found')
  await this.lock(db,owner,v.generation_request_id)
  if(await this.value(db,'SELECT agentstudio.agent_plan_workflow_control($1::jsonb) AS value',[JSON.stringify(v)])!==v.request_id)return bad()
  const r=await this.controlReceipt(db,v.request_id);if(!r)return bad();matches(r);return {...r,replayed:false}
 })}
 private async savePreviewOnClient(identity:Identity,db:SqlClient,owner:string,raw:unknown,mode:'share'|'update'='share'):Promise<AgentPlanWorkflowSavePreview>{
  const v=parseAgentPlanWorkflowSavePreviewInput(raw);await this.lock(db,owner,v.generation_request_id);const r=await this.receipt(db,v.generation_request_id)
  if(!r||r.state!=='succeeded'||r.body_erased)throw new HttpError(409,'agent_plan_workflow_result_unavailable')
  const current=await this.current(identity,db,owner,r,mode),result=await this.result(db,r)
  if(!result||result.result_sha256!==v.expected_result_sha256)throw new HttpError(409,'agent_plan_workflow_result_changed')
  // Derivation only compares source/resource selections. Empty instruction is
  // local validation data; it does not reconstruct or replace the paid input.
  const selection={action:'preview',purpose,source:r.source,instruction:'',generation_model:r.generation_model,output_token_limit:r.output_token_limit},draft=deriveAgentPlanWorkflowDraft(selection,current.source_values,result.value.result,v.edits??undefined)
  await verifyWorkflowGraphResources(db,owner,draft.graph)
  const candidate={name:draft.name,graph:draft.graph},candidate_sha256=hash(draft.candidate_value),binding={generation_request_id:r.request_id,purpose,source:r.source,input_sha256:r.input_sha256,result_sha256:result.result_sha256,model_versions_sha256:r.model_versions_sha256,candidate_sha256}
  return parseAgentPlanWorkflowSavePreview({protocol:'agent_plan_workflow_save_preview_v1',...binding,candidate,preview_sha256:hash({protocol:'agent_plan_workflow_save_preview_binding_v1',...binding}),recorded:false})
 }
 async previewSave(identity:Identity,raw:unknown){return this.actor(identity,null,(db,owner)=>this.savePreviewOnClient(identity,db,owner,raw))}
 private async saveReceipt(db:SqlClient,requestId:string){const raw=await this.value(db,'SELECT agentstudio.agent_plan_workflow_save_receipt($1::uuid) AS value',[requestId]);if(raw===null)return null;const r=parseAgentPlanWorkflowSaveReceipt(raw);if(r.request_id!==requestId)return bad();return r}
 async save(identity:Identity,rawIntent:unknown,rawPreview:unknown,confirmOnly=false){const v=parseAgentPlanWorkflowSaveIntent(rawIntent),request_sha256=hash(agentPlanWorkflowSaveIntentValue(v));return this.actor(identity,v.request_id,async(db,owner)=>{
  await this.receiptLock(db,owner,'save',v.request_id);const old=await this.saveReceipt(db,v.request_id)
  const matches=(r:NonNullable<typeof old>)=>{if(r.request_sha256!==request_sha256||r.generation_request_id!==v.generation_request_id||!same(r.source,v.source)||r.result_sha256!==v.expected_result_sha256||r.preview_sha256!==v.expected_preview_sha256||r.candidate_sha256!==v.expected_candidate_sha256)return conflict()}
  if(old){matches(old);return {...old,replayed:true}}
  if(confirmOnly)throw new HttpError(404,'agent_plan_workflow_save_receipt_not_found')
  if(!this.saving)throw new HttpError(403,'agent_plan_workflow_save_disabled')
  await this.lock(db,owner,v.generation_request_id);const p=await this.savePreviewOnClient(identity,db,owner,rawPreview,'update')
  if(p.generation_request_id!==v.generation_request_id||!same(p.source,v.source)||p.result_sha256!==v.expected_result_sha256||p.preview_sha256!==v.expected_preview_sha256||p.candidate_sha256!==v.expected_candidate_sha256)return conflict()
  // DB064 must atomically insert Workflow+provenance+receipt+audit here. This
  // does not call WorkflowRepository.createIdempotent or open another client.
  if(await this.value(db,'SELECT agentstudio.agent_plan_workflow_save_record($1::jsonb,$2::jsonb) AS value',[JSON.stringify(v),JSON.stringify(p)])!==v.request_id)return bad()
  const r=await this.saveReceipt(db,v.request_id);if(!r)return bad();matches(r)
  const rows=(await db.query<{id:string;owner_user_id:string;name:string;graph:unknown;revision:unknown}>('SELECT id,owner_user_id,name,graph,revision FROM agentstudio.workflows WHERE id=$1::uuid AND owner_user_id=$2::uuid',[v.request_id,owner])).rows,w=rows[0]
  if(rows.length!==1||!w||w.id!==v.request_id||w.owner_user_id!==owner||Number(w.revision)!==1||w.name!==p.candidate.name||!same(w.graph,p.candidate.graph))return bad()
  return {...r,replayed:false}
 })}
 private async privateClient<T>(role:AgentPlanWorkflowDatabaseRole,requestId:string|null,body:(db:SqlClient)=>Promise<T>):Promise<T>{
  const pool=role==='agentstudio_plan_workflow_worker'?this.options.workerPool:this.options.dispatchPool
  if(!this.executing||!pool)throw new HttpError(403,'agent_plan_workflow_execution_disabled')
  return this.transaction(pool,requestId,async db=>{await assertAgentPlanWorkflowSession(db,role);await db.query(role==='agentstudio_plan_workflow_worker'?'SET LOCAL ROLE agentstudio_plan_workflow_worker':'SET LOCAL ROLE agentstudio_plan_workflow_dispatch');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'");await requireAgentPlanWorkflowAudit(db,this.options.audit);return body(db)})
 }
 private args(proof:AgentPlanWorkflowDispatchProof):unknown[]{return [proof.request_id,proof.lease_token,proof.lease_version,proof.worker_id]}
 private checkedContext(raw:unknown,proof:AgentPlanWorkflowDispatchProof){
  const context=parseAgentPlanWorkflowContext(raw),p=context.prepared,rebuilt=prepareAgentPlanWorkflowInput(p.choice,p.source_values),{action:_action,...choice}=p.choice
  const intent={...choice,action:'submit',request_id:proof.request_id,expected_input_sha256:p.input_sha256,confirm:true,fee_acknowledgement:agentPlanWorkflowFeeAcknowledgement}
  if(context.request_id!==proof.request_id||hash(rebuilt.input_value)!==p.input_sha256||hash(rebuilt.content_value)!==p.content_sha256||hash(agentPlanWorkflowPaidIntentValue(intent))!==context.request_sha256)return bad()
  return context
 }
 async claim(rawWorkerId:unknown){const workerId=id(rawWorkerId);return this.privateClient('agentstudio_plan_workflow_worker',null,async db=>{const raw=await this.value(db,'SELECT agentstudio.agent_plan_workflow_claim($1::uuid) AS value',[workerId]);if(raw===null)return null;const claim=parseAgentPlanWorkflowClaim(raw);if(claim.worker_id!==workerId)return bad();return claim})}
 async context(rawProof:unknown){const proof=parseAgentPlanWorkflowDispatchProof(rawProof);return this.privateClient('agentstudio_plan_workflow_dispatch',proof.request_id,async db=>this.checkedContext(await this.value(db,'SELECT agentstudio.agent_plan_workflow_context($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value',this.args(proof)),proof))}
 async reserve(rawProof:unknown){const proof=parseAgentPlanWorkflowDispatchProof(rawProof);return this.privateClient('agentstudio_plan_workflow_dispatch',proof.request_id,async db=>{
  const context=this.checkedContext(await this.value(db,'SELECT agentstudio.agent_plan_workflow_context($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value',this.args(proof)),proof)
  const r=parseAgentPlanWorkflowReservation(await this.value(db,'SELECT agentstudio.agent_plan_workflow_reserve($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value',this.args(proof))),p=context.prepared
  if(r.request_id!==proof.request_id||r.request_sha256!==context.request_sha256||r.input_sha256!==p.input_sha256||r.content_sha256!==p.content_sha256||r.source_sha256!==p.choice.source.source_sha256)return bad();return r
 })}
 async finish(rawProof:unknown,rawCompletion:unknown){const proof=parseAgentPlanWorkflowDispatchProof(rawProof),completion=normalizeAgentPlanWorkflowCompletion(rawCompletion);return this.privateClient('agentstudio_plan_workflow_dispatch',proof.request_id,async db=>{
  const r=parseAgentPlanWorkflowDispatchReply(await this.value(db,'SELECT agentstudio.agent_plan_workflow_finish($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::jsonb) AS value',[...this.args(proof),JSON.stringify(completion)]))
  // Audited SQL may conservatively record unknown after actual cancellation or
  // source drift. It must never promote failed/unknown into succeeded, and the
  // completion digest still binds this exact original bounded completion.
  if(r.request_id!==proof.request_id||r.state!==completion.status&&r.state!=='unknown'||r.completion_sha256!==hash({protocol:'agent_plan_workflow_completion_v1',purpose,request_id:proof.request_id,completion}))return bad();return r
 })}
 async pause(rawProof:unknown){const proof=parseAgentPlanWorkflowDispatchProof(rawProof);return this.privateClient('agentstudio_plan_workflow_worker',proof.request_id,async db=>{const r=parseAgentPlanWorkflowDispatchReply(await this.value(db,'SELECT agentstudio.agent_plan_workflow_pause($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value',this.args(proof)));if(r.request_id!==proof.request_id||!['paused','unknown'].includes(r.state)||r.completion_sha256!==null)return bad();return r})}
}
