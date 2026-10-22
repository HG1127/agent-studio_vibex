// Synthetic owner records, encrypted dummy keys, real SQL/RLS and loopback mTLS.
// Never connects to a provider or an installed/company PostgreSQL database.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {request as httpsRequest} from "node:https"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {WorkflowV2ModelDispatch,WorkflowV2ModelLeaseIdentity,verifiedWorkflowV2ModelDispatch} from "../src/workflow-v2-model-dispatch.ts"
import {safeWorkflowV2ModelRequest,selectWorkflowV2ModelExecution} from "../src/workflow-v2-model-contract.ts"
import {createWorkflowV2ModelMutualTlsClient,workflowV2ModelEffectExecutor} from "../src/workflow-v2-model-client.ts"
import {createWorkflowV2ModelInternalHandler} from "../src/workflow-v2-model-handler.ts"
import {preparedWorkflowModelRequest} from "../src/model-connection-executor.ts"
import {verifyWorkflowModelIdentityPrivileges} from "../src/bound-dispatch-role-preflight.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
const sql=file=>readFileSync(new URL("../../../db/postgres/"+file,import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const key=Buffer.from("0123456789abcdef".repeat(4),"hex"),credential="synthetic-only-workflow-key-never-send-to-network"
const issuer="https://synthetic-workflow-model.invalid",alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const node=(id,type,data={})=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
const graph=(binding,prompt)=>({version:2,nodes:[node("start","start"),node("model","model",{model_binding:binding,prompt}),
  node("end","end",{output_template:"{{model.output}}"})],edges:[{id:"a",source:"start",target:"model"},{id:"b",source:"model",target:"end"}]})
async function fixture(prompt="sealed prompt {{input}}"){
  const db=await PGlite.create({extensions:{vector}});await db.exec(sql("001_stage_schema.sql"))
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic predecessor')")
  await db.exec(sql("migrations/pg_v9_024_bound_dispatch_identity.sql"))
  await db.exec(sql("migrations/pg_v9_025_workflow_model_identity.sql"))
  const users={};for(const subject of ["alice","bob"])users[subject]=(await db.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  let tail=Promise.resolve()
  const pool={async connect(){const before=tail;let release;tail=new Promise(resolve=>{release=resolve});await before
    return {query:(text,values=[])=>db.query(text,values),release}}}
  const connections=new ModelConnectionRepository(pool,key),raw=await connections.create(alice,{name:"synthetic model",provider:"openai",
    base_url:"https://api.openai.com/v1",models:["synthetic-model"],api_key:credential,enabled:true})
  const model=await connections.testConnection(alice,raw.id,raw.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
  const binding={connection_id:model.id,connection_revision:model.revision,model_id:"synthetic-model"}
  const flow=await new WorkflowRepository(pool).create(alice,"synthetic workflow",graph(binding,prompt))
  const runs=new WorkflowV2RunRepository(pool),run=(await runs.submit(alice,flow.id,
    {expected_revision:flow.revision,idempotency_key:"synthetic-workflow-model-001",instruction:"synthetic private task"})).run
  const identity=new WorkflowV2ModelLeaseIdentity(pool)
  const approve=async()=>{const pending=(await runs.get(alice,run.id)).pending_effect
    await runs.decide(alice,run.id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256});return pending}
  async function hold(){
    let entered,release
    const ready=new Promise(resolve=>{entered=resolve}),result=new Promise(resolve=>{release=resolve})
    const worker=new WorkflowV2Worker(pool,"synthetic-workflow",{executor:{execute(request,lease){entered({request,lease});return result}}})
    assert.equal((await worker.tick()).status,"awaiting_approval");await approve()
    const running=worker.tick(),{request,lease}=await ready
    const wire={claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,
      lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256}
    return {wire,request,async finish(output="synthetic held result"){release(output);return running}}
  }
  return {db,pool,users,binding,run,flow,runs,identity,approve,hold,close:()=>db.close()}
}
test("private Workflow protocol refuses caller prompt/identity and partial activation; long Unicode prompts remain intact",()=>{
  assert.equal(selectWorkflowV2ModelExecution({}),false)
  for(const env of [{AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:"true"},{AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED:"wrong"}])
    assert.throws(()=>selectWorkflowV2ModelExecution(env),/not_approved/)
  assert.equal(selectWorkflowV2ModelExecution({AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:"true",
    AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED:"APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY"}),true)
  const claim={run_id:"11111111-1111-4111-8111-111111111111",job_id:"22222222-2222-4222-8222-222222222222",
    lease_token:"33333333-3333-4333-8333-333333333333",lease_version:1,lease_owner:"workflow"}
  const wire={claim,step_key:"wf2_00002_model",input_sha256:"a".repeat(64)}
  assert.deepEqual(safeWorkflowV2ModelRequest(wire),wire)
  for(const wrong of [{...wire,input:"forged"},{...wire,owner_user_id:claim.run_id},{...wire,input_sha256:"short"},
    {...wire,claim:{...claim,issuer}},{...wire,step_key:"model"}])assert.throws(()=>safeWorkflowV2ModelRequest(wrong))
  const prompt="中文测试".repeat(2500),prepared=preparedWorkflowModelRequest({provider:"openai",base_url:"https://api.openai.com/v1",
    model_id:"synthetic-model",api_key:credential},prompt)
  assert.equal(JSON.parse(prepared.body).messages[1].content,prompt)
  assert.throws(()=>preparedWorkflowModelRequest({provider:"openai",base_url:"https://api.openai.com/v1",model_id:"m",api_key:credential},"x".repeat(12001)))
})
test("real loopback mTLS runs the exact owner-approved model once and keeps prompt/key out of the wire and audit",async()=>{
  const prompt="Workflow 长提示词 ".repeat(180)+"{{input}}",f=await fixture(prompt);let calls=0,wire
  try{
    const broker=new WorkflowV2ModelDispatch(f.pool,key,async(material,input)=>{
      calls++;assert.equal(material.api_key,credential);assert.equal(input,prompt.replace("{{input}}","synthetic private task"));return "synthetic model output"
    },f.pool)
    const verified=verifiedWorkflowV2ModelDispatch(f.identity,broker)
    await withDisposableBoundModelTls(async request=>{wire=request;assert.equal(JSON.stringify(request).includes("prompt"),false);return verified(request)},async config=>{
      const worker=new WorkflowV2Worker(f.pool,"synthetic-mtls-workflow",{executor:workflowV2ModelEffectExecutor(config)})
      assert.equal((await worker.tick()).status,"awaiting_approval");assert.equal(calls,0);await f.approve()
      for(let i=0;i<5;i++){await worker.tick();if((await f.runs.get(alice,f.run.id)).run.status==="succeeded")break}
      const done=await f.runs.get(alice,f.run.id)
      assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"synthetic model output");assert.equal(calls,1)
      const client=createWorkflowV2ModelMutualTlsClient(config)
      await assert.rejects(client(wire));assert.equal(calls,1)
      await assert.rejects(createWorkflowV2ModelMutualTlsClient({...config,reviewedServerFingerprint256:"00:".repeat(31)+"00"})(wire))
      assert.equal(await f.runs.get(bob,f.run.id),null)
    },{handlerFactory:createWorkflowV2ModelInternalHandler})
    assert.deepEqual((await f.db.query("SELECT status FROM agentstudio.external_effects ORDER BY step_key")).rows,[{status:"succeeded"},{status:"succeeded"}])
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events")).rows)
    for(const privateText of [credential,prompt,"synthetic model output","synthetic private task"])assert.equal(audit.includes(privateText),false)
  }finally{await f.close()}
})
test("identity and Broker reject stale leases, foreign owners, changed approval/hash/snapshot and disabled users before dispatch",async()=>{
  const f=await fixture();let calls=0,held
  try{
    const broker=new WorkflowV2ModelDispatch(f.pool,key,async()=>{calls++;return "synthetic"},f.pool)
    held=await f.hold();const {wire}=held
    assert.deepEqual(await f.identity.resolve(wire),alice)
    for(const changed of [{...wire,claim:{...wire.claim,lease_version:99}},{...wire,input_sha256:"f".repeat(64)},
      {...wire,step_key:"wf2_00002_start"},{...wire,claim:{...wire.claim,lease_owner:"other"}}]){
      await assert.rejects(f.identity.resolve(changed));await assert.rejects(broker.dispatch(alice,changed))
    }
    await assert.rejects(broker.dispatch(bob,wire))
    const mutations=[
      ["UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.users.alice],"UPDATE agentstudio.users SET status='active' WHERE id=$1",[f.users.alice]],
      ["UPDATE agentstudio.approvals SET status='rejected' WHERE run_id=$1",[f.run.id],"UPDATE agentstudio.approvals SET status='approved' WHERE run_id=$1",[f.run.id]],
      ["UPDATE agentstudio.workflows SET revision=revision+1 WHERE id=$1",[f.flow.id],"UPDATE agentstudio.workflows SET revision=revision-1 WHERE id=$1",[f.flow.id]],
      ["UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE run_id=$1",[f.run.id],
        "UPDATE agentstudio.jobs SET lease_until=clock_timestamp()+interval '2 minutes' WHERE run_id=$1",[f.run.id]],
    ]
    for(const [mutate,args,restore,restoreArgs] of mutations){await f.db.query(mutate,args)
      await assert.rejects(f.identity.resolve(wire));await assert.rejects(broker.dispatch(alice,wire));await f.db.query(restore,restoreArgs)}
    assert.equal(calls,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects WHERE step_key LIKE 'wf2_model:%'")).rows[0].n,0)
    const fn="agentstudio.workflow_model_lease_identity(uuid,uuid,uuid,bigint,text,text,text)"
    for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker"])
      assert.equal((await f.db.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,fn])).rows[0].allowed,false)
    for(const kind of ["api","identity","broker"])await verifyWorkflowModelIdentityPrivileges(f.pool,kind)
    await f.db.query("GRANT EXECUTE ON FUNCTION "+fn+" TO agentstudio_worker")
    await assert.rejects(verifyWorkflowModelIdentityPrivileges(f.pool,"identity"))
    await f.db.query("REVOKE EXECUTE ON FUNCTION "+fn+" FROM agentstudio_worker")
    await f.db.exec(sql("migrations/pg_v9_025_workflow_model_identity.sql"));assert.deepEqual(await f.identity.resolve(wire),alice)
  }finally{if(held)await held.finish();await f.close()}
})
test("private mTLS handler rejects a different reviewed client, forged input and employee headers before Broker execution",async()=>{
  const wire={claim:{run_id:"11111111-1111-4111-8111-111111111111",job_id:"22222222-2222-4222-8222-222222222222",
    lease_token:"33333333-3333-4333-8333-333333333333",lease_version:1,lease_owner:"synthetic-workflow"},
    step_key:"wf2_00002_model",input_sha256:"a".repeat(64)}
  let calls=0
  const post=(config,value,headers={})=>new Promise((resolve,reject)=>{
    const body=Buffer.from(JSON.stringify(value)),url=new URL(config.origin)
    const req=httpsRequest({hostname:"127.0.0.1",port:url.port,servername:"localhost",path:"/__internal/v2/workflow-model/dispatch",
      method:"POST",ca:config.ca,cert:config.cert,key:config.key,rejectUnauthorized:true,agent:false,
      headers:{"Content-Type":"application/json","Content-Length":body.length,...headers}},res=>{
      const chunks=[];res.on("data",data=>chunks.push(data));res.on("end",()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}))
    });req.on("error",reject);req.end(body)
  })
  const dispatch=async()=>{calls++;return {status:"succeeded",text:"synthetic"}}
  await withDisposableBoundModelTls(dispatch,async config=>{
    assert.equal((await post(config,{...wire,input:"forged prompt"})).status,400)
    for(const headers of [{cookie:"forged"},{authorization:"Bearer forged"},{"X-Rh-User-Id":"forged"},{"X-Forwarded-Client-Cert":"forged"}])
      assert.equal((await post(config,wire,headers)).status,404)
    assert.equal(calls,0)
    const controller=new AbortController();controller.abort()
    await assert.rejects(createWorkflowV2ModelMutualTlsClient(config)(wire,controller.signal));assert.equal(calls,0)
  },{handlerFactory:createWorkflowV2ModelInternalHandler})
  await withDisposableBoundModelTls(dispatch,async config=>{
    const result=await post(config,wire);assert.equal(result.status,403);assert.equal(calls,0)
  },{handlerFactory:config=>createWorkflowV2ModelInternalHandler({...config,reviewedClientFingerprint256:"00".repeat(32)})})
})
test("Broker durable reservation prevents concurrent and lost-response redispatch, and failures remain unknown",async()=>{
  const f=await fixture();let held,calls=0,entered,release
  const ready=new Promise(resolve=>{entered=resolve}),result=new Promise(resolve=>{release=resolve})
  try{
    held=await f.hold();const broker=new WorkflowV2ModelDispatch(f.pool,key,async()=>{calls++;entered();return result},f.pool)
    const first=broker.dispatch(alice,held.wire);await ready
    await assert.rejects(broker.dispatch(alice,held.wire),e=>e.code==="workflow_model_already_dispatched")
    release("synthetic once");await first
    await assert.rejects(broker.dispatch(alice,held.wire),e=>e.code==="workflow_model_already_dispatched");assert.equal(calls,1)
  }finally{release("cleanup");if(held)await held.finish();await f.close()}
  const g=await fixture();let active,unknownCalls=0
  try{
    active=await g.hold();const broker=new WorkflowV2ModelDispatch(g.pool,key,async()=>{unknownCalls++;throw Error("synthetic lost reply")},g.pool)
    await assert.rejects(broker.dispatch(alice,active.wire),e=>e.code==="workflow_model_outcome_unknown")
    await assert.rejects(broker.dispatch(alice,active.wire),e=>e.code==="workflow_model_already_dispatched")
    assert.equal(unknownCalls,1)
    assert.equal((await g.db.query("SELECT status FROM agentstudio.external_effects WHERE step_key LIKE 'wf2_model:%'")).rows[0].status,"unknown")
  }finally{if(active)await active.finish();await g.close()}
})
test("model-only adapter pauses unsupported Tool nodes before creating any external ledger",async()=>{
  const f=await fixture()
  try{
    const toolGraph={version:2,nodes:[node("start","start"),node("tool","tool",{tool:"calculate",params_template:'{"expression":"2+2"}'}),node("end","end")],
      edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]}
    const flow=await new WorkflowRepository(f.pool).create(alice,"synthetic tool",toolGraph)
    // Cancel the fixture model job so only the Tool run is available to claim.
    await f.runs.cancel(alice,f.run.id)
    const run=(await f.runs.submit(alice,flow.id,{expected_revision:flow.revision,idempotency_key:"synthetic-tool-no-adapter",instruction:"test"})).run
    const worker=new WorkflowV2Worker(f.pool,"model-only",{executor:{supports:request=>request.kind==="model",async execute(){throw Error("must not execute")}}})
    assert.equal((await worker.tick()).status,"awaiting_approval")
    const pending=(await f.runs.get(alice,run.id)).pending_effect
    await f.runs.decide(alice,run.id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256})
    assert.equal((await worker.tick()).status,"paused")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{await f.close()}
})
