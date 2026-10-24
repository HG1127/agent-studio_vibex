import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import {once} from "node:events"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createHandler} from "../src/http.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {createNativeRunRepository} from "../src/native-run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "../src/bound-lease-identity.ts"
import {createBoundModelMutualTlsClient} from "../src/bound-model-client.ts"
import {withDisposableBoundModelTls} from "./helpers/bound-model-loopback-tls.mjs"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowValidationRepository} from "../src/workflow-validation-repository.ts"
import {WorkflowSafeRunRepository} from "../src/workflow-safe-run-repository.ts"
import {WorkflowSafeWorker} from "../src/workflow-safe-worker.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {ScheduleInventoryRepository} from "../src/schedule-inventory-repository.ts"
import {ScheduleDraftRepository} from "../src/schedule-draft-repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=readFileSync(path.join(root,"db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
const issuer="urn:agentstudio:local:v1"
const origin="http://localhost:7403"
const modelEncryptionKey="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

async function startFixture(policy=null){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(freshSchemaForTest().sql)
  // Production guard is never modified; this is an embedded PG17 fixture.
  await prepareNativeAuthPgliteRoles(db)
  await db.exec(reviewedNativeSqlForEmbeddedTest(sql))
  const pool={async connect(){return {
    query:(statement,params=[])=>db.query(statement,params),release(){}
  }}}
  const auth=new NativeAuthRepository(pool)
  const modelConnections=new ModelConnectionRepository(pool,modelEncryptionKey)
  const probeLog=[]
  await auth.provisionInitialAdmin({
    email:"admin@example.com",
    password:"SyntheticAdminStrongPassword#2026",
    display_name:"Administrator"
  })
  let backend
  const native=createNativeAuthHttpHandler({
    auth,allowedOrigin:origin,
    ...(policy?{allowEmployeeProvisioning:policy.employeeProvisioning}:{}),
    allowConfigurationWrites:policy?.configurationWrites===true,
    allowModelProbe:policy?.modelProbeUat===true,
    allowRunSubmission:policy?.runApprovalUat===true,
    allowBoundRunSubmission:policy?.boundModelExecutionUat===true,
    allowWorkflowValidation:policy?.workflowValidationUat===true,
    allowWorkflowExecution:policy?.workflowExecutionUat===true,
    businessHandler:(req,res)=>{
      const route=new URL(req.url||"/","http://localhost").pathname
      if(policy&&!permitNativePg18BusinessUatRequest(route,req.method||"",policy)){
        res.writeHead(405,{"Content-Type":"application/json"})
        res.end(JSON.stringify({error:"pilot_business_writes_disabled"}))
        return
      }
      return backend(req,res)
    },
  })
  backend=createHandler({
    allowedOrigin:origin,
    verifyToken:async()=>{throw Error("never trust OIDC in native mode")},
    authenticateRequest:native.authenticateRequest,
    repository:new AgentSpecRepository(pool),
    // Mirror the production Native composition: owner-scoped run READs are
    // available without granting the separate Run/approval write capability.
    runRepository:createNativeRunRepository(pool,policy??{}),
    workflowRepository:new WorkflowRepository(pool),
    ...(policy?.workflowValidationUat===true
      ?{workflowValidationRepository:new WorkflowValidationRepository(pool)}:{}),
    // Read-only Workflow history is always composed; POST still uses the
    // independent workflowExecutionUat route grant.
    workflowSafeRunRepository:new WorkflowSafeRunRepository(pool),
    knowledgeRepository:new KnowledgeBaseRepository(pool),
    modelConnectionRepository:modelConnections,
    ...(policy?.modelProbeUat===true?{modelConnectionProbe:async input=>{
      probeLog.push(input.provider)
      return {status:"ok",latency_ms:19,error_code:""}
    }}:{}),
    scheduleInventory:new ScheduleInventoryRepository(pool),
    ...(policy?.configurationWrites===true?
      {scheduleDraftRepository:new ScheduleDraftRepository(pool)}:{}),
  })
  const server=createServer(native.handler)
  server.listen(0,"127.0.0.1")
  await once(server,"listening")
  const base=`http://127.0.0.1:${server.address().port}`
  let cookie=""
  const transport=async(route,init={})=>{
    const url=base+route.replace(/^\/__pg_native(?=\/|$)/,"")
    const headers={
      ...init.headers,
      ...(cookie?{Cookie:cookie}:{}),
      ...(init.method&&init.method!=="GET"?{Origin:origin}:{}),
    }
    const resp=await fetch(url,{...init,headers})
    const setCookie=resp.headers.get("set-cookie")
    if(setCookie)cookie=setCookie.split(";")[0]
    return resp
  }
  return {db,pool,server,api:createPgNativePilotApi(transport),transport,modelConnections,probeLog,
    async close(){await new Promise(resolve=>server.close(resolve));await db.close()}}
}
test("real HTTP -> native cookie -> Auth Role -> Pg RLS -> Agent/Workflow/KB CRUD",async()=>{
  const f=await startFixture()
  try{
    await assert.rejects(f.api.me(),error=>error.status===401)
    const admin=await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.equal(admin.authenticated,true)
    assert.equal(admin.role,"admin")
    const adminProfile=await f.api.me()
    assert.equal(adminProfile.is_admin,true)
    const adminAgent=await f.api.createAgent("Admin Strategy","Private admin investment research")
    assert.ok(adminAgent.id)
    assert.deepEqual((await f.api.listAgents()).map(x=>x.id),[adminAgent.id])
    const employee=await f.api.createEmployee(
      "staff@example.com","SyntheticEmployeePassword#2026","Staff")
    assert.equal(employee.is_admin,false)
    const staffLogin=await f.api.login(
      "staff@example.com","SyntheticEmployeePassword#2026")
    assert.equal(staffLogin.role,"employee")
    assert.equal((await f.api.me()).email,"staff@example.com")
    assert.equal((await f.api.listAgents()).length,0)
    const staffAgent=await f.api.createAgent("Staff Research","Private staff investigation")
    assert.deepEqual((await f.api.listAgents()).map(x=>x.id),[staffAgent.id])
    const workflow=await f.api.createWorkflow("Staff Workflow")
    assert.ok(workflow.id)
    assert.equal((await f.api.listWorkflows()).length,1)
    const knowledge=await f.api.createKnowledge("Staff KB","Prototype semantic corpus")
    assert.ok(knowledge.id)
    assert.equal((await f.api.listKnowledge()).length,1)
    await f.api.logout()
    await assert.rejects(f.api.me(),error=>error.status===401)
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const adminAgents=await f.api.listAgents()
    assert.deepEqual(adminAgents.map(x=>x.id),[adminAgent.id])
    assert.equal((await f.api.listKnowledge()).length,0)
    assert.equal((await f.api.listWorkflows()).length,0)
    const dbContents=await f.db.query(
      "SELECT count(*)::integer AS n FROM agentstudio.agent_specs")
    assert.equal(dbContents.rows[0].n,2)
    const originContents=await f.db.query(
      "SELECT count(*)::integer AS n FROM agentstudio.users "+
      "WHERE external_issuer=$1",[issuer])
    assert.equal(originContents.rows[0].n,2)
  }finally{await f.close()}
})


