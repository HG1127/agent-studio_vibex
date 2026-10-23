// PostgreSQL V8.2 model-only Worker. Every external model call is fenced by
// a durable "started" effect BEFORE the network request; a crash or ambiguous
// outcome is quarantined and NEVER automatically billed again.
import {createHash} from "node:crypto"
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {isUuid,type SqlClient,type SqlPool} from "./contracts.ts"
import {applyKnowledgeScope,sharedKnowledgeScopeEnabled} from "./knowledge-scope-policy.ts"
import {requireKnowledgeScope} from "./knowledge-runtime-scope.ts"
import type {ModelInput,ModelProvider} from "./model-provider.ts"
import type {LeasedPrepareJob} from "./agent-worker.ts"
import {gatherAgentKnowledgeEvidence} from "./agent-knowledge-grounding.ts"
import {boundModelFingerprint,type BoundModelClaim,type BoundModelDispatchResult}
  from "./owner-model-dispatch.ts"

const sql=(name:string)=>readFileSync(
  fileURLToPath(new URL("../../../db/postgres/"+name,import.meta.url)),"utf8")
const claimSql=sql("006_claim_agent_model.sql")
const finishSql=sql("003_finish_job.sql")
const hash=(input:unknown)=>createHash("sha256")
  .update(JSON.stringify(input)).digest("hex")
