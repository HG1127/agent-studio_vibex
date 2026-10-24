// Private only: no owner, content, model or endpoint may come from the Worker.
import {HttpError,type Identity,type SqlPool} from "./contracts.ts"
import {withKnowledgeIndexRole} from "./knowledge-index-role.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {safeKnowledgeIndexClaim,type KnowledgeIndexClaim,type KnowledgeIndexResult} from "./knowledge-index-contracts.ts"
import {safeEmbeddingBatch} from "./knowledge-embedding-vectors.ts"
export interface KnowledgeEmbeddingMaterial {base_url:string;model_name:string;api_key:string;input:string[];dimensions:number|null}
type Sealed={owner_id:string;identity:Identity;connection_id:string;connection_revision:number;model_name:string;base_url:string;dimensions:number|null;input:string[]}
type Secret={enabled:boolean;revision:number|string;provider:string;models:unknown;api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}
function unavailable():never{throw new HttpError(503,"knowledge_index_outcome_unavailable")}
export async function loadOwnEmbeddingApiKey(pool:SqlPool,key:Buffer,selected:{owner_id:string;identity:Identity;connection_id:string;connection_revision:number;model_name:string}):Promise<string>{
  return withModelBrokerActor(pool,selected.identity,async(db,owner)=>{
    if(owner!==selected.owner_id)unavailable()
    const row=(await db.query<Secret>("SELECT enabled,revision,provider,models,api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[selected.connection_id,owner])).rows[0]
    if(!row||!row.enabled||row.provider!=="openai"||Number(row.revision)!==selected.connection_revision||!Array.isArray(row.models)||!row.models.includes(selected.model_name))unavailable()
    return decryptModelSecret({ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)},key)
  })
}
export class KnowledgeIndexBroker {
  readonly pool:SqlPool;readonly secretPool:SqlPool;readonly key:Buffer
  readonly embed:(material:KnowledgeEmbeddingMaterial,signal:AbortSignal)=>Promise<number[][]>
  constructor(pool:SqlPool,secretPool:SqlPool,key:Buffer,embed:KnowledgeIndexBroker["embed"],options:{approvedForIsolatedUat:boolean}){
    if(options?.approvedForIsolatedUat!==true||pool.knowledgeIndexRuntime!==true||!secretPool||!Buffer.isBuffer(key)||key.length!==32||typeof embed!=="function")
      throw Error("knowledge_index_broker_disabled")
    this.pool=pool;this.secretPool=secretPool;this.key=key;this.embed=embed
  }
  private call<T>(name:"reserve"|"recheck"|"finish",claim:KnowledgeIndexClaim,vectors?:number[][]|null):Promise<T>{
    const args:unknown[]=[claim.attempt_id,claim.worker_id,claim.lease_token]
    if(name==="finish")args.push(vectors==null?null:JSON.stringify(vectors))
    return withKnowledgeIndexRole(this.pool,"broker",async db=>(await db.query<{value:T}>(
      "SELECT agentstudio.knowledge_index_"+name+"($1::uuid,$2::uuid,$3::text"+(name==="finish"?",$4::jsonb":"")+") AS value",args)).rows[0]!.value)
  }
  async dispatch(raw:unknown):Promise<KnowledgeIndexResult>{
    const claim=safeKnowledgeIndexClaim(raw),selected=await this.call<Sealed|null>("reserve",claim)
    if(!selected)unavailable()
    try{
      const apiKey=await loadOwnEmbeddingApiKey(this.secretPool,this.key,selected)
      if(await this.call<boolean>("recheck",claim)!==true)unavailable()
      const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
      let output:number[][]
      try{
        output=await Promise.race([this.embed({base_url:selected.base_url,model_name:selected.model_name,api_key:apiKey,input:selected.input,dimensions:selected.dimensions},controller.signal),
          new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("embedding_timeout"))},20000)})])
      }finally{if(timer)clearTimeout(timer)}
      const vectors=safeEmbeddingBatch(output,selected.input.length,selected.dimensions)
      const result=await this.call<KnowledgeIndexResult|null>("finish",claim,vectors)
      if(!result)unavailable()
      return result
    }catch{
      // Reservation is already durable. Failure, timeout and invalid/stale
      // responses retain the batch fence even if no response was received.
      await this.call("finish",claim,null).catch(()=>undefined)
      unavailable()
    }
  }
}
