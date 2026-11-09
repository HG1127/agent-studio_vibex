import {randomUUID} from "node:crypto"
import type {SqlPool} from "./contracts.ts"
import {withKnowledgeIndexRole} from "./knowledge-index-role.ts"
import {safeKnowledgeIndexClaim,safeKnowledgeIndexResult,type KnowledgeIndexClaim,type KnowledgeIndexResult} from "./knowledge-index-contracts.ts"
import {createWorkerClaimAdmission,type WorkerClaimAdmissionView,type WorkerClaimPermit} from "./worker-claim-admission.ts"
export class KnowledgeIndexWorker {
  readonly pool:SqlPool;readonly workerId:string
  private readonly dispatch:(claim:KnowledgeIndexClaim,signal?:AbortSignal)=>Promise<KnowledgeIndexResult>
  readonly #claimAdmission=createWorkerClaimAdmission({lanes:["knowledge_index"]})
  constructor(pool:SqlPool,dispatch:KnowledgeIndexWorker["dispatch"],options:{approvedForIsolatedUat:boolean}){
    if(options?.approvedForIsolatedUat!==true||pool.knowledgeIndexRuntime!==true||typeof dispatch!=="function")throw Error("knowledge_index_worker_disabled")
    this.pool=pool;this.dispatch=dispatch;this.workerId=randomUUID()
  }
  closeNewClaims():void {this.#claimAdmission.close()}
  // Local DB claim transactions only, not paid dispatch or global drain proof.
  claimAdmissionSnapshot():WorkerClaimAdmissionView {return this.#claimAdmission.snapshot()}
  async claim():Promise<KnowledgeIndexClaim|null>{
    const admission=this.#claimAdmission
    if(admission.snapshot().closed)return null
    let permit:WorkerClaimPermit|null=null,dispatched=false,commitAttempted=false
    return withKnowledgeIndexRole(this.pool,"worker",async db=>{
      // The role helper has completed every role/scope/budget await here.
      permit=admission.tryEnter("knowledge_index")
      if(!permit)return null
      const request=admission.dispatch(permit,()=>{
        dispatched=true
        return db.query<{value:unknown}>("SELECT agentstudio.knowledge_index_claim($1::uuid) AS value",[this.workerId])
      })
      if(!request.started){permit=null;return null}
      const value=(await request.value).rows[0]?.value
      return value===null?null:safeKnowledgeIndexClaim(value)
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
  async tick(signal?:AbortSignal):Promise<{status:"idle"|"uncertain"}|KnowledgeIndexResult>{
    if(signal?.aborted)return {status:"idle"}
    const claim=await this.claim();if(!claim)return {status:"idle"}
    if(signal?.aborted)return {status:"uncertain"}
    try{return safeKnowledgeIndexResult(await this.dispatch(claim,signal))}
    catch{return {status:"uncertain"}} // No resend. A prepared lease alone may be reclaimed after expiry.
  }
  async run(signal:AbortSignal,pollMs=1000):Promise<void>{
    if(!Number.isSafeInteger(pollMs)||pollMs<100||pollMs>30000)throw Error("invalid_knowledge_index_poll")
    const close=()=>this.closeNewClaims()
    signal.addEventListener("abort",close,{once:true})
    try{
      if(signal.aborted)close()
      while(!signal.aborted){
        let idle=true;try{idle=(await this.tick(signal)).status!=="indexed"}catch{ /* Retry only the DB claim, never the paid dispatch. */ }
        if(idle&&!signal.aborted)await new Promise<void>(resolve=>{
          const done=()=>{clearTimeout(timer);signal.removeEventListener("abort",done);resolve()},timer=setTimeout(done,pollMs)
          signal.addEventListener("abort",done,{once:true});if(signal.aborted)done()
        })
      }
    }finally{signal.removeEventListener("abort",close)}
  }
}
