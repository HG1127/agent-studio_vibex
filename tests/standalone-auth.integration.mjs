// Standalone identity E2E: a fresh disposable PocketBase, no browser, no
// VibeX cookie, no external login, no real business data.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { randomBytes } from "node:crypto"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
const root=process.cwd()
const binary=process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary),"PocketBase binary must be available")
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-standalone-"))
const key=randomBytes(32).toString("hex")
const workerKey=randomBytes(48).toString("hex")
const freePort=()=>new Promise((resolve,reject)=>{
 const s=net.createServer()
 s.on("error",reject)
 s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p))})
})
const port=await freePort()
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(binary,[
 "serve","--http=127.0.0.1:"+port,"--dir="+temp,
 "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),env:{
 AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_ALLOW_ANON:"false",
 AGENT_STUDIO_BOOTSTRAP_SECRET:key,AGENT_STUDIO_INTERNAL_SHARE_USERS:"",
 AGENT_STUDIO_WORKER_TOKEN:workerKey,AGENT_STUDIO_BACKGROUND_WORKER:"true",
}})
let logs=""
server.stdout.on("data",x=>logs=(logs+x).slice(-15000))
server.stderr.on("data",x=>logs=(logs+x).slice(-15000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function request(method,route,{token,headerUid,body,setupKey,workerToken}={}){
 const headers={"Content-Type":"application/json"}
 if(token)headers.Authorization=token
 if(headerUid)headers["X-Rh-User-Id"]=headerUid
 if(setupKey)headers["X-Agent-Studio-Setup-Key"]=setupKey
 if(workerToken)headers["X-Agent-Studio-Worker-Token"]=workerToken
 const response=await fetch(origin+route,{method,headers,
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)})
 const data=await response.json().catch(()=>({}))
 return {status:response.status,data}
}
const get=(url,props)=>request("GET",url,props)
const post=(url,body,props)=>request("POST",url,{...props,body})
const patch=(url,body,props)=>request("PATCH",url,{...props,body})
try{
 let online=false
 for(let i=0;i<140;i++){
  if(server.exitCode!==null) break
  try {const res=await fetch(origin+"/api/health",{signal:AbortSignal.timeout(900)});if(res.ok){online=true;break}}catch{}
  await sleep(120)
 }
 assert.ok(online,"PocketBase not ready: "+logs.slice(-3000))
 const status=await get("/api/studio/bootstrap/status")
 assert.equal(status.status,200,JSON.stringify(status))
 assert.equal(status.data.initialized,false,JSON.stringify(status))
 let denied=await get("/api/agent_specs",{headerUid:"hacker"})
 assert.equal(denied.status,401,"forged owner header unexpectedly authorized: "+JSON.stringify(denied))
 const harnessPaths=["/api/worker/status","/api/harness/monitor","/api/tool-hub/stats",
  "/api/agent-runs/recent?limit=20","/api/workflow-runs/recent?limit=20"]
 for(const route of harnessPaths){
  assert.equal((await get(route,{headerUid:"forged-owner"})).status,401,route)
 }
 // Standalone JWT guard must strip forged legacy owner headers on all LLM routes.
 for(const [method,route,body] of [
   ["GET","/api/llm/models",undefined],
   ["POST","/api/llm/chat",{model:"fake",request_id:"fake-request-123456",
     messages:[{role:"user",content:"test"}]}],
   ["POST","/api/llm/poll",{request_id:"fake-request-123456"}],
 ]){
   const spoofed=await request(method,route,{headerUid:"forged-other-employee",body})
   assert.equal(spoofed.status,401,"legacy header alone authorized "+method+" "+route)
 }
 denied=await post("/api/studio/bootstrap",{email:"boss@example.test",password:"S3cure-password-2026",display_name:"负责人"})
 assert.equal(denied.status,403)
 const boot=await post("/api/studio/bootstrap",{email:"boss@example.test",password:"S3cure-password-2026",display_name:"负责人"},{setupKey:key})
 assert.equal(boot.status,201,JSON.stringify(boot))
 const again=await post("/api/studio/bootstrap",{email:"boss2@example.test",password:"S3cure-password-2026",display_name:"第二管理员"},{setupKey:key})
 assert.equal(again.status,409,JSON.stringify(again))
 const login=await post("/api/collections/studio_users/auth-with-password",{identity:"boss@example.test",password:"S3cure-password-2026"})
 assert.equal(login.status,200,JSON.stringify(login))
 const boss=login.data.record.id, bossToken=login.data.token
 assert.ok(bossToken.length>20)
 const me=await get("/api/studio/me",{token:bossToken,headerUid:"forged"})
 assert.equal(me.status,200,JSON.stringify(me))
 assert.equal(me.data.user.id,boss)
 const created=await post("/api/studio/users",{email:"staff@example.test",password:"S3cure-password-2026",display_name:"员工B",role:"employee"},{token:bossToken})
 assert.equal(created.status,201,JSON.stringify(created))
 const staffId=created.data.user.id
 const staffLogin=await post("/api/collections/studio_users/auth-with-password",{identity:"staff@example.test",password:"S3cure-password-2026"})
 assert.equal(staffLogin.status,200,JSON.stringify(staffLogin))
 const staffToken=staffLogin.data.token
 for(const route of harnessPaths){
  const snapshot=await get(route,{token:staffToken,headerUid:boss})
  assert.equal(snapshot.status,200,route+": "+JSON.stringify(snapshot))
  assert.equal(snapshot.data.ok,true,route)
  if(route.includes("recent"))assert.deepEqual(snapshot.data.items,[])
  if(route.includes("tool-hub/stats"))assert.equal(snapshot.data.run_count,0)
 }
 const fromBoss=await post("/api/agent_specs",{name:"主管的独立 Agent",spec:{goal:"研究公开财报"}},{token:bossToken})
 assert.equal(fromBoss.status,200,JSON.stringify(fromBoss))
 const own=await get("/api/agent_specs",{token:bossToken})
 assert.equal(own.status,200,JSON.stringify(own))
 assert.equal(own.data.items.length,1)
 assert.equal(own.data.items[0].rh_user_id,boss)
 const spoof=await get("/api/agent_specs",{token:staffToken,headerUid:boss})
 assert.equal(spoof.status,200,JSON.stringify(spoof))
 assert.equal(spoof.data.items.length,0,"cross-account spoof fetched manager record")
 const sharing=await get("/api/internal/templates",{token:staffToken})
 assert.equal(sharing.status,200,JSON.stringify(sharing))
 // A scheduled launch is permitted only through the privileged worker and
 // still must correspond to an actual occurrence owned by that employee.
 const invalidAgentStart={spec_id:fromBoss.data.id,instruction:"scheduled task",
  scheduled_run_id:"abcdef012345678",schedule_occurrence_id:"abcdef0123456789abcd"}
 const noWorker=await post("/api/agent-runs/start",invalidAgentStart,{headerUid:boss})
 assert.equal(noWorker.status,401,"Forged employee header must not launch work")
 const noSchedule=await post("/api/agent-runs/start",
  {spec_id:fromBoss.data.id,instruction:"unsafe direct start"},
  {headerUid:boss,workerToken:workerKey})
 assert.equal(noSchedule.status,403,"Worker key alone must not bypass scheduled-run checks")
 assert.equal(noSchedule.data.error,"schedule_internal_only")
 const fakeSchedule=await post("/api/agent-runs/start",invalidAgentStart,
  {headerUid:boss,workerToken:workerKey})
 assert.equal(fakeSchedule.status,403,"Must reject nonexistent scheduled occurrence: "+JSON.stringify(fakeSchedule))
 assert.equal(fakeSchedule.data.error,"schedule_link_not_authorized")
 const fakeWorkflow=await post("/api/workflow-runs/start",{
  workflow_id:"abcdefghijklmno",instruction:"scheduled task",
  scheduled_run_id:"abcdef012345678",schedule_occurrence_id:"abcdef0123456789abcd"
 },{headerUid:boss,workerToken:workerKey})
 assert.equal(fakeWorkflow.status,403,"Must reject nonexistent scheduled workflow: "+JSON.stringify(fakeWorkflow))
 const disableShare=await patch("/api/studio/users/"+staffId,{share_enabled:false},{token:bossToken})
 assert.equal(disableShare.status,200,JSON.stringify(disableShare))
 assert.equal((await get("/api/internal/templates",{token:staffToken})).status,403)
 assert.equal((await get("/api/agent_specs",{token:staffToken})).status,200)
 const disableUser=await patch("/api/studio/users/"+staffId,{active:false},{token:bossToken})
 assert.equal(disableUser.status,200,JSON.stringify(disableUser))
 assert.equal((await get("/api/agent_specs",{token:staffToken})).status,401)
 assert.equal((await get("/api/studio/me",{token:staffToken})).status,401)
 for(const route of harnessPaths)assert.equal((await get(route,{token:staffToken})).status,401,route)
 console.log("standalone auth E2E passed: bootstrap, login, admin, owner-scoping, spoof denial, sharing toggle, user deactivation")
}catch(err){
 console.error("standalone auth integration failed:",err)
 console.error("PocketBase logs tail:",logs.slice(-3000))
 process.exitCode=1
}finally{
 server.kill()
 await sleep(350)
 fs.rmSync(temp,{recursive:true,force:true})
}
