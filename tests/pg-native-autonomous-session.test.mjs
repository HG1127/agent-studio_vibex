import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeAutonomousAgentSession,autonomousApprovalReady,autonomousReview} from "../src/lib/pgNativeAutonomousAgentSession.ts"
import {createPgNativePilotApi,PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
const agent="11111111-1111-4111-8111-111111111111",run="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333"
const hash="a".repeat(64),step="wf2_00002_agent_a01m"
const draft={agentId:agent,revision:2,instruction:" First task ",maxSteps:3}
const pending=()=>({step_key:step,input_sha256:hash,kind:"model",node_id:"agent",input:'{"task":"First task","history":[],"think":"PRIVATE_REASONING"}',configuration:{model_binding:{connection_id:other,connection_revision:2,model_id:"synthetic"}},missing:[],agent_context:{parent_step_key:"wf2_00002_agent",round:1,phase:"model"}})
const detail=(status="awaiting_approval")=>({execution_mode:"agent_native_v2",replayed:false,
  run:{id:run,kind:"agent",workflow_id:null,agent_spec_id:agent,instruction:"First task",status,checkpoint:{spec_revision:2,max_steps:3},result_text:"",step_count:0},
  approvals:[{step_key:step,status:"pending"}],steps:[],steps_truncated:false,pending_effect:pending()})
const summary=()=>({id:run,agent_spec_id:agent,status:"awaiting_approval",instruction_preview:"First task",result_preview:""})
function fake(){let record=detail();const calls=[];return {calls,get record(){return record},set record(value){record=value},
  api:{listAutonomousAgentRuns:async()=>[summary()],getAutonomousAgentRun:async()=>record,
    submitAutonomousAgentRun:async(...args)=>{calls.push(["submit",...args]);return record},
    decideAutonomousAgentNode:async(_id,decision)=>{calls.push(["decision",decision]);record={...record,approvals:[{step_key:step,status:decision}]};return record},
    cancelAutonomousAgentRun:async()=>{calls.push(["cancel"]);record={...record,run:{...record.run,status:"cancelled"}};return record}}}}
const turn=()=>new Promise(resolve=>setImmediate(resolve))
test("autonomous submission coalesces actions and freezes role revision, rounds, task and key after ambiguous loss",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api,{key:()=>"synthetic-native-agent-key"});model.setActive(true);await turn()
  let fail;f.api.submitAutonomousAgentRun=async(...args)=>{f.calls.push(args);return new Promise((_resolve,reject)=>{fail=reject})}
  const first=model.submit(draft),duplicate=model.submit({...draft,agentId:other,revision:99,maxSteps:5})
  assert.equal(first,duplicate);await turn();assert.equal(f.calls.length,1);fail(new PgNativePilotError(0,"lost"));await first
  assert.equal(Object.isFrozen(model.snapshot().pendingSubmit),true)
  const frozen=model.snapshot().pendingSubmit;model.setActive(false);model.setActive(true);await turn()
  f.api.submitAutonomousAgentRun=async(...args)=>{f.calls.push(args);return {...detail(),replayed:true}}
  await model.submit({...draft,instruction:"must not replace",revision:3,maxSteps:1})
  assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(frozen.revision,2);assert.equal(frozen.maxSteps,3);assert.equal(model.snapshot().pendingSubmit,null)
  assert.match(model.snapshot().notice,/未创建重复任务/);model.dispose()
})
test("first definite rejection allows editing; malformed success and later rejection retain the original recovery body",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api);model.setActive(true);await turn()
  f.api.submitAutonomousAgentRun=async()=>{throw new PgNativePilotError(409,"changed")};await model.submit(draft)
  assert.equal(model.snapshot().pendingSubmit,null)
  f.api.submitAutonomousAgentRun=async()=>({...detail(),run:{...detail().run,checkpoint:{spec_revision:2,max_steps:5}}});await model.submit(draft)
  const prior=model.snapshot().pendingSubmit;assert.ok(prior)
  f.api.submitAutonomousAgentRun=async()=>{throw new PgNativePilotError(409,"changed")};await model.submit({...draft,revision:9})
  assert.equal(model.snapshot().pendingSubmit,prior);model.dispose()
})
test("ambiguous approval freezes the step/hash/decision, blocks the next node and reconciles through owner history",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api);model.setActive(true);await turn();await model.select(run)
  await model.decide("approved",false);assert.equal(f.calls.length,0)
  f.api.decideAutonomousAgentNode=async(...args)=>{f.calls.push(args);throw new PgNativePilotError(0,"lost")}
  await model.decide("approved",true);const original=model.snapshot().pendingMutation
  assert.deepEqual(original,{kind:"decision",id:run,decision:"approved",step,hash})
  await model.decide("rejected");await model.cancel();await model.submit(draft);assert.equal(f.calls.length,1)
  f.api.decideAutonomousAgentNode=async(...args)=>{f.calls.push(args);throw new PgNativePilotError(409,"stale")}
  await model.retryMutation();assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(model.snapshot().pendingMutation,original)
  f.record={...detail(),pending_effect:{...pending(),step_key:"wf2_00002_agent_a01t",kind:"tool",input_sha256:"b".repeat(64)},approvals:[{step_key:step,status:"approved"}]}
  await model.refresh();assert.equal(model.snapshot().pendingMutation,null);assert.equal(model.snapshot().detail.pending_effect.kind,"tool");model.dispose()
})
test("cancel recovery remains bound to its original run and never converts an in-flight refusal into success",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api);model.setActive(true);await turn();await model.select(run)
  f.api.cancelAutonomousAgentRun=async()=>{throw new PgNativePilotError(409,"workflow_effect_in_flight")};await model.cancel()
  assert.equal(model.snapshot().pendingMutation,null);assert.equal(model.snapshot().detail.run.status,"awaiting_approval")
  assert.match(model.snapshot().error,/暂时不能取消任务/)
  f.api.cancelAutonomousAgentRun=async()=>{throw new PgNativePilotError(0,"lost")};await model.cancel();await model.select(other)
  assert.equal(model.snapshot().detail.run.id,run);assert.equal(model.snapshot().pendingMutation.id,run)
  f.record={...detail(),run:{...detail().run,status:"cancelled"}};await model.refresh();assert.equal(model.snapshot().pendingMutation,null);model.dispose()
})
test("a disposed employee view and expired Cookie cannot be rehydrated by late submission or reads",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api);model.setActive(true);await turn()
  let finish;f.api.submitAutonomousAgentRun=()=>new Promise(resolve=>{finish=resolve});const work=model.submit(draft);await turn();model.dispose();finish(detail());await work
  assert.equal(model.snapshot().detail,null);assert.equal(model.snapshot().pendingSubmit,null)
  let expirations=0,readDone;const next=createPgNativeAutonomousAgentSession(f.api,{onExpired:()=>{expirations++}})
  f.api.getAutonomousAgentRun=()=>new Promise(resolve=>{readDone=resolve})
  next.setActive(true);await turn();const oldRead=next.select(run);await turn();assert.equal(typeof readDone,"function")
  f.api.listAutonomousAgentRuns=async()=>{throw new PgNativePilotError(401,"expired")}
  await next.refresh();assert.equal(expirations,1);readDone(detail());await oldRead
  await next.submit(draft);assert.equal(next.snapshot().detail,null);next.dispose()
})
test("later reads and mutations fence older reads, with no provider planning trace in review summaries",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api);model.setActive(true);await turn();await model.select(run)
  let finish;f.api.getAutonomousAgentRun=()=>new Promise(resolve=>{finish=resolve});const read=model.refresh();await turn()
  f.api.getAutonomousAgentRun=async()=>f.record
  await model.decide("rejected");finish(detail());await read
  assert.equal(model.snapshot().detail.approvals[0].status,"rejected")
  const review=autonomousReview(pending());assert.equal(review.text,"First task");assert.equal(JSON.stringify(review).includes("PRIVATE_REASONING"),false)
  const role={id:agent,revision:2,spec:{model_binding:{connection_id:other,connection_revision:2,model_id:"synthetic"},tools:["calculate"]}}
  const connection={id:other,revision:2,provider:"openai",base_url:"https://api.openai.com/v1",enabled:true,status:"ok",models:["synthetic"]}
  assert.equal(autonomousApprovalReady(detail(),[role],[connection]),true)
  for(const changed of [{...role,revision:3},{...role,spec:{...role.spec,model_binding:{...role.spec.model_binding,connection_revision:3}}}])
    assert.equal(autonomousApprovalReady(detail(),[changed],[connection]),false)
  model.dispose()
})
test("background reads do not reload the history list; terminal or opposite decisions resolve an uncertain action",async()=>{
  const f=fake(),model=createPgNativeAutonomousAgentSession(f.api);model.setActive(true);await turn();await model.select(run)
  let lists=0;f.api.listAutonomousAgentRuns=async()=>{lists++;return [summary()]}
  f.record={...detail(),run:{...detail().run,status:"running"}}
  await model.poll();assert.equal(lists,0);assert.equal(model.snapshot().detail.run.status,"running")
  assert.equal(model.snapshot().runs[0].status,"running");assert.equal(model.snapshot().loading,false)
  f.api.cancelAutonomousAgentRun=async()=>{throw new PgNativePilotError(0,"lost")};await model.cancel();assert.ok(model.snapshot().pendingMutation)
  f.record={...detail(),run:{...detail().run,status:"succeeded"}};await model.refresh()
  assert.equal(model.snapshot().pendingMutation,null);assert.match(model.snapshot().notice,/无法再取消/)
  f.record=detail();await model.refresh();f.api.decideAutonomousAgentNode=async()=>{throw new PgNativePilotError(0,"lost")};await model.decide("approved",true)
  f.record={...detail(),approvals:[{step_key:step,status:"rejected"}]};await model.refresh()
  assert.equal(model.snapshot().pendingMutation,null);assert.match(model.snapshot().notice,/另一操作/)
  const before=lists;model.setActive(false);await model.poll();assert.equal(lists,before);model.dispose()
})

