// Smithery managed MCP integration against loopback fake Smithery only.
// No real Smithery API keys, no third-party OAuth, no production data.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {randomBytes} from "node:crypto"
import {createServer} from "node:http"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const pb=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb),"PocketBase integration binary unavailable")
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-smithery-"))
const freePort=()=>new Promise((resolve,reject)=>{
  const server=net.createServer()
  server.on("error",reject)
  server.listen(0,"127.0.0.1",()=>{const port=server.address().port;server.close(()=>resolve(port))})
})
const [pbPort,mockPort]=await Promise.all([freePort(),freePort()])
const origin="http://127.0.0.1:"+pbPort
const remote="http://127.0.0.1:"+mockPort
const setupSecret=randomBytes(36).toString("hex")
const workerSecret=randomBytes(42).toString("hex")
const localKey="test-smithery-api-key-"+randomBytes(12).toString("hex")
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let authorized=false
let vendorRequests=[]
let logs=""
let selectedMktSearchTool="",selectedMktWriteTool="",agentModelRequests=0
const provider=createServer(async(req,res)=>{
  let body=""
  for await(const chunk of req)body+=String(chunk)
  let payload={}
  try{payload=JSON.parse(body||"{}")}catch{}
  const url=new URL(req.url||"/",remote)
  vendorRequests.push({method:req.method,path:url.pathname,
    query:url.searchParams.get("q")||"",tokenOk:req.headers.authorization==="Bearer "+localKey,
    body:payload})
  const reply=(code,data)=>{
    res.writeHead(code,{"Content-Type":"application/json"})
    res.end(JSON.stringify(data))
  }
  if(req.method==="POST" && url.pathname==="/v1/chat/completions"){
    agentModelRequests++
    const messages=Array.isArray(payload.messages)?payload.messages:[]
    const system=messages.filter(m=>m.role==="system").map(m=>String(m.content||"")).join("\n")
    const user=messages.filter(m=>m.role==="user").map(m=>String(m.content||"")).join("\n")
    let answer="Reuse only allowed tools, and never invent external effects."
    if(system.includes("助手执行引擎")){
      if(user.includes("（尚无，这是第一步）")){
        answer=JSON.stringify({thought:"Attempt a concrete market tool",
          action:"tool",tool:user.includes("FORCE_WRITE_TOOL")?
            selectedMktWriteTool:selectedMktSearchTool,
          tool_input:{query:"AI research",action:"mock-change"}})
      }else{
        answer=JSON.stringify({thought:"Conclude from the actual tool observation",
          action:"final",
          final_answer:"MCP_AGENT_FINAL "+(user.includes("found mock github repository")?
            "MOCK_MCP_CONFIRMED":"TOOL_NOT_USED")})
      }
    }
    return reply(200,{choices:[{message:{role:"assistant",content:answer}}]})
  }
  if(req.headers.authorization!=="Bearer "+localKey)return reply(401,{error:"invalid_token"})
  if(req.method==="GET" && url.pathname==="/servers"){
    return reply(200,{servers:[{
      qualifiedName:"github",displayName:"GitHub",
      description:"Browse repositories and pull requests",verified:true,
    }],pagination:{totalPages:1,totalCount:1}})
  }
  if(req.method==="GET" && url.pathname==="/namespaces"){
    return reply(200,{namespaces:[{name:"studio-sandbox"}]})
  }
  if(req.method==="PUT" && /^\/connect\/studio-sandbox\/[-_A-Za-z0-9]+$/.test(url.pathname)){
    if(payload.server!=="github" || payload.transport!=="http")
      return reply(400,{error:"invalid"})
    return reply(201,{status:{
      state:"auth_required",setupUrl:"https://auth.smithery.ai/authorize/mock"
    },connectionId:url.pathname.split("/").at(-1)})
  }
  if(req.method==="DELETE" && /^\/connect\/studio-sandbox\/[-_A-Za-z0-9]+$/.test(url.pathname)){
    return reply(200,{ok:true})
  }
  if(req.method==="GET" && /^\/connect\/studio-sandbox\/[-_A-Za-z0-9]+$/.test(url.pathname)){
    return reply(200,{status:authorized?{state:"connected"}:
      {state:"auth_required",setupUrl:"https://auth.smithery.ai/authorize/mock"}})
  }
  if(req.method==="GET" && /^\/connect\/studio-sandbox\/[-_A-Za-z0-9]+\/\.tools$/.test(url.pathname)){
    return reply(200,{tools:authorized?[{
      name:"github_search",description:"Search current user repositories",
      inputSchema:{type:"object",properties:{query:{type:"string"}},required:["query"]},
      annotations:{readOnlyHint:true,destructiveHint:false},
    },{
      name:"github_write",description:"Simulated write operation",
      inputSchema:{type:"object",properties:{action:{type:"string"}}},
      annotations:{readOnlyHint:false,destructiveHint:true},
    }]:[]})
  }
  if(req.method==="POST" && /^\/studio-sandbox\/[-_A-Za-z0-9]+$/.test(url.pathname)){
    if(payload.method==="tools/call" && payload.params?.name==="github_search" &&
        authorized){
      return reply(200,{jsonrpc:"2.0",id:payload.id,result:{
        content:[{type:"text",text:"found mock github repository"}],
      }})
    }
    if(payload.method==="tools/call"&&payload.params?.name==="github_write"&&authorized){
      return reply(200,{jsonrpc:"2.0",id:payload.id,result:{
        content:[{type:"text",text:"mock write acknowledged (no external effects)"}],
      }})
    }
    if(payload.method==="tools/list"){
      return reply(200,{jsonrpc:"2.0",id:payload.id,result:{
        tools:authorized?[{name:"github_search",description:"Search repositories"}]:[],
      }})
    }
    return reply(200,{jsonrpc:"2.0",id:payload.id,error:{code:-32601,message:"method unavailable"}})
  }
  return reply(404,{error:"not_found"})
})
const server=spawnHeadlessPocketBase(pb,[
  "serve","--http=127.0.0.1:"+pbPort,"--dir="+tmp,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),stdio:["ignore","pipe","pipe"],
  env:{
    AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_ALLOW_ANON:"false",
    AGENT_STUDIO_BOOTSTRAP_SECRET:setupSecret,
    AGENT_STUDIO_WORKER_TOKEN:workerSecret,
    AGENT_STUDIO_STRICT_SECRETS:"true",
    AGENT_STUDIO_SECRET_KEY:randomBytes(24).toString("base64url"),
    AGENT_STUDIO_SMITHERY_ALLOW_LOOPBACK:"true",
    AGENT_STUDIO_SMITHERY_TEST_ORIGIN:remote,
  }})
