import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {agentReviewTarget,agentReviewChoice,agentReviewSubmission,agentReviewIntentHash,agentReviewControl,agentReviewSource,agentReviewPreview,agentReviewReceipt,agentReviewControlReceipt,agentReviewResult,agentReviewOutputHash,agentReviewView,agentReviewChoiceFromSelection,agentReviewFeeAcknowledgements,agentReviewScoreDimensions} from '../src/lib/pgNativeAgentReview.ts'
import {createPgNativePilotApi,PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'

const id=n=>`${n.repeat(8)}-${n.repeat(4)}-${n.repeat(4)}-${n.repeat(4)}-${n.repeat(12)}`
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v
const sha=v=>createHash('sha256').update(JSON.stringify(ordered(v))).digest('hex')
const at='2026-10-27T01:02:03.000Z',target={purpose:'evaluate',spec_id:id('1'),run_id:id('2')}
const model={connection_id:id('3'),connection_revision:3,model_id:'synthetic'}
const selection={model_binding:model,output_token_limit:2048,feedback_sources:[]}
const sourceFor=(t=target)=>({protocol:'agent_review_source_v1',...t,expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),source_protocol:t.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',recorded:false})
const choiceFor=(p='evaluate')=>({action:'preview',...target,purpose:p,expected_source_sha256:'a'.repeat(64),expected_spec_revision:2,expected_spec_sha256:'b'.repeat(64),...selection,feedback_sources:p==='evaluate'?[]:[{run_id:id('2'),feedback_id:id('5'),feedback_sha256:'f'.repeat(64)}],evaluation_sources:[]})
const submitFor=(p='evaluate')=>({...choiceFor(p),action:'submit',request_id:id('4'),expected_input_sha256:'c'.repeat(64),confirm:true,fee_acknowledgement:agentReviewFeeAcknowledgements[p]})
const previewFor=c=>({protocol:'agent_paid_review_preview_v1',choice:c,input_sha256:'c'.repeat(64),content_sha256:'d'.repeat(64),owner_epoch:4,source_protocol:c.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',byte_length:1024,output_token_limit:c.output_token_limit,recorded:false})
const receiptFor=(s=submitFor(),patch={})=>({protocol:'agent_paid_review_receipt_v1',request_id:s.request_id,spec_id:s.spec_id,run_id:s.run_id,purpose:s.purpose,request_sha256:sha({protocol:'agent_paid_review_intent_v1',...s}),input_sha256:s.expected_input_sha256,content_sha256:'d'.repeat(64),owner_epoch:4,source_protocol:s.purpose==='evaluate'?'current_task_delivery_v1':'employee_statement_anchor_v1',created_at:at,state:'pending',body_erased:false,recorded:true,replayed:false,...patch})
const resultFor=(p='evaluate')=>p==='evaluate'?{score:0,dimensions:agentReviewScoreDimensions.map(name=>({name,score:0,comment:'待核对'})),suggestions:[]}:{descriptive:{goal:'目'.repeat(3000),task_scope:'围'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),task_plan:Array(30).fill('计'.repeat(500)),done_criteria:Array(30).fill('验'.repeat(500))},tools_note:'另行判断',rationale:'待本人接受的描述建议'}
function viewFor(p='evaluate'){
  const {protocol:_p,state,body_erased,recorded:_r,replayed:_re,...request}=receiptFor(submitFor(p)),result=resultFor(p)
  return {protocol:'agent_paid_review_view_v1',request,execution:{job_state:state,lease_state:'succeeded',outcome:{status:'succeeded',completion_sha256:'e'.repeat(64),result_sha256:sha({protocol:'agent_paid_review_output_v1',request_id:request.request_id,purpose:p,input_sha256:request.input_sha256,result}),failure_code:null,created_at:at}},body_erased,available:true,result}
}
const invalid=fn=>assert.throws(fn,/invalid_agent_review_projection/),rejected=fn=>assert.rejects(fn,/invalid_agent_review_projection/)

test('browser intent and result hashes match independent canonical protocol vectors, including Chinese and zero',async()=>{
  for(const p of ['evaluate','optimize']){
    const s=submitFor(p),v=viewFor(p)
    assert.equal(await agentReviewIntentHash(s),receiptFor(s).request_sha256)
    assert.equal(await agentReviewOutputHash(s.request_id,p,s.expected_input_sha256,v.result),v.execution.outcome.result_sha256)
    assert.deepEqual(await agentReviewView(v,s.request_id),v)
  }
  assert.equal((await agentReviewView(viewFor(),id('4'))).result.score,0)
  const module=readFileSync(new URL('../src/lib/pgNativeAgentReview.ts',import.meta.url),'utf8')
  assert.doesNotMatch(module,/from\s+["'](?:node:|.*services\/)|require\(/)
})
test('source and safe preview match exact caller choices without publishing private material or unsupported parents',()=>{
  assert.deepEqual(agentReviewSource(sourceFor(),target),sourceFor())
  const c=choiceFor();assert.deepEqual(agentReviewChoiceFromSelection(sourceFor(),selection),c);assert.deepEqual(agentReviewPreview(previewFor(c),c),previewFor(c))
  for(const patch of [{messages:[]},{owner_user_id:id('6')},{recorded:true},{byte_length:0},{byte_length:262145},{output_token_limit:4096},{source_protocol:'employee_statement_anchor_v1'},{owner_epoch:'4'},{choice:{...c,model_binding:{...model,connection_revision:4}}}])invalid(()=>agentReviewPreview({...previewFor(c),...patch},c))
  invalid(()=>agentReviewSource({...sourceFor(),run_id:id('7')},target))
  invalid(()=>agentReviewChoiceFromSelection(sourceFor(),{...selection,evaluation_sources:[]}))
})
test('requests reject fake owner/proofs, wrong consent, sparse arrays and unsupported prior selection intact',()=>{
  const s=submitFor(),c=choiceFor('optimize'),parents=[{run_id:id('6'),review_id:id('7'),result_sha256:'a'.repeat(64)}]
  for(const patch of [{confirm:false},{fee_acknowledgement:agentReviewFeeAcknowledgements.optimize},{request_sha256:'f'.repeat(64)},{owner_id:id('6')},{lease_token:id('6')},{model_binding:{...model,api_key:'synthetic'}},{evaluation_sources:parents}])invalid(()=>agentReviewSubmission({...s,...patch}))
  invalid(()=>agentReviewChoice({...c,evaluation_sources:parents}));assert.equal(parents.length,1)
  invalid(()=>agentReviewChoice({...c,feedback_sources:[]}));invalid(()=>agentReviewChoice({...choiceFor(),feedback_sources:c.feedback_sources}))
  invalid(()=>agentReviewChoice({...c,feedback_sources:[c.feedback_sources[0],c.feedback_sources[0]]}))
  invalid(()=>agentReviewChoice({...c,feedback_sources:Array(1)}))
  assert.equal(agentReviewTarget({...target,spec_id:id('a').toUpperCase()}).spec_id,id('a'))
})
test('closed nested records reject getters, symbols, foreign prototypes and coercion before executing them',()=>{
  const c=choiceFor()
  for(const base of [c,c.model_binding])for(const key of Object.keys(base)){
    let calls=0;const v={...base};Object.defineProperty(v,key,{enumerable:true,get(){calls++;throw Error('getter')}})
    invalid(()=>agentReviewChoice(base===c?v:{...c,model_binding:v}));assert.equal(calls,0)
  }
  let coercions=0;invalid(()=>agentReviewChoice({...c,output_token_limit:{valueOf(){coercions++;return 2048}}}));assert.equal(coercions,0)
  for(const raw of [{...c,[Symbol('proof')]:1},Object.assign(Object.create({}),c)])invalid(()=>agentReviewChoice(raw))
  const refs=[];refs[Symbol('hidden')]=true;invalid(()=>agentReviewChoice({...c,feedback_sources:refs}))
})
test('receipt/control matching verifies exact original digests, privacy flags and readonly replay',async()=>{
  const s=submitFor(),r=receiptFor(s);assert.deepEqual(await agentReviewReceipt(r,s),r)
  for(const patch of [{request_id:id('8')},{purpose:'optimize'},{run_id:id('8')},{input_sha256:'f'.repeat(64)},{request_sha256:'f'.repeat(64)},{body_erased:true},{recorded:'true'},{replayed:1},{messages:[]}])await rejected(()=>agentReviewReceipt({...r,...patch},s))
  await rejected(()=>agentReviewReceipt(r,s,true));assert.equal((await agentReviewReceipt({...r,replayed:true,state:'erased',body_erased:true},s,true)).state,'erased')
  const c=agentReviewControl({action:'erase',request_id:id('7'),review_id:s.request_id,expected_request_sha256:r.request_sha256,confirm:true}),cr={protocol:'agent_paid_review_control_receipt_v1',request_id:c.request_id,review_id:c.review_id,action:c.action,request_sha256:sha({protocol:'agent_paid_review_control_v1',...c}),created_at:at,recorded:true,replayed:true}
  assert.deepEqual(await agentReviewControlReceipt(cr,c,true),cr)
  for(const patch of [{action:'cancel'},{review_id:id('6')},{request_sha256:'f'.repeat(64)},{replayed:false},{owner_user_id:id('6')}])await rejected(()=>agentReviewControlReceipt({...cr,...patch},c,true))
  invalid(()=>agentReviewControl({...c,request_id:c.review_id}));invalid(()=>agentReviewControl({...c,confirm:'true'}))
})
test('current views preserve historical success after controls and fail/unknown truth without fee assertions',async()=>{
  for(const state of ['pending','cancelled','erased']){
    const v=viewFor();v.execution.job_state=state;v.body_erased=state==='erased';v.available=false;v.result=null
    const parsed=await agentReviewView(v,id('4'));assert.equal(parsed.execution.outcome.status,'succeeded');assert.equal(parsed.result,null)
  }
  for(const lease of [null,'claimed','reserved','paused','failed','unknown']){
    const v=viewFor();v.available=false;v.result=null;v.execution.lease_state=lease;v.execution.outcome=['failed','unknown'].includes(lease)?{status:lease,completion_sha256:'e'.repeat(64),result_sha256:null,failure_code:'provider_outcome_unknown',created_at:at}:null
    assert.deepEqual(await agentReviewView(v,id('4')),v)
  }
})
test('body digest swaps, contradictory execution, private authority and malformed normalized outputs are refused',async()=>{
  const v=viewFor()
  for(const patch of [{available:false},{result:{...v.result,score:1}},{body_erased:true},{choice:choiceFor()},{request:{...v.request,owner_id:id('6')}},{execution:{...v.execution,lease_state:'paused'}},{result:{...v.result,suggestions:[' trim ']}}])await rejected(()=>agentReviewView({...v,...patch},id('4')))
  await rejected(()=>agentReviewView(v,id('6')))
  for(const bad of [{...v.result,score:'0'},{...v.result,suggestions:['api_key=syntheticPrivateValue']},{...v.result,dimensions:v.result.dimensions.map((d,i)=>i?d:{...d,name:'别名'})}])invalid(()=>agentReviewResult('evaluate',bad))
  const out=resultFor('optimize');for(const extra of [{tools:['calculate']},{model_binding:model},{require_approval:false},{knowledge_base_ids:[id('7')]}])invalid(()=>agentReviewResult('optimize',{...out,descriptive:{...out.descriptive,...extra}}))
  assert.deepEqual(agentReviewResult('optimize',out),out)
})
test('projections detach immutable nested data and reject invalid dates without normalizing corrupt calendar values',async()=>{
  const v=viewFor(),parsed=await agentReviewView(v,id('4'));v.result.dimensions[0].comment='changed';assert.equal(parsed.result.dimensions[0].comment,'待核对')
  const s=submitFor();Object.freeze(s.model_binding);Object.freeze(s);assert.notEqual(agentReviewSubmission(s).model_binding,s.model_binding)
  for(const created_at of ['2026-02-30T01:00:00Z','2026-10-27T24:00:00Z','tomorrow'])await rejected(()=>agentReviewReceipt({...receiptFor(),created_at},s))
})
test('seven API methods use fixed Cookie transport and raw exact response routes, with no mutation retry',async()=>{
  const calls=[],s=submitFor(),c={action:'cancel',request_id:id('7'),review_id:id('4'),expected_request_sha256:receiptFor().request_sha256,confirm:true}
  const controlReceipt=body=>({protocol:'agent_paid_review_control_receipt_v1',request_id:body.request_id,review_id:body.review_id,action:body.action,request_sha256:sha({protocol:'agent_paid_review_control_v1',...body}),created_at:at,recorded:true,replayed:true})
  const api=createPgNativePilotApi(async(url,opts)=>{calls.push([url,opts]);const body=opts.body?JSON.parse(opts.body):null;const data=url.endsWith('/source')?sourceFor():url.endsWith('/preview')?previewFor(body):url.endsWith('/submit')||url.endsWith('/confirm')?receiptFor(body,{replayed:url.endsWith('/confirm')}):url.endsWith('/control')||url.endsWith('/control-confirm')?controlReceipt(body):viewFor();return new Response(JSON.stringify(data),{status:200})})
  await api.getAgentReviewSource(target);await api.previewAgentReview(choiceFor());await api.submitAgentReview(s);await api.confirmAgentReview(s);await api.changeAgentReviewControl(c);await api.confirmAgentReviewControl(c);await api.getAgentReview(id('4'))
  assert.deepEqual(calls.map(v=>v[0]),['source','preview','submit','confirm',id('4')+'/control',id('4')+'/control-confirm',id('4')].map(v=>'/__pg_native/api/v2/agent-reviews/'+v))
  for(const [,o] of calls){assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');assert.equal(o.headers.Authorization,undefined);assert.equal(o.headers['X-Rh-User-Id'],undefined);assert.equal(o.headers['X-AgentStudio-Request'],o.method==='GET'?undefined:'1')}
  assert.deepEqual(JSON.parse(calls[2][1].body),s);assert.equal(calls.at(-1)[1].body,undefined)
  let count=0;const broken=createPgNativePilotApi(async()=>{count++;throw Error('lost')});await assert.rejects(()=>broken.submitAgentReview(s),e=>e instanceof PgNativePilotError&&e.status===0);assert.equal(count,1)
})
test('SDK validates before transport and treats wrong/wrapped/malformed success as unconfirmed',async()=>{
  let count=0;const api=createPgNativePilotApi(async()=>{count++;return new Response(JSON.stringify({item:receiptFor()}),{status:200})})
  await assert.rejects(()=>api.submitAgentReview({...submitFor(),owner_id:id('6')}),e=>e.status===400);assert.equal(count,0)
  await assert.rejects(()=>api.submitAgentReview(submitFor()),e=>e.status===503);assert.equal(count,1)
  await assert.rejects(()=>api.getAgentReview('bad?owner=someone'),e=>e.status===400);assert.equal(count,1)
  const wrong=createPgNativePilotApi(async()=>new Response(JSON.stringify({...receiptFor(),request_sha256:'f'.repeat(64)}),{status:200}))
  await assert.rejects(()=>wrong.submitAgentReview(submitFor()),e=>e.status===503)
})
test('review capability admission requires real availability and configuration writes without inferring execution',async()=>{
  const base={mode:'native_pg18',config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false}
  for(const patch of [{agent_review_available:'true'},{agent_review_submission_enabled:1},{agent_review_submission_enabled:true},{agent_review_available:true,agent_review_submission_enabled:true}]){
    const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({...base,...patch})));await assert.rejects(()=>api.getConfigCapabilities(),e=>e.status===503)
  }
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({...base,agent_review_available:true,agent_review_submission_enabled:false})))
  assert.equal((await api.getConfigCapabilities()).agent_review_submission_enabled,false)
})
test('async WebCrypto verification snapshots receipt primitives before caller mutation',async()=>{
  const s=submitFor(),raw=receiptFor(s),work=agentReviewReceipt(raw,s)
  raw.replayed='corrupt';raw.body_erased=true;raw.request_sha256='f'.repeat(64)
  const parsed=await work;assert.equal(parsed.replayed,false);assert.equal(parsed.body_erased,false);assert.equal(parsed.request_sha256,receiptFor(s).request_sha256)
  const c={action:'erase',request_id:id('7'),review_id:id('4'),expected_request_sha256:receiptFor().request_sha256,confirm:true},r={protocol:'agent_paid_review_control_receipt_v1',request_id:c.request_id,review_id:c.review_id,action:c.action,request_sha256:sha({protocol:'agent_paid_review_control_v1',...c}),created_at:at,recorded:true,replayed:true},verifying=agentReviewControlReceipt(r,c,true)
  r.request_sha256='f'.repeat(64);r.created_at='broken';r.replayed='corrupt';const result=await verifying;assert.equal(result.replayed,true);assert.equal(result.created_at,at);assert.notEqual(result.request_sha256,r.request_sha256)
})
