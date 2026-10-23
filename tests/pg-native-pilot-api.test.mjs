import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createPgNativePilotApi,PgNativePilotError}
  from "../src/lib/pgNativePilotApi.ts"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")

test("single-shot API removes unavailable result/citations on every response path and refuses a malformed availability flag",async()=>{
  const id="11111111-1111-4111-8111-111111111111"
  let flag=false
  const api=createPgNativePilotApi(async url=>{
    const run={id,result_text:"MUST NOT RETAIN",knowledge_outputs_available:flag}
    const body=String(url).endsWith("/api/v2/runs")?{runs:[run]}:{run,steps:[{step_key:"model",metadata:{citations:["OLD_SOURCE"]}}],approval:"approved",replayed:true}
    return new Response(JSON.stringify(body),{status:200,headers:{"Content-Type":"application/json"}})
  })
  for(const row of [(await api.listRuns())[0],(await api.getRun(id)).run,(await api.submitRun(id,"Task","synthetic-key-0001")).run,(await api.decideModel(id,"approved")).run])
    assert.equal(row.result_text,"")
  assert.deepEqual((await api.getRun(id)).steps[0].metadata,{})
  flag="false"
  await assert.rejects(api.getRun(id),e=>e.code==="unconfirmed_agent_source_availability")
})
test("Native config capability uses same-origin GET and rejects malformed grants",async()=>{
  const calls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    return new Response(JSON.stringify({
      mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false
    }),{status:200})
  },"")
  assert.deepEqual(await api.getConfigCapabilities(),{
    mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false
  })
  assert.deepEqual(calls.map(x=>x.url),["/api/native-auth/capabilities"])
  assert.equal(calls[0].init.method,"GET")
  assert.equal(calls[0].init.credentials,"same-origin")
  assert.equal(calls[0].init.redirect,"error")
  assert.equal(Object.hasOwn(calls[0].init.headers,"Authorization"),false)
  for(const invalid of [
    {mode:"native_pg18",config_writes_enabled:"true",run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:true,run_execution_enabled:true},
    {mode:"wrong",config_writes_enabled:true,run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,
      workflow_validation_enabled:"yes",run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,
      run_submission_enabled:"yes",run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:false,model_probe_enabled:false,
      run_submission_enabled:true,run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,
      run_submission_enabled:false,bound_model_runs_enabled:true,run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,
      workflow_v2_submission_enabled:"yes",run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:false,model_probe_enabled:false,
      workflow_v2_submission_enabled:true,run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,
      autonomous_agent_submission_enabled:"yes",run_execution_enabled:false},
    {mode:"native_pg18",config_writes_enabled:false,model_probe_enabled:false,
      autonomous_agent_submission_enabled:true,run_execution_enabled:false},
    {}
  ]){
    const broken=createPgNativePilotApi(async()=>
      new Response(JSON.stringify(invalid),{status:200}),"")
    await assert.rejects(broken.getConfigCapabilities(),
      error=>error.status===503&&error.code==="invalid_native_capabilities")
  }
})

