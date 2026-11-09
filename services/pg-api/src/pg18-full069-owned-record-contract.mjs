// Fixed leaf names and closed failure observations only. No filesystem, process,
// trust, run, Reader or receipt authority is created by this pure module.
import {liveFail} from './pg18-full069-worker-live-contract.mjs'
const childLeaves=Object.freeze({native:'child-native.json',prepare:'child-prepare.json',model:'child-model.json',workflow_safe:'child-workflow_safe.json',workflow_v2:'child-workflow_v_two.json',agent_autonomous:'child-agent_autonomous.json',knowledge:'child-knowledge.json',assessment:'child-assessment.json'})
export function full069OwnedChildRecordName(id){
 if(typeof id!=='string'||!Object.hasOwn(childLeaves,id))liveFail('child_record_identity')
 return childLeaves[id]
}
const recordReasons=new Set(['full069_worker_live_record_path','full069_worker_live_store_state','full069_worker_live_private_file','full069_worker_live_record_changed','full069_worker_live_file_changed','full069_worker_live_source_changed','full069_worker_live_path_validation_record','full069_worker_live_path_validation_record_changed','full069_worker_live_path_validation_expired','full069_final_trust_record_name','full069_final_trust_store_state','full069_final_trust_file_changed','full069_final_trust_profile_changed'])
const nodeCodes=new Set(['EACCES','EPERM','EEXIST','ENOSPC','EIO','ENOENT','ELOOP','EMFILE','ENFILE'])
export function full069RecordWriteFailureData(profile,phase,primary,error){
 if(!['legacy_short','legacy_live','final'].includes(profile)||!['validation_result','failure_record'].includes(phase))return null
 let recordReason=null,errorCode=null
 try{
  if(error&&(typeof error==='object'||typeof error==='function')){
   const message=Object.getOwnPropertyDescriptor(error,'message'),code=Object.getOwnPropertyDescriptor(error,'code')
   if(message&&Object.hasOwn(message,'value')&&recordReasons.has(message.value))recordReason=message.value
   if(code&&Object.hasOwn(code,'value')&&nodeCodes.has(code.value))errorCode=code.value
  }
 }catch{/* A failed diagnostic never replaces either failure. */}
 const primaryReason=typeof primary==='string'&&/^(?:full069_(?:worker_live|final(?:14)?(?:_run|_runtime|_trust|_window|_records)?)_[a-z0-9_]{1,120}|pg18_full069_final14_[a-z0-9_]{1,120})$/.test(primary)?primary:null
 return Object.freeze({event:'full069_record_write_failure',profile,phase,primary_reason:primaryReason,record_reason:recordReason,record_error_code:errorCode,observed_data_only:true,qualifies_run:false,production_cutover_allowed:false})
}
