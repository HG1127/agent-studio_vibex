import {types as pathCiObservationTypes} from 'node:util'
import {parseOwnedProcessFailureObservation} from '../../src/pg18-full069-owned-process-observation.mjs'
// Closed CI result data only. No caller-provided proof becomes an authority.
import {liveEntries} from '../../src/pg18-full069-worker-live-contract.mjs'
import {controlErrorCodes} from '../../src/worker-heartbeat-activation-control-contract.ts'
export const pathCiApproval='RUN_BOUNDED_OWNED_FULL069_WORKER_PATHS_ONLY'
export function requirePathCiApproval(env){if(env.AGENT_STUDIO_FULL069_WORKER_PATH_CI_APPROVED!==pathCiApproval)throw Error('full069_path_ci_refused:approval')}
function result(value,runId,completed){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='BEGIN_or_END_receipt_issued,details,format,production_cutover_allowed,qualifies_run,qualifying_window_started,reason,run_id,validation_completed'||value.format!=='pg18_full069_worker_path_validation_result_v1'||value.run_id!==runId||value.validation_completed!==completed||value.reason!==null||['qualifies_run','qualifying_window_started','BEGIN_or_END_receipt_issued','production_cutover_allowed'].some(k=>value[k]!==false))throw Error('full069_path_ci_refused:short_result')
 return value
}
export function assertPathCiResult(value,runId){return result(value,runId,true)}
export function assertPathCiWarm(value,runId){result(value,runId,false);if(value.details?.phase!=='warm')throw Error('full069_path_ci_refused:short_warm');return value}
export function assertPathCiCleanup(record,runId){
 assertPathCiResult(record,runId);const d=record.details,w=d?.worker_stop,n=d?.native_stop,p=d?.proxy_stop,c=d?.cleanup
 if(!Array.isArray(w)||w.length!==7||w.some(v=>!v||v.graceful!==true||v.absent!==true||v.supervisor_absent!==true||v.identity_verified!==true||v.forced!==false)||JSON.stringify(w.map(v=>v.id).sort())!==JSON.stringify(liveEntries.map(v=>v.id).sort())||n?.id!=='native'||n.graceful!==true||n.absent!==true||n.supervisor_absent!==true||n.identity_verified!==true||n.forced!==false||p?.graceful!==true||p.proxy_closed!==true||c?.telemetry_backend_count!==0||c.readers_in_flight!==0||!c.queues||Object.keys(c.queues).sort().join(',')!=='jobs,queries,reviews,runs'||Object.values(c.queues).some(v=>v!==0))throw Error('full069_path_ci_refused:short_cleanup')
 return true
}

// Retain every original C7 rule and the exact Review four-rule guard. New
// telemetry rules precede the original generic rejections they must not bypass.
export const pathCiOriginalSevenLogins=Object.freeze(['agentstudio_stage_login','agentstudio_native_login','agentstudio_stage_worker','agentstudio_bound_dispatch_login','agentstudio_model_broker_login','agentstudio_knowledge_index_worker_login','agentstudio_knowledge_index_broker_login'])
export function pathCiTelemetryHbaLines(){
 const review='agentstudio_review_worker_login',telemetry=['studio_telemetry_reader',...liveEntries.flatMap(e=>e.kinds).flatMap(kind=>[1,2].map(n=>'studio_telemetry_tx_'+kind+'_'+n))]
 return Object.freeze([
  'local all '+review+' reject','host agent_studio '+review+' 127.0.0.1/32 scram-sha-256','host all '+review+' 0.0.0.0/0 reject','host all '+review+' ::/0 reject',
  'local all postgres peer',...pathCiOriginalSevenLogins.map(n=>'local agent_studio '+n+' reject'),...telemetry.map(n=>'local agent_studio_telemetry '+n+' reject'),'local all all reject',
  'host all postgres 127.0.0.1/32 scram-sha-256',...pathCiOriginalSevenLogins.map(n=>'host agent_studio '+n+' 127.0.0.1/32 scram-sha-256'),...telemetry.map(n=>'host agent_studio_telemetry '+n+' 127.0.0.1/32 scram-sha-256'),'host all all 0.0.0.0/0 reject','host all all ::/0 reject',
 ])
}
export function pathCiTelemetryHbaText(){return pathCiTelemetryHbaLines().join('\n')+'\n'}

// Diagnostic DATA only. Never replaces the original signed network hash check.
export function pathCiNetworkDrift(before,after){
 if([before,after].some(v=>typeof v!=='string'||Buffer.byteLength(v)>2097152||v.includes('\0')))throw Error('full069_path_ci_refused:network_observation_shape')
 const lines=value=>value.split('\n'),a=lines(before),b=lines(after),policy=value=>lines(value).map(line=>/^:[A-Za-z0-9_-]+ (?:ACCEPT|DROP|-) \[(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)\]$/.test(line)?line.replace(/\[[0-9]+:[0-9]+\]$/,'[0:0]'):line).join('\n'),same=before===after
 return Object.freeze({exact_same:same,changed_only_chain_counters:!same&&policy(before)===policy(after),changed_line_count:Array.from({length:Math.max(a.length,b.length)},(_,i)=>a[i]!==b[i]).filter(Boolean).length,observed_data_only:true,qualifies_run:false,production_cutover_allowed:false})
}

