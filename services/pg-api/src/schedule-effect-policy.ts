import {HttpError,type SqlClient} from "./contracts.ts"
import {prepareWorkflowTool} from "./workflow-v2-tool-plan.ts"
import type {WorkflowEffectRequest} from "./workflow-v2-machine.ts"
// Trusted interpreter classification. MCP and every HTTP write still require
// a fresh step decision. Owner standing consent covers bounded model/read work.
export async function scheduleAutomaticEffect(db:SqlClient,owner:string,run:string,request:WorkflowEffectRequest):Promise<boolean>{
  if(!await scheduleOwnedRunCandidate(db,run))return false
  let paid=false
  if(request.kind==="tool"){
    let plan:ReturnType<typeof prepareWorkflowTool>
    try{plan=prepareWorkflowTool(request)}catch{return false}
    if(plan.kind==="mcp")return false
    if(plan.kind==="http"){
      const connection=(await db.query<{method:string;revision:number|string;enabled:boolean;status:string}>(
        "SELECT method,revision,enabled,status FROM agentstudio.tool_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",
        [plan.binding.connection_id,owner])).rows[0]
      if(!connection||connection.method!=="GET"||!connection.enabled||Number(connection.revision)!==plan.binding.connection_revision)return false
    }
    paid=plan.kind==="knowledge_search"&&Boolean(plan.retrieval)
  }
  await db.query("SET LOCAL ROLE agentstudio_worker")
  const granted=(await db.query<{ok:boolean}>("SELECT agentstudio.schedule_effect_authorize($1::uuid,$2::text,$3::text,$4::text,$5::boolean) AS ok",
    [run,request.step_key,request.input_sha256,request.kind,paid])).rows[0]?.ok===true
  await db.query("SET LOCAL ROLE agentstudio_api")
  await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])
  if(!granted)return false
  await db.query("INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,requested_by,reason_code,status,decided_by,decided_at,knowledge_query_charge_acknowledged) "+
    "VALUES($1::uuid,$2::uuid,$3::text,$1::uuid,$4::text,'approved',$1::uuid,clock_timestamp(),$5::boolean)",
    [owner,run,request.step_key,"wf2:"+request.input_sha256,paid])
  await db.query("INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) "+
    "VALUES($1::uuid,$1::uuid,$2::uuid,'schedule.standing_approval','run',$2::text,'succeeded',$3::jsonb)",
    [owner,run,JSON.stringify({step_key:request.step_key,input_sha256:request.input_sha256,kind:request.kind,knowledge_charge:paid,authority:"schedule_owner_standing_consent"})])
  return true
}
export async function scheduleOwnedRunCandidate(db:SqlClient,run:string):Promise<boolean>{
  const installed=(await db.query<{installed:boolean}>("SELECT to_regprocedure('agentstudio.schedule_automatic_candidate(uuid)') IS NOT NULL AS installed")).rows[0]?.installed
  return installed===true&&(await db.query<{ok:boolean}>("SELECT agentstudio.schedule_automatic_candidate($1::uuid) AS ok",[run])).rows[0]?.ok===true
}
export async function verifyScheduleRunSource(db:SqlClient,run:string):Promise<void>{
  const installed=(await db.query<{installed:boolean}>("SELECT to_regprocedure('agentstudio.schedule_validate_run(uuid)') IS NOT NULL AS installed")).rows[0]?.installed
  if(installed&&(await db.query<{ok:boolean}>("SELECT agentstudio.schedule_validate_run($1::uuid) AS ok",[run])).rows[0]?.ok!==true)
    throw new HttpError(409,"schedule_source_unavailable")
}
