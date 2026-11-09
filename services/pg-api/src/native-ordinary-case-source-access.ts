import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {monitorHash} from './native-monitor-source-contract.ts'
import {assertMonitorRunSources,readMonitorStoredReceipt,parseMonitorSourceScope,type MonitorStoredReceipt} from './native-monitor-source-access.ts'
import {optionalOrdinaryCaseAgentBinding} from './native-ordinary-case-binding.ts'
const unavailable=():never=>{throw new HttpError(403,'ordinary_case_source_unavailable')}
type Walk={done:Set<string>;active:Set<string>}
export function ordinaryCaseEvidenceUsable(payload:Record<string,unknown>):boolean{
 const c=payload.coverage as Record<string,unknown>|null,h=payload.http_response as Record<string,unknown>|null
 return !!c&&c.stored_complete===true&&payload.redacted===false&&payload.usable_as_evidence===true&&!!h&&h.complete===true&&Number.isInteger(h.status)&&Number(h.status)>=200&&Number(h.status)<300&&h.empty===false&&typeof payload.text==='string'&&payload.text.trim().length>0
}
/** Rechecks Root knowledge/team/document observations plus every case dependency. */
export async function assertOrdinaryCaseRunSources(db:SqlClient,owner:string,runId:string,walk:Walk={done:new Set(),active:new Set()}):Promise<void>{
 ownId(owner);ownId(runId);await assertOwnedAdmissionContext(db,owner)
 if(walk.done.has(runId)||walk.active.has(runId))return
 if(walk.active.size>=8||walk.done.size+walk.active.size>=100)return unavailable()
 walk.active.add(runId)
 try{
  await assertMonitorRunSources(db,owner,runId)
  await optionalOrdinaryCaseAgentBinding(db,owner,runId,true)
  const receipts=(await db.query<{id:string}>("SELECT id FROM agentstudio.ordinary_case_receipts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid ORDER BY id LIMIT 101",[owner,runId])).rows
  if(receipts.length>100)return unavailable()
  for(const receipt of receipts){const current=(await db.query<{value:boolean}>('SELECT agentstudio.ordinary_case_receipt_current($1::uuid) AS value',[ownId(receipt.id)])).rows;if(current.length!==1||current[0]?.value!==true)return unavailable()}
  const scopes=(await db.query<{source_scope:unknown;ordinary:boolean}>("SELECT source_scope,true AS ordinary FROM agentstudio.ordinary_case_receipts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid UNION ALL SELECT source_scope,false AS ordinary FROM agentstudio.monitor_live_receipts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid LIMIT 101",[owner,runId])).rows
  const edges=(await db.query<{source_run_id:string}>("SELECT DISTINCT source_run_id FROM agentstudio.ordinary_case_dependencies WHERE owner_user_id=$1::uuid AND run_id=$2::uuid LIMIT 101",[owner,runId])).rows
  if(scopes.length>100||edges.length>100)return unavailable()
  for(const row of scopes){const scope=parseMonitorSourceScope(row.source_scope);if(typeof row.ordinary!=="boolean"||row.ordinary&&(scope.knowledge_base_ids.length>0||scope.documents.length>0||scope.semantic_used))return unavailable();for(const id of scope.dependency_runs)await assertOrdinaryCaseRunSources(db,owner,id,walk)}
  for(const edge of edges)await assertOrdinaryCaseRunSources(db,owner,ownId(edge.source_run_id),walk)
  walk.done.add(runId)
 }finally{walk.active.delete(runId)}
}
export async function readOrdinaryCaseReceipt(db:SqlClient,owner:string,caseId:string,runId:string,resultId:string):Promise<MonitorStoredReceipt>{
 ownId(owner);ownId(caseId);ownId(runId);ownId(resultId);await assertOwnedAdmissionContext(db,owner)
 await assertOrdinaryCaseRunSources(db,owner,runId)
 const rows=(await db.query<{id:string;owner_user_id:string;case_id:string;run_id:string;step_key:string;payload:Record<string,unknown>;source_scope:unknown;content_hash:string;created_ms:string;input_sha256:string}>("SELECT r.id,r.owner_user_id,r.case_id,r.run_id,r.step_key,r.payload,r.source_scope,r.content_hash,r.created_ms::text AS created_ms,s.input_sha256 FROM agentstudio.ordinary_case_receipts r JOIN agentstudio.ordinary_case_source_slots s ON s.id=r.slot_id AND s.owner_user_id=r.owner_user_id AND s.run_id=r.run_id AND s.case_id=r.case_id WHERE r.id=$1::uuid AND r.owner_user_id=$2::uuid AND r.run_id=$3::uuid",[resultId,owner,runId])).rows
 if(rows.length===0){const receipt=await readMonitorStoredReceipt(db,owner,caseId,runId,resultId);if(receipt.case_id!==caseId)return unavailable();return receipt}
 const row=rows[0]!
 if(rows.length!==1||row.id!==resultId||row.owner_user_id!==owner||row.case_id!==caseId||row.run_id!==runId||!/^[A-Za-z0-9_:-]{1,160}$/.test(row.step_key)||!/^[a-f0-9]{64}$/.test(row.input_sha256)||!row.payload||monitorHash(row.payload)!==row.content_hash)return unavailable()
 const check=(await db.query<{value:boolean}>('SELECT agentstudio.ordinary_case_receipt_current($1::uuid) AS value',[resultId])).rows
 if(check.length!==1||check[0]?.value!==true)return unavailable()
 return {...row,monitor_check_id:null,source_id:null,request_hash:row.input_sha256,source_scope:parseMonitorSourceScope(row.source_scope),created_ms:ownDatabaseCount(row.created_ms)}
}
export async function readOrdinaryCaseEvidence(...args:Parameters<typeof readOrdinaryCaseReceipt>){const receipt=await readOrdinaryCaseReceipt(...args);if(!ordinaryCaseEvidenceUsable(receipt.payload))throw new HttpError(422,'ordinary_case_complete_usable_evidence_required');return receipt}
export const ordinaryCaseEvidenceAccess=Object.freeze({readReceipt:readOrdinaryCaseEvidence,assertRunSources:assertOrdinaryCaseRunSources})
