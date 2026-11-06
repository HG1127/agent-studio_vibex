// In-memory UI/session tests only. No actual employee, ACL, fee or SQL effects.
import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeAgentPlanWorkflowSession} from "../src/lib/pgNativeAgentPlanWorkflowSession.ts"
import {PgNativeAgentPlanWorkflowError} from "../src/lib/pgNativeAgentPlanWorkflow.ts"
import {browserValues,id,hex,canonical,deferred,node} from "./helpers/agent-plan-workflow-browser-values.mjs"

async function fixture(){
  const f=await browserValues(),calls=[];let ids=0,expired=0,submitted=f.submit,status="available"
  const api={
    source:async raw=>{calls.push(["source",structuredClone(raw)]);return structuredClone(f.sourceResponse)},
    preview:async raw=>{calls.push(["preview",structuredClone(raw)]);return structuredClone(f.preview)},
    submit:async raw=>{calls.push(["submit",structuredClone(raw)]);submitted=raw;return f.receipt(raw)},
    confirm:async raw=>{calls.push(["confirm",structuredClone(raw)]);submitted=raw;return f.receipt(raw,{replayed:true})},
    view:async key=>{calls.push(["view",key]);return f.view(submitted,status)},
    control:async raw=>{calls.push(["control",structuredClone(raw)]);return f.controlReceipt(raw)},
    confirmControl:async raw=>{calls.push(["confirmControl",structuredClone(raw)]);return f.controlReceipt(raw,{replayed:true})},
    previewSave:async raw=>{calls.push(["previewSave",structuredClone(raw)]);return f.savePreview(raw)},
    save:async raw=>{calls.push(["save",structuredClone(raw)]);return f.saveReceipt(raw.intent)},
    confirmSave:async raw=>{calls.push(["confirmSave",structuredClone(raw)]);return f.saveReceipt(raw,{replayed:true})},
  }
  const session=createPgNativeAgentPlanWorkflowSession(api,{employeeId:id(1),scopeKey:"api-one:owner-one:login-epoch-1",requestId:()=>id(200+ ++ids),onExpired:()=>{expired++}})
  const choice={spec_id:f.source.spec_id,generation_model:f.generation_model,instruction:f.choice.instruction,output_token_limit:f.choice.output_token_limit}
  session.setAvailability({available:true,submissions:true,saves:true});session.setActive(true);session.setDraft(choice)
  return {f,api,session,choice,calls,ids:()=>ids,expired:()=>expired,setStatus:v=>{status=v}}
}
async function generated(f){await f.session.preview();f.session.setFeeReviewed(true);await f.session.submit();await f.session.readResult()}
async function saveReady(f){await generated(f);await f.session.previewSave();f.session.setSaveReviewed(true)}
const mutations=f=>f.calls.filter(([name])=>["submit","save","control"].includes(name))

test("default-off session and immutable snapshots perform no implicit reads, fees, save or run",async()=>{
  const f=await browserValues();let calls=0
  const api=new Proxy({},{get(){return async()=>{calls++;throw Error("unexpected")}}})
  const s=createPgNativeAgentPlanWorkflowSession(api,{employeeId:id(1),scopeKey:"login-1"})
  s.setDraft({spec_id:f.source.spec_id,generation_model:f.generation_model,instruction:"x",output_token_limit:4096});await s.preview();await s.submit();await s.save();await s.confirmOriginal()
  assert.equal(calls,0);assert.equal(s.snapshot().choice,null);assert.throws(()=>{s.snapshot().active=true})
})

test("exact own source selection -> preview requires separate explicit fee review and one UUID",async()=>{
  const x=await fixture();await x.session.preview();await x.session.submit();assert.equal(x.ids(),0)
  assert.equal(x.session.snapshot().preview.choice.generation_model.model_id,"generation-only")
  x.session.setSaveReviewed(true);await x.session.submit();assert.equal(x.ids(),0)
  x.session.setFeeReviewed(true);await x.session.submit();await x.session.submit()
  assert.equal(x.ids(),1);assert.equal(mutations(x).length,1);assert.equal(x.session.snapshot().feeReviewed,false)
  assert.deepEqual(x.calls[0],["source",x.f.selection]);assert.equal(Object.hasOwn(x.calls[1][1],"identity"),false)
})