test("PG18 standalone configuration editing requires server authenticated approval",()=>{
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  assert.match(page,/api\.getConfigCapabilities\(\)/)
  assert.match(page,/\.catch\(\(\)=>null\)/)
  assert.match(page,/const canEditConfig=!productionRoot\|\|configEditEnabled/)
  assert.match(page,/setConfigEditEnabled\(false\)/)
  assert.match(page,/setConfigEditEnabled\(capability\?\.config_writes_enabled===true\)/)
  assert.match(page,/writeEnabled=\{configEditEnabled&&!loading&&!busy\}/)
  assert.match(page,/setWorkflowV2Enabled\(capability\?\.config_writes_enabled===true&&capability\.workflow_v2_submission_enabled===true\)/)
  assert.match(page,/setModelProbeEnabled\(capability\?\.model_probe_enabled===true\)/)
  assert.match(page,/setWorkflowValidationEnabled\(capability\?\.workflow_validation_enabled===true\)/)
  assert.match(page,/setWorkflowExecutionEnabled\(capability\?\.workflow_execution_enabled===true\)/)
  assert.match(page,/workflowValidationEnabled\|\|workflowExecutionEnabled/)
  assert.match(page,/PgNativeWorkflowValidationPanel/)
  const workflowPanel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeWorkflowValidationPanel.tsx"),"utf8")
  assert.match(workflowPanel,/executionEnabled&&<section/)
  assert.match(workflowPanel,/api\.submitWorkflowRun\(/)
  assert.match(workflowPanel,/api\.getWorkflowRun\(/)
  assert.match(page,/modelProbeEnabled&&<button/)
  assert.match(page,/api\.testModelConnection\(/)
  assert.match(page,/\{canEditConfig&&<CreateCard title="创建 Agent 配置"/)
  assert.match(page,/<PgNativeWorkflowWorkspace/)
  assert.match(page,/executionEnabled=\{workflowV2Enabled&&!loading&&!busy\}/)
  assert.match(page,/\{canEditConfig&&<CreateCard title="创建知识库"/)
  assert.match(page,/\{editing&&canEditConfig&&editing.kind===section&&/)
  for(const pattern of [
    /RunUatPanel&&!productionRoot/,
    /TextIngestUatPanel&&!productionRoot/,
    /AgentKnowledgeUatPanel&&!productionRoot/,
    /section==="employees"&&profile\.is_admin&&!productionRoot/
  ])assert.match(page,pattern)
})
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

test("PG-native inert schedule draft client uses same-origin cookie CRUD and version fencing",async()=>{
  const id="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const target="d983fea9-3cf1-409a-baf5-c5fdb59fcc94"
  const input={name:"Daily research",kind:"agent",target_id:target,
    time_zone:"Asia/Shanghai",rule:{kind:"daily",local_time:"08:30"}}
  const calls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    return new Response(JSON.stringify(init.method==="DELETE"?
      {ok:true,id,scheduler_started:false,execution_enabled:false}:
      {item:{id,revision:2,enabled:false,next_at:null,
        recurrence:{config_format:"pg_schedule_draft_v1",rule:input.rule,
          execution_supported:false}},
        scheduler_started:false,execution_enabled:false}),{status:200})
  },"/__pg_native")
  const item=await api.createScheduleDraft(input)
  assert.equal(item.enabled,false)
  assert.equal(item.next_at,null)
  await api.updateScheduleDraft(id,2,input)
  await api.deleteScheduleDraft(id,3)
  assert.deepEqual(calls.map(x=>x.init.method),["POST","PATCH","DELETE"])
  assert.ok(calls.every(x=>x.url.startsWith("/__pg_native/api/v2/schedules")))
  assert.equal(JSON.parse(calls[1].init.body).expected_revision,2)
  assert.equal(JSON.parse(calls[2].init.body).expected_revision,3)
  assert.ok(calls.every(x=>x.init.credentials==="same-origin"&&
    x.init.redirect==="error"&&x.init.headers["X-AgentStudio-Request"]==="1"))
  assert.ok(calls.every(x=>!Object.hasOwn(x.init.headers,"Authorization")))
  await assert.rejects(api.updateScheduleDraft("invalid",2,input),
    e=>e.status===400&&e.code==="invalid_pg_native_schedule_id")
  assert.equal(calls.length,3)
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

test("native Vite development proxy takes precedence over overlapping OIDC prefix",()=>{
  const vite=fs.readFileSync(path.join(root,"vibex-local/vite.local.config.ts"),"utf8")
  const native=vite.indexOf("'/__pg_native': pgNativePilotProxy")
  const old=vite.indexOf("'/__pg': pgPilotProxy")
  assert.ok(native>0&&old>native,"Native path must match before the shorter OIDC path")
  assert.match(vite,/target: 'http:\/\/127\.0\.0\.1:7403'/)
  assert.doesNotMatch(vite,/preview:\s*\{[^}]*__pg_native/s)
})
test("production bundle verifier also rejects leaked native auth pilot pages",()=>{
  const verify=fs.readFileSync(path.join(root,"ops/verify-pg-pilot-prod.mjs"),"utf8")
  assert.match(verify,/PgNativePilotPage/)
  assert.match(verify,/pg_native_connection_unavailable/)
  assert.match(verify,/__Host-agentstudio_session/)
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
      return new Response(JSON.stringify({run:makeRun(),approval:null,steps:[]}),{status:200})
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

test("PG Native model connection CRUD uses same-origin cookie requests and never receives secrets in responses",async()=>{
  const uuid="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const item={
    id:uuid,owner_user_id:"b83e3cb6-c02a-4fd8-8e91-5fbfe8e99f01",
    name:"Synthetic model",provider:"openai",base_url:"https://api.openai.com/v1",
    api_key_tail:"4321",enabled:true,status:"untested",last_latency_ms:0,
    last_checked_at:null,models:["gpt-4o"],last_error:"",revision:1,
    created_at:"2026-10-21T00:00:00Z",updated_at:"2026-10-21T00:00:00Z"
  }
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    const method=init.method||"GET"
    const data=method==="GET"?{items:[item]}:
      method==="DELETE"?{ok:true,id:uuid}:
      {item:{...item,revision:method==="PATCH"?2:1}}
    return new Response(JSON.stringify(data),{
      status:200,headers:{"Content-Type":"application/json"}
    })
  },"/__pg_native")
  const listed=await api.listModelConnections()
  assert.equal(listed[0].api_key_tail,"4321")
  assert.equal("api_key" in listed[0],false)
  const input={name:"Synthetic model",provider:"openai",
    base_url:"https://api.openai.com/v1",api_key:"synthetic-secret-only-in-request",
    models:["gpt-4o"],enabled:true}
  await api.createModelConnection(input)
  await api.updateModelConnection(uuid,1,{...input,api_key:""})
  assert.deepEqual(await api.deleteModelConnection(uuid),{ok:true,id:uuid})
  assert.deepEqual(calls.map(x=>x.init.method||"GET"),["GET","POST","PATCH","DELETE"])
  assert.ok(calls.every(x=>x.url.startsWith("/__pg_native/api/v2/model-connections")))
  assert.equal(JSON.parse(calls[1].init.body).api_key,"synthetic-secret-only-in-request")
  assert.equal(JSON.parse(calls[2].init.body).expected_revision,1)
  assert.ok(calls.every(x=>x.init.credentials==="same-origin"&&x.init.redirect==="error"))
  assert.ok(calls.every(x=>!Object.hasOwn(x.init.headers,"Authorization")))
  assert.ok(calls.filter(x=>x.init.method!=="GET")
    .every(x=>x.init.headers["X-AgentStudio-Request"]==="1"))
})

test("PG-native Tool Connections use owner-session CRUD, revisions, masked headers and no execution route",async()=>{
  const uuid="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const item={id:uuid,owner_user_id:"b83e3cb6-c02a-4fd8-8e91-5fbfe8e99f01",
    name:"CRM search",description:"Authorized CRM",url:"https://api.example.com/v1",
    method:"POST",headers:[{key:"authorization",value:"••••"}],
    body_template:'{"query":"{{input}}"}',timeout_s:12,enabled:true,
    status:"untested",last_latency_ms:0,last_checked_at:null,last_error:"",
    revision:1,created_at:"2026-10-21T00:00:00Z",updated_at:"2026-10-21T00:00:00Z"}
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    if(init.method==="GET")return new Response(JSON.stringify({
      items:[item],execution_enabled:false}),{status:200})
    if(init.method==="DELETE")return new Response(JSON.stringify({
      ok:true,id:uuid,execution_enabled:false}),{status:200})
    const body=JSON.parse(init.body)
    return new Response(JSON.stringify({
      item:{...item,...body,revision:init.method==="PATCH"?2:1,
        headers:item.headers},execution_enabled:false}),{status:init.method==="POST"?201:200})
  },"/__pg_native")
  const listed=await api.listToolConnections()
  assert.equal(listed[0].headers[0].value,"••••")
  const input={name:item.name,description:item.description,url:item.url,
    method:"POST",headers:[{key:"authorization",value:""}],
    body_template:item.body_template,timeout_s:12,enabled:true}
  await api.createToolConnection(input)
  await api.updateToolConnection(uuid,1,input)
  assert.deepEqual(await api.deleteToolConnection(uuid),
    {ok:true,id:uuid,execution_enabled:false})
  assert.deepEqual(calls.map(c=>c.init.method||"GET"),["GET","POST","PATCH","DELETE"])
  assert.ok(calls.every(c=>c.url.includes("/api/v2/tool-connections")))
  assert.equal(JSON.parse(calls[2].init.body).expected_revision,1)
  assert.ok(calls.every(c=>c.init.credentials==="same-origin"&&c.init.redirect==="error"))
  assert.ok(calls.every(c=>!Object.hasOwn(c.init.headers,"Authorization")))
  assert.ok(calls.filter(c=>c.init.method!=="GET")
    .every(c=>c.init.headers["X-AgentStudio-Request"]==="1"))
  assert.ok(calls.every(c=>!c.url.endsWith("/probe")&&!c.url.endsWith("/execute")))
  await assert.rejects(api.updateToolConnection("not-a-uuid",1,input),
    error=>error.status===400)
  assert.equal(calls.length,4)
})

test("native provider probe is a fixed same-origin cookie POST with only a revision",async()=>{
  const uuid="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const calls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    return new Response(JSON.stringify({item:{
      id:uuid,status:"ok",revision:3,last_latency_ms:17,
      last_error:"",api_key_tail:"0000"
    },mode:"read_only_provider_models_probe"}),{
      status:200,headers:{"Content-Type":"application/json"}
    })
  },"")
  const checked=await api.testModelConnection(uuid,2)
  assert.equal(checked.status,"ok")
  assert.equal(checked.revision,3)
  assert.equal("api_key" in checked,false)
  assert.equal(calls.length,1)
  assert.equal(calls[0].url,"/api/v2/model-connections/"+uuid+"/probe")
  assert.equal(calls[0].init.method,"POST")
  assert.equal(calls[0].init.credentials,"same-origin")
  assert.equal(calls[0].init.redirect,"error")
  assert.equal(calls[0].init.headers["X-AgentStudio-Request"],"1")
  assert.equal(JSON.stringify(JSON.parse(calls[0].init.body)),
    '{"expected_revision":2}')
  await assert.rejects(api.testModelConnection("not-a-uuid",2),
    error=>error.status===400)
  assert.equal(calls.length,1)
})

