import {HttpError,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {NativeMonitorBusinessData} from './native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from './native-monitor-definition-authority.ts'
import {requireMonitorEmployeeAuthority} from './native-monitor-employee-authority.ts'
import {monitorCanonical,monitorHash} from './native-monitor-source-contract.ts'
import type {LiveMonitorDefinition} from './native-monitor-live-analysis.ts'
const fail=(code='invalid_monitor_request',status=400):never=>{throw new HttpError(status,code)}
function object(raw:unknown,keys:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 monitorCanonical(raw)
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||keys.some(k=>!Object.hasOwn(raw,k))||Object.keys(raw).some(k=>![...keys,...optional].includes(k)))return fail()
 return raw as Record<string,unknown>
}
function positive(v:unknown):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1)return fail();return v}
function hash(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))return fail();return v}
function normalizedInput(raw:unknown){
 const d=raw as LiveMonitorDefinition
 monitorCanonical(d)
 if(!d||typeof d!=='object'||!Array.isArray(d.sources))return fail()
 return{title:d.title,schedule_id:d.schedule_id,adapter_id:d.adapter_id,target_entity_ids:d.target_entity_ids,relation_types:d.relation_types,sources:d.sources.map(s=>({source_id:s.source_id,tool:s.tool,input:s.input,adapter_id:s.adapter_id,scope_key:s.scope_key,required_markers:s.required_markers})),execution_budget:d.execution_budget}
}
export class NativeMonitorAuthor{
 readonly data:NativeMonitorBusinessData
 readonly authority:NativeMonitorDefinitionAuthority
 constructor(data:NativeMonitorBusinessData,authority=new NativeMonitorDefinitionAuthority(data)){this.data=data;this.authority=authority}
 async preview(db:SqlClient,owner:string,caseId:string,raw:unknown){return this.authority.preview(db,owner,caseId,raw)}
 async get(db:SqlClient,owner:string,id:string){
  ownId(owner);ownId(id)
  const rows=(await db.query<{id:string;case_id:string;schedule_id:string;revision:string;enabled:boolean;definition:LiveMonitorDefinition;definition_hash:string;baseline_check_id:string|null;current_check_id:string|null;schedule_revision:string|null}>('SELECT m.id,m.case_id,m.schedule_id,m.revision::text AS revision,m.enabled,m.definition,m.definition_hash,m.baseline_check_id,m.current_check_id,s.revision::text AS schedule_revision FROM agentstudio.monitor_live_monitors m LEFT JOIN agentstudio.schedules s ON s.id=m.schedule_id AND s.owner_user_id=m.owner_user_id AND s.deleted_at IS NULL WHERE m.id=$1::uuid AND m.owner_user_id=$2::uuid',[id,owner])).rows
  if(rows.length!==1)throw new HttpError(404,'monitor_not_found')
  const row=rows[0]!;await this.data.caseGet(db,owner,row.case_id)
  if(row.id!==id||monitorHash(row.definition)!==row.definition_hash||typeof row.enabled!=='boolean')return fail('monitor_history_integrity_error',503)
  let blocked=false
  try{await this.authority.assertCurrent(db,owner,{case_id:row.case_id,definition_hash:row.definition_hash,definition:row.definition})}
  catch(error){if(!(error instanceof HttpError)||![403,409].includes(error.status))throw error;blocked=true}
  return{monitor_id:id,case_id:ownId(row.case_id),schedule_id:ownId(row.schedule_id),schedule_revision:row.schedule_revision===null?null:ownDatabaseCount(row.schedule_revision),revision:ownDatabaseCount(row.revision),enabled:row.enabled,blocked,definition:blocked?null:row.definition,baseline_check_id:row.baseline_check_id??'',current_check_id:row.current_check_id??''}
 }
 async list(db:SqlClient,owner:string,caseId:string){
  await this.data.caseGet(db,owner,caseId)
  const rows=(await db.query<{id:string}>('SELECT id FROM agentstudio.monitor_live_monitors WHERE case_id=$1::uuid AND owner_user_id=$2::uuid ORDER BY created_ms DESC,id LIMIT 101',[caseId,owner])).rows
  if(rows.length>100)throw new HttpError(413,'monitor_list_limit')
  const items=[];for(const row of rows)items.push(await this.get(db,owner,ownId(row.id)))
  return{items}
 }
 async save(db:SqlClient,owner:string,caseId:string,raw:unknown,monitorId:string|null=null){
  await requireMonitorEmployeeAuthority(db,owner);ownId(caseId);if(monitorId)ownId(monitorId)
  const v=object(raw,['definition','preview_hash','idempotency_key'],monitorId?['expected_revision']:[])
  if(typeof v.idempotency_key!=='string'||!v.idempotency_key.trim()||v.idempotency_key.length>120)return fail()
  const revision=monitorId?positive(v.expected_revision):0,previewHash=hash(v.preview_hash)
  await this.data.caseGet(db,owner,caseId,true)
  const rawDefinition=v.definition as Record<string,unknown>,inputKeys=['title','schedule_id','adapter_id','target_entity_ids','relation_types','sources','execution_budget']
  const originalProposal=!!rawDefinition&&typeof rawDefinition==='object'&&!Array.isArray(rawDefinition)&&Object.keys(rawDefinition).length===inputKeys.length&&inputKeys.every(k=>Object.hasOwn(rawDefinition,k))
  const definition=await this.authority.normalize(db,owner,caseId,originalProposal?rawDefinition:normalizedInput(v.definition))
  // Every client-displayed derived field must match a fresh server calculation.
  if(monitorHash(definition)!==previewHash||!originalProposal&&monitorCanonical(definition)!==monitorCanonical(v.definition))return fail('monitor_review_preview_changed',409)
  const requestHash=monitorHash({case_id:caseId,monitor_id:monitorId,expected_revision:revision,definition,preview_hash:previewHash,idempotency_key:v.idempotency_key})
  const saved=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_author($1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text,$6::text,$7::text,$8::text) AS value',[caseId,monitorId,revision,JSON.stringify(definition),monitorCanonical(definition),previewHash,v.idempotency_key,requestHash])).rows
  if(saved.length!==1)return fail('monitor_definition_changed',409)
  const id=ownId(saved[0]?.value);if(monitorId&&id!==monitorId)return fail('monitor_definition_changed',409)
  return this.get(db,owner,id)
 }
 async control(db:SqlClient,owner:string,monitorId:string,raw:unknown){
  await requireMonitorEmployeeAuthority(db,owner);ownId(monitorId)
  const v=object(raw,['enabled','expected_revision','expected_schedule_revision'],['next_at_ms'])
  if(typeof v.enabled!=='boolean')return fail()
  const revision=positive(v.expected_revision),scheduleRevision=positive(v.expected_schedule_revision),next=v.next_at_ms===undefined?null:positive(v.next_at_ms)
  if(v.enabled){const current=await this.get(db,owner,monitorId);if(current.blocked)return fail('monitor_configuration_changed',409)}
  const rows=(await db.query<{value:string}>('SELECT agentstudio.monitor_live_control($1::uuid,$2::bigint,$3::bigint,$4::boolean,$5::bigint) AS value',[monitorId,revision,scheduleRevision,v.enabled,next])).rows
  if(rows.length!==1||rows[0]?.value!==monitorId)return fail('monitor_control_changed',409)
  return this.get(db,owner,monitorId)
 }
}
