import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {durableV2Root,type DurableV2Mode} from "./durable-v2-root.ts"
import {parseAgentHumanResponse,type AgentHumanResponse} from "./agent-human-input-contract.ts"
import {agentHumanContext,humanInputReceipt,humanInputSha,humanResponseEntry,humanResponseFingerprint,requireHumanInputSchema,type HumanInputReceipt} from "./agent-human-input-policy.ts"
import {recordWorkflowAgentHumanResponse} from "./workflow-v2-agent-machine.ts"
import {auditWorkflowV2,checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,workflowV2RunColumns,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {currentKnowledgeObservations} from "./knowledge-observation-policy.ts"
import {redactResultText} from "./public-result-text.ts"

function native(identity:Identity){if(identity?.issuer!=="urn:agentstudio:local:v1")throw new HttpError(403,"native_employee_identity_required")}
function runId(value:string){if(!isUuid(value))throw new HttpError(400,"invalid_run_id");return value.toLowerCase()}
export class AgentHumanInputRepository{
  readonly pool:SqlPool;readonly enabled:boolean;readonly root:ReturnType<typeof durableV2Root>
  constructor(pool:SqlPool,mode:DurableV2Mode="agent_native_v2",options:{allowResponses?:boolean}={}){
    this.pool=pool;this.root=durableV2Root(mode);this.enabled=options.allowResponses===true
  }
  private async previous(db:SqlClient,owner:string,id:string,choice:AgentHumanResponse):Promise<HumanInputReceipt|null>{
    const row=(await db.query<{run_id:string;request_sha256:string;kind:string;mode:string}>(
      "SELECT h.run_id,h.request_sha256,r.kind,r.checkpoint->>'execution_mode' AS mode FROM agentstudio.agent_human_input_responses h "+
      "JOIN agentstudio.runs r ON r.id=h.run_id AND r.owner_user_id=h.owner_user_id WHERE h.owner_user_id=$1::uuid AND h.request_id=$2::uuid",[owner,choice.request_id])).rows[0]
    if(!row)return null
    if(row.run_id!==id||row.kind!==this.root.kind||row.mode!==this.root.mode||row.request_sha256!==humanResponseFingerprint(id,choice))throw new HttpError(409,"agent_human_response_request_conflict")
    return humanInputReceipt(id,choice,true)
  }
  async change(identity:Identity,rawId:string,raw:unknown):Promise<HumanInputReceipt>{
    native(identity);const id=runId(rawId),choice=parseAgentHumanResponse(raw)
    const prior=await withActor(this.pool,identity,async(db,owner)=>{await requireHumanInputSchema(db);return this.previous(db,owner,id,choice)})
    if(prior)return prior
    if(!this.enabled)throw new HttpError(403,"agent_human_responses_disabled")
    return withActor(this.pool,identity,async(db,owner)=>{
      await requireHumanInputSchema(db)
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,48))",[owner+":"+choice.request_id])
      const previous=await this.previous(db,owner,id,choice);if(previous)return previous
      const job=(await db.query<{id:string;status:string}>("SELECT id,status FROM agentstudio.jobs WHERE run_id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind=$3::text AND payload->>'phase'=$4::text FOR UPDATE",[id,owner,this.root.job,this.root.mode])).rows[0]
      if(!job)throw new HttpError(404,"agent_human_run_not_found")
      const run=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind=$3::text FOR UPDATE",[id,owner,this.root.kind])).rows[0]
      if(!run)throw new HttpError(404,"agent_human_run_not_found")
      if(run.status!=="awaiting_input"||job.status!=="queued")throw new HttpError(409,"agent_human_input_changed")
      const state=checkedWorkflowV2StoredState(run.checkpoint,run.instruction)
      if(state.execution_mode!==this.root.mode)throw new HttpError(404,"agent_human_run_not_found")
      await verifyWorkflowV2Snapshot(db,owner,run,state)
      if(!await currentKnowledgeObservations(db,id))throw new HttpError(409,"knowledge_observations_unavailable")
      const context=agentHumanContext(run,state),pending=context?.pending_input
      if(!context||!pending||pending.step_key!==choice.pending_step_key||pending.pending_sha256!==choice.pending_sha256||context.source_sha256!==choice.source_sha256)
        throw new HttpError(409,"agent_human_input_changed")
      if(pending.kind==="clarification"&&choice.decision!=="reply"||pending.kind==="plan_review"&&choice.decision==="reply")throw new HttpError(400,"invalid_agent_human_response_decision")
      if((await db.query("SELECT step_key FROM agentstudio.external_effects WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND status IN('started','unknown') LIMIT 1",[id,owner])).rows.length)
        throw new HttpError(409,"workflow_effect_in_flight")
      const updated=recordWorkflowAgentHumanResponse(state.agent_state,context.parent,humanResponseEntry(choice,pending))
      await db.query("INSERT INTO agentstudio.agent_human_input_responses(owner_user_id,run_id,request_id,parent_step_key,step_key,source_sha256,pending_sha256,input_sha256,kind,decision,answer_sha256,request_sha256) "+
        "VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [owner,id,choice.request_id,context.parent.step_key,pending.step_key,context.source_sha256,pending.pending_sha256,pending.input_sha256,pending.kind,choice.decision,humanInputSha(choice.answer),humanResponseFingerprint(id,choice)])
      state.agent_state=updated;state.stage=this.root.stage+"queued"
      await db.query("UPDATE agentstudio.runs SET status='queued',checkpoint=$3::jsonb,last_error_code='',updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,owner,JSON.stringify(state)])
      await db.query("UPDATE agentstudio.jobs SET status='queued',attempts=0,scheduled_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=$2::uuid",[job.id,owner])
      await auditWorkflowV2(db,owner,id,"workflow.v2_human_response",{request_id:choice.request_id,step_key:pending.step_key,pending_sha256:pending.pending_sha256,source_sha256:context.source_sha256,kind:pending.kind,decision:choice.decision})
      return humanInputReceipt(id,choice)
    })
  }
  async confirm(identity:Identity,rawId:string,raw:unknown):Promise<HumanInputReceipt>{
    native(identity);const id=runId(rawId),choice=parseAgentHumanResponse(raw)
    return withActor(this.pool,identity,async(db,owner)=>{
      await requireHumanInputSchema(db);const prior=await this.previous(db,owner,id,choice)
      if(!prior)throw new HttpError(404,"agent_human_response_not_found")
      return prior
    })
  }
  async history(identity:Identity,rawId:string,after="",limit=10){
    native(identity);const id=runId(rawId)
    if(!Number.isSafeInteger(limit)||limit<1||limit>20||typeof after!=="string"||after!==""&&!/^wf2_[0-9]{5}_[A-Za-z0-9_-]{1,140}_input$/.test(after))
      throw new HttpError(400,"invalid_agent_human_history_query")
    return withActor(this.pool,identity,async(db,owner)=>{
      await requireHumanInputSchema(db)
      const run=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind=$3::text FOR SHARE",[id,owner,this.root.kind])).rows[0]
      if(!run)throw new HttpError(404,"agent_human_run_not_found")
      const state=checkedWorkflowV2StoredState(run.checkpoint,run.instruction)
      if(state.execution_mode!==this.root.mode)throw new HttpError(404,"agent_human_run_not_found")
      try{
        if(!await currentKnowledgeObservations(db,id))return {run_id:id,items:[],available:false,next_after:null}
        const evidence=await verifyWorkflowV2Snapshot(db,owner,run,state),selected=evidence.history.filter(item=>item.step_key>after)
        const items=selected.slice(0,limit).map(item=>({...item,question:redactResultText(item.question),draft:redactResultText(item.draft),answer:redactResultText(item.answer)}))
        return {run_id:id,items,available:true,next_after:selected.length>limit?items.at(-1)!.step_key:null}
      }catch(error){if(error instanceof HttpError&&[400,404,409].includes(error.status))return {run_id:id,items:[],available:false,next_after:null};throw error}
    })
  }
}
