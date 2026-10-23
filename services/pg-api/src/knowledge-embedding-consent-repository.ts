import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT,type KnowledgeEmbeddingConsent,type KnowledgeEmbeddingConsentChange,type KnowledgeEmbeddingConsentReceipt} from "./knowledge-embedding-consent-contracts.ts"
const identifier=(value:unknown)=>{if(!isUuid(value))throw new HttpError(400,"invalid_embedding_consent_request");return value.toLowerCase()}
function safeChange(raw:unknown):KnowledgeEmbeddingConsentChange{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_embedding_consent_request")
  const body=raw as Record<string,unknown>,common=["action","request_id","expected_revision"]
  if(!Number.isSafeInteger(body.expected_revision)||(body.expected_revision as number)<0)throw new HttpError(400,"invalid_embedding_consent_request")
  const shared={request_id:identifier(body.request_id),expected_revision:body.expected_revision as number}
  const allowed=body.action==="grant"?[...common,"profile_id","profile_revision","index_enabled","query_enabled","acknowledgement"]:common
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw new HttpError(400,"unknown_request_field")
  if(body.action==="revoke")return {...shared,action:"revoke"}
  if(body.action!=="grant"||!Number.isSafeInteger(body.profile_revision)||(body.profile_revision as number)<1||
    typeof body.index_enabled!=="boolean"||typeof body.query_enabled!=="boolean"||!(body.index_enabled||body.query_enabled)||
    body.acknowledgement!==EMBEDDING_CHARGE_ACKNOWLEDGEMENT)throw new HttpError(400,"invalid_embedding_consent_request")
  return {...shared,action:"grant",profile_id:identifier(body.profile_id),profile_revision:body.profile_revision as number,
    index_enabled:body.index_enabled,query_enabled:body.query_enabled,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT}
}
export class KnowledgeEmbeddingConsentRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  private async call<T>(identity:Identity,sql:string,args:unknown[]=[]):Promise<T>{
    try{return await withActor(this.pool,identity,async db=>{
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      return (await db.query<{value:T}>(sql,args)).rows[0]!.value
    })}catch(error){
      const item=error as {code?:string;message?:string},status:Record<string,number>={P0400:400,P0403:403,P0404:404,P0409:409}
      if(item.code&&status[item.code])throw new HttpError(status[item.code]!,/^[a-z_]{3,80}$/.test(item.message??"")?item.message!:"knowledge_embedding_consent_failed")
      throw error
    }
  }
  get(identity:Identity){return this.call<KnowledgeEmbeddingConsent>(identity,"SELECT agentstudio.knowledge_embedding_consent() AS value")}
  receipt(identity:Identity,request:string){return this.call<KnowledgeEmbeddingConsentReceipt|null>(identity,"SELECT agentstudio.knowledge_embedding_consent_receipt($1::uuid) AS value",[identifier(request)])}
  change(identity:Identity,raw:unknown){
    const input=safeChange(raw)
    return this.call<{item:KnowledgeEmbeddingConsentReceipt;replayed:boolean}>(identity,
      "SELECT agentstudio.knowledge_embedding_consent_change($1::uuid,$2::bigint,$3::text,$4::uuid,$5::bigint,$6::boolean,$7::boolean,$8::text) AS value",
      [input.request_id,input.expected_revision,input.action,input.action==="grant"?input.profile_id:null,input.action==="grant"?input.profile_revision:null,
        input.action==="grant"?input.index_enabled:null,input.action==="grant"?input.query_enabled:null,input.action==="grant"?input.acknowledgement:null])
  }
}
