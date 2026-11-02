// Diagnostic DATA only. Independent of the older mixed16-record parser; bind
// noise cannot consume this channel. Never accepts a lease/identity/ready proof.
import {isProxy} from 'node:util/types'
import {parseRegistryReadFailureObservation} from '../../src/worker-heartbeat-registry-failure-observation.ts'
import {parseWorkerHeartbeatControlJson} from '../../src/worker-heartbeat-activation-control-contract.ts'
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment'],events=new Set(['worker_heartbeat_registry_read_failure_observation','worker_heartbeat_reader_lease_timing_observation','worker_heartbeat_owned_cleanup_timing_observation','full069_worker_live_native_not_ready_observation','genuine_writer_ci_stopped_cleanup_timeout_observation','worker_heartbeat_reader_failure_observation','worker_heartbeat_control_failure_observation'])
const failureKinds=new Set(['source_refused','runtime_refused','control_error','writer_closed','writer_uncertain','writer_busy','writer_not_enrolled','query_cancelled','query_lock_timeout','query_client_timeout','query_client_closed','filesystem_io','transport_io','abort','type_error','range_error','syntax_error','other']),readerCodes=new Set(['lease_expired','lease_revoked','registry_mismatch','reader_capacity','reader_timeout','reader_cleanup_unknown','control_closed','control_io_failed','source_runtime_refused','binding_changed','untrusted_reference','control_busy']),sites=new Set(['record_entry','record_identity_before','record_selection_before','record_query','record_selection_after','record_identity_after','record_final_guard','cleanup_entry','cleanup_end_client','cleanup_terminate_owned','cleanup_discover','cleanup_wait_absence','cleanup_ended_journal'])
function record(raw,keys){if(!raw||typeof raw!=='object'||isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)throw Error('observation_data');const d=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))throw Error('observation_data');return Object.fromEntries(keys.map(k=>[k,d[k].value]))}
const integer=(v,min=0,max=120000)=>Number.isSafeInteger(v)&&v>=min&&v<=max,time=(v,min=0)=>v===null||integer(v,min),freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v}
function array(raw,max){if(!Array.isArray(raw)||isProxy(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>max)throw Error('observation_data');const d=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(d).length!==raw.length+1)throw Error('observation_data');return Array.from({length:raw.length},(_,i)=>{if(!d[i]?.enumerable||!Object.hasOwn(d[i],'value'))throw Error('observation_data');return d[i].value})}
export function parseCleanupReaderObservation(raw){
 try{
  if(!raw||typeof raw!=='object'||isProxy(raw))return null
  const event=Object.getOwnPropertyDescriptor(raw,'event')?.value;let v
  if(event==='worker_heartbeat_registry_read_failure_observation')return parseRegistryReadFailureObservation(raw)
  if(event==='worker_heartbeat_reader_lease_timing_observation'){
   v=record(raw,['event','stage','outcome','elapsed_ms','remaining_ms','guard_calls','guard_ms','writer_operation','writer_cleanups','observed_data_only'])
   if(!['begin_registry','connect_reader','identity','begin_rr','catalog','snapshot','finish_registry'].includes(v.stage)||!['failed','consumed'].includes(v.outcome)||!time(v.elapsed_ms)||!time(v.remaining_ms,-120000)||!integer(v.guard_calls,0,4096)||!time(v.guard_ms)||typeof v.writer_operation!=='boolean'||!integer(v.writer_cleanups,0,32))return null
  }else if(event==='worker_heartbeat_owned_cleanup_timing_observation'){
   v=record(raw,['event','kind','outcome','elapsed_ms','end_client_ms','terminate_owned_ms','discover_ms','wait_absence_ms','ended_journal_ms','observed_data_only'])
   if(!kinds.includes(v.kind)||!['ended','failed'].includes(v.outcome)||['elapsed_ms','end_client_ms','terminate_owned_ms','discover_ms','wait_absence_ms','ended_journal_ms'].some(k=>!time(v[k])))return null
  }else if(event==='full069_worker_live_native_not_ready_observation'){
   v=record(raw,['event','snapshot_age_ms','workers','observed_data_only','qualifies_run','production_cutover_allowed'])
   if(!time(v.snapshot_age_ms,-120000)||v.qualifies_run!==false||v.production_cutover_allowed!==false)return null
   const rows=array(v.workers,8);if(rows.length!==8)return null
   const reasons={ready:['fresh_ready_report'],draining:['fresh_draining_report'],stale:['heartbeat_expired'],unknown:['not_observed','not_instrumented','component_disabled','loop_unavailable']}
   v.workers=rows.map((raw,i)=>{const r=record(raw,['kind','state','reason','seen_age_ms']);if(r.kind!==kinds[i]||!Object.hasOwn(reasons,r.state)||!reasons[r.state].includes(r.reason)||!time(r.seen_age_ms,-120000)||r.state==='unknown'&&r.seen_age_ms!==null)throw Error('observation_data');return r})
  }else if(event==='genuine_writer_ci_stopped_cleanup_timeout_observation'){
   v=record(raw,['event','expected_backends','missing_ended_kinds','original_wait_ms','observed_data_only']);v.missing_ended_kinds=array(v.missing_ended_kinds,8)
   if(!integer(v.expected_backends,0,16)||v.original_wait_ms!==5000||v.missing_ended_kinds.length>v.expected_backends||new Set(v.missing_ended_kinds).size!==v.missing_ended_kinds.length||v.missing_ended_kinds.some(k=>!kinds.includes(k)))return null
  }else if(event==='worker_heartbeat_reader_failure_observation'){
   v=record(raw,['event','phase','code','kind','observed_data_only']);if(!['prepare','finish'].includes(v.phase)||v.code!==null&&!readerCodes.has(v.code)||!failureKinds.has(v.kind))return null
  }else if(event==='worker_heartbeat_control_failure_observation'){
   v=record(raw,['event','site','kind','observed_data_only']);if(!sites.has(v.site)||!failureKinds.has(v.kind))return null
  }else return null
  return v.observed_data_only===true?freeze(v):null
 }catch{return null}
}
export function parseCleanupReaderObservations(stderr){
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>524288||stderr.includes('\0'))return Object.freeze([])
 const result=[];let bytes=0
 for(const line of stderr.split(/\r?\n/)){
  const hint=line.replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))
  if(![...events].some(name=>hint.includes(name)))continue
  if(Buffer.byteLength(line)>4096)return Object.freeze([])
  let raw;try{raw=parseWorkerHeartbeatControlJson(Buffer.from(line),4096)}catch{return Object.freeze([])}
  const parsed=parseCleanupReaderObservation(raw)
  // Known legacy control phases outside this closed diagnostic scope are ignored.
  if(!parsed){if(raw?.event==='worker_heartbeat_control_failure_observation'&&!sites.has(raw.site))continue;return Object.freeze([])}
  bytes+=Buffer.byteLength(JSON.stringify(parsed));result.push(parsed)
  if(result.length>32||bytes>8192)return Object.freeze([])
 }
 return Object.freeze(result)
}
export function additionalCleanupReaderObservations(stderr,prior){try{const seen=new Set(array(prior,32).map(parseCleanupReaderObservation).filter(Boolean).map(v=>JSON.stringify(v)));return Object.freeze(parseCleanupReaderObservations(stderr).filter(v=>!seen.has(JSON.stringify(v))))}catch{return Object.freeze([])}}