test("thirty-round client submission preserves the exact consent after loss and rejects31 before sending",async()=>{
  const f=fake(),calls=[]
  const instruction="迁".repeat(1998)+"🚀"
  f.record={...detail(),run:{...detail().run,instruction,checkpoint:{spec_revision:2,max_steps:30}}}
  let lost=true
  f.api.submitAutonomousAgentRun=async(...args)=>{calls.push(args);if(lost){lost=false;throw Error("synthetic_lost_ack")}return f.record}
  const model=createPgNativeAutonomousAgentSession(f.api,{key:()=>"synthetic-thirty-round-key"});model.setActive(true);await turn()
  await model.submit({...draft,instruction,maxSteps:30});assert.equal(model.snapshot().pendingSubmit.maxSteps,30)
  await model.submit({...draft,maxSteps:1,instruction:"Must not replace original"})
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].at(-1),30);assert.equal(model.snapshot().pendingSubmit,null)
  await model.submit({...draft,maxSteps:31});assert.equal(calls.length,2)
  const wire=[]
  const api=createPgNativePilotApi(async(route,init)=>{wire.push({route,init});return new Response(JSON.stringify(f.record),{status:200})})
  await api.submitAutonomousAgentRun(agent,2,instruction,"synthetic-thirty-round-key",30)
  assert.equal(JSON.parse(wire[0].init.body).max_steps,30);assert.equal(JSON.parse(wire[0].init.body).instruction,instruction);assert.equal(wire[0].init.credentials,"same-origin")
  await assert.rejects(api.submitAutonomousAgentRun(agent,2,"First task","synthetic-thirty-round-key",31),e=>e.code==="invalid_agent_max_steps")
  assert.equal(wire.length,1)
})
