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
import {safeAgentSpec} from "../src/contracts.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {createPgNativeWorkflowRunSession,workflowApprovalReady} from "../../../src/lib/pgNativeWorkflowRunSession.ts"
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
    const models=new ModelConnectionRepository(pool,Buffer.from("0123456789abcdef".repeat(4),"hex"))
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
      workflowRepository:new WorkflowRepository(pool),workflowV2RunRepository:new WorkflowV2RunRepository(pool),modelConnectionRepository:models})
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
    // The new child steps keep the same real Native Cookie/CSRF boundary.
    const identity=(await auth.getSessionProfile(admin.token)).identity
    const saved=await models.create(identity,{name:"Synthetic Agent model",provider:"openai",base_url:"https://api.openai.com/v1",
      api_key:"synthetic-http-agent-key-no-provider",models:["synthetic"],enabled:true})
    const model=await models.testConnection(identity,saved.id,saved.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
    const role=await new AgentSpecRepository(pool).create(identity,"Native role",safeAgentSpec({goal:"Native private role",tools:["calculate"],
      model_binding:{connection_id:model.id,connection_revision:model.revision,model_id:"synthetic"}}))
    const longNode="n".repeat(80),agentGraph={version:2,nodes:[graph.nodes[0],{id:longNode,type:"agent",data:{title:"Role",
      agent_binding:{spec_id:role.id,spec_revision:role.revision},max_steps:3},position:{x:100,y:0}},
      {...graph.nodes[2],data:{title:"End",output_template:"{{Role.output}}"}}],edges:[{id:"a",source:"start",target:longNode},{id:"b",source:longNode,target:"end"}]}
    enabled=true;configure()
    const agentFlow=await alice.api.createWorkflowGraph("Native Agent",agentGraph)
    const agentRun=await alice.api.submitWorkflowV2Run(agentFlow.id,1,"Agent task","native-agent-child-http-001")
    let modelCalls=0,toolCalls=0,checkedRevocation=false
    const agentWorker=new WorkflowV2Worker(pool,"native-agent-http",{agentExecutionApproved:true,executor:{async execute(request){
      assert.ok(request.agent_context)
      if(request.kind==="tool"){toolCalls++;return "2+2 = 4"}
      modelCalls++;return JSON.stringify(JSON.parse(request.input).round===1?
        {action:"tool",tool:"calculate",params:{expression:"2+2"}}:{action:"answer",answer:"Native Agent result 4"})
    }}})
    for(let i=0;i<20;i++){
      await agentWorker.tick();const detail=await alice.api.getWorkflowV2Run(agentRun.run.id)
      if(detail.run.status==="succeeded")break
      if(detail.run.status!=="awaiting_approval")continue
      const current=detail.pending_effect
      await assert.rejects(bob.api.decideWorkflowV2Node(agentRun.run.id,"approved",current.step_key,current.input_sha256),e=>e.status===404)
      if(current.agent_context&&!checkedRevocation){
        enabled=false;configure();await assert.rejects(alice.api.decideWorkflowV2Node(agentRun.run.id,"approved",current.step_key,current.input_sha256),e=>e.status===405)
        assert.equal((await agentWorker.tick()).status,"idle");enabled=true;configure();checkedRevocation=true
      }
      await alice.api.decideWorkflowV2Node(agentRun.run.id,"approved",current.step_key,current.input_sha256)
    }
    const agentDone=await alice.api.getWorkflowV2Run(agentRun.run.id)
    assert.equal(agentDone.run.status,"succeeded");assert.equal(agentDone.run.result_text,"Native Agent result 4")
    assert.equal(modelCalls,2);assert.equal(toolCalls,1);assert.equal(checkedRevocation,true)
    assert.equal(JSON.stringify(agentDone).includes("Native private role"),false)
    const agentPage=await alice.api.getWorkflowV2Steps(agentRun.run.id,"",3)
    const agentTail=await alice.api.getWorkflowV2Steps(agentRun.run.id,agentPage.next_after,200)
    assert.equal(agentPage.items.length+agentTail.items.length,6)
    // Real employee controller -> Cookie/CSRF -> SQL -> seven node kinds,
    // with synthetic final effects and committed-response loss recovery.
    const item=(id,type,data)=>({id,type,data:{title:id,...data},position:{x:100,y:100}})
    const link=(source,target,sourceHandle)=>({id:source+"-"+target+"-"+(sourceHandle??"default"),source,target,...(sourceHandle?{sourceHandle}:{})})
    const fullGraph={version:2,nodes:[item("start","start",{}),item("condition","condition",{op:"contains",value:"run"}),
      item("loop","loop",{mode:"count",count:2,max_iterations:2}),item("model","model",{prompt:"{{input}} / {{loop.item}}",
        model_binding:{connection_id:model.id,connection_revision:model.revision,model_id:"synthetic"}}),
      item("tool","tool",{tool:"calculate",params_template:'{"expression":"2+2"}'}),
      item("agent","agent",{agent_binding:{spec_id:role.id,spec_revision:role.revision},prompt:"Deliver {{tool.output}}",max_steps:1}),
      item("end","end",{output_template:"{{agent.output}}"})],edges:[link("start","condition"),link("condition","loop","true"),
        link("condition","end","false"),link("loop","model"),link("model","loop"),link("loop","tool","done"),link("tool","agent"),link("agent","end")]}
    const full=await alice.api.createWorkflowGraph("Seven kinds",fullGraph,"abcdabcd-1111-4111-8111-111111111111")
    let lostSubmit=true,lostDecision=true,executed=0,decisions=0
    const ui=createPgNativeWorkflowRunSession({...alice.api,async submitWorkflowV2Run(...args){const result=await alice.api.submitWorkflowV2Run(...args)
      if(lostSubmit){lostSubmit=false;throw Error("synthetic submitted response lost")};return result},
      async decideWorkflowV2Node(...args){const result=await alice.api.decideWorkflowV2Node(...args)
        assert.deepEqual(result.decision_confirmation,{run_id:args[0],step_key:args[2],input_sha256:args[3],status:args[1]})
        if(lostDecision){lostDecision=false;throw Error("synthetic decision response lost")};return result}},
      {key:()=>"native-workflow-seven-kind-001"})
    ui.setActive(true);await ui.refresh()
    await ui.submit({workflowId:full.id,revision:1,instruction:"run seven kinds"});assert.ok(ui.snapshot().pendingSubmit)
    ui.setActive(false);ui.setActive(true);await ui.submit({workflowId:full.id,revision:99,instruction:"must not replace"})
    const uiRun=ui.snapshot().detail.run.id
    const sevenWorker=()=>new WorkflowV2Worker(pool,"seven-kind-ui",{agentExecutionApproved:true,executor:{async execute(request){
      executed++;if(request.kind==="tool")return "2+2 = 4"
      if(request.agent_context){assert.match(JSON.parse(request.input).task,/4/);return JSON.stringify({action:"answer",answer:"Full UI Workflow result 4"})}
      return "Loop model result "+request.input
    }}})
    for(let i=0;i<50;i++){
      await sevenWorker().tick();await ui.refresh();const current=ui.snapshot().detail
      if(["succeeded","failed","paused"].includes(current.run.status))break
      if(current.run.status!=="awaiting_approval")continue
      assert.equal(workflowApprovalReady(current),true);decisions++;await ui.decide("approved",true)
      if(ui.snapshot().pendingMutation){const original=ui.snapshot().pendingMutation;await ui.retryMutation();assert.equal(ui.snapshot().pendingMutation,null);assert.ok(original.hash)}
    }
    assert.equal(ui.snapshot().detail.run.id,uiRun);assert.equal(ui.snapshot().detail.run.status,"succeeded")
    assert.equal(ui.snapshot().detail.run.result_text,"Full UI Workflow result 4");assert.equal(executed,4);assert.equal(decisions,5)
    assert.ok(ui.snapshot().detail.steps.some(step=>step.metadata.branch==="true"))
    assert.ok(ui.snapshot().detail.steps.some(step=>step.metadata.node_type==="loop"))
    await assert.rejects(bob.api.getWorkflowV2Run(uiRun),e=>e.status===404)
    ui.dispose();assert.equal(ui.snapshot().detail,null)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await db.close()}
})
