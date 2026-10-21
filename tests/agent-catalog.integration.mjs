import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { spawnHeadlessPocketBase,stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const bin=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(bin),"PocketBase test binary required")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-catalog-e2e-"))
const port=await new Promise((resolve,reject)=>{
  const server=net.createServer()
  server.once("error",reject)
  server.listen(0,"127.0.0.1",()=>{const p=server.address().port;server.close(()=>resolve(p))})
})
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(bin,[
  "serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),windowsHide:true,env:{
  ...process.env,AGENT_STUDIO_ALLOW_ANON:"false",
}})
let logs=""
server.stdout.on("data",d=>logs=(logs+d.toString()).slice(-7000))
server.stderr.on("data",d=>logs=(logs+d.toString()).slice(-7000))
const sleep=ms=>new Promise(done=>setTimeout(done,ms))
async function call(method,route,uid,body){
  const response=await fetch(origin+route,{method,
    headers:{"Content-Type":"application/json",...(uid?{"X-Rh-User-Id":uid}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(16000),
  })
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
async function ok(method,route,uid,body,status=200){
  const result=await call(method,route,uid,body)
  assert.equal(result.status,status,route+" "+JSON.stringify(result.data).slice(0,440))
  return result.data
}
try{
  let ready=false
  for(let i=0;i<140;i++){
    if(server.exitCode!==null)break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}
    catch{}
    await sleep(120)
  }
  assert.ok(ready,"PocketBase startup failed: "+logs)
  assert.equal((await call("GET","/api/agent_specs","",undefined)).status,401)
  assert.equal((await call("GET","/api/agent_specs/favorites","",undefined)).status,401)
  const own=[]
  for(let i=0;i<124;i++){
    const word=i===3?"目标GAMMA":i===63?"目标GAMMA":`任务-${i}`
    const res=await ok("POST","/api/agent_specs","A",{
      name:`Agent ${String(i).padStart(3,"0")}`,
      spec:{goal:word,task_scope:"业务需求",tools:["calculate"],task_plan:["梳理","核验"]},
      source:i%2===0?"template":"create",
    })
    own.push(res)
  }
  const other=await ok("POST","/api/agent_specs","B",{
    name:"B private superstar",spec:{goal:"目标GAMMA"},
  })
  const pg=await ok("GET","/api/agent_specs?page=1&perPage=20&sort=name_asc","A")
  assert.equal(pg.items.length,20)
  assert.equal(pg.totalItems,124)
  assert.equal(pg.totalPages,7)
  assert.equal(pg.items[0].name,"Agent 000")
  const next=await ok("GET","/api/agent_specs?page=2&perPage=20&sort=name_asc","A")
  assert.equal(next.items[0].name,"Agent 020")
  assert.equal(new Set([...pg.items,...next.items].map(r=>r.id)).size,40)
  const search=await ok("GET","/api/agent_specs?page=1&perPage=20&q="+encodeURIComponent("目标GAMMA"),"A")
  assert.equal(search.totalItems,2)
  assert.ok(search.items.every(row=>row.id!==other.id))
  const source=await ok("GET","/api/agent_specs?source=template&perPage=30","A")
  assert.equal(source.totalItems,62)
  assert.equal((await ok("GET","/api/agent_specs?q=%25","A")).totalItems,0,
    "Percent characters in a search query must not act as a wildcard")
  const favorites=[own[42],own[4],own[110]]
  for(const row of favorites){
    const favorited=await ok("POST","/api/agent_specs/"+row.id+"/favorite","A",{favorite:true})
    assert.equal(favorited.favorite,true)
  }
  const favorited=await ok("GET","/api/agent_specs?favorite=1&sort=favorite_desc&page=1&perPage=2","A")
  assert.equal(favorited.totalItems,3)
  assert.equal(favorited.items.length,2)
  assert.ok(favorited.items.every(row=>row.favorite===true))
  const favorited2=await ok("GET","/api/agent_specs?favorite=1&page=2&perPage=2","A")
  assert.equal(favorited2.items.length,1)
  const favoritesLoaded=await ok("GET","/api/agent_specs/favorites","A")
  assert.equal(favoritesLoaded.ids.length,3)
  const cannotFavorite=await call("POST","/api/agent_specs/"+own[42].id+"/favorite","B",{favorite:true})
  assert.equal(cannotFavorite.status,404)
  assert.equal((await ok("GET","/api/agent_specs?favorite=1","B")).totalItems,0)
  await ok("POST","/api/agent_specs/"+own[42].id+"/favorite","A",{favorite:false})
  assert.equal((await ok("GET","/api/agent_specs?favorite=1","A")).totalItems,2)
  const before=await ok("GET","/api/agent_specs/"+own[4].id,"A")
  await ok("POST","/api/agent_specs/"+own[4].id+"/favorite","A",{favorite:true})
  const after=await ok("GET","/api/agent_specs/"+own[4].id,"A")
  assert.equal(before.updated,after.updated,"Favoriting must not mutate AgentSpec revision")
  await ok("DELETE","/api/agent_specs/"+own[4].id,"A")
  assert.equal((await ok("GET","/api/agent_specs?favorite=1","A")).totalItems,1)
  const never=await ok("GET","/api/agent_specs","B")
  assert.equal(never.totalItems,1)
  assert.equal(never.items[0].id,other.id)
  console.log("PASS V18 Agent catalog: 124+ records, true totals, search/source/favorites pagination, persisted owner isolation, version unchanged")
}catch(error){
  console.error("V18_AGENT_CATALOG_FAILURE",error.stack||error)
  console.error("POCKETBASE_LOG",logs.slice(-1900))
  process.exitCode=1
}finally{
  try{await stopHeadlessPocketBase(server)}catch{}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:190})}catch{}
}
