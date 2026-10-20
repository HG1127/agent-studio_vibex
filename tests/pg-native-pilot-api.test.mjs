import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createPgNativePilotApi,PgNativePilotError}
  from "../src/lib/pgNativePilotApi.ts"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
test("native client uses same-origin HttpOnly cookies and never PocketBase tokens",async()=>{
  const calls=[]
  const response=(payload,status=200)=>new Response(JSON.stringify(payload),{
    status,headers:{"Content-Type":"application/json"}
  })
  const api=createPgNativePilotApi(async(url,config)=>{
    calls.push({url,config})
    if(url.endsWith("/api/native-auth/me"))
      return response({authenticated:true,user:{
        id:"test-id",email:"staff@example.com",display_name:"Staff",is_admin:false
      }})
    if(url.endsWith("/api/v2/agent-specs")&&config.method==="GET")
      return response({items:[]})
    if(url.endsWith("/api/v2/agent-specs")&&config.method==="POST")
      return response({item:{id:"test",name:"New Agent",revision:1,spec:{goal:"Research"}}},201)
    return response({authenticated:true,role:"employee"})
  })
  assert.equal((await api.me()).email,"staff@example.com")
  assert.equal((await api.listAgents()).length,0)
  const agent=await api.createAgent("New Agent","Research")
  assert.equal(agent.name,"New Agent")
  await api.login("staff@example.com","synthetic-secret")
  assert.ok(calls.every(c=>c.url.startsWith("/__pg_native/api/")))
  assert.ok(calls.every(c=>c.config.credentials==="same-origin"))
  assert.ok(calls.every(c=>c.config.redirect==="error"))
  assert.ok(calls.every(c=>!Object.hasOwn(c.config.headers,"Authorization")))
  assert.ok(calls.every(c=>!Object.hasOwn(c.config.headers,"X-Rh-User-Id")))
  const writes=calls.filter(c=>c.config.method==="POST")
  assert.ok(writes.every(c=>c.config.headers["X-AgentStudio-Request"]==="1"))
  assert.ok(writes.every(c=>c.config.headers["Content-Type"]==="application/json"))
  const raw=fs.readFileSync(path.join(root,"src/lib/pgNativePilotApi.ts"),"utf8")
  assert.doesNotMatch(raw,/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem)/i)
  assert.doesNotMatch(raw,/from\s+["\x27](?:pocketbase|@\/lib\/pb)["\x27]/i)
  assert.doesNotMatch(raw,/Bearer \+|\baccessToken\b|\btokenFrom\b/i)
})
test("PG18 standalone frontend uses fixed same-origin API root without dev proxy",async()=>{
  const urls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    urls.push({url,init})
    if(url==="/api/native-auth/me")
      return new Response(JSON.stringify({authenticated:true,user:{
        id:"test-uuid",email:"test@example.com",display_name:"Staff",is_admin:false
      }}),{status:200})
    return new Response(JSON.stringify({items:[]}),{status:200})
  },"")
  assert.equal((await api.me()).email,"test@example.com")
  await api.listAgents()
  assert.ok(urls.every(x=>x.url.startsWith("/api/")))
  assert.ok(urls.every(x=>!x.url.startsWith("/__pg_native")))
  assert.ok(urls.every(x=>x.init.credentials==="same-origin"))
  assert.throws(()=>createPgNativePilotApi(fetch,"http://evil.test"),
    /unsafe_pg_native_client_root/)
})

test("PG Native client validates record IDs and PATCH optimistic concurrency",async()=>{
  const calls=[]
  const uuid="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    const item=options.method==="GET"
      ?{id:uuid,name:"Original",revision:1,spec:{
        goal:"Earlier",task_scope:"Policy review",deliverables:["Memo"],
        task_plan:["Research"],done_criteria:["Cited"],tools:["summarize"]
      }}
      :{id:uuid,name:"Updated",revision:2}
    return new Response(JSON.stringify({item}),{status:200})
  },"")
  await assert.rejects(api.updateAgent("../other",1,"Test","Goal"),
    err=>err.status===400&&err.code==="invalid_pg_native_id")
  await assert.rejects(api.updateAgent(uuid,0,"Test","Goal"),
    err=>err.status===400&&err.code==="invalid_revision")
  const changed=await api.updateAgent(uuid,1,"Updated","New Goal")
  assert.equal(changed.revision,2)
  assert.equal(calls.length,2)
  assert.equal(calls[0].options.method,"GET")
  assert.equal(calls[1].url,"/api/v2/agent-specs/"+uuid)
  assert.equal(calls[1].options.method,"PATCH")
  assert.equal(calls[1].options.credentials,"same-origin")
  assert.equal(calls[1].options.headers["X-AgentStudio-Request"],"1")
  const update=JSON.parse(calls[1].options.body)
  assert.equal(update.expected_revision,1)
  assert.equal(update.spec.task_scope,"Policy review")
  assert.deepEqual(update.spec.task_plan,["Research"])
  assert.deepEqual(update.spec.deliverables,["Memo"])
  assert.deepEqual(update.spec.done_criteria,["Cited"])
  assert.deepEqual(update.spec.tools,["summarize"])
})