test("actual model topology and execution references survive read and edits; save has independent confirmation",async()=>{
  const x=await fixture();await generated(x)
  assert.equal(canonical(x.session.snapshot().fields.graph),canonical(x.f.graph));assert.equal(x.session.snapshot().fields.graph.nodes[2].data.model_binding.model_id,"execution-only")
  await x.session.previewSave();await x.session.save();assert.equal(x.ids(),1)
  x.session.setFeeReviewed(true);await x.session.save();assert.equal(x.ids(),1)
  const fields=structuredClone(x.session.snapshot().fields);fields.graph.nodes[2].position.x=340;fields.name="员工手工调整"
  x.session.editFields(fields);assert.equal(x.session.snapshot().savePreview,null);assert.equal(x.session.snapshot().saveReviewed,false)
  await x.session.previewSave();x.session.setSaveReviewed(true);await x.session.save();await x.session.save()
  assert.equal(x.ids(),2);assert.equal(x.calls.filter(c=>c[0]==="save").length,1);assert.equal(x.session.snapshot().saveReceipt.workflow_id,id(202))
  assert.deepEqual(Object.keys(x.calls.find(c=>c[0]==="save")[1]),["intent","preview_input"])
  assert.equal(x.calls.some(([name])=>/run|execute|dispatch/.test(name)),false)
})

test("source allowlist, generation-model separation and review floor are retained before save",async()=>{
  const x=await fixture();await generated(x)
  const fields=structuredClone(x.session.snapshot().fields);fields.graph.nodes[2].data.model_binding=x.f.generation_model
  assert.throws(()=>x.session.editFields(fields),/invalid_agent_plan_workflow_value/)
  fields.graph.nodes[2]=node("yes","agent",{prompt:"x",agent_binding:{spec_id:id(77),spec_revision:1}});assert.throws(()=>x.session.editFields(fields))
  fields.graph.nodes[2]=node("yes","agent",{prompt:"x",agent_binding:{spec_id:x.f.source.spec_id,spec_revision:x.f.source.spec_revision},require_plan_review:false});assert.throws(()=>x.session.editFields(fields))
  assert.equal(mutations(x).length,1);assert.equal(x.session.snapshot().savePreview,null)
})

test("every draft or preview update invalidates old fee/save confirmations and delayed source reply",async()=>{
  const x=await fixture();await x.session.preview();x.session.setFeeReviewed(true);await x.session.preview();assert.equal(x.session.snapshot().feeReviewed,false)
  const d=deferred();x.api.source=async()=>d.promise
  const flight=x.session.preview();assert.equal(x.session.snapshot().busy,true)
  const next={...x.choice,instruction:"新的用户要求"};assert.equal(x.session.setDraft(next),true)
  assert.equal(x.session.snapshot().preview,null);assert.equal(x.session.snapshot().feeReviewed,false)
  d.resolve(x.f.sourceResponse);await flight;assert.equal(x.session.snapshot().preview,null);assert.equal(x.session.snapshot().choice.instruction,next.instruction);assert.equal(x.session.snapshot().busy,false)
})

test("unknown generation ACK retains exact full intent; confirmation works with submissions disabled",async()=>{
  const x=await fixture();x.api.submit=async raw=>{x.calls.push(["submit",structuredClone(raw)]);throw new PgNativeAgentPlanWorkflowError(0,"lost_ack")}
  await x.session.preview();x.session.setFeeReviewed(true);await x.session.submit();const pending=x.session.snapshot().pending
  assert.equal(pending.kind,"submit");assert.equal(x.ids(),1);assert.equal(x.session.setDraft({...x.choice,instruction:"new"}),false)
  await x.session.submit();await x.session.readResult();assert.equal(x.calls.filter(c=>c[0]==="submit").length,1)
  x.session.setAvailability({available:true,submissions:false,saves:false});await x.session.confirmOriginal()
  assert.equal(x.session.snapshot().pending,null);assert.deepEqual(x.calls.find(c=>c[0]==="confirm")[1],pending.body);assert.equal(x.ids(),1)
})

test("confirmation absence or malformed confirmation retains original UUID without resubmission",async()=>{
  const x=await fixture();x.api.submit=async()=>{throw new PgNativeAgentPlanWorkflowError(0,"lost_ack")}
  await x.session.preview();x.session.setFeeReviewed(true);await x.session.submit();const key=x.session.snapshot().pending.body.request_id
  x.api.confirm=async()=>{throw new PgNativeAgentPlanWorkflowError(404,"absent",true)};await x.session.confirmOriginal();assert.equal(x.session.snapshot().pending.body.request_id,key)
  x.api.confirm=async raw=>({...await x.f.receipt(raw,{replayed:true}),request_id:id(999)});await x.session.confirmOriginal();assert.equal(x.session.snapshot().pending.body.request_id,key);assert.equal(x.ids(),1)
})

