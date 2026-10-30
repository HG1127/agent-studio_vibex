#!/usr/bin/env node
/**
 * V28 preview: local-only, disposable Studio auth + PocketBase + Vite.
 * Never uses original .env.local, persistent pb_data, live model keys,
 * database migration branches or a background Agent Worker.
 * The model listed in this preview is a no-billing LOCAL FIXTURE.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "../tests/helpers/headless-pocketbase.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const backendPort=Number(process.env.AGENT_STUDIO_PREVIEW_API_PORT||7180)
const modelPort=Number(process.env.AGENT_STUDIO_PREVIEW_MODEL_PORT||7181)
const webPort=Number(process.env.AGENT_STUDIO_PREVIEW_WEB_PORT||8180)
if([backendPort,modelPort,webPort].some(port=>!Number.isInteger(port)||port<1024||port>65535)||new Set([backendPort,modelPort,webPort]).size!==3)throw Error("invalid_preview_ports")
const apiOrigin="http://127.0.0.1:"+backendPort
const webOrigin="http://127.0.0.1:"+webPort
const email="v28-preview@example.test"
const password="PreviewOnly-2026!"
const dbDir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-v28-preview-"))
const pbBin=path.join(root,"vibex-local/bin/windows/pocketbase.exe")
const viteBin=path.join(root,"node_modules/vite/bin/vite.js")
const setupSecret=randomBytes(32).toString("hex")
let fixture=null,pb=null,vite=null,stopping=false
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const safeExit=()=>process.exitCode=1
const env={
  ...process.env,
  AGENT_STUDIO_AUTH_MODE:"standalone",AGENT_STUDIO_ALLOW_ANON:"false",
  AGENT_STUDIO_LEGACY_TEST_ONLY:"false",AGENT_STUDIO_BACKGROUND_WORKER:"false",
  AGENT_STUDIO_BOOTSTRAP_SECRET:setupSecret,
  AGENT_STUDIO_SECRET_KEY:randomBytes(16).toString("hex"),
  AGENT_STUDIO_STRICT_SECRETS:"true",AGENT_STUDIO_PB_ORIGIN:apiOrigin,
  VITE_AGENT_STUDIO_PG_PILOT_UI_ENABLED:"false",
}
async function closeAll() {
  if(stopping)return
  stopping=true
  try{vite?.kill()}catch{}
  try{await stopHeadlessPocketBase(pb,5000)}catch{}
  try{await new Promise(resolve=>fixture?.close(resolve)||resolve())}catch{}
  try{fs.rmSync(dbDir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
function installSignals(){
  for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>{void closeAll().finally(()=>process.exit())})
}
async function ready(url,child){
  for(let i=0;i<130;i++){
    if(child && child.exitCode!==null)throw Error("isolated_preview_service_exited")
    try{if((await fetch(url,{signal:AbortSignal.timeout(800)})).ok)return}catch{}
    await delay(150)
  }
  throw Error("isolated_preview_readiness_failed")
}
function providerResponse(req,res){
  if(req.url==="/v1/models"){
    res.writeHead(200,{"Content-Type":"application/json"})
    res.end(JSON.stringify({object:"list",data:[{id:"preview-no-billing-model",object:"model"}]}))
    return
  }
  if(req.url!=="/v1/chat/completions"||req.method!=="POST"){
    res.writeHead(404);res.end();return
  }
  // No real network or hosted provider. Missing usage stops V28 batch at one call.
  let input=""
  req.on("data",chunk=>{input+=chunk.toString();if(input.length>40000)req.destroy()})
  req.on("end",()=>{
    let requested=""
    try{const body=JSON.parse(input);requested=String(body.messages?.at(-1)?.content||"")}catch{}
    const content=JSON.stringify({
      name:"本地预览研究助手",goal:"审阅本地合成资料并给出带出处的审计报告",
      task_scope:"仅使用授权合成数据，不发送任何外部消息或调用生产系统。",
      tools:["文档解析","知识库检索"],task_plan:["提取","交叉核查","独立审核"],
      deliverables:["来源索引","审计结论"],done_criteria:["记录对应来源","列出待复核问题"],
      require_plan_review:true,require_approval:false,
      roles:[
        {id:"reader",name:"资料提取",responsibility:"读取测试资料",tasks:["提取来源"],inputs:["合成资料"],
          deliverables:["来源索引"],done_criteria:["存在出处"],depends_on:[],tools:[]},
        {id:"checker",name:"交叉核查",responsibility:"检查冲突",tasks:["核验"],inputs:["来源索引"],
          deliverables:["核对表"],done_criteria:["标记冲突"],depends_on:["reader"],tools:[]},
        {id:"reviewer",name:"独立审核",responsibility:"审核结论",tasks:["复审"],inputs:["核对表"],
          deliverables:["审计报告"],done_criteria:["记录不确定性"],depends_on:["checker"],tools:[]}
      ],
      capability_requirements:[
        {id:"pdf",title:"解析合成 PDF",purpose:"读取测试页码",kind:"document",access:"read",required:true,
          role_ids:["reader"],search_terms:["document"],suggested_tool_ids:[]},
        {id:"kb",title:"只读知识库",purpose:"对照授权资料",kind:"knowledge",access:"read",required:true,
          role_ids:["checker"],search_terms:["knowledge"],suggested_tool_ids:[]}
      ],
    })
    const response=JSON.stringify({choices:[{message:{role:"assistant",content}}]})
    res.writeHead(200,{"Content-Type":"application/json","X-Agent-Studio-Preview":"fixture-no-billing"})
    res.end(response)
    void requested
  })
}
async function api(route,method,body,header={}){
  const result=await fetch(apiOrigin+route,{
    method,headers:{"Content-Type":"application/json",...header},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(10000),
  })
  const value=await result.json().catch(()=>({}))
  if(!result.ok)throw Error("isolated_preview_api_"+result.status+"_"+route)
  return value
}
async function main(){
  if(!fs.existsSync(pbBin)||!fs.existsSync(viteBin))throw Error("local_preview_dependencies_missing")
  installSignals()
  fixture=createServer(providerResponse)
  await new Promise((resolve,reject)=>{
    fixture.once("error",reject)
    fixture.listen(modelPort,"127.0.0.1",resolve)
  })
  pb=spawnHeadlessPocketBase(pbBin,[
    "serve","--http=127.0.0.1:"+backendPort,
    "--dir="+dbDir,"--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
  ],{cwd:path.join(root,"pocketbase"),env,stdio:["ignore","pipe","pipe"],windowsHide:true})
  pb.stdout.on("data",()=>{})
  pb.stderr.on("data",()=>{})
  await ready(apiOrigin+"/api/health",pb)
  await api("/api/studio/bootstrap","POST",{
    email,password,display_name:"V28 隔离预览管理员",
  },{"X-Agent-Studio-Setup-Key":setupSecret})
  const login=await api("/api/collections/studio_users/auth-with-password","POST",{
    identity:email,password
  })
  await api("/api/model-connections","POST",{
    name:"本地预览模型（非 MiniMax · 不计费）",provider:"openai",
    base_url:"http://127.0.0.1:"+modelPort+"/v1",api_key:"preview-local-fixture-key",
    models:["preview-no-billing-model"]
  },{Authorization:login.token})
  vite=spawn(process.execPath,[
    viteBin,"--config","vibex-local/vite.local.config.ts","--host","127.0.0.1",
    "--port",String(webPort),"--strictPort"
  ],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]})
  vite.stdout.on("data",()=>{})
  vite.stderr.on("data",()=>{})
  await ready(webOrigin+"/login",vite)
  console.log("V28_ISOLATED_PREVIEW_READY "+JSON.stringify({
    url:webOrigin+"/model-connections",
    login:webOrigin+"/login",email,password,
    isolatedTemporaryDB:true,mockModel:true,realMiniMax:false,
    backgroundWorkerStarted:false,liveProviderCalls:0,
    warning:"此预览与用户已连接 MiniMax 的运行实例分离，绝不访问真实 API Key",
  }))
}
main().catch(async err=>{
  console.error("V28_ISOLATED_PREVIEW_FAILED "+String(err.message||"unknown"))
  safeExit()
  await closeAll()
  process.exit(1)
})