test("PG Native Agent knowledge binding preserves existing spec, checks optimistic revisions, and never trusts foreign IDs",async()=>{
  const agentId="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const baseOne="f4cae8bb-0af2-4685-8552-ebc677cae845"
  const baseTwo="33e08d4a-cfa8-4726-b965-6682918d2cf7"
  const calls=[]
  const current={
    id:agentId,name:"Owner Agent",revision:2,
    spec:{goal:"Preserve owner spec",task_scope:"Only synthetic data",
      deliverables:["Evidence report"],task_plan:["Read"],done_criteria:["Cited"],
      tools:["summarize","knowledge_search"],knowledge_base_ids:[baseOne]}
  }
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    const item=options.method==="GET"?current:{
      ...current,revision:3,spec:JSON.parse(options.body).spec
    }
    return new Response(JSON.stringify({item}),{status:200})
  },"")
  const renamed=await api.updateAgent(agentId,2,"Retitled","New goal")
  assert.deepEqual(renamed.spec.knowledge_base_ids,[baseOne])
  assert.deepEqual(JSON.parse(calls[1].options.body).spec.tools,
    ["summarize","knowledge_search"])
  assert.deepEqual(JSON.parse(calls[1].options.body).spec.knowledge_base_ids,[baseOne])
  const linked=await api.updateAgentKnowledgeBases(agentId,2,[baseOne,baseTwo])
  assert.equal(linked.revision,3)
  assert.deepEqual(linked.spec.knowledge_base_ids,[baseOne,baseTwo])
  assert.equal(linked.spec.task_scope,"Only synthetic data")
  assert.deepEqual(linked.spec.task_plan,["Read"])
  assert.deepEqual(linked.spec.deliverables,["Evidence report"])
  assert.equal(calls[3].options.method,"PATCH")
  assert.equal(calls[3].options.headers["X-AgentStudio-Request"],"1")
  assert.equal(calls[3].options.credentials,"same-origin")
  assert.equal(Object.hasOwn(calls[3].options.headers,"Authorization"),false)
  const before=calls.length
  for(const ids of [[baseOne,baseOne],["../fake"],[baseOne,baseTwo,
    "adbe642c-58f9-48b7-a8dc-c1f46b2e18b9","ac5f848a-afaa-4a5d-bd27-76f79e7cd4cb"]]){
    await assert.rejects(api.updateAgentKnowledgeBases(agentId,2,ids),
      error=>error.status===400&&error.code==="invalid_pg_native_knowledge_scope")
  }
  assert.equal(calls.length,before)
  await assert.rejects(api.updateAgentKnowledgeBases(agentId,1,[]),
    e=>e.status===409&&e.code==="revision_conflict")
  assert.equal(calls.length,before+1,"stale revision must never PATCH")
})

