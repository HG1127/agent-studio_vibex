import test from 'node:test'
import assert from 'node:assert/strict'
import {createOriginalAgentRunTransport,originalAgentRunRoute} from '../src/lib/originalAgentRunTransport.ts'
import {originalRunAgent,originalRunDetail,originalRunFeedback} from '../src/lib/originalAgentRunProjection.ts'
import {createOriginalAgentRunSession,originalRunApproval,originalRunZeroCostEffect} from '../src/lib/originalAgentRunSession.ts'
const employee='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',spec='33333333-3333-4333-8333-333333333333',run='44444444-4444-4444-8444-444444444444',model='55555555-5555-4555-8555-555555555555',memory='66666666-6666-4666-8666-666666666666',hash='a'.repeat(64),stamp='2026-10-30T00:00:00.000Z'
const binding={connection_id:model,connection_revision:1,model_id:'gpt-demo'}
const agent=()=>({id:spec,owner_user_id:employee,name:'CURRENT TITLE MUST NOT BE HISTORICAL',revision:1,spec:{goal:'Synthetic task',task_scope:'DEMO',deliverables:['DEMO'],task_plan:['DEMO'],done_criteria:['DEMO'],tools:['calculate'],knowledge_base_ids:[],require_approval:true,model_binding:binding},created_at:stamp,updated_at:stamp,authoring:null})
const detail=(tool='calculate')=>({execution_mode:'agent_native_v2',replayed:true,run:{id:run,owner_user_id:employee,agent_spec_id:spec,workflow_id:null,kind:'agent',status:'awaiting_approval',instruction:'Synthetic task',result_text:'',step_count:1,checkpoint:{stage:'agent_v2_approval',spec_revision:1,max_steps:3,selected_model_binding:binding},last_error_code:'',created_at:stamp,updated_at:stamp,finished_at:null},steps:[{step_key:'wf2_00001_demo',status:'awaiting_approval',metadata:{}}],steps_truncated:false,approvals:[],pending_effect:{step_key:'wf2_00001_demo',node_id:'demo',kind:tool==='model'?'model':'tool',input:'{"expression":"1+1"}',input_sha256:hash,configuration:tool==='model'?{model_binding:binding}:{tool},missing:[]},run_control:{state_sha256:hash,manually_paused:false,in_flight:false,outcome_unknown:false,can_pause:true,can_resume:false}})
const summary=d=>({id:d.run.id,agent_spec_id:d.run.agent_spec_id,status:d.run.status,instruction_preview:d.run.instruction,result_preview:d.run.result_text.slice(0,240),step_count:d.run.step_count,last_error_code:d.run.last_error_code,created_at:stamp,updated_at:stamp,finished_at:null,stage:'agent_v2_approval'})
const feedbackStatus=()=>({protocol:'agent_feedback_v1',run_id:run,spec_id:spec,revision:0,source:{status:'succeeded',source_sha256:hash},state:'none',current:null,lessons:[],limit:50})
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}})
async function settle(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,0))}assert.fail('pure session did not settle')}
function fixture({effect='calculate',caps:overrides={},confirm=()=>true}={}){
 let owner=employee,unavailable=false,d=detail(effect),f=feedbackStatus();const calls=[],caps={mode:'native_pg18',config_writes_enabled:true,autonomous_agent_submission_enabled:true,agent_feedback_available:true,agent_feedback_submission_enabled:true,agent_memory_available:true,agent_memory_writes_enabled:true,...overrides}
 const api={getConfigCapabilities:async()=>caps,listModelConnections:async()=>[{id:model,owner_user_id:employee,name:'DEMO',provider:'openai',base_url:'https://api.openai.com/v1',enabled:true,status:'ok',revision:1,models:['gpt-demo']}],listToolConnections:async()=>[],listMcpConnections:async()=>[],getAgent:async()=>agent(),listAutonomousAgentRuns:async()=>[summary(d)],getAutonomousAgentRun:async()=>structuredClone(d),getAgentFeedback:async()=>structuredClone(f),listAgentMemories:async()=>({spec_id:spec,items:[{id:memory,kind:'user',fact:'DEMO memory',content_sha256:hash,created_at:stamp,tools_used:'',run_id:null}],limit:50}),
  decideAutonomousAgentNode:async(id,decision,step,inputHash)=>{calls.push({kind:'decision',id,decision,step,inputHash});d={...d,run:{...d.run,status:'queued'},pending_effect:null,approvals:[{step_key:step,status:decision}],decision_confirmation:{run_id:id,step_key:step,input_sha256:inputHash,status:decision}};return structuredClone(d)},
  controlAutonomousAgentRun:async(id,action,body)=>{calls.push({kind:'control',id,action,body});throw Error('synthetic lost response')},confirmAutonomousAgentRunControl:async(id,action,body)=>{calls.push({kind:'control-confirm',id,action,body});throw Error('synthetic unresolved')},cancelAutonomousAgentRun:async()=>{calls.push({kind:'cancel'});throw Error('synthetic lost response')},
  changeAgentFeedback:async body=>{calls.push({kind:'feedback-change',body:structuredClone(body)});throw Error('synthetic lost response')},confirmAgentFeedback:async body=>{calls.push({kind:'feedback-confirm',body:structuredClone(body)});throw Error('synthetic unresolved')},
  changeAgentMemory:async body=>{calls.push({kind:'memory-change',body:structuredClone(body)});throw Error('synthetic lost response')},confirmAgentMemory:async body=>{calls.push({kind:'memory-confirm',body:structuredClone(body)});throw Error('synthetic unresolved')},submitAutonomousAgentRun:async(...args)=>{calls.push({kind:'submit',args});throw Error('synthetic lost response')},respondAutonomousAgent:async(id,choice)=>{calls.push({kind:'human-response',id,choice:structuredClone(choice)});throw Error('synthetic lost response')},confirmAutonomousAgentResponse:async(id,choice)=>{calls.push({kind:'human-confirm',id,choice:structuredClone(choice)});throw Error('synthetic unresolved')}}
 const home={list:async()=>[agent()],get:async()=>agent()},inbox={workspace:async()=>({items:[],pending_items:[],pending_count:0,agent_run_total:0})}
 const c=createOriginalAgentRunSession({employeeId:employee,api,home,inbox,models:{listSnapshot:async()=>({items:await api.listModelConnections(),complete:true})},verifyEmployee:async()=>{if(unavailable)throw Error('synthetic auth unavailable');return owner},confirm})
 return{c,api,calls,setUnavailable:v=>{unavailable=v},setOwner:v=>{owner=v},setDetail:v=>{d=v},setFeedback:v=>{f=v},async start(){await c.activate();await settle(()=>!c.snapshot().runs.loading);await c.selectAgent(spec);await settle(()=>!c.snapshot().memories.loading);await c.selectRun(run,spec);await settle(()=>!c.snapshot().feedback.loading);return c}}
}
test('closed original-run route policy rejects PB, arbitrary hosts, foreign methods and undeclared routes',()=>{
 assert.equal(originalAgentRunRoute('/__pb/api/agent_runs','GET'),false)
 assert.equal(originalAgentRunRoute('https://example.com/__pg_native/api/v2/agent-autonomous-runs','GET'),false)
 assert.equal(originalAgentRunRoute('/__pg_native/api/v2/agent-autonomous-runs','GET'),true)
 assert.equal(originalAgentRunRoute('/__pg_native/api/v2/agent-autonomous-runs/'+run+'/decision','POST'),true)
 for(const p of ['/__pg_native/api/native-auth/logout','/__pg_native/api/v2/model-connections/'+model,'/__pg_native/api/v2/agent-autonomous-runs?owner='+other,'/__pg_native/api/v2/agent-autonomous-runs/%2e%2e'])assert.equal(originalAgentRunRoute(p,'POST'),false)
 assert.equal(originalAgentRunRoute('/__pg_native/api/v2/agent-autonomous-runs/'+run,'DELETE'),false)
})
test('Native transport sends only Cookie/CSRF/expected employee and preserves actual JSON bytes',async()=>{
 const seen=[],t=createOriginalAgentRunTransport({employeeId:employee,verifyEmployee:async()=>employee,transport:async(p,i)=>{seen.push({p,i});return json({ok:true})}})
 const r=await t.transport('/__pg_native/api/v2/agent-autonomous-runs/'+run+'/decision',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-AgentStudio-Request':'1'},body:'{}'})
 assert.deepEqual(await r.json(),{ok:true});assert.equal(seen[0].i.credentials,'same-origin');assert.equal(seen[0].i.headers['X-AgentStudio-Expected-Employee'],employee);assert.equal(seen[0].i.headers.Authorization,undefined)
 await assert.rejects(t.transport('/__pg_native/api/v2/agent-autonomous-runs',{headers:{'X-Rh-User-Id':employee}}),/header_refused/);assert.equal(seen.length,1);t.close()
})
test('account changes before send or during response never reveal another employee data',async()=>{
 let owner=other,calls=0,release
 const t=createOriginalAgentRunTransport({employeeId:employee,verifyEmployee:async()=>owner,transport:async()=>{calls++;return new Promise(r=>{release=r})}})
 await assert.rejects(t.transport('/__pg_native/api/v2/agent-autonomous-runs'),/employee_changed/);assert.equal(calls,0)
 owner=employee;const pending=t.transport('/__pg_native/api/v2/agent-autonomous-runs');await settle(()=>Boolean(release));owner=other;release(json({private:'must discard'}));await assert.rejects(pending,/employee_changed/);t.close()
})
test('transport rejects malformed UTF8, oversized responses and aborts closed reads without fallback',async()=>{
 for(const response of [new Response(new Uint8Array([0xc3,0x28]),{headers:{'content-type':'application/json'}}),new Response('x',{headers:{'content-type':'application/json','content-length':'1048577'}})]){
  const t=createOriginalAgentRunTransport({employeeId:employee,verifyEmployee:async()=>employee,transport:async()=>response});await assert.rejects(t.transport('/__pg_native/api/v2/agent-autonomous-runs'),/response_refused/);t.close()
 }
 let signal;const t=createOriginalAgentRunTransport({employeeId:employee,verifyEmployee:async()=>employee,timeoutMs:20,transport:async(_p,i)=>{signal=i.signal;return new Promise(()=>{})}});const pending=t.transport('/__pg_native/api/v2/agent-autonomous-runs');await settle(()=>Boolean(signal));t.close();assert.equal(signal.aborted,true);await assert.rejects(pending);await assert.rejects(t.transport('/__pg_native/api/v2/agent-autonomous-runs'),/employee_changed/)
})
test('current owned Agent uses its actual title/revision; historical run labels never use that title',()=>{
 const a=originalRunAgent(agent(),employee);assert.equal(a.name,agent().name);assert.equal(a.rh_user_id,employee)
 const d=originalRunDetail(detail(),employee);assert.ok(d.spec_name.includes(spec));assert.ok(!d.spec_name.includes(agent().name));assert.equal(d.native_projection.historical_title_available,false);assert.equal(d.native_projection.timeline_available,false)
 assert.throws(()=>originalRunAgent({...agent(),owner_user_id:other},employee));assert.throws(()=>originalRunDetail({...detail(),run:{...detail().run,owner_user_id:other}},employee))
})
test('blocked source output remains masked and feedback must be from this exact owned run',()=>{
 const d=detail();d.run.result_text='should be masked';d.knowledge_outputs_available=false;assert.equal(originalRunDetail(d,employee).result,'')
 const f=feedbackStatus();f.run_id=other;assert.throws(()=>originalRunFeedback(f,run,spec))
 assert.throws(()=>originalRunDetail({...detail(),run:{...detail().run,checkpoint:{spec_revision:1}}},employee))
})
test('real session loads current owner Agent, full Native run, pending step, feedback and memory without synthetic events',async()=>{
 const f=fixture();try{await f.start();const v=f.c.snapshot();assert.equal(v.activeRun.id,run);assert.equal(v.agents[0].name,agent().name);assert.equal(v.pendingApproval.argsSummary.includes(hash),true);assert.equal(v.feedback.status.run_id,run);assert.equal(v.memories.items[0].id,memory);assert.match(v.error,/未提供原时间线事件/);assert.equal(f.calls.length,0)}finally{f.c.dispose()}
})
test('wrong spec permalink never selects a same-owner run under a different Agent',async()=>{
 const f=fixture();try{await f.c.activate();await settle(()=>!f.c.snapshot().runs.loading);await f.c.selectRun(run,other);assert.equal(f.c.snapshot().activeRun,null);assert.match(f.c.snapshot().error,/来源不匹配/)}finally{f.c.dispose()}
})
test('same original step/hash and explicit employee confirmation are required for uncharged tool approval',async()=>{
 const prompts=[],f=fixture({confirm:p=>{prompts.push(p);return true}});try{await f.start();await f.c.decide('approve');assert.equal(f.calls[0].kind,'decision');assert.equal(f.calls[0].step,'wf2_00001_demo');assert.equal(f.calls[0].inputHash,hash);assert.equal(prompts[0].input_sha256,hash);assert.equal(prompts[0].run_id,run);assert.equal(f.c.snapshot().runs.pendingMutation,null)}finally{f.c.dispose()}
})
test('fee-bearing model/external steps stay blocked until the original page has an actual fee preview',async()=>{
 const f=fixture({effect:'model'});try{await f.start();assert.equal(originalRunZeroCostEffect(detail('model')),false);await f.c.decide('approve');assert.equal(f.calls.length,0);assert.match(f.c.snapshot().error,/费用预览/);await f.c.decide('reject');assert.equal(f.calls[0].decision,'rejected')}finally{f.c.dispose()}
})
test('a declined confirmation sends no approval mutation',async()=>{
 const f=fixture({confirm:()=>false});try{await f.start();await f.c.decide('approve');assert.equal(f.calls.length,0)}finally{f.c.dispose()}
})
test('unknown pause result is confirmed with the exact original operation instead of issuing resume',async()=>{
 const f=fixture();try{await f.start();await f.c.control('pause');assert.ok(f.c.snapshot().runs.pendingRunControl);await f.c.control('resume');assert.deepEqual(f.calls.map(c=>c.kind),['control','control-confirm']);assert.equal(f.calls[1].action,'pause');assert.deepEqual(f.calls[1].body,f.calls[0].body)}finally{f.c.dispose()}
})
test('unknown feedback retains the original source/revision/body and a second click only confirms it',async()=>{
 const f=fixture();try{await f.start();await f.c.submitFeedback({rating:'down',tags:['DEMO'],comment:'DEMO feedback'});assert.ok(f.c.snapshot().feedback.pending);await f.c.submitFeedback({rating:'up',tags:[],comment:'changed must not replace'});assert.deepEqual(f.calls.map(c=>c.kind),['feedback-change','feedback-confirm']);assert.deepEqual(f.calls[1].body,f.calls[0].body);assert.equal(f.calls[0].body.remember_lesson,false);assert.equal(f.calls[0].body.expected_source_sha256,hash)}finally{f.c.dispose()}
})
test('unknown memory deletion only confirms its original content hash',async()=>{
 const f=fixture();try{await f.start();await f.c.forgetMemory(memory);assert.ok(f.c.snapshot().memories.pending);await f.c.forgetMemory(memory);assert.deepEqual(f.calls.map(c=>c.kind),['memory-change','memory-confirm']);assert.deepEqual(f.calls[1].body,f.calls[0].body);assert.equal(f.calls[0].body.expected_sha256,hash)}finally{f.c.dispose()}
})
test('employee switch scrubs all page state, blocks pending writes and discards late reads',async()=>{
 const f=fixture();await f.start();f.setOwner(other);await assert.rejects(f.c.poll());const v=f.c.snapshot();assert.equal(v.closed,false);assert.equal(v.ownerChanged,true);assert.equal(v.activeRun,null);assert.deepEqual(v.agents,[]);assert.deepEqual(v.models,[]);assert.equal(f.calls.length,0)
})
test('capability gates prevent submission and feedback; missing single-run contract is explicit',async()=>{
 const f=fixture({caps:{autonomous_agent_submission_enabled:false,agent_feedback_submission_enabled:false}});try{await f.start();await f.c.submit('DEMO',3);await f.c.submitFeedback({rating:'up',tags:[],comment:''});await f.c.selectRun(run,spec,'agent_single');assert.equal(f.calls.length,0);assert.match(f.c.snapshot().error,/单轮运行/)}finally{f.c.dispose()}
})

test('actual existing Home/Native clients can initialize through the new closed transport',async()=>{
 const {createPgNativePilotApi}=await import('../src/lib/pgNativePilotApi.ts')
 const {createOriginalHomeAgentApi}=await import('../src/lib/originalHomeAgentApi.ts')
 const {createOriginalHomeInboxApi}=await import('../src/lib/originalHomeInboxApi.ts')
 const {createOriginalModelConnectionsApi}=await import('../src/lib/originalModelConnectionsApi.ts')
 const requests=[],bodies={
  '/__pg_native/api/v2/original-ui/agent-specs?limit=50':{items:[agent()]},
  '/__pg_native/api/native-auth/capabilities':{mode:'native_pg18',config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false,original_model_pagination_protocol:'native_model_connections_paging_v1'},
  '/__pg_native/api/v2/model-connections?paging=owner_cursor_v1&limit=50':{protocol:'native_model_connections_paging_v1',owner_user_id:employee,snapshot_id:spec,total:0,items:[],next_cursor:null,complete:true},
  '/__pg_native/api/v2/tool-connections':{items:[],execution_enabled:false},
  '/__pg_native/api/v2/agent-autonomous-runs':{items:[]},
  '/__pg_native/api/v2/original-ui/agent-workspace?limit=12':{protocol:'native_original_agent_workspace_v1',scope:'current_user',employee_id:employee,as_of:stamp,items:[],pending_items:[],pending_count:0,agent_run_total:0},
 }
 const t=createOriginalAgentRunTransport({employeeId:employee,verifyEmployee:async()=>employee,transport:async(p,i)=>{requests.push({p,method:i.method});assert.ok(Object.hasOwn(bodies,p),'undeclared fixture route '+p);return json(bodies[p])}})
 const c=createOriginalAgentRunSession({employeeId:employee,api:createPgNativePilotApi(t.transport),models:createOriginalModelConnectionsApi({employeeId:employee,transport:t.transport}),home:createOriginalHomeAgentApi({employeeId:employee,transport:t.transport}),inbox:createOriginalHomeInboxApi(employee,t.transport),verifyEmployee:async()=>employee,confirm:()=>assert.fail('initial render must not confirm or mutate')})
 try{await c.activate();await settle(()=>!c.snapshot().runs.loading);assert.equal(c.snapshot().error,'',JSON.stringify({snapshot:c.snapshot(),requests}));assert.equal(c.snapshot().agents[0].id,spec);assert.equal(c.snapshot().caps.config_writes_enabled,false);assert.equal(c.snapshot().closed,false);assert.equal(c.snapshot().error,'');assert.ok(requests.every(r=>r.method==='GET'))}finally{c.dispose();t.close()}
})
test('original Native hook is statically selected and contains no PB execution or synthesized timeline events',async()=>{
 const {readFile}=await import('node:fs/promises'),legacy=await readFile(new URL('../src/pages/AgentRun/useAgentRun.ts',import.meta.url),'utf8'),hook=await readFile(new URL('../src/pages/AgentRun/usePgOriginalAgentRun.ts',import.meta.url),'utf8')
 assert.match(legacy,/export const useAgentRun=import\.meta\.env\.VITE_AGENT_STUDIO_ORIGINAL_PG_UI_ENABLED==='true'\?usePgOriginalAgentRun:usePocketBaseAgentRun/)
 assert.doesNotMatch(hook,/getPocketBaseUrl|tickAgentRun|vibexAuthHeaders|X-Rh-User-Id|localStorage/)
 assert.match(hook,/originalAgentRunPrivacy\(storedView,accountId\)/)
 assert.match(hook,/view=privacy\.hidden\?null:storedView/)
 assert.match(hook,/runEvents:\[\] as RunEventRow\[\]/)
 assert.match(hook,/费用预览，相关调用保持阻断/)
})

test('original progress uses completed recorded model rounds rather than Native worker step count or tool calls',()=>{
 const d=detail();d.run.step_count=41;d.steps=[{step_key:'model1',status:'succeeded',metadata:{agent_phase:'model',agent_round:1}},{step_key:'tool1',status:'succeeded',metadata:{agent_phase:'tool',agent_round:1}},{step_key:'model2',status:'awaiting_approval',metadata:{agent_phase:'model',agent_round:2}}]
 assert.equal(originalRunDetail(d,employee).current_step,1);assert.equal(originalRunDetail(d,employee).max_steps,3)
 d.steps_truncated=true;assert.throws(()=>originalRunDetail(d,employee));d.steps_truncated=false;d.run.checkpoint.max_steps=1;d.steps.push({step_key:'model2',status:'succeeded',metadata:{agent_phase:'model',agent_round:2}});assert.throws(()=>originalRunDetail(d,employee))
})
test('the original history gets actual full run budgets and model rounds instead of displaying fabricated zero limits',async()=>{
 const f=fixture();try{await f.c.activate();await settle(()=>!f.c.snapshot().loading&&!f.c.snapshot().runs.loading);const h=f.c.snapshot().runHistory;assert.equal(h.length,1);assert.equal(h[0].max_steps,3);assert.equal(h[0].native_projection.kind,'owned_detail');assert.equal(h[0].current_step,0)}finally{f.c.dispose()}
})

test('current Native question/plan response keeps its real source hashes and unknown responses only confirm the original',async()=>{
 const prompts=[],f=fixture({caps:{agent_human_input_available:true,agent_human_responses_enabled:true},confirm:p=>{prompts.push(p);return true}}),d=detail()
 d.run.status='awaiting_input';d.pending_effect=null;d.human_input_evidence_current=true;d.human_input_current=true;d.human_input={pending_step_key:'wf2_00002_demo_input',pending_sha256:hash,source_sha256:'b'.repeat(64),kind:'clarification',question:'Which synthetic source?',draft:'',round:1};f.setDetail(d)
 try{await f.start();assert.equal(f.c.snapshot().activeRun.status,'awaiting_input');await f.c.respond('reply','Only DEMO');assert.ok(f.c.snapshot().runs.pendingHumanResponse);await f.c.respond('reply','replacement must not overwrite');assert.deepEqual(f.calls.map(c=>c.kind),['human-response','human-confirm']);assert.deepEqual(f.calls[1].choice,f.calls[0].choice);assert.equal(f.calls[0].choice.source_sha256,'b'.repeat(64));assert.equal(prompts[0].step_key,'wf2_00002_demo_input');assert.equal(prompts[0].purpose,'human')}finally{f.c.dispose()}
})
test('a current Home title update cannot rewrite the label of a historical full Native run',()=>{
 const first=agent(),renamed={...agent(),name:'A NEW CURRENT TITLE',revision:2};const a=originalRunAgent(first,employee),b=originalRunAgent(renamed,employee),historic=originalRunDetail(detail(),employee)
 assert.notEqual(a.name,b.name);assert.equal(historic.spec_name.includes('CURRENT TITLE'),false);assert.equal(historic.spec_name.includes('A NEW CURRENT TITLE'),false);assert.equal(historic.model,'gpt-demo')
})

test('an unknown run admission keeps its actual frozen draft/key and never resubmits',async()=>{
 const prompts=[],f=fixture({confirm:p=>{prompts.push(p);return true}})
 try{await f.c.activate();await settle(()=>!f.c.snapshot().loading&&!f.c.snapshot().runs.loading);await f.c.selectAgent(spec);await settle(()=>!f.c.snapshot().memories.loading);await f.c.submit('ORIGINAL DEMO',3);assert.ok(f.c.snapshot().runs.pendingSubmit);const original=f.c.snapshot().runs.pendingSubmit;await f.c.submit('CHANGED MUST NOT REPLACE',9);assert.equal(f.calls.length,1);assert.deepEqual(f.c.snapshot().runs.pendingSubmit,original);assert.equal(prompts.length,1);assert.match(f.c.snapshot().error,/不重新提交/)}finally{f.c.dispose()}
})
test('closed transport uses the existing respond paths and never grants alternate human-response routes',()=>{
 assert.equal(originalAgentRunRoute('/__pg_native/api/v2/agent-autonomous-runs/'+run+'/respond','POST'),true)
 assert.equal(originalAgentRunRoute('/__pg_native/api/v2/agent-autonomous-runs/'+run+'/respond-confirm','POST'),true)
 assert.equal(originalAgentRunRoute('/__pg_native/api/v2/agent-autonomous-runs/'+run+'/human-response','POST'),false)
})

test('temporary identity verification failure hides private data but preserves the exact unresolved control for the same verified employee',async()=>{
 const f=fixture();try{await f.start();await f.c.control('pause');const original=f.c.snapshot().runs.pendingRunControl;f.setUnavailable(true);await assert.rejects(f.c.poll());const hidden=f.c.snapshot();assert.equal(hidden.suspended,true);assert.equal(hidden.closed,false);assert.equal(hidden.activeRun,null);assert.deepEqual(hidden.agents,[]);assert.deepEqual(hidden.models,[]);assert.equal(hidden.runs.pendingRunControl,undefined);assert.match(hidden.error,/仍保留/);assert.equal(f.calls.length,1);f.setUnavailable(false);await f.c.verifyIdentity();assert.equal(f.c.snapshot().suspended,false);assert.deepEqual(f.c.snapshot().runs.pendingRunControl,original);await f.c.control('resume');assert.equal(f.calls[1].kind,'control-confirm');assert.equal(f.calls[1].action,'pause');assert.deepEqual(f.calls[1].body,original.body)}finally{f.c.dispose()}
})
