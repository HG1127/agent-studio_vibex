import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec} from '../src/contracts.ts'
import {safeNativeMonitorBusinessSpec,parseMonitorBusinessEffect} from '../src/native-monitor-business-contract.ts'
import {NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {NativeMonitorDefinitionAuthority} from '../src/native-monitor-definition-authority.ts'
import {monitorHash} from '../src/native-monitor-source-contract.ts'
import {id,owner,caseId,person,scheduleId,specId,modelId,rawSpec,definition,fixture} from './helpers/monitor074-definition-fixture.mjs'

test('optional business adapter preserves frozen rejection and never admits a review or configuration tool',()=>{
 assert.throws(()=>safeAgentSpec(rawSpec()),/unknown_tool/)
 assert.throws(()=>safeNativeMonitorBusinessSpec(rawSpec()),e=>e.code==='native_monitor_business_disabled')
 const parsed=safeNativeMonitorBusinessSpec(rawSpec(),true)
 assert(parsed.tools.includes('business_record_write'));assert.equal(parsed.require_approval,true)
 for(const tool of ['monitor_review','business_record_review','monitor_control','monitor_definition_write']){
  assert.throws(()=>safeNativeMonitorBusinessSpec({...rawSpec(),tools:[...rawSpec().tools,tool]},true))
  assert.throws(()=>parseMonitorBusinessEffect({title:'X',tool,params_template:'{}'}))
 }
})
test('business subeffects have no caller owner/case/actor authority and retain strict JSON parsing',()=>{
 const effect={title:'Read owned case',tool:'business_case_get',params_template:'{}'}
 assert.equal(parseMonitorBusinessEffect(effect).tool,'business_case_get')
 for(const params_template of ['{"case_id":"'+caseId+'"}','{"actor_uid":"'+owner+'"}','{"owner_user_id":"'+owner+'"}','{"x":1,"x":2}','{"x":1e999}'])assert.throws(()=>parseMonitorBusinessEffect({...effect,params_template}))
 assert.throws(()=>parseMonitorBusinessEffect({...effect,review_decision:'accepted'}))
})
test('actual resource checks produce a pinned definition and current recomputation matches',async()=>{
 const f=fixture(),out=await f.authority.preview(f.db,owner,caseId,definition())
 assert.equal(out.definition.target_pins[0].version,1);assert.equal(out.definition.schedule_resource_hash,'a'.repeat(64))
 assert.equal(out.preview_hash,monitorHash(out.definition));assert.equal(out.external_notifications,false)
 await f.authority.assertCurrent(f.db,owner,{case_id:caseId,definition_hash:out.preview_hash,definition:out.definition})
 assert(f.trace.some(q=>q.sql.startsWith('SELECT revision,enabled,status,models,provider,base_url')))
 assert(f.trace.filter(q=>q.sql.includes('schedule_resource_fingerprint')).length>=2)
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE)/.test(q.sql)))
})
test('current target version/status and Native resource fingerprint changes cannot reuse an old definition',async()=>{
 for(const change of [state=>state.targetVersion++,state=>state.targetStatus='CANDIDATE',state=>state.resource='b'.repeat(64),state=>state.modelStatus='error']){
  const f=fixture(),p=await f.authority.preview(f.db,owner,caseId,definition());change(f.state)
  await assert.rejects(()=>f.authority.assertCurrent(f.db,owner,{case_id:caseId,definition_hash:p.preview_hash,definition:p.definition}))
 }
})
test('preview rejects Worker identity, foreign schedule and missing explicit Native background acknowledgement',async()=>{
 for(const options of [{worker:true},{foreignSchedule:true}]){
  const f=fixture(options);await assert.rejects(()=>f.authority.preview(f.db,owner,caseId,definition()))
 }
 const f=fixture();delete f.state.execution.background_ack
 await assert.rejects(()=>f.authority.preview(f.db,owner,caseId,definition()))
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE)/.test(q.sql)))
})
test('source scope cannot be widened by unknown tools, credentials or injected derived fingerprints',async()=>{
 for(const mutate of [d=>d.spec_hash='a'.repeat(64),d=>d.sources[0].tool='web_search',d=>d.sources[0].input.token='synthetic-secret',d=>d.sources[0].required_markers=[],d=>d.target_entity_ids.push(person)]){
  const f=fixture(),d=definition();mutate(d);await assert.rejects(()=>f.authority.preview(f.db,owner,caseId,d))
 }
})
