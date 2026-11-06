// PG analysis/review/baseline port. Invoked only inside the live runtime's
// verified Actor transaction. No Worker/model-supplied comparison or approval
// is accepted: all records, receipts, reviews and prior baseline are reread.
import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext} from './repository.ts'
import {readMonitorRowLocked,readMonitorCheckLocked} from './native-monitor-row-lock.ts'
import {NativeMonitorBusinessData,type MonitorBusinessRecord} from './native-monitor-business-data.ts'
import {readMonitorStoredReceipt,assertMonitorRunSources} from './native-monitor-source-access.ts'
import {monitorCanonical,monitorHash,monitorEventDedup,monitorSourceProjection,type MonitorBoundSourceDefinition} from './native-monitor-source-contract.ts'
import {compareMonitorRelations,monitoredRelations,relationSemantic,type MonitorSnapshot} from '../../../shared/monitor-semantics.mjs'
export type LiveMonitorDefinition={title:string;schedule_id:string;adapter_id:'research.relationship-events.v1';target_entity_ids:string[];target_pins:{record_id:string;version:number}[];relation_types:string[];sources:MonitorBoundSourceDefinition[];[key:string]:unknown}
type Monitor={id:string;owner_user_id:string;case_id:string;revision:number;enabled:boolean;definition_hash:string;definition:LiveMonitorDefinition;baseline_check_id:string|null;current_check_id:string|null}
type ReceiptPin={source_id:string;run_id:string;result_id:string;content_hash:string;projection_hash:string}
type Check={id:string;owner_user_id:string;monitor_id:string;case_id:string;monitor_revision:number;definition_hash:string;run_id:string|null;status:string;fact_set_id:string|null;baseline_check_id:string|null;receipts:ReceiptPin[];assessment:Record<string,unknown>;error:string;created_ms:number}
type FactSet={id:string;content_hash:string;payload:MonitorSnapshot['payload']&{records:MonitorBusinessRecord[];reference_records:MonitorBusinessRecord[];created_ms:number}}
const fail=(code:string,status=409):never=>{throw new HttpError(status,code)}
const hash=(v:unknown):string=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))return fail('monitor_history_integrity_error',503);return v}
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))return fail('monitor_history_integrity_error',503);return v as Record<string,unknown>}
const uuid=(v:unknown):string|null=>v===null?null:ownId(v)
function ms(v:unknown):number{const n=typeof v==='number'?v:ownDatabaseCount(v);if(!Number.isSafeInteger(n)||n<1||Object.is(n,-0))return fail('monitor_history_integrity_error',503);return n}
import {requireMonitorEmployeeAuthority as requireMonitorEmployeeReview} from './native-monitor-employee-authority.ts'
export {requireMonitorEmployeeReview}
export class NativeMonitorLiveAnalysis{
 readonly data:NativeMonitorBusinessData
 private readonly currentDefinition:(db:SqlClient,owner:string,monitor:Monitor)=>Promise<void>
 private readonly workerLease:{check_id:string;lease_token:string;lease_version:number}|null
 constructor(data:NativeMonitorBusinessData,currentDefinition:(db:SqlClient,owner:string,monitor:Monitor)=>Promise<void>,workerLease?:{check_id:string;lease_token:string;lease_version:number}){if(!data||typeof currentDefinition!=='function')throw Error('monitor_current_definition_gate_required');this.data=data;this.currentDefinition=currentDefinition;if(workerLease){ownId(workerLease.check_id);ownId(workerLease.lease_token);if(!Number.isSafeInteger(workerLease.lease_version)||workerLease.lease_version<1)throw Error('monitor_worker_lease_required');this.workerLease=Object.freeze({...workerLease})}else this.workerLease=null}
 private lease(id:string):[string|null,number|null]{if(!this.workerLease)return[null,null];if(this.workerLease.check_id!==id)throw new HttpError(409,'monitor_worker_lease_changed');return[this.workerLease.lease_token,this.workerLease.lease_version]}
 private async recordReview(db:SqlClient,id:string,hash:string,rationale:string,decision:'accepted'|'discarded'){const rows=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_check_review($1::uuid,$2::text,$3::text,$4::text) AS value',[id,hash,rationale,decision])).rows;if(rows.length!==1)throw new HttpError(503,'monitor_review_not_confirmed');ownId(rows[0]?.value)}
 private async monitor(db:SqlClient,owner:string,id:string,lock=false):Promise<Monitor>{
  ownId(id);await assertOwnedAdmissionContext(db,owner)
  const row=await readMonitorRowLocked(db,owner,id,lock),rows=row===null?[]:[row]
  if(rows.length!==1)throw new HttpError(404,'monitor_not_found');const r=rows[0]!,definition=obj(r.definition) as LiveMonitorDefinition
  if(r.id!==id||r.owner_user_id!==owner||typeof r.enabled!=='boolean'||definition.adapter_id!=='research.relationship-events.v1'||!Array.isArray(definition.target_pins)||!Array.isArray(definition.target_entity_ids)||!Array.isArray(definition.relation_types)||!Array.isArray(definition.sources)||monitorHash(definition)!==hash(r.definition_hash))return fail('monitor_history_integrity_error',503)
  const result={id,owner_user_id:owner,case_id:ownId(r.case_id),revision:ms(r.revision),enabled:r.enabled,definition_hash:r.definition_hash as string,definition,baseline_check_id:uuid(r.baseline_check_id),current_check_id:uuid(r.current_check_id)}
  await this.data.caseGet(db,owner,result.case_id);return result
 }
 private async check(db:SqlClient,owner:string,id:string,lock=false):Promise<Check>{
  const row=await readMonitorCheckLocked(db,owner,id,lock),rows=row===null?[]:[row]
  if(rows.length!==1)throw new HttpError(404,'monitor_check_not_found');const r=rows[0]!
  if(r.id!==id||r.owner_user_id!==owner||!['collecting','freezing','analyzing','needs_review','incomplete','complete','cancelled'].includes(r.status as string)||!Array.isArray(r.receipts)||r.receipts.length>10||typeof r.error!=='string')return fail('monitor_history_integrity_error',503)
  const receipts=r.receipts.map(raw=>{const p=obj(raw);return{source_id:String(p.source_id),run_id:ownId(p.run_id),result_id:ownId(p.result_id),content_hash:hash(p.content_hash),projection_hash:hash(p.projection_hash)}})
  if(new Set(receipts.map(r=>r.source_id)).size!==receipts.length)return fail('monitor_history_integrity_error',503)
  return{id,owner_user_id:owner,monitor_id:ownId(r.monitor_id),case_id:ownId(r.case_id),monitor_revision:ms(r.monitor_revision),definition_hash:hash(r.definition_hash),run_id:uuid(r.run_id),status:r.status as string,fact_set_id:uuid(r.fact_set_id),baseline_check_id:uuid(r.baseline_check_id),receipts,assessment:obj(r.assessment),error:r.error,created_ms:ms(r.created_ms)}
 }
 private async factSet(db:SqlClient,owner:string,caseId:string,id:string):Promise<FactSet>{
  ownId(id);await this.data.caseGet(db,owner,caseId)
  const rows=(await db.query<Record<string,unknown>>('SELECT id,payload,content_hash FROM agentstudio.monitor_live_fact_sets WHERE id=$1::uuid AND owner_user_id=$2::uuid AND case_id=$3::uuid',[id,owner,caseId])).rows
  if(rows.length!==1)throw new HttpError(404,'fact_set_not_found');const r=rows[0]!,payload=obj(r.payload)
  if(r.id!==id||monitorHash(payload)!==hash(r.content_hash)||!Array.isArray(payload.records)||payload.records.length>600||!Array.isArray(payload.reference_records)||payload.reference_records.length>1200)return fail('fact_set_integrity_error',503)
  for(const raw of [...payload.records,...payload.reference_records]){const saved=obj(raw),record=await this.data.get(db,owner,caseId,ownId(saved.record_id),ms(saved.version));if(monitorCanonical(record)!==monitorCanonical(saved))return fail('fact_set_integrity_error',503)}
  return{id,content_hash:r.content_hash as string,payload:payload as FactSet['payload']}
 }
 private async inputs(db:SqlClient,owner:string,check:Check,historical=false){
  const monitor=await this.monitor(db,owner,check.monitor_id)
  if(check.case_id!==monitor.case_id)return fail('monitor_history_integrity_error',503)
  let definition=monitor.definition
  if(historical){const versions=(await db.query<{definition:unknown;definition_hash:string}>('SELECT definition,definition_hash FROM agentstudio.monitor_live_versions WHERE monitor_id=$1::uuid AND owner_user_id=$2::uuid AND revision=$3::bigint',[monitor.id,owner,check.monitor_revision])).rows
   if(versions.length!==1||versions[0]?.definition_hash!==check.definition_hash||monitorHash(versions[0]?.definition)!==check.definition_hash)return fail('monitor_history_integrity_error',503)
   definition=obj(versions[0]?.definition) as LiveMonitorDefinition
  }else{await this.currentDefinition(db,owner,monitor);if(check.monitor_revision!==monitor.revision||check.definition_hash!==monitor.definition_hash)return fail('monitor_configuration_changed')}
  for(const pin of definition.target_pins)await this.data.get(db,owner,check.case_id,ownId(pin.record_id),ms(pin.version))
  if(check.fact_set_id&&(check.receipts.length!==definition.sources.length||definition.sources.some(s=>!check.receipts.some(r=>r.source_id===s.source_id))))return fail('monitor_declared_source_missing')
  let runExists=false
  if(check.run_id){const runs=(await db.query<{id:string}>('SELECT id FROM agentstudio.runs WHERE id=$1::uuid AND owner_user_id=$2::uuid',[check.run_id,owner])).rows
   runExists=runs.length===1;if(runExists)await assertMonitorRunSources(db,owner,check.run_id)
   else if(check.fact_set_id||check.receipts.length||!['collecting','incomplete'].includes(check.status))return fail('monitor_run_unavailable',403)
  }
  for(const pin of check.receipts){const receipt=await readMonitorStoredReceipt(db,owner,check.case_id,pin.run_id,pin.result_id),source=definition.sources.find(s=>s.source_id===pin.source_id)
   if(!source||pin.run_id!==check.run_id||receipt.monitor_check_id!==check.id||receipt.source_id!==pin.source_id||receipt.request_hash!==source.request_hash||receipt.content_hash!==pin.content_hash||monitorSourceProjection(source,receipt.payload).projection_hash!==pin.projection_hash)return fail('monitor_receipt_changed')
  }
  const snapshot=check.fact_set_id?await this.factSet(db,owner,check.case_id,check.fact_set_id):null
  const baseline=check.baseline_check_id?await this.check(db,owner,check.baseline_check_id):null
  if(baseline&&(baseline.monitor_id!==monitor.id||baseline.case_id!==check.case_id||baseline.status!=='complete'||!baseline.fact_set_id))return fail('monitor_history_integrity_error',503)
  const before=baseline?.fact_set_id?await this.factSet(db,owner,check.case_id,baseline.fact_set_id):null
  return{monitor,definition,snapshot,baseline,before,runExists}
 }
 async preview(db:SqlClient,owner:string,id:string){
  const check=await this.check(db,owner,id),ctx=await this.inputs(db,owner,check)
  if(!ctx.snapshot)return fail('monitor_snapshot_not_ready')
  if(ctx.monitor.baseline_check_id!==check.baseline_check_id)return fail('monitor_baseline_changed')
  const records=monitoredRelations(ctx.snapshot,ctx.definition) as MonitorBusinessRecord[]
  for(const record of records){const prior=ctx.before?.payload.records.some(r=>r.record_id===record.record_id&&r.version===record.version)
   if(!prior&&(record.run_id!==check.run_id||!record.source_refs.some(r=>r.run_id===check.run_id&&check.receipts.some(p=>p.result_id===r.result_id))))return fail('monitor_fact_without_fresh_source')
  }
  for(const r of records){if((await this.data.get(db,owner,check.case_id,r.record_id)).version!==r.version)return fail('monitor_inputs_changed');for(const pin of r.relation_versions)if((await this.data.get(db,owner,check.case_id,pin.record_id)).version!==pin.version)return fail('monitor_inputs_changed')}
  const current:MonitorBusinessRecord[]=[];let offset=0,more=true
  while(more&&offset<500){const page=await this.data.query(db,owner,check.case_id,{schema_id:'research.relation.v1',offset,limit:50});current.push(...page.items);offset=page.next_offset;more=page.has_more}
  if(more||monitorHash(monitoredRelations({payload:{records:current}},ctx.definition).map(r=>[r.record_id,r.version]).sort())!==monitorHash(records.map(r=>[r.record_id,r.version]).sort()))return fail('monitor_inputs_changed')
  const previous=ctx.baseline?Number(ctx.baseline.assessment.observed_ms??ctx.before!.payload.created_ms):0
  const assessment=compareMonitorRelations(ctx.before,ctx.snapshot,ctx.definition,previous,ctx.snapshot.payload.created_ms)
  const preview_hash=monitorHash({check_id:check.id,definition_hash:check.definition_hash,snapshot_hash:ctx.snapshot.content_hash,baseline_check_id:check.baseline_check_id??'',receipts:check.receipts,assessment})
  return{check,context:ctx,records,assessment,preview_hash}
 }
 private async updateCheck(db:SqlClient,owner:string,check:Check,status:string,error:string,assessment:Record<string,unknown>){
  ownId(owner);const [token,version]=this.lease(check.id)
  const rows=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_check_state($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text,$7::jsonb) AS value',[check.id,token,version,check.status,status,error,JSON.stringify(assessment)])).rows
  if(rows.length!==1||rows[0]?.value!==check.id)return fail('monitor_check_changed')
 }
 private async latestReview(db:SqlClient,owner:string,caseId:string,record:MonitorBusinessRecord):Promise<string>{
  const rows=(await db.query<{decision:string}>('SELECT decision FROM agentstudio.monitor_live_record_reviews WHERE owner_user_id=$1::uuid AND case_id=$2::uuid AND record_id=$3::uuid AND record_version=$4::bigint ORDER BY revision DESC LIMIT 1',[owner,caseId,record.record_id,record.version])).rows
  return rows[0]?.decision??'unreviewed'
 }
 async readCheck(db:SqlClient,owner:string,monitorId:string,id:string){
  const monitor=await this.monitor(db,owner,monitorId),check=await this.check(db,owner,id)
  if(check.monitor_id!==monitor.id||check.case_id!==monitor.case_id)throw new HttpError(404,'monitor_check_not_found')
  let blocked=false,runAvailable=false
  try{runAvailable=(await this.inputs(db,owner,check,true)).runExists}catch(error){
   if(!(error instanceof HttpError)||!['monitor_source_unavailable','monitor_run_unavailable','monitor_source_acl_runtime_required'].includes(error.code))throw error
   blocked=true
  }
  const superseded=check.monitor_revision!==monitor.revision&&!['complete','incomplete','cancelled'].includes(check.status)
  return{check_id:check.id,monitor_id:monitor.id,revision:check.monitor_revision,run_id:check.run_id??'',run_available:!blocked&&runAvailable,
   status:blocked?'blocked':superseded?'superseded':check.status,historical_status:check.status,error:blocked?'monitor_source_unavailable':check.error,
   fact_set_id:blocked?null:check.fact_set_id??'',baseline_check_id:blocked?null:check.baseline_check_id??'',
   assessment:blocked?{}:check.assessment,receipts:blocked?[]:check.receipts,created_ms:check.created_ms}
 }
 async reviewPreview(db:SqlClient,owner:string,id:string){
  const p=await this.preview(db,owner,id)
  return{check:await this.readCheck(db,owner,p.check.monitor_id,id),preview_hash:p.preview_hash,records:p.records,comparison:p.assessment,receipts:p.check.receipts}
 }
 async discard(db:SqlClient,owner:string,id:string,raw:unknown){
  monitorCanonical(raw)
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||!Object.hasOwn(raw,'rationale'))throw new HttpError(400,'invalid_monitor_discard')
  const rationale=(raw as Record<string,unknown>).rationale
  if(typeof rationale!=='string'||!rationale.trim()||rationale.length>4000)throw new HttpError(400,'invalid_monitor_discard')
  await requireMonitorEmployeeReview(db,owner);const first=await this.check(db,owner,id)
  await this.data.caseGet(db,owner,first.case_id,true);await this.monitor(db,owner,first.monitor_id,true)
  const check=await this.check(db,owner,id,true)
  if(check.status!=='needs_review')return fail('monitor_check_not_discardable')
  const signature=monitorHash({action:'discard',check_id:id,definition_hash:check.definition_hash,baseline_check_id:check.baseline_check_id})
  await this.recordReview(db,id,signature,rationale,'discarded')
  await this.updateCheck(db,owner,check,'cancelled','employee_discarded',{...check.assessment,baseline_advanced:false})
  return{ok:true,check_id:id,status:'cancelled',baseline_advanced:false}
 }
 async analyze(db:SqlClient,owner:string,id:string,human?:{preview_hash:string;rationale:string}){
  const initial=await this.check(db,owner,id);await this.data.caseGet(db,owner,initial.case_id,true);await this.monitor(db,owner,initial.monitor_id,true)
  const check=await this.check(db,owner,id,true)
  if(check.status==='complete'){if(human&&human.preview_hash!==check.assessment.approval_hash)return fail('monitor_review_preview_changed');await this.inputs(db,owner,check,true);return check}
  if(!['freezing','analyzing','needs_review'].includes(check.status))return fail('monitor_check_not_reviewable')
  const p=await this.preview(db,owner,id),monitor=p.context.monitor
  if(!monitor.enabled)return fail('monitor_paused')
  if(human){
   await requireMonitorEmployeeReview(db,owner)
   if(human.preview_hash!==p.preview_hash||typeof human.rationale!=='string'||!human.rationale.trim()||human.rationale.length>4000)return fail('monitor_review_preview_changed')
   await this.recordReview(db,check.id,p.preview_hash,human.rationale,'accepted')
   for(const r of p.records)if(r.payload.status==='SOURCE_SUPPORTED')await this.data.review(db,owner,check.case_id,{record_id:r.record_id,record_version:r.version,decision:'accepted',rationale:human.rationale})
  }
  const reviews=(await db.query<{id:string}>('SELECT id FROM agentstudio.monitor_live_reviews WHERE check_id=$1::uuid AND owner_user_id=$2::uuid AND preview_hash=$3::text AND decision=\'accepted\' LIMIT 1',[check.id,owner,p.preview_hash])).rows
  const sameSources=p.context.baseline&&monitorHash(p.context.baseline.receipts.map(r=>[r.source_id,r.projection_hash]))===monitorHash(check.receipts.map(r=>[r.source_id,r.projection_hash]))
  const unchanged=p.context.before&&monitorHash(monitoredRelations(p.context.before,p.context.definition).map(r=>monitorCanonical(relationSemantic(r))).sort())===monitorHash(p.records.map(r=>monitorCanonical(relationSemantic(r))).sort())
  let accepted=true;for(const r of p.records)if(r.payload.status==='SOURCE_SUPPORTED'&&await this.latestReview(db,owner,check.case_id,r)!=='accepted')accepted=false
  if(!accepted||(!sameSources||!unchanged||!p.context.before)&&!reviews.length){await this.updateCheck(db,owner,check,'needs_review','monitor_semantic_review_required',{collection_complete:true,semantic_state:'needs_review',baseline_advanced:false,preview_hash:p.preview_hash,comparison:p.assessment});return this.check(db,owner,id)}
  const events=p.assessment.events.filter(event=>event.notify).map(event=>{const dedup=monitorEventDedup({monitor_id:monitor.id,revision:monitor.revision,baseline_check_id:check.baseline_check_id,kind:event.kind,fact:event.fact}),eventId=dedup.slice(0,8)+'-'+dedup.slice(8,12)+'-8'+dedup.slice(13,16)+'-8'+dedup.slice(17,20)+'-'+dedup.slice(20,32)
   return{id:eventId,dedup_hash:dedup,dedup_canonical:monitorCanonical({monitor_id:monitor.id,revision:monitor.revision,baseline:check.baseline_check_id??'',kind:event.kind,fact:event.fact}),kind:event.kind,payload:event}})
  const [token,version]=this.lease(check.id),command={assessment:{collection_complete:true,semantic_state:!p.assessment.can_advance?'needs_resolution':!p.context.before?'baseline_initialized':events.length?'changes':'unchanged',baseline_advanced:p.assessment.can_advance,observed_ms:p.context.snapshot!.payload.created_ms,approval_hash:p.preview_hash,comparison:p.assessment},events,can_advance:p.assessment.can_advance,observed_ms:p.context.snapshot!.payload.created_ms}
  const committed=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_assessment_commit($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::jsonb) AS value',[check.id,token,version,check.status,p.preview_hash,JSON.stringify(command)])).rows
  if(committed.length!==1||committed[0]?.value!==check.id)return fail('monitor_baseline_changed')
  return this.check(db,owner,id)
 }
}
