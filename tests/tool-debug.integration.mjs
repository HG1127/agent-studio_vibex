// Security regression for Tool Hub: authenticated ownership and explicit POST consent.
// Uses a disposable PocketBase via the guarded CLI/bootstrap launcher; no browser.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:http"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary),"PocketBase binary required")
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-tool-debug-"))
const port=Number(process.env.PB_TOOL_DEBUG_TEST_PORT || 7391)
const upstreamPort=Number(process.env.PB_TOOL_DEBUG_UPSTREAM_PORT || 7392)
const base="http://127.0.0.1:"+port
const upstreamBase="http://127.0.0.1:"+upstreamPort
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let getCalls=0, postCalls=0, logs=""
const upstream=createServer(async(req,res)=>{
  let received=""
  for await(const chunk of req){ received+=String(chunk) }
  if(req.method==="POST") postCalls++
  else getCalls++
  if(req.url==="/strict-json"){
    try { JSON.parse(received) }
    catch {
      res.writeHead(400,{"Content-Type":"application/json"})
      res.end(JSON.stringify({reason:"Invalid value: The given data was not valid JSON.",error:true}))
      return
    }
  }
  res.writeHead(200,{"Content-Type":"application/json"})
  res.end(JSON.stringify({ok:true,method:req.method,path:req.url}))
})
const server=spawnHeadlessPocketBase(binary,[
  "serve","--http=127.0.0.1:"+port,
  "--dir="+dataDir,"--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false"},
  windowsHide:true})
server.stdout.on("data",x=>{logs=(logs+x).slice(-10000)})
server.stderr.on("data",x=>{logs=(logs+x).slice(-10000)})

