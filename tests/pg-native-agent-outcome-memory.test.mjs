import test from 'node:test'
import assert from 'node:assert/strict'
import {agentOutcomeConsent,agentOutcomeStop,agentOutcomeStopReceipt,agentOutcomeStatus} from '../src/lib/pgNativeAgentOutcomeMemory.ts'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
const run='22222222-2222-4222-8222-222222222222',spec='11111111-1111-4111-8111-111111111111',request='33333333-3333-4333-8333-333333333333',memory='44444444-4444-8444-8444-444444444444',hash='a'.repeat(64)
const consent={enabled:true,protocol:'agent_memory_outcome_v1',run_id:run,spec_id:spec,spec_revision:2,intent_sha256:hash,memory_id:memory}
const choice={request_id:request,run_id:run,expected_intent_sha256:hash,confirm:true}
const receipt={run_id:run,request_id:request,intent_sha256:hash,recorded:true,stopped:true,replayed:false}
const pending={...consent,stopped:false,state:'pending',result:null}
const result={run_id:run,memory_id:memory,intent_sha256:hash,decision:'stored',reason_code:'terminal_source_stored',source_sha256:'b'.repeat(64),created_at:'2026-10-27T00:00:00.000Z',recorded:true,replayed:true}

test('outcome projections bind exact owned run/role/consent and expose metadata only',()=>{
  assert.deepEqual(agentOutcomeConsent(consent,run,spec,2),consent)
  assert.deepEqual(agentOutcomeStatus(pending,run),pending)
  assert.deepEqual(agentOutcomeStatus({run_id:run,enabled:false},run),{run_id:run,enabled:false})
  assert.deepEqual(agentOutcomeStatus({...pending,state:'finished',result},run).result,result)
  for(const raw of [{...consent,owner_epoch:1},{...consent,spec_id:request},{...consent,intent_sha256:'A'.repeat(64)},{...consent,spec_revision:3},{...consent,protocol:'agent_memory_context_v1'}])assert.throws(()=>agentOutcomeConsent(raw,run,spec,2))
  for(const raw of [{...pending,fact:'private'},{...pending,state:'finished'}, {...pending,result},{...pending,run_id:request},{...pending,stopped:'true'},
    {...pending,state:'finished',result:{...result,source_sha256:null}},{...pending,state:'finished',result:{...result,decision:'revoked',source_sha256:null}},
    {...pending,state:'finished',result:{...result,decision:'write_failed'}},{...pending,state:'finished',result:{...result,intent_sha256:'b'.repeat(64)}}])assert.throws(()=>agentOutcomeStatus(raw,run))
})

test('privacy stop requests and lost-response confirmation require the exact frozen original body',()=>{
  assert.deepEqual(agentOutcomeStop(choice),choice);assert.deepEqual(agentOutcomeStopReceipt(receipt,choice),receipt)
  assert.deepEqual(agentOutcomeStopReceipt({...receipt,replayed:true},choice,true),{...receipt,replayed:true})
  for(const raw of [{...choice,owner_user_id:spec},{...choice,confirm:false},{...choice,expected_intent_sha256:'x'},{...choice,model_approved:true}])assert.throws(()=>agentOutcomeStop(raw))
  for(const raw of [{...receipt,run_id:request},{...receipt,intent_sha256:'b'.repeat(64)},{...receipt,stopped:false},{...receipt,private_text:'hidden'}])assert.throws(()=>agentOutcomeStopReceipt(raw,choice))
  assert.throws(()=>agentOutcomeStopReceipt(receipt,choice,true))
})

test('outcome SDK uses Native Cookie paths and recovers original stops; malformed receipts and extra fields refuse',async()=>{
  const calls=[];let value=pending,lose=false
  const api=createPgNativePilotApi(async(path,options)=>{calls.push({path,options});if(lose){lose=false;throw Error('synthetic lost stop response')}return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}})},'')
  assert.deepEqual(await api.getAgentOutcomeMemory(run),pending)
  value=receipt;assert.deepEqual(await api.stopAgentOutcomeMemory(choice),receipt)
  const first=calls[1];assert.equal(first.path,'/api/v2/agent-outcome-memories/'+run+'/stop');assert.deepEqual(JSON.parse(first.options.body),choice);assert.equal(first.options.credentials,'same-origin');assert.equal(first.options.headers['X-AgentStudio-Request'],'1');assert.equal(first.options.headers.Authorization,undefined)
  lose=true;await assert.rejects(api.stopAgentOutcomeMemory(choice),e=>e.status===0)
  value={...receipt,replayed:true};assert.equal((await api.confirmAgentOutcomeStop(choice)).replayed,true);assert.equal(calls.at(-1).path,'/api/v2/agent-outcome-memories/'+run+'/stop-confirm')
  const count=calls.length;await assert.rejects(api.stopAgentOutcomeMemory({...choice,owner_user_id:spec}),e=>e.status===400);assert.equal(calls.length,count)
  value={...receipt,replayed:false};await assert.rejects(api.confirmAgentOutcomeStop(choice),e=>e.status===503)
})

test('optional outcome admission flags cannot be invented by capabilities or mismatched success projections',async()=>{
  let response={mode:'native_pg18',config_writes_enabled:true,run_execution_enabled:false,model_probe_enabled:false,agent_outcome_memory_admission_enabled:true}
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}}),'')
  await assert.rejects(api.getConfigCapabilities(),e=>e.status===503)
  response={...response,agent_outcome_memory_available:true,autonomous_agent_submission_enabled:true,agent_derived_memory_available:true,agent_derived_memory_writes_enabled:true}
  assert.equal((await api.getConfigCapabilities()).agent_outcome_memory_admission_enabled,true)
  response={...response,agent_outcome_memory_admission_enabled:'true'};await assert.rejects(api.getConfigCapabilities(),e=>e.status===503)
})


test('submit SDK binds an explicit storage choice to returned original consent and leaves legacy request bodies unchanged',async()=>{
  const calls=[];let response={run:{id:run,status:'queued'},pending_effect:null,outcome_memory:consent}
  const api=createPgNativePilotApi(async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return new Response(JSON.stringify(response),{status:201,headers:{'content-type':'application/json'}})},'')
  assert.equal((await api.submitAutonomousAgentRun(spec,2,'Synthetic task','synthetic-outcome-choice',1,false,true)).outcome_memory.intent_sha256,hash)
  assert.equal(calls[0].body.remember_outcome,true)
  response={...response,outcome_memory:{...consent,spec_id:request}}
  await assert.rejects(api.submitAutonomousAgentRun(spec,2,'Synthetic task','synthetic-outcome-choice',1,false,true),e=>e.status===503)
  response={run:{id:run,status:'queued'},pending_effect:null}
  await assert.rejects(api.submitAutonomousAgentRun(spec,2,'Synthetic task','synthetic-outcome-choice',1,false,true),e=>e.status===503)
  await api.submitAutonomousAgentRun(spec,2,'Synthetic task','synthetic-old-choice',1)
  assert.equal(Object.hasOwn(calls.at(-1).body,'remember_outcome'),false)
  const count=calls.length;await assert.rejects(api.submitAutonomousAgentRun(spec,2,'Synthetic task','synthetic-outcome-choice',1,false,'true'),e=>e.status===400);assert.equal(calls.length,count)
})
