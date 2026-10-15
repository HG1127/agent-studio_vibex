#!/usr/bin/env node
// Explicit local-only first-run setup. NEVER run on an existing DB.
// Does not contact VibeX, create an RH identity, or start a browser.
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const data=path.join(root,"pocketbase","pb_data")
const config=path.join(root,".env.local")
const credentials=path.join(root,"standalone","operator-credentials.local")
const dryRun=process.argv.includes("--dry-run")
const random=()=>randomBytes(48).toString("base64url")
const binary=()=>{
  if(process.env.AGENT_STUDIO_POCKETBASE_BIN)return path.resolve(process.env.AGENT_STUDIO_POCKETBASE_BIN)
  const platform=process.platform==="win32"?"windows":process.platform==="darwin"?"darwin":"linux"
  const exe=process.platform==="win32"?"pocketbase.exe":"pocketbase"
  const candidates=[
    path.join(root,"standalone","bin",platform,exe),
    path.join(root,"vibex-local","bin",platform,exe),
  ]
  return candidates.find(file=>fs.existsSync(file))||candidates[0]
}
function fail(message){throw new Error(message)}
try{
  const pb=binary()
  if(fs.existsSync(config))fail(".env.local 已存在，拒绝覆盖旧配置；先备份并人工迁移。")
  if(fs.existsSync(credentials))fail("操作员凭据文件已存在，拒绝生成第二份。")
  if(fs.existsSync(path.join(data,"data.db")))fail("检测到已有 PocketBase 数据库；请备份并执行旧账号映射，不能重新初始化覆盖数据。")
  if(!fs.existsSync(pb))fail("未找到 PocketBase 0.40.5；请在 standalone/bin 中安装对应平台的 PocketBase，或设置 AGENT_STUDIO_POCKETBASE_BIN。")
  const version=spawnSync(pb,["--version"],{cwd:root,encoding:"utf8",windowsHide:true,timeout:10000})
  const name=String(version.stdout||"")+String(version.stderr||"")
  if(version.status!==0||!name.includes("0.40.5"))fail("PocketBase 版本尚未验证。当前工程锁定并测试版本为 0.40.5。")
  if(dryRun){
    console.log("预检通过：无现有配置、无现有数据库、PocketBase 版本兼容。未写入任何文件。")
    process.exit(0)
  }
  fs.mkdirSync(data,{recursive:true,mode:0o700})
  fs.mkdirSync(path.dirname(credentials),{recursive:true,mode:0o700})
  const password=random()
  const email="pb-operator@agentstudio.example.com"
  const created=spawnSync(pb,["superuser","create",email,password,"--dir="+data],{
    cwd:root,encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:200000
  })
  if(created.status!==0)fail("初始化 PocketBase 系统维护账号失败；停止而不写入任何 Studio 密钥。请检查隔离数据库目录。")
  const env=[
    "# Agent Studio 独立本地实例（由显式初始化命令生成，不要提交到代码仓库）",
    "AGENT_STUDIO_AUTH_MODE=standalone",
    "AGENT_STUDIO_ALLOW_ANON=false",
    "AGENT_STUDIO_STRICT_SECRETS=true",
    "AGENT_STUDIO_SECRET_KEY="+randomBytes(24).toString("base64url"),
    "AGENT_STUDIO_WORKER_TOKEN="+random(),
    "AGENT_STUDIO_BOOTSTRAP_SECRET="+random(),
    "AGENT_STUDIO_BACKGROUND_WORKER=true",
    "AGENT_STUDIO_WORKER_URL=http://127.0.0.1:7000",
    "AGENT_STUDIO_WORKER_INTERNAL_URL=http://127.0.0.1:7000",
    "AGENT_STUDIO_DISABLE_PB_BROWSER_INSTALLER=true",
    "",
  ].join("\n")
  fs.writeFileSync(credentials,"# PocketBase 系统维护账号，非 Agent Studio 员工登录\nEMAIL="+email+"\nPASSWORD="+password+"\n",{mode:0o600,flag:"wx"})
  fs.writeFileSync(config,env,{mode:0o600,flag:"wx"})
  console.log("本地独立环境已初始化（未启动服务）。")
  console.log("配置文件：.env.local（包含首次 Studio 管理员初始化密钥）。")
  console.log("PocketBase 系统维护凭据：standalone/operator-credentials.local。")
  console.log("下一步：pnpm install && pnpm standalone:dev；打开 http://127.0.0.1:8000/login。")
  console.log("首次进入时由授权管理员输入 .env.local 内的 AGENT_STUDIO_BOOTSTRAP_SECRET 创建自己的员工管理员账号。")
}catch(err){console.error("独立环境初始化被拒绝："+String(err.message||err));process.exitCode=1}
