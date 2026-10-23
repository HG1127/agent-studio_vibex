import {HttpError,isUuid,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {safeKnowledgeQueryRequest,type KnowledgeQueryReceipt} from "./knowledge-query-contracts.ts"
export class KnowledgeQueryRepository {
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  private async call<T>(identity:Identity,sql:string,args:unknown[]):Promise<T>{
    try{return await withActor(this.pool,identity,async db=>{
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      return (await db.query<{value:T}>(sql,args)).rows[0]!.value
    })}catch(error){const x=error as {code?:string;message?:string},status:Record<string,number>={P0400:400,P0403:403,P0404:404,P0409:409,P0429:429}
      if(x.code&&status[x.code])throw new HttpError(status[x.code]!,/^[a-z_]{3,80}$/.test(x.message??"")?x.message!:"knowledge_query_failed");throw error}
  }
  submit(identity:Identity,raw:unknown){
    const x=safeKnowledgeQueryRequest(raw)
    return this.call<{item:KnowledgeQueryReceipt;replayed:boolean}>(identity,"SELECT agentstudio.knowledge_query_submit($1::uuid,$2::uuid[],$3::text,$4::text,$5::integer,$6::uuid,$7::bigint,$8::bigint,$9::text) AS value",
      [x.request_id,x.base_ids,x.query,x.mode,x.limit,x.profile_id??null,x.profile_revision??null,x.consent_revision??null,x.acknowledgement??null])
  }
  get(identity:Identity,request:string){if(!isUuid(request))throw new HttpError(400,"invalid_knowledge_query_identifier")
    return this.call<KnowledgeQueryReceipt|null>(identity,"SELECT agentstudio.knowledge_query_get($1::uuid) AS value",[request.toLowerCase()])}
}