test("PG-native binding preserves other Agent fields and never passes provider secrets",async()=>{
  const agentId="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const connectionId="e8fe7b43-8bc9-4083-b356-aab45877c8a7"
  const baseId="4b4d3a17-65ea-43fa-a903-b9716c88010d"
  const existing={connection_id:connectionId,connection_revision:4,
    model_id:"gpt-4.1-mini"}
  const original={id:agentId,name:"Owner Agent",revision:3,
    spec:{goal:"Research",task_scope:"Restricted",deliverables:["Memo"],
      task_plan:["Verify"],done_criteria:["Cited"],tools:["knowledge_search"],
      knowledge_base_ids:[baseId],model_binding:existing}}
  const calls=[]
  const api=createPgNativePilotApi(async(url,options)=>{
    calls.push({url,options})
    return new Response(JSON.stringify({item:options.method==="GET"?original:{
      ...original,revision:4,spec:JSON.parse(options.body).spec
    }}),{status:200})
  },"")
  const binding={connection_id:connectionId,connection_revision:5,model_id:"gpt-4.1"}
  const result=await api.bindAgentModel(agentId,3,binding)
  assert.deepEqual(result.spec.model_binding,binding)
  const patch=JSON.parse(calls[1].options.body)
  assert.equal(patch.expected_revision,3)
  assert.equal(patch.spec.goal,"Research")
  assert.deepEqual(patch.spec.knowledge_base_ids,[baseId])
  assert.deepEqual(patch.spec.task_plan,["Verify"])
  assert.deepEqual(patch.spec.tools,["knowledge_search"])
  assert.equal(JSON.stringify(patch).includes("api_key"),false)
  assert.equal(calls[1].options.credentials,"same-origin")
  assert.equal(calls[1].options.headers["X-AgentStudio-Request"],"1")
  const removed=await api.bindAgentModel(agentId,3,null)
  assert.equal(removed.spec.model_binding,undefined)
  const renamed=await api.updateAgent(agentId,3,"Renamed","Next goal")
  assert.deepEqual(renamed.spec.model_binding,existing)
  await api.updateAgentKnowledgeBases(agentId,3,[baseId])
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).spec.model_binding,existing)
  await assert.rejects(api.bindAgentModel(agentId,3,{
    ...binding,connection_id:"../forged"
  }),e=>e.status===400&&e.code==="invalid_pg_native_model_binding")
  assert.equal(calls.at(-1).options.method,"GET")
  const panel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeAgentModelBindingPanel.tsx"),"utf8")
  assert.match(panel,/bindAgentModel\(/)
  assert.match(panel,/c\.status==="ok"/)
  assert.doesNotMatch(panel,/localStorage\.|sessionStorage\./)
})

