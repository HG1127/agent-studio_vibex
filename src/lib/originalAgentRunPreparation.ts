import type {AgentSpec} from '../pages/Home/presets'
import type {OriginalHomeAgent} from './originalHomeAgentApi.ts'
import type {OriginalHomeResourceView} from './originalHomeResources.ts'
import type {PgNativeAgent,PgNativeModelConnection,PgNativeConfigCapabilities} from './pgNativePilotApi.ts'
import type {LocalDevice} from './pgNativeLocalDevice.ts'
import type {ReadyLocalDevice} from './localDeviceConnection.ts'
import {parseOriginalRoleExtension,roleObject,roleText,ORIGINAL_ROLE_PROTOCOL,type OriginalRoleCapability} from '../../shared/original-role-execution-contract.mjs'
import {parseAgentHttpTools} from '../../services/pg-api/src/agent-http-tools.ts'
import {parseAgentMcpTools} from '../../services/pg-api/src/mcp-binding.ts'
import {agentRunReadiness,type AgentRunReadiness} from './agentRunReadiness.ts'
import {collectRoleSkills,verifyRoleSkillBindings} from './skillRunPreflight.ts'
import type {SkillDetail,SkillRef} from './skillLibrary.ts'
import {readyAutonomousModel} from './pgNativeAutonomousAgentSession.ts'
const refuse=():never=>{throw Error('original_run_preparation_invalid')}
function list(raw:unknown,max:number,length:number):string[]{if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return refuse();const values=Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return refuse();return roleText(d.value,length,true)});if(new Set(values).size!==values.length)return refuse();return values}
/** Validate saved structured data before any readiness helper can normalize it. */
export function originalRunStructuredSpec(base:AgentSpec,raw:Record<string,unknown>):AgentSpec{
 const http=parseAgentHttpTools(raw.http_tools===undefined?[]:raw.http_tools),mcp=parseAgentMcpTools(raw.mcp_tools===undefined?[]:raw.mcp_tools),tools=[...new Set([...list(raw.tools,32,220),...http.map(t=>t.name),...mcp.map(t=>t.name)])]
 // A displayed alias may already be present in the UI DTO; its exact binding
 // is still checked against current owner metadata before readiness.
 const dense=(raw:unknown,max:number):unknown[]=>{if(!Array.isArray(raw)||raw.length>max||Reflect.ownKeys(raw).length!==raw.length+1)return refuse();return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));if(!d||!Object.hasOwn(d,'value'))return refuse();return d.value})}
 const roles=dense(raw.roles===undefined?[]:raw.roles,8),caps=dense(raw.capability_requirements===undefined?[]:raw.capability_requirements,20)
 if(roles.length){const extension=parseOriginalRoleExtension({protocol:ORIGINAL_ROLE_PROTOCOL,roles:roles.map(r=>{const v=roleObject(r,['id','name','responsibility','tasks','inputs','deliverables','depends_on','tools','done_criteria'],['skill_refs']);return {...v,skill_refs:v.skill_refs??[]}}),capability_requirements:caps},tools);return {...base,tools,roles:extension.roles,capability_requirements:extension.capability_requirements}}
 const capabilities:OriginalRoleCapability[]=caps.map(value=>{const c=roleObject(value,['id','title','purpose','kind','access','required','role_ids','search_terms','suggested_tool_ids']);if(typeof c.id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(c.id)||!['web_search','web_fetch','knowledge','calculate','text','document','browser','desktop','integration','custom'].includes(String(c.kind))||!['read','write'].includes(String(c.access))||typeof c.required!=='boolean')return refuse();const role_ids=list(c.role_ids,12,64);if(role_ids.length)return refuse();return {id:c.id,title:roleText(c.title,100,true),purpose:roleText(c.purpose,600),kind:c.kind as OriginalRoleCapability['kind'],access:c.access as OriginalRoleCapability['access'],required:c.required,role_ids,search_terms:list(c.search_terms,4,180),suggested_tool_ids:list(c.suggested_tool_ids,8,220)}})
 if(new Set(capabilities.map(c=>c.id)).size!==capabilities.length)return refuse()
 return {...base,tools,roles:[],capability_requirements:capabilities}
}
export type OriginalRunPreparationChoice={localDeviceId:string;structuredPlanning:boolean}
export type OriginalRunPreparation={resources:OriginalHomeResourceView;readyLocalDevice:ReadyLocalDevice|null;readiness:AgentRunReadiness;roleProfileReady:boolean;source:string}
export type OriginalRunPreparationPorts={resources:()=>Promise<OriginalHomeResourceView>;devices:()=>Promise<LocalDevice[]>;roleMeta:()=>Promise<void>;skill:(ref:SkillRef)=>Promise<SkillDetail>}
export function originalRunPreparationSource(agent:OriginalHomeAgent,choice:OriginalRunPreparationChoice):string{return JSON.stringify({id:agent.id,owner:agent.owner_user_id,revision:agent.revision,spec:agent.spec,choice})}
/** Metadata reads only. Backend repeats owner, resource version, Skill and plan checks. */
export async function readOriginalRunPreparation(input:{employeeId:string;agent:OriginalHomeAgent;presentation:AgentSpec;models:PgNativeModelConnection[];caps:PgNativeConfigCapabilities;choice:OriginalRunPreparationChoice;ports:OriginalRunPreparationPorts;probeRoleProfile?:boolean;now?:number}):Promise<OriginalRunPreparation>{
 const {employeeId,agent,caps,choice,ports}=input,now=input.now??Date.now()
 if(agent.owner_user_id!==employeeId||typeof choice.structuredPlanning!=='boolean'||typeof choice.localDeviceId!=='string')return refuse()
 const spec=originalRunStructuredSpec(input.presentation,agent.spec),issues:string[]=[],needsProfile=choice.structuredPlanning||Boolean(spec.roles?.length)||Boolean(spec.capability_requirements?.length)
 const [resources,devices]=await Promise.all([ports.resources(),choice.localDeviceId&&caps.local_devices_available===true?ports.devices():Promise.resolve(null)])
 let roleProfileReady=false
 if(needsProfile||input.probeRoleProfile===true){try{await ports.roleMeta();roleProfileReady=true}catch{if(needsProfile)issues.push('角色、能力需求或结构化计划的服务端合同尚未核实，请刷新资源')}}
 if(!caps.config_writes_enabled||!caps.autonomous_agent_submission_enabled)issues.push('当前员工或实例未开放自主运行')
 if(!readyAutonomousModel({id:agent.id,name:agent.name,revision:agent.revision,spec:agent.spec as PgNativeAgent['spec']},input.models))issues.push('请绑定本人已核验的模型版本')
 const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right)
 for(const binding of parseAgentHttpTools(agent.spec.http_tools??[]))if(!resources.bindings.http.some(r=>same(r,binding)))issues.push('HTTP 工具 '+binding.name+' 的本人连接版本尚未核实')
 for(const binding of parseAgentMcpTools(agent.spec.mcp_tools??[]))if(!caps.mcp_tool_runs_enabled||!resources.bindings.mcp.some(r=>same(r,binding)))issues.push('MCP 工具 '+binding.name+' 的本人目录版本尚未核实')
 const baseIds=list(agent.spec.knowledge_base_ids??[],10,36)
 for(const id of baseIds)if(!resources.knowledgeBases.some(b=>b.id===id))issues.push('关联知识库 '+id+' 的访问权限尚未核实')
 const device=devices?.find(d=>d.id===choice.localDeviceId),online=device&&!device.revoked&&device.seen_ms>0&&now-device.seen_ms<45000&&device.seen_ms<=now
 const readyLocalDevice:ReadyLocalDevice|null=online?{id:device.id,revoked:device.revoked,seen_ms:device.seen_ms,catalog:JSON.stringify(device.catalog)}:null
 if(spec.tools.includes('local_computer')&&(!choice.localDeviceId||!readyLocalDevice))issues.push('请选中本人在线且已授权能力的电脑')
 if(choice.localDeviceId&&!spec.tools.includes('local_computer'))issues.push('当前助手未授权本机电脑工具，请清除电脑选择或先保存授权')
 if(choice.localDeviceId&&!caps.local_devices_available)issues.push('当前实例未开放本人电脑目录')
 if(choice.structuredPlanning&&(!caps.agent_human_input_available||!caps.agent_human_responses_enabled))issues.push('结构化计划需要后台人员确认与回复能力')
 const skillIssues=await verifyRoleSkillBindings(collectRoleSkills(spec.roles),ports.skill),base=agentRunReadiness(spec,{connections:resources.connectedHttp,marketTools:resources.verifiedMarket,localDevice:readyLocalDevice,skillIssues})
 const all=[...new Set([...base.issues,...issues])]
 return {resources,readyLocalDevice,roleProfileReady,source:originalRunPreparationSource(agent,choice),readiness:{...base,ready:all.length===0,issues:all}}
}
