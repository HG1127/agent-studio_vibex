import {ownedNativeLocalImages} from './native-local-device-execution.ts'
import type {LocalResult} from '../../../shared/native-local-device-contract.mjs'
// Private Broker only. Replays the sealed database state; the Worker cannot
// select the prompt, owner or connection. A second durable effect reservation
// fences repeated/concurrent RPCs before any decryption or paid provider POST.
import {HttpError,type Identity,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import type {SelectedModelMaterial} from "./model-connection-executor.ts"
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch,finishWorkflowEffectDispatch,WorkflowV2EffectLeaseIdentity} from "./workflow-v2-dispatch-guard.ts"
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
  readonly allowAutonomous:boolean;readonly allowAgent:boolean;readonly agentExecutor?:WorkflowV2ModelDispatch["executor"]
  readonly nodeDebugExecutor?:WorkflowV2ModelDispatch["executor"]
  readonly localVisionExecutor?: (material:SelectedModelMaterial,input:{prompt:string;images:LocalResult["images"]},signal:AbortSignal)=>Promise<string>
  readonly allowMemory:boolean
  constructor(pool:SqlPool,key:Buffer,executor:WorkflowV2ModelDispatch["executor"],brokerPool:SqlPool,
    options:{allowAutonomousExecution?:boolean;allowAgentExecution?:boolean;allowMemoryExecution?:boolean;agentExecutor?:WorkflowV2ModelDispatch["executor"];nodeDebugExecutor?:WorkflowV2ModelDispatch["executor"];localVisionExecutor?:WorkflowV2ModelDispatch["localVisionExecutor"]}={}){
    if(!Buffer.isBuffer(key)||key.length!==32||typeof executor!=="function"||!brokerPool)
      throw Error("workflow_model_dispatch_dependencies_required")
    // Share the service-owned key so shutdown zeroizes this reference as well.
    this.pool=pool;this.key=key;this.executor=executor;this.brokerPool=brokerPool
    this.allowAutonomous=options.allowAutonomousExecution===true;this.allowAgent=options.allowAgentExecution===true;this.agentExecutor=options.agentExecutor
    this.localVisionExecutor=options.localVisionExecutor
    this.nodeDebugExecutor=options.nodeDebugExecutor
    this.allowMemory=options.allowMemoryExecution===true
  }
  async dispatch(identity:Identity,raw:unknown):Promise<{status:"succeeded";text:string}>{
    const request=safeWorkflowV2ModelRequest(raw)
    const selected=await withActor(this.pool,identity,async(db,owner)=>{
      const pending=await verifyWorkflowEffectLease(db,owner,request,"model",this.allowAgent,this.allowAutonomous,this.allowMemory,typeof this.localVisionExecutor==="function")
      if(pending.agent_context&&!this.agentExecutor)throw new HttpError(409,"workflow_agent_executor_unavailable")
      if(pending.node_debug&&!this.nodeDebugExecutor)throw new HttpError(409,"workflow_node_debug_executor_unavailable")
      const binding=pending.configuration.model_binding!
      const metadata=(await db.query<Secret>("SELECT revision,enabled,status,provider,base_url,models FROM agentstudio.model_connections "+
        "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[binding.connection_id,owner])).rows[0]
      if(!metadata||Number(metadata.revision)!==binding.connection_revision||!metadata.enabled||metadata.status!=="ok"||
         !models(metadata.models).includes(binding.model_id))changed()
      try{exactProviderEndpoint(metadata)}catch{changed()}
      await reserveWorkflowEffectDispatch(db,owner,request,"model")
      return {binding:{...binding},provider:metadata.provider,base_url:metadata.base_url,prompt:pending.input,agent:Boolean(pending.agent_context),nodeDebug:pending.node_debug}
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
      // Credential loading is a separate transaction. Re-check current grants
      // and the sealed lease after it, immediately before any paid request.
      const images=await withActor(this.pool,identity,async(db,owner)=>{
        const pending=await verifyWorkflowEffectLease(db,owner,request,"model",this.allowAgent,this.allowAutonomous,this.allowMemory,typeof this.localVisionExecutor==="function")
        if(pending.input!==selected.prompt)changed()
        return selected.agent&&request.execution_mode==="agent_native_v2"&&this.localVisionExecutor?ownedNativeLocalImages(db,request.claim.run_id):[]
      })
      const controller=new AbortController()
      let timer:ReturnType<typeof setTimeout>|undefined
      try{text=await Promise.race([(images.length?this.localVisionExecutor!(material,{prompt:selected.prompt,images},controller.signal):(selected.agent?this.agentExecutor!:selected.nodeDebug?this.nodeDebugExecutor!:this.executor)(material,selected.prompt,controller.signal)),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(Error("workflow_model_timeout"))},25000)
      })])}finally{if(timer)clearTimeout(timer)}
      if(typeof text!=="string"||!text.trim()||text.length>12000||text.includes("\0"))throw Error("invalid_workflow_model_output")
      await withActor(this.pool,identity,async(db,owner)=>{
        const pending=await verifyWorkflowEffectLease(db,owner,request,"model",this.allowAgent,this.allowAutonomous,this.allowMemory,typeof this.localVisionExecutor==="function")
        if(pending.input!==selected.prompt)changed()
      })
      failed=false
    }catch{ /* A committed reservation is never retried, including decryption failure. */ }
    await finishWorkflowEffectDispatch(this.pool,identity,request,"model",failed)
    if(failed)throw new HttpError(503,"workflow_model_outcome_unknown")
    return {status:"succeeded",text}
  }
}

// Resolves owner only through the independently authenticated identity login.
export class WorkflowV2ModelLeaseIdentity extends WorkflowV2EffectLeaseIdentity{
  constructor(pool:SqlPool){super(pool,"model")}
}
export function verifiedWorkflowV2ModelDispatch(identity:WorkflowV2ModelLeaseIdentity,broker:WorkflowV2ModelDispatch){
  return async(raw:WorkflowV2ModelRequest)=>broker.dispatch(await identity.resolve(raw),raw)
}