test("Native config-write discovery follows approved owner policy and never enables model work",async()=>{
  for(const writeApproved of [false,true]){
    const f=await startFixture({
      configurationWrites:writeApproved,employeeProvisioning:false,
      runApprovalUat:false,knowledgeIngestUat:false
    })
    try{
      await assert.rejects(f.api.getConfigCapabilities(),
        error=>error.status===401&&error.code==="session_required")
      await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
      const capabilities=await f.api.getConfigCapabilities()
      assert.deepEqual(capabilities,{
        mode:"native_pg18",config_writes_enabled:writeApproved,
        model_probe_enabled:false,workflow_validation_enabled:false,
        workflow_execution_enabled:false,run_execution_enabled:false,
        run_submission_enabled:false,bound_model_runs_enabled:false
      })
      if(writeApproved){
        const item=await f.api.createAgent("Approved metadata","No execution")
        assert.ok(item.id)
      }else{
        await assert.rejects(f.api.createAgent("Denied metadata","No execution"),
          error=>error.status===405&&
            error.code==="pilot_business_writes_disabled")
      }
      for(const table of ["jobs","runs","external_effects"]){
        const check=await f.db.query(
          "SELECT count(*)::integer AS n FROM agentstudio."+table)
        assert.equal(check.rows[0].n,0)
      }
      await f.api.logout()
      await assert.rejects(f.api.getConfigCapabilities(),
        error=>error.status===401)
    }finally{await f.close()}
  }
})
test("configuration UAT stores the three PostgreSQL object types",async()=>{
  const policy={configurationWrites:true,employeeProvisioning:false}
  const f=await startFixture(policy)
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const spec=await f.api.createAgent("Trial Agent","Owner private")
    const flow=await f.api.createWorkflow("Trial Workflow")
    const kb=await f.api.createKnowledge("Trial KB","Private")
    assert.deepEqual((await f.api.listAgents()).map(x=>x.id),[spec.id])
    assert.deepEqual((await f.api.listWorkflows()).map(x=>x.id),[flow.id])
    assert.deepEqual((await f.api.listKnowledge()).map(x=>x.id),[kb.id])
    const changed=await f.api.updateAgent(
      spec.id,spec.revision,"Updated Agent","Updated research goal")
    assert.equal(changed.revision,2)
    assert.equal(changed.name,"Updated Agent")
    await assert.rejects(f.api.updateAgent(
      spec.id,spec.revision,"Stale","Old update"),
      e=>e.status===409&&e.code==="revision_conflict")
    assert.equal((await f.api.getAgent(spec.id)).name,"Updated Agent")
    const updatedFlow=await f.api.updateWorkflow(flow.id,flow.revision,"Updated Flow")
    const updatedKb=await f.api.updateKnowledge(kb.id,kb.revision,"Updated KB","Revised")
    assert.equal(updatedFlow.revision,2)
    assert.equal(updatedKb.revision,2)

    for(const entity of ["runs","jobs","approvals"]){
      const result=await f.db.query(
        "SELECT count(*)::integer AS n FROM agentstudio."+entity)
      assert.equal(result.rows[0].n,0,entity)
    }
  }finally{await f.close()}
})


test("native cookie model connection CRUD is separately gated, encrypted and owner-scoped",async()=>{
  const denied=await startFixture({
    configurationWrites:false,employeeProvisioning:false,runApprovalUat:false
  })
  try{
    await denied.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.deepEqual(await denied.api.listModelConnections(),[])
    await assert.rejects(denied.api.createModelConnection({
      name:"Denied connection",provider:"openai",base_url:"https://api.openai.com/v1",
      api_key:"synthetic-denied-api-key-2026",models:["gpt-4o"],enabled:true
    }),error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    const count=await denied.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.model_connections")
    assert.equal(count.rows[0].n,0)
  }finally{await denied.close()}

  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const secret="synthetic-model-api-key-never-return-this-2026"
    const item=await f.api.createModelConnection({
      name:"Admin OpenAI",provider:"openai",base_url:"https://api.openai.com/v1",
      api_key:secret,models:["gpt-4o"],enabled:true
    })
    assert.equal(item.api_key_tail,secret.slice(-4))
    assert.equal(item.status,"untested")
    assert.equal("api_key" in item,false)
    assert.equal("api_key_ciphertext" in item,false)
    assert.equal(JSON.stringify(item).includes(secret),false)
    const stored=(await f.db.query(
      "SELECT owner_user_id,api_key_ciphertext FROM agentstudio.model_connections "+
      "WHERE id=$1::uuid",[item.id])).rows[0]
    assert.equal(stored.owner_user_id,item.owner_user_id)
    assert.notEqual(Buffer.from(stored.api_key_ciphertext).toString("utf8"),secret)

    const employee=await f.api.createEmployee(
      "model-staff@example.com","SyntheticModelStaffPassword#2026","Model Staff")
    assert.equal(employee.is_admin,false)
    await f.api.login("model-staff@example.com","SyntheticModelStaffPassword#2026")
    assert.deepEqual(await f.api.listModelConnections(),[])
    const foreign=await f.transport("/api/v2/model-connections/"+item.id,{method:"GET"})
    assert.equal(foreign.status,404)

    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const updated=await f.api.updateModelConnection(item.id,item.revision,{
      name:"Admin OpenAI Updated",provider:"openai",
      base_url:"https://api.openai.com/v1",api_key:"",
      models:["gpt-4.1"],enabled:false
    })
    assert.equal(updated.revision,2)
    assert.equal(updated.api_key_tail,secret.slice(-4))
    const updatedStored=(await f.db.query(
      "SELECT api_key_ciphertext FROM agentstudio.model_connections WHERE id=$1::uuid",
      [item.id])).rows[0]
    assert.deepEqual(Buffer.from(updatedStored.api_key_ciphertext),
      Buffer.from(stored.api_key_ciphertext))
    const deleted=await f.api.deleteModelConnection(item.id)
    assert.deepEqual(deleted,{ok:true,id:item.id})
    const runs=await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")
    assert.equal(runs.rows[0].n,0)
  }finally{await f.close()}
})

test("PG18 model probe stays disabled without separate approval and owner scoped when enabled",async()=>{
  for(const permitted of [false,true]){
    const f=await startFixture({
      configurationWrites:true,employeeProvisioning:false,
      runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:permitted
    })
    try{
      await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
      const connection=await f.api.createModelConnection({
        name:"Test Provider",provider:"openai",base_url:"https://api.openai.com/v1",
        api_key:"SyntheticFixtureCredential456",models:[],enabled:false
      })
      assert.equal((await f.api.getConfigCapabilities()).model_probe_enabled,permitted)
      if(!permitted){
        await assert.rejects(f.api.testModelConnection(connection.id,connection.revision),
          error=>error.status===405)
        assert.equal(f.probeLog.length,0)
      }else{
        const tested=await f.api.testModelConnection(connection.id,connection.revision)
        assert.equal(tested.status,"ok")
        assert.equal(tested.enabled,false)
        assert.equal(tested.revision,connection.revision+1)
        assert.equal(tested.last_latency_ms,19)
        assert.deepEqual(f.probeLog,["openai"])
        assert.equal("api_key" in tested,false)
      }
    }finally{await f.close()}
  }
})

test("native cookie Agent model binding uses owner RLS and blocks unsupported run execution",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,
    runApprovalUat:true,knowledgeIngestUat:false,modelProbeUat:true
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const selected=await f.api.createModelConnection({
      name:"Admin Provider",provider:"openai",base_url:"https://api.openai.com/v1",
      api_key:"SyntheticOnlyAdminProviderSecret012345",
      models:["gpt-4.1-mini"],enabled:true
    })
    const ready=await f.api.testModelConnection(selected.id,selected.revision)
    assert.equal(ready.status,"ok")
    const agent=await f.api.createAgent("Bound Research","Private synthetic research")
    const binding={connection_id:ready.id,connection_revision:ready.revision,
      model_id:"gpt-4.1-mini"}
    const updated=await f.api.bindAgentModel(agent.id,agent.revision,binding)
    assert.equal(updated.revision,agent.revision+1)
    assert.deepEqual(updated.spec.model_binding,binding)
    assert.equal(JSON.stringify(updated).includes("SyntheticOnlyAdminProviderSecret"),false)
    await assert.rejects(f.api.submitRun(agent.id,"Must not execute other model",
      "bound-cookie-run-01"),
      err=>err.status===409&&err.code==="model_binding_runtime_not_enabled")
    const jobs=await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")
    assert.equal(jobs.rows[0].n,0)
    const employee=await f.api.createEmployee(
      "binding-staff@example.com","SyntheticStaffPassword#2026","Staff")
    assert.equal(employee.is_admin,false)
    await f.api.login("binding-staff@example.com","SyntheticStaffPassword#2026")
    const staffAgent=await f.api.createAgent("Employee research","Staff only")
    await assert.rejects(f.api.bindAgentModel(staffAgent.id,staffAgent.revision,binding),
      err=>err.status===404&&err.code==="model_connection_not_found")
    assert.equal((await f.api.getAgent(staffAgent.id)).spec.model_binding,undefined)
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const unbound=await f.api.bindAgentModel(agent.id,updated.revision,null)
    assert.equal(unbound.spec.model_binding,undefined)
    assert.equal(unbound.revision,updated.revision+1)
    assert.deepEqual(f.probeLog,["openai"])
  }finally{await f.close()}
})

