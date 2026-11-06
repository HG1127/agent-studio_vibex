// F05 values only. Browser-safe; no identity, source proof, fee reservation,
// Worker lease, model call or save receipt can be minted by these parsers.
export const agentPlanWorkflowPurpose='agent_plan_to_workflow_draft' as const
export const agentPlanWorkflowFeeAcknowledgement='APPROVE_EXPLICIT_PAID_AGENT_PLAN_WORKFLOW_DRAFT_ONCE_V1' as const
export const agentPlanWorkflowSaveAcknowledgement='APPROVE_EXACT_AGENT_PLAN_WORKFLOW_DRAFT_SAVE_ONLY_V1' as const
export const agentPlanWorkflowOutputTokenLimits=Object.freeze([4096,8192,16384] as const)
export const agentPlanWorkflowLimits=Object.freeze({instruction:2000,name:120,modelJsonBytes:131072,valueBytes:524288,depth:24,values:15000,array:1000,generatedNodes:12,generatedEdges:30})
export class AgentPlanWorkflowValueError extends Error{
 readonly code='invalid_agent_plan_workflow_value'
 readonly status=400
 constructor(){super('invalid_agent_plan_workflow_value');this.name='AgentPlanWorkflowValueError'}
}
export const invalidAgentPlanWorkflowValue=():never=>{throw new AgentPlanWorkflowValueError()}
export function agentPlanWorkflowObject(raw:unknown,keys?:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return invalidAgentPlanWorkflowValue()
 const names=Reflect.ownKeys(raw),descriptors=Object.getOwnPropertyDescriptors(raw)
 if(keys&&(names.length!==keys.length||keys.some(key=>!Object.hasOwn(descriptors,key))))return invalidAgentPlanWorkflowValue()
 const out=Object.create(null) as Record<string,unknown>
 for(const key of names){if(typeof key!=='string'||keys&&!keys.includes(key)||['__proto__','constructor','prototype'].includes(key)||!descriptors[key]?.enumerable||!Object.hasOwn(descriptors[key]!,'value'))return invalidAgentPlanWorkflowValue();out[key]=descriptors[key]!.value}
 return out
}
export function agentPlanWorkflowArray(raw:unknown,max:number):unknown[]{
 if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return invalidAgentPlanWorkflowValue()
 return Array.from({length:raw.length},(_,index)=>{const d=Object.getOwnPropertyDescriptor(raw,String(index));if(!d?.enumerable||!Object.hasOwn(d,'value'))return invalidAgentPlanWorkflowValue();return d.value})
}
export function agentPlanWorkflowText(raw:unknown,max:number,required=false):string{
 if(typeof raw!=='string'||raw.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(raw))return invalidAgentPlanWorkflowValue()
 for(const c of raw)if(c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff)return invalidAgentPlanWorkflowValue()
 if(required&&!raw.trim())return invalidAgentPlanWorkflowValue();return raw
}
export const agentPlanWorkflowId=(raw:unknown):string=>typeof raw==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw)?raw:invalidAgentPlanWorkflowValue()
export const agentPlanWorkflowSha=(raw:unknown):string=>typeof raw==='string'&&/^[a-f0-9]{64}$/.test(raw)?raw:invalidAgentPlanWorkflowValue()
export const agentPlanWorkflowRevision=(raw:unknown):number=>typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=1&&raw<=Number.MAX_SAFE_INTEGER-2?raw:invalidAgentPlanWorkflowValue()
export function agentPlanWorkflowJsonValue(raw:unknown):unknown{
 let values=agentPlanWorkflowLimits.values
 const copy=(value:unknown,depth:number):unknown=>{
  if(--values<0||depth>agentPlanWorkflowLimits.depth)return invalidAgentPlanWorkflowValue()
  if(value===null||typeof value==='boolean')return value
  if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))return invalidAgentPlanWorkflowValue();return value}
  if(typeof value==='string')return agentPlanWorkflowText(value,agentPlanWorkflowLimits.valueBytes)
  if(Array.isArray(value))return agentPlanWorkflowArray(value,agentPlanWorkflowLimits.array).map(item=>copy(item,depth+1))
  const object=agentPlanWorkflowObject(value),out=Object.create(null) as Record<string,unknown>
  for(const key of Object.keys(object).sort()){agentPlanWorkflowText(key,1000,true);out[key]=copy(object[key],depth+1)}
  return out
 }
 const result=copy(raw,0);if(new TextEncoder().encode(JSON.stringify(result)).length>agentPlanWorkflowLimits.valueBytes)return invalidAgentPlanWorkflowValue();return result
}
export const canonicalAgentPlanWorkflowValue=(raw:unknown):string=>JSON.stringify(agentPlanWorkflowJsonValue(raw))
export function freezeAgentPlanWorkflowValue<T>(value:T):T{
 if(value&&typeof value==='object'){for(const child of Object.values(value))freezeAgentPlanWorkflowValue(child);Object.freeze(value)}return value
}
export type AgentPlanWorkflowSource={spec_id:string;spec_revision:number;source_sha256:string;resources_sha256:string;resource_versions_sha256:string}
export type AgentPlanWorkflowModel={connection_id:string;connection_revision:number;model_id:string}
export function parseAgentPlanWorkflowSource(raw:unknown):AgentPlanWorkflowSource{
 const v=agentPlanWorkflowObject(raw,['spec_id','spec_revision','source_sha256','resources_sha256','resource_versions_sha256'])
 return {spec_id:agentPlanWorkflowId(v.spec_id),spec_revision:agentPlanWorkflowRevision(v.spec_revision),source_sha256:agentPlanWorkflowSha(v.source_sha256),resources_sha256:agentPlanWorkflowSha(v.resources_sha256),resource_versions_sha256:agentPlanWorkflowSha(v.resource_versions_sha256)}
}
export function parseAgentPlanWorkflowModel(raw:unknown):AgentPlanWorkflowModel{
 const v=agentPlanWorkflowObject(raw,['connection_id','connection_revision','model_id'])
 if(typeof v.model_id!=='string'||!/^[A-Za-z0-9._:/-]{1,120}$/.test(v.model_id))return invalidAgentPlanWorkflowValue()
 return {connection_id:agentPlanWorkflowId(v.connection_id),connection_revision:agentPlanWorkflowRevision(v.connection_revision),model_id:v.model_id}
}
export type AgentPlanWorkflowChoice={action:'preview';purpose:typeof agentPlanWorkflowPurpose;source:AgentPlanWorkflowSource;instruction:string;generation_model:AgentPlanWorkflowModel;output_token_limit:typeof agentPlanWorkflowOutputTokenLimits[number]}
const choiceKeys=['purpose','source','instruction','generation_model','output_token_limit'] as const
export function parseAgentPlanWorkflowChoice(raw:unknown):AgentPlanWorkflowChoice{
 const v=agentPlanWorkflowObject(raw,['action',...choiceKeys])
 if(v.action!=='preview'||v.purpose!==agentPlanWorkflowPurpose||!agentPlanWorkflowOutputTokenLimits.some(limit=>limit===v.output_token_limit))return invalidAgentPlanWorkflowValue()
 return freezeAgentPlanWorkflowValue({action:'preview',purpose:agentPlanWorkflowPurpose,source:parseAgentPlanWorkflowSource(v.source),instruction:agentPlanWorkflowText(v.instruction,agentPlanWorkflowLimits.instruction),generation_model:parseAgentPlanWorkflowModel(v.generation_model),output_token_limit:v.output_token_limit as AgentPlanWorkflowChoice['output_token_limit']})
}
export type AgentPlanWorkflowSubmission=Omit<AgentPlanWorkflowChoice,'action'>&{action:'submit';request_id:string;expected_input_sha256:string;confirm:true;fee_acknowledgement:typeof agentPlanWorkflowFeeAcknowledgement}
export function parseAgentPlanWorkflowSubmission(raw:unknown):AgentPlanWorkflowSubmission{
 const v=agentPlanWorkflowObject(raw,['action',...choiceKeys,'request_id','expected_input_sha256','confirm','fee_acknowledgement'])
 if(v.action!=='submit'||v.confirm!==true||v.fee_acknowledgement!==agentPlanWorkflowFeeAcknowledgement)return invalidAgentPlanWorkflowValue()
 const {action:_action,request_id,expected_input_sha256,confirm:_confirm,fee_acknowledgement:_fee,...selected}=v,{action:_preview,...choice}=parseAgentPlanWorkflowChoice({action:'preview',...selected}),id=agentPlanWorkflowId(request_id)
 if(id===choice.source.spec_id)return invalidAgentPlanWorkflowValue()
 return freezeAgentPlanWorkflowValue({...choice,action:'submit',request_id:id,expected_input_sha256:agentPlanWorkflowSha(expected_input_sha256),confirm:true,fee_acknowledgement:agentPlanWorkflowFeeAcknowledgement})
}
/** Canonical UTF8 SHA256 preimage, not a hash/receipt/capability. Repeated calls
 * remain ordinary values; only a future real durable reservation is one-use. */
