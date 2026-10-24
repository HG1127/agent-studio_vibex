// PG18 isolated, deterministic Workflow graph-validation run.
// Only start/end nodes are supported; this is NEVER a model/tool/agent runner.
// One owner/RLS transaction persists a completed run, per-node steps,
// succeeded idempotency ledger entry and audit. NO queued jobs or effects.
import {createHash} from "node:crypto"
import {HttpError,isUuid,safeWorkflowGraph,
  type Identity,type SqlClient,type SqlPool,type WorkflowGraph}
  from "./contracts.ts"
import {withActor} from "./repository.ts"

export interface WorkflowValidationRequest{
  expected_revision:number
  idempotency_key:string
}
export type WorkflowValidationRun={
  id:string;owner_user_id:string;kind:"workflow";workflow_id:string
  status:string;instruction:string;result_text:string
  checkpoint:Record<string,unknown>;step_count:number
  finished_at:string|null;created_at:string;updated_at:string
}
export type WorkflowValidationStep={
  step_key:string;status:string;metadata:Record<string,unknown>
  created_at:string
}
export type WorkflowValidationResult={
  run:WorkflowValidationRun;steps:WorkflowValidationStep[]
  replayed:boolean;mode:"graph_validation_only"
  external_effects_executed:false
}
const marker="workflow_validation_succeeded"
const phase="workflow_graph_validation_only"
const runColumns="id,owner_user_id,kind,workflow_id,status,instruction,"+
  "result_text,checkpoint,step_count,finished_at,created_at,updated_at"