// Forward only closed failure-observation labels. Never copy raw child stderr.
const trustPhases=new Set(['host_admission','configuration','operator_key','signed_profile','source_capture','source_verify','host_runtime','telemetry_read','telemetry_envelope','telemetry_root_profile','telemetry_binding','writer_scope','credential_read','C_records','handle_publish']),trustCredentials=new Set(['admin','api','native_auth','worker','identity','broker','index_worker','index_broker','review_worker','employee_profile','employee_password','tls_ca','tls_certificate','tls_key','executor']),trustClasses=new Set(['Error','TypeError','RangeError','SyntaxError','WorkerHeartbeatControlError']),trustNodeCodes=new Set(['ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_UNSUPPORTED_DIR_IMPORT','ERR_REQUIRE_ESM','ERR_INVALID_ARG_TYPE','ERR_OSSL_EVP_UNSUPPORTED','ENOENT','EACCES','EPERM','EIO','ELOOP','EMFILE','ENFILE','ENOSPC','ETIMEDOUT','ECONNREFUSED','ECONNRESET','EPIPE'])
export function pathCiTrustFailures(stderr){
 const records=[]
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>262144||stderr.includes('\0'))return Object.freeze(records)
 for(const line of stderr.split(/\r?\n/)){
  if(line.length>1024)continue
  let v;try{v=JSON.parse(line)}catch{continue}
  if(!v||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join(',')!=='credential_key,error_class,error_code,event,observed_data_only,phase,production_cutover_allowed,qualifies_run'||v.event!=='full069_worker_live_trust_failure'||!trustPhases.has(v.phase)||v.observed_data_only!==true||v.qualifies_run!==false||v.production_cutover_allowed!==false)continue
  if(v.credential_key!==null&&(v.phase!=='credential_read'||!trustCredentials.has(v.credential_key))||v.error_class!==null&&!trustClasses.has(v.error_class)||v.error_code!==null&&(v.error_class===null||typeof v.error_code!=='string'||!(v.error_class==='WorkerHeartbeatControlError'?controlErrorCodes.includes(v.error_code):trustNodeCodes.has(v.error_code))))continue
  records.push(Object.freeze({event:v.event,phase:v.phase,credential_key:v.credential_key,error_class:v.error_class,error_code:v.error_code,observed_data_only:true,qualifies_run:false,production_cutover_allowed:false}))
  if(records.length>1)return Object.freeze([])
 }
 return Object.freeze(records)
}

