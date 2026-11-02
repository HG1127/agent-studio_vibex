// Closed failure DATA only. No access, lease, identity or registry authority.
import {isNativeError,isProxy} from 'node:util/types'
export const registryReadFailureSites=Object.freeze([
 'management_catalog','incoming_access','expected_policy','observe','context','target_binding','target_role_shape','target_role_attributes',
 'target_query','registry_query','other_query','target_validation','registry_validation','registry_clock','registry_kind_policy',
 'registry_slot_shape','slot_role_oid','slot_login_name','slot_enabled','slot_generation','slot_clock_guard',
 'registry_zero_report','registry_inactive_report','registry_report_clock','registry_report_state',
 'observation_clock_regressed','reset_history_invalid','generation_changed','inactive_history_changed',
 'sequence_regressed','same_sequence_changed','report_time_regressed','draining_revived','policy_material_changed',
] as const)
export type RegistryReadFailureSite=typeof registryReadFailureSites[number]
const causes=Object.freeze(['management_check','registry_check','lease_expired','lease_revoked','reader_capacity','reader_timeout','control_closed','control_busy','binding_changed','untrusted_reference','source_runtime_refused','control_io_failed','source_refused','runtime_refused','query_cancelled','query_lock_timeout','query_client_timeout','transport_io','other'] as const)
type Cause=typeof causes[number]
export type RegistryReadFailureObservation=Readonly<{event:'worker_heartbeat_registry_read_failure_observation';site:RegistryReadFailureSite;cause:Cause;outcome:'failed';observed_data_only:true;runtime_authorization:false;qualifies_run:false;production_GO:false}>
const controlCodes=new Set<string>(['lease_expired','lease_revoked','reader_capacity','reader_timeout','control_closed','control_busy','binding_changed','untrusted_reference','source_runtime_refused','control_io_failed'])
function own(error:unknown,key:string):unknown{try{if(!isNativeError(error)||isProxy(error))return null;const d=Object.getOwnPropertyDescriptor(error,key);return d&&Object.hasOwn(d,'value')?d.value:null}catch{return null}}
function category(error:unknown):Cause{
 const code=own(error,'code'),message=own(error,'message')
 if(typeof code==='string'&&controlCodes.has(code))return code as Cause
 if(message==='unsafe_worker_heartbeat_management_catalog')return 'management_check'
 if(code==='registry_mismatch'&&message==='worker_heartbeat_registry_refused')return 'registry_check'
 if(message==='worker_heartbeat_activation_control_source_refused')return 'source_refused'
 if(message==='worker_heartbeat_activation_control_runtime_refused')return 'runtime_refused'
 if(code==='57014')return 'query_cancelled';if(code==='55P03')return 'query_lock_timeout'
 if(message==='Query read timeout')return 'query_client_timeout'
 if(typeof code==='string'&&['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','ERR_STREAM_DESTROYED'].includes(code))return 'transport_io'
 return 'other'
}
export function registryReadFailureData(site:RegistryReadFailureSite,error:unknown):RegistryReadFailureObservation{
 if(!registryReadFailureSites.includes(site))throw Error('registry_read_failure_data')
 return Object.freeze({event:'worker_heartbeat_registry_read_failure_observation',site,cause:category(error),outcome:'failed',observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})
}
export function parseRegistryReadFailureObservation(raw:unknown):RegistryReadFailureObservation|null{
 try{
  if(!raw||typeof raw!=='object'||isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)return null
  const ds=Object.getOwnPropertyDescriptors(raw),keys=['event','site','cause','outcome','observed_data_only','runtime_authorization','qualifies_run','production_GO']
  if(Reflect.ownKeys(ds).length!==keys.length||keys.some(k=>!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))return null
  const value=Object.fromEntries(keys.map(k=>[k,ds[k]!.value]))
  if(value.event!=='worker_heartbeat_registry_read_failure_observation'||!registryReadFailureSites.includes(value.site)||!causes.includes(value.cause)||value.outcome!=='failed'||value.observed_data_only!==true||value.runtime_authorization!==false||value.qualifies_run!==false||value.production_GO!==false)return null
  return Object.freeze(value) as RegistryReadFailureObservation
 }catch{return null}
}
