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
import {safeAgentSpec} from "../../src/contracts.ts"
import {AutonomousAgentRunRepository} from "../../src/autonomous-agent-run-repository.ts"
import {WorkflowV2RunRepository} from "../../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../../src/workflow-v2-worker.ts"
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

if(process.env.AGENT_STUDIO_PG_BROWSER_FIXTURE!=="SYNTHETIC_LOCAL_ONLY")
  throw Error("synthetic_local_browser_fixture_required")
const autonomous=process.env.AGENT_STUDIO_PG_BROWSER_AUTONOMOUS==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_AUTONOMOUS!==undefined&&!autonomous)throw Error("invalid_synthetic_browser_mode")
const workflow=process.env.AGENT_STUDIO_PG_BROWSER_WORKFLOW==="true"
if(process.env.AGENT_STUDIO_PG_BROWSER_WORKFLOW!==undefined&&!workflow||autonomous&&workflow)throw Error("invalid_synthetic_browser_mode")
const modern=autonomous||workflow
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
const pool={async connect(){
  const before=queue;let release
  queue=new Promise(resolve=>{release=resolve});await before
  return {query:(sql,values=[])=>db.query(sql,values),release}
}}
const policy={configurationWrites:true,employeeProvisioning:true,runApprovalUat:true,
  boundModelExecutionUat:true,modelProbeUat:true,autonomousAgentUat:autonomous,workflowV2ExecutionUat:workflow}
