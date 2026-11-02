import {HttpError,type SqlClient} from './contracts.ts'
import {ownId} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {NativeMonitorBusinessData,type MonitorPreparedRecord,type MonitorRecordWrite} from './native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from './native-monitor-definition-authority.ts'
import {monitorCanonical,monitorHash} from './native-monitor-source-contract.ts'
import {readMonitorStoredReceipt} from './native-monitor-source-access.ts'
export type MonitorOriginalWorkerClaim={job_id:string;run_id:string;lease_token:string;lease_version:number;lease_owner:string}
export type MonitorOriginalEffectFence=(db:SqlClient,owner:string,runId:string,input:MonitorRecordWrite)=>Promise<void>
function invalid(code='monitor_worker_binding_changed'):never{throw new HttpError(409,code)}
function claim(raw:MonitorOriginalWorkerClaim):MonitorOriginalWorkerClaim{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==5||!['job_id','run_id','lease_token','lease_version','lease_owner'].every(k=>Object.hasOwn(raw,k))||!Number.isSafeInteger(raw.lease_version)||raw.lease_version<1||typeof raw.lease_owner!=='string'||!raw.lease_owner.trim()||raw.lease_owner.length>120)return invalid()
 return Object.freeze({job_id:ownId(raw.job_id),run_id:ownId(raw.run_id),lease_token:ownId(raw.lease_token),lease_version:raw.lease_version,lease_owner:raw.lease_owner})
}
async function asOriginalWorker<T>(db:SqlClient,work:()=>Promise<T>):Promise<T>{
 await db.query('SET LOCAL ROLE agentstudio_worker')
 try{return await work()}finally{await db.query('SET LOCAL ROLE agentstudio_api')}
}
// These callbacks are installed only by the optional Agent sub-effect adapter,
// after the unchanged Root approval/effect/dispatch lease checks. The fence is
// mandatory; it is never inferred from a model message, marker or spec alone.
export function createMonitorOriginalWorkerData(rawClaim:MonitorOriginalWorkerClaim,effectFence:MonitorOriginalEffectFence){
 const lease=claim(rawClaim)
 if(typeof effectFence!=='function')throw Error('monitor_original_effect_fence_required')
 let data:NativeMonitorBusinessData,authority:NativeMonitorDefinitionAuthority
 const binding=async(db:SqlClient,owner:string,caseId:string,runId:string)=>{
  ownId(owner);ownId(caseId);ownId(runId);await assertOwnedAdmissionContext(db,owner)
  if(runId!==lease.run_id)return invalid()
  const rows=await asOriginalWorker(db,async()=>(await db.query<{value:Record<string,unknown>}>('SELECT agentstudio.monitor_live_worker_binding($1::jsonb) AS value',[JSON.stringify(lease)])).rows)
  const value=rows[0]?.value
  if(rows.length!==1||!value||value.owner_user_id!==owner||value.case_id!==caseId||value.run_id!==runId||typeof value.definition_hash!=='string'||!value.definition||typeof value.definition!=='object'||Array.isArray(value.definition)||monitorHash(value.definition)!==value.definition_hash)return invalid()
  const checkId=ownId(value.check_id)
  await authority.assertCurrent(db,owner,{case_id:caseId,definition_hash:value.definition_hash,definition:value.definition as Parameters<NativeMonitorDefinitionAuthority['assertCurrent']>[2]['definition']})
  return{value,checkId,definition:value.definition as Record<string,unknown>}
 }
 const gate=async(db:SqlClient,owner:string,caseId:string,runId:string,input:MonitorRecordWrite)=>{
  const current=await binding(db,owner,caseId,runId)
  await effectFence(db,owner,runId,input)
  if(input.schema_id==='research.entity.v1'){
   if(input.record_id||input.expected_version!==0||input.payload.entity_type==='PERSON')return invalid('monitor_identity_edit_requires_revision')
   return
  }
  if(input.schema_id!=='research.relation.v1')return invalid('monitor_write_schema_not_allowed')
  const targets=current.definition.target_entity_ids,relations=current.definition.relation_types
  if(!Array.isArray(targets)||!targets.includes(input.payload.from_id)||!Array.isArray(relations)||!relations.includes(input.payload.relation_type))return invalid('monitor_write_outside_scope')
  if(input.record_id){
   const prior=await data.get(db,owner,caseId,input.record_id)
   if(['from_id','to_id','relation_type'].some(k=>prior.payload[k]!==input.payload[k]))return invalid('monitor_relation_identity_immutable')
  }
  let fresh=false
  for(const ref of input.source_refs){
   const receipt=await readMonitorStoredReceipt(db,owner,caseId,ref.run_id,ref.result_id)
   if(ref.run_id===runId&&receipt.monitor_check_id===current.checkId)fresh=true
  }
  if(!fresh)return invalid('monitor_fact_without_fresh_source')
 }
 const persist=async(db:SqlClient,owner:string,caseId:string,runId:string,prepared:MonitorPreparedRecord)=>{
  await assertOwnedAdmissionContext(db,owner)
  if(runId!==lease.run_id||prepared.run_id!==runId)return invalid()
  const rows=await asOriginalWorker(db,async()=>(await db.query<{value:{record_id:string;version:number}}>('SELECT agentstudio.monitor_live_record_write($1::uuid,$2::jsonb,$3::jsonb) AS value',[caseId,JSON.stringify(prepared),JSON.stringify(lease)])).rows)
  const value=rows[0]?.value
  if(rows.length!==1||!value||value.record_id!==prepared.record_id||value.version!==prepared.expected_version+1)return invalid()
  return value
 }
 data=new NativeMonitorBusinessData(gate,persist);authority=new NativeMonitorDefinitionAuthority(data)
 return Object.freeze({data,requireBinding:binding})
}
