import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {PDFDocument,StandardFonts} from "pdf-lib"
import JSZip from "jszip"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {createNativeAuthHttpHandler} from "../src/native-auth-http.mjs"
import {AgentSpecRepository} from "../src/repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"
import {KnowledgeContentRepository} from "../src/knowledge-content-repository.ts"
import {verifyKnowledgeContentSchema} from "../src/knowledge-content-privileges.ts"
import {parseUploadedDocument} from "../src/document-parser.ts"
import {createHandler} from "../src/http.ts"
import {permitNativePg18BusinessUatRequest,selectNativePg18UatCapabilities} from "../src/native-config-uat-policy.ts"
import {selectKnowledgeSharing} from "../src/knowledge-sharing-policy.ts"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
const sql=name=>readFileSync(new URL("../../../db/postgres/"+name,import.meta.url),"utf8").split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const password="Synthetic-Knowledge-HTTP-Only#2026",origin="https://knowledge.example.test"
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio");await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db);await db.exec(reviewedNativeSqlForEmbeddedTest(sql("010_pg18_native_auth_proposed.sql")))
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic HTTP fixture predecessor') ON CONFLICT DO NOTHING")
  for(const name of ["024_bound_dispatch_identity","025_workflow_model_identity","026_workflow_tool_identity","027_workflow_agent_identity","028_autonomous_agent_identity","029_mcp_connections","030_mcp_tool_identity","031_smithery_managed","032_knowledge_access","033_knowledge_content"])
    await db.exec(sql("migrations/pg_v9_"+name+".sql"))
  let tail=Promise.resolve()
  const pool={async connect(){const wait=tail;let release;tail=new Promise(done=>release=done);await wait;return {query:(text,values=[])=>db.query(text,values),release}}}
  await verifyKnowledgeContentSchema(pool)
  const auth=new NativeAuthRepository(pool),owner=await auth.provisionInitialAdmin({email:"owner@example.test",password,display_name:"Owner"})
  const login=await auth.login("owner@example.test",password),reader=await auth.provisionEmployee(login.token,{email:"reader@example.test",password,display_name:"Reader"})
  const policy={configurationWrites:true,employeeProvisioning:true,knowledgeSharingUat:true},access=new KnowledgeAccessRepository(pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email)),content=new KnowledgeContentRepository(pool)
  let backend
  const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,allowKnowledgeSharing:true,
    businessHandler:(req,res)=>{
      if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,policy)){res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"native_readonly"}));return}
      return backend(req,res)
    }})
  backend=createHandler({allowedOrigin:origin,repository:new AgentSpecRepository(pool),knowledgeRepository:new KnowledgeBaseRepository(pool),
    knowledgeAccessRepository:access,knowledgeContentRepository:content,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error("bearer forbidden")}})
  const server=createServer(native.handler);await new Promise(done=>server.listen(0,"127.0.0.1",done))
  const address="http://127.0.0.1:"+server.address().port
  function client(){let cookie="";const calls=[]
    const transport=async(url,options={})=>{
      calls.push({url,options});const headers=new Headers(options.headers);headers.set("Origin",origin);if(cookie)headers.set("Cookie",cookie)
      const response=await fetch(address+url,{...options,headers}),set=response.headers.get("set-cookie")
      if(set)cookie=set.split(";")[0]
      return response
    };return {api:createPgNativePilotApi(transport,""),calls,transport}
  }
  return {db,auth,owner,reader,policy,client,async close(){await new Promise(done=>server.close(done));await db.close()}}
}
test("Native Cookie employee knowledge flow enforces viewer/editor, owner grants, revocation, receipts and no arbitrary employee headers",async()=>{
  const f=await fixture()
  try{
    const owner=f.client(),reader=f.client();await owner.api.login("owner@example.test",password);await reader.api.login("reader@example.test",password)
    assert.equal((await owner.api.getConfigCapabilities()).knowledge_sharing_enabled,true)
    const base=await owner.api.createKnowledge("Shared HTTP","Synthetic only"),share=await owner.api.changeKnowledgeAccess(base.id,{action:"grant",recipient_email:"reader@example.test",role:"viewer",semantic_allowed:false,expected_revision:0,request_id:randomUUID()})
    assert.equal((await reader.api.listSharedKnowledge())[0].id,base.id)
    const created=await owner.api.importSharedKnowledge(base.id,{request_id:randomUUID(),filename:"public.txt",text:"Cedar native shared evidence"})
    assert.equal((await reader.api.searchSharedKnowledge(base.id,"Cedar"))[0].document_id,created.item.document_id)
    await assert.rejects(reader.api.listKnowledgeGrants(base.id),error=>error.status===404)
    await assert.rejects(reader.api.importSharedKnowledge(base.id,{request_id:randomUUID(),filename:"invalid.pdf",content_base64:"not base64"}),error=>error.status===403)
    await owner.api.changeKnowledgeAccess(base.id,{action:"grant_existing",recipient_id:share.item.recipient_id,role:"editor",semantic_allowed:false,expected_revision:1,request_id:randomUUID()})
    const request={request_id:randomUUID(),filename:"reader.md",text:"Reader authored cedar document"},added=await reader.api.importSharedKnowledge(base.id,request)
    assert.equal((await reader.api.importSharedKnowledge(base.id,request)).replayed,true)
    assert.deepEqual(await reader.api.getKnowledgeContentReceipt(base.id,request.request_id),added.item)
    await reader.api.deleteSharedKnowledge(base.id,{request_id:randomUUID(),document_id:added.item.document_id,sha256:added.item.sha256})
    const revoke={action:"revoke",recipient_id:f.reader.id,expected_revision:2,request_id:randomUUID()}
    await owner.api.changeKnowledgeAccess(base.id,revoke)
    assert.equal((await owner.api.getKnowledgeAccessReceipt(base.id,revoke.request_id)).revoked,true)
    await assert.rejects(reader.api.searchSharedKnowledge(base.id,"Cedar"),error=>error.status===404)
    await assert.rejects(reader.api.getKnowledgeContentReceipt(base.id,request.request_id),error=>error.status===404)
    const spoof=await reader.transport("/api/v2/shared-knowledge/"+base.id,{headers:{"X-Rh-User-Id":f.owner.id}})
    assert.equal(spoof.status,404)
    f.policy.knowledgeSharingUat=false
    await assert.rejects(owner.api.listSharedKnowledge(),error=>error.status===405)
    assert.ok(owner.calls.every(call=>call.options.credentials==="same-origin"&&call.options.redirect==="error"))
  }finally{await f.close()}
})
test("shared editor PDF and DOCX uploads use actual isolated parsers; output exposes citations without original files, vectors or object keys",async()=>{
  const f=await fixture()
  try{
    const owner=f.client(),reader=f.client();await owner.api.login("owner@example.test",password);await reader.api.login("reader@example.test",password)
    const base=await owner.api.createKnowledge("Documents","Synthetic only")
    await owner.api.changeKnowledgeAccess(base.id,{action:"grant",recipient_email:"reader@example.test",role:"editor",semantic_allowed:false,expected_revision:0,request_id:randomUUID()})
    const pdf=await PDFDocument.create(),page=pdf.addPage(),font=await pdf.embedFont(StandardFonts.Helvetica);page.drawText("PDF cedar evidence",{x:30,y:40,font})
    await reader.api.importSharedKnowledge(base.id,{request_id:randomUUID(),filename:"evidence.pdf",content_base64:Buffer.from(await pdf.save()).toString("base64")})
    const docx=new JSZip();docx.file("[Content_Types].xml",'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    docx.file("word/document.xml",'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX cedar evidence '+"文".repeat(13000)+'</w:t></w:r></w:p></w:body></w:document>')
    const payload={filename:"evidence.docx",content_base64:await docx.generateAsync({type:"base64"})}
    await assert.rejects(parseUploadedDocument(payload),error=>error.code==="extracted_text_too_long")
    await reader.api.importSharedKnowledge(base.id,{request_id:randomUUID(),...payload})
    await assert.rejects(reader.api.importSharedKnowledge(base.id,{request_id:randomUUID(),...payload,profile:"anything"}),error=>error.status===400)
    const docs=await reader.api.listSharedKnowledgeDocuments(base.id),hits=await reader.api.searchSharedKnowledge(base.id,"cedar")
    assert.equal(docs.length,2);assert.equal(hits.length,2)
    assert.equal(JSON.stringify([docs,hits]).includes("inline-db:"),false);assert.ok(docs.every(row=>!Object.hasOwn(row,"text_content")&&!Object.hasOwn(row,"embedding")))
    await assert.rejects(reader.api.importSharedKnowledge(base.id,{request_id:randomUUID(),filename:"broken.pdf",content_base64:Buffer.from("invalid PDF").toString("base64")}),error=>error.status>=400&&error.status<500)
  }finally{await f.close()}
})
test("knowledge sharing needs its own isolated grant and non-root HTTPS listen; default configurations permit no sharing endpoints",()=>{
  assert.equal(selectKnowledgeSharing({}),false)
  for(const env of [{AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"true"},{AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"false"},{AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:"anything"}])assert.throws(()=>selectKnowledgeSharing(env),/unsafe_knowledge_sharing_config/)
  const env={AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_ENABLED:"true",AGENT_STUDIO_PG18_KNOWLEDGE_SHARING_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_KNOWLEDGE_SHARING_ONLY"}
  assert.equal(selectNativePg18UatCapabilities(env,true,origin,1001).knowledgeSharingUat,true)
  assert.throws(()=>selectNativePg18UatCapabilities(env,false,origin,1001));assert.throws(()=>selectNativePg18UatCapabilities(env,true,origin,0))
  for(const method of ["GET","POST","DELETE"])
    assert.equal(permitNativePg18BusinessUatRequest("/api/v2/shared-knowledge",method,selectNativePg18UatCapabilities({},false,origin,1001)),false)
})