type BoundDispatchGateway=(claim:BoundModelClaim,input:ModelInput)=>Promise<BoundModelDispatchResult>
type ModelTickStatus="idle"|"succeeded"|"stale"|"quarantined"|"blocked"|"failed"
export type ModelTick={status:ModelTickStatus;run_id?:string}
interface LeasedModelJob extends LeasedPrepareJob {
  payload:{phase?:unknown;spec_revision?:unknown}
}
async function tx<T>(pool:SqlPool,fn:(db:SqlClient)=>Promise<T>):Promise<T>{
  const db=await pool.connect()
  let begun=false
  try{
    await db.query("BEGIN")
    begun=true
    await applyKnowledgeScope(db,pool)
    const result=await fn(db)
    await db.query("COMMIT")
    begun=false
    return result
  }catch(error){
    if(begun)await db.query("ROLLBACK").catch(()=>undefined)
    throw error
  }finally{db.release()}
}
function leaseValid(job:LeasedModelJob,id:string):boolean{
  return isUuid(job.id)&&isUuid(job.run_id)&&
    isUuid(job.owner_user_id)&&isUuid(job.lease_token)&&
    job.lease_owner===id&&Number.isSafeInteger(Number(job.lease_version))&&
    Number(job.lease_version)>0
}
async function guard(db:SqlClient,job:LeasedModelJob,workerId:string):
  Promise<LeasedModelJob|null>{
  const result=await db.query<LeasedModelJob>(
    "SELECT id,run_id,owner_user_id,kind,payload,lease_owner,lease_token,"+
    "lease_version,lease_until,attempts,max_attempts FROM agentstudio.jobs "+
    "WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid "+
    "AND status='leased' AND lease_token=$4::uuid "+
    "AND lease_version=$5::bigint AND lease_owner=$6::text "+
    "AND lease_until>clock_timestamp() FOR UPDATE",
    [job.id,job.run_id,job.owner_user_id,job.lease_token,
      job.lease_version,workerId])
  return result.rows[0]??null
}
async function actor(db:SqlClient,userId:string){
  await db.query("SET LOCAL ROLE agentstudio_api")
  await db.query("SELECT set_config('agentstudio.actor_id',$1,true)",[userId])
}
export class AgentModelWorker {
  readonly pool:SqlPool
  readonly workerId:string
  readonly provider:ModelProvider
  readonly boundModelDispatch?:BoundDispatchGateway
  readonly boundOnly:boolean
  constructor(pool:SqlPool,workerId:string,provider:ModelProvider,
    options:{boundModelDispatch?:BoundDispatchGateway;boundExecutionApproved?:boolean;
      boundOnly?:boolean}={}){
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(workerId))
      throw Error("invalid_worker_id")
    if((!!options.boundModelDispatch)!==(options.boundExecutionApproved===true))
      throw Error("bound_model_execution_disabled")
    if(options.boundOnly===true&&!options.boundModelDispatch)
      throw Error("bound_model_execution_disabled")
    this.pool=pool
    this.workerId=workerId
    this.provider=provider
    this.boundModelDispatch=options.boundModelDispatch
    this.boundOnly=options.boundOnly===true
  }
  async claim(seconds=180):Promise<LeasedModelJob|null>{
    if(!Number.isInteger(seconds)||seconds<60||seconds>300)
      throw Error("invalid_model_lease")
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const rows=await db.query<LeasedModelJob>(claimSql,
        [this.workerId,seconds])
      const job=rows.rows[0]
      if(!job)return null
      if(!leaseValid(job,this.workerId)||
         job.kind!=="run_tick"||job.payload?.phase!=="model")
        throw Error("invalid_model_claim")
      return job
    })
  }
  // Returns only pre-approved owner-scoped input; NO network call in the
  // transaction. Started effect + running state commit atomically.
  async begin(job:LeasedModelJob):
    Promise<{status:"ready";input:ModelInput;boundModel?:true}|{status:"stale"|"blocked"}>{
    if(!leaseValid(job,this.workerId))return {status:"stale"}
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const current=await guard(db,job,this.workerId)
      if(!current)return {status:"stale"}
      await actor(db,current.owner_user_id)
      const runs=await db.query<{
        id:string;agent_spec_id:string;instruction:string;status:string
        checkpoint:Record<string,unknown>
      }>(
        "SELECT id,agent_spec_id,instruction,status,checkpoint "+
        "FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND kind='agent' FOR UPDATE",
        [current.run_id,current.owner_user_id])
      const run=runs.rows[0]
      const version=Number(current.payload?.spec_revision)
      const approval=await db.query<{status:string}>(
        "SELECT status FROM agentstudio.approvals WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model'",
        [current.run_id,current.owner_user_id])
      if(!run||run.status!=="queued"||
         approval.rows[0]?.status!=="approved"||
         !Number.isSafeInteger(version)||version<1||
         Number(run.checkpoint?.spec_revision)!==version)
        throw Error("model_preflight_rejected")
      const specs=await db.query<{
        revision:string|number;spec:Record<string,unknown>
      }>(
        "SELECT revision,spec FROM agentstudio.agent_specs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid",
        [run.agent_spec_id,current.owner_user_id])
      const spec=specs.rows[0]
      // Legacy fixed-provider mode refuses bindings. Independently approved
      // bound-only mode refuses unbound runs before starting any effect.
      const selectedBinding=!!spec?.spec&&
        Object.hasOwn(spec.spec,"model_binding")
      const bindingRequired=this.boundOnly&&!selectedBinding
      if(!spec||Number(spec.revision)!==version||
         bindingRequired||(selectedBinding&&!this.boundModelDispatch)){
        const reason=bindingRequired?"model_binding_required":
          selectedBinding&&!this.boundModelDispatch?
          "model_binding_runtime_not_enabled":"spec_revision_changed"
        const checkpoint={...run.checkpoint,stage:reason}
        const paused=await db.query<{id:string}>(
          "UPDATE agentstudio.runs SET status='paused',checkpoint=$3::jsonb,"+
          "last_error_code=$4::text,"+
          "updated_at=clock_timestamp() WHERE id=$1::uuid "+
          "AND owner_user_id=$2::uuid AND status='queued' RETURNING id",
          [current.run_id,current.owner_user_id,JSON.stringify(checkpoint),reason])
        if(paused.rows.length!==1)throw Error("model_run_state_race")
        await db.query("SET LOCAL ROLE agentstudio_worker")
        const done=await db.query<{id:string}>(finishSql,[
          current.id,current.lease_token,current.lease_version,
          this.workerId,"failed"])
        if(done.rows.length!==1)throw Error("model_lease_lost")
        return {status:"blocked"}
      }
      const data=spec.spec
      const binding=selectedBinding?data.model_binding as Record<string,unknown>:null
      if(selectedBinding&&(!binding||typeof binding!=="object"||
        Array.isArray(binding)||Object.keys(binding).length!==3||
        !isUuid(binding.connection_id)||
        !Number.isSafeInteger(binding.connection_revision)||
        (binding.connection_revision as number)<1||
        typeof binding.model_id!=="string"||
        !/^[A-Za-z0-9._:/-]{1,120}$/.test(binding.model_id)))
        throw Error("invalid_bound_model_execution_binding")
      const bases=data.knowledge_base_ids===undefined?[]:data.knowledge_base_ids
      if(await sharedKnowledgeScopeEnabled(db)){
        const scope=await requireKnowledgeScope(db,current.owner_user_id,bases as string[])
        if(scope.some(base=>base.owner_user_id!==current.owner_user_id)&&!selectedBinding)
          throw Error("shared_knowledge_requires_owner_model_binding")
      }
      const evidence=await gatherAgentKnowledgeEvidence(db,current.owner_user_id,
        bases,data.tools,run.instruction)
      const input:ModelInput={
        goal:typeof data.goal==="string"?data.goal:"",
        instruction:run.instruction,
        taskScope:typeof data.task_scope==="string"?data.task_scope:"",
        deliverables:Array.isArray(data.deliverables)?data.deliverables as string[]:[],
        doneCriteria:Array.isArray(data.done_criteria)?data.done_criteria as string[]:[],
        ...(Array.isArray(bases)&&bases.length?{
          knowledgeEvidence:evidence.map(({citation,snippet})=>({citation,snippet}))
        }:{}),
      }
      if(!input.goal||input.goal.length>2000||input.instruction.length>1200)
        throw Error("model_input_invalid")
      const fingerprint=selectedBinding?
        boundModelFingerprint(input,binding):hash({input,model_phase:"v8_2"})
      const knowledgeAudit=Array.isArray(bases)&&bases.length?{
        knowledge_mode:"literal_keyword",
        citations:evidence.map(hit=>hit.citation),
        sources:evidence.map(hit=>({base_id:hit.baseId,
          document_id:hit.documentId,chunk_index:hit.chunkIndex,
          citation:hit.citation})),
        knowledge_input_sha256:hash(evidence)
      }:{}
      const step=await db.query<{id:string}>(
        "INSERT INTO agentstudio.run_steps(owner_user_id,run_id,step_key,"+
        "status,metadata) VALUES($1::uuid,$2::uuid,'model','running',"+
        "$3::jsonb) RETURNING id",
        [current.owner_user_id,current.run_id,
          JSON.stringify({category:"approved_text_generation",...knowledgeAudit})])
      if(step.rows.length!==1)throw Error("model_step_exists")
      const effect=await db.query<{run_id:string}>(
        "INSERT INTO agentstudio.external_effects "+
        "(owner_user_id,run_id,step_key,tool_name,arguments_sha256,"+
        "idempotency_key,status) "+
        "VALUES($1::uuid,$2::uuid,'model','model.generate',$3::text,"+
        "$4::text,'started') RETURNING run_id",
        [current.owner_user_id,current.run_id,fingerprint,
          "model:"+current.run_id])
      if(effect.rows.length!==1)throw Error("model_effect_exists")
      const updated=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='running',step_count=2,"+
        "checkpoint=jsonb_set(checkpoint,'{stage}',"+
        "'\"model_running\"'::jsonb),updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status='queued' "+
        "RETURNING id",[current.run_id,current.owner_user_id])
      if(updated.rows.length!==1)throw Error("model_run_state_race")
      return {status:"ready",input,
        ...(selectedBinding?{boundModel:true as const}:{})}
    })
  }
  async succeed(job:LeasedModelJob,result:string):Promise<ModelTick>{
    if(!leaseValid(job,this.workerId))return {status:"stale"}
    if(!result.trim()||result.length>12000)throw Error("model_output_invalid")
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const current=await guard(db,job,this.workerId)
      if(!current)return {status:"stale",run_id:job.run_id}
      await actor(db,current.owner_user_id)
      const effect=await db.query<{run_id:string}>(
        "UPDATE agentstudio.external_effects SET status='succeeded',"+
        "updated_at=clock_timestamp() WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' "+
        "AND status='started' RETURNING run_id",
        [current.run_id,current.owner_user_id])
      if(effect.rows.length!==1)throw Error("model_effect_not_started")
      const step=await db.query<{id:string}>(
        "UPDATE agentstudio.run_steps SET status='succeeded',"+
        "metadata=metadata || $3::jsonb,updated_at=clock_timestamp() "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND step_key='model' AND status='running' RETURNING id",
        [current.run_id,current.owner_user_id,
          JSON.stringify({output_chars:result.length,tool_calls:0})])
      if(step.rows.length!==1)throw Error("model_step_state_race")
      const finished=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='succeeded',result_text=$3::text,"+
        "checkpoint=jsonb_set(checkpoint,'{stage}',"+
        "'\"model_completed\"'::jsonb),finished_at=clock_timestamp(),"+
        "updated_at=clock_timestamp() WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND status='running' RETURNING id",
        [current.run_id,current.owner_user_id,result])
      if(finished.rows.length!==1)throw Error("model_run_state_race")
      await db.query(
        "INSERT INTO agentstudio.audit_events(owner_user_id,actor_user_id,"+
        "run_id,action,target_kind,target_id,result,metadata) VALUES("+
        "$1::uuid,$1::uuid,$2::uuid,'agent.model_result','run',"+
        "$2::text,'succeeded',$3::jsonb)",
        [current.owner_user_id,current.run_id,
          JSON.stringify({output_chars:result.length})])
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const done=await db.query<{id:string}>(finishSql,[
        current.id,current.lease_token,current.lease_version,
        this.workerId,"succeeded"])
      if(done.rows.length!==1)throw Error("model_lease_lost")
      return {status:"succeeded",run_id:current.run_id}
    })
  }
  // A provider may have charged, even if a transport error was returned.
  // Quarantine, do not retry or claim automatic success.
  async unknown(job:LeasedModelJob):Promise<ModelTick>{
    if(!leaseValid(job,this.workerId))return {status:"stale"}
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const current=await guard(db,job,this.workerId)
      if(!current)return {status:"stale",run_id:job.run_id}
      await actor(db,current.owner_user_id)
      await db.query(
        "UPDATE agentstudio.external_effects SET status='unknown',"+
        "updated_at=clock_timestamp() WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' "+
        "AND status='started'",[current.run_id,current.owner_user_id])
      const checkpoint={stage:"model_outcome_unknown",
        requires_manual_reconciliation:true,external_effects_executed:"unknown",
        spec_revision:current.payload.spec_revision}
      const paused=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='paused',checkpoint=$3::jsonb,"+
        "last_error_code='model_outcome_unknown',"+
        "updated_at=clock_timestamp() WHERE id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND status='running' RETURNING id",
        [current.run_id,current.owner_user_id,JSON.stringify(checkpoint)])
      if(paused.rows.length!==1)throw Error("model_run_state_race")
      await db.query("UPDATE agentstudio.run_steps SET status='failed',"+
        "updated_at=clock_timestamp() WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' "+
        "AND status='running'",[current.run_id,current.owner_user_id])
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const done=await db.query<{id:string}>(finishSql,[
        current.id,current.lease_token,current.lease_version,
        this.workerId,"failed"])
      if(done.rows.length!==1)throw Error("model_lease_lost")
      return {status:"quarantined",run_id:current.run_id}
    })
  }
  // Reconcile expired *started* effects only to a visible paused state.
  // No retry, replay, deletion of provider marker, or auto-refund inference.
  async sweepAmbiguous():Promise<string|null>{
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const result=await db.query<{
        id:string;run_id:string;owner_user_id:string;effect_status:string
      }>(
        "SELECT j.id,j.run_id,j.owner_user_id,e.status AS effect_status "+
        "FROM agentstudio.jobs AS j "+
        "JOIN agentstudio.runs AS r ON r.id=j.run_id "+
        "AND r.owner_user_id=j.owner_user_id "+
        "JOIN agentstudio.external_effects AS e ON e.run_id=j.run_id "+
        "AND e.owner_user_id=j.owner_user_id "+
        "WHERE j.kind='run_tick' AND j.payload->>'phase'='model' "+
        "AND j.status='leased' AND j.lease_until<=clock_timestamp() "+
        "AND e.status IN ('started','unknown') AND r.status='running' "+
        "ORDER BY j.lease_until,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1")
      const row=result.rows[0]
      if(!row)return null
      await actor(db,row.owner_user_id)
      await db.query(
        "UPDATE agentstudio.external_effects SET status='unknown',"+
        "updated_at=clock_timestamp() WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' "+
        "AND status='started'",[row.run_id,row.owner_user_id])
      const paused=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='paused',"+
        "checkpoint=jsonb_build_object('stage','model_lease_expired',"+
        "'requires_manual_reconciliation',true,"+
        "'external_effects_executed','unknown'),"+
        "last_error_code='model_lease_expired',updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND status='running' "+
        "RETURNING id",[row.run_id,row.owner_user_id])
      if(paused.rows.length!==1)throw Error("model_run_state_race")
      await db.query("UPDATE agentstudio.run_steps SET status='failed',"+
        "updated_at=clock_timestamp() WHERE run_id=$1::uuid "+
        "AND owner_user_id=$2::uuid AND step_key='model' "+
        "AND status='running'",[row.run_id,row.owner_user_id])
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const closed=await db.query<{id:string}>(
        "UPDATE agentstudio.jobs SET status='failed',"+
        "lease_owner=NULL,lease_token=NULL,lease_until=NULL,"+
        "last_error_code='model_lease_expired',"+
        "updated_at=clock_timestamp() WHERE id=$1::uuid "+
        "AND status='leased' AND lease_until<=clock_timestamp() "+
        "RETURNING id",[row.id])
      if(closed.rows.length!==1)throw Error("model_lease_lost")
      return row.run_id
    })
  }
  // A model Worker can crash on its last allowed lease BEFORE a model call.
  // In that case no external effect exists and the exhausted leased job must
  // be terminated, rather than staying leased forever.
  async sweepUnstartedExhausted():Promise<string|null>{
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const result=await db.query<{
        id:string;run_id:string;owner_user_id:string
      }>(
        "SELECT j.id,j.run_id,j.owner_user_id FROM agentstudio.jobs AS j "+
        "JOIN agentstudio.runs AS r ON r.id=j.run_id "+
        "AND r.owner_user_id=j.owner_user_id "+
        "WHERE j.kind='run_tick' AND j.payload->>'phase'='model' "+
        "AND j.status='leased' AND j.lease_until<=clock_timestamp() "+
        "AND j.attempts>=j.max_attempts AND r.status='queued' "+
        "AND NOT EXISTS (SELECT 1 FROM agentstudio.external_effects AS e "+
        "WHERE e.run_id=j.run_id AND e.owner_user_id=j.owner_user_id) "+
        "ORDER BY j.lease_until,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1")
      const row=result.rows[0]
      if(!row)return null
      await actor(db,row.owner_user_id)
      const failed=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='failed',"+
        "last_error_code='model_lease_exhausted',"+
        "finished_at=clock_timestamp(),updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND status='queued' RETURNING id",
        [row.run_id,row.owner_user_id])
      if(failed.rows.length!==1)throw Error("exhausted_model_run_state_race")
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const closed=await db.query<{id:string}>(
        "UPDATE agentstudio.jobs SET status='failed',"+
        "lease_owner=NULL,lease_token=NULL,lease_until=NULL,"+
        "last_error_code='model_lease_exhausted',"+
        "updated_at=clock_timestamp() WHERE id=$1::uuid "+
        "AND status='leased' AND attempts>=max_attempts "+
        "AND lease_until<=clock_timestamp() RETURNING id",
        [row.id])
      if(closed.rows.length!==1)throw Error("exhausted_model_job_state_race")
      return row.run_id
    })
  }
  async failPreflight(job:LeasedModelJob):Promise<ModelTick>{
    return tx(this.pool,async db=>{
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const current=await guard(db,job,this.workerId)
      if(!current)return {status:"stale",run_id:job.run_id}
      await actor(db,current.owner_user_id)
      const failed=await db.query<{id:string}>(
        "UPDATE agentstudio.runs SET status='failed',"+
        "last_error_code='model_preflight_failed',"+
        "finished_at=clock_timestamp(),updated_at=clock_timestamp() "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid "+
        "AND status='queued' RETURNING id",
        [current.run_id,current.owner_user_id])
      if(failed.rows.length!==1)throw Error("model_run_state_race")
      await db.query("SET LOCAL ROLE agentstudio_worker")
      const finished=await db.query<{id:string}>(finishSql,[
        current.id,current.lease_token,current.lease_version,
        this.workerId,"failed"])
      if(finished.rows.length!==1)throw Error("model_lease_lost")
      return {status:"failed",run_id:current.run_id}
    })
  }
  async tick():Promise<ModelTick>{
    const job=await this.claim()
    if(!job){
      const stuck=await this.sweepAmbiguous()
      if(stuck)return {status:"quarantined",run_id:stuck}
      const exhausted=await this.sweepUnstartedExhausted()
      return exhausted?{status:"failed",run_id:exhausted}:{status:"idle"}
    }
    let started=false
    try{
      const stage=await this.begin(job)
      if(stage.status!=="ready")
        return {status:stage.status,run_id:job.run_id}
      started=true
      // Only an explicitly injected, independently authenticated API/Broker
      // adapter may handle a selected model. The Worker never sees API keys.
      const output=stage.boundModel?
        (await this.boundModelDispatch!({
          run_id:job.run_id,job_id:job.id,lease_token:job.lease_token,
          lease_version:Number(job.lease_version),lease_owner:this.workerId,
        },stage.input)).text:
        await this.provider.generate(stage.input)
      return await this.succeed(job,output)
    }catch{
      // Do not log raw prompts, provider payloads, token, output, or errors.
      return started?this.unknown(job):this.failPreflight(job)
    }
  }
}
