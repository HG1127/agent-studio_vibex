#!/usr/bin/env node
// Read-only phase evidence. No activation, remediation, service start or GO.
import path from "node:path"
import {fileURLToPath} from "node:url"
import {captureFreshRuntimeSources,freshRuntimeRoles} from "./pg18-fresh-runtime-source.mjs"
import {serviceLoginKinds,serviceLogins,serviceLoginTargetGuardSql} from "./pg18-service-login-policy.mjs"
import {readPg18OperatorSecret,verifyPg18ServiceHbaOrder} from "./native-activation-cli.mjs"
import {checkedRuntimePreparationStage,inspectRuntimePreparationStage} from "./pg18-runtime-postcheck.ts"
const here=fileURLToPath(import.meta.url)
export function parseRuntimePostcheck(argv,env=process.env,platform=process.platform,uid=process.getuid?.()){
  if(!["--plan","--preflight"].includes(argv[0])||argv[1]!=="--stage")throw Error("invalid_runtime_postcheck_arguments")
  const stage=checkedRuntimePreparationStage(argv[2]),mode=argv[0].slice(2)
  if(mode==="plan"&&argv.length===3)return {mode,stage,network_used:false,read_only:true,production_cutover_allowed:false}
  if(mode!=="preflight"||argv.length!==7||argv[3]!=="--confirm-database"||argv[4]!=="agent_studio"||argv[5]!=="--expected-source-sha256"||!/^[a-f0-9]{64}$/.test(argv[6]))
    throw Error("invalid_runtime_postcheck_arguments")
  if(platform!=="linux"||uid!==0||env.AGENT_STUDIO_PG18_RUNTIME_POSTCHECK_ENABLED!=="true"||Object.keys(env).some(k=>k==="DATABASE_URL"||/^PG[A-Z_]/.test(k)))
    throw Error("runtime_postcheck_disabled")
  return {mode,stage,expected_source_sha256:argv[6],read_only:true,production_cutover_allowed:false}
}
export async function collectRuntimePreparationEvidence(db,snapshot,stage){
  checkedRuntimePreparationStage(stage)
  await db.query(serviceLoginTargetGuardSql)
  const report=await inspectRuntimePreparationStage(db,snapshot,stage)
  const hbaChecked=stage!=="initialized",required=["agentstudio_native_login",...(stage==="service-logins"?serviceLoginKinds.map(k=>serviceLogins[k].login):[])]
  if(hbaChecked){
    const rules=(await db.query("SELECT rule_number,type,database,user_name,address,netmask,auth_method,error FROM pg_hba_file_rules ORDER BY rule_number")).rows
    for(const login of required){const check=verifyPg18ServiceHbaOrder(rules,login);if(!check.local||!check.tcp)throw Error("runtime_postcheck_hba_not_ready")}
  }
  const names=[...new Set([...freshRuntimeRoles,...serviceLoginKinds.map(k=>serviceLogins[k].login)])]
  const connected=(await db.query("SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity WHERE usename=ANY($1::text[]) AND pid<>pg_backend_pid()",[names])).rows[0]
  if(connected?.count!==0)throw Error("runtime_postcheck_connections_present")
  return {...report,hba_checked:hbaChecked,hba_verified:hbaChecked,service_connections_absent:true,starts_services:false}
}
export async function inspectRuntimePreparationWithPool(pool,snapshot,stage){
  checkedRuntimePreparationStage(stage)
  const db=await pool.connect()
  let begun=false
  try{
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");begun=true
    try{return await collectRuntimePreparationEvidence(db,snapshot,stage)}finally{await db.query("ROLLBACK");begun=false}
  }finally{if(begun)await db.query("ROLLBACK").catch(()=>{});db.release()}
}
export async function runRuntimePostcheck(argv,env=process.env){
  const cfg=parseRuntimePostcheck(argv,env),snapshot=captureFreshRuntimeSources()
  if(cfg.mode==="plan")return {...cfg,scope:"database_preparation_stage_only",database:"agent_studio",host:"127.0.0.1",port:5333,postgres_major:18,
    source_sha256:snapshot.source_sha256,starts_services:false,writes_performed:false}
  if(cfg.expected_source_sha256!==snapshot.source_sha256)throw Error("runtime_postcheck_source_changed")
  const admin=readPg18OperatorSecret(env.AGENT_STUDIO_PG18_RUNTIME_POSTCHECK_ADMIN_PASSWORD_FILE)
  const {Pool}=await import("pg"),pool=new Pool({host:"127.0.0.1",port:5333,database:"agent_studio",user:"postgres",password:admin.password,ssl:false,
    options:"-c default_transaction_read_only=on",max:1,connectionTimeoutMillis:5000,statement_timeout:15000})
  try{return {mode:cfg.mode,...await inspectRuntimePreparationWithPool(pool,snapshot,cfg.stage),network_used:true}}finally{await pool.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  try{process.stdout.write(JSON.stringify(await runRuntimePostcheck(process.argv.slice(2)))+"\n")}
  catch(error){const code=error instanceof Error?error.message:"",known=new Set(["invalid_runtime_postcheck_arguments","invalid_runtime_postcheck_stage","runtime_postcheck_disabled",
    "runtime_postcheck_source_changed","private_secret_file_required","invalid_secret_format","runtime_postcheck_readonly_snapshot_required","runtime_preparation_stage_not_verified",
    "unsafe_service_login_catalog","native_auth_activation_required_first","native_auth_login_must_remain_disabled","fresh_runtime_verification_failed","invalid_service_login_receipt",
    "runtime_postcheck_hba_not_ready","runtime_postcheck_connections_present","service_login_target_not_approved"])
    process.stderr.write("PG18_RUNTIME_POSTCHECK_REFUSED:"+(known.has(code)?code:"runtime_postcheck_refused")+"\n");process.exitCode=1
  }
}
