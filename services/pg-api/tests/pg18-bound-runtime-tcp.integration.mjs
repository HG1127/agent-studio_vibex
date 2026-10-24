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
import {captureFreshRuntimeSources,freshRuntimeSqlBody,freshRuntimeRoles} from "../src/pg18-fresh-runtime-source.mjs"
import {installFreshRuntime} from "../src/pg18-fresh-runtime-install.ts"
import {verifyFreshForTest} from "../src/baota-pg18-fresh-init.mjs"
import {collectNativeActivationEvidenceForTest,diagnoseNativeSchema,makeNativeScramVerifier} from "../src/native-activation-cli.mjs"
import {serviceLoginKinds,serviceLoginDefinition,serviceLoginTargetGuardSql} from "../src/pg18-service-login-policy.mjs"
import {inspectPreparedServiceLogins,reservePreparedServiceLogin,activatePreparedServiceLogin} from "../src/pg18-service-login-inspector.ts"
import {inspectRuntimePreparationStage} from "../src/pg18-runtime-postcheck.ts"
import {verifyBoundDispatchPrivileges,verifyBoundDispatchRole,verifyWorkflowModelIdentityPrivileges,verifyWorkflowEffectIdentityPrivileges} from "../src/bound-dispatch-role-preflight.ts"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createPgNativeWorkflowRunSession,workflowApprovalReady} from "../../../src/lib/pgNativeWorkflowRunSession.ts"
import {createPgNativeWorkflowDebugSession} from "../../../src/lib/pgNativeWorkflowDebugSession.ts"
import {createHandler} from "../src/http.ts"
import {createNativeRunRepository} from "../src/native-run-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {AgentCollaborationRepository} from "../src/agent-collaboration-repository.ts"
import {inspectAgentCollaborationSchema} from "../src/agent-collaboration-audit.ts"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowSafeRunRepository} from "../src/workflow-safe-run-repository.ts"
import {AutonomousAgentRunRepository} from "../src/autonomous-agent-run-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {ScheduleInventoryRepository} from "../src/schedule-inventory-repository.ts"
import {ScheduleDraftRepository} from "../src/schedule-draft-repository.ts"
import {ScheduleRuntimeRepository} from "../src/schedule-runtime-repository.ts"
import {ScheduleRuntimeWorker} from "../src/schedule-runtime-worker.ts"
import {verifyScheduleRuntimeSchema} from "../src/schedule-runtime-audit.ts"
import {SCHEDULE_BACKGROUND_ACK,SCHEDULE_KNOWLEDGE_ACK} from "../src/schedule-runtime-contract.ts"
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
import {scopedKnowledgeToolPool,verifyKnowledgeToolSchema} from "../src/knowledge-tool-policy.ts"
import {KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT} from "../src/knowledge-retrieval-binding.ts"
import {verifyWorkflowEffectLease,reserveWorkflowEffectDispatch} from "../src/workflow-v2-dispatch-guard.ts"
import {INDEX_START_ACKNOWLEDGEMENT} from "../src/knowledge-index-contracts.ts"
import {embeddingEndpointPolicy} from "../src/knowledge-embedding-policy.ts"
import {verifyKnowledgeEmbeddingSchema} from "../src/knowledge-embedding-privileges.ts"
import {verifyKnowledgeRuntimeSchema,verifyKnowledgeAgentSchema,verifyWorkflowSampleLineageSchema} from "../src/knowledge-content-privileges.ts"
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
const policy={configurationWrites:true,employeeProvisioning:true,runApprovalUat:true,
  boundModelExecutionUat:true,modelProbeUat:true,mcpDiscoveryUat:true,mcpToolExecutionUat:true,smitheryManagementUat:true,knowledgeSharingUat:true,knowledgeEmbeddingSettingsUat:true,knowledgeEmbeddingConsentUat:true,knowledgeIndexRuntimeUat:true,knowledgeQueryRuntimeUat:true,knowledgeToolExecutionUat:true,workflowV2ExecutionUat:true,autonomousAgentUat:true,scheduleRuntimeUat:true}
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
      allowKnowledgeToolExecution:true,
      allowRunSubmission:policy.runApprovalUat,allowBoundRunSubmission:policy.boundModelExecutionUat,
      allowWorkflowV2Submission:policy.workflowV2ExecutionUat,allowAutonomousAgentSubmission:policy.autonomousAgentUat,allowScheduleRuntime:true,allowAgentCollaboration:true,
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
      agentCollaborationRepository:new AgentCollaborationRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email),{enabled:true}),
      knowledgeAccessRepository:new KnowledgeAccessRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),
      knowledgeContentRepository:new KnowledgeContentRepository(pool),
      knowledgeEmbeddingRepository:new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),
      knowledgeEmbeddingConsentRepository:new KnowledgeEmbeddingConsentRepository(pool),
      knowledgeIndexRepository:new KnowledgeIndexRepository(pool),
      knowledgeQueryRepository:new KnowledgeQueryRepository(pool),
      workflowRepository:new WorkflowRepository(pool),
      scheduleInventory:new ScheduleInventoryRepository(pool),scheduleDraftRepository:new ScheduleDraftRepository(pool),
      scheduleRuntimeRepository:new ScheduleRuntimeRepository(pool,{enabled:true,allowMcpExecution:true,allowKnowledgeExecution:true}),
      workflowV2RunRepository:new WorkflowV2RunRepository(pool,"workflow_native_v2",{allowMcpExecution:true,allowKnowledgeExecution:true}),autonomousAgentRunRepository:new AutonomousAgentRunRepository(pool,{allowMcpExecution:true,allowKnowledgeExecution:true}),
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
        res.on("data",chunk=>{bytes+=chunk.length;if(bytes>262144)res.destroy();else chunks.push(chunk)})
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
  const boundedTarget={...target,connectionTimeoutMillis:15000,statement_timeout:15000,query_timeout:20000}
  const admin=new pg.Pool(boundedTarget),pools=[]
  let phase="fresh-init"
  const mark=value=>{phase=value;process.stderr.write("PG18_SYNTHETIC_STAGE "+value+"\n")}
  mark(phase)
  const key=randomBytes(32)
  let front
  try{
    const observed=(await admin.query("SELECT current_database() AS db,session_user AS login,host(inet_server_addr()) AS server_address,"+
      "current_setting('server_version_num')::int AS version,"+
      "(SELECT count(*)::int FROM pg_namespace WHERE nspname IN ('agentstudio','agentstudio_auth')) AS existing,"+
      "(SELECT count(*)::int FROM pg_roles WHERE rolname LIKE 'agentstudio\\_%' ESCAPE '\\') AS roles")).rows[0]
    assert.equal(observed.db,"agentstudio_pg18_ci");assert.equal(observed.login,"agentstudio_admin")
    assert.match(observed.server_address,/^\d{1,3}(?:\.\d{1,3}){3}$/);assert.ok(observed.server_address.split(".").every(x=>Number(x)<=255))
    assert.ok(observed.version>=180000&&observed.version<190000)
    assert.equal(observed.existing,0);assert.equal(observed.roles,1) // only the CI administrator
    const accounts=[
      ["agentstudio_stage_login","agentstudio_api"],
      ["agentstudio_stage_worker","agentstudio_worker,agentstudio_api"],
    ]
    const byLogin={}
    const passwordFor=login=>createHash("sha512").update(target.password+":"+login).digest("hex").slice(0,80)
    const installLogin=async([login,roles],db=admin)=>{
      // All identifiers are literal constants and every password is ASCII
      // hex derived from the disposable Actions password. Never print them.
      const password=passwordFor(login)
      await db.query("CREATE ROLE "+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS "+
        "NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '"+makeNativeScramVerifier(password)+"'")
      await db.query("GRANT "+roles+" TO "+login)
    }
    const fresh=captureFreshRuntimeSources(),bootstrap=await admin.connect()
    try{
      // The same production source sequence runs in one real PG18 transaction.
      // Only this guarded CI adapter substitutes Native Auth's disposable target.
      const native=freshRuntimeSqlBody(loadNativeAuthPg18CiSchema().sql)
      const initialize=async(failAtKeyword=false)=>{
        await bootstrap.query("BEGIN")
        try{
          await bootstrap.query("SET LOCAL password_encryption='scram-sha-256'")
          await bootstrap.query(loadPg18CiBaseline().sql)
          for(const account of accounts)await installLogin(account,bootstrap)
          await verifyFreshForTest(bootstrap)
          const client={query(sql,args=[]){
            if(failAtKeyword&&sql===fresh.steps.find(s=>s.version==='pg_v9_041').sql)throw Error('synthetic_fresh_runtime_rollback')
            return bootstrap.query(sql===fresh.steps[0].sql?native:sql,args)
          }}
          const result=await installFreshRuntime(client,fresh)
          const activation=await collectNativeActivationEvidenceForTest(client)
          assert.deepEqual(activation.fresh_runtime,{verified:true})
          const activationReport=diagnoseNativeSchema(activation)
          assert.equal(activationReport.ready,false);assert.ok(activationReport.blockers.includes("unexpected_pg18_target"))
          assert.equal(activationReport.blockers.includes("baseline_tables_or_rls_missing"),false)
          await bootstrap.query("COMMIT");return result
        }catch(error){await bootstrap.query("ROLLBACK");throw error}
      }
      await assert.rejects(initialize(true),/synthetic_fresh_runtime_rollback/)
      assert.equal((await bootstrap.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN('agentstudio','agentstudio_auth')")).rows[0].n,0)
      assert.equal((await bootstrap.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])",[freshRuntimeRoles])).rows[0].n,0)
      const initialized=await initialize()
      assert.equal(initialized.migration_versions,31);assert.equal(initialized.service_logins_enabled,false)
      const receipt=(await bootstrap.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg18_fresh_runtime_001'")).rows[0]
      assert.equal(JSON.parse(receipt.description).source_sha256,fresh.source_sha256)
      assert.equal((await bootstrap.query("SELECT count(*)::int AS n FROM agentstudio.schema_migrations WHERE description ILIKE '%synthetic%'")).rows[0].n,0)
    }finally{bootstrap.release()}
    mark("service-login-preparation")
    const checkPreparationStage=async stage=>{
      const client=await admin.connect()
      try{await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        try{const report=await inspectRuntimePreparationStage(client,fresh,stage);assert.equal(report.stage_verified,true);assert.equal(report.production_cutover_allowed,false);return report}
        finally{await client.query("ROLLBACK")}
      }finally{client.release()}
    }
    await checkPreparationStage("initialized")
    // The version ledger is deliberately outside RLS. Unexpected flags must
    // fail even for a superuser inspector that can still see every version.
    for(const [change,restore] of [
      ["ALTER TABLE agentstudio.schema_migrations ENABLE ROW LEVEL SECURITY","ALTER TABLE agentstudio.schema_migrations DISABLE ROW LEVEL SECURITY"],
      ["ALTER TABLE agentstudio.schema_migrations FORCE ROW LEVEL SECURITY","ALTER TABLE agentstudio.schema_migrations NO FORCE ROW LEVEL SECURITY"],
    ]){
      await admin.query(change)
      try{await assert.rejects(checkPreparationStage("initialized"),/fresh_runtime_verification_failed/)}finally{await admin.query(restore)}
    }
    // The original production target guard MUST reject this disposable CI DB.
    await assert.rejects(admin.query(serviceLoginTargetGuardSql),/service_login_target_not_approved/)
    const authPassword=passwordFor("agentstudio_native_login")
    await admin.query("ALTER ROLE agentstudio_native_login LOGIN PASSWORD '"+makeNativeScramVerifier(authPassword)+"'")
    await checkPreparationStage("native-login")
    const authPool=new pg.Pool({...boundedTarget,user:"agentstudio_native_login",password:authPassword})
    pools.push(authPool)
    const auth=new NativeAuthRepository(adapter(authPool))
    await auth.provisionInitialAdmin({email:"admin@example.com",password:"SyntheticAdminPassword#2026",display_name:"CI Admin"})
    await checkPreparationStage("first-admin")
    // Exact CI-only target substitutions, behind requireEphemeralPg18Ci above.
    // PG18/vector/superuser/recovery/schema/role/receipt checks are unchanged.
    let serviceGuard=serviceLoginTargetGuardSql
    for(const [before,after] of [["current_database() <> 'agent_studio'","current_database() <> 'agentstudio_pg18_ci'"],
      ["current_setting('port')::integer <> 5333","current_setting('port')::integer <> 5432"],
      ["session_user <> 'postgres'","session_user <> 'agentstudio_admin'"],
      ["host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'","host(inet_server_addr()) IS DISTINCT FROM '"+observed.server_address+"'"]]){
      assert.equal(serviceGuard.split(before).length,2);serviceGuard=serviceGuard.replace(before,after)
    }
    const operator=await admin.connect()
    try{
      const prepared={query(sql,args=[]){
        if(sql===serviceLoginTargetGuardSql)return operator.query(serviceGuard,args)
        for(const kind of serviceLoginKinds){const login=serviceLoginDefinition(kind).login
          if(sql==="GRANT CONNECT ON DATABASE agent_studio TO "+login)return operator.query("GRANT CONNECT ON DATABASE agentstudio_pg18_ci TO "+login,args)
        }
        return operator.query(sql,args)
      }}
      const prepare=async(kind,failBeforeReceipt=false)=>{
        await operator.query("BEGIN")
        try{
          await operator.query("SELECT pg_advisory_xact_lock(61824,20261024)")
          await reservePreparedServiceLogin(prepared,kind,fresh)
          const injected={query(sql,args=[]){if(failBeforeReceipt&&sql.startsWith("INSERT INTO agentstudio.schema_migrations"))throw Error("synthetic_service_activation_rollback");return prepared.query(sql,args)}}
          const result=await activatePreparedServiceLogin(injected,kind,fresh,passwordFor(serviceLoginDefinition(kind).login))
          await operator.query("COMMIT");return result
        }catch(error){await operator.query("ROLLBACK");throw error}
      }
      await assert.rejects(prepare("identity",true),/synthetic_service_activation_rollback/)
      assert.equal((await operator.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='agentstudio_bound_dispatch_login'")).rows[0].n,0)
      for(const kind of serviceLoginKinds){const result=await prepare(kind);assert.equal(result.activated,true);assert.equal(result.services_started,false)}
      await operator.query("BEGIN READ ONLY")
      try{assert.equal((await inspectPreparedServiceLogins(prepared,fresh)).receipts.length,6)}finally{await operator.query("ROLLBACK")}
    }finally{operator.release()}
    assert.equal((await checkPreparationStage("service-logins")).service_activation_receipts,6)
    for(const kind of serviceLoginKinds){const login=serviceLoginDefinition(kind).login,pool=new pg.Pool({...boundedTarget,user:login,password:passwordFor(login),max:5})
      pools.push(pool);byLogin[login]=pool
      assert.equal((await pool.query("SELECT session_user AS login")).rows[0].login,login)
    }
    const apiPool=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedKnowledgeIndexPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(scopedKnowledgePool(adapter(byLogin.agentstudio_stage_login),true),true),true),true),true),true)
    await verifyKnowledgeRuntimeSchema(apiPool,true)
    mark("restricted-login-audits")
    await verifyKnowledgeAgentSchema(apiPool)
    await verifyWorkflowSampleLineageSchema(apiPool)
    await verifyKnowledgeEmbeddingSchema(apiPool)
    await verifyKnowledgeEmbeddingConsentSchema(apiPool)
    await verifyKnowledgeIndexSchema(apiPool)
    await verifyKnowledgeQuerySchema(apiPool)
    await verifyKnowledgeToolSchema(apiPool)
    for(const mutation of [
      ["GRANT SELECT ON agentstudio.knowledge_keyword_observations TO agentstudio_stage_login","REVOKE SELECT ON agentstudio.knowledge_keyword_observations FROM agentstudio_stage_login"],
      ["GRANT EXECUTE ON FUNCTION agentstudio.knowledge_keyword_snapshot(uuid[],text) TO agentstudio_api","REVOKE EXECUTE ON FUNCTION agentstudio.knowledge_keyword_snapshot(uuid[],text) FROM agentstudio_api"],
    ]){
      await admin.query(mutation[0])
      try{await assert.rejects(verifyKnowledgeToolSchema(apiPool),/unsafe_knowledge_keyword_privileges/)}finally{await admin.query(mutation[1])}
    }
    for(const pool of Object.values(byLogin)){
      await assert.rejects(pool.query("SELECT run_id FROM agentstudio.knowledge_keyword_observations LIMIT 1"),e=>e.code==="42501")
      await assert.rejects(pool.query("SELECT run_id FROM agentstudio.knowledge_agent_observations LIMIT 1"),e=>e.code==="42501")
      await assert.rejects(pool.query("SELECT run_id FROM agentstudio.workflow_sample_lineage LIMIT 1"),e=>e.code==="42501")
      for(const table of ["schedule_execution_authorities","schedule_execution_origins","schedule_execution_effect_receipts","agent_collaboration_grants","agent_collaboration_proposals","agent_collaboration_revisions","agent_collaboration_receipts"])
        await assert.rejects(pool.query("SELECT owner_user_id FROM agentstudio."+table+" LIMIT 1"),e=>e.code==="42501")
    }
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
    const workerPool=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedEmbeddingConsentPool(scopedEmbeddingSettingsPool(scopedKnowledgePool(adapter(byLogin.agentstudio_stage_worker),true),true),true),true),true)
    await verifyScheduleRuntimeSchema(apiPool);await verifyScheduleRuntimeSchema(workerPool)
    assert.equal(await inspectAgentCollaborationSchema(apiPool),true)
    assert.equal(await inspectAgentCollaborationSchema(workerPool),true)
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
    await verifyMcpDiscoveryPrivileges(apiPool,brokerPool)
    await verifyMcpExecutionSchema(apiPool)
    await verifySmitheryPrivileges(apiPool,brokerPool)
    front=await startNativeHttps(auth,apiPool,key,brokerPool)
    mark("native-https-configuration")
    const api=front.api
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    const capabilities=await api.getConfigCapabilities()
    assert.equal(capabilities.run_submission_enabled,true)
    assert.equal(capabilities.bound_model_runs_enabled,true)
    assert.equal(capabilities.workflow_v2_submission_enabled,true)
    assert.equal(capabilities.mcp_discovery_enabled,true)
    assert.equal(capabilities.mcp_tool_runs_enabled,true)
    assert.equal(capabilities.smithery_management_enabled,true)
    assert.equal(capabilities.agent_collaboration_available,true)
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
    mark("knowledge-owner-and-original-source-fences")
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
    assert.equal((await api.getConfigCapabilities()).knowledge_tool_runtime_enabled,true)
    const readerDraft=await api.createModelConnection({name:"CI reader embedding",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticReaderQueryCredentialNeverNetwork012345",models:["synthetic-embedding","synthetic-chat"],enabled:true})
    const readerModel=await api.testModelConnection(readerDraft.id,readerDraft.revision)
    // SQL042: actual initial shared grounding through restricted Native API,
    // Worker and separate credential/identity logins, over private mTLS.
    const singleDraft=await api.createAgent("CI single-shot shared source","Use original shared evidence")
    const singleBound=await api.bindAgentModel(singleDraft.id,singleDraft.revision,{connection_id:readerModel.id,connection_revision:readerModel.revision,model_id:"synthetic-chat"})
    await api.updateAgentKnowledgeBases(singleBound.id,singleBound.revision,[sharedBase.id])
    const singleShared=await api.submitRun(singleDraft.id,"Search KB: cedar","ci-single-shared-original")
    assert.equal((await prepare.tick()).status,"prepared");await api.decideModel(singleShared.run.id,"approved")
    let singleCalls=0
    const singleBroker=new OwnerBoundModelDispatch(apiPool,key,async(material,input)=>{
      singleCalls++;assert.equal(material.api_key,"SyntheticReaderQueryCredentialNeverNetwork012345")
      assert.match(JSON.stringify(input.knowledgeEvidence),/Shared CI cedar evidence/)
      return "Original single-shot shared result"
    },brokerPool)
    await withDisposableBoundModelTls(createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(identityPool),singleBroker),async config=>{
      const worker=new AgentModelWorker(workerPool,"ci-single-shared",{async generate(){throw Error("shared_fallback_forbidden")}},
        {boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(config)})
      assert.equal((await worker.tick()).status,"succeeded");assert.equal((await worker.tick()).status,"idle")
    })
    assert.equal(singleCalls,1);assert.equal((await api.getRun(singleShared.run.id)).run.knowledge_outputs_available,true)
    const singleLedger=(await admin.query("SELECT reader_user_id,input_sha256,result_refs FROM agentstudio.knowledge_agent_observations WHERE run_id=$1",[singleShared.run.id])).rows[0]
    assert.equal(singleLedger.reader_user_id,share.item.recipient_id);assert.equal(singleLedger.result_refs.length,1)
    assert.match(singleLedger.input_sha256,/^[a-f0-9]{64}$/)
    await assert.rejects(byLogin.agentstudio_stage_login.query("SELECT * FROM agentstudio.knowledge_agent_observations"),e=>e.code==="42501")
    await api.changeKnowledgeEmbeddingSettings({action:"configure",request_id:randomUUID(),expected_revision:0,connection_id:readerModel.id,connection_revision:readerModel.revision,model_name:"synthetic-embedding",base_url:"https://api.openai.com/v1"})
    const readerProfile=await api.getKnowledgeEmbeddingConsent()
    await api.changeKnowledgeEmbeddingConsent({action:"grant",request_id:randomUUID(),expected_revision:0,profile_id:readerProfile.profile_id,profile_revision:readerProfile.profile_revision,index_enabled:false,query_enabled:true,acknowledgement:EMBEDDING_CHARGE_ACKNOWLEDGEMENT})
    const queryRequest={request_id:randomUUID(),base_ids:[sharedBase.id],query:"different wording",mode:"semantic",profile_id:readerProfile.profile_id,profile_revision:readerProfile.profile_revision,consent_revision:1,acknowledgement:QUERY_CHARGE_ACKNOWLEDGEMENT}
    assert.equal((await api.submitKnowledgeQuery(queryRequest)).item.status,"prepared")
    const queryWorkerPool=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedKnowledgePool(adapter(byLogin.agentstudio_knowledge_index_worker_login),true),true),true)
    const queryBrokerPool=scopedKnowledgeToolPool(scopedKnowledgeQueryPool(scopedKnowledgePool(adapter(byLogin.agentstudio_knowledge_index_broker_login),true),true),true)
    let queryCalls=0
    const queryBroker=new KnowledgeQueryBroker(queryBrokerPool,brokerPool,key,async material=>{
      queryCalls++;assert.equal(material.api_key,"SyntheticReaderQueryCredentialNeverNetwork012345");assert.deepEqual(material.input,[queryRequest.query]);return [[1,0]]
    },{approvedForIsolatedUat:true})
    let semanticRunId,keywordRunId,lineageRunId
    await withDisposableBoundModelTls(claim=>queryBroker.dispatch(claim),async config=>{
      const worker=new KnowledgeQueryWorker(queryWorkerPool,createKnowledgeQueryPrivateClient(config),{approvedForIsolatedUat:true})
      assert.equal((await worker.tick()).status,"retrieved");assert.equal((await worker.tick()).status,"idle")
      assert.equal((await api.getKnowledgeQueryReceipt(queryRequest.request_id)).result.items[0].document_id,sharedDoc.item.document_id)
      assert.equal((await api.submitKnowledgeQuery(queryRequest)).replayed,true);assert.equal(queryCalls,1)
      // Exercise the source fence independently before the actual Tool below.
      for(const revoke of [false,true]){
        const flow=await api.createWorkflowGraph("Synthetic query source",{version:2,nodes:[
          {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
          {id:"search",type:"tool",data:{title:"Search",tool:"knowledge_search",knowledge_base_ids:[sharedBase.id],knowledge_retrieval:{mode:"semantic",profile_id:readerProfile.profile_id,profile_revision:readerProfile.profile_revision,consent_revision:1},params_template:'{"query":"different wording"}'},position:{x:100,y:0}},
          {id:"end",type:"end",data:{title:"End"},position:{x:200,y:0}}],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]})
        const queued=await api.submitWorkflowV2Run(flow.id,flow.revision,"Synthetic source only","ci-source-"+flow.id)
        let enter,release
        const ready=new Promise(resolve=>{enter=resolve}),result=new Promise(resolve=>{release=resolve})
        const sourceWorker=new WorkflowV2Worker(workerPool,"ci-query-source",{executor:{supports:()=>true,execute(request,lease){enter({request,lease});return result}}})
        await sourceWorker.tick();const pending=(await api.getWorkflowV2Run(queued.run.id)).pending_effect
        await api.decideWorkflowV2Node(queued.run.id,"approved",pending.step_key,pending.input_sha256,KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT)
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
      const flow=await api.createWorkflowGraph("Actual approved semantic Tool",{version:2,nodes:[
        {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
        {id:"search",type:"tool",data:{title:"Search",tool:"knowledge_search",knowledge_base_ids:[sharedBase.id],knowledge_retrieval:{mode:"semantic",profile_id:readerProfile.profile_id,profile_revision:readerProfile.profile_revision,consent_revision:1},params_template:'{"query":"different wording"}'},position:{x:100,y:0}},
        {id:"model",type:"model",data:{title:"Answer",model_binding:{connection_id:readerModel.id,connection_revision:readerModel.revision,model_id:"synthetic-chat"},prompt:"Use approved evidence: {{Search.output}}"},position:{x:200,y:0}},
        {id:"end",type:"end",data:{title:"End",output_template:"{{Answer.output}}"},position:{x:300,y:0}}],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"model"},{id:"c",source:"model",target:"end"}]})
      const queued=await api.submitWorkflowV2Run(flow.id,flow.revision,"Private task must not reach embedding provider","ci-real-semantic-"+flow.id)
      semanticRunId=queued.run.id;let modelCalls=0,lineageCalls=0
      const model=new WorkflowV2ModelDispatch(apiPool,key,async(material,prompt)=>{
        modelCalls++;assert.equal(material.api_key,"SyntheticReaderQueryCredentialNeverNetwork012345");assert.match(prompt,/cedar/);return "approved-semantic-result"
      },brokerPool,{nodeDebugExecutor:async(material,prompt)=>{
        lineageCalls++;assert.equal(material.api_key,"SyntheticReaderQueryCredentialNeverNetwork012345");assert.match(prompt,/cedar/);return "Synthetic inherited PG18 output"
      }})
      const tool=new WorkflowV2ToolDispatch(apiPool,key,{},brokerPool,{allowKnowledgeExecution:true})
      const dispatch={model:verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),model),tool:verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(identityPool),tool)}
      const controller=new AbortController(),loop=(async()=>{while(!controller.signal.aborted){await worker.tick(controller.signal);await new Promise(resolve=>setTimeout(resolve,20))}})()
      try{await withDisposableBoundModelTls(dispatch,async wire=>{
        const adapters=[workflowV2ModelEffectExecutor(wire),workflowV2ToolEffectExecutor(wire)],runtimeWorker=new WorkflowV2Worker(workerPool,"ci-real-semantic",{scheduleExecutionApproved:true,executor:{supports:r=>adapters.some(a=>a.supports(r)),execute(r,lease){return adapters.find(a=>a.supports(r)).execute(r,lease)}}})
        let completed=false
        for(let i=0;i<20;i++){
          await runtimeWorker.tick();const view=await api.getWorkflowV2Run(semanticRunId)
          if(view.run.status==="awaiting_approval"){
            const p=view.pending_effect,paid=p.kind==="tool"&&p.configuration.knowledge_retrieval
            if(paid)await assert.rejects(api.decideWorkflowV2Node(semanticRunId,"approved",p.step_key,p.input_sha256),e=>e.status===409)
            else assert.match(p.input,/cedar/)
            await api.decideWorkflowV2Node(semanticRunId,"approved",p.step_key,p.input_sha256,paid?KNOWLEDGE_TOOL_CHARGE_ACKNOWLEDGEMENT:undefined)
          }else if(view.run.status==="succeeded"){completed=true;break}
          else assert.ok(!["paused","failed","cancelled"].includes(view.run.status))
        }
        assert.equal(completed,true);assert.equal(modelCalls,1);assert.equal(queryCalls,3)
        const keywordFlow=await api.createWorkflowGraph("Actual free keyword Tool",{version:2,nodes:[
          {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
          {id:"search",type:"tool",data:{title:"Search",tool:"knowledge_search",knowledge_base_ids:[sharedBase.id],params_template:'{"query":"cedar"}'},position:{x:100,y:0}},
          {id:"model",type:"model",data:{title:"Answer",model_binding:{connection_id:readerModel.id,connection_revision:readerModel.revision,model_id:"synthetic-chat"},prompt:"Use approved evidence: {{Search.output}}"},position:{x:200,y:0}},
          {id:"end",type:"end",data:{title:"End",output_template:"{{Answer.output}}"},position:{x:300,y:0}}],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"model"},{id:"c",source:"model",target:"end"}]})
        const keywordRun=await api.submitWorkflowV2Run(keywordFlow.id,keywordFlow.revision,"Synthetic free keyword task","ci-real-keyword-"+keywordFlow.id)
        keywordRunId=keywordRun.run.id;completed=false
        for(let i=0;i<20;i++){
          await runtimeWorker.tick();const view=await api.getWorkflowV2Run(keywordRunId)
          if(view.run.status==="awaiting_approval"){
            const p=view.pending_effect;assert.equal(p.configuration.knowledge_retrieval,undefined)
            await api.decideWorkflowV2Node(keywordRunId,"approved",p.step_key,p.input_sha256)
          }else if(view.run.status==="succeeded"){completed=true;break}
          else assert.ok(!["paused","failed","cancelled"].includes(view.run.status))
        }
        assert.equal(completed,true);assert.equal(modelCalls,2);assert.equal(queryCalls,3)
        const keywordProof=(await admin.query("SELECT * FROM agentstudio.knowledge_keyword_observations WHERE run_id=$1",[keywordRunId])).rows
        assert.equal(keywordProof.length,1);assert.equal(keywordProof[0].reader_user_id,share.item.recipient_id);assert.equal(keywordProof[0].result_refs.length,1)
        assert.doesNotMatch(JSON.stringify(keywordProof),/cedar|Synthetic free keyword task|lease_token|ciphertext/)
        assert.equal((await api.getWorkflowV2Run(keywordRunId)).knowledge_outputs_available,true)
        const original=await api.getWorkflowV2Outputs(keywordRunId)
        const inherited=await api.submitWorkflowNodeDebug(keywordFlow.id,{node_id:"model",expected_revision:keywordFlow.revision,idempotency_key:"ci-historical-node-debug",
          samples:{input:original.run.instruction,outputs:{search:original.nodes.find(n=>n.node_id==="search").output_text},provenance:{kind:"history",run_id:keywordRunId,
            workflow_id:keywordFlow.id,workflow_revision:original.run.workflow_revision,output_version:original.run.output_version,input:true,nodes:["search"]}}})
        lineageRunId=inherited.run.id
        for(let i=0;i<6;i++){
          await runtimeWorker.tick();const view=await api.getWorkflowV2Run(lineageRunId)
          if(view.run.status==="awaiting_approval"){const p=view.pending_effect;await api.decideWorkflowV2Node(lineageRunId,"approved",p.step_key,p.input_sha256)}
          else if(view.run.status==="succeeded")break
        }
        assert.equal((await api.getWorkflowV2Run(lineageRunId)).run.result_text,"Synthetic inherited PG18 output");assert.equal(lineageCalls,1)
        const lineage=(await admin.query("SELECT * FROM agentstudio.workflow_sample_lineage WHERE run_id=$1",[lineageRunId])).rows[0]
        assert.equal(lineage.reader_user_id,share.item.recipient_id);assert.equal(lineage.source_run_id,keywordRunId)
        assert.doesNotMatch(JSON.stringify(lineage),/cedar|Synthetic free keyword task|Synthetic inherited PG18 output|lease_token|ciphertext/)
        for(const paid of [false,true]){
          const schedule=await api.createScheduleDraft({name:"Scheduled semantic "+paid,kind:"workflow",target_id:flow.id,time_zone:"UTC",rule:{kind:"interval",interval_minutes:15}})
          const grant=await api.activateSchedule(schedule.id,{expected_revision:schedule.revision,expected_target_revision:flow.revision,instruction:"Synthetic standing semantic task",max_steps:1,
            anchor_at:new Date().toISOString(),expires_at:null,max_occurrences:1,max_auto_effects:10,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:paid?SCHEDULE_KNOWLEDGE_ACK:null,request_id:randomUUID()})
          const queued=await api.runScheduleNow(schedule.id,grant.revision),priorCalls=queryCalls
          assert.equal((await new ScheduleRuntimeWorker(workerPool,"ci-scheduled-semantic",{allowKnowledgeExecution:true}).tick()).run_id,queued.run_id)
          for(let i=0;i<20;i++){
            await runtimeWorker.tick();const detail=await api.getWorkflowV2Run(queued.run_id)
            if(detail.run.status==="awaiting_approval"){assert.equal(paid,false);assert.equal(queryCalls,priorCalls);break}
            if(detail.run.status==="succeeded"){assert.equal(paid,true);break}
            assert.equal(["failed","paused"].includes(detail.run.status),false)
          }
          const detail=await api.getWorkflowV2Run(queued.run_id)
          assert.equal(detail.run.status,paid?"succeeded":"awaiting_approval");assert.equal(queryCalls,priorCalls+(paid?1:0))
          if(!paid)await api.cancelWorkflowV2Run(queued.run_id)
          await api.pauseSchedule(schedule.id,grant.revision)
        }
      },{handlerFactory:wire=>{
        const m=createWorkflowV2ModelInternalHandler({...wire,dispatch:dispatch.model}),t=createWorkflowV2ToolInternalHandler({...wire,dispatch:dispatch.tool})
        return (req,res)=>(req.url==="/__internal/v2/workflow-tool/dispatch"?t:m)(req,res)
      }})}finally{controller.abort();await loop}
      await admin.query("UPDATE agentstudio.knowledge_query_jobs SET expires_at=now()-interval '1 second' WHERE source_run_id=$1",[semanticRunId])
      assert.equal((await worker.tick()).status,"idle")
      const evidence=(await admin.query("SELECT query_text,result_refs,execution_evidence FROM agentstudio.knowledge_query_jobs WHERE source_run_id=$1",[semanticRunId])).rows[0]
      assert.equal(evidence.query_text,null);assert.equal(evidence.result_refs,null);assert.ok(evidence.execution_evidence)
      assert.equal((await api.getWorkflowV2Run(semanticRunId)).run.result_text,"approved-semantic-result")
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
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    const singleHidden=await api.getRun(singleShared.run.id)
    assert.equal(singleHidden.run.knowledge_outputs_available,false);assert.equal(singleHidden.run.result_text,"")
    assert.ok(singleHidden.steps.every(step=>Object.keys(step.metadata).length===0))
    const lineageHidden=await api.getWorkflowV2Run(lineageRunId)
    assert.equal(lineageHidden.knowledge_outputs_available,false);assert.equal(lineageHidden.run.instruction,"");assert.equal(lineageHidden.run.result_text,"");assert.equal(lineageHidden.pending_effect,null)
    await assert.rejects(api.getWorkflowV2Outputs(lineageRunId),e=>e.status===409)
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    assert.equal((await new WorkflowV2RunRepository(apiPool).get(reader,semanticRunId)).run.result_text,"")
    assert.equal((await new WorkflowV2RunRepository(apiPool).get(reader,keywordRunId)).knowledge_outputs_available,false)
    await assert.rejects(new WorkflowV2RunRepository(apiPool).outputHistory(reader,keywordRunId),e=>e.code==="knowledge_observations_unavailable")
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
    mark("workflow-private-model-and-tool-transports")
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
      try{debug.setActive(true);await debug.refresh();await debug.submit({workflowId:workflow.id,revision:2,nodeId:"model",samples:{input:"Synthetic {{literal}} node test",outputs:{},provenance:{kind:"manual"}}})
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
    const keywordRole=await new AgentSpecRepository(apiPool).create(owner,"CI keyword Agent role",safeAgentSpec({goal:"Synthetic keyword role",tools:["knowledge_search"],knowledge_base_ids:[sharedBase.id],
      model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"}}))
    for(const autonomous of [false,true])for(const selection of ["builtin","http","mcp","keyword"]){
    mark((autonomous?"autonomous":"workflow")+"-agent-"+selection)
    const custom=selection==="http",useMcp=selection==="mcp",keyword=selection==="keyword"
    let agentCalls=0,agentHttpCalls=0,agentMcpCalls=0,thirtyRounds=false,selectedScheduleSecret=null
    const fullTask="迁".repeat(1998)+"🚀"
    const selectedRole=keyword?keywordRole:useMcp?mcpRole:custom?httpRole:role
    const selectedFlow=selection!=="builtin"?await api.createWorkflowGraph("CI "+selection+" Agent Workflow",{...agentGraph,nodes:agentGraph.nodes.map(node=>node.type==="agent"?
      {...node,data:{...node.data,agent_binding:{spec_id:selectedRole.id,spec_revision:selectedRole.revision}}}:node)}):agentFlow
    const planning=async(material,prompt)=>{agentCalls++;assert.equal(material.api_key,selectedScheduleSecret??secret)
      const context=JSON.parse(prompt)
      if(thirtyRounds){
        assert.equal(context.max_rounds,30);assert.equal(context.task,fullTask)
        return context.round===30?'{"action":"answer","answer":"Synthetic thirty-round result"}':'{"action":"tool","tool":"calculate","params":{"expression":"2+2"}}'
      }
      if(custom){assert.equal(prompt.includes(toolSecret),false);assert.equal(prompt.includes(tool.id),false)}
      if(useMcp)for(const privateValue of [discovered.id,mcpInput.url,"SyntheticMcpHeaderNeverSent012345",managed.id,managedMetadata.url,smitherySecret])assert.equal(prompt.includes(privateValue),false)
      if(keyword&&context.round===1)return '{"action":"tool","tool":"knowledge_search","params":{"query":"cedar"}}'
      if(context.round===1)return JSON.stringify(custom||useMcp?{action:"tool",tool:useMcp?"mcp_lookup":"http_lookup",params:{query:"synthetic owner lookup"}}:{action:"tool",tool:"calculate",params:{expression:"2+2"}})
      assert.match(context.history[0].observation,keyword?/cedar/:/4/);return '{"action":"answer","answer":"Synthetic Agent result 4"}'
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
      const suffix=selection==="builtin"?"":"-"+selection
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
      if(keyword){
        const proof=(await admin.query("SELECT result_refs,execution_source FROM agentstudio.knowledge_keyword_observations WHERE run_id=$1",[run.run.id])).rows
        assert.equal(proof.length,1);assert.equal(proof[0].result_refs.length,1);assert.ok(proof[0].execution_source.parent_step_key)
        assert.equal(proof[0].execution_source.execution_mode,autonomous?"agent_native_v2":"workflow_native_v2")
        assert.equal(detail.knowledge_outputs_available,true)
      }
      ui?.dispose()
      // Scheduled runs use genuine owner standing consent, the restricted
      // Worker login and the SAME private identity/Broker transports.
      agentCalls=0;agentHttpCalls=0;agentMcpCalls=0
      const scheduled=await api.createScheduleDraft({name:"Scheduled "+selection+" "+(autonomous?"Agent":"Workflow"),kind:autonomous?"agent":"workflow",
        target_id:autonomous?selectedRole.id:selectedFlow.id,time_zone:"Asia/Shanghai",rule:{kind:"interval",interval_minutes:15}})
      const activationBody={expected_revision:scheduled.revision,expected_target_revision:1,instruction:"Synthetic scheduled Agent input",max_steps:autonomous?3:1,anchor_at:new Date().toISOString(),
        expires_at:null,max_occurrences:2,max_auto_effects:50,background_ack:SCHEDULE_BACKGROUND_ACK,knowledge_charge_ack:null,request_id:randomUUID()}
      let selectedScheduleModel
      if(autonomous&&selection==="builtin"){
        selectedScheduleSecret="SyntheticPg18OwnScheduleBKey"
        const draftB=await api.createModelConnection({name:"Schedule model B",provider:"openai",base_url:"https://api.openai.com/v1",api_key:selectedScheduleSecret,models:["gpt-4.1-mini"],enabled:true})
        selectedScheduleModel=await api.testModelConnection(draftB.id,draftB.revision)
        activationBody.model_binding={connection_id:selectedScheduleModel.id,connection_revision:selectedScheduleModel.revision,model_id:"gpt-4.1-mini"}
        await assert.rejects(api.activateSchedule(scheduled.id,{...activationBody,model_binding:{...activationBody.model_binding,connection_revision:selectedScheduleModel.revision+1}}),e=>e.status===409)
        await assert.rejects(api.activateSchedule(scheduled.id,{...activationBody,model_binding:{...activationBody.model_binding,connection_id:randomUUID()}}),e=>e.status===404)
      }
      if(!autonomous&&selection==="builtin"){
        activationBody.anchor_at=new Date(Date.now()+2*86400000).toISOString();activationBody.max_occurrences=3
      }
      if(!autonomous&&selection==="builtin"){
        const legacy=await api.createScheduleDraft({name:"Legacy quarantine",kind:"workflow",target_id:selectedFlow.id,time_zone:"UTC",rule:{kind:"interval",interval_minutes:15}})
        await admin.query("UPDATE agentstudio.schedules SET recurrence=jsonb_set(recurrence,'{config_format}','\"legacy_schedule_import_v1\"'::jsonb) WHERE id=$1",[legacy.id])
        await assert.rejects(api.activateSchedule(legacy.id,{...activationBody,expected_revision:legacy.revision,request_id:randomUUID()}),e=>e.status===409)
        await assert.rejects(api.updateScheduleDraft(legacy.id,legacy.revision,{name:"Do not convert legacy",kind:"workflow",target_id:selectedFlow.id,time_zone:"UTC",rule:{kind:"daily",local_time:"09:00"}}),e=>e.status===409)
        await assert.rejects(api.deleteScheduleDraft(legacy.id,legacy.revision),e=>e.status===409)
        assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_authorities WHERE schedule_id=$1",[legacy.id])).rows[0].n,0)
        await api.pauseSchedule(legacy.id,legacy.revision)
      }
      const grant=await api.activateSchedule(scheduled.id,activationBody);assert.equal((await api.activateSchedule(scheduled.id,activationBody)).replayed,true)
      if(selectedScheduleModel){await admin.query("UPDATE agentstudio.model_connections SET enabled=false WHERE id=$1",[ready.id]);assert.equal((await api.getScheduleExecution(scheduled.id)).source_current,true)}
      if(!autonomous&&selection==="builtin"){
        assert.equal((await api.getScheduleExecution(scheduled.id)).execution.anchor_at,activationBody.anchor_at)
        assert.equal((await new ScheduleRuntimeWorker(workerPool,"schedule-future").tick()).status,"idle")
      }
      const races=await Promise.allSettled([api.runScheduleNow(scheduled.id,grant.revision),api.runScheduleNow(scheduled.id,grant.revision)])
      assert.equal(races.filter(r=>r.status==="fulfilled").length,1);assert.equal(races.filter(r=>r.status==="rejected"&&r.reason.status===409).length,1)
      const queue=races.find(r=>r.status==="fulfilled").value
      let launches
      if(!autonomous&&selection==="builtin"){
        const db=await workerPool.connect();let claim
        try{
          await db.query("BEGIN");await db.query("SET LOCAL ROLE agentstudio_worker")
          const due=(await admin.query("SELECT scheduled_for FROM agentstudio.schedule_occurrences WHERE id=$1",[queue.occurrence_id])).rows[0].scheduled_for
          claim=(await db.query("SELECT agentstudio.schedule_reserve($1::uuid,$2::bigint,$3::timestamptz,NULL,'schedule-reserved') AS claim",[scheduled.id,grant.revision,due])).rows[0].claim
          await db.query("COMMIT")
        }catch(error){await db.query("ROLLBACK");throw error}finally{db.release()}
        assert.equal(claim.occurrence_id,queue.occurrence_id)
        await admin.query("UPDATE agentstudio.schedules SET next_at=date_trunc('milliseconds',clock_timestamp())-interval '2 seconds' WHERE id=$1",[scheduled.id])
        const contenders=await Promise.all([new ScheduleRuntimeWorker(workerPool,"schedule-before-run-a").tick(),new ScheduleRuntimeWorker(workerPool,"schedule-before-run-b").tick()])
        assert.equal(contenders.filter(r=>r.status==="skipped_overlap").length,1);assert.equal(contenders.some(r=>r.status==="started"),false)
        assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.runs WHERE id=$1",[queue.run_id])).rows[0].n,0)
        const reserved=new ScheduleRuntimeWorker(workerPool,"schedule-reserved",{allowMcpExecution:true,allowKnowledgeExecution:true})
        launches=await Promise.all([reserved.launch(claim),reserved.launch(claim)])
      }else launches=await Promise.all([new ScheduleRuntimeWorker(workerPool,"schedule-race-a",{allowMcpExecution:true,allowKnowledgeExecution:true}).tick(),new ScheduleRuntimeWorker(workerPool,"schedule-race-b",{allowMcpExecution:true,allowKnowledgeExecution:true}).tick()])
      assert.equal(launches.filter(r=>r.status==="started").length,1);assert.equal(launches.find(r=>r.status==="started").run_id,queue.run_id)
      if(!autonomous&&selection==="builtin"){
        // Native recurrence instants are ISO milliseconds; avoid injecting a
        // sub-millisecond SQL clock value that the JS driver cannot retain.
        await admin.query("UPDATE agentstudio.schedules SET next_at=date_trunc('milliseconds',clock_timestamp())-interval '1 second' WHERE id=$1",[scheduled.id])
        assert.equal((await new ScheduleRuntimeWorker(workerPool,"schedule-overlap").tick()).status,"skipped_overlap")
        const history=await api.listScheduleOccurrences(scheduled.id)
        assert.equal(history.some(row=>row.status==="skipped_overlap"&&row.error_code==="previous_run_incomplete"&&row.run_id===null),true)
        assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_origins x JOIN agentstudio.schedule_occurrences o ON o.id=x.occurrence_id WHERE o.schedule_id=$1",[scheduled.id])).rows[0].n,1)
      }
      let manualApprovals=0
      for(let i=0;i<25;i++){
        await new WorkflowV2Worker(workerPool,"ci-scheduled-"+i,{agentExecutionApproved:true,scheduleExecutionApproved:true,executor,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"}).tick()
        const view=await get(queue.run_id)
        if(view.run.status==="succeeded")break
        if(view.run.status==="awaiting_approval"){
          manualApprovals++;assert.equal(custom||useMcp,true);assert.equal(view.pending_effect.kind,"tool")
          if(autonomous)await api.decideAutonomousAgentNode(queue.run_id,"approved",view.pending_effect.step_key,view.pending_effect.input_sha256)
          else await api.decideWorkflowV2Node(queue.run_id,"approved",view.pending_effect.step_key,view.pending_effect.input_sha256)
        }else assert.equal(["failed","paused","cancelled"].includes(view.run.status),false)
      }
      const scheduledDone=await get(queue.run_id);assert.equal(scheduledDone.run.status,"succeeded");assert.equal(agentCalls,2);assert.equal(manualApprovals,custom||useMcp?1:0)
      assert.equal((await api.listScheduleOccurrences(scheduled.id)).find(row=>row.run_id===queue.run_id).status,"succeeded")
      assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.schedule_execution_origins WHERE run_id=$1",[queue.run_id])).rows[0].n,1)
      if(selectedScheduleModel){
        await admin.query("UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1",[selectedScheduleModel.id])
        assert.equal((await api.getScheduleExecution(scheduled.id)).source_current,false)
        assert.equal((await api.activateSchedule(scheduled.id,activationBody)).replayed,true)
        assert.equal((await api.getScheduleExecution(scheduled.id)).source_current,false)
        await admin.query("UPDATE agentstudio.model_connections SET enabled=true WHERE id=$1",[ready.id]);selectedScheduleSecret=null
      }
      await api.pauseSchedule(scheduled.id,grant.revision)
      assert.equal((await get(queue.run_id)).run.result_text,"Synthetic Agent result 4")
      if(selection==="builtin"){
        thirtyRounds=true;agentCalls=0
        const graph30={...agentGraph,nodes:agentGraph.nodes.map(node=>node.type==="agent"?{...node,data:{...node.data,max_steps:30}}:node)}
        const flow30=autonomous?null:await api.createWorkflowGraph("Thirty round PG18 Workflow",graph30)
        const long=autonomous?await api.submitAutonomousAgentRun(selectedRole.id,1,fullTask,"ci-thirty-round-native-agent",30):
          await api.submitWorkflowV2Run(flow30.id,flow30.revision,fullTask,"ci-thirty-round-workflow-agent")
        let decisions=0
        for(let i=0;i<180;i++){
          await new WorkflowV2Worker(workerPool,"ci-thirty-"+i,{agentExecutionApproved:true,executor,executionMode:autonomous?"agent_native_v2":"workflow_native_v2"}).tick()
          const current=await get(long.run.id)
          if(current.run.status==="succeeded")break
          assert.equal(["failed","paused","cancelled"].includes(current.run.status),false)
          if(current.run.status==="awaiting_approval"){
            decisions++
            if(autonomous)await api.decideAutonomousAgentNode(long.run.id,"approved",current.pending_effect.step_key,current.pending_effect.input_sha256)
            else await api.decideWorkflowV2Node(long.run.id,"approved",current.pending_effect.step_key,current.pending_effect.input_sha256)
          }
        }
        const done30=await get(long.run.id)
        assert.equal(done30.run.status,"succeeded");assert.equal(done30.run.result_text,"Synthetic thirty-round result")
        assert.equal(done30.run.instruction,fullTask)
        assert.equal(agentCalls,30);assert.equal(decisions,60);assert.equal(done30.steps.some(step=>step.metadata.agent_round===30),true)
        const paid=(await admin.query("SELECT count(*)::int AS n,bool_and(status='succeeded') AS settled FROM agentstudio.external_effects WHERE run_id=$1",[long.run.id])).rows[0]
        assert.equal(paid.n,119);assert.equal(paid.settled,true)
      }
    },{handlerFactory:handlers})
    }
    const rotated=await api.saveSmitheryKey(smitherySecret+"rotated",1,randomUUID())
    assert.equal(rotated.revision,2);assert.equal((await api.getMcpConnection(managed.id)).enabled,false)
    await assert.rejects(api.submitAutonomousAgentRun(mcpRole.id,1,"Stale managed binding","ci-reject-rotated-managed-mcp",3),error=>error.status===409)
    const toRevoke=await api.getSmitheryConnection(managed.id),revoked=await api.operateSmithery(managed.id,toRevoke.revision,"revoke")
    assert.equal(revoked.state,"revoked");assert.equal((await api.removeSmitheryKey(2,randomUUID())).has_key,false)
    const descriptive={goal:"目".repeat(2998)+"🚀",task_scope:"域".repeat(4000),deliverables:Array(30).fill("交".repeat(500)),task_plan:Array(30).fill("计".repeat(500)),done_criteria:Array(30).fill("成".repeat(500))}
    mark("full-descriptive-role-private-tls")
    const fullConnection=await api.createModelConnection({name:"Full role SQL transport",provider:"openai",base_url:"https://api.openai.com/v1",api_key:secret,models:["gpt-4.1-mini"],enabled:true})
    const fullReady=await api.testModelConnection(fullConnection.id,fullConnection.revision)
    const fullRole=await new AgentSpecRepository(apiPool).create(owner,"Full descriptive role",safeAgentSpec({...descriptive,
      model_binding:{connection_id:fullReady.id,connection_revision:fullReady.revision,model_id:"gpt-4.1-mini"}}))
    let fullRoleCalls=0
    const fullDispatch=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error("direct fallback forbidden")},brokerPool,{allowAutonomousExecution:true,
      agentExecutor:async(material,prompt)=>{fullRoleCalls++;assert.equal(material.api_key,secret);const parsed=JSON.parse(prompt)
        for(const field of Object.keys(descriptive))assert.deepEqual(parsed.role[field],descriptive[field])
        assert.ok(prompt.length<131072);return '{"action":"answer","answer":"Complete role retained over private TLS"}'}})
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),fullDispatch),async raw=>{
      const executor=workflowV2ModelEffectExecutor({...raw,executionMode:"agent_native_v2"})
      const queued=await api.submitAutonomousAgentRun(fullRole.id,fullRole.revision,"Retain the complete role","ci-full-role-limits",1)
      for(let i=0;i<16;i++){
        await new WorkflowV2Worker(workerPool,"ci-full-role-"+i,{agentExecutionApproved:true,executor,executionMode:"agent_native_v2"}).tick()
        const detail=await api.getAutonomousAgentRun(queued.run.id)
        if(detail.run.status==="succeeded")break
        assert.equal(["failed","paused","cancelled"].includes(detail.run.status),false,detail.run.last_error_code)
        if(detail.run.status==="awaiting_approval")await api.decideAutonomousAgentNode(queued.run.id,"approved",detail.pending_effect.step_key,detail.pending_effect.input_sha256)
      }
      assert.equal((await api.getAutonomousAgentRun(queued.run.id)).run.status,"succeeded");assert.equal(fullRoleCalls,1)
    },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:"agent_native_v2"})})
    // Genuine SQL roles + HTTPS Cookie/CSRF: collaboration grants safe text,
    // never owner execution authority or private model/knowledge bindings.
    const collaboration=await api.createAgent("Genuine PG18 collaborative role","Original owner goal")
    mark("collaboration-safe-review-and-restoration")
    const grantChoice={action:"grant",request_id:randomUUID(),recipient_email:"other@example.com",role:"editor",expected_access_revision:0}
    const access=await api.changeAgentCollaboration(collaboration.id,grantChoice)
    assert.equal(access.revision,1)
    assert.equal((await api.confirmAgentCollaboration(collaboration.id,grantChoice)).replayed,true)
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    const sharedRole=await api.getAgentCollaboration(collaboration.id)
    assert.equal(sharedRole.role,"editor");assert.deepEqual(sharedRole.grants,[])
    await assert.rejects(api.getAgent(collaboration.id),e=>e.status===404)
    await assert.rejects(api.submitAutonomousAgentRun(collaboration.id,1,"No delegated execution","ci-shared-execution-denied",1),e=>e.status===404)
    const proposalChoice={action:"propose",request_id:randomUUID(),expected_spec_revision:sharedRole.revision,source_sha256:sharedRole.source_sha256,
      proposed:{...sharedRole.safe,goal:"Reviewed editor wording",task_plan:["Retain the complete task plan"]},comment:"Explain a safe descriptive improvement"}
    await api.changeAgentCollaboration(collaboration.id,proposalChoice)
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
    const reviewSource=await api.getAgentCollaboration(collaboration.id),proposal=reviewSource.proposals.find(p=>p.status==="pending")
    const reviewChoice={action:"review",request_id:randomUUID(),expected_spec_revision:reviewSource.revision,source_sha256:reviewSource.source_sha256,
      proposal_id:proposal.id,proposal_sha256:proposal.proposal_sha256,decision:"accept",confirm:true}
    assert.equal((await api.changeAgentCollaboration(collaboration.id,reviewChoice)).status,"accepted")
    assert.equal((await api.changeAgentCollaboration(collaboration.id,reviewChoice)).replayed,true)
    const acceptedSource=await api.getAgentCollaboration(collaboration.id)
    const versions=await api.getAgentCollaborationRevisions(collaboration.id),beforeAccept=versions.find(v=>v.kind==="before_accept")
    const restored=await api.changeAgentCollaboration(collaboration.id,{action:"restore",request_id:randomUUID(),expected_spec_revision:acceptedSource.revision,
      source_sha256:acceptedSource.source_sha256,revision_id:beforeAccept.id,reason:"Restore the original reviewed wording",confirm:true})
    assert.equal(restored.revision,acceptedSource.revision+1)
    assert.equal((await api.getAgentCollaboration(collaboration.id)).safe.goal,"Original owner goal")
    await api.changeAgentCollaboration(collaboration.id,{action:"revoke",request_id:randomUUID(),recipient_id:access.recipient_id,expected_access_revision:access.revision})
    assert.equal((await api.changeAgentCollaboration(collaboration.id,grantChoice)).replayed,true)
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(api.getAgentCollaboration(collaboration.id),e=>e.status===404)
    mark("completed")
  }catch(error){
    process.stderr.write("PG18_SYNTHETIC_FAILURE "+phase+" "+(typeof error?.code==="string"?error.code:"test_failure")+"\n")
    throw error
  }finally{
    if(front)await front.close()
    await Promise.all(pools.map(pool=>pool.end()));await admin.end();key.fill(0)
  }
})
