// Query/transaction/refusal models only. All rows are in-memory response data;
// these tests DO NOT prove actual SQL atomicity, grants, leases or one-use fees.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {safeAgentSpec} from '../src/contracts.ts'
import {agentPlanWorkflowPurpose as purpose,agentPlanWorkflowFeeAcknowledgement as fee,agentPlanWorkflowSaveAcknowledgement as saveAck,agentPlanWorkflowPaidIntentValue,agentPlanWorkflowSaveIntentValue} from '../src/agent-plan-workflow-contract.ts'
import {prepareAgentPlanWorkflowInput,agentPlanWorkflowResultValue} from '../src/agent-plan-workflow-result.ts'
import {agentPlanWorkflowHash as hash} from '../src/agent-plan-workflow-source.ts'
import {AgentPlanWorkflowLedgerRepository,AgentPlanWorkflowAcknowledgementUnknown} from '../src/agent-plan-workflow-ledger.ts'
import {agentPlanWorkflowExecutionApproval as execution} from '../src/agent-plan-workflow-runtime-policy.ts'
import {agentPlanWorkflowCancelAcknowledgement as cancel} from '../src/agent-plan-workflow-rpc-contract.ts'
const id=n=>String(n).padStart(8,'0')+'-1234-4234-8234-123456789abc',hex=n=>String(n).repeat(64),identity={issuer:'urn:agentstudio:local:v1',subject:'employee'},owner=id(1),date='2026-10-29T01:02:03.000Z'
const graph=()=>({version:2,nodes:[{id:'s',type:'start',position:{x:0,y:0},data:{title:'s'}},{id:'m',type:'model',position:{x:1,y:1},data:{title:'m',prompt:'分析输入'}},{id:'e',type:'end',position:{x:2,y:2},data:{title:'e'}}],edges:[{id:'a',source:'s',target:'m'},{id:'b',source:'m',target:'e'}]})
function fixture(options={}){
 const calls=[],connections={api:0,worker:0,dispatch:0},releases={api:0,worker:0,dispatch:0},ownerState={owner_user_id:owner,governance_revision:3,epoch:3},agent={spec_id:id(2),owner_user_id:owner,name:'已有方案',revision:7,spec:safeAgentSpec({goal:'整理资料',tools:[],knowledge_base_ids:[]})},model={owner_user_id:owner,revision:4,models:['design-model'],provider:'openai',base_url:'https://api.openai.com/v1',enabled:true,status:'ok'},binding={connection_id:id(3),connection_revision:4,model_id:'design-model'}
 let receipt=null,result=null,controlReceipt=null,saveReceipt=null,workflow=null,failCommit=false,failSQL=null,privatePatch=null,finishState=null,unsafeLogin=false,envelope=hex(5),records=0,reservations=0,saves=0
 function material(){const model_snapshot=[{connection_id:id(3),connection_revision:4,metadata_sha256:hash({protocol:'agent_plan_workflow_model_metadata_v1',connection_id:id(3),owner_user_id:owner,connection_revision:4,models:model.models,provider:model.provider,base_url:model.base_url,enabled:model.enabled,status:model.status}),encrypted_envelope_sha256:envelope}],resource_snapshot=[],source={spec_id:agent.spec_id,spec_revision:agent.revision,source_sha256:hash({protocol:'agent_plan_workflow_source_binding_v1',owner:ownerState,agent}),resources_sha256:hash({protocol:'agent_plan_workflow_resource_values_v1',resources:{tools:agent.spec.tools,knowledge_base_ids:agent.spec.knowledge_base_ids,require_approval:true}}),resource_versions_sha256:hash({protocol:'agent_plan_workflow_resource_versions_v1',owner:ownerState,resource_snapshot,model_snapshot})};return {protocol:'agent_plan_workflow_source_material_v1',owner:{...ownerState},source_values:{source,name:agent.name,spec:agent.spec},resource_snapshot,model_snapshot}}
 const choice=()=>({action:'preview',purpose,source:material().source_values.source,instruction:'模型编排',generation_model:binding,output_token_limit:4096})
 const prepared=()=>{const c=choice(),v=material(),p=prepareAgentPlanWorkflowInput(c,v.source_values);return {protocol:'agent_plan_workflow_prepared_v1',purpose,choice:c,source_values:v.source_values,messages:p.messages,input_sha256:hash(p.input_value),content_sha256:hash(p.content_value),model_versions_sha256:hash({protocol:'agent_plan_workflow_model_versions_v1',owner:ownerState,model_snapshot:v.model_snapshot}),owner_user_id:owner,owner_governance_revision:3,owner_epoch:3,byte_length:new TextEncoder().encode(JSON.stringify(p.input_value)).length,authority:false}}
 const intent=()=>{const {action:_a,...c}=choice();return {...c,action:'submit',request_id:id(4),expected_input_sha256:prepared().input_sha256,confirm:true,fee_acknowledgement:fee}}
 const makeReceipt=(v=intent(),p=prepared())=>({protocol:'agent_plan_workflow_receipt_v1',purpose,request_id:v.request_id,generation_model:v.generation_model,output_token_limit:v.output_token_limit,source:v.source,request_sha256:hash(agentPlanWorkflowPaidIntentValue(v)),input_sha256:p.input_sha256,content_sha256:p.content_sha256,model_versions_sha256:p.model_versions_sha256,owner_governance_revision:3,owner_epoch:3,created_at:date,state:'queued',body_erased:false,recorded:true,replayed:false})
 const proof=()=>({protocol:'agent_plan_workflow_dispatch_v1',purpose,request_id:id(4),lease_token:id(5),lease_version:1,worker_id:id(6)})
 const context=()=>({protocol:'agent_plan_workflow_context_v1',purpose,identity,owner_user_id:owner,owner_governance_revision:3,owner_epoch:3,request_id:id(4),request_sha256:hash(agentPlanWorkflowPaidIntentValue(intent())),choice:choice(),prepared:prepared()})
 const privateRole=kind=>kind==='worker'?'agentstudio_plan_workflow_worker':'agentstudio_plan_workflow_dispatch',safe={inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false}
 const clients={}
 for(const kind of ['api','worker','dispatch'])clients[kind]={query:async(sql,values)=>{
  calls.push({kind,sql,values});if(failSQL?.test(sql))throw Error('model_query_failure');if(sql==='COMMIT'&&failCommit){failCommit=false;throw Error('lost_model_ack')}
  let rows=[],value
  if(sql.includes('WHERE rolname=session_user'))rows=[{...safe,login:true,initial_role:true,superuser:unsafeLogin}]
  else if(sql.includes('WHERE rolname=$1'))rows=[{...safe,login:false}]
  else if(sql.includes('pg_has_role'))rows=[{name:privateRole(kind)}]
  else if(sql.includes('pg_auth_members'))rows=[{name:privateRole(kind),admin:false,inherit:false,set:true}]
  else if(sql.includes('identity_user_id'))rows=[{id:owner}]
  else if(sql.includes('current_user=')&&sql.includes('actor_id()'))rows=[{ok:true}]
  else if(sql.includes('agent_plan_workflow_owner_state'))value={...ownerState}
  else if(sql.includes('FROM agentstudio.agent_specs'))rows=[{id:agent.spec_id,owner_user_id:owner,name:agent.name,spec:agent.spec,revision:agent.revision}]
  else if(sql.includes('FROM agentstudio.model_connections'))rows=[model]
  else if(sql.includes('agent_plan_workflow_source('))value=material()
  else if(sql.includes('agent_plan_workflow_receipt('))value=receipt
  else if(sql.includes('agent_plan_workflow_record(')){records++;receipt=makeReceipt(JSON.parse(values[0]),JSON.parse(values[1]));value=receipt.request_id}
  else if(sql.includes('agent_plan_workflow_read_result('))value=result
  else if(sql.includes('agent_plan_workflow_control_receipt('))value=controlReceipt
  else if(sql.includes('agent_plan_workflow_control(')){const v=JSON.parse(values[0]);controlReceipt={protocol:'agent_plan_workflow_control_receipt_v1',purpose,request_id:v.request_id,generation_request_id:v.generation_request_id,action:v.action,request_sha256:hash({protocol:'agent_plan_workflow_control_intent_v1',purpose,intent:v,authority:false}),state:v.action==='cancel'?'cancelled':'erased',created_at:date,recorded:true,replayed:false};value=v.request_id}
  else if(sql.includes('agent_plan_workflow_save_receipt('))value=saveReceipt
  else if(sql.includes('agent_plan_workflow_save_record(')){saves++;const v=JSON.parse(values[0]),p=JSON.parse(values[1]);saveReceipt={protocol:'agent_plan_workflow_save_receipt_v1',purpose,request_id:v.request_id,generation_request_id:v.generation_request_id,request_sha256:hash(agentPlanWorkflowSaveIntentValue(v)),source:p.source,result_sha256:p.result_sha256,preview_sha256:p.preview_sha256,candidate_sha256:p.candidate_sha256,workflow_id:v.request_id,workflow_revision:1,created_at:date,recorded:true,replayed:false};workflow={id:v.request_id,owner_user_id:owner,...p.candidate,revision:'1'};value=v.request_id}
  else if(sql.includes('FROM agentstudio.workflows'))rows=workflow?[workflow]:[]
  else if(sql.includes('agent_plan_workflow_claim('))value={...proof(),lease_expires_at:date}
  else if(sql.includes('agent_plan_workflow_context('))value=privatePatch?.(context())??context()
  else if(sql.includes('agent_plan_workflow_reserve(')){reservations++;value={protocol:'agent_plan_workflow_reservation_v1',purpose,request_id:id(4),effect_id:id(8),state:'reserved',request_sha256:context().request_sha256,input_sha256:prepared().input_sha256,content_sha256:prepared().content_sha256,source_sha256:choice().source.source_sha256}}
  else if(sql.includes('agent_plan_workflow_finish(')){const completion=JSON.parse(values[4]),state=finishState??completion.status;value={protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:id(4),state,result_sha256:state==='succeeded'?hex(8):null,completion_sha256:hash({protocol:'agent_plan_workflow_completion_v1',purpose,request_id:id(4),completion})}}
  else if(sql.includes('agent_plan_workflow_pause('))value={protocol:'agent_plan_workflow_dispatch_reply_v1',purpose,request_id:id(4),state:'unknown',result_sha256:null,completion_sha256:null}
  if(value!==undefined)rows=[{value}];return {rows}
 },release(){releases[kind]++}}
 const pools=Object.fromEntries(['api','worker','dispatch'].map(kind=>[kind,{connect:async()=>{connections[kind]++;return clients[kind]}}]))
 const auditModel=async db=>{assert.ok(Object.values(clients).includes(db));return true}
 const repo=new AgentPlanWorkflowLedgerRepository(pools.api,{audit:auditModel,workerPool:pools.worker,dispatchPool:pools.dispatch,...options})
 const succeeded=()=>{receipt={...makeReceipt(),state:'succeeded'};const value=agentPlanWorkflowResultValue({request_id:receipt.request_id,purpose,source:receipt.source,input_sha256:receipt.input_sha256,generation_model:receipt.generation_model},{protocol:'agent_plan_workflow_model_output_v1',name:'模型草图',graph:graph()});result={protocol:'agent_plan_workflow_result_data_v1',request_id:receipt.request_id,result_sha256:hash(value),value};return result}
 return {repo,calls,connections,releases,clients,pools,agent,choice,intent,proof,prepared,succeeded,makeReceipt,receipt:v=>{receipt=v},lostCommit:()=>{failCommit=true},fail:v=>{failSQL=v},privatePatch:v=>{privatePatch=v},finishState:v=>{finishState=v},unsafe:()=>{unsafeLogin=true},rotate:()=>{envelope=hex(9)},counts:()=>({records,reservations,saves})}
}
test('default-off new submit reads only its original receipt; foreign issuer and missing audit stop early',async()=>{
 const f=fixture();await assert.rejects(()=>f.repo.submit(identity,f.intent()),/submission_disabled/);assert.equal(f.connections.api,1);assert.equal(f.releases.api,1);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.ok(!f.calls.some(x=>x.sql.includes('agent_plan_workflow_source(')||x.sql.includes('agent_plan_workflow_record(')))
 await assert.rejects(()=>f.repo.submit({issuer:'external',subject:'employee'},f.intent()),/native_employee_identity_required/);assert.equal(f.connections.api,1)
 const m=fixture({audit:undefined});await assert.rejects(()=>m.repo.submit(identity,m.intent()),/actual_auditor_required/);assert.ok(!m.calls.some(x=>x.sql.includes('agent_plan_workflow_receipt(')))
})
test('identical receipt confirms without new record/current-source read; same UUID changed cap conflicts',async()=>{
 const f=fixture();f.receipt(f.makeReceipt());assert.equal((await f.repo.submit(identity,f.intent())).replayed,true);assert.equal((await f.repo.confirm(identity,f.intent())).replayed,true);assert.equal(f.counts().records,0);assert.ok(!f.calls.some(x=>x.sql.includes('agent_plan_workflow_source(')))
 await assert.rejects(()=>f.repo.submit(identity,{...f.intent(),output_token_limit:8192}),/request_conflict/)
})
test('fresh submit model uses one original connection, fixed record and immutable correlated receipt',async()=>{
 const f=fixture({allowSubmissions:true}),r=await f.repo.submit(identity,f.intent());assert.equal(r.replayed,false);assert.equal(f.counts().records,1);assert.equal(f.connections.api,1);assert.equal(f.calls[0].sql,'BEGIN');assert.equal(f.calls.at(-1).sql,'COMMIT');assert.ok(f.calls.every(c=>c.kind==='api'));assert.equal(f.calls.filter(c=>c.sql.includes('agent_plan_workflow_record(')).length,1)
})
test('lost submit COMMIT model reports unknown original UUID and performs no automatic retry; later confirm is read-only',async()=>{
 const f=fixture({allowSubmissions:true});f.lostCommit();await assert.rejects(()=>f.repo.submit(identity,f.intent()),e=>e instanceof AgentPlanWorkflowAcknowledgementUnknown&&e.request_id===id(4)&&e.retry_allowed===false);assert.equal(f.counts().records,1);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.releases.api,1)
 assert.equal((await f.repo.confirm(identity,f.intent())).replayed,true);assert.equal(f.counts().records,1)
})
test('stale current source retains original paid result; corrupt result and database failure are errors',async()=>{
 const f=fixture();const result=f.succeeded();f.rotate();const v=await f.repo.view(identity,id(4));assert.equal(v.result_status,'stale');assert.equal(v.result.result_sha256,result.result_sha256)
 const g=fixture();g.succeeded();g.fail(/agent_plan_workflow_source\(/);await assert.rejects(()=>g.repo.view(identity,id(4)),/model_query_failure/)
 const c=fixture();const data=c.succeeded();data.result_sha256=hex(9);await assert.rejects(()=>c.repo.view(identity,id(4)),/projection_unavailable/)
})
test('save model uses UPDATE first and same client for resource validation, fixed save RPC, receipt and Workflow readback',async()=>{
 const f=fixture({allowSaves:true}),result=f.succeeded(),raw={generation_request_id:id(4),expected_result_sha256:result.result_sha256,edits:null},p=await f.repo.previewSave(identity,raw),intent={action:'save',purpose,request_id:id(7),generation_request_id:id(4),source:p.source,expected_result_sha256:p.result_sha256,expected_preview_sha256:p.preview_sha256,expected_candidate_sha256:p.candidate_sha256,confirm:true,save_acknowledgement:saveAck}
 f.calls.length=0;const before=f.connections.api,r=await f.repo.save(identity,intent,raw);assert.equal(r.workflow_id,id(7));assert.equal(f.connections.api,before+1);assert.equal(f.counts().saves,1);assert.ok(f.calls.find(c=>c.sql.includes('FROM agentstudio.agent_specs')).sql.endsWith('FOR UPDATE'));assert.ok(f.calls.every(c=>c.kind==='api'));assert.equal(f.calls.at(-1).sql,'COMMIT');assert.equal((await f.repo.save(identity,intent,raw)).replayed,true);assert.equal(f.counts().saves,1)
})
test('save readback failure model rolls back instead of acknowledging; no nested pool operation or source write',async()=>{
 const f=fixture({allowSaves:true}),result=f.succeeded(),raw={generation_request_id:id(4),expected_result_sha256:result.result_sha256,edits:null},p=await f.repo.previewSave(identity,raw),intent={action:'save',purpose,request_id:id(7),generation_request_id:id(4),source:p.source,expected_result_sha256:p.result_sha256,expected_preview_sha256:p.preview_sha256,expected_candidate_sha256:p.candidate_sha256,confirm:true,save_acknowledgement:saveAck};f.fail(/FROM agentstudio.workflows/);f.calls.length=0
 await assert.rejects(()=>f.repo.save(identity,intent,raw),/model_query_failure/);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,0);assert.ok(!f.calls.some(c=>/UPDATE agentstudio\.agent_specs|INSERT INTO agentstudio/.test(c.sql)))
})
test('control intent has own hash, original generation lock and read-only replay confirmation',async()=>{
 const f=fixture(),intent={action:'cancel',request_id:id(7),generation_request_id:id(4),confirm:true,acknowledgement:cancel},r=await f.repo.control(identity,intent);assert.equal(r.action,'cancel');assert.equal((await f.repo.control(identity,intent,true)).replayed,true);assert.equal(f.calls.filter(c=>c.sql.includes('agent_plan_workflow_control(')).length,1)
 const g=fixture();await assert.rejects(()=>g.repo.control(identity,intent,true),/control_receipt_not_found/);assert.equal(g.calls.filter(c=>c.sql.includes('agent_plan_workflow_control(')).length,0)
})
test('private execution is default-off and requires separate authenticated pools; unsafe original login cannot SET ROLE',async()=>{
 const f=fixture();await assert.rejects(()=>f.repo.claim(id(6)),/execution_disabled/);assert.equal(f.connections.worker,0);assert.throws(()=>new AgentPlanWorkflowLedgerRepository(f.pools.api,{workerPool:f.pools.api}),/distinct_pools_required/)
 const g=fixture({executionEnabled:true,executionApproval:execution});g.unsafe();await assert.rejects(()=>g.repo.claim(id(6)),/session_role_refused/);assert.ok(!g.calls.some(c=>c.sql==='SET LOCAL ROLE agentstudio_plan_workflow_worker'))
})
test('private context recomputes own paid-input/content/request hashes before reserve; tampering cannot reach reserve RPC',async()=>{
 const f=fixture({executionEnabled:true,executionApproval:execution});f.privatePatch(c=>({...c,request_sha256:hex(9)}));await assert.rejects(()=>f.repo.reserve(f.proof()),/projection_unavailable/);assert.equal(f.counts().reservations,0);assert.equal(f.calls.at(-1).sql,'ROLLBACK')
 const g=fixture({executionEnabled:true,executionApproval:execution});assert.equal((await g.repo.reserve(g.proof())).state,'reserved');assert.equal(g.counts().reservations,1);assert.ok(g.calls.findIndex(c=>c.sql.includes('pg_auth_members'))<g.calls.findIndex(c=>c.sql==='SET LOCAL ROLE agentstudio_plan_workflow_dispatch'))
})
test('lost reserve acknowledgement performs one reserve call; pause stays unknown and no model POST exists',async()=>{
 const f=fixture({executionEnabled:true,executionApproval:execution});f.lostCommit();await assert.rejects(()=>f.repo.reserve(f.proof()),e=>e instanceof AgentPlanWorkflowAcknowledgementUnknown&&e.request_id===id(4));assert.equal(f.counts().reservations,1);assert.equal((await f.repo.pause(f.proof())).state,'unknown');assert.equal(f.counts().reservations,1)
})
test('finish accepts bounded F05 completion only; old F01 shape never reaches its RPC',async()=>{
 const f=fixture({executionEnabled:true,executionApproval:execution});await assert.rejects(()=>f.repo.finish(f.proof(),{status:'succeeded',result:{goal:'F01'}}));assert.equal(f.connections.dispatch,0)
 assert.equal((await f.repo.finish(f.proof(),{status:'unknown',failure_code:'provider_outcome_unknown'})).state,'unknown')
})
test('actual SQL reply may conservatively remain unknown but cannot promote unknown into success',async()=>{
 const f=fixture({executionEnabled:true,executionApproval:execution});f.finishState('unknown');const output={protocol:'agent_plan_workflow_model_output_v1',name:'草图',graph:graph()};assert.equal((await f.repo.finish(f.proof(),{status:'succeeded',model_json:JSON.stringify(output)})).state,'unknown')
 const g=fixture({executionEnabled:true,executionApproval:execution});g.finishState('succeeded');await assert.rejects(()=>g.repo.finish(g.proof(),{status:'unknown',failure_code:'provider_outcome_unknown'}),/projection_unavailable/);assert.equal(g.calls.at(-1).sql,'ROLLBACK')
})
test('ledger has no F01 reuse, provider call, retry loop, nested WorkflowRepository or dynamic audit loader',()=>{
 const source=readFileSync(new URL('../src/agent-plan-workflow-ledger.ts',import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"][^'"]*agent-design-|\bfetch\(|\bwhile\s*\(|\bimport\s*\(|new WorkflowRepository|createIdempotent\(/)
})
