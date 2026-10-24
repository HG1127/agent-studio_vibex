import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {safeKnowledgeIndexAuthorization,type KnowledgeIndexAuthorizationReceipt,type KnowledgeIndexStatus} from "./knowledge-index-contracts.ts"
const identifier=(raw:unknown)=>{if(!isUuid(raw))throw new HttpError(400,"invalid_knowledge_index_identifier");return raw.toLowerCase()}
export class KnowledgeIndexRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  private async call<T>(identity:Identity,sql:string,args:unknown[]=[]):Promise<T>{
    try{return await withActor(this.pool,identity,async db=>{
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      return (await db.query<{value:T}>(sql,args)).rows[0]!.value
    })}catch(error){
      const x=error as {code?:string;message?:string},status:Record<string,number>={P0400:400,P0403:403,P0404:404,P0409:409}
      if(x.code&&status[x.code])throw new HttpError(status[x.code]!,/^[a-z_]{3,80}$/.test(x.message??"")?x.message!:"knowledge_index_failed")
      throw error
    }
  }
  authorize(identity:Identity,raw:unknown){
    const x=safeKnowledgeIndexAuthorization(raw)
    return this.call<{item:KnowledgeIndexAuthorizationReceipt;replayed:boolean}>(identity,
      "SELECT agentstudio.knowledge_index_authorize($1::uuid,$2::bigint,$3::uuid,$4::bigint,$5::text) AS value",
      [x.request_id,x.expected_consent_revision,x.profile_id,x.profile_revision,x.acknowledgement])
  }
  receipt(identity:Identity,request:string){return this.call<KnowledgeIndexAuthorizationReceipt|null>(identity,"SELECT agentstudio.knowledge_index_authorization_receipt($1::uuid) AS value",[identifier(request)])}
  status(identity:Identity,base:string){return this.call<KnowledgeIndexStatus>(identity,"SELECT agentstudio.knowledge_index_status($1::uuid) AS value",[identifier(base)])}
}