server.stdout.on("data",v=>logs=(logs+String(v)).slice(-17000))
server.stderr.on("data",v=>logs=(logs+String(v)).slice(-17000))
async function api(method,endpoint,body,token="",headersExtra={}){
  const headers={"Content-Type":"application/json",...headersExtra}
  if(token)headers.Authorization=token
  const response=await fetch(origin+endpoint,{method,headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(14000)})
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
function must(res,status=200){
  assert.equal(res.status,status,JSON.stringify(res.data))
  return res.data
}
try{
  await new Promise(resolve=>provider.listen(mockPort,"127.0.0.1",resolve))
  let alive=false
  for(let attempt=0;attempt<135;attempt++){
    if(server.exitCode!==null)break
    try{
      const r=await fetch(origin+"/api/health",{signal:AbortSignal.timeout(900)})
      if(r.ok){alive=true;break}
    }catch{}
    await sleep(130)
  }
  assert.ok(alive,"PocketBase Smithery fixture failed to start: "+logs.slice(-2200))
  const spoof=await api("GET","/api/market/smithery/v2/catalog?q=github",
    undefined,"",{"X-Rh-User-Id":"fabricated"})
  must(spoof,401)

  const password="PreviewSmithery-"+randomBytes(8).toString("hex")+"!"
  must(await api("POST","/api/studio/bootstrap",{
    email:"sm-owner@example.test",password,display_name:"Smithery Owner",
  },"",{"X-Agent-Studio-Setup-Key":setupSecret}),201)
  const admin=must(await api("POST","/api/collections/studio_users/auth-with-password",{
    identity:"sm-owner@example.test",password,
  }))
  assert.ok(admin.token)
  const token=admin.token
  const staffPass="SmStaff-"+randomBytes(8).toString("hex")+"!"
  const staff=must(await api("POST","/api/studio/users",{
    email:"sm-staff@example.test",password:staffPass,display_name:"Staff",role:"employee",
  },token),201)
  assert.ok(staff.user?.id)
  const staffLogin=must(await api("POST","/api/collections/studio_users/auth-with-password",{
    identity:"sm-staff@example.test",password:staffPass,
  }))
  const user2=staffLogin.token
  const badKey=await api("POST","/api/market/smithery/key",{api_key:"incorrect-token"},token)
  assert.equal(badKey.status,400)
  assert.equal(badKey.data.error,"invalid_key")
  const saved=must(await api("POST","/api/market/smithery/key",{api_key:localKey},token))
  assert.ok(saved.ok)
  assert.ok(vendorRequests.some(item=>item.method==="GET"&&item.path==="/servers"&&item.tokenOk))
  const wrongKeyUser=await api("GET","/api/market/smithery/v2/catalog?q=github",undefined,user2)
  assert.equal(wrongKeyUser.status,400)
  assert.equal(wrongKeyUser.data.error,"smithery_key_required")
  const catalog=must(await api("GET","/api/market/smithery/v2/catalog?q=github",undefined,token))
  assert.equal(catalog.items[0].slug,"github")
  assert.equal(catalog.items[0].verified,true)
  assert.equal(catalog.next_page,0)
  assert.ok(vendorRequests.some(x=>x.path==="/servers"&&x.query==="github"),
    "query must reach Smithery search, not local filter of page 1")
  const namespaces=must(await api("GET","/api/market/smithery/v2/namespaces",undefined,token))
  assert.deepEqual(namespaces.namespaces,["studio-sandbox"])

  const beforeBad=vendorRequests.filter(x=>x.method==="PUT").length
  must(await api("POST","/api/market/smithery/v2/connect",{
    slug:"github",namespace:"forbidden-space",
  },token),403)
  assert.equal(vendorRequests.filter(x=>x.method==="PUT").length,beforeBad)
  const added=must(await api("POST","/api/market/smithery/v2/connect",{
    slug:"github",namespace:"studio-sandbox",title:"GitHub 代码查询",
  },token))
  assert.equal(added.state,"auth_required")
  assert.equal(added.tool_count,0)
  assert.equal(added.needs_action,true)
  assert.match(added.setup_url,/^https:\/\/auth\.smithery\.ai\//)
  assert.ok(added.id)
  const rows=must(await api("GET","/api/market/connections",undefined,token)).items
  assert.equal(rows.length,1)
  assert.equal(rows[0].enabled,false,"OAuth pending must never appear enabled")
  assert.equal(rows[0].tool_count,0)
  assert.ok(!rows[0].url.includes("api_key="))
  assert.equal(rows[0].is_smithery,true)
  assert.ok(rows[0].url.startsWith(remote+"/studio-sandbox/"),
    "per-connection MCP gateway must be distinct from management /connect route")
  assert.doesNotMatch(JSON.stringify(rows),new RegExp(localKey))
  const premature=await api("POST","/api/market/toggle",{id:added.id,enabled:true},token)
  assert.equal(premature.status,409,"pending OAuth must not be manually enabled")
  const otherOwner=await api("POST","/api/market/smithery/v2/refresh",{id:added.id},user2)
  assert.equal(otherOwner.status,404,"cross employee connection refresh must be denied")
  const pending=must(await api("POST","/api/market/smithery/v2/refresh",{id:added.id},token))
  assert.equal(pending.state,"auth_required")
  authorized=true
  const ready=must(await api("POST","/api/market/smithery/v2/refresh",{id:added.id},token))
  assert.equal(ready.state,"connected")
  assert.equal(ready.tool_count,2)
  const enabled=must(await api("GET","/api/market/connections",undefined,token)).items
  assert.equal(enabled.length,1)
  assert.equal(enabled[0].enabled,true)
  assert.deepEqual(enabled[0].tools.map(x=>x.name),["github_search","github_write"])
  assert.equal(enabled[0].tools[0].read_only,true)
  assert.equal(enabled[0].tools[1].destructive,true)
  assert.ok(!enabled[0].url.includes(localKey),"full key must not live in URL")
  assert.ok(enabled[0].url.startsWith(remote+"/studio-sandbox/"),
    "MCP JSON-RPC must use the per-connection gateway host/path")
  assert.equal(enabled[0].last_probe_status,"ok")
  assert.equal(vendorRequests.some(x=>x.path.endsWith("/.tools")),true)
  const unknownTool=await api("POST","/api/market/invoke",{
    connection_id:added.id,tool_name:"delete_all_repos",arguments:{},
  },token)
  assert.equal(unknownTool.status,403,"undiscovered tool must not be callable")
  const unconfirmed=await api("POST","/api/market/invoke",{
    connection_id:added.id,tool_name:"github_write",arguments:{action:"test"},
  },token)
  assert.equal(unconfirmed.status,428,"write-capable tools require explicit confirmation")
  assert.equal(vendorRequests.filter(x=>x.body?.params?.name==="github_write").length,0)
  const confirmed=must(await api("POST","/api/market/invoke",{
    connection_id:added.id,tool_name:"github_write",arguments:{action:"test"},
    confirm_external_write:true,
  },token))
  assert.match(confirmed.output,/mock write acknowledged/)
  const invocation=must(await api("POST","/api/market/invoke",{
    connection_id:added.id,tool_name:"github_search",arguments:{query:"investing"},
  },token))
  assert.equal(invocation.ok,true,JSON.stringify(invocation))
  assert.match(invocation.output,/found mock github repository/)
  const mcpCalls=vendorRequests.filter(x=>x.path.startsWith("/studio-sandbox/") &&
    x.body?.method==="tools/call")
  assert.equal(mcpCalls.length,2,"confirmed and read-only tools must use the managed MCP proxy")
  assert.equal(mcpCalls[0].tokenOk,true,"Smithery token must only travel in Authorization header")
  assert.equal(await api("POST","/api/market/invoke",{
    connection_id:added.id,tool_name:"github_search",arguments:{query:"private"},
  },user2).then(r=>r.status),404,"other employee must not invoke this tool")
  // Agent now receives ONLY explicit, owner-scoped tool selections from its
  // saved AgentSpec. A forged start.config.market_tool_ids must grant nothing.
  selectedMktSearchTool="mkt__"+added.id+"__github_search"
  selectedMktWriteTool="mkt__"+added.id+"__github_write"
  const model=must(await api("POST","/api/model-connections",{
    name:"Mock market-capable model",provider:"openai",
    base_url:remote+"/v1",api_key:"test-model-secret",models:["market-test-model"],
  },token))
  const modelId=model.item.id
  const specFor=async(tools,name)=>{
    const created=must(await api("POST","/api/agent_specs",{
      name,spec:{goal:"Use one verified marketplace tool",
        task_scope:"Test-only mock server; no external changes",
        tools,deliverables:["Result"],task_plan:["Call tool","Return observation"],
        done_criteria:["Correct result"]},
    },token))
    return created.id
  }
  const runFor=async(specId,instruction)=>{
    const response=must(await api("POST","/api/agent-runs/start",{
      spec_id:specId,instruction,model:"market-test-model",
      config:{max_steps:5,tools:{},require_approval:true,
        market_tool_ids:[selectedMktWriteTool],
        custom_model:{connection_id:modelId,model_id:"market-test-model"}},
    },token))
    return response.run_id
  }
  const runState=async(id)=>must(await api("GET","/api/agent_runs/"+id,undefined,token))
  const tick=async(id)=>must(await api("POST","/api/llm/agent-engine/"+id+"/tick",{},token))
  const currentMcpCalls=()=>vendorRequests.filter(v=>v.path.startsWith("/studio-sandbox/")&&
    v.body?.method==="tools/call").length

  const emptySpec=await specFor([],"Agent no marketplace grant")
  const emptyRun=await runFor(emptySpec,"ATTEMPT_UNSELECTED_MARKET_TOOL")
  assert.deepEqual((await runState(emptyRun)).config.market_tool_ids,[],
    "Client-injected market_tool_ids must NOT bypass saved AgentSpec")
  const callCountBeforeEmpty=currentMcpCalls()
  await tick(emptyRun)
  assert.equal((await runState(emptyRun)).status,"running",
    "Unselected market tool must not request approval or execute")
  assert.equal(currentMcpCalls(),callCountBeforeEmpty)
  const deniedDetail=must(await api("GET","/api/agent-runs/"+emptyRun+"/detail",undefined,token))
  assert.ok(deniedDetail.events.some(ev=>ev.event_type==="error" &&
    JSON.stringify(ev.content).includes("未授权")),"Unselected invocation must have an audit event")

  const selectedSpec=await specFor([selectedMktSearchTool],"Agent explicitly selected search")
  const selectedRun=await runFor(selectedSpec,"SELECT_ONLY_GITHUB_SEARCH")
  assert.deepEqual((await runState(selectedRun)).config.market_tool_ids,[selectedMktSearchTool])
  assert.equal((await api("POST","/api/agent-runs/start",{
    spec_id:selectedSpec,instruction:"other user's Agent",model:"claude-opus-4.8",
    config:{max_steps:3,tools:{}}},user2)).status,404)
  const callsBeforeApproved=currentMcpCalls()
  await tick(selectedRun)
  const awaitingAgent=await runState(selectedRun)
  assert.equal(awaitingAgent.status,"awaiting_approval",
    "Chosen read-only market plugin still needs this Agent's explicit approval")
  assert.equal(awaitingAgent.checkpoint.pending_approval.tool,selectedMktSearchTool)
  assert.equal(currentMcpCalls(),callsBeforeApproved,
    "MCP endpoint must not be invoked before Agent approval")
  const approvalAnswers=await Promise.all([
    api("POST","/api/agent-runs/"+selectedRun+"/approve",{decision:"approve"},token),
    api("POST","/api/agent-runs/"+selectedRun+"/approve",{decision:"approve"},token),
  ])
  assert.deepEqual(approvalAnswers.map(row=>row.status).sort((a,b)=>a-b),[200,409],
    "Concurrent approval must be consumed by exactly one browser tab")
  await tick(selectedRun)
  assert.equal(currentMcpCalls(),callsBeforeApproved+1,
    "Approval must cause exactly one authorized MCP tools/call")
  const lastAgentRpc=vendorRequests.filter(v=>v.path.startsWith("/studio-sandbox/")&&
    v.body?.method==="tools/call").at(-1)
  assert.equal(lastAgentRpc?.tokenOk,true,"Agent MCP call must carry decrypted server-side bearer authorization")
  assert.equal(lastAgentRpc?.body?.params?.name,"github_search")

  const toolDetail=must(await api("GET","/api/agent-runs/"+selectedRun+"/detail",undefined,token))
  assert.equal(toolDetail.events.filter(ev=>ev.event_type==="approval").length,1,
    "Concurrent approval requests must create only one audit event")
  assert.ok(toolDetail.events.some(ev=>ev.event_type==="tool_result" &&
    JSON.stringify(ev.content).includes("found mock github repository")),
    "Actual MCP result must be persisted in Agent history. Events="+JSON.stringify(toolDetail.events.map(ev=>({
      type:ev.event_type,tool:ev.content?.tool,output:String(ev.content?.output||"").slice(0,100),
      message:String(ev.content?.message||"").slice(0,100)}))) )
  assert.doesNotMatch(JSON.stringify(toolDetail),new RegExp(localKey),
    "Tool call events must not expose Smithery API keys")

  await tick(selectedRun)
  const finished=await runState(selectedRun)
  assert.equal(finished.status,"succeeded",JSON.stringify(finished))
  assert.match(finished.result,/MOCK_MCP_CONFIRMED/)
  const noWriteSpec=await specFor([selectedMktSearchTool],"Agent cannot write")
  const noWriteRun=await runFor(noWriteSpec,"FORCE_WRITE_TOOL")
  const callsBeforeWriteDenied=currentMcpCalls()
  await tick(noWriteRun)
  assert.equal(currentMcpCalls(),callsBeforeWriteDenied)
  assert.notEqual((await runState(noWriteRun)).status,"awaiting_approval",
    "Unselected WRITE tool cannot become eligible for approval")

  // Live permission check: disconnect after approval request, before actual tick.
  const revokedRun=await runFor(selectedSpec,"REVOKE_WHILE_PENDING")
  await tick(revokedRun)
  assert.equal((await runState(revokedRun)).status,"awaiting_approval")
  must(await api("POST","/api/market/toggle",{id:added.id,enabled:false},token))
  must(await api("POST","/api/agent-runs/"+revokedRun+"/approve",
    {decision:"approve"},token))
  const beforeRevokedCall=currentMcpCalls()
  await tick(revokedRun)
  assert.equal(currentMcpCalls(),beforeRevokedCall,
    "A disconnected tool must NOT execute after prior Agent approval")
  const revokedDetail=must(await api("GET","/api/agent-runs/"+revokedRun+"/detail",
    undefined,token))
  assert.ok(revokedDetail.events.some(ev=>ev.event_type==="error" &&
    JSON.stringify(ev.content).includes("原审批失效")),
    "Revoked MCP permission must produce a clear audit event, not an ambiguous write failure")

  console.log("PASS Agent market least-privilege: saved tool selection, approval, real MCP call, unselected denial, revocation, cross-employee fence",agentModelRequests)
  const revoked=must(await api("DELETE","/api/market/connections/"+added.id,
    undefined,token))
  assert.equal(revoked.remote_revoked,true,
    "Smithery managed disconnect must revoke the vendor-side connection")
  assert.equal(vendorRequests.filter(x=>x.method==="DELETE" &&
    /^\/connect\/studio-sandbox\//.test(x.path)).length,1)
  assert.equal(must(await api("GET","/api/market/connections",undefined,token)).items.length,0)
  // Retain an independent connection to assert key removal revokes local access.
  const addedAgain=must(await api("POST","/api/market/smithery/v2/connect",{
    slug:"github",namespace:"studio-sandbox",title:"GitHub after first revoke",
  },token))
  must(await api("POST","/api/market/smithery/v2/refresh",{id:addedAgain.id},token))
  must(await api("DELETE","/api/market/smithery/key",undefined,token))
  const after=must(await api("GET","/api/market/connections",undefined,token)).items
  assert.equal(after[0].enabled,false,"removing key must revoke local execution")
  assert.equal(after[0].headers_count,0)
  assert.equal(after[0].last_probe_status,"needs_key")
  console.log("PASS Smithery managed: JWT scope, key verification, query, namespace ownership, OAuth pending, tool discovery, enable, revoke")
}finally{
  await stopHeadlessPocketBase(server)
  await new Promise(resolve=>provider.close(resolve))
  for(let k=0;k<5;k++){
    try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:200});break}
    catch(e){if(k===4)throw e;await sleep(250)}
  }
}
