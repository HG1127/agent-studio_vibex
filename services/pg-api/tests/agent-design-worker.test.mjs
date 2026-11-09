// Injected SQL/dispatch fixtures are pure transport/order checks, not role proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentDesignWorker} from '../src/agent-design-worker.ts'
import {agentDesignExecutionApproval} from '../src/agent-design-runtime-policy.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),activation={executionEnabled:true,executionApproval:agentDesignExecutionApproval,audit:async()=>true}
function fixture(failCommit=false){const calls=[],db={release(){},async query(sql){calls.push(sql)
  if(sql.includes('rolcanlogin'))return {rows:[{login:true,initial_role:true,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false}]}
  if(sql.includes("'MEMBER'"))return {rows:[{name:'agentstudio_design_worker'}]}
  if(sql.includes('pg_auth_members'))return {rows:[{name:'agentstudio_design_worker',admin:false,inherit:false,set:true}]}
  if(sql==='SELECT current_user AS role')return {rows:[{role:'agentstudio_design_worker'}]}
  if(sql.includes('agent_design_claim'))return {rows:[{value:{protocol:'agent_design_dispatch_v1',request_id:id(1),lease_token:id(2),lease_version:1,worker_id:id(3),lease_expires_at:'2099-01-01T00:00:00.000Z'}}]}
  if(sql.includes('agent_design_pause'))return {rows:[{value:{protocol:'agent_design_dispatch_reply_v1',request_id:id(1),state:'paused'}}]}
  if(sql==='COMMIT'&&failCommit)throw Error('ack lost');return {rows:[]}
}};return {calls,pool:{connect:async()=>db}}}
test('default-off and missing auditor cannot acquire/claim work',async()=>{let calls=0;const pool={connect:async()=>{calls++;throw Error()}};assert.deepEqual(await new AgentDesignWorker(pool,id(3),async()=>{}).tick(),{state:'disabled'});assert.equal(calls,0);assert.throws(()=>new AgentDesignWorker(pool,id(3),async()=>{},{executionEnabled:true,executionApproval:agentDesignExecutionApproval}))})
test('dispatch starts only after acknowledged claim COMMIT and sends no expiry/private fields',async()=>{const f=fixture();let sent=0;const w=new AgentDesignWorker(f.pool,id(3),async p=>{sent++;assert.equal(f.calls.at(-1),'COMMIT');assert.deepEqual(Object.keys(p).sort(),['lease_token','lease_version','protocol','request_id','worker_id']);return {protocol:'agent_design_dispatch_reply_v1',request_id:p.request_id,state:'failed'}},activation);assert.equal((await w.tick()).state,'failed');assert.equal(sent,1)})
test('claim COMMIT uncertainty never dispatches; a dispatch failure pauses exactly once without resending',async()=>{const broken=fixture(true);let sent=0;await assert.rejects(()=>new AgentDesignWorker(broken.pool,id(3),async()=>{sent++},activation).tick());assert.equal(sent,0)
 const f=fixture(),w=new AgentDesignWorker(f.pool,id(3),async()=>{sent++;throw Error('transport lost')},activation);assert.equal((await w.tick()).state,'paused');assert.equal(sent,1);assert.equal(f.calls.filter(s=>s.includes('agent_design_pause(')).length,1)
 w.closeNewClaims();assert.deepEqual(await w.tick(),{state:'idle'})
})
