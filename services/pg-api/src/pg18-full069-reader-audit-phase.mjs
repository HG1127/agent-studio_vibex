// Pure phase/evidence review only. This module cannot connect a Reader, run an
// audit, create an observed Native result or authorize qualification.
import {liveLimits,closed,hex,uuid,freeze,liveFail} from './pg18-full069-worker-live-contract.mjs'
const pathFacts=Object.freeze({principal:'studio_telemetry_reader',catalog_audit:'verifyWorkerHeartbeatActivatedCatalog',transaction:'REPEATABLE READ READ ONLY',reader_lease_ms:liveLimits.readerMs,native_budget_ms:liveLimits.nativeMs})
export const full069ReaderCatalogAuditRequirement=Object.freeze({phase:'required_at_original_native_read',...pathFacts,catalog_verified:false,qualifies_run:false})
const refuse=()=>liveFail('reader_catalog_native_phase')
const oid=v=>Number.isSafeInteger(v)&&v>0&&v<=4294967295
export function reviewFull069NativeReaderCatalogAudit(before,after,expected,asOf){
 const e=closed(expected,['instance_id','epoch','role_oid','database_oid'])
 if(!uuid(e.instance_id)||typeof e.epoch!=='string'||!/^(?:0|[1-9][0-9]{0,19})$/.test(e.epoch)||BigInt(e.epoch)>18446744073709551615n||!oid(e.role_oid)||!oid(e.database_oid)||typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString()!==asOf)refuse()
 // Both inputs come from the original root-owned hash-chain reader in Native.
 // Comparison of supplied data here is deliberately not a live capability.
 if(!before||!after||!Array.isArray(before.records)||!Array.isArray(after.records)||!hex(before.head)||!hex(after.head)||after.records.length<=before.records.length||before.records.length&&before.records.at(-1)?.record_sha256!==before.head||before.records.length===0&&before.head!=='0'.repeat(64)||after.records.at(-1)?.record_sha256!==after.head||before.records.some((r,i)=>r.record_sha256!==after.records[i]?.record_sha256))refuse()
 const delta=after.records.slice(before.records.length),bounds=delta.filter(r=>r.phase==='reader_bound')
 if(bounds.length!==1)refuse()
 const r=bounds[0],data=closed(r.data,['lease_id','backend','role_oid','database_oid']),backend=closed(data.backend,['pid','started'])
 if(r.instance_id!==e.instance_id||r.epoch!==e.epoch||!hex(r.record_sha256)||!hex(data.lease_id)||data.role_oid!==e.role_oid||data.database_oid!==e.database_oid||!Number.isSafeInteger(backend.pid)||backend.pid<1||typeof backend.started!=='string'||backend.started.length<1||backend.started.length>100||delta.some(v=>v.phase==='reader_ended'&&v.data?.lease_id===data.lease_id))refuse()
 // Successful HTTPS publication is possible only after the original Controller
 // awaited the real Reader audit and finish/consume checks. Bind that successful
 // request to its actual new reader_bound record; do not infer backend absence.
 return freeze({phase:'verified_via_original_native_read',...pathFacts,as_of:asOf,instance_id:e.instance_id,epoch:e.epoch,role_oid:e.role_oid,database_oid:e.database_oid,lease_id:data.lease_id,backend:{...backend},reader_bound_record_sha256:r.record_sha256,journal_before_sha256:before.head,journal_after_sha256:after.head,journal_before_records:before.records.length,journal_after_records:after.records.length,data_only:true,qualifies_run:false})
}
