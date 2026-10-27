import {randomUUID} from "node:crypto"
import type {SqlPool} from "./contracts.ts"
import {withKnowledgeIndexRole} from "./knowledge-index-role.ts"
import {safeKnowledgeIndexClaim,safeKnowledgeIndexResult,type KnowledgeIndexClaim,type KnowledgeIndexResult} from "./knowledge-index-contracts.ts"
export class KnowledgeIndexWorker {
  readonly pool:SqlPool;readonly workerId:string
  private readonly dispatch:(claim:KnowledgeIndexClaim,signal?:AbortSignal)=>Promise<KnowledgeIndexResult>
  constructor(pool:SqlPool,dispatch:KnowledgeIndexWorker["dispatch"],options:{approvedForIsolatedUat:boolean}){
    if(options?.approvedForIsolatedUat!==true||pool.knowledgeIndexRuntime!==true||typeof dispatch!=="function")throw Error("knowledge_index_worker_disabled")
    this.pool=pool;this.dispatch=dispatch;this.workerId=randomUUID()
  }
  async claim():Promise<KnowledgeIndexClaim|null>{
    const value=await withKnowledgeIndexRole(this.pool,"worker",async db=>(await db.query<{value:unknown}>("SELECT agentstudio.knowledge_index_claim($1::uuid) AS value",[this.workerId])).rows[0]?.value)
    return value===null?null:safeKnowledgeIndexClaim(value)
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
    while(!signal.aborted){
      let idle=true;try{idle=(await this.tick(signal)).status!=="indexed"}catch{ /* Retry only the DB claim, never the paid dispatch. */ }
      if(idle&&!signal.aborted)await new Promise<void>(resolve=>{
        const done=()=>{clearTimeout(timer);signal.removeEventListener("abort",done);resolve()},timer=setTimeout(done,pollMs)
        signal.addEventListener("abort",done,{once:true});if(signal.aborted)done()
      })
    }
  }
}
