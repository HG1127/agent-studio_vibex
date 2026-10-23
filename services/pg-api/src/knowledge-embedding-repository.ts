import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {approvedEmbeddingEndpoint,type EmbeddingEndpointPolicy} from "./knowledge-embedding-policy.ts"
import type {KnowledgeEmbeddingChange,KnowledgeEmbeddingReceipt,KnowledgeEmbeddingSettings,KnowledgeEmbeddingStatus} from "./knowledge-embedding-contracts.ts"
const identifier=(value:unknown)=>{if(!isUuid(value))throw new HttpError(400,"invalid_embedding_identifier");return value.toLowerCase()}
function safeChange(raw:unknown,policy:EmbeddingEndpointPolicy):KnowledgeEmbeddingChange{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_embedding_request")
  const body=raw as Record<string,unknown>,common=["action","request_id","expected_revision"]
  if(!Number.isSafeInteger(body.expected_revision)||(body.expected_revision as number)<0)throw new HttpError(400,"invalid_embedding_request")
  const shared={request_id:identifier(body.request_id),expected_revision:body.expected_revision as number}
  const allowed=body.action==="configure"?[...common,"connection_id","connection_revision","model_name","base_url"]:body.action==="rebuild"?[...common,"base_id"]:common
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw new HttpError(400,"unknown_request_field")
  if(body.action==="disable")return {...shared,action:"disable"}
  if(body.action==="rebuild")return {...shared,action:"rebuild",base_id:identifier(body.base_id)}
  if(body.action!=="configure"||typeof body.model_name!=="string"||!/^[A-Za-z0-9_.:/-]{2,128}$/.test(body.model_name)||
     !Number.isSafeInteger(body.connection_revision)||(body.connection_revision as number)<1)throw new HttpError(400,"invalid_embedding_request")
  return {...shared,action:"configure",connection_id:identifier(body.connection_id),connection_revision:body.connection_revision as number,
    model_name:body.model_name,base_url:approvedEmbeddingEndpoint(body.base_url,policy)}
}
export class KnowledgeEmbeddingRepository {
  readonly pool:SqlPool
  private readonly endpoints:EmbeddingEndpointPolicy
  constructor(pool:SqlPool,endpoints:EmbeddingEndpointPolicy){
    this.pool=pool;this.endpoints=Object.freeze({allowedHosts:Object.freeze([...endpoints.allowedHosts]),loopbackPorts:Object.freeze([...endpoints.loopbackPorts])})
  }
  private async call<T>(identity:Identity,sql:string,args:unknown[]=[]):Promise<T>{
    try{return await withActor(this.pool,identity,async db=>{
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      return (await db.query<{value:T}>(sql,args)).rows[0]!.value
    })}catch(error){
      const item=error as {code?:string;message?:string},status:Record<string,number>={P0400:400,P0403:403,P0404:404,P0409:409,P0429:429}
      if(item.code&&status[item.code])throw new HttpError(status[item.code]!,/^[a-z_]{3,80}$/.test(item.message??"")?item.message!:"knowledge_embedding_failed")
      throw error
    }
  }
  settings(identity:Identity){return this.call<KnowledgeEmbeddingSettings>(identity,"SELECT agentstudio.knowledge_embedding_settings() AS value")}
  status(identity:Identity,base:string){return this.call<KnowledgeEmbeddingStatus>(identity,"SELECT agentstudio.knowledge_embedding_status($1::uuid) AS value",[identifier(base)])}
  receipt(identity:Identity,request:string){return this.call<KnowledgeEmbeddingReceipt|null>(identity,"SELECT agentstudio.knowledge_embedding_receipt($1::uuid) AS value",[identifier(request)])}
  change(identity:Identity,raw:unknown){
    const input=safeChange(raw,this.endpoints)
    return this.call<{item:KnowledgeEmbeddingReceipt;replayed:boolean}>(identity,
      "SELECT agentstudio.knowledge_embedding_change($1::uuid,$2::bigint,$3::text,$4::uuid,$5::bigint,$6::text,$7::text,$8::uuid) AS value",
      [input.request_id,input.expected_revision,input.action,input.action==="configure"?input.connection_id:null,
        input.action==="configure"?input.connection_revision:null,input.action==="configure"?input.model_name:null,
        input.action==="configure"?input.base_url:null,input.action==="rebuild"?input.base_id:null])
  }
}
