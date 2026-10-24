// Real embedded PostgreSQL roles, encrypted dummy secrets and loopback mTLS.
// The final outbound socket/provider is synthetic; no external site is called.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {EventEmitter} from "node:events"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {ToolConnectionRepository} from "../src/tool-connection-repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch} from "../src/workflow-v2-tool-dispatch.ts"
import {WorkflowV2ModelLeaseIdentity} from "../src/workflow-v2-model-dispatch.ts"
import {workflowV2ToolEffectExecutor,createWorkflowV2ToolMutualTlsClient} from "../src/workflow-v2-tool-client.ts"
import {createWorkflowV2ToolInternalHandler} from "../src/workflow-v2-tool-handler.ts"
import {createWorkflowToolNetwork} from "../src/workflow-v2-tool-network.ts"
import {verifyWorkflowEffectIdentityPrivileges} from "../src/bound-dispatch-role-preflight.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
const sql=file=>readFileSync(new URL("../../../db/postgres/"+file,import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const key=Buffer.from("0123456789abcdef".repeat(4),"hex"),secret="synthetic-http-tool-owner-key-no-network-123456"
const issuer="https://synthetic-workflow-tool.invalid",alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const node=(id,type,data={})=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
const graph=data=>({version:2,nodes:[node("start","start"),node("tool","tool",data),node("end","end",{output_template:"{{tool.output}}"})],
  edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]})
async function fixture(){
  const db=await PGlite.create({extensions:{vector}});await db.exec(sql("001_stage_schema.sql"))
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic predecessor')")
  for(const migration of ["pg_v9_024_bound_dispatch_identity.sql","pg_v9_025_workflow_model_identity.sql","pg_v9_026_workflow_tool_identity.sql"])
    await db.exec(sql("migrations/"+migration))
  const users={};for(const subject of ["alice","bob"])users[subject]=(await db.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  let tail=Promise.resolve(),fault
  const pool={async connect(){const before=tail;let release;tail=new Promise(resolve=>{release=resolve});await before
    return {async query(text,values=[]){fault?.(text,values);return db.query(text,values)},release}}}
  const models=new ModelConnectionRepository(pool,key),saved=await models.create(alice,{name:"synthetic model",provider:"openai",
    base_url:"https://api.openai.com/v1",models:["synthetic-model"],api_key:"synthetic-model-owner-key-never-network",enabled:true})
  const model=await models.testConnection(alice,saved.id,saved.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
  const modelBinding={connection_id:model.id,connection_revision:model.revision,model_id:"synthetic-model"}
  const tools=new ToolConnectionRepository(pool,key),tool=await tools.create(alice,{name:"synthetic HTTP",description:"Synthetic only",
    url:"https://tools.example.com/run",method:"POST",headers:[{key:"Authorization",value:"Bearer "+secret}],body_template:"{{input}}",timeout_s:10,enabled:true})
  const toolBinding={connection_id:tool.id,connection_revision:tool.revision}
  const kbRepo=new KnowledgeBaseRepository(pool),bases={}
  for(const [who,identity] of [["alice",alice],["bob",bob]]){
    bases[who]=await kbRepo.create(identity,who,"Synthetic")
    await kbRepo.createTextDocument(identity,bases[who].id,{filename:who+".txt",text:"synthetic evidence "+(who==="alice"?"OWN_CITATION":"FOREIGN_SECRET")})
  }
  const runs=new WorkflowV2RunRepository(pool),flows=new WorkflowRepository(pool);let sequence=0
  const make=async(data,input="synthetic task")=>{
    const flow=await flows.create(alice,"synthetic "+(++sequence),graph(data))
    return runs.submit(alice,flow.id,{expected_revision:flow.revision,idempotency_key:"synthetic-tool-run-"+sequence,instruction:input})
  }
  const approve=async id=>{const pending=(await runs.get(alice,id)).pending_effect
    await runs.decide(alice,id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256});return pending}
  async function drive(worker,id){
    for(let i=0;i<8;i++){
      await worker.tick();const view=await runs.get(alice,id)
      if(view.run.status==="awaiting_approval")await approve(id)
      else if(["succeeded","failed","paused"].includes(view.run.status))return view
    }throw Error("synthetic tool did not settle")
  }
  async function hold(data={tool_binding:toolBinding,params_template:'{"query":"private"}'}){
    const queued=await make(data);let entered,release
    const ready=new Promise(resolve=>{entered=resolve}),result=new Promise(resolve=>{release=resolve})
    const worker=new WorkflowV2Worker(pool,"synthetic-tool-held",{executor:{execute(request,lease){entered({request,lease});return result}}})
    await worker.tick();await approve(queued.run.id);const running=worker.tick(),{request,lease}=await ready
    const wire={claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},
      step_key:request.step_key,input_sha256:request.input_sha256}
    return {wire,queued,async finish(){release("synthetic held result");return running}}
  }
  return {db,pool,users,tool,toolBinding,modelBinding,bases,runs,flows,make,approve,drive,hold,setFault:fn=>{fault=fn},close:()=>db.close()}
}
function syntheticSocket(events){return (options,callback)=>{
  const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=()=>req.emit("error",Error("synthetic"))
  req.end=body=>{events.push({options,body});const res=new EventEmitter();res.statusCode=200;res.headers={"content-type":"text/html"};res.destroy=()=>{}
    queueMicrotask(()=>{callback(res);queueMicrotask(()=>{
      const text=options.hostname==="tools.example.com"?"echo Bearer "+secret:options.hostname==="html.duckduckgo.com"?
        '<a class="result__a" href="https://public.example.com/page">Synthetic title</a><a class="result__snippet">Synthetic snippet</a>':"<p>Synthetic page</p>"
      res.emit("data",Buffer.from(text));res.emit("end")
    })})};return req
}}
test("all five builtins and owner HTTP Tool traverse real mTLS and SQL with no credential leakage or foreign KB",async()=>{
  const f=await fixture(),events=[];let summaries=0,wire
  try{
    const network=createWorkflowToolNetwork({async resolve4(){return ["93.184.216.34"]},async resolve6(){return []}},syntheticSocket(events))
    const broker=new WorkflowV2ToolDispatch(f.pool,key,{...network,async summarize(material,prompt){summaries++
      assert.equal(material.api_key,"synthetic-model-owner-key-never-network");assert.match(prompt,/private summary input/);return "synthetic summary"}},f.pool)
    const verified=verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(f.pool),broker)
    await withDisposableBoundModelTls(async value=>{wire=value;return verified(value)},async config=>{
      const worker=new WorkflowV2Worker(f.pool,"synthetic-tool-mtls",{executor:workflowV2ToolEffectExecutor(config)})
      const cases=[
        [{tool:"calculate",params_template:'{"expression":"(2+3)*4"}'},/20/],
        [{tool:"summarize",model_binding:f.modelBinding,params_template:'{"text":"private summary input","focus":"focus"}'},/synthetic summary/],
        [{tool:"knowledge_search",knowledge_base_ids:[f.bases.alice.id],params_template:'{"query":"synthetic"}'},/OWN_CITATION/],
        [{tool:"knowledge_search",knowledge_base_ids:[f.bases.alice.id],params_template:'{"query":"s"}'},/OWN_CITATION/],
        [{tool:"knowledge_search",params_template:'{"query":"synthetic"}'},/workflow_context_keyword/],
        [{tool:"web_fetch",params_template:'{"url":"https://public.example.com/page"}'},/Synthetic page/],
        [{tool:"web_search",params_template:'{"query":"synthetic","limit":3}'},/Synthetic title/],
        [{tool_binding:f.toolBinding,params_template:'{"query":"approved request"}'},/redacted/],
        [{tool_binding:f.toolBinding,params_template:'{"query":"{{input}}"}'},/redacted/,'quoted "value"\\path\nline'],
      ]
      for(const [data,expected,input] of cases){
        const run=await f.make(data,input),done=await f.drive(worker,run.run.id)
        assert.equal(done.run.status,"succeeded");assert.match(done.run.result_text,expected)
        assert.equal(JSON.stringify(done).includes("FOREIGN_SECRET"),false);assert.equal(JSON.stringify(done).includes(secret),false)
        assert.equal(await f.runs.get(bob,run.run.id),null)
        assert.deepEqual((await f.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[run.run.id])).rows,
          [{status:"succeeded"},{status:"succeeded"}])
      }
      await assert.rejects(createWorkflowV2ToolMutualTlsClient(config)(wire));assert.equal(summaries,1)
      assert.equal(Object.hasOwn(wire,"input"),false);assert.equal(JSON.stringify(wire).includes("approved request"),false)
    },{handlerFactory:createWorkflowV2ToolInternalHandler})
    assert.equal(events.length,4)
    assert.equal(JSON.parse(events.at(-1).body).query,'quoted "value"\\path\nline')
    assert.equal(events.find(event=>event.options.hostname==="tools.example.com").options.headers.authorization,"Bearer "+secret)
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events")).rows)
    for(const text of [secret,"private summary input","approved request","FOREIGN_SECRET"])assert.equal(audit.includes(text),false)
  }finally{await f.close()}
})
test("deterministic calculation/parameter failures become failed nodes, while uncertain POST remains paused/unknown",async()=>{
  const f=await fixture();let calls=0
  try{
    const broker=new WorkflowV2ToolDispatch(f.pool,key,{async http(){calls++;throw Error("synthetic POST response lost")}},f.pool)
    await withDisposableBoundModelTls(verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(f.pool),broker),async config=>{
      const worker=new WorkflowV2Worker(f.pool,"known-vs-unknown",{executor:workflowV2ToolEffectExecutor(config)})
      for(const data of [{tool:"calculate",params_template:'{"expression":"1/0"}'},{tool:"calculate",params_template:'{"expression":"2+2","url":"forged"}'}]){
        const queued=await f.make(data),done=await f.drive(worker,queued.run.id)
        assert.equal(done.run.status,"failed");assert.match(done.run.last_error_code,/workflow_(?:calculation_invalid|tool_input_invalid)/)
        assert.equal(done.steps.find(step=>step.step_key.endsWith("_tool")).status,"failed")
        assert.deepEqual((await f.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1",[queued.run.id])).rows,[{status:"failed"}])
      }
      assert.equal(calls,0)
      const queued=await f.make({tool_binding:f.toolBinding,params_template:"{}"}),paused=await f.drive(worker,queued.run.id)
      assert.equal(paused.run.status,"paused");assert.equal((await worker.tick()).status,"idle");assert.equal(calls,1)
      assert.deepEqual((await f.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1",[queued.run.id])).rows,[{status:"unknown"},{status:"unknown"}])
      await f.db.exec(sql("migrations/pg_v9_026_workflow_tool_identity.sql"))
    },{handlerFactory:createWorkflowV2ToolInternalHandler})
  }finally{await f.close()}
})
test("Tool identity, owner, revision, expiry and approval fences reject forged execution before any external call",async()=>{
  const f=await fixture();let held,calls=0
  try{
    const identity=new WorkflowV2ToolLeaseIdentity(f.pool),broker=new WorkflowV2ToolDispatch(f.pool,key,{async http(){calls++;return "synthetic"}},f.pool)
    held=await f.hold();assert.deepEqual(await identity.resolve(held.wire),alice)
    await assert.rejects(new WorkflowV2ModelLeaseIdentity(f.pool).resolve(held.wire))
    await assert.rejects(broker.dispatch(bob,held.wire))
    for(const wire of [{...held.wire,input:"forged"},{...held.wire,input_sha256:"f".repeat(64)},
      {...held.wire,claim:{...held.wire.claim,lease_version:99}},{...held.wire,step_key:"wf2_00002_start"}]){
      await assert.rejects(identity.resolve(wire));await assert.rejects(broker.dispatch(alice,wire))
    }
    await f.db.query("UPDATE agentstudio.tool_connections SET revision=revision+1 WHERE id=$1",[f.tool.id])
    await assert.rejects(broker.dispatch(alice,held.wire));await f.db.query("UPDATE agentstudio.tool_connections SET revision=revision-1 WHERE id=$1",[f.tool.id])
    await f.db.query("UPDATE agentstudio.approvals SET status='rejected' WHERE run_id=$1",[held.wire.claim.run_id])
    await assert.rejects(identity.resolve(held.wire));await assert.rejects(broker.dispatch(alice,held.wire))
    await f.db.query("UPDATE agentstudio.approvals SET status='approved' WHERE run_id=$1",[held.wire.claim.run_id])
    await f.db.query("UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE run_id=$1",[held.wire.claim.run_id])
    await assert.rejects(identity.resolve(held.wire));await assert.rejects(broker.dispatch(alice,held.wire))
    await f.db.query("UPDATE agentstudio.jobs SET lease_until=clock_timestamp()+interval '2 minutes' WHERE run_id=$1",[held.wire.claim.run_id])
    assert.equal(calls,0)
    for(const kind of ["api","identity","broker"])await verifyWorkflowEffectIdentityPrivileges(f.pool,kind,"tool")
    await f.db.exec("ALTER TABLE agentstudio.external_effects DROP CONSTRAINT external_effects_status_check; "+
      "ALTER TABLE agentstudio.external_effects ADD CONSTRAINT external_effects_status_check CHECK(status IN ('started','succeeded','unknown'))")
    await assert.rejects(verifyWorkflowEffectIdentityPrivileges(f.pool,"identity","tool"))
    await f.db.exec(sql("migrations/pg_v9_026_workflow_tool_identity.sql"))
    await verifyWorkflowEffectIdentityPrivileges(f.pool,"identity","tool")
    assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_api','agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS allowed")).rows[0].allowed,false)
    assert.equal((await f.db.query("SELECT has_table_privilege('agentstudio_model_broker','agentstudio.tool_connections','SELECT') AS allowed")).rows[0].allowed,false)
  }finally{if(held)await held.finish();await f.close()}
})
test("concurrent Tool RPC and lost result commit cannot resend a POST",async()=>{
  const f=await fixture();let held,calls=0,enter,release
  const ready=new Promise(resolve=>{enter=resolve}),response=new Promise(resolve=>{release=resolve})
  try{
    held=await f.hold();const broker=new WorkflowV2ToolDispatch(f.pool,key,{async http(){calls++;enter();return response}},f.pool)
    const first=broker.dispatch(alice,held.wire);await ready
    await assert.rejects(broker.dispatch(alice,held.wire),e=>e.code==="workflow_tool_already_dispatched")
    release("synthetic once");await first
    await assert.rejects(broker.dispatch(alice,held.wire),e=>e.code==="workflow_tool_already_dispatched");assert.equal(calls,1)
  }finally{release("cleanup");if(held)await held.finish();await f.close()}
  const g=await fixture();let posts=0,failed=false
  try{
    g.setFault((sql,values)=>{if(!failed&&sql.startsWith("UPDATE agentstudio.external_effects")&&String(values[2]).startsWith("wf2_tool:")&&values[3]==="succeeded"){
      failed=true;throw Error("synthetic result commit lost")}})
    const broker=new WorkflowV2ToolDispatch(g.pool,key,{async http(){posts++;return "synthetic POST committed"}},g.pool)
    await withDisposableBoundModelTls(verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(g.pool),broker),async config=>{
      const worker=new WorkflowV2Worker(g.pool,"lost-tool-commit",{executor:workflowV2ToolEffectExecutor(config)})
      const queued=await g.make({tool_binding:g.toolBinding,params_template:"{}"}),done=await g.drive(worker,queued.run.id)
      assert.equal(done.run.status,"paused");assert.equal((await worker.tick()).status,"idle");assert.equal(posts,1)
      assert.deepEqual((await g.db.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[queued.run.id])).rows,
        [{status:"unknown"},{status:"started"}])
    },{handlerFactory:createWorkflowV2ToolInternalHandler})
  }finally{g.setFault(undefined);await g.close()}
})