test("unknown save ACK uses save/confirm intent only, permits later Workflow changes and blocks another UUID",async()=>{
  const x=await fixture();await saveReady(x)
  x.api.save=async body=>{x.calls.push(["save",structuredClone(body)]);throw new PgNativeAgentPlanWorkflowError(0,"lost_save_ack")}
  await x.session.save();const pending=x.session.snapshot().pending;assert.equal(pending.kind,"save");assert.equal(x.ids(),2)
  await x.session.save();await x.session.previewSave();assert.equal(x.ids(),2)
  x.session.setAvailability({available:true,submissions:false,saves:false});await x.session.confirmOriginal()
  assert.deepEqual(x.calls.find(c=>c[0]==="confirmSave")[1],pending.body.intent);assert.equal(x.session.snapshot().saveReceipt.workflow_revision,1);assert.equal(x.session.snapshot().pending,null)
  assert.equal(x.calls.some(c=>c[0]==="getWorkflow"),false)
})

test("cancel/erase have explicit own acknowledgement and unknown control ACK only confirms original",async()=>{
  const x=await fixture();await generated(x);await x.session.control("erase",false);assert.equal(x.ids(),1)
  x.api.control=async raw=>{x.calls.push(["control",structuredClone(raw)]);throw new PgNativeAgentPlanWorkflowError(0,"lost_control_ack")}
  await x.session.control("erase",true);const p=x.session.snapshot().pending;assert.equal(p.kind,"control");assert.equal(p.body.action,"erase");assert.match(p.body.acknowledgement,/ERASE_ONLY/)
  await x.session.control("cancel",true);assert.equal(x.ids(),2);await x.session.confirmOriginal();assert.deepEqual(x.calls.find(c=>c[0]==="confirmControl")[1],p.body);assert.equal(x.session.snapshot().fields,null);assert.equal(x.session.snapshot().controlReceipt.state,"erased")
})

test("pending/unknown/unavailable/erased/stale results never yield editable or saveable fields",async()=>{
  for(const status of ["pending","unknown","unavailable","erased","stale"]){
    const x=await fixture();await generated(x);x.setStatus(status);await x.session.readResult();assert.equal(x.session.snapshot().result.result_status,status);assert.equal(x.session.snapshot().fields,null)
    await x.session.previewSave();x.session.setSaveReviewed(true);await x.session.save();assert.equal(x.ids(),1)
    if(status==="stale")assert.ok(x.session.snapshot().result.result)
  }
})

test("same-employee relogin, different employee, API instance and task key permanently invalidate old replies",async()=>{
  for(const kind of ["epoch","owner","api"]){
    const x=await fixture(),d=deferred();x.api.preview=async()=>d.promise
    const flight=x.session.preview();while(!x.session.snapshot().source)await Promise.resolve()
    assert.equal(x.session.setScope(kind==="api"?{...x.api}:x.api,kind==="owner"?id(2):id(1),kind==="epoch"?"login-epoch-2":"api-one:owner-one:login-epoch-1"),false)
    x.session.setActive(true);x.session.setAvailability({available:true,submissions:true,saves:true});d.resolve(x.f.preview);await flight
    assert.equal(x.session.snapshot().preview,null);assert.equal(x.session.snapshot().choice,null);assert.equal(x.session.matchesScope(x.api,id(1),"api-one:owner-one:login-epoch-1"),false);assert.equal(x.ids(),0)
  }
})

test("delayed submit reply after scope loss cannot publish old receipt or resurrect sensitive fields",async()=>{
  const x=await fixture(),d=deferred();await x.session.preview();x.session.setFeeReviewed(true)
  x.api.submit=async raw=>{x.calls.push(["submit",structuredClone(raw)]);return d.promise}
  const flight=x.session.submit(),intent=x.session.snapshot().pending.body
  x.session.setScope(x.api,id(1),"same-owner-new-epoch");d.resolve(await x.f.receipt(intent));await flight
  const s=x.session.snapshot();assert.equal(s.receipt,null);assert.equal(s.pending,null);assert.equal(s.source,null);assert.equal(s.fields,null);assert.equal(s.feeReviewed,false)
})