test("native owner-bound Run admission requires the independent grant and preserves employee approval isolation",async()=>{
  const f=await startFixture({configurationWrites:true,employeeProvisioning:true,
    runApprovalUat:true,boundModelExecutionUat:true,modelProbeUat:true})
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const capabilities=await f.api.getConfigCapabilities()
    assert.equal(capabilities.run_submission_enabled,true)
    assert.equal(capabilities.bound_model_runs_enabled,true)
    assert.equal(capabilities.run_execution_enabled,false)
    const secret="SyntheticBoundAdmissionOnlyCredential012345"
    const connection=await f.api.createModelConnection({name:"Bound Admission Provider",
      provider:"openai",base_url:"https://api.openai.com/v1",api_key:secret,
      models:["gpt-4.1-mini"],enabled:true})
    const ready=await f.api.testModelConnection(connection.id,connection.revision)
    const agent=await f.api.createAgent("Owner-bound native Agent","Private synthetic task")
    await f.api.bindAgentModel(agent.id,agent.revision,{connection_id:ready.id,
      connection_revision:ready.revision,model_id:"gpt-4.1-mini"})
    const submitted=await f.api.submitRun(agent.id,"Use the approved owner model","native-bound-admission-0001")
    assert.equal(submitted.run.status,"queued")
    assert.equal((await f.api.submitRun(agent.id,"Use the approved owner model",
      "native-bound-admission-0001")).replayed,true)
    const prepare=new AgentPrepareWorker(f.pool,"native-bound-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    assert.equal((await f.api.getRun(submitted.run.id)).approval.status,"pending")
    await f.api.createEmployee("bound-other@example.com","SyntheticOtherBoundPassword#2026","Other")
    await f.api.login("bound-other@example.com","SyntheticOtherBoundPassword#2026")
    await assert.rejects(f.api.getRun(submitted.run.id),error=>error.status===404)
    await assert.rejects(f.api.decideModel(submitted.run.id,"approved"),error=>error.status===404)
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.equal((await f.api.decideModel(submitted.run.id,"approved")).approval,"approved")
    const detail=await f.api.getRun(submitted.run.id)
    assert.equal(detail.run.status,"queued")
    assert.equal(JSON.stringify(detail).includes(secret),false)
    const phases=(await f.db.query("SELECT payload->>'phase' AS phase,status FROM agentstudio.jobs "+
      "WHERE run_id=$1 ORDER BY created_at",[submitted.run.id])).rows
    assert.deepEqual(phases.map(row=>row.phase),["prepare","model"])
    assert.equal(phases[1].status,"queued")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects "+
      "WHERE run_id=$1",[submitted.run.id])).rows[0].n,0)
    assert.deepEqual(f.probeLog,["openai"])
  }finally{await f.close()}
})

test("native employee approval completes an owner-bound Agent through real private mTLS and durable effect ledgers",async()=>{
  const f=await startFixture({configurationWrites:true,employeeProvisioning:true,
    runApprovalUat:true,boundModelExecutionUat:true,modelProbeUat:true})
  try{
    await f.db.query("INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_023','synthetic predecessor') ON CONFLICT DO NOTHING")
    const migration=readFileSync(path.join(root,
      "db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql"),"utf8")
      .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
    await f.db.exec(migration)
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const secret="SyntheticPrivateBoundFlowCredential012345"
    const connection=await f.api.createModelConnection({name:"Synthetic owner model",
      provider:"openai",base_url:"https://api.openai.com/v1",api_key:secret,
      models:["gpt-4.1-mini"],enabled:true})
    const ready=await f.api.testModelConnection(connection.id,connection.revision)
    const agent=await f.api.createAgent("Native owner model flow","Only synthetic facts")
    await f.api.bindAgentModel(agent.id,agent.revision,{connection_id:ready.id,
      connection_revision:ready.revision,model_id:"gpt-4.1-mini"})
    const requestKey="native-real-private-tls-0001"
    const submitted=await f.api.submitRun(agent.id,"Return a synthetic summary",requestKey)
    const prepare=new AgentPrepareWorker(f.pool,"native-tls-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    await f.api.decideModel(submitted.run.id,"approved")
    let generated=0,fallback=0
    const broker=new OwnerBoundModelDispatch(f.pool,Buffer.from(modelEncryptionKey,"hex"),
      async(material,modelInput)=>{
        generated++
        assert.equal(material.api_key,secret)
        assert.equal(material.model_id,"gpt-4.1-mini")
        assert.equal(modelInput.instruction,"Return a synthetic summary")
        return "Synthetic owner-bound result through verified mTLS"
      })
    const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(f.pool),broker)
    await withDisposableBoundModelTls(verified,async config=>{
      const worker=new AgentModelWorker(f.pool,"native-tls-model",{
        async generate(){fallback++;throw Error("shared_model_fallback_forbidden")}
      },{boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(config)})
      assert.equal((await worker.tick()).status,"succeeded")
      assert.equal((await worker.tick()).status,"idle")
    })
    const result=await f.api.getRun(submitted.run.id)
    assert.equal(result.run.status,"succeeded")
    assert.equal(result.run.result_text,"Synthetic owner-bound result through verified mTLS")
    assert.equal(JSON.stringify(result).includes(secret),false)
    const effects=(await f.db.query("SELECT step_key,status FROM agentstudio.external_effects "+
      "WHERE run_id=$1 ORDER BY step_key",[submitted.run.id])).rows
    assert.deepEqual(effects,[{step_key:"model",status:"succeeded"},
      {step_key:"model_bound_dispatch",status:"succeeded"}])
    assert.equal((await f.api.submitRun(agent.id,"Return a synthetic summary",requestKey)).replayed,true)
    assert.equal(generated,1);assert.equal(fallback,0)
  }finally{await f.close()}
})

test("PG18 config UAT never exposes another employee private records",async()=>{
  const f=await startFixture({configurationWrites:true,employeeProvisioning:true})
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const adminAgent=await f.api.createAgent("Admin Draft","Visible only to owner")
    const employee=await f.api.createEmployee(
      "staff@example.com","SyntheticStaffPassword#2026","Staff")
    assert.equal(employee.is_admin,false)
    await f.api.login("staff@example.com","SyntheticStaffPassword#2026")
    assert.deepEqual(await f.api.listAgents(),[])
    const staffAgent=await f.api.createAgent("Staff Draft","Only mine")
    assert.notEqual(staffAgent.owner_user_id,adminAgent.owner_user_id)
    await assert.rejects(f.api.getAgent(adminAgent.id),
      e=>e.status===404&&e.code==="spec_not_found")
    await assert.rejects(f.api.updateAgent(
      adminAgent.id,adminAgent.revision,"Unauthorized","No permission"),
      e=>e.status===404&&e.code==="spec_not_found")

    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.deepEqual((await f.api.listAgents()).map(x=>x.id),[adminAgent.id])
  }finally{await f.close()}
})


test("read-only PG-native document inventory returns owner metadata, never object keys or other employees' files",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const adminBase=await f.api.createKnowledge("Admin Private Files","Source inventory")
    const privateKey="private-storage/key-must-never-be-returned"
    await f.db.query(
      "INSERT INTO agentstudio.knowledge_documents"+
      "(owner_user_id,base_id,filename,object_key,mime_type,sha256,status)"+
      " VALUES($1,$2,'private-report.md',$3,'text/markdown',$4,'indexed')",
      [adminBase.owner_user_id,adminBase.id,privateKey,"a".repeat(64)]
    )
    const documents=await f.api.listKnowledgeDocuments(adminBase.id)
    assert.equal(documents.length,1)
    assert.equal(documents[0].filename,"private-report.md")
    assert.equal(documents[0].status,"indexed")
    assert.equal(Object.hasOwn(documents[0],"object_key"),false)
    assert.equal(Object.hasOwn(documents[0],"text_content"),false)
    assert.equal(Object.hasOwn(documents[0],"embedding"),false)
    assert.equal(JSON.stringify(documents).includes(privateKey),false)
    await f.api.createEmployee(
      "viewer@example.com","SyntheticViewerStrongPassword#2026","Viewer")
    await f.api.login("viewer@example.com","SyntheticViewerStrongPassword#2026")
    await assert.rejects(f.api.listKnowledgeDocuments(adminBase.id),
      error=>error.status===404&&error.code==="knowledge_base_not_found")
    const own=await f.api.createKnowledge("Viewer Private Files","Metadata")
    assert.deepEqual(await f.api.listKnowledgeDocuments(own.id),[])
    await f.api.logout()
    await assert.rejects(f.api.listKnowledgeDocuments(own.id),
      error=>error.status===401)
  }finally{await f.close()}
})


