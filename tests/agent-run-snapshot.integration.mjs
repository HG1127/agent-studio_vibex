import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {DatabaseSync} from "node:sqlite"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary),"isolated PocketBase binary required")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-run-snapshot-e2e-"))
const port=await new Promise((resolve,reject)=>{
  const socket=net.createServer()
  socket.once("error",reject)
  socket.listen(0,"127.0.0.1",()=>{const selected=socket.address().port;socket.close(()=>resolve(selected))})
})
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(binary,[
  "serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),windowsHide:true,
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false"}})
let logs=""
server.stdout.on("data",chunk=>logs=(logs+chunk.toString()).slice(-6000))
server.stderr.on("data",chunk=>logs=(logs+chunk.toString()).slice(-6000))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function request(method,route,owner,body){
  const response=await fetch(origin+route,{
    method,
    headers:{"Content-Type":"application/json",...(owner?{"X-Rh-User-Id":owner}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(13000),
  })
  return {status:response.status,body:await response.json().catch(()=>({}))}
}
async function ok(method,route,owner,body,status=200){
  const result=await request(method,route,owner,body)
  assert.equal(result.status,status,method+" "+route+" => "+JSON.stringify(result.body).slice(0,460))
  return result.body
}
try{
  let ready=false
  for(let i=0;i<125;i++){
    if(server.exitCode!==null)break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(700)})).ok){ready=true;break}}
    catch{}
    await sleep(150)
  }
  assert.ok(ready,"temporary PB unavailable: "+logs.slice(-1100))
  const original=await ok("POST","/api/agent_specs","employee-alpha",{
    name:"初始需求 Agent",
    spec:{goal:"【原始目标】审核需求",task_scope:"原始范围",
      task_plan:["提取需求","人工确认","生成计划"],
      tools:["calculate"],deliverables:["阶段计划"],done_criteria:["由业务方确认"]},
  })
  const originalRun=await ok("POST","/api/agent-runs/start","employee-alpha",{
    spec_id:original.id,instruction:"不执行真实外部调用的独立快照测试",
  })
  const initial=await ok("GET","/api/agent-runs/"+originalRun.run_id+"/detail","employee-alpha")
  assert.equal(initial.spec_snapshot.goal,"【原始目标】审核需求")
  assert.equal(initial.run.spec_name,"初始需求 Agent")
  const changed=await ok("PATCH","/api/agent_specs/"+original.id,"employee-alpha",{
    expected_updated:original.updated,
    name:"已更新名称",
    spec:{...original.spec,goal:"【改进目标】更改范围",tools:["calculate","knowledge_search"]},
  })
  assert.equal(changed.spec.goal,"【改进目标】更改范围")
  const oldRun=await ok("GET","/api/agent-runs/"+originalRun.run_id+"/detail","employee-alpha")
  assert.equal(oldRun.spec_snapshot.goal,"【原始目标】审核需求",
    "Run detail must return saved execution snapshot, not CURRENT AgentSpec")
  assert.deepEqual(oldRun.spec_snapshot.tools,["calculate"])
  assert.equal(oldRun.run.spec_name,"初始需求 Agent")
  const newRun=await ok("POST","/api/agent-runs/start","employee-alpha",{
    spec_id:original.id,instruction:"仅快照检查",
  })
  const next=await ok("GET","/api/agent-runs/"+newRun.run_id+"/detail","employee-alpha")
  assert.equal(next.spec_snapshot.goal,"【改进目标】更改范围")
  assert.deepEqual(next.spec_snapshot.tools,["calculate","knowledge_search"])
  assert.equal(next.run.spec_name,"已更新名称")
  // Simulate a legacy run without saved snapshot. A false historical goal
  // would be worse than an explicitly missing snapshot.
  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{db.prepare("UPDATE agent_runs SET spec_snapshot='null' WHERE id=?").run(originalRun.run_id)}
  finally{db.close()}
  const legacy=await ok("GET","/api/agent-runs/"+originalRun.run_id+"/detail","employee-alpha")
  assert.equal(legacy.spec_snapshot,null,
    "Legacy run must not fallback to current scheme and fabricate evidence")
  assert.equal((await request("GET","/api/agent-runs/"+newRun.run_id+"/detail","employee-beta")).status,404)
  assert.equal((await request("GET","/api/agent-runs/"+newRun.run_id+"/detail","")).status,401)
  console.log("PASS V18 old run snapshots survive Agent editing, legacy is unknown, owner isolation enforced")
}catch(error){
  console.error("SNAPSHOT_EVIDENCE_TEST_FAILED",error.stack||error)
  console.error("PB_LOG_TAIL",logs.slice(-1800))
  process.exitCode=1
}finally{
  try{await stopHeadlessPocketBase(server)}catch{}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
