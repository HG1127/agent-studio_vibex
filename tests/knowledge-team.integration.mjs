// Team knowledge: true signed JWT and SQLite integration; no production data.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {createServer} from "node:http"
import {DatabaseSync} from "node:sqlite"
import {randomBytes} from "node:crypto"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd(),pb=process.env.POCKETBASE_BIN||
 path.join(root,"vibex-local/bin/windows/pocketbase.exe")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-team-"))
const port=await new Promise((resolve,reject)=>{
 const s=net.createServer();s.on("error",reject)
 s.listen(0,"127.0.0.1",()=>{const n=s.address().port;s.close(()=>resolve(n))})
})
const origin="http://127.0.0.1:"+port,secret=randomBytes(32).toString("hex")
// A real local OpenAI-compatible Embeddings mock, never an external service.
// Calls are attributed to the key that actually performs the paid request.
const semanticCalls=[]
const semanticVector=text=>{
 const t=String(text||"")
 return /协作|核验|审批|制度规定|材料核对|知识库/.test(t)?[1,0.01,0]:[0,1,0.01]
}
const embeddingServer=createServer(async(req,res)=>{
 let raw=""
 for await(const part of req)raw+=part.toString()
 if(req.url!=="/v1/embeddings"){res.writeHead(404).end();return}
 const request=JSON.parse(raw||"{}")
 semanticCalls.push({
  auth:String(req.headers.authorization||""),
  inputs:Array.isArray(request.input)?request.input:[],
  model:String(request.model||""),
 })
 res.writeHead(200,{"Content-Type":"application/json"})
 res.end(JSON.stringify({data:(request.input||[]).map((item,i)=>({
  index:i,embedding:semanticVector(item),
 }))}))
})
await new Promise(resolve=>embeddingServer.listen(0,"127.0.0.1",resolve))
const embeddingPort=embeddingServer.address().port