test("Native Cookie + RLS keyword search: indexed citations only, no other staff data or model calls",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const mine=await f.api.createKnowledge("Admin indexed KB","Private only")
    const privateObject="private-bucket/do-not-leak/object-key"
    const doc=(await f.db.query(
      "INSERT INTO agentstudio.knowledge_documents "+
      "(owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,'strategy.md',$3,'text/markdown',$4,'indexed') RETURNING id",
      [mine.owner_user_id,mine.id,privateObject,"a".repeat(64)])).rows[0]
    await f.db.query(
      "INSERT INTO agentstudio.knowledge_chunks "+
      "(owner_user_id,document_id,chunk_index,text_content) "+
      "VALUES($1,$2,0,$3)",
      [mine.owner_user_id,doc.id,
        "行业机会：合成资料中的风险提示与可核验引用。"+("附加测试资料。".repeat(75))])
    const hidden=(await f.db.query(
      "INSERT INTO agentstudio.knowledge_documents "+
      "(owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,'pending.md','not-indexed','text/markdown',$3,'pending') RETURNING id",
      [mine.owner_user_id,mine.id,"b".repeat(64)])).rows[0]
    await f.db.query(
      "INSERT INTO agentstudio.knowledge_chunks "+
      "(owner_user_id,document_id,chunk_index,text_content) "+
      "VALUES($1,$2,0,'行业机会 PENDING_DO_NOT_SHOW')",
      [mine.owner_user_id,hidden.id])
    const found=await f.api.searchKnowledgeKeyword(mine.id,"行业机会",6)
    assert.equal(found.mode,"literal_keyword")
    assert.equal(found.scope,"current_user")
    assert.equal(found.indexed_only,true)
    assert.equal(found.items.length,1)
    assert.equal(found.items[0].citation,"strategy.md#chunk-0")
    assert.equal(found.items[0].document_id,doc.id)
    assert.ok(found.items[0].snippet.includes("行业机会"))
    assert.ok(found.items[0].snippet.length<=360)
    assert.doesNotMatch(JSON.stringify(found),
      /private-bucket|object_key|embedding|PENDING_DO_NOT_SHOW|not-indexed/)
    assert.deepEqual((await f.api.searchKnowledgeKeyword(mine.id,"%%")).items,[])
    const csrf=await f.transport("/api/v2/knowledge-bases/"+mine.id+"/search",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({query:"行业机会",limit:6})
    })
    assert.equal(csrf.status,403)
    assert.equal((await csrf.json()).error,"native_request_origin_denied")
    const invalid=await f.transport("/api/v2/knowledge-bases/"+mine.id+"/search",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-AgentStudio-Request":"1"},
      body:JSON.stringify({query:"行业机会",limit:6,embedding:"forged"})
    })
    assert.equal(invalid.status,400)
    assert.equal((await invalid.json()).error,"unknown_request_field")
    await f.api.createEmployee("viewer@example.com",
      "SyntheticViewerStrongPassword#2026","Viewer")
    await f.api.login("viewer@example.com","SyntheticViewerStrongPassword#2026")
    await assert.rejects(f.api.searchKnowledgeKeyword(mine.id,"行业机会"),
      error=>error.status===404&&error.code==="knowledge_base_not_found")
    const ownBase=await f.api.createKnowledge("Viewer KB","Employee-owned")
    assert.deepEqual((await f.api.searchKnowledgeKeyword(
      ownBase.id,"行业机会")).items,[])
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await f.close()}
})

test("Native default READ-ONLY config mode permits private keyword search but not ingestion",async()=>{
  const f=await startFixture({
    configurationWrites:false,employeeProvisioning:false,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const identity=await f.api.me()
    const kb=(await f.db.query(
      "INSERT INTO agentstudio.knowledge_bases "+
      "(owner_user_id,name,visibility) "+
      "VALUES($1,'Existing private KB','private') RETURNING id",[identity.id])).rows[0]
    const doc=(await f.db.query(
      "INSERT INTO agentstudio.knowledge_documents "+
      "(owner_user_id,base_id,filename,object_key,mime_type,sha256,status) "+
      "VALUES($1,$2,'existing.txt','inline-db:synthetic','text/plain',$3,'indexed') "+
      "RETURNING id",[identity.id,kb.id,"c".repeat(64)])).rows[0]
    await f.db.query(
      "INSERT INTO agentstudio.knowledge_chunks "+
      "(owner_user_id,document_id,chunk_index,text_content) "+
      "VALUES($1,$2,0,'合成只读检索样本')",[identity.id,doc.id])
    const response=await f.api.searchKnowledgeKeyword(kb.id,"检索")
    assert.equal(response.items.length,1)
    assert.equal(response.items[0].filename,"existing.txt")
    await assert.rejects(f.api.createKnowledge("Forbidden write",""),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    const ingest=await f.transport("/api/v2/knowledge-bases/"+kb.id+"/text-documents",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-AgentStudio-Request":"1"},
      body:JSON.stringify({filename:"blocked.txt",text:"not allowed"})
    })
    assert.equal(ingest.status,405)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_chunks")).rows[0].n,1)
  }finally{await f.close()}
})

test("third opt-in: Native TXT/MD ingestion -> indexed chunks -> keyword citations without model",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,
    runApprovalUat:false,knowledgeIngestUat:true
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const base=await f.api.createKnowledge("Isolated ingestion KB","Synthetic data")
    const text="独立知识库检索闭环："+("合成研究证据和引用来源。".repeat(100))
    const created=await f.api.ingestKnowledgeTextUat(base.id,"synthetic-notes.md",text)
    assert.equal(created.scope,"private_keyword_only")
    assert.equal(created.item.filename,"synthetic-notes.md")
    assert.equal(created.item.status,"indexed")
    assert.ok(created.item.chunk_count>=2)
    assert.match(created.item.sha256,/^[a-f0-9]{64}$/)
    assert.equal(JSON.stringify(created).includes(text),false)
    const lookup=await f.api.searchKnowledgeKeyword(base.id,"知识库检索")
    assert.equal(lookup.mode,"literal_keyword")
    assert.equal(lookup.scope,"current_user")
    assert.equal(lookup.items[0].document_id,created.item.id)
    assert.equal(lookup.items[0].citation,"synthetic-notes.md#chunk-0")
    const inventory=await f.api.listKnowledgeDocuments(base.id)
    assert.equal(inventory.length,1)
    assert.equal(inventory[0].status,"indexed")
    assert.equal(JSON.stringify(inventory).includes("text_content"),false)
    assert.equal(JSON.stringify(inventory).includes("object_key"),false)
    await assert.rejects(
      f.api.ingestKnowledgeTextUat(base.id,"copy.md",text),
      error=>error.status===409&&error.code==="duplicate_document")
    await assert.rejects(
      f.api.ingestKnowledgeTextUat(base.id,"../unsafe.md","not allowed"),
      error=>error.status===400)
    const extra=await f.transport("/api/v2/knowledge-bases/"+base.id+"/text-documents",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-AgentStudio-Request":"1"},
      body:JSON.stringify({filename:"injected.md",text:"content",owner_user_id:base.owner_user_id})
    })
    assert.equal(extra.status,400)
    assert.equal((await extra.json()).error,"unknown_request_field")
    await f.api.createEmployee("other@example.com",
      "SyntheticOtherWorkerPassword#2026","Other")
    await f.api.login("other@example.com","SyntheticOtherWorkerPassword#2026")
    await assert.rejects(
      f.api.ingestKnowledgeTextUat(base.id,"stolen.md","foreign content"),
      error=>error.status===404&&error.code==="knowledge_base_not_found")
    await assert.rejects(f.api.searchKnowledgeKeyword(base.id,"知识库检索"),
      error=>error.status===404&&error.code==="knowledge_base_not_found")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{await f.close()}
})

test("Native configuration UAT without third approval cannot ingest text or files",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,
    runApprovalUat:false,knowledgeIngestUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const kb=await f.api.createKnowledge("No-ingestion test","Metadata only")
    await assert.rejects(
      f.api.ingestKnowledgeTextUat(kb.id,"attempt.md","isolation data"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    const fileAttempt=await f.transport(
      "/api/v2/knowledge-bases/"+kb.id+"/document-files",{
        method:"POST",headers:{"Content-Type":"application/json",
          "X-AgentStudio-Request":"1"},
        body:JSON.stringify({filename:"test.pdf",content_base64:"dGVzdA=="})
      })
    assert.equal(fileAttempt.status,405)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_documents")).rows[0].n,0)
  }finally{await f.close()}
})

