// Private, owner-scoped Tool Broker. No caller-selected URL, headers, identity
// or plaintext credential enters this protocol. No automatic effect retries.
import {HttpError,type Identity,type SqlClient,type SqlPool} from "./contracts.ts"
import {withActor} from "./repository.ts"
import {withModelBrokerActor} from "./model-broker-actor.ts"
import {decryptModelSecret} from "./model-connection-crypto.ts"
import {exactProviderEndpoint} from "./model-connection-probe.ts"
import {gatherWorkflowKeywordEvidence,requireCurrentKeywordStep} from "./knowledge-keyword-execution.ts"
import {KnowledgeQueryRepository} from "./knowledge-query-repository.ts"
import {executeKnowledgeTool} from "./knowledge-tool-execution.ts"
import {sharedKnowledgeScopeEnabled} from "./knowledge-scope-policy.ts"
import {inspectWorkflowV2Checkpoint} from "./workflow-v2-machine.ts"
import {checkedWorkflowV2StoredState} from "./workflow-v2-run-repository.ts"
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch,finishWorkflowEffectDispatch,WorkflowV2EffectLeaseIdentity} from "./workflow-v2-dispatch-guard.ts"
import {safeWorkflowV2ToolRequest,type WorkflowV2ToolRequest} from "./workflow-v2-tool-contract.ts"
import {prepareWorkflowTool,type WorkflowToolPlan,type ToolArguments} from "./workflow-v2-tool-plan.ts"
import {prepareWorkflowToolHttp,redactWorkflowToolResponse,type WorkflowToolHttpMaterial} from "./workflow-v2-tool-network.ts"
import {resolveMcpBinding} from "./mcp-binding-resources.ts"
import {validateMcpArguments} from "./mcp-validation.ts"
import {prepareMcpEgress} from "./mcp-network.ts"
import {mcpToolCallHeaders,type McpCallMaterial,type McpCallResult} from "./mcp-call.ts"
import {WorkflowKnownEffectFailure} from "./workflow-v2-effect-failure.ts"
import type {SelectedModelMaterial} from "./model-connection-executor.ts"
type ToolRow={id:string;revision:number|string;enabled:boolean;url:string;method:"GET"|"POST";body_template:string;timeout_s:number}
type ModelRow={revision:number|string;enabled:boolean;status:string;provider:SelectedModelMaterial["provider"];base_url:string;models:string[];
  api_key_ciphertext:Uint8Array;api_key_nonce:Uint8Array;api_key_tag:Uint8Array}
