// Pure source/control-flow tests only: no SQL, listener, browser or provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readOwnTaskTarget,isOwnTaskTarget,ownTaskTargetResource,verifyOwnTaskRun,verifyOwnTaskSchedule,watchPgNativeOriginalTaskController,registerPgNativeOriginalTaskGuard,pgNativeOriginalTasksBlocked,subscribePgNativeOriginalTasks,pgNativeOriginalTaskScopeKey,createOwnTaskTargetDelivery} from '../src/lib/pgNativeOwnTaskNavigation.ts'
import {createPgNativeAgentRunSession} from '../src/lib/pgNativeAgentRunSession.ts'
import {createPgNativeAutonomousAgentSession} from '../src/lib/pgNativeAutonomousAgentSession.ts'
import {createPgNativeWorkflowRunSession} from '../src/lib/pgNativeWorkflowRunSession.ts'
import {createPgNativeWorkflowDebugSession} from '../src/lib/pgNativeWorkflowDebugSession.ts'
import {createPgNativeFeedbackSession} from '../src/lib/pgNativeAgentFeedbackSession.ts'
import {createPgNativePilotApi,PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {choice,run as feedbackRun,request,receiptFor,statusFor,emptyStatus} from './helpers/pg-native-feedback-fixture.mjs'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),alice=id(1),bob=id(2),resourceId=id(10),runId=id(20),scheduleId=id(30),at='2026-10-27T01:02:03.123Z'
const tick=()=>new Promise(done=>setImmediate(done)),clone=v=>structuredClone(v)
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
function fixture(){
 const calls=[],resource={id:resourceId,owner_user_id:alice,name:'Actual current owner resource',revision:7,spec:{goal:'current',tools:[]},graph:{version:2,nodes:[],edges:[]}}
 const base={id:runId,owner_user_id:alice,kind:'agent',agent_spec_id:resourceId,status:'succeeded',instruction:'actual task',result_text:'actual delivery',step_count:1,last_error_code:'',created_at:at,updated_at:at,finished_at:at,checkpoint:{spec_revision:5}}
 const single={run:clone(base),steps:[],approval:null}
 const auto={run:{...clone(base),workflow_id:null,checkpoint:{spec_revision:5,execution_mode:'agent_native_v2',max_steps:3}},execution_mode:'agent_native_v2',steps:[],approvals:[],pending_effect:null,replayed:false}
 const wf={run:{...clone(base),kind:'workflow',agent_spec_id:null,workflow_id:resourceId,checkpoint:{workflow_revision:5,execution_mode:'workflow_native_v2'}},execution_mode:'workflow_native_v2',steps:[],approvals:[],pending_effect:null,replayed:false}
 const safe={...clone(wf),run:{...clone(wf.run),checkpoint:{workflow_revision:5,execution_mode:'start_end_only'}},execution_mode:'start_end_only',job_status:'succeeded',external_effects_executed:false}
 const schedule={id:scheduleId,kind:'agent',agent_spec_id:resourceId,workflow_id:null,name:'Actual schedule',time_zone:'UTC',revision:3,enabled:true,recurrence:{config_format:'pg_schedule_execution_v2'},next_at:at,created_at:at,updated_at:at}
 const read=(name,body)=>async key=>{calls.push([name,key]);return clone(body)}
 const api={getRun:read('single',single),getAutonomousAgentRun:read('auto',auto),getWorkflowV2Run:read('workflow',wf),getWorkflowRun:read('safe',safe),getAgent:read('agent',resource),getWorkflow:read('flow',resource),getSchedule:read('schedule',schedule),listRuns:async()=>[],listAutonomousAgentRuns:async()=>[],listWorkflowV2Runs:async()=>[],submitRun:async()=>{throw new PgNativePilotError(0,'lost')},submitAutonomousAgentRun:async()=>{throw new PgNativePilotError(0,'lost')},submitWorkflowV2Run:async()=>{throw new PgNativePilotError(0,'lost')},decideModel:async()=>assert.fail('no mutation from navigation'),decideAutonomousAgentNode:async()=>assert.fail('no mutation from navigation'),cancelAutonomousAgentRun:async()=>assert.fail('no cancel from navigation'),decideWorkflowV2Node:async()=>assert.fail('no mutation from navigation'),cancelWorkflowV2Run:async()=>assert.fail('no cancel from navigation')}
 return {api,calls,resource,single,auto,wf,safe,schedule}
}
const requested=kind=>kind==='schedule'?{kind,scheduleId}:{kind,runId,resourceId}

