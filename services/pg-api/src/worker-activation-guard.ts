// Dedicated PostgreSQL Worker launch gate. It cannot start any HTTP listener,
// DB transaction, model/tool call or PocketBase background process by itself.
export const PG18_WORKER_TRIAL_APPROVAL =
  "APPROVE_ISOLATED_PG18_WORKER_TRIAL_ONLY"
export function assertPg18WorkerCredentialBinding(
  env:NodeJS.ProcessEnv,kind:"prepare"|"model"|"workflow",
  uid=process.getuid?.(),
):void{
  if(env.AGENT_STUDIO_PG_BAOTA18_ENABLED!=="true")return
  const service=kind==="prepare"?"agentstudio-pg18-prepare.service":
    kind==="model"?"agentstudio-pg18-model.service":"agentstudio-pg18-workflow.service"
  const directory="/run/credentials/"+service
  if(!Number.isInteger(uid)||uid===0||
     env.CREDENTIALS_DIRECTORY!==directory||
     env.AGENT_STUDIO_PG_WORKER_PASSWORD_FILE!==directory+"/worker.secret")
    throw Error("pg18_worker_credential_binding_required")
}


export function pgWorkerOfflinePlan(kind:"prepare"|"model"|"workflow"){
  return {
    mode:"plan",
    worker:kind,
    runtime:"postgresql_stage_only",
    pg18_allowed_only_with_explicit_opt_in:true,
    localhost_only:true,
    network_used:false,
    db_writes_performed:false,
    worker_started:false,
    external_model_calls:false,
    pocketbase_unchanged:true,
    production_cutover_allowed:false,
  }
}
export function assertPgWorkerActivation(
  env:NodeJS.ProcessEnv,
  args:string[],
  platform=process.platform,
  uid=process.getuid?.(),
):void{
  if(args.length!==1||args[0]!=="--serve")
    throw Error("pg_worker_explicit_serve_required")
  if(env.AGENT_STUDIO_PG_BAOTA18_ENABLED==="true"&&
     (platform!=="linux"||!Number.isInteger(uid)||uid===0||
      env.AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED!=="true"||
      env.AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED!==
      PG18_WORKER_TRIAL_APPROVAL))
    throw Error("pg18_worker_not_approved")
}
