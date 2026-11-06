// Data-only trial admission. Every effect still needs the original run approval.
import {HttpError,isUuid,safeWorkflowGraph,type WorkflowGraph} from './contracts.ts'
import type {WorkflowNodeDataV2} from './workflow-graph-v2.ts'
import {canonicalMcpJson} from './mcp-catalog.ts'
export const TOOL_TRIAL_EFFECT_ACK='APPROVE_ONE_OWNER_TOOL_TRIAL_EFFECT' as const
export const TOOL_TRIAL_FEE_ACK='APPROVE_ONE_OWNER_TOOL_TRIAL_POSSIBLE_CHARGES' as const
export type TrialTool='calculate'|'summarize'|'knowledge_search'|'web_fetch'|'web_search'
export type TrialTarget=
 |({kind:'builtin';tool:TrialTool}&Pick<WorkflowNodeDataV2,'model_binding'|'knowledge_base_ids'|'knowledge_retrieval'>)
 |{kind:'http';binding:NonNullable<WorkflowNodeDataV2['tool_binding']>}
 |{kind:'mcp';binding:NonNullable<WorkflowNodeDataV2['mcp_binding']>}
export type ToolTrialRequest={purpose:'tool';request_id:string;target:TrialTarget;arguments_json:string;effect_consent:typeof TOOL_TRIAL_EFFECT_ACK;fee_consent?:typeof TOOL_TRIAL_FEE_ACK}
function invalid():never{throw new HttpError(400,'invalid_tool_trial')}
export function trialObject(raw:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
 const keys=Reflect.ownKeys(raw),descriptors=Object.getOwnPropertyDescriptors(raw)
 if(keys.some(key=>typeof key!=='string'||![...required,...optional].includes(key))||required.some(key=>!keys.includes(key)))invalid()
 const result:Record<string,unknown>={}
 for(const key of keys){if(typeof key!=='string')invalid();const descriptor=descriptors[key];if(!descriptor?.enumerable||!('value'in descriptor))invalid();result[key]=descriptor.value}
 return result
}
function argumentsObject(value:unknown,level=0):void{
 if(level>12)invalid()
 if(value&&typeof value==='object'){
  if(Object.keys(value).length>100)invalid()
  for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))invalid();argumentsObject(item,level+1)}
 }else if(typeof value==='string'&&value.includes('\0')||typeof value==='number'&&!Number.isFinite(value))invalid()
}
function graphForData(data:Omit<WorkflowNodeDataV2,'title'>):WorkflowGraph{
 return safeWorkflowGraph({version:2,description:'本人独立工具试调',nodes:[
  {id:'trial_start',type:'start',position:{x:0,y:0},data:{title:'开始'}},
  {id:'trial_tool',type:'tool',position:{x:240,y:0},data:{title:'试调工具',...data}},
  {id:'trial_end',type:'end',position:{x:480,y:0},data:{title:'结果',output_template:'{{试调工具.output}}'}},
 ],edges:[{id:'trial_in',source:'trial_start',target:'trial_tool'},{id:'trial_out',source:'trial_tool',target:'trial_end'}]})
}
export function toolTrialData(target:TrialTarget):Omit<WorkflowNodeDataV2,'title'>{
 if(target.kind==='http')return {tool_binding:target.binding}
 if(target.kind==='mcp')return {mcp_binding:target.binding}
 const {kind,...configuration}=target;return configuration
}
export function toolTrialRequiresFeeConsent(target:TrialTarget):boolean{return target.kind!=='builtin'||target.tool!=='calculate'}
export function safeToolTrialRequest(raw:unknown):ToolTrialRequest{
 const value=trialObject(raw,['purpose','request_id','target','arguments_json','effect_consent'],['fee_consent'])
 if(value.purpose!=='tool'||!isUuid(value.request_id)||value.effect_consent!==TOOL_TRIAL_EFFECT_ACK||typeof value.arguments_json!=='string'||value.arguments_json.length>12000||value.arguments_json.includes('\0'))invalid()
 let args:unknown;try{args=JSON.parse(value.arguments_json)}catch{invalid()}
 if(!args||typeof args!=='object'||Array.isArray(args))invalid();argumentsObject(args)
 const target=trialObject(value.target,['kind'],['tool','binding','model_binding','knowledge_base_ids','knowledge_retrieval'])
 let normalized:TrialTarget
 if(target.kind==='builtin'){
  trialObject(target,['kind','tool'],['model_binding','knowledge_base_ids','knowledge_retrieval'])
  if(typeof target.tool!=='string'||!['calculate','summarize','knowledge_search','web_fetch','web_search'].includes(target.tool))invalid()
  const data=graphForData(toolTrialData(target as TrialTarget)).nodes[1]!.data
  const {title,params_template,...configuration}=data;normalized={kind:'builtin',...configuration} as TrialTarget
 }else if(target.kind==='http'||target.kind==='mcp'){
  trialObject(target,['kind','binding']);const kind=target.kind,configuration=kind==='http'?{tool_binding:target.binding}:{mcp_binding:target.binding}
  const data=graphForData(configuration as Omit<WorkflowNodeDataV2,'title'>).nodes[1]!.data
  normalized=kind==='http'?{kind,binding:data.tool_binding!}:{kind,binding:data.mcp_binding!}
 }else invalid()
 const paid=toolTrialRequiresFeeConsent(normalized)
 if(paid?value.fee_consent!==TOOL_TRIAL_FEE_ACK:value.fee_consent!==undefined)invalid()
 const canonical=canonicalMcpJson(args)
 // Braces inside JSON strings remain literal arguments, never workflow refs.
 if(canonical.replaceAll('{{','\\u007b\\u007b').length>12000)invalid()
 return {purpose:'tool',request_id:value.request_id.toLowerCase(),target:normalized,arguments_json:canonical,effect_consent:TOOL_TRIAL_EFFECT_ACK,...(paid?{fee_consent:TOOL_TRIAL_FEE_ACK}:{})}
}
export function toolTrialGraph(request:ToolTrialRequest):WorkflowGraph{
 return graphForData({...toolTrialData(request.target),params_template:request.arguments_json.replaceAll('{{','\\u007b\\u007b')})
}
export function toolTrialPublicTarget(target:TrialTarget){
 if(target.kind==='builtin')return {kind:target.kind,tool:target.tool}
 if(target.kind==='http')return {kind:target.kind,connection_id:target.binding.connection_id,connection_revision:target.binding.connection_revision}
 return {kind:target.kind,connection_id:target.binding.connection_id,connection_revision:target.binding.connection_revision,tool_name:target.binding.tool_name,catalog_sha256:target.binding.catalog_sha256}
}