test('all five destinations read exact IDs and actual resource revisions without scanning recent lists',async()=>{
 for(const kind of ['agent_single','agent_autonomous','workflow_v2','workflow_safe','schedule']){
  const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested(kind),1)
  assert.ok(isOwnTaskTarget(target,f.api));assert.ok(Object.isFrozen(target));assert.equal(target.ownerId,alice);assert.equal(target.resourceRevision,7)
  assert.equal(target.kind,kind);assert.equal(kind==='schedule'?target.scheduleRevision:target.runRevision,kind==='schedule'?3:5)
  assert.equal(f.calls.length,2);assert.ok(f.calls.every(([name])=>!name.startsWith('list')))
  const resource=ownTaskTargetResource(f.api,target);assert.equal(resource.name,'Actual current owner resource');resource.revision=999;assert.equal(ownTaskTargetResource(f.api,target).revision,7)
 }
})
test('queued source absence stays explicit null and never borrows the current resource revision',async()=>{
 const f=fixture();f.single.run.checkpoint={};f.single.run.status='queued'
 const target=await readOwnTaskTarget(f.api,alice,requested('agent_single'),1)
 assert.equal(target.runRevision,null);assert.equal(target.resourceRevision,7)
 await verifyOwnTaskRun(f.api,target,f.single)
 f.single.run.checkpoint.spec_revision=7
 await assert.rejects(()=>verifyOwnTaskRun(f.api,target,f.single),/source_unconfirmed/)
})
test('forged metadata, extra destination fields, wrong owner/resource/mode and malformed revision refuse',async()=>{
 for(const mutate of [f=>{f.single.run.owner_user_id=bob},f=>{f.single.run.agent_spec_id=id(99)},f=>{f.single.run.kind='workflow'},f=>{f.single.run.checkpoint.execution_mode='agent_native_v2'},f=>{f.single.run.checkpoint.spec_revision='5'},f=>{f.resource.revision=0},f=>{f.resource.owner_user_id=bob},f=>{f.resource.id=id(99)}]){
  const f=fixture();mutate(f);await assert.rejects(()=>readOwnTaskTarget(f.api,alice,requested('agent_single'),1),/source_unconfirmed/)
 }
 const f=fixture();await assert.rejects(()=>readOwnTaskTarget(f.api,alice,{...requested('agent_single'),href:'https://foreign.invalid'},1))
 assert.equal(f.calls.length,0)
})
test('targets cannot be cloned, cross API instances or become authority after resource drift',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('agent_autonomous'),1)
 assert.equal(isOwnTaskTarget(clone(target)),false)
 const next={...f.api};assert.equal(isOwnTaskTarget(target,next),false)
 await assert.rejects(()=>verifyOwnTaskRun(next,target,f.auto))
 f.resource.revision=8;await assert.rejects(()=>verifyOwnTaskRun(f.api,target,f.auto))
 assert.equal(pgNativeOriginalTaskScopeKey(f.api),pgNativeOriginalTaskScopeKey(f.api));assert.notEqual(pgNativeOriginalTaskScopeKey(f.api),pgNativeOriginalTaskScopeKey(next))
})
test('an employee/API lifetime fence denies before I/O and after a held source response',async()=>{
 const f=fixture();await assert.rejects(()=>readOwnTaskTarget(f.api,alice,requested('workflow_v2'),1,()=>false));assert.equal(f.calls.length,0)
 const gate=deferred();let current=true;f.api.getWorkflowV2Run=()=>gate.promise
 const work=readOwnTaskTarget(f.api,alice,requested('workflow_v2'),2,()=>current)
 current=false;gate.resolve(f.wf);await assert.rejects(work,/source_unconfirmed/)
})
test('single Agent actual controller opens older run not present in its bounded list',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('agent_single'),1),model=createPgNativeAgentRunSession(f.api)
 try{await model.setActive(true);assert.deepEqual(model.snapshot().runs,[]);assert.equal(await model.selectOriginal(target),true);assert.equal(model.snapshot().detail.run.id,runId);assert.equal(model.snapshot().pending,null);assert.ok(f.calls.filter(([n])=>n==='single').length>=2);assert.ok(f.calls.filter(([n])=>n==='agent').length>=2)}finally{model.dispose()}
})
test('autonomous and workflow actual controllers re-read original kind/resource/revision before publishing',async()=>{
 for(const [kind,factory] of [['agent_autonomous',createPgNativeAutonomousAgentSession],['workflow_v2',createPgNativeWorkflowRunSession]]){
  const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested(kind),1),model=factory(f.api)
  try{model.setActive(true);await tick();assert.equal(await model.selectOriginal(target),true);assert.equal(model.snapshot().detail.run.id,runId);assert.deepEqual(model.snapshot().runs,[]);assert.equal(model.snapshot().pendingSubmit,null)}finally{model.dispose()}
 }
})
test('current resource revision change during controller admission cannot fake an opened task',async()=>{
 for(const [kind,factory] of [['agent_single',createPgNativeAgentRunSession],['agent_autonomous',createPgNativeAutonomousAgentSession],['workflow_v2',createPgNativeWorkflowRunSession]]){
  const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested(kind),1),model=factory(f.api);f.resource.revision++
  try{await model.setActive(true);await tick();assert.equal(await model.selectOriginal(target),false);assert.equal(model.snapshot().detail,null);assert.ok(model.snapshot().error)}finally{model.dispose()}
 }
})
test('a single-run unconfirmed original blocks both list select and external navigation even while hidden',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('agent_single'),1),model=createPgNativeAgentRunSession(f.api),unwatch=watchPgNativeOriginalTaskController(f.api,model)
 try{
  await model.setActive(true);await model.submit({agentId:resourceId,instruction:'original exact request'})
  const original=clone(model.snapshot().pending),reads=f.calls.length;assert.ok(original);assert.equal(await model.selectOriginal(target),false);await model.select(runId);assert.equal(f.calls.length,reads)
  await model.setActive(false);assert.equal(pgNativeOriginalTasksBlocked(f.api),true);assert.deepEqual(model.snapshot().pending,original)
 }finally{unwatch();model.dispose()}
 assert.equal(pgNativeOriginalTasksBlocked(f.api),false)
})
test('durable original submission remains unchanged across tabs and denied external target',async()=>{
 for(const [kind,factory,draft] of [['agent_autonomous',createPgNativeAutonomousAgentSession,{agentId:resourceId,revision:7,instruction:'original autonomous',maxSteps:3}],['workflow_v2',createPgNativeWorkflowRunSession,{workflowId:resourceId,revision:7,instruction:'original workflow'}]]){
  const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested(kind),1),model=factory(f.api),unwatch=watchPgNativeOriginalTaskController(f.api,model)
  try{model.setActive(true);await tick();await model.submit(draft);const original=clone(model.snapshot().pendingSubmit);assert.ok(original);assert.equal(await model.selectOriginal(target),false);model.setActive(false);assert.equal(pgNativeOriginalTasksBlocked(f.api),true);model.setActive(true);await tick();assert.deepEqual(model.snapshot().pendingSubmit,original);await model.select(runId);assert.deepEqual(model.snapshot().pendingSubmit,original)}finally{unwatch();model.dispose()}
 }
})
test('hidden actual feedback original is visible to the guard even when public snapshot is empty',async()=>{
 const api={getAgentFeedback:async()=>emptyStatus(),changeAgentFeedback:async()=>{throw new PgNativePilotError(0,'lost')},confirmAgentFeedback:async body=>receiptFor(body,{replayed:true})}
 const model=createPgNativeFeedbackSession(api,{key:()=>request}),unwatch=watchPgNativeOriginalTaskController(api,model)
 try{
  model.setScopes({available:true,submit:true,lessons:true});model.setActive(true);await model.select(feedbackRun)
  await model.submit({rating:choice.rating,tags:choice.tags,comment:choice.comment,remember_lesson:choice.remember_lesson},true)
  assert.ok(model.snapshot().pending);model.setActive(false);assert.equal(model.snapshot().pending,null);assert.equal(model.navigationBlocked(),true);assert.equal(pgNativeOriginalTasksBlocked(api),true)
  model.setActive(true);await tick();api.getAgentFeedback=async()=>statusFor();await model.confirm();assert.equal(model.snapshot().pending,null)
 }finally{unwatch();model.dispose()}
 assert.equal(pgNativeOriginalTasksBlocked(api),false)
})
test('guard registrations fail closed, notify synchronously and are isolated per API',()=>{
 const a={},b={};let held=true,notifications=0;const stop=subscribePgNativeOriginalTasks(a,()=>notifications++)
 const guard=registerPgNativeOriginalTaskGuard(a,()=>held)
 assert.equal(pgNativeOriginalTasksBlocked(a),true);assert.equal(pgNativeOriginalTasksBlocked(b),false);held=false;guard.changed();assert.equal(pgNativeOriginalTasksBlocked(a),false);assert.equal(notifications,2)
 const broken=registerPgNativeOriginalTaskGuard(a,()=>{throw Error('unavailable state')});assert.equal(pgNativeOriginalTasksBlocked(a),true);broken.dispose();guard.dispose();stop();assert.equal(pgNativeOriginalTasksBlocked(a),false)
})
test('schedule target revalidates actual metadata, resource and both revisions, including owner mismatch',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('schedule'),1)
 verifyOwnTaskSchedule(f.api,target,f.schedule,f.resource)
 for(const schedule of [{...f.schedule,revision:4},{...f.schedule,agent_spec_id:id(99)},{...f.schedule,owner_user_id:bob}])assert.throws(()=>verifyOwnTaskSchedule(f.api,target,schedule,f.resource))
 assert.throws(()=>verifyOwnTaskSchedule({...f.api},target,f.schedule,f.resource))
 assert.throws(()=>verifyOwnTaskSchedule(f.api,target,f.schedule,{...f.resource,revision:8}))
})
test('own_operations_available defaults false and is independent of write capabilities',async()=>{
 const base={mode:'native_pg18',config_writes_enabled:false,model_probe_enabled:false,run_execution_enabled:false},read=value=>createPgNativePilotApi(async()=>new Response(JSON.stringify(value))).getConfigCapabilities()
 assert.equal((await read(base)).own_operations_available,false)
 assert.equal((await read({...base,own_operations_available:true})).own_operations_available,true)
 for(const value of [null,0,'true',{}])await assert.rejects(()=>read({...base,own_operations_available:value}),error=>error.code==='invalid_native_capabilities')
})
test('effect setup-cleanup-setup on the same actual read scope consumes one busy in-flight result',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('schedule'),1),delivery=createOwnTaskTargetDelivery(),scope={},gate=deferred(),seen=[];let reads=0
 const cleanup=delivery.attach(scope,target,()=>{reads++;return gate.promise},value=>seen.push(['first',value]))
 await tick();cleanup()
 const stop=delivery.attach(scope,target,()=>assert.fail('must not invoke a second busy read'),value=>seen.push(['second',value]))
 gate.resolve(true);await tick();assert.equal(reads,1);assert.deepEqual(seen,[['second',true]])
 stop();const again=delivery.attach(scope,target,()=>assert.fail('completed source must not reopen task'),value=>seen.push(['replayed-setup',value]));await tick();again()
 assert.deepEqual(seen,[['second',true],['replayed-setup',true]])
})
test('StrictMode controller cleanup/setup replaces a disposed Workflow reader and only current setup settles',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('workflow_v2'),1),delivery=createOwnTaskTargetDelivery(),gate=deferred(),seen=[]
 const first=createPgNativeWorkflowRunSession(f.api);first.setActive(true);await tick()
 const actualGet=f.api.getWorkflowV2Run;f.api.getWorkflowV2Run=()=>gate.promise
 const cleanup=delivery.attach(first,target,()=>first.selectOriginal(target),value=>seen.push(['disposed',value]));await tick()
 cleanup();first.dispose();f.api.getWorkflowV2Run=actualGet
 const second=createPgNativeWorkflowRunSession(f.api);second.setActive(true)
 const stop=delivery.attach(second,target,()=>second.selectOriginal(target),value=>seen.push(['current',value]));await tick();gate.resolve(f.wf);await tick()
 try{assert.deepEqual(seen,[['current',true]]);assert.equal(second.snapshot().detail.run.id,runId)}finally{stop();second.dispose()}
})
test('conditional readonly mount gets a new read scope after cleanup and cannot deliver its stale schedule GET',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('schedule'),1),delivery=createOwnTaskTargetDelivery(),gate=deferred(),seen=[];let epoch=1
 const firstScope={},originalGet=f.api.getSchedule;f.api.getSchedule=()=>gate.promise
 const read=async expected=>{const schedule=await f.api.getSchedule(scheduleId);if(expected!==epoch)return false;const resource=await f.api.getAgent(resourceId);if(expected!==epoch)return false;verifyOwnTaskSchedule(f.api,target,schedule,resource);return true}
 const cleanup=delivery.attach(firstScope,target,()=>read(1),value=>seen.push(['stale',value]));await tick();cleanup();epoch++;f.api.getSchedule=originalGet
 const stop=delivery.attach({},target,()=>read(2),value=>seen.push(['current',value]));await tick();gate.resolve(f.schedule);await tick();stop()
 assert.deepEqual(seen,[['current',true]])
})
test('real unmount subscription cleanup denies a late target settlement',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('agent_autonomous'),1),delivery=createOwnTaskTargetDelivery(),gate=deferred(),seen=[]
 const cleanup=delivery.attach({},target,()=>gate.promise,value=>seen.push(value));await tick();cleanup();gate.resolve(true);await tick();assert.deepEqual(seen,[])
})

