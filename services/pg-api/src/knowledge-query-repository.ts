import {HttpError,isUuid,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {safeKnowledgeQueryRequest,type KnowledgeQueryReceipt} from "./knowledge-query-contracts.ts"
import {knowledgeExecutionSource} from "./knowledge-execution-source.ts"
import {safeWorkflowV2ToolRequest,type WorkflowV2ToolRequest} from "./workflow-v2-tool-contract.ts"
import {verifyWorkflowEffectLease} from "./workflow-v2-dispatch-guard.ts"
import {prepareWorkflowTool} from "./workflow-v2-tool-plan.ts"
export class KnowledgeQueryRepository {
  readonly pool:SqlPool
  readonly executionSourceApproved:boolean;readonly allowAgent:boolean;readonly allowAutonomous:boolean
  constructor(pool:SqlPool,options:{executionSourceApproved?:boolean;allowAgentExecution?:boolean;allowAutonomousExecution?:boolean}={}){
    this.pool=pool;this.executionSourceApproved=options.executionSourceApproved===true
    this.allowAgent=options.allowAgentExecution===true;this.allowAutonomous=options.allowAutonomousExecution===true
  }
  private async call<T>(identity:Identity,sql:string,args:unknown[],verify?:(db:SqlClient,actor:string)=>Promise<void>):Promise<T>{
    try{return await withActor(this.pool,identity,async(db,actor)=>{
      await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
      if(verify)await verify(db,actor)
      return (await db.query<{value:T}>(sql,args)).rows[0]!.value
    })}catch(error){const x=error as {code?:string;message?:string},status:Record<string,number>={P0400:400,P0403:403,P0404:404,P0409:409,P0429:429}
      if(x.code&&status[x.code])throw new HttpError(status[x.code]!,/^[a-z_]{3,80}$/.test(x.message??"")?x.message!:"knowledge_query_failed");throw error}
  }
  submit(identity:Identity,raw:unknown){
    const x=safeKnowledgeQueryRequest(raw)
    return this.call<{item:KnowledgeQueryReceipt;replayed:boolean}>(identity,"SELECT agentstudio.knowledge_query_submit($1::uuid,$2::uuid[],$3::text,$4::text,$5::integer,$6::uuid,$7::bigint,$8::bigint,$9::text) AS value",
      [x.request_id,x.base_ids,x.query,x.mode,x.limit,x.profile_id??null,x.profile_revision??null,x.consent_revision??null,x.acknowledgement??null])
  }
  // Future approved Tool adapter only: callers must derive the query from the
  // verified pending effect, never from a separate employee/body field. SQL039
  // seals and rechecks the originating approval, snapshot and execution lease.
  submitExecution(identity:Identity,raw:unknown,source:WorkflowV2ToolRequest){
    if(!this.executionSourceApproved)throw new HttpError(503,"knowledge_execution_source_disabled")
    const x=safeKnowledgeQueryRequest(raw),verifiedSource=safeWorkflowV2ToolRequest(source),sealed=knowledgeExecutionSource(verifiedSource)
    return this.call<{item:KnowledgeQueryReceipt;replayed:boolean}>(identity,"SELECT agentstudio.knowledge_query_execution_submit($1::uuid,$2::uuid[],$3::text,$4::text,$5::integer,$6::uuid,$7::bigint,$8::bigint,$9::text,$10::jsonb) AS value",
      [x.request_id,x.base_ids,x.query,x.mode,x.limit,x.profile_id??null,x.profile_revision??null,x.consent_revision??null,x.acknowledgement??null,JSON.stringify(sealed)],async(db,actor)=>{
        const pending=await verifyWorkflowEffectLease(db,actor,verifiedSource,"tool",this.allowAgent,this.allowAutonomous),plan=prepareWorkflowTool(pending)
        if(plan.kind!=="knowledge_search"||plan.query!==x.query||x.limit>6||JSON.stringify([...plan.ids].map(id=>id.toLowerCase()).sort())!==JSON.stringify(x.base_ids))
          throw new HttpError(409,"knowledge_execution_request_changed")
      })
  }
  get(identity:Identity,request:string){if(!isUuid(request))throw new HttpError(400,"invalid_knowledge_query_identifier")
    return this.call<KnowledgeQueryReceipt|null>(identity,"SELECT agentstudio.knowledge_query_get($1::uuid) AS value",[request.toLowerCase()])}
}
