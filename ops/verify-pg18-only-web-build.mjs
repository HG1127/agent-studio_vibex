#!/usr/bin/env node
// Verify PG18-only React build has no runtime legacy PB auth/routes.
// This inspects a local build artifact only; never deploys or accesses a DB.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const dist=path.join(root,"dist-pg18")
const assets=path.join(dist,"assets")
if(!fs.existsSync(path.join(dist,"index.html"))||
   !fs.existsSync(assets)||
   !fs.statSync(assets).isDirectory()){
  process.stderr.write("PG18_WEB_BUILD_MISSING\n")
  process.exitCode=1
}else{
  const html=fs.readFileSync(path.join(dist,"index.html"),"utf8")
  const scripts=fs.readdirSync(assets).filter(x=>x.endsWith(".js"))
  const violations=[]
  if(!scripts.length)violations.push("js_assets_missing")
  if(!html.includes('id="root"')||
     !html.includes('lang="zh-CN"')||
     html.includes("/__pb")||
     /(?:src|href)\s*=\s*["']https?:\/\//i.test(html))
    violations.push("unsafe_pg18_entry")
  const forbidden=[
    ["/__pb","pocketbase_proxy"],
    ["studio_users","pocketbase_users"],
    ["LocalAuthStore","pocketbase_local_auth"],
    ["agent_studio_employee_auth","pocketbase_token_store"],
    ["X-Rh-User-Id","untrusted_legacy_user_header"],
    ["/api/agent-runs/","legacy_agent_engine_route"],
    ["仅限隔离 Run/审批 UAT","dev_run_approval_ui_leak"],
    ["提交隔离任务","dev_run_submission_ui_leak"],
    ["隔离 TXT/Markdown 入库 UAT","dev_kb_ingestion_ui_leak"],
    ["将 TXT/MD 文本写入合成知识库","dev_kb_ingestion_button_leak"],
    ["Agent 关联知识库 · 隔离配置 UAT","dev_agent_kb_binding_leak"],
    ["保存关联（只更新配置）","dev_agent_kb_binding_button_leak"],
  ]
  let nativeLoginFound=false
  for(const name of scripts){
    const js=fs.readFileSync(path.join(assets,name),"utf8")
    if(js.includes("/api/native-auth/login"))nativeLoginFound=true
    for(const [substring,reason] of forbidden)
      if(js.includes(substring))violations.push(name+":"+reason)
  }
  if(!nativeLoginFound)violations.push("pg_native_login_missing")
  if(violations.length){
    process.stderr.write("PG18_WEB_BUILD_REFUSED:"+violations.join(",")+"\n")
    process.exitCode=1
  }else{
    process.stdout.write(JSON.stringify({
      mode:"verify",app:"postgresql_only_candidate",
      js_assets:scripts.length,legacy_pocketbase_auth_or_proxy:false,
      pg_native_login_present:true,legacy_dist_not_inspected:true,
      production_cutover_allowed:false
    })+"\n")
  }
}
