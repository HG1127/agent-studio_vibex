// Observations only. No metadata value, returned result or emitted line grants a
// profile capability. Disabled outside an explicitly selected async diagnostic scope. Hosted
// callers select it only after their existing purpose guard succeeds.
import {AsyncLocalStorage} from 'node:async_hooks'
const scope=new AsyncLocalStorage()
const profiles=new Set(['quality089','staff084'])
const phases=new Set(['source_capture','owned_target','complete069_install','service_api','complete069_verify','service_native_auth','initial_admin','service_worker','service_identity','service_broker','service_index_worker','service_index_broker','employee_ui078_install','composite_install','runtime_profile','tls_story','story','cleanup_profile'])
const auditors=new Set(['staff084_original','staff084_quality089'])
const limits={staff084_original:136,staff084_quality089:145}
function emit(record){try{process.stderr.write(JSON.stringify(record)+'\n')}catch{}}
export async function withHostedProfileDiagnostics(profile,body){
 if(!profiles.has(profile))return await body()
 return await scope.run({profile},body)
}
export async function hostedProfilePhase(phase,body){
 const selected=scope.getStore(),enabled=selected&&phases.has(phase)
 if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'enter'})
 try{const result=await body();if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'passed'});return result}
 catch(error){if(enabled)emit({event:'hosted_profile_phase',profile:selected.profile,phase,state:'refused'});throw error}
}
export function hostedProfileCatalogRefusal(auditor,check){
 const selected=scope.getStore();if(!selected||!auditors.has(auditor)||!Number.isSafeInteger(check)||check<0||check>limits[auditor])return
 emit({event:'hosted_profile_catalog_refusal',profile:selected.profile,auditor,check_id:check})
}