test("isolated Native TXT/MD UAT: ingest, transactional chunks, keyword citations, no model or cross-owner writes",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,
    runApprovalUat:false,knowledgeIngestUat:true
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const owned=await f.api.createKnowledge("Synthetic text ingestion UAT","No real files")
    const text="本次测试验证知识库入库与引用闭环。"+("安全合成内容。".repeat(185))
    const created=await f.api.ingestKnowledgeTextUat(owned.id,"test-note.md",text)
    assert.equal(created.scope,"private_keyword_only")
    assert.equal(created.item.filename,"test-note.md")
    assert.equal(created.item.status,"indexed")
    assert.match(created.item.sha256,/^[a-f0-9]{64}$/)
    assert.ok(created.item.chunk_count>=2)
    assert.ok(created.item.chunk_count<=15)
    assert.doesNotMatch(JSON.stringify(created),/text_content|object_key|embedding|本次测试验证/)
    const docs=await f.api.listKnowledgeDocuments(owned.id)
    assert.equal(docs.length,1)
    assert.equal(docs[0].id,created.item.id)
    assert.equal(docs[0].status,"indexed")
    assert.equal(docs[0].mime_type,"text/markdown")
    const matches=await f.api.searchKnowledgeKeyword(owned.id,"入库与引用")
    assert.equal(matches.mode,"literal_keyword")
    assert.equal(matches.scope,"current_user")
    assert.equal(matches.indexed_only,true)
    assert.equal(matches.items.length,1)
    assert.equal(matches.items[0].citation,"test-note.md#chunk-0")
    assert.ok(matches.items[0].snippet.includes("入库与引用"))
    assert.ok(matches.items[0].snippet.length<=360)
    assert.doesNotMatch(JSON.stringify(matches),/object_key|embedding|inline-db/)
    await assert.rejects(f.api.ingestKnowledgeTextUat(
      owned.id,"duplicate.txt",text),
      error=>error.status===409&&error.code==="duplicate_document")
    await assert.rejects(f.api.ingestKnowledgeTextUat(
      owned.id,"../traversal.md",text),
      error=>error.status===400&&error.code==="invalid_pg_native_text_ingest")
    const csrf=await f.transport("/api/v2/knowledge-bases/"+owned.id+"/text-documents",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({filename:"csrf.md",text:"refused"})
    })
    assert.equal(csrf.status,403)
    assert.equal((await csrf.json()).error,"native_request_origin_denied")
    const injected=await f.transport("/api/v2/knowledge-bases/"+owned.id+"/text-documents",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-AgentStudio-Request":"1"},
      body:JSON.stringify({filename:"inject.md",text:"refused",object_key:"attacker-storage"})
    })
    assert.equal(injected.status,400)
    assert.equal((await injected.json()).error,"unknown_request_field")
    const filePath="/api/v2/knowledge-bases/"+owned.id+"/document-files"
    const blocked=await f.transport(filePath,{method:"POST",
      headers:{"Content-Type":"application/json","X-AgentStudio-Request":"1"},
      body:JSON.stringify({filename:"unsafe.pdf",content_base64:"AQID"})})
    assert.equal(blocked.status,405)
    await f.api.createEmployee("other@example.com",
      "SyntheticOtherWorkerPassword#2026","Other owner")
    await f.api.login("other@example.com","SyntheticOtherWorkerPassword#2026")
    await assert.rejects(f.api.searchKnowledgeKeyword(owned.id,"入库与引用"),
      error=>error.status===404&&error.code==="knowledge_base_not_found")
    await assert.rejects(f.api.ingestKnowledgeTextUat(
      owned.id,"unauthorized.md","No write permitted"),
      error=>error.status===404&&error.code==="knowledge_base_not_found")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_documents "+
      "WHERE base_id=$1",[owned.id])).rows[0].n,1)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_chunks "+
      "WHERE document_id=$1",[created.item.id])).rows[0].n,created.item.chunk_count)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{await f.close()}
})

test("ordinary Native config UAT cannot ingest TXT even though keyword search is readable",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,
    runApprovalUat:false,knowledgeIngestUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const base=await f.api.createKnowledge("No writing to document index","")
    await assert.rejects(f.api.ingestKnowledgeTextUat(
      base.id,"blocked.md","Synthetic document"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    assert.deepEqual((await f.api.searchKnowledgeKeyword(base.id,"Synthetic")).items,[])
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_documents")).rows[0].n,0)
  }finally{await f.close()}
})

test("Native text indexing is atomic when a synthetic chunk insert fails",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,
    runApprovalUat:false,knowledgeIngestUat:true
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const base=await f.api.createKnowledge("Atomicity synthetic test","")
    const originalConnect=f.pool.connect.bind(f.pool)
    // Inject an in-memory failure ONLY into this disposable PGlite fixture.
    // The underlying transaction must roll back the metadata header too.
    f.pool.connect=async()=>{
      const client=await originalConnect()
      return {...client,async query(sql,params=[]){
        if(typeof sql==="string"&&
           sql.startsWith("INSERT INTO agentstudio.knowledge_chunks "))
          throw Error("synthetic_chunk_index_failure")
        return client.query(sql,params)
      }}
    }
    const text="This synthetic document tests rollback on a partial index failure."
    let response
    try{
      response=await f.transport(
        "/api/v2/knowledge-bases/"+base.id+"/text-documents",{
          method:"POST",
          headers:{"Content-Type":"application/json","X-AgentStudio-Request":"1"},
          body:JSON.stringify({filename:"atomic-check.md",text})
        })
    }finally{f.pool.connect=originalConnect}
    assert.notEqual(response.status,201)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_documents "+
      "WHERE base_id=$1",[base.id])).rows[0].n,0,
      "the document header must not persist after a failed index transaction")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_chunks")).rows[0].n,0)
    const ok=await f.api.ingestKnowledgeTextUat(base.id,"atomic-check.md",text)
    assert.equal(ok.item.status,"indexed")
    assert.equal(ok.item.chunk_count,1)
    assert.equal((await f.api.searchKnowledgeKeyword(base.id,"synthetic")).items.length,1)
  }finally{await f.close()}
})

test("Native Cookie Agent KB binding verifies owner, retains revision and rejects cross-employee selection",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,
    runApprovalUat:false,knowledgeIngestUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const own=await f.api.createKnowledge("Alice evidence","Private")
    const agent=await f.api.createAgent("Knowledge linked agent","Use only references")
    await f.api.createEmployee("other@example.com",
      "SyntheticOtherWorkerPassword#2026","Other owner")
    await f.api.login("other@example.com","SyntheticOtherWorkerPassword#2026")
    const foreign=await f.api.createKnowledge("Bob secret","Private")
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const linked=await f.api.updateAgentKnowledgeBases(agent.id,agent.revision,[own.id])
    assert.deepEqual(linked.spec.knowledge_base_ids,[own.id])
    assert.ok(linked.spec.tools.includes("knowledge_search"))
    assert.equal(linked.revision,agent.revision+1)
    assert.equal(linked.spec.goal,"Use only references")
    await assert.rejects(f.api.updateAgentKnowledgeBases(agent.id,linked.revision,
      [foreign.id]),e=>e.status===404&&e.code==="knowledge_base_not_found")
    assert.deepEqual((await f.api.getAgent(agent.id)).spec.knowledge_base_ids,[own.id])
    const renamed=await f.api.updateAgent(agent.id,linked.revision,
      "Renamed evidence agent","A more specific goal")
    assert.deepEqual(renamed.spec.knowledge_base_ids,[own.id],
      "a normal rename must never silently detach evidence permissions")
    assert.deepEqual(renamed.spec.tools,["knowledge_search"])
    await f.api.login("other@example.com","SyntheticOtherWorkerPassword#2026")
    await assert.rejects(f.api.updateAgentKnowledgeBases(
      agent.id,renamed.revision,[foreign.id]),
      e=>e.status===404&&e.code==="spec_not_found")
    assert.deepEqual(await f.api.listAgents(),[])
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const after=await f.api.getAgent(agent.id)
    assert.deepEqual(after.spec.knowledge_base_ids,[own.id])
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0,
      "binding is a configuration update, never an Agent/model execution")
  }finally{await f.close()}
})

