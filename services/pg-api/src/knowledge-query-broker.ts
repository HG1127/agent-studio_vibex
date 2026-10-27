import {HttpError,type Identity,type SqlPool} from "./contracts.ts"
import {withKnowledgeQueryRole} from "./knowledge-query-role.ts"
import {loadOwnEmbeddingApiKey,type KnowledgeEmbeddingMaterial} from "./knowledge-index-broker.ts"
import {safeKnowledgeIndexClaim,type KnowledgeIndexClaim} from "./knowledge-index-contracts.ts"
import {safeEmbeddingBatch} from "./knowledge-embedding-vectors.ts"
import {safeKnowledgeQueryDispatchResult,type KnowledgeQueryDispatchResult} from "./knowledge-query-contracts.ts"
type Sealed={owner_id:string;identity:Identity;connection_id:string;connection_revision:number;model_name:string;base_url:string;dimensions:number|null;input:string[]}
function unavailable():never{throw new HttpError(503,"knowledge_query_outcome_unavailable")}
export class KnowledgeQueryBroker {
  readonly pool:SqlPool;readonly secretPool:SqlPool;readonly key:Buffer
  readonly embed:(material:KnowledgeEmbeddingMaterial,signal:AbortSignal)=>Promise<number[][]>
  constructor(pool:SqlPool,secretPool:SqlPool,key:Buffer,embed:KnowledgeQueryBroker["embed"],options:{approvedForIsolatedUat:boolean}){
    if(options?.approvedForIsolatedUat!==true||pool.knowledgeQueryRuntime!==true||!secretPool||!Buffer.isBuffer(key)||key.length!==32||typeof embed!=="function")throw Error("knowledge_query_broker_disabled")
    this.pool=pool;this.secretPool=secretPool;this.key=key;this.embed=embed
  }
  private call<T>(name:"reserve"|"recheck"|"finish",claim:KnowledgeIndexClaim,vector?:number[]|null):Promise<T>{
    const args:unknown[]=[claim.attempt_id,claim.worker_id,claim.lease_token];if(name==="finish")args.push(vector==null?null:JSON.stringify(vector))
    return withKnowledgeQueryRole(this.pool,"broker",async db=>(await db.query<{value:T}>("SELECT agentstudio.knowledge_query_"+name+"($1::uuid,$2::uuid,$3::text"+(name==="finish"?",$4::jsonb":"")+") AS value",args)).rows[0]!.value)
  }
  async dispatch(raw:unknown):Promise<KnowledgeQueryDispatchResult>{
    const claim=safeKnowledgeIndexClaim(raw),selected=await this.call<Sealed|null>("reserve",claim)
    if(!selected)unavailable()
    try{
      const apiKey=await loadOwnEmbeddingApiKey(this.secretPool,this.key,selected)
      if(await this.call<boolean>("recheck",claim)!==true)unavailable()
      const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let output:number[][]
      try{output=await Promise.race([this.embed({base_url:selected.base_url,model_name:selected.model_name,input:selected.input,dimensions:selected.dimensions,api_key:apiKey},controller.signal),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("query_embedding_timeout"))},20000)})])}finally{if(timer)clearTimeout(timer)}
      const result=await this.call<KnowledgeQueryDispatchResult|null>("finish",claim,safeEmbeddingBatch(output,1,selected.dimensions)[0])
      if(!result)unavailable();return safeKnowledgeQueryDispatchResult(result)
    }catch{
      const fallback=await this.call<KnowledgeQueryDispatchResult|null>("finish",claim,null).catch(()=>null)
      if(fallback)return safeKnowledgeQueryDispatchResult(fallback);unavailable()
    }
  }
}
