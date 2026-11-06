// Async PG port of the original owned/versioned business-record contract.
// Live DDL, runtime admission and source capture must be installed/audited before
// mounting this layer. This file is not a migration runner or an HTTP bypass.
import {randomUUID} from 'node:crypto'
import {requireMonitorEmployeeAuthority} from './native-monitor-employee-authority.ts'
import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {readMonitorCaseLocked} from './native-monitor-row-lock.ts'
import {validateBusinessSchema,businessSchemaNames} from '../../../shared/business-schemas.mjs'
import {monitorHash,monitorCanonical} from './native-monitor-source-contract.ts'
import {assertMonitorRunSources,readMonitorStoredReceipt} from './native-monitor-source-access.ts'
export type MonitorBusinessCase={case_id:string;title:string;data_space:'LIVE'|'DEMO';questions:{question_id:string;question:string}[];created_ms:number}
export type MonitorResultRef={run_id:string;result_id:string;start:number;end:number;quote:string}
export type MonitorRecordPin={record_id:string;version:number}
export type MonitorBusinessRecord={record_id:string;version:number;schema_id:string;payload:Record<string,unknown>;source_refs:MonitorResultRef[];relation_versions:MonitorRecordPin[];run_id:string;created_ms:number}
export type MonitorRecordWrite={record_id?:string;expected_version:number;schema_id:string;payload:Record<string,unknown>;source_refs:MonitorResultRef[];idempotency_key:string}
export type MonitorPreparedRecord={record_id:string;expected_version:number;schema_id:string;payload:Record<string,unknown>;source_refs:MonitorResultRef[];relation_versions:MonitorRecordPin[];run_id:string|null;idempotency_key:string;request_hash:string;request_canonical:string}
export type MonitorRecordPersister=(db:SqlClient,owner:string,caseId:string,runId:string,prepared:MonitorPreparedRecord)=>Promise<{record_id:string;version:number}>
const invalid=(code='invalid_business_payload'):never=>{throw new HttpError(400,code)},notFound=():never=>{throw new HttpError(404,'business_record_not_found')}
const text=(v:unknown,max:number):string=>{if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0')||Array.from(v).some(c=>c.length===1&&/[\ud800-\udfff]/u.test(c)))return invalid('invalid_business_string');return v}
const object=(v:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>=>{
 if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return invalid();const d=Object.getOwnPropertyDescriptors(v)
 if(required.some(k=>!Object.hasOwn(d,k))||Reflect.ownKeys(v).some(k=>typeof k!=='string'||![...required,...optional].includes(k)||!d[k]?.enumerable||!Object.hasOwn(d[k],'value')))return invalid();return v as Record<string,unknown>
}
const list=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v)||v.length>max||Reflect.ownKeys(v).length!==v.length+1)return invalid();for(let i=0;i<v.length;i++)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))??{},'value'))return invalid();return v}
const integer=(v:unknown,min=0):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||Object.is(v,-0))return invalid();return v}
function pins(v:unknown):MonitorRecordPin[]{return list(v,50).map(value=>{const p=object(value,['record_id','version']);return{record_id:ownId(p.record_id),version:integer(p.version,1)}})}
function refs(v:unknown):MonitorResultRef[]{return list(v,50).map(value=>{
 // Material evidence requires its real PG material ACL/parser, not an invented
 // readable flag. Monitor HTTP/Web sources use immutable run result receipts.
 if(value&&typeof value==='object'&&Object.hasOwn(value,'material_id'))throw new HttpError(503,'monitor_material_source_adapter_required')
 const ref=object(value,['run_id','result_id','start','end','quote']),start=integer(ref.start),end=integer(ref.end,1),quote=text(ref.quote,8000)
 if(end<=start||end-start>8000||quote.length!==end-start)return invalid('invalid_evidence_locator')
 return{run_id:ownId(ref.run_id),result_id:ownId(ref.result_id),start,end,quote}
})}
export function parseMonitorRecordWrite(raw:unknown):MonitorRecordWrite{
 const v=object(raw,['expected_version','schema_id','payload','source_refs','idempotency_key'],['record_id']),version=integer(v.expected_version),schema=text(v.schema_id,80)
 if(version>Number.MAX_SAFE_INTEGER-1||version>0&&!v.record_id||!businessSchemaNames.includes(schema))return invalid('invalid_expected_version')
 const payload=v.payload;if(!payload||typeof payload!=='object'||Array.isArray(payload))return invalid()
 monitorCanonical(payload);validateBusinessSchema(schema,payload)
 const result={...(v.record_id===undefined?{}:{record_id:ownId(v.record_id)}),expected_version:version,schema_id:schema,payload:payload as Record<string,unknown>,source_refs:refs(v.source_refs),idempotency_key:text(v.idempotency_key,120)}
 if(monitorCanonical(result).length>100000)throw new HttpError(413,'business_record_size_limit');return result
}
export type MonitorEvidenceAccess={readReceipt:typeof readMonitorStoredReceipt;assertRunSources:typeof assertMonitorRunSources}
export class NativeMonitorBusinessData{
 private readonly evidence:MonitorEvidenceAccess
 private readonly runWriteGate:(db:SqlClient,owner:string,caseId:string,runId:string,input:MonitorRecordWrite)=>Promise<void>
 private readonly runPersist:MonitorRecordPersister|undefined
 constructor(runWriteGate:(db:SqlClient,owner:string,caseId:string,runId:string,input:MonitorRecordWrite)=>Promise<void>,runPersist?:MonitorRecordPersister,evidence:MonitorEvidenceAccess={readReceipt:readMonitorStoredReceipt,assertRunSources:assertMonitorRunSources}){this.evidence=evidence;if(typeof runWriteGate!=='function')throw Error('monitor_run_write_gate_required');this.runWriteGate=runWriteGate;this.runPersist=runPersist}
 async caseGet(db:SqlClient,owner:string,id:string,lock=false):Promise<MonitorBusinessCase>{
  ownId(owner);ownId(id);await assertOwnedAdmissionContext(db,owner)
  const row=await readMonitorCaseLocked(db,owner,id,lock),rows=row===null?[]:[row]
  if(rows.length!==1)throw new HttpError(404,'business_case_not_found');const c=object(rows[0],['id','title','data_space','questions','created_ms'])
  if(c.id!==id||!['LIVE','DEMO'].includes(c.data_space as string))return invalid()
  const questions=list(c.questions,20).map(raw=>{const q=object(raw,['question_id','question']);return{question_id:ownId(q.question_id),question:text(q.question,1000)}})
  if(!questions.length||new Set(questions.map(q=>q.question_id)).size!==questions.length)return invalid()
  return{case_id:id,title:text(c.title,300),data_space:c.data_space as 'LIVE'|'DEMO',questions,created_ms:ownDatabaseCount(c.created_ms)}
 }
 async caseCreate(db:SqlClient,owner:string,raw:unknown):Promise<MonitorBusinessCase>{
  ownId(owner);await requireMonitorEmployeeAuthority(db,owner);const v=object(raw,['title','data_space','questions']),title=text(v.title,300),questions=list(v.questions,20).map(q=>({question_id:randomUUID(),question:text(q,1000)}))
  if(!questions.length||v.data_space!=='LIVE'&&v.data_space!=='DEMO')return invalid('invalid_case_questions');const id=randomUUID()
  const saved=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_case_create($1::jsonb) AS value',[JSON.stringify({case_id:id,title,data_space:v.data_space,questions})])).rows
  if(saved.length!==1||saved[0]?.value!==id)throw new HttpError(503,'monitor_case_not_confirmed')
  return this.caseGet(db,owner,id)
 }
 private async checkRefs(db:SqlClient,owner:string,caseInfo:MonitorBusinessCase,references:MonitorResultRef[]){
  for(const ref of references){const receipt=await this.evidence.readReceipt(db,owner,caseInfo.case_id,ref.run_id,ref.result_id),value=receipt.payload.text
   if(typeof value!=='string'||ref.end>value.length||value.slice(ref.start,ref.end)!==ref.quote)throw new HttpError(422,'evidence_anchor_mismatch')
   if(caseInfo.data_space==='LIVE'&&receipt.payload.data_space!=='LIVE')throw new HttpError(422,'source_data_space_mismatch')
  }
 }
 async get(db:SqlClient,owner:string,caseId:string,id:string,version?:number,visited=new Set<string>()):Promise<MonitorBusinessRecord>{
  const caseInfo=await this.caseGet(db,owner,caseId);ownId(id);if(version!==undefined)integer(version,1)
  const rows=(await db.query<Record<string,unknown>>('SELECT record_id,version::text AS version,schema_id,payload,source_refs,relation_versions,run_id,created_ms::text AS created_ms FROM agentstudio.monitor_live_records WHERE owner_user_id=$1::uuid AND case_id=$2::uuid AND record_id=$3::uuid'+(version===undefined?'':' AND version=$4::bigint')+' ORDER BY version DESC LIMIT 1',version===undefined?[owner,caseId,id]:[owner,caseId,id,version])).rows
  if(rows.length!==1)return notFound();const r=object(rows[0],['record_id','version','schema_id','payload','source_refs','relation_versions','run_id','created_ms']),schema=text(r.schema_id,80)
  if(r.record_id!==id||!businessSchemaNames.includes(schema)||!r.payload||typeof r.payload!=='object'||Array.isArray(r.payload))return notFound()
  validateBusinessSchema(schema,r.payload);const n=ownDatabaseCount(r.version);if(n<1||version!==undefined&&n!==version)return notFound()
  const record:MonitorBusinessRecord={record_id:id,version:n,schema_id:schema,payload:r.payload as Record<string,unknown>,source_refs:refs(r.source_refs),relation_versions:pins(r.relation_versions),run_id:r.run_id===null?'':ownId(r.run_id),created_ms:ownDatabaseCount(r.created_ms)}
  await this.checkRefs(db,owner,caseInfo,record.source_refs);if(record.run_id)await this.evidence.assertRunSources(db,owner,record.run_id)
  const key=id+':'+n;if(!visited.has(key)){if(visited.size>=1800)throw new HttpError(413,'business_dependency_limit');visited.add(key);for(const pin of record.relation_versions)await this.get(db,owner,caseId,pin.record_id,pin.version,visited)}
  return record
 }
 async query(db:SqlClient,owner:string,caseId:string,raw:unknown){
  await this.caseGet(db,owner,caseId);const v=object(raw,['schema_id'],['offset','limit']),schema=text(v.schema_id,80),offset=v.offset===undefined?0:integer(v.offset),limit=v.limit===undefined?30:integer(v.limit,1)
  if(!businessSchemaNames.includes(schema)||limit>50)return invalid('invalid_query_range')
  const rows=(await db.query<{record_id:string;version:string}>('SELECT r.record_id,r.version::text AS version FROM agentstudio.monitor_live_records r WHERE r.owner_user_id=$1::uuid AND r.case_id=$2::uuid AND r.schema_id=$3::text AND r.version=(SELECT max(v.version) FROM agentstudio.monitor_live_records v WHERE v.record_id=r.record_id AND v.owner_user_id=r.owner_user_id AND v.case_id=r.case_id) ORDER BY r.created_ms,r.record_id LIMIT $4::integer OFFSET $5::bigint',[owner,caseId,schema,limit+1,offset])).rows
  if(rows.length>limit+1)return invalid();const items:MonitorBusinessRecord[]=[];for(const r of rows.slice(0,limit))items.push(await this.get(db,owner,caseId,r.record_id,ownDatabaseCount(r.version)))
  return{items,offset,next_offset:offset+items.length,has_more:rows.length>limit}
 }
 async write(db:SqlClient,owner:string,caseId:string,raw:unknown,runId:string|null=null):Promise<MonitorBusinessRecord>{
  const input=parseMonitorRecordWrite(raw),caseInfo=await this.caseGet(db,owner,caseId,true)
  if(runId){ownId(runId);await this.runWriteGate(db,owner,caseId,runId,input)}else await requireMonitorEmployeeAuthority(db,owner)
  await this.checkRefs(db,owner,caseInfo,input.source_refs)
  const links:MonitorRecordPin[]=[],effectiveRefs=[...input.source_refs]
  const addEntity=async(id:unknown)=>{const entity=await this.get(db,owner,caseId,ownId(id));if(entity.schema_id!=='research.entity.v1')throw new HttpError(422,'invalid_relation_entity');links.push({record_id:entity.record_id,version:entity.version});effectiveRefs.push(...entity.source_refs);return entity}
  if(input.schema_id==='research.claim.v1'){
   const entity=await addEntity(input.payload.subject_id)
   if(input.payload.status==='SOURCE_SUPPORTED'&&(!input.source_refs.length||entity.payload.identity_status!=='CONFIRMED'))throw new HttpError(422,'claim_identity_or_evidence_unresolved')
  }else if(input.schema_id==='research.relation.v1'){
   const from=await addEntity(input.payload.from_id),to=await addEntity(input.payload.to_id)
   if(input.payload.status==='SOURCE_SUPPORTED'&&(!input.source_refs.length||from.payload.identity_status!=='CONFIRMED'||to.payload.identity_status!=='CONFIRMED'))throw new HttpError(422,'relation_identity_or_evidence_unresolved')
  }else if(input.schema_id==='research.answer.v1'){
   if(!caseInfo.questions.some(q=>q.question_id===input.payload.question_id))return invalid('unknown_question_id')
   for(const id of list(input.payload.claim_ids,50)){const claim=await this.get(db,owner,caseId,ownId(id));if(claim.schema_id!=='research.claim.v1')return invalid('invalid_claim_reference');links.push({record_id:claim.record_id,version:claim.version});effectiveRefs.push(...claim.source_refs)}
   if(input.payload.status==='ANSWERED'&&!links.length)throw new HttpError(422,'answered_requires_claims')
  }
  const uniqueRefs=[...new Map(effectiveRefs.map(ref=>[monitorCanonical(ref),ref])).values()];if(uniqueRefs.length>50)throw new HttpError(413,'business_source_limit')
  const requestHash=monitorHash(input),prior=(await db.query<{record_id:string;version:string;request_hash:string}>('SELECT record_id,version::text AS version,request_hash FROM agentstudio.monitor_live_records WHERE owner_user_id=$1::uuid AND case_id=$2::uuid AND idempotency_key=$3::text',[owner,caseId,input.idempotency_key])).rows
  if(prior.length){if(prior.length!==1||prior[0]?.request_hash!==requestHash)throw new HttpError(409,'business_idempotency_conflict');return this.get(db,owner,caseId,prior[0].record_id,ownDatabaseCount(prior[0].version))}
  const id=input.record_id??randomUUID(),current=(await db.query<{version:string;schema_id:string}>('SELECT version::text AS version,schema_id FROM agentstudio.monitor_live_records WHERE record_id=$1::uuid AND owner_user_id=$2::uuid AND case_id=$3::uuid ORDER BY version DESC LIMIT 1',[id,owner,caseId])).rows
  if(current.length>1||(current.length?ownDatabaseCount(current[0]?.version):0)!==input.expected_version)throw new HttpError(409,'business_version_conflict')
  if(current.length&&current[0]?.schema_id!==input.schema_id)throw new HttpError(409,'business_schema_change_forbidden')
  const prepared:MonitorPreparedRecord={record_id:id,expected_version:input.expected_version,schema_id:input.schema_id,payload:input.payload,source_refs:uniqueRefs,relation_versions:links,run_id:runId,idempotency_key:input.idempotency_key,request_hash:requestHash,request_canonical:monitorCanonical(input)}
  let saved:{record_id:string;version:number}|undefined
  if(runId){if(!this.runPersist)throw new HttpError(503,'monitor_bound_record_writer_required');saved=await this.runPersist(db,owner,caseId,runId,prepared)}
  else{const rows=(await db.query<{value:{record_id:string;version:number}}>('SELECT agentstudio.monitor_live_record_write($1::uuid,$2::jsonb,NULL::jsonb) AS value',[caseId,JSON.stringify(prepared)])).rows;if(rows.length===1)saved=rows[0]?.value}
  if(!saved||saved.record_id!==id||saved.version!==input.expected_version+1)throw new HttpError(503,'monitor_record_not_confirmed')
  return this.get(db,owner,caseId,id,input.expected_version+1)
 }
 async review(db:SqlClient,owner:string,caseId:string,raw:unknown){
  const v=object(raw,['record_id','record_version','decision','rationale']),id=ownId(v.record_id),version=integer(v.record_version,1),rationale=text(v.rationale,4000)
  if(v.decision!=='accepted'&&v.decision!=='rejected')return invalid('invalid_review_decision')
  const epoch=await requireMonitorEmployeeAuthority(db,owner)
  await this.caseGet(db,owner,caseId,true) // Serialize all version writes/reviews on the same case lock.
  const record=await this.get(db,owner,caseId,id,version)
  if(!['research.claim.v1','research.relation.v1'].includes(record.schema_id))return invalid('claim_review_required')
  if(record.payload.status!=='SOURCE_SUPPORTED'||!record.source_refs.length)throw new HttpError(422,'supported_claim_required')
  if((await this.get(db,owner,caseId,id)).version!==version)throw new HttpError(409,'review_version_stale')
  const rows=(await db.query<{value:Record<string,unknown>}>('SELECT agentstudio.monitor_live_record_review($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text) AS value',[caseId,id,version,v.decision,rationale])).rows
  const result=rows[0]?.value
  if(rows.length!==1||!result||result.actor_uid!==owner||result.record_id!==id||result.record_version!==version||result.decision!==v.decision||result.review_method!=='human'||result.governance_revision!==epoch)throw new HttpError(503,'monitor_review_not_confirmed')
  return{review_id:ownId(result.review_id),record_id:id,record_version:version,decision:v.decision,review_method:'human' as const,actor_uid:owner,created_ms:integer(result.created_ms,1),revision:integer(result.revision,1)}
 }

}
