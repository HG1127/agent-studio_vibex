#!/usr/bin/env node
// Independent development runtime for the VibeX-exported source fork.
// Local PocketBase + Vite + background Worker, without hosted login/billing.
// No browser/production deployment is opened or performed.
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { setTimeout as sleep } from "node:timers/promises"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const config=path.join(root,".env.local")
const data=path.join(root,"pocketbase","pb_data")
const hooks=path.join(root,"pocketbase","pb_hooks")
const migration=path.join(root,"pocketbase","pb_migrations")
const vite=path.join(root,"node_modules","vite","bin","vite.js")
function binary(){
 if(process.env.AGENT_STUDIO_POCKETBASE_BIN)return path.resolve(process.env.AGENT_STUDIO_POCKETBASE_BIN)
 const platform=process.platform==="win32"?"windows":process.platform==="darwin"?"darwin":"linux"
 const exe=process.platform==="win32"?"pocketbase.exe":"pocketbase"
 return [path.join(root,"standalone","bin",platform,exe),path.join(root,"vibex-local","bin",platform,exe)].find(fs.existsSync)
}
function readEnvironment() {
 if(!fs.existsSync(config))throw Error("未发现 .env.local，请先运行 pnpm standalone:init。")
 const out={}
 for(const line of fs.readFileSync(config,"utf8").split(/\r?\n/)){
   const v=line.trim()
   if(!v||v.startsWith("#"))continue
   const match=v.match(/^([A-Z][A-Z_0-9]*)=(.*)$/)
   if(!match)throw Error("环境配置格式无效，请检查 .env.local 的键值格式。")
   out[match[1]]=match[2]
 }
 // Explicit process environment may override local configuration.
 const env={...out,...process.env}
 if(env.AGENT_STUDIO_AUTH_MODE!=="standalone" || env.AGENT_STUDIO_ALLOW_ANON!=="false")
   throw Error("独立启动拒绝匿名模式及旧 VibeX 身份模式。")
 if(env.AGENT_STUDIO_STRICT_SECRETS!=="true"||String(env.AGENT_STUDIO_SECRET_KEY||"").length!==32)
   throw Error("必须启用严格密钥模式并设置32字符加密密钥。")
 if(String(env.AGENT_STUDIO_BOOTSTRAP_SECRET||"").length<32 || String(env.AGENT_STUDIO_WORKER_TOKEN||"").length<32)
   throw Error("初始化密钥或 Worker Token 缺失。")
 env.AGENT_STUDIO_PB_ORIGIN="http://127.0.0.1:7000"
 env.AGENT_STUDIO_BACKGROUND_WORKER="true"
 env.AGENT_STUDIO_WORKER_URL="http://127.0.0.1:7000"
 env.AGENT_STUDIO_WORKER_INTERNAL_URL="http://127.0.0.1:7000"
 return env
}
const children=[]
let stopping=false
function stop(code=0){
 if(stopping)return
 stopping=true
 if(code)process.exitCode=code
 for(const child of [...children].reverse()){
   if(child.exitCode===null&&!child.killed)child.kill()
 }
}
process.on("SIGINT",()=>stop(130))
process.on("SIGTERM",()=>stop(143))
function start(name,executable,args,env){
 const child=spawn(executable,args,{cwd:root,env,stdio:"inherit",windowsHide:true})
 children.push(child)
 child.once("error",err=>{console.error(name+" 无法启动："+err.message);stop(1)})
 child.once("exit",(code)=>{
   if(!stopping){console.error(name+" 已退出（退出码 "+code+"），停止其余组件。");stop(1)}
 })
 return child
}
async function main(){
 const env=readEnvironment()
 if(!fs.existsSync(path.join(data,"data.db")))throw Error("没有已初始化数据库。先运行 pnpm standalone:init。")
 if(!fs.existsSync(vite))throw Error("未安装前端依赖。先运行 pnpm install。")
 const pb=binary()
 if(!pb||!fs.existsSync(pb))throw Error("PocketBase 0.40.5 二进制缺失，请参照独立部署文档安装。")
 const server=start("PocketBase",pb,["serve","--http=127.0.0.1:7000",
   "--dir="+data,"--hooksDir="+hooks,"--migrationsDir="+migration],env)
 let online=false
 for(let i=0;i<100;i++){
   if(stopping || server.exitCode!==null)break
   try{
     const res=await fetch("http://127.0.0.1:7000/api/health",{signal:AbortSignal.timeout(650)})
     if(res.ok){online=true;break}
   }catch{}
   await sleep(150)
 }
 if(!online)throw Error("PocketBase 启动失败或健康检查超时；请确认端口7000未被占用。")
 start("Agent Worker",process.execPath,[path.join(root,"worker","run.mjs")],env)
 start("Agent Studio Web",process.execPath,[vite,"--config","vibex-local/vite.local.config.ts",
   "--host","127.0.0.1","--port","8000","--strictPort"],env)
 console.log("\nAgent Studio 独立本地服务已启动。Web 地址：http://127.0.0.1:8000/login")
 console.log("请先使用管理员初始化密钥创建 Studio 员工账号；此启动程序不会打开浏览器或 VibeX 登录页面。")
}
main().catch(err=>{console.error("启动失败："+String(err.message||err));stop(1)})