type HeaderRef={id:string;header_name:string;updated_at:Date|string}
type HeaderRow=HeaderRef&{value_ciphertext:Uint8Array;value_nonce:Uint8Array;value_tag:Uint8Array}
export type WorkflowToolExecutor={
  mcp?(material:McpCallMaterial,args:ToolArguments,signal:AbortSignal):Promise<McpCallResult>
  http?(material:WorkflowToolHttpMaterial,args:ToolArguments,signal:AbortSignal):Promise<string>
  webFetch?(url:string,signal:AbortSignal):Promise<string>
  webSearch?(query:string,limit:number,signal:AbortSignal):Promise<string>
  summarize?(material:SelectedModelMaterial,prompt:string,signal:AbortSignal):Promise<string>
}
function changed():never{throw new HttpError(409,"workflow_tool_configuration_changed")}
function searchOutput(mode:string,hits:unknown[]):string{
  const result:unknown[]=[]
  for(const hit of hits){if(JSON.stringify({mode,hits:[...result,hit]}).length>4000)break;result.push(hit)}
  return JSON.stringify({mode,hits:result})
}
async function workflowContext(db:SqlClient,owner:string,id:string,query:string):Promise<string>{
  const row=(await db.query<{instruction:string;checkpoint:unknown}>("SELECT instruction,checkpoint FROM agentstudio.runs "+
    "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[id,owner])).rows[0]!
  const state=checkedWorkflowV2StoredState(row.checkpoint,row.instruction),view=inspectWorkflowV2Checkpoint(state.graph,state.machine)
  const chunks=[{source:"任务指令",text:row.instruction},...(state.agent_state&&view.pending?.kind==="agent"?[{source:"Agent 输入",text:view.pending.input}]:[]),...view.nodes.filter(node=>node.output).map(node=>({
    source:state.graph.nodes.find(value=>value.id===node.id)!.data.title,text:node.output!.slice(0,1200)}))]
  const hits=chunks.flatMap(chunk=>{const pos=chunk.text.toLowerCase().indexOf(query.toLowerCase())
    return pos<0?[]:[{source:chunk.source,snippet:chunk.text.slice(Math.max(0,pos-80),pos+300)}]}).slice(0,8)
  return searchOutput("workflow_context_keyword",hits)
}
export class WorkflowV2ToolDispatch{
  readonly pool:SqlPool;readonly brokerPool:SqlPool;readonly key:Buffer;readonly executor:WorkflowToolExecutor
  readonly allowAutonomous:boolean;readonly allowAgent:boolean
  readonly knowledgeQueries:KnowledgeQueryRepository|null
  constructor(pool:SqlPool,key:Buffer,executor:WorkflowToolExecutor,brokerPool:SqlPool,options:{allowAutonomousExecution?:boolean;allowAgentExecution?:boolean;allowKnowledgeExecution?:boolean}={}){
    if(!Buffer.isBuffer(key)||key.length!==32||!executor||!brokerPool)throw Error("workflow_tool_dispatch_dependencies_required")
    this.pool=pool;this.key=key;this.executor=executor;this.brokerPool=brokerPool
    this.allowAutonomous=options.allowAutonomousExecution===true;this.allowAgent=options.allowAgentExecution===true
    if(options.allowKnowledgeExecution===true&&(pool.knowledgeToolRuntime!==true||pool.knowledgeQueryRuntime!==true))throw Error("workflow_knowledge_tool_disabled")
    this.knowledgeQueries=options.allowKnowledgeExecution===true?new KnowledgeQueryRepository(pool,{executionSourceApproved:true,allowAgentExecution:this.allowAgent,allowAutonomousExecution:this.allowAutonomous}):null
  }
  async dispatch(identity:Identity,raw:unknown):Promise<{status:"succeeded";text:string}>{
    const request=safeWorkflowV2ToolRequest(raw)
    const selected=await withActor(this.pool,identity,async(db,owner)=>{
      const pending=await verifyWorkflowEffectLease(db,owner,request,"tool",this.allowAgent,this.allowAutonomous),plan=prepareWorkflowTool(pending)
      let output:string|undefined,connection:ToolRow|undefined,model:Pick<ModelRow,"provider"|"base_url">|undefined,mcp:Awaited<ReturnType<typeof resolveMcpBinding>>|undefined,keywordRecorded=false
      let headerRefs:HeaderRef[]=[]
      if(plan.kind==="calculate")output=plan.output
      else if(plan.kind==="knowledge_search"){
        if(plan.retrieval){if(!this.knowledgeQueries)throw new WorkflowKnownEffectFailure("workflow_tool_adapter_unavailable")}
        else if(!plan.ids.length)output=await workflowContext(db,owner,request.claim.run_id,plan.query)
      }else{
        const operation=plan.kind==="mcp"?this.executor.mcp:plan.kind==="http"?this.executor.http:plan.kind==="summarize"?this.executor.summarize:
          plan.kind==="web_fetch"?this.executor.webFetch:this.executor.webSearch
        if(typeof operation!=="function")throw new WorkflowKnownEffectFailure("workflow_tool_adapter_unavailable")
      }
      if(plan.kind==="http"){
        connection=(await db.query<ToolRow>("SELECT id,revision,enabled,url,method,body_template,timeout_s FROM agentstudio.tool_connections "+
          "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[plan.binding.connection_id,owner])).rows[0]
        if(!connection||Number(connection.revision)!==plan.binding.connection_revision)changed()
        if(!connection.enabled)throw new WorkflowKnownEffectFailure("workflow_tool_connection_disabled")
        const names=(await db.query<HeaderRef>("SELECT id,header_name,updated_at FROM agentstudio.tool_connection_headers "+
          "WHERE tool_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[connection.id,owner])).rows
        prepareWorkflowToolHttp({...connection,headers:names.map(row=>({key:row.header_name,value:""}))},plan.args)
        headerRefs=names
      }
      if(plan.kind==="summarize"){
        const metadata=(await db.query<ModelRow>("SELECT revision,enabled,status,provider,base_url,models FROM agentstudio.model_connections "+
          "WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[plan.binding.connection_id,owner])).rows[0]
        if(!metadata||Number(metadata.revision)!==plan.binding.connection_revision||!metadata.enabled||metadata.status!=="ok"||
           !Array.isArray(metadata.models)||!metadata.models.includes(plan.binding.model_id))changed()
        try{exactProviderEndpoint(metadata)}catch{changed()};model={provider:metadata.provider,base_url:metadata.base_url}
      }
      if(plan.kind==="mcp"){
        mcp=await resolveMcpBinding(db,owner,plan.binding,true)
        if(!await validateMcpArguments(mcp.definition,plan.args))throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")
        headerRefs=(await db.query<HeaderRef>("SELECT id,header_name,updated_at FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[mcp.row.id,owner])).rows
        try{
          prepareMcpEgress({url:mcp.row.url,headers:headerRefs.map(header=>({key:header.header_name,value:""}))})
          if(mcp.catalog.version==="2026-07-28")mcpToolCallHeaders(mcp.definition,plan.args)
        }catch{throw new WorkflowKnownEffectFailure("workflow_tool_input_invalid")}
      }
      await reserveWorkflowEffectDispatch(db,owner,request,"tool")
      if(plan.kind==="knowledge_search"&&!plan.retrieval&&plan.ids.length){
        const evidence=await gatherWorkflowKeywordEvidence(db,owner,plan.ids,plan.query,request)
        output=searchOutput(await sharedKnowledgeScopeEnabled(db)?"authorized_keyword":"owner_private_keyword",evidence.hits);keywordRecorded=evidence.recorded
      }
      return {plan,output,connection,model,headerRefs,mcp,owner,keywordRecorded}
    })
    // Every error from here is potentially ambiguous. Only pre-reservation
    // parsing/configuration failures may be reported as deterministic failures.
    let text="",failed=true,confirmedToolFailure=false
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
    try{
      const recheck=()=>withActor(this.pool,identity,async(db,owner)=>{
        await verifyWorkflowEffectLease(db,owner,request,"tool",this.allowAgent,this.allowAutonomous)
      })
      const execute=async()=>{
        const plan=selected.plan
        if(selected.output!==undefined)return selected.output
        if(plan.kind==="knowledge_search"&&plan.retrieval){
          await recheck()
          return executeKnowledgeTool(this.knowledgeQueries!,identity,selected.owner,request,{...plan,retrieval:plan.retrieval},controller.signal)
        }
        if(plan.kind==="mcp"){
          const current=await withActor(this.pool,identity,async(db,owner)=>resolveMcpBinding(db,owner,plan.binding))
          if(current.row.url!==selected.mcp!.row.url)changed()
          const material=await withModelBrokerActor(this.brokerPool,identity,async(db,owner)=>{
            const headers=(await db.query<HeaderRow>("SELECT id,header_name,updated_at,value_ciphertext,value_nonce,value_tag FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[current.row.id,owner])).rows
            if(headers.length!==selected.headerRefs.length||headers.length>20||headers.some((header,index)=>header.id!==selected.headerRefs[index]!.id||header.header_name!==selected.headerRefs[index]!.header_name||String(header.updated_at)!==String(selected.headerRefs[index]!.updated_at)))changed()
            return {url:current.row.url,version:current.catalog.version,definition:current.definition,headers:headers.map(header=>{
              const value=JSON.parse(decryptModelSecret({ciphertext:Buffer.from(header.value_ciphertext),nonce:Buffer.from(header.value_nonce),tag:Buffer.from(header.value_tag)},this.key))
              if(!value||Object.keys(value).length!==1||typeof value.value!=="string")changed()
              return {key:header.header_name,value:value.value as string}
            })}
          })
          await recheck()
          const result=await this.executor.mcp!(material,plan.args,controller.signal)
          if(!result||Object.keys(result).length!==2||typeof result.text!=="string"||typeof result.isError!=="boolean")throw Error("invalid_mcp_call_result")
          confirmedToolFailure=result.isError
          const secrets=material.headers.flatMap(header=>[header.value,/^(?:Bearer|Basic)\s+(.+)$/i.exec(header.value)?.[1]??""]).filter(Boolean)
          return redactWorkflowToolResponse(result.text,secrets).slice(0,4000)
        }
        if(plan.kind==="http"){
          // Recheck current metadata with the API login. The credential Broker
          // retains only its existing header-column grants, no Tool table grant.
          const row=await withActor(this.pool,identity,async(db,owner)=>{
            const current=(await db.query<ToolRow>("SELECT id,revision,enabled,url,method,body_template,timeout_s FROM agentstudio.tool_connections "+
              "WHERE id=$1::uuid AND owner_user_id=$2::uuid",[plan.binding.connection_id,owner])).rows[0],previous=selected.connection!
            if(!current||!current.enabled||Number(current.revision)!==plan.binding.connection_revision||
               current.url!==previous.url||current.method!==previous.method||current.body_template!==previous.body_template||current.timeout_s!==previous.timeout_s)changed()
            return current
          })
          const material=await withModelBrokerActor(this.brokerPool,identity,async(db,owner)=>{
            const encrypted=(await db.query<HeaderRow>("SELECT id,header_name,updated_at,value_ciphertext,value_nonce,value_tag FROM agentstudio.tool_connection_headers "+
              "WHERE tool_connection_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY header_name",[row.id,owner])).rows
            if(encrypted.length!==selected.headerRefs.length||encrypted.length>20||encrypted.some((header,index)=>{
              const expected=selected.headerRefs[index]!
              return header.id!==expected.id||header.header_name!==expected.header_name||String(header.updated_at)!==String(expected.updated_at)
            }))changed()
            const headers=encrypted.map(header=>{
              const value=JSON.parse(decryptModelSecret({ciphertext:Buffer.from(header.value_ciphertext),nonce:Buffer.from(header.value_nonce),tag:Buffer.from(header.value_tag)},this.key)) as {value:unknown}
              if(!value||Object.keys(value).length!==1||typeof value.value!=="string")changed()
              return {key:header.header_name,value:value.value}
            })
            return {...row,headers}
          })
          await recheck()
          return this.executor.http!(material,plan.args,controller.signal)
        }
        if(plan.kind==="summarize"){
          const material=await withModelBrokerActor(this.brokerPool,identity,async(db,owner)=>{
            const row=(await db.query<ModelRow>("SELECT revision,enabled,status,provider,base_url,models,api_key_ciphertext,api_key_nonce,api_key_tag "+
              "FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid",[plan.binding.connection_id,owner])).rows[0]
            if(!row||!row.enabled||row.status!=="ok"||Number(row.revision)!==plan.binding.connection_revision||
               row.provider!==selected.model!.provider||row.base_url!==selected.model!.base_url||!row.models.includes(plan.binding.model_id))changed()
            return {provider:row.provider,base_url:row.base_url,model_id:plan.binding.model_id,api_key:decryptModelSecret({
              ciphertext:Buffer.from(row.api_key_ciphertext),nonce:Buffer.from(row.api_key_nonce),tag:Buffer.from(row.api_key_tag)},this.key)}
          })
          await recheck()
          return this.executor.summarize!(material,plan.prompt,controller.signal)
        }
        await recheck()
        if(plan.kind==="web_fetch")return this.executor.webFetch!(plan.url,controller.signal)
        if(plan.kind==="web_search")return this.executor.webSearch!(plan.query,plan.limit,controller.signal)
        throw Error("workflow_tool_operation_unavailable")
      }
      text=await Promise.race([execute(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
        controller.abort();reject(Error("workflow_tool_timeout"))},25000)})])
      if(typeof text!=="string"||!text.trim()||text.length>12000||text.includes("\0"))throw Error("invalid_workflow_tool_result")
      // No result based on an expired earlier observation may publish, even
      // when the effect completed while the source was being revoked/edited.
      await withActor(this.pool,identity,async(db,owner)=>{
        await verifyWorkflowEffectLease(db,owner,request,"tool",this.allowAgent,this.allowAutonomous)
        if(selected.keywordRecorded)await requireCurrentKeywordStep(db,request)
      })
      failed=false
    }catch{ /* Never retry a committed private dispatch. */ }finally{if(timer)clearTimeout(timer)}
    await finishWorkflowEffectDispatch(this.pool,identity,request,"tool",failed,confirmedToolFailure&&!failed)
    if(failed)throw new HttpError(503,"workflow_tool_outcome_unknown")
    if(confirmedToolFailure)throw new WorkflowKnownEffectFailure("workflow_mcp_tool_error")
    return {status:"succeeded",text}
  }
}
export class WorkflowV2ToolLeaseIdentity extends WorkflowV2EffectLeaseIdentity{
  constructor(pool:SqlPool){super(pool,"tool")}
}
export function verifiedWorkflowV2ToolDispatch(identity:WorkflowV2ToolLeaseIdentity,broker:WorkflowV2ToolDispatch){
  return async(raw:WorkflowV2ToolRequest)=>broker.dispatch(await identity.resolve(raw),raw)
}