const state={submissions:0,submitHashes:[],configHashes:[],configRequests:0,generated:0,httpCalls:0,mcpCalls:0,mcpDiscoveries:0,smitheryWrites:0,drop:false,configDrop:false,allowed:true,configAllowed:true}
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
  if(modern)for(const migration of ["pg_v9_025_workflow_model_identity.sql","pg_v9_026_workflow_tool_identity.sql","pg_v9_027_workflow_agent_identity.sql","pg_v9_028_autonomous_agent_identity.sql","pg_v9_029_mcp_connections.sql","pg_v9_030_mcp_tool_identity.sql","pg_v9_031_smithery_managed.sql"])
    await db.exec(load("db/postgres/migrations/"+migration).split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
  const auth=new NativeAuthRepository(pool)
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
    await agents.create(profile.identity,name+" Browser Agent",safeAgentSpec({goal:"Synthetic local browser task",task_scope:"Synthetic only",
      deliverables:["A summary"],task_plan:["Prepare summary"],done_criteria:["Disclose synthetic source"],tools:modern?["calculate"]:[],
      model_binding:{connection_id:connection.id,connection_revision:connection.revision,model_id:"gpt-4.1-mini"}}))
    if(modern)await new ToolConnectionRepository(pool,key).create(profile.identity,{name:name+" synthetic HTTP",description:"Lookup synthetic evidence; params: query",
      url:"https://tools.example.com/lookup",method:"POST",headers:[],body_template:"{{input}}",timeout_s:5,enabled:true})
  }
  const broker=new OwnerBoundModelDispatch(pool,key,async()=>{
    state.generated++;return "Browser synthetic bound result"
  })
  const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(pool),broker)
  const dispatch=modern?{
    model:verifiedWorkflowV2ModelDispatch(new WorkflowV2ModelLeaseIdentity(pool),new WorkflowV2ModelDispatch(pool,key,async()=>{if(!workflow)throw Error("direct_fallback_forbidden");state.generated++;return "Browser synthetic workflow model output"},pool,{
      nodeDebugExecutor:workflow?async()=>{state.generated++;return "Browser synthetic node debug result"}:undefined,
      allowAutonomousExecution:autonomous,allowAgentExecution:workflow,async agentExecutor(_material,prompt){state.generated++;const plan=JSON.parse(prompt),http=plan.role.http_tools?.[0],mcp=plan.role.mcp_tools?.[0];return JSON.stringify(plan.round===1?
        {action:"tool",tool:mcp?.name??http?.name??"calculate",params:mcp||http?{query:"Synthetic owner evidence"}:{expression:"2+2"},think:workflow?"BROWSER_PRIVATE_PLAN":undefined,note:workflow?"BROWSER_PRIVATE_NOTE":undefined}:
        {action:"answer",answer:workflow?"Browser synthetic Workflow result 4":"Browser synthetic autonomous result 4",think:workflow?"BROWSER_PRIVATE_PLAN":undefined,note:workflow?"BROWSER_PRIVATE_NOTE":undefined})}})),
    tool:verifiedWorkflowV2ToolDispatch(new WorkflowV2ToolLeaseIdentity(pool),new WorkflowV2ToolDispatch(pool,key,{
      async http(){state.httpCalls++;return "Browser synthetic HTTP observation 4"},
      mcp:createMcpToolExecutor(async(_material,wire)=>{if(wire.body.method!=="tools/call")throw Error("unexpected_synthetic_mcp_call")
        state.mcpCalls++;return {status:200,session:"",content_type:"application/json",text:JSON.stringify({jsonrpc:"2.0",id:wire.body.id,result:{content:[{type:"text",text:"Browser synthetic MCP observation 4"}]}})}}),
    },pool,{allowAutonomousExecution:autonomous,allowAgentExecution:workflow})),
  }:verified
  const handlerFactory=config=>{const common={...config,executionMode:workflow?"workflow_native_v2":"agent_native_v2"},
    model=createWorkflowV2ModelInternalHandler({...common,dispatch:config.dispatch.model}),tool=createWorkflowV2ToolInternalHandler({...common,dispatch:config.dispatch.tool})
    return (req,res)=>(req.url==="/__internal/v2/workflow-tool/dispatch"?tool:model)(req,res)}
  await withDisposableBoundModelTls(dispatch,async tls=>{
    const prepare=new AgentPrepareWorker(pool,"browser-synthetic-prepare")
    const model=new AgentModelWorker(pool,"browser-synthetic-model",{async generate(){throw Error("shared_fallback_forbidden")}},
      {boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(tls)})
    let workers=0
    const adapters=modern?[workflowV2ModelEffectExecutor(tls),workflowV2ToolEffectExecutor(tls)]:[]
    const tickAutonomous=()=>new WorkflowV2Worker(pool,"browser-autonomous-"+(++workers),{executionMode:workflow?"workflow_native_v2":"agent_native_v2",agentExecutionApproved:true,
      executor:{supports:request=>adapters.some(adapter=>adapter.supports(request)),execute(request,lease){return adapters.find(adapter=>adapter.supports(request)).execute(request,lease)}}}).tick()
    let native,backend
    const configure=()=>{native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,
      allowConfigurationWrites:state.configAllowed,allowEmployeeProvisioning:state.configAllowed,
      allowMcpDiscovery:modern&&state.configAllowed,
      allowMcpToolExecution:modern&&state.configAllowed&&state.allowed,
      allowSmitheryManagement:modern&&state.configAllowed,
      allowRunSubmission:state.allowed,allowBoundRunSubmission:state.allowed,allowAutonomousAgentSubmission:autonomous&&state.allowed,allowWorkflowV2Submission:workflow&&state.allowed,
      businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(req.url.split("?")[0],req.method,
          {...policy,configurationWrites:state.configAllowed,mcpDiscoveryUat:modern,smitheryManagementUat:modern,runApprovalUat:state.allowed,boundModelExecutionUat:state.allowed,autonomousAgentUat:autonomous&&state.allowed,workflowV2ExecutionUat:workflow&&state.allowed})){
          res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return
        }
        return backend(req,res)
      }})}
    configure()
    const runs=autonomous?new AutonomousAgentRunRepository(pool,{allowMcpExecution:true}):workflow?new WorkflowV2RunRepository(pool,"workflow_native_v2",{allowMcpExecution:true}):createNativeRunRepository(pool,policy)
    const submit=runs.submit.bind(runs)
    runs.submit=async(identity,specId,body)=>{
      state.submitHashes.push(createHash("sha256").update(JSON.stringify({specId,...body})).digest("hex"))
      return submit(identity,specId,body)
    }
    if(workflow){const submitDebug=runs.submitNodeDebug.bind(runs);runs.submitNodeDebug=async(identity,id,body)=>{
      state.submitHashes.push(createHash("sha256").update(JSON.stringify({workflowId:id,...body})).digest("hex"));return submitDebug(identity,id,body)
    }}
    const flows=new WorkflowRepository(pool),create=flows.createIdempotent.bind(flows)
    flows.createIdempotent=async(identity,requestId,name,graph)=>{state.configHashes.push(createHash("sha256").update(JSON.stringify({requestId,name,graph})).digest("hex"));return create(identity,requestId,name,graph)}
    backend=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("native_cookie_required")},
      authenticateRequest:req=>native.authenticateRequest(req),repository:agents,
      runRepository:createNativeRunRepository(pool,policy),...(autonomous?{autonomousAgentRunRepository:runs}:workflow?{workflowV2RunRepository:runs}:{runRepository:runs}),workflowRepository:flows,
      workflowSafeRunRepository:new WorkflowSafeRunRepository(pool),knowledgeRepository:new KnowledgeBaseRepository(pool),
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
          try{output={submissions:state.submissions,submitHashes:state.submitHashes,configHashes:state.configHashes,configRequests:state.configRequests,generated:state.generated,httpCalls:state.httpCalls,mcpCalls:state.mcpCalls,mcpDiscoveries:state.mcpDiscoveries,smitheryWrites:state.smitheryWrites,
            ...(modern?{mcpConnections:(await c.query("SELECT count(*)::int AS n FROM agentstudio.mcp_connections")).rows[0].n}:{}),
            workflows:(await c.query("SELECT count(*)::int AS n FROM agentstudio.workflows")).rows[0].n,
            runs:(await c.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n}}
          finally{c.release()}
        }else if(req.url==="/__fixture/workflow"&&req.method==="POST"&&workflow)output=await tickAutonomous()
        else if(req.url==="/__fixture/autonomous"&&req.method==="POST"&&autonomous)output=await tickAutonomous()
        else if(req.url==="/__fixture/prepare"&&req.method==="POST")output=await prepare.tick()
        else if(req.url==="/__fixture/model"&&req.method==="POST")output=await model.tick()
        else if(req.url==="/__fixture/drop-next-config"&&req.method==="POST"){state.configDrop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-config"&&req.method==="POST"){state.configAllowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/drop-next"&&req.method==="POST"){state.drop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-runs"&&req.method==="POST"){state.allowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/stop"&&req.method==="POST"){output={ok:true};stop()}
        else{res.writeHead(404);res.end();return}
        res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(output));return
      }
      if(req.method==="POST"&&req.url==="/api/v2/workflows"){state.configRequests++;if(state.configDrop){state.configDrop=false;res.end=()=>{res.destroy();return res}}}
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