test("PG Native schedule/occurrence inventory is owner-scoped, read-only, with no scheduler",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const agent=await f.api.createAgent("Schedule owner","Do not actually run")
    const record=await f.db.query(
      "INSERT INTO agentstudio.schedules "+
      "(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,next_at,enabled) "+
      "VALUES($1,'agent',$2,'Synthetic morning scan',$3::jsonb,'Asia/Tokyo',$4::timestamptz,false) "+
      "RETURNING id",[agent.owner_user_id,agent.id,
        JSON.stringify({recurrence_kind:"daily",local_time:"09:00",
          private_token:"sensitive_fixture_never_in_response"}),
        "2026-10-21T00:00:00Z"])
    const id=record.rows[0].id
    await f.db.query(
      "INSERT INTO agentstudio.schedule_occurrences "+
      "(owner_user_id,schedule_id,scheduled_for,status) "+
      "VALUES($1,$2,'2026-10-20T00:00:00Z','skipped')",
      [agent.owner_user_id,id])
    const mine=await f.api.listSchedules()
    assert.equal(mine.length,1)
    assert.equal(mine[0].name,"Synthetic morning scan")
    assert.equal(mine[0].enabled,false)
    assert.equal(mine[0].time_zone,"Asia/Tokyo")
    assert.equal(Object.hasOwn(mine[0],"owner_user_id"),false)
    assert.equal(Object.hasOwn(mine[0],"model_api_key"),false)
    assert.equal(Object.hasOwn(mine[0],"recurrence"),false)
    assert.equal(JSON.stringify(mine).includes("sensitive_fixture_never_in_response"),false)
    const history=await f.api.listScheduleOccurrences(id)
    assert.equal(history.length,1)
    assert.equal(history[0].status,"skipped")
    assert.equal(Object.hasOwn(history[0],"instruction"),false)
    const cross=await f.transport("/api/v2/schedules",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:"should not schedule",enabled:true})})
    // Config drafts are allowed in this UAT, but a direct POST without
    // the Native session CSRF marker must fail before hitting the API.
    assert.equal(cross.status,403)
    const forged=await f.transport("/api/v2/schedules",{method:"POST",
      headers:{"Content-Type":"application/json","X-AgentStudio-Request":"1"},
      body:JSON.stringify({name:"should not schedule",enabled:true})})
    assert.equal(forged.status,400,"execution flags must never be accepted")
    const wrongMethod=await f.transport("/api/v2/schedules/"+id+"/occurrences",{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({status:"started"})})
    assert.equal(wrongMethod.status,405)
    const total=(await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n
    assert.equal(total,0,"schedule reading must never enqueue any Worker job")
    await f.api.createEmployee("other@example.com",
      "SyntheticOtherWorkerPassword#2026","Other")
    await f.api.login("other@example.com","SyntheticOtherWorkerPassword#2026")
    assert.deepEqual(await f.api.listSchedules(),[])
    await assert.rejects(f.api.listScheduleOccurrences(id),
      error=>error.status===404 && error.code==="schedule_not_found")
    await f.api.logout()
    await assert.rejects(f.api.listSchedules(),error=>error.status===401)
  }finally{await f.close()}
})

test("native employee cookie permits only opt-in inert workflow validation",async()=>{
  const policy={
    configurationWrites:true,employeeProvisioning:false,
    runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false,
    workflowValidationUat:true,
  }
  const f=await startFixture(policy)
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.equal((await f.api.getConfigCapabilities()).workflow_validation_enabled,true)
    const flow=await f.api.createWorkflow("Owner Start End")
    const result=await f.api.validateWorkflow(flow.id,flow.revision,"cookie_flow_validation_001")
    assert.equal(result.run.status,"succeeded")
    assert.equal(result.steps.length,2)
    assert.equal(result.external_effects_executed,false)
    const again=await f.api.validateWorkflow(flow.id,flow.revision,"cookie_flow_validation_001")
    assert.equal(again.replayed,true)
    assert.equal(again.run.id,result.run.id)
    assert.equal((await f.api.getWorkflowValidation(result.run.id)).run.id,result.run.id)
  }finally{await f.close()}
})

test("Native employee cookie can queue only separately approved Start/End Workflow Worker jobs",async()=>{
  const denied=await startFixture({
    configurationWrites:true,employeeProvisioning:false,runApprovalUat:false,
    knowledgeIngestUat:false,modelProbeUat:false,workflowValidationUat:false,
    workflowExecutionUat:false,
  })
  try{
    await denied.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const flow=await denied.api.createWorkflow("Execution approval denied")
    assert.equal((await denied.api.getConfigCapabilities()).workflow_execution_enabled,false)
    await assert.rejects(denied.api.submitWorkflowRun(flow.id,flow.revision,
      "safe_workflow_denied_001"),
    e=>e.status===405&&e.code==="pilot_business_writes_disabled")
    assert.equal((await denied.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await denied.close()}

  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,runApprovalUat:false,
    knowledgeIngestUat:false,modelProbeUat:false,workflowValidationUat:false,
    workflowExecutionUat:true,
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const caps=await f.api.getConfigCapabilities()
    assert.equal(caps.workflow_execution_enabled,true,JSON.stringify(caps))
    assert.equal(caps.workflow_validation_enabled,false)
    assert.equal(caps.run_execution_enabled,false)
    const flow=await f.api.createWorkflow("Safe Start End")
    const queued=await f.api.submitWorkflowRun(
      flow.id,flow.revision,"native_safe_workflow_001")
    assert.equal(queued.run.status,"queued")
    assert.equal(queued.job_status,"queued")
    assert.equal(queued.execution_mode,"start_end_only")
    assert.equal(queued.external_effects_executed,false)
    const replay=await f.api.submitWorkflowRun(
      flow.id,flow.revision,"native_safe_workflow_001")
    assert.equal(replay.replayed,true)
    assert.equal(replay.run.id,queued.run.id)
    const worker=new WorkflowSafeWorker(f.pool,"native-uat-workflow")
    assert.deepEqual(await worker.tick(),{
      status:"succeeded",run_id:queued.run.id,steps_completed:2
    })
    const result=await f.api.getWorkflowRun(queued.run.id)
    assert.equal(result.run.status,"succeeded")
    assert.equal(result.job_status,"succeeded")
    assert.deepEqual(result.steps.map(s=>s.metadata.node_id),["start","end"])
    assert.equal(result.external_effects_executed,false)
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.run_steps) AS steps,"+
      "(SELECT count(*)::int FROM agentstudio.external_effects) AS effects"
    )).rows[0]
    assert.deepEqual(counts,{jobs:1,runs:1,steps:2,effects:0})
  }finally{await f.close()}
})

test("native cookie schedule drafts require config opt-in and stay inert end-to-end",async()=>{
  const draft={name:"Synthetic schedule",kind:"agent",
    time_zone:"Asia/Shanghai",rule:{kind:"weekly",local_time:"09:00",weekday:1}}
  const denied=await startFixture({
    configurationWrites:false,employeeProvisioning:false,runApprovalUat:false,
    knowledgeIngestUat:false,modelProbeUat:false,
  })
  try{
    await denied.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const admin=(await denied.db.query(
      "SELECT id FROM agentstudio.users LIMIT 1")).rows[0].id
    const target=(await denied.db.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1::uuid,'Isolated target','{}'::jsonb) RETURNING id",[admin])).rows[0].id
    await assert.rejects(denied.api.createScheduleDraft({
      ...draft,target_id:target
    }),e=>e.status===405&&e.code==="pilot_business_writes_disabled")
  }finally{await denied.close()}

  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,runApprovalUat:false,
    knowledgeIngestUat:false,modelProbeUat:false,
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const target=await f.api.createAgent("Native schedule target","No run approval")
    const created=await f.api.createScheduleDraft({...draft,target_id:target.id})
    assert.equal(created.enabled,false)
    assert.equal(created.next_at,null)
    assert.equal(created.revision,1)
    assert.equal(created.recurrence.execution_supported,false)
    assert.equal((await f.api.listSchedules()).length,1)
    const updated=await f.api.updateScheduleDraft(created.id,1,{
      ...draft,name:"Renamed synthetic schedule",target_id:target.id
    })
    assert.equal(updated.revision,2)
    await assert.rejects(f.api.updateScheduleDraft(created.id,1,{
      ...draft,target_id:target.id
    }),e=>e.status===409)
    await f.api.deleteScheduleDraft(created.id,2)
    assert.deepEqual(await f.api.listSchedules(),[])
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.schedule_occurrences) AS occurrences"
    )).rows[0]
    assert.deepEqual(counts,{jobs:0,runs:0,occurrences:0})
  }finally{await f.close()}
})