test("active/availability loss hides payload, preserves only same-scope original pending recovery",async()=>{
  const x=await fixture();x.api.submit=async()=>{throw new PgNativeAgentPlanWorkflowError(0,"lost_ack")}
  await x.session.preview();x.session.setFeeReviewed(true);await x.session.submit();const p=x.session.snapshot().pending
  x.session.setActive(false);assert.equal(x.session.snapshot().pending,null);assert.equal(x.session.snapshot().preview,null);assert.equal(x.session.hasPendingOriginal(),true)
  x.session.setActive(true);assert.equal(x.session.snapshot().pending.body.request_id,p.body.request_id);assert.equal(x.session.snapshot().preview,null);await x.session.confirmOriginal();assert.equal(x.session.snapshot().pending,null)
})

test("401/403 clearing notifies subscribers and never restores old content on availability hints",async()=>{
  for(const status of [401,403]){
    const x=await fixture(),seen=[];x.session.subscribe(()=>seen.push(x.session.snapshot()));x.api.source=async()=>{throw new PgNativeAgentPlanWorkflowError(status,"refused",true)}
    await x.session.preview();assert.equal(seen.at(-1).preview,null);assert.equal(seen.at(-1).choice,null);assert.equal(seen.at(-1).busy,false);assert.match(seen.at(-1).error,status===401?/登录/:/访问/)
    x.session.setAvailability({available:true,submissions:true,saves:true});x.session.setActive(true);assert.equal(x.session.snapshot().choice,null);assert.equal(x.expired(),status===401?1:0)
  }
})

test("concurrent submit/save gestures reserve one UUID and definite rejection requires a fresh preview",async()=>{
  const x=await fixture(),d=deferred();await x.session.preview();x.session.setFeeReviewed(true)
  x.api.submit=async raw=>{x.calls.push(["submit",raw]);return d.promise}
  const one=x.session.submit();await x.session.submit();assert.equal(x.ids(),1);d.resolve(await x.f.receipt(x.session.snapshot().pending.body));await one
  const y=await fixture();await y.session.preview();y.session.setFeeReviewed(true);y.api.submit=async()=>{throw new PgNativeAgentPlanWorkflowError(409,"stale",true)};await y.session.submit()
  assert.equal(y.session.snapshot().pending,null);assert.equal(y.session.snapshot().preview,null);assert.equal(y.session.snapshot().feeReviewed,false);await y.session.submit();assert.equal(y.ids(),1)
  const z=await fixture(),save=deferred();await saveReady(z);z.api.save=async body=>{z.calls.push(["save",body]);return save.promise}
  const saving=z.session.save();await z.session.save();assert.equal(z.ids(),2);assert.equal(z.calls.filter(c=>c[0]==="save").length,1)
  save.resolve(await z.f.saveReceipt(z.session.snapshot().pending.body.intent));await saving;assert.equal(z.session.snapshot().pending,null)
})

test("receipt metadata stays bound to original preview even across unknown ACK and same-scope hide",async()=>{
  for(const key of ["content_sha256","model_versions_sha256","owner_epoch"]){
    const x=await fixture();x.api.submit=async()=>{throw new PgNativeAgentPlanWorkflowError(0,"lost_ack")}
    await x.session.preview();x.session.setFeeReviewed(true);await x.session.submit();const pending=x.session.snapshot().pending
    x.session.setActive(false);x.session.setActive(true)
    x.api.confirm=async body=>{const r=await x.f.receipt(body,{replayed:true});if(key==="owner_epoch"){r.owner_epoch=6;r.owner_governance_revision=6}else r[key]=hex(9);return r}
    await x.session.confirmOriginal();assert.equal(x.session.snapshot().pending.body.request_id,pending.body.request_id);assert.equal(x.session.snapshot().receipt,null);assert.equal(x.ids(),1)
  }
})

test("later views may change outcome state but cannot replace immutable receipt metadata",async()=>{
  const x=await fixture();await generated(x);const original=x.session.snapshot().result
  x.api.view=async()=>{const v=structuredClone(await x.f.view({...x.f.submit,request_id:original.receipt.request_id}));v.receipt.content_sha256=hex(9);return v}
  await x.session.readResult();assert.equal(x.session.snapshot().result.receipt.content_sha256,original.receipt.content_sha256);assert.match(x.session.snapshot().error,/无法核对/)
})

