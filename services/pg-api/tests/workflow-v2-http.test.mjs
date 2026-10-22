// Native Cookie -> independently gated V2 HTTP -> real embedded SQL ->
// synthetic Worker adapter. No browser, provider or company database.
import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {readFileSync} from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {createHandler} from "../src/http.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
const approval="APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_EXECUTION_ONLY"
const config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"}
const env={...config,AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED:"true",AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED:approval}
const id="11111111-1111-1111-1111-111111111111"
test("V2 admission needs its own exact non-root HTTPS grant; read and safe cancellation remain available after revocation",()=>{
  const selected=selectNativePg18UatCapabilities(env,true,"https://studio.test.invalid",1100)
  assert.equal(selected.workflowV2ExecutionUat,true);assert.notEqual(selected.workflowExecutionUat,true)
  const submit="/api/v2/workflows/"+id+"/native-runs",decision="/api/v2/workflow-v2-runs/"+id+"/decision"
  for(const pathname of [submit,decision]){
    assert.equal(permitNativePg18BusinessUatRequest(pathname,"POST",selected),true)
    for(const policy of [{},selectNativePg18UatCapabilities(config,true,"https://studio.test.invalid",1100),
      {...selected,workflowV2ExecutionUat:false},{...selected,configurationWrites:false}])
      assert.equal(permitNativePg18BusinessUatRequest(pathname,"POST",policy),false)
  }
  for(const bad of [{...config,AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_ENABLED:"true"},
    {...env,AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED:"wrong"},{...env,AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
    {...config,AGENT_STUDIO_PG18_WORKFLOW_V2_UAT_APPROVED:approval}])
    assert.throws(()=>selectNativePg18UatCapabilities(bad,true,"https://studio.test.invalid",1100),/unsafe_native_pg18_uat_config/)
  for(const [listen,origin,uid] of [[false,"https://studio.test.invalid",1100],[true,"http://localhost",1100],[true,"https://studio.test.invalid",0]])
    assert.throws(()=>selectNativePg18UatCapabilities(env,listen,origin,uid),/unsafe_native_pg18_uat_config/)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/workflow-v2-runs/"+id,"GET",{}),true)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/workflow-v2-runs/"+id+"/cancel","POST",{}),true)
  assert.equal(permitNativePg18BusinessUatRequest(decision,"GET",selected),false)
  assert.equal(permitNativePg18BusinessUatRequest(submit+"?approved=true","POST",selected),false)
})