test("Native default READ-ONLY mode serves schedule inventory without any run or configuration opt-in",async()=>{
  const f=await startFixture({
    configurationWrites:false,employeeProvisioning:false,runApprovalUat:false
  })
  try{
    const admin=(await f.db.query(
      "SELECT id FROM agentstudio.users ORDER BY created_at LIMIT 1"
    )).rows[0].id
    const row=await f.db.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1,'Fixture-only schedule source',$2::jsonb) RETURNING id",
      [admin,JSON.stringify({goal:"Never run",tools:[]})])
    await f.db.query(
      "INSERT INTO agentstudio.schedules "+
      "(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,enabled) "+
      "VALUES($1,'agent',$2,'Already imported daily plan',$3::jsonb,'Asia/Tokyo',false)",
      [admin,row.rows[0].id,JSON.stringify({recurrence_kind:"daily"})])
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const visible=await f.api.listSchedules()
    assert.equal(visible.length,1)
    assert.equal(visible[0].name,"Already imported daily plan")
    assert.deepEqual(await f.api.listScheduleOccurrences(visible[0].id),[])
    await assert.rejects(f.api.submitRun(row.rows[0].id,"Do not run","test_00001234"),
      e=>e.status===405&&e.code==="pilot_business_writes_disabled")
    const after=(await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n
    assert.equal(after,0)
  }finally{await f.close()}
})

test("isolated PG18 native default HTTP refuses every config write",async()=>{
  const policy={configurationWrites:false,employeeProvisioning:false}
  const f=await startFixture(policy)
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.deepEqual(await f.api.listAgents(),[])
    assert.deepEqual(await f.api.listWorkflows(),[])
    assert.deepEqual(await f.api.listKnowledge(),[])
    const requests=[
      ()=>f.api.createAgent("Denied Config","Never write"),
      ()=>f.api.createWorkflow("Denied Graph"),
      ()=>f.api.createKnowledge("Denied Corpus","Never write"),
    ]
    for(const call of requests)
      await assert.rejects(call(),e=>e.status===405&&
        e.code==="pilot_business_writes_disabled")
    await assert.rejects(f.api.createEmployee(
      "staff@example.com","SyntheticStaffPassword#2026","Staff"),
      e=>e.status===403&&e.code==="employee_provisioning_disabled")
    for(const name of ["agent_specs","workflows","knowledge_bases","jobs"]){
      const rows=await f.db.query(
        "SELECT count(*)::int AS n FROM agentstudio."+name)
      assert.equal(rows.rows[0].n,0,name)
    }
  }finally{await f.close()}
})

test("isolated opt-in Native Run UAT: cookie session, idempotency, approval, owner-only visibility, no model",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:true,runApprovalUat:true
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const agent=await f.api.createAgent("Run UAT Agent","Synthetic owner-only research")
    const key="isolated_native_run_001"
    const submitted=await f.api.submitRun(agent.id,"Summarize synthetic risk",key)
    assert.equal(submitted.replayed,false)
    assert.equal(submitted.run.status,"queued")
    assert.equal((await f.api.submitRun(agent.id,"Summarize synthetic risk",key)).replayed,true)
    await assert.rejects(f.api.submitRun(agent.id,"Different instruction",key),
      error=>error.status===409&&error.code==="idempotency_key_conflict")
    assert.equal((await f.api.listRuns()).length,1)
    assert.equal((await f.api.getRun(submitted.run.id)).approval,null)
    await assert.rejects(f.api.decideModel(submitted.run.id,"approved"),
      error=>error.status===409&&error.code==="approval_not_requested")

    // A cookie without the independent CSRF request header must never enqueue.
    const noCsrf=await f.transport("/api/v2/agent-specs/"+agent.id+"/runs",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({instruction:"CSRF must be rejected",idempotency_key:"denied_csrf_00001"})
    })
    assert.equal(noCsrf.status,403)
    assert.equal((await noCsrf.json()).error,"native_request_origin_denied")
    const untrusted=await f.transport("/api/v2/runs",{
      method:"GET",headers:{Authorization:"Bearer forged.token"}
    })
    assert.equal(untrusted.status,401)

    // Only disposable synthetic PGlite receives a Worker tick in this test.
    const prepare=new AgentPrepareWorker(f.pool,"native-uat-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    const details=await f.api.getRun(submitted.run.id)
    assert.equal(details.run.status,"awaiting_approval")
    assert.equal(details.approval.status,"pending")
    assert.equal(details.run.checkpoint.stage,"awaiting_model_approval")

    await f.api.createEmployee(
      "other@example.com","SyntheticOtherWorkerPassword#2026","Other Employee")
    await f.api.login("other@example.com","SyntheticOtherWorkerPassword#2026")
    assert.equal((await f.api.listRuns()).length,0)
    await assert.rejects(f.api.getRun(submitted.run.id),
      error=>error.status===404&&error.code==="run_not_found")
    await assert.rejects(f.api.decideModel(submitted.run.id,"approved"),
      error=>error.status===404&&error.code==="run_not_found")

    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const approved=await f.api.decideModel(submitted.run.id,"approved")
    assert.equal(approved.replayed,false)
    assert.equal(approved.approval,"approved")
    assert.equal(approved.run.status,"queued")
    assert.equal((await f.api.decideModel(submitted.run.id,"approved")).replayed,true)
    await assert.rejects(f.api.decideModel(submitted.run.id,"rejected"),
      error=>error.status===409&&error.code==="approval_already_decided")
    const jobs=(await f.db.query(
      "SELECT payload->>'phase' AS phase,status FROM agentstudio.jobs "+
      "WHERE run_id=$1 ORDER BY created_at",[submitted.run.id])).rows
    assert.deepEqual(jobs.map(j=>j.phase),["prepare","model"])
    assert.equal(jobs[1].status,"queued")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM "+
      "agentstudio.external_effects WHERE run_id=$1",[submitted.run.id]))
      .rows[0].n,0,"approval alone must not contact provider")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM "+
      "agentstudio.audit_events WHERE run_id=$1 AND action='agent.model_approval'",
      [submitted.run.id])).rows[0].n,1)
  }finally{await f.close()}
})

test("native config-only capability allows Run history reads, but never submission or model approval",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const agent=await f.api.createAgent("No execution","Configuration UAT only")
    assert.deepEqual(await f.api.listRuns(),[])
    await assert.rejects(f.api.submitRun(agent.id,"No worker","denied_run_00001"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await f.close()}
})

