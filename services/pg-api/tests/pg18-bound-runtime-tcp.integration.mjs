// GitHub-hosted disposable PG18 only. Real SQL roles, HTTPS Cookie/CSRF,
// owner RLS and private mTLS; synthetic model executor, no provider traffic.
import test from "node:test"
import assert from "node:assert/strict"
import {createHash,randomBytes,randomUUID} from "node:crypto"
import {createServer,request} from "node:https"
import {execFileSync} from "node:child_process"
import {mkdtempSync,readFileSync,realpathSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import pg from "pg"
import {requireEphemeralPg18Ci} from "../src/pg18-ephemeral-ci-guard.mjs"
import {loadPg18CiBaseline} from "../src/pg18-ci-schema.mjs"
import {loadNativeAuthPg18CiSchema} from "../src/pg18-native-auth-ci-schema.mjs"
import {verifyBoundDispatchPrivileges,verifyBoundDispatchRole,verifyWorkflowModelIdentityPrivileges,verifyWorkflowEffectIdentityPrivileges} from "../src/bound-dispatch-role-preflight.ts"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createPgNativeWorkflowRunSession,workflowApprovalReady} from "../../../src/lib/pgNativeWorkflowRunSession.ts"
import {createPgNativeWorkflowDebugSession} from "../../../src/lib/pgNativeWorkflowDebugSession.ts"
import {createHandler} from "../src/http.ts"
import {createNativeRunRepository} from "../src/native-run-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowSafeRunRepository} from "../src/workflow-safe-run-repository.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {WorkflowV2ModelDispatch,WorkflowV2ModelLeaseIdentity,verifiedWorkflowV2ModelDispatch} from "../src/workflow-v2-model-dispatch.ts"
import {workflowV2ModelEffectExecutor} from "../src/workflow-v2-model-client.ts"
import {createWorkflowV2ModelInternalHandler} from "../src/workflow-v2-model-handler.ts"
import {WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch} from "../src/workflow-v2-tool-dispatch.ts"
import {workflowV2ToolEffectExecutor} from "../src/workflow-v2-tool-client.ts"
import {createWorkflowV2ToolInternalHandler} from "../src/workflow-v2-tool-handler.ts"
import {prepareWorkflowToolHttp,redactWorkflowToolResponse} from "../src/workflow-v2-tool-network.ts"
import {ToolConnectionRepository} from "../src/tool-connection-repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "../src/bound-lease-identity.ts"
import {createBoundModelMutualTlsClient} from "../src/bound-model-client.ts"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"

