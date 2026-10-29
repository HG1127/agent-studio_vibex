// Browser transport only. Each explicit action sends at most one request.
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowObject as object,agentPlanWorkflowText as text,agentPlanWorkflowId as id,
  agentPlanWorkflowLimits as limits,agentPlanWorkflowJsonValue as json,canonicalAgentPlanWorkflowValue as canonical,freezeAgentPlanWorkflowValue as freeze,
  parseAgentPlanWorkflowModel,parseAgentPlanWorkflowSource,parseAgentPlanWorkflowChoice,parseAgentPlanWorkflowSubmission,parseAgentPlanWorkflowSaveIntent,
  agentPlanWorkflowFeeAcknowledgement,agentPlanWorkflowSaveAcknowledgement,agentPlanWorkflowPaidIntentValue,agentPlanWorkflowSaveIntentValue,
  type AgentPlanWorkflowModel,type AgentPlanWorkflowSubmission} from "../../services/pg-api/src/agent-plan-workflow-contract.ts"
import {prepareAgentPlanWorkflowInput} from "../../services/pg-api/src/agent-plan-workflow-result.ts"
import {parseAgentPlanWorkflowPrepared,parseAgentPlanWorkflowReceipt,parseAgentPlanWorkflowView,parseAgentPlanWorkflowControl,
  parseAgentPlanWorkflowControlReceipt,parseAgentPlanWorkflowSavePreviewInput,parseAgentPlanWorkflowSavePreview,parseAgentPlanWorkflowSaveReceipt,
  type AgentPlanWorkflowPrepared,type AgentPlanWorkflowSavePreview} from "../../services/pg-api/src/agent-plan-workflow-rpc-contract.ts"