test("Native V2 HTTP preserves Cookie/CSRF/owner scope through approval, replay, step pagination and revoked admission",async()=>{
  const db=await PGlite.create({extensions:{vector}});let server,native,backend,enabled=false
  try{
    await db.exec("CREATE DATABASE agent_studio");await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    await db.exec(reviewedNativeSqlForEmbeddedTest(readFileSync(new URL("../../../db/postgres/010_pg18_native_auth_proposed.sql",import.meta.url),"utf8")))
    let tail=Promise.resolve()
    const pool={async connect(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous
      return {query:(sql,args=[])=>db.query(sql,args),release}}}
    const auth=new NativeAuthRepository(pool),password="SyntheticWorkflowHttpPassword#2026"
    await auth.provisionInitialAdmin({email:"alice@example.com",password,display_name:"Synthetic Alice"})
    const admin=await auth.login("alice@example.com",password)
    await auth.provisionEmployee(admin.token,{email:"bob@example.com",password,display_name:"Synthetic Bob"})
    const origin="https://workflow-http.test.invalid"
    const configure=()=>{const policy={configurationWrites:true,workflowV2ExecutionUat:enabled}
      native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,allowWorkflowV2Submission:enabled,
        businessHandler:(req,res)=>{
          if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,policy)){
            res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return}
          return backend(req,res)
        }})}
    configure()
    backend=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("cookie_required")},
      authenticateRequest:req=>native.authenticateRequest(req),repository:new AgentSpecRepository(pool),
      workflowRepository:new WorkflowRepository(pool),workflowV2RunRepository:new WorkflowV2RunRepository(pool)})
    server=createServer((req,res)=>{void native.handler(req,res).catch(()=>res.destroy())})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const base="http://127.0.0.1:"+server.address().port
    const client=()=>{let cookie="";const transport=async(route,options={})=>{
      const response=await fetch(base+route,{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(15000)})
      const saved=response.headers.get("set-cookie");if(saved)cookie=saved.split(";")[0];return response
    };return {api:createPgNativePilotApi(transport,""),raw:transport}}
    const alice=client(),bob=client();await alice.api.login("alice@example.com",password);await bob.api.login("bob@example.com",password)
    const graph={version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"tool",type:"tool",data:{title:"Tool",tool:"calculate",params_template:'{"expression":"2+2"}'},position:{x:100,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{Tool.output}}"},position:{x:200,y:0}}],
      edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]}
    const flow=await alice.api.createWorkflowGraph("Synthetic native V2",graph)
    assert.notEqual((await alice.api.getConfigCapabilities()).workflow_v2_submission_enabled,true)
    await assert.rejects(alice.api.submitWorkflowV2Run(flow.id,1,"private task","native-v2-http-request-0001"),e=>e.status===405)
    enabled=true;configure()
    assert.equal((await alice.api.getConfigCapabilities()).workflow_v2_submission_enabled,true)
    const run=await alice.api.submitWorkflowV2Run(flow.id,1,"private task","native-v2-http-request-0001")
    assert.equal(run.worker_started_by_api,false)
    assert.equal((await alice.api.submitWorkflowV2Run(flow.id,1,"private task","native-v2-http-request-0001")).replayed,true)
    assert.deepEqual(await bob.api.listWorkflowV2Runs(),[])
    await assert.rejects(bob.api.getWorkflowV2Run(run.run.id),e=>e.status===404)
    await assert.rejects(bob.api.getWorkflowV2Steps(run.run.id),e=>e.status===404)
    assert.equal((await fetch(base+"/api/v2/workflow-v2-runs/"+run.run.id,{headers:{"X-Rh-User-Id":"alice"}})).status,401)
    let calls=0
    const worker=new WorkflowV2Worker(pool,"http-synthetic",{executor:{async execute(){calls++;return "synthetic HTTP result"}}})
    await worker.tick()
    const pending=(await alice.api.getWorkflowV2Run(run.run.id)).pending_effect
    await assert.rejects(bob.api.decideWorkflowV2Node(run.run.id,"approved",pending.step_key,pending.input_sha256),e=>e.status===404)
    const forged=await alice.raw("/api/v2/workflow-v2-runs/"+run.run.id+"/decision",{method:"POST",
      headers:{"X-AgentStudio-Request":"1","Content-Type":"application/json"},
      body:JSON.stringify({decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256,output:"forged result"})})
    assert.equal(forged.status,400)
    const noCsrf=await alice.raw("/api/v2/workflow-v2-runs/"+run.run.id+"/decision",{method:"POST",
      headers:{"Content-Type":"application/json"},body:JSON.stringify({decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256})})
    assert.equal(noCsrf.status,403)
    enabled=false;configure()
    await assert.rejects(alice.api.decideWorkflowV2Node(run.run.id,"approved",pending.step_key,pending.input_sha256),e=>e.status===405)
    assert.equal((await alice.api.getWorkflowV2Run(run.run.id)).run.status,"awaiting_approval")
    enabled=true;configure()
    await alice.api.decideWorkflowV2Node(run.run.id,"approved",pending.step_key,pending.input_sha256)
    await worker.tick();await worker.tick()
    const done=await alice.api.getWorkflowV2Run(run.run.id)
    assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"synthetic HTTP result");assert.equal(calls,1)
    const first=await alice.api.getWorkflowV2Steps(run.run.id,"",1)
    assert.equal(first.items.length,1);assert.ok(first.next_after)
    const next=await alice.api.getWorkflowV2Steps(run.run.id,first.next_after,200)
    assert.equal(next.items.length,2);assert.equal(next.next_after,null)
    assert.equal(next.items.some(step=>Object.hasOwn(step.metadata,"output_text")),false)
    const cancellable=await alice.api.submitWorkflowV2Run(flow.id,1,"cancel me","native-v2-http-cancel-0001")
    enabled=false;configure()
    assert.equal((await alice.api.cancelWorkflowV2Run(cancellable.run.id)).run.status,"cancelled")
    assert.equal((await alice.api.listWorkflowV2Runs()).length,2)
    assert.equal(calls,1)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await db.close()}
})