test("PG-only Agent knowledge editing is DEV-gated, does not leak into production candidate, and never starts Workers",()=>{
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  const panel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeAgentKnowledgeUatPanel.tsx"),"utf8")
  const verify=fs.readFileSync(path.join(root,
    "ops/verify-pg18-only-web-build.mjs"),"utf8")
  assert.match(page,/KB_AGENT_BINDING_DEV_ONLY=import\.meta\.env\.DEV/)
  assert.match(page,/VITE_AGENT_STUDIO_PG_AGENT_KB_BIND_UI_ENABLED/)
  assert.match(page,/AgentKnowledgeUatPanel&&!productionRoot/)
  assert.match(panel,/api\.updateAgentKnowledgeBases\(/)
  assert.match(verify,/dev_agent_kb_binding_leak/)
  assert.match(verify,/dev_agent_kb_binding_button_leak/)
  for(const pattern of [
    /from\s*["'].*(?:pocketbase|@\/lib\/pb)/,/localStorage\./,
    /sessionStorage\./,/generateModel\(/,/fetch\(/,
    /\.submitRun\(/,/\.decideModel\(/,/dangerouslySetInnerHTML/
  ])assert.doesNotMatch(panel,pattern)
})

test("workflow rename preserves existing graph nodes and cannot write stale versions",async()=>{
  const id="d6829a5c-cb54-4faf-8ac8-ec9abb756c63"
  const graph={nodes:[
    {id:"s",type:"start",data:{title:"Start"},position:{x:0,y:0}},
    {id:"research",type:"model",data:{title:"Review"},position:{x:100,y:0}},
    {id:"e",type:"end",data:{title:"End"},position:{x:200,y:0}}
  ],edges:[
    {id:"a",source:"s",target:"research"},
    {id:"b",source:"research",target:"e"}
  ]}
  const calls=[]
  const api=createPgNativePilotApi(async(route,options)=>{
    calls.push({route,options})
    const item=options.method==="GET"
      ?{id,name:"Original",revision:3,graph}
      :{id,name:"Renamed",revision:4,graph}
    return new Response(JSON.stringify({item}),{status:200})
  },"")
  await assert.rejects(api.updateWorkflow(id,2,"Wrong Revision"),
    err=>err.status===409&&err.code==="revision_conflict")
  assert.ok(calls.every(x=>x.options.method==="GET"))
  const result=await api.updateWorkflow(id,3,"Renamed")
  assert.equal(result.revision,4)
  const mutation=calls.find(x=>x.options.method==="PATCH")
  assert.ok(mutation)
  assert.deepEqual(JSON.parse(mutation.options.body).graph,graph)
  assert.equal(mutation.options.headers["X-AgentStudio-Request"],"1")
})


test("PG-only knowledge document inventory uses validated same-origin GET and never requests private body",async()=>{
  const uuid="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const api=createPgNativePilotApi(async(route,options)=>{
    calls.push({route,options})
    return new Response(JSON.stringify({items:[{
      id:uuid,filename:"report.md",status:"indexed",
      mime_type:"text/markdown",sha256:"a".repeat(64)
    }]}),{status:200})
  },"")
  const documents=await api.listKnowledgeDocuments(uuid)
  assert.equal(documents.length,1)
  assert.equal(documents[0].filename,"report.md")
  assert.equal(calls[0].route,"/api/v2/knowledge-bases/"+uuid+"/documents")
  assert.equal(calls[0].options.method,"GET")
  assert.equal(calls[0].options.credentials,"same-origin")
  assert.equal(calls[0].options.redirect,"error")
  assert.equal(Object.hasOwn(calls[0].options.headers,"Authorization"),false)
  await assert.rejects(api.listKnowledgeDocuments("../../etc/passwd"),
    e=>e.status===400&&e.code==="invalid_pg_native_knowledge_id")
  assert.equal(calls.length,1)
})

test("PG18 independent read-only candidate supports Agent/Workflow/KB detail while dev-only Run actions stay hidden",()=>{
  const content=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeConfigDetail.tsx"),"utf8")
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  assert.match(page,/PgNativeConfigDetail/)
  assert.match(page,/onInspect=\{item=>setDetailTarget/)
  assert.match(content,/api\.getAgent\(id\)/)
  assert.match(content,/api\.getWorkflow\(id\)/)
  assert.match(content,/api\.getKnowledge\(id\)/)
  assert.match(content,/api\.listKnowledgeDocuments\(id\)/)
  assert.match(content,/let active=true/)
  assert.match(content,/return \(\)=>\{active=false\}/)
  assert.match(page,/RunUatPanel&&!productionRoot/)
  for(const forbidden of [/from\s*["'].*(?:@\/lib\/pb|pocketbase)/,
                           /localStorage\./,/sessionStorage\./,
                           /window\.location\.assign\("/,
                           /dangerouslySetInnerHTML/]){
    assert.doesNotMatch(content,forbidden)
  }
})


test("PG Native keyword search posts private query in JSON, keeps same-origin cookie and exact citation type",async()=>{
  const id="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    return new Response(JSON.stringify({
      items:[{document_id:id,filename:"source.md",chunk_index:0,
        snippet:"行业机会的合成检索内容",citation:"source.md#chunk-0"}],
      mode:"literal_keyword",scope:"current_user",indexed_only:true
    }),{status:200})
  })
  const result=await api.searchKnowledgeKeyword(id," 行业机会 ",6)
  assert.equal(result.mode,"literal_keyword")
  assert.equal(result.items[0].citation,"source.md#chunk-0")
  assert.deepEqual(calls.map(x=>x.url),[
    "/__pg_native/api/v2/knowledge-bases/"+id+"/search"
  ])
  assert.equal(calls[0].options.method,"POST")
  assert.equal(calls[0].options.credentials,"same-origin")
  assert.equal(calls[0].options.redirect,"error")
  assert.equal(calls[0].options.headers["X-AgentStudio-Request"],"1")
  assert.equal(Object.hasOwn(calls[0].options.headers,"Authorization"),false)
  assert.deepEqual(JSON.parse(calls[0].options.body),{query:"行业机会",limit:6})
  assert.equal(calls[0].url.includes("行业机会"),false)
  for(const action of [
    ()=>api.searchKnowledgeKeyword("../fake","valid words"),
    ()=>api.searchKnowledgeKeyword(id," "),
    ()=>api.searchKnowledgeKeyword(id,"a"),
    ()=>api.searchKnowledgeKeyword(id,"hi\nworld"),
    ()=>api.searchKnowledgeKeyword(id,"x".repeat(161)),
    ()=>api.searchKnowledgeKeyword(id,"meaning",0),
    ()=>api.searchKnowledgeKeyword(id,"meaning",11),
    ()=>api.searchKnowledgeKeyword(id,"meaning",1.5)
  ])await assert.rejects(Promise.resolve().then(action),
    e=>e instanceof PgNativePilotError&&e.status===400)
  assert.equal(calls.length,1,"unsafe input must never trigger network request")
})

test("PG Native KB detail uses only bounded keyword snippets and never calls a model",()=>{
  const detail=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeConfigDetail.tsx"),"utf8")
  const search=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeKnowledgeKeywordSearch.tsx"),"utf8")
  assert.match(detail,/PgNativeKnowledgeKeywordSearch/)
  assert.match(search,/api\.searchKnowledgeKeyword\(baseId,query\.trim\(\),6\)/)
  assert.match(search,/literal_keyword/)
  assert.match(search,/indexed_only!==true/)
  assert.match(search,/epoch\.current\+\+/)
  for(const pattern of [
    /pocketbase/,/getPocketBaseUrl/,/localStorage\./,
    /sessionStorage\./,/generateModel\(/,/fetch\(/,
    /dangerouslySetInnerHTML/
  ])assert.doesNotMatch(search,pattern)
})

test("Native TXT/Markdown UAT client posts only bounded synthetic text to fixed owner-scoped route",async()=>{
  const base="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    return new Response(JSON.stringify({
      item:{id:base,filename:"synthetic.md",status:"indexed",sha256:"a".repeat(64),
        chunk_count:2},scope:"private_keyword_only"
    }),{status:201})
  })
  const saved=await api.ingestKnowledgeTextUat(base,"synthetic.md","Safe synthetic source text")
  assert.equal(saved.item.filename,"synthetic.md")
  assert.equal(saved.item.chunk_count,2)
  assert.equal(calls.length,1)
  assert.equal(calls[0].url,"/__pg_native/api/v2/knowledge-bases/"+base+"/text-documents")
  assert.equal(calls[0].options.method,"POST")
  assert.equal(calls[0].options.credentials,"same-origin")
  assert.equal(calls[0].options.redirect,"error")
  assert.equal(calls[0].options.headers["X-AgentStudio-Request"],"1")
  assert.equal(calls[0].options.headers["Content-Type"],"application/json")
  assert.equal(Object.hasOwn(calls[0].options.headers,"Authorization"),false)
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    filename:"synthetic.md",text:"Safe synthetic source text"
  })
  for(const invalid of [
    ()=>api.ingestKnowledgeTextUat("../other","synthetic.md","safe"),
    ()=>api.ingestKnowledgeTextUat(base,"../../private.md","safe"),
    ()=>api.ingestKnowledgeTextUat(base,".secret.md","safe"),
    ()=>api.ingestKnowledgeTextUat(base,"unsafe.js","safe"),
    ()=>api.ingestKnowledgeTextUat(base,"test.md"," "),
    ()=>api.ingestKnowledgeTextUat(base,"test.md","a".repeat(12001)),
    ()=>api.ingestKnowledgeTextUat(base,"test.md","bad\u0000secret"),
  ])await assert.rejects(Promise.resolve().then(invalid),
    e=>e instanceof PgNativePilotError&&e.status===400)
  assert.equal(calls.length,1,"invalid ingestion input must not reach network")
})

