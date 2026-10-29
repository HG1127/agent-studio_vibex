#!/usr/bin/env node
// Source-only initializer review package. Never connects or initializes a DB.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {captureFreshRuntimeSources,freshRuntimePlan} from "../services/pg-api/src/pg18-fresh-runtime-source.mjs"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),entry="services/pg-api/src/baota-pg18-runtime-init.mjs"
const sha=data=>createHash("sha256").update(data).digest("hex")
function refuse(code){throw Error("PG18_RUNTIME_REVIEW_REFUSED:"+code)}
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:30000,windowsHide:true,...options});if(r.status!==0)refuse("command_failed");return r.stdout}
function removeOwnDirectory(output,dir){const resolved=path.resolve(dir),relative=path.relative(output,resolved)
  if(!relative||relative.startsWith("..")||path.isAbsolute(relative)||!/^runtime-init-(?:source|check)-/.test(path.basename(resolved)))refuse("unsafe_cleanup")
  fs.rmSync(resolved,{recursive:true,force:true})
}
export function collectRuntimeInitReviewSources(){
  const snapshot=captureFreshRuntimeSources(),files=new Set([...snapshot.sources.map(s=>s.path),"services/pg-api/package.json","services/pg-api/pnpm-lock.yaml","docs/PG18_FRESH_RUNTIME_INITIALIZATION.md","docs/PG18_SERVICE_LOGIN_PREPARATION.md","docs/PG18_RUNTIME_PREPARATION_POSTCHECK.md","docs/PG18_COMPLETE_069_PREPARATION.md",
    "ops/baota-pg18-native-readonly-preflight.sql","ops/baota-pg18-native-postcheck.sql","ops/baota-pg18-first-admin-postcheck.sql"]),visited=new Set()
  const visit=rel=>{
    if(visited.has(rel))return;visited.add(rel);files.add(rel)
    const file=path.join(root,rel)
    if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())refuse("unsafe_source")
    const text=fs.readFileSync(file,"utf8")
    for(const regex of [/\bfrom\s+["'](\.[^"']+)["']/g,/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g])for(const match of text.matchAll(regex)){
      const dep=path.posix.normalize(path.posix.join(path.posix.dirname(rel),match[1]))
      if((!dep.startsWith("services/pg-api/src/")&&dep!=="shared/agent-role-limits.mjs")||dep.includes("..")||!/\.(ts|mjs|mts)$/.test(dep))refuse("outside_dependency")
      visit(dep)
    }
    if(rel.endsWith(".mjs")){const declaration=rel.slice(0,-4)+".d.mts";if(fs.existsSync(path.join(root,declaration)))files.add(declaration)}
  }
  for(const module of [entry,"services/pg-api/src/native-activation-cli.mjs","services/pg-api/src/native-first-admin-cli.mjs","services/pg-api/src/pg18-service-login-cli.mjs","services/pg-api/src/pg18-runtime-postcheck-cli.mjs"])visit(module)
  return {files:[...files].sort(),snapshot}
}
export function buildRuntimeInitReview(output){
  if(typeof output!=="string"||!path.isAbsolute(output)||output.includes("\0")||output.startsWith("\\\\"))refuse("absolute_local_output_required")
  output=path.resolve(output)
  if(output===path.parse(output).root)refuse("output_directory_required")
  let parent=path.parse(output).root
  for(const part of output.slice(parent.length).split(path.sep)){
    if(!part)continue;parent=path.join(parent,part)
    if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())refuse("symlink_output_forbidden")
  }
  const relative=path.relative(root,output)
  if(!relative||!relative.startsWith("..")&&!path.isAbsolute(relative))refuse("output_outside_checkout_required")
  fs.mkdirSync(output,{recursive:true});const stage=fs.mkdtempSync(path.join(output,"runtime-init-source-"))
  try{
    const {files,snapshot}=collectRuntimeInitReviewSources(),planned=freshRuntimePlan(snapshot)
    for(const rel of files){if(!/^[A-Za-z0-9_./-]+$/.test(rel)||rel.includes("..")||/(?:^|\/)(?:\.env[^/]*|pb_data|node_modules|secrets?|credentials?)(?:\/|$)/i.test(rel))refuse("forbidden_source")
      const source=path.join(root,rel);if(fs.lstatSync(source).isSymbolicLink()||!fs.statSync(source).isFile())refuse("unsafe_source")
      const bytes=fs.readFileSync(source);if(bytes.includes(0))refuse("binary_source")
      const dest=path.join(stage,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes)
    }
    fs.writeFileSync(path.join(stage,"INITIALIZATION_PLAN.json"),JSON.stringify(planned,null,2)+"\n")
    fs.writeFileSync(path.join(stage,"README_REVIEW_ONLY.txt"),"Source review only. Production remains NO-GO. No credentials or database data.\nDEFAULT050 ONLY. Read docs/PG18_COMPLETE_069_PREPARATION.md for the separate complete069 source-review builder, API-first prepare sequence and new external root records. Do not use these legacy activation/six-account/postcheck commands on full069 or filter its ledger to fake a pass.\nVerify SHA256SUMS, then run offline plans:\nnode "+entry+" --plan\nnode services/pg-api/src/native-activation-cli.mjs --plan\nnode services/pg-api/src/native-first-admin-cli.mjs --plan\nRead docs/PG18_FRESH_RUNTIME_INITIALIZATION.md before proposing any target action.\nRun the six service plans using node services/pg-api/src/pg18-service-login-cli.mjs --plan --service <api|worker|identity|broker|index-worker|index-broker>.\nRun the four stage plans using node services/pg-api/src/pg18-runtime-postcheck-cli.mjs --plan --stage <initialized|native-login|first-admin|service-logins>.\nRead docs/PG18_RUNTIME_PREPARATION_POSTCHECK.md for stage boundaries and baseline-only SQL scope.\nThe package includes the service lockfile. Plans need no dependency installation; any separately approved dependency preparation must use pnpm --dir services/pg-api install --ignore-workspace --frozen-lockfile --ignore-scripts.\nThe package installs nothing, enables no login and starts no service.\n")
    const packed=[...files,"INITIALIZATION_PLAN.json","README_REVIEW_ONLY.txt"].sort()
    const manifest=packed.map(rel=>sha(fs.readFileSync(path.join(stage,rel)))+"  "+rel).join("\n")+"\n"
    fs.writeFileSync(path.join(stage,"SHA256SUMS"),manifest)
    const archive=path.join(output,"agentstudio_pg18_runtime_init_review_"+snapshot.source_sha256.slice(0,16)+".tar.gz")
    if(fs.existsSync(archive))refuse("archive_already_exists")
    run("tar",["-czf",archive,"-C",stage,"."])
    const names=run("tar",["-tzf",archive]).split(/\r?\n/).filter(x=>x&&!x.endsWith("/")).map(x=>x.replace(/^\.\//,"")).sort()
    if(JSON.stringify(names)!==JSON.stringify([...packed,"SHA256SUMS"].sort()))refuse("archive_contents")
    const check=fs.mkdtempSync(path.join(output,"runtime-init-check-"))
    try{
      run("tar",["-xzf",archive,"-C",check])
      for(const rel of packed)if(sha(fs.readFileSync(path.join(check,rel)))!==sha(fs.readFileSync(path.join(stage,rel))))refuse("manifest_mismatch")
      const preload="data:text/javascript,"+encodeURIComponent("import net from 'node:net';import{syncBuiltinESMExports}from'node:module';net.Socket.prototype.connect=()=>{throw Error('review_must_be_offline')};syncBuiltinESMExports();")
      const env={PATH:process.env.PATH??"",SystemRoot:process.env.SystemRoot??"",DATABASE_URL:"never_connect",AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:"/never-read-secret"}
      const plan=JSON.parse(run(process.execPath,["--import",preload,entry,"--plan"],{cwd:check,env}))
      if(JSON.stringify(plan)!==JSON.stringify(planned)||plan.network_used!==false||plan.service_logins_enabled!==false||plan.production_cutover_allowed!==false)refuse("extracted_plan")
      for(const cli of ["services/pg-api/src/native-activation-cli.mjs","services/pg-api/src/native-first-admin-cli.mjs"]){
        const next=JSON.parse(run(process.execPath,["--import",preload,cli,"--plan"],{cwd:check,env}))
        if(next.network_used!==false||next.production_cutover_allowed!==false)refuse("additional_offline_plan")
      }
      for(const service of ["api","worker","identity","broker","index-worker","index-broker"]){
        const next=JSON.parse(run(process.execPath,["--import",preload,"services/pg-api/src/pg18-service-login-cli.mjs","--plan","--service",service],{cwd:check,env}))
        if(next.network_used!==false||next.services_started!==false||next.production_cutover_allowed!==false||next.definition.kind!==service||next.source_sha256!==snapshot.source_sha256)refuse("service_offline_plan")
      }
      for(const stage of ["initialized","native-login","first-admin","service-logins"]){
        const next=JSON.parse(run(process.execPath,["--import",preload,"services/pg-api/src/pg18-runtime-postcheck-cli.mjs","--plan","--stage",stage],{cwd:check,env}))
        if(next.network_used!==false||next.writes_performed!==false||next.production_cutover_allowed!==false||next.stage!==stage||next.source_sha256!==snapshot.source_sha256)refuse("postcheck_offline_plan")
      }
      const rejected=spawnSync(process.execPath,["--import",preload,entry,"--execute","--confirm-empty-database","agent_studio","--expected-source-sha256",snapshot.source_sha256],{cwd:check,env,encoding:"utf8",timeout:15000,windowsHide:true})
      if(rejected.status===0||!rejected.stderr.includes("runtime_init_not_approved")||/never_connect|never-read-secret|review_must_be_offline/.test(rejected.stdout+rejected.stderr))refuse("default_execution_not_refused")
    }finally{removeOwnDirectory(output,check)}
    return {archive,sha256:sha(fs.readFileSync(archive)),source_sha256:snapshot.source_sha256,source_files:files.length,packed_files:packed.length+1,
      manifest_verified:true,offline_plan_verified:true,offline_plans_verified:13,default_execution_refused:true,contains_credentials:false,network_used:false,production_cutover_allowed:false}
  }finally{removeOwnDirectory(output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4||process.argv[2]!=="--output-dir")refuse("explicit_output_required");process.stdout.write(JSON.stringify(buildRuntimeInitReview(process.argv[3]))+"\n")}
  catch(error){process.stderr.write((error instanceof Error&&error.message.startsWith("PG18_RUNTIME_REVIEW_REFUSED:")?error.message:"PG18_RUNTIME_REVIEW_FAILED")+"\n");process.exitCode=1}
}
