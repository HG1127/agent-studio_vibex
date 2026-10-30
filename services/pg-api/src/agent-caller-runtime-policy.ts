// Original runtime integration only. No executor/provider/secret is created.
import {HttpError,type SqlClient,type AgentSpecInput} from './contracts.ts'
import {createHash} from 'node:crypto'
import {agentCallerCanonical,agentCallerId} from '../../../shared/agent-caller-contract.ts'
import {agentTemplateMarketObject as O,agentTemplateMarketInteger as N} from './agent-template-market-contract.ts'
import {prepareWorkflowTool} from './workflow-v2-tool-plan.ts'
import type {WorkflowEffectRequest} from './workflow-v2-machine.ts'
export type AgentCallerBinding={protocol:'agent_caller_binding_v1';invocation_id:string;credential_id:string;generation:number;source_id:string}
export function checkedAgentCallerBinding(raw:unknown):AgentCallerBinding{
 try{const v=O(raw,['protocol','invocation_id','credential_id','generation','source_id']),generation=N(v.generation,1);if(v.protocol!=='agent_caller_binding_v1'||generation>9007199254740988)throw Error();return{protocol:'agent_caller_binding_v1',invocation_id:agentCallerId(v.invocation_id),credential_id:agentCallerId(v.credential_id),generation,source_id:agentCallerId(v.source_id)}}catch{throw new HttpError(409,'agent_caller_source_unavailable')}
}
const fingerprint=(v:unknown)=>createHash('sha256').update(agentCallerCanonical(v)).digest('hex')
async function installed(db:SqlClient){return(await db.query<{installed:boolean}>("SELECT to_regprocedure('agentstudio.agent_caller_verify_source(uuid,uuid,uuid,jsonb)') IS NOT NULL AS installed")).rows[0]?.installed===true}
export async function verifyAgentCallerSource(db:SqlClient,owner:string,run:{id?:string;agent_spec_id:string|null;kind:string},state:{caller_binding?:AgentCallerBinding}):Promise<boolean>{
 if(run.kind!=='agent')return false
 // A marker is a value, never authority. Query the private source even when
 // absent, so deleting it from an already mutable run cannot escape budgets.
 if(!await installed(db)){if(state.caller_binding)throw new HttpError(409,'agent_caller_not_installed');return false}
 try{return(await db.query<{ok:boolean}>('SELECT agentstudio.agent_caller_verify_source($1::uuid,$2::uuid,$3::uuid,$4::jsonb) AS ok',[run.id??null,owner,run.agent_spec_id,JSON.stringify(state.caller_binding??null)])).rows[0]?.ok===true}catch{throw new HttpError(409,'agent_caller_source_unavailable')}
}
export function agentCallerEffectClassification(request:WorkflowEffectRequest,agentSpec?:Pick<AgentSpecInput,'http_tools'|'mcp_tools'>):{tool_name:string;knowledge_charge:boolean}{
 if(request.kind!=='tool')return{tool_name:'',knowledge_charge:false}
 const plan=prepareWorkflowTool(request)
 let name:string|undefined
 if(plan.kind==='http')name=agentSpec?.http_tools?.find(x=>x.name===request.configuration.title&&x.connection_id===plan.binding.connection_id&&x.connection_revision===plan.binding.connection_revision)?.name
 else if(plan.kind==='mcp')name=agentSpec?.mcp_tools?.find(x=>x.name===request.configuration.title&&x.connection_id===plan.binding.connection_id&&x.connection_revision===plan.binding.connection_revision&&x.tool_name===plan.binding.tool_name&&x.catalog_sha256===plan.binding.catalog_sha256)?.name
 else name=plan.kind
 if(!name)throw new HttpError(409,'agent_caller_tool_not_authorized')
 return{tool_name:name,knowledge_charge:plan.kind==='knowledge_search'&&Boolean(plan.retrieval)}
}
export async function reserveAgentCallerStep(db:SqlClient,owner:string,run:string,checkpoint:unknown,job:{id:string;lease_token:string;lease_version:string|number;lease_owner:string},request:WorkflowEffectRequest,agentSpec?:Parameters<typeof agentCallerEffectClassification>[1]){
 const c=agentCallerEffectClassification(request,agentSpec)
 try{return(await db.query<{ok:boolean}>('SELECT agentstudio.agent_caller_reserve_step($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text,$10::boolean,$11::text) AS ok',[run,job.id,job.lease_token,job.lease_version,job.lease_owner,request.step_key,request.input_sha256,request.kind,c.tool_name,c.knowledge_charge,fingerprint(checkpoint)])).rows[0]?.ok===true}catch{throw new HttpError(409,'agent_caller_budget_or_source_unavailable')}
}
export async function verifyAgentCallerDispatch(db:SqlClient,run:string,request:WorkflowEffectRequest,agentSpec?:Parameters<typeof agentCallerEffectClassification>[1]){
 const c=agentCallerEffectClassification(request,agentSpec)
 try{if((await db.query<{ok:boolean}>('SELECT agentstudio.agent_caller_verify_dispatch($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::boolean) AS ok',[run,request.step_key,request.input_sha256,request.kind,c.tool_name,c.knowledge_charge])).rows[0]?.ok!==true)throw Error()}catch{throw new HttpError(409,'agent_caller_budget_or_source_unavailable')}
}
export async function approveReservedAgentCallerStep(db:SqlClient,owner:string,run:string,request:WorkflowEffectRequest,agentSpec?:Parameters<typeof agentCallerEffectClassification>[1]){
 const c=agentCallerEffectClassification(request,agentSpec)
 await db.query("INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,requested_by,reason_code,status,decided_by,decided_at,knowledge_query_charge_acknowledged) VALUES($1::uuid,$2::uuid,$3::text,$1::uuid,$4::text,'approved',$1::uuid,clock_timestamp(),$5::boolean) ON CONFLICT(run_id,step_key) DO NOTHING",[owner,run,request.step_key,'wf2:'+request.input_sha256,c.knowledge_charge])
}
