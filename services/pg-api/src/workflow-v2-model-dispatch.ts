// Private Broker only. Replays the sealed database state; the Worker cannot
// select the prompt, owner or connection. A second durable effect reservation
// fences repeated/concurrent RPCs before any decryption or paid provider POST.
import {HttpError,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import type {SelectedModelMaterial} from "./model-connection-executor.ts"
import {checkedWorkflowV2StoredState,verifyWorkflowV2Snapshot,auditWorkflowV2,
  workflowV2RunColumns,type WorkflowV2RunRow} from "./workflow-v2-run-repository.ts"
import {inspectWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {safeWorkflowV2ModelRequest,type WorkflowV2ModelRequest} from "./workflow-v2-model-contract.ts"
type Secret={revision:number|string;enabled:boolean;status:string;provider:SelectedModelMaterial["provider"];
  base_url:string;models:unknown;api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}
function changed():never{throw new HttpError(409,"workflow_model_state_changed")}
function models(value:unknown):string[]{
  if(typeof value==="string")try{value=JSON.parse(value)}catch{changed()}
  if(!Array.isArray(value)||value.some(item=>typeof item!=="string"))changed()
  return value as string[]
}
export class WorkflowV2ModelDispatch{
  readonly pool:SqlPool;readonly brokerPool:SqlPool;readonly key:Buffer
  readonly executor:(material:SelectedModelMaterial,prompt:string,signal:AbortSignal)=>Promise<string>
  constructor(pool:SqlPool,key:Buffer,executor:WorkflowV2ModelDispatch["executor"],brokerPool:SqlPool){
    if(!Buffer.isBuffer(key)||key.length!==32||typeof executor!=="function"||!brokerPool)
      throw Error("workflow_model_dispatch_dependencies_required")
    // Share the service-owned key so shutdown zeroizes this reference as well.
    this.pool=pool;this.key=key;this.executor=executor;this.brokerPool=brokerPool
  }
  async dispatch(identity:Identity,raw:unknown):Promise<{status:"succeeded";text:string}>{
    const request=safeWorkflowV2ModelRequest(raw),c=request.claim
    const dispatchKey="wf2_model:"+request.step_key
    const selected=await withActor(this.pool,identity,async(db,owner)=>{
      const job=(await db.query<{payload:{workflow_id:string;workflow_revision:number;graph_sha256:string}}>(
        "SELECT payload FROM agentstudio.jobs WHERE id=$1::uuid AND run_id=$2::uuid AND owner_user_id=$3::uuid "+
        "AND kind='workflow_tick' AND payload->>'phase'='workflow_native_v2' AND status='leased' "+
        "AND lease_token=$4::uuid AND lease_version=$5::bigint AND lease_owner=$6::text "+
        "AND lease_until>clock_timestamp() FOR UPDATE",
        [c.job_id,c.run_id,owner,c.lease_token,c.lease_version,c.lease_owner])).rows[0]
      if(!job)changed()
      const run=(await db.query<WorkflowV2RunRow>("SELECT "+workflowV2RunColumns+" FROM agentstudio.runs "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid AND kind='workflow' FOR UPDATE",[c.run_id,owner])).rows[0]
      if(!run||run.status!=="running")changed()
      const state=checkedWorkflowV2StoredState(run.checkpoint,run.instruction)
      if(state.stage!=="workflow_v2_effect_started"||run.workflow_id!==job.payload.workflow_id||
         state.workflow_revision!==Number(job.payload.workflow_revision)||state.machine.graph_sha256!==job.payload.graph_sha256)changed()
      await verifyWorkflowV2Snapshot(db,owner,run,state)
      const active=(await db.query<{status:string}>("SELECT status FROM agentstudio.users WHERE id=$1::uuid",[owner])).rows[0]
      if(active?.status!=="active")changed()
      const pending=inspectWorkflowV2Checkpoint(state.graph,state.machine).pending
      if(!pending||pending.kind!=="model"||pending.step_key!==request.step_key||pending.input_sha256!==request.input_sha256||
         state.machine.effects.some(item=>item.step_key===pending.step_key))changed()
      const approval=(await db.query<{status:string;reason_code:string}>("SELECT status,reason_code FROM agentstudio.approvals "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[c.run_id,owner,request.step_key])).rows[0]
      const effect=(await db.query<{status:string;arguments_sha256:string;tool_name:string}>(
        "SELECT status,arguments_sha256,tool_name FROM agentstudio.external_effects "+
        "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text FOR SHARE",[c.run_id,owner,request.step_key])).rows[0]
      if(approval?.status!=="approved"||approval.reason_code!=="wf2:"+request.input_sha256||
         effect?.status!=="started"||effect.arguments_sha256!==request.input_sha256||effect.tool_name!=="workflow:model")changed()
      const binding=pending.configuration.model_binding!
      const metadata=(await db.query<Secret>("SELECT revision,enabled,status,provider,base_url,models FROM agentstudio.model_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[binding.connection_id,owner])).rows[0]
      if(!metadata||Number(metadata.revision)!==binding.connection_revision||!metadata.enabled||metadata.status!=="ok"||
         !models(metadata.models).includes(binding.model_id))changed()
      try{exactProviderEndpoint(metadata)}catch{changed()}
      const reserved=await db.query("INSERT INTO agentstudio.external_effects "+
        "(run_id,owner_user_id,step_key,tool_name,arguments_sha256,idempotency_key,status) "+
        "VALUES($1::uuid,$2::uuid,$3::text,'workflow.model_bound_dispatch',$4::text,$5::text,'started') "+
        "ON CONFLICT DO NOTHING RETURNING step_key",
        [c.run_id,owner,dispatchKey,request.input_sha256,"workflow-model:"+c.run_id+":"+request.step_key])
      if(reserved.rows.length!==1)throw new HttpError(409,"workflow_model_already_dispatched")
      return {binding:{...binding},provider:metadata.provider,base_url:metadata.base_url,prompt:pending.input}
    })
    let text="",failed=true
    try{
      const material=await withModelBrokerActor(this.brokerPool,identity,async(db,owner)=>{
        const row=(await db.query<Secret>("SELECT revision,enabled,status,provider,base_url,models,"+
          "api_key_ciphertext,api_key_nonce,api_key_tag FROM agentstudio.model_connections "+
          "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[selected.binding.connection_id,owner])).rows[0]
        if(!row||Number(row.revision)!==selected.binding.connection_revision||!row.enabled||row.status!=="ok"||
           row.provider!==selected.provider||row.base_url!==selected.base_url||!models(row.models).includes(selected.binding.model_id))changed()
        return {provider:row.provider,base_url:row.base_url,model_id:selected.binding.model_id,
          api_key:decryptModelSecret({ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),
            tag:Buffer.from(row.api_key_tag)},this.key)}
      })
      const controller=new AbortController()
      let timer:ReturnType<typeof setTimeout>|undefined
      try{text=await Promise.race([this.executor(material,selected.prompt,controller.signal),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(Error("workflow_model_timeout"))},25000)
      })])}finally{if(timer)clearTimeout(timer)}
      if(typeof text!=="string"||!text.trim()||text.length>12000||text.includes("\0"))throw Error("invalid_workflow_model_output")
      failed=false
    }catch{ /* A committed reservation is never retried, including decryption failure. */ }
    try{
      await withActor(this.pool,identity,async(db,owner)=>{
        const result=await db.query("UPDATE agentstudio.external_effects SET status=$4::text,updated_at=clock_timestamp() "+
          "WHERE run_id=$1::uuid AND owner_user_id=$2::uuid AND step_key=$3::text AND status='started' "+
          "AND arguments_sha256=$5::text RETURNING step_key",[c.run_id,owner,dispatchKey,failed?"unknown":"succeeded",request.input_sha256])
        if(result.rows.length!==1)throw Error("workflow_model_commit_unknown")
        await auditWorkflowV2(db,owner,c.run_id,"workflow.v2_model_dispatch",{step_key:request.step_key,
          input_sha256:request.input_sha256,outcome:failed?"unknown":"succeeded"})
      })
    }catch{throw new HttpError(503,"workflow_model_outcome_unknown")}
    if(failed)throw new HttpError(503,"workflow_model_outcome_unknown")
    return {status:"succeeded",text}
  }
}

// Resolves owner only through the independently authenticated identity login.
export class WorkflowV2ModelLeaseIdentity{
  readonly pool:SqlPool
  constructor(pool:SqlPool){this.pool=pool}
  async resolve(raw:WorkflowV2ModelRequest):Promise<Identity>{
    const r=safeWorkflowV2ModelRequest(raw),c=r.claim,db=await this.pool.connect();let begun=false
    try{
      await db.query("BEGIN READ ONLY");begun=true
      await db.query("SET LOCAL ROLE agentstudio_bound_dispatch")
      const identity=(await db.query<Identity>("SELECT issuer,subject FROM agentstudio.workflow_model_lease_identity("+
        "$1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::text)",
        [c.run_id,c.job_id,c.lease_token,c.lease_version,c.lease_owner,r.step_key,r.input_sha256])).rows
      if(identity.length!==1||typeof identity[0]?.issuer!=="string"||!identity[0].issuer||identity[0].issuer.length>2048||
         typeof identity[0]?.subject!=="string"||!identity[0].subject||identity[0].subject.length>512||
         /[\u0000-\u001f\u007f]/.test(identity[0].issuer+identity[0].subject))throw Error("invalid_identity")
      await db.query("COMMIT");begun=false;return {issuer:identity[0].issuer,subject:identity[0].subject}
    }catch{if(begun)await db.query("ROLLBACK").catch(()=>undefined);throw new HttpError(403,"workflow_model_lease_denied")}
    finally{db.release()}
  }
}
export function verifiedWorkflowV2ModelDispatch(identity:WorkflowV2ModelLeaseIdentity,broker:WorkflowV2ModelDispatch){
  return async(raw:WorkflowV2ModelRequest)=>broker.dispatch(await identity.resolve(raw),raw)
}
