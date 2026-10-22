import {HttpError,isUuid,safeWorkflowGraph,type Identity,type SqlClient,type SqlPool,type WorkflowGraph} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {verifyWorkflowGraphResources} from "./workflow-repository.ts"
import {createWorkflowV2Checkpoint,inspectWorkflowV2Checkpoint,recordWorkflowV2EffectResult,
  type WorkflowV2Checkpoint,type WorkflowEffectRequest} from "./workflow-v2-machine.ts"
import {safeRunStepMetadata} from "./run-step-metadata.ts"
import {inspectWorkflowAgentState,recordWorkflowAgentResult,type WorkflowAgentState} from "./workflow-v2-agent-machine.ts"
import {verifyWorkflowAgentResources} from "./workflow-v2-agent-resources.ts"
export type WorkflowV2StoredState={
  stage:string;execution_mode:"workflow_native_v2";workflow_revision:number
  graph:WorkflowGraph;machine:WorkflowV2Checkpoint
  agent_state?:WorkflowAgentState
  agent_dispatch?:{step_key:string;input_sha256:string;kind:"model"|"tool";parent_step_key:string}
}
export type WorkflowV2RunRow={id:string;owner_user_id:string;workflow_id:string;kind:"workflow";status:string;
  instruction:string;result_text:string;checkpoint:WorkflowV2StoredState;step_count:number;
  last_error_code:string;created_at:string;updated_at:string;finished_at:string|null}
