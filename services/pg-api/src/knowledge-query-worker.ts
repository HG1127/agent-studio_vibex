import {randomUUID} from "node:crypto"
import type {SqlPool} from "./contracts.ts"
import {withKnowledgeQueryRole} from "./knowledge-query-role.ts"
import {safeKnowledgeIndexClaim,type KnowledgeIndexClaim} from "./knowledge-index-contracts.ts"
import {safeKnowledgeQueryDispatchResult,type KnowledgeQueryDispatchResult} from "./knowledge-query-contracts.ts"
import {createWorkerClaimAdmission,type WorkerClaimAdmissionView,type WorkerClaimPermit} from "./worker-claim-admission.ts"
export class KnowledgeQueryWorker {
  readonly pool:SqlPool;readonly workerId=randomUUID()
  private readonly dispatch:(claim:KnowledgeIndexClaim,signal?:AbortSignal)=>Promise<KnowledgeQueryDispatchResult>
  readonly #claimAdmission=createWorkerClaimAdmission({lanes:["knowledge_query"]})
  constructor(pool:SqlPool,dispatch:KnowledgeQueryWorker["dispatch"],options:{approvedForIsolatedUat:boolean}){
    if(options?.approvedForIsolatedUat!==true||pool.knowledgeQueryRuntime!==true||typeof dispatch!=="function")throw Error("knowledge_query_worker_disabled")
    this.pool=pool;this.dispatch=dispatch
  }
  closeNewClaims():void {this.#claimAdmission.close()}
  // Local DB claim transactions only, not paid dispatch or global drain proof.
  claimAdmissionSnapshot():WorkerClaimAdmissionView {return this.#claimAdmission.snapshot()}
  async claim():Promise<KnowledgeIndexClaim|null>{
    const admission=this.#claimAdmission
    if(admission.snapshot().closed)return null
    let permit:WorkerClaimPermit|null=null,dispatched=false,commitAttempted=false
    return withKnowledgeQueryRole(this.pool,"worker",async db=>{
      // The role helper has completed every role/scope/budget await here.
      permit=admission.tryEnter("knowledge_query")
      if(!permit)return null
      const request=admission.dispatch(permit,()=>{
        dispatched=true
        return db.query<{value:unknown}>("SELECT agentstudio.knowledge_query_claim($1::uuid) AS value",[this.workerId])
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
  async tick(signal?:AbortSignal):Promise<{status:"idle"|"uncertain"}|KnowledgeQueryDispatchResult>{
    if(signal?.aborted)return {status:"idle"};const claim=await this.claim();if(!claim)return {status:"idle"}
    if(signal?.aborted)return {status:"uncertain"}
    try{return safeKnowledgeQueryDispatchResult(await this.dispatch(claim,signal))}catch{return {status:"uncertain"}}
  }
}