test("Native Workflow validation UAT is fixed same-origin POST with no execution fields",async()=>{
  const workflowId="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const runId="9d857550-0f62-4e71-a4a2-cd01562a7fad"
  const result={
    run:{id:runId,workflow_id:workflowId,status:"succeeded",step_count:2,
      kind:"workflow",checkpoint:{stage:"workflow_validation_succeeded"},
      result_text:"Graph validated"},
    steps:[{step_key:"workflow_validate:start",status:"succeeded",
      metadata:{node_id:"start",node_type:"start",index:"000",
        validation_only:true,external_effects_executed:false}}],
    replayed:false,mode:"graph_validation_only",external_effects_executed:false
  }
  const calls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    return new Response(JSON.stringify(result),{status:200})
  },"")
  const first=await api.validateWorkflow(workflowId,3,"workflow-validation-123")
  assert.equal(first.mode,"graph_validation_only")
  assert.equal(first.external_effects_executed,false)
  const restored=await api.getWorkflowValidation(runId)
  assert.equal(restored.run.id,runId)
  assert.deepEqual(calls.map(c=>c.init.method),["POST","GET"])
  assert.equal(calls[0].url,"/api/v2/workflows/"+workflowId+"/validate")
  assert.equal(calls[1].url,"/api/v2/workflow-validations/"+runId)
  assert.equal(JSON.stringify(JSON.parse(calls[0].init.body)),
    '{"expected_revision":3,"idempotency_key":"workflow-validation-123"}')
  assert.ok(calls.every(c=>c.init.credentials==="same-origin"&&
    c.init.redirect==="error"&&!Object.hasOwn(c.init.headers,"Authorization")))
  assert.equal(calls[0].init.headers["X-AgentStudio-Request"],"1")
  assert.equal(calls[1].init.headers["X-AgentStudio-Request"],undefined)
  await assert.rejects(api.validateWorkflow(workflowId,3,"invalid!"),
    e=>e.status===400&&e.code==="invalid_validation_idempotency_key")
  assert.throws(()=>api.getWorkflowValidation("not-an-id"),
    e=>e.status===400&&e.code==="invalid_pg_native_validation_id")
  assert.equal(calls.length,2)
})

