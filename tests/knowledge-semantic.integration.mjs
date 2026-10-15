// True semantic + hybrid search against real temporary PocketBase SQLite,
// a mocked OpenAI-compatible Embeddings endpoint, and standalone employee JWT.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { createServer } from "node:http"
import { randomBytes } from "node:crypto"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const pb=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb),"PocketBase binary missing")
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-semantic-"))
const port=()=>new Promise((resolve,reject)=>{
  const server=net.createServer()
  server.once("error",reject)
  server.listen(0,"127.0.0.1",()=>{const addr=server.address();server.close(()=>resolve(addr.port))})
})
const apiPort=await port(), embeddingPort=await port()
const origin="http://127.0.0.1:"+apiPort
const workerSecret=randomBytes(35).toString("hex")
const bootstrapSecret=randomBytes(35).toString("hex")
const key="0123456789abcdef0123456789abcdef"
let queries=0,embedCalls=0,failQuery=false
let modelCalls=0,verifiedAgentCitation=false, observedContexts=[]
const vectorFor=text=>{
  // Distinct synonyms map to a shared semantic axis, not lexical overlaps.
  const t=String(text||"")
  if(/利润率|盈利能力|赚钱|赚的钱|获利能力/.test(t))return [1,0.01,0,0,0,0,0,0]
  if(/卫星|轨道|航天/.test(t))return [0,1,0,0,0,0,0,0]
  return [0,0,1,0,0,0,0,0]
}
const provider=createServer(async(req,res)=>{
  let text=""
  for await(const chunk of req)text+=chunk.toString()
  if(req.url==="/v1/embeddings"){
    embedCalls++
    const parsed=JSON.parse(text||"{}")
    const input=parsed.input||[]
    const isQuery=input.length===1 && (/哪家|哪些/.test(input[0]||""))
    if(isQuery) queries++
    if(failQuery && isQuery){res.writeHead(503).end('{"error":"temporary"}');return}
    assert.equal(req.headers.authorization,"Bearer semantic-test-key")
    res.writeHead(200,{"Content-Type":"application/json"})
    res.end(JSON.stringify({object:"list",data:input.map((t,i)=>({
      object:"embedding",index:i,embedding:vectorFor(t)
    }))}))
    return
  }
  if(req.url==="/v1/chat/completions"){
    modelCalls++
    const payload=JSON.parse(text||"{}")
    const all=JSON.stringify(payload.messages||[])
    const first=all.includes("（尚无，这是第一步）")
    observedContexts.push({first,hasProfit:all.includes("盈利能力持续改善"),hasCitation:all.includes("利润改善.md"),snippet:all.slice(-1000)})
    if(all.includes("盈利能力持续改善"))verifiedAgentCitation=true
    const content=first
      ? JSON.stringify({thought:"需要从绑定知识库检索收益提升事实",
          action:"tool",tool:"knowledge_search",tool_input:{query:"哪些公司赚钱能力越来越强"}})
      : JSON.stringify({thought:"根据原文标记可靠来源",
          action:"final",final_answer:"依据内部原文：[利润改善.md · 片段1]"})
    res.writeHead(200,{"Content-Type":"application/json"})
    res.end(JSON.stringify({choices:[{message:{role:"assistant",content}}]}))
    return
  }
  res.writeHead(404).end()
})
await new Promise(resolve=>provider.listen(embeddingPort,"127.0.0.1",resolve))
const server=spawnHeadlessPocketBase(pb,[
 "serve","--http=127.0.0.1:"+apiPort,"--dir="+temp,
 "--hooksDir="+path.join(root,"pocketbase/pb_hooks")
],{cwd:path.join(root,"pocketbase"),env:{
  AGENT_STUDIO_AUTH_MODE:"standalone",
  AGENT_STUDIO_ALLOW_ANON:"false",
  AGENT_STUDIO_BOOTSTRAP_SECRET:bootstrapSecret,
  AGENT_STUDIO_WORKER_TOKEN:workerSecret,
  AGENT_STUDIO_BACKGROUND_WORKER:"true",
  AGENT_STUDIO_STRICT_SECRETS:"true",
  AGENT_STUDIO_SECRET_KEY:key,
  AGENT_STUDIO_EMBEDDING_ALLOW_LOOPBACK:"true",
  AGENT_STUDIO_EMBEDDING_LOOPBACK_PORTS:String(embeddingPort),
}})
let logs=""
server.stdout.on("data",x=>logs=(logs+x).slice(-14000))
server.stderr.on("data",x=>logs=(logs+x).slice(-14000))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function request(method,route,body,token="",other={}){
  const headers={"Content-Type":"application/json",...other}
  if(token)headers.Authorization=token
  const res=await fetch(origin+route,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   signal:AbortSignal.timeout(25000)})
  return {status:res.status,data:await res.json().catch(()=>({}))}
}
const post=(route,body,token,headers)=>request("POST",route,body,token,headers)
const get=(route,token,headers)=>request("GET",route,undefined,token,headers)
const expect=async(method,route,body,token,code=200,headers={})=>{
 const result=await request(method,route,body,token,headers)
 assert.equal(result.status,code,method+" "+route+": "+JSON.stringify(result.data))
 return result.data
}
let alice="",bob=""
try{
  let ready=false
  for(let i=0;i<120;i++){
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
    await sleep(150)
  }
  assert.ok(ready,"backend failed "+logs.slice(-2400))
  await expect("POST","/api/studio/bootstrap",{email:"alice@example.test",
    password:"secure-pw-alice-2026",display_name:"Alice"},"",201,
    {"X-Agent-Studio-Setup-Key":bootstrapSecret})
  const login=await expect("POST","/api/collections/studio_users/auth-with-password",
    {identity:"alice@example.test",password:"secure-pw-alice-2026"})
  alice=login.token
  await expect("POST","/api/studio/users",{email:"bob@example.test",password:"secure-pw-bob-2026",
    display_name:"Bob",role:"employee"},alice,201)
  const bLogin=await expect("POST","/api/collections/studio_users/auth-with-password",
    {identity:"bob@example.test",password:"secure-pw-bob-2026"})
  bob=bLogin.token

  const base=await expect("POST","/api/knowledge-bases/manage",
    {action:"create",name:"运营策略事实库",description:"本地测试"},alice)
  const baseId=base.id
  const first=await expect("POST","/api/knowledge-bases/documents",
    {action:"upload",base_id:baseId,filename:"利润改善.md",
      content:"公司甲盈利能力持续改善，利润率稳步提升。".repeat(6)},alice)
  const other=await expect("POST","/api/knowledge-bases/documents",
    {action:"upload",base_id:baseId,filename:"卫星产业.md",
      content:"公司乙致力于卫星轨道通信设备制造。".repeat(6)},alice)
  assert.ok(first.id&&other.id)
  const question="哪些企业越来越赚钱"
  const before=await expect("POST","/api/knowledge-bases/search",
    {base_ids:[baseId],query:question,mode:"lexical",limit:4},alice)
  assert.equal(before.retrieval,"lexical")
  assert.equal(before.items.length,0,"paraphrase should not match keyword scan")

  const conn=await expect("POST","/api/model-connections",{
    name:"员工向量模型",provider:"openai",base_url:"http://127.0.0.1:"+embeddingPort+"/v1",
    api_key:"semantic-test-key",models:["semantic-test-model"],
  },alice)
  const connectionId=conn.item.id
  const bad=await post("/api/knowledge-bases/semantic/settings",{
    action:"save",connection_id:connectionId,model_name:"semantic-test-model"},bob)
  assert.equal(bad.status,422,"employees may not re-use each other's model keys")
  const statusBefore=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(statusBefore.configured,false)
  await expect("POST","/api/knowledge-bases/semantic/settings",{
    action:"save",connection_id:connectionId,model_name:"semantic-test-model"},alice)
  const queued=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(queued.queued,true)
  assert.equal(queued.pending_chunks,queued.total_chunks)
  const idx=await expect("POST","/api/internal/knowledge/index-next",{},"",200,
    {"X-Agent-Studio-Worker-Token":workerSecret})
  assert.equal(idx.indexed_batch,queued.total_chunks,JSON.stringify(idx))
  const after=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(after.indexed_chunks,after.total_chunks)
  assert.equal(after.ready,true)
  // A user-provided model connection is not a general-purpose SSRF proxy:
  // even the owner cannot enable arbitrary external destinations.
  const unapprovedConn=await expect("POST","/api/model-connections",{
    name:"非白名单接口",provider:"openai",
    base_url:"https://example.com/v1",api_key:"not-a-real-key",models:["embedding-foo"],
  },alice)
  const deniedProvider=await post("/api/knowledge-bases/semantic/settings",{
    action:"save",connection_id:unapprovedConn.item.id,model_name:"embedding-foo",
  },alice)
  assert.equal(deniedProvider.status,422)
  assert.equal(deniedProvider.data.error,"embedding_endpoint_unapproved")
  const savedSettings=await expect("GET","/api/knowledge-bases/semantic/settings",undefined,alice)
  assert.equal(savedSettings.connection_id,connectionId,"failed model change must not mutate active settings")

  // Repeating a completed batch never spends money on already indexed chunks.
  const callsAfterFull=embedCalls
  const repeated=await expect("POST","/api/knowledge-bases/semantic/index",
    {base_id:baseId,batch_size:8},alice)
  assert.equal(repeated.indexed_batch,0)
  assert.equal(embedCalls,callsAfterFull,"Already indexed vectors must be reused")

  // A new document is queued without blocking ingestion or requiring an
  // open browser. Its vector is indexed on the next Worker iteration.
  const laterDoc=await expect("POST","/api/knowledge-bases/documents",{
    action:"upload",base_id:baseId,filename:"内部流程.md",
    content:"合同归档、授权审批及文件留存制度由办公室执行。".repeat(4)
  },alice)
  assert.equal(laterDoc.semantic_queued,true)
  const pending=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.ok(pending.pending_chunks>0)
  // A browser and Worker may request the same new chunk at once. The
  // per-base lease prevents duplicate paid Embedding calls.
  const beforeParallel=embedCalls
  const [manualRace,workerRace]=await Promise.all([
    post("/api/knowledge-bases/semantic/index",{base_id:baseId,batch_size:8},alice),
    post("/api/internal/knowledge/index-next",{},"",
      {"X-Agent-Studio-Worker-Token":workerSecret}),
  ])
  assert.ok([200,409].includes(manualRace.status),
    "Manual indexing must succeed or report already busy: "+JSON.stringify(manualRace))
  assert.equal(workerRace.status,200,JSON.stringify(workerRace))
  assert.equal(embedCalls,beforeParallel+1,"Worker/manual collision must never charge twice")
  assert.ok((manualRace.data.indexed_batch||0)+(workerRace.data.indexed_batch||0)>0)
  assert.equal((await post("/api/knowledge-bases/semantic/index",{
    base_id:baseId,batch_size:8,
  },bob)).status,404,"Another employee must not trigger someone else's indexing")
  const afterIngest=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(afterIngest.ready,true)
  assert.equal(afterIngest.indexed_chunks,afterIngest.total_chunks)

  // An empty base must not keep a hot Worker loop alive indefinitely.
  const empty=await expect("POST","/api/knowledge-bases/manage",
    {action:"create",name:"空资料库",description:"测试没有可索引资料的队列"},alice)
  await expect("POST","/api/knowledge-bases/semantic/rebuild",{base_id:empty.id},alice)
  const emptyBefore=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+empty.id,
    undefined,alice)
  assert.equal(emptyBefore.queued,true)
  const clearedEmpty=await expect("POST","/api/internal/knowledge/index-next",{},"",200,
    {"X-Agent-Studio-Worker-Token":workerSecret})
  assert.equal(clearedEmpty.indexed_batch,0)
  const emptyAfter=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+empty.id,
    undefined,alice)
  assert.equal(emptyAfter.queued,false,"Empty knowledge base must not be requeued endlessly")
  const idle=await expect("POST","/api/internal/knowledge/index-next",{},"",200,
    {"X-Agent-Studio-Worker-Token":workerSecret})
  assert.equal(idle.idle,true)

  const result=await expect("POST","/api/knowledge-bases/search",{
    base_ids:[baseId],query:question,mode:"auto",limit:4
  },alice)
  assert.equal(result.retrieval,"hybrid")
  assert.equal(result.semantic_status,"ready")
  assert.ok(result.items.length>=1,JSON.stringify(result))
  assert.equal(result.items[0].filename,"利润改善.md","semantic synonyms should recover the right file")
  assert.match(result.items[0].citation,/利润改善\.md.*片段/)
  assert.doesNotMatch(JSON.stringify(result),/semantic-test-key|vector_json|\[1,0\.01/)

  const semantic=await expect("POST","/api/knowledge-bases/search",{
    base_ids:[baseId],query:question,mode:"semantic",limit:3
  },alice)
  assert.equal(semantic.retrieval,"semantic")
  assert.equal(semantic.items[0].filename,"利润改善.md")
  assert.equal((await get("/api/knowledge-bases/search",bob)).status,404) // no GET route
  assert.equal((await post("/api/knowledge-bases/search",{
    base_ids:[baseId],query:question,mode:"auto"
  },bob)).status,404)

  // A Workflow tool must see semantic passages through the shared backend.
  const graph={nodes:[
    {id:"begin",type:"start",data:{title:"开始"},position:{x:0,y:0}},
    {id:"retrieve",type:"tool",data:{title:"检索",tool:"knowledge_search",
      knowledge_base_ids:[baseId],params_template:JSON.stringify({query:question})},
      position:{x:180,y:0}},
    {id:"end",type:"end",data:{title:"结束",output_template:"{{检索.output}}"},
      position:{x:360,y:0}},
  ],edges:[{id:"a",source:"begin",target:"retrieve"},
           {id:"b",source:"retrieve",target:"end"}]}
  const wf=await expect("POST","/api/workflow-studio/create",
    {name:"语义检索工作流",graph},alice)
  const run=await expect("POST","/api/workflow-runs/start",
    {workflow_id:wf.id,instruction:"请按含义查找盈利改善证据"},alice)
  let workflow
  for(let n=0;n<6;n++){
    await expect("POST","/api/llm/workflow-engine/"+run.run_id+"/tick",{},alice)
    const detail=await expect("GET","/api/workflow-runs/"+run.run_id+"/detail",undefined,alice)
    workflow=detail.run
    if(["succeeded","failed"].includes(workflow.status))break
  }
  assert.equal(workflow.status,"succeeded",JSON.stringify(workflow))
  assert.match(workflow.result,/利润改善\.md · 片段/)

  const agentSpec=await expect("POST","/api/agent_specs",{
    name:"语义检索助手",spec:{
      goal:"查询公司盈利趋势",task_scope:"有据可查的内部资料",
      deliverables:["带出处的摘要"],tools:["knowledge_search"],
      task_plan:["查资料","引用来源"],done_criteria:["可溯源"],
      knowledge_base_ids:[baseId],
    }},alice)
  const start=await expect("POST","/api/agent-runs/start",{
    spec_id:agentSpec.id,instruction:"哪些企业赚钱能力变强，给出文档引用",
    model:"semantic-test-model",config:{
      max_steps:4,tools:{knowledge_search:true},
      custom_model:{connection_id:connectionId,model_id:"semantic-test-model"},
    }
  },alice)
  let agentRow
  for(let n=0;n<6;n++){
    await expect("POST","/api/llm/agent-engine/"+start.run_id+"/tick",{},alice)
    agentRow=await expect("GET","/api/agent_runs/"+start.run_id,undefined,alice)
    if(["succeeded","failed"].includes(agentRow.status))break
  }
  assert.equal(agentRow.status,"succeeded",JSON.stringify(agentRow))
  assert.ok(modelCalls>=2,"Agent must call the tool and then cite its output")
  assert.ok(verifiedAgentCitation,"LLM must see retrieved semantic passage: "+JSON.stringify(observedContexts))

  failQuery=true
  const degraded=await expect("POST","/api/knowledge-bases/search",{
    base_ids:[baseId],query:question,mode:"auto",limit:4
  },alice)
  assert.equal(degraded.retrieval,"lexical")
  assert.equal(degraded.semantic_status,"provider_error")
  assert.equal(degraded.items.length,0)
  const strict=await post("/api/knowledge-bases/search",{
    base_ids:[baseId],query:question,mode:"semantic",limit:4
  },alice)
  assert.equal(strict.status,502)
  assert.equal(strict.data.error,"embedding_provider_failed")
  failQuery=false

  // Switching the Embedding model invalidates all old vectors, retains
  // original text, and schedules a new build. A mixed-dimension model
  // must never silently continue using incompatible legacy vectors.
  const changed=await expect("POST","/api/knowledge-bases/semantic/settings",{
    action:"save",connection_id:connectionId,model_name:"semantic-test-model-v2"
  },alice)
  assert.equal(changed.changed,true)
  const afterSwitch=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(afterSwitch.indexed_chunks,0)
  assert.equal(afterSwitch.pending_chunks,afterSwitch.total_chunks)
  // Each Worker iteration handles one pending base; another empty library
  // may also be queued after changing the employee's global model.
  let finishedSwitch
  for(let round=0;round<8;round++){
    await expect("POST","/api/internal/knowledge/index-next",{},"",200,
      {"X-Agent-Studio-Worker-Token":workerSecret})
    finishedSwitch=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
      undefined,alice)
    if(finishedSwitch.ready)break
  }
  assert.equal(finishedSwitch.ready,true)
  // Rebuild preserves original uploaded source text but clears old vectors
  // and repopulates the current model-index snapshot incrementally.
  const rebuilt=await expect("POST","/api/knowledge-bases/semantic/rebuild",
    {base_id:baseId},alice)
  assert.equal(rebuilt.progress.indexed_chunks,0)
  assert.equal(rebuilt.progress.pending_chunks,rebuilt.progress.total_chunks)
  let rebuiltStatus
  for(let round=0;round<8;round++){
    await expect("POST","/api/internal/knowledge/index-next",{},"",200,
      {"X-Agent-Studio-Worker-Token":workerSecret})
    rebuiltStatus=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
      undefined,alice)
    if(rebuiltStatus.ready)break
  }
  assert.equal(rebuiltStatus.ready,true)
  await expect("POST","/api/knowledge-bases/documents",{
    action:"delete",base_id:baseId,document_id:first.id},alice)
  const deleted=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(deleted.indexed_chunks,deleted.total_chunks)
  assert.ok(deleted.total_chunks<rebuiltStatus.total_chunks)
  await expect("POST","/api/knowledge-bases/semantic/settings",{action:"disable"},alice)
  const clear=await expect("GET","/api/knowledge-bases/semantic/status?base_id="+baseId,
    undefined,alice)
  assert.equal(clear.configured,false)
  assert.equal(clear.indexed_chunks,0)

  console.log("PASS semantic KB: embedding/hybrid/paraphrase, incremental+concurrency, empty queue, rebuild/model switch, provider allowlist, Worker, Agent/Workflow, tenant isolation, fallback/delete")
}finally{
 await stopHeadlessPocketBase(server)
 await new Promise(resolve=>provider.close(resolve))
 await sleep(100)
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250})
}
