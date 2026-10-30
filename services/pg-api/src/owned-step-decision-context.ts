// Server-only reuse boundary. An optional request id is never a choice of
// owner/actor: the original transaction's SQL066 context must prove it.
import {HttpError,isUuid,type SqlClient} from './contracts.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
export async function ownedStepDecisionActor(db:SqlClient,owner:string,runId:string,stepKey:string,inputSha:string|null,requestId?:string):Promise<string>{
 if(requestId===undefined)return owner
 await assertOwnedAdmissionContext(db,owner)
 if(!isUuid(requestId))throw new HttpError(403,'approval_delegation_context_required')
 const rows=(await db.query<{reviewer:string}>('SELECT agentstudio.agent_approval_delegation_owner_actor($1::uuid,$2::uuid,$3::text,$4::text) AS reviewer',[requestId,runId,stepKey,inputSha])).rows
 const reviewer=rows.length===1?rows[0]?.reviewer:undefined
 if(!isUuid(reviewer)||reviewer===owner)throw new HttpError(403,'approval_delegation_context_required')
 return reviewer
}
export async function auditDelegatedOwnedStep(db:SqlClient,owner:string,runId:string,requestId:string,stepKey:string,inputSha:string,decision:'approved'|'rejected'){
 const reviewer=await ownedStepDecisionActor(db,owner,runId,stepKey,inputSha,requestId)
 await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) VALUES($1::uuid,$2::uuid,$3::uuid,'agent.v2_decision','agent_run',$3::text,'succeeded',$4::jsonb)",[owner,reviewer,runId,JSON.stringify({step_key:stepKey,input_sha256:inputSha,decision,delegated:true,delegation_request_id:requestId})])
}