// Failure observation DATA only, after the fixture's original privateRead/json.
// This grants no trust, process identity, readiness, cleanup or retry authority.
const pathCiOwnedObservationLimits=Object.freeze({nodes:4096,depth:20,array:128,keys:64,string:8192,stringTotal:262144})
function pathCiBoundedObservationTree(root){
 const seen=new WeakSet();let nodes=0,strings=0
 const visit=(value,depth)=>{
  if(++nodes>pathCiOwnedObservationLimits.nodes||depth>pathCiOwnedObservationLimits.depth)throw 0
  if(value===null||typeof value==='boolean')return
  if(typeof value==='string'){strings+=value.length;if(value.length>pathCiOwnedObservationLimits.string||strings>pathCiOwnedObservationLimits.stringTotal)throw 0;return}
  if(typeof value==='number'){if(!Number.isFinite(value))throw 0;return}
  if(typeof value!=='object'||pathCiObservationTypes.isProxy(value)||seen.has(value))throw 0
  seen.add(value);const array=Array.isArray(value),prototype=Object.getPrototypeOf(value)
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw 0
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors)
  if(array){if(!Object.hasOwn(descriptors.length??{},'value')||!Number.isSafeInteger(descriptors.length.value)||descriptors.length.value>pathCiOwnedObservationLimits.array||keys.length!==descriptors.length.value+1)throw 0}
  else if(keys.length>pathCiOwnedObservationLimits.keys)throw 0
  for(const key of keys){
   if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))throw 0
   const descriptor=descriptors[key]
   if(array&&key==='length')continue
   if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||array&&!/^(?:0|[1-9][0-9]*)$/.test(key))throw 0
   visit(descriptor.value,depth+1)
  }
 }
 visit(root,0)
}
function pathCiObservationClosed(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value))throw 0
 const keys=Object.keys(value);if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))throw 0
 return value
}
const pathCiObservedEntryIds=Object.freeze(['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge','assessment'])
function pathCiObservedStop(raw,native=false){
 const row=pathCiObservationClosed(raw,['id','graceful','forced','identity_verified'],['absent','supervisor_absent'])
 if(native?row.id!=='native':!pathCiObservedEntryIds.includes(row.id))throw 0
 for(const key of ['graceful','forced','identity_verified','absent','supervisor_absent'])if(Object.hasOwn(row,key)&&typeof row[key]!=='boolean')throw 0
 return Object.freeze({entry:row.id,graceful:row.graceful,forced:row.forced,identity_verified:row.identity_verified,absent:row.absent??null,supervisor_absent:row.supervisor_absent??null})
}
function pathCiObservedSample(value){
 if(value===null)return false
 const row=pathCiObservationClosed(value,['monotonic_ms','wall_ms','collected_ms','processes','native','runtime'])
 if(!Number.isSafeInteger(row.monotonic_ms)||row.monotonic_ms<0||!Number.isSafeInteger(row.wall_ms)||row.wall_ms<0||!Number.isSafeInteger(row.collected_ms)||row.collected_ms<0||!Array.isArray(row.processes)||row.processes.length!==8||!row.native||Array.isArray(row.native)||!row.runtime||Array.isArray(row.runtime))throw 0
 return true
}
export function pathCiOwnedFailureObservation(raw,expectedRunId,cliReason){
 try{
  if(typeof expectedRunId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expectedRunId))return null
  pathCiBoundedObservationTree(raw)
  const value=pathCiObservationClosed(raw,['format','run_id','validation_completed','reason','details','qualifies_run','qualifying_window_started','BEGIN_or_END_receipt_issued','production_cutover_allowed'])
  if(value.format!=='pg18_full069_worker_path_validation_result_v1'||value.run_id!==expectedRunId||value.validation_completed!==false||typeof value.reason!=='string'||!/^full069_worker_live_[a-z_]{1,80}$/.test(value.reason)||['qualifies_run','qualifying_window_started','BEGIN_or_END_receipt_issued','production_cutover_allowed'].some(key=>value[key]!==false))return null
  const d=pathCiObservationClosed(value.details,['source_sha256','complete_source_sha256','warm','last','worker_stop','native_stop','proxy_stop','cleanup'],['process_failure'])
  if(['source_sha256','complete_source_sha256'].some(key=>typeof d[key]!=='string'||!/^[a-f0-9]{64}$/.test(d[key]))||!Array.isArray(d.worker_stop)||d.worker_stop.length>7)return null
  const stops=d.worker_stop.map(row=>pathCiObservedStop(row)),byId=new Map(stops.map(row=>[row.entry,row]));if(byId.size!==stops.length)return null
  const native=d.native_stop===null?null:pathCiObservedStop(d.native_stop,true)
  let proxyGraceful=null,proxyClosed=null
  if(d.proxy_stop!==null){const p=pathCiObservationClosed(d.proxy_stop,['graceful'],['proxy_closed','owned_proxy_only']);if(typeof p.graceful!=='boolean'||Object.hasOwn(p,'proxy_closed')&&typeof p.proxy_closed!=='boolean'||Object.hasOwn(p,'owned_proxy_only')&&p.owned_proxy_only!==true)return null;proxyGraceful=p.graceful;proxyClosed=p.proxy_closed??null}
  let backendsZero=null,readersZero=null,queuesEmpty=null
  if(d.cleanup!==null){const c=pathCiObservationClosed(d.cleanup,['ledger_sha256','roles_sha256','queues','policy_sha256','root_journal_head_sha256','root_journal_records','used_boot_uids','bindings','telemetry_backend_count','readers_in_flight']);if(['telemetry_backend_count','readers_in_flight','root_journal_records','used_boot_uids'].some(key=>!Number.isSafeInteger(c[key])||c[key]<0)||!Array.isArray(c.bindings)||c.bindings.length!==8)return null;const q=pathCiObservationClosed(c.queues,['jobs','runs','reviews','queries']);if(Object.values(q).some(v=>!Number.isSafeInteger(v)||v<0))return null;backendsZero=c.telemetry_backend_count===0;readersZero=c.readers_in_flight===0;queuesEmpty=Object.values(q).every(v=>v===0)}
  return Object.freeze({event:'full069_worker_path_ci_owned_failure_observation',primary_code:'full069_path_ci_refused:short_cli_failed',reason_matches_cli:typeof cliReason==='string'&&value.reason===cliReason,validation_completed:false,warm_collected:pathCiObservedSample(d.warm),last_collected:pathCiObservedSample(d.last),worker_stop:Object.freeze(pathCiObservedEntryIds.filter(id=>byId.has(id)).map(id=>byId.get(id))),native_stop:native,proxy_graceful:proxyGraceful,proxy_closed:proxyClosed,cleanup_observed:d.cleanup!==null,telemetry_backends_zero:backendsZero,readers_in_flight_zero:readersZero,business_queues_empty:queuesEmpty,...(Object.hasOwn(d,'process_failure')?{process_failure:d.process_failure===null?null:parseOwnedProcessFailureObservation(d.process_failure)}:{}),observed_data_only:true,qualifies_run:false,production_cutover_allowed:false})
 }catch{return null}
}
