// Live receipt ACL, separate from the quarantined073 metadata rows. These reads
// are not mounted until the complete live-table/RPC schema is audited. No cached
// source_readable flag, source title or caller owner may replace current checks.
import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {readMonitorCaseLocked} from './native-monitor-row-lock.ts'
import {requireKnowledgeScope} from './knowledge-runtime-scope.ts'
import {currentKnowledgeObservations} from './knowledge-observation-policy.ts'
import {monitorHash} from './native-monitor-source-contract.ts'
type Scope={knowledge_base_ids:string[];documents:{base_id:string;document_id:string}[];semantic_used:boolean;dependency_runs:string[]}
export type MonitorStoredReceipt={id:string;owner_user_id:string;case_id:string;run_id:string;step_key:string;monitor_check_id:string|null;source_id:string|null;request_hash:string;payload:Record<string,unknown>;source_scope:Scope;content_hash:string;created_ms:number}
const unavailable=():never=>{throw new HttpError(403,'monitor_source_unavailable')}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).length!==keys.length)return unavailable();for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))return unavailable()}return v as Record<string,unknown>}
function list(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max||Reflect.ownKeys(v).length!==v.length+1)return unavailable();for(let i=0;i<v.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'))return unavailable();return v}
export function parseMonitorSourceScope(raw:unknown):Scope{
 const v=object(raw,['knowledge_base_ids','documents','semantic_used','dependency_runs'])
 const bases=list(v.knowledge_base_ids,100).map(id=>ownId(id)),runs=list(v.dependency_runs,100).map(id=>ownId(id)),documents=list(v.documents,400).map(raw=>{const d=object(raw,['base_id','document_id']);return{base_id:ownId(d.base_id),document_id:ownId(d.document_id)}})
 if(typeof v.semantic_used!=='boolean'||v.semantic_used&&bases.length===0||new Set(bases).size!==bases.length||new Set(runs).size!==runs.length||new Set(documents.map(d=>d.base_id+':'+d.document_id)).size!==documents.length||documents.some(d=>!bases.includes(d.base_id)))return unavailable()
 return{knowledge_base_ids:bases,documents,semantic_used:v.semantic_used,dependency_runs:runs}
}
type Walk={done:Set<string>;active:Set<string>}
/** Requires the already verified current employee Actor transaction. Every
 * dependency is checked on this same DB snapshot; receipts are never authority. */
export async function assertMonitorRunSources(db:SqlClient,owner:string,runId:string,walk:Walk={done:new Set(),active:new Set()}):Promise<void>{
 ownId(owner);ownId(runId)
 // A same-run result_read may legitimately point back to its already checked
 // run. Match the original visited-graph rule; every distinct node still has
 // all current scopes checked, with explicit whole-graph/depth bounds.
 if(walk.done.has(runId)||walk.active.has(runId))return
 if(walk.active.size>=8||walk.done.size+walk.active.size>=100)return unavailable()
 walk.active.add(runId)
 try{
  const installed=(await db.query<{ready:boolean}>("SELECT to_regprocedure('agentstudio.knowledge_query_execution_validate_run(uuid,text)') IS NOT NULL AS ready")).rows
  if(installed.length!==1||installed[0]?.ready!==true)throw new HttpError(503,'monitor_source_acl_runtime_required')
  const rows=(await db.query<{id:string;owner_user_id:string}>("SELECT id,owner_user_id FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE",[runId,owner])).rows
  if(rows.length!==1||rows[0]?.id!==runId||rows[0]?.owner_user_id!==owner||await currentKnowledgeObservations(db,runId)!==true)return unavailable()
  const scopes=(await db.query<{source_scope:unknown}>("SELECT source_scope FROM agentstudio.monitor_live_receipts WHERE owner_user_id=$1::uuid AND run_id=$2::uuid ORDER BY id LIMIT 101",[owner,runId])).rows
  if(!Array.isArray(scopes)||scopes.length>100)return unavailable()
  for(const row of scopes)await assertMonitorScope(db,owner,parseMonitorSourceScope(row.source_scope),walk)
  walk.done.add(runId)
 }finally{walk.active.delete(runId)}
}
async function assertMonitorScope(db:SqlClient,owner:string,scope:Scope,walk:Walk):Promise<void>{
 for(let start=0;start<scope.knowledge_base_ids.length;start+=3)await requireKnowledgeScope(db,owner,scope.knowledge_base_ids.slice(start,start+3))
 if(scope.semantic_used){
  for(let start=0;start<scope.knowledge_base_ids.length;start+=10){const ids=scope.knowledge_base_ids.slice(start,start+10)
   const rows=(await db.query<{value:{fence?:{base_id?:unknown;semantic_allowed?:unknown}[]}}>('SELECT agentstudio.knowledge_query_scope($1::uuid,$2::uuid[],true) AS value',[owner,ids])).rows
   const fence=rows[0]?.value?.fence;if(rows.length!==1||!Array.isArray(fence)||fence.length!==ids.length||new Set(fence.map(f=>f.base_id)).size!==ids.length||fence.some(f=>typeof f.base_id!=='string'||!ids.includes(f.base_id)||f.semantic_allowed!==true))return unavailable()
  }
 }
 for(const pin of scope.documents){
  const matches=(await db.query<{id:string}>('SELECT id FROM agentstudio.knowledge_documents WHERE id=$1::uuid AND base_id=$2::uuid',[pin.document_id,pin.base_id])).rows
  if(matches.length!==1||matches[0]?.id!==pin.document_id)return unavailable()
 }
 for(const source of scope.dependency_runs)await assertMonitorRunSources(db,owner,source,walk)
}
export async function readMonitorStoredReceipt(db:SqlClient,owner:string,caseId:string,runId:string,resultId:string):Promise<MonitorStoredReceipt>{
 ownId(owner);ownId(caseId);ownId(runId);ownId(resultId);await assertOwnedAdmissionContext(db,owner)
 const caseRow=await readMonitorCaseLocked(db,owner,caseId)
 if(caseRow?.id!==caseId)return unavailable()
 await assertMonitorRunSources(db,owner,runId)
 const rows=(await db.query<Record<string,unknown>>('SELECT id,owner_user_id,case_id,run_id,step_key,monitor_check_id,source_id,request_hash,payload,source_scope,content_hash,created_ms::text AS created_ms FROM agentstudio.monitor_live_receipts WHERE id=$1::uuid AND owner_user_id=$2::uuid AND run_id=$3::uuid',[resultId,owner,runId])).rows
 if(rows.length!==1)return unavailable();const r=object(rows[0],['id','owner_user_id','case_id','run_id','step_key','monitor_check_id','source_id','request_hash','payload','source_scope','content_hash','created_ms'])
 if(r.id!==resultId||r.owner_user_id!==owner||r.run_id!==runId||typeof r.step_key!=='string'||!/^[A-Za-z0-9_:-]{1,160}$/.test(r.step_key)||!r.payload||typeof r.payload!=='object'||Array.isArray(r.payload)||typeof r.content_hash!=='string'||!/^[a-f0-9]{64}$/.test(r.content_hash)||monitorHash(r.payload)!==r.content_hash)return unavailable()
 const sourceCase=ownId(r.case_id)
 const monitorCheck=r.monitor_check_id===null?null:ownId(r.monitor_check_id)
 if(typeof r.request_hash!=='string'||!/^[a-f0-9]{64}$/.test(r.request_hash)||r.source_id!==null&&(typeof r.source_id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(r.source_id))||Boolean(monitorCheck)!==Boolean(r.source_id))return unavailable()
 if(sourceCase!==caseId){const current=await readMonitorCaseLocked(db,owner,sourceCase);if(current?.id!==sourceCase)return unavailable()}
 const source_scope=parseMonitorSourceScope(r.source_scope)
 const created=ownDatabaseCount(r.created_ms);if(created<1)return unavailable()
 return{id:resultId,owner_user_id:owner,case_id:sourceCase,run_id:runId,step_key:r.step_key,monitor_check_id:monitorCheck,source_id:r.source_id as string|null,request_hash:r.request_hash,payload:r.payload as Record<string,unknown>,source_scope,content_hash:r.content_hash,created_ms:created}
}
export function readMonitorReceiptFragment(receipt:MonitorStoredReceipt,raw:unknown){
 const q=object(raw,['field','offset','limit'])
 if(typeof q.field!=='string'||!['text','structuredContent','content','resources'].includes(q.field)||!Number.isSafeInteger(q.offset)||Number(q.offset)<0||!Number.isSafeInteger(q.limit)||Number(q.limit)<1||Number(q.limit)>8000)throw new HttpError(400,'invalid_monitor_result_range')
 const envelope=receipt.payload,value=envelope[q.field],text=q.field==='text'?value:JSON.stringify(value===undefined?null:value)
 if(typeof text!=='string'||Number(q.offset)>text.length)throw new HttpError(400,'invalid_monitor_result_range')
 const offset=Number(q.offset),end=Math.min(offset+Number(q.limit),text.length)
 return{result_id:receipt.id,run_id:receipt.run_id,content_hash:receipt.content_hash,field:q.field,encoding:q.field==='text'?'text':'json_fragment',offset,end,total_length:text.length,has_more:end<text.length,text:text.slice(offset,end),coverage:envelope.coverage,redacted:envelope.redacted}
}