test("PG-native safe Workflow run client is same-origin, idempotent-key bounded and execution-scoped",async()=>{
  const workflowId="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const runId="9d857550-0f62-4e71-a4a2-cd01562a7fad"
  const result={
    run:{id:runId,workflow_id:workflowId,kind:"workflow",status:"queued",
      step_count:0,result_text:"",checkpoint:{execution_mode:"start_end_only"}},
    steps:[],job_status:"queued",replayed:false,
    execution_mode:"start_end_only",external_effects_executed:false
  }
  const calls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    return new Response(JSON.stringify(result),{status:202})
  },"")
  const created=await api.submitWorkflowRun(workflowId,4,"safe_workflow_0001")
  assert.equal(created.run.status,"queued")
  assert.equal(created.execution_mode,"start_end_only")
  assert.equal(created.external_effects_executed,false)
  const restored=await api.getWorkflowRun(runId)
  assert.equal(restored.run.id,runId)
  assert.deepEqual(calls.map(c=>c.init.method),["POST","GET"])
  assert.equal(calls[0].url,"/api/v2/workflows/"+workflowId+"/runs")
  assert.equal(calls[1].url,"/api/v2/workflow-runs/"+runId)
  assert.equal(JSON.stringify(JSON.parse(calls[0].init.body)),
    '{"expected_revision":4,"idempotency_key":"safe_workflow_0001"}')
  assert.ok(calls.every(c=>c.init.credentials==="same-origin"&&
    c.init.redirect==="error"&&!Object.hasOwn(c.init.headers,"Authorization")))
  assert.equal(calls[0].init.headers["X-AgentStudio-Request"],"1")
  assert.equal(calls[1].init.headers["X-AgentStudio-Request"],undefined)
  assert.throws(()=>api.getWorkflowRun("not-a-run-id"),
    e=>e.status===400&&e.code==="invalid_pg_native_workflow_run_id")
  await assert.rejects(api.submitWorkflowRun(workflowId,4,"bad/key"),
    e=>e.status===400&&e.code==="invalid_workflow_run_idempotency_key")
  assert.equal(calls.length,2)
})

