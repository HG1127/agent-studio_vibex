import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeAgentRunSession} from "../src/lib/pgNativeAgentRunSession.ts"
import {PgNativePilotError} from "../src/lib/pgNativePilotApi.ts"
const agent="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222",other="33333333-3333-4333-8333-333333333333"
const run=(changes={})=>({id,agent_spec_id:agent,owner_user_id:other,status:"succeeded",instruction:"Private task",result_text:"Retained knowledge result",
  checkpoint:{spec_revision:1},step_count:2,last_error_code:"",created_at:"2026-10-24T00:00:00Z",updated_at:"2026-10-24T00:00:00Z",...changes})
const detail=(value=run(),status=null)=>({run:value,steps:[],approval:status?{step_key:"model",status}:null})
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function fixture(changes={}){
  const calls={submit:[],decide:[],get:[]}
  const api={listRuns:async()=>[run()],getRun:async value=>{calls.get.push(value);return detail(run({id:value}))},
    submitRun:async(...args)=>{calls.submit.push(args);return {run:run({instruction:args[1]}),replayed:false}},
    decideModel:async(...args)=>{calls.decide.push(args);return {run:run(),approval:args[1],replayed:false}},...changes}
  const model=createPgNativeAgentRunSession(api,{key:()=>"synthetic-single-shot-request"})
  return {model,api,calls}
}

test("hiding clears all result-bearing payloads and returning waits for a fresh authorization read",async()=>{
  const {model,api}=fixture()
  await model.setActive(true);await model.select(id)
  assert.equal(model.snapshot().detail.run.result_text,"Retained knowledge result")
  await model.setActive(false)
  assert.deepEqual(model.snapshot().runs,[]);assert.equal(model.snapshot().detail,null)
  const held=defer();api.getRun=()=>held.promise
  const returning=model.setActive(true)
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
  held.reject(new PgNativePilotError(404,"knowledge_access_revoked"));await returning
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
})

test("a pre-hide read cannot overwrite a fresh result after hide and return",async()=>{
  const {model,api}=fixture();await model.setActive(true);await model.select(id)
  const held=defer();api.getRun=()=>held.promise
  const old=model.refresh();await model.setActive(false)
  api.getRun=async()=>detail(run({result_text:"Fresh server projection"}))
  await model.setActive(true)
  held.resolve(detail());await old
  assert.equal(model.snapshot().detail.run.result_text,"Fresh server projection")
})

test("late submit while hidden retains its identifier without storing the POST result",async()=>{
  const held=defer(),{model,api}=fixture({submitRun:()=>held.promise})
  await model.setActive(true)
  const submitting=model.submit({agentId:agent,instruction:"Private task"});await flush()
  await model.setActive(false);held.resolve({run:run(),replayed:false});await submitting
  assert.equal(model.snapshot().pending,null);assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
  api.getRun=async()=>{throw new PgNativePilotError(404,"revoked")}
  await model.setActive(true)
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
})

test("late POST from an earlier visibility period displays only a new GET projection",async()=>{
  const post=defer(),get=defer(),{model,api}=fixture({submitRun:()=>post.promise})
  await model.setActive(true)
  const submitting=model.submit({agentId:agent,instruction:"Private task"});await flush()
  await model.setActive(false);await model.setActive(true)
  api.getRun=()=>get.promise;post.resolve({run:run(),replayed:false});await flush()
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
  get.resolve(detail(run({result_text:"Current result"})));await submitting
  assert.equal(model.snapshot().detail.run.result_text,"Current result")
})

test("hidden ambiguous submission preserves the exact request and coalesces duplicate recovery",async()=>{
  const failed=defer(),{model,api,calls}=fixture({submitRun:async(...args)=>{calls.submit.push(args);return failed.promise}})
  await model.setActive(true)
  const first=model.submit({agentId:agent,instruction:" Private task "})
  assert.equal(model.submit({agentId:other,instruction:"Changed"}),first);await flush()
  await model.setActive(false);failed.reject(new PgNativePilotError(0,"response_lost"));await first
  assert.equal(model.snapshot().pending.instruction,"Private task");assert.equal(Object.isFrozen(model.snapshot().pending),true)
  await model.setActive(true)
  api.submitRun=async(...args)=>{calls.submit.push(args);return {run:run(),replayed:true}}
  await model.submit({agentId:other,instruction:"Must not replace original"})
  assert.deepEqual(calls.submit[0],calls.submit[1]);assert.equal(calls.submit.length,2)
  assert.equal(model.snapshot().pending,null);assert.match(model.snapshot().notice,/未创建重复任务/)
})

