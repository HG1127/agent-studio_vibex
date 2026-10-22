// Native autonomous Agent admission, with no synthetic Workflow database row.
import {HttpError,isUuid,type Identity} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {WorkflowV2RunRepository,safeWorkflowV2Request,workflowV2RunColumns,auditWorkflowV2,
  verifyWorkflowV2Snapshot,type WorkflowV2StoredState,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {createWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {autonomousAgentGraph} from "./autonomous-agent-graph.ts"
import type {SqlPool} from "./contracts.ts"
export class AutonomousAgentRunRepository extends WorkflowV2RunRepository{
  constructor(pool:SqlPool,options:{allowMcpExecution?:boolean}={}){super(pool,"agent_native_v2",options)}
  override async submit(identity:Identity,id:string,raw:unknown){
    if(!isUuid(id))throw new HttpError(400,"invalid_agent_spec_id")
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"invalid_agent_run_request")
    const {max_steps,...rest}=raw as Record<string,unknown>,request=safeWorkflowV2Request(rest)
    if(!Number.isSafeInteger(max_steps)||Number(max_steps)<1||Number(max_steps)>5)throw new HttpError(400,"invalid_agent_max_steps")
    const graph=autonomousAgentGraph(id,request.expected_revision,Number(max_steps)),machine=createWorkflowV2Checkpoint(graph,request.instruction)
    const key=this.root.dedupe+request.idempotency_key
    return withActor(this.pool,identity,async(db,owner)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[owner+":"+key])
      const prior=(await db.query<WorkflowV2RunRow>("SELECT r."+workflowV2RunColumns.replaceAll(",",",r.")+" FROM agentstudio.runs r JOIN agentstudio.jobs j "+
        "ON j.run_id=r.id AND j.owner_user_id=r.owner_user_id WHERE j.owner_user_id=$1::uuid AND j.kind='run_tick' "+
        "AND j.dedupe_key=$2::text AND j.payload->>'phase'='agent_native_v2'",[owner,key])).rows[0]
      if(prior){
        if(prior.kind!=="agent"||prior.agent_spec_id!==id||prior.instruction!==request.instruction||
           prior.checkpoint.execution_mode!=="agent_native_v2"||prior.checkpoint.spec_revision!==request.expected_revision||
           prior.checkpoint.machine.graph_sha256!==machine.graph_sha256)throw new HttpError(409,"idempotency_key_conflict")
        return this.assemble(db,owner,prior,true)
      }
      const checkpoint:WorkflowV2StoredState={stage:"agent_v2_queued",execution_mode:"agent_native_v2",spec_revision:request.expected_revision,graph,machine}
      const spec=(await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[id,owner])).rows[0]
      if(!spec)throw new HttpError(404,"agent_spec_not_found")
      await this.checkMcpAdmission(db,owner,graph)
      // Verify before admission and repeat on every decision/tick/dispatch.
      await verifyWorkflowV2Snapshot(db,owner,{kind:"agent",agent_spec_id:id,workflow_id:null} as WorkflowV2RunRow,checkpoint)
      const run=(await db.query<WorkflowV2RunRow>("INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,status,instruction,checkpoint) "+
        "VALUES($1::uuid,'agent',$2::uuid,'queued',$3::text,$4::jsonb) RETURNING "+workflowV2RunColumns,
        [owner,id,request.instruction,JSON.stringify(checkpoint)])).rows[0]!
      await db.query("INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,payload,max_attempts) "+
        "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,$4::jsonb,30)",[owner,run.id,key,
        JSON.stringify({phase:"agent_native_v2",agent_spec_id:id,spec_revision:request.expected_revision,graph_sha256:machine.graph_sha256})])
      await auditWorkflowV2(db,owner,run.id,"workflow.v2_submit",{spec_revision:request.expected_revision,graph_sha256:machine.graph_sha256,max_steps})
      return this.assemble(db,owner,run,false)
    })
  }
}
