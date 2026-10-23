#!/usr/bin/env node
// Build a review-only BaoTa PG18 Worker source package.
// No network, server/database access, package installation, credentials or task starts.
// Exactly the inspected preflight modules and UNINSTALLED systemd examples.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const sourceFiles=[
  "services/pg-api/src/worker-loop.ts",
  "services/pg-api/src/model-worker-loop.ts",
  "services/pg-api/src/worker-role-preflight.ts",
  "services/pg-api/src/optional-credential-boundary.ts",
  "services/pg-api/src/knowledge-content-privileges.ts",
  "services/pg-api/src/knowledge-sharing-policy.ts",
  "services/pg-api/src/worker-credential-policy.ts",
  "services/pg-api/src/pg18-native-worker-readonly.ts",
  "services/pg-api/src/worker-activation-guard.ts",
  "services/pg-api/src/pg-runtime-target.ts",
  "services/pg-api/src/contracts.ts",
  "ops/templates/agentstudio-pg18-prepare.service.example",
  "ops/templates/agentstudio-pg18-model.service.example",
  "docs/BAOTA_PG18_WORKER_READINESS.md",
]
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex")
function refuse(code){throw Error("PG18_WORKER_REVIEW_REFUSED:"+code)}
function run(program,args,options={}){
  const r=spawnSync(program,args,{encoding:"utf8",timeout:30000,...options})
  if(r.status!==0)refuse("command_failed:"+program)
  return r.stdout
}
export function workerReviewBundle(output){
  if(typeof output!=="string"||!path.isAbsolute(output)||output.includes("\0"))
    refuse("absolute_output_required")
  const relative=path.relative(repo,path.resolve(output))
  if(relative===""||(!relative.startsWith(".."+path.sep)&&
     relative!==".."&&!path.isAbsolute(relative)))refuse("output_inside_repo")
  fs.mkdirSync(output,{recursive:true})
  const stage=fs.mkdtempSync(path.join(output,".pg18-worker-review-staging-"))
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"")
  const filename="agentstudio_pg18_worker_readonly_review_v1_"+stamp+".tar.gz"
  const archive=path.join(output,filename)
  if(fs.existsSync(archive))refuse("archive_exists")
  try{
    const payload={}
    for(const rel of sourceFiles){
      if(!/^[a-zA-Z0-9._/-]+$/.test(rel)||rel.includes("..")||
         /(?:^|\/)(?:\.git|node_modules|pb_data|secrets?|credentials?|\.env[^/]*)(?:\/|$)/i.test(rel))
        refuse("unexpected_source_path")
      const source=path.join(repo,rel)
      const stat=fs.lstatSync(source)
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128000)
        refuse("unsafe_source")
      payload[rel]=fs.readFileSync(source)
    }
    const model=payload["services/pg-api/src/model-worker-loop.ts"].toString("utf8")
    const prepare=payload["services/pg-api/src/worker-loop.ts"].toString("utf8")
    for(const s of [model,prepare]){
      if(!s.includes('await import("pg")')||
         !s.includes("verifyPgWorkerRoleBoundary")||
         !s.includes('["--serve","--preflight"]')||
         !s.includes("pgWorkerOfflinePlan"))
        refuse("worker_source_unexpected")
      if(/\bimport\s+\{[^}]*Pool[^}]*\}\s+from\s+["']pg["']/.test(s))
        refuse("driver_eager_import")
    }
    const role=payload["services/pg-api/src/worker-role-preflight.ts"].toString("utf8")
    if(!role.includes("BEGIN READ ONLY")||
       !role.includes("workerCanReadAuthAccounts")||
       !role.includes("pg_catalog.pg_class"))refuse("missing_privacy_guard")
    for(const unit of ["prepare","model"]){
      const txt=payload["ops/templates/agentstudio-pg18-"+unit+".service.example"]
        .toString("utf8")
      if(!txt.includes("--preflight")||!txt.includes("DynamicUser=yes")||
         !txt.includes("LoadCredential=worker.secret:")||
         txt.includes("\n[Install]")||/^ExecStart=.*--serve/m.test(txt))
        refuse("unsafe_unit")
    }
    const readme=[
      "Agent Studio PG18 Worker — REVIEW ONLY, READ-ONLY PLAN V1",
      "This archive contains no passwords, keys, pg data, full Worker engines,",
      "node_modules, production server config, PocketBase files or credentials.",
      "Purpose: offline source review, NOT runtime deployment or model execution.",
      "All commands are for the user's BaoTa terminal after MANUAL upload.",
      "Keep the old 8090 PocketBase + Worker running; do not touch vcaios.",
      "",
      "1. Upload into a NEW /opt/agentstudio-pg18-worker-review-v1 directory.",
      "2. Verify OUTER sha256 from the independently supplied SHA digest.",
      "3. tar -xzf <archive>.tar.gz",
      "4. sha256sum -c SHA256SUMS",
      "5. /opt/agentstudio-node24/bin/node --experimental-strip-types \\",
      "     services/pg-api/src/worker-loop.ts --plan",
      "6. /opt/agentstudio-node24/bin/node --experimental-strip-types \\",
      "     services/pg-api/src/model-worker-loop.ts --plan",
      "",
      "Do NOT run --preflight yet: this review package does NOT install 'pg'",
      "or include service credentials. Separate audited dependency setup and",
      "systemd unit activation are required before a real read-only check.",
      "Do NOT run --serve, install the .service.example files, reload Nginx,",
      "stop PocketBase or run any model/Agent Worker.",
      "The SQL and model execution modules are deliberately excluded.",
      "No valid task processing possible from this review package.",
      "",
      "Target (later stage only): 127.0.0.1:5333/agent_studio PG18.",
      "Existing PostgreSQL Native API and frontend are NOT switched live.",
      "Production cutover remains NO-GO.",
      "",
    ].join("\n")
    payload["README_REVIEW_FIRST.txt"]=Buffer.from(readme,"utf8")
    payload["services/pg-api/package.json"]=Buffer.from(
      JSON.stringify({name:"agentstudio-pg18-worker-review-only",
        version:"0.0.0",type:"module",private:true,
        engines:{node:">=24"},
        dependencies:{pg:"8.23.1"}},null,2)+"\n","utf8")
    const entries=Object.keys(payload).sort()
    for(const rel of entries){
      const dest=path.join(stage,rel)
      fs.mkdirSync(path.dirname(dest),{recursive:true})
      fs.writeFileSync(dest,payload[rel],{mode:0o600})
    }
    const manifest=entries.map(rel=>sha256(payload[rel])+"  "+rel).join("\n")+"\n"
    fs.writeFileSync(path.join(stage,"SHA256SUMS"),manifest)
    run("tar",["-czf",archive,"-C",stage,"."])
    const listed=run("tar",["-tzf",archive]).split(/\r?\n/)
      .filter(item=>item&&!item.endsWith("/"))
      .map(item=>item.replace(/^\.\//,"")).sort()
    if(JSON.stringify(listed)!==JSON.stringify([...entries,"SHA256SUMS"].sort()))
      refuse("unexpected_tar_members")
    const verify=fs.mkdtempSync(path.join(output,".pg18-worker-review-verify-"))
    try{
      run("tar",["-xzf",archive,"-C",verify])
      for(const rel of entries)
        if(sha256(fs.readFileSync(path.join(verify,rel)))!==sha256(payload[rel]))
          refuse("extracted_hash_failed")
      if(fs.readFileSync(path.join(verify,"SHA256SUMS"),"utf8")!==manifest)
        refuse("manifest_hash_failed")
      for(const kind of ["worker-loop","model-worker-loop"]){
        const file="services/pg-api/src/"+kind+".ts"
        const env={
          PATH:process.env.PATH??"",HOME:process.env.HOME??"",
          DATABASE_URL:"postgres://must_not_connect",
          AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
        }
        const plan=run(process.execPath,["--experimental-strip-types",file,"--plan"],
          {cwd:verify,env,timeout:18000})
        const result=JSON.parse(plan)
        if(result.mode!=="plan"||result.worker_started!==false||
           result.network_used!==false||result.db_writes_performed!==false||
           result.external_model_calls!==false||
           result.production_cutover_allowed!==false)
          refuse("unsafe_offline_plan")
        const denied=spawnSync(process.execPath,["--experimental-strip-types",file],
          {cwd:verify,env,encoding:"utf8",timeout:18000})
        if(denied.status!==1||
           !denied.stderr.includes("EXPLICIT_MODE_REQUIRED"))
          refuse("missing_mode_not_denied")
      }
    }finally{fs.rmSync(verify,{recursive:true,force:true})}
    return {
      archive,sha256:sha256(fs.readFileSync(archive)),
      size_bytes:fs.statSync(archive).size,
      archived_files:entries.length+1,
      source_only:true,manifest_verified:true,
      extracted_offline_plans_verified:2,
      default_start_refused:true,
      node_modules_included:false,secrets_included:false,
      network_used:false,production_changed:false,
      worker_started:false,cutover_allowed:false,
    }
  }finally{fs.rmSync(stage,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==4||process.argv[2]!=="--output-dir")
      refuse("usage")
    process.stdout.write(JSON.stringify(workerReviewBundle(process.argv[3]))+"\n")
  }catch(error){
    process.stderr.write(error instanceof Error?error.message:"worker_review_failed")
    process.stderr.write("\n")
    process.exitCode=1
  }
}
