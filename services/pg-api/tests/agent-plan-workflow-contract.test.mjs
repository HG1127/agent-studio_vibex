// Pure comparison values only; no source/fee/save/Worker/DB authority is minted.
import test from 'node:test'
import assert from 'node:assert/strict'
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowFeeAcknowledgement as fee,agentPlanWorkflowSaveAcknowledgement as save,parseAgentPlanWorkflowSource,parseAgentPlanWorkflowChoice,parseAgentPlanWorkflowSubmission,parseAgentPlanWorkflowSaveIntent,agentPlanWorkflowPaidIntentValue,agentPlanWorkflowSaveIntentValue,canonicalAgentPlanWorkflowValue as canonical,agentPlanWorkflowJsonValue} from '../src/agent-plan-workflow-contract.ts'
const id=n=>String(n).padStart(8,'0')+'-1234-4234-8234-123456789abc',hex=n=>String(n).repeat(64)
const source=()=>({spec_id:id(1),spec_revision:7,source_sha256:hex(1),resources_sha256:hex(2),resource_versions_sha256:hex(3)})
const choice=()=>({action:'preview',purpose,source:source(),instruction:'按现有方案设计可编辑草图',generation_model:{connection_id:id(2),connection_revision:4,model_id:'owner/model-v1'},output_token_limit:8192})
const submit=()=>({...choice(),action:'submit',request_id:id(3),expected_input_sha256:hex(4),confirm:true,fee_acknowledgement:fee})
const saving=()=>({action:'save',purpose,request_id:id(4),generation_request_id:id(3),source:source(),expected_result_sha256:hex(5),expected_preview_sha256:hex(6),expected_candidate_sha256:hex(7),confirm:true,save_acknowledgement:save})
const refused=work=>assert.throws(work,/invalid_agent_plan_workflow_value/)