test("Native isolated TXT/MD ingestion UI requires Vite DEV flag and cannot leak to PG-only release",()=>{
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  const panel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeTextIngestUatPanel.tsx"),"utf8")
  const verify=fs.readFileSync(path.join(root,
    "ops/verify-pg18-only-web-build.mjs"),"utf8")
  assert.match(page,/KB_INGEST_UAT_LOCAL_ONLY=import\.meta\.env\.DEV/)
  assert.match(page,/VITE_AGENT_STUDIO_PG_KB_TEXT_INGEST_UI_ENABLED/)
  assert.match(page,/TextIngestUatPanel&&!productionRoot/)
  assert.match(panel,/api\.ingestKnowledgeTextUat\(/)
  assert.match(verify,/dev_kb_ingestion_ui_leak/)
  assert.match(verify,/dev_kb_ingestion_button_leak/)
  for(const prohibited of [/from\s*["'].*(?:pocketbase|@\/lib\/pb)/,
    /getPocketBaseUrl/,/localStorage\./,/sessionStorage\./,
    /fetch\(/,/document-files/,/generateModel\(/,/dangerouslySetInnerHTML/]){
    assert.doesNotMatch(panel,prohibited)
  }
})

test("PG Native read-only schedule inventory uses fixed same-origin GET and validates IDs",async()=>{
  const id="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    return new Response(JSON.stringify({items:[{
      id,name:"Synthetic check",kind:"agent",enabled:false,
      time_zone:"Asia/Tokyo",revision:1
    }]}),{status:200})
  },"")
  const list=await api.listSchedules()
  assert.equal(list.length,1)
  const occurrences=await api.listScheduleOccurrences(id)
  assert.equal(occurrences.length,1)
  assert.deepEqual(calls.map(v=>v.url),[
    "/api/v2/schedules",
    "/api/v2/schedules/"+id+"/occurrences"
  ])
  assert.ok(calls.every(x=>x.options.method==="GET"&&
    x.options.credentials==="same-origin"&&x.options.redirect==="error"))
  assert.ok(calls.every(x=>!Object.hasOwn(x.options.headers,"Authorization")))
  await assert.rejects(api.listScheduleOccurrences("../../schedule"),
    e=>e.status===400&&e.code==="invalid_pg_native_schedule_id")
  assert.equal(calls.length,2)
})

