import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalBusinessApi,originalBusinessRoute} from '../../../src/lib/originalBusinessApi.ts'
import {NativeMonitorWorker} from '../src/native-monitor-worker.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1),caseId=id(2),check=id(3),run=id(4),token=id(5),result=id(6)
test('original component routes map to the same Native business contracts without caller owner or PB',async()=>{
 const calls=[],request=createOriginalBusinessApi(owner,async(url,options)=>{calls.push({url,options});return new Response('{"items":[]}',{status:200,headers:{'content-type':'application/json'}})})
 assert.equal(originalBusinessRoute('/api/business/cases/'+caseId+'/monitors/preview'),'/api/v2/original-ui/business/cases/'+caseId+'/monitors/preview')
 assert.equal(originalBusinessRoute('/api/agent-runs/'+run+'/tool-results/'+result+'?field=text&offset=5000&limit=4000'),'/api/v2/original-ui/business/runs/'+run+'/results/'+result+'?field=text&offset=5000&limit=4000')
 await request('/api/business/cases/'+caseId+'/query',{schema_id:'research.entity.v1'})
 assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.headers['X-AgentStudio-Expected-Employee'],owner)
 assert.equal(calls[0].url.startsWith('/__pg_native/api/v2/original-ui/'),true)
 assert(!Object.keys(calls[0].options.headers).some(k=>/authorization|rh-user/i.test(k)))
 for(const route of ['https://foreign.example/api/business/cases','//foreign/api/business/cases','/api/business/cases/pb-uid','/api/business/cases/'+caseId+'/materials'])assert.throws(()=>originalBusinessRoute(route))
})
test('real native refusal, response length mismatch, redirect and aborted reads remain errors',async()=>{
 for(const response of [
  new Response('{"error":"forbidden"}',{status:403,headers:{'content-type':'application/json'}}),
  new Response('{"items":[]}',{status:200,headers:{'content-type':'text/html'}}),
  new Response('{"items":[]}',{status:200,headers:{'content-type':'application/json','content-length':'999'}}),
 ]){
  await assert.rejects(()=>createOriginalBusinessApi(owner,async()=>response)('/api/business/cases/'+caseId))
 }
 let calls=0;const controller=new AbortController();controller.abort()
 await assert.rejects(()=>createOriginalBusinessApi(owner,async()=>{calls++;throw Error('abort')})('/api/business/cases/'+caseId,undefined,controller.signal))
 assert(calls<=1)
})
function fixture(options={}){
 const state={claims:0,renews:0,commits:0,role:'',...options},trace=[]
 const pool={connect:async()=>({async query(sql,p=[]){
  trace.push({sql,p})
  if(sql==='BEGIN'||sql==='ROLLBACK'||sql==='SET LOCAL search_path=pg_catalog'||sql.startsWith('SELECT set_config'))return{rows:[]}
  if(sql.startsWith('SET LOCAL ROLE ')){state.role=sql.slice(15);return{rows:[]}}
  if(sql==='COMMIT'){state.commits++;if(state.dropCommit===state.commits)throw Error('synthetic commit ack lost');return{rows:[]}}
  if(sql.includes("current_user='agentstudio_monitor_worker'"))return{rows:[{ok:!state.badRole}]}
  if(sql.includes('monitor_live_expire_checks'))return{rows:[{value:0}]}
  if(sql.includes('monitor_live_claim')){state.claims++;return{rows:[{value:state.empty?null:{check_id:check,owner_user_id:owner,case_id:caseId,run_id:run,lease_token:token,lease_version:2}}]}}
  if(sql.includes('monitor_live_renew')){state.renews++;return{rows:[{value:!state.stale}]}}
  if(sql.startsWith('SELECT c.status,r.status'))return{rows:[{status:'collecting',run_status:state.runStatus??'queued'}]}
  if(sql.includes('monitor_live_check_state')){state.terminal=JSON.parse(p[6]);return{rows:[{value:check}]}}
  throw Error('unexpected coordinator pure SQL '+sql)
 },release(...args){state.released=args}})}
 return{pool,state,trace}
}
test('coordinator waits for the actual collector, renews the same fenced check, and closes new claims',async()=>{
 const f=fixture(),worker=new NativeMonitorWorker(f.pool,'coordinator',{executionApproved:true})
 assert.deepEqual(await worker.tick(),{status:'waiting_collector',check_id:check})
 assert.equal(f.state.claims,1);assert.equal(f.state.renews,1)
 worker.closeNewClaims();assert.deepEqual(await worker.tick(),{status:'waiting_collector',check_id:check})
 assert.equal(f.state.claims,1);assert.equal(f.state.renews,2)
 assert.equal(worker.claimAdmissionSnapshot().coverage,'local_monitor_coordinator_only')
 assert(!f.trace.some(q=>/begin_request|transport_material|finish_request/.test(q.sql)))
})
test('failed collector becomes incomplete with baseline_advanced false and no evidence or provider work',async()=>{
 const f=fixture({runStatus:'failed'}),worker=new NativeMonitorWorker(f.pool,'coordinator',{executionApproved:true})
 assert.deepEqual(await worker.tick(),{status:'incomplete',check_id:check});assert.equal(f.state.terminal.baseline_advanced,false);assert.equal(worker.claimAdmissionSnapshot().held,false)
})
test('unknown claim or progress COMMIT is sticky, prevents replay and discards the connection',async()=>{
 for(const dropCommit of [1,2]){
  const f=fixture({dropCommit}),worker=new NativeMonitorWorker(f.pool,'coordinator',{executionApproved:true})
  await assert.rejects(()=>worker.tick(),e=>e.code==='monitor_worker_commit_unconfirmed')
  const count=f.trace.length;assert.deepEqual(await worker.tick(),{status:'uncertain'});assert.equal(f.trace.length,count);assert.deepEqual(f.state.released,[true])
 }
})
test('wrong role or stale monitor lease cannot make progress or open a capture slot',async()=>{
 for(const options of [{badRole:true},{stale:true}]){
  const f=fixture(options),worker=new NativeMonitorWorker(f.pool,'coordinator',{executionApproved:true})
  await assert.rejects(()=>worker.tick());assert(!f.trace.some(q=>/begin_request|transport_material|check_state/.test(q.sql)))
 }
})
