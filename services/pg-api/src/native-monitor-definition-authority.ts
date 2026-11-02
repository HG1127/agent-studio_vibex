import {HttpError,safeModelBinding,type SqlClient} from './contracts.ts'
import {ownId,ownDatabaseCount} from './own-operations-contract.ts'
import {assertOwnedAdmissionContext,verifyAgentSpecResources} from './repository.ts'
import {safeNativeMonitorBusinessSpec} from './native-monitor-business-contract.ts'
import {safeToolDestination} from './workflow-v2-tool-plan.ts'
import {SCHEDULE_BACKGROUND_ACK} from './schedule-runtime-contract.ts'
import {requireMonitorEmployeeAuthority} from './native-monitor-employee-authority.ts'
import {NativeMonitorBusinessData} from './native-monitor-business-data.ts'
import {monitorCanonical,monitorHash,type MonitorBoundSourceDefinition} from './native-monitor-source-contract.ts'
import {parseMonitorBoundSource} from './native-monitor-live-capture.ts'
import {normalizeMonitorExecutionBudget} from '../../../shared/monitor-execution-budget.mjs'
import type {LiveMonitorDefinition} from './native-monitor-live-analysis.ts'
const fail=(code='monitor_configuration_changed',status=409):never=>{throw new HttpError(status,code)}
function object(v:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 monitorCanonical(v)
 if(!v||typeof v!=='object'||Array.isArray(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))return fail('invalid_monitor_definition',400)
 return v as Record<string,unknown>
}
function text(v:unknown,max:number):string{if(typeof v!=='string'||!v.trim()||v.length>max)return fail('invalid_monitor_definition',400);return v}
function ids(v:unknown):string[]{if(!Array.isArray(v)||v.length<1||v.length>20)return fail('invalid_monitor_targets',400);const list=v.map(id=>ownId(id));if(new Set(list).size!==list.length)return fail('invalid_monitor_targets',400);return list}
function count(v:unknown):number{const n=typeof v==='number'?v:ownDatabaseCount(v);if(!Number.isSafeInteger(n)||n<1)return fail();return n}
export class NativeMonitorDefinitionAuthority{
 readonly data:NativeMonitorBusinessData
 constructor(data:NativeMonitorBusinessData){if(!data)throw Error('monitor_business_data_required');this.data=data}
 async normalize(db:SqlClient,owner:string,caseId:string,raw:unknown):Promise<LiveMonitorDefinition>{
  ownId(owner);ownId(caseId);await assertOwnedAdmissionContext(db,owner);await this.data.caseGet(db,owner,caseId)
  const input=object(raw,['title','schedule_id','adapter_id','target_entity_ids','relation_types','sources','execution_budget'])
  if(input.adapter_id!=='research.relationship-events.v1')return fail('monitor_domain_adapter_not_registered',400)
  const title=text(input.title,300),scheduleId=ownId(input.schedule_id),targets=ids(input.target_entity_ids),pins:{record_id:string;version:number}[]=[]
  for(const id of targets){const record=await this.data.get(db,owner,caseId,id);if(record.schema_id!=='research.entity.v1'||record.payload.entity_type!=='PERSON'||record.payload.identity_status!=='CONFIRMED')return fail('monitor_target_identity_unresolved');pins.push({record_id:record.record_id,version:record.version})}
  if(!Array.isArray(input.relation_types)||!input.relation_types.length||input.relation_types.length>6||new Set(input.relation_types).size!==input.relation_types.length||input.relation_types.some(v=>!['EMPLOYMENT','BOARD','EDUCATION','CO_WORK','INTRODUCTION','OTHER'].includes(String(v))))return fail('invalid_monitor_relation_types',400)
  const schedules=(await db.query<Record<string,unknown>>('SELECT id,owner_user_id,kind,agent_spec_id,time_zone,recurrence,execution,revision::text AS revision FROM agentstudio.schedules WHERE id=$1::uuid AND owner_user_id=$2::uuid AND deleted_at IS NULL FOR SHARE',[scheduleId,owner])).rows
  if(schedules.length!==1||schedules[0]?.id!==scheduleId||schedules[0]?.owner_user_id!==owner||schedules[0]?.kind!=='agent')return fail('monitor_agent_collector_required')
  const schedule=schedules[0]!,execution=object(schedule.execution,['instruction','target_revision','max_steps','anchor_at','expires_at','max_occurrences','max_auto_effects','allow_paid_knowledge','background_ack','knowledge_charge_ack','model_binding']),recurrence=schedule.recurrence as Record<string,unknown>
  if(!recurrence||recurrence.config_format!=='pg_schedule_execution_v3'||recurrence.execution_supported!==true||execution.background_ack!==SCHEDULE_BACKGROUND_ACK||!Number.isSafeInteger(execution.max_steps)||Number(execution.max_steps)<1||Number(execution.max_steps)>30)return fail('monitor_native_schedule_authorization_required')
  const binding=safeModelBinding(execution.model_binding);if(!binding)return fail('monitor_explicit_model_binding_required')
  const specId=ownId(schedule.agent_spec_id),specs=(await db.query<Record<string,unknown>>('SELECT id,owner_user_id,spec,revision::text AS revision FROM agentstudio.agent_specs WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE',[specId,owner])).rows
  if(specs.length!==1||specs[0]?.id!==specId||specs[0]?.owner_user_id!==owner)return fail('monitor_business_collector_required')
  const specRow=specs[0]!,stored=specRow.spec
  if(!stored||typeof stored!=='object'||Array.isArray(stored))return fail()
  const {require_approval:approval,...write}=stored as Record<string,unknown>
  if(approval!==true)return fail('monitor_business_collector_required')
  const spec=safeNativeMonitorBusinessSpec(write,true,false)
  if(!spec.tools.includes('business_record_write')||!spec.tools.includes('result_read')||count(execution.target_revision)!==count(specRow.revision))return fail('monitor_business_collector_required')
  await verifyAgentSpecResources(db,owner,{...spec,model_binding:binding})
  const models=(await db.query<{id:string;provider:string;revision:string;enabled:boolean;status:string}>('SELECT id,provider,revision::text AS revision,enabled,status FROM agentstudio.model_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE',[binding.connection_id,owner])).rows
  if(models.length!==1||models[0]?.id!==binding.connection_id||models[0]?.enabled!==true||models[0]?.status!=='ok'||count(models[0]?.revision)!==binding.connection_revision)return fail('monitor_model_reverification_required')
  const fingerprint=(await db.query<{sha:string|null}>('SELECT agentstudio.schedule_resource_fingerprint($1::uuid,$2::jsonb) AS sha',[scheduleId,JSON.stringify(binding)])).rows
  const resource=fingerprint[0]?.sha
  if(fingerprint.length!==1||typeof resource!=='string'||!/^[a-f0-9]{64}$/.test(resource))return fail('monitor_schedule_resource_unavailable')
  if(!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>10||input.sources.length>Number(execution.max_steps)-2)return fail('invalid_monitor_sources',400)
  const sources:MonitorBoundSourceDefinition[]=[]
  for(const raw of input.sources){
   const s=object(raw,['source_id','tool','input','adapter_id'],['scope_key','required_markers'])
   const sourceId=text(s.source_id,60),tool=text(s.tool,160),args=object(s.input,[],Object.keys(s.input as object??{}))
   if(!spec.tools.includes(tool))return fail('monitor_source_tool_unbound',400)
   let connection:{connection_id:string;config_hash:string}|undefined
   if(s.adapter_id==='http.json-items.v1'){
    const selected=spec.http_tools?.find(t=>t.name===tool);if(!selected)return fail('monitor_source_tool_unbound',400)
    const rows=(await db.query<{id:string;revision:string;method:string;enabled:boolean;status:string;url:string}>('SELECT id,revision::text AS revision,method,enabled,status,url FROM agentstudio.tool_connections WHERE id=$1::uuid AND owner_user_id=$2::uuid FOR SHARE',[selected.connection_id,owner])).rows
    const row=rows[0];if(rows.length!==1||!row||row.id!==selected.connection_id||count(row.revision)!==selected.connection_revision||row.method!=='GET'||!row.enabled||row.status!=='ok')return fail('monitor_requires_verified_read_connection')
    safeToolDestination(row.url)
    const digest=(await db.query<{sha:string|null}>('SELECT agentstudio.monitor_live_connection_fingerprint($1::uuid) AS sha',[selected.connection_id])).rows
    if(digest.length!==1||typeof digest[0]?.sha!=='string'||!/^[a-f0-9]{64}$/.test(digest[0].sha))return fail('monitor_source_configuration_changed')
    connection={connection_id:selected.connection_id,config_hash:digest[0].sha}
   }else if(s.adapter_id==='web.text.v1'){if(tool!=='web_fetch')return fail('monitor_source_tool_unbound',400);safeToolDestination(args.url)}else return fail('monitor_source_adapter_not_registered',400)
   sources.push(parseMonitorBoundSource({source_id:sourceId,tool,input:args,adapter_id:s.adapter_id,scope_key:s.scope_key??'',required_markers:s.required_markers??[],request_hash:monitorHash([tool,args]),...connection}))
  }
  if(spec.tools.some(tool=>!sources.some(source=>source.tool===tool)&&!['business_case_get','business_record_query','business_record_write','result_read'].includes(tool)))return fail('monitor_undeclared_collector_tool',400)
  if(monitorCanonical(sources).length>12000||new Set(sources.map(s=>s.source_id)).size!==sources.length||new Set(sources.map(s=>s.request_hash)).size!==sources.length)return fail('duplicate_monitor_source',400)
  let budget;try{budget=normalizeMonitorExecutionBudget(input.execution_budget,Number(execution.max_steps))}catch{return fail('invalid_execution_budget',400)}
  if(budget.tool_calls<sources.length||budget.read_calls<sources.length||budget.model_calls<2)return fail('monitor_budget_insufficient',400)
  return{title,schedule_id:scheduleId,case_id:caseId,adapter_id:'research.relationship-events.v1',target_entity_ids:targets,target_pins:pins,relation_types:input.relation_types as string[],sources,execution_budget:budget,spec_id:specId,spec_revision:count(specRow.revision),spec_hash:monitorHash(stored),schedule_hash:monitorHash({kind:schedule.kind,agent_spec_id:specId,time_zone:schedule.time_zone,recurrence:schedule.recurrence,execution}),schedule_resource_hash:resource,model_config_hash:monitorHash({binding,provider:models[0]!.provider,resource}),model_binding:{...binding,provider:models[0]!.provider}}
 }
 async preview(db:SqlClient,owner:string,caseId:string,raw:unknown){
  await requireMonitorEmployeeAuthority(db,owner)
  const definition=await this.normalize(db,owner,caseId,raw)
  return{definition,preview_hash:monitorHash(definition),effect:'bind_existing_native_schedule_and_pause_until_enabled',collection_scope:'declared_requests_only',semantic_review:'employee_required_for_baseline_or_changed_sources',external_notifications:false}
 }
 async assertCurrent(db:SqlClient,owner:string,monitor:{case_id:string;definition_hash:string;definition:LiveMonitorDefinition}){
  const d=monitor.definition
  if(monitorHash(d)!==monitor.definition_hash)return fail('monitor_history_integrity_error',503)
  const raw={title:d.title,schedule_id:d.schedule_id,adapter_id:d.adapter_id,target_entity_ids:d.target_entity_ids,relation_types:d.relation_types,sources:d.sources.map(s=>({source_id:s.source_id,tool:s.tool,input:s.input,adapter_id:s.adapter_id,scope_key:s.scope_key,required_markers:s.required_markers})),execution_budget:d.execution_budget}
  if(monitorHash(await this.normalize(db,owner,monitor.case_id,raw))!==monitor.definition_hash)return fail()
 }
}
