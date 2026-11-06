// Injected transport and synthetic DTOs only; no real HTTP/DB/provider proof.
import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativeAgentPlanWorkflowApi,parseAgentPlanWorkflowTransportJson,agentPlanWorkflowSubmitBody,agentPlanWorkflowSaveBody,PgNativeAgentPlanWorkflowError} from "../src/lib/pgNativeAgentPlanWorkflow.ts"
import {agentPlanWorkflowCancelAcknowledgement,agentPlanWorkflowEraseAcknowledgement} from "../services/pg-api/src/agent-plan-workflow-rpc-contract.ts"
import {browserValues,id,hex,canonical,deferred} from "./helpers/agent-plan-workflow-browser-values.mjs"
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json",...headers}})
const invalid=error=>error instanceof PgNativeAgentPlanWorkflowError&&error.status===503&&!error.definitive

test("exact ten HTTP operations carry current Cookie/CSRF hints and closed request bodies without retries",async()=>{
  const f=await browserValues(),calls=[]
  const transport=async(url,init)=>{
    const body=init.body===undefined?undefined:JSON.parse(init.body),path=url.replace("/__pg_native/api/v2/agent-plan-workflow/","");calls.push({path,body,init})
    if(path==="source")return response(f.sourceResponse)
    if(path==="preview")return response(f.preview)
    if(path==="requests")return response(await f.receipt(body))
    if(path==="confirm")return response(await f.receipt(body,{replayed:true}))
    if(path.startsWith("requests/"))return response(await f.view({...f.submit,request_id:path.slice(9)}))
    if(path==="control"||path==="control/confirm")return response(await f.controlReceipt(body,{replayed:path.endsWith("confirm")}))
    if(path==="preview-save")return response(await f.savePreview(body))
    if(path==="save"||path==="save/confirm")return response(await f.saveReceipt(body.intent,{replayed:path.endsWith("confirm")}))
    throw Error("unexpected_route")
  }
  const api=createPgNativeAgentPlanWorkflowApi({transport})
  await api.source(f.selection);await api.preview(f.choice);await api.submit(f.submit);await api.confirm(f.submit);await api.view(f.submit.request_id)
  const cancel={action:"cancel",request_id:id(102),generation_request_id:f.submit.request_id,confirm:true,acknowledgement:agentPlanWorkflowCancelAcknowledgement}
  await api.control(cancel);await api.confirmControl(cancel);await api.previewSave(f.previewInput);await api.save(f.save);await api.confirmSave(f.save.intent)
  assert.equal(calls.length,10);assert.deepEqual(calls.map(c=>c.path),["source","preview","requests","confirm","requests/"+id(100),"control","control/confirm","preview-save","save","save/confirm"])
  assert.deepEqual(calls[0].body,f.selection);assert.equal(calls[4].body,undefined)
  assert.deepEqual(Object.keys(calls[8].body),["intent","preview_input"]);assert.deepEqual(calls[9].body,{intent:f.save.intent});assert.deepEqual(calls[3].body,f.submit)
  for(const {init} of calls){assert.equal(init.credentials,"same-origin");assert.equal(init.redirect,"error");assert.equal(init.cache,"no-store");assert.equal(init.referrerPolicy,"no-referrer");assert.equal(init.headers.Origin,undefined);assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers["X-Rh-User-Id"],undefined);assert.equal(init.headers["X-AgentStudio-Request"],init.method==="POST"?"1":undefined)}
})

test("source selection uses real spec/model keys only; no identity, permissions, fake pins or list API",async()=>{
  const f=await browserValues();let calls=0
  const api=createPgNativeAgentPlanWorkflowApi({rootPath:"",transport:async(url)=>{calls++;assert.equal(url,"/api/v2/agent-plan-workflow/source");return response(f.sourceResponse)}})
  assert.equal((await api.source(f.selection)).recorded,false)
  for(const extra of [{identity:{id:id(1)}},{owner_user_id:id(2)},{permission:true},{source:f.source},{spec_revision:2}])assert.throws(()=>api.source({...f.selection,...extra}))
  assert.equal(api.sources,undefined);assert.equal(calls,1)
  assert.throws(()=>createPgNativeAgentPlanWorkflowApi({rootPath:"https://example.com"}))
  assert.throws(()=>createPgNativeAgentPlanWorkflowApi({identity:{id:id(1)}}))
  let reads=0;const bad={...f.selection};Object.defineProperty(bad,"spec_id",{enumerable:true,get(){reads++;return id(7)}});assert.throws(()=>api.source(bad));assert.equal(reads,0)
})