export type {AgentPlanWorkflowPrepared,AgentPlanWorkflowReceipt,AgentPlanWorkflowView,AgentPlanWorkflowSavePreview} from "../../services/pg-api/src/agent-plan-workflow-rpc-contract.ts"
export type AgentPlanWorkflowSelection={purpose:typeof purpose;spec_id:string;generation_model:AgentPlanWorkflowModel}
export class PgNativeAgentPlanWorkflowError extends Error{
  readonly status:number;readonly code:string;readonly definitive:boolean
  constructor(status:number,code:string,definitive=false){super(code);this.name="PgNativeAgentPlanWorkflowError";this.status=status;this.code=code;this.definitive=definitive}
}
const invalid=():never=>{throw new PgNativeAgentPlanWorkflowError(503,"invalid_agent_plan_workflow_response")}
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
export async function agentPlanWorkflowDigest(value:unknown){
  const bytes=new TextEncoder().encode(canonical(value)),hash=await crypto.subtle.digest("SHA-256",bytes)
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("")
}
export function parseAgentPlanWorkflowSelection(raw:unknown):AgentPlanWorkflowSelection{
  const v=object(raw,["purpose","spec_id","generation_model"]);if(v.purpose!==purpose)throw Error("invalid_agent_plan_workflow_selection")
  return freeze({purpose,spec_id:id(v.spec_id),generation_model:parseAgentPlanWorkflowModel(v.generation_model)})
}
export function parseAgentPlanWorkflowSourceResponse(raw:unknown){
  const v=object(raw,["protocol","purpose","source","name","generation_model","recorded"]),name=text(v.name,120,true)
  if(v.protocol!=="agent_plan_workflow_source_v1"||v.purpose!==purpose||v.recorded!==false||name!==name.trim())return invalid()
  return freeze({protocol:"agent_plan_workflow_source_v1" as const,purpose,source:parseAgentPlanWorkflowSource(v.source),name,generation_model:parseAgentPlanWorkflowModel(v.generation_model),recorded:false as const})
}
/** Bounded complete JSON, including escaped duplicate-key and -0 rejection. */
export function parseAgentPlanWorkflowTransportJson(raw:string):unknown{
  if(typeof raw!=="string"||raw.length>limits.valueBytes||new TextEncoder().encode(raw).length>limits.valueBytes||raw.charCodeAt(0)===0xfeff)return invalid()
  let at=0,values=0
  const space=()=>{while(/[\x20\t\r\n]/.test(raw[at]??"!"))at++}
  const string=():string=>{const start=at++;while(at<raw.length){const c=raw[at++];if(c==="\\"){at++;continue}if(c==='"'){try{return text(JSON.parse(raw.slice(start,at)),limits.valueBytes)}catch{return invalid()}}}return invalid()}
  const value=(depth:number):unknown=>{
    space();if(depth>limits.depth||++values>limits.values)return invalid()
    if(raw[at]==='"')return string()
    if(raw[at]==="{"){
      at++;space();const out=Object.create(null) as Record<string,unknown>;if(raw[at]==="}"){at++;return out}
      for(;;){space();if(raw[at]!=='"')return invalid();const key=string();if(Object.hasOwn(out,key)||["__proto__","constructor","prototype"].includes(key))return invalid();space();if(raw[at++]!==":")return invalid();out[key]=value(depth+1);space();const end=raw[at++];if(end==="}")return out;if(end!==",")return invalid()}
    }
    if(raw[at]==="["){at++;space();const out:unknown[]=[];if(raw[at]==="]"){at++;return out}for(;;){if(out.length>=limits.array)return invalid();out.push(value(depth+1));space();const end=raw[at++];if(end==="]")return out;if(end!==",")return invalid()}}
    for(const [token,literal]of [["true",true],["false",false],["null",null]] as const)if(raw.startsWith(token,at)){at+=token.length;return literal}
    const token=raw.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!token)return invalid();at+=token[0].length;const n=Number(token[0]);if(!Number.isFinite(n)||Object.is(n,-0))return invalid();return n
  }
  const result=value(0);space();if(at!==raw.length)return invalid();return json(result)
}
export function agentPlanWorkflowSubmitBody(raw:AgentPlanWorkflowPrepared,requestId:string):AgentPlanWorkflowSubmission{
  const p=parseAgentPlanWorkflowPrepared(raw),{action:_action,...choice}=p.choice
  return parseAgentPlanWorkflowSubmission({...choice,action:"submit",request_id:id(requestId),expected_input_sha256:p.input_sha256,confirm:true,fee_acknowledgement:agentPlanWorkflowFeeAcknowledgement})
}
export function agentPlanWorkflowSaveBody(raw:AgentPlanWorkflowSavePreview,rawInput:unknown,requestId:string){
  const p=parseAgentPlanWorkflowSavePreview(raw),preview_input=parseAgentPlanWorkflowSavePreviewInput(rawInput)
  if(preview_input.generation_request_id!==p.generation_request_id||preview_input.expected_result_sha256!==p.result_sha256||preview_input.edits&&!same(preview_input.edits,p.candidate))throw Error("invalid_agent_plan_workflow_save_input")
  const intent=parseAgentPlanWorkflowSaveIntent({action:"save",purpose,request_id:id(requestId),generation_request_id:p.generation_request_id,source:p.source,
    expected_result_sha256:p.result_sha256,expected_preview_sha256:p.preview_sha256,expected_candidate_sha256:p.candidate_sha256,confirm:true,save_acknowledgement:agentPlanWorkflowSaveAcknowledgement})
  return freeze({intent,preview_input})
}
export function createPgNativeAgentPlanWorkflowApi(config:{transport?:typeof fetch;rootPath?:""|"/__pg_native";timeoutMs?:number}={}){
  if(Object.keys(object(config)).some(key=>!["transport","rootPath","timeoutMs"].includes(key)))throw Error("invalid_agent_plan_workflow_transport")
  const send=config.transport??fetch,root=config.rootPath??"/__pg_native",budget=config.timeoutMs??8000
  if(typeof send!=="function"||root!==""&&root!=="/__pg_native"||!Number.isSafeInteger(budget)||budget<1||budget>8000)throw Error("invalid_agent_plan_workflow_transport")
  async function request<T>(path:string,method:"GET"|"POST",body:unknown,parse:(raw:unknown)=>T|Promise<T>,signal?:AbortSignal):Promise<T>{
    const data=body===undefined?undefined:JSON.stringify(json(body));if(data!==undefined&&new TextEncoder().encode(data).length>limits.valueBytes)throw Error("invalid_agent_plan_workflow_request")
    const timeout=new AbortController(),active=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal
    const unknown=()=>new PgNativeAgentPlanWorkflowError(0,"agent_plan_workflow_outcome_unknown")
    let rejectAbort:(error:Error)=>void=()=>{},reader:ReadableStreamDefaultReader<Uint8Array>|null=null,responseBody:ReadableStream<Uint8Array>|null=null
    const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject}),onAbort=()=>rejectAbort(unknown()),timer=setTimeout(()=>timeout.abort(),budget)
    active.addEventListener("abort",onAbort,{once:true})
    try{
      if(active.aborted)throw unknown()
      const res=await Promise.race([send(root+"/api/v2/agent-plan-workflow/"+path,{method,body:data,credentials:"same-origin",redirect:"error",cache:"no-store",referrerPolicy:"no-referrer",signal:active,
        headers:{Accept:"application/json",...(method==="POST"?{"Content-Type":"application/json","X-AgentStudio-Request":"1"}:{})}}),aborted])
      if(!(res instanceof Response)||res.redirected)return invalid();responseBody=res.body
      if(res.status===401||res.status===403)throw new PgNativeAgentPlanWorkflowError(res.status,res.status===401?"session_required":"agent_plan_workflow_access_denied",true)
      if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(res.headers.get("content-type")??"")||!res.body)return invalid()
      const length=res.headers.get("content-length");if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>limits.valueBytes))return invalid()
      const stream=res.body.getReader();reader=stream
      const read=async()=>{
        let size=0;const chunks:Uint8Array[]=[]
        for(;;){const c=await stream.read();if(active.aborted)throw unknown();if(c.done)break;size+=c.value.byteLength;if(size>limits.valueBytes)return invalid();chunks.push(c.value)}
        if(length!==null&&size!==Number(length))return invalid()
        const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
        let raw:unknown;try{raw=parseAgentPlanWorkflowTransportJson(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}catch{return invalid()}
        if(res.status!==200)throw new PgNativeAgentPlanWorkflowError(res.status,res.status>=500?"agent_plan_workflow_outcome_unknown":"agent_plan_workflow_request_refused",[400,404,405,409,413,415,422,429].includes(res.status))
        try{return await parse(raw)}catch{return invalid()}
      }
      return await Promise.race([read(),aborted])
    }catch(error){if(error instanceof PgNativeAgentPlanWorkflowError)throw error;throw unknown()}
    finally{clearTimeout(timer);active.removeEventListener("abort",onAbort);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock()}catch{}}else if(responseBody)void responseBody.cancel().catch(()=>{})}
  }
  async function receipt(raw:unknown,v:AgentPlanWorkflowSubmission,confirm:boolean){
    const r=parseAgentPlanWorkflowReceipt(raw)
    if(r.request_id!==v.request_id||r.request_sha256!==await agentPlanWorkflowDigest(agentPlanWorkflowPaidIntentValue(v))||r.input_sha256!==v.expected_input_sha256||!same(r.source,v.source)||!same(r.generation_model,v.generation_model)||r.output_token_limit!==v.output_token_limit||confirm&&!r.replayed)return invalid()
    return r
  }
  async function controlReceipt(raw:unknown,v:ReturnType<typeof parseAgentPlanWorkflowControl>,confirm:boolean){
    const r=parseAgentPlanWorkflowControlReceipt(raw)
    if(r.request_id!==v.request_id||r.generation_request_id!==v.generation_request_id||r.action!==v.action||r.request_sha256!==await agentPlanWorkflowDigest({protocol:"agent_plan_workflow_control_intent_v1",purpose,intent:v,authority:false})||confirm&&!r.replayed)return invalid()
    return r
  }
  async function saveReceipt(raw:unknown,v:ReturnType<typeof parseAgentPlanWorkflowSaveIntent>,confirm:boolean){
    const r=parseAgentPlanWorkflowSaveReceipt(raw)
    if(r.request_id!==v.request_id||r.generation_request_id!==v.generation_request_id||r.request_sha256!==await agentPlanWorkflowDigest(agentPlanWorkflowSaveIntentValue(v))||!same(r.source,v.source)||r.result_sha256!==v.expected_result_sha256||r.preview_sha256!==v.expected_preview_sha256||r.candidate_sha256!==v.expected_candidate_sha256||confirm&&!r.replayed)return invalid()
    return r
  }
  return Object.freeze({
    source(raw:unknown,signal?:AbortSignal){const s=parseAgentPlanWorkflowSelection(raw);return request("source","POST",s,value=>{const r=parseAgentPlanWorkflowSourceResponse(value);if(r.source.spec_id!==s.spec_id||!same(r.generation_model,s.generation_model))return invalid();return r},signal)},
    preview(raw:unknown,signal?:AbortSignal){const choice=parseAgentPlanWorkflowChoice(raw);return request("preview","POST",choice,async value=>{
      const p=parseAgentPlanWorkflowPrepared(value),built=prepareAgentPlanWorkflowInput(choice,p.source_values)
      if(!same(p.choice,choice)||p.input_sha256!==await agentPlanWorkflowDigest(built.input_value)||p.content_sha256!==await agentPlanWorkflowDigest(built.content_value))return invalid();return p
    },signal)},
    submit(raw:unknown,signal?:AbortSignal){const v=parseAgentPlanWorkflowSubmission(raw);return request("requests","POST",v,r=>receipt(r,v,false),signal)},
    confirm(raw:unknown,signal?:AbortSignal){const v=parseAgentPlanWorkflowSubmission(raw);return request("confirm","POST",v,r=>receipt(r,v,true),signal)},
    view(raw:string,signal?:AbortSignal){const key=id(raw);return request("requests/"+key,"GET",undefined,async raw=>{const v=parseAgentPlanWorkflowView(raw);if(v.receipt.request_id!==key||v.result&&v.result.result_sha256!==await agentPlanWorkflowDigest(v.result.value))return invalid();return v},signal)},
    control(raw:unknown,signal?:AbortSignal){const v=parseAgentPlanWorkflowControl(raw);return request("control","POST",v,r=>controlReceipt(r,v,false),signal)},
    confirmControl(raw:unknown,signal?:AbortSignal){const v=parseAgentPlanWorkflowControl(raw);return request("control/confirm","POST",v,r=>controlReceipt(r,v,true),signal)},
    previewSave(raw:unknown,signal?:AbortSignal){const v=parseAgentPlanWorkflowSavePreviewInput(raw);return request("preview-save","POST",v,async raw=>{
      const p=parseAgentPlanWorkflowSavePreview(raw),candidate={protocol:"agent_plan_workflow_candidate_v1",purpose,source:p.source,...p.candidate},
        binding={generation_request_id:p.generation_request_id,purpose,source:p.source,input_sha256:p.input_sha256,result_sha256:p.result_sha256,model_versions_sha256:p.model_versions_sha256,candidate_sha256:p.candidate_sha256}
      if(p.generation_request_id!==v.generation_request_id||p.result_sha256!==v.expected_result_sha256||v.edits&&!same(p.candidate,v.edits)||p.candidate_sha256!==await agentPlanWorkflowDigest(candidate)||p.preview_sha256!==await agentPlanWorkflowDigest({protocol:"agent_plan_workflow_save_preview_binding_v1",...binding}))return invalid();return p
    },signal)},
    save(raw:unknown,signal?:AbortSignal){const w=object(raw,["intent","preview_input"]),intent=parseAgentPlanWorkflowSaveIntent(w.intent),preview_input=parseAgentPlanWorkflowSavePreviewInput(w.preview_input)
      if(intent.generation_request_id!==preview_input.generation_request_id||intent.expected_result_sha256!==preview_input.expected_result_sha256)throw Error("invalid_agent_plan_workflow_save_input")
      return request("save","POST",{intent,preview_input},r=>saveReceipt(r,intent,false),signal)},
    confirmSave(raw:unknown,signal?:AbortSignal){const intent=parseAgentPlanWorkflowSaveIntent(raw);return request("save/confirm","POST",{intent},r=>saveReceipt(r,intent,true),signal)},
  })
}
export type PgNativeAgentPlanWorkflowApi=ReturnType<typeof createPgNativeAgentPlanWorkflowApi>
