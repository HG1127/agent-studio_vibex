import {randomUUID} from "node:crypto"
import type {SqlPool} from "./contracts.ts"
import {withKnowledgeQueryRole} from "./knowledge-query-role.ts"
import {safeKnowledgeIndexClaim,type KnowledgeIndexClaim} from "./knowledge-index-contracts.ts"
import {safeKnowledgeQueryDispatchResult,type KnowledgeQueryDispatchResult} from "./knowledge-query-contracts.ts"
export class KnowledgeQueryWorker {
  readonly pool:SqlPool;readonly workerId=randomUUID()
  private readonly dispatch:(claim:KnowledgeIndexClaim,signal?:AbortSignal)=>Promise<KnowledgeQueryDispatchResult>
  constructor(pool:SqlPool,dispatch:KnowledgeQueryWorker["dispatch"],options:{approvedForIsolatedUat:boolean}){
    if(options?.approvedForIsolatedUat!==true||pool.knowledgeQueryRuntime!==true||typeof dispatch!=="function")throw Error("knowledge_query_worker_disabled")
    this.pool=pool;this.dispatch=dispatch
  }
  async claim():Promise<KnowledgeIndexClaim|null>{
    const value=await withKnowledgeQueryRole(this.pool,"worker",async db=>(await db.query<{value:unknown}>("SELECT agentstudio.knowledge_query_claim($1::uuid) AS value",[this.workerId])).rows[0]?.value)
    return value===null?null:safeKnowledgeIndexClaim(value)
  }
  async tick(signal?:AbortSignal):Promise<{status:"idle"|"uncertain"}|KnowledgeQueryDispatchResult>{
    if(signal?.aborted)return {status:"idle"};const claim=await this.claim();if(!claim)return {status:"idle"}
    if(signal?.aborted)return {status:"uncertain"}
    try{return safeKnowledgeQueryDispatchResult(await this.dispatch(claim,signal))}catch{return {status:"uncertain"}}
  }
}