test("malformed successful submit remains recoverable rather than discarding its key",async()=>{
  const {model,api,calls}=fixture({submitRun:async(...args)=>{calls.submit.push(args);return {run:run({checkpoint:null}),replayed:false}}})
  await model.setActive(true);await model.submit({agentId:agent,instruction:"Private task"})
  assert.ok(model.snapshot().pending);assert.equal(model.snapshot().detail,null)
  api.submitRun=async(...args)=>{calls.submit.push(args);return {run:run(),replayed:true}}
  await model.submit({agentId:other,instruction:"Changed"})
  assert.deepEqual(calls.submit[0],calls.submit[1]);assert.equal(model.snapshot().pending,null)
})

test("approval requires consent and an ambiguous decision cannot be changed across navigation",async()=>{
  const awaiting=detail(run({status:"awaiting_approval",result_text:""}),"pending")
  const {model,api,calls}=fixture({getRun:async()=>awaiting,decideModel:async(...args)=>{calls.decide.push(args);throw new PgNativePilotError(0,"lost")}})
  await model.setActive(true);await model.select(id)
  await model.decide("approved");assert.equal(calls.decide.length,0)
  await model.decide("approved",true);assert.deepEqual(model.snapshot().decision,{id,value:"approved"})
  await model.setActive(false);assert.equal(model.snapshot().detail,null);assert.ok(model.snapshot().decision)
  await model.setActive(true);await model.decide("rejected",true);assert.equal(calls.decide.length,1)
  api.getRun=async()=>detail(run({status:"queued",result_text:""}),"approved")
  await model.refresh();assert.equal(model.snapshot().decision,null)
})

test("late approval response cannot put hidden result data back into memory",async()=>{
  const held=defer(),{model}=fixture({getRun:async()=>detail(run({status:"awaiting_approval",result_text:""}),"pending"),decideModel:()=>held.promise})
  await model.setActive(true);await model.select(id)
  const deciding=model.decide("approved",true);await flush();await model.setActive(false)
  held.resolve({run:run(),approval:"approved",replayed:false});await deciding
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[]);assert.equal(model.snapshot().decision,null)
})

test("disposal destroys payloads and recovery; an old request cannot hydrate a replacement lifetime",async()=>{
  const held=defer(),{model}=fixture({submitRun:()=>held.promise})
  await model.setActive(true);const submitting=model.submit({agentId:agent,instruction:"Private task"});await flush()
  model.dispose();const fresh=fixture({listRuns:async()=>[]}).model;await fresh.setActive(true)
  held.resolve({run:run(),replayed:false});await submitting
  for(const controller of [model,fresh]){assert.deepEqual(controller.snapshot().runs,[]);assert.equal(controller.snapshot().detail,null);assert.equal(controller.snapshot().pending,null)}
})

test("an expired session clears cached data and recovery and refuses later operations",async()=>{
  const {model,api,calls}=fixture();await model.setActive(true);await model.select(id)
  api.getRun=async()=>{throw new PgNativePilotError(401,"expired")}
  await model.refresh();await model.setActive(true);await model.submit({agentId:agent,instruction:"Private task"})
  assert.equal(calls.submit.length,0);assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
  assert.equal(model.snapshot().pending,null);assert.match(model.snapshot().error,/登录已失效/)
})

test("mismatched detail or invalid history fails closed and older concurrent reads cannot win",async()=>{
  const {model,api}=fixture();await model.setActive(true)
  const held=defer();api.getRun=()=>held.promise;const old=model.select(id)
  api.getRun=async()=>detail(run({id:other,result_text:"New selected run"}));await model.select(other)
  held.resolve(detail());await old
  assert.equal(model.snapshot().detail.run.id,other)
  api.getRun=async()=>detail();await model.refresh()
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
  api.listRuns=async()=>[{...run(),status:"malformed"}];await model.refresh()
  assert.equal(model.snapshot().detail,null);assert.deepEqual(model.snapshot().runs,[])
})
