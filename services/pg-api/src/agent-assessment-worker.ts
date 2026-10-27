// New isolated Worker. Never reads prompt, model credentials or result body.
import {isUuid,type SqlPool,type SqlClient} from "./contracts.ts"
import {verifyAgentAssessmentCredentials} from "./agent-assessment-audit.ts"
import {assertAgentAssessmentSession} from "./agent-assessment-role.ts"
import {agentAssessmentExecutionEnabled,parseAgentAssessmentClaim,parseAgentAssessmentReply,agentAssessmentProofFromClaim,type AgentAssessmentActivation,type AgentAssessmentProof,type AgentAssessmentReply} from "./agent-assessment-contract.ts"

export type AgentAssessmentWorkerTick=AgentAssessmentReply|{state:"disabled"|"idle"|"busy"}
export class AgentAssessmentWorker{
  readonly pool:SqlPool;readonly workerId:string;readonly enabled:boolean
  readonly dispatch:(proof:AgentAssessmentProof)=>Promise<AgentAssessmentReply>
  private running=false
  private readonly timeoutMs:number
  constructor(pool:SqlPool,workerId:string,dispatch:AgentAssessmentWorker["dispatch"],options:AgentAssessmentActivation&{dispatchTimeoutMs?:number}={}){
    if(!pool||!isUuid(workerId)||typeof dispatch!=="function")throw Error("agent_assessment_worker_dependencies_required")
    this.pool=pool;this.workerId=workerId.toLowerCase();this.dispatch=dispatch;this.enabled=agentAssessmentExecutionEnabled(options)
    this.timeoutMs=options.dispatchTimeoutMs??50000
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<1||this.timeoutMs>50000)throw Error("invalid_agent_assessment_timeout")
  }
  private async worker<T>(body:(db:SqlClient)=>Promise<T>):Promise<T>{
    const db=await this.pool.connect();let begun=false
    try{
      await db.query("BEGIN");begun=true
      await assertAgentAssessmentSession(db,"agentstudio_review_worker")
      await db.query("SET LOCAL ROLE agentstudio_review_worker")
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      if((await db.query<{role:string}>("SELECT current_user AS role")).rows[0]?.role!=="agentstudio_review_worker")throw Error("agent_assessment_worker_role_required")
      if(!await verifyAgentAssessmentCredentials(db))throw Error("agent_assessment_schema_required")
      const value=await body(db);await db.query("COMMIT");begun=false;return value
    }catch(error){if(begun)await db.query("ROLLBACK").catch(()=>undefined);throw error}finally{db.release()}
  }
  async tick():Promise<AgentAssessmentWorkerTick>{
    if(!this.enabled)return {state:"disabled"}
    if(this.running)return {state:"busy"}
    this.running=true
    try{
      // Commit claim before source verification/private RPC. Never hold a
      // worker lease/job lock while Broker waits on Native/run540 locks.
      const raw=(await this.worker(db=>db.query<{value:unknown}>("SELECT agentstudio.agent_assessment_claim($1::uuid) AS value",[this.workerId]))).rows[0]?.value
      if(raw===null)return {state:"idle"}
      const claim=parseAgentAssessmentClaim(raw)
      if(claim.worker_id!==this.workerId)throw Error("agent_assessment_claim_refused")
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