test("prepared input hashes and full source/model/cap bindings are independently checked",async()=>{
  const f=await browserValues()
  for(const alter of [v=>v.input_sha256=hex(9),v=>v.content_sha256=hex(9),v=>v.choice.instruction="other",v=>v.source_values.spec.task_plan=["other"],v=>v.authority=true]){
    const raw=structuredClone(f.preview);alter(raw);const api=createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)})
    await assert.rejects(api.preview(f.choice),invalid)
  }
  for(const alter of [v=>v.source.spec_id=id(44),v=>v.generation_model.connection_revision++]){
    const raw=structuredClone(f.sourceResponse);alter(raw);await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)}).source(f.selection),invalid)
  }
})

test("generation receipt binds exact full paid intent, not just matching UUID",async()=>{
  const f=await browserValues()
  for(const alter of [r=>r.request_sha256=hex(8),r=>r.content_sha256="bad",r=>r.source.resources_sha256=hex(9),r=>r.generation_model.model_id="other",r=>r.output_token_limit=4096]){
    const raw=structuredClone(await f.receipt());alter(raw);await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)}).submit(f.submit),invalid)
  }
  const api=createPgNativeAgentPlanWorkflowApi({transport:async()=>response(await f.receipt())});await assert.rejects(api.confirm(f.submit),invalid)
  assert.equal(agentPlanWorkflowSubmitBody(f.preview,id(103)).fee_acknowledgement,"APPROVE_EXPLICIT_PAID_AGENT_PLAN_WORKFLOW_DRAFT_ONCE_V1")
})

test("historical result hash, exact reference and all six view statuses are validated",async()=>{
  const f=await browserValues()
  for(const status of ["pending","unknown","unavailable","erased","available","stale"]){const api=createPgNativeAgentPlanWorkflowApi({transport:async()=>response(await f.view(f.submit,status))});assert.equal((await api.view(f.submit.request_id)).result_status,status)}
  for(const alter of [v=>v.result.result_sha256=hex(9),v=>v.result.value.result.graph.nodes[2].data.prompt="changed",v=>v.receipt.request_id=id(99)]){
    const raw=structuredClone(await f.view());alter(raw);await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)}).view(f.submit.request_id),invalid)
  }
})

test("save preview hashes bind edited graph, original result and resource source",async()=>{
  const f=await browserValues()
  for(const alter of [v=>v.candidate_sha256=hex(9),v=>v.preview_sha256=hex(9),v=>v.candidate.graph.edges.pop(),v=>v.candidate.name="not exact edits",v=>v.source.resource_versions_sha256=hex(9)]){
    const raw=structuredClone(f.save_preview);alter(raw);await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)}).previewSave(f.previewInput),invalid)
  }
  const body=agentPlanWorkflowSaveBody(f.save_preview,f.previewInput,id(104));assert.equal(body.intent.save_acknowledgement,"APPROVE_EXACT_AGENT_PLAN_WORKFLOW_DRAFT_SAVE_ONLY_V1");assert.equal(Object.hasOwn(body,"preview"),false)
  assert.throws(()=>agentPlanWorkflowSaveBody(f.save_preview,{...f.previewInput,edits:{...f.previewInput.edits,name:"other"}},id(104)))
})

