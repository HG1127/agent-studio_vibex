// Actual worker/admission implementation with synthetic SQL response traces.
// No real database grants, leases, Worker process, fee or system-drain proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentPlanWorkflowWorker} from '../src/agent-plan-workflow-worker.ts'
import {agentPlanWorkflowExecutionApproval as approval} from '../src/agent-plan-workflow-runtime-policy.ts'
import {id,hex,deferred,purpose} from '../../../tests/helpers/agent-plan-workflow-browser-values.mjs'
const reply=(state='succeeded',request_id=id(100))=>({protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id,state,result_sha256:state==='succeeded'?hex(1):null,completion_sha256:state==='succeeded'?hex(2):null})
function fixture(settings={}){
  const calls=[],claims=[],safe={login:false,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false};let releases=0,claimsSent=0,dispatched=0
  const claim={protocol:'agent_plan_workflow_dispatch_v1',purpose,request_id:id(100),lease_token:id(101),lease_version:1,worker_id:id(102),lease_expires_at:new Date(Date.now()+(settings.expired?-60000:60000)).toISOString()}
  const db={query:async(sql,args)=>{calls.push({sql,args});let rows=[]
    if(sql.includes('WHERE rolname=session_user'))rows=[{...safe,login:true,initial_role:true,superuser:settings.unsafe===true}]
    else if(sql.includes('WHERE rolname=$1'))rows=[safe]
    else if(sql.includes('pg_has_role'))rows=[{name:'agentstudio_plan_workflow_worker'}]
    else if(sql.includes('pg_auth_members'))rows=[{name:'agentstudio_plan_workflow_worker',admin:false,inherit:false,set:true}]
    else if(sql.includes('agent_plan_workflow_claim')){claimsSent++;claims.push(args);rows=[{value:settings.idle||claimsSent>1?null:claim}]}
    else if(sql.includes('agent_plan_workflow_pause'))rows=[{value:reply(settings.pause??'unknown')}]
    if(sql==='COMMIT'&&settings.commitLost)throw Error('synthetic_commit_ack_lost')
    return {rows}
  },release(){releases++}}
  const pool={connect:async()=>db},audit=async actual=>{assert.equal(actual,db);assert.ok(calls.some(row=>row.sql==='SET LOCAL ROLE agentstudio_plan_workflow_worker'));if(settings.auditWait)await settings.auditWait;return settings.auditFalse!==true}
  const worker=new AgentPlanWorkflowWorker(pool,id(102),async proof=>{dispatched++;assert.equal(proof.request_id,id(100));if(settings.dispatch)return settings.dispatch(proof);return reply()},settings.disabled?{}:{executionEnabled:true,executionApproval:approval,audit,dispatchTimeoutMs:settings.timeout??100})
  return {worker,calls,claims,claimsSent:()=>claimsSent,dispatched:()=>dispatched,releases:()=>releases}
}
test('default-off and minimum role/audit refusals send no claim or dispatch',async()=>{
  const off=fixture({disabled:true});assert.deepEqual(await off.worker.tick(),{state:'disabled'});assert.equal(off.calls.length,0)
  for(const setting of [{unsafe:true},{auditFalse:true}]){const x=fixture(setting);await assert.rejects(x.worker.tick());assert.equal(x.claimsSent(),0);assert.equal(x.dispatched(),0);assert.equal(x.releases(),1)}
})
test('close while original audit await is pending blocks actual SQL claim send',async()=>{
  const d=deferred(),x=fixture({auditWait:d.promise}),flight=x.worker.tick()
  while(!x.calls.some(row=>row.sql==='SET LOCAL ROLE agentstudio_plan_workflow_worker'))await Promise.resolve()
  x.worker.closeNewClaims();d.resolve();assert.deepEqual(await flight,{state:'closed'});assert.equal(x.claimsSent(),0);assert.equal(x.dispatched(),0)
})
test('claim COMMIT unknown remains uncertain even after rollback and cannot claim again',async()=>{
  const x=fixture({commitLost:true});await assert.rejects(x.worker.tick(),/ack_lost/)
  const s=x.worker.drainSnapshot();assert.equal(s.claims.closed,true);assert.equal(s.claims.pending,1);assert.equal(s.claims.uncertain,1);assert.equal(s.authority,false)
  assert.deepEqual(await x.worker.tick(),{state:'closed'});assert.equal(x.claimsSent(),1);assert.equal(x.dispatched(),0)
})
test('successful dispatch releases only a confirmed local slot and uses dedicated F05 proof',async()=>{
  const x=fixture();assert.equal((await x.worker.tick()).state,'succeeded');assert.equal(x.dispatched(),1);assert.equal(x.worker.drainSnapshot().dispatch.pending,false)
  assert.deepEqual(await x.worker.tick(),{state:'idle'});assert.deepEqual(x.claims[0],[id(102)]);assert.equal(x.calls.some(row=>/agent_design|heartbeat|telemetry/.test(row.sql)),false)
})
test('expired original claim only pauses and never calls provider dispatch',async()=>{
  const x=fixture({expired:true,pause:'paused'});assert.equal((await x.worker.tick()).state,'paused');assert.equal(x.dispatched(),0);assert.equal(x.worker.drainSnapshot().dispatch.pending,false)
})
test('dispatch timeout retains actual native promise and unknown slot after its late settlement',async()=>{
  const d=deferred(),x=fixture({dispatch:()=>d.promise,timeout:10,pause:'unknown'});assert.equal((await x.worker.tick()).state,'unknown')
  assert.equal(x.worker.drainSnapshot().dispatch.native_settled,false);assert.equal(x.worker.drainSnapshot().dispatch.uncertain,true);assert.deepEqual(await x.worker.tick(),{state:'busy'})
  d.resolve(reply());await Promise.resolve();await Promise.resolve();assert.equal(x.worker.drainSnapshot().dispatch.native_settled,true)
  assert.deepEqual(await x.worker.tick(),{state:'busy'});assert.equal(x.dispatched(),1);assert.equal(x.claimsSent(),1)
})
test('wrong request reply and rejected dispatch cannot free the original uncertain slot',async()=>{
  for(const dispatch of [async()=>reply('succeeded',id(999)),async()=>{throw Error('synthetic_transport_unknown')}]){
    const x=fixture({dispatch,pause:'unknown'});assert.equal((await x.worker.tick()).state,'unknown');assert.equal(x.worker.drainSnapshot().dispatch.uncertain,true);assert.deepEqual(await x.worker.tick(),{state:'busy'});assert.equal(x.dispatched(),1)
  }
})
test('a paused metadata acknowledgement cannot release still-unsettled native dispatch bookkeeping',async()=>{
  const d=deferred(),x=fixture({dispatch:()=>d.promise,timeout:10,pause:'paused'});assert.equal((await x.worker.tick()).state,'paused');assert.equal(x.worker.drainSnapshot().dispatch.pending,true);assert.equal(x.worker.drainSnapshot().dispatch.uncertain,true);assert.deepEqual(await x.worker.tick(),{state:'busy'});d.resolve(reply('paused'))
})
