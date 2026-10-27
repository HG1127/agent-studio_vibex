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
import {createPgNativeFeedbackSession} from "../../../src/lib/pgNativeAgentFeedbackSession.ts"
import {createPgNativeWorkflowRunSession,workflowApprovalReady} from "../../../src/lib/pgNativeWorkflowRunSession.ts"
import {createPgNativeWorkflowDebugSession} from "../../../src/lib/pgNativeWorkflowDebugSession.ts"
import {createHandler} from "../src/http.ts"
import {createNativeRunRepository} from "../src/native-run-repository.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {AgentCollaborationRepository} from "../src/agent-collaboration-repository.ts"
import {inspectAgentCollaborationSchema} from "../src/agent-collaboration-audit.ts"
import {AgentReleaseRepository} from "../src/agent-release-repository.ts"
import {AgentHumanInputRepository} from "../src/agent-human-input-repository.ts"
import {inspectAgentHumanInputSchema} from "../src/agent-human-input-audit.ts"
import {AgentMemoryRepository} from "../src/agent-memory-repository.ts"
import {verifyAgentMemoryCredentials,inspectAgentMemorySchema} from "../src/agent-memory-audit.ts"
import {inspectAgentMemoryContextSchema,verifyAgentMemoryContextCredentials} from "../src/agent-memory-context-audit.ts"
import {selectAgentMemoryRuntime,selectAgentDerivedMemoryWrites,selectAgentOutcomeMemoryWrites} from "../src/agent-memory-runtime-policy.ts"
import {AgentMemoryDerivedRepository} from "../src/agent-memory-derived-repository.ts"
import {inspectAgentMemoryDerivedSchema,verifyAgentMemoryDerivedCredentials} from "../src/agent-memory-derived-audit.ts"
import {AgentMemoryOutcomeRepository} from "../src/agent-memory-outcome-repository.ts"
import {inspectAgentMemoryOutcomeSchema,verifyAgentMemoryOutcomeCredentials} from "../src/agent-memory-outcome-audit.ts"
import {inspectAgentMemoryFailureSourceSchema,verifyAgentMemoryFailureSourceCredentials} from "../src/agent-memory-failure-source-audit.ts"
import {AgentFeedbackRepository} from "../src/agent-feedback-repository.ts"
import {AgentReviewSourceRepository} from "../src/agent-review-source.ts"
import {AgentOptimizationRepository} from "../src/agent-optimization-repository.ts"
import {inspectAgentOptimizationSchema,verifyAgentOptimizationCredentials} from "../src/agent-optimization-audit.ts"
import {inspectAgentFeedbackSchema,verifyAgentFeedbackCredentials} from "../src/agent-feedback-audit.ts"
import {inspectAgentReleaseSchema} from "../src/agent-release-audit.ts"
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
import {HttpError,safeAgentSpec} from "../src/contracts.ts"
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