test("save and control recovery require exact immutable receipt and never send original bodies again",async()=>{
  const f=await browserValues()
  for(const alter of [r=>r.request_sha256=hex(9),r=>r.preview_sha256=hex(9),r=>r.workflow_id=id(55),r=>r.workflow_revision=2,r=>r.source.resources_sha256=hex(9)]){
    const raw=structuredClone(await f.saveReceipt(f.save.intent,{replayed:true}));alter(raw);await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)}).confirmSave(f.save.intent),invalid)
  }
  const erase={action:"erase",request_id:id(103),generation_request_id:f.submit.request_id,confirm:true,acknowledgement:agentPlanWorkflowEraseAcknowledgement}
  for(const alter of [r=>r.request_sha256=hex(9),r=>r.generation_request_id=id(55),r=>r.replayed=false]){
    const raw=await f.controlReceipt(erase,{replayed:true});alter(raw);await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response(raw)}).confirmControl(erase),invalid)
  }
  assert.throws(()=>createPgNativeAgentPlanWorkflowApi().save({intent:f.save.intent,preview:f.previewInput}))
})

test("strict bounded JSON rejects duplicate escaped keys, nonfinite/-0, prototypes and trailing data",()=>{
  assert.equal(canonical(parseAgentPlanWorkflowTransportJson('{"ok":true,"items":[]}')),'{"items":[],"ok":true}')
  for(const raw of ['{"a":1,"\\u0061":2}','{"__proto__":{}}','{"n":-0}','{"n":1e999}','{}{}','```json\n{}\n```','\ufeff{}','{"x":"\\ud800"}','['.repeat(26)+']'.repeat(26),' '.repeat(524289),'{"x":[1,]}'])assert.throws(()=>parseAgentPlanWorkflowTransportJson(raw))
})

test("malformed/oversized/redirected/truncated transport stays unknown and never retries",async()=>{
  const f=await browserValues()
  const badResponses=[()=>new Response('not json',{headers:{"content-type":"application/json"}}),()=>new Response('{"x":1,"x":2}',{headers:{"content-type":"application/json"}}),()=>response(f.sourceResponse,200,{"content-length":"999999"}),()=>response(f.sourceResponse,200,{"content-length":"1"}),()=>response(f.sourceResponse,200,{"content-type":"text/html"}),()=>{const r=response(f.sourceResponse);Object.defineProperty(r,"redirected",{value:true});return r},()=>new Response(new Uint8Array([0xff]),{headers:{"content-type":"application/json"}})]
  for(const make of badResponses){let count=0;const api=createPgNativeAgentPlanWorkflowApi({transport:async()=>{count++;return make()}});await assert.rejects(api.source(f.selection),invalid);assert.equal(count,1)}
  let count=0;await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>{count++;throw Error("lost_ack")}}).submit(f.submit),e=>e.status===0&&!e.definitive);assert.equal(count,1)
})

test("timeout and abort bound an abort-ignoring fetch and incomplete stream without mutation replay",async()=>{
  const f=await browserValues();let calls=0,cancelled=0
  await assert.rejects(createPgNativeAgentPlanWorkflowApi({timeoutMs:10,transport:async()=>{calls++;return new Promise(()=>{})}}).submit(f.submit),e=>e.status===0)
  assert.equal(calls,1)
  const started=deferred(),controller=new AbortController(),api=createPgNativeAgentPlanWorkflowApi({transport:async()=>new Response(new ReadableStream({start(){started.resolve()},cancel(){cancelled++}}),{headers:{"content-type":"application/json"}})})
  const pending=api.source(f.selection,controller.signal);await started.promise;controller.abort();await assert.rejects(pending,e=>e.status===0);assert.equal(cancelled,1)
})

test("structured refusals are definite while 5xx and invalid success projections stay uncertain",async()=>{
  const f=await browserValues()
  for(const status of [400,401,403,404,409,413,415,422,429,500,503]){
    const api=createPgNativeAgentPlanWorkflowApi({transport:async()=>response({error:"synthetic"},status)})
    await assert.rejects(api.submit(f.submit),e=>e.status===status&&e.definitive===(status<500))
  }
  await assert.rejects(createPgNativeAgentPlanWorkflowApi({transport:async()=>response({ok:true})}).submit(f.submit),invalid)
})