export function agentPlanWorkflowPaidIntentValue(raw:unknown){return freezeAgentPlanWorkflowValue({protocol:'agent_plan_workflow_paid_intent_v1' as const,intent:parseAgentPlanWorkflowSubmission(raw),authority:false as const})}
export type AgentPlanWorkflowSaveIntent={action:'save';purpose:typeof agentPlanWorkflowPurpose;request_id:string;generation_request_id:string;source:AgentPlanWorkflowSource;expected_result_sha256:string;expected_preview_sha256:string;expected_candidate_sha256:string;confirm:true;save_acknowledgement:typeof agentPlanWorkflowSaveAcknowledgement}
export function parseAgentPlanWorkflowSaveIntent(raw:unknown):AgentPlanWorkflowSaveIntent{
 const v=agentPlanWorkflowObject(raw,['action','purpose','request_id','generation_request_id','source','expected_result_sha256','expected_preview_sha256','expected_candidate_sha256','confirm','save_acknowledgement'])
 if(v.action!=='save'||v.purpose!==agentPlanWorkflowPurpose||v.confirm!==true||v.save_acknowledgement!==agentPlanWorkflowSaveAcknowledgement)return invalidAgentPlanWorkflowValue()
 const source=parseAgentPlanWorkflowSource(v.source),request_id=agentPlanWorkflowId(v.request_id),generation_request_id=agentPlanWorkflowId(v.generation_request_id)
 if(new Set([request_id,generation_request_id,source.spec_id]).size!==3)return invalidAgentPlanWorkflowValue()
 return freezeAgentPlanWorkflowValue({action:'save',purpose:agentPlanWorkflowPurpose,request_id,generation_request_id,source,expected_result_sha256:agentPlanWorkflowSha(v.expected_result_sha256),expected_preview_sha256:agentPlanWorkflowSha(v.expected_preview_sha256),expected_candidate_sha256:agentPlanWorkflowSha(v.expected_candidate_sha256),confirm:true,save_acknowledgement:agentPlanWorkflowSaveAcknowledgement})
}
export function agentPlanWorkflowSaveIntentValue(raw:unknown){return freezeAgentPlanWorkflowValue({protocol:'agent_plan_workflow_save_intent_v1' as const,intent:parseAgentPlanWorkflowSaveIntent(raw),authority:false as const})}
