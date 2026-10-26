// Explicit, disposable local browser fixture. Embedded PG + real HTTP/mTLS,
// synthetic employees/keys/model only. Never loads environment DB credentials.
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync,realpathSync} from "node:fs"
import {fileURLToPath} from "node:url"
import path from "node:path"
import {createHash,randomBytes} from "node:crypto"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {createServer as createViteServer} from "vite"
import react from "@vitejs/plugin-react"
import {freshSchemaForTest} from "../../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./native-pg18-embedded.mjs"
import {withDisposableBoundModelTls} from "./bound-model-loopback-tls.mjs"
import {NativeAuthRepository} from "../../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../../src/native-auth-http.mjs"
import {permitNativePg18BusinessUatRequest} from "../../src/native-config-uat-policy.ts"
import {createHandler} from "../../src/http.ts"
import {HttpError,safeAgentSpec} from "../../src/contracts.ts"
import {AutonomousAgentRunRepository} from "../../src/autonomous-agent-run-repository.ts"
import {WorkflowV2RunRepository} from "../../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../../src/workflow-v2-worker.ts"
import {ScheduleInventoryRepository} from "../../src/schedule-inventory-repository.ts"
import {ScheduleDraftRepository} from "../../src/schedule-draft-repository.ts"
import {ScheduleRuntimeRepository} from "../../src/schedule-runtime-repository.ts"
import {ScheduleRuntimeWorker} from "../../src/schedule-runtime-worker.ts"
import {AgentCollaborationRepository} from "../../src/agent-collaboration-repository.ts"
import {AgentReleaseRepository} from "../../src/agent-release-repository.ts"
import {AgentHumanInputRepository} from "../../src/agent-human-input-repository.ts"
import {inspectAgentHumanInputSchema} from "../../src/agent-human-input-audit.ts"
import {AgentMemoryRepository} from "../../src/agent-memory-repository.ts"
import {verifyAgentMemoryCredentials} from "../../src/agent-memory-audit.ts"
import {inspectAgentMemoryContextSchema} from "../../src/agent-memory-context-audit.ts"
import {AgentMemoryDerivedRepository} from "../../src/agent-memory-derived-repository.ts"
import {AgentOptimizationRepository} from "../../src/agent-optimization-repository.ts"
import {inspectAgentOptimizationSchema} from "../../src/agent-optimization-audit.ts"
import {AgentFeedbackRepository} from "../../src/agent-feedback-repository.ts"
import {inspectAgentFeedbackSchema} from "../../src/agent-feedback-audit.ts"
import {AgentMemoryOutcomeRepository} from "../../src/agent-memory-outcome-repository.ts"
import {inspectAgentMemoryOutcomeSchema} from "../../src/agent-memory-outcome-audit.ts"
import {inspectAgentMemoryFailureSourceSchema} from "../../src/agent-memory-failure-source-audit.ts"
import {inspectAgentMemoryDerivedSchema} from "../../src/agent-memory-derived-audit.ts"
import {WorkflowV2ModelDispatch,WorkflowV2ModelLeaseIdentity,verifiedWorkflowV2ModelDispatch} from "../../src/workflow-v2-model-dispatch.ts"
import {WorkflowV2ToolDispatch,WorkflowV2ToolLeaseIdentity,verifiedWorkflowV2ToolDispatch} from "../../src/workflow-v2-tool-dispatch.ts"
import {createWorkflowV2ModelInternalHandler} from "../../src/workflow-v2-model-handler.ts"
import {createWorkflowV2ToolInternalHandler} from "../../src/workflow-v2-tool-handler.ts"
import {workflowV2ModelEffectExecutor} from "../../src/workflow-v2-model-client.ts"
import {workflowV2ToolEffectExecutor} from "../../src/workflow-v2-tool-client.ts"
import {createNativeRunRepository} from "../../src/native-run-repository.ts"
import {AgentSpecRepository} from "../../src/repository.ts"
import {WorkflowRepository} from "../../src/workflow-repository.ts"
import {WorkflowSafeRunRepository} from "../../src/workflow-safe-run-repository.ts"
import {KnowledgeBaseRepository} from "../../src/knowledge-repository.ts"
import {KnowledgeAccessRepository} from "../../src/knowledge-access-repository.ts"
import {KnowledgeContentRepository} from "../../src/knowledge-content-repository.ts"
import {verifyKnowledgeRuntimeSchema,verifyKnowledgeAgentSchema,verifyWorkflowSampleLineageSchema} from "../../src/knowledge-content-privileges.ts"
import {createIsolatedBoundModelInternalHandler} from "../../src/bound-model-internal-handler.ts"
import {boundModelRoute} from "../../src/bound-model-contract.ts"
import {ModelConnectionRepository} from "../../src/model-connection-repository.ts"
import {ToolConnectionRepository} from "../../src/tool-connection-repository.ts"
import {McpConnectionRepository} from "../../src/mcp-connection-repository.ts"
import {createMcpDiscovery} from "../../src/mcp-discovery.ts"
import {createMcpToolExecutor} from "../../src/mcp-call.ts"
import {SmitheryRepository} from "../../src/smithery-repository.ts"
import {AgentPrepareWorker} from "../../src/agent-worker.ts"
import {AgentModelWorker} from "../../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "../../src/bound-lease-identity.ts"
import {createBoundModelMutualTlsClient} from "../../src/bound-model-client.ts"
import {KnowledgeEmbeddingRepository} from "../../src/knowledge-embedding-repository.ts"
import {KnowledgeEmbeddingConsentRepository} from "../../src/knowledge-embedding-consent-repository.ts"
import {KnowledgeIndexRepository} from "../../src/knowledge-index-repository.ts"
import {KnowledgeIndexBroker} from "../../src/knowledge-index-broker.ts"
import {KnowledgeIndexWorker} from "../../src/knowledge-index-worker.ts"
import {KnowledgeQueryRepository} from "../../src/knowledge-query-repository.ts"
import {KnowledgeQueryBroker} from "../../src/knowledge-query-broker.ts"
import {KnowledgeQueryWorker} from "../../src/knowledge-query-worker.ts"
import {embeddingEndpointPolicy} from "../../src/knowledge-embedding-policy.ts"
import {createKnowledgeIndexPrivateClient,createKnowledgeIndexPrivateHandler} from "../../src/knowledge-index-private-tls.ts"
import {createKnowledgeQueryPrivateClient,createKnowledgeQueryPrivateHandler} from "../../src/knowledge-query-private-tls.ts"
import {knowledgeIndexRoute} from "../../src/knowledge-index-contracts.ts"
import {knowledgeQueryRoute} from "../../src/knowledge-query-contracts.ts"
import assert from "node:assert/strict"

if(process.env.AGENT_STUDIO_PG_BROWSER_FIXTURE!=="SYNTHETIC_LOCAL_ONLY")
  throw Error("synthetic_local_browser_fixture_required")
