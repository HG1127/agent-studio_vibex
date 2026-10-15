// Demonstrate the P0 gateway boundary on an isolated raw PocketBase endpoint.
// Expected direct result is FAIL: app routes trust X-Rh-User-Id, so a deployed
// service must NOT expose this raw backend to any untrusted employee/browser.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { verifyGateway } from "../ops/verify-gateway.mjs"

const root=process.cwd()
const pb=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb))
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-boundary-probe-"))
const port=Number(process.env.PB_GATEWAY_BOUNDARY_TEST_PORT||7427)
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(pb,[
  "serve","--http=127.0.0.1:"+port,"--dir="+tmp,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{
  cwd:path.join(root,"pocketbase"),windowsHide:true,
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false"},
})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let logs=""
server.stdout.on("data",d=>{logs=(logs+d).slice(-6000)})
server.stderr.on("data",d=>{logs=(logs+d).slice(-6000)})
try{
  let ready=false
  for(let n=0;n<120;n++){
    if(server.exitCode!==null)break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
    await sleep(170)
  }
  assert.ok(ready,"Raw PB health failed "+logs.slice(-1300))
  const result=await verifyGateway(origin,{allowLoopback:true})
  assert.equal(result.result,"FAIL",
    "Raw PocketBase must not be mistaken for an authenticated gateway")
  const forged=result.checks.find(x=>x.kind==="spoofed_identity")
  assert.equal(forged.status,200,
    "This documents the actual raw endpoint behavior: forged RH user id accepted")
  const anon=result.checks.find(x=>x.kind==="anonymous")
  assert.equal(anon.status,401)
  assert.doesNotMatch(logs,/\/_\/#\/pbinstall/i)
  console.log("PASS boundary regression: raw backend demonstrably UNSAFE for direct exposure; trusted gateway required")
} finally {
  server.kill()
  await Promise.race([new Promise(r=>server.once("close",r)),sleep(1800)])
  for(let i=0;i<6;i++){
    try{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:150});break}
    catch(e){if(i===5)throw e;await sleep(300*(i+1))}
  }
}