const adapter=pool=>({async connect(){
  const c=await pool.connect()
  return {async query(sql,values=[]){const r=await c.query(sql,values);return {rows:r.rows}},
    release(){c.release()}}
}})
const upgrade=name=>readFileSync(new URL("../../../db/postgres/migrations/"+name,import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const policy={configurationWrites:true,employeeProvisioning:true,runApprovalUat:true,
  boundModelExecutionUat:true,modelProbeUat:true,workflowV2ExecutionUat:true,autonomousAgentUat:true}

async function startNativeHttps(auth,pool,key,brokerPool){
  const parent=realpathSync(tmpdir())
  const folder=mkdtempSync(path.join(parent,"pg18-bound-native-ci-"))
  assert.equal(path.dirname(realpathSync(folder)),parent)
  let server
  try{
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-sha256",
      "-keyout","native.key","-out","native.pem","-days","1","-subj","/CN=localhost",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1"],
    {cwd:folder,stdio:"ignore",timeout:20000,windowsHide:true})
    const ca=readFileSync(path.join(folder,"native.pem"))
    server=createServer({cert:ca,key:readFileSync(path.join(folder,"native.key")),minVersion:"TLSv1.2"})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const port=server.address().port,origin="https://localhost:"+port
    let backend
    const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,
      allowEmployeeProvisioning:true,allowConfigurationWrites:true,allowModelProbe:true,
      allowRunSubmission:policy.runApprovalUat,allowBoundRunSubmission:policy.boundModelExecutionUat,
      allowWorkflowV2Submission:policy.workflowV2ExecutionUat,allowAutonomousAgentSubmission:policy.autonomousAgentUat,
      businessHandler:(req,res)=>{
        const route=new URL(req.url,"https://localhost").pathname
        if(!permitNativePg18BusinessUatRequest(route,req.method,policy)){
          res.writeHead(405,{"Content-Type":"application/json"})
          res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return
        }
        return backend(req,res)
      }})
    backend=createHandler({allowedOrigin:origin,
      verifyToken:async()=>{throw Error("native_cookie_required")},
      authenticateRequest:native.authenticateRequest,
      repository:new AgentSpecRepository(pool),runRepository:createNativeRunRepository(pool,policy),
      workflowRepository:new WorkflowRepository(pool),
      workflowV2RunRepository:new WorkflowV2RunRepository(pool),autonomousAgentRunRepository:new AutonomousAgentRunRepository(pool),
      modelConnectionRepository:new ModelConnectionRepository(pool,key,brokerPool),
      toolConnectionRepository:new ToolConnectionRepository(pool,key),
      modelConnectionProbe:async()=>({status:"ok",latency_ms:1,error_code:""})})
    server.on("request",native.handler)
    let cookie=""
    const transport=(route,init={})=>new Promise((resolve,reject)=>{
      const body=init.body?Buffer.from(init.body):null
      const req=request({hostname:"127.0.0.1",servername:"localhost",port,
        path:route.replace(/^\/__pg_native(?=\/|$)/,""),method:init.method??"GET",
        ca,rejectUnauthorized:true,agent:false,timeout:10000,
        headers:{...init.headers,...(body?{"content-length":String(body.length)}:{}),
          ...(cookie?{Cookie:cookie}:{}),...(init.method&&init.method!=="GET"?{Origin:origin}:{})}},res=>{
        const chunks=[];let bytes=0
        res.on("data",chunk=>{bytes+=chunk.length;if(bytes>65536)res.destroy();else chunks.push(chunk)})
        res.on("error",reject)
        res.on("end",()=>{
          const saved=res.headers["set-cookie"]?.[0]
          if(saved){assert.match(saved,/HttpOnly/i);assert.match(saved,/Secure/i);cookie=saved.split(";")[0]}
          resolve(new Response(Buffer.concat(chunks),{status:res.statusCode}))
        })
      })
      req.on("timeout",()=>req.destroy(Error("ci_https_timeout")))
      req.on("error",reject);req.end(body??undefined)
    })
    return {api:createPgNativePilotApi(transport),async close(){
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
      rmSync(folder,{recursive:true,force:true})}}
  }catch(error){
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    rmSync(folder,{recursive:true,force:true});throw error
  }
}

