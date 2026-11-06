// Optional074 Native Agent marker adapter. Frozen050/complete069 validators and
// WorkflowGraph vocabulary remain unchanged; models never author or review monitors.
import {HttpError,type AgentSpecInput} from './contracts.ts'
import {safeNativeLocalAgentSpec} from './native-local-agent-contract.ts'
import {parseLocalTransportJson} from '../../../shared/native-local-device-contract.mjs'
import {parseMonitorRecordWrite} from './native-monitor-business-data.ts'
import {monitorCanonical} from './native-monitor-source-contract.ts'
export const monitorBusinessTools=['business_case_get','business_record_query','business_record_write','result_read'] as const
export type MonitorBusinessTool=typeof monitorBusinessTools[number]
const invalid=():never=>{throw new HttpError(400,'invalid_native_monitor_business_spec')}
export function safeNativeMonitorBusinessSpec(raw:unknown,enabled=false,allowLocal=false):AgentSpecInput{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid()
 const v=raw as Record<string,unknown>,tools=v.tools
 if(!Array.isArray(tools))return safeNativeLocalAgentSpec(raw,allowLocal)
 if(tools.length>20||tools.some(t=>typeof t!=='string'||t.length>300||t.includes('\0')))return invalid()
 const names=tools.map(t=>String(t).trim()),has=names.some(t=>monitorBusinessTools.includes(t as MonitorBusinessTool))
 if(!has)return safeNativeLocalAgentSpec(raw,allowLocal)
 if(!enabled)throw new HttpError(403,'native_monitor_business_disabled')
 const checked=safeNativeLocalAgentSpec({...v,tools:names.filter(t=>!monitorBusinessTools.includes(t as MonitorBusinessTool))},allowLocal)
 if([...checked.http_tools??[],...checked.mcp_tools??[]].some(t=>monitorBusinessTools.includes(t.name as MonitorBusinessTool)))return invalid()
 return{...checked,tools:[...new Set(names)]}
}
export type MonitorBusinessEffect={title:string;tool:MonitorBusinessTool;params_template:string}
export function parseMonitorBusinessEffect(raw:unknown):MonitorBusinessEffect{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid()
 const v=raw as Record<string,unknown>
 if(Object.keys(v).length!==3||!['title','tool','params_template'].every(k=>Object.hasOwn(v,k))||typeof v.title!=='string'||!v.title.trim()||v.title.length>120||typeof v.params_template!=='string'||v.params_template.length>12000||!monitorBusinessTools.includes(v.tool as MonitorBusinessTool))return invalid()
 const args=parseLocalTransportJson(v.params_template,12000)
 if(!args||typeof args!=='object'||Array.isArray(args))return invalid()
 const q=args as Record<string,unknown>
 if(Object.hasOwn(q,'owner_user_id')||Object.hasOwn(q,'case_id')||Object.hasOwn(q,'actor_uid'))return invalid()
 if(v.tool==='business_case_get'&&Object.keys(q).length!==0)return invalid()
 if(v.tool==='business_record_write')parseMonitorRecordWrite(q)
 if(v.tool==='business_record_query'&&(Object.keys(q).some(k=>!['schema_id','offset','limit'].includes(k))||typeof q.schema_id!=='string'))return invalid()
 if(v.tool==='result_read'&&(Object.keys(q).some(k=>!['run_id','result_id','field','offset','limit'].includes(k))||typeof q.result_id!=='string'))return invalid()
 return{title:v.title.trim(),tool:v.tool as MonitorBusinessTool,params_template:v.params_template}
}

export function hasMonitorBusinessAgentTools(raw:unknown):boolean{if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;const tools=Object.getOwnPropertyDescriptor(raw,'tools');return !!tools&&Object.hasOwn(tools,'value')&&Array.isArray(tools.value)&&tools.value.some(t=>monitorBusinessTools.includes(t))}
