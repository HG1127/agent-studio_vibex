// Full configuration versions are owner-only. Migration046 and its independent
// startup audit are required; metadata writes and acceptance default to off.
import {createHash,randomUUID} from "node:crypto"
import {HttpError,isUuid,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor,verifyAgentSpecResources} from "./repository.ts"
import {parseAgentReleaseChoice,parseAgentReleaseStoredSpec,type AgentReleaseChoice} from "./agent-release-contract.ts"
import {AutonomousAgentRunRepository} from "./autonomous-agent-run-repository.ts"
import {checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,workflowV2RunColumns,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {inspectWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {currentKnowledgeObservations} from "./knowledge-observation-policy.ts"
import {workflowAgentJson} from "./workflow-v2-agent-machine.ts"

type ObjectValue=Record<string,unknown>
function object(value:unknown):ObjectValue{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new HttpError(503,"invalid_agent_release_response")
  return value as ObjectValue
}
function specId(value:string):string{if(!isUuid(value))throw new HttpError(400,"invalid_spec_id");return value.toLowerCase()}
function result(raw:unknown,spec:string,request:string):ObjectValue{
  const value=object(raw)
  if(value.spec_id!==spec||value.request_id!==request||typeof value.replayed!=="boolean")throw new HttpError(503,"invalid_agent_release_response")
  return value
}
const errors=new Set(["agent_release_actor_unavailable","agent_release_not_found","agent_release_version_not_found","agent_release_request_conflict",
  "agent_release_source_changed","agent_release_version_changed","agent_release_head_changed","agent_release_untested_ack_required","agent_release_version_not_draft",
  "agent_release_acceptance_unavailable","invalid_agent_release_acceptance","invalid_agent_release_snapshot","invalid_agent_release_publish","invalid_agent_release_delete","invalid_agent_release_restore",
  "agent_release_restore_not_prepared","agent_release_restore_write_changed"])
async function transaction<T>(pool:SqlPool,identity:Identity,body:(db:SqlClient,actor:string)=>Promise<T>):Promise<T>{
  try{return await withActor(pool,identity,async(db,actor)=>{
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='5s'")
    const installed=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_046') AND "+
      "to_regprocedure('agentstudio.agent_release_restore_finish(uuid,uuid,text)') IS NOT NULL AS ok")).rows[0]?.ok
    if(installed!==true)throw new HttpError(503,"agent_release_not_installed")
    return body(db,actor)
  })}catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P0001"&&"message" in error&&errors.has(String(error.message))){
      const code=String(error.message)
      throw new HttpError(code.endsWith("not_found")?404:code==="agent_release_actor_unavailable"?403:code.startsWith("invalid_")?400:409,code)
    }
    throw error
  }
}
async function receipt(db:SqlClient,spec:string,request:string){
  const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_receipt($1::uuid,$2::uuid) AS item",[spec,request])).rows[0]?.item
  if(raw===null)return null
  const value=object(raw)
  if(typeof value.request_sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.request_sha256))throw new HttpError(503,"invalid_agent_release_response")
  return {request_sha256:value.request_sha256,result:result(value.result,spec,request)}
}
export class AgentReleaseRepository{
  readonly pool:SqlPool;readonly enabled:boolean;readonly allowAcceptance:boolean;readonly agents:AutonomousAgentRunRepository
  constructor(pool:SqlPool,options:{enabled?:boolean;allowAcceptance?:boolean;allowMcpExecution?:boolean;allowKnowledgeExecution?:boolean}={}){
    this.pool=pool;this.enabled=options.enabled===true;this.allowAcceptance=options.allowAcceptance===true;this.agents=new AutonomousAgentRunRepository(pool,options)
  }
  workspace(identity:Identity,rawId:string){const target=specId(rawId);return transaction(this.pool,identity,async(db,actor)=>{
    const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_workspace($1::uuid) AS item",[target])).rows[0]?.item
    if(raw===null)throw new HttpError(404,"agent_release_not_found")
    const value=object(raw)
    if(!Array.isArray(value.versions)||value.versions.length>100)throw new HttpError(503,"invalid_agent_release_response")
    const validity=new Map<string,boolean>(),versions:ObjectValue[]=[]
    for(const item of value.versions){const version=object(item)
      let current=false
      if(version.test_passed===true&&isUuid(version.test_run_id)&&typeof version.source_sha256==="string"){
        const key=version.test_run_id+":"+version.source_sha256
        if(!validity.has(key))validity.set(key,await this.currentAcceptance(db,actor,target,version.test_run_id,version.source_sha256))
        current=validity.get(key)===true
      }
      versions.push({...version,test_current:current})
    }
    return {...value,versions}
  })}
  detail(identity:Identity,rawId:string,rawVersion:string){const target=specId(rawId),version=specId(rawVersion)
    return transaction(this.pool,identity,async(db,actor)=>{
      const value=await this.ownedDetail(db,target,version)
      return {...value,test_current:value.test_passed===true&&isUuid(value.test_run_id)&&typeof value.source_sha256==="string"&&
        await this.currentAcceptance(db,actor,target,value.test_run_id,value.source_sha256)}
    })
  }
  async acceptanceStatus(identity:Identity,rawId:string,rawRun:string){
    const target=specId(rawId),run=specId(rawRun)
    const status=await transaction(this.pool,identity,async(db,actor)=>{
      const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_acceptance_status($1::uuid,$2::uuid) AS item",[target,run])).rows[0]?.item
      if(raw===null)throw new HttpError(404,"agent_release_acceptance_not_found")
      const value=object(raw)
      return {...value,test_current:typeof value.source_sha256==="string"&&await this.currentAcceptance(db,actor,target,run,value.source_sha256)}
    })
    // The standard run projection repeats the original source/ACL checks and
    // clears unavailable knowledge output; no private checkpoint is returned.
    return {...status,execution:await this.agents.get(identity,run)}
  }
  private async ownedDetail(db:SqlClient,target:string,version:string){
    const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_detail($1::uuid,$2::uuid) AS item",[target,version])).rows[0]?.item
    if(raw===null)throw new HttpError(404,"agent_release_version_not_found")
    const value=object(raw)
    if(value.id!==version||value.spec_id!==target)throw new HttpError(503,"invalid_agent_release_response")
    parseAgentReleaseStoredSpec(value.spec_snapshot)
    return value
  }
  async change(identity:Identity,rawId:string,raw:unknown){
    const target=specId(rawId),choice=parseAgentReleaseChoice(raw),fingerprint=createHash("sha256").update(JSON.stringify({spec_id:target,...choice})).digest("hex")
    const recover=(previous:Awaited<ReturnType<typeof receipt>>)=>{
      if(!previous)return null
      if(previous.request_sha256!==fingerprint)throw new HttpError(409,"agent_release_request_conflict")
      return previous.result
    }
    const prior=recover(await transaction(this.pool,identity,db=>receipt(db,target,choice.request_id)))
    if(prior)return prior
    if(!this.enabled)throw new HttpError(403,"agent_release_writes_disabled")
    return transaction(this.pool,identity,async(db,actor)=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,46))",[actor+":"+choice.request_id])
      const existing=recover(await receipt(db,target,choice.request_id));if(existing)return existing
      return this.apply(db,actor,target,choice,fingerprint)
    })
  }
  confirm(identity:Identity,rawId:string,raw:unknown){
    const target=specId(rawId),choice=parseAgentReleaseChoice(raw),fingerprint=createHash("sha256").update(JSON.stringify({spec_id:target,...choice})).digest("hex")
    return transaction(this.pool,identity,async db=>{
      const prior=await receipt(db,target,choice.request_id)
      if(!prior)throw new HttpError(404,"agent_release_receipt_not_found")
      if(prior.request_sha256!==fingerprint)throw new HttpError(409,"agent_release_request_conflict")
      return prior.result
    })
  }
  private async apply(db:SqlClient,actor:string,target:string,choice:AgentReleaseChoice,fingerprint:string):Promise<ObjectValue>{
    if(choice.action==="restore")return this.restore(db,actor,target,choice,fingerprint)
    if(choice.action==="acceptance"){
      if(!this.allowAcceptance)throw new HttpError(403,"agent_release_acceptance_disabled")
      return this.acceptance(db,actor,target,choice,fingerprint)
    }
    let query:string,args:unknown[]
    if(choice.action==="snapshot"){
      if(choice.test_run_id!==null)await this.stageTest(db,actor,target,choice.test_run_id,choice.source_sha256,"snapshot")
      query="SELECT agentstudio.agent_release_snapshot($1::uuid,$2::bigint,$3::text,$4::text,$5::uuid,$6::uuid,$7::text) AS item"
      args=[target,choice.expected_spec_revision,choice.source_sha256,choice.note,choice.test_run_id,choice.request_id,fingerprint]
    }else if(choice.action==="publish"){
      if(!choice.acknowledge_untested){
        const version=await this.ownedDetail(db,target,choice.version_id)
        if(version.test_passed!==true||!isUuid(version.test_run_id)||typeof version.source_sha256!=="string")throw new HttpError(409,"agent_release_untested_ack_required")
        if(!await this.currentAcceptance(db,actor,target,version.test_run_id,version.source_sha256))throw new HttpError(409,"agent_release_untested_ack_required")
        await this.stageTest(db,actor,target,version.test_run_id,version.source_sha256,"publish")
      }
      query="SELECT agentstudio.agent_release_publish($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::bigint,$7::bigint,$8::boolean,$9::boolean,$10::uuid,$11::text) AS item"
      args=[target,choice.version_id,choice.expected_spec_revision,choice.source_sha256,choice.version_sha256,choice.expected_version_revision,choice.expected_release_revision,
        choice.confirm,choice.acknowledge_untested,choice.request_id,fingerprint]
    }else{
      query="SELECT agentstudio.agent_release_delete_draft($1::uuid,$2::uuid,$3::text,$4::bigint,$5::boolean,$6::uuid,$7::text) AS item"
      args=[target,choice.version_id,choice.version_sha256,choice.expected_version_revision,choice.confirm,choice.request_id,fingerprint]
    }
    return result((await db.query<{item:unknown}>(query,args)).rows[0]?.item,target,choice.request_id)
  }
  private async acceptance(db:SqlClient,actor:string,target:string,choice:Extract<AgentReleaseChoice,{action:"acceptance"}>,fingerprint:string){
    const owned=(await db.query<{spec:unknown;revision:string|number}>("SELECT spec,revision FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[target,actor])).rows[0]
    if(!owned)throw new HttpError(404,"agent_release_not_found")
    const current=object((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_workspace($1::uuid) AS item",[target])).rows[0]?.item)
    if(Number(owned.revision)!==choice.expected_spec_revision||current.source_sha256!==choice.source_sha256)throw new HttpError(409,"agent_release_source_changed")
    const stored=parseAgentReleaseStoredSpec(owned.spec),binding=choice.model_binding??stored.validated.model_binding
    if(!binding)throw new HttpError(409,"agent_release_model_required")
    await verifyAgentSpecResources(db,actor,{...stored.validated,model_binding:binding})
    const run=await this.agents.admitOwned(db,actor,target,{expected_revision:choice.expected_spec_revision,instruction:choice.instruction,max_steps:choice.max_steps,
      idempotency_key:"release_acceptance_"+choice.request_id},randomUUID(),binding)
    return result((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_acceptance($1::uuid,$2::uuid,$3::bigint,$4::text,$5::uuid,$6::text) AS item",
      [target,run.run.id,choice.expected_spec_revision,choice.source_sha256,choice.request_id,fingerprint])).rows[0]?.item,target,choice.request_id)
  }
  private async currentAcceptance(db:SqlClient,actor:string,target:string,runId:string,sourceSha:string):Promise<boolean>{
    const raw=(await db.query<{item:unknown}>("SELECT agentstudio.agent_release_acceptance_status($1::uuid,$2::uuid) AS item",[target,runId])).rows[0]?.item
    if(raw===null)return false
    const acceptance=object(raw)
    if(acceptance.status!=="succeeded"||acceptance.source_sha256!==sourceSha)return false
    const current=object((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_workspace($1::uuid) AS item",[target])).rows[0]?.item)
    if(current.source_sha256!==sourceSha)return false
    const row=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[runId,actor])).rows[0]
    if(!row||row.kind!=="agent"||row.agent_spec_id!==target||row.status!=="succeeded")return false
    try{
      const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction)
      if(state.execution_mode!=="agent_native_v2"||Number(acceptance.spec_revision)!==state.spec_revision||
        Number(acceptance.max_steps)!==state.graph.nodes[1]?.data.max_steps||workflowAgentJson(acceptance.model_binding)!==workflowAgentJson(state.graph.nodes[1]?.data.model_binding)||
        createHash("sha256").update(row.instruction).digest("hex")!==acceptance.instruction_sha256||
        inspectWorkflowV2Checkpoint(state.graph,state.machine).status!=="succeeded")return false
      await verifyWorkflowV2Snapshot(db,actor,row,state)
    }catch(error){if(error instanceof HttpError&&[400,404,409].includes(error.status))return false;throw error}
    const complete=(await db.query<{ok:boolean}>("SELECT EXISTS(SELECT 1 FROM agentstudio.run_steps WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key='wf2_00002_agent' AND status='succeeded') AND "+
      "EXISTS(SELECT 1 FROM agentstudio.run_steps WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND status='succeeded' AND metadata->>'agent_phase'='model') AS ok",[runId,actor])).rows[0]?.ok
    return complete===true&&await currentKnowledgeObservations(db,runId)
  }
  private async stageTest(db:SqlClient,actor:string,target:string,run:string,sourceSha:string,kind:"snapshot"|"publish"){
    if(!await this.currentAcceptance(db,actor,target,run,sourceSha))throw new HttpError(409,"agent_release_acceptance_unavailable")
    await db.query("SELECT set_config('agentstudio.release_checked_test',jsonb_build_object('actor',$1::uuid,'spec',$2::uuid,'run',$3::uuid,'source_sha256',$4::text,'kind',$5::text,'transaction',txid_current()::text)::text,true)",
      [actor,target,run,sourceSha,kind])
  }
  private async restore(db:SqlClient,actor:string,target:string,choice:Extract<AgentReleaseChoice,{action:"restore"}>,fingerprint:string){
    const version=await this.ownedDetail(db,target,choice.version_id),stored=parseAgentReleaseStoredSpec(version.spec_snapshot)
    // Match create/update's resource-before-role lock order. Historical refs
    // never restore a deleted, revoked, untested or changed owned resource.
    await verifyAgentSpecResources(db,actor,stored.validated)
    const owned=(await db.query("SELECT id FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR UPDATE",[target,actor])).rows[0]
    if(!owned)throw new HttpError(404,"agent_release_not_found")
    const prepared=object((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_restore_prepare($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::bigint,$7::boolean,$8::text,$9::uuid,$10::text) AS item",
      [target,choice.version_id,choice.expected_spec_revision,choice.source_sha256,choice.version_sha256,choice.expected_version_revision,choice.confirm,choice.reason,choice.request_id,fingerprint])).rows[0]?.item)
    if(prepared.replayed===true)return result(prepared.result,target,choice.request_id)
    if(prepared.replayed!==false||typeof prepared.name!=="string"||prepared.name!==version.name||JSON.stringify(prepared.spec_snapshot)!==JSON.stringify(version.spec_snapshot))
      throw new HttpError(409,"agent_release_version_changed")
    await db.query("UPDATE agentstudio.agent_specs SET name=$3::text,spec=$4::jsonb,requires_approval=true,revision=revision+1,updated_at=clock_timestamp() "+
      "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND revision=$5::bigint",[target,actor,prepared.name,JSON.stringify(stored.snapshot),choice.expected_spec_revision])
    return result((await db.query<{item:unknown}>("SELECT agentstudio.agent_release_restore_finish($1::uuid,$2::uuid,$3::text) AS item",[target,choice.request_id,fingerprint])).rows[0]?.item,target,choice.request_id)
  }
}