test("PG-native Workflow history uses fixed same-origin GETs and exposes no execution action",async()=>{
  const workflowId="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
  const runId="9d857550-0f62-4e71-a4a2-cd01562a7fad"
  const result={
    run:{id:runId,workflow_id:workflowId,kind:"workflow",status:"succeeded",
      step_count:2,result_text:"Synthetic workflow result",
      checkpoint:{execution_mode:"start_end_only"},last_error_code:"",
      created_at:"2026-10-22T00:00:00.000Z",updated_at:"2026-10-22T00:00:01.000Z",
      finished_at:"2026-10-22T00:00:01.000Z"},
    steps:[],job_status:"succeeded",replayed:true,
    execution_mode:"start_end_only",external_effects_executed:false
  }
  const calls=[]
  const api=createPgNativePilotApi(async(url,init)=>{
    calls.push({url,init})
    if(url==="/api/v2/workflow-runs")
      return new Response(JSON.stringify({runs:[result],worker_started_by_api:false}),{status:200})
    return new Response(JSON.stringify({...result,worker_started_by_api:false}),{status:200})
  },"")
  const items=await api.listWorkflowRuns()
  assert.equal(items.length,1)
  assert.equal(items[0].run.id,runId)
  assert.equal((await api.getWorkflowRun(runId)).run.id,runId)
  assert.deepEqual(calls.map(c=>c.init.method),["GET","GET"])
  assert.deepEqual(calls.map(c=>c.url),[
    "/api/v2/workflow-runs","/api/v2/workflow-runs/"+runId
  ])
  assert.ok(calls.every(c=>c.init.credentials==="same-origin"&&
    c.init.redirect==="error"&&!Object.hasOwn(c.init.headers,"Authorization")&&
    !Object.hasOwn(c.init.headers,"X-AgentStudio-Request")))
  assert.throws(()=>api.getWorkflowRun("not-a-run-id"),
    e=>e.status===400&&e.code==="invalid_pg_native_workflow_run_id")
  assert.equal(calls.length,2)
})

