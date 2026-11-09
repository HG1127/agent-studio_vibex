// Closed failure DATA only. No Reader, snapshot, context, credential or authority.
import {isProxy} from 'node:util/types'
import {parseWorkerHeartbeatControlJson} from './worker-heartbeat-activation-control-contract.ts'
const phases=new Set(['native_authorization','controller_reader_audit','verified_before_native_logout'])
const primaryCodes=new Set(['full069_worker_live_native_deadline','full069_worker_live_native_response','full069_worker_live_native_io','full069_worker_live_native_anonymous_guard','full069_worker_live_native_admin_login','full069_worker_live_native_cookie','full069_worker_live_native_current_admin','full069_worker_live_native_heartbeat_unavailable','full069_worker_live_native_not_ready','full069_worker_live_native_logout','full069_worker_live_native_revocation','full069_final_path_ci_dependency_refused'])
function record(raw,keys){if(!raw||typeof raw!=='object'||isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)throw Error('native_reader_failure_data');const ds=Object.getOwnPropertyDescriptors(raw);if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))throw Error('native_reader_failure_data');return Object.fromEntries(keys.map(k=>[k,ds[k].value]))}
export function parseFull069NativeReaderPhase(raw){const r=record(raw,['event','phase','completed_native_observation','qualifies_run','production_cutover_allowed']);if(r.event!=='full069_worker_live_reader_catalog_phase'||!phases.has(r.phase)||r.completed_native_observation!==false||r.qualifies_run!==false||r.production_cutover_allowed!==false)throw Error('native_reader_failure_data');return Object.freeze(r)}
export function full069FinalNativeReaderFailureData(reader,primaryCode){const parsed=parseFull069NativeReaderPhase(reader);return Object.freeze({event:'full069_final14_native_reader_failure',primary_code:primaryCodes.has(primaryCode)?primaryCode:null,reader:parsed,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})}
export function parseFull069FinalNativeReaderFailure(raw,primaryCode){const r=record(raw,['event','primary_code','reader','observed_data_only','runtime_authorization','qualifies_run','production_GO']);if(r.event!=='full069_final14_native_reader_failure'||r.primary_code!==(primaryCodes.has(primaryCode)?primaryCode:null)||r.primary_code!==null&&!primaryCodes.has(r.primary_code)||r.observed_data_only!==true||['runtime_authorization','qualifies_run','production_GO'].some(k=>r[k]!==false))throw Error('native_reader_failure_data');return Object.freeze({...r,reader:parseFull069NativeReaderPhase(r.reader)})}
export function parseFull069FinalNativeReaderFailures(stderr,primaryCode){
 if(typeof stderr!=='string'||Buffer.byteLength(stderr)>524288||stderr.includes('\0'))return Object.freeze([])
 const records=[];let seen=0
 for(const line of stderr.split(/\r?\n/)){
  if(Buffer.byteLength(line)>4096)return Object.freeze([])
  if(!line.replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).includes('full069_final14_native_reader_failure'))continue
  if(++seen>1)return Object.freeze([])
  try{records.push(parseFull069FinalNativeReaderFailure(parseWorkerHeartbeatControlJson(Buffer.from(line),4096),primaryCode))}catch{return Object.freeze([])}
 }
 return Object.freeze(records)
}