test("PG schedule read-only panel never starts jobs or accesses PocketBase",()=>{
  const panel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeSchedulesReadonlyPanel.tsx"),"utf8")
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  assert.match(page,/PgNativeSchedulesReadonlyPanel/)
  assert.match(page,/section==="schedules"/)
  assert.match(panel,/api\.listSchedules\(\)/)
  assert.match(panel,/api\.listScheduleOccurrences\(id\)/)
  assert.match(panel,/revision\.current\+\+/)
  for(const pattern of [
    /from\s*["'].*(?:@\/lib\/pb|pocketbase)/,
    /localStorage\./,/sessionStorage\./,
    /\.submitRun\(/,/createSchedule\(/,/updateSchedule\(/,
    /setInterval\(/,/window\.location\.assign\(/
  ])assert.doesNotMatch(panel,pattern)
})

test("PG18 standalone candidate Vite config has an independent root and no PocketBase proxy",()=>{
  const vite=fs.readFileSync(path.join(root,"vibex-local/vite.pg18.config.ts"),"utf8")
  assert.match(vite,/pg18-app/)
  assert.match(vite,/publicDir:false/)
  assert.match(vite,/dist-pg18/)
  assert.match(vite,/manifest:true/)
  assert.doesNotMatch(vite,/__pb|__pg_native|pocketbase|studioAuth/)
})
test("PG18 release verifier refuses old PocketBase auth and DEV-only execution/ingest actions",()=>{
  const verify=fs.readFileSync(path.join(root,"ops/verify-pg18-only-web-build.mjs"),"utf8")
  for(const value of [
    "pocketbase_proxy","pocketbase_local_auth","pg_native_login_missing",
    "dev_run_approval_ui_leak","dev_kb_ingestion_ui_leak",
    "dev_agent_kb_binding_leak","production_cutover_allowed:false"
  ])assert.ok(verify.includes(value),value)
  assert.match(verify,/dist-pg18/)
  assert.match(verify,/pg_native_login_present:true/)
})
test("native PG client exposes 401/403 errors, never silently falls back",async()=>{
  const api=createPgNativePilotApi(async()=>new Response('{"error":"session_required"}',{
    status:401,headers:{"Content-Type":"application/json"}
  }))
  await assert.rejects(api.me(),err=>err instanceof PgNativePilotError&&
    err.status===401&&err.code==="session_required")
  const forbidden=createPgNativePilotApi(async()=>new Response('{"error":"admin_required"}',{
    status:403,headers:{"Content-Type":"application/json"}
  }))
  await assert.rejects(forbidden.createEmployee("staff@example.com","PasswordSecure2026!","Staff"),
    err=>err.status===403&&err.code==="admin_required")
  const offline=createPgNativePilotApi(async()=>{throw Error("network disconnected")})
  await assert.rejects(offline.me(),err=>err.status===0&&
    err.code==="pg_native_connection_unavailable")
})

test("PG Native Run UAT client uses only safe same-origin cookie routes and stable idempotency keys",async()=>{
  const uuid="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const key="isolated_case_001"
  const calls=[]
  const makeRun=()=>({
    id:uuid,agent_spec_id:uuid,owner_user_id:uuid,status:"queued",
    instruction:"Synthetic test instruction",result_text:"",
    checkpoint:{},step_count:0,last_error_code:""
  })
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    if(options.method==="GET"&&url.endsWith("/api/v2/runs"))
      return new Response(JSON.stringify({runs:[makeRun()]}),{status:200})
    if(options.method==="GET"&&url.endsWith("/api/v2/runs/"+uuid))
      return new Response(JSON.stringify({run:makeRun(),approval:null}),{status:200})
    if(url.endsWith("/model-approval"))
      return new Response(JSON.stringify({run:makeRun(),approval:"approved",replayed:false}),{status:202})
    return new Response(JSON.stringify({run:makeRun(),replayed:false}),{status:202})
  })
  assert.equal((await api.listRuns()).length,1)
  assert.equal((await api.getRun(uuid)).run.id,uuid)
  assert.equal((await api.submitRun(uuid,"Synthetic test instruction",key)).run.id,uuid)
  assert.equal((await api.decideModel(uuid,"approved")).approval,"approved")
  assert.equal(calls.length,4)
  assert.deepEqual(calls.map(x=>x.options.method),["GET","GET","POST","POST"])
  assert.deepEqual(JSON.parse(calls[2].options.body),{
    instruction:"Synthetic test instruction",idempotency_key:key
  })
  assert.deepEqual(JSON.parse(calls[3].options.body),{decision:"approved"})
  assert.ok(calls.every(x=>x.url.startsWith("/__pg_native/api/v2/")))
  assert.ok(calls.every(x=>x.options.credentials==="same-origin"))
  assert.ok(calls.every(x=>!Object.hasOwn(x.options.headers,"Authorization")))
  assert.ok(calls.filter(x=>x.options.method==="POST")
    .every(x=>x.options.headers["X-AgentStudio-Request"]==="1"))
  assert.ok(calls.every(x=>x.options.redirect==="error"))
})

test("PG Native Run UAT rejects malformed identity and payload before any HTTP request",async()=>{
  let calls=0
  const api=createPgNativePilotApi(async()=>{calls++;throw Error("unexpected network")})
  const id="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  for(const call of [
    ()=>api.getRun("../not-a-uuid"),
    ()=>api.submitRun("../other","hello","valid_run_0001"),
    ()=>api.submitRun(id,"hello","short"),
    ()=>api.submitRun(id,"hello","bad:key"),
    ()=>api.submitRun(id,"x".repeat(1201),"valid_run_0001"),
    ()=>api.decideModel("../other","approved"),
    ()=>api.decideModel(id,"rollback"),
  ])await assert.rejects(Promise.resolve().then(call),
    error=>error instanceof PgNativePilotError&&error.status===400)
  assert.equal(calls,0)
})

test("PG Native run panel stays dev-only and never turns the production-only PG18 UI into a task runner",()=>{
  const panel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeRunUatPanel.tsx"),"utf8")
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  assert.match(page,/RUN_UAT_LOCAL_ONLY=import\.meta\.env\.DEV/)
  assert.match(page,/VITE_AGENT_STUDIO_PG_RUN_APPROVAL_UI_ENABLED/)
  assert.match(page,/RunUatPanel&&!productionRoot/)
  assert.match(panel,/listRuns\(/)
  assert.match(panel,/submitRun\(/)
  assert.match(panel,/decideModel\(/)
  for(const forbidden of [/from\s*["'].*(?:@\/lib\/pb|pocketbase)/,
                           /localStorage\./,/sessionStorage\./,
                           /window\.location\.assign\("/]){
    assert.doesNotMatch(panel,forbidden)
  }
})
