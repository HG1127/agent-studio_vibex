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
import {createNativeRunRepository} from "../../src/native-run-repository.ts"
import {AgentSpecRepository} from "../../src/repository.ts"
import {WorkflowRepository} from "../../src/workflow-repository.ts"
import {WorkflowSafeRunRepository} from "../../src/workflow-safe-run-repository.ts"
import {KnowledgeBaseRepository} from "../../src/knowledge-repository.ts"
import {ModelConnectionRepository} from "../../src/model-connection-repository.ts"
import {ToolConnectionRepository} from "../../src/tool-connection-repository.ts"
import {AgentPrepareWorker} from "../../src/agent-worker.ts"
import {AgentModelWorker} from "../../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter} from "../../src/bound-lease-identity.ts"
import {createBoundModelMutualTlsClient} from "../../src/bound-model-client.ts"

if(process.env.AGENT_STUDIO_PG_BROWSER_FIXTURE!=="SYNTHETIC_LOCAL_ONLY")
  throw Error("synthetic_local_browser_fixture_required")
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
  boundModelExecutionUat:true,modelProbeUat:true}
const state={submissions:0,submitHashes:[],generated:0,drop:false,allowed:true}
try{
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db)
  const load=relative=>readFileSync(path.join(root,relative),"utf8")
  await db.exec(reviewedNativeSqlForEmbeddedTest(load("db/postgres/010_pg18_native_auth_proposed.sql")))
  await db.exec("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic browser predecessor')")
  await db.exec(load("db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql")
    .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n"))
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
    await agents.create(profile.identity,name+" Browser Agent",{goal:"Synthetic local browser task",task_scope:"Synthetic only",
      deliverables:["A summary"],task_plan:["Prepare summary"],done_criteria:["Disclose synthetic source"],tools:[],
      model_binding:{connection_id:connection.id,connection_revision:connection.revision,model_id:"gpt-4.1-mini"}})
  }
  const broker=new OwnerBoundModelDispatch(pool,key,async()=>{
    state.generated++;return "Browser synthetic bound result"
  })
  const verified=createVerifiedBoundDispatchAdapter(new BoundLeaseIdentityRepository(pool),broker)
  await withDisposableBoundModelTls(verified,async tls=>{
    const prepare=new AgentPrepareWorker(pool,"browser-synthetic-prepare")
    const model=new AgentModelWorker(pool,"browser-synthetic-model",{async generate(){throw Error("shared_fallback_forbidden")}},
      {boundOnly:true,boundExecutionApproved:true,boundModelDispatch:createBoundModelMutualTlsClient(tls)})
    let native,backend
    const configure=()=>{native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,
      allowConfigurationWrites:true,allowEmployeeProvisioning:true,
      allowRunSubmission:state.allowed,allowBoundRunSubmission:state.allowed,
      businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(req.url.split("?")[0],req.method,
          {...policy,runApprovalUat:state.allowed,boundModelExecutionUat:state.allowed})){
          res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"pilot_business_writes_disabled"}));return
        }
        return backend(req,res)
      }})}
    configure()
    const runs=createNativeRunRepository(pool,policy)
    const submit=runs.submit.bind(runs)
    runs.submit=async(identity,specId,body)=>{
      state.submitHashes.push(createHash("sha256").update(JSON.stringify({specId,...body})).digest("hex"))
      return submit(identity,specId,body)
    }
    backend=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error("native_cookie_required")},
      authenticateRequest:req=>native.authenticateRequest(req),repository:agents,
      runRepository:runs,workflowRepository:new WorkflowRepository(pool),
      workflowSafeRunRepository:new WorkflowSafeRunRepository(pool),knowledgeRepository:new KnowledgeBaseRepository(pool),
      modelConnectionRepository:models,toolConnectionRepository:new ToolConnectionRepository(pool,key)})
    server=createServer((req,res)=>{void(async()=>{
      if(req.url.startsWith("/__fixture/")){
        if(req.headers["x-agentstudio-synthetic-fixture"]!=="1"){
          res.writeHead(403);res.end();return
        }
        let output
        if(req.url==="/__fixture/state"&&req.method==="GET"){
          const c=await pool.connect()
          try{output={submissions:state.submissions,submitHashes:state.submitHashes,generated:state.generated,
            runs:(await c.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n}}
          finally{c.release()}
        }else if(req.url==="/__fixture/prepare"&&req.method==="POST")output=await prepare.tick()
        else if(req.url==="/__fixture/model"&&req.method==="POST")output=await model.tick()
        else if(req.url==="/__fixture/drop-next"&&req.method==="POST"){state.drop=true;output={ok:true}}
        else if(req.url==="/__fixture/deny-runs"&&req.method==="POST"){state.allowed=false;configure();output={ok:true}}
        else if(req.url==="/__fixture/stop"&&req.method==="POST"){output={ok:true};stop()}
        else{res.writeHead(404);res.end();return}
        res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(output));return
      }
      if(req.method==="POST"&&/^\/api\/v2\/agent-specs\/[^/]+\/runs$/.test(req.url)){
        state.submissions++
        if(state.drop){state.drop=false;res.end=()=>{res.destroy();return res}}
      }
      await native.handler(req,res)
    })().catch(()=>{res.destroy()})})
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
    const apiPort=server.address().port
    writeFileSync(path.join(scratch,"index.html"),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Synthetic PG employee UI</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>')
    writeFileSync(path.join(scratch,"entry.tsx"),'import React from "react";import {createRoot} from "react-dom/client";import PgNativePilotPage from "/src/pages/PgNativePilot/PgNativePilotPage.tsx";import "/src/index.css";createRoot(document.getElementById("root")!).render(<React.StrictMode><PgNativePilotPage/></React.StrictMode>);')
    vite=await createViteServer({configFile:false,root,plugins:[react()],resolve:{alias:{"@":path.join(root,"src")}},
      server:{host:"127.0.0.1",port:17443,strictPort:true,
        watch:{ignored:["**/.worktrees/**","**/.webcodex-worktrees/**","**/.tmp/**","**/dist/**","**/dist-pg18/**","**/pocketbase/**"]},
        proxy:{"/__pg_native":{
        target:"http://127.0.0.1:"+apiPort,changeOrigin:true,rewrite:url=>url.replace(/^\/__pg_native(?=\/|$)/,"")}}}})
    await vite.listen()
    const info={synthetic_only:true,url:origin+"/"+path.relative(root,scratch).replaceAll("\\","/")+"/index.html",apiPort}
    writeFileSync(path.join(parent,"native-run-browser-info.json"),JSON.stringify(info))
    console.log(JSON.stringify(info))
    await stopped
  })
}finally{
  if(vite)await vite.close()
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  await db.close();key.fill(0)
  if(path.dirname(realpathSync(scratch))!==realpathSync(parent)||!path.basename(scratch).startsWith("native-run-browser-"))
    throw Error("unsafe_browser_fixture_cleanup")
  rmSync(scratch,{recursive:true,force:true})
}