test("PG18 Workflow history UI is always read-only and never starts a Worker",()=>{
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  const panel=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeWorkflowRunHistoryReadonlyPanel.tsx"),"utf8")
  const service=fs.readFileSync(path.join(root,
    "services/pg-api/src/native-server.ts"),"utf8")
  const policy=fs.readFileSync(path.join(root,
    "services/pg-api/src/native-config-uat-policy.ts"),"utf8")
  assert.match(page,/label:"Workflow 运行历史（只读）"/)
  assert.match(page,/section==="workflowRuns"&&\s*<PgNativeWorkflowRunHistoryReadonlyPanel/)
  assert.match(panel,/api\.listWorkflowRuns\(\)/)
  assert.match(panel,/api\.getWorkflowRun\(id\)/)
  assert.match(panel,/执行步骤（只读）/)
  assert.doesNotMatch(panel,/api\.(?:submitWorkflowRun|submitRun|decideModel)\(/)
  assert.doesNotMatch(panel,/localStorage|sessionStorage|pocketbase/i)
  assert.match(service,/workflowSafeRunRepository:new WorkflowSafeRunRepository/)
  assert.match(policy,/method==="GET"&&\(pathname==="\/api\/v2\/workflow-runs"/)
  assert.match(policy,/policy\.workflowExecutionUat===true&&/)
})
test("developer Run UAT remains excluded from production while employee controls require separate capabilities",()=>{
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

test("PG18 Run history remains read-only and server write paths require independent approval",()=>{
  const page=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativePilotPage.tsx"),"utf8")
  const readonly=fs.readFileSync(path.join(root,
    "src/pages/PgNativePilot/PgNativeRunHistoryReadonlyPanel.tsx"),"utf8")
  const service=fs.readFileSync(path.join(root,
    "services/pg-api/src/native-server.ts"),"utf8")
  const policy=fs.readFileSync(path.join(root,
    "services/pg-api/src/native-config-uat-policy.ts"),"utf8")
  assert.match(page,/label:"Agent 运行历史（只读）"/)
  assert.match(page,/section==="runs"&&\s*<PgNativeRunHistoryReadonlyPanel/)
  assert.match(page,/section==="runUat"&&RunUatPanel&&!productionRoot/)
  assert.match(readonly,/api\.listRuns\(\)/)
  assert.match(readonly,/api\.getRun\(id\)/)
  assert.match(readonly,/detail\.value\.steps\.map/)
  assert.match(readonly,/执行步骤（只读）/)
  assert.match(readonly,/active\.current&&seq===generation\.current/)
  assert.match(readonly,/only|只读/)
  assert.doesNotMatch(readonly,/api\.(?:submitRun|decideModel|testModelConnection)\(/)
  assert.doesNotMatch(readonly,/from\s*["'](?:pocketbase|@\/lib\/pb)["']/)
  assert.doesNotMatch(readonly,/localStorage|sessionStorage|dangerouslySetInnerHTML/)
  assert.match(service,/scopedKnowledgePool\(adapter\(businessPool\),capabilities\.knowledgeSharingUat===true\)/)
  assert.match(service,/runRepository:createNativeRunRepository\(business,capabilities\)/)
  assert.doesNotMatch(service,/allowBoundModelRuns:true/)
  assert.ok(policy.includes('method==="GET" && (pathname==="/api/v2/runs"'))
  assert.match(policy,/policy\.runApprovalUat===true&&policy\.configurationWrites===true&&/)
})
