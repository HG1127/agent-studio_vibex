// One bounded step per caller-owned verified Actor transaction. The coordinator
// commits each step before rescheduling; no provider or network operation occurs
// here. A resumed step rereads the durable cursor instead of replaying a chunk.
import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {NativeMonitorBusinessData,type MonitorBusinessRecord,type MonitorRecordPin} from './native-monitor-business-data.ts'
import {monitorCanonical,monitorHash} from './native-monitor-source-contract.ts'
import type {LiveMonitorDefinition} from './native-monitor-live-analysis.ts'
export type MonitorFreezeLease={check_id:string;lease_token:string;lease_version:number}
type CurrentMonitor={case_id:string;definition_hash:string;definition:LiveMonitorDefinition}
type FreezeJob={id:string;owner_user_id:string;case_id:string;check_id:string;run_id:string;manifest:MonitorRecordPin[];manifest_hash:string;next_index:number;records:MonitorBusinessRecord[];reference_records:MonitorBusinessRecord[];created_ms:number}
const fail=(code='monitor_freeze_changed',status=409):never=>{throw new HttpError(status,code)}
const count=(v:unknown,min=0):number=>{const n=typeof v==='number'?v:ownDatabaseCount(v);if(!Number.isSafeInteger(n)||n<min||Object.is(n,-0))return fail('monitor_freeze_integrity_error',503);return n}
const object=(v:unknown):Record<string,unknown>=>{monitorCanonical(v);if(!v||typeof v!=='object'||Array.isArray(v))return fail('monitor_freeze_integrity_error',503);return v as Record<string,unknown>}
const key=(pin:MonitorRecordPin)=>pin.record_id+':'+pin.version
function leaseValue(raw:MonitorFreezeLease):MonitorFreezeLease{
 const v=object(raw)
 if(Object.keys(v).length!==3||!['check_id','lease_token','lease_version'].every(k=>Object.hasOwn(v,k)))return fail('invalid_monitor_freeze_lease',400)
 return Object.freeze({check_id:ownId(v.check_id),lease_token:ownId(v.lease_token),lease_version:count(v.lease_version,1)})
}
function jobValue(raw:unknown,owner:string,lease:MonitorFreezeLease):FreezeJob{
 const v=object(raw),manifest=v.manifest
 if(v.owner_user_id!==owner||v.check_id!==lease.check_id||v.status!=='running'||!Array.isArray(manifest)||manifest.length>600||!Array.isArray(v.records)||v.records.length>600||!Array.isArray(v.reference_records)||v.reference_records.length>1200)return fail('monitor_freeze_integrity_error',503)
 const pins=manifest.map(p=>{const pin=object(p);if(Object.keys(pin).length!==2)return fail('monitor_freeze_integrity_error',503);return{record_id:ownId(pin.record_id),version:count(pin.version,1)}})
 if(monitorHash(pins)!==v.manifest_hash||new Set(pins.map(p=>p.record_id)).size!==pins.length||pins.some((p,i)=>i>0&&pins[i-1]!.record_id>=p.record_id))return fail('monitor_freeze_integrity_error',503)
 const cursor=count(v.next_index)
 if(cursor>pins.length||v.records.length!==cursor)return fail('monitor_freeze_integrity_error',503)
 for(let i=0;i<cursor;i++){const r=object(v.records[i]);if(r.record_id!==pins[i]!.record_id||count(r.version,1)!==pins[i]!.version)return fail('monitor_freeze_integrity_error',503)}
 const refKeys=v.reference_records.map(r=>{const value=object(r);return key({record_id:ownId(value.record_id),version:count(value.version,1)})})
 if(new Set(refKeys).size!==refKeys.length||refKeys.some(k=>pins.some(p=>key(p)===k)))return fail('monitor_freeze_integrity_error',503)
 return{id:ownId(v.id),owner_user_id:owner,case_id:ownId(v.case_id),check_id:lease.check_id,run_id:ownId(v.run_id),manifest:pins,manifest_hash:String(v.manifest_hash),next_index:cursor,records:v.records as MonitorBusinessRecord[],reference_records:v.reference_records as MonitorBusinessRecord[],created_ms:count(v.created_ms,1)}
}
async function asFreezeWorker<T>(db:SqlClient,work:()=>Promise<T>):Promise<T>{
 await db.query('SET LOCAL ROLE agentstudio_monitor_worker')
 try{return await work()}finally{await db.query('SET LOCAL ROLE agentstudio_api')}
}
export class NativeMonitorLiveFreezer{
 private readonly data:NativeMonitorBusinessData
 private readonly currentDefinition:(db:SqlClient,owner:string,monitor:CurrentMonitor)=>Promise<void>
 constructor(data:NativeMonitorBusinessData,currentDefinition:(db:SqlClient,owner:string,monitor:CurrentMonitor)=>Promise<void>){
  if(!data||typeof currentDefinition!=='function')throw Error('monitor_freeze_current_definition_required')
  this.data=data;this.currentDefinition=currentDefinition
 }
 async step(db:SqlClient,owner:string,rawLease:MonitorFreezeLease):Promise<{status:'freezing';check_id:string;next_index:number;total:number}|{status:'analyzing';check_id:string;fact_set_id:string}>{
  ownId(owner);const lease=leaseValue(rawLease);await assertOwnedAdmissionContext(db,owner)
  const contexts=(await db.query<{case_id:string;run_id:string;definition_hash:string;definition:LiveMonitorDefinition}>('SELECT c.case_id,c.run_id,m.definition_hash,m.definition FROM agentstudio.monitor_live_checks c JOIN agentstudio.monitor_live_monitors m ON m.id=c.monitor_id AND m.owner_user_id=c.owner_user_id AND m.case_id=c.case_id WHERE c.id=$1::uuid AND c.owner_user_id=$2::uuid AND m.current_check_id=c.id AND m.enabled AND m.revision=c.monitor_revision AND m.definition_hash=c.definition_hash',[lease.check_id,owner])).rows
  if(contexts.length!==1)return fail()
  const context=contexts[0]!;ownId(context.case_id);ownId(context.run_id)
  if(monitorHash(context.definition)!==context.definition_hash)return fail('monitor_freeze_integrity_error',503)
  await this.data.caseGet(db,owner,context.case_id)
  await this.currentDefinition(db,owner,context)
  const result=await asFreezeWorker(db,()=>db.query<{value:unknown}>('SELECT agentstudio.monitor_live_freeze_begin($1::uuid,$2::uuid,$3::bigint) AS value',[lease.check_id,lease.lease_token,lease.lease_version]))
  if(result.rows.length!==1)return fail()
  const job=jobValue(result.rows[0]?.value,owner,lease)
  if(job.case_id!==context.case_id||job.run_id!==context.run_id)return fail('monitor_freeze_integrity_error',503)
  if(job.next_index<job.manifest.length){
   const records:MonitorBusinessRecord[]=[],references:MonitorBusinessRecord[]=[],base=new Set(job.manifest.map(key)),visited=new Set(job.reference_records.map(key))
   const visit=async(pin:MonitorRecordPin):Promise<void>=>{
    const k=key(pin);if(base.has(k)||visited.has(k))return
    if(visited.size>=1200)throw new HttpError(413,'monitor_snapshot_dependency_limit')
    visited.add(k)
    const record=await this.data.get(db,owner,job.case_id,pin.record_id,pin.version)
    references.push(record)
    for(const next of record.relation_versions)await visit(next)
   }
   for(const pin of job.manifest.slice(job.next_index,job.next_index+20)){
    const record=await this.data.get(db,owner,job.case_id,pin.record_id,pin.version)
    records.push(record);for(const dependency of record.relation_versions)await visit(dependency)
   }
   const appended=await asFreezeWorker(db,()=>db.query<{value:unknown}>('SELECT agentstudio.monitor_live_freeze_append($1::uuid,$2::uuid,$3::bigint,$4::bigint,$5::jsonb,$6::jsonb) AS value',[lease.check_id,lease.lease_token,lease.lease_version,job.next_index,JSON.stringify(records),JSON.stringify(references)]))
   if(appended.rows.length!==1)return fail()
   const next=jobValue(appended.rows[0]?.value,owner,lease)
   if(next.id!==job.id||next.manifest_hash!==job.manifest_hash||next.case_id!==job.case_id||next.run_id!==job.run_id||next.created_ms!==job.created_ms||next.next_index!==job.next_index+records.length||monitorCanonical(next.records)!==monitorCanonical([...job.records,...records]))return fail('monitor_freeze_integrity_error',503)
   return{status:'freezing',check_id:lease.check_id,next_index:next.next_index,total:job.manifest.length}
  }
  // Revalidate every source, current knowledge grant and immutable record after
  // the final cursor is durable; a pre-revocation read from an older step is
  // never treated as current permission at snapshot commit time.
  for(const saved of [...job.records,...job.reference_records]){
   const current=await this.data.get(db,owner,job.case_id,saved.record_id,saved.version)
   if(monitorCanonical(current)!==monitorCanonical(saved))return fail('monitor_freeze_integrity_error',503)
  }
  await this.currentDefinition(db,owner,context)
  const payload={records:job.records,reference_records:job.reference_records,created_ms:job.created_ms},canonical=monitorCanonical(payload)
  if(Buffer.byteLength(canonical)>16777216)throw new HttpError(413,'monitor_snapshot_size_limit')
  const finished=await asFreezeWorker(db,()=>db.query<{value:string}>('SELECT agentstudio.monitor_live_freeze_finish($1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text) AS value',[lease.check_id,lease.lease_token,lease.lease_version,JSON.stringify(payload),canonical]))
  if(finished.rows.length!==1)return fail()
  return{status:'analyzing',check_id:lease.check_id,fact_set_id:ownId(finished.rows[0]?.value)}
 }
}
