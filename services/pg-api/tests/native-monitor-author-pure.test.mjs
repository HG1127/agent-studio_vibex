import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeMonitorAuthor} from '../src/native-monitor-author.ts'
import {NativeMonitorBusinessData} from '../src/native-monitor-business-data.ts'
import {monitorHash,monitorCanonical} from '../src/native-monitor-source-contract.ts'
import {id,owner,caseId,definition,fixture} from './helpers/monitor074-definition-fixture.mjs'
function authorFixture(options={}){
 const f=fixture(options),state={writes:0,controls:0,monitor:null},db={async query(sql,p=[]){
  if(sql.startsWith('SELECT agentstudio.monitor_live_author(')){
   state.writes++;assert.equal(p[0],caseId);assert.equal(p[1],null);assert.equal(p[2],0)
   const d=JSON.parse(p[3]);assert.equal(p[4],monitorCanonical(d));assert.equal(p[5],monitorHash(d))
   state.monitor={id:id(80),case_id:caseId,schedule_id:d.schedule_id,revision:'1',enabled:false,definition:d,definition_hash:p[5],baseline_check_id:null,current_check_id:null,schedule_revision:'8'}
   return{rows:[{value:id(80)}]}
  }
  if(sql.startsWith('SELECT m.id,m.case_id,m.schedule_id'))return{rows:state.monitor?[state.monitor]:[]}
  if(sql.startsWith('SELECT agentstudio.monitor_live_control(')){state.controls++;state.monitor.enabled=p[3];return{rows:[{value:id(80)}]}}
  return f.db.query(sql,p)
 }}
 const data=new NativeMonitorBusinessData(async()=>{throw Error('employee fixture never has Worker authority')})
 return{...f,db,state,author:new NativeMonitorAuthor(data)}
}
test('original UI raw proposal and preview hash are recomputed before the one closed author RPC',async()=>{
 const f=authorFixture(),raw=definition(),preview=await f.author.preview(f.db,owner,caseId,raw)
 const saved=await f.author.save(f.db,owner,caseId,{definition:raw,preview_hash:preview.preview_hash,idempotency_key:'original-ui-save'})
 assert.equal(saved.monitor_id,id(80));assert.equal(saved.enabled,false);assert.equal(saved.blocked,false);assert.equal(f.state.writes,1)
 assert(!f.trace.some(q=>/^\s*(INSERT|UPDATE|DELETE)/.test(q.sql)))
})
test('server-normalized preview remains compatible, but altered derived fields cannot enter the ledger',async()=>{
 const f=authorFixture(),preview=await f.author.preview(f.db,owner,caseId,definition())
 await f.author.save(f.db,owner,caseId,{definition:preview.definition,preview_hash:preview.preview_hash,idempotency_key:'normalized-client'})
 const before=f.state.writes
 for(const extra of [{case_id:id(90)},{schedule_resource_hash:'f'.repeat(64)},{owner_user_id:owner}]){
  await assert.rejects(()=>f.author.save(f.db,owner,caseId,{definition:{...preview.definition,...extra},preview_hash:preview.preview_hash,idempotency_key:'forged-derived'}))
 }
 assert.equal(f.state.writes,before)
})
test('resource change after displayed preview aborts authoring before any mutation',async()=>{
 const real=fixture(),data=new NativeMonitorBusinessData(async()=>{}),author=new NativeMonitorAuthor(data)
 const shown=await author.preview(real.db,owner,caseId,definition());real.state.resource='b'.repeat(64)
 await assert.rejects(()=>author.save(real.db,owner,caseId,{definition:definition(),preview_hash:shown.preview_hash,idempotency_key:'stale-preview'}),e=>e.code==='monitor_review_preview_changed')
 assert(!real.trace.some(q=>q.sql.includes('monitor_live_author(')))
})
test('Worker identity cannot preview, save or control employee monitor state',async()=>{
 const f=authorFixture({worker:true})
 for(const work of [
  ()=>f.author.preview(f.db,owner,caseId,definition()),
  ()=>f.author.save(f.db,owner,caseId,{definition:definition(),preview_hash:'a'.repeat(64),idempotency_key:'worker'}),
  ()=>f.author.control(f.db,owner,id(80),{enabled:false,expected_revision:1,expected_schedule_revision:8}),
 ])await assert.rejects(work,e=>e.code==='monitor_employee_review_required')
 assert.equal(f.state.writes,0);assert.equal(f.state.controls,0)
})
test('control preserves original revisions and next-at hint without granting a new activation',async()=>{
 const f=authorFixture(),preview=await f.author.preview(f.db,owner,caseId,definition())
 await f.author.save(f.db,owner,caseId,{definition:definition(),preview_hash:preview.preview_hash,idempotency_key:'control-base'})
 const out=await f.author.control(f.db,owner,id(80),{enabled:true,expected_revision:1,expected_schedule_revision:8,next_at_ms:Date.now()+5000})
 assert.equal(out.enabled,true);assert.equal(f.state.controls,1)
 for(const raw of [{enabled:true,expected_revision:0,expected_schedule_revision:8},{enabled:true,expected_revision:1,expected_schedule_revision:8,background_ack:'forged'},{enabled:true,expected_revision:1,expected_schedule_revision:8,actor_uid:owner}])await assert.rejects(()=>f.author.control(f.db,owner,id(80),raw))
 assert.equal(f.state.controls,1)
})
