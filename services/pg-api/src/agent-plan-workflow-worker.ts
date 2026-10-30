// Dedicated F05 single-tick dispatch. No entry/supervisor/heartbeat/telemetry
// slot is added or reused. Import starts no loop, timer, process or listener.
import type {SqlClient,SqlPool} from './contracts.ts'
import {createWorkerClaimAdmission,type WorkerClaimPermit} from './worker-claim-admission.ts'
import {agentPlanWorkflowId as id,agentPlanWorkflowPurpose as purpose} from './agent-plan-workflow-contract.ts'
import {parseAgentPlanWorkflowClaim,parseAgentPlanWorkflowDispatchReply,type AgentPlanWorkflowDispatchProof} from './agent-plan-workflow-rpc-contract.ts'
import {agentPlanWorkflowExecutionEnabled,assertAgentPlanWorkflowSession,requireAgentPlanWorkflowAudit,type AgentPlanWorkflowAuditVerifier} from './agent-plan-workflow-runtime-policy.ts'
type Reply=ReturnType<typeof parseAgentPlanWorkflowDispatchReply>
type Options={executionEnabled?:boolean;executionApproval?:string;audit?:AgentPlanWorkflowAuditVerifier;dispatchTimeoutMs?:number}
type Event='before_commit'|'commit_confirmed'|'failure'|'rollback_confirmed'
type Slot={request_id:string;uncertain:boolean;native_settled:boolean;work:Promise<Reply>|null}
export class AgentPlanWorkflowWorker{
 readonly enabled:boolean;readonly workerId:string
 readonly pool:SqlPool
 private readonly dispatch:(proof:AgentPlanWorkflowDispatchProof)=>Promise<Reply>
 private readonly options:Options
 readonly #admission=createWorkerClaimAdmission({lanes:['plan_workflow']})
 #running=false;#slot:Slot|null=null
 private readonly timeoutMs:number
 constructor(pool:SqlPool,workerId:string,dispatch:(proof:AgentPlanWorkflowDispatchProof)=>Promise<Reply>,options:Options={}){
  this.pool=pool;this.dispatch=dispatch;this.options=Object.freeze({...options})
  this.workerId=id(workerId);this.enabled=agentPlanWorkflowExecutionEnabled(options);this.timeoutMs=options.dispatchTimeoutMs??50000
  if(!pool||typeof dispatch!=='function'||this.enabled&&typeof options.audit!=='function'||!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>50000)throw Error('agent_plan_workflow_worker_dependencies_required')
 }
 closeNewClaims(){this.#admission.close()}
 /** Local observations only. Closed/zero is not proof of actual system drain. */
 drainSnapshot(){return Object.freeze({claims:this.#admission.snapshot(),dispatch:Object.freeze({pending:this.#slot!==null,uncertain:this.#slot?.uncertain??false,native_settled:this.#slot?.native_settled??false}),authority:false as const})}
 private unknown(requestId:string):Reply{return parseAgentPlanWorkflowDispatchReply({protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:requestId,state:'unknown',result_sha256:null,completion_sha256:null})}
 private uncertain(slot:Slot){slot.uncertain=true;this.#admission.close()}
 private async transaction<T>(body:(db:SqlClient)=>Promise<T>,observe?:(event:Event)=>void):Promise<T>{
  const db=await this.pool.connect();let begun=false
  try{await db.query('BEGIN');begun=true;await assertAgentPlanWorkflowSession(db,'agentstudio_plan_workflow_worker');await db.query('SET LOCAL ROLE agentstudio_plan_workflow_worker');await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='8s'");await requireAgentPlanWorkflowAudit(db,this.options.audit)
   const result=await body(db);observe?.('before_commit');await db.query('COMMIT');begun=false;observe?.('commit_confirmed');return result
  }catch(error){observe?.('failure');if(begun)try{await db.query('ROLLBACK');observe?.('rollback_confirmed')}catch{}throw error}finally{db.release()}
 }
 private async claim(){
  if(!this.enabled||this.#admission.snapshot().closed)return null
  let permit:WorkerClaimPermit|null=null,sent=false,commitAttempted=false
  return this.transaction(async db=>{
   // Final claim-admission check after every pool/session/audit await. No await
   // separates dispatch admission from the actual original-client SQL send.
   permit=this.#admission.tryEnter('plan_workflow');if(!permit)return null
   const request=this.#admission.dispatch(permit,()=>{sent=true;return db.query<{value:unknown}>('SELECT agentstudio.agent_plan_workflow_claim($1::uuid) AS value',[this.workerId])})
   if(!request.started){permit=null;return null}
   const rows=(await request.value).rows;if(rows.length!==1)throw Error('agent_plan_workflow_claim_projection_unavailable');const raw=rows[0]!.value;if(raw===null)return null
   const value=parseAgentPlanWorkflowClaim(raw);if(value.worker_id!==this.workerId)throw Error('agent_plan_workflow_claim_mismatch');return value
  },event=>{
   if(event==='before_commit')commitAttempted=true
   if(!permit)return
   if(event==='failure'&&sent){this.#admission.markUncertain(permit);this.#admission.close()}
   if(event==='commit_confirmed'){this.#admission.confirm(permit,{outcome:'commit_confirmed'});permit=null}
   if(event==='rollback_confirmed'){if(!sent){this.#admission.discardUndispatched(permit);permit=null}else if(!commitAttempted){this.#admission.confirm(permit,{outcome:'rollback_confirmed'});permit=null}}
  })
 }
 private async pause(proof:AgentPlanWorkflowDispatchProof):Promise<Reply>{
  return this.transaction(async db=>{const rows=(await db.query<{value:unknown}>('SELECT agentstudio.agent_plan_workflow_pause($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value',[proof.request_id,proof.lease_token,proof.lease_version,proof.worker_id])).rows;if(rows.length!==1)throw Error('agent_plan_workflow_pause_projection_unavailable');const r=parseAgentPlanWorkflowDispatchReply(rows[0]!.value);if(r.request_id!==proof.request_id||!['paused','unknown'].includes(r.state)||r.completion_sha256!==null)throw Error('agent_plan_workflow_pause_mismatch');return r})
 }
 async tick():Promise<Reply|{state:'disabled'|'closed'|'idle'|'busy'}>{
  if(!this.enabled)return {state:'disabled'}
  if(this.#running||this.#slot)return {state:'busy'}
  if(this.#admission.snapshot().closed)return {state:'closed'}
  this.#running=true
  try{
   const claim=await this.claim();if(!claim)return {state:this.#admission.snapshot().closed?'closed':'idle'}
   const {lease_expires_at,...proof}=claim,slot:Slot={request_id:proof.request_id,uncertain:false,native_settled:false,work:null};this.#slot=slot
   if(this.#admission.snapshot().closed||Date.parse(lease_expires_at)<=Date.now()){
    try{const reply=await this.pause(proof);if(reply.state==='paused')this.#slot=null;else this.uncertain(slot);return reply}catch{this.uncertain(slot);return this.unknown(proof.request_id)}
   }
   let timer:ReturnType<typeof setTimeout>|undefined
   try{
    // Retain the actual native promise even when our caller times out. A local
    // timeout/EOF/abort or a late finally callback never releases an unknown slot.
    const native=Promise.resolve(this.dispatch(proof));slot.work=native;void native.then(()=>{slot.native_settled=true},()=>{slot.native_settled=true})
    const reply=parseAgentPlanWorkflowDispatchReply(await Promise.race([native,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('agent_plan_workflow_dispatch_unknown')),this.timeoutMs)})]))
    if(reply.request_id!==proof.request_id)throw Error('agent_plan_workflow_reply_mismatch')
    if(reply.state==='unknown')this.uncertain(slot);else this.#slot=null
    return reply
   }catch{
    this.uncertain(slot)
    // One metadata pause only. It cannot clear the durable effect or authorize
    // another dispatch/POST; even a known pause ACK does not settle native I/O.
    try{return await this.pause(proof)}catch{return this.unknown(proof.request_id)}
   }finally{if(timer)clearTimeout(timer)}
  }finally{this.#running=false}
 }
}
