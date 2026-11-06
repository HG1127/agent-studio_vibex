// Original run/owner/lease authority is unchanged. These are data checks only.
import {createHash} from 'node:crypto'
import {HttpError,isUuid} from './contracts.ts'
export type AgentRunControlAction='pause'|'resume'
export type AgentRunControlRequest=Readonly<{operation_id:string;expected_state_sha256:string}>
export type AgentRunPause=Readonly<{operation_id:string;return_status:'queued'|'awaiting_approval'|'awaiting_input'}>
export type AgentRunControlReceipt=Readonly<{operation_id:string;action:AgentRunControlAction;run_id:string;request_sha256:string;outcome_status:string}>
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
function own(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length)throw new HttpError(400,'invalid_agent_run_control')
 const descriptors=Object.getOwnPropertyDescriptors(value),answer:Record<string,unknown>={}
 for(const key of keys){const descriptor=descriptors[key];if(!descriptor?.enumerable||!('value'in descriptor))throw new HttpError(400,'invalid_agent_run_control');answer[key]=descriptor.value}
 return answer
}
export function safeAgentRunControlRequest(raw:unknown):AgentRunControlRequest{
 const value=own(raw,['operation_id','expected_state_sha256'])
 if(!isUuid(value.operation_id)||!digest(value.expected_state_sha256))throw new HttpError(400,'invalid_agent_run_control')
 return Object.freeze({operation_id:value.operation_id.toLowerCase(),expected_state_sha256:value.expected_state_sha256})
}
export function checkedAgentRunPause(raw:unknown):AgentRunPause{
 try{const value=own(raw,['operation_id','return_status'])
  if(!isUuid(value.operation_id)||typeof value.return_status!=='string'||!['queued','awaiting_approval','awaiting_input'].includes(value.return_status))throw Error()
  return Object.freeze({operation_id:value.operation_id.toLowerCase(),return_status:value.return_status as AgentRunPause['return_status']})
 }catch{throw new HttpError(409,'invalid_agent_run_pause')}
}
export function agentRunControlStateHash(row:{id:string;status:string;checkpoint:unknown;last_error_code:string}):string{
 return createHash('sha256').update(JSON.stringify([row.id,row.status,row.checkpoint,row.last_error_code],(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en'))):value)).digest('hex')
}
export function agentRunControlFingerprint(runId:string,action:AgentRunControlAction,request:AgentRunControlRequest):string{
 if(!isUuid(runId)||!['pause','resume'].includes(action))throw new HttpError(400,'invalid_agent_run_control')
 return createHash('sha256').update(JSON.stringify([runId.toLowerCase(),action,request.operation_id,request.expected_state_sha256])).digest('hex')
}
export function checkedAgentRunControlReceipt(raw:unknown,runId:string,action:AgentRunControlAction,request:AgentRunControlRequest):AgentRunControlReceipt{
 try{const value=own(raw,['operation_id','action','run_id','request_sha256','outcome_status'])
  if(value.operation_id!==request.operation_id||value.run_id!==runId||value.action!==action||value.request_sha256!==agentRunControlFingerprint(runId,action,request)||typeof value.outcome_status!=='string'||!['paused','queued','awaiting_approval','awaiting_input'].includes(value.outcome_status))throw Error()
  return Object.freeze(value) as AgentRunControlReceipt
 }catch{throw new HttpError(409,'agent_run_control_operation_conflict')}
}

export function assertAgentRunResumeApproval(required:{kind:string;input_sha256:string;configuration:{knowledge_retrieval?:unknown}},approval:{status:string;reason_code:string;knowledge_charge?:boolean|null}|undefined,scope:{parent:boolean;waiting:boolean}):void{
 if(approval&&(approval.reason_code!=='wf2:'+required.input_sha256||!['pending','approved'].includes(approval.status))||scope.parent&&approval?.status!=='approved'||scope.waiting&&approval?.status!=='pending')throw new HttpError(409,'workflow_v2_approval_changed')
 // An original paid approval cannot lose its charge acknowledgement while
 // paused. Resume neither adds consent nor replaces the original approval.
 if(approval?.status==='approved'&&required.kind==='tool'&&required.configuration.knowledge_retrieval!==undefined&&approval.knowledge_charge!==true)throw new HttpError(409,'knowledge_query_charge_confirmation_required')
}