async function call(method, route, owner, body) {
  const response=await fetch(base+route,{
    method,
    headers:{"Content-Type":"application/json",...(owner?{"X-Rh-User-Id":owner}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(12000),
  })
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
async function expect(method,route,owner,body,status=200) {
  const result=await call(method,route,owner,body)
  assert.equal(result.status,status,method+" "+route+" -> "+JSON.stringify(result.data))
  return result.data
}
try {
  await new Promise(resolve=>upstream.listen(upstreamPort,"127.0.0.1",resolve))
  let ready=false
  for(let n=0;n<140;n++){
    if(server.exitCode!==null)break
    try{if((await fetch(base+"/api/health",{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}catch{}
    await pause(150)
  }
  assert.ok(ready,"PocketBase health failed: "+logs.slice(-2400))
  assert.doesNotMatch(logs,/\/_\/#\/pbinstall|Launch the URL below|create your first superuser/i)

  const post=await expect("POST","/api/tool-connections","A",{
    name:"Tenant A write",description:"write endpoint",method:"POST",
    url:upstreamBase+"/write",headers:[],body_template:"{{input}}",
  })
  const get=await expect("POST","/api/tool-connections","A",{
    name:"Tenant A read",description:"read endpoint",method:"GET",
    url:upstreamBase+"/read",headers:[],
  })
  assert.match(post.item.id,/^[A-Za-z0-9]{15}$/)
  const routes=["/api/tool-hub/debug","/api/llm/tool-hub/debug"]
  for(const route of routes){
    await expect("POST",route,"",{connection_id:post.item.id,confirm_write:true},401)
    await expect("POST",route,"B",{connection_id:post.item.id,confirm_write:true},404)
    await expect("POST",route,"B",{connection_id:get.item.id},404)
    assert.equal(postCalls,0,"Unauthorized user must not send POST upstream")
    assert.equal(getCalls,0,"Unauthorized user must not send GET upstream")

    await expect("POST",route,"A",{connection_id:post.item.id,input:"{}",confirm_write:"true"},409)
    await expect("POST",route,"A",{connection_id:post.item.id,input:"{}"},409)
    assert.equal(postCalls,0,"Debug POST without boolean consent must be blocked")
  }
  // GET does not need a write acknowledgement.
  const read=await expect("POST",routes[0],"A",{connection_id:get.item.id,input:"query"},200)
  assert.equal(read.ok,true)
  assert.equal(getCalls,1)

  // Consent is scoped to each individual POST request, and must be true (not truthy).
  const write=await expect("POST",routes[1],"A",{
    connection_id:post.item.id,input:'{"order":"test"}',confirm_write:true,
  })
  assert.equal(write.ok,true)
  assert.equal(postCalls,1)
  await expect("POST",routes[1],"A",{connection_id:post.item.id,input:"{}"},409)
  assert.equal(postCalls,1)


  // The separate Tool Connections test endpoint must enforce the same safety.
  const connectionTest="/api/tool-connections/test"
  await expect("POST",connectionTest,"B",{connection_id:post.item.id,confirm_write:true},404)
  assert.equal(postCalls,1,"Foreign Tool Connections test must not call upstream")
  await expect("POST",connectionTest,"A",{connection_id:post.item.id,input:"{}"},409)
  await expect("POST",connectionTest,"A",{connection_id:post.item.id,input:"{}",confirm_write:"true"},409)
  await expect("POST",connectionTest,"A",{url:upstreamBase+"/unsaved",method:"POST",input:"{}"},409)
  assert.equal(postCalls,1,"All Tool Connections POST test routes require consent")

  const formGet=await expect("POST",connectionTest,"A",{
    url:upstreamBase+"/unsaved-read",method:"GET",input:"{}",
  })
  assert.equal(formGet.ok,true)
  assert.equal(getCalls,2)
  const forecast=await expect("POST",connectionTest,"A",{
    url:upstreamBase+"/forecast?latitude={{latitude}}&longitude={{longitude}}",
    method:"GET",input:'{"latitude":30.2741,"longitude":120.1551}',
  })
  assert.equal(forecast.ok,true)
  const sent=JSON.parse(forecast.response_excerpt)
  assert.equal(sent.path,"/forecast?latitude=30.2741&longitude=120.1551")
  const invalidBody=await expect("POST",connectionTest,"A",{
    url:upstreamBase+"/strict-json",method:"POST",input:'{"city":"杭州"}',
    body_template:'{"city":{{city}}}',confirm_write:true,
  })
  assert.equal(invalidBody.ok,false)
  assert.equal(invalidBody.status_code,400)
  assert.match(invalidBody.response_excerpt,/not valid JSON/)
  const formPost=await expect("POST",connectionTest,"A",{
    url:upstreamBase+"/unsaved-write",method:"POST",input:"{}",confirm_write:true,
  })
  assert.equal(formPost.ok,true)
  assert.equal(postCalls,3)
  const savedPost=await expect("POST",connectionTest,"A",{
    connection_id:post.item.id,input:"{}",confirm_write:true,
  })
  assert.equal(savedPost.ok,true)
  assert.equal(postCalls,4)

  // Tool names are unique per owner, NOT globally reserved by another tenant.
  const otherOwner=await expect("POST","/api/tool-connections","B",{
    name:"Tenant A write",description:"different tenant",method:"GET",
    url:upstreamBase+"/other-tenant",headers:[],
  })
  assert.equal(otherOwner.ok,true)
  const ownerLogs=await expect("GET","/api/tool-hub/invocations","A",undefined,200)
  assert.ok(ownerLogs.items.some(item=>item.source==="debug"&&item.tool_name==="Tenant A write"))
  const foreignLogs=await expect("GET","/api/tool-hub/invocations","B",undefined,200)
  assert.equal(foreignLogs.items.length,0)
  console.log("PASS ToolHub + Tool Connections: tenant isolation, GET read, per-call POST consent, tenant-scoped names")
} finally {
  server.kill()
  await new Promise(resolve=>upstream.close(resolve))
  await Promise.race([new Promise(resolve=>server.once("exit",resolve)),pause(1500)])
  fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
