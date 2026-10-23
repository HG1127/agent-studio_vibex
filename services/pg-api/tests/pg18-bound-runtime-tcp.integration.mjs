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
import {McpConnectionRepository} from "../src/mcp-connection-repository.ts"
import {createMcpDiscovery} from "../src/mcp-discovery.ts"
import {createMcpToolExecutor} from "../src/mcp-call.ts"
import {verifyMcpDiscoveryPrivileges,verifyMcpExecutionSchema} from "../src/mcp-privileges.ts"
import {SmitheryRepository} from "../src/smithery-repository.ts"
import {verifySmitheryPrivileges} from "../src/smithery-privileges.ts"
import {verifyOptionalCredentialBoundary} from "../src/optional-credential-boundary.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"
import {KnowledgeContentRepository} from "../src/knowledge-content-repository.ts"
import {KnowledgeEmbeddingRepository} from "../src/knowledge-embedding-repository.ts"
import {KnowledgeEmbeddingConsentRepository} from "../src/knowledge-embedding-consent-repository.ts"
import {EMBEDDING_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-embedding-consent-contracts.ts"
import {verifyKnowledgeEmbeddingConsentSchema} from "../src/knowledge-embedding-consent-privileges.ts"
import {KnowledgeIndexBroker} from "../src/knowledge-index-broker.ts"
import {KnowledgeIndexWorker} from "../src/knowledge-index-worker.ts"
import {createKnowledgeIndexPrivateClient,createKnowledgeIndexPrivateHandler} from "../src/knowledge-index-private-tls.ts"
import {scopedKnowledgeIndexPool} from "../src/knowledge-index-policy.ts"
import {verifyKnowledgeIndexSchema,verifyKnowledgeIndexLogin} from "../src/knowledge-index-privileges.ts"
import {KnowledgeIndexRepository} from "../src/knowledge-index-repository.ts"
import {KnowledgeQueryRepository} from "../src/knowledge-query-repository.ts"
import {KnowledgeQueryWorker} from "../src/knowledge-query-worker.ts"
import {KnowledgeQueryBroker} from "../src/knowledge-query-broker.ts"
import {scopedKnowledgeQueryPool} from "../src/knowledge-query-policy.ts"
import {verifyKnowledgeQuerySchema} from "../src/knowledge-query-audit.ts"
import {QUERY_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-query-contracts.ts"
import {createKnowledgeQueryPrivateClient,createKnowledgeQueryPrivateHandler} from "../src/knowledge-query-private-tls.ts"
import {workflowKnowledgeQueryId} from "../src/knowledge-execution-source.ts"
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch} from "../src/workflow-v2-dispatch-guard.ts"
import {INDEX_START_ACKNOWLEDGEMENT} from "../src/knowledge-index-contracts.ts"
import {embeddingEndpointPolicy} from "../src/knowledge-embedding-policy.ts"
import {verifyKnowledgeEmbeddingSchema} from "../src/knowledge-embedding-privileges.ts"
import {verifyKnowledgeRuntimeSchema} from "../src/knowledge-content-privileges.ts"
import {scopedKnowledgePool,scopedEmbeddingSettingsPool,scopedEmbeddingConsentPool} from "../src/knowledge-scope-policy.ts"
import {requireKnowledgeScope} from "../src/knowledge-runtime-scope.ts"
import {withActor} from "../src/repository.ts"
import {gatherAuthorizedKnowledgeEvidence} from "../src/agent-knowledge-grounding.ts"
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
  boundModelExecutionUat:true,modelProbeUat:true,mcpDiscoveryUat:true,mcpToolExecutionUat:true,smitheryManagementUat:true,knowledgeSharingUat:true,knowledgeEmbeddingSettingsUat:true,knowledgeEmbeddingConsentUat:true,knowledgeIndexRuntimeUat:true,knowledgeQueryRuntimeUat:true,workflowV2ExecutionUat:true,autonomousAgentUat:true}
