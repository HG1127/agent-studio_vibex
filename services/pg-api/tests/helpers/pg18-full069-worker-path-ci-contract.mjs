// Closed CI result data only. No caller-provided proof becomes an authority.
import {liveEntries} from '../../src/pg18-full069-worker-live-contract.mjs'
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
