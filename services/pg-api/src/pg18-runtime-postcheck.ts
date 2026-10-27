// Phase-specific metadata inspection. The caller owns a read-only transaction.
import type {SqlClient} from "./contracts.ts"
import {captureFreshRuntimeSources,freshRuntimeRoles} from "./pg18-fresh-runtime-source.mjs"
import {verifyFreshRuntime} from "./pg18-fresh-runtime-install.ts"
import {inspectRuntimeServiceCatalog} from "./pg18-service-login-inspector.ts"
import {serviceLoginKinds,serviceLogins} from "./pg18-service-login-policy.mjs"

export const runtimePreparationStages=["initialized","native-login","first-admin","service-logins"] as const
export type RuntimePreparationStage=typeof runtimePreparationStages[number]
type Snapshot=ReturnType<typeof captureFreshRuntimeSources>
export function checkedRuntimePreparationStage(value:unknown):RuntimePreparationStage{
  if(typeof value!=="string"||!(runtimePreparationStages as readonly string[]).includes(value))throw Error("invalid_runtime_postcheck_stage")
  return value as RuntimePreparationStage
}
function refuse():never{throw Error("runtime_preparation_stage_not_verified")}
export async function inspectRuntimePreparationStage(db:SqlClient,snapshot:Snapshot,stage:RuntimePreparationStage){
  checkedRuntimePreparationStage(stage)
  const transaction=(await db.query<{readonly:string;isolation:string}>("SELECT current_setting('transaction_read_only') AS readonly,current_setting('transaction_isolation') AS isolation")).rows[0]
  if(transaction?.readonly!=="on"||transaction.isolation!=="repeatable read")throw Error("runtime_postcheck_readonly_snapshot_required")
  const initialized=stage==="initialized",hasAdmin=stage==="first-admin"||stage==="service-logins",services=stage==="service-logins"
  const state=await inspectRuntimeServiceCatalog(db,snapshot,!initialized)
  const optional=serviceLoginKinds.filter(k=>!["api","worker"].includes(k)).map(k=>serviceLogins[k].login)
  const expectedRoles=freshRuntimeRoles.length+(services?optional.length:0)
  if(state.roles.size!==expectedRoles||state.receipts.length!==(services?serviceLoginKinds.length:0))refuse()
  for(const kind of serviceLoginKinds){const role=state.roles.get(serviceLogins[kind].login)
    if(services?(!role?.login||!role.scram):Boolean(role?.login))refuse()
  }
  if(initialized)await verifyFreshRuntime(db,snapshot,true)
  else for(const fullName of snapshot.tables){
    if(fullName==="agentstudio.schema_migrations"||hasAdmin&&["agentstudio.users","agentstudio_auth.accounts"].includes(fullName))continue
    const [schema,name]=fullName.split(".")
    if((await db.query<{empty:boolean}>('SELECT NOT EXISTS(SELECT 1 FROM "'+schema+'"."'+name+'") AS empty')).rows[0]?.empty!==true)refuse()
  }
  if(hasAdmin){
    const admin=(await db.query<{verified:boolean}>("SELECT (SELECT count(*) FROM agentstudio.users)=1 AND "+
      "(SELECT count(*) FROM agentstudio_auth.accounts)=1 AND EXISTS(SELECT 1 FROM agentstudio_auth.accounts a JOIN agentstudio.users u ON u.id=a.user_id "+
      "WHERE a.enabled AND a.is_admin AND a.failed_attempts=0 AND a.locked_until IS NULL AND u.status='active' "+
      "AND u.external_issuer='urn:agentstudio:local:v1') AS verified")).rows[0]
    if(admin?.verified!==true)refuse()
  }
  return {stage,scope:"database_preparation_stage_only",stage_verified:true,source_sha256:snapshot.source_sha256,
    tables:snapshot.tables.length,forced_rls_tables:snapshot.tables.length-1,source_versions:snapshot.versions.length,
    initialization_receipts:1,service_activation_receipts:state.receipts.length,enabled_service_logins:services?serviceLoginKinds.length:0,
    native_login_enabled:!initialized,local_admins:hasAdmin?1:0,sessions:0,read_only:true,writes_performed:false,production_cutover_allowed:false}
}