const smitherySecret="SyntheticSmitheryPg18CredentialNeverNetwork012345"

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
    let backend;const managedRemote=new Map()
    const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,
      allowEmployeeProvisioning:true,allowConfigurationWrites:true,allowModelProbe:true,
      allowMcpDiscovery:true,allowMcpToolExecution:true,
      allowSmitheryManagement:true,
      allowKnowledgeSharing:true,
      allowKnowledgeEmbeddingSettings:true,
      allowKnowledgeEmbeddingConsent:true,
      allowKnowledgeIndexRuntime:true,
      allowKnowledgeQueryRuntime:true,
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
      knowledgeAccessRepository:new KnowledgeAccessRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),
      knowledgeContentRepository:new KnowledgeContentRepository(pool),
      knowledgeEmbeddingRepository:new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),
      knowledgeEmbeddingConsentRepository:new KnowledgeEmbeddingConsentRepository(pool),
      knowledgeIndexRepository:new KnowledgeIndexRepository(pool),
      knowledgeQueryRepository:new KnowledgeQueryRepository(pool),
      workflowRepository:new WorkflowRepository(pool),
      workflowV2RunRepository:new WorkflowV2RunRepository(pool,"workflow_native_v2",{allowMcpExecution:true}),autonomousAgentRunRepository:new AutonomousAgentRunRepository(pool,{allowMcpExecution:true}),
      modelConnectionRepository:new ModelConnectionRepository(pool,key,brokerPool),
      toolConnectionRepository:new ToolConnectionRepository(pool,key),
      mcpConnectionRepository:new McpConnectionRepository(pool,key,brokerPool),
      smitheryRepository:new SmitheryRepository(pool,key,brokerPool,async(credential,wire)=>{
        assert.equal([smitherySecret,smitherySecret+"rotated"].includes(credential),true)
        if(wire.path==="/namespaces")return {status:200,data:{namespaces:["ci-owned"]}}
        if(wire.method==="GET")return {status:managedRemote.has(wire.path)?200:404,data:managedRemote.has(wire.path)?{...managedRemote.get(wire.path),status:{state:"connected"}}:null}
        if(wire.method==="DELETE"){managedRemote.delete(wire.path);return {status:204,data:null}}
        const row={connectionId:wire.path.split("/").at(-1),transport:"http",metadata:wire.body.metadata,status:{state:"auth_required",setupUrl:"https://auth.smithery.ai/setup?state=synthetic"}}
        managedRemote.set(wire.path,row);return {status:201,data:row}
      }),
      mcpDiscovery:createMcpDiscovery(async(material,wire)=>{
        assert.equal(["Bearer SyntheticMcpHeaderNeverSent012345","Bearer "+smitherySecret].includes(material.headers[0].value),true);assert.equal(wire.body.method,"tools/list")
        return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result:{tools:[{name:"synthetic_lookup",inputSchema:{type:"object"}}]}})}
      }),
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
    await admin.query(upgrade("pg_v9_029_mcp_connections.sql"))
    await admin.query(upgrade("pg_v9_030_mcp_tool_identity.sql"))
    await admin.query(upgrade("pg_v9_031_smithery_managed.sql"))
    await admin.query(upgrade("pg_v9_032_knowledge_access.sql"))
    await admin.query(upgrade("pg_v9_033_knowledge_content.sql"))
    await admin.query(upgrade("pg_v9_034_knowledge_runtime.sql"))
    await admin.query(upgrade("pg_v9_035_knowledge_embedding_state.sql"))
    await admin.query(upgrade("pg_v9_036_knowledge_embedding_consent.sql"))
    await admin.query(upgrade("pg_v9_037_knowledge_index_runtime.sql"))
    await admin.query(upgrade("pg_v9_038_knowledge_query_runtime.sql"))
    await admin.query(upgrade("pg_v9_039_knowledge_execution_source.sql"))
    for(const account of [
      ["agentstudio_bound_dispatch_login","agentstudio_bound_dispatch"],
      ["agentstudio_model_broker_login","agentstudio_model_broker"],
      ["agentstudio_knowledge_index_worker_login","agentstudio_knowledge_index_worker"],
      ["agentstudio_knowledge_index_broker_login","agentstudio_knowledge_index_broker"],
    ])await installLogin(account)
    const authPassword="synthetic-"+createHash("sha256").update(target.password+":auth").digest("hex")
    await admin.query("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+authPassword+"'")
    const authPool=new pg.Pool({...target,user:"agentstudio_native_login",password:authPassword})
    pools.push(authPool)
    const apiPool=scopedKnowledgeQueryPool(scopedKnowledgeIndexPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(scopedKnowledgePool(adapter(byLogin.agentstudio_stage_login),true),true),true),true),true)
    await verifyKnowledgeRuntimeSchema(apiPool)
    await verifyKnowledgeEmbeddingSchema(apiPool)
    await verifyKnowledgeEmbeddingConsentSchema(apiPool)
    await verifyKnowledgeIndexSchema(apiPool)
    await verifyKnowledgeQuerySchema(apiPool)
    for(const kind of ["worker","broker"])await verifyKnowledgeQuerySchema(adapter(byLogin["agentstudio_knowledge_index_"+kind+"_login"]),kind)
    for(const kind of ["worker","broker"])await verifyKnowledgeIndexLogin(adapter(byLogin["agentstudio_knowledge_index_"+kind+"_login"]),kind)
    await admin.query("GRANT SELECT ON agentstudio.knowledge_embedding_consents TO agentstudio_stage_login")
    try{await assert.rejects(verifyKnowledgeEmbeddingConsentSchema(apiPool),/unsafe_knowledge_embedding_privileges/)}
    finally{await admin.query("REVOKE SELECT ON agentstudio.knowledge_embedding_consents FROM agentstudio_stage_login")}
    await admin.query("GRANT SELECT ON agentstudio.knowledge_embedding_vectors TO agentstudio_stage_login")
    // The installed index audit denies raw-vector grants before older metadata checks.
    try{await assert.rejects(verifyKnowledgeEmbeddingSchema(apiPool),/unsafe_knowledge_index_privileges/)}
    finally{await admin.query("REVOKE SELECT ON agentstudio.knowledge_embedding_vectors FROM agentstudio_stage_login")}
    await verifyKnowledgeEmbeddingSchema(apiPool)
    const identityPool=adapter(byLogin.agentstudio_bound_dispatch_login)
    const brokerPool=adapter(byLogin.agentstudio_model_broker_login)
    const workerPool=scopedKnowledgePool(adapter(byLogin.agentstudio_stage_worker),true)
    const inspectWorkerOptional=async()=>{
      const db=await workerPool.connect()
      try{await db.query("BEGIN READ ONLY");try{
        await db.query("SET LOCAL ROLE agentstudio_api");await verifyOptionalCredentialBoundary(db,"worker")
      }finally{await db.query("ROLLBACK")}}finally{db.release()}
    }
    await inspectWorkerOptional()
    await admin.query("GRANT SELECT(value_tag) ON agentstudio.mcp_connection_headers TO agentstudio_stage_worker")
    await assert.rejects(inspectWorkerOptional(),/unsafe_optional_credential_boundary/)
    await admin.query("REVOKE SELECT(value_tag) ON agentstudio.mcp_connection_headers FROM agentstudio_stage_worker")
    await admin.query("GRANT SELECT(api_key_nonce) ON agentstudio.smithery_credentials TO agentstudio_api")
    await assert.rejects(inspectWorkerOptional(),/unsafe_optional_credential_boundary/)
    await admin.query("REVOKE SELECT(api_key_nonce) ON agentstudio.smithery_credentials FROM agentstudio_api")
    await inspectWorkerOptional()
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
    await verifyMcpDiscoveryPrivileges(apiPool,brokerPool)
    await verifyMcpExecutionSchema(apiPool)
    await verifySmitheryPrivileges(apiPool,brokerPool)
    await auth.provisionInitialAdmin({email:"admin@example.com",password:"SyntheticAdminPassword#2026",display_name:"CI Admin"})
    front=await startNativeHttps(auth,apiPool,key,brokerPool)
    const api=front.api
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    const capabilities=await api.getConfigCapabilities()
    assert.equal(capabilities.run_submission_enabled,true)
    assert.equal(capabilities.bound_model_runs_enabled,true)
    assert.equal(capabilities.workflow_v2_submission_enabled,true)
    assert.equal(capabilities.mcp_discovery_enabled,true)
    assert.equal(capabilities.mcp_tool_runs_enabled,true)
    assert.equal(capabilities.smithery_management_enabled,true)
    const mcpInput={name:"CI MCP",description:"Synthetic discovery only",url:"https://mcp.example.com/server",enabled:true,
      headers:[{key:"Authorization",value:"Bearer SyntheticMcpHeaderNeverSent012345"}]}
    const mcpRequest=randomUUID(),mcp=await api.createMcpConnection(mcpInput,mcpRequest)
    assert.equal((await api.createMcpConnection(mcpInput,mcpRequest)).id,mcp.id)
    const discovered=await api.discoverMcpConnection(mcp.id,mcp.revision)
    assert.equal(discovered.status,"ok");assert.equal(discovered.catalog.tools[0].name,"synthetic_lookup")
    assert.equal(JSON.stringify(discovered).includes("SyntheticMcpHeaderNeverSent012345"),false)
    assert.deepEqual((await admin.query("SELECT (SELECT count(*) FROM agentstudio.jobs)::int AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::int AS effects")).rows[0],{jobs:0,effects:0})
    await api.saveSmitheryKey(smitherySecret,0,randomUUID())
    assert.deepEqual(await api.readSmitheryNamespaces(),["ci-owned"])
    const managed=await api.connectSmithery({namespace:"ci-owned",server:"vendor/lookup",name:"CI managed MCP",description:"Synthetic only"},randomUUID())
    assert.equal(managed.state,"auth_required");assert.equal(managed.enabled,false)
    const managedReady=await api.operateSmithery(managed.id,managed.revision,"refresh")
    assert.equal(managedReady.state,"connected");assert.equal(managedReady.mcp_status,"untested")
    const managedMetadata=await api.getMcpConnection(managed.id);assert.equal(managedMetadata.managed_by,"smithery")
    const managedCatalog=await api.discoverMcpConnection(managed.id,managedMetadata.revision)
    const managedBinding={connection_id:managed.id,connection_revision:managedCatalog.revision,tool_name:"synthetic_lookup",catalog_sha256:managedCatalog.catalog_sha256}
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
    await assert.rejects(api.getMcpConnection(mcp.id),error=>error.status===404)
    await assert.rejects(api.getSmitheryConnection(managed.id),error=>error.status===404)
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
    // Actual restricted API pools, current grants and bounded keyword evidence.
    // Only synthetic content is used; no embedding/provider request occurs.
    const readerSession=await auth.login("other@example.com","SyntheticOtherPassword#2026")
    const reader=(await auth.getSessionProfile(readerSession.token)).identity
    const bases=new KnowledgeBaseRepository(apiPool),knowledgeAccess=new KnowledgeAccessRepository(apiPool,
      (identity,email)=>auth.resolveKnowledgeRecipient(identity,email))
    const sharedBase=await bases.create(owner,"CI shared metadata","Synthetic metadata only")
    const shareRequest={action:"grant",recipient_email:"other@example.com",role:"viewer",semantic_allowed:false,expected_revision:0,request_id:randomUUID()}
    const share=await knowledgeAccess.change(owner,sharedBase.id,shareRequest)
    assert.equal((await knowledgeAccess.change(owner,sharedBase.id,shareRequest)).replayed,true)
    assert.equal((await knowledgeAccess.listShared(reader))[0].id,sharedBase.id)
    const knowledgeContent=new KnowledgeContentRepository(apiPool),contentRequest=randomUUID()
    const sharedDoc=await knowledgeContent.importParsed(owner,sharedBase.id,contentRequest,{filename:"ci-shared.md",mime_type:"text/markdown",text:"Shared CI cedar evidence"})
    // Real PG18 profile/queue preparation only; no embedding provider call.
    assert.equal((await api.getConfigCapabilities()).knowledge_embedding_settings_enabled,true)
    const embeddingModel=await api.createModelConnection({name:"CI embedding metadata",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticEmbeddingCredentialNeverNetwork012345",models:["synthetic-embedding"],enabled:true})
    const embeddingRequest={action:"configure",request_id:randomUUID(),expected_revision:0,connection_id:embeddingModel.id,connection_revision:embeddingModel.revision,model_name:"synthetic-embedding",base_url:"https://api.openai.com/v1"}
    const embeddingConfigured=await api.changeKnowledgeEmbeddingSettings(embeddingRequest)
    assert.equal(embeddingConfigured.item.revision,1)
    assert.equal((await api.changeKnowledgeEmbeddingSettings(embeddingRequest)).replayed,true)
    assert.deepEqual(await api.getKnowledgeEmbeddingReceipt(embeddingRequest.request_id),embeddingConfigured.item)
    assert.equal((await api.getConfigCapabilities()).knowledge_embedding_consent_enabled,true)
    const consentBefore=await api.getKnowledgeEmbeddingConsent()
    assert.equal(consentBefore.index_enabled,false);assert.equal(consentBefore.query_enabled,false)
    const consentRequest={action:"grant",request_id:randomUUID(),expected_revision:0,profile_id:consentBefore.profile_id,
      profile_revision:consentBefore.profile_revision,index_enabled:true,query_enabled:false,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT}
    const consentSaved=await api.changeKnowledgeEmbeddingConsent(consentRequest)
    assert.equal(consentSaved.item.revision,1);assert.equal((await api.getKnowledgeEmbeddingConsent()).index_enabled,true)
    assert.equal((await api.changeKnowledgeEmbeddingConsent(consentRequest)).replayed,true)
    assert.deepEqual(await api.getKnowledgeEmbeddingConsentReceipt(consentRequest.request_id),consentSaved.item)
    assert.equal((await api.getKnowledgeEmbeddingStatus(sharedBase.id)).queued,true)
    assert.equal((await api.getKnowledgeEmbeddingStatus(sharedBase.id)).pending,1)
    // Prove configure and ingest actually wait on the same owner fence. This
    // must not pass merely because a serial fixture happens to see the new row.
    const concurrentBase=await bases.create(owner,"CI embedding epoch race","Synthetic only")
    const ownerId=await withActor(apiPool,owner,async(_db,id)=>id),fence=await admin.connect()
    const waitForOwnerLock=async needle=>{
      const until=Date.now()+4000
      while(Date.now()<until){
        const state=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND wait_event='advisory' AND strpos(query,$1)>0) AS blocked",[needle])).rows[0]
        if(state.blocked)return
        await new Promise(done=>setTimeout(done,20))
      }
      throw Error("expected_owner_advisory_wait_"+needle)
    }
    let fenceOpen=false,changing,indexed
    try{
      await fence.query("BEGIN");fenceOpen=true
      await fence.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,6635))",[ownerId])
      changing=withActor(apiPool,owner,async db=>{
        await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL statement_timeout='12s'")
        return db.query("SELECT agentstudio.knowledge_embedding_change($1,1,'configure',$2,$3,'synthetic-embedding','https://api.openai.com/v2',NULL)",[randomUUID(),embeddingModel.id,embeddingModel.revision])
      });changing.catch(()=>{})
      await Promise.race([waitForOwnerLock("knowledge_embedding_change"),changing.then(()=>{throw Error("configuration_did_not_wait_for_owner")})])
      indexed=withActor(apiPool,owner,async db=>{
        await db.query("SET LOCAL lock_timeout='10s'");await db.query("SET LOCAL statement_timeout='12s'")
        return db.query("SELECT agentstudio.knowledge_content_import($1,$2,'concurrent.md','text/markdown','Concurrent epoch evidence')",[concurrentBase.id,randomUUID()])
      });indexed.catch(()=>{})
      await Promise.race([waitForOwnerLock("knowledge_content_import"),indexed.then(()=>{throw Error("ingest_did_not_wait_for_owner")})])
      await fence.query("COMMIT");fenceOpen=false
      await Promise.all([changing,indexed])
      const status=await api.getKnowledgeEmbeddingStatus(concurrentBase.id)
      assert.equal(status.profile_revision,2);assert.equal(status.queued,true);assert.equal(status.pending,1)
      assert.equal((await admin.query("SELECT profile_revision::int AS revision FROM agentstudio.knowledge_embedding_queue WHERE base_id=$1",[concurrentBase.id])).rows[0].revision,2)
    }finally{
      if(fenceOpen)await fence.query("ROLLBACK")
      fence.release();await Promise.allSettled([changing,indexed].filter(Boolean))
    }
    await api.changeKnowledgeEmbeddingSettings({...embeddingRequest,request_id:randomUUID(),expected_revision:2})
    const consentAfter=await api.getKnowledgeEmbeddingConsent()
    assert.notEqual(consentAfter.profile_id,consentBefore.profile_id);assert.equal(consentAfter.index_enabled,false)
    assert.equal((await api.getKnowledgeEmbeddingConsentReceipt(consentRequest.request_id)).index_enabled,true)
    await api.changeKnowledgeEmbeddingConsent({action:"revoke",request_id:randomUUID(),expected_revision:1})
    const embeddingReader=new KnowledgeEmbeddingRepository(apiPool,embeddingEndpointPolicy({}))
    assert.equal((await embeddingReader.settings(reader)).configured,false)
    await assert.rejects(embeddingReader.status(reader,sharedBase.id),error=>error.status===404)
    // Actual non-superuser index roles and independent mTLS. Provider work is
    // a sealed in-process synthetic embedding stub; no external API is called.
    const indexWorkerPool=scopedKnowledgeIndexPool(adapter(byLogin.agentstudio_knowledge_index_worker_login),true)
    const indexBrokerPool=scopedKnowledgeIndexPool(adapter(byLogin.agentstudio_knowledge_index_broker_login),true)
    let embeddingCalls=0
    const indexBroker=new KnowledgeIndexBroker(indexBrokerPool,adapter(byLogin.agentstudio_model_broker_login),key,async material=>{
      embeddingCalls++;assert.equal(material.api_key,"SyntheticEmbeddingCredentialNeverNetwork012345")
      assert.equal(material.model_name,"synthetic-embedding");return material.input.map(()=>[1,0])
    },{approvedForIsolatedUat:true})
    await withDisposableBoundModelTls(claim=>indexBroker.dispatch(claim),async config=>{
      const privateIndex=createKnowledgeIndexPrivateClient(config)
      const worker=new KnowledgeIndexWorker(indexWorkerPool,privateIndex,{approvedForIsolatedUat:true})
      const current=await api.getKnowledgeEmbeddingConsent()
      await api.changeKnowledgeEmbeddingConsent({action:"grant",request_id:randomUUID(),expected_revision:current.revision,profile_id:current.profile_id,
        profile_revision:current.profile_revision,index_enabled:true,query_enabled:false,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT})
      assert.equal((await worker.tick()).status,"idle");assert.equal(embeddingCalls,0)
      const approved=await api.getKnowledgeEmbeddingConsent(),authorization={request_id:randomUUID(),profile_id:approved.profile_id,profile_revision:approved.profile_revision,
        expected_consent_revision:approved.revision,acknowledgement:INDEX_START_ACKNOWLEDGEMENT}
      const receipt=await api.authorizeKnowledgeIndex(authorization)
      assert.deepEqual(await api.getKnowledgeIndexAuthorizationReceipt(authorization.request_id),receipt.item)
      let idle=false
      for(let round=0;round<32;round++){const result=await worker.tick();if(result.status==="idle"){idle=true;break};assert.equal(result.status,"indexed")}
      assert.equal(idle,true);assert.ok(embeddingCalls>0);assert.equal((await api.getKnowledgeIndexStatus(sharedBase.id)).ready,true)
      const workerDb=await byLogin.agentstudio_knowledge_index_worker_login.connect()
      try{
        await workerDb.query("BEGIN");await workerDb.query("SET LOCAL ROLE agentstudio_knowledge_index_worker")
        await assert.rejects(workerDb.query("SELECT api_key_ciphertext FROM agentstudio.model_connections"),error=>error.code==="42501")
        await workerDb.query("ROLLBACK")
      }finally{workerDb.release()}
    },{handlerFactory:createKnowledgeIndexPrivateHandler})
    // Reuse owner-cached embeddings. Only the reader query and reader key
    // reach the sealed synthetic provider through actual restricted SQL roles.
    await knowledgeAccess.change(owner,sharedBase.id,{action:"semantic",recipient_id:share.item.recipient_id,enabled:true,expected_revision:1,request_id:randomUUID()})
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    assert.equal((await api.getConfigCapabilities()).knowledge_query_runtime_enabled,true)
    const readerModel=await api.createModelConnection({name:"CI reader embedding",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticReaderQueryCredentialNeverNetwork012345",models:["synthetic-embedding"],enabled:true})
    await api.changeKnowledgeEmbeddingSettings({action:"configure",request_id:randomUUID(),expected_revision:0,connection_id:readerModel.id,connection_revision:readerModel.revision,model_name:"synthetic-embedding",base_url:"https://api.openai.com/v1"})
    const readerProfile=await api.getKnowledgeEmbeddingConsent()
    await api.changeKnowledgeEmbeddingConsent({action:"grant",request_id:randomUUID(),expected_revision:0,profile_id:readerProfile.profile_id,profile_revision:readerProfile.profile_revision,index_enabled:false,query_enabled:true,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT})
    const queryRequest={request_id:randomUUID(),base_ids:[sharedBase.id],query:"different wording",mode:"semantic",profile_id:readerProfile.profile_id,profile_revision:readerProfile.profile_revision,consent_revision:1,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}
    assert.equal((await api.submitKnowledgeQuery(queryRequest)).item.status,"prepared")
    const queryWorkerPool=scopedKnowledgeQueryPool(scopedKnowledgePool(adapter(byLogin.agentstudio_knowledge_index_worker_login),true),true)
    const queryBrokerPool=scopedKnowledgeQueryPool(scopedKnowledgePool(adapter(byLogin.agentstudio_knowledge_index_broker_login),true),true)
    let queryCalls=0
    const queryBroker=new KnowledgeQueryBroker(queryBrokerPool,brokerPool,key,async material=>{
      queryCalls++;assert.equal(material.api_key,"SyntheticReaderQueryCredentialNeverNetwork012345");assert.deepEqual(material.input,[queryRequest.query]);return [[1,0]]
    },{approvedForIsolatedUat:true})
    await withDisposableBoundModelTls(claim=>queryBroker.dispatch(claim),async config=>{
      const worker=new KnowledgeQueryWorker(queryWorkerPool,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true})
      assert.equal((await worker.tick()).status,"retrieved");assert.equal((await worker.tick()).status,"idle")
      assert.equal((await api.getKnowledgeQueryReceipt(queryRequest.request_id)).result.items[0].document_id,sharedDoc.item.document_id)
      assert.equal((await api.submitKnowledgeQuery(queryRequest)).replayed,true);assert.equal(queryCalls,1)
      // SQL039 stays unwired to product Tool dispatch. Exercise its foundation
      // through real PG18 restricted logins, an employee-approved run/lease and
      // the existing private mTLS Query Worker/Broker with synthetic vectors.
      for(const revoke of [false,true]){
        const flow=await api.createWorkflowGraph("Synthetic query source",{version:2,nodes:[
          {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
          {id:"search",type:"tool",data:{title:"Search",tool:"knowledge_search",knowledge_base_ids:[sharedBase.id],params_template:'{"query":"different wording"}'},position:{x:100,y:0}},
          {id:"end",type:"end",data:{title:"End"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]})
        const queued=await api.submitWorkflowV2Run(flow.id,flow.revision,"Synthetic source only","ci-source-"+flow.id)
        let enter,release
        const ready=new Promise(resolve=>{enter=resolve}),result=new Promise(resolve=>{release=resolve})
        const sourceWorker=new WorkflowV2Worker(workerPool,"ci-query-source",{executor:{supports:()=>true,execute(request,lease){enter({request,lease});return result}}})
        await sourceWorker.tick();const pending=(await api.getWorkflowV2Run(queued.run.id)).pending_effect
        await api.decideWorkflowV2Node(queued.run.id,"approved",pending.step_key,pending.input_sha256)
        const running=sourceWorker.tick()
        try{
          const {request,lease}=await ready,wire={claim:{run_id:lease.run_id,job_id:lease.job_id,lease_token:lease.lease_token,lease_version:lease.lease_version,lease_owner:lease.worker_id},step_key:request.step_key,input_sha256:request.input_sha256}
          const readerId=await withActor(apiPool,reader,async(db,id)=>{
            await verifyWorkflowEffectLease(db,id,wire,"tool");await reserveWorkflowEffectDispatch(db,id,wire,"tool");return id
          })
          const q={...queryRequest,limit:6,request_id:workflowKnowledgeQueryId(readerId,queued.run.id,wire.step_key)},queries=new KnowledgeQueryRepository(apiPool,{executionSourceApproved:true})
          assert.equal((await queries.submitExecution(reader,q,wire)).item.status,"prepared")
          if(revoke)await admin.query("UPDATE agentstudio.approvals SET status='rejected' WHERE run_id=$1 AND step_key=$2",[queued.run.id,wire.step_key])
          assert.equal((await worker.tick()).status,revoke?"idle":"retrieved")
          const receipt=await queries.get(reader,q.request_id)
          assert.equal(receipt.status,revoke?"rejected":"succeeded")
          if(!revoke){assert.equal((await queries.submitExecution(reader,q,wire)).replayed,true);assert.equal(receipt.result.retrieval,"semantic")}
          assert.equal((await worker.tick()).status,"idle");assert.equal(queryCalls,2)
        }finally{release("Synthetic held source result");await running;await sourceWorker.tick()}
      }
    },{handlerFactory:createKnowledgeQueryPrivateHandler})
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    assert.equal((await knowledgeContent.search(reader,sharedBase.id,"cedar"))[0].document_id,sharedDoc.item.document_id)
    assert.equal((await withActor(apiPool,reader,(db,id)=>requireKnowledgeScope(db,id,[sharedBase.id])))[0].access_role,"viewer")
    assert.equal((await withActor(apiPool,reader,(db,id)=>gatherAuthorizedKnowledgeEvidence(db,id,[sharedBase.id],"cedar")))[0].documentId,sharedDoc.item.document_id)
    await assert.rejects(withActor(scopedKnowledgePool(apiPool,false),reader,(db,id)=>requireKnowledgeScope(db,id,[sharedBase.id])),error=>error.status===404)
    assert.equal((await knowledgeContent.importParsed(owner,sharedBase.id,contentRequest,{filename:"ci-shared.md",mime_type:"text/markdown",text:"Shared CI cedar evidence"})).replayed,true)
    await assert.rejects(knowledgeContent.importParsed(reader,sharedBase.id,randomUUID(),{filename:"blocked.md",mime_type:"text/markdown",text:"Viewer cannot write"}),error=>error.status===403)
    assert.equal(await bases.get(reader,sharedBase.id),null)
    await assert.rejects(knowledgeAccess.listGrants(reader,sharedBase.id),error=>error.status===404)
    await knowledgeAccess.change(owner,sharedBase.id,{action:"revoke",recipient_id:share.item.recipient_id,expected_revision:2,request_id:randomUUID()})
    await assert.rejects(new KnowledgeQueryRepository(apiPool).get(reader,queryRequest.request_id),error=>error.status===404)
    assert.equal((await knowledgeAccess.listShared(reader)).length,0)
    await assert.rejects(knowledgeContent.search(reader,sharedBase.id,"cedar"),error=>error.status===404)
    await assert.rejects(withActor(apiPool,reader,(db,id)=>requireKnowledgeScope(db,id,[sharedBase.id])),error=>error.status===404)
    const jobsBeforeUnsupported=(await admin.query("SELECT count(*)::int AS n FROM agentstudio.jobs WHERE kind='workflow_tick'")).rows[0].n
    await assert.rejects(new WorkflowSafeRunRepository(apiPool).submit(owner,workflow.id,{
      expected_revision:2,idempotency_key:"v2-execution-stays-closed"}),e=>e.code==="workflow_execution_node_not_supported")
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.jobs WHERE kind='workflow_tick'")).rows[0].n,jobsBeforeUnsupported)
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
    const mcpBinding={connection_id:discovered.id,connection_revision:discovered.revision,tool_name:"synthetic_lookup",catalog_sha256:discovered.catalog_sha256}
    for(const outcome of ["success","business","unknown"]){
      let posts=0
      const mcpExecutor=createMcpToolExecutor(async(material,wire)=>{
        posts++;assert.equal(material.headers[0].value,"Bearer SyntheticMcpHeaderNeverSent012345")
        assert.equal(wire.body.method,"tools/call");assert.equal(wire.body.params.name,"synthetic_lookup")
        if(outcome==="unknown")throw Error("synthetic_mcp_response_lost")
        return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,
          result:{isError:outcome==="business",content:[{type:"text",text:"Synthetic MCP response 4"}]}})}
      })
      const dispatch=verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(identityPool),new WorkflowV2ToolDispatch(apiPool,key,{mcp:mcpExecutor},brokerPool))
      await withDisposableBoundModelTls(dispatch,async config=>{
        const flow=await api.createWorkflowGraph("CI MCP "+outcome,{version:2,nodes:[graph.nodes[0],
          {id:"tool",type:"tool",data:{title:"MCP",mcp_binding:mcpBinding,params_template:'{"query":"own"}'},position:{x:200,y:0}},
          {...graph.nodes[2],data:{title:"End",output_template:"{{MCP.output}}"}}],edges:[{id:"a",source:"start",target:"tool"},{id:"b",source:"tool",target:"end"}]})
        const queued=await api.submitWorkflowV2Run(flow.id,1,"Synthetic MCP","ci-mcp-"+outcome)
        const worker=new WorkflowV2Worker(workerPool,"ci-mcp-"+outcome,{executor:workflowV2ToolEffectExecutor(config)})
        await worker.tick();const pending=(await api.getWorkflowV2Run(queued.run.id)).pending_effect
        await api.login("other@example.com","SyntheticOtherPassword#2026")
        await assert.rejects(api.decideWorkflowV2Node(queued.run.id,"approved",pending.step_key,pending.input_sha256),error=>error.status===404)
        await assert.rejects(api.createWorkflowGraph("Foreign MCP",flow.graph),error=>error.status===404)
        await api.login("admin@example.com","SyntheticAdminPassword#2026")
        assert.equal(posts,0);await api.decideWorkflowV2Node(queued.run.id,"approved",pending.step_key,pending.input_sha256)
        for(let i=0;i<4;i++)await worker.tick()
        const result=await api.getWorkflowV2Run(queued.run.id)
        assert.equal(result.run.status,outcome==="success"?"succeeded":outcome==="business"?"failed":"paused")
        assert.equal(posts,1);assert.equal(JSON.stringify(result).includes("SyntheticMcpHeaderNeverSent012345"),false)
        const status=outcome==="success"?"succeeded":outcome==="business"?"failed":"unknown"
        assert.deepEqual((await admin.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1 ORDER BY step_key",[queued.run.id])).rows,[{status},{status}])
        assert.equal((await worker.tick()).status,"idle");assert.equal(posts,1)
      },{handlerFactory:createWorkflowV2ToolInternalHandler})
    }
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
    const mcpRole=await new AgentSpecRepository(apiPool).create(owner,"CI MCP Agent role",safeAgentSpec({goal:"Synthetic MCP role",tools:["mcp_lookup"],
      mcp_tools:[{name:"mcp_lookup",...managedBinding}],model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"}}))
    for(const autonomous of [false,true])for(const selection of ["builtin","http","mcp"]){
    const custom=selection==="http",useMcp=selection==="mcp"
    let agentCalls=0,agentHttpCalls=0,agentMcpCalls=0
    const selectedRole=useMcp?mcpRole:custom?httpRole:role
    const selectedFlow=custom||useMcp?await api.createWorkflowGraph("CI "+selection+" Agent Workflow",{...agentGraph,nodes:agentGraph.nodes.map(node=>node.type==="agent"?
      {...node,data:{...node.data,agent_binding:{spec_id:selectedRole.id,spec_revision:selectedRole.revision}}}:node)}):agentFlow
    const planning=async(material,prompt)=>{agentCalls++;assert.equal(material.api_key,secret)
      const context=JSON.parse(prompt)
      if(custom){assert.equal(prompt.includes(toolSecret),false);assert.equal(prompt.includes(tool.id),false)}
      if(useMcp)for(const privateValue of [discovered.id,mcpInput.url,"SyntheticMcpHeaderNeverSent012345",managed.id,managedMetadata.url,smitherySecret])assert.equal(prompt.includes(privateValue),false)
      if(context.round===1)return JSON.stringify(custom||useMcp?{action:"tool",tool:useMcp?"mcp_lookup":"http_lookup",params:{query:"synthetic owner lookup"}}:{action:"tool",tool:"calculate",params:{expression:"2+2"}})
      assert.match(context.history[0].observation,/4/);return '{"action":"answer","answer":"Synthetic Agent result 4"}'
    }
    const agentModel=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error("direct fallback forbidden")},brokerPool,{allowAgentExecution:!autonomous,allowAutonomousExecution:autonomous,agentExecutor:planning})
    const agentTool=new WorkflowV2ToolDispatch(apiPool,key,{async http(material,args){agentHttpCalls++
      const request=prepareWorkflowToolHttp(material,args)
      assert.equal(request.headers.authorization,"Bearer "+toolSecret);assert.equal(request.url,tool.url)
      assert.deepEqual(args,{query:"synthetic owner lookup"});return "Synthetic HTTP observation 4"
    },mcp:createMcpToolExecutor(async(material,wire)=>{agentMcpCalls++;assert.equal(material.headers[0].value,"Bearer "+smitherySecret)
      assert.equal(wire.body.method,"tools/call");return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result:{content:[{type:"text",text:"Synthetic MCP observation 4"}]}})}
    })},brokerPool,{allowAgentExecution:!autonomous,allowAutonomousExecution:autonomous})
    const agentDispatch={model:verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),agentModel),
      tool:verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(identityPool),agentTool)}
    const handlers=raw=>{const config={...raw,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"};const model=createWorkflowV2ModelInternalHandler({...config,dispatch:config.dispatch.model}),
      tool=createWorkflowV2ToolInternalHandler({...config,dispatch:config.dispatch.tool})
      return (req,res)=>(req.url==="/__internal/v2/workflow-tool/dispatch"?tool:model)(req,res)}
    await withDisposableBoundModelTls(agentDispatch,async config=>{
      const adapters=[workflowV2ModelEffectExecutor(config),workflowV2ToolEffectExecutor(config)]
      const executor={supports:req=>adapters.some(adapter=>adapter.supports(req)),execute(request,lease){return adapters.find(adapter=>adapter.supports(request)).execute(request,lease)}}
      const suffix=useMcp?"-mcp":custom?"-http":""
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
      assert.equal(agentMcpCalls,useMcp?1:0)
      assert.equal(detail.steps.filter(step=>step.metadata.parent_step_key).length,3)
      const ledger=(await admin.query("SELECT status FROM agentstudio.external_effects WHERE run_id=$1",[run.run.id])).rows
      assert.equal(ledger.length,7);assert.equal(ledger.every(row=>row.status==="succeeded"),true)
      ui?.dispose()
    },{handlerFactory:handlers})
    }
    const rotated=await api.saveSmitheryKey(smitherySecret+"rotated",1,randomUUID())
    assert.equal(rotated.revision,2);assert.equal((await api.getMcpConnection(managed.id)).enabled,false)
    await assert.rejects(api.submitAutonomousAgentRun(mcpRole.id,1,"Stale managed binding","ci-reject-rotated-managed-mcp",3),error=>error.status===409)
    const toRevoke=await api.getSmitheryConnection(managed.id),revoked=await api.operateSmithery(managed.id,toRevoke.revision,"revoke")
    assert.equal(revoked.state,"revoked");assert.equal((await api.removeSmitheryKey(2,randomUUID())).has_key,false)
  }finally{
    if(front)await front.close()
    await Promise.all(pools.map(pool=>pool.end()));await admin.end();key.fill(0)
  }
})
