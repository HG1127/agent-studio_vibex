import {createHash} from 'node:crypto'
import {originalAgentQualityProtocol,qualityFail,qualityHash,qualityId,qualityChecksCanonical,qualityWriteCanonical,qualityPendingFor,parseOriginalQualityWrite,parseOriginalQualityRevision,parseOriginalQualityReceipt,parseOriginalQualityPending,type OriginalQualityRevision,type OriginalQualityWrite,type OriginalQualityReceipt} from '../../../shared/original-agent-quality-contract.ts'
export type QualityIdentity={issuer:string;subject:string}
/** Implement this only inside existing withActor: verified issuer/sub mapping,
 * expected-employee precondition, RLS and ONE transaction. This is not a DB
 * implementation or an audited runtime permit. The optional SQL stage is pending. */
export type OriginalQualityAtomicTransaction={
 employeeId:string
 readCurrent:(spec:string,lock:'share'|'update')=>Promise<unknown>
 readReceipt:(spec:string,request:string)=>Promise<unknown|null>
 writeRevisionReceiptAudit:(input:{employeeId:string;specId:string;write:OriginalQualityWrite;request_sha256:string;checks_sha256:string})=>Promise<unknown>
}
export type OriginalQualityAtomicStore={withEmployee:<T>(identity:QualityIdentity,expectedEmployee:string,work:(tx:OriginalQualityAtomicTransaction)=>Promise<T>)=>Promise<T>}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex')
export function createOriginalAgentQualityService(store:OriginalQualityAtomicStore){
 if(!store||typeof store.withEmployee!=='function')throw Error('original_quality_atomic_store_required')
 const identity=(v:QualityIdentity)=>{if(v?.issuer!=='urn:agentstudio:local:v1'||typeof v.subject!=='string'||!v.subject)return qualityFail(403,'native_employee_identity_required')}
 const current=async(tx:OriginalQualityAtomicTransaction,spec:string,lock:'share'|'update')=>{
  const row=parseOriginalQualityRevision(await tx.readCurrent(spec,lock),tx.employeeId,spec)
  if(row.state==='configured'&&sha(qualityChecksCanonical(row.checks))!==row.checks_sha256)return qualityFail(503,'original_quality_stored_hash_changed')
  return row
 }
 const receipt=(raw:unknown,pending:ReturnType<typeof qualityPendingFor>,write?:OriginalQualityWrite):OriginalQualityReceipt=>{
  const parsed=parseOriginalQualityReceipt(raw,pending)
  if(sha(qualityChecksCanonical(parsed.after.checks))!==parsed.after.checks_sha256||write&&qualityChecksCanonical(write.checks)!==qualityChecksCanonical(parsed.after.checks))return qualityFail(503,'original_quality_receipt_changed')
  return parsed
 }
 const transaction=<T>(who:QualityIdentity,employee:string,spec:string,work:(tx:OriginalQualityAtomicTransaction)=>Promise<T>)=>{
  identity(who);qualityId(employee);qualityId(spec)
  return store.withEmployee(who,employee,async tx=>{if(qualityId(tx.employeeId)!==employee)return qualityFail(409,'original_quality_employee_changed');return work(tx)})
 }
 return{
  protocol:originalAgentQualityProtocol,
  read(who:QualityIdentity,employee:string,spec:string):Promise<OriginalQualityRevision>{return transaction(who,employee,spec,tx=>current(tx,spec,'share'))},
  save(who:QualityIdentity,employee:string,spec:string,raw:unknown):Promise<OriginalQualityReceipt>{
   const write=parseOriginalQualityWrite(raw),requestHash=sha(qualityWriteCanonical(employee,spec,write)),pending=qualityPendingFor(employee,spec,write,requestHash)
   return transaction(who,employee,spec,async tx=>{
    const prior=await tx.readReceipt(spec,write.request_id)
    if(prior!==null){try{return receipt(prior,pending,write)}catch{return qualityFail(409,'original_quality_request_conflict')}}
    const before=await current(tx,spec,'update')
    if(before.spec_revision!==write.expected_spec_revision||before.source_sha256!==write.expected_source_sha256||before.checks_sha256!==write.expected_checks_sha256)return qualityFail(409,'original_quality_revision_conflict')
    return receipt(await tx.writeRevisionReceiptAudit({employeeId:tx.employeeId,specId:spec,write,request_sha256:requestHash,checks_sha256:sha(qualityChecksCanonical(write.checks))}),pending,write)
   })
  },
  queryReceipt(who:QualityIdentity,employee:string,spec:string,rawPending:unknown):Promise<OriginalQualityReceipt>{
   // GET receipt inputs are metadata only; never reconstruct or replay a save.
   return transaction(who,employee,spec,async tx=>{
    // Parsing through the shared module is required before the exact owner lookup.
    const pending=parseOriginalQualityPending(rawPending,employee,spec),value=await tx.readReceipt(spec,pending.request_id)
    if(value===null)return qualityFail(404,'original_quality_receipt_not_found',true)
    return receipt(value,pending)
   })
  },
 }
}