test("wrong-owner preview is refused and dispose fences a pending source response",async()=>{
  const x=await fixture();x.api.preview=async()=>({...structuredClone(x.f.preview),owner_user_id:id(2)});await x.session.preview();assert.equal(x.session.snapshot().preview,null);assert.match(x.session.snapshot().error,/无法核对/)
  const y=await fixture(),d=deferred();y.api.source=async()=>d.promise;const flight=y.session.preview();y.session.dispose();d.resolve(y.f.sourceResponse);await flight;assert.equal(y.session.snapshot().preview,null);assert.equal(y.session.snapshot().choice,null)
})

test("an edit in the actual canvas invalidates only save review while keeping the original paid result",async()=>{
  const x=await fixture();await saveReady(x);const before=x.session.snapshot().result
  x.session.invalidateSavePreview();const after=x.session.snapshot();assert.equal(after.savePreview,null);assert.equal(after.saveReviewed,false);assert.equal(canonical(after.result),canonical(before));assert.equal(x.ids(),1)
  await x.session.save();assert.equal(x.ids(),1)
})


test("confirmed save survives a same-login workspace round trip as read handles only; next GET uses the original generation UUID",async()=>{
  const x=await fixture();await saveReady(x);await x.session.save()
  const original=x.session.snapshot(),count=x.calls.length,ids=x.ids()
  x.session.setActive(false)
  assert.equal(x.session.snapshot().receipt,null);assert.equal(x.session.snapshot().saveReceipt,null);assert.equal(x.session.snapshot().result,null)
  x.session.setActive(true)
  const resumed=x.session.snapshot()
  assert.equal(resumed.receipt.request_id,original.receipt.request_id);assert.equal(resumed.saveReceipt.workflow_id,original.saveReceipt.workflow_id)
  for(const key of ["choice","source","preview","result","fields","savePreview"])assert.equal(resumed[key],null,key)
  assert.equal(resumed.feeReviewed,false);assert.equal(resumed.saveReviewed,false);assert.equal(x.calls.length,count)
  await x.session.readResult()
  assert.deepEqual(x.calls.at(-1),["view",original.receipt.request_id]);assert.equal(x.session.snapshot().result.result_status,"available")
  assert.equal(x.session.snapshot().fields,null);assert.equal(x.ids(),ids);assert.equal(mutations(x).length,2)
})

test("a completed generation can be explicitly re-read after tab return without reusing fee approval or emitting another POST",async()=>{
  const x=await fixture();await generated(x);const original=x.session.snapshot().receipt.request_id,count=x.calls.length
  x.session.setActive(false);x.session.setActive(true)
  assert.equal(x.session.snapshot().receipt.request_id,original);assert.equal(x.session.snapshot().result,null);assert.equal(x.session.snapshot().preview,null)
  assert.equal(x.calls.length,count);await x.session.submit();assert.equal(mutations(x).length,1)
  await x.session.readResult();assert.deepEqual(x.calls.at(-1),["view",original]);assert.equal(x.session.snapshot().result.result_status,"available")
})

test("late same-request read after tab return and logout cannot restore any confirmed receipt or result",async()=>{
  const x=await fixture();await saveReady(x);await x.session.save();const original=x.session.snapshot().receipt.request_id
  x.session.setActive(false);x.session.setActive(true)
  const delayed=deferred();x.api.view=async key=>{assert.equal(key,original);return delayed.promise}
  const work=x.session.readResult();assert.equal(x.session.snapshot().busy,true);x.session.setScope(x.api,id(2),"another-login")
  delayed.resolve(await x.f.view({...x.f.submit,request_id:original}));await work
  x.session.setActive(true);assert.equal(x.session.snapshot().receipt,null);assert.equal(x.session.snapshot().saveReceipt,null);assert.equal(x.session.snapshot().result,null)
  assert.equal(x.session.matchesScope(x.api,id(2),"another-login"),false)
})

test("availability revocation clears retained confirmed handles while preserving the existing permission fence",async()=>{
  const x=await fixture();await saveReady(x);await x.session.save();x.session.setActive(false);x.session.setActive(true)
  x.session.setAvailability({available:false,submissions:false,saves:false});x.session.setAvailability({available:true,submissions:false,saves:false})
  assert.equal(x.session.snapshot().receipt,null);assert.equal(x.session.snapshot().saveReceipt,null);assert.equal(x.session.snapshot().result,null)
})
