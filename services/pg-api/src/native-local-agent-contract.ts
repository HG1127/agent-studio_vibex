// SQL067 Native-only data adapter. The frozen059/060 contracts and graph
// vocabulary remain byte-for-byte unchanged and still reject local_computer.
import {HttpError,safeAgentSpec,type AgentSpecInput} from './contracts.ts'
import type {WorkflowNodeDataV2} from './workflow-graph-v2.ts'
import {parseLocalInput,parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
function invalid():never{throw new HttpError(400,'invalid_native_local_agent_spec')}
function object(raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))invalid()
 return raw as Record<string,unknown>
}
export function hasNativeLocalAgentTool(raw:unknown):boolean{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false
 const tools=Object.getOwnPropertyDescriptor(raw,'tools')?.value
 return Array.isArray(tools)&&tools.some(t=>typeof t==='string'&&t.trim()==='local_computer')
}
export function safeNativeLocalAgentSpec(raw:unknown,enabled=false):AgentSpecInput{
 if(!hasNativeLocalAgentTool(raw))return safeAgentSpec(raw)
 if(enabled!==true)throw new HttpError(403,'native_local_device_execution_not_approved')
 const input=object(raw),tools=input.tools
 // Preserve the original list/string bounds BEFORE removing the one exact
 // Native marker. All ordinary/custom tools still pass the frozen validator.
 if(!Array.isArray(tools)||tools.length>20||tools.some(t=>typeof t!=='string'||t.length>300||t.includes('\0')))invalid()
 const names=tools.map(t=>String(t).trim())
 const checked=safeAgentSpec({...input,tools:names.filter(t=>t!=='local_computer')})
 if([...checked.http_tools??[],...checked.mcp_tools??[]].some(t=>t.name==='local_computer'))invalid()
 return {...checked,tools:[...new Set(names)]}
}
// This union member is legal only for a bound autonomous Agent sub-effect.
// It is never a WorkflowGraph node and introduces no global tool enum value.
export type NativeLocalEffectConfiguration=Omit<WorkflowNodeDataV2,'tool'|'params_template'>&{
 tool:'local_computer';params_template:string
}
export function parseNativeLocalEffectConfiguration(raw:unknown):NativeLocalEffectConfiguration{
 const input=object(raw)
 if(Object.keys(input).length!==3||!['title','tool','params_template'].every(k=>Object.hasOwn(input,k))||input.tool!=='local_computer'||
  typeof input.title!=='string'||!input.title.trim()||input.title.length>120||input.title.includes('\0')||
  typeof input.params_template!=='string'||input.params_template.length>12000||input.params_template.includes('\0'))invalid()
 parseLocalInput(parseLocalTransportJson(input.params_template,12000))
 return {title:input.title.trim(),tool:'local_computer',params_template:input.params_template}
}
