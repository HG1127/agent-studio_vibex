// Pure tick-state tests use an in-memory query double, never SQL/PGlite.
import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentAssessmentWorker} from '../src/agent-assessment-worker.ts'
import {agentAssessmentApproval} from '../src/agent-assessment-contract.ts'
const active={executionEnabled:true,executionApproval:agentAssessmentApproval},workerId='11111111-1111-4111-8111-111111111111'
const proof={request_id:'abcdef01-abcd-4abc-8def-123456789abc',lease_token:'fedcba01-fedc-4fed-8cba-abcdef012345',lease_version:1,worker_id:workerId}
const claim=()=>({...proof,lease_expires_at:new Date(Date.now()+90000).toISOString()})
function isolated(dispatch,options={},selected=claim(),pauseState='paused'){
  const events=[],pool={async connect(){throw Error('no real database permitted')}}
  const worker=new AgentAssessmentWorker(pool,workerId,dispatch,{...active,...options})
  // Replace only the transaction adapter in this pure test; production tick
  // always uses its dedicated real role, strict audit, BEGIN/COMMIT path.
  worker.worker=async body=>{events.push('begin');const result=await body({async query(sql,args){if(sql.includes('_claim(')){events.push('claim');assert.deepEqual(args,[workerId]);return {rows:[{value:selected}]}}if(sql.includes('_pause(')){events.push('pause');assert.deepEqual(args,[proof.request_id,proof.lease_token,proof.lease_version,workerId]);return {rows:[{value:{request_id:proof.request_id,state:pauseState}}]}}throw Error('unexpected query')}});events.push('commit');return result}
  return {worker,events}
}
test('review Worker is independently default-off and performs no connection or dispatch',async()=>{
  let calls=0;const worker=new AgentAssessmentWorker({async connect(){calls++;throw Error()}},workerId,async()=>{calls++;throw Error()});assert.deepEqual(await worker.tick(),{state:'disabled'});assert.equal(calls,0)
  assert.throws(()=>new AgentAssessmentWorker({},workerId,async()=>{}, {...active,executionApproval:'old-autonomous-consent'}))
})
test('Worker commits the claim before private dispatch and sends only exact proof metadata',async()=>{
  let calls=0;const {worker,events}=isolated(async raw=>{calls++;assert.equal(events.at(-1),'commit');assert.deepEqual(raw,proof);assert.equal(Object.keys(raw).length,4);return {request_id:proof.request_id,state:'succeeded',result_sha256:'a'.repeat(64)}})
  assert.equal((await worker.tick()).state,'succeeded');assert.equal(calls,1);assert.deepEqual(events,['begin','claim','commit'])
})
test('uncertain transport pauses exact lease once, without provider outcome or retry',async()=>{
  let calls=0;const {worker,events}=isolated(async()=>{calls++;throw Error('private credential/prompt')});assert.deepEqual(await worker.tick(),{request_id:proof.request_id,state:'paused'});assert.equal(calls,1);assert.equal(events.filter(v=>v==='pause').length,1)
})
test('invalid/private reply and expiry pause; unavailable terminal metadata is conservatively unknown',async()=>{
  for(const result of [{request_id:proof.request_id,state:'succeeded',result_sha256:'a'.repeat(64),result:{private:'text'}},{request_id:workerId,state:'unknown'}]){const {worker,events}=isolated(async()=>result);assert.equal((await worker.tick()).state,'paused');assert.ok(events.includes('pause'))}
  let calls=0;const expired={...claim(),lease_expires_at:'2000-01-01T00:00:00Z'},{worker}=isolated(async()=>{calls++;throw Error()}, {},expired);assert.equal((await worker.tick()).state,'paused');assert.equal(calls,0)
  const terminal=isolated(async()=>{throw Error()}, {},claim(),'succeeded');assert.equal((await terminal.worker.tick()).state,'unknown')
})
test('empty claim is idle; concurrent ticks do not double-dispatch; bounded timeout never retries',async()=>{
  const idle=isolated(async()=>{throw Error()}, {},null);assert.deepEqual(await idle.worker.tick(),{state:'idle'})
  let release;const pending=isolated(()=>new Promise(resolve=>{release=resolve}));const first=pending.worker.tick();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(await pending.worker.tick(),{state:'busy'});release({request_id:proof.request_id,state:'unknown'});assert.equal((await first).state,'unknown')
  let calls=0;const timeout=isolated(()=>{calls++;return new Promise(()=>{})},{dispatchTimeoutMs:1});assert.equal((await timeout.worker.tick()).state,'paused');assert.equal(calls,1)
})
