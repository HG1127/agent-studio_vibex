// Memory/source counterexamples only. No SQL engine, installed ACL or Worker acceptance.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {readMonitorCaseLocked,readMonitorRowLocked,readMonitorCheckLocked} from '../src/native-monitor-row-lock.ts'
import {NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {NativeMonitorLiveAnalysis} from '../src/native-monitor-live-analysis.ts'
import {monitorHash} from '../src/native-monitor-source-contract.ts'
import {monitorLiveTables,monitorLiveFunctions} from '../src/native-monitor-live-schema.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),caseId=id(2),monitorId=id(3),checkId=id(4)
const digest=v=>createHash('sha256').update(v).digest('hex')
const readers=[['case',readMonitorCaseLocked],['monitor',readMonitorRowLocked],['check',readMonitorCheckLocked]]
function memory(options={}){
 const trace=[];let saved
 const db={async query(sql,p=[]){
  trace.push({sql,p})
  // Explicit SELECT-only privilege counterexample, not a PostgreSQL emulator.
  if(/FROM agentstudio.monitor_live_\w+[^]*FOR (SHARE|UPDATE)/.test(sql)){const e=Error('SELECT-only role cannot take this direct row lock');e.code='42501';throw e}
  if(sql.includes("current_user='agentstudio_api'"))return{rows:[{ok:options.actor!==false&&p[0]===owner}]}
  if(sql.includes(' AS api_only'))return{rows:[{epoch:options.disabled?null:'7',api_only:!options.worker}]}
  if(sql.includes('monitor_live_case_create(')){saved=JSON.parse(p[0]);return{rows:[{value:saved.case_id}]}}
  if(/SELECT agentstudio.monitor_live_(case|monitor|check)_read_lock\(/.test(sql)){
   if(options.rpcError)throw options.rpcError
   if(options.rows!==undefined)return{rows:options.rows}
   let value={id:p[0],title:'Owned case',data_space:'LIVE',questions:[{question_id:id(9),question:'Original question'}],created_ms:'1793310000000'}
   if(saved)value={id:saved.case_id,title:saved.title,data_space:saved.data_space,questions:saved.questions,created_ms:'1793310000000'}
   if(sql.includes('_monitor_read_lock(')){const definition={adapter_id:'research.relationship-events.v1',target_pins:[],target_entity_ids:[],relation_types:[],sources:[]};value={id:p[0],owner_user_id:owner,case_id:caseId,revision:'1',enabled:true,definition,definition_hash:monitorHash(definition),baseline_check_id:null,current_check_id:null}}
   if(sql.includes('_check_read_lock('))value={id:p[0],owner_user_id:owner,monitor_id:monitorId,case_id:caseId,monitor_revision:'1',definition_hash:'a'.repeat(64),run_id:null,status:'collecting',fact_set_id:null,baseline_check_id:null,receipts:[],assessment:{},error:'',created_ms:'1793310000000'}
   return{rows:[{value:options.missing?null:value}]}
  }
  throw Error('unexpected pure query '+sql)
 }};return{db,trace}
}
for(const [kind,read]of readers){
 for(const update of [false,true])test(kind+' keeps the exact '+(update?'UPDATE':'SHARE')+' request under a SELECT-only table contract',async()=>{
  const f=memory();await assert.rejects(f.db.query('SELECT id FROM agentstudio.monitor_live_cases WHERE id=$1 FOR '+(update?'UPDATE':'SHARE'),[caseId]),e=>e.code==='42501')
  const value=await read(f.db,owner,caseId,update);assert.equal(value.id,caseId)
  const q=f.trace.at(-1);assert.equal(q.sql,'SELECT agentstudio.monitor_live_'+kind+'_read_lock($1::uuid,$2::uuid,$3::boolean) AS value');assert.deepEqual(q.p,[caseId,owner,update])
 })
 test(kind+' rejects another Actor before invoking the definer',async()=>{const f=memory({actor:false});await assert.rejects(read(f.db,owner,caseId),e=>e.code==='owned_admission_context_required');assert.equal(f.trace.length,1)})
 test(kind+' treats only an explicit RPC null as not found',async()=>{const f=memory({missing:true});assert.equal(await read(f.db,owner,caseId),null)})
 test(kind+' propagates RPC/transaction failures without a direct SELECT fallback',async()=>{const error=Object.assign(Error('transaction failed'),{code:'40001'}),f=memory({rpcError:error});await assert.rejects(read(f.db,owner,caseId),e=>e===error);assert.equal(f.trace.length,2)})
 for(const [name,rows]of [['missing',[]],['duplicate',[{value:{id:caseId}},{value:{id:caseId}}]],['undefined',[{value:undefined}]],['array',[{value:[]}]],['wrong id',[{value:{id:id(99)}}]],['extra result column',[{value:{id:caseId},other:true}]]])test(kind+' fails closed on '+name+' RPC response',async()=>{const f=memory({rows});await assert.rejects(read(f.db,owner,caseId),e=>e.code==='monitor_history_integrity_error')})
 test(kind+' validates UUID and boolean without sending SQL',async()=>{for(const [actor,target,update]of [[owner,'bad',false],['bad',caseId,false],[owner,caseId,1]]){const f=memory();await assert.rejects(read(f.db,actor,target,update));assert.equal(f.trace.length,0)}})
}
test('case creation reads its actual persisted DTO through the new lock RPC',async()=>{const f=memory(),data=new NativeMonitorBusinessData(async()=>{});const result=await data.caseCreate(f.db,owner,{title:'Original UI case',data_space:'LIVE',questions:['Original question']});assert.equal(result.title,'Original UI case');assert.equal(result.questions[0].question,'Original question');const lock=f.trace.find(q=>q.sql.includes('_case_read_lock('));assert.deepEqual(lock.p,[result.case_id,owner,false])})
test('read locks do not grant the Worker employee-only create authority',async()=>{const f=memory({worker:true}),data=new NativeMonitorBusinessData(async()=>{});await assert.rejects(data.caseCreate(f.db,owner,{title:'Case',data_space:'LIVE',questions:['Q']}),e=>e.code==='monitor_employee_review_required');assert(!f.trace.some(q=>q.sql.includes('_case_create(')))})
test('real monitor/check readers retain lock flags and DTO/current case checks',async()=>{const f=memory(),data=new NativeMonitorBusinessData(async()=>{}),analysis=new NativeMonitorLiveAnalysis(data,async()=>{});for(const update of [false,true]){assert.equal((await analysis.monitor(f.db,owner,monitorId,update)).case_id,caseId);assert.equal((await analysis.check(f.db,owner,checkId,update)).case_id,caseId)}assert.deepEqual(f.trace.filter(q=>q.sql.includes('_monitor_read_lock(')).map(q=>q.p[2]),[false,true]);assert.deepEqual(f.trace.filter(q=>q.sql.includes('_check_read_lock(')).map(q=>q.p[2]),[false,true]);assert.equal(f.trace.filter(q=>q.sql.includes('_case_read_lock(')).length,2)})
const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_074_monitor_live.sql',import.meta.url),'utf8')
const additions=monitorLiveFunctions.filter(f=>/_read_lock$/.test(f.name))
test('074 is exactly the frozen parent plus three lock readers and their API EXECUTE edges',()=>{
 const parent=ddl.replace(/-- Read locks run as the reviewed migration owner\.[^]*?(?=REVOKE ALL ON FUNCTION agentstudio\.monitor_live_time_valid)/,'').replace(/^(REVOKE ALL ON FUNCTION agentstudio\.monitor_live_(?:case|monitor|check)_read_lock\(uuid,uuid,boolean\) FROM PUBLIC;|GRANT EXECUTE ON FUNCTION agentstudio\.monitor_live_(?:case|monitor|check)_read_lock\(uuid,uuid,boolean\) TO agentstudio_api;)\n/gm,'')
 assert.equal(digest(parent),'63a2eb41490dc3150b4f5cc4c24b6e6205974b4f5dbea627bd5af94f59c8517d');assert.equal(monitorLiveTables.length,14);assert.equal(monitorLiveFunctions.length,69);assert.equal(additions.length,3)
 assert.equal(digest(readFileSync(new URL('../../../db/postgres/migrations/pg_v9_077_ordinary_case_runs.sql',import.meta.url))),'6e06ed733c485fe69780faf7b5b0744570b48047e6dafd91f835fa51bebdc5e4')
})
for(const f of additions)test(f.name+' has a pinned owner/Actor/case bounded body, two lock modes, and API-only EXECUTE',()=>{
 const signature=f.name+'('+f.args+')',marker='CREATE FUNCTION agentstudio.'+signature,at=ddl.indexOf(marker),end=ddl.indexOf('$fn$;',at),source=ddl.slice(at,end+6),body=ddl.slice(ddl.indexOf('$fn$',at)+4,end)
 assert.equal(digest(body),f.sha256);assert.deepEqual(f.roles,['agentstudio_api']);assert.equal(f.definer,true);assert.equal(f.strict,true);assert.equal(f.returns,'jsonb');assert.equal(f.volatility,'v')
 assert(source.includes('SECURITY DEFINER SET search_path=pg_catalog'));assert(body.includes("current_setting('role') IS DISTINCT FROM 'agentstudio_api'"));assert(body.includes('v_owner IS DISTINCT FROM $2'));assert(body.includes('agentstudio.agent_memory_outcome_epoch() IS NULL'));assert(body.includes('r.owner_user_id=v_owner FOR UPDATE'));assert(body.includes('r.owner_user_id=v_owner FOR SHARE'));assert(!/EXECUTE|INSERT INTO|UPDATE agentstudio|DELETE FROM/.test(body))
 if(!f.name.includes('_case_'))assert(body.includes('c.owner_user_id=v_owner'))
 assert(ddl.includes('REVOKE ALL ON FUNCTION agentstudio.'+signature+' FROM PUBLIC;'));assert(ddl.includes('GRANT EXECUTE ON FUNCTION agentstudio.'+signature+' TO agentstudio_api;'))
})