const autonomous=process.env.AGENT_STUDIO_PG_BROWSER_AUTONOMOUS==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_AUTONOMOUS!==undefined&&!autonomous)throw Error("invalid_synthetic_browser_mode")
const workflow=process.env.AGENT_STUDIO_PG_BROWSER_WORKFLOW==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_WORKFLOW!==undefined&&!workflow||autonomous&&workflow)throw Error("invalid_synthetic_browser_mode")
const modern=autonomous||workflow
const scheduling=process.env.AGENT_STUDIO_PG_BROWSER_SCHEDULE==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_SCHEDULE!==undefined&&!scheduling||scheduling&&!workflow)throw Error("invalid_synthetic_schedule_browser_mode")
const collaboration=process.env.AGENT_STUDIO_PG_BROWSER_COLLABORATION==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_COLLABORATION!==undefined&&!collaboration||collaboration&&!scheduling)throw Error("invalid_synthetic_collaboration_browser_mode")
const governance=process.env.AGENT_STUDIO_PG_BROWSER_GOVERNANCE==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_GOVERNANCE!==undefined&&!governance||governance&&process.env.AGENT_STUDIO_PG_BROWSER_RELEASES!=="true")throw Error("invalid_synthetic_governance_browser_mode")
const releases=process.env.AGENT_STUDIO_PG_BROWSER_RELEASES==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_RELEASES!==undefined&&!releases||releases&&!autonomous)throw Error("invalid_synthetic_release_browser_mode")
const semantic=process.env.AGENT_STUDIO_PG_BROWSER_SEMANTIC==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_SEMANTIC!==undefined&&!semantic||semantic&&!modern)throw Error("invalid_synthetic_semantic_browser_mode")
const human=process.env.AGENT_STUDIO_PG_BROWSER_HUMAN==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_HUMAN!==undefined&&!human||human&&!modern)throw Error("invalid_synthetic_human_browser_mode")
const memory=process.env.AGENT_STUDIO_PG_BROWSER_MEMORY==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_MEMORY!==undefined&&!memory||memory&&(!human||!autonomous))throw Error("invalid_synthetic_memory_browser_mode")
const memoryRuntime=process.env.AGENT_STUDIO_PG_BROWSER_MEMORY_RUNTIME==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_MEMORY_RUNTIME!==undefined&&!memoryRuntime||memoryRuntime&&!memory)throw Error("invalid_synthetic_memory_runtime_browser_mode")
const outcomeMemory=process.env.AGENT_STUDIO_PG_BROWSER_OUTCOME_MEMORY==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_OUTCOME_MEMORY!==undefined&&!outcomeMemory||outcomeMemory&&(!memory||!human||!autonomous))throw Error("invalid_synthetic_outcome_memory_browser_mode")
const derivedMemory=process.env.AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_DERIVED_MEMORY!==undefined&&!derivedMemory||derivedMemory&&!memoryRuntime&&!outcomeMemory)throw Error("invalid_synthetic_derived_memory_browser_mode")
if(outcomeMemory&&!derivedMemory)throw Error("outcome_memory_requires_synthetic_derived_storage")
const failureSource=process.env.AGENT_STUDIO_PG_BROWSER_FAILURE_SOURCE==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_FAILURE_SOURCE!==undefined&&!failureSource||failureSource&&!outcomeMemory)throw Error("invalid_synthetic_failure_source_browser_mode")
const feedback=process.env.AGENT_STUDIO_PG_BROWSER_FEEDBACK==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_FEEDBACK!==undefined&&!feedback||feedback&&!failureSource)throw Error("invalid_synthetic_feedback_browser_mode")
const optimization=process.env.AGENT_STUDIO_PG_BROWSER_OPTIMIZATION==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_OPTIMIZATION!==undefined&&!optimization||optimization&&!feedback)throw Error("invalid_synthetic_optimization_browser_mode")
const fullHumanDelivery="已核对本人方案，交付完整合成报告。\n".repeat(400)
const root=path.resolve(fileURLToPath(new URL("../../../../",import.meta.url)))
const parent=path.join(root,".tmp","pg-migration-completion")
mkdirSync(parent,{recursive:true})
const scratch=mkdtempSync(path.join(parent,"native-run-browser-"))
if(path.dirname(realpathSync(scratch))!==realpathSync(parent))throw Error("unsafe_browser_fixture_temp")
const origin="http://localhost:17443"
const key=randomBytes(32),db=await PGlite.create({extensions:{vector}})
let queue=Promise.resolve(),server,vite,stop
const stopped=new Promise(resolve=>{stop=resolve})
// PGlite has one SQL connection: serialize whole transactions, including
// simultaneous browser reads, rather than interleaving employee role state.
const pool={knowledgeSharing:modern,knowledgeEmbeddingSettings:semantic,knowledgeEmbeddingConsent:semantic,knowledgeIndexRuntime:semantic,knowledgeQueryRuntime:semantic,knowledgeToolRuntime:semantic,async connect(){
  const before=queue;let release
  queue=new Promise(resolve=>{release=resolve});await before
  return {query:(sql,values=[])=>{
    if(failureSource&&state.failPreparation&&sql==='SELECT status FROM agentstudio.users WHERE id=$1::uuid'){
      state.failPreparation=false;throw new HttpError(409,'synthetic_worker_preparation_failed')
    }
    if(feedback&&state.feedbackFailLesson&&sql.startsWith("INSERT INTO agentstudio.agent_feedback_lessons(")){state.feedbackFailLesson=false;throw Error("synthetic_feedback_lesson_storage_fault")}
    return db.query(sql,values)
  },release}
}}
const policy={configurationWrites:true,employeeProvisioning:true,runApprovalUat:true,
  boundModelExecutionUat:true,modelProbeUat:true,autonomousAgentUat:autonomous||scheduling,workflowV2ExecutionUat:workflow,scheduleRuntimeUat:scheduling}
