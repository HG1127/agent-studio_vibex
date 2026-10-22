import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {readFileSync} from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {AUTONOMOUS_AGENT_APPROVAL} from "../src/durable-v2-root.ts"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {AgentSpecRepository} from "../src/repository.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {createHandler} from "../src/http.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createPgNativeAutonomousAgentSession} from "../../../src/lib/pgNativeAutonomousAgentSession.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
const config={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY"}
const env={...config,AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:"true",AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:AUTONOMOUS_AGENT_APPROVAL}
const uuid="11111111-1111-1111-1111-111111111111"
test("autonomous admission has its own non-root HTTPS grant and retains read/cancel after revocation",()=>{
  const selected=selectNativePg18UatCapabilities(env,true,"https://native.invalid",1100)
  assert.equal(selected.autonomousAgentUat,true);assert.notEqual(selected.workflowV2ExecutionUat,true)
  const submit="/api/v2/agent-specs/"+uuid+"/autonomous-runs",decision="/api/v2/agent-autonomous-runs/"+uuid+"/decision"
  for(const path of [submit,decision]){
    assert.equal(permitNativePg18BusinessUatRequest(path,"POST",selected),true)
    for(const policy of [{},{configurationWrites:true,workflowV2ExecutionUat:true},{...selected,configurationWrites:false}])
      assert.equal(permitNativePg18BusinessUatRequest(path,"POST",policy),false)
  }
  for(const changes of [{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:undefined},{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:undefined},
    {AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:"wrong"},{AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined}])
    assert.throws(()=>selectNativePg18UatCapabilities({...env,...changes},true,"https://native.invalid",1100))
  for(const [listen,origin,uid] of [[false,"https://native.invalid",1100],[true,"http://localhost",1100],[true,"https://native.invalid",0]])
    assert.throws(()=>selectNativePg18UatCapabilities(env,listen,origin,uid))
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/agent-autonomous-runs/"+uuid,"GET",{}),true)
  assert.equal(permitNativePg18BusinessUatRequest("/api/v2/agent-autonomous-runs/"+uuid+"/cancel","POST",{}),true)
})

test("Native Cookie autonomous Agent API: strict idempotency, queue isolation, owner/CSRF, private history and revocation",async()=>{
  const db=await PGlite.create({extensions:{vector}});let server,native,backend,enabled=false
  try{
    await db.exec("CREATE DATABASE agent_studio");await db.exec(freshSchemaForTest().sql);await prepareNativeAuthPgliteRoles(db)
    await db.exec(reviewedNativeSqlForEmbeddedTest(readFileSync(new URL("../../../db/postgres/010_pg18_native_auth_proposed.sql",import.meta.url),"utf8")))
    let tail=Promise.resolve()
    const pool={async connect(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous
      return {query:(sql,args=[])=>db.query(sql,args),release}}}
    const auth=new NativeAuthRepository(pool),password="SyntheticAutonomousPassword#2026",origin="https://native-agent.invalid"
    await auth.provisionInitialAdmin({email:"alice@example.com",password,display_name:"Alice"})
    const admin=await auth.login("alice@example.com",password)
    await auth.provisionEmployee(admin.token,{email:"bob@example.com",password,display_name:"Bob"})
    const configure=()=>{const policy={configurationWrites:true,autonomousAgentUat:enabled}
      native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,allowAutonomousAgentSubmission:enabled,
        businessHandler:(req,res)=>{
          if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,policy)){
            res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return}
          return backend(req,res)
        }})}
    const runs=new AutonomousAgentRunRepository(pool),legacy=new RunRepository(pool)
    configure();backend=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("cookie_required")},
      authenticateRequest:req=>native.authenticateRequest(req),repository:new AgentSpecRepository(pool),runRepository:legacy,
      workflowV2RunRepository:new WorkflowV2RunRepository(pool),autonomousAgentRunRepository:runs})
    server=createServer((req,res)=>{void native.handler(req,res).catch(()=>res.destroy())})
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const base="http://127.0.0.1:"+server.address().port
    const client=()=>{let cookie="";const raw=async(route,options={})=>{
      const response=await fetch(base+route,{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(15000)})
      const saved=response.headers.get("set-cookie");if(saved)cookie=saved.split(";")[0];return response
    };return {api:createPgNativePilotApi(raw,""),raw}}
    const alice=client(),bob=client();await alice.api.login("alice@example.com",password);await bob.api.login("bob@example.com",password)
    const identity=(await auth.getSessionProfile(admin.token)).identity,key=Buffer.from("0123456789abcdef".repeat(4),"hex")
    const models=new ModelConnectionRepository(pool,key),saved=await models.create(identity,{name:"Synthetic",provider:"openai",base_url:"https://api.openai.com/v1",
      api_key:"synthetic-http-native-no-provider",models:["synthetic"],enabled:true})
    const model=await models.testConnection(identity,saved.id,saved.revision,async()=>({status:"ok",latency_ms:1,error_code:""}))
    const role=await new AgentSpecRepository(pool).create(identity,"Native role",safeAgentSpec({goal:"ROLE_PRIVATE",tools:["calculate"],
      model_binding:{connection_id:model.id,connection_revision:model.revision,model_id:"synthetic"}}))
    assert.notEqual((await alice.api.getConfigCapabilities()).autonomous_agent_submission_enabled,true)
    const submit=(max=3)=>alice.api.submitAutonomousAgentRun(role.id,role.revision,"Synthetic task","native-autonomous-0001",max)
    await assert.rejects(submit(),e=>e.status===405);enabled=true;configure()
    assert.equal((await alice.api.getConfigCapabilities()).autonomous_agent_submission_enabled,true)
    let loseSubmit=true,loseDecision=true
    const ui=createPgNativeAutonomousAgentSession({...alice.api,async submitAutonomousAgentRun(...args){
      const result=await alice.api.submitAutonomousAgentRun(...args)
      if(loseSubmit){loseSubmit=false;throw Error("synthetic committed response lost")};return result
    },async decideAutonomousAgentNode(...args){
      const result=await alice.api.decideAutonomousAgentNode(...args)
      if(loseDecision){loseDecision=false;throw Error("synthetic committed decision response lost")};return result
    }},{key:()=>"native-autonomous-0001"})
    ui.setActive(true);await ui.refresh()
    const uiDraft={agentId:role.id,revision:role.revision,instruction:"Synthetic task",maxSteps:3}
    await ui.submit(uiDraft);assert.ok(ui.snapshot().pendingSubmit)
    ui.setActive(false);ui.setActive(true)
    await ui.submit({...uiDraft,instruction:"Must not replace the committed task",maxSteps:1})
    assert.equal(ui.snapshot().pendingSubmit,null);assert.equal(ui.snapshot().detail.replayed,true)
    const queued=ui.snapshot().detail;assert.equal(queued.run.kind,"agent");assert.equal(queued.run.workflow_id,null)
    assert.equal(queued.run.checkpoint.max_steps,3)
    assert.equal(queued.run.agent_spec_id,role.id);assert.equal(queued.worker_started_by_api,false)
    assert.equal((await submit()).replayed,true);await assert.rejects(submit(2),e=>e.status===409)
    await assert.rejects(bob.api.submitAutonomousAgentRun(role.id,1,"Synthetic task","bob-autonomous-0001",3),e=>e.status===404)
    assert.deepEqual(await bob.api.listAutonomousAgentRuns(),[]);await assert.rejects(bob.api.getAutonomousAgentRun(queued.run.id),e=>e.status===404)
    assert.equal((await new WorkflowV2Worker(pool,"workflow-only").tick()).status,"idle")
    assert.equal(await new AgentPrepareWorker(pool,"prepare-only").claim(),null)
    assert.equal(await new AgentModelWorker(pool,"model-only",{async execute(){throw Error("legacy should not call")}}).claim(),null)
    assert.equal((await db.query("SELECT count(*)::int AS n FROM agentstudio.workflows")).rows[0].n,0)
    assert.deepEqual(await legacy.list(identity),[]);assert.equal(await legacy.get(identity,queued.run.id),null)
    assert.deepEqual(await legacy.steps(identity,queued.run.id),[]);assert.equal(await legacy.approval(identity,queued.run.id),null)
    await assert.rejects(legacy.decideModel(identity,queued.run.id,{decision:"approved"}),e=>e.status===404)
    assert.equal((await fetch(base+"/api/v2/agent-autonomous-runs/"+queued.run.id,{headers:{"X-Rh-User-Id":"alice"}})).status,401)
    let calls=0,revoked=false
    const worker=()=>new WorkflowV2Worker(pool,"autonomous-http",{executionMode:"agent_native_v2",agentExecutionApproved:true,executor:{async execute(request){
      assert.ok(request.agent_context);calls++;if(request.kind==="tool")return "2+2 = 4"
      return JSON.stringify(JSON.parse(request.input).round===1?{action:"tool",tool:"calculate",params:{expression:"2+2"}}:{action:"answer",answer:"Synthetic result 4"})
    }}})
    for(let i=0;i<24;i++){
      await worker().tick();await ui.refresh();const detail=ui.snapshot().detail
      if(detail.run.status==="succeeded")break
      if(detail.run.status!=="awaiting_approval")continue
      const p=detail.pending_effect
      await assert.rejects(bob.api.decideAutonomousAgentNode(queued.run.id,"approved",p.step_key,p.input_sha256),e=>e.status===404)
      if(!revoked){
        const noCsrf=await alice.raw("/api/v2/agent-autonomous-runs/"+queued.run.id+"/decision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision:"approved",step_key:p.step_key,input_sha256:p.input_sha256})})
        assert.equal(noCsrf.status,403);enabled=false;configure()
        await assert.rejects(alice.api.decideAutonomousAgentNode(queued.run.id,"approved",p.step_key,p.input_sha256),e=>e.status===405)
        assert.equal((await worker().tick()).status,"idle");enabled=true;configure();revoked=true
      }
      await ui.decide("approved",true)
    }
    const done=await alice.api.getAutonomousAgentRun(queued.run.id)
    assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"Synthetic result 4");assert.equal(calls,3)
    for(const privateText of ["ROLE_PRIVATE","agent_state","graph\"","synthetic-http-native-no-provider"])assert.equal(JSON.stringify(done).includes(privateText),false)
    const first=await alice.api.getAutonomousAgentSteps(queued.run.id,"",3),last=await alice.api.getAutonomousAgentSteps(queued.run.id,first.next_after)
    assert.equal(first.items.length+last.items.length,6)
    const cancel=await alice.api.submitAutonomousAgentRun(role.id,1,"Cancel me","native-autonomous-cancel-001",3)
    enabled=false;configure();assert.equal((await alice.api.cancelAutonomousAgentRun(cancel.run.id)).run.status,"cancelled")
    assert.equal((await alice.api.listAutonomousAgentRuns()).length,2)
    ui.dispose();assert.equal(ui.snapshot().detail,null)
    key.fill(0)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await db.close()}
})