test('F05 is a distinct existing-Agent-to-workflow purpose with explicit source and generation model',()=>{
 const raw=choice(),value=parseAgentPlanWorkflowChoice(raw);assert.deepEqual(value,raw);assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.source));assert.notEqual(value.generation_model.connection_id,value.source.spec_id)
 for(const replacement of ['generate','revise','evaluation','optimize',null,'workflow_run'])refused(()=>parseAgentPlanWorkflowChoice({...raw,purpose:replacement}))
 for(const extra of [{owner_user_id:id(1)},{identity:{}},{execute:true},{auto_run:false},{provider_url:'https://x'},{workflow_id:id(4)},{fee_acknowledgement:fee}])refused(()=>parseAgentPlanWorkflowChoice({...raw,...extra}))
})
test('source and model references are closed canonical scalar comparisons; version/hash drift changes the intent',()=>{
 const s=source();assert.deepEqual(parseAgentPlanWorkflowSource(s),s)
 for(const patch of [{spec_id:id(1).toUpperCase()},{spec_revision:0},{spec_revision:Number.MAX_SAFE_INTEGER},{source_sha256:'bad'},{resources_sha256:hex(2).toUpperCase().replace('2','A')},{request_id:id(3)}])refused(()=>parseAgentPlanWorkflowSource({...s,...patch}))
 const first=canonical(agentPlanWorkflowPaidIntentValue(submit()))
 for(const patch of [{source:{...s,spec_revision:8}},{source:{...s,resources_sha256:hex(8)}},{generation_model:{...choice().generation_model,connection_revision:5}},{output_token_limit:4096},{instruction:'不同要求'}])assert.notEqual(canonical(agentPlanWorkflowPaidIntentValue({...submit(),...patch})),first)
 for(const cap of [0,4095,32768,'8192'])refused(()=>parseAgentPlanWorkflowChoice({...choice(),output_token_limit:cap}))
})
test('paid submit binds explicit confirmation, one purpose-specific fee acknowledgement and a fresh correlation ID',()=>{
 const raw=submit(),value=parseAgentPlanWorkflowSubmission(raw);assert.deepEqual(value,raw)
 for(const patch of [{confirm:false},{confirm:'true'},{fee_acknowledgement:save},{fee_acknowledgement:'APPROVE_EXPLICIT_PAID_AGENT_DESIGN_GENERATE_V1'},{fee_acknowledgement:'APPROVE_EXPLICIT_PAID_AGENT_DESIGN_REVISE_V1'},{request_id:id(1)},{expected_input_sha256:'bad'},{retry:true},{force:true}])refused(()=>parseAgentPlanWorkflowSubmission({...raw,...patch}))
 const missing={...raw};delete missing.expected_input_sha256;refused(()=>parseAgentPlanWorkflowSubmission(missing))
 const a=agentPlanWorkflowPaidIntentValue(raw),b=agentPlanWorkflowPaidIntentValue(raw);assert.equal(a.authority,false);assert.deepEqual(a,b);assert.equal(a.protocol,'agent_plan_workflow_paid_intent_v1')
 assert.equal(Object.hasOwn(a,'receipt'),false);assert.equal(Object.hasOwn(a,'lease_token'),false) // Repeated pure parsing consumes nothing.
})
test('save is separately acknowledged and binds original generation, source, result, preview and edited candidate',()=>{
 const raw=saving(),value=parseAgentPlanWorkflowSaveIntent(raw);assert.deepEqual(value,raw)
 for(const patch of [{request_id:id(3)},{request_id:id(1)},{generation_request_id:id(1)},{save_acknowledgement:fee},{save_acknowledgement:'APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1'},{purpose:'revise'},{confirm:false},{execute:true}])refused(()=>parseAgentPlanWorkflowSaveIntent({...raw,...patch}))
 const first=canonical(agentPlanWorkflowSaveIntentValue(raw))
 for(const key of ['expected_result_sha256','expected_preview_sha256','expected_candidate_sha256'])assert.notEqual(canonical(agentPlanWorkflowSaveIntentValue({...raw,[key]:hex(9)})),first)
 assert.equal(agentPlanWorkflowSaveIntentValue(raw).authority,false);assert.notEqual(agentPlanWorkflowSaveIntentValue(raw).protocol,agentPlanWorkflowPaidIntentValue(submit()).protocol)
})
test('getters, inherited/symbol/hidden fields, array holes, toJSON and unsafe numbers do not run hooks or normalize into an intent',()=>{
 let reads=0;const raw=choice();Object.defineProperty(raw,'source',{enumerable:true,get(){reads++;return source()}});refused(()=>parseAgentPlanWorkflowChoice(raw));assert.equal(reads,0)
 for(const unsafe of [Object.assign(Object.create({x:1}),choice()),Object.defineProperty(choice(),'secret',{value:1}),Object.assign(choice(),{[Symbol('x')]:1})])refused(()=>parseAgentPlanWorkflowChoice(unsafe))
 const json={toJSON(){reads++;return 'fake'}};refused(()=>agentPlanWorkflowJsonValue(json));assert.equal(reads,0)
 const hole=[];hole.length=1;refused(()=>agentPlanWorkflowJsonValue(hole));for(const n of [NaN,Infinity,-0])refused(()=>agentPlanWorkflowJsonValue({n}))
 const nested={items:[{x:1}]};Object.defineProperty(nested.items[0],'x',{enumerable:true,get(){reads++;return 1}});refused(()=>agentPlanWorkflowJsonValue(nested));assert.equal(reads,0)
})
test('canonical preimages are key-order invariant, UTF8 bounded and preserve array/content distinctions',()=>{
 assert.equal(canonical({z:1,a:{b:'中文',a:true}}),canonical({a:{a:true,b:'中文'},z:1}));assert.notEqual(canonical([1,2]),canonical([2,1]))
 refused(()=>parseAgentPlanWorkflowChoice({...choice(),instruction:'a'.repeat(2001)}));refused(()=>canonical({text:'中'.repeat(200000)}));refused(()=>canonical({text:'\ud800'}));refused(()=>canonical({text:'x\u0000y'}))
 let deep={};for(let i=0;i<26;i++)deep={child:deep};refused(()=>canonical(deep))
 const original=submit(),value=agentPlanWorkflowPaidIntentValue(original);original.source.spec_revision=8;assert.equal(value.intent.source.spec_revision,7)
})
