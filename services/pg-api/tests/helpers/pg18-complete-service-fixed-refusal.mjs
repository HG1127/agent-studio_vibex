// Fixed metadata only; observer failure never changes original control flow.
import {isProxy} from 'node:util/types'
const stages=new Set(['schema_install','service_refusal_cases','api_preparation','native_auth_preparation','first_admin','successor_preparation','records_and_images','native_entry','post_native_observation','review_worker','executor','review_stack','plan_workflow','final13','summary','admin_end'])
const finalPairReasons=new Set(['final_ledger_and_images','record_metadata','record_credential_leak','original_result_immutable','actual_case_count'])
function own(value,key){if(value===null||typeof value!=='object'&&typeof value!=='function'||isProxy(value))return undefined;try{const d=Object.getOwnPropertyDescriptor(value,key);return d&&'value'in d?d.value:undefined}catch{return undefined}}
export function emitCompleteServiceFixtureRefusal(stage,error){
 try{
  if(!stages.has(stage))return
  const code=own(error,'code'),message=own(error,'message'),kind=code==='ERR_ASSERTION'?'assertion':code==='42501'?'insufficient_privilege':code==='57014'?'statement_cancelled':['ECONNRESET','ECONNREFUSED','ETIMEDOUT'].includes(code)?'connection_failure':'unclassified'
  const reason=stage==='plan_workflow'&&code==='ERR_ASSERTION'&&finalPairReasons.has(message)?message:'unclassified'
  process.stderr.write(JSON.stringify({event:'complete069_service_fixed_refusal',stage,error_kind:kind,fixed_reason:reason,production_GO:false})+'\n')
 }catch{}
}
