// Synthetic wire DTOs + injected fetch only. No SQL, provider or real server.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
import * as contract from '../services/pg-api/src/agent-descriptive-patch-contract.ts'
import {safeAgentSpec} from '../services/pg-api/src/contracts.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),h=c=>c.repeat(64),copy=v=>structuredClone(v)
function wire(reviewId=id(1)){
 const role=safeAgentSpec({goal:'原目标',task_scope:'保留范围',deliverables:['原交付'],task_plan:['原计划'],done_criteria:['原验收'],tools:[],knowledge_base_ids:[]})
 const derived=contract.deriveAgentDescriptivePatchCandidate('Synthetic role',role,{descriptive:{goal:'新目标',deliverables:[]},tools_note:'',rationale:'Synthetic wire'})
 const feedback_sources=[{run_id:id(20),feedback_id:id(30),feedback_sha256:h('a'),feedback_revision:2,feedback_source_sha256:h('b'),statement_sha256:h('c')}]
 const pick=spec=>Object.fromEntries(contract.agentDescriptivePatchKeys.map(k=>[k,copy(spec[k])]))
 const binding={source_kind:'feedback_generated_descriptive_patch',mode:'provided_fields',source:{purpose:'optimize',review_id:reviewId,spec_id:id(2),target_run_id:id(10),review_request_sha256:h('1'),input_sha256:h('2'),content_sha256:h('3'),result_sha256:h('4'),completion_sha256:h('5'),source_owner_epoch:5,source_protocol:'employee_statement_anchor_v1'},feedback_sources,feedback_sources_sha256:contract.agentDescriptivePatchFeedbackHash(feedback_sources),anchor:{run_id:id(20),feedback_id:id(30)},before:{revision:41,source_sha256:h('6'),descriptive:pick(role)},model_patch:derived.model_patch,candidate:{descriptive:pick(derived.spec),candidate_sha256:derived.candidate_sha256},changed_keys:derived.changed_keys}
 const preview=contract.parseAgentDescriptivePatchPreview({protocol:'agent_descriptive_patch_preview_v1',...binding,preview_sha256:contract.agentDescriptivePatchPreviewHash(binding),recorded:false})
 const input={action:'preview',review_id:reviewId,spec_id:id(2),target_run_id:id(10)}
 const original=contract.parseAgentDescriptivePatchAcceptance({action:'accept',request_id:id(99),review_id:reviewId,spec_id:id(2),target_run_id:id(10),anchor_run_id:id(20),anchor_feedback_id:id(30),expected_preview_sha256:preview.preview_sha256,expected_result_sha256:preview.source.result_sha256,expected_patch_sha256:preview.model_patch.patch_sha256,expected_spec_revision:41,expected_spec_sha256:h('6'),expected_candidate_sha256:preview.candidate.candidate_sha256,confirm:true,acceptance_acknowledgement:contract.agentDescriptivePatchAcknowledgement})
 const core={protocol:'agent_descriptive_patch_receipt_v1',source_kind:binding.source_kind,mode:binding.mode,request_id:original.request_id,request_sha256:contract.agentDescriptivePatchRequestHash(original),source:binding.source,feedback_sources,feedback_sources_sha256:binding.feedback_sources_sha256,anchor:binding.anchor,before:{revision:41,source_sha256:h('6'),revision_id:id(90)},after:{revision:42,source_sha256:h('7'),revision_id:id(91)},provided_keys:binding.model_patch.provided_keys,patch_sha256:binding.model_patch.patch_sha256,candidate_sha256:binding.candidate.candidate_sha256,changed_keys:binding.changed_keys,preview_sha256:preview.preview_sha256,acceptance_owner_epoch:5,created_at:'2026-10-28T01:02:03.123Z'}
 const receipt={...core,receipt_sha256:contract.agentDescriptivePatchReceiptHash(core),recorded:true,replayed:false}
 return {preview,input,original,receipt}
}
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
const status=expected=>error=>error.status===expected
const base='/api/v2/agent-descriptive-patches'

test('all four SDK methods use Native same-origin Cookie transport and the exact15 original',async()=>{
 const f=wire(),calls=[],api=createPgNativePilotApi(async(url,options)=>{
  calls.push({url,options});return reply(url.endsWith('/preview')?f.preview:{...f.receipt,replayed:!url.endsWith('/accept')})
 })
 assert.deepEqual(await api.previewAgentDescriptivePatch(f.input),f.preview)
 assert.deepEqual(await api.acceptAgentDescriptivePatch(f.original),f.receipt)
 assert.equal((await api.confirmAgentDescriptivePatch(f.original)).replayed,true)
 assert.equal((await api.getAgentDescriptivePatch(id(1))).replayed,true)
 assert.deepEqual(calls.map(c=>[c.url,c.options.method]),[['/__pg_native'+base+'/preview','POST'],['/__pg_native'+base+'/accept','POST'],['/__pg_native'+base+'/confirm','POST'],['/__pg_native'+base+'/reviews/'+id(1),'GET']])
 for(const c of calls){const headers=new Headers(c.options.headers);assert.equal(c.options.credentials,'same-origin');assert.equal(c.options.cache,'no-store');assert.equal(headers.get('authorization'),null);assert.equal(headers.get('cookie'),null)}
 assert.equal(calls[1].options.body,JSON.stringify(f.original));assert.equal(calls[2].options.body,calls[1].options.body)
 assert.equal(Object.keys(JSON.parse(calls[1].options.body)).length,15);assert.equal(JSON.parse(calls[2].options.body).action,'accept')
 assert.equal(new Headers(calls[1].options.headers).get('x-agentstudio-request'),'1')
})