async function startNativeHttps(auth,pool,key,brokerPool,{memory=true,memoryRuntime=false,derivedMemory=false,outcomeMemory=false,feedback=false,feedbackSubmission=false,feedbackLessons=false,optimization=false,optimizationAcceptance=false}={}){
  if(memory){assert.equal(await inspectAgentMemorySchema(pool),true);const context=await inspectAgentMemoryContextSchema(pool);if(memoryRuntime)assert.equal(context,true)}
  if(memoryRuntime){assert.equal(memory,true);assert.equal(selectAgentMemoryRuntime({AGENT_STUDIO_PG_AGENT_MEMORY_ENABLED:'true',AGENT_STUDIO_PG_AGENT_MEMORY_APPROVED:'APPROVE_DISPOSABLE_PG18_OWNER_MEMORY_ONLY'}),true)}
  if(derivedMemory){assert.equal(await inspectAgentMemoryDerivedSchema(pool),true);assert.equal(selectAgentDerivedMemoryWrites({AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_ENABLED:'true',AGENT_STUDIO_PG_AGENT_DERIVED_MEMORY_APPROVED:'APPROVE_DISPOSABLE_PG18_SOURCE_BOUND_MEMORY_ONLY'}),true)}
  if(outcomeMemory){assert.equal(derivedMemory,true);assert.equal(await inspectAgentMemoryOutcomeSchema(pool),true);assert.equal(selectAgentOutcomeMemoryWrites({AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED:"true",AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_OUTCOME_MEMORY_ONLY"}),true)}
  if(feedback)assert.equal(await inspectAgentFeedbackSchema(pool),true)
  if(optimization)assert.equal(await inspectAgentOptimizationSchema(pool),true)
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
      allowEmployeeProvisioning:true,allowConfigurationWrites:true,allowModelProbe:true,allowEmployeeGovernance:true,allowAgentHumanInput:true,
      allowAgentMemory:memory,allowAgentMemoryRuntime:memoryRuntime,
      allowAgentOptimization:optimization,allowAgentOptimizationAcceptance:optimizationAcceptance,
      allowAgentFeedback:feedback,allowAgentFeedbackSubmission:feedbackSubmission,allowAgentFeedbackLessons:feedbackLessons,
      allowAgentOutcomeMemory:outcomeMemory,allowAgentOutcomeMemoryAdmission:outcomeMemory,
      allowAgentDerivedMemory:derivedMemory,allowAgentDerivedMemoryWrites:derivedMemory,
      allowMcpDiscovery:true,allowMcpToolExecution:true,
      allowSmitheryManagement:true,
      allowKnowledgeSharing:true,
      allowKnowledgeEmbeddingSettings:true,
      allowKnowledgeEmbeddingConsent:true,
      allowKnowledgeIndexRuntime:true,
      allowKnowledgeQueryRuntime:true,
      allowKnowledgeToolExecution:true,
      allowRunSubmission:policy.runApprovalUat,allowBoundRunSubmission:policy.boundModelExecutionUat,
      allowWorkflowV2Submission:policy.workflowV2ExecutionUat,allowAutonomousAgentSubmission:policy.autonomousAgentUat,allowScheduleRuntime:true,allowAgentCollaboration:true,allowAgentReleases:true,
      businessHandler:(req,res)=>{
        const route=new URL(req.url,"https://localhost").pathname
        if(!permitNativePg18BusinessUatRequest(route,req.method,{...policy,agentDerivedMemoryUat:derivedMemory,agentOutcomeMemoryUat:outcomeMemory})){
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
      agentReleaseRepository:new AgentReleaseRepository(pool,{enabled:true,allowAcceptance:true,allowMcpExecution:true,allowKnowledgeExecution:true,allowHumanInput:true}),
      agentHumanInputRepository:new AgentHumanInputRepository(pool,"agent_native_v2",{allowResponses:true}),
      workflowHumanInputRepository:new AgentHumanInputRepository(pool,"workflow_native_v2",{allowResponses:true}),
      ...(memory?{agentMemoryRepository:new AgentMemoryRepository(pool,{allowWrites:true})}:{}),
      ...(optimization?{agentOptimizationRepository:new AgentOptimizationRepository(pool,{allowAcceptance:optimizationAcceptance})}:{}),
      ...(feedback?{agentFeedbackRepository:new AgentFeedbackRepository(pool,{allowSubmit:feedbackSubmission,allowLessonStorage:feedbackSubmission&&feedbackLessons})}:{}),
      ...(outcomeMemory?{agentOutcomeMemoryRepository:new AgentMemoryOutcomeRepository(pool)}:{}),
      ...(derivedMemory?{agentDerivedMemoryRepository:new AgentMemoryDerivedRepository(pool,{allowWrites:true})}:{}),
      knowledgeAccessRepository:new KnowledgeAccessRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),
      knowledgeContentRepository:new KnowledgeContentRepository(pool),
      knowledgeEmbeddingRepository:new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),
      knowledgeEmbeddingConsentRepository:new KnowledgeEmbeddingConsentRepository(pool),
      knowledgeIndexRepository:new KnowledgeIndexRepository(pool),
      knowledgeQueryRepository:new KnowledgeQueryRepository(pool),
      workflowRepository:new WorkflowRepository(pool),
      scheduleInventory:new ScheduleInventoryRepository(pool),scheduleDraftRepository:new ScheduleDraftRepository(pool),
      scheduleRuntimeRepository:new ScheduleRuntimeRepository(pool,{enabled:true,allowMcpExecution:true,allowKnowledgeExecution:true,allowHumanInput:true}),
      workflowV2RunRepository:new WorkflowV2RunRepository(pool,"workflow_native_v2",{allowMcpExecution:true,allowKnowledgeExecution:true,allowHumanInput:true}),autonomousAgentRunRepository:new AutonomousAgentRunRepository(pool,{allowMcpExecution:true,allowKnowledgeExecution:true,allowHumanInput:true,allowMemory:memoryRuntime,allowOutcomeMemory:outcomeMemory}),
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
    const session={cookie:""}
    const transportFor=jar=>(route,init={})=>new Promise((resolve,reject)=>{
      const body=init.body?Buffer.from(init.body):null
      const req=request({hostname:"127.0.0.1",servername:"localhost",port,
        path:route.replace(/^\/__pg_native(?=\/|$)/,""),method:init.method??"GET",
        ca,rejectUnauthorized:true,agent:false,timeout:10000,signal:AbortSignal.timeout(20000),
        headers:{...init.headers,...(body?{"content-length":String(body.length)}:{}),
          ...(jar.cookie?{Cookie:jar.cookie}:{}),...(init.method&&init.method!=="GET"?{Origin:origin}:{})}},res=>{
        const chunks=[];let bytes=0
        // Pending review can contain both the full bounded role snapshot and
        // its model prompt. Overflow and incomplete streams must reject,
        // otherwise destroying the response silently leaves this test waiting.
        res.on("data",chunk=>{bytes+=chunk.length;if(bytes>1048576){reject(Error("ci_https_response_limit"));res.destroy()}else chunks.push(chunk)})
        res.once("aborted",()=>reject(Error("ci_https_response_aborted")))
        res.once("close",()=>{if(!res.complete)reject(Error("ci_https_response_incomplete"))})
        res.on("error",reject)
        res.on("end",()=>{
          const saved=res.headers["set-cookie"]?.[0]
          if(saved){assert.match(saved,/HttpOnly/i);assert.match(saved,/Secure/i);jar.cookie=saved.split(";")[0]}
          resolve(new Response(Buffer.concat(chunks),{status:res.statusCode}))
        })
      })
      req.on("timeout",()=>req.destroy(Error("ci_https_timeout")))
      req.on("error",reject);req.end(body??undefined)
    })
    return {request:transportFor(session),api:createPgNativePilotApi(transportFor(session)),captureApi(){return createPgNativePilotApi(transportFor({cookie:session.cookie}))},async close(){
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
      assert.equal(initialized.migration_versions,36);assert.equal(initialized.service_logins_enabled,false)
      assert.equal(initialized.tables,62);assert.equal(initialized.forced_rls_tables,61);assert.equal(initialized.memory_privileges_verified,true)
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
    assert.equal(await inspectAgentReleaseSchema(apiPool),true)
    assert.equal(await inspectAgentReleaseSchema(workerPool),true)
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
    assert.equal(capabilities.agent_human_input_available,true)
    assert.equal(capabilities.agent_human_responses_enabled,true)
    assert.equal(await inspectAgentHumanInputSchema(apiPool),true)
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
    const foreignSessionApi=front.captureApi()
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
    mark("full-role-connection-ready")
    const fullRole=await new AgentSpecRepository(apiPool).create(owner,"Full descriptive role",safeAgentSpec({...descriptive,
      model_binding:{connection_id:fullReady.id,connection_revision:fullReady.revision,model_id:"gpt-4.1-mini"}}))
    mark("full-role-created")
    let fullRoleCalls=0
    const fullDispatch=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error("direct fallback forbidden")},brokerPool,{allowAutonomousExecution:true,
      agentExecutor:async(material,prompt)=>{fullRoleCalls++;assert.equal(material.api_key,secret);const parsed=JSON.parse(prompt)
        for(const field of Object.keys(descriptive))assert.deepEqual(parsed.role[field],descriptive[field])
        assert.ok(prompt.length<131072);return '{"action":"answer","answer":"Complete role retained over private TLS"}'}})
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),fullDispatch),async raw=>{
      const executor=workflowV2ModelEffectExecutor({...raw,executionMode:"agent_native_v2"})
      const queued=await api.submitAutonomousAgentRun(fullRole.id,fullRole.revision,"Retain the complete role","ci-full-role-limits",1)
      mark("full-role-queued")
      for(let i=0;i<16;i++){
        await new WorkflowV2Worker(workerPool,"ci-full-role-"+i,{agentExecutionApproved:true,executor,executionMode:"agent_native_v2"}).tick()
        mark("full-role-tick-"+i)
        const detail=await api.getAutonomousAgentRun(queued.run.id)
        if(detail.run.status==="succeeded")break
        assert.equal(["failed","paused","cancelled"].includes(detail.run.status),false,detail.run.last_error_code)
        if(detail.run.status==="awaiting_approval")await api.decideAutonomousAgentNode(queued.run.id,"approved",detail.pending_effect.step_key,detail.pending_effect.input_sha256)
      }
      assert.equal((await api.getAutonomousAgentRun(queued.run.id)).run.status,"succeeded");assert.equal(fullRoleCalls,1)
    },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:"agent_native_v2"})})
    mark("complete-configuration-versions-and-acceptance")
    const releaseSource=await api.getAgentReleases(fullRole.id),releaseSave={action:"snapshot",request_id:randomUUID(),expected_spec_revision:releaseSource.spec_revision,
      source_sha256:releaseSource.source_sha256,note:"Complete native role over genuine PG18",test_run_id:null}
    const releaseOne=await api.changeAgentRelease(fullRole.id,releaseSave),releaseDetail=await api.getAgentReleaseVersion(fullRole.id,releaseOne.version_id)
    assert.deepEqual(releaseDetail.spec_snapshot,fullRole.spec)
    await withActor(apiPool,owner,db=>db.query("UPDATE agentstudio.agent_specs SET name='Temporary owner configuration',spec=jsonb_set(spec,'{goal}',to_jsonb('Temporary owner wording'::text)),revision=revision+1,updated_at=clock_timestamp() WHERE id=$1::uuid AND owner_user_id=agentstudio.actor_id()",[fullRole.id]))
    const restoreSource=await api.getAgentReleases(fullRole.id),restoreChoice={action:"restore",request_id:randomUUID(),expected_spec_revision:restoreSource.spec_revision,
      source_sha256:restoreSource.source_sha256,version_id:releaseDetail.id,version_sha256:releaseDetail.version_sha256,expected_version_revision:releaseDetail.revision,
      confirm:true,reason:"Restore the exact complete owner configuration and bindings"}
    const fullRestored=await api.changeAgentRelease(fullRole.id,restoreChoice)
    assert.equal(fullRestored.spec_revision,restoreSource.spec_revision+1)
    assert.deepEqual((await api.getAgent(fullRole.id)).spec,fullRole.spec)
    assert.equal((await api.changeAgentRelease(fullRole.id,restoreChoice)).spec_revision,fullRestored.spec_revision)
    const acceptanceSource=await api.getAgentReleases(fullRole.id),acceptanceChoice={action:"acceptance",request_id:randomUUID(),expected_spec_revision:acceptanceSource.spec_revision,
      source_sha256:acceptanceSource.source_sha256,instruction:"Accept the complete restored native role",max_steps:1,model_binding:null,confirm:true}
    const acceptedRun=await api.changeAgentRelease(fullRole.id,acceptanceChoice)
    assert.equal((await api.confirmAgentRelease(fullRole.id,acceptanceChoice)).run_id,acceptedRun.run_id)
    const beforeAcceptanceCalls=fullRoleCalls
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),fullDispatch),async raw=>{
      const executor=workflowV2ModelEffectExecutor({...raw,executionMode:"agent_native_v2"})
      for(let i=0;i<16;i++){
        await new WorkflowV2Worker(workerPool,"ci-version-acceptance-"+i,{agentExecutionApproved:true,executor,executionMode:"agent_native_v2"}).tick()
        const detail=await api.getAutonomousAgentRun(acceptedRun.run_id)
        if(detail.run.status==="succeeded")break
        assert.equal(["failed","paused","cancelled"].includes(detail.run.status),false,detail.run.last_error_code)
        if(detail.run.status==="awaiting_approval")await api.decideAutonomousAgentNode(acceptedRun.run_id,"approved",detail.pending_effect.step_key,detail.pending_effect.input_sha256)
      }
      assert.equal((await api.getAutonomousAgentRun(acceptedRun.run_id)).run.status,"succeeded")
    },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:"agent_native_v2"})})
    assert.equal(fullRoleCalls,beforeAcceptanceCalls+1)
    assert.equal((await api.getAgentReleaseAcceptance(fullRole.id,acceptedRun.run_id)).test_current,true)
    const testedVersion=await api.changeAgentRelease(fullRole.id,{action:"snapshot",request_id:randomUUID(),expected_spec_revision:acceptanceSource.spec_revision,
      source_sha256:acceptanceSource.source_sha256,note:"Genuine native acceptance passed",test_run_id:acceptedRun.run_id})
    assert.equal(testedVersion.test_passed,true)
    const testedDetail=await api.getAgentReleaseVersion(fullRole.id,testedVersion.version_id),publishSource=await api.getAgentReleases(fullRole.id)
    assert.equal(testedDetail.test_current,true)
    const published=await api.changeAgentRelease(fullRole.id,{action:"publish",request_id:randomUUID(),expected_spec_revision:publishSource.spec_revision,
      source_sha256:publishSource.source_sha256,version_id:testedDetail.id,version_sha256:testedDetail.version_sha256,expected_version_revision:testedDetail.revision,
      expected_release_revision:publishSource.release_revision,confirm:true,acknowledge_untested:false})
    assert.equal(published.status,"published")
    assert.equal((await api.changeAgentRelease(fullRole.id,{action:"delete_draft",request_id:randomUUID(),version_id:releaseDetail.id,version_sha256:releaseDetail.version_sha256,
      expected_version_revision:releaseDetail.revision,confirm:true})).status,"deleted")
    assert.equal((await api.confirmAgentRelease(fullRole.id,releaseSave)).version_id,releaseOne.version_id)
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(api.getAgentReleases(fullRole.id),e=>e.status===404)
    await assert.rejects(api.getAgentReleaseVersion(fullRole.id,testedDetail.id),e=>e.status===404)
    await api.login("admin@example.com","SyntheticAdminPassword#2026")
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
    mark("owner-human-clarification-plan-review-and-complete-delivery")
    const humanBase=await api.createAgent("Genuine PG18 owner-reviewed Agent","Synthetic human-reviewed report")
    const humanBound=await api.bindAgentModel(humanBase.id,humanBase.revision,{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"})
    const humanRole=await api.updateAgentPlanReview(humanBound.id,humanBound.revision,true)
    const humanRun=await api.submitAutonomousAgentRun(humanRole.id,humanRole.revision,"Clarify and deliver a complete report","ci-human-clarification-pg18",2,false)
    let activeHumanRun=humanRun.run.id
    let humanCalls=0
    const completeReport="已核对本人批准的方案与原始来源，交付完整合成报告。\n".repeat(300)
    assert.ok(completeReport.length>4000&&completeReport.length<11000)
    const humanDispatch=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error("human_direct_model_fallback_forbidden")},brokerPool,{allowAutonomousExecution:true,agentExecutor:async(material,prompt)=>{
      assert.equal(material.api_key,secret);const plan=JSON.parse(prompt);humanCalls++
      if(!plan.human_input.require_plan_review)return JSON.stringify(plan.round===1?{action:"ask_user",question:"Which synthetic deadline should I use?",note:"PRIVATE_GENUINE_HUMAN_NOTE"}:{action:"answer",answer:completeReport})
      return JSON.stringify(plan.round===1?{action:"answer",answer:"First owner review draft"}:plan.round===2?{action:"answer",answer:"Revised owner review draft"}:{action:"answer",answer:completeReport})
    }})
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),humanDispatch),async raw=>{
      const executor=workflowV2ModelEffectExecutor({...raw,executionMode:"agent_native_v2"})
      const worker=()=>new WorkflowV2Worker(workerPool,"ci-human-"+randomUUID(),{agentExecutionApproved:true,humanInputApproved:true,executor,executionMode:"agent_native_v2"})
      const wait=async wanted=>{for(let i=0;i<24;i++){
        const detail=await api.getAutonomousAgentRun(activeHumanRun)
        if(detail.run.status===wanted)return detail
        assert.equal(["failed","paused","cancelled","succeeded"].includes(detail.run.status),false,detail.run.last_error_code)
        if(detail.run.status==="awaiting_approval")await api.decideAutonomousAgentNode(activeHumanRun,"approved",detail.pending_effect.step_key,detail.pending_effect.input_sha256)
        await worker().tick()
      }throw Error("genuine_human_transition_limit")}
      let pending=await wait("awaiting_input");assert.equal(humanCalls,1);assert.equal(pending.human_input.kind,"clarification")
      assert.equal(JSON.stringify(pending).includes("PRIVATE_GENUINE_HUMAN_NOTE"),false)
      const choice=(detail,decision,answer)=>({request_id:randomUUID(),pending_step_key:detail.human_input.pending_step_key,pending_sha256:detail.human_input.pending_sha256,source_sha256:detail.human_input.source_sha256,decision,answer,confirm:true})
      const reply=choice(pending,"reply","Synthetic deadline: 2030-01-31")
      // Reuse an independently captured, genuinely logged-in foreign Cookie.
      // Repeated scenario sign-ins must not exhaust the real login limiter.
      await assert.rejects(foreignSessionApi.respondAutonomousAgent(humanRun.run.id,reply),e=>e.status===404)
      await assert.rejects(foreignSessionApi.getAutonomousAgentHumanHistory(humanRun.run.id),e=>e.status===404)
      assert.equal((await api.respondAutonomousAgent(humanRun.run.id,reply)).recorded,true)
      assert.equal((await api.confirmAutonomousAgentResponse(humanRun.run.id,reply)).replayed,true)
      assert.equal((await worker().tick()).status,"awaiting_approval");assert.equal(humanCalls,1)
      const clarified=await wait("succeeded");assert.equal(clarified.run.result_text,completeReport);assert.equal(humanCalls,2)
      assert.deepEqual((await api.getAutonomousAgentHumanHistory(humanRun.run.id)).items.map(item=>item.decision),["reply"])
      // The role still requires a plan by default. This independent run uses
      // that default; opting out above did not change its persisted setting.
      const planRun=await api.submitAutonomousAgentRun(humanRole.id,humanRole.revision,"Review, revise and deliver a complete report","ci-human-reviewed-pg18",3)
      activeHumanRun=planRun.run.id
      pending=await wait("awaiting_input");assert.equal(pending.human_input.kind,"plan_review");assert.equal(pending.human_input.draft,"First owner review draft")
      await api.respondAutonomousAgent(activeHumanRun,choice(pending,"revise","Only include verified synthetic evidence."))
      pending=await wait("awaiting_input");assert.equal(pending.human_input.draft,"Revised owner review draft")
      await api.respondAutonomousAgent(activeHumanRun,choice(pending,"approve",""))
      const done=await wait("succeeded");assert.equal(done.run.result_text,completeReport);assert.equal(done.human_input_evidence_current,true);assert.equal(humanCalls,5)
      const history=await api.getAutonomousAgentHumanHistory(activeHumanRun,"",1)
      assert.equal(history.items.length,1);assert.ok(history.next_after)
      assert.deepEqual([...history.items,...(await api.getAutonomousAgentHumanHistory(activeHumanRun,history.next_after,1)).items].map(item=>item.decision),["revise","approve"])
      const ledger=(await admin.query("SELECT count(*)::integer AS n FROM agentstudio.agent_human_input_responses WHERE run_id=ANY($1::uuid[])",[[humanRun.run.id,activeHumanRun]])).rows[0]
      assert.equal(ledger.n,3);assert.equal((await worker().tick()).status,"idle");assert.equal(humanCalls,5)
    },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:"agent_native_v2"})})
    mark("workflow-complete-final-output-with-bounded-private-effect")
    const finalGraph={version:2,nodes:[
      {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"report",type:"model",data:{title:"Report",prompt:"Create a bounded synthetic report",model_binding:{connection_id:ready.id,connection_revision:ready.revision,model_id:"gpt-4.1-mini"}},position:{x:220,y:0}},
      {id:"end",type:"end",data:{title:"End",output_template:"{{Report.output}}".repeat(6)},position:{x:440,y:0}}],
      edges:[{id:"s-r",source:"start",target:"report"},{id:"r-e",source:"report",target:"end"}]}
    const finalFlow=await api.createWorkflowGraph("Complete final Workflow",finalGraph),finalKey="ci-workflow-complete-final"
    const finalRun=await api.submitWorkflowV2Run(finalFlow.id,finalFlow.revision,"Synthetic complete final output",finalKey)
    let finalCalls=0
    const finalDispatch=new WorkflowV2ModelDispatch(apiPool,key,async material=>{assert.equal(material.api_key,secret);finalCalls++;return "交".repeat(4000)},brokerPool)
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),finalDispatch),async raw=>{
      const executor=workflowV2ModelEffectExecutor(raw)
      for(let i=0;i<16;i++){
        const view=await api.getWorkflowV2Run(finalRun.run.id)
        if(view.run.status==="succeeded")break
        assert.equal(["failed","paused","cancelled"].includes(view.run.status),false,view.run.last_error_code)
        if(view.run.status==="awaiting_approval")await api.decideWorkflowV2Node(finalRun.run.id,"approved",view.pending_effect.step_key,view.pending_effect.input_sha256)
        await new WorkflowV2Worker(workerPool,"ci-final-output-"+i,{executor}).tick()
      }
      const completed=await api.getWorkflowV2Run(finalRun.run.id);assert.equal(completed.run.status,"succeeded");assert.equal(completed.run.result_text,"交".repeat(20000));assert.equal(finalCalls,1)
      const replay=await api.submitWorkflowV2Run(finalFlow.id,finalFlow.revision,"Synthetic complete final output",finalKey);assert.equal(replay.replayed,true);assert.equal(replay.run.result_text,completed.run.result_text);assert.equal(finalCalls,1)
      const saved=(await admin.query("SELECT checkpoint->'machine'->>'output_protocol' AS protocol FROM agentstudio.runs WHERE id=$1",[finalRun.run.id])).rows[0]
      assert.equal(saved.protocol,"workflow_final_delivery_v1")
      const effects=(await admin.query("SELECT tool_name,status,result_reference FROM agentstudio.external_effects WHERE run_id=$1",[finalRun.run.id])).rows
      assert.equal(effects.length,2);assert.equal(effects.every(effect=>effect.status==="succeeded"),true)
      assert.deepEqual(effects.map(effect=>effect.tool_name).sort(),["workflow.model_bound_dispatch","workflow:model"])
      assert.equal(effects.find(effect=>effect.tool_name==="workflow.model_bound_dispatch").result_reference,null)
      assert.equal(JSON.parse(effects.find(effect=>effect.tool_name==="workflow:model").result_reference).output.length,4000)
    },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler(raw)})
    mark("employee-governance-and-password-session-revocation")
    const governed=await api.createGovernedEmployee({email:"governance@example.test",password:"SyntheticGovernancePassword#2026",display_name:"Synthetic governance employee",is_admin:true,share_enabled:false})
    const governedLogin=await auth.login("governance@example.test","SyntheticGovernancePassword#2026")
    const governanceChoice={request_id:randomUUID(),target_id:governed.id,expected_revision:1,is_admin:false,enabled:false,share_enabled:false,confirm:true}
    assert.equal((await api.changeEmployee(governanceChoice)).revision,2)
    assert.equal((await api.confirmEmployeeChange(governanceChoice)).replayed,true)
    assert.equal(await auth.verifySession(governedLogin.token),null)
    assert.ok((await api.listEmployees()).some(e=>e.id===governed.id&&e.status==="disabled"&&e.revision===2))
    await assert.rejects(api.changeEmployee({...governanceChoice,request_id:randomUUID()}),e=>e.status===409)
    await api.changeEmployee({...governanceChoice,request_id:randomUUID(),expected_revision:2,enabled:true})
    assert.equal(await auth.verifySession(governedLogin.token),null)
    await api.login("governance@example.test","SyntheticGovernancePassword#2026")
    await assert.rejects(api.changeEmployee({...governanceChoice,request_id:randomUUID(),expected_revision:3}),e=>e.status===403)
    await api.changePassword("SyntheticGovernancePassword#2026","ChangedSyntheticGovernancePassword#2026")
    await assert.rejects(api.me(),e=>e.status===401)
    await api.login("governance@example.test","ChangedSyntheticGovernancePassword#2026")
    assert.equal((await api.me()).id,governed.id)
    mark("collaboration-revoked-final-isolation")
    await api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(api.getAgentCollaboration(collaboration.id),e=>e.status===404)
    mark("fresh-memory-049-native-https-owner-and-erasure")
    // Fresh050 must have installed both schemas in the original transaction.
    assert.equal((await admin.query("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_049') AS ok")).rows[0].ok,true)
    const beforeMemory=(await admin.query("SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects")).rows[0]
    await front.close();front=null
    front=await startNativeHttps(auth,apiPool,key,brokerPool,{memory:true})
    await front.api.login("admin@example.com","SyntheticAdminPassword#2026")
    const ownerMemory=front.captureApi(),memoryRole=await ownerMemory.getAgent(humanRole.id)
    assert.equal((await ownerMemory.getConfigCapabilities()).agent_memory_available,true)
    assert.equal((await ownerMemory.getConfigCapabilities()).agent_memory_writes_enabled,true)
    const memorySession=await auth.login("admin@example.com","SyntheticAdminPassword#2026"),memoryIdentity=await auth.verifySession(memorySession.token)
    assert.ok(memoryIdentity)
    await withActor(apiPool,memoryIdentity,async db=>{assert.equal(await verifyAgentMemoryCredentials(db),true)})
    const memoryChoice={action:"remember",request_id:randomUUID(),spec_id:memoryRole.id,expected_revision:memoryRole.revision,fact:"财务".repeat(250),confirm:true}
    const memorySaved=await ownerMemory.changeAgentMemory(memoryChoice)
    assert.equal(memorySaved.replayed,false);assert.equal((await ownerMemory.confirmAgentMemory(memoryChoice)).replayed,true)
    const memoryItems=(await ownerMemory.listAgentMemories(memoryRole.id)).items
    assert.equal(memoryItems.length,1);assert.equal(memoryItems[0].fact,memoryChoice.fact)
    await front.api.login("other@example.com","SyntheticOtherPassword#2026")
    await assert.rejects(front.api.listAgentMemories(memoryRole.id),e=>e.status===404)
    await assert.rejects(front.api.confirmAgentMemory(memoryChoice),e=>e.status===404)
    const forgetMemory={action:"forget",request_id:randomUUID(),spec_id:memoryRole.id,memory_id:memorySaved.memory_id,expected_sha256:memorySaved.content_sha256,confirm:true}
    assert.equal((await ownerMemory.changeAgentMemory(forgetMemory)).recorded,true)
    assert.equal((await ownerMemory.confirmAgentMemory(forgetMemory)).replayed,true)
    assert.equal((await ownerMemory.changeAgentMemory(memoryChoice)).replayed,true)
    assert.equal((await ownerMemory.listAgentMemories(memoryRole.id)).items.length,0)
    assert.equal((await admin.query("SELECT count(*)::integer AS n FROM agentstudio.agent_memory_entries")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::integer AS n FROM agentstudio.agent_memory_receipts")).rows[0].n,2)
    const memorySql=new AgentMemoryRepository(apiPool)
    assert.equal((await memorySql.confirm(memoryIdentity,forgetMemory)).replayed,true)
    await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query("UPDATE agentstudio.agent_memory_receipts SET request_sha256=repeat('a',64)")),/permission denied/)
    const afterMemory=(await admin.query("SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects")).rows[0]
    assert.deepEqual(afterMemory,beforeMemory)
    mark("fresh-memory-050-startup-source-and-private-execution")
    assert.equal((await admin.query("SELECT EXISTS(SELECT 1 FROM agentstudio.schema_migrations WHERE version='pg_v9_050') AS ok")).rows[0].ok,true)
    assert.equal(await inspectAgentMemoryContextSchema(apiPool),true)
    assert.equal(await inspectAgentMemoryContextSchema(workerPool),true)
    await admin.query('BEGIN')
    try{await admin.query('GRANT UPDATE ON agentstudio.agent_memory_run_contexts TO agentstudio_api');await assert.rejects(verifyAgentMemoryContextCredentials(admin),/unsafe_agent_memory_context_privileges/)}finally{await admin.query('ROLLBACK')}
    await front.close();front=null
    front=await startNativeHttps(auth,apiPool,key,brokerPool,{memory:true,memoryRuntime:true})
    await front.api.login("admin@example.com","SyntheticAdminPassword#2026")
    const memoryApi=front.captureApi()
    assert.equal((await memoryApi.getConfigCapabilities()).agent_memory_runtime_enabled,true)
    const memoryTask="记住：财务报告使用中文。整理财务报告",memoryKey="ci-memory-runtime-original",report="已按本人中文约定交付合成财务报告。\n".repeat(300)
    const memoryRun=await memoryApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,memoryTask,memoryKey,1,false)
    let memoryCalls=0,eraseBeforeDispatch=false
    const memoryDispatch=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error('memory_direct_model_fallback_forbidden')},brokerPool,{allowAutonomousExecution:true,allowMemoryExecution:true,agentExecutor:async(material,prompt)=>{
      assert.equal(material.api_key,secret);memoryCalls++;const plan=JSON.parse(prompt)
      assert.equal(plan.task,'整理财务报告');assert.deepEqual(plan.memory_context.saved_user_instructions,['【用户指令】财务报告使用中文'])
      return JSON.stringify({action:'answer',answer:report})
    }})
    await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),memoryDispatch),async raw=>{
      const effect=workflowV2ModelEffectExecutor({...raw,executionMode:'agent_native_v2'})
      let erased=false
      const executor={supports:request=>effect.supports(request),async execute(request,lease){
        if(eraseBeforeDispatch&&!erased){erased=true;const entry=(await memoryApi.listAgentMemories(memoryRole.id)).items[0]
          await memoryApi.changeAgentMemory({action:'forget',request_id:randomUUID(),spec_id:memoryRole.id,memory_id:entry.id,expected_sha256:entry.content_sha256,confirm:true})}
        return effect.execute(request,lease)
      }}
      const worker=()=>new WorkflowV2Worker(workerPool,'ci-memory-'+randomUUID(),{agentExecutionApproved:true,humanInputApproved:true,memoryExecutionApproved:true,executor,executionMode:'agent_native_v2'})
      const advance=async(id,wanted)=>{for(let i=0;i<24;i++){
        const detail=await memoryApi.getAutonomousAgentRun(id)
        if(detail.run.status===wanted)return detail
        assert.equal(['failed','paused','cancelled','succeeded'].includes(detail.run.status),false,detail.run.last_error_code)
        if(detail.run.status==='awaiting_approval')await memoryApi.decideAutonomousAgentNode(id,'approved',detail.pending_effect.step_key,detail.pending_effect.input_sha256)
        await worker().tick()
      }throw Error('genuine_memory_transition_limit')}
      const done=await advance(memoryRun.run.id,'succeeded');assert.equal(done.run.result_text,report);assert.equal(memoryCalls,1)
      mark('optional-memory-051-original-source-owner-receipts-and-erasure')
      assert.equal(await inspectAgentMemoryDerivedSchema(apiPool),false)
      await admin.query(readFileSync(new URL('../../../db/postgres/migrations/pg_v9_051_agent_memory_derived.sql',import.meta.url),'utf8'))
      assert.equal(await inspectAgentMemoryDerivedSchema(apiPool),true)
      const driftClient=await admin.connect()
      try{for(const mutation of [
        'GRANT SELECT ON agentstudio.agent_memory_derived_entries TO agentstudio_worker',
        'GRANT SELECT ON agentstudio.agent_memory_derived_receipts TO agentstudio_api WITH GRANT OPTION',
        'GRANT INSERT(fact) ON agentstudio.agent_memory_derived_entries TO agentstudio_api WITH GRANT OPTION',
        'GRANT DELETE ON agentstudio.agent_memory_derived_entries TO agentstudio_api WITH GRANT OPTION',
        'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) TO PUBLIC',
        'ALTER FUNCTION agentstudio.agent_memory_run_source_sha256(uuid) SECURITY DEFINER',
        "ALTER TABLE agentstudio.agent_memory_derived_receipts DROP CONSTRAINT agent_memory_derived_receipts_source_sha256_check; ALTER TABLE agentstudio.agent_memory_derived_receipts ADD CONSTRAINT agent_memory_derived_receipts_source_sha256_check CHECK(source_sha256 ~ '^[a-f0-9 ]{64}$')"
      ]){await driftClient.query('BEGIN');try{await driftClient.query(mutation);await assert.rejects(verifyAgentMemoryDerivedCredentials(driftClient),/unsafe_agent_memory_derived_privileges/)}finally{await driftClient.query('ROLLBACK')}}}finally{driftClient.release()}
      const derived=new AgentMemoryDerivedRepository(apiPool,{allowWrites:true}),derivedReadonly=new AgentMemoryDerivedRepository(apiPool)
      mark('optional-memory-051-native-https-owner-cookie-sdk')
      const derivedFront=await startNativeHttps(auth,apiPool,key,brokerPool,{memory:true,memoryRuntime:true,derivedMemory:true})
      try{
      await derivedFront.api.login('admin@example.com','SyntheticAdminPassword#2026')
      const derivedApi=derivedFront.captureApi()
      assert.equal((await derivedApi.getConfigCapabilities()).agent_derived_memory_writes_enabled,true)
      await derivedFront.api.login('other@example.com','SyntheticOtherPassword#2026')
      await assert.rejects(derivedFront.api.previewAgentDerivedMemory(memoryRole.id,memoryRun.run.id),e=>e.status===404)
      const derivedBefore=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
      const preview=await derivedApi.previewAgentDerivedMemory(memoryRole.id,memoryRun.run.id)
      assert.equal(preview.kind,'fact');assert.equal(preview.fact,report.slice(0,500));assert.equal(preview.tools_used,'')
      const shifted=await withActor(apiPool,memoryIdentity,async db=>{await db.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");return db.query('SELECT agentstudio.agent_memory_run_source_sha256($1::uuid) AS hash',[memoryRun.run.id])})
      assert.equal(shifted.rows[0].hash,preview.source_sha256)
      const saveDerived={action:'save_success',request_id:randomUUID(),spec_id:memoryRole.id,source_run_id:memoryRun.run.id,expected_source_sha256:preview.source_sha256,confirm:true}
      await assert.rejects(derivedReadonly.change(memoryIdentity,saveDerived),e=>e.code==='agent_memory_derived_writes_disabled')
      await assert.rejects(derived.preview(reader,memoryRole.id,memoryRun.run.id),e=>e.status===404)
      const derivedSaved=await derivedApi.changeAgentDerivedMemory(saveDerived)
      assert.equal(derivedSaved.replayed,false);assert.equal((await derivedApi.confirmAgentDerivedMemory(saveDerived)).replayed,true)
      assert.equal((await derivedReadonly.change(memoryIdentity,saveDerived)).replayed,true)
      assert.equal((await derivedApi.listAgentDerivedMemories(memoryRole.id)).items[0].fact,preview.fact)
      const current=(await memoryApi.listAgentMemories(memoryRole.id)).items[0]
      assert.equal(current.id,memoryRun.run.id)
      await memoryApi.changeAgentMemory({action:'forget',request_id:randomUUID(),spec_id:memoryRole.id,memory_id:current.id,expected_sha256:current.content_sha256,confirm:true})
      assert.equal((await memoryApi.getAutonomousAgentRun(memoryRun.run.id)).run.result_text,'')
      assert.equal((await memoryApi.getAutonomousAgentHumanHistory(memoryRun.run.id)).available,false)
      await assert.rejects(derivedApi.previewAgentDerivedMemory(memoryRole.id,memoryRun.run.id),e=>e.status===409)
      const hidden=(await derivedApi.listAgentDerivedMemories(memoryRole.id)).items[0]
      assert.equal(hidden.source_current,false);assert.equal(hidden.fact,null);assert.equal(hidden.tools_used,null)
      const forgetDerived={action:'forget',request_id:randomUUID(),spec_id:memoryRole.id,memory_id:derivedSaved.memory_id,expected_content_sha256:derivedSaved.content_sha256,expected_tools_sha256:derivedSaved.tools_sha256,confirm:true}
      assert.equal((await derivedApi.changeAgentDerivedMemory(forgetDerived)).recorded,true)
      assert.equal((await derivedApi.confirmAgentDerivedMemory(forgetDerived)).replayed,true)
      assert.equal((await derivedReadonly.change(memoryIdentity,saveDerived)).replayed,true)
      assert.equal((await derivedApi.listAgentDerivedMemories(memoryRole.id)).items.length,0)
      await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query('INSERT INTO agentstudio.agent_memory_derived_entries(owner_user_id,id,fact,tools_used,content_sha256,tools_sha256) VALUES(agentstudio.actor_id(),$1::uuid,$2,$3,$4,$5)',[derivedSaved.memory_id,preview.fact,preview.tools_used,preview.content_sha256,preview.tools_sha256])),/agent_memory_derived_entry_receipt_required/)
      const derivedState=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries,(SELECT count(*) FROM agentstudio.agent_memory_derived_receipts)::integer AS receipts')).rows[0]
      assert.deepEqual(derivedState,{entries:0,receipts:2})
      const derivedAfter=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
      assert.deepEqual(derivedAfter,derivedBefore);assert.equal(memoryCalls,1)
      }finally{await derivedFront.close()}
      mark('fresh-memory-050-revocation-before-private-dispatch')
      const replay=await memoryApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,memoryTask,memoryKey,1,false)
      assert.equal(replay.replayed,true);assert.equal(replay.run.id,memoryRun.run.id);assert.equal(replay.run.result_text,'')
      assert.equal((await memoryApi.listAgentMemories(memoryRole.id)).items.length,0)
      const revoked=await memoryApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,memoryTask,'ci-memory-revoke-before-dispatch',1,false)
      eraseBeforeDispatch=true
      const stopped=await advance(revoked.run.id,'paused');assert.equal(erased,true);assert.equal(memoryCalls,1)
      assert.equal(stopped.run.last_error_code,'workflow_v2_effect_outcome_unknown')
      assert.equal((await worker().tick()).status,'idle');assert.equal(memoryCalls,1)
      const reserved=(await admin.query("SELECT count(*)::integer AS n FROM agentstudio.external_effects WHERE run_id=$1 AND tool_name='workflow.model_bound_dispatch'",[revoked.run.id])).rows[0]
      assert.equal(reserved.n,0)
    },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:'agent_native_v2'})})
    assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_run_contexts')).rows[0].n,2)
    assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_entries')).rows[0].n,0)
    mark("optional-memory-052-native-owner-consent-private-terminal-and-stop")
    assert.equal(await inspectAgentMemoryOutcomeSchema(apiPool),false)
    await admin.query(readFileSync(new URL('../../../db/postgres/migrations/pg_v9_052_agent_memory_outcome.sql',import.meta.url),'utf8'))
    assert.equal(await inspectAgentMemoryOutcomeSchema(apiPool),true);assert.equal(await inspectAgentMemoryOutcomeSchema(workerPool),true)
    const outcomeDrift=await admin.connect()
    try{for(const mutation of [
      'GRANT SELECT ON agentstudio.agent_memory_outcome_results TO agentstudio_api WITH GRANT OPTION',
      'GRANT INSERT(intent_sha256) ON agentstudio.agent_memory_outcome_consents TO agentstudio_api WITH GRANT OPTION',
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_outcome_epoch() TO PUBLIC',
      'ALTER FUNCTION agentstudio.agent_memory_outcome_epoch() SECURITY INVOKER',
      'ALTER TABLE agentstudio.agent_memory_outcome_stops NO FORCE ROW LEVEL SECURITY'
    ]){await outcomeDrift.query('BEGIN');try{await outcomeDrift.query(mutation);await assert.rejects(verifyAgentMemoryOutcomeCredentials(outcomeDrift),/unsafe_agent_memory_outcome_privileges/)}finally{await outcomeDrift.query('ROLLBACK')}}}finally{outcomeDrift.release()}
    const outcomeFront=await startNativeHttps(auth,apiPool,key,brokerPool,{memory:true,derivedMemory:true,outcomeMemory:true})
    try{
      await outcomeFront.api.login('admin@example.com','SyntheticAdminPassword#2026');const outcomeApi=outcomeFront.captureApi()
      assert.equal((await outcomeApi.getConfigCapabilities()).agent_outcome_memory_admission_enabled,true)
      await outcomeFront.api.login('other@example.com','SyntheticOtherPassword#2026')
      let outcomeCalls=0
      const outcomeReport='Reusable synthetic terminal report token=syntheticOutcomePrivateResult.\n'.repeat(90)
      const outcomeDispatch=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error('outcome_direct_provider_forbidden')},brokerPool,{allowAutonomousExecution:true,agentExecutor:async(material,prompt)=>{
        assert.equal(material.api_key,secret);const plan=JSON.parse(prompt);assert.equal(Object.hasOwn(plan,'memory_context'),false);outcomeCalls++
        return JSON.stringify({action:'answer',answer:outcomeReport})
      }})
      await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),outcomeDispatch),async raw=>{
        const executor=workflowV2ModelEffectExecutor({...raw,executionMode:'agent_native_v2'})
        const outcomeWorker=()=>new WorkflowV2Worker(workerPool,'ci-outcome-'+randomUUID(),{agentExecutionApproved:true,humanInputApproved:true,outcomeMemoryApproved:true,executor,executionMode:'agent_native_v2'})
        for(const stopped of [false,true]){
          const task=stopped?'Synthetic privacy-stopped outcome':'Synthetic owned outcome storage',dedupe='ci-outcome-'+(stopped?'stopped':'stored')
          const started=await outcomeApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,task,dedupe,1,false,true),id=started.run.id
          const consent=await outcomeApi.getAgentOutcomeMemory(id);assert.equal(consent.enabled,true);assert.equal(consent.state,'pending');assert.equal(consent.intent_sha256,started.outcome_memory.intent_sha256)
          await assert.rejects(outcomeFront.api.getAgentOutcomeMemory(id),e=>e.status===404)
          const beforePrivacy=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
          if(stopped){const choice={request_id:randomUUID(),run_id:id,expected_intent_sha256:consent.intent_sha256,confirm:true}
            await assert.rejects(outcomeFront.api.stopAgentOutcomeMemory(choice),e=>e.status===404)
            assert.equal((await outcomeApi.stopAgentOutcomeMemory(choice)).stopped,true);assert.equal((await outcomeApi.confirmAgentOutcomeStop(choice)).replayed,true)
          }
          const replay=await outcomeApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,task,dedupe,1,false,true);assert.equal(replay.replayed,true);assert.equal(replay.run.id,id)
          await assert.rejects(outcomeApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,task,dedupe,1,false,false),e=>e.status===409)
          assert.deepEqual((await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0],beforePrivacy)
          let terminal=false
          for(let i=0;i<24;i++){
            const detail=await outcomeApi.getAutonomousAgentRun(id)
            if(detail.run.status==='succeeded'){terminal=true;assert.equal(detail.run.result_text,outcomeReport.replaceAll('token=syntheticOutcomePrivateResult.','token=***'));break}
            assert.equal(['failed','paused','cancelled'].includes(detail.run.status),false,detail.run.last_error_code)
            if(detail.run.status==='awaiting_approval')await outcomeApi.decideAutonomousAgentNode(id,'approved',detail.pending_effect.step_key,detail.pending_effect.input_sha256)
            await outcomeWorker().tick()
          }
          assert.equal(terminal,true);assert.equal((await outcomeWorker().tick()).status,'idle')
          const status=await outcomeApi.getAgentOutcomeMemory(id);assert.equal(status.state,'finished');assert.equal(status.result.decision,stopped?'revoked':'stored')
          const items=(await outcomeApi.listAgentDerivedMemories(memoryRole.id)).items
          if(stopped)assert.equal(items.length,0)
          else{
            assert.equal(items.length,1);assert.equal(items[0].id,consent.memory_id);assert.equal(items[0].source_current,true);assert.equal(items[0].kind,'fact');assert.equal(items[0].fact.includes('syntheticOutcomePrivateResult'),false)
            await outcomeApi.changeAgentDerivedMemory({action:'forget',request_id:randomUUID(),spec_id:memoryRole.id,memory_id:items[0].id,expected_content_sha256:items[0].content_sha256,expected_tools_sha256:items[0].tools_sha256,confirm:true})
            assert.equal((await new AgentMemoryOutcomeRepository(apiPool,{allowWriteback:true}).status(memoryIdentity,id)).result.decision,'stored')
            assert.equal((await outcomeApi.listAgentDerivedMemories(memoryRole.id)).items.length,0)
          }
        }
      },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:'agent_native_v2'})})
      assert.equal(outcomeCalls,2)
      assert.deepEqual((await admin.query('SELECT (SELECT count(*) FROM agentstudio.agent_memory_outcome_consents)::integer AS consents,(SELECT count(*) FROM agentstudio.agent_memory_outcome_stops)::integer AS stops,(SELECT count(*) FROM agentstudio.agent_memory_outcome_results)::integer AS results,(SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries')).rows[0],{consents:2,stops:1,results:2,entries:0})
      await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query('DELETE FROM agentstudio.agent_memory_outcome_results')),/permission denied/)
    }finally{await outcomeFront.close()}
    mark("optional-memory-053-worker-attested-failure-before-vm")
    assert.equal(await inspectAgentMemoryFailureSourceSchema(apiPool),false)
    await admin.query(readFileSync(new URL('../../../db/postgres/migrations/pg_v9_053_agent_memory_failure_source.sql',import.meta.url),'utf8'))
    assert.equal(await inspectAgentMemoryFailureSourceSchema(apiPool),true);assert.equal(await inspectAgentMemoryFailureSourceSchema(workerPool),true)
    const failureDrift=await admin.connect()
    try{for(const mutation of [
      'GRANT EXECUTE ON FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) TO agentstudio_api',
      'GRANT SELECT ON agentstudio.agent_memory_failure_sources TO agentstudio_worker',
      'GRANT SELECT ON agentstudio.agent_memory_failure_sources TO agentstudio_api WITH GRANT OPTION',
      'ALTER FUNCTION agentstudio.agent_memory_record_failure_source(uuid,uuid,bigint,text) SECURITY INVOKER'
    ]){await failureDrift.query('BEGIN');try{await failureDrift.query(mutation);await assert.rejects(verifyAgentMemoryFailureSourceCredentials(failureDrift),/unsafe_agent_memory_failure_source_privileges/)}finally{await failureDrift.query('ROLLBACK')}}}finally{failureDrift.release()}
    const failureFront=await startNativeHttps(auth,apiPool,key,brokerPool,{memory:true,derivedMemory:true,outcomeMemory:true})
    try{
      await failureFront.api.login('admin@example.com','SyntheticAdminPassword#2026');const failureApi=failureFront.captureApi()
      await failureFront.api.login('other@example.com','SyntheticOtherPassword#2026')
      const failedTask='Synthetic genuine preparation failure token=syntheticEarlyFailurePrivate'
      const started=await failureApi.submitAutonomousAgentRun(memoryRole.id,memoryRole.revision,failedTask,'ci-worker-attested-early-failure',1,false,true),id=started.run.id
      let armed=true,calls=0
      const intercepted=Object.create(workerPool)
      Object.defineProperty(intercepted,'connect',{value:async()=>{const db=await workerPool.connect();return {async query(sql,values=[]){
        if(armed&&sql==='SELECT status FROM agentstudio.users WHERE id=$1::uuid'){armed=false;throw new HttpError(409,'synthetic_worker_preparation_failed')}
        return db.query(sql,values)
      },release(){db.release()}}}})
      const failedDispatch=new WorkflowV2ModelDispatch(apiPool,key,async()=>{throw Error('failure_direct_provider_forbidden')},brokerPool,{allowAutonomousExecution:true,agentExecutor:async()=>{calls++;return JSON.stringify({action:'answer',answer:'unexpected synthetic provider result'})}})
      await withDisposableBoundModelTls(verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(identityPool),failedDispatch),async raw=>{
        const executor=workflowV2ModelEffectExecutor({...raw,executionMode:'agent_native_v2'})
        const worker=new WorkflowV2Worker(intercepted,'ci-failure-source-'+randomUUID(),{agentExecutionApproved:true,humanInputApproved:true,outcomeMemoryApproved:true,executor,executionMode:'agent_native_v2'})
        assert.equal((await worker.tick()).status,'failed');assert.equal(armed,false);assert.equal((await worker.tick()).status,'idle')
      },{handlerFactory:raw=>createWorkflowV2ModelInternalHandler({...raw,executionMode:'agent_native_v2'})})
      assert.equal(calls,0);assert.equal((await failureApi.getAutonomousAgentRun(id)).run.status,'failed')
      assert.equal((await failureApi.getAgentOutcomeMemory(id)).result.decision,'stored')
      const proof=(await admin.query('SELECT f.source_sha256,f.worker_sha256,r.checkpoint FROM agentstudio.agent_memory_failure_sources f JOIN agentstudio.runs r ON r.id=f.run_id WHERE f.run_id=$1',[id])).rows[0]
      assert.match(proof.source_sha256,/^[a-f0-9]{64}$/);assert.match(proof.worker_sha256,/^[a-f0-9]{64}$/);assert.equal(Object.hasOwn(proof.checkpoint,'agent_state'),false)
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects WHERE run_id=$1',[id])).rows[0].n,0)
      await assert.rejects(failureFront.api.previewAgentDerivedMemory(memoryRole.id,id),e=>e.status===404)
      const preview=await failureApi.previewAgentDerivedMemory(memoryRole.id,id);assert.equal(preview.kind,'lesson');assert.equal(preview.tools_used,'');assert.match(preview.fact,/synthetic_worker_preparation_failed/);assert.equal(preview.fact.includes('syntheticEarlyFailurePrivate'),false)
      const item=(await failureApi.listAgentDerivedMemories(memoryRole.id)).items[0];assert.equal(item.kind,'lesson');assert.equal(item.source_current,true)
      await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query('SELECT agentstudio.agent_memory_record_failure_source($1::uuid,$2::uuid,1,$3::text)',[randomUUID(),randomUUID(),'forged-api-worker'])),/permission denied/)
      await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query('DELETE FROM agentstudio.agent_memory_failure_sources')),/permission denied/)
      await admin.query("UPDATE agentstudio.runs SET last_error_code='synthetic_terminal_changed' WHERE id=$1",[id])
      await assert.rejects(failureApi.previewAgentDerivedMemory(memoryRole.id,id),e=>e.status===409)
      const hidden=(await failureApi.listAgentDerivedMemories(memoryRole.id)).items[0];assert.equal(hidden.source_current,false);assert.equal(hidden.fact,null)
      await failureApi.changeAgentDerivedMemory({action:'forget',request_id:randomUUID(),spec_id:item.spec_id,memory_id:item.id,expected_content_sha256:item.content_sha256,expected_tools_sha256:item.tools_sha256,confirm:true})
      assert.equal((await failureApi.listAgentDerivedMemories(memoryRole.id)).items.length,0);assert.equal((await failureApi.getAgentOutcomeMemory(id)).result.decision,'stored');assert.equal(calls,0)
    }finally{await failureFront.close()}
    mark("optional-feedback-054-statement-and-erasure")
    assert.equal(await inspectAgentFeedbackSchema(apiPool),false)
    await admin.query(readFileSync(new URL('../../../db/postgres/migrations/pg_v9_054_agent_feedback.sql',import.meta.url),'utf8'))
    assert.equal(await inspectAgentFeedbackSchema(apiPool),true);assert.equal(await inspectAgentFeedbackSchema(workerPool),true)
    const feedbackDrift=await admin.connect()
    try{for(const mutation of ['GRANT UPDATE(comment) ON agentstudio.agent_feedback_bodies TO agentstudio_api','GRANT EXECUTE ON FUNCTION agentstudio.agent_feedback_digest(text[]) TO agentstudio_worker']){
      await feedbackDrift.query('BEGIN');try{await feedbackDrift.query(mutation);await assert.rejects(verifyAgentFeedbackCredentials(feedbackDrift),/unsafe_agent_feedback_privileges/)}finally{await feedbackDrift.query('ROLLBACK')}
    }}finally{feedbackDrift.release()}
    // Repository/schema acceptance only. A feedback HTTP route, SDK and page
    // are deliberately not claimed by this foundation phase.
    const feedbackSql=new AgentFeedbackRepository(apiPool,{allowSubmit:true,allowLessonStorage:true}),feedbackClosed=new AgentFeedbackRepository(apiPool)
    const feedbackId=(await admin.query("SELECT id FROM agentstudio.runs WHERE agent_spec_id=$1::uuid AND instruction=$2 AND status='failed' ORDER BY created_at DESC LIMIT 1",[memoryRole.id,'Synthetic genuine preparation failure token=syntheticEarlyFailurePrivate'])).rows[0].id
    const feedbackBefore=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    const feedbackState=await feedbackSql.status(memoryIdentity,feedbackId)
    const feedbackChoice={action:'submit',request_id:randomUUID(),run_id:feedbackId,spec_id:feedbackState.spec_id,expected_revision:0,expected_source_sha256:feedbackState.source.source_sha256,rating:'down',tags:['核对:😀'],comment:'Synthetic genuine feedback token=syntheticFeedbackCredential',remember_lesson:true,confirm:true}
    const contenders=await Promise.allSettled([feedbackSql.change(memoryIdentity,feedbackChoice),feedbackSql.change(memoryIdentity,{...feedbackChoice,request_id:randomUUID()})])
    assert.equal(contenders.filter(v=>v.status==='fulfilled').length,1);assert.equal(contenders.find(v=>v.status==='rejected').reason.code,'agent_feedback_revision_changed')
    let currentFeedback=await feedbackSql.status(memoryIdentity,feedbackId);assert.equal(currentFeedback.state,'active');assert.equal(currentFeedback.current.body.comment,'Synthetic genuine feedback token=***');assert.equal(currentFeedback.lessons[0].source_current,true);assert.equal(currentFeedback.lessons[0].tools_used,'')
    const firstFeedback=currentFeedback.current,again={...feedbackChoice,request_id:randomUUID(),expected_revision:1}
    const corrected=await feedbackSql.change(memoryIdentity,again);assert.equal(corrected.revision,2);assert.equal(corrected.statement_sha256,firstFeedback.statement_sha256);assert.notEqual(corrected.feedback_sha256,firstFeedback.feedback_sha256)
    currentFeedback=await feedbackSql.status(memoryIdentity,feedbackId);assert.equal(currentFeedback.lessons.length,2);assert.equal(currentFeedback.lessons.find(v=>v.feedback_id===firstFeedback.feedback_id).fact,null)
    const foreignFeedbackSession=await auth.login('other@example.com','SyntheticOtherPassword#2026'),foreignFeedbackIdentity=await auth.verifySession(foreignFeedbackSession.token);assert.ok(foreignFeedbackIdentity)
    await assert.rejects(feedbackSql.status(foreignFeedbackIdentity,feedbackId),e=>e.status===404)
    await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query('UPDATE agentstudio.agent_feedback_receipts SET remember_lesson=false')),/permission denied/)
    await admin.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[feedbackId])
    currentFeedback=await feedbackClosed.status(memoryIdentity,feedbackId);assert.equal(currentFeedback.source,null);assert.equal(currentFeedback.current.body.rating,'down');assert.ok(currentFeedback.lessons.every(v=>!v.source_current&&v.fact===null))
    const eraseFeedback={action:'erase_feedback',request_id:randomUUID(),run_id:feedbackId,spec_id:currentFeedback.spec_id,expected_revision:2,expected_feedback_sha256:currentFeedback.current.feedback_sha256,confirm:true}
    await feedbackClosed.change(memoryIdentity,eraseFeedback);assert.equal((await feedbackClosed.confirm(memoryIdentity,eraseFeedback)).replayed,true);assert.equal((await feedbackClosed.change(memoryIdentity,again)).replayed,true)
    currentFeedback=await feedbackClosed.status(memoryIdentity,feedbackId);assert.equal(currentFeedback.state,'erased');assert.equal(currentFeedback.lessons.length,0)
    assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_bodies')).rows[0].n,0);assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_lessons')).rows[0].n,0)
    assert.deepEqual((await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0],feedbackBefore)
    mark("optional-feedback-054-native-https-cookie-http")
    const feedbackRole=await new AgentSpecRepository(apiPool).get(memoryIdentity,memoryRole.id),feedbackOwned=new AutonomousAgentRunRepository(apiPool,{allowHumanInput:true})
    const httpFeedbackRun=await feedbackOwned.submit(memoryIdentity,feedbackRole.id,{expected_revision:feedbackRole.revision,max_steps:1,require_plan_review:false,idempotency_key:'ci-native-feedback-http-original',instruction:'Synthetic feedback HTTP cancelled task token=syntheticTaskPrivate'})
    await feedbackOwned.cancel(memoryIdentity,httpFeedbackRun.run.id)
    const httpFeedbackCounts=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    const feedbackFront=await startNativeHttps(auth,apiPool,key,brokerPool,{feedback:true,feedbackSubmission:true,feedbackLessons:true})
    let originalFeedbackChoice,httpFeedbackSpec,feedbackSession,feedbackTransport=feedbackFront.request,loseFeedbackReply=false
    try{
      await feedbackFront.api.login('admin@example.com','SyntheticAdminPassword#2026')
      const base='/api/v2/agent-feedback/'+httpFeedbackRun.run.id
      const call=async(path,body,lose=false)=>{
        const response=await feedbackFront.request(base+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}})
        const value=await response.json();if(lose&&response.ok)throw Error('synthetic genuine committed feedback reply lost')
        return {status:response.status,body:value}
      }
      let state=(await call('')).body;httpFeedbackSpec=state.spec_id
      originalFeedbackChoice={action:'submit',request_id:randomUUID(),spec_id:state.spec_id,run_id:state.run_id,expected_revision:0,expected_source_sha256:state.source.source_sha256,rating:'down',tags:['核对😀'],comment:'Synthetic HTTPS feedback token=syntheticHttpFeedbackPrivate',remember_lesson:true,confirm:true}
      assert.equal((await call('?owner_user_id='+memoryIdentity.subject)).status,400)
      assert.equal((await call('/change',{...originalFeedbackChoice,run_id:randomUUID()})).status,400)
      assert.equal((await call('/change',{...originalFeedbackChoice,owner_user_id:memoryIdentity.subject})).status,400)
      await assert.rejects(call('/change',originalFeedbackChoice,true),/committed feedback reply lost/)
      const receipt=await call('/confirm',originalFeedbackChoice);assert.equal(receipt.status,200);assert.equal(receipt.body.replayed,true);assert.equal(receipt.body.lesson_result.decision,'stored')
      state=(await call('')).body;assert.equal(state.current.body.comment,'Synthetic HTTPS feedback token=***');assert.equal(state.lessons[0].source_current,true);assert.equal(state.lessons[0].tools_used,'')
      assert.deepEqual(await feedbackFront.api.getAgentFeedback(httpFeedbackRun.run.id),state)
      assert.equal((await feedbackFront.api.confirmAgentFeedback(originalFeedbackChoice)).request_sha256,receipt.body.request_sha256)
      assert.equal((await feedbackFront.api.getConfigCapabilities()).agent_feedback_lesson_storage_enabled,true)
      await feedbackFront.api.login('other@example.com','SyntheticOtherPassword#2026');assert.equal((await call('')).status,404);assert.equal((await call('/confirm',originalFeedbackChoice)).status,404)
      await assert.rejects(feedbackFront.api.getAgentFeedback(httpFeedbackRun.run.id),e=>e.status===404)
      await feedbackFront.api.login('admin@example.com','SyntheticAdminPassword#2026')
      const feedbackClient=createPgNativePilotApi(async(route,init)=>{
        const response=await feedbackTransport(route,init)
        if(loseFeedbackReply&&route.endsWith('/change')&&response.ok){loseFeedbackReply=false;await response.arrayBuffer();throw Error('synthetic SDK committed feedback reply lost')}
        return response
      })
      feedbackSession=createPgNativeFeedbackSession(feedbackClient);feedbackSession.setScopes({available:true,submit:true,lessons:true});feedbackSession.setActive(true);await feedbackSession.select(httpFeedbackRun.run.id)
      loseFeedbackReply=true;await feedbackSession.submit({rating:'down',tags:['修正😀'],comment:'Synthetic SDK correction token=syntheticSdkFeedbackPrivate',remember_lesson:false},true)
      assert.equal(feedbackSession.snapshot().pending.action,'submit');assert.doesNotMatch(JSON.stringify(feedbackSession.snapshot().pending),/syntheticSdkFeedbackPrivate/)
      feedbackSession.setActive(false)

    }finally{await feedbackFront.close()}
    const feedbackRecoveryFront=await startNativeHttps(auth,apiPool,key,brokerPool,{feedback:true})
    try{
      await feedbackRecoveryFront.api.login('admin@example.com','SyntheticAdminPassword#2026')
      feedbackTransport=feedbackRecoveryFront.request;feedbackSession.setScopes({available:true,submit:false,lessons:false});feedbackSession.setActive(true);await feedbackSession.confirm()
      assert.equal(feedbackSession.snapshot().pending,null);assert.equal(feedbackSession.snapshot().status.revision,2);assert.equal(feedbackSession.snapshot().status.current.body.comment,'Synthetic SDK correction token=***')
      assert.equal(feedbackSession.snapshot().status.current.lesson_result.decision,'not_requested');assert.ok(feedbackSession.snapshot().status.lessons.every(v=>!v.source_current&&v.fact===null))
      assert.equal((await feedbackRecoveryFront.api.getConfigCapabilities()).agent_feedback_submission_enabled,false)
      const base='/api/v2/agent-feedback/'+httpFeedbackRun.run.id
      const call=async(path,body)=>{const response=await feedbackRecoveryFront.request(base+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}});return {status:response.status,body:await response.json()}}
      assert.equal((await call('/confirm',originalFeedbackChoice)).body.replayed,true)
      assert.equal((await call('/change',{...originalFeedbackChoice,request_id:randomUUID(),expected_revision:1})).status,403)
      const state=(await call('')).body,erase={action:'erase_feedback',request_id:randomUUID(),spec_id:httpFeedbackSpec,run_id:httpFeedbackRun.run.id,expected_revision:state.revision,expected_feedback_sha256:state.current.feedback_sha256,confirm:true}
      await admin.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[httpFeedbackRun.run.id])
      assert.equal((await feedbackRecoveryFront.api.changeAgentFeedback(erase)).recorded,true);assert.equal((await feedbackRecoveryFront.api.confirmAgentFeedback(erase)).replayed,true)
      assert.equal((await call('/change',originalFeedbackChoice)).body.replayed,true);const deleted=(await call('')).body;assert.equal(deleted.state,'erased');assert.equal(deleted.current,null);assert.equal(deleted.lessons.length,0)
      assert.deepEqual((await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0],httpFeedbackCounts)
    }finally{feedbackSession?.dispose();await feedbackRecoveryFront.close()}
    mark("optional-optimization-055-actual-role-transition")
    assert.equal(await inspectAgentOptimizationSchema(apiPool),false)
    await admin.query(readFileSync(new URL('../../../db/postgres/migrations/pg_v9_055_agent_optimization.sql',import.meta.url),'utf8'))
    assert.equal(await inspectAgentOptimizationSchema(apiPool),true);assert.equal(await inspectAgentOptimizationSchema(workerPool),true)
    const optimizationDrift=await admin.connect()
    try{for(const mutation of ['GRANT INSERT(changed_keys) ON agentstudio.agent_optimization_links TO agentstudio_api','ALTER TABLE agentstudio.agent_specs DISABLE TRIGGER native_agent_optimization_history']){
      await optimizationDrift.query('BEGIN');try{await optimizationDrift.query(mutation);await assert.rejects(verifyAgentOptimizationCredentials(optimizationDrift),/unsafe_agent_optimization_privileges/)}finally{await optimizationDrift.query('ROLLBACK')}
    }}finally{optimizationDrift.release()}
    // Foundation acceptance only. No optimization HTTP, SDK, employee page
    // or extra provider/evaluation/optimization draft is claimed here.
    const optimization=new AgentOptimizationRepository(apiPool,{allowAcceptance:true}),optimizationClosed=new AgentOptimizationRepository(apiPool),roleForOptimization=await new AgentSpecRepository(apiPool).get(memoryIdentity,memoryRole.id)
    const {require_approval:optimizationApproval,...optimizationSpec}=roleForOptimization.spec
    const optimizationRoleSha=(await withActor(apiPool,memoryIdentity,db=>db.query('SELECT agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS sha FROM agentstudio.agent_specs WHERE id=$1',[roleForOptimization.id]))).rows[0].sha
    const optimizationSources=[]
    for(let i=0;i<2;i++){
      const queued=await feedbackOwned.submit(memoryIdentity,roleForOptimization.id,{expected_revision:roleForOptimization.revision,max_steps:1,require_plan_review:false,idempotency_key:'ci-native-optimization-source-'+i,instruction:'Synthetic optimization cancelled source '+i+' token=syntheticOptimizationSourcePrivate'})
      await feedbackOwned.cancel(memoryIdentity,queued.run.id)
      const state=await feedbackSql.status(memoryIdentity,queued.run.id)
      const body={action:'submit',request_id:randomUUID(),run_id:queued.run.id,spec_id:state.spec_id,expected_revision:0,expected_source_sha256:state.source.source_sha256,rating:i===0?'up':'down',tags:['核对😀'],comment:'Synthetic genuine employee observation token=syntheticOptimizationFeedbackPrivate',remember_lesson:false,confirm:true}
      const receipt=await feedbackSql.change(memoryIdentity,body);optimizationSources.push({body,receipt})
    }
    const optimizationBefore=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    const optimizationChoices=optimizationSources.map(({receipt},i)=>({action:'preview',spec_id:roleForOptimization.id,run_id:receipt.run_id,feedback_id:receipt.feedback_id,expected_feedback_sha256:receipt.feedback_sha256,expected_spec_revision:roleForOptimization.revision,expected_spec_sha256:optimizationRoleSha,name:roleForOptimization.name,spec:{...optimizationSpec,goal:'Synthetic genuine explicit role correction '+i+' 😀'}}))
    const optimizationPreview=await optimizationClosed.preview(memoryIdentity,optimizationChoices[0]);assert.equal(optimizationPreview.recorded,false);assert.deepEqual(optimizationPreview.changed_keys,['goal'])
    const optimizationBodies=optimizationChoices.map(v=>({...v,action:'accept',request_id:randomUUID(),confirm:true}))
    await assert.rejects(optimizationClosed.accept(memoryIdentity,optimizationBodies[0]),e=>e.status===403)
    // Different source-run mutexes must still serialize the same real role.
    const optimizationRace=await Promise.allSettled(optimizationBodies.map(body=>optimization.accept(memoryIdentity,body)))
    assert.equal(optimizationRace.filter(r=>r.status==='fulfilled').length,1);assert.equal(optimizationRace.find(r=>r.status==='rejected').reason.status,409)
    const optimizationWinner=optimizationRace.findIndex(r=>r.status==='fulfilled'),acceptedOptimization=optimizationRace[optimizationWinner].value,originalOptimization=optimizationBodies[optimizationWinner],optimizationSource=optimizationSources[optimizationWinner]
    assert.equal(acceptedOptimization.after_spec_revision,roleForOptimization.revision+1);assert.equal(acceptedOptimization.before_spec_sha256,optimizationRoleSha)
    const acceptedHistory=(await admin.query('SELECT id,kind,source_sha256 FROM agentstudio.agent_collaboration_revisions WHERE id IN($1,$2)',[acceptedOptimization.before_revision_id,acceptedOptimization.after_revision_id])).rows
    assert.equal(acceptedHistory.length,2);assert.equal(acceptedHistory.find(r=>r.id===acceptedOptimization.before_revision_id).kind,'before_edit');assert.equal(acceptedHistory.find(r=>r.id===acceptedOptimization.after_revision_id).kind,'edited');assert.equal(acceptedHistory.find(r=>r.id===acceptedOptimization.after_revision_id).source_sha256,acceptedOptimization.after_spec_sha256)
    let optimizationPage=await optimizationClosed.list(memoryIdentity,roleForOptimization.id);assert.equal(optimizationPage.items.length,1);assert.equal(optimizationPage.items[0].feedback_unchanged,true);assert.equal(optimizationPage.items[0].role_current,true)
    const foreignOptimizationSession=await auth.login('other@example.com','SyntheticOtherPassword#2026'),foreignOptimizationIdentity=await auth.verifySession(foreignOptimizationSession.token)
    await assert.rejects(optimizationClosed.list(foreignOptimizationIdentity,roleForOptimization.id),e=>e.status===404);await assert.rejects(optimizationClosed.confirm(foreignOptimizationIdentity,originalOptimization),e=>e.status===404)
    await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query('INSERT INTO agentstudio.agent_optimization_links(owner_user_id) VALUES(agentstudio.actor_id())')),/permission denied/)
    await assert.rejects(withActor(apiPool,memoryIdentity,db=>db.query("INSERT INTO agentstudio.agent_optimization_intents(transaction_id) VALUES('1')")),/permission denied/)
    const revisedFeedback=await feedbackSql.change(memoryIdentity,{...optimizationSource.body,request_id:randomUUID(),expected_revision:1});assert.equal(revisedFeedback.statement_sha256,optimizationSource.receipt.statement_sha256);assert.notEqual(revisedFeedback.feedback_sha256,optimizationSource.receipt.feedback_sha256)
    optimizationPage=await optimizationClosed.list(memoryIdentity,roleForOptimization.id);assert.equal(optimizationPage.items[0].feedback_unchanged,false);assert.equal(optimizationPage.items[0].role_current,true)
    await admin.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[originalOptimization.run_id])
    await feedbackClosed.change(memoryIdentity,{action:'erase_feedback',request_id:randomUUID(),spec_id:roleForOptimization.id,run_id:originalOptimization.run_id,expected_revision:2,expected_feedback_sha256:revisedFeedback.feedback_sha256,confirm:true})
    const recoveredOptimization=await optimizationClosed.confirm(memoryIdentity,originalOptimization);assert.equal(recoveredOptimization.replayed,true);assert.equal(recoveredOptimization.after_revision_id,acceptedOptimization.after_revision_id)
    assert.equal((await optimizationClosed.accept(memoryIdentity,originalOptimization)).replayed,true)
    const currentOptimizationRole=await new AgentSpecRepository(apiPool).get(memoryIdentity,roleForOptimization.id),{require_approval:ordinaryApproval,...ordinarySpec}=currentOptimizationRole.spec
    await new AgentSpecRepository(apiPool).update(memoryIdentity,roleForOptimization.id,currentOptimizationRole.name,safeAgentSpec({...ordinarySpec,goal:'Synthetic later ordinary owner edit'}),currentOptimizationRole.revision)
    optimizationPage=await optimizationClosed.list(memoryIdentity,roleForOptimization.id);assert.equal(optimizationPage.items[0].feedback_unchanged,false);assert.equal(optimizationPage.items[0].role_current,false)
    assert.doesNotMatch(JSON.stringify(optimizationPage),/syntheticOptimizationSourcePrivate|syntheticOptimizationFeedbackPrivate|Synthetic later ordinary/)
    assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.agent_optimization_links')).rows[0].n,1)
    assert.deepEqual((await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0],optimizationBefore)
    mark("optional-optimization-055-native-https-cookie-http")
    const optimizationHttpRole=await new AgentSpecRepository(apiPool).get(memoryIdentity,roleForOptimization.id),{require_approval:optimizationHttpApproval,...optimizationHttpSpec}=optimizationHttpRole.spec
    const remainingOptimizationSource=optimizationSources[optimizationWinner===0?1:0]
    const optimizationHttpSha=(await withActor(apiPool,memoryIdentity,db=>db.query('SELECT agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS sha FROM agentstudio.agent_specs WHERE id=$1',[roleForOptimization.id]))).rows[0].sha
    const optimizationHttpDraft={action:'preview',spec_id:roleForOptimization.id,run_id:remainingOptimizationSource.receipt.run_id,feedback_id:remainingOptimizationSource.receipt.feedback_id,expected_feedback_sha256:remainingOptimizationSource.receipt.feedback_sha256,expected_spec_revision:optimizationHttpRole.revision,expected_spec_sha256:optimizationHttpSha,name:optimizationHttpRole.name,spec:{...optimizationHttpSpec,goal:'Synthetic genuine HTTPS role correction 😀'}}
    const originalHttpOptimization={...optimizationHttpDraft,action:'accept',request_id:randomUUID(),confirm:true}
    const optimizationHttpBefore=(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    const optimizationHttpFront=await startNativeHttps(auth,apiPool,key,brokerPool,{optimization:true,optimizationAcceptance:true})
    try{
      await optimizationHttpFront.api.login('admin@example.com','SyntheticAdminPassword#2026')
      const call=async(path,body,lose=false)=>{const response=await optimizationHttpFront.request('/api/v2/agent-optimizations'+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}});const value=await response.json();if(lose&&response.ok)throw Error('synthetic committed genuine optimization HTTP reply lost');return {status:response.status,body:value}}
      const preview=await optimizationHttpFront.api.previewAgentOptimization(optimizationHttpDraft);assert.equal(preview.recorded,false);assert.deepEqual(preview.changed_keys,['goal'])
      assert.equal((await optimizationHttpFront.api.getConfigCapabilities()).agent_optimization_acceptance_enabled,true)
      assert.equal((await call('?spec_id='+roleForOptimization.id+'&owner_user_id=unknown')).status,400)
      assert.equal((await call('/accept',{...originalHttpOptimization,changed_keys:['goal']})).status,400)
      assert.equal((await call('/accept',{...originalHttpOptimization,paid_optimization_approved:true})).status,400)
      const losingOptimizationSdk=createPgNativePilotApi(async(route,init)=>{const response=await optimizationHttpFront.request(route,init);if(route.endsWith('/accept')&&response.ok){await response.arrayBuffer();throw Error('synthetic SDK committed optimization reply lost')}return response})
      await assert.rejects(losingOptimizationSdk.acceptAgentOptimization(originalHttpOptimization),e=>e.status===0)
      assert.equal((await optimizationHttpFront.api.getAgentOptimizations(roleForOptimization.id)).items.length,2)
      const page=await call('?spec_id='+roleForOptimization.id);assert.equal(page.status,200);assert.equal(page.body.items.length,2);assert.equal(page.body.items.find(i=>i.request_id===originalHttpOptimization.request_id).role_current,true)
      await optimizationHttpFront.api.login('other@example.com','SyntheticOtherPassword#2026');assert.equal((await call('?spec_id='+roleForOptimization.id)).status,404);assert.equal((await call('/confirm',originalHttpOptimization)).status,404)
    }finally{await optimizationHttpFront.close()}
    const optimizationHttpRecovery=await startNativeHttps(auth,apiPool,key,brokerPool,{optimization:true})
    try{
      await optimizationHttpRecovery.api.login('admin@example.com','SyntheticAdminPassword#2026')
      const call=async(path,body)=>{const response=await optimizationHttpRecovery.request('/api/v2/agent-optimizations'+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}});return {status:response.status,body:await response.json()}}
      const confirmedSdk=await optimizationHttpRecovery.api.confirmAgentOptimization(originalHttpOptimization);assert.equal(confirmedSdk.replayed,true)
      assert.equal((await optimizationHttpRecovery.api.acceptAgentOptimization(originalHttpOptimization)).after_revision_id,confirmedSdk.after_revision_id)
      assert.equal((await optimizationHttpRecovery.api.getConfigCapabilities()).agent_optimization_acceptance_enabled,false)
      const confirmed=await call('/confirm',originalHttpOptimization);assert.equal(confirmed.status,200);assert.equal(confirmed.body.replayed,true)
      assert.equal((await call('/accept',originalHttpOptimization)).body.replayed,true)
      assert.equal((await call('/accept',{...originalHttpOptimization,request_id:randomUUID()})).status,403)
      assert.equal((await call('/accept',{...originalHttpOptimization,spec:{...originalHttpOptimization.spec,goal:'Changed unknown original'}})).status,409)
      await admin.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[originalHttpOptimization.run_id])
      await feedbackClosed.change(memoryIdentity,{action:'erase_feedback',request_id:randomUUID(),spec_id:roleForOptimization.id,run_id:originalHttpOptimization.run_id,expected_revision:1,expected_feedback_sha256:remainingOptimizationSource.receipt.feedback_sha256,confirm:true})
      const current=await new AgentSpecRepository(apiPool).get(memoryIdentity,roleForOptimization.id),{require_approval:laterHttpApproval,...laterHttpSpec}=current.spec
      await new AgentSpecRepository(apiPool).update(memoryIdentity,current.id,current.name,safeAgentSpec({...laterHttpSpec,goal:'Synthetic final unrelated role update'}),current.revision)
      assert.equal((await call('/confirm',originalHttpOptimization)).body.after_revision_id,confirmed.body.after_revision_id)
      const page=await call('?spec_id='+roleForOptimization.id),item=page.body.items.find(i=>i.request_id===originalHttpOptimization.request_id);assert.equal(item.feedback_unchanged,false);assert.equal(item.role_current,false)
      assert.equal((await optimizationHttpRecovery.api.getAgentOptimizations(roleForOptimization.id)).items.find(i=>i.request_id===originalHttpOptimization.request_id).feedback_unchanged,false)
      assert.doesNotMatch(JSON.stringify(page.body),/syntheticOptimizationSourcePrivate|syntheticOptimizationFeedbackPrivate|Synthetic final unrelated/)
      assert.equal((await admin.query('SELECT count(*)::integer AS n FROM agentstudio.agent_optimization_links')).rows[0].n,2)
      assert.deepEqual((await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0],optimizationHttpBefore)
    }finally{await optimizationHttpRecovery.close()}
    mark("optional-review-readonly-source-preparation")
    // Source/input preparation only: no paid request, new Worker or provider.
    const reviewSources=new AgentReviewSourceRepository(apiPool),reviewRole=await new AgentSpecRepository(apiPool).get(memoryIdentity,memoryRole.id),reviewTasks=[]
    for(let i=0;i<2;i++){
      const started=await feedbackOwned.submit(memoryIdentity,reviewRole.id,{expected_revision:reviewRole.revision,max_steps:1,require_plan_review:false,idempotency_key:'ci-readonly-review-source-'+i,instruction:'Synthetic review original private task '+i+' token=syntheticReviewTcpTask'})
      await feedbackOwned.cancel(memoryIdentity,started.run.id)
      const state=await feedbackSql.status(memoryIdentity,started.run.id),body={action:'submit',request_id:randomUUID(),spec_id:reviewRole.id,run_id:started.run.id,expected_revision:0,expected_source_sha256:state.source.source_sha256,rating:'down',tags:['核对😀'],comment:'Synthetic selected employee statement '+i+' token=syntheticReviewTcpFeedback',remember_lesson:false,confirm:true}
      reviewTasks.push({runId:started.run.id,body,receipt:await feedbackSql.change(memoryIdentity,body)})
    }
    const reviewAnchor=await reviewSources.source(memoryIdentity,{purpose:'optimize',spec_id:reviewRole.id,run_id:reviewTasks[0].runId})
    const paidReviewChoice={action:'preview',purpose:'optimize',spec_id:reviewRole.id,run_id:reviewTasks[0].runId,expected_source_sha256:reviewAnchor.expected_source_sha256,expected_spec_revision:reviewAnchor.expected_spec_revision,expected_spec_sha256:reviewAnchor.expected_spec_sha256,model_binding:reviewRole.spec.model_binding,output_token_limit:2048,feedback_sources:reviewTasks.map(s=>({run_id:s.runId,feedback_id:s.receipt.feedback_id,feedback_sha256:s.receipt.feedback_sha256})),evaluation_sources:[]}
    const reviewCounts=async()=>(await admin.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects,(SELECT count(*) FROM agentstudio.agent_optimization_links)::integer AS accepted,(SELECT count(*) FROM agentstudio.audit_events)::integer AS audits')).rows[0]
    const reviewBefore=await reviewCounts(),preparedReview=await reviewSources.preview(memoryIdentity,paidReviewChoice)
    assert.equal(preparedReview.recorded,false);assert.equal(preparedReview.source_protocol,'employee_statement_anchor_v1');assert.equal(JSON.parse(preparedReview.messages[1].content).task,null);assert.equal(JSON.parse(preparedReview.messages[1].content).employee_statements.length,2);assert.doesNotMatch(JSON.stringify(preparedReview.messages),/syntheticReviewTcpTask|syntheticReviewTcpFeedback|checkpoint|model_binding|api_key_ciphertext/)
    const reviewConcurrent=await Promise.all([reviewSources.preview(memoryIdentity,paidReviewChoice),reviewSources.preview(memoryIdentity,{...paidReviewChoice,feedback_sources:[...paidReviewChoice.feedback_sources].reverse()})]);assert.ok(reviewConcurrent.every(v=>v.recorded===false));assert.notEqual(reviewConcurrent[0].input_sha256,reviewConcurrent[1].input_sha256)
    await assert.rejects(reviewSources.preview(foreignOptimizationIdentity,paidReviewChoice),e=>e.status===404)
    const reviewEvaluationAnchor=await reviewSources.source(memoryIdentity,{purpose:'evaluate',spec_id:reviewRole.id,run_id:reviewTasks[0].runId}),reviewEvaluation={...paidReviewChoice,purpose:'evaluate',feedback_sources:[],expected_source_sha256:reviewEvaluationAnchor.expected_source_sha256}
    const evaluatedInput=await reviewSources.preview(memoryIdentity,reviewEvaluation);assert.equal(evaluatedInput.source_protocol,'current_task_delivery_v1');assert.equal(JSON.parse(evaluatedInput.messages[1].content).task.status,'cancelled')
    assert.deepEqual(await reviewCounts(),reviewBefore)
    const correctedReviewFeedback=await feedbackSql.change(memoryIdentity,{...reviewTasks[0].body,request_id:randomUUID(),expected_revision:1});assert.equal(correctedReviewFeedback.statement_sha256,reviewTasks[0].receipt.statement_sha256)
    await assert.rejects(reviewSources.preview(memoryIdentity,paidReviewChoice),e=>e.code==='agent_review_feedback_changed')
    const freshReviewChoice={...paidReviewChoice,feedback_sources:[{run_id:reviewTasks[0].runId,feedback_id:correctedReviewFeedback.feedback_id,feedback_sha256:correctedReviewFeedback.feedback_sha256},paidReviewChoice.feedback_sources[1]]}
    await admin.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb,result_text='Synthetic unselected old review delivery' WHERE id=$1",[reviewTasks[0].runId])
    await assert.rejects(reviewSources.preview(memoryIdentity,reviewEvaluation),e=>e.status===409)
    const quotesOnly=await reviewSources.preview(memoryIdentity,freshReviewChoice);assert.equal(JSON.parse(quotesOnly.messages[1].content).task,null);assert.doesNotMatch(quotesOnly.messages[1].content,/Synthetic unselected old review delivery/)
    const paidReviewOwner=await withActor(apiPool,memoryIdentity,async(_db,owner)=>owner)
    await admin.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[paidReviewOwner])
    const epochChangedReview=await reviewSources.preview(memoryIdentity,freshReviewChoice);assert.equal(epochChangedReview.content_sha256,quotesOnly.content_sha256);assert.notEqual(epochChangedReview.input_sha256,quotesOnly.input_sha256)
    await feedbackClosed.change(memoryIdentity,{action:'erase_feedback',request_id:randomUUID(),spec_id:reviewRole.id,run_id:reviewTasks[0].runId,expected_revision:2,expected_feedback_sha256:correctedReviewFeedback.feedback_sha256,confirm:true})
    await assert.rejects(reviewSources.preview(memoryIdentity,freshReviewChoice),e=>e.code==='agent_review_feedback_changed')
    assert.equal((await reviewCounts()).effects,reviewBefore.effects);assert.equal((await reviewCounts()).accepted,reviewBefore.accepted)
    mark("completed")
  }catch(error){
    process.stderr.write("PG18_SYNTHETIC_FAILURE "+phase+" "+(typeof error?.code==="string"?error.code:"test_failure")+"\n")
    throw error
  }finally{
    if(front)await front.close()
    await Promise.all(pools.map(pool=>pool.end()));await admin.end();key.fill(0)
  }
})
