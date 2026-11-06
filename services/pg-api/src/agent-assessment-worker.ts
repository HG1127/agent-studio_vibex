// New isolated Worker. Never reads prompt, model credentials or result body.
import {isUuid,type SqlPool,type SqlClient} from "./contracts.ts"
import {verifyAgentAssessmentCredentials} from "./agent-assessment-audit.ts"
import {assertAgentAssessmentSession} from "./agent-assessment-role.ts"
import {agentAssessmentExecutionEnabled,parseAgentAssessmentClaim,parseAgentAssessmentReply,agentAssessmentProofFromClaim,type AgentAssessmentActivation,type AgentAssessmentProof,type AgentAssessmentReply} from "./agent-assessment-contract.ts"

import {createWorkerClaimAdmission,type WorkerClaimAdmissionView,type WorkerClaimPermit} from "./worker-claim-admission.ts"
import type {AgentAssessmentClaim} from "./agent-assessment-contract.ts"
type AssessmentClaimTransactionEvent="before_commit"|"commit_confirmed"|"failure"|"rollback_confirmed"

export type AgentAssessmentWorkerTick=AgentAssessmentReply|{state:"disabled"|"idle"|"busy"}
export class AgentAssessmentWorker{
  readonly pool:SqlPool;readonly workerId:string;readonly enabled:boolean
  readonly dispatch:(proof:AgentAssessmentProof)=>Promise<AgentAssessmentReply>
  private running=false
  private readonly timeoutMs:number
  readonly #claimAdmission=createWorkerClaimAdmission({lanes:["assessment"]})
  constructor(pool:SqlPool,workerId:string,dispatch:AgentAssessmentWorker["dispatch"],options:AgentAssessmentActivation&{dispatchTimeoutMs?:number}={}){
    if(!pool||!isUuid(workerId)||typeof dispatch!=="function")throw Error("agent_assessment_worker_dependencies_required")
    this.pool=pool;this.workerId=workerId.toLowerCase();this.dispatch=dispatch;this.enabled=agentAssessmentExecutionEnabled(options)
    this.timeoutMs=options.dispatchTimeoutMs??50000
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>50000)throw Error("invalid_agent_assessment_timeout")
  }
  closeNewClaims():void {this.#claimAdmission.close()}
  // Claim transaction evidence only; source proofs, dispatch and pause are
  // owned-work paths and do not establish a database claim outcome.
  claimAdmissionSnapshot():WorkerClaimAdmissionView {return this.#claimAdmission.snapshot()}
  private async worker<T>(body:(db:SqlClient)=>Promise<T>,observe?:(event:AssessmentClaimTransactionEvent)=>void):Promise<T>{
    const db=await this.pool.connect();let begun=false
    try{
      await db.query("BEGIN");begun=true
      await assertAgentAssessmentSession(db,"agentstudio_review_worker")
      await db.query("SET LOCAL ROLE agentstudio_review_worker")
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      if((await db.query<{role:string}>("SELECT current_user AS role")).rows[0]?.role!=="agentstudio_review_worker")throw Error("agent_assessment_worker_role_required")
      if(!await verifyAgentAssessmentCredentials(db))throw Error("agent_assessment_schema_required")
      const value=await body(db);observe?.("before_commit");await db.query("COMMIT");begun=false;observe?.("commit_confirmed");return value
    }catch(error){
      try{observe?.("failure")}finally{
        if(begun)try{await db.query("ROLLBACK");observe?.("rollback_confirmed")}catch{}
      }
      throw error
    }finally{db.release()}
  }
  private async claim():Promise<AgentAssessmentClaim|null>{
    const admission=this.#claimAdmission
    if(!this.enabled||admission.snapshot().closed)return null
    let permit:WorkerClaimPermit|null=null,dispatched=false,commitAttempted=false
    return this.worker(async db=>{
      // Session/full credential audit, role and timeout awaits precede this gate.
      permit=admission.tryEnter("assessment")
      if(!permit)return null
      const request=admission.dispatch(permit,()=>{
        dispatched=true
        return db.query<{value:unknown}>("SELECT agentstudio.agent_assessment_claim($1::uuid) AS value",[this.workerId])
      })
      if(!request.started){permit=null;return null}
      const raw=(await request.value).rows[0]?.value
      if(raw===null)return null
      const claim=parseAgentAssessmentClaim(raw)
      if(claim.worker_id!==this.workerId)throw Error("agent_assessment_claim_refused")
      return claim
    },event=>{
      if(event==="before_commit")commitAttempted=true
      if(!permit)return
      if(event==="failure"&&dispatched)admission.markUncertain(permit)
      if(event==="commit_confirmed"){admission.confirm(permit,{outcome:"commit_confirmed"});permit=null}
      if(event==="rollback_confirmed"){
        if(!dispatched){admission.discardUndispatched(permit);permit=null}
        else if(!commitAttempted){admission.confirm(permit,{outcome:"rollback_confirmed"});permit=null}
      }
    })
  }
  async tick():Promise<AgentAssessmentWorkerTick>{
    if(!this.enabled)return {state:"disabled"}
    if(this.running)return {state:"busy"}
    this.running=true
    try{
      // Commit claim before source verification/private RPC. Never hold a
      // worker lease/job lock while Broker waits on Native/run540 locks.
      const claim=await this.claim()
      if(!claim)return {state:"idle"}
      const proof=agentAssessmentProofFromClaim(claim)
      try{
        if(Date.parse(claim.lease_expires_at)<=Date.now())throw Error("agent_assessment_claim_expired")
        let timer:ReturnType<typeof setTimeout>|undefined
        try{
          const result=parseAgentAssessmentReply(await Promise.race([this.dispatch(proof),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("agent_assessment_transport_unknown")),this.timeoutMs)})]))
          if(result.request_id!==proof.request_id)throw Error("agent_assessment_reply_mismatch")
          return result
        }finally{if(timer)clearTimeout(timer)}
      }catch{
        // Pause is not a provider outcome or a no-charge/refund assertion.
        // It never reopens a reservation and this tick never resends.
        try{const paused=(await this.worker(db=>db.query<{value:unknown}>("SELECT agentstudio.agent_assessment_pause($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value",[proof.request_id,proof.lease_token,proof.lease_version,proof.worker_id]))).rows[0]?.value;const result=parseAgentAssessmentReply(paused);if(result.request_id!==proof.request_id)throw Error();return result}
        catch{return {request_id:proof.request_id,state:"unknown"}}
      }
    }finally{this.running=false}
  }
}
