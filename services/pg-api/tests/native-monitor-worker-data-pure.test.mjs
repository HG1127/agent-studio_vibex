import test from 'node:test'
import assert from 'node:assert/strict'
import {createMonitorOriginalWorkerData} from '../src/native-monitor-worker-data.ts'
import {NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from '../src/native-monitor-definition-authority.ts'
import {monitorCanonical,monitorHash} from '../src/native-monitor-source-contract.ts'
// Scripted SQL/current-resource doubles only: no PG server, SQL execution or provider.
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const owner=id(1),caseId=id(2),person=id(3),schedule=id(4),spec=id(5),model=id(6),run=id(7),check=id(8),company=id(9),result=id(10),job=id(11),token=id(12)
const time='1793310000000',lease=()=>({job_id:job,run_id:run,lease_token:token,lease_version:3,lease_owner:'synthetic-worker'})
const entity=(name='Company',kind='ORGANIZATION')=>({canonical_name:name,entity_type:kind,aliases:[],identity_status:'CONFIRMED',identity_basis:'employee or actual source confirmed'})
const writeEntity=()=>({expected_version:0,schema_id:'research.entity.v1',payload:entity(),source_refs:[],idempotency_key:'new-company'})
const reference=()=>({run_id:run,result_id:result,start:0,end:4,quote:'FACT'})
const relation=()=>({expected_version:0,schema_id:'research.relation.v1',payload:{from_id:person,to_id:company,relation_type:'EMPLOYMENT',description:'Director',status:'SOURCE_SUPPORTED',valid_from:'2026-10-30',valid_to:null,missing:[]},source_refs:[reference()],idempotency_key:'relation-one'})
const definitionInput=()=>({title:'Owned monitor',schedule_id:schedule,adapter_id:'research.relationship-events.v1',target_entity_ids:[person],relation_types:['EMPLOYMENT'],sources:[{source_id:'roles',tool:'web_fetch',input:{url:'https://public.example.com/roles'},adapter_id:'web.text.v1',required_markers:['FACT']}],execution_budget:{model_calls:20,tool_calls:30,read_calls:30,search_calls:0,closing_model_calls:1,wall_ms:600000}})
async function fixture(options={}){
 const state={worker:false,role:'agentstudio_api',resource:'a'.repeat(64),bindings:0,persists:0,fences:0,receipts:0,...options},trace=[],records=new Map()
 const record=(record_id,payload,extra={})=>({record_id,version:'1',schema_id:'research.entity.v1',payload,source_refs:[],relation_versions:[],run_id:null,created_ms:time,...extra})
 records.set(person,[record(person,entity('Person','PERSON'))]);records.set(company,[record(company,entity())])
 const payload={text:'FACT source tail',structuredContent:null,data_space:'LIVE',coverage:{stored_complete:true},redacted:false,usable_as_evidence:true}
 const receipt={id:result,owner_user_id:owner,case_id:caseId,run_id:run,step_key:'source-roles',monitor_check_id:check,source_id:'roles',request_hash:'a'.repeat(64),payload,source_scope:{knowledge_base_ids:[],documents:[],semantic_used:false,dependency_runs:[]},content_hash:monitorHash(payload),created_ms:time}
 const binding={connection_id:model,connection_revision:2,model_id:'gpt-test'}
 const execution={instruction:'declared source only',target_revision:1,max_steps:10,anchor_at:'2026-10-30T00:00:00.000Z',expires_at:null,max_occurrences:10,max_auto_effects:20,allow_paid_knowledge:false,background_ack:'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1',knowledge_charge_ack:null,model_binding:binding}
 const db={async query(sql,p=[]){
  trace.push({sql,p,role:state.role})
  if(sql==='SET LOCAL ROLE agentstudio_worker'){state.role='agentstudio_worker';return{rows:[]}}
  if(sql==='SET LOCAL ROLE agentstudio_api'){state.role='agentstudio_api';return{rows:[]}}
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:state.role==='agentstudio_api'&&p[0]===owner}]}
  if(sql.includes(' AS api_only'))return{rows:[{epoch:'7',api_only:!state.worker}]}
  if(sql.includes('monitor_live_case_read_lock('))return{rows:[{value:p[0]===caseId?{id:caseId,title:'Owned case',data_space:'LIVE',questions:[{question_id:id(99),question:'Q'}],created_ms:time}:null}]}
  if(sql.includes('monitor_live_worker_binding(')){
   assert.equal(state.role,'agentstudio_worker');state.bindings++
   assert.deepEqual(JSON.parse(p[0]),lease())
   if(state.bindingThrows)throw Error('actual_job_lease_lost')
   if(state.bindingMissing)return{rows:[]}
   return{rows:[{value:{owner_user_id:owner,case_id:caseId,run_id:run,check_id:check,definition:state.definition,definition_hash:monitorHash(state.definition),...state.bindingOverride}}]}
  }
  if(sql.startsWith('SELECT id,owner_user_id,kind,agent_spec_id'))return{rows:[{id:schedule,owner_user_id:owner,kind:'agent',agent_spec_id:spec,time_zone:'Asia/Shanghai',recurrence:{config_format:'pg_schedule_execution_v3',execution_supported:true,rule:{kind:'interval',interval_minutes:60}},execution,revision:'7'}]}
  if(sql.startsWith('SELECT id,owner_user_id,spec'))return{rows:[{id:spec,owner_user_id:owner,spec:{goal:'collect source',tools:['web_fetch','business_case_get','business_record_query','business_record_write','result_read'],knowledge_base_ids:[],require_approval:true},revision:'1'}]}
  if(sql.startsWith('SELECT revision,enabled,status,models,provider,base_url'))return{rows:[{revision:'2',enabled:true,status:'ok',models:['gpt-test'],provider:'openai',base_url:'https://api.openai.com/v1'}]}
  if(sql.startsWith('SELECT id,provider,revision'))return{rows:[{id:model,provider:'openai',revision:'2',enabled:true,status:'ok'}]}
  if(sql.startsWith('SELECT agentstudio.schedule_resource_fingerprint'))return{rows:[{sha:state.resource}]}
  if(sql.startsWith('SELECT record_id,version::text AS version,schema_id')){const all=records.get(p[2])??[];return{rows:all.filter(r=>p.length===3||Number(r.version)===p[3]).slice(-1)}}
  if(sql.startsWith('SELECT record_id,version::text AS version,request_hash'))return{rows:[]}
  if(sql.startsWith('SELECT version::text AS version,schema_id')){const all=records.get(p[0])??[];return{rows:all.slice(-1).map(r=>({version:r.version,schema_id:r.schema_id}))}}
  if(sql.includes('monitor_live_record_write(')){
   assert.equal(state.role,'agentstudio_worker');state.persists++;assert.deepEqual(JSON.parse(p[2]),lease())
   const prepared=JSON.parse(p[1]);state.prepared=prepared
   if(state.persistThrows)throw Error('lease_or_effect_invalidated')
   const next={record_id:prepared.record_id,version:String(prepared.expected_version+1),schema_id:prepared.schema_id,payload:prepared.payload,source_refs:prepared.source_refs,relation_versions:prepared.relation_versions,run_id:prepared.run_id,created_ms:time}
   records.set(next.record_id,[...(records.get(next.record_id)??[]),next])
   return{rows:[{value:state.badAck?{record_id:id(404),version:1}:{record_id:next.record_id,version:Number(next.version)}}]}
  }
  if(sql.includes('AS ready'))return{rows:[{ready:true}]}
  if(sql.includes(' AS installed'))return{rows:[{installed:true,human_installed:false}]}
  if(sql.includes('knowledge_query_execution_validate_run($1'))return{rows:[{ok:!state.revoked}]}
  if(sql.includes('FROM agentstudio.runs WHERE'))return{rows:[{id:p[0],owner_user_id:owner}]}
  if(sql.startsWith('SELECT source_scope'))return{rows:[{source_scope:receipt.source_scope}]}
  if(sql.startsWith('SELECT id,owner_user_id,case_id')){state.receipts++;return{rows:[{...receipt,...state.receiptOverride}]}}
  throw Error('unexpected pure SQL '+sql)
 }}
 const human=new NativeMonitorBusinessData(async()=>{throw Error('human fixture does not write')})
 state.definition=await new NativeMonitorDefinitionAuthority(human).normalize(db,owner,caseId,definitionInput())
 state.worker=true
 const raw=lease(),fence=async(dbArg,actualOwner,actualRun,input)=>{
  assert.equal(dbArg,db);assert.equal(actualOwner,owner);assert.equal(actualRun,run)
  assert.equal(state.role,'agentstudio_api');state.fences++;state.fencedInput=monitorCanonical(input)
  if(state.fenceThrows)throw Error('bound_effect_approval_required')
 },adapter=createMonitorOriginalWorkerData(raw,fence)
 return{state,trace,db,records,raw,adapter}
}
test('original claim is closed and immutable, and a real effect fence callback is mandatory',()=>{
 assert.throws(()=>createMonitorOriginalWorkerData(lease()),/effect_fence_required/)
 for(const extra of [{owner_user_id:owner},{lease_version:0},{lease_version:1.2},{lease_owner:''},{run_id:'caller-run'},{lease_token:null}])assert.throws(()=>createMonitorOriginalWorkerData({...lease(),...extra},async()=>{}))
 let touched=false;const raw=lease();Object.defineProperty(raw,'run_id',{get(){touched=true;return run},enumerable:true})
 assert.throws(()=>createMonitorOriginalWorkerData(raw,async()=>{}));assert.equal(touched,false)
})
test('binding derives owner/case/run from the actual Worker RPC, rechecks current resources and restores API role',async()=>{
 const f=await fixture();f.raw.lease_version=999;f.raw.lease_owner='mutated-caller'
 const result=await f.adapter.requireBinding(f.db,owner,caseId,run)
 assert.equal(result.checkId,check);assert.equal(f.state.bindings,1);assert.equal(f.state.role,'agentstudio_api')
 assert.equal(f.state.fences,0)
 assert(f.trace.some(q=>q.sql.startsWith('SELECT agentstudio.schedule_resource_fingerprint')))
 for(const bindingOverride of [{owner_user_id:id(101)},{case_id:id(102)},{run_id:id(103)},{definition_hash:'f'.repeat(64)},{check_id:'forged'}]){
  const x=await fixture({bindingOverride});await assert.rejects(()=>x.adapter.requireBinding(x.db,owner,caseId,run));assert.equal(x.state.role,'agentstudio_api')
 }
 const stale=await fixture();stale.state.resource='b'.repeat(64);await assert.rejects(()=>stale.adapter.requireBinding(stale.db,owner,caseId,run),e=>e.code==='monitor_configuration_changed')
})
test('failed/missing Worker lease restores role and no caller can replace the bound run',async()=>{
 for(const options of [{bindingThrows:true},{bindingMissing:true}]){
  const f=await fixture(options);await assert.rejects(()=>f.adapter.requireBinding(f.db,owner,caseId,run));assert.equal(f.state.role,'agentstudio_api');assert.equal(f.state.persists,0)
 }
 const f=await fixture();await assert.rejects(()=>f.adapter.requireBinding(f.db,owner,caseId,id(200)))
 assert.equal(f.state.bindings,0)
})
test('new non-PERSON entity writes pass the mandatory effect fence and persist only through the leased Worker RPC',async()=>{
 const f=await fixture(),input=writeEntity(),out=await f.adapter.data.write(f.db,owner,caseId,input,run)
 assert.equal(out.schema_id,input.schema_id);assert.equal(out.version,1);assert.equal(out.run_id,run)
 assert.equal(f.state.fences,1);assert.equal(f.state.persists,1);assert.equal(f.state.role,'agentstudio_api')
 assert.equal(f.state.prepared.run_id,run);assert.equal(f.state.prepared.request_hash,monitorHash(input))
 assert.equal(f.state.prepared.request_canonical,monitorCanonical(input))
 assert(f.trace.findIndex(q=>q.sql.includes('monitor_live_worker_binding'))<f.trace.findIndex(q=>q.sql.includes('monitor_live_record_write')))
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE)/.test(q.sql)))
})
test('approval/effect rejection and SQL lease loss cannot return a successful record or retry persistence',async()=>{
 const denied=await fixture({fenceThrows:true})
 await assert.rejects(()=>denied.adapter.data.write(denied.db,owner,caseId,writeEntity(),run),/bound_effect_approval_required/)
 assert.equal(denied.state.persists,0)
 for(const options of [{persistThrows:true},{badAck:true}]){
  const f=await fixture(options);await assert.rejects(()=>f.adapter.data.write(f.db,owner,caseId,writeEntity(),run))
  assert.equal(f.state.persists,1);assert.equal(f.state.role,'agentstudio_api')
 }
})
test('Worker cannot impersonate employee creation, identity revision or unrestricted business schemas',async()=>{
 const f=await fixture()
 await assert.rejects(()=>f.adapter.data.caseCreate(f.db,owner,{title:'X',data_space:'LIVE',questions:['Q']}),e=>e.code==='monitor_employee_review_required')
 await assert.rejects(()=>f.adapter.data.write(f.db,owner,caseId,writeEntity()),e=>e.code==='monitor_employee_review_required')
 for(const input of [
  {...writeEntity(),payload:entity('Forged Person','PERSON')},
  {...writeEntity(),record_id:company,expected_version:1},
 ]){
  await assert.rejects(()=>f.adapter.data.write(f.db,owner,caseId,input,run),e=>e.code==='monitor_identity_edit_requires_revision')
 }
 assert.equal(f.state.persists,0)
})
test('monitored relation writes require current in-scope identity and a real fresh receipt from the bound check',async()=>{
 const f=await fixture(),input=relation(),out=await f.adapter.data.write(f.db,owner,caseId,input,run)
 assert.equal(out.schema_id,'research.relation.v1');assert.deepEqual(out.relation_versions,[{record_id:person,version:1},{record_id:company,version:1}])
 assert.deepEqual(out.source_refs,[reference()]);assert(f.state.receipts>=2);assert.equal(f.state.persists,1)
 for(const change of [
  (x,i)=>i.payload.from_id=company,
  (x,i)=>i.payload.relation_type='BOARD',
  (x,i)=>x.state.receiptOverride={monitor_check_id:id(200)},
  (x,i)=>x.state.revoked=true,
  (x,i)=>i.source_refs[0].quote='FAKE',
 ]){
  const x=await fixture(),i=relation();change(x,i);await assert.rejects(()=>x.adapter.data.write(x.db,owner,caseId,i,run));assert.equal(x.state.persists,0)
 }
})
test('existing relation identity cannot be rewritten even with a fresh source and valid effect fence',async()=>{
 const f=await fixture(),relationId=id(50),i=relation()
 f.records.set(relationId,[{record_id:relationId,version:'1',schema_id:i.schema_id,payload:{...i.payload,to_id:id(51)},source_refs:[reference()],relation_versions:[],run_id:run,created_ms:time}])
 await assert.rejects(()=>f.adapter.data.write(f.db,owner,caseId,{...i,record_id:relationId,expected_version:1},run),e=>e.code==='monitor_relation_identity_immutable')
 assert.equal(f.state.persists,0)
})