export const workflowV2RunColumns="id,owner_user_id,workflow_id,kind,status,instruction,result_text,checkpoint,step_count,last_error_code,created_at,updated_at,finished_at"
function invalid():never{throw new HttpError(400,"invalid_workflow_v2_request")}
export function safeWorkflowV2Request(raw:unknown){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const item=raw as Record<string,unknown>
  if(Object.keys(item).length!==3||!["expected_revision","idempotency_key","instruction"].every(k=>Object.hasOwn(item,k))||
     !Number.isSafeInteger(item.expected_revision)||(item.expected_revision as number)<1||
     typeof item.idempotency_key!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(item.idempotency_key)||
     typeof item.instruction!=="string"||!item.instruction.trim()||item.instruction.length>1200||item.instruction.includes("\0"))invalid()
  return {expected_revision:item.expected_revision as number,idempotency_key:item.idempotency_key,instruction:item.instruction}
}
export function checkedWorkflowV2StoredState(raw:unknown,instruction:string):WorkflowV2StoredState{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(409,"invalid_workflow_v2_state")
  const value=raw as WorkflowV2StoredState
  const required=["stage","execution_mode","workflow_revision","graph","machine"]
  if(required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,"agent_state","agent_dispatch"].includes(key))||
     typeof value.stage!=="string"||!/^workflow_v2_[a-z_]{1,60}$/.test(value.stage)||
     value.execution_mode!=="workflow_native_v2"||!Number.isSafeInteger(value.workflow_revision)||value.workflow_revision<1||
     !value.machine||value.machine.instruction!==instruction)throw new HttpError(409,"invalid_workflow_v2_state")
  const graph=safeWorkflowGraph(value.graph)
  const parent=inspectWorkflowV2Checkpoint(graph,value.machine).pending
  if(Object.hasOwn(value,"agent_state")){
    if(!value.agent_state||parent?.kind!=="agent")throw new HttpError(409,"invalid_workflow_v2_state")
    const pending=inspectWorkflowAgentState(value.agent_state,parent).pending
    if(value.agent_dispatch){const dispatch=value.agent_dispatch
      if(Object.keys(dispatch).length!==4||!pending||dispatch.step_key!==pending.step_key||dispatch.input_sha256!==pending.input_sha256||
         dispatch.kind!==pending.kind||dispatch.parent_step_key!==parent.step_key)throw new HttpError(409,"invalid_workflow_v2_state")
    }
  }else if(value.agent_dispatch)throw new HttpError(409,"invalid_workflow_v2_state")
  return {...value,graph}
}
export function workflowV2ExecutionRequest(state:WorkflowV2StoredState):WorkflowEffectRequest|null{
  const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending
  return parent?.kind==="agent"&&state.agent_state?inspectWorkflowAgentState(state.agent_state,parent).pending??parent:parent
}
export async function auditWorkflowV2(db:SqlClient,owner:string,runId:string,action:string,metadata:Record<string,unknown>){
  await db.query("INSERT INTO agentstudio.audit_events "+
    "(owner_user_id,actor_user_id,run_id,action,target_kind,target_id,result,metadata) "+
    "VALUES($1::uuid,$1::uuid,$2::uuid,$3::text,'workflow_run',$2::text,'succeeded',$4::jsonb)",
    [owner,runId,action,JSON.stringify(metadata)])
}
export async function verifyWorkflowV2Snapshot(db:SqlClient,owner:string,run:WorkflowV2RunRow,state:WorkflowV2StoredState){
  const current=(await db.query<{revision:number|string}>("SELECT revision FROM agentstudio.workflows "+
    "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[run.workflow_id,owner])).rows[0]
  if(Number(current?.revision)!==state.workflow_revision)throw new HttpError(409,"workflow_revision_changed")
  await verifyWorkflowGraphResources(db,owner,state.graph)
  if(state.agent_state){const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending!
    await verifyWorkflowAgentResources(db,owner,parent,state.agent_state)}
}
export class WorkflowV2RunRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  private async assemble(db:SqlClient,owner:string,row:WorkflowV2RunRow,replayed:boolean){
    const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
    const view=inspectWorkflowV2Checkpoint(state.graph,state.machine)
    const pending=workflowV2ExecutionRequest(state)
    const steps=await db.query<{step_key:string;status:string;metadata:unknown}>(
      "SELECT step_key,status,metadata FROM agentstudio.run_steps WHERE run_id=$1::uuid "+
      "AND owner_user_id=$2::uuid ORDER BY step_key LIMIT 200",[row.id,owner])
    const approvals=await db.query<{step_key:string;status:string}>(
      "SELECT step_key,status FROM agentstudio.approvals WHERE run_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY requested_at DESC LIMIT 201",[row.id,owner])
    // Do not send graph snapshots, replay journals or private node bodies with
    // run history. The current pending request is shown only for explicit review.
    return {run:{...row,step_count:Number(row.step_count),checkpoint:{stage:state.stage,execution_mode:state.execution_mode,
      workflow_revision:state.workflow_revision,graph_sha256:state.machine.graph_sha256,cursor:state.machine.cursor,
      executions:view.executions,loop_progress:view.loops}},
      steps:steps.rows.map(step=>({...step,metadata:safeRunStepMetadata(step.metadata)})),
      steps_truncated:Number(row.step_count)>steps.rows.length,approvals:approvals.rows.slice(0,200).reverse(),approvals_truncated:approvals.rows.length>200,
      pending_effect:["cancelled","failed","succeeded"].includes(row.status)?null:pending,
      replayed,execution_mode:"workflow_native_v2" as const}
  }
  async submit(identity:Identity,id:string,raw:unknown){
    if(!isUuid(id))throw new HttpError(400,"invalid_workflow_id")
    const request=safeWorkflowV2Request(raw),key="workflow_v2:"+request.idempotency_key
    return withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":"+key])
      const prior=(await db.query<WorkflowV2RunRow>("SELECT r."+workflowV2RunColumns.replaceAll(",",",r.")+" FROM agentstudio.runs r JOIN agentstudio.jobs j "+
        "ON j.run_id=r.id AND j.owner_user_id=r.owner_user_id WHERE j.owner_user_id=$1::uuid "+
        "AND j.kind='workflow_tick' AND j.dedupe_key=$2::text AND j.payload->>'phase'='workflow_native_v2'",[owner,key])).rows[0]
      if(prior){
        if(prior.workflow_id!==id||prior.instruction!==request.instruction||
           Number(prior.checkpoint.workflow_revision)!==request.expected_revision)throw new HttpError(409,"idempotency_key_conflict")
        return this.assemble(db,owner,prior,true)
      }
      const flow=(await db.query<{revision:number|string;graph:unknown}>("SELECT revision,graph FROM agentstudio.workflows "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,owner])).rows[0]
      if(!flow)throw new HttpError(404,"workflow_not_found")
      if(Number(flow.revision)!==request.expected_revision)throw new HttpError(409,"workflow_revision_changed")
      const graph=safeWorkflowGraph(flow.graph),machine=createWorkflowV2Checkpoint(graph,request.instruction)
      for(const node of graph.nodes){
        if(node.type==="model"&&(!node.data.model_binding||!node.data.prompt?.trim()))throw new HttpError(409,"workflow_node_not_ready")
        if(node.type==="agent"&&!node.data.agent_binding)throw new HttpError(409,"workflow_node_not_ready")
        if(node.type==="tool"&&node.data.tool==="summarize"&&!node.data.model_binding)throw new HttpError(409,"workflow_node_not_ready")
        if(node.type==="agent")await verifyWorkflowAgentResources(db,owner,{step_key:"",node_id:node.id,kind:"agent",input:"",input_sha256:"",configuration:node.data,missing:[]})
      }
      await verifyWorkflowGraphResources(db,owner,graph)
      const checkpoint:WorkflowV2StoredState={stage:"workflow_v2_queued",execution_mode:"workflow_native_v2",
        workflow_revision:request.expected_revision,graph,machine}
      const run=(await db.query<WorkflowV2RunRow>("INSERT INTO agentstudio.runs "+
        "(owner_user_id,kind,workflow_id,status,instruction,checkpoint) VALUES($1::uuid,'workflow',$2::uuid,'queued',$3::text,$4::jsonb) "+
        "RETURNING "+workflowV2RunColumns,[owner,id,request.instruction,JSON.stringify(checkpoint)])).rows[0]!
      await db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload,max_attempts) "+
        "VALUES($1::uuid,$2::uuid,'workflow_tick',$3::text,$4::jsonb,30)",[owner,run.id,key,
        JSON.stringify({phase:"workflow_native_v2",workflow_id:id,workflow_revision:request.expected_revision,graph_sha256:machine.graph_sha256})])
      await auditWorkflowV2(db,owner,run.id,"workflow.v2_submit",{workflow_revision:request.expected_revision,graph_sha256:machine.graph_sha256})
      return this.assemble(db,owner,run,false)
    })
  }
  async get(identity:Identity,id:string){
    if(!isUuid(id))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,owner)=>{
      const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='workflow' AND checkpoint->>'execution_mode'='workflow_native_v2'",[id,owner])).rows[0]
      return row?this.assemble(db,owner,row,true):null
    })
  }
  async list(identity:Identity,limit=30){
    if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new HttpError(400,"invalid_workflow_run_limit")
    return withActor(this.pool,identity,async(db,owner)=>(await db.query(
      "SELECT id,workflow_id,status,left(instruction,180) AS instruction_preview,left(result_text,240) AS result_preview,"+
      "step_count,last_error_code,created_at,updated_at,finished_at,checkpoint->>'stage' AS stage "+
      "FROM agentstudio.runs WHERE owner_user_id=$1::uuid AND kind='workflow' "+
      "AND checkpoint->>'execution_mode'='workflow_native_v2' ORDER BY created_at DESC,id LIMIT $2::int",[owner,limit])).rows)
  }
  async steps(identity:Identity,id:string,after="",limit=100){
    if(!isUuid(id)||!Number.isSafeInteger(limit)||limit<1||limit>200||
       (after!==""&&!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(after)))throw new HttpError(400,"invalid_workflow_step_cursor")
    return withActor(this.pool,identity,async(db,owner)=>{
      const run=await db.query("SELECT id FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind='workflow' AND checkpoint->>'execution_mode'='workflow_native_v2'",[id,owner])
      if(!run.rows.length)throw new HttpError(404,"workflow_run_not_found")
      const rows=(await db.query<{step_key:string;status:string;metadata:unknown}>("SELECT step_key,status,metadata FROM agentstudio.run_steps "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key>$3::text ORDER BY step_key LIMIT $4::int",[id,owner,after,limit+1])).rows
      const items=rows.slice(0,limit).map(item=>({...item,metadata:safeRunStepMetadata(item.metadata)}))
      return {items,next_after:rows.length>limit?items.at(-1)!.step_key:null}
    })
  }
  async decide(identity:Identity,id:string,raw:unknown){
    if(!isUuid(id)||!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
    const item=raw as Record<string,unknown>
    if(Object.keys(item).length!==3||!["decision","step_key","input_sha256"].every(k=>Object.hasOwn(item,k))||
       typeof item.decision!=="string"||!["approved","rejected"].includes(item.decision)||typeof item.step_key!=="string"||
       !/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,100}$/.test(item.step_key)||
       typeof item.input_sha256!=="string"||!/^[a-f0-9]{64}$/.test(item.input_sha256))invalid()
    return withActor(this.pool,identity,async(db,owner)=>{
      const locked=(await db.query<{id:string}>("SELECT id FROM agentstudio.jobs WHERE run_id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind='workflow_tick' AND payload->>'phase'='workflow_native_v2' FOR UPDATE",[id,owner])).rows[0]
      if(!locked)throw new HttpError(404,"workflow_run_not_found")
      const run=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='workflow' FOR UPDATE",[id,owner])).rows[0]!
      const state=checkedWorkflowV2StoredState(run.checkpoint,run.instruction)
      const approval=(await db.query<{status:string;reason_code:string}>("SELECT status,reason_code FROM agentstudio.approvals "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR UPDATE",[id,owner,item.step_key])).rows[0]
      if(!approval||approval.reason_code!=="wf2:"+item.input_sha256)throw new HttpError(409,"workflow_approval_input_changed")
      if(approval.status===item.decision)return this.assemble(db,owner,run,true)
      const pending=workflowV2ExecutionRequest(state)
      if(run.status!=="awaiting_approval"||approval.status!=="pending"||!pending||pending.step_key!==item.step_key||pending.input_sha256!==item.input_sha256)
        throw new HttpError(409,"workflow_approval_state_changed")
      if(item.decision==="approved")await verifyWorkflowV2Snapshot(db,owner,run,state)
      else if(pending.agent_context){
        const parent=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending!
        state.agent_state=recordWorkflowAgentResult(state.agent_state,parent,{step_key:pending.step_key,input_sha256:pending.input_sha256,
          output:"员工已拒绝该节点操作",outcome:"rejected"});delete state.agent_dispatch
        await db.query("UPDATE agentstudio.run_steps SET status='skipped',updated_at=clock_timestamp() WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text",[id,owner,pending.step_key])
      }else state.machine=recordWorkflowV2EffectResult(state.graph,state.machine,{step_key:pending.step_key,
        input_sha256:pending.input_sha256,output:"员工已拒绝该节点操作",outcome:"rejected"})
      await db.query("UPDATE agentstudio.approvals SET status=$4::text,decided_by=$2::uuid,decided_at=clock_timestamp() "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='pending'",[id,owner,item.step_key,item.decision])
      state.stage="workflow_v2_queued"
      const updated=(await db.query<WorkflowV2RunRow>("UPDATE agentstudio.runs SET status='queued',checkpoint=$3::jsonb,updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING "+workflowV2RunColumns,[id,owner,JSON.stringify(state)])).rows[0]!
      await auditWorkflowV2(db,owner,id,"workflow.v2_decision",{step_key:item.step_key,input_sha256:item.input_sha256,decision:item.decision})
      return this.assemble(db,owner,updated,false)
    })
  }
  async cancel(identity:Identity,id:string){
    if(!isUuid(id))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,owner)=>{
      const job=(await db.query<{id:string}>("SELECT id FROM agentstudio.jobs WHERE run_id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind='workflow_tick' AND payload->>'phase'='workflow_native_v2' FOR UPDATE",[id,owner])).rows[0]
      if(!job)throw new HttpError(404,"workflow_run_not_found")
      const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[id,owner])).rows[0]!
      if(row.status==="cancelled")return this.assemble(db,owner,row,true)
      if(["succeeded","failed"].includes(row.status))throw new HttpError(409,"workflow_run_terminal")
      const effects=await db.query("SELECT step_key FROM agentstudio.external_effects WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND status IN ('started','unknown')",[id,owner])
      if(effects.rows.length)throw new HttpError(409,"workflow_effect_in_flight")
      await db.query("UPDATE agentstudio.jobs SET status='cancelled',lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[job.id,owner])
      await db.query("UPDATE agentstudio.approvals SET status='rejected',decided_by=$2::uuid,decided_at=clock_timestamp() "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND status='pending'",[id,owner])
      const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction);state.stage="workflow_v2_cancelled"
      const next=(await db.query<WorkflowV2RunRow>("UPDATE agentstudio.runs SET status='cancelled',checkpoint=$3::jsonb,finished_at=clock_timestamp(),updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid RETURNING "+workflowV2RunColumns,[id,owner,JSON.stringify(state)])).rows[0]!
      await auditWorkflowV2(db,owner,id,"workflow.v2_cancel",{});return this.assemble(db,owner,next,false)
    })
  }
}
