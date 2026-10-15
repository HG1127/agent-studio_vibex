// Full HTTP proxy smoke. Fresh temporary PB + local Vite; no browser or real data.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import net from "node:net"
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const binary = process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
const vite = path.join(root,"node_modules/vite/bin/vite.js")
assert.ok(fs.existsSync(binary), "PocketBase binary must exist")
assert.ok(fs.existsSync(vite), "Install dependencies before Vite proxy smoke")
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-proxy-"))
const secret=randomBytes(48).toString("hex")
async function port(){
 return await new Promise((resolve,reject)=>{
  const server=net.createServer()
  server.once("error",reject)
  server.listen(0,"127.0.0.1",()=>server.close(()=>resolve(server.address()?.port || 0)))
 })
}
async function openPort(){
 return await new Promise((resolve,reject)=>{
  const server=net.createServer()
  server.once("error",reject)
  server.listen(0,"127.0.0.1",()=>{
    const addr=server.address()
    const result=typeof addr==="object" && addr ? addr.port : 0
    server.close(()=>resolve(result))
  })
 })
}
const pbPort=await openPort()
const webPort=await openPort()
assert.notEqual(pbPort,webPort)
const pbOrigin="http://127.0.0.1:"+pbPort
const webOrigin="http://127.0.0.1:"+webPort
const env={
 ...process.env,
 AGENT_STUDIO_AUTH_MODE:"standalone",
 AGENT_STUDIO_ALLOW_ANON:"false",
 AGENT_STUDIO_BOOTSTRAP_SECRET:secret,
 AGENT_STUDIO_PB_ORIGIN:pbOrigin,
 AGENT_STUDIO_INTERNAL_SHARE_USERS:"",
}
const server=spawnHeadlessPocketBase(binary,[
 "serve","--http=127.0.0.1:"+pbPort,"--dir="+tmp,
 "--hooksDir="+path.join(root,"pocketbase/pb_hooks")
],{cwd:path.join(root,"pocketbase"),env})
const site=spawn(process.execPath,[
 vite,"--config","vibex-local/vite.local.config.ts","--host","127.0.0.1",
 "--port",String(webPort),"--strictPort"
],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]})
let logs=""
for(const [name,proc] of [["PocketBase",server],["Vite",site]]){
 proc.stdout?.on("data",x=>logs=(logs+name+": "+x).slice(-10000))
 proc.stderr?.on("data",x=>logs=(logs+name+": "+x).slice(-10000))
}
async function waitReady(url){
 for(let i=0;i<200;i++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(450)})
   if(response.ok)return response
  }catch{}
  if(server.exitCode!==null || site.exitCode!==null)break
  await new Promise(r=>setTimeout(r,150))
 }
 throw Error("Timed out waiting for "+url+"; "+logs.slice(-1800))
}
async function req(method,endpoint,body,headers={}){
 const result=await fetch(webOrigin+endpoint,{
  method,headers:{"Content-Type":"application/json",...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(12000)
 })
 return {status:result.status,data:await result.json().catch(()=>({}))}
}
try{
 await waitReady(pbOrigin+"/api/health")
 await waitReady(webOrigin+"/__pb/api/health")
 const page=await waitReady(webOrigin+"/login")
 const html=await page.text()
 assert.match(html,/Agent Studio/)
 assert.doesNotMatch(html,/vibex\.runninghub\.cn/)
 const status=await req("GET","/__pb/api/studio/bootstrap/status")
 assert.equal(status.status,200,JSON.stringify(status))
 assert.equal(status.data.initialized,false)
 const forged=await req("GET","/__pb/api/agent_specs",undefined,{"X-Rh-User-Id":"attacker"})
 assert.equal(forged.status,401,JSON.stringify(forged))
 const boss=await req("POST","/__pb/api/studio/bootstrap",{
  email:"owner@example.test",password:"Proxy-test-password-2026",display_name:"Owner"
 },{"X-Agent-Studio-Setup-Key":secret})
 assert.equal(boss.status,201,JSON.stringify(boss))
 const login=await req("POST","/__pb/api/collections/studio_users/auth-with-password",{
  identity:"owner@example.test",password:"Proxy-test-password-2026"
 })
 assert.equal(login.status,200,JSON.stringify(login))
 const user=await req("GET","/__pb/api/studio/me",undefined,{
  Authorization:login.data.token,"X-Rh-User-Id":"attacker"
 })
 assert.equal(user.status,200,JSON.stringify(user))
 assert.equal(user.data.user.id,login.data.record.id)
 assert.equal(user.data.user.role,"admin")
 const share=await req("GET","/__pb/api/internal/templates",undefined,{Authorization:login.data.token})
 assert.equal(share.status,200,JSON.stringify(share))
 console.log("PASS standalone web proxy: SPA, PB health, setup, password login, bearer auth, forged-ID defense, internal sharing")
}catch(error){
 console.error("FAIL standalone web proxy:",error)
 console.error(logs.slice(-2700))
 process.exitCode=1
}finally{
 site.kill()
 server.kill()
 await new Promise(resolve=>setTimeout(resolve,400))
 fs.rmSync(tmp,{recursive:true,force:true})
}