const server=spawnHeadlessPocketBase(pb,[
 "serve","--http=127.0.0.1:"+port,"--dir="+dir,
 "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),env:{
 AGENT_STUDIO_AUTH_MODE:"standalone",
 AGENT_STUDIO_ALLOW_ANON:"false",
 AGENT_STUDIO_BOOTSTRAP_SECRET:secret,
 AGENT_STUDIO_STRICT_SECRETS:"true",
 AGENT_STUDIO_SECRET_KEY:"0123456789abcdef0123456789abcdef",
 AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true",
 AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:String(embeddingPort),
}})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let logs=""
let modelServer=null
server.stdout.on("data",x=>logs=(logs+x).slice(-14000))
server.stderr.on("data",x=>logs=(logs+x).slice(-14000))
async function call(method,uri,body,token="",headers={}){
 const resp=await fetch(origin+uri,{method,
 headers:{"Content-Type":"application/json",...(token?{Authorization:token}:{}),...headers},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),
 signal:AbortSignal.timeout(18000)})
 return {status:resp.status,data:await resp.json().catch(()=>({}))}
}
async function expect(method,url,body,token="",code=200,headers={}){
 const result=await call(method,url,body,token,headers)
 assert.equal(result.status,code,method+" "+url+": "+JSON.stringify(result.data))
 return result.data
}
const post=(url,body,token,headers)=>call("POST",url,body,token,headers)
const get=(url,token)=>call("GET",url,undefined,token)
try{
 let ready=false
 for(let n=0;n<130;n++){
  try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(650)})).ok){ready=true;break}}catch{}
  await sleep(120)
 }
 assert.ok(ready,"PocketBase failed startup: "+logs.slice(-2500))
 const admin=await expect("POST","/api/studio/bootstrap",{
  email:"owner@example.test",password:"Owner-Test-Password-2026",display_name:"知识所有者",
 },"",201,{"X-Agent-Studio-Setup-Key":secret})
 const ownerId=admin.user.id
 const ownerToken=(await expect("POST","/api/collections/studio_users/auth-with-password",{
  identity:"owner@example.test",password:"Owner-Test-Password-2026",
 })).token
 async function staff(email,name){
  const created=await expect("POST","/api/studio/users",{
   email,display_name:name,password:"Employee-Test-Password-2026",role:"employee",
  },ownerToken,201)
  const login=await expect("POST","/api/collections/studio_users/auth-with-password",{
   identity:email,password:"Employee-Test-Password-2026",
  })
  return {id:created.user.id,token:login.token}
 }
 const editor=await staff("editor@example.test","资料编辑")
 const viewer=await staff("viewer@example.test","检索人员")
 const outsider=await staff("outsider@example.test","未授权员工")
 const base=await expect("POST","/api/knowledge-bases/manage",{
  action:"create",name:"公司共享资料",description:"敏感部门资料只按岗位授权",
 },ownerToken)
 const baseId=base.id
 const doc=await expect("POST","/api/knowledge-bases/documents",{
  action:"upload",base_id:baseId,filename:"共同流程.md",
  content:"内部知识库协作流程采用来源可核验资料和审批记录。".repeat(8),
 },ownerToken)
 const query={base_ids:[baseId],query:"协作流程",mode:"auto"}
 assert.equal((await post("/api/knowledge-bases/search",query,viewer.token)).status,404)
 assert.equal((await post("/api/knowledge-bases/search",query,outsider.token)).status,404)
 assert.equal((await get("/api/knowledge-bases/documents?base_id="+baseId,viewer.token)).status,404)
 const forbidden=await post("/api/knowledge-bases/access",{
  base_id:baseId,action:"grant",recipient_email:"viewer@example.test",role:"viewer",
 },viewer.token)
 assert.equal(forbidden.status,404)
 assert.equal((await post("/api/knowledge-bases/access",{
  base_id:baseId,action:"grant",recipient_email:"outsider@example.test",role:"admin",
 },ownerToken)).status,400)
 assert.equal((await post("/api/knowledge-bases/access",{
  base_id:baseId,action:"grant",recipient_email:"owner@example.test",role:"editor",
 },ownerToken)).status,404)
 const granted=await expect("POST","/api/knowledge-bases/access",{
  base_id:baseId,action:"grant",recipient_email:"viewer@example.test",role:"viewer",
 },ownerToken)
 assert.equal(granted.recipient_id,viewer.id)
 await expect("POST","/api/knowledge-bases/access",{
  base_id:baseId,action:"grant",recipient_email:"editor@example.test",role:"editor",
 },ownerToken)
 const grants=await expect("GET","/api/knowledge-bases/access?base_id="+baseId,undefined,ownerToken)
 assert.equal(grants.grants.length,2)
 assert.equal((await get("/api/knowledge-bases/access?base_id="+baseId,viewer.token)).status,404)
 const list=await expect("GET","/api/knowledge-bases",undefined,viewer.token)
 assert.equal(list.items.length,1)
 assert.equal(list.items[0].access_role,"viewer")
 assert.equal(list.items[0].owner_uid,ownerId)
 assert.equal((await expect("GET","/api/knowledge-bases/documents?base_id="+baseId,
  undefined,viewer.token)).items.length,1)
 const sharedHit=await expect("POST","/api/knowledge-bases/search",query,viewer.token)
 assert.equal(sharedHit.retrieval,"lexical")
 assert.equal(sharedHit.shared_lexical_only,true)
 assert.match(sharedHit.items[0].text,/来源可核验/)
 // Real Workflow tool must read the employee's authorized team source.
 const graph={nodes:[
  {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:0}},
  {id:"search",type:"tool",data:{title:"搜索",tool:"knowledge_search",
   knowledge_base_ids:[baseId],params_template:JSON.stringify({query:"协作流程"})},
   position:{x:180,y:0}},
  {id:"end",type:"end",data:{title:"结束",output_template:"{{搜索.output}}"},
   position:{x:360,y:0}},
 ],edges:[{id:"a",source:"start",target:"search"},{id:"b",source:"search",target:"end"}]}
 const wf=await expect("POST","/api/workflow-studio/create",{name:"团队检索",graph},viewer.token)
 async function executeSharedWorkflow(){
  const run=await expect("POST","/api/workflow-runs/start",{
   workflow_id:wf.id,instruction:"按文档查找内部协作记录",
  },viewer.token)
  let detail
  for(let i=0;i<7;i++){
   await expect("POST","/api/llm/workflow-engine/"+run.run_id+"/tick",{},viewer.token)
   detail=await expect("GET","/api/workflow-runs/"+run.run_id+"/detail",undefined,viewer.token)
   if(["succeeded","failed"].includes(detail.run.status))break
  }
  assert.equal(detail.run.status,"succeeded",JSON.stringify(detail.run))
  return String(detail.run.result||"")
 }
 const retrieved=await executeSharedWorkflow()
 assert.match(retrieved,/共同流程\.md · 片段/)
 assert.match(retrieved,/来源可核验/)
 // Agent must also resolve an explicitly shared source with its *own* model
 // connection. A mock LLM is used; no real tokens or billable calls are made.
 let modelCalls=0,contextSawSharedText=false,toolQuestion="协作流程"
 modelServer=createServer(async(req,res)=>{
  let raw=""
  for await(const chunk of req)raw+=chunk.toString()
  if(req.url!=="/v1/chat/completions"){res.writeHead(404).end();return}
  modelCalls++
  const request=JSON.parse(raw||"{}")
  const messages=JSON.stringify(request.messages||[])
  if(messages.includes("来源可核验资料"))contextSawSharedText=true
  const action=modelCalls===1 ?
    {thought:"查找团队授权的资料",action:"tool",tool:"knowledge_search",
     tool_input:{query:toolQuestion}} :
    {thought:"根据已取得的文件来源回答",action:"final",
     final_answer:"已查得 [共同流程.md · 片段1]"}
  res.writeHead(200,{"Content-Type":"application/json"})
  res.end(JSON.stringify({choices:[{message:{role:"assistant",content:JSON.stringify(action)}}]}))
 })
 await new Promise(resolve=>modelServer.listen(0,"127.0.0.1",resolve))
 const mockPort=modelServer.address().port
 const conn=await expect("POST","/api/model-connections",{
  name:"只属于查看人的测试模型",provider:"openai",
  base_url:"http://127.0.0.1:"+mockPort+"/v1",
  api_key:"owner-independent-test-key",models:["team-chat-model"],
 },viewer.token)
 const agent=await expect("POST","/api/agent_specs",{
  name:"共享知识检索助手",
  spec:{goal:"根据授权来源撰写引用",task_scope:"只使用已授权资料",
   deliverables:["原文引用"],task_plan:["检索","引用"],
   done_criteria:["提供来源"],tools:["knowledge_search"],knowledge_base_ids:[baseId]},
 },viewer.token)
 const agentRun=await expect("POST","/api/agent-runs/start",{
  spec_id:agent.id,instruction:"查找内部团队流程并引用",
  model:"team-chat-model",
  config:{max_steps:4,tools:{knowledge_search:true},
   custom_model:{connection_id:conn.item.id,model_id:"team-chat-model"}},
 },viewer.token)
 let agentRow
 for(let i=0;i<7;i++){
  await expect("POST","/api/llm/agent-engine/"+agentRun.run_id+"/tick",{},viewer.token)
  agentRow=await expect("GET","/api/agent_runs/"+agentRun.run_id,undefined,viewer.token)
  if(["succeeded","failed"].includes(agentRow.status))break
 }
 assert.equal(agentRow.status,"succeeded",JSON.stringify(agentRow))
 assert.ok(modelCalls>=2)
 assert.equal(contextSawSharedText,true,"Agent's model must receive the real shared excerpt")



 // Owner must explicitly permit semantic use; the reader must independently
 // configure the same embedding model/endpoint. No owner key ever goes to a
 // reader, and no document text goes to the reader's embedding provider.
 const semanticQuestion="有哪些制度规定有助于完成材料核对"
 const lexicalBefore=await expect("POST","/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"lexical",limit:5,
 },viewer.token)
 assert.equal(lexicalBefore.items.length,0,"paraphrase must not match lexical tokens")
 const ownerConnection=await expect("POST","/api/model-connections",{
  name:"所有者的独立向量模型",provider:"openai",
  base_url:"http://127.0.0.1:"+embeddingPort+"/v1",
  api_key:"owner-embedding-key",models:["team-vector-model"],
 },ownerToken)
 await expect("POST","/api/knowledge-bases/semantic/settings",{
  connection_id:ownerConnection.item.id,model_name:"team-vector-model",
 },ownerToken)
 const ownerIndexed=await expect("POST","/api/knowledge-bases/semantic/index",{
  base_id:baseId,batch_size:8,
 },ownerToken)
 assert.ok(ownerIndexed.indexed_batch>0)
 const originalEmbeddings=semanticCalls.filter(c=>c.auth==="Bearer owner-embedding-key")
 assert.ok(originalEmbeddings.some(c=>c.inputs.some(x=>x.includes("来源可核验资料"))))
 const deniedStatus=await expect("GET",
  "/api/knowledge-bases/semantic/shared-status?base_id="+baseId,
  undefined,viewer.token)
 assert.equal(deniedStatus.status,"owner_not_authorized")
 assert.equal((await post("/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"semantic",limit:4,
 },viewer.token)).status,409)
 assert.equal((await post("/api/knowledge-bases/access",{
  action:"semantic",base_id:baseId,recipient_id:viewer.id,enabled:true,
 },viewer.token)).status,404,"only source owner may allow shared semantics")
 const turnedOn=await expect("POST","/api/knowledge-bases/access",{
  action:"semantic",base_id:baseId,recipient_id:viewer.id,enabled:true,
 },ownerToken)
 assert.equal(turnedOn.semantic_allowed,true)
 const noReaderModel=await expect("GET",
  "/api/knowledge-bases/semantic/shared-status?base_id="+baseId,
  undefined,viewer.token)
 assert.equal(noReaderModel.status,"reader_model_missing")
 const viewerConnection=await expect("POST","/api/model-connections",{
  name:"员工自行付费的向量模型",provider:"openai",
  base_url:"http://127.0.0.1:"+embeddingPort+"/v1",
  api_key:"viewer-embedding-key",
  models:["team-vector-model","other-vector-model"],
 },viewer.token)
 await expect("POST","/api/knowledge-bases/semantic/settings",{
  connection_id:viewerConnection.item.id,model_name:"other-vector-model",
 },viewer.token)
 const wrongModel=await expect("GET",
  "/api/knowledge-bases/semantic/shared-status?base_id="+baseId,
  undefined,viewer.token)
 assert.equal(wrongModel.status,"provider_model_incompatible")
 const mismatchResult=await expect("POST","/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"auto",limit:4,
 },viewer.token)
 assert.equal(mismatchResult.retrieval,"lexical")
 assert.equal(mismatchResult.shared_lexical_only,true)
 await expect("POST","/api/knowledge-bases/semantic/settings",{
  connection_id:viewerConnection.item.id,model_name:"team-vector-model",
 },viewer.token)
 const enabledStatus=await expect("GET",
  "/api/knowledge-bases/semantic/shared-status?base_id="+baseId,
  undefined,viewer.token)
 assert.equal(enabledStatus.status,"ready",JSON.stringify(enabledStatus))
 assert.equal(enabledStatus.compatible,true)
 assert.equal(enabledStatus.indexed_chunks,enabledStatus.total_chunks)
 const callsBeforeSearch=semanticCalls.length
 const semanticResult=await expect("POST","/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"auto",limit:4,
 },viewer.token)
 assert.equal(semanticResult.retrieval,"hybrid")
 assert.equal(semanticResult.shared_semantic_used,true)
 assert.equal(semanticResult.items[0].filename,"共同流程.md",JSON.stringify(semanticResult))
 assert.match(semanticResult.items[0].citation,/共同流程\.md · 片段/)
 assert.ok(semanticCalls.length>callsBeforeSearch)
 const readerCosts=semanticCalls.slice(callsBeforeSearch)
 assert.ok(readerCosts.every(c=>c.auth==="Bearer viewer-embedding-key"))
 assert.ok(readerCosts.every(c=>c.inputs.length===1&&
   c.inputs[0]===semanticQuestion),
  "viewer must embed the QUERY only, never the owner's document")
 const semanticOnly=await expect("POST","/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"semantic",limit:4,
 },viewer.token)
 assert.equal(semanticOnly.retrieval,"semantic")
 assert.equal(semanticOnly.items[0].filename,"共同流程.md")
 // The shared Workflow tool uses the exact same permission and retrieval path.
 const semanticGraph={nodes:[
  {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:0}},
  {id:"search",type:"tool",data:{title:"团队语义",tool:"knowledge_search",
    knowledge_base_ids:[baseId],
    params_template:JSON.stringify({query:semanticQuestion})},position:{x:180,y:0}},
  {id:"end",type:"end",data:{title:"结束",output_template:"{{团队语义.output}}"},
    position:{x:360,y:0}},
 ],edges:[{id:"a",source:"start",target:"search"},
          {id:"b",source:"search",target:"end"}]}
 const semanticWorkflow=await expect("POST","/api/workflow-studio/create",{
  name:"共享知识语义检索",graph:semanticGraph,
 },viewer.token)
 const semanticRun=await expect("POST","/api/workflow-runs/start",{
  workflow_id:semanticWorkflow.id,instruction:"请按语义检索团队授权资料",
 },viewer.token)
 let semanticWorkflowRow
 for(let step=0;step<7;step++){
  await expect("POST",
    "/api/llm/workflow-engine/"+semanticRun.run_id+"/tick",{},viewer.token)
  const detail=await expect("GET",
    "/api/workflow-runs/"+semanticRun.run_id+"/detail",undefined,viewer.token)
  semanticWorkflowRow=detail.run
  if(["succeeded","failed"].includes(semanticWorkflowRow.status))break
 }
 assert.equal(semanticWorkflowRow.status,"succeeded",JSON.stringify(semanticWorkflowRow))
 assert.match(String(semanticWorkflowRow.result),/共同流程\.md · 片段/)
 // The already-running mock chat provider can exercise the same shared
 // semantic source in an independent Agent run without using the owner key.
 toolQuestion=semanticQuestion
 modelCalls=0
 contextSawSharedText=false
 const semanticAgentRun=await expect("POST","/api/agent-runs/start",{
  spec_id:agent.id,instruction:"按语义查找团队核对制度并给出处",
  model:"team-chat-model",config:{
    max_steps:4,tools:{knowledge_search:true},
    custom_model:{connection_id:conn.item.id,model_id:"team-chat-model"},
  },
 },viewer.token)
 let semanticAgent
 for(let step=0;step<7;step++){
  await expect("POST","/api/llm/agent-engine/"+semanticAgentRun.run_id+"/tick",
   {},viewer.token)
  semanticAgent=await expect("GET",
   "/api/agent_runs/"+semanticAgentRun.run_id,undefined,viewer.token)
  if(["succeeded","failed"].includes(semanticAgent.status))break
 }
 assert.equal(semanticAgent.status,"succeeded",JSON.stringify(semanticAgent))
 assert.ok(contextSawSharedText,
  "Agent must see real semantic passage, not fabricated references")
 const disabled=await expect("POST","/api/knowledge-bases/access",{
  action:"semantic",base_id:baseId,recipient_id:viewer.id,enabled:false,
 },ownerToken)
 assert.equal(disabled.semantic_allowed,false)
 const afterDisable=await expect("POST","/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"auto",limit:4,
 },viewer.token)
 assert.equal(afterDisable.retrieval,"lexical")
 assert.equal(afterDisable.shared_lexical_only,true)
 assert.equal(afterDisable.items.length,0)
 assert.equal((await post("/api/knowledge-bases/search",{
  base_ids:[baseId],query:semanticQuestion,mode:"semantic",limit:4,
 },viewer.token)).status,409)
 assert.equal((await post("/api/knowledge-bases/search",{
  ...query,mode:"semantic",
 },viewer.token)).status,409)
 const mixed=await post("/api/knowledge-bases/search",{
  base_ids:[baseId,"thisnotvalid"],query:"协作流程",mode:"lexical",
 },viewer.token)
 assert.equal(mixed.status,400,"one unauthorized item must fail entire request")
 assert.equal((await post("/api/knowledge-bases/documents",{
  action:"upload",base_id:baseId,filename:"forbidden.md",content:"viewer may not write",
 },viewer.token)).status,404)
 const editorDoc=await expect("POST","/api/knowledge-bases/documents",{
  action:"upload",base_id:baseId,filename:"审核记录.md",
  content:"资料编辑可以提交经授权的团队审核材料。".repeat(5),
 },editor.token)
 assert.ok(editorDoc.id)
 assert.equal((await expect("GET","/api/knowledge-bases/documents?base_id="+baseId,
  undefined,viewer.token)).items.length,2)
 assert.equal((await post("/api/knowledge-bases/manage",{
  action:"delete",id:baseId,
 },editor.token)).status,404,"Editor must not delete the entire base")
 assert.equal((await post("/api/knowledge-bases/manage",{
  action:"update",id:baseId,name:"not-allowed",
 },editor.token)).status,404,"Editor must not change owner metadata")
 const del=await expect("POST","/api/knowledge-bases/documents",{
  action:"delete",base_id:baseId,document_id:editorDoc.id,
 },editor.token)
 assert.equal(del.deleted,true)
 assert.equal((await post("/api/knowledge-bases/documents",{
  action:"delete",base_id:baseId,document_id:doc.id,
 },viewer.token)).status,404)
 await expect("POST","/api/knowledge-bases/access",{
  action:"revoke",base_id:baseId,recipient_id:viewer.id,
 },ownerToken)
 assert.equal((await get("/api/knowledge-bases/documents?base_id="+baseId,viewer.token)).status,404)
 assert.equal((await post("/api/knowledge-bases/search",query,viewer.token)).status,404)
 const revokedWorkflow=await executeSharedWorkflow()
 assert.doesNotMatch(revokedWorkflow,/来源可核验|共同流程\.md/)
 assert.match(revokedWorkflow,/无权访问|已删除|无法|失败|重新选择/)
 assert.deepEqual((await expect("GET","/api/knowledge-bases",undefined,viewer.token)).items,[])
 assert.ok((await expect("POST","/api/knowledge-bases/search",query,ownerToken)).items.length>0)
 const events=await expect("GET","/api/knowledge-bases/access?base_id="+baseId,undefined,ownerToken)
 assert.equal(events.grants.length,1)
 // Removing a shared base removes grants, but keeps audit metadata.
 await expect("POST","/api/knowledge-bases/manage",{
  action:"delete",id:baseId,
 },ownerToken)
 assert.deepEqual((await expect("GET","/api/knowledge-bases",undefined,editor.token)).items,[])
 const db=new DatabaseSync(path.join(dir,"data.db"),{readOnly:true})
 try{
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS total FROM agent_studio_kb_access WHERE base_id=?"
  ).get(baseId).total,0)
  assert.ok(db.prepare(
   "SELECT COUNT(*) AS total FROM agent_studio_kb_access_events WHERE base_id=?"
  ).get(baseId).total>=3,"the owner-only permission changes stay auditable")
 }finally{db.close()}

 console.log("PASS Team KB: consent roles, JWT owner isolation, viewer retrieval, editor documents, revoke, no cross-account keys")
}catch(err){
 console.error("team knowledge integration failure",err)
 console.error("server logs",logs.slice(-3500))
 process.exitCode=1
}finally{
 await new Promise(resolve=>embeddingServer.close(resolve))
 if(modelServer)await new Promise(resolve=>modelServer.close(resolve))
 await stopHeadlessPocketBase(server)
 await sleep(100)
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:6,retryDelay:200})
}
