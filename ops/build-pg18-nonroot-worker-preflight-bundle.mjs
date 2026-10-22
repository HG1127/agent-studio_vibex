#!/usr/bin/env node
// Build a source-only BaoTa PG18 non-root Worker --preflight review bundle.
// It contains no database driver binary, credentials, runtime Worker engine
// modules, model providers or services, and does not connect to a server.
import fs from "node:fs"
import path from "node:path"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const sourcePaths=[
  "ops/baota-pg18-nonroot-worker-preflight.py",
  "services/pg-api/src/worker-loop.ts",
  "services/pg-api/src/model-worker-loop.ts",
  "services/pg-api/src/worker-activation-guard.ts",
  "services/pg-api/src/worker-role-preflight.ts",
  "services/pg-api/src/optional-credential-boundary.ts",
  "services/pg-api/src/worker-credential-policy.ts",
  "services/pg-api/src/pg18-native-worker-readonly.ts",
  "services/pg-api/src/pg-runtime-target.ts",
  "services/pg-api/src/contracts.ts",
]
const hash=bytes=>createHash("sha256").update(bytes).digest("hex")
function refuse(code){throw Error("PG18_NONROOT_BUNDLE_REFUSED:"+code)}
function run(exe,args,opts={}){
  const value=spawnSync(exe,args,{encoding:"utf8",timeout:28000,...opts})
  if(value.status!==0)refuse("subprocess_failed:"+exe)
  return value.stdout
}
function checked(rel){
  if(!sourcePaths.includes(rel)||rel.includes("..")||
     /(?:^|\/)(?:pb_data|node_modules|\.env|secrets|credentials)(?:\/|$)/i.test(rel))
    refuse("source_not_allowed")
  const file=path.join(root,rel)
  const meta=fs.lstatSync(file)
  if(!meta.isFile()||meta.isSymbolicLink()||meta.size>110000)
    refuse("source_not_regular")
  return fs.readFileSync(file)
}
function sourcesSafe(files){
  const operator=files[sourcePaths[0]].toString("utf8")
  for(const required of [
    'ROOT = Path("/opt/agentstudio-pg18-worker-preflight-v1")',
    'DRIVER = Path("/opt/agentstudio-pg18-api-preflight-v1/services/pg-api/node_modules")',
    'def manifest_ok():','def private_secret():',
    'def unit_is_clear(name):','def transient_args(kind):',
    'if argv == ["--plan"]:',
    'elif argv == ["--run", "--approve-transient-readonly"]:',
    '"--preflight"',
    '"production_cutover_allowed": False',
  ])if(!operator.includes(required))refuse("operator_unexpected")
  if(operator.includes('["--serve"]')||
     /subprocess\.run\(\s*\[\s*["']systemctl["']\s*,\s*["'](?:start|restart|stop)/.test(operator))
    refuse("operator_can_start_serve")
  for(const name of ["worker-loop.ts","model-worker-loop.ts"]){
    const src=files["services/pg-api/src/"+name].toString("utf8")
    for(const check of [
      'await import("pg")','verifyPgWorkerRoleBoundary',
      'assertPg18WorkerCredentialBinding','pgWorkerOfflinePlan',
      '"--preflight"','if(preflight)',
      'production_cutover_allowed:false',
    ])if(!src.includes(check))refuse("unexpected_worker_source:"+name)
    if(/\bimport\s*\{[^}]*Pool[^}]*\}\s*from\s*["']pg["']/.test(src))
      refuse("worker_pg_eager_import")
  }
  const grant=files["services/pg-api/src/worker-role-preflight.ts"].toString("utf8")
  if(!grant.includes("BEGIN READ ONLY")||
     !grant.includes("workerCanReadAuthAccounts")||
     !grant.includes("ROLLBACK"))refuse("role_check_not_read_only")
  const target=files["services/pg-api/src/pg-runtime-target.ts"].toString("utf8")
  if(!target.includes('host!=="127.0.0.1"')||
     !target.includes('database!=="agent_studio"')||
     !target.includes('port!=="5333"'))refuse("target_not_fixed")
}
export function buildNonrootPg18PreflightBundle(outputDir){
  if(typeof outputDir!=="string"||!path.isAbsolute(outputDir)||
     outputDir.includes("\0"))refuse("absolute_output_dir_required")
  const out=path.resolve(outputDir)
  const rel=path.relative(root,out)
  if(rel===""||(!rel.startsWith(".."+path.sep)&&rel!==".."&&
      !path.isAbsolute(rel)))refuse("output_inside_repo")
  const payload=Object.fromEntries(sourcePaths.map(name=>[name,checked(name)]))
  sourcesSafe(payload)
  const readme=[
    "Agent Studio PG18 non-root Worker — transient READ-ONLY preflight",
    "BUILD IS SOURCE-ONLY. Does NOT include pg/node_modules, keys, tokens,",
    "passwords, model provider, tasks, service install, database data or backups.",
    "Must keep old agentstudio-lan-pocketbase and agentstudio-lan-worker active.",
    "The separate 19/19 real Worker DB login audit must already have passed.",
    "",
    "EXACT target: 127.0.0.1:5333/agent_studio. NEVER use vcaios.",
    "EXACT new target directory: /opt/agentstudio-pg18-worker-preflight-v1.",
    "The complete runtime source + driver are not merged into the old folders.",
    "Only existing /opt/agentstudio-pg18-api-preflight-v1/services/pg-api/",
    "node_modules can be REUSED as a read-only, checked symlink in this new tree.",
    "",
    "Manual operator steps (run only after checking OUTER SHA-256):",
    "  install -d -o root -g root -m 755 /opt/agentstudio-pg18-worker-preflight-v1",
    "  # Upload and extract this tar.gz into that NEW, empty directory.",
    "  cd /opt/agentstudio-pg18-worker-preflight-v1",
    "  sha256sum -c SHA256SUMS",
    "  # Files extracted from a Windows ZIP might have 0600 permissions.",
    "  # AFTER checking the signed ZIP and inner SHA256SUMS:",
    "  chown -R root:root /opt/agentstudio-pg18-worker-preflight-v1",
    "  find /opt/agentstudio-pg18-worker-preflight-v1 -type d -exec chmod 755 {} +",
    "  find /opt/agentstudio-pg18-worker-preflight-v1 -type f -exec chmod 644 {} +",
    "  python3 ops/baota-pg18-nonroot-worker-preflight.py --plan",
    "",
    "Do not run further if ready_for_nonroot_preflight is false.",
    "If operator independently approves a short-lived systemd test:",
    "  python3 ops/baota-pg18-nonroot-worker-preflight.py --run --approve-transient-readonly",
    "",
    "The explicit run creates ONLY a symlink in its isolated package and",
    "two oneshot systemd-run units (prepare then model), never a permanent",
    "service, and runs strictly --preflight (no task/model call).",
    "The isolated package has NO AgentPrepareWorker, AgentModelWorker or model",
    "provider implementation even if a user tries to run --serve.",
    "",
    "Package files/directories must be root-owned, non-group/other-writable",
    "and world-readable/traversable by the ephemeral non-root account.",
    "The existing driver directory must meet the same metadata requirements",
    "and pg/package.json must be version 8.23.1.",
    "Do not relax permissions on /root secrets; systemd LoadCredential",
    "copies worker.secret privately for the ephemeral service.",
    "Never copy a password/secret into this package, Git or chat.",
    "NO PocketBase stop, web redirect, static unit install or PG cutover.",
    "Production cutover remains NO-GO even if both non-root preflights pass.",
    "",
  ].join("\n")
  payload["README_NONROOT_PREFLIGHT.txt"]=Buffer.from(readme,"utf8")
  fs.mkdirSync(out,{recursive:true})
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"")
  const archive=path.join(out,"agentstudio_pg18_worker_nonroot_preflight_v1_"+stamp+".tar.gz")
  if(fs.existsSync(archive))refuse("archive_exists")
  const stage=fs.mkdtempSync(path.join(out,".pg18-nonroot-source-stage-"))
  try{
    const names=Object.keys(payload).sort()
    for(const name of names){
      const absolute=path.join(stage,name)
      fs.mkdirSync(path.dirname(absolute),{recursive:true})
      fs.writeFileSync(absolute,payload[name])
    }
    const manifest=names.map(name=>hash(payload[name])+"  "+name).join("\n")+"\n"
    fs.writeFileSync(path.join(stage,"SHA256SUMS"),manifest)
    run("tar",["-czf",archive,"-C",stage,"."])
    const members=run("tar",["-tzf",archive]).split(/\r?\n/)
      .filter(name=>name&&!name.endsWith("/"))
      .map(name=>name.replace(/^\.\//,"")).sort()
    if(JSON.stringify(members)!==JSON.stringify([...names,"SHA256SUMS"].sort()))
      refuse("archive_members_unexpected")
    const testDir=fs.mkdtempSync(path.join(out,".pg18-nonroot-verify-"))
    try{
      run("tar",["-xzf",archive,"-C",testDir])
      if(fs.readFileSync(path.join(testDir,"SHA256SUMS"),"utf8")!==manifest)
        refuse("sha256_manifest_changed")
      for(const name of names){
        if(hash(fs.readFileSync(path.join(testDir,name)))!==hash(payload[name]))
          refuse("payload_sha256_mismatch")
      }
      run("python",["-m","py_compile",sourcePaths[0]],{cwd:testDir})
      const invalid=spawnSync("python",[sourcePaths[0]],{
        cwd:testDir,encoding:"utf8",timeout:12000
      })
      if(invalid.status===0||
         !invalid.stderr.includes("explicit_plan_or_approved_readonly_run_required"))
        refuse("default_execution_not_denied")
      for(const name of ["worker-loop.ts","model-worker-loop.ts"]){
        const plan=run(process.execPath,[
          "--experimental-strip-types",
          "services/pg-api/src/"+name,"--plan",
        ],{cwd:testDir,timeout:22000,
          env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
            DATABASE_URL:"postgres://must-not-connect"}})
        const result=JSON.parse(plan)
        if(result.mode!=="plan"||result.network_used!==false||
           result.worker_started!==false||
           result.db_writes_performed!==false||
           result.external_model_calls!==false||
           result.production_cutover_allowed!==false)
          refuse("unexpected_offline_worker_plan")
      }
    }finally{fs.rmSync(testDir,{recursive:true,force:true})}
    return {
      archive,sha256:hash(fs.readFileSync(archive)),
      bytes:fs.statSync(archive).size,files:names.length+1,
      manifest_verified:true,source_only:true,
      two_worker_offline_plans_verified:true,
      implicit_start_denied:true,secrets_included:false,
      pg_driver_included:false,api_worker_started:false,
      network_used:false,production_modified:false,
      production_cutover_allowed:false,
    }
  }finally{fs.rmSync(stage,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==4||process.argv[2]!=="--output-dir")
      refuse("explicit_output_dir_required")
    process.stdout.write(JSON.stringify(
      buildNonrootPg18PreflightBundle(process.argv[3]))+"\n")
  }catch(err){
    process.stderr.write((err instanceof Error?err.message:"bundle_failed")+"\n")
    process.exitCode=1
  }
}