test('actual node-debug unknown submit remains guarded while hidden and cannot replace its original samples',async()=>{
 const f=fixture(),target=await readOwnTaskTarget(f.api,alice,requested('workflow_v2'),1),posts=[]
 f.api.submitWorkflowNodeDebug=async(id,body)=>{posts.push(clone({id,body}));throw new PgNativePilotError(0,'lost_debug_response')}
 const model=createPgNativeWorkflowDebugSession(f.api,{key:()=> 'original-debug-key'})
 try{
  model.setActive(true);await model.refresh()
  const draft={workflowId:resourceId,revision:7,nodeId:'model',samples:{input:'Original debug task',outputs:{source:'Frozen private sample'}}}
  await model.submit(draft);const original=clone(model.snapshot().pendingSubmit)
  assert.ok(original);assert.equal(pgNativeOriginalTasksBlocked(f.api),true)
  draft.samples.input='Changed caller task';draft.samples.outputs.source='Changed caller sample'
  model.setActive(false);assert.equal(pgNativeOriginalTasksBlocked(f.api),true);assert.deepEqual(clone(model.snapshot().pendingSubmit),original)
  model.setActive(true);await model.refresh();const reads=f.calls.length
  assert.equal(await model.selectOriginal(target),false);await model.select(id(99));assert.equal(f.calls.length,reads)
  await model.submit({...draft,nodeId:'another-node',revision:99})
  assert.deepEqual(posts[0],posts[1]);assert.deepEqual(clone(model.snapshot().pendingSubmit),original)
 }finally{model.dispose()}
 assert.equal(pgNativeOriginalTasksBlocked(f.api),false)
})