const state={submissions:0,submitHashes:[],configHashes:[],configRequests:0,generated:0,httpCalls:0,mcpCalls:0,mcpDiscoveries:0,smitheryWrites:0,drop:false,configDrop:false,contentDrop:false,allowed:true,configAllowed:true}
Object.assign(state,{semanticAllowed:semantic,semanticDrop:false,queryDrop:false,queryPosts:0,settingsPosts:0,indexEmbeddings:0,queryEmbeddings:0,queryInputs:[],failQuery:false,decisionDrop:false,decisionHashes:[],semanticModelPrompts:0})
Object.assign(state,{scheduleDrop:false,scheduleHashes:[]})
Object.assign(state,{collaborationDrop:false,collaborationHashes:[]})
Object.assign(state,{releaseDrop:false,releaseHashes:[],humanDrop:false,humanHashes:[],humanConfirms:0,humanModelCalls:0})
Object.assign(state,{memoryDrop:false,memoryHashes:[],memoryConfirms:0})
Object.assign(state,{memoryPrompts:0,failPreparation:false})
Object.assign(state,{outcomeAllowed:outcomeMemory,outcomeDrop:false,outcomeCapabilitiesDrop:false,outcomeHashes:[],outcomeConfirms:0})
Object.assign(state,{derivedAllowed:derivedMemory,derivedDrop:false,derivedCapabilitiesDrop:false,derivedHashes:[],derivedConfirms:0})
Object.assign(state,{feedbackAllowed:feedback,feedbackDrop:false,feedbackCapabilitiesDrop:false,feedbackHashes:[],feedbackConfirms:0,feedbackFailLesson:false})
Object.assign(state,{optimizationAllowed:optimization,optimizationDrop:false,optimizationCapabilitiesDrop:false,optimizationHashes:[],optimizationConfirms:0})
const managedRemote=new Map()
try{
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db)
  const load=relative=>readFileSync(path.join(root,relative),"utf8")
  await db.exec(reviewedNativeSqlForEmbeddedTest(load("db/postgres/010_pg18_native_auth_proposed.sql")))
  await db.exec("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic browser predecessor')")
  await db.exec(load("db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql")
    .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  for(const migration of ["pg_v9_025_workflow_model_identity.sql","pg_v9_026_workflow_tool_identity.sql","pg_v9_027_workflow_agent_identity.sql","pg_v9_028_autonomous_agent_identity.sql","pg_v9_029_mcp_connections.sql","pg_v9_030_mcp_tool_identity.sql","pg_v9_031_smithery_managed.sql","pg_v9_032_knowledge_access.sql","pg_v9_033_knowledge_content.sql","pg_v9_034_knowledge_runtime.sql"])
    await db.exec(load("db/postgres/migrations/"+migration).split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  for(const migration of ["pg_v9_035_knowledge_embedding_state.sql","pg_v9_036_knowledge_embedding_consent.sql","pg_v9_037_knowledge_index_runtime.sql","pg_v9_038_knowledge_query_runtime.sql","pg_v9_039_knowledge_execution_source.sql","pg_v9_040_approved_semantic_tools.sql","pg_v9_041_keyword_observations.sql","pg_v9_042_agent_knowledge_observations.sql","pg_v9_043_workflow_sample_lineage.sql"])
    await db.exec(load("db/postgres/migrations/"+migration).split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  const auth=new NativeAuthRepository(pool)
  if(scheduling||releases||human)await db.exec(load("db/postgres/migrations/pg_v9_044_schedule_execution.sql").split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  if(collaboration||releases||human)await db.exec(load("db/postgres/migrations/pg_v9_045_agent_collaboration.sql").split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  if(releases||human)await db.exec(load("db/postgres/migrations/pg_v9_046_agent_releases.sql").split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  if(governance||human)await db.exec(load("db/postgres/migrations/pg_v9_047_employee_governance.sql"))
  if(human){await db.exec(load("db/postgres/migrations/pg_v9_048_agent_human_input.sql"));assert.equal(await inspectAgentHumanInputSchema(pool),true)}
  if(memory){await db.exec(load("db/postgres/migrations/pg_v9_049_agent_memory.sql"));assert.equal(await verifyAgentMemoryCredentials(db),true)}
  if(memoryRuntime||outcomeMemory){await db.exec(load("db/postgres/migrations/pg_v9_050_agent_memory_context.sql"));assert.equal(await inspectAgentMemoryContextSchema(pool),true)}
  if(derivedMemory){await db.exec(load("db/postgres/migrations/pg_v9_051_agent_memory_derived.sql"));assert.equal(await inspectAgentMemoryDerivedSchema(pool),true)}
  if(outcomeMemory){await db.exec(load("db/postgres/migrations/pg_v9_052_agent_memory_outcome.sql"));assert.equal(await inspectAgentMemoryOutcomeSchema(pool),true)}
  if(failureSource){await db.exec(load("db/postgres/migrations/pg_v9_053_agent_memory_failure_source.sql"));assert.equal(await inspectAgentMemoryFailureSourceSchema(pool),true)}
  if(feedback){await db.exec(load("db/postgres/migrations/pg_v9_054_agent_feedback.sql"));assert.equal(await inspectAgentFeedbackSchema(pool),true)}
  if(optimization){await db.exec(load("db/postgres/migrations/pg_v9_055_agent_optimization.sql"));assert.equal(await inspectAgentOptimizationSchema(pool),true)}
  if(modern)await verifyKnowledgeRuntimeSchema(pool)
  await verifyKnowledgeAgentSchema(pool)
  await verifyWorkflowSampleLineageSchema(pool)
  await auth.provisionInitialAdmin({email:"alice@example.com",password:"SyntheticAlicePassword#2026",display_name:"Browser Alice"})
  const admin=await auth.login("alice@example.com","SyntheticAlicePassword#2026")
  await auth.provisionEmployee(admin.token,{email:"bob@example.com",password:"SyntheticBobPassword#2026",display_name:"Browser Bob"})
  const agents=new AgentSpecRepository(pool),models=new ModelConnectionRepository(pool,key)
  for(const [email,password,name] of [["alice@example.com","SyntheticAlicePassword#2026","Alice"],
    ["bob@example.com","SyntheticBobPassword#2026","Bob"]]){
    const session=await auth.login(email,password),profile=await auth.getSessionProfile(session.token)
    const connection=await models.create(profile.identity,{name:name+" synthetic model",provider:"openai",
      base_url:"https://api.openai.com/v1",api_key:"SyntheticBrowserOnlyCredential0123456789",enabled:true,models:["gpt-4.1-mini"]})
    // Fixture setup only: no external probe or credentials are used.
    await db.query("UPDATE agentstudio.model_connections SET status='ok' WHERE id=$1",[connection.id])
    if(scheduling||releases){const selected=await models.create(profile.identity,{name:name+" schedule model B",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticBrowser"+name+"ScheduleBKey",enabled:true,models:["synthetic-schedule-b"]})
      await db.query("UPDATE agentstudio.model_connections SET status='ok' WHERE id=$1",[selected.id])
      if(collaboration&&name==="Alice")state.collaborationAlternative={connection_id:selected.id,connection_revision:selected.revision,model_id:"synthetic-schedule-b"}
      if(releases&&name==="Alice")state.releaseAlternative={connection_id:selected.id,connection_revision:selected.revision,model_id:"synthetic-schedule-b"}}
    if(semantic)await models.create(profile.identity,{name:name+" semantic model",provider:"openai",base_url:"https://api.openai.com/v1",api_key:"SyntheticBrowser"+name+"EmbeddingKey0123456789",enabled:true,models:["synthetic-embedding"]})
    const createdRole=await agents.create(profile.identity,name+" Browser Agent",safeAgentSpec({goal:"Synthetic local browser task",task_scope:"Synthetic only",
      deliverables:["A summary"],task_plan:["Prepare summary"],done_criteria:["Disclose synthetic source"],tools:modern?["calculate"]:[],
      model_binding:{connection_id:connection.id,connection_revision:connection.revision,model_id:"gpt-4.1-mini"}}))
    if(optimization&&name==="Alice"){state.optimizationRole=createdRole.id;state.optimizationActor=profile.identity;state.optimizationModel=connection.id}
    if(collaboration&&name==="Alice"){state.collaborationRole=createdRole.id;state.collaborationActor=profile.identity}
    if(releases&&name==="Alice"){state.releaseRole=createdRole.id;state.releaseActor=profile.identity;state.releaseDefaultModel=connection.id}
    if(human&&workflow&&name==="Alice")await new WorkflowRepository(pool).create(profile.identity,"Synthetic owner-reviewed Workflow",{
      version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
        {id:"agent",type:"agent",data:{title:"OwnedAgent",agent_binding:{spec_id:createdRole.id,spec_revision:createdRole.revision},max_steps:3,require_plan_review:true},position:{x:220,y:0}},
        {id:"end",type:"end",data:{title:"End"},position:{x:440,y:0}}],
      edges:[{id:"s-a",source:"start",target:"agent"},{id:"a-e",source:"agent",target:"end"}]})
    if(human&&workflow&&name==="Alice")await new WorkflowRepository(pool).create(profile.identity,"Synthetic complete final Workflow",{
      version:2,nodes:[{id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
        {id:"end",type:"end",data:{title:"End",output_template:"{{input}}".repeat(12)},position:{x:220,y:0}}],
      edges:[{id:"s-e",source:"start",target:"end"}]})
    if(modern)await new ToolConnectionRepository(pool,key).create(profile.identity,{name:name+" synthetic HTTP",description:"Lookup synthetic evidence; params: query",
      url:"https://tools.example.com/lookup",method:"POST",headers:[],body_template:"{{input}}",timeout_s:5,enabled:true})
  }
  const broker=new OwnerBoundModelDispatch(pool,key,async(_material,input)=>{
    if(input.knowledgeEvidence?.length)state.singleEvidence=(state.singleEvidence??0)+1
    state.generated++;return "Browser synthetic bound result"
  })
  const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(pool),broker)
  const indexBroker=semantic?new KnowledgeIndexBroker(pool,pool,key,async material=>{
    assert.equal(material.api_key,"SyntheticBrowserAliceEmbeddingKey0123456789");assert.equal(material.model_name,"synthetic-embedding")
    state.indexEmbeddings++;return material.input.map(()=>[1,0])
  },{approvedForIsolatedUat:true}):null
  const queryBroker=semantic?new KnowledgeQueryBroker(pool,pool,key,async material=>{
    assert.equal(material.api_key,"SyntheticBrowserBobEmbeddingKey0123456789");assert.equal(material.model_name,"synthetic-embedding");assert.equal(material.input.length,1)
    state.queryEmbeddings++;state.queryInputs.push(structuredClone(material.input))
    if(state.failQuery)throw Error("synthetic_query_provider_failure")
    return [[1,0]]
  },{approvedForIsolatedUat:true}):null
  const dispatch=modern?{
    model:verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(pool),new WorkflowV2ModelDispatch(pool,key,async(_material,prompt)=>{if(!workflow)throw Error("direct_fallback_forbidden");if(prompt.includes("BROWSER_SEMANTIC_SOURCE"))state.semanticModelPrompts++;state.generated++;return "Browser synthetic workflow model output"},pool,{
      nodeDebugExecutor:workflow?async()=>{state.generated++;return "Browser synthetic node debug result"}:undefined,
      allowAutonomousExecution:autonomous||scheduling,allowAgentExecution:workflow,allowMemoryExecution:memoryRuntime,async agentExecutor(material,prompt){state.generated++;if(scheduling||releases){assert.equal(material.api_key,"SyntheticBrowserAliceScheduleBKey");assert.equal(material.model_id,"synthetic-schedule-b");state.scheduleModelCalls=(state.scheduleModelCalls??0)+1}const plan=JSON.parse(prompt),http=plan.role.http_tools?.[0],mcp=plan.role.mcp_tools?.[0];if(outcomeMemory){assert.equal(Object.hasOwn(plan,"memory_context"),false);assert.equal(plan.human_input.require_plan_review,false);state.humanModelCalls++;return JSON.stringify({action:"answer",answer:fullHumanDelivery})}if(memoryRuntime){assert.equal(plan.task,"整理财务报告");assert.deepEqual(plan.memory_context.saved_user_instructions,["【用户指令】财务报告使用中文"]);state.memoryPrompts++;return JSON.stringify({action:"answer",answer:fullHumanDelivery})}if(human){state.humanModelCalls++;if(!plan.human_input.require_plan_review)return JSON.stringify(plan.round===1?{action:"ask_user",question:"合成报告的截止日是哪天？",note:"PRIVATE_HUMAN_PROVIDER_NOTE"}:{action:"answer",answer:fullHumanDelivery});return JSON.stringify(plan.round===1?{action:"answer",answer:"初稿：按本人截止日整理证据。"}:plan.round===2?{action:"answer",answer:"修订稿：仅包括已核对证据。"}:{action:"answer",answer:fullHumanDelivery})}if(plan.role.allowed_tools?.includes("knowledge_search")){if(plan.round>1){assert.match(prompt,/BROWSER_SEMANTIC_SOURCE/);state.semanticModelPrompts++}return JSON.stringify(plan.round===1?{action:"tool",tool:"knowledge_search",params:{query:"tool wording"}}:{action:"answer",answer:"Browser synthetic semantic Agent answer"})}return JSON.stringify(plan.round===1?
        {action:"tool",tool:mcp?.name??http?.name??"calculate",params:mcp||http?{query:"Synthetic owner evidence"}:{expression:"2+2"},think:workflow?"BROWSER_PRIVATE_PLAN":undefined,note:workflow?"BROWSER_PRIVATE_NOTE":undefined}:
        {action:"answer",answer:workflow?"Browser synthetic Workflow result 4":"Browser synthetic autonomous result 4",think:workflow?"BROWSER_PRIVATE_PLAN":undefined,note:workflow?"BROWSER_PRIVATE_NOTE":undefined})}})),
    ...(semantic?{index:claim=>indexBroker.dispatch(claim),query:claim=>queryBroker.dispatch(claim)}:{}),
    tool:verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(pool),new WorkflowV2ToolDispatch(pool,key,{
      async http(){state.httpCalls++;return "Browser synthetic HTTP observation 4"},
      mcp:createMcpToolExecutor(async(_material,wire)=>{if(wire.body.method!=="tools/call")throw Error("unexpected_synthetic_mcp_call")
        state.mcpCalls++;return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result:{content:[{type:"text",text:"Browser synthetic MCP observation 4"}]}})}}),
    },pool,{allowAutonomousExecution:autonomous||scheduling,allowAgentExecution:workflow,allowKnowledgeExecution:semantic,allowMemoryExecution:memoryRuntime})),
  }:verified
  let scheduledAgentMode=false
  const handlerFactory=config=>{const common={...config,executionMode:workflow?"workflow_native_v2":"agent_native_v2"},
    model=createWorkflowV2ModelInternalHandler({...common,dispatch:config.dispatch.model}),tool=createWorkflowV2ToolInternalHandler({...common,dispatch:config.dispatch.tool})
    const scheduleModel=scheduling?createWorkflowV2ModelInternalHandler({...config,executionMode:"agent_native_v2",dispatch:config.dispatch.model}):null,
      scheduleTool=scheduling?createWorkflowV2ToolInternalHandler({...config,executionMode:"agent_native_v2",dispatch:config.dispatch.tool}):null
    const single=createIsolatedBoundModelInternalHandler({...config,dispatch:verified}),index=semantic?createKnowledgeIndexPrivateHandler({...config,dispatch:config.dispatch.index}):null,query=semantic?createKnowledgeQueryPrivateHandler({...config,dispatch:config.dispatch.query}):null
    return (req,res)=>(req.url===boundModelRoute?single:semantic&&req.url===knowledgeIndexRoute?index:semantic&&req.url===knowledgeQueryRoute?query:req.url==="/__internal/v2/workflow-tool/dispatch"?(scheduledAgentMode?scheduleTool:tool):(scheduledAgentMode?scheduleModel:model))(req,res)}
  await withDisposableBoundModelTls(dispatch,async tls=>{
    const prepare=new AgentPrepareWorker(pool,"browser-synthetic-prepare")
    const model=new AgentModelWorker(pool,"browser-synthetic-model",{async generate(){throw Error("shared_fallback_forbidden")}},
      {boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(tls)})
    let workers=0
    const adapters=modern?[workflowV2ModelEffectExecutor(tls),workflowV2ToolEffectExecutor(tls)]:[]
    const indexWorker=semantic?new KnowledgeIndexWorker(pool,createKnowledgeIndexPrivateClient(tls),{approvedForIsolatedUat:true}):null
    const queryWorker=semantic?new KnowledgeQueryWorker(pool,createKnowledgeQueryPrivateClient(tls),{approvedForIsolatedUat:true}):null
    const tickAutonomous=(scheduledAgent=false)=>new WorkflowV2Worker(pool,"browser-autonomous-"+(++workers),{executionMode:workflow&&!scheduledAgent?"workflow_native_v2":"agent_native_v2",agentExecutionApproved:true,scheduleExecutionApproved:scheduling,humanInputApproved:human,memoryExecutionApproved:memoryRuntime,outcomeMemoryApproved:outcomeMemory,
      executor:{supports:request=>adapters.some(adapter=>adapter.supports(request)),execute(request,lease){return adapters.find(adapter=>adapter.supports(request)).execute(request,lease)}}}).tick()
    let native,backend
    const configure=()=>{native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,
      allowConfigurationWrites:state.configAllowed,allowEmployeeProvisioning:state.configAllowed,allowEmployeeGovernance:governance,
      allowMcpDiscovery:modern&&state.configAllowed,
      allowMcpToolExecution:modern&&state.configAllowed&&state.allowed,
      allowSmitheryManagement:modern&&state.configAllowed,
      allowKnowledgeSharing:modern&&state.configAllowed,
      allowKnowledgeEmbeddingSettings:semantic&&state.semanticAllowed&&state.configAllowed,allowKnowledgeEmbeddingConsent:semantic&&state.semanticAllowed&&state.configAllowed,
      allowKnowledgeIndexRuntime:semantic&&state.semanticAllowed&&state.configAllowed,allowKnowledgeQueryRuntime:semantic&&state.semanticAllowed&&state.configAllowed,
      allowKnowledgeToolExecution:semantic&&state.semanticAllowed&&state.configAllowed,
      allowRunSubmission:state.allowed,allowBoundRunSubmission:state.allowed,allowAutonomousAgentSubmission:(autonomous||scheduling)&&state.allowed,allowWorkflowV2Submission:workflow&&state.allowed,allowScheduleRuntime:scheduling&&state.allowed,
      allowAgentCollaboration:collaboration||optimization,
      allowAgentOptimization:optimization,allowAgentOptimizationAcceptance:state.optimizationAllowed&&state.configAllowed,
      allowAgentReleases:releases,allowAgentHumanInput:human,allowAgentMemory:memory,allowAgentMemoryRuntime:memoryRuntime,
      allowAgentFeedback:feedback,allowAgentFeedbackSubmission:state.feedbackAllowed,allowAgentFeedbackLessons:state.feedbackAllowed,
      allowAgentOutcomeMemory:outcomeMemory,allowAgentOutcomeMemoryAdmission:state.outcomeAllowed,
      allowAgentDerivedMemory:derivedMemory,allowAgentDerivedMemoryWrites:state.derivedAllowed,
      businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(req.url.split("?")[0],req.method,
          {...policy,configurationWrites:state.configAllowed,agentOutcomeMemoryUat:state.outcomeAllowed,agentDerivedMemoryUat:state.derivedAllowed,mcpDiscoveryUat:modern,smitheryManagementUat:modern,knowledgeSharingUat:modern,knowledgeEmbeddingSettingsUat:semantic&&state.semanticAllowed,knowledgeEmbeddingConsentUat:semantic&&state.semanticAllowed,
            knowledgeIndexRuntimeUat:semantic&&state.semanticAllowed,knowledgeQueryRuntimeUat:semantic&&state.semanticAllowed,runApprovalUat:state.allowed,boundModelExecutionUat:state.allowed,autonomousAgentUat:(autonomous||scheduling)&&state.allowed,workflowV2ExecutionUat:workflow&&state.allowed,scheduleRuntimeUat:scheduling&&state.allowed})){
          res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return
        }
        return backend(req,res)
      }})}
    configure()
    const runs=autonomous?new AutonomousAgentRunRepository(pool,{allowMcpExecution:true,allowKnowledgeExecution:semantic,allowHumanInput:human,allowMemory:memoryRuntime,allowOutcomeMemory:state.outcomeAllowed}):workflow?new WorkflowV2RunRepository(pool,"workflow_native_v2",{allowMcpExecution:true,allowKnowledgeExecution:semantic,allowHumanInput:human}):createNativeRunRepository(pool,policy)
    const submit=runs.submit.bind(runs)
    runs.submit=async(identity,specId,body)=>{
      state.submitHashes.push(createHash("sha256").update(JSON.stringify({specId,...body})).digest("hex"))
      return submit(identity,specId,body)
    }
    if(semantic){const decide=runs.decide.bind(runs);runs.decide=async(identity,id,body)=>{
      state.decisionHashes.push(createHash("sha256").update(JSON.stringify(body)).digest("hex"));return decide(identity,id,body)
    }}
    if(workflow){const submitDebug=runs.submitNodeDebug.bind(runs);runs.submitNodeDebug=async(identity,id,body)=>{
      state.submitHashes.push(createHash("sha256").update(JSON.stringify({workflowId:id,...body})).digest("hex"));return submitDebug(identity,id,body)
    }}
    const flows=new WorkflowRepository(pool),create=flows.createIdempotent.bind(flows)
    flows.createIdempotent=async(identity,requestId,name,graph)=>{state.configHashes.push(createHash("sha256").update(JSON.stringify({requestId,name,graph})).digest("hex"));return create(identity,requestId,name,graph)}
    const schedules=new ScheduleRuntimeRepository(pool,{enabled:scheduling,allowHumanInput:human}),activate=schedules.activate.bind(schedules)
    schedules.activate=async(identity,id,body)=>{state.scheduleHashes.push(createHash("sha256").update(JSON.stringify(body)).digest("hex"));return activate(identity,id,body)}
    const collaborations=new AgentCollaborationRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email),{enabled:collaboration}),changeCollaboration=collaborations.change.bind(collaborations)
    collaborations.change=async(identity,id,body)=>{state.collaborationHashes.push(createHash("sha256").update(JSON.stringify(body)).digest("hex"));return changeCollaboration(identity,id,body)}
    const releaseRepo=new AgentReleaseRepository(pool,{enabled:state.configAllowed,allowAcceptance:state.allowed&&autonomous}),changeRelease=releaseRepo.change.bind(releaseRepo)
    releaseRepo.change=async(identity,id,body)=>{state.releaseHashes.push({action:body.action,sha256:createHash("sha256").update(JSON.stringify(body)).digest("hex")});return changeRelease(identity,id,body)}
    const humanRepository=mode=>{
      const repository=new AgentHumanInputRepository(pool,mode,{allowResponses:state.allowed&&state.configAllowed}),respond=repository.change.bind(repository)
      repository.change=async(identity,id,body)=>{state.humanHashes.push(createHash("sha256").update(JSON.stringify(body)).digest("hex"));return respond(identity,id,body)}
      return repository
    }
    const memoryRepository=new AgentMemoryRepository(pool,{allowWrites:memory}),remember=memoryRepository.change.bind(memoryRepository)
    memoryRepository.change=async(identity,body)=>{state.memoryHashes.push({action:body.action,sha256:createHash("sha256").update(JSON.stringify(body)).digest("hex")});return remember(identity,body)}
    const outcomeRepository=new AgentMemoryOutcomeRepository(pool),stopOutcome=outcomeRepository.stop.bind(outcomeRepository)
    outcomeRepository.stop=async(identity,body,confirmOnly=false)=>{if(!confirmOnly)state.outcomeHashes.push(createHash("sha256").update(JSON.stringify(body)).digest("hex"));return stopOutcome(identity,body,confirmOnly)}
    const derivedRepository=new AgentMemoryDerivedRepository(pool,{allowWrites:derivedMemory}),changeDerived=derivedRepository.change.bind(derivedRepository)
    derivedRepository.change=async(identity,body)=>{state.derivedHashes.push({action:body.action,sha256:createHash("sha256").update(JSON.stringify(body)).digest("hex")});return changeDerived(identity,body)}
    const feedbackRepository={
      status:(...args)=>new AgentFeedbackRepository(pool).status(...args),
      confirm:(...args)=>new AgentFeedbackRepository(pool).confirm(...args),
      change(identity,body){state.feedbackHashes.push({action:body.action,sha256:createHash("sha256").update(JSON.stringify(body)).digest("hex")});return new AgentFeedbackRepository(pool,{allowSubmit:state.configAllowed&&state.feedbackAllowed,allowLessonStorage:state.configAllowed&&state.feedbackAllowed}).change(identity,body)}
    }
    backend=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("native_cookie_required")},
      authenticateRequest:req=>native.authenticateRequest(req),repository:agents,
      runRepository:createNativeRunRepository(pool,policy),...(autonomous?{autonomousAgentRunRepository:runs}:workflow?{workflowV2RunRepository:runs}:{runRepository:runs}),workflowRepository:flows,
      ...(scheduling?{scheduleInventory:new ScheduleInventoryRepository(pool),scheduleDraftRepository:new ScheduleDraftRepository(pool),scheduleRuntimeRepository:schedules}:{}),
      ...(collaboration||optimization?{agentCollaborationRepository:collaborations}:{}),
      ...(optimization?{agentOptimizationRepository:{list:(...args)=>new AgentOptimizationRepository(pool).list(...args),preview:(...args)=>new AgentOptimizationRepository(pool).preview(...args),confirm:(...args)=>new AgentOptimizationRepository(pool).confirm(...args),accept(identity,body){state.optimizationHashes.push(createHash("sha256").update(JSON.stringify(body)).digest("hex"));return new AgentOptimizationRepository(pool,{allowAcceptance:state.optimizationAllowed&&state.configAllowed}).accept(identity,body)}}}:{}),
      ...(releases?{agentReleaseRepository:releaseRepo}:{}),
      ...(human?{agentHumanInputRepository:humanRepository("agent_native_v2"),workflowHumanInputRepository:humanRepository("workflow_native_v2")}:{}),
      ...(memory?{agentMemoryRepository:memoryRepository}:{}),
      ...(feedback?{agentFeedbackRepository:feedbackRepository}:{}),
      ...(outcomeMemory?{agentOutcomeMemoryRepository:outcomeRepository}:{}),
      ...(derivedMemory?{agentDerivedMemoryRepository:derivedRepository}:{}),
      workflowSafeRunRepository:new WorkflowSafeRunRepository(pool),knowledgeRepository:new KnowledgeBaseRepository(pool),
      ...(modern?{knowledgeAccessRepository:new KnowledgeAccessRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),knowledgeContentRepository:new KnowledgeContentRepository(pool)}:{}),
      ...(semantic?{knowledgeEmbeddingRepository:new KnowledgeEmbeddingRepository(pool,embeddingEndpointPolicy({})),knowledgeEmbeddingConsentRepository:new KnowledgeEmbeddingConsentRepository(pool),
        knowledgeIndexRepository:new KnowledgeIndexRepository(pool),knowledgeQueryRepository:new KnowledgeQueryRepository(pool)}:{}),
      modelConnectionRepository:models,toolConnectionRepository:new ToolConnectionRepository(pool,key),
      ...(modern?{smitheryRepository:new SmitheryRepository(pool,key,pool,async(_credential,wire)=>{
        if(wire.path==="/namespaces")return {status:200,data:{namespaces:["browser-own"]}}
        if(wire.path.startsWith("/servers?"))return {status:200,data:{servers:[{qualifiedName:"vendor/managed-lookup",displayName:"Synthetic managed MCP",description:"Synthetic only",isDeployed:true}]}}
        if(wire.method==="GET")return {status:managedRemote.has(wire.path)?200:404,data:managedRemote.has(wire.path)?{...managedRemote.get(wire.path),status:{state:"connected"}}:null}
        state.smitheryWrites++
        if(wire.method==="DELETE"){managedRemote.delete(wire.path);return {status:204,data:null}}
        const row={connectionId:wire.path.split("/").at(-1),transport:"http",metadata:wire.body.metadata,status:{state:"auth_required",setupUrl:"https://auth.smithery.ai/setup?state=synthetic"}}
        managedRemote.set(wire.path,row);return {status:201,data:row}
      })}:{}),
      ...(modern?{mcpConnectionRepository:new McpConnectionRepository(pool,key,pool),mcpDiscovery:createMcpDiscovery(async(_material,wire)=>{
        if(wire.body.method!=="tools/list")throw Error("unexpected_synthetic_mcp_method")
        state.mcpDiscoveries++
        return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result:{tools:[{name:"synthetic_lookup",description:"Synthetic MCP tool",inputSchema:{type:"object"}}]}})}
      })}:{})})
    server=createServer((req,res)=>{void(async()=>{
      if(req.url.startsWith("/__fixture/")){
        if(req.headers["x-agentstudio-synthetic-fixture"]!=="1"){
          res.writeHead(403);res.end();return
        }
        let output
        if(req.url==="/__fixture/state"&&req.method==="GET"){
          const c=await pool.connect()
          try{output={submissions:state.submissions,submitHashes:state.submitHashes,configHashes:state.configHashes,configRequests:state.configRequests,generated:state.generated,singleEvidence:state.singleEvidence??0,httpCalls:state.httpCalls,mcpCalls:state.mcpCalls,mcpDiscoveries:state.mcpDiscoveries,smitheryWrites:state.smitheryWrites,
            ...(scheduling?{scheduleHashes:state.scheduleHashes,scheduleModelCalls:state.scheduleModelCalls??0}:{}),
            ...(collaboration?{collaborationHashes:state.collaborationHashes,collaborationModelPreserved:(await c.query("SELECT spec->'model_binding'->>'connection_id'=$2::text AS preserved FROM agentstudio.agent_specs WHERE id=$1",[state.collaborationRole,state.collaborationAlternative.connection_id])).rows[0].preserved}:{}),
            ...(releases?{releaseHashes:state.releaseHashes,releaseModelCalls:state.scheduleModelCalls??0,releaseRole:state.releaseRole,releaseCurrent:(await c.query("SELECT spec->>'goal' AS goal,spec->'model_binding'->>'connection_id'=$2::text AS default_model FROM agentstudio.agent_specs WHERE id=$1",[state.releaseRole,state.releaseDefaultModel])).rows[0],
              releaseVersions:(await c.query("SELECT status,count(*)::int AS n FROM agentstudio.agent_release_versions GROUP BY status ORDER BY status")).rows,
              releaseAcceptances:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_release_acceptance_runs")).rows[0].n}:{}),
            ...(modern?{mcpConnections:(await c.query("SELECT count(*)::int AS n FROM agentstudio.mcp_connections")).rows[0].n}:{}),
            ...(human?{humanHashes:state.humanHashes,humanConfirms:state.humanConfirms,humanModelCalls:state.humanModelCalls,humanReceipts:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_human_input_responses")).rows[0].n}:{}),
            ...(memory?{memoryHashes:state.memoryHashes,memoryConfirms:state.memoryConfirms,memoryEntries:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_entries")).rows[0].n,
              memoryReceipts:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_receipts")).rows[0].n}:{}),
            ...(memoryRuntime?{memoryPrompts:state.memoryPrompts,memoryContexts:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_run_contexts")).rows[0].n}:{}),
            ...(derivedMemory?{derivedHashes:state.derivedHashes,derivedConfirms:state.derivedConfirms,derivedEntries:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_derived_entries")).rows[0].n,derivedReceipts:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_derived_receipts")).rows[0].n}:{}),
            ...(outcomeMemory?{outcomeHashes:state.outcomeHashes,outcomeConfirms:state.outcomeConfirms,outcomeConsents:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_outcome_consents")).rows[0].n,outcomeStops:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_outcome_stops")).rows[0].n,outcomeResults:(await c.query("SELECT decision FROM agentstudio.agent_memory_outcome_results ORDER BY created_at")).rows.map(row=>row.decision)}:{}),
            ...(feedback?{feedbackHashes:state.feedbackHashes,feedbackConfirms:state.feedbackConfirms,feedbackBodies:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_feedback_bodies")).rows[0].n,feedbackLessons:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_feedback_lessons")).rows[0].n,feedbackReceipts:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_feedback_receipts")).rows[0].n,feedbackResults:(await c.query("SELECT decision FROM agentstudio.agent_feedback_lesson_results ORDER BY created_at")).rows.map(v=>v.decision)}:{}),
            ...(optimization?{optimizationHashes:state.optimizationHashes,optimizationConfirms:state.optimizationConfirms,optimizationRole:state.optimizationRole,optimizationLinks:(await c.query("SELECT count(*)::integer AS n FROM agentstudio.agent_optimization_links")).rows[0].n,optimizationIntents:(await c.query("SELECT count(*)::integer AS n FROM agentstudio.agent_optimization_intents")).rows[0].n,
              optimizationCurrent:(await c.query("SELECT name,revision,spec->>'goal' AS goal,spec->>'task_scope' AS scope,spec->'deliverables' AS deliverables,spec->'task_plan' AS plan,spec->'done_criteria' AS criteria,spec->'tools' AS tools,spec->'model_binding'->>'connection_id'=$2::text AS model_preserved FROM agentstudio.agent_specs WHERE id=$1",[state.optimizationRole,state.optimizationModel])).rows[0],optimizationHistory:(await c.query("SELECT b.kind AS before_kind,a.kind AS after_kind,b.spec_revision AS before_revision,a.spec_revision AS after_revision FROM agentstudio.agent_optimization_links l JOIN agentstudio.agent_collaboration_revisions b ON b.id=l.before_revision_id JOIN agentstudio.agent_collaboration_revisions a ON a.id=l.after_revision_id ORDER BY l.created_at")).rows}:{}),
            ...(failureSource?{failureSources:(await c.query("SELECT count(*)::int AS n FROM agentstudio.agent_memory_failure_sources")).rows[0].n,effects:(await c.query("SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,failPreparation:state.failPreparation}:{}),
            workflows:(await c.query("SELECT count(*)::int AS n FROM agentstudio.workflows")).rows[0].n,
            runs:(await c.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,
            ...(semantic?{queryPosts:state.queryPosts,settingsPosts:state.settingsPosts,indexEmbeddings:state.indexEmbeddings,queryEmbeddings:state.queryEmbeddings,queryInputs:state.queryInputs,decisionHashes:state.decisionHashes,semanticModelPrompts:state.semanticModelPrompts,
              queryJobs:(await c.query("SELECT count(*)::int AS n FROM agentstudio.knowledge_query_jobs")).rows[0].n}:{} )}}
          finally{c.release()}
        }else if(req.url==="/__fixture/workflow"&&req.method==="POST"&&workflow)output=await tickAutonomous()
        else if(req.url==="/__fixture/schedule"&&req.method==="POST"&&scheduling&&state.allowed)output=await new ScheduleRuntimeWorker(pool,"browser-schedule").tick()
        else if(req.url==="/__fixture/schedule-agent"&&req.method==="POST"&&scheduling&&state.allowed){scheduledAgentMode=true;try{output=await tickAutonomous(true)}finally{scheduledAgentMode=false}}
        else if(req.url==="/__fixture/invalidate-sample-source"&&req.method==="POST"&&workflow){
          const changed=await db.query("UPDATE agentstudio.runs SET instruction='Synthetic source revision changed' WHERE id IN "+
            "(SELECT source_run_id FROM agentstudio.workflow_sample_lineage WHERE source_run_id IS NOT NULL) RETURNING id")
          output={changed:changed.rows.length}
        }
        else if(req.url==="/__fixture/index"&&req.method==="POST"&&semantic)output=await indexWorker.tick()
        else if(req.url==="/__fixture/query"&&req.method==="POST"&&semantic)output=await queryWorker.tick()
        else if(req.url==="/__fixture/drop-next-semantic"&&req.method==="POST"&&semantic){state.semanticDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-query"&&req.method==="POST"&&semantic){state.queryDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-decision"&&req.method==="POST"&&semantic){state.decisionDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/fail-query"&&req.method==="POST"&&semantic){state.failQuery=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-semantic"&&req.method==="POST"&&semantic){state.semanticAllowed=false;pool.knowledgeToolRuntime=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/autonomous"&&req.method==="POST"&&autonomous)output=await tickAutonomous()
        else if(req.url==="/__fixture/prepare"&&req.method==="POST")output=await prepare.tick()
        else if(req.url==="/__fixture/model"&&req.method==="POST")output=await model.tick()
        else if(req.url==="/__fixture/fail-next-preparation"&&req.method==="POST"&&failureSource){state.failPreparation=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-outcome-stop"&&req.method==="POST"&&outcomeMemory){state.outcomeDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-outcome-capabilities"&&req.method==="POST"&&outcomeMemory){state.outcomeCapabilitiesDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-feedback"&&req.method==="POST"&&feedback){state.feedbackDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-feedback-capabilities"&&req.method==="POST"&&feedback){state.feedbackCapabilitiesDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-optimization"&&req.method==="POST"&&optimization){state.optimizationDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-optimization-capabilities"&&req.method==="POST"&&optimization){state.optimizationCapabilitiesDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-optimization"&&req.method==="POST"&&optimization){state.optimizationAllowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/allow-optimization"&&req.method==="POST"&&optimization){state.optimizationAllowed=true;configure();output={ok:true}}
        else if(req.url==="/__fixture/optimization-later-role"&&req.method==="POST"&&optimization){const current=await agents.get(state.optimizationActor,state.optimizationRole),{require_approval:_,...stored}=current.spec;await agents.update(state.optimizationActor,current.id,current.name,safeAgentSpec({...stored,goal:"Synthetic later ordinary owner goal"}),current.revision);output={ok:true}}
        else if(req.url==="/__fixture/deny-feedback"&&req.method==="POST"&&feedback){state.feedbackAllowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/allow-feedback"&&req.method==="POST"&&feedback){state.feedbackAllowed=true;configure();output={ok:true}}
        else if(req.url==="/__fixture/fail-next-feedback-lesson"&&req.method==="POST"&&feedback){state.feedbackFailLesson=true;output={ok:true}}
        else if(req.url==="/__fixture/prune-feedback-task"&&req.method==="POST"&&feedback){const c=await pool.connect();try{await c.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=(SELECT run_id FROM agentstudio.agent_feedback_receipts WHERE action='submit' ORDER BY created_at DESC LIMIT 1)");output={ok:true}}finally{c.release()}}
        else if(req.url==="/__fixture/deny-outcome-memory"&&req.method==="POST"&&outcomeMemory){state.outcomeAllowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/allow-outcome-memory"&&req.method==="POST"&&outcomeMemory){state.outcomeAllowed=true;configure();output={ok:true}}
        else if(req.url==="/__fixture/drop-next-human"&&req.method==="POST"&&human){state.humanDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-memory"&&req.method==="POST"&&memory){state.memoryDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-derived-memory"&&req.method==="POST"&&derivedMemory){state.derivedDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-derived-capabilities"&&req.method==="POST"&&derivedMemory){state.derivedCapabilitiesDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-derived-memory"&&req.method==="POST"&&derivedMemory){state.derivedAllowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/allow-derived-memory"&&req.method==="POST"&&derivedMemory){state.derivedAllowed=true;configure();output={ok:true}}
        else if(req.url==="/__fixture/drop-next-config"&&req.method==="POST"){state.configDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-knowledge"&&req.method==="POST"){state.contentDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-config"&&req.method==="POST"){state.configAllowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/drop-next"&&req.method==="POST"){state.drop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-runs"&&req.method==="POST"){state.allowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/drop-next-schedule"&&req.method==="POST"&&scheduling){state.scheduleDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-collaboration"&&req.method==="POST"&&collaboration){state.collaborationDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/drop-next-release"&&req.method==="POST"&&releases){state.releaseDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/release-change-config"&&req.method==="POST"&&releases){
          const current=await agents.get(state.releaseActor,state.releaseRole),{require_approval:_,...stored}=current.spec
          await agents.update(state.releaseActor,current.id,"Changed owner role",safeAgentSpec({...stored,goal:"Changed current owner goal",model_binding:state.releaseAlternative}),current.revision)
          output={changed:true}
        }
        else if(req.url==="/__fixture/release-disable-default-model"&&req.method==="POST"&&releases){
          await db.query("UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1",[state.releaseDefaultModel]);output={changed:true}
        }
        else if(req.url==="/__fixture/collaboration-change-model"&&req.method==="POST"&&collaboration){
          const current=await agents.get(state.collaborationActor,state.collaborationRole),{require_approval:_,...stored}=current.spec
          await agents.update(state.collaborationActor,current.id,current.name,safeAgentSpec({...stored,model_binding:state.collaborationAlternative}),current.revision)
          output={changed:true}
        }
        else if(req.url==="/__fixture/stop"&&req.method==="POST"){output={ok:true};stop()}
        else{res.writeHead(404);res.end();return}
        res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(output));return
      }
      if(req.method==="POST"&&req.url==="/api/v2/workflows"){state.configRequests++;if(state.configDrop){state.configDrop=false;res.end=()=>{res.destroy();return res}}}
      if(human&&req.method==="POST"&&/^\/api\/v2\/(?:agent-autonomous-runs|workflow-v2-runs)\/[^/]+\/respond$/.test(req.url)){
        if(state.humanDrop){state.humanDrop=false;res.end=()=>{res.destroy();return res}}
      }
      if(human&&req.method==="POST"&&req.url.endsWith("/respond-confirm"))state.humanConfirms++
      if(memory&&req.method==="POST"&&req.url==="/api/v2/agent-memories/change"&&state.memoryDrop){state.memoryDrop=false;res.end=()=>{res.destroy();return res}}
      if(memory&&req.method==="POST"&&req.url==="/api/v2/agent-memories/confirm")state.memoryConfirms++
      if(derivedMemory&&req.method==="POST"&&req.url==="/api/v2/agent-derived-memories/change"&&state.derivedDrop){state.derivedDrop=false;res.end=()=>{res.destroy();return res}}
      if(derivedMemory&&req.method==="POST"&&req.url==="/api/v2/agent-derived-memories/confirm")state.derivedConfirms++
      if(optimization&&req.method==="POST"&&req.url==="/api/v2/agent-optimizations/accept"&&state.optimizationDrop){state.optimizationDrop=false;res.end=()=>{res.destroy();return res}}
      if(optimization&&req.method==="POST"&&req.url==="/api/v2/agent-optimizations/confirm")state.optimizationConfirms++
      if(optimization&&req.method==="GET"&&req.url==="/api/native-auth/capabilities"&&state.optimizationCapabilitiesDrop){state.optimizationCapabilitiesDrop=false;res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"synthetic_capability_unavailable"}));return}
      if(feedback&&req.method==="POST"&&/^\/api\/v2\/agent-feedback\/[^/]+\/change$/.test(req.url)&&state.feedbackDrop){state.feedbackDrop=false;res.end=()=>{res.destroy();return res}}
      if(feedback&&req.method==="POST"&&/^\/api\/v2\/agent-feedback\/[^/]+\/confirm$/.test(req.url))state.feedbackConfirms++
      if(feedback&&req.method==="GET"&&req.url==="/api/native-auth/capabilities"&&state.feedbackCapabilitiesDrop){state.feedbackCapabilitiesDrop=false;res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"synthetic_capability_unavailable"}));return}
      if(outcomeMemory&&req.method==="POST"&&/^\/api\/v2\/agent-outcome-memories\/[^/]+\/stop$/.test(req.url)&&state.outcomeDrop){state.outcomeDrop=false;res.end=()=>{res.destroy();return res}}
      if(outcomeMemory&&req.method==="POST"&&/^\/api\/v2\/agent-outcome-memories\/[^/]+\/stop-confirm$/.test(req.url))state.outcomeConfirms++
      if(outcomeMemory&&req.method==="GET"&&req.url==="/api/native-auth/capabilities"&&state.outcomeCapabilitiesDrop){state.outcomeCapabilitiesDrop=false;res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"synthetic_capability_unavailable"}));return}
      if(derivedMemory&&req.method==="GET"&&req.url==="/api/native-auth/capabilities"&&state.derivedCapabilitiesDrop){state.derivedCapabilitiesDrop=false;res.writeHead(503,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"synthetic_capability_unavailable"}));return}
      if(req.method==="POST"&&/^\/api\/v2\/schedules\/[0-9a-f-]{36}\/activate$/.test(req.url)&&state.scheduleDrop){state.scheduleDrop=false;res.end=()=>{res.destroy();return res}}
      if(req.method==="POST"&&/^\/api\/v2\/agent-collaboration\/[0-9a-f-]{36}\/change$/.test(req.url)&&state.collaborationDrop){state.collaborationDrop=false;res.end=()=>{res.destroy();return res}}
      if(req.method==="POST"&&/^\/api\/v2\/agent-releases\/[0-9a-f-]{36}\/(?:change|acceptance)$/.test(req.url)&&state.releaseDrop){state.releaseDrop=false;res.end=()=>{res.destroy();return res}}
      if(semantic&&req.method==="POST"&&/\/decision$/.test(req.url)){
        if(state.decisionDrop){state.decisionDrop=false;res.end=()=>{res.destroy();return res}}
      }
      if(req.method==="POST"&&/^\/api\/v2\/shared-knowledge\/[^/]+\/(?:import|delete|access)$/.test(req.url)&&state.contentDrop){state.contentDrop=false;res.end=()=>{res.destroy();return res}}
      if(req.method==="POST"&&req.url.startsWith("/api/v2/knowledge-embedding/")){
        state.settingsPosts++;if(state.semanticDrop){state.semanticDrop=false;res.end=()=>{res.destroy();return res}}
      }
      if(req.method==="POST"&&req.url==="/api/v2/knowledge-query/submit"){
        state.queryPosts++;if(state.queryDrop){state.queryDrop=false;res.end=()=>{res.destroy();return res}}
      }
      if(req.method==="POST"&&(autonomous?/^\/api\/v2\/agent-specs\/[^/]+\/autonomous-runs$/:workflow?/^\/api\/v2\/workflows\/[^/]+\/(?:native-runs|model-node-debug)$/:/^\/api\/v2\/agent-specs\/[^/]+\/runs$/).test(req.url)){
        state.submissions++
        if(state.drop){state.drop=false;res.end=()=>{res.destroy();return res}}
      }
      await native.handler(req,res)
    })().catch(()=>{res.destroy()})})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const apiPort=server.address().port
    writeFileSync(path.join(scratch,"index.html"),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Synthetic PG employee UI</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    writeFileSync(path.join(scratch,"entry.tsx"),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    vite=await createViteServer({configFile:false,envFile:false,root,cacheDir:path.join(scratch,"vite-cache"),
      plugins:[react()],resolve:{alias:{"@":path.join(root,"src")}},
      server:{host:"127.0.0.1",port:17443,strictPort:true,
        watch:{ignored:["**/.worktrees/**","**/.webcodex-worktrees/**","**/.tmp/**","**/dist/**","**/dist-pg18/**","**/pocketbase/**"]},
        proxy:{"/__pg_native":{
        target:"http://127.0.0.1:"+apiPort,changeOrigin:true,rewrite:url=>url.replace(/^\/__pg_native(?=\/|$)/,"")}}}})
    await vite.listen()
    const info={synthetic_only:true,url:origin+"/"+path.relative(root,scratch).replaceAll("\\","/")+"/index.html",apiPort}
    writeFileSync(path.join(parent,"native-run-browser-info.json"),JSON.stringify(info))
    console.log(JSON.stringify(info))
    await stopped
  },modern?{handlerFactory}:{})
}finally{
  if(vite)await vite.close()
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  await db.close();key.fill(0)
  if(path.dirname(realpathSync(scratch))!==realpathSync(parent)||!path.basename(scratch).startsWith("native-run-browser-"))
    throw Error("unsafe_browser_fixture_cleanup")
  rmSync(scratch,{recursive:true,force:true})
}