function invalid():never{throw new HttpError(400,"invalid_workflow_validation_request")}
export function safeWorkflowValidationRequest(raw:unknown):WorkflowValidationRequest{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid()
  const v=raw as Record<string,unknown>
  if(Object.keys(v).length!==2||
     !Object.hasOwn(v,"expected_revision")||
     !Object.hasOwn(v,"idempotency_key")||
     !Number.isSafeInteger(v.expected_revision)||
     (v.expected_revision as number)<1||
     typeof v.idempotency_key!=="string"||
     !/^[A-Za-z0-9_-]{8,80}$/.test(v.idempotency_key))invalid()
  return {expected_revision:v.expected_revision as number,
    idempotency_key:v.idempotency_key as string}
}
type StoredWorkflow={id:string;revision:number|string;graph:WorkflowGraph}
function safeOrder(graph:unknown):{order:{id:string;type:"start"|"end"}[];hash:string}{
  let checked:WorkflowGraph
  try{checked=safeWorkflowGraph(graph)}
  catch{throw new HttpError(409,"workflow_validation_graph_invalid")}
  if(checked.version!==undefined||checked.nodes.some(n=>n.type!=="start"&&n.type!=="end"))
    throw new HttpError(409,"workflow_validation_node_not_supported")
  // start must be the unique source in the already-validated DAG, and
  // all end nodes are terminal. The stable order is independent of DB rows.
  const order=[...checked.nodes].sort((a,b)=>
    (a.type==="start"?-1:b.type==="start"?1:a.id.localeCompare(b.id)))
    .map(n=>({id:n.id,type:n.type as "start"|"end"}))
  if(order.length<2||order[0]?.type!=="start"||
     order.slice(1).some(n=>n.type!=="end"))
    throw new HttpError(409,"workflow_validation_graph_invalid")
  const hash=createHash("sha256").update(
    JSON.stringify({nodes:[...checked.nodes].sort((a,b)=>a.id.localeCompare(b.id)),
      edges:[...checked.edges].sort((a,b)=>a.id.localeCompare(b.id))})
  ).digest("hex")
  return {order,hash}
}
function normalize(row:WorkflowValidationRun):WorkflowValidationRun{
  const step_count=Number(row.step_count)
  if(!Number.isSafeInteger(step_count)||step_count<2||step_count>40)
    throw new HttpError(500,"invalid_workflow_validation_record")
  return {...row,step_count}
}
export class WorkflowValidationRepository{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}

  private async assemble(db:SqlClient,owner:string,run:WorkflowValidationRun,
    replayed:boolean):Promise<WorkflowValidationResult>{
    const steps=await db.query<WorkflowValidationStep>(
      "SELECT step_key,status,metadata,created_at "+
      "FROM agentstudio.run_steps WHERE run_id=$1::uuid "+
      "AND owner_user_id=$2::uuid ORDER BY metadata->>'index',step_key",
      [run.id,owner])
    if(steps.rows.length!==Number(run.step_count))
      throw new HttpError(409,"workflow_validation_steps_incomplete")
    return {run:normalize(run),steps:steps.rows,replayed,
      mode:"graph_validation_only",external_effects_executed:false}
  }
  private async previous(db:SqlClient,owner:string,key:string){
    const data=await db.query<WorkflowValidationRun>(
      "SELECT r."+runColumns.replaceAll(",",",r.")+" "+
      "FROM agentstudio.jobs j JOIN agentstudio.runs r "+
      "ON r.id=j.run_id AND r.owner_user_id=j.owner_user_id "+
      "WHERE j.owner_user_id=$1::uuid AND j.kind='run_tick' "+
      "AND j.dedupe_key=$2::text "+
      "AND j.payload->>'phase'=$3::text "+
      "AND j.status='succeeded' AND r.kind='workflow' "+
      "AND r.checkpoint->>'stage'=$4::text LIMIT 1",
      [owner,"workflow_validate:"+key,phase,marker])
    return data.rows[0]??null
  }
  async get(identity:Identity,runId:string):Promise<WorkflowValidationResult|null>{
    if(!isUuid(runId))throw new HttpError(400,"invalid_run_id")
    return withActor(this.pool,identity,async(db,owner)=>{
      const result=await db.query<WorkflowValidationRun>(
        "SELECT "+runColumns+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind='workflow' AND checkpoint->>'stage'=$3::text",
        [runId,owner,marker])
      return result.rows[0]?this.assemble(db,owner,result.rows[0],true):null
    })
  }
  async validate(identity:Identity,workflowId:string,raw:unknown):
    Promise<WorkflowValidationResult>{
    if(!isUuid(workflowId))throw new HttpError(400,"invalid_workflow_id")
    const request=safeWorkflowValidationRequest(raw)
    const attempt=async()=>withActor(this.pool,identity,async(db,owner)=>{
      // The job row is a SUCCEEDED idempotency ledger, never queued or
      // claimable by any Agent/Model/Schedule Worker.
      const previous=await this.previous(db,owner,request.idempotency_key)
      if(previous){
        if(previous.workflow_id!==workflowId||
           Number(previous.checkpoint?.workflow_revision)!==request.expected_revision)
          throw new HttpError(409,"idempotency_key_conflict")
        return this.assemble(db,owner,previous,true)
      }
      const stored=await db.query<StoredWorkflow>(
        "SELECT id,revision,graph FROM agentstudio.workflows "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",
        [workflowId,owner])
      const workflow=stored.rows[0]
      if(!workflow)throw new HttpError(404,"workflow_not_found")
      if(Number(workflow.revision)!==request.expected_revision)
        throw new HttpError(409,"workflow_revision_changed")
      const {order,hash}=safeOrder(workflow.graph)
      const checkpoint={
        stage:marker,workflow_revision:request.expected_revision,
        graph_sha256:hash,validated_node_count:order.length,
        external_effects_executed:false,validation_only:true
      }
      const result=await db.query<WorkflowValidationRun>(
        "INSERT INTO agentstudio.runs "+
        "(owner_user_id,kind,workflow_id,status,instruction,result_text,"+
        "checkpoint,step_count,finished_at) VALUES "+
        "($1::uuid,'workflow',$2::uuid,'succeeded','',"+
        "$3::text,$4::jsonb,$5::int,clock_timestamp()) "+
        "RETURNING "+runColumns,
        [owner,workflowId,"Graph structure validated; no tasks or external calls executed.",
          JSON.stringify(checkpoint),order.length])
      const run=result.rows[0]
      if(!run)throw Error("workflow_validation_run_insert_missing")
      for(const [index,node] of order.entries()){
        await db.query(
          "INSERT INTO agentstudio.run_steps "+
          "(owner_user_id,run_id,step_key,status,metadata) "+
          "VALUES ($1::uuid,$2::uuid,$3::text,'succeeded',$4::jsonb)",
          [owner,run.id,"workflow_validate:"+node.id,
            JSON.stringify({index:String(index).padStart(3,"0"),
              node_id:node.id,node_type:node.type,
              validation_only:true,external_effects_executed:false})])
      }
      await db.query(
        "INSERT INTO agentstudio.jobs "+
        "(owner_user_id,run_id,kind,dedupe_key,status,payload,attempts,max_attempts) "+
        "VALUES ($1::uuid,$2::uuid,'run_tick',$3::text,"+
        "'succeeded',$4::jsonb,0,1)",
        [owner,run.id,"workflow_validate:"+request.idempotency_key,
          JSON.stringify({phase,workflow_revision:request.expected_revision,
            graph_sha256:hash,external_effects_executed:false})])
      await db.query(
        "INSERT INTO agentstudio.audit_events "+
        "(owner_user_id,actor_user_id,run_id,action,target_kind,"+
        "target_id,result,metadata) VALUES "+
        "($1::uuid,$1::uuid,$2::uuid,'workflow.graph_validation',"+
        "'workflow',$3::text,'succeeded',$4::jsonb)",
        [owner,run.id,workflowId,JSON.stringify({
          workflow_revision:request.expected_revision,validated_nodes:order.length,
          external_effects_executed:false})])
      return this.assemble(db,owner,run,false)
    })
    try{return await attempt()}
    catch(error){
      // Two concurrent identical validations can race on the unique
      // (owner,kind,dedupe_key) index. The loser rolls back completely,
      // then resolves the *committed* result in a fresh owner transaction.
      if((error as {code?:unknown})?.code!=="23505")throw error
      return withActor(this.pool,identity,async(db,owner)=>{
        const prior=await this.previous(db,owner,request.idempotency_key)
        if(!prior||prior.workflow_id!==workflowId||
           Number(prior.checkpoint.workflow_revision)!==request.expected_revision)
          throw new HttpError(409,"idempotency_key_conflict")
        return this.assemble(db,owner,prior,true)
      })
    }
  }
}