test('actual node-debug unknown decision blocks Own navigation until the exact original decision is confirmed',async()=>{
 const f=fixture(),decisions=[]
 f.wf.run.status='awaiting_approval';f.wf.run.checkpoint.node_debug={node_id:'model'}
 f.wf.pending_effect={step_key:'debug:model:1',input_sha256:'a'.repeat(64),kind:'model',configuration:{},missing:[]}
 f.api.decideWorkflowV2Node=async(...args)=>{decisions.push(clone(args));throw new PgNativePilotError(0,'lost_debug_decision')}
 const model=createPgNativeWorkflowDebugSession(f.api)
 try{
  model.setActive(true);await model.select(runId);await model.decide('rejected')
  const original=clone(model.snapshot().pendingMutation);assert.ok(original);assert.equal(pgNativeOriginalTasksBlocked(f.api),true)
  model.setActive(false);assert.equal(pgNativeOriginalTasksBlocked(f.api),true);assert.deepEqual(model.snapshot().pendingMutation,original)
  model.setActive(true);await model.refresh();assert.deepEqual(model.snapshot().pendingMutation,original)
  f.wf.run.status='paused';f.wf.pending_effect=null
  f.wf.approvals=[{step_key:original.step,status:'rejected'}]
  f.wf.decision_confirmation={run_id:runId,step_key:original.step,input_sha256:original.hash,status:'rejected'}
  f.api.decideWorkflowV2Node=async(...args)=>{decisions.push(clone(args));return clone(f.wf)}
  await model.retryMutation();assert.deepEqual(decisions[0],decisions[1]);assert.equal(model.snapshot().pendingMutation,null)
  assert.equal(pgNativeOriginalTasksBlocked(f.api),false)
 }finally{model.dispose()}
})

test('actual node-debug active read blocks only its API and its real controller cleanup releases the guard',async()=>{
 const f=fixture(),gate=deferred();f.api.listWorkflowV2Runs=()=>gate.promise
 const model=createPgNativeWorkflowDebugSession(f.api)
 model.setActive(true);assert.equal(model.snapshot().loading,true);assert.equal(pgNativeOriginalTasksBlocked(f.api),true)
 assert.equal(pgNativeOriginalTasksBlocked({...f.api}),false)
 model.dispose();gate.resolve([]);await tick();assert.equal(pgNativeOriginalTasksBlocked(f.api),false)
})