test('invalid inputs never dispatch, including owner/selection/old-family acknowledgement and alias IDs',async()=>{
 const f=wire();let calls=0;const api=createPgNativePilotApi(async()=>{calls++;return reply(f.receipt)})
 for(const change of [{owner_user_id:id(7)},{selected_keys:['goal']},{human_patch:{goal:'x'}},{expected_patch_sha256:undefined},{acceptance_acknowledgement:'APPROVE_EXACT_GENERATED_DESCRIPTIVE_ROLE_CHANGE_V1'},{confirm:false}])
  await assert.rejects(api.acceptAgentDescriptivePatch({...f.original,...change}),status(400))
 await assert.rejects(api.previewAgentDescriptivePatch({...f.input,identity:'forged'}),status(400))
 await assert.rejects(api.getAgentDescriptivePatch('../other'),status(400))
 await assert.rejects(api.getAgentDescriptivePatch('ABCDEF00-0000-4000-8000-000000000001'),status(400));assert.equal(calls,0)
})

test('malformed fulfilled success and wrong original/known review become uncertain503 without automatic retry',async()=>{
 const f=wire(),other=wire(id(77));let calls=0,value
 const api=createPgNativePilotApi(async()=>{calls++;return reply(value)})
 value={...f.receipt,recorded:false};await assert.rejects(api.acceptAgentDescriptivePatch(f.original),status(503))
 value=f.receipt;await assert.rejects(api.confirmAgentDescriptivePatch(f.original),status(503))
 value={...other.receipt,replayed:true};await assert.rejects(api.getAgentDescriptivePatch(id(1)),status(503))
 value=other.preview;await assert.rejects(api.previewAgentDescriptivePatch(f.input),status(503))
 assert.equal(calls,4)
})

test('server errors preserve status/code without exposing private SQL details or inventing success',async()=>{
 const f=wire();let code=409
 const api=createPgNativePilotApi(async()=>reply({error:code===409?'agent_descriptive_patch_source_unavailable':'internal_error',detail:'synthetic private SQL',identity:'private'},code))
 await assert.rejects(api.acceptAgentDescriptivePatch(f.original),e=>e.status===409&&e.message==='agent_descriptive_patch_source_unavailable'&&!Object.hasOwn(e,'detail'))
 code=500;await assert.rejects(api.acceptAgentDescriptivePatch(f.original),e=>e.status===500&&e.message==='internal_error'&&!Object.hasOwn(e,'identity'))
})

test('capabilities keep read availability separate from fresh configuration permission',async()=>{
 const minimal={mode:'native_pg18',config_writes_enabled:false,run_execution_enabled:false,model_probe_enabled:false};let value=minimal
 const api=createPgNativePilotApi(async()=>reply(value))
 const absent=await api.getConfigCapabilities();assert.notEqual(absent.agent_descriptive_patch_available,true);assert.notEqual(absent.agent_descriptive_patch_enabled,true)
 value={...minimal,agent_descriptive_patch_available:true,agent_descriptive_patch_enabled:false};assert.equal((await api.getConfigCapabilities()).agent_descriptive_patch_available,true)
 value={...minimal,config_writes_enabled:true,agent_descriptive_patch_available:true,agent_descriptive_patch_enabled:true};assert.equal((await api.getConfigCapabilities()).agent_descriptive_patch_enabled,true)
 for(const change of [{agent_descriptive_patch_available:'true'},{agent_descriptive_patch_enabled:'true'},{agent_descriptive_patch_available:false,agent_descriptive_patch_enabled:true},{config_writes_enabled:false,agent_descriptive_patch_enabled:true}]){
  value={...minimal,config_writes_enabled:true,agent_descriptive_patch_available:true,agent_descriptive_patch_enabled:false,...change};await assert.rejects(api.getConfigCapabilities(),status(503))
 }
})

test('mutable caller originals are copied before fetch and remain bound during a delayed response',async()=>{
 const f=wire(),mutable=copy(f.original);let finish,body
 const api=createPgNativePilotApi(async(_url,options)=>{body=options.body;return new Promise(resolve=>{finish=resolve})})
 const pending=api.acceptAgentDescriptivePatch(mutable);mutable.expected_patch_sha256=h('0');mutable.request_id=id(88)
 finish(reply(f.receipt));assert.deepEqual(await pending,f.receipt);assert.equal(body,JSON.stringify(f.original))
})