test("native read-only Agent Run history uses a real cookie, owner RLS and no Worker or approval effects",async()=>{
  const f=await startFixture({
    configurationWrites:false,employeeProvisioning:true,runApprovalUat:false,
    knowledgeIngestUat:false,modelProbeUat:false
  })
  try{
    await assert.rejects(f.api.listRuns(),
      error=>error.status===401&&error.code==="invalid_token")
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const admin=await f.api.me()
    const seed=async(user,name,withManySteps=false)=>{
      const spec=(await f.db.query(
        "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
        "VALUES($1::uuid,$2::text,$3::jsonb) RETURNING id",
        [user.id,name,JSON.stringify({goal:"Read-only historic sample"})])).rows[0]
      const run=(await f.db.query(
        "INSERT INTO agentstudio.runs "+
        "(owner_user_id,kind,agent_spec_id,status,instruction,result_text,"+
        "checkpoint,step_count,finished_at) VALUES "+
        "($1::uuid,'agent',$2::uuid,'succeeded',$3::text,$4::text,"+
        "'{\"stage\":\"complete\"}'::jsonb,1,clock_timestamp()) RETURNING id",
        [user.id,spec.id,"Private request for "+name,
          "Synthetic result for "+name])).rows[0]
      await f.db.query(
        "INSERT INTO agentstudio.run_steps(owner_user_id,run_id,step_key,"+
        "status,metadata) VALUES($1::uuid,$2::uuid,'prepare','succeeded',$3::jsonb)",
        [user.id,run.id,JSON.stringify({stage:"synthetic_history",
          citations:["KB:sample"],api_key_ciphertext:"must_never_be_returned"})])
      if(withManySteps){
        const citations=Array.from({length:14},(_,i)=>"KB:synthetic-"+i)
        citations.push("x".repeat(401))
        await f.db.query(
          "INSERT INTO agentstudio.run_steps(owner_user_id,run_id,step_key,"+
          "status,metadata) SELECT $1::uuid,$2::uuid,('a_trace_'||n::text),"+
          "'succeeded',$3::jsonb FROM generate_series(1,42) AS n",
          [user.id,run.id,JSON.stringify({stage:"synthetic_trace",citations,
            output_chars:50001,tool_calls:2,api_key_ciphertext:"never_return",
            request_headers:{authorization:"never_return"},
            nested:{api_key:"never_return"},unknown_secret:"never_return"})])
      }
      return run.id
    }
    const adminRun=await seed(admin,"Administrator",true)
    const visible=await f.api.listRuns()
    assert.equal(visible.length,1)
    assert.equal(visible[0].id,adminRun)
    assert.equal(visible[0].result_text,"Synthetic result for Administrator")
    const runDetail=await f.api.getRun(adminRun)
    assert.equal(runDetail.run.id,adminRun)
    assert.equal(runDetail.approval,null)
    assert.equal(runDetail.steps.length,40,"step history is strictly bounded")
    const trace=runDetail.steps.find(step=>step.step_key==="a_trace_1")
    assert.ok(trace,"synthetic trace row should be returned")
    assert.equal(trace.status,"succeeded")
    assert.equal(trace.metadata.stage,"synthetic_trace")
    assert.equal(trace.metadata.citations.length,12,
      "citations are capped at 12 items after rejecting oversized values")
    assert.equal(trace.metadata.tool_calls,2)
    assert.equal(trace.metadata.output_chars,undefined,
      "out-of-range counters are dropped")
    for(const step of runDetail.steps){
      assert.ok(!("api_key_ciphertext" in step.metadata))
      assert.ok(!("request_headers" in step.metadata))
      assert.ok(!("nested" in step.metadata))
      assert.ok(!("unknown_secret" in step.metadata))
      assert.ok(Object.keys(step.metadata).every(key=>[
        "stage","category","index","node_id","node_type","execution_mode",
        "knowledge_mode","validation_only","external_effects_executed",
        "output_chars","tool_calls","citations"
      ].includes(key)))
    }
    await assert.rejects(f.api.submitRun(visible[0].agent_spec_id,
      "Do not start","readonly_no_run_0001"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    await assert.rejects(f.api.decideModel(adminRun,"approved"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    const disallowed=await f.transport("/api/v2/runs/"+adminRun+"/model-approval",{
      method:"GET"
    })
    assert.equal(disallowed.status,405)
    await f.api.createEmployee("viewer@example.com",
      "SyntheticViewerStrongPassword#2026","Viewer")
    await f.api.login("viewer@example.com","SyntheticViewerStrongPassword#2026")
    const viewer=await f.api.me()
    assert.deepEqual(await f.api.listRuns(),[])
    await assert.rejects(f.api.getRun(adminRun),
      error=>error.status===404&&error.code==="run_not_found")
    const viewerRun=await seed(viewer,"Viewer")
    const viewerDetail=await f.api.getRun(viewerRun)
    assert.equal(viewerDetail.steps.length,1)
    assert.equal(viewerDetail.steps[0].metadata.stage,"synthetic_history")
    const spoofed=await f.transport("/api/v2/runs",{
      method:"GET",headers:{"X-Rh-User-Id":admin.id}
    })
    assert.equal(spoofed.status,200)
    assert.deepEqual((await spoofed.json()).runs.map(x=>x.id),[viewerRun])
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    assert.deepEqual((await f.api.listRuns()).map(x=>x.id),[adminRun])
    await assert.rejects(f.api.getRun(viewerRun),
      error=>error.status===404&&error.code==="run_not_found")
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.approvals) AS approvals,"+
      "(SELECT count(*)::int FROM agentstudio.external_effects) AS effects"
    )).rows[0]
    assert.deepEqual(counts,{jobs:0,approvals:0,effects:0})
    await f.api.logout()
    await assert.rejects(f.api.listRuns(),error=>error.status===401)
  }finally{await f.close()}
})

test("Native default READ-ONLY Workflow history is owner-scoped, sanitizes step metadata and never queues work",async()=>{
  const f=await startFixture({
    configurationWrites:false,employeeProvisioning:true,runApprovalUat:false,
    workflowValidationUat:false,workflowExecutionUat:false,
    knowledgeIngestUat:false,modelProbeUat:false
  })
  try{
    await assert.rejects(f.api.listWorkflowRuns(),
      error=>error.status===401&&error.code==="invalid_token")
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const admin=await f.api.me()
    const workflow=(await f.db.query(
      "INSERT INTO agentstudio.workflows(owner_user_id,name,graph) "+
      "VALUES($1::uuid,'Synthetic completed Workflow',$2::jsonb) RETURNING id,revision",
      [admin.id,JSON.stringify({nodes:[
        {id:"start",type:"start"},{id:"end",type:"end"}],
        edges:[{id:"start-to-end",source:"start",target:"end"}]})])).rows[0]
    const hash="a".repeat(64)
    const checkpoint={stage:"workflow_safe_succeeded",
      workflow_revision:Number(workflow.revision),graph_sha256:hash,
      execution_mode:"start_end_only",completed_node_ids:["start","end"],
      external_effects_executed:false}
    const run=(await f.db.query(
      "INSERT INTO agentstudio.runs "+
      "(owner_user_id,kind,workflow_id,status,instruction,result_text,checkpoint,"+
      "step_count,finished_at) VALUES($1::uuid,'workflow',$2::uuid,'succeeded','',"+
      "'Synthetic safe Workflow result',$3::jsonb,2,clock_timestamp()) RETURNING id",
      [admin.id,workflow.id,JSON.stringify(checkpoint)])).rows[0]
    const payload={phase:"workflow_safe_v1",workflow_id:workflow.id,
      workflow_revision:Number(workflow.revision),graph_sha256:hash,
      execution_mode:"start_end_only",external_effects_executed:false}
    await f.db.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,status,payload,max_attempts) "+
      "VALUES($1::uuid,$2::uuid,'workflow_tick','workflow_safe:history_0001',"+
      "'succeeded',$3::jsonb,30)",
      [admin.id,run.id,JSON.stringify(payload)])
    for(const [index,node] of ["start","end"].entries()){
      await f.db.query(
        "INSERT INTO agentstudio.run_steps(owner_user_id,run_id,step_key,status,metadata) "+
        "VALUES($1::uuid,$2::uuid,$3::text,'succeeded',$4::jsonb)",
        [admin.id,run.id,"workflow:"+node,JSON.stringify({
          index:String(index).padStart(3,"0"),node_id:node,node_type:node,
          execution_mode:"start_end_only",external_effects_executed:false,
          api_key_ciphertext:"must_never_be_returned"
        })])
    }
    const items=await f.api.listWorkflowRuns()
    assert.equal(items.length,1)
    assert.equal(items[0].run.id,run.id)
    assert.equal(items[0].job_status,"succeeded")
    assert.equal(items[0].steps.length,2)
    assert.equal(items[0].steps[0].metadata.api_key_ciphertext,undefined)
    assert.equal((await f.api.getWorkflowRun(run.id)).run.id,run.id)
    await assert.rejects(f.api.submitWorkflowRun(
      workflow.id,Number(workflow.revision),"readonly_workflow_0001"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    await f.api.createEmployee("workflow-viewer@example.com",
      "SyntheticWorkflowViewer#2026","Workflow Viewer")
    await f.api.login("workflow-viewer@example.com","SyntheticWorkflowViewer#2026")
    assert.deepEqual(await f.api.listWorkflowRuns(),[])
    await assert.rejects(f.api.getWorkflowRun(run.id),
      error=>error.status===404&&error.code==="workflow_run_not_found")
    const spoofed=await f.transport("/api/v2/workflow-runs",{
      method:"GET",headers:{"X-Rh-User-Id":admin.id}
    })
    assert.equal(spoofed.status,200)
    assert.deepEqual((await spoofed.json()).runs,[])
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.external_effects) AS effects,"+
      "(SELECT count(*)::int FROM agentstudio.approvals) AS approvals"
    )).rows[0]
    assert.deepEqual(counts,{jobs:1,effects:0,approvals:0})
    await f.api.logout()
    await assert.rejects(f.api.listWorkflowRuns(),error=>error.status===401)
  }finally{await f.close()}
})
