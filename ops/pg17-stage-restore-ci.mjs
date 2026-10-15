#!/usr/bin/env node
// W14. A disposable GitHub-hosted PostgreSQL17 stage recovery rehearsal.
// Runs ONLY after W12 inserted SYNTHETIC records into the same service.
// pg_dump the synthetic stage and pg_restore into a NEW database.
// Never drops, overwrites, restores to, or even connects to company databases.
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"

const refused="refuse_non_ephemeral_pg17_restore"
const target="agentstudio_stage_restore_w14"
const sha=(v)=>createHash("sha256").update(v).digest("hex")
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||""
  const prefix="synthetic-agentstudio-pg17-ci-"+run+"-"
  const password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||""
  if(platform!=="linux"||env.GITHUB_ACTIONS!=="true"||
     env.RUNNER_ENVIRONMENT!=="github-hosted"||env.RUNNER_OS!=="Linux"||
     env.AGENT_STUDIO_PG17_TEST_ENABLED!=="true"||
     env.AGENT_STUDIO_PG17_STAGE_RESTORE_TEST_ENABLED!=="true"||
     env.AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED!=="true"||
     env.AGENT_STUDIO_PG17_HOST!=="127.0.0.1"||
     env.AGENT_STUDIO_PG17_DATABASE!=="agentstudio_stage"||
     env.AGENT_STUDIO_PG17_ADMIN_USER!=="agentstudio_admin"||
     !/^[0-9]{1,32}$/.test(run)||
     !password.startsWith(prefix)||
     !/^[a-f0-9]{64}$/.test(password.slice(prefix.length))||
     new Set(password.slice(prefix.length)).size<12||
     typeof env.RUNNER_TEMP!=="string"||
     !path.isAbsolute(env.RUNNER_TEMP)||
     path.normalize(env.RUNNER_TEMP)!==env.RUNNER_TEMP)
    throw Error(refused)
  return {temp:env.RUNNER_TEMP}
}
function execute(...args){
  const run=spawnSync("docker",args,{
    encoding:null,timeout:45000,maxBuffer:32*1024*1024,
    // Never inherit DOCKER_HOST or other process-level connector URLs.
    env:{PATH:process.env.PATH??"/usr/bin:/bin",
      HOME:process.env.HOME??"/tmp",
      DOCKER_HOST:"unix:///var/run/docker.sock"},
  })
  if(run.error||run.signal||run.status!==0)
    throw Error("isolated_docker_command_failed")
  return run.stdout
}
function inspect(container,db,query){
  const result=execute("exec",container,"psql","-X","-A","-t",
    "-v","ON_ERROR_STOP=1","-U","agentstudio_admin","-d",db,
    "-c",query)
  return result.toString("utf8").trim()
}
function dbFingerprint(container,db){
  const tableNames=inspect(container,db,
    "SELECT tablename FROM pg_tables WHERE schemaname='agentstudio' ORDER BY tablename")
    .split(/\r?\n/).filter(Boolean)
  if(tableNames.length<20||
     tableNames.some(name=>!/^[a-z_][a-z0-9_]{0,120}$/.test(name)))
    throw Error("restore_source_schema_not_expected")
  const hashes=[]
  for(const table of tableNames){
    const quoted='"'+table+'"'
    const countAndHash=inspect(container,db,
      "SELECT COUNT(*)::text || '|' || "+
      "COALESCE(md5(string_agg(row_to_json(t)::text,'|' "+
      "ORDER BY row_to_json(t)::text)),md5('')) "+
      "FROM agentstudio."+quoted+" t")
    if(!/^[0-9]+\|[a-f0-9]{32}$/.test(countAndHash))
      throw Error("restore_source_fingerprint_invalid")
    hashes.push([table,countAndHash])
  }
  const forced=inspect(container,db,
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='agentstudio' AND c.relkind='r' "+
    "AND c.relrowsecurity AND c.relforcerowsecurity")
  const vector=inspect(container,db,
    "SELECT count(*) FROM pg_extension WHERE extname='vector'")
  if(Number(forced)<19||vector!=="1")
    throw Error("restore_security_schema_missing")
  return {tables:hashes,forced:Number(forced),vector}
}
export async function main(env=process.env,platform=process.platform){
  // Must refuse BEFORE connecting to Docker, writing files or making network calls.
  const {temp}=requireEphemeral(env,platform)
  const real=fs.realpathSync(temp)
  const current=fs.realpathSync(process.cwd())
  if(real!==temp||!fs.statSync(real).isDirectory()||
     real===current||real.startsWith(current+path.sep)||
     current.startsWith(real+path.sep))
    throw Error("unsafe_runner_temp")
  const candidates=execute("ps","--filter","ancestor=pgvector/pgvector:pg17",
    "--format","{{.ID}}").toString("utf8").trim().split(/\r?\n/).filter(Boolean)
  if(candidates.length!==1||!/^[0-9a-f]{12,64}$/.test(candidates[0]))
    throw Error("pg17_service_container_not_unique")
  const container=candidates[0]
  const guard=inspect(container,"agentstudio_stage",
    "SELECT current_database() || '|' || current_setting('server_version_num') "+
    "|| '|' || session_user || '|' || "+
    "(SELECT rolsuper::text FROM pg_roles WHERE rolname=session_user)")
  const pieces=guard.split("|")
  if(pieces.length!==4||pieces[0]!=="agentstudio_stage"||
     !(Number(pieces[1])>=170000&&Number(pieces[1])<180000)||
     pieces[2]!=="agentstudio_admin"||pieces[3]!=="true")
    throw Error("restore_not_isolated_pg17")
  if(inspect(container,"agentstudio_stage",
    "SELECT count(*) FROM pg_database WHERE datname='"+target+"'")!=="0")
    throw Error("restore_target_already_exists")
  const before=dbFingerprint(container,"agentstudio_stage")
  for(const [table,n] of [
    ["users","1"],["agent_specs","1"],
    ["legacy_user_imports","1"],["legacy_agent_imports","1"],
    ["jobs","0"],["runs","0"],["schedules","0"]
  ]){
    const x=before.tables.find(([name])=>name===table)
    if(!x||x[1].split("|")[0]!==n)
      throw Error("restore_fixture_missing_"+table)
  }
  const archive=path.join(real,
    "w14_pg17_"+env.GITHUB_RUN_ID+"_"+sha(env.GITHUB_SHA??"").slice(0,16)+".dump")
  let created=false
  try{
    // pg_dump lives INSIDE the same PostgreSQL17 service container as server:
    // no pg_dump v16->v17 version mismatch and no external DB endpoint.
    const buffer=execute("exec",container,"pg_dump",
      "-U","agentstudio_admin","-d","agentstudio_stage",
      "-Fc","--no-owner")
    if(buffer.length<1024||buffer.length>30*1024*1024)
      throw Error("restore_archive_size_unexpected")
    fs.writeFileSync(archive,buffer,{flag:"wx",mode:0o600})
    created=true
    if(fs.statSync(archive).mode&0o077)
      throw Error("restore_archive_permissions_invalid")
    execute("exec",container,"createdb",
      "-U","agentstudio_admin",target)
    const restore=spawnSync("docker",[
      "exec","-i",container,"pg_restore",
      "-U","agentstudio_admin","-d",target,
      "--no-owner","--exit-on-error","--single-transaction"
    ],{input:buffer,encoding:null,timeout:50000,maxBuffer:8*1024*1024,
      env:{PATH:process.env.PATH??"/usr/bin:/bin",
        HOME:process.env.HOME??"/tmp",
        DOCKER_HOST:"unix:///var/run/docker.sock"}})
    if(restore.error||restore.signal||restore.status!==0)
      throw Error("pg17_restore_into_new_db_failed")
    const after=dbFingerprint(container,target)
    if(JSON.stringify(before)!==JSON.stringify(after))
      throw Error("pg17_restore_fingerprint_mismatch")
    const sourceAgain=dbFingerprint(container,"agentstudio_stage")
    if(JSON.stringify(before)!==JSON.stringify(sourceAgain))
      throw Error("pg17_dump_modified_source")
    console.log("W14_PG17_RESTORE_PASS isolated=true "+
      "all_tables_hashed=true new_database_only=true cutover=NO-GO")
  }finally{
    if(created){
      const resolved=fs.realpathSync(archive)
      if(path.dirname(resolved)!==real||!path.basename(resolved).startsWith("w14_pg17_"))
        throw Error("restore_cleanup_target_invalid")
      fs.rmSync(resolved,{force:true})
    }
    // No DROP DATABASE; GitHub destroys its own disposable PG17 service.
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===
    fileURLToPath(import.meta.url)){
  main().catch(error=>{
    const safe=new Set([refused,"unsafe_runner_temp"])
    console.error("PG17 restore rehearsal refused: "+
      (safe.has(error?.message)?error.message:"pg17_restore_rehearsal_failed"))
    process.exitCode=1
  })
}
