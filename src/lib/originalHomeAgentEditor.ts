import type {AgentSpec} from '../pages/Home/presets'
import {parseOriginalHomeAuthoring,type OriginalHomeAuthoring} from '../../shared/original-home-authoring.ts'
import {normalizeOriginalHomeExecutionSpec,OriginalHomeApiError,type OriginalHomeAgent,type OriginalHomeAgentUpdate} from './originalHomeAgentApi.ts'
import {normalizeOriginalHomeBindingOptions,type OriginalHomeBindingOptions} from './originalHomeResources.ts'
import {normalizeOriginalHomeDesignMetadata,type OriginalHomeDesignMetadata} from '../../shared/original-home-design-metadata.ts'

/** Local editing data only. A stored UUID/revision never authenticates a request. */
export type NativeHomeEditingContext=Readonly<{
  id:string;revision:number;spec:Readonly<Record<string,unknown>>;authoring:OriginalHomeAuthoring|null
}>
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const visibleFields=['goal','task_scope','deliverables','tools','task_plan','done_criteria','knowledge_base_ids','require_approval','require_plan_review']
const unsupportedFields=['quality_checks','capability_requirements','_studio_authoring']
const fail=(code:string):never=>{throw new OriginalHomeApiError(400,code)}
function freeze<T>(data:T):T{
  if(data&&typeof data==='object'){for(const value of Object.values(data))freeze(value);Object.freeze(data)}
  return data
}
function values(raw:unknown):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))return fail('invalid_original_home_editor_data')
  const result:Record<string,unknown>={}
  for(const key of Reflect.ownKeys(raw)){
    const d=Object.getOwnPropertyDescriptor(raw,key)
    if(typeof key!=='string'||!d?.enumerable||!Object.hasOwn(d,'value')||['__proto__','prototype','constructor'].includes(key))return fail('invalid_original_home_editor_data')
    result[key]=d.value
  }
  return result
}
function editorToolNames(raw:unknown):string[]{
  // The unchanged UI projects up to20 descriptive requirements plus20 real
  // execution names. This is not the bounded authoring array sent to070.
  if(!Array.isArray(raw)||raw.length>40||Reflect.ownKeys(raw).length!==raw.length+1)return fail('invalid_original_home_editor_data')
  const names:string[]=[]
  for(let i=0;i<raw.length;i++){
    const d=Object.getOwnPropertyDescriptor(raw,String(i))
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value.trim()||d.value.length>300||/[\u0000-\u001f\u007f]/.test(d.value))return fail('invalid_original_home_editor_data')
    names.push(d.value)
  }
  return names
}
export function normalizeNativeHomeEditingContext(raw:unknown):NativeHomeEditingContext{
  const data=values(raw)
  if(Object.keys(data).sort().join(',')!=='authoring,id,revision,spec'||typeof data.id!=='string'||!uuid.test(data.id)||!Number.isSafeInteger(data.revision)||Number(data.revision)<1)return fail('invalid_original_home_editing_context')
  return freeze({id:data.id.toLowerCase(),revision:Number(data.revision),spec:{...normalizeOriginalHomeExecutionSpec(data.spec),require_approval:true},authoring:data.authoring===null?null:parseOriginalHomeAuthoring(data.authoring)})
}
/** Classifies syntax only; connection readiness and execution remain server decisions. */
export function isOriginalHomeBuiltinTool(name:string):boolean{
  if(typeof name!=='string'||name!==name.trim()||name==='local_computer')return false
  try{normalizeOriginalHomeExecutionSpec({goal:'tool name validation',tools:[name]});return true}catch{return false}
}
export function normalizeOriginalHomeBuiltinSelections(raw:unknown):string[]{
  if(!Array.isArray(raw)||raw.length>5||Reflect.ownKeys(raw).length!==raw.length+1)return fail('invalid_original_home_builtin_selection')
  const names:string[]=[]
  for(let i=0;i<raw.length;i++){const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!isOriginalHomeBuiltinTool(d.value)||names.includes(d.value))return fail('invalid_original_home_builtin_selection');names.push(d.value)}
  return names
}
export function originalHomeAgentForEditor(row:OriginalHomeAgent){
  const context=normalizeNativeHomeEditingContext({id:row.id,revision:row.revision,spec:row.spec,authoring:row.authoring})
  const spec=context.spec,actualTools=spec.tools as string[]
  const requirements=context.authoring?[...context.authoring.tool_requirements]:[...actualTools]
  // Existing bound tools remain visible even on older metadata that did not
  // describe them. Editing prose must not discard the real bindings.
  for(const name of actualTools)if(!requirements.includes(name))requirements.push(name)
  const visible:AgentSpec={goal:spec.goal as string,task_scope:spec.task_scope as string,deliverables:[...spec.deliverables as string[]],tools:requirements,task_plan:[...spec.task_plan as string[]],done_criteria:[...spec.done_criteria as string[]],knowledge_base_ids:[...spec.knowledge_base_ids as string[]],require_approval:true,...(spec.require_plan_review===undefined?{}:{require_plan_review:spec.require_plan_review as boolean})}
  return {id:row.id,rh_user_id:row.owner_user_id,name:row.name,spec:visible,source:context.authoring?.source??'unknown',template_key:context.authoring?.template_key??'',created:row.created_at,updated:row.updated_at,native_pg:context}
}
export function originalHomeEditorWrite(input:{name:string;spec:AgentSpec;source:'create'|'template';templateKey:string;context?:NativeHomeEditingContext|null;asCopy?:boolean;bindings?:OriginalHomeBindingOptions;builtinSelections?:string[];designMetadata?:OriginalHomeDesignMetadata|null}):OriginalHomeAgentUpdate{
  const visible=values(input.spec)
  for(const key of Object.keys(visible)){
    if(unsupportedFields.includes(key)){
      // Empty optional lists carry no requirement. Any actual new semantic
      // field must have a real backend contract before it can be saved.
      if(Array.isArray(visible[key])&&visible[key].length===0&&Reflect.ownKeys(visible[key]).length===1){delete visible[key];continue}
      return fail('original_home_execution_contract_unavailable')
    }
    if(!visibleFields.includes(key))return fail('invalid_original_home_editor_data')
  }
  const context=input.context?normalizeNativeHomeEditingContext(input.context):null
  const prior=context?.spec??{}
  // Validate every descriptor and retain exact descriptive text before any
  // iteration; a pending requirement is not an executable tool declaration.
  const visibleTools=editorToolNames(visible.tools)
  const selected=input.bindings?normalizeOriginalHomeBindingOptions(input.bindings):{http:[],mcp:[]}
  const priorHttp=Array.isArray(prior.http_tools)?prior.http_tools as {name:string}[]:[],priorMcp=Array.isArray(prior.mcp_tools)?prior.mcp_tools as {name:string}[]:[]
  const http=[...selected.http,...priorHttp.filter(v=>!selected.http.some(s=>s.name===v.name))],mcp=[...selected.mcp,...priorMcp.filter(v=>!selected.mcp.some(s=>s.name===v.name))]
  const boundNames=new Set([...http,...mcp].map(t=>t.name))
  const explicitBuiltins=normalizeOriginalHomeBuiltinSelections(input.builtinSelections??[])
  const designRequirements=input.designMetadata?normalizeOriginalHomeDesignMetadata(input.designMetadata).tool_requirements:[]
  const previousTools=Array.isArray(prior.tools)?prior.tools as string[]:[],previousRequirements=context?.authoring?.tool_requirements??previousTools
  const tools=[...new Set(visibleTools.filter(name=>isOriginalHomeBuiltinTool(name)&&(!designRequirements.includes(name)||previousTools.includes(name)||explicitBuiltins.includes(name))&&(!context||previousTools.includes(name)||!previousRequirements.includes(name)||explicitBuiltins.includes(name))||boundNames.has(name)||name==='local_computer'&&previousTools.includes(name)))]
  // Retain original metadata text/order/duplicates. Execution-only names are
  // projected for the picker and must not inflate its independent20-item DTO.
  const originalRequirements=context?.authoring?.tool_requirements??[]
  const projectedNames=new Set(tools)
  const requested=visibleTools.filter(name=>originalRequirements.includes(name)||!projectedNames.has(name))
  const full={...prior,...visible,tools,
    ...(http.length?{http_tools:http.filter(t=>tools.includes(t.name))}:{}),
    ...(mcp.length?{mcp_tools:mcp.filter(t=>tools.includes(t.name))}:{}),
  }
  const spec={...normalizeOriginalHomeExecutionSpec(full),require_approval:true}
  if(context&&context.authoring===null&&!input.asCopy){
    if(visibleTools.some(name=>!tools.includes(name)))return fail('original_home_authoring_missing')
    return {name:input.name,spec}
  }
  const authoring=parseOriginalHomeAuthoring({format:'agentstudio.home-authoring.v1',source:input.source,template_key:input.templateKey,tool_requirements:requested})
  return {name:input.name,spec,authoring}
}
