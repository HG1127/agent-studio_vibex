import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import {once} from "node:events"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {loadPg18CiBaseline} from "../src/pg18-ci-schema.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createHandler} from "../src/http.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {ScheduleInventoryRepository} from "../src/schedule-inventory-repository.ts"
import {permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=readFileSync(path.join(root,"db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
const issuer="urn:agentstudio:local:v1"
const origin="http://localhost:7403"

async function startFixture(policy=null){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(loadPg18CiBaseline().sql)
  // Production guard is never modified; this is an embedded PG17 fixture.
  await prepareNativeAuthPgliteRoles(db)
  await db.exec(reviewedNativeSqlForEmbeddedTest(sql))
  const pool={async connect(){return {
    query:(statement,params=[])=>db.query(statement,params),release(){}
  }}}
  const auth=new NativeAuthRepository(pool)
  await auth.provisionInitialAdmin({
    email:"admin@example.com",
    password:"SyntheticAdminStrongPassword#2026",
    display_name:"Administrator"
  })
  let backend
  const native=createNativeAuthHttpHandler({
    auth,allowedOrigin:origin,
    ...(policy?{allowEmployeeProvisioning:policy.employeeProvisioning}:{}),
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
    ...(policy?.runApprovalUat===true?{runRepository:new RunRepository(pool)}:{}),
    workflowRepository:new WorkflowRepository(pool),
    knowledgeRepository:new KnowledgeBaseRepository(pool),
    scheduleInventory:new ScheduleInventoryRepository(pool),
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
  return {db,pool,server,api:createPgNativePilotApi(transport),transport,
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
    assert.equal(cross.status,405)
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

test("native config-only capability never exposes Run or model approval endpoints",async()=>{
  const f=await startFixture({
    configurationWrites:true,employeeProvisioning:false,runApprovalUat:false
  })
  try{
    await f.api.login("admin@example.com","SyntheticAdminStrongPassword#2026")
    const agent=await f.api.createAgent("No execution","Configuration UAT only")
    await assert.rejects(f.api.listRuns(),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    await assert.rejects(f.api.submitRun(agent.id,"No worker","denied_run_00001"),
      error=>error.status===405&&error.code==="pilot_business_writes_disabled")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await f.close()}
})
