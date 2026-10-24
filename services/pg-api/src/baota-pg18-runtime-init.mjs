#!/usr/bin/env node
// Explicit full source initialization of an already-created EMPTY PG18 DB.
// No database creation, legacy import, login activation, service or cutover.
import path from "node:path"
import {fileURLToPath} from "node:url"
import {initializeFreshPg18Baseline} from "./baota-pg18-fresh-init.mjs"
import {captureFreshRuntimeSources,freshRuntimePlan} from "./pg18-fresh-runtime-source.mjs"
import {installFreshRuntime} from "./pg18-fresh-runtime-install.ts"
const here=fileURLToPath(import.meta.url)
export async function runRuntimeInit(argv,env=process.env){
  const planOnly=argv.length===1&&argv[0]==="--plan"
  if(!planOnly&&(argv.length!==5||argv[0]!=="--execute"||argv[1]!=="--confirm-empty-database"||argv[2]!=="agent_studio"||argv[3]!=="--expected-source-sha256"||!/^[a-f0-9]{64}$/.test(argv[4])))
    throw Error("invalid_runtime_init_arguments")
  const snapshot=captureFreshRuntimeSources(),plan=freshRuntimePlan(snapshot)
  if(planOnly)return plan
  if(argv[4]!==snapshot.source_sha256)throw Error("runtime_init_source_changed")
  if(env.AGENT_STUDIO_PG18_RUNTIME_INIT_APPROVED!=="APPROVE_EMPTY_PG18_RUNTIME_INIT_ONLY"||env.AGENT_STUDIO_BAOTA_PG_ADMIN_USER!=="postgres")
    throw Error("runtime_init_not_approved")
  const result=await initializeFreshPg18Baseline(env,snapshot.baseline,async(db,baselineVerification)=>({baseline_verification:baselineVerification,verification:await installFreshRuntime(db,snapshot)}))
  return {...plan,...result,mode:"fresh_runtime_init",initialized:true,network_used:true}
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
  try{process.stdout.write(JSON.stringify(await runRuntimeInit(process.argv.slice(2)))+"\n")}
  catch(error){const message=error instanceof Error?error.message:"",allowed=new Set(["invalid_runtime_init_arguments","runtime_init_source_changed","runtime_init_not_approved",
    "baota_init_disabled","baota_linux_only","unsafe_baota_target","ambient_pg_configuration_forbidden","external_secret_file_required","private_secret_file_required","invalid_secret_file",
    "invalid_pg18_admin_target","pgvector_unavailable","agentstudio_schema_exists","nonempty_database","global_role_collision","schema_or_role_verification_failed",
    "role_grants_missing","secrets_not_independent","service_role_password_not_scram","fresh_runtime_verification_failed","fresh_runtime_sql_format_changed"])
    process.stderr.write("pg18_runtime_init_refused:"+(allowed.has(message)?message:"initialization_failed")+"\n");process.exitCode=1
  }
}
