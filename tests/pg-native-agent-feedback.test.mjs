import test from 'node:test'
import assert from 'node:assert/strict'
import {agentFeedbackChoice,agentFeedbackReceipt,agentFeedbackStatus} from '../src/lib/pgNativeAgentFeedback.ts'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
import {choice,run,spec,request,other,source,feedbackHash,contentHash,receiptFor,statusFor,emptyStatus} from './helpers/pg-native-feedback-fixture.mjs'
test('feedback client validates exact raw employee choices, Unicode bounds and explicit lesson opt-in without silently changing original text',()=>{
  assert.deepEqual(agentFeedbackChoice(choice),choice)
  assert.deepEqual(agentFeedbackChoice({...choice,run_id:run.toUpperCase()}),choice)
  for(const bad of [{...choice,owner_user_id:other},{...choice,comment:'x'.repeat(501)},{...choice,tags:['😀'.repeat(11)]},{...choice,tags:new Array(1)},{...choice,comment:'\ud800'},
    {...choice,comment:'\0'},{...choice,remember_lesson:'true'},{...choice,rating:'up'},{...choice,confirm:false},{...choice,expected_revision:-1},{...choice,expected_source_sha256:source.toUpperCase()},
    {...choice,tags:['\nsecret']},{...choice,tags:[' ']},{...choice,effect_approved:true}])assert.throws(()=>agentFeedbackChoice(bad))
  assert.equal(agentFeedbackChoice({...choice,comment:'  token=private  '}).comment,'  token=private  ')
  assert.equal(agentFeedbackChoice({...choice,rating:'up',remember_lesson:false}).rating,'up')
})
test('feedback receipts bind backend framing, exact original raw intent, revision and action; privacy receipts and missing storage outcomes have distinct semantics',async()=>{
  const receipt=receiptFor();assert.deepEqual(await agentFeedbackReceipt(receipt,choice),receipt)
  assert.deepEqual(await agentFeedbackReceipt({...receipt,replayed:true},choice,true),{...receipt,replayed:true})
  assert.equal((await agentFeedbackReceipt(receiptFor(choice,{decision:null}),choice)).lesson_result,null)
  for(const patch of [{run_id:other},{spec_id:other},{feedback_id:other},{revision:2},{source_sha256:'c'.repeat(64)},{statement_sha256:'d'.repeat(64)},{request_sha256:'e'.repeat(64)},{remember_lesson:false},{private_comment:'private'},{lesson_result:{...receipt.lesson_result,decision:'not_requested',content_sha256:null}}])await assert.rejects(agentFeedbackReceipt({...receipt,...patch},choice))
  await assert.rejects(agentFeedbackReceipt(receipt,choice,true))
  await assert.rejects(agentFeedbackReceipt(receipt,{...choice,comment:choice.comment.replace('Private','Different')}))
  const erase={action:'erase_feedback',request_id:other,spec_id:spec,run_id:run,expected_revision:1,expected_feedback_sha256:feedbackHash,confirm:true}
  assert.equal((await agentFeedbackReceipt(receiptFor(erase),erase)).revision,2)
  await assert.rejects(agentFeedbackReceipt({...receiptFor(erase),feedback_sha256:'f'.repeat(64)},erase))
  const forget={action:'forget_lesson',request_id:other,spec_id:spec,run_id:run,feedback_id:request,expected_content_sha256:contentHash,confirm:true}
  assert.equal((await agentFeedbackReceipt(receiptFor(forget),forget)).feedback_id,request)
  await assert.rejects(agentFeedbackReceipt(receiptFor(forget,{decision:'write_failed'}),forget))
})
test('feedback status verifies sanitized statement hashes and bounded original lesson content; stale provenance exposes metadata only',async()=>{
  const status=statusFor();assert.deepEqual(await agentFeedbackStatus(status,run),status)
  assert.deepEqual(await agentFeedbackStatus(emptyStatus(),run),emptyStatus())
  const hidden=statusFor(choice,{hidden:true});assert.equal((await agentFeedbackStatus(hidden,run)).lessons[0].fact,null)
  for(const patch of [{body:{...status.current.body,comment:'tampered'}},{body:{...status.current.body,comment:'token=private'}},{body:{...status.current.body,tags:[' private ']}},{revision:2},{statement_sha256:'f'.repeat(64)},{remember_lesson:false},{private_checkpoint:{}}])await assert.rejects(agentFeedbackStatus({...status,current:{...status.current,...patch}},run))
  await assert.rejects(agentFeedbackStatus({...hidden,lessons:[{...hidden.lessons[0],fact:'hidden private fact'}]},run))
  await assert.rejects(agentFeedbackStatus({...status,source:{...status.source,status:'running'}},run))
  await assert.rejects(agentFeedbackStatus({...status,owner_user_id:other},run))
})
test('feedback projections refuse forged current provenance, duplicate versions, tool claims and erased bodies',async()=>{
  const status=statusFor(),lesson=status.lessons[0]
  for(const patch of [{feedback_id:other},{revision:2},{source_sha256:'c'.repeat(64)},{feedback_sha256:'d'.repeat(64)},{content_sha256:'e'.repeat(64)},{tools_used:'claimed.tool'},{fact:'invented success'},{private_result:'hidden'}])await assert.rejects(agentFeedbackStatus({...status,lessons:[{...lesson,...patch}]},run))
  await assert.rejects(agentFeedbackStatus({...status,source:null},run))
  await assert.rejects(agentFeedbackStatus({...status,lessons:[lesson,lesson]},run))
  await assert.rejects(agentFeedbackStatus({...status,state:'erased'},run))
  await assert.rejects(agentFeedbackStatus({...status,state:'unconfirmed'},run))
  const erased={...emptyStatus(),state:'erased',revision:2,source:null};assert.deepEqual(await agentFeedbackStatus(erased,run),erased)
  const unconfirmed={...status,lessons:[],state:'unconfirmed',current:{...status.current,body:null,lesson_result:null}};assert.deepEqual(await agentFeedbackStatus(unconfirmed,run),unconfirmed)
})
test('feedback SDK uses fixed Native Cookie paths, preserves exact POST body and confirms a lost original without model or retry calls',async()=>{
  const calls=[];let value=statusFor(),lose=false
  const api=createPgNativePilotApi(async(path,options)=>{calls.push({path,options});if(lose){lose=false;throw Error('synthetic lost feedback reply')}return new Response(JSON.stringify(value),{status:200})},'')
  assert.equal((await api.getAgentFeedback(run)).state,'active');assert.equal(calls[0].path,'/api/v2/agent-feedback/'+run)
  value=receiptFor();assert.equal((await api.changeAgentFeedback(choice)).recorded,true)
  const posted=calls[1];assert.deepEqual(JSON.parse(posted.options.body),choice);assert.equal(posted.options.credentials,'same-origin');assert.equal(posted.options.headers['X-AgentStudio-Request'],'1');assert.equal(posted.options.headers.Authorization,undefined);assert.equal(posted.options.headers['X-Rh-User-Id'],undefined)
  lose=true;await assert.rejects(api.changeAgentFeedback(choice),e=>e.status===0);assert.equal(calls.length,3)
  value=receiptFor(choice,{replayed:true});assert.equal((await api.confirmAgentFeedback(choice)).replayed,true);assert.equal(calls.at(-1).path,'/api/v2/agent-feedback/'+run+'/confirm')
  const count=calls.length;await assert.rejects(api.changeAgentFeedback({...choice,owner_user_id:other}),e=>e.status===400);await assert.rejects(api.getAgentFeedback(run+'?admin=true'),e=>e.status===400);assert.equal(calls.length,count)
  value=receiptFor();await assert.rejects(api.confirmAgentFeedback(choice),e=>e.status===503)
})
test('feedback capability flags require available schema and independent submission before lesson storage, without execution prerequisites',async()=>{
  const baseline={mode:'native_pg18',config_writes_enabled:true,run_execution_enabled:false,model_probe_enabled:false};let value=baseline
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify(value),{status:200}),'')
  assert.equal((await api.getConfigCapabilities()).agent_feedback_submission_enabled,undefined)
  for(const patch of [{agent_feedback_submission_enabled:true},{agent_feedback_lesson_storage_enabled:true},{agent_feedback_available:'true'}, {agent_feedback_available:true,agent_feedback_submission_enabled:'true'}, {agent_feedback_available:true,agent_feedback_submission_enabled:true,agent_feedback_lesson_storage_enabled:'true'}, {config_writes_enabled:false,agent_feedback_available:true,agent_feedback_submission_enabled:true}]){value={...baseline,...patch};await assert.rejects(api.getConfigCapabilities(),e=>e.status===503)}
  value={...baseline,agent_feedback_available:true,agent_feedback_submission_enabled:true,agent_feedback_lesson_storage_enabled:true};assert.equal((await api.getConfigCapabilities()).agent_feedback_lesson_storage_enabled,true)
  assert.equal((await api.getConfigCapabilities()).autonomous_agent_submission_enabled,undefined)
})
test('feedback opt-out, positive statements and failed or unconfirmed lesson outcomes never invent stored content or trigger extraction',async()=>{
  for(const [raw,decision] of [[{...choice,remember_lesson:false},'not_requested'],[{...choice,rating:'up',remember_lesson:false},'not_requested'],[choice,'write_failed'],[choice,null]]){
    let calls=0;const api=createPgNativePilotApi(async()=>{calls++;return new Response(JSON.stringify(receiptFor(raw,{decision})),{status:200})},'')
    const receipt=await api.changeAgentFeedback(raw);assert.equal(receipt.lesson_result?.decision??null,decision);assert.equal(calls,1)
    assert.doesNotMatch(JSON.stringify(receipt),/syntheticFixturePrivate/)
  }
})