test("PG18 TCP: native HTTPS approval -> independent private mTLS Broker -> durable bound result, no replay",async()=>{
  // FIRST effectful operation: exact GitHub-only target attestation. No pool,
  // certificate generation, listener or model executor exists before it.
  const target=requireEphemeralPg18Ci(process.env)
  const admin=new pg.Pool(target),pools=[]
  const key=randomBytes(32)
  let front
  try{
    const observed=(await admin.query("SELECT current_database() AS db,session_user AS login,"+
      "current_setting('server_version_num')::int AS version,"+
      "(SELECT count(*)::int FROM pg_namespace WHERE nspname IN ('agentstudio','agentstudio_auth')) AS existing,"+
      "(SELECT count(*)::int FROM pg_roles WHERE rolname LIKE 'agentstudio\\_%' ESCAPE '\\') AS roles")).rows[0]
    assert.equal(observed.db,"agentstudio_pg18_ci");assert.equal(observed.login,"agentstudio_admin")
    assert.ok(observed.version>=180000&&observed.version<190000)
    assert.equal(observed.existing,0);assert.equal(observed.roles,1) // only the CI administrator
    await admin.query(loadPg18CiBaseline().sql)
    const accounts=[
      ["agentstudio_stage_login","agentstudio_api"],
      ["agentstudio_stage_worker","agentstudio_worker,agentstudio_api"],
    ]
    const byLogin={}
    const installLogin=async([login,roles])=>{
      // All identifiers are literal constants and every password is ASCII
      // hex derived from the disposable Actions password. Never print them.
      const password="synthetic-"+createHash("sha256").update(target.password+":"+login).digest("hex")
      await admin.query("CREATE ROLE "+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS "+
        "NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '"+password+"'")
      await admin.query("GRANT "+roles+" TO "+login)
      const pool=new pg.Pool({...target,user:login,password,max:5})
      pools.push(pool);byLogin[login]=pool
    }
    for(const account of accounts)await installLogin(account)
    // Native Auth deliberately accepts ONLY the exact fresh three-entry
    // ledger. Apply it before later queue/identity migrations, preserving
    // its production guards rather than translating away that invariant.
    await admin.query(loadNativeAuthPg18CiSchema().sql)
    // The fresh schema contains V9 table shapes. This marker is explicitly
    // synthetic CI setup, never proof of a historical migration on a host.
    await admin.query("INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_022','synthetic CI predecessor')")
    await admin.query(upgrade("pg_v9_023_workflow_safe_worker.sql"))
    await admin.query(upgrade("pg_v9_024_bound_dispatch_identity.sql"))
    await admin.query(upgrade("pg_v9_025_workflow_model_identity.sql"))
    await admin.query(upgrade("pg_v9_026_workflow_tool_identity.sql"))
    await admin.query(upgrade("pg_v9_027_workflow_agent_identity.sql"))
    await admin.query(upgrade("pg_v9_028_autonomous_agent_identity.sql"))
    for(const account of [
      ["agentstudio_bound_dispatch_login","agentstudio_bound_dispatch"],
      ["agentstudio_model_broker_login","agentstudio_model_broker"],
    ])await installLogin(account)
    const authPassword="synthetic-"+createHash("sha256").update(target.password+":auth").digest("hex")
    await admin.query("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+authPassword+"'")
    const authPool=new pg.Pool({...target,user:"agentstudio_native_login",password:authPassword})
    pools.push(authPool)
    const apiPool=adapter(byLogin.agentstudio_stage_login)
    const identityPool=adapter(byLogin.agentstudio_bound_dispatch_login)
    const brokerPool=adapter(byLogin.agentstudio_model_broker_login)
    const workerPool=adapter(byLogin.agentstudio_stage_worker)
    for(const [kind,pool] of [["api",apiPool],["identity",identityPool],["broker",brokerPool]])
      {await verifyBoundDispatchPrivileges(pool,kind);await verifyWorkflowModelIdentityPrivileges(pool,kind);await verifyWorkflowEffectIdentityPrivileges(pool,kind,"tool")}
    for(const [kind,pool] of [["api",apiPool],["identity",identityPool],["broker",brokerPool]])
      for(const effect of ["agent_model","agent_tool","autonomous_model","autonomous_tool"])await verifyWorkflowEffectIdentityPrivileges(pool,kind,effect)
    // A disposable CI database must NOT pass the actual deployment target
    // wrapper. The privilege inspector above does not bypass that wrapper.
    await assert.rejects(verifyBoundDispatchRole(apiPool,{mode:"baota_pg18",host:"127.0.0.1",
      port:5333,database:"agent_studio",user:"agentstudio_stage_login",expectedMajor:18},"api"),
    /pg_runtime_target_mismatch/)
    await admin.query("GRANT pg_read_server_files TO agentstudio_bound_dispatch_login")
    await assert.rejects(verifyBoundDispatchPrivileges(identityPool,"identity"),/unsafe_bound_dispatch_database_role/)
    await admin.query("REVOKE pg_read_server_files FROM agentstudio_bound_dispatch_login")
    await verifyBoundDispatchPrivileges(identityPool,"identity")
    await admin.query("GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_api")
    await assert.rejects(verifyBoundDispatchPrivileges(apiPool,"api"),/unsafe_bound_dispatch_database_role/)
    await admin.query("REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_api")
    await verifyBoundDispatchPrivileges(apiPool,"api")
    const auth=new NativeAuthRepository(adapter(authPool))
    await auth.provisionInitialAdmin({email:"admin@example.com",password:"SyntheticAdminPassword#2026",display_name:"CI Admin"})
    front=await startNativeHttps(auth,apiPool,key,brokerPool)
    const api=front.api
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    const capabilities=await api.getConfigCapabilities()
    assert.equal(capabilities.run_submission_enabled,true)
    assert.equal(capabilities.bound_model_runs_enabled,true)
    assert.equal(capabilities.workflow_v2_submission_enabled,true)
    const secret="SyntheticProviderCredentialNeverSentToProvider012345"
    const saved=await api.createModelConnection({name:"CI owner",provider:"openai",
      base_url:"https://api.openai.com/v1",api_key:secret,models:["gpt-4.1-mini"],enabled:true})
    const ready=await api.testModelConnection(saved.id,saved.revision)
    const agent=await api.createAgent("CI owner Agent","Synthetic facts only")
    await api.bindAgentModel(agent.id,agent.revision,{connection_id:ready.id,
      connection_revision:ready.revision,model_id:"gpt-4.1-mini"})
    const instruction="Produce a disposable synthetic summary",requestKey="pg18-bound-ci-run-0001"
    const submitted=await api.submitRun(agent.id,instruction,requestKey)
    await api.createEmployee("other@example.com","SyntheticOtherPassword#2026","Other employee")
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(api.getRun(submitted.run.id),e=>e.status===404)
    await assert.rejects(api.decideModel(submitted.run.id,"approved"),e=>e.status===404)
    const prepare=new AgentPrepareWorker(workerPool,"ci-bound-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    await api.decideModel(submitted.run.id,"approved")
    let generated=0,fallback=0
    const broker=new OwnerBoundModelDispatch(apiPool,key,async(material,input)=>{
      generated++;assert.equal(material.api_key,secret);assert.equal(input.instruction,instruction)
      return "Synthetic PG18 bound model result"
    },brokerPool)
    const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(identityPool),broker)
    await withDisposableBoundModelTls(verified,async config=>{
      const worker=new AgentModelWorker(workerPool,"ci-bound-model",{async generate(){
        fallback++;throw Error("shared_model_fallback_forbidden")
      }},{boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(config)})
      assert.equal((await worker.tick()).status,"succeeded")
      assert.equal((await worker.tick()).status,"idle")
    })
    const result=await api.getRun(submitted.run.id)
    assert.equal(result.run.status,"succeeded");assert.equal(result.run.result_text,"Synthetic PG18 bound model result")
    assert.equal(JSON.stringify(result).includes(secret),false)
    assert.equal((await api.submitRun(agent.id,instruction,requestKey)).replayed,true)
    assert.equal(generated,1);assert.equal(fallback,0)
    const effects=(await admin.query("SELECT step_key,status FROM agentstudio.external_effects "+
      "WHERE run_id=$1 ORDER BY step_key",[submitted.run.id])).rows
    assert.deepEqual(effects,[{step_key:"model",status:"succeeded"},{step_key:"model_bound_dispatch",status:"succeeded"}])

    // Full-node configuration uses the actual restricted API login, including
    // owner resource locks and atomic audit. It must not enter the V1 Worker.
    const graph={version:2,nodes:[
      {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"model",type:"model",data:{title:"Model",prompt:"{{input}}",
        model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"}},position:{x:200,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{Model.output}}"},position:{x:400,y:0}},
    ],edges:[{id:"start-model",source:"start",target:"model"},{id:"model-end",source:"model",target:"end"}]}
    const workflow=await api.createWorkflowGraph("V2 configuration only",graph)
    assert.deepEqual(workflow.graph,graph)
    const renamed=await api.updateWorkflow(workflow.id,1,"V2 keeps complete graph")
    assert.deepEqual(renamed.graph,graph);assert.equal(renamed.revision,2)
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(api.getWorkflow(workflow.id),e=>e.status===404)
    await assert.rejects(api.updateWorkflowGraph(workflow.id,2,"foreign",graph),e=>e.status===404)
    await assert.rejects(api.createWorkflowGraph("foreign resource",graph),e=>e.status===404)
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    const ownerSession=await auth.login("admin@example.com","SyntheticAdminPassword#2026")
    const owner=(await auth.getSessionProfile(ownerSession.token)).identity
    await assert.rejects(new WorkflowSafeRunRepository(apiPool).submit(owner,workflow.id,{
      expected_revision:2,idempotency_key:"v2-execution-stays-closed"}),e=>e.code==="workflow_execution_node_not_supported")
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.jobs WHERE kind='workflow_tick'")).rows[0].n,0)
    const configAudit=(await admin.query("SELECT action,metadata FROM agentstudio.audit_events "+
      "WHERE target_kind='workflow' AND target_id=$1 ORDER BY occurred_at",[workflow.id])).rows
    assert.deepEqual(configAudit.map(row=>row.action),["workflow.config_create","workflow.config_update"])
    assert.equal(JSON.stringify(configAudit).includes(secret),false)
    assert.equal(generated,1)

    // Actual restricted PG18 identities and V2 mTLS transport, with only the
    // final provider function replaced by a local synthetic response/failure.
    let v2Calls=0,nodeDebugCalls=0
    const v2Broker=new WorkflowV2ModelDispatch(apiPool,key,async(material,prompt)=>{
      assert.equal(material.api_key,secret);v2Calls++
      if(prompt==="Synthetic unknown result")throw Error("synthetic_response_lost")
      assert.equal(prompt,"Synthetic V2 task");return "Synthetic PG18 V2 result"
    },brokerPool,{nodeDebugExecutor:async(material,prompt)=>{nodeDebugCalls++;assert.equal(material.api_key,secret);assert.equal(prompt,"Synthetic {{literal}} node test");return "Synthetic PG18 node debug result"}})
    const v2Dispatch=verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),v2Broker)
    await withDisposableBoundModelTls(v2Dispatch,async config=>{
      const v2=await api.submitWorkflowV2Run(workflow.id,2,"Synthetic V2 task","pg18-native-v2-runtime-0001")
      const v2Worker=new WorkflowV2Worker(workerPool,"ci-workflow-v2",{executor:workflowV2ModelEffectExecutor(config)})
      assert.equal((await v2Worker.tick()).status,"awaiting_approval")
      const pending=(await api.getWorkflowV2Run(v2.run.id)).pending_effect
      await api.login("other@example.com","SyntheticOtherPassword#2026")
      await assert.rejects(api.getWorkflowV2Run(v2.run.id),e=>e.status===404)
      await assert.rejects(api.decideWorkflowV2Node(v2.run.id,"approved",pending.step_key,pending.input_sha256),e=>e.status===404)
      await api.login("admin@example.com","SyntheticAdminPassword#2026")
      await api.decideWorkflowV2Node(v2.run.id,"approved",pending.step_key,pending.input_sha256)
      await v2Worker.tick();await v2Worker.tick()
      assert.equal((await api.getWorkflowV2Run(v2.run.id)).run.result_text,"Synthetic PG18 V2 result")
      const outputs=await api.getWorkflowV2Outputs(v2.run.id),outputPage=await api.getWorkflowV2OutputHistory(v2.run.id,"",1)
      assert.equal(outputs.nodes.find(node=>node.node_type==="model").output_text,"Synthetic PG18 V2 result")
      assert.equal(outputPage.run.output_version,outputs.run.output_version);assert.ok(outputPage.next_after)
      assert.equal((await api.getWorkflowV2OutputHistory(v2.run.id,outputPage.next_after,50)).items.length,2)
      await api.login("other@example.com","SyntheticOtherPassword#2026")
      await assert.rejects(api.getWorkflowV2Outputs(v2.run.id),error=>error.status===404);await assert.rejects(api.getWorkflowV2OutputHistory(v2.run.id),error=>error.status===404)
      await api.login("admin@example.com","SyntheticAdminPassword#2026")
      assert.equal((await api.submitWorkflowV2Run(workflow.id,2,"Synthetic V2 task","pg18-native-v2-runtime-0001")).replayed,true)
      assert.equal(v2Calls,1)
      assert.deepEqual((await admin.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[v2.run.id])).rows,
        [{status:"succeeded"},{status:"succeeded"}])
      const uncertain=await api.submitWorkflowV2Run(workflow.id,2,"Synthetic unknown result","pg18-native-v2-runtime-0002")
      const unknownWorker=new WorkflowV2Worker(workerPool,"ci-v2-unknown",{executor:workflowV2ModelEffectExecutor(config)})
      await unknownWorker.tick()
      const unknownPending=(await api.getWorkflowV2Run(uncertain.run.id)).pending_effect
      await api.decideWorkflowV2Node(uncertain.run.id,"approved",unknownPending.step_key,unknownPending.input_sha256)
      assert.equal((await unknownWorker.tick()).status,"paused")
      assert.equal((await unknownWorker.tick()).status,"idle");assert.equal(v2Calls,2)
      assert.deepEqual((await admin.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[uncertain.run.id])).rows,
        [{status:"unknown"},{status:"unknown"}])
      const debug=createPgNativeWorkflowDebugSession(api,{key:()=>"pg18-native-node-debug-0001"})
      try{debug.setActive(true);await debug.refresh();await debug.submit({workflowId:workflow.id,revision:2,nodeId:"model",samples:{input:"Synthetic {{literal}} node test",outputs:{}}})
        assert.equal(debug.snapshot().error,"");const runId=debug.snapshot().detail.run.id
        const nodeWorker=new WorkflowV2Worker(workerPool,"ci-node-debug",{executor:workflowV2ModelEffectExecutor(config)})
        assert.equal((await nodeWorker.tick()).status,"awaiting_approval");await debug.refresh()
        assert.equal(workflowApprovalReady(debug.snapshot().detail),true);await debug.decide("approved",true)
        await nodeWorker.tick();await nodeWorker.tick();await debug.refresh()
        assert.equal(debug.snapshot().detail.run.status,"succeeded");assert.equal(debug.snapshot().detail.run.result_text,"Synthetic PG18 node debug result");assert.equal(nodeDebugCalls,1)
        assert.equal(JSON.stringify(debug.snapshot().detail.run.checkpoint).includes("outputs"),false)
        const output=await api.getWorkflowV2Outputs(runId);assert.equal(output.run.node_debug_id,"model");assert.equal(output.nodes.find(node=>node.node_type==="model").output_text,"Synthetic PG18 node debug result")
        assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.external_effects WHERE run_id=$1",[runId])).rows[0].n,2)
      }finally{debug.dispose()}
    },{handlerFactory:createWorkflowV2ModelInternalHandler})
    // Tool identity/ciphertext column permissions are exercised with the real
    // three restricted logins. Only the last outbound provider is synthetic.
    const toolSecret="SyntheticHttpToolCredentialNeverSentToNetwork012345"
    const tool=await api.createToolConnection({name:"CI owner Tool",description:"Synthetic only",url:"https://tools.example.com/run",
      method:"POST",headers:[{key:"Authorization",value:"Bearer "+toolSecret}],body_template:"{{input}}",timeout_s:10,enabled:true})
    let toolPosts=0
    const toolBroker=new WorkflowV2ToolDispatch(apiPool,key,{async http(material,args){
      toolPosts++;assert.equal(material.headers[0].value,"Bearer "+toolSecret)
      const prepared=prepareWorkflowToolHttp(material,args)
      return redactWorkflowToolResponse("Synthetic Tool response "+material.headers[0].value,prepared.secrets)
    }},brokerPool)
    const toolDispatch=verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(identityPool),toolBroker)
    await withDisposableBoundModelTls(toolDispatch,async config=>{
      const worker=new WorkflowV2Worker(workerPool,"ci-v2-tools",{executor:workflowV2ToolEffectExecutor(config)})
      for(const [data,expected] of [
        [{tool_binding:{connection_id:tool.id,connection_revision:tool.revision},params_template:'{"query":"synthetic"}'},"succeeded"],
        [{tool:"calculate",params_template:'{"expression":"2+2"}'},"succeeded"],
        [{tool:"calculate",params_template:'{"expression":"1/0"}'},"failed"],
      ]){
        const toolGraph={version:2,nodes:[graph.nodes[0],{id:"tool",type:"tool",data:{title:"Tool",...data},position:{x:200,y:0}},
          {...graph.nodes[2],data:{title:"End",output_template:"{{Tool.output}}"}}],
          edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]}
        const flow=await api.createWorkflowGraph("Synthetic Tool workflow",toolGraph)
        const run=await api.submitWorkflowV2Run(flow.id,1,"Synthetic Tool task","ci-v2-tool-"+flow.id)
        await worker.tick();const pending=(await api.getWorkflowV2Run(run.run.id)).pending_effect
        await api.decideWorkflowV2Node(run.run.id,"approved",pending.step_key,pending.input_sha256)
        for(let i=0;i<3;i++)await worker.tick()
        const detail=await api.getWorkflowV2Run(run.run.id)
        assert.equal(detail.run.status,expected);assert.equal(JSON.stringify(detail).includes(toolSecret),false)
        const ledger=(await admin.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[run.run.id])).rows
        assert.deepEqual(ledger,expected==="succeeded"?[{status:"succeeded"},{status:"succeeded"}]:[{status:"failed"}])
      }
      assert.equal(toolPosts,1);assert.equal((await worker.tick()).status,"idle")
    },{handlerFactory:createWorkflowV2ToolInternalHandler})
    const role=await new AgentSpecRepository(apiPool).create(owner,"CI Agent role",safeAgentSpec({goal:"Synthetic role",tools:["calculate"],
      model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"}}))
    const agentGraph={version:2,nodes:[graph.nodes[0],{id:"agent",type:"agent",data:{title:"Role",agent_binding:{spec_id:role.id,spec_revision:role.revision},max_steps:3},position:{x:200,y:0}},
      {...graph.nodes[2],data:{title:"End",output_template:"{{Role.output}}"}}],edges:[{id:"a",source:"start",target:"agent"},{id:"b",source:"agent",target:"end"}]}
    const requestId=randomUUID()
    const [agentFlow,replayedFlow]=await Promise.all([api.createWorkflowGraph("CI Agent Workflow",agentGraph,requestId),api.createWorkflowGraph("CI Agent Workflow",agentGraph,requestId)])
    assert.equal(agentFlow.id,requestId);assert.equal(replayedFlow.id,agentFlow.id)
    assert.equal(Number((await admin.query("SELECT count(*) AS n FROM agentstudio.workflows WHERE id=$1",[requestId])).rows[0].n),1)
    await assert.rejects(api.createWorkflowGraph("Conflicting title",agentGraph,requestId),error=>error.status===409)
    const httpRole=await new AgentSpecRepository(apiPool).create(owner,"CI HTTP Agent role",safeAgentSpec({goal:"Synthetic HTTP role",tools:["http_lookup"],
      http_tools:[{name:"http_lookup",description:"Lookup; params: query",connection_id:tool.id,connection_revision:tool.revision}],
      model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"}}))
    for(const autonomous of [false,true])for(const custom of [false,true]){
    let agentCalls=0,agentHttpCalls=0
    const selectedRole=custom?httpRole:role
    const selectedFlow=custom?await api.createWorkflowGraph("CI HTTP Agent Workflow",{...agentGraph,nodes:agentGraph.nodes.map(node=>node.type==="agent"?
      {...node,data:{...node.data,agent_binding:{spec_id:httpRole.id,spec_revision:httpRole.revision}}}:node)}):agentFlow
    const planning=async(material,prompt)=>{agentCalls++;assert.equal(material.api_key,secret)
      const context=JSON.parse(prompt)
      if(custom){assert.equal(prompt.includes(toolSecret),false);assert.equal(prompt.includes(tool.id),false)}
      if(context.round===1)return JSON.stringify(custom?{action:"tool",tool:"http_lookup",params:{query:"synthetic owner lookup"}}:{action:"tool",tool:"calculate",params:{expression:"2+2"}})
      assert.match(context.history[0].observation,/4/);return '{"action":"answer","answer":"Synthetic Agent result 4"}'
    }
    const agentModel=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error("direct fallback forbidden")},brokerPool,{allowAgentExecution:!autonomous,allowAutonomousExecution:autonomous,agentExecutor:planning})
    const agentTool=new WorkflowV2ToolDispatch(apiPool,key,{async http(material,args){agentHttpCalls++
      const request=prepareWorkflowToolHttp(material,args)
      assert.equal(request.headers.authorization,"Bearer "+toolSecret);assert.equal(request.url,tool.url)
      assert.deepEqual(args,{query:"synthetic owner lookup"});return "Synthetic HTTP observation 4"
    }},brokerPool,{allowAgentExecution:!autonomous,allowAutonomousExecution:autonomous})
    const agentDispatch={model:verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),agentModel),
      tool:verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(identityPool),agentTool)}
    const handlers=raw=>{const config={...raw,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"};const model=createWorkflowV2ModelInternalHandler({...config,dispatch:config.dispatch.model}),
      tool=createWorkflowV2ToolInternalHandler({...config,dispatch:config.dispatch.tool})
      return (req,res)=>(req.url==="/__internal/v2/workflow-tool/dispatch"?tool:model)(req,res)}
    await withDisposableBoundModelTls(agentDispatch,async config=>{
      const adapters=[workflowV2ModelEffectExecutor(config),workflowV2ToolEffectExecutor(config)]
      const executor={supports:req=>adapters.some(adapter=>adapter.supports(req)),execute(request,lease){return adapters.find(adapter=>adapter.supports(request)).execute(request,lease)}}
      const suffix=custom?"-http":""
      const ui=autonomous?null:createPgNativeWorkflowRunSession(api,{key:()=>"ci-v2-agent-mtls-0001"+suffix})
      if(ui){ui.setActive(true);await ui.refresh();await ui.submit({workflowId:selectedFlow.id,revision:1,instruction:"Synthetic Agent input"});assert.equal(ui.snapshot().error,"")}
      const run=autonomous?await api.submitAutonomousAgentRun(selectedRole.id,1,"Synthetic Agent input","ci-native-agent-mtls-0001"+suffix,3):ui.snapshot().detail
      const get=id=>autonomous?api.getAutonomousAgentRun(id):api.getWorkflowV2Run(id)
      for(let i=0;i<20;i++){
        await new WorkflowV2Worker(workerPool,"ci-agent-"+i,{agentExecutionApproved:true,executor,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"}).tick()
        if(ui)await ui.poll()
        const detail=ui?ui.snapshot().detail:await get(run.run.id)
        if(detail.run.status==="succeeded")break
        if(detail.run.status==="awaiting_approval"){
          if(ui){assert.equal(workflowApprovalReady(detail),true);await ui.decide("approved",true);assert.equal(ui.snapshot().error,"");assert.equal(ui.snapshot().pendingMutation,null)}
          else await api.decideAutonomousAgentNode(run.run.id,"approved",detail.pending_effect.step_key,detail.pending_effect.input_sha256)
        }
      }
      const detail=await get(run.run.id)
      assert.equal(detail.run.status,"succeeded");assert.equal(detail.run.result_text,"Synthetic Agent result 4");assert.equal(agentCalls,2)
      assert.equal(agentHttpCalls,custom?1:0)
      assert.equal(detail.steps.filter(step=>step.metadata.parent_step_key).length,3)
      const ledger=(await admin.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1",[run.run.id])).rows
      assert.equal(ledger.length,7);assert.equal(ledger.every(row=>row.status==="succeeded"),true)
      ui?.dispose()
    },{handlerFactory:handlers})
    }
  }finally{
    if(front)await front.close()
    await Promise.all(pools.map(pool=>pool.end()));await admin.end();key.fill(0)
  }
})
