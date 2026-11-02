// Closed failure DATA only. No runtime, identity, Reader, retry or health grant.
import {isNativeError,isProxy} from 'node:util/types'
import {parseWorkerHeartbeatControlJson} from './worker-heartbeat-activation-control-contract.ts'
const flags=Object.freeze({observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})
const requestEvent='full069_native_request_failure_observation',branchEvent='full069_final14_rejected_branches_observation',branches=['native','runtime','companions']
const requests=new Map([['/api/v2/company-worker-heartbeats','heartbeats'],['/api/native-auth/login','login'],['/api/native-auth/me','me'],['/api/native-auth/logout','logout'],['/api/native-auth/capabilities','capabilities']])
const nodeCodes=new Set(['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ENOTFOUND','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','ERR_SSL_WRONG_VERSION_NUMBER'])
const controlCodes=new Set(['source_runtime_refused','binding_changed','untrusted_reference','control_closed','control_busy','control_io_failed','lease_expired','lease_revoked','registry_mismatch','reader_capacity','reader_timeout','reader_cleanup_unknown'])
const messages=new Map([
 ['descriptive_patch_operator_source_refused',['source_refused','operator']],['worker_heartbeat_activation_control_source_refused',['source_refused','control']],['complete069_source_refused',['source_refused','complete']],
 ['descriptive_patch_operator_runtime_refused',['runtime_refused','operator']],['worker_heartbeat_activation_control_runtime_refused',['runtime_refused','control']],
 ['full069_worker_live_native_io',['native_failure','io']],['full069_worker_live_native_deadline',['native_failure','deadline']],['full069_worker_live_native_response',['native_failure','response']],['full069_worker_live_native_heartbeat_unavailable',['native_failure','heartbeat_unavailable']],['full069_worker_live_native_not_ready',['native_failure','not_ready']],
])
const fail=()=>{throw Error('full069_failure_boundary_data')}
function record(raw,keys){if(!raw||typeof raw!=='object'||isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)fail();const ds=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))fail();return Object.fromEntries(keys.map(k=>[k,ds[k].value]))}
function three(raw){if(!Array.isArray(raw)||isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype)fail();const ds=Object.getOwnPropertyDescriptors(raw);if(ds.length?.value!==3||Reflect.ownKeys(ds).length!==4||[0,1,2].some(i=>!ds[i]?.enumerable||!Object.hasOwn(ds[i],'value')))fail();return [ds[0].value,ds[1].value,ds[2].value]}
function ownError(error,key){try{if(!isNativeError(error)||isProxy(error))return null;const d=Object.getOwnPropertyDescriptor(error,key);return d&&Object.hasOwn(d,'value')?d.value:null}catch{return null}}
function nodeCode(error){const code=ownError(error,'code');return typeof code==='string'&&nodeCodes.has(code)?code:null}
function errorData(error){const message=ownError(error,'message'),known=typeof message==='string'?messages.get(message):null;if(known)return {error_kind:known[0],error_code:known[1]};const code=ownError(error,'code');if(typeof code==='string'&&controlCodes.has(code))return {error_kind:'control_refused',error_code:code};const node=nodeCode(error);return node?{error_kind:'node_io',error_code:node}:{error_kind:'other',error_code:null}}
function milliseconds(a,b,signed=false){const n=Math.ceil(b-a);return Number.isFinite(a)&&Number.isFinite(b)&&Number.isSafeInteger(n)&&n>=(signed?-120000:0)&&n<=120000?(Object.is(n,-0)?0:n):null}
function bounded(value,signed=false){return value===null||Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=(signed?-120000:0)&&value<=120000}
function fixedFlags(value){if(Object.keys(flags).some(k=>value[k]!==flags[k]))fail()}
export function full069NativeRequestFailureData(route,at,ownDeadline,socketTimeout,error,before,deadline,now){
 const request=requests.get(route);if(!request||!['request_error','response_error'].includes(at)||typeof ownDeadline!=='boolean'||typeof socketTimeout!=='boolean')fail()
 return parseFull069NativeRequestFailureData({event:requestEvent,request,failure_at:at,own_deadline_destroy_seen:ownDeadline,socket_timeout_seen:socketTimeout,node_error_code:nodeCode(error),request_elapsed_ms:milliseconds(before,now),native_remaining_ms:milliseconds(now,deadline,true),...flags})
}
export function parseFull069NativeRequestFailureData(raw){
 const r=record(raw,['event','request','failure_at','own_deadline_destroy_seen','socket_timeout_seen','node_error_code','request_elapsed_ms','native_remaining_ms',...Object.keys(flags)]);fixedFlags(r)
 if(r.event!==requestEvent||![...requests.values()].includes(r.request)||!['request_error','response_error'].includes(r.failure_at)||typeof r.own_deadline_destroy_seen!=='boolean'||typeof r.socket_timeout_seen!=='boolean'||r.node_error_code!==null&&!nodeCodes.has(r.node_error_code)||!bounded(r.request_elapsed_ms)||!bounded(r.native_remaining_ms,true))fail()
 return Object.freeze(r)
}
export function full069RejectedBranchesFailureData(checks,times){
 const timing=record(times,branches),rows=three(checks).map((value,i)=>{if(!value||typeof value!=='object'||isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail();const ds=Object.getOwnPropertyDescriptors(value),status=ds.status?.value;if(!ds.status?.enumerable||!Object.hasOwn(ds.status,'value')||!['fulfilled','rejected'].includes(status))fail();const d=ds[status==='rejected'?'reason':'value'];if(!d?.enumerable||!Object.hasOwn(d,'value')||Reflect.ownKeys(ds).length!==2)fail();return {branch:branches[i],status,elapsed_ms:timing[branches[i]],...(status==='rejected'?errorData(d.value):{error_kind:null,error_code:null})}}),first=rows.find(r=>r.status==='rejected');if(!first)fail()
 return parseFull069RejectedBranchesFailureData({event:branchEvent,primary_branch:first.branch,branches:rows,...flags})
}
export function parseFull069RejectedBranchesFailureData(raw){
 const r=record(raw,['event','primary_branch','branches',...Object.keys(flags)]);fixedFlags(r);if(r.event!==branchEvent||!branches.includes(r.primary_branch))fail()
 const rows=three(r.branches).map((value,i)=>{const row=record(value,['branch','status','elapsed_ms','error_kind','error_code']);if(row.branch!==branches[i]||!['fulfilled','rejected'].includes(row.status)||!bounded(row.elapsed_ms))fail();if(row.status==='fulfilled'){if(row.error_kind!==null||row.error_code!==null)fail()}else if(!(row.error_kind==='other'&&row.error_code===null||row.error_kind==='source_refused'&&['operator','control','complete'].includes(row.error_code)||row.error_kind==='runtime_refused'&&['operator','control'].includes(row.error_code)||row.error_kind==='native_failure'&&['io','deadline','response','heartbeat_unavailable','not_ready'].includes(row.error_code)||row.error_kind==='control_refused'&&controlCodes.has(row.error_code)||row.error_kind==='node_io'&&nodeCodes.has(row.error_code)))fail();return Object.freeze(row)})
 if(rows.find(row=>row.status==='rejected')?.branch!==r.primary_branch)fail()
 return Object.freeze({...r,branches:Object.freeze(rows)})
}
export function parseFull069FailureBoundaryObservations(stderr){
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>524288||stderr.includes('\0'))return Object.freeze([])
 const records=[],seen=new Set()
 for(const line of stderr.split(/\r?\n/)){
  const decoded=line.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));if(!decoded.includes(requestEvent)&&!decoded.includes(branchEvent))continue
  if(Buffer.byteLength(line)>4096)return Object.freeze([])
  try{const raw=parseWorkerHeartbeatControlJson(Buffer.from(line),4096);if(JSON.stringify(raw)!==line||seen.has(raw.event))return Object.freeze([]);const parsed=raw.event===requestEvent?parseFull069NativeRequestFailureData(raw):parseFull069RejectedBranchesFailureData(raw);seen.add(parsed.event);records.push(parsed)}catch{return Object.freeze([])}
 }
 const request=records.find(r=>r.event===requestEvent),branch=records.find(r=>r.event===branchEvent);if(request&&branch&&branch.primary_branch!=='native')return Object.freeze([])
 return Object.freeze(records)
}
