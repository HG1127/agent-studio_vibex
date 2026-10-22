// Shared private Broker fence. Called only after a separate identity lookup
// and mTLS authentication; never mounted by the public Native HTTP server.
import {HttpError,type Identity,type SqlPool,type SqlClient} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,auditWorkflowV2,
  workflowV2RunColumns,workflowV2ExecutionRequest,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {inspectWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {safeWorkflowV2ModelRequest,type WorkflowV2ModelRequest} from "./workflow-v2-model-contract.ts"
export type WorkflowDispatchKind="model"|"tool"
const functions={model:"workflow_model_lease_identity",tool:"workflow_tool_lease_identity"} as const
function changed(kind:WorkflowDispatchKind):never{throw new HttpError(409,"workflow_"+kind+"_state_changed")}
export async function verifyWorkflowEffectLease(db:SqlClient,owner:string,request:WorkflowV2ModelRequest,kind:WorkflowDispatchKind,allowAgent=false){
  const c=request.claim
  const job=(await db.query<{payload:{workflow_id:string;workflow_revision:number;graph_sha256:string}}>(
    "SELECT payload FROM agentstudio.jobs WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid "+
    "AND kind='workflow_tick' AND payload->>'phase'='workflow_native_v2' AND status='leased' "+
    "AND lease_token=$4::uuid AND lease_version=$5::bigint AND lease_owner=$6::text "+
    "AND lease_until>clock_timestamp() FOR UPDATE",
    [c.job_id,c.run_id,owner,c.lease_token,c.lease_version,c.lease_owner])).rows[0]
  if(!job)changed(kind)
  const run=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
    "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='workflow' FOR UPDATE",[c.run_id,owner])).rows[0]
  if(!run||run.status!=="running")changed(kind)
  const state=checkedWorkflowV2StoredState(run.checkpoint,run.instruction)
  if(state.stage!=="workflow_v2_effect_started"||run.workflow_id!==job.payload.workflow_id||
     state.workflow_revision!==Number(job.payload.workflow_revision)||state.machine.graph_sha256!==job.payload.graph_sha256)changed(kind)
  await verifyWorkflowV2Snapshot(db,owner,run,state)
  const active=(await db.query<{status:string}>("SELECT status FROM agentstudio.users WHERE id=$1::uuid",[owner])).rows[0]
  if(active?.status!=="active")changed(kind)
  const pending=workflowV2ExecutionRequest(state)
  if(!pending||pending.kind!==kind||pending.step_key!==request.step_key||pending.input_sha256!==request.input_sha256||
     request.parent_step_key!==pending.agent_context?.parent_step_key||
     state.machine.effects.some(item=>item.step_key===pending.step_key))changed(kind)
  if(pending.agent_context){
    if(!allowAgent||!state.agent_dispatch)changed(kind)
    const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending!
    const approval=(await db.query<{status:string;reason_code:string}>("SELECT status,reason_code FROM agentstudio.approvals "+
      "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[c.run_id,owner,parent.step_key])).rows[0]
    if(approval?.status!=="approved"||approval.reason_code!=="wf2:"+parent.input_sha256)changed(kind)
  }
  const approval=(await db.query<{status:string;reason_code:string}>("SELECT status,reason_code FROM agentstudio.approvals "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[c.run_id,owner,request.step_key])).rows[0]
  const effect=(await db.query<{status:string;arguments_sha256:string;tool_name:string}>(
    "SELECT status,arguments_sha256,tool_name FROM agentstudio.external_effects "+
    "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[c.run_id,owner,request.step_key])).rows[0]
  if(approval?.status!=="approved"||approval.reason_code!=="wf2:"+request.input_sha256||
     effect?.status!=="started"||effect.arguments_sha256!==request.input_sha256||effect.tool_name!=="workflow:"+kind)changed(kind)
  return pending
}
export async function reserveWorkflowEffectDispatch(db:SqlClient,owner:string,r:WorkflowV2ModelRequest,kind:WorkflowDispatchKind){
  const reserved=await db.query("INSERT INTO agentstudio.external_effects "+
    "(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status) "+
    "VALUES($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,'started') ON CONFLICT DO NOTHING RETURNING step_key",
    [r.claim.run_id,owner,"wf2_"+kind+":"+r.step_key,"workflow."+kind+"_bound_dispatch",r.input_sha256,
      "workflow-"+kind+":"+r.claim.run_id+":"+r.step_key])
  if(reserved.rows.length!==1)throw new HttpError(409,"workflow_"+kind+"_already_dispatched")
}
export async function finishWorkflowEffectDispatch(pool:SqlPool,identity:Identity,r:WorkflowV2ModelRequest,kind:WorkflowDispatchKind,failed:boolean){
  try{await withActor(pool,identity,async(db,owner)=>{
    const result=await db.query("UPDATE agentstudio.external_effects SET status=$4::text,updated_at=clock_timestamp() "+
      "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='started' "+
      "AND arguments_sha256=$5::text RETURNING step_key",
      [r.claim.run_id,owner,"wf2_"+kind+":"+r.step_key,failed?"unknown":"succeeded",r.input_sha256])
    if(result.rows.length!==1)throw Error("workflow_effect_commit_unknown")
    await auditWorkflowV2(db,owner,r.claim.run_id,"workflow.v2_"+kind+"_dispatch",{step_key:r.step_key,
      input_sha256:r.input_sha256,outcome:failed?"unknown":"succeeded"})
  })}catch{throw new HttpError(503,"workflow_"+kind+"_outcome_unknown")}
}
export class WorkflowV2EffectLeaseIdentity{
  readonly pool:SqlPool;readonly kind:WorkflowDispatchKind
  constructor(pool:SqlPool,kind:WorkflowDispatchKind){
    if(!Object.hasOwn(functions,kind))throw Error("invalid_workflow_dispatch_kind")
    this.pool=pool;this.kind=kind
  }
  async resolve(raw:WorkflowV2ModelRequest):Promise<Identity>{
    const r=safeWorkflowV2ModelRequest(raw),c=r.claim,db=await this.pool.connect();let begun=false
    try{
      await db.query("BEGIN READ ONLY");begun=true;await db.query("SET LOCAL ROLE agentstudio_bound_dispatch")
      const functionName=r.parent_step_key?"workflow_agent_"+this.kind+"_lease_identity":functions[this.kind]
      const identity=(await db.query<Identity>("SELECT issuer,subject FROM agentstudio."+functionName+"("+
        "$1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::text"+(r.parent_step_key?",$8::text":"")+")",
        [c.run_id,c.job_id,c.lease_token,c.lease_version,c.lease_owner,r.step_key,r.input_sha256,...(r.parent_step_key?[r.parent_step_key]:[])])).rows
      if(identity.length!==1||typeof identity[0]?.issuer!=="string"||!identity[0].issuer||identity[0].issuer.length>2048||
         typeof identity[0]?.subject!=="string"||!identity[0].subject||identity[0].subject.length>512||
         /[\u0000-\u001f\u007f]/.test(identity[0].issuer+identity[0].subject))throw Error("invalid_identity")
      await db.query("COMMIT");begun=false;return {issuer:identity[0].issuer,subject:identity[0].subject}
    }catch{if(begun)await db.query("ROLLBACK").catch(()=>undefined);throw new HttpError(403,"workflow_"+this.kind+"_lease_denied")}
    finally{db.release()}
  }
}
