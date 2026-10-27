// Only the outer, exact-target fresh initializer owns BEGIN/COMMIT/ROLLBACK.
import type {SqlClient} from "./contracts.ts"
import {captureFreshRuntimeSources,freshRuntimeReceipt,freshRuntimeRoles} from "./pg18-fresh-runtime-source.mjs"
import {verifyKnowledgeHelperCredentials} from "./knowledge-content-privileges.ts"
import {verifyAgentMemoryCredentials} from "./agent-memory-audit.ts"
import {verifyAgentMemoryContextCredentials} from "./agent-memory-context-audit.ts"
import {checkedServiceLoginReceipt} from "./pg18-service-login-policy.mjs"
type Snapshot=ReturnType<typeof captureFreshRuntimeSources>
function refuse():never{throw Error("fresh_runtime_verification_failed")}
export async function verifyRuntimeSchemaReceipt(db:SqlClient,snapshot:Snapshot,receipt=true,allowServiceReceipts=false){
  const expected=[...snapshot.versions,...(receipt?[freshRuntimeReceipt]:[])].sort()
  const records=(await db.query<{version:string;description:string}>("SELECT version,description FROM agentstudio.schema_migrations ORDER BY version")).rows
  const serviceReceipts=allowServiceReceipts?records.filter(r=>r.version.startsWith("pg18_service_login_")).map(r=>checkedServiceLoginReceipt(r.version,r.description,snapshot.source_sha256)):[]
  if(serviceReceipts.length)expected.push(...records.filter(r=>r.version.startsWith("pg18_service_login_")).map(r=>r.version))
  expected.sort()
  const versions=records.map(r=>r.version)
  if(JSON.stringify(versions)!==JSON.stringify(expected))refuse()
  const tables=(await db.query<{schema:string;name:string;enabled:boolean;forced:boolean}>("SELECT n.nspname AS schema,c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname")).rows
  if(JSON.stringify(tables.map(t=>t.schema+"."+t.name))!==JSON.stringify(snapshot.tables)||
    tables.some(t=>t.name==="schema_migrations"?(t.enabled||t.forced):(!t.enabled||!t.forced)))refuse()
  if(receipt&&records.find(r=>r.version===freshRuntimeReceipt)?.description!==freshRuntimeReceiptBody(snapshot))refuse()
  return {tables,serviceReceipts}
}
export async function verifyFreshRuntime(db:SqlClient,snapshot:Snapshot,receipt=false){
  const {tables}=await verifyRuntimeSchemaReceipt(db,snapshot,receipt)
  for(const table of tables){if(table.name==="schema_migrations")continue
    const name='"'+table.schema+'"."'+table.name+'"'
    if((await db.query<{ok:boolean}>("SELECT NOT EXISTS(SELECT 1 FROM "+name+") AS ok")).rows[0]?.ok!==true)refuse()
  }
  const roles=(await db.query<{name:string;safe:boolean}>("SELECT rolname AS name,NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND "+
    "NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AS safe FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])",[freshRuntimeRoles])).rows
  if(roles.length!==freshRuntimeRoles.length||roles.some(r=>!r.safe))refuse()
  const memberships=(await db.query<{child:string;parent:string}>("SELECT c.rolname AS child,p.rolname AS parent FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles c ON c.oid=m.member "+
    "JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE c.rolname=ANY($1::text[]) OR p.rolname=ANY($1::text[]) ORDER BY c.rolname,p.rolname",[freshRuntimeRoles])).rows.map(r=>r.child+":"+r.parent)
  if(JSON.stringify(memberships)!==JSON.stringify(["agentstudio_native_login:agentstudio_native_auth","agentstudio_stage_login:agentstudio_api","agentstudio_stage_worker:agentstudio_api","agentstudio_stage_worker:agentstudio_worker"]))refuse()
  for(const role of ["agentstudio_api","agentstudio_worker","agentstudio_stage_login","agentstudio_stage_worker","agentstudio_bound_dispatch","agentstudio_native_auth"]){
    const safe=(await db.query<{ok:boolean}>("SELECT NOT has_column_privilege($1,'agentstudio.model_connections','api_key_ciphertext','SELECT') AND "+
      "NOT has_column_privilege($1,'agentstudio.model_connections','api_key_nonce','SELECT') AND NOT has_column_privilege($1,'agentstudio.model_connections','api_key_tag','SELECT') AND "+
      "NOT has_column_privilege($1,'agentstudio.tool_connection_headers','value_ciphertext','SELECT') AND "+
      "NOT has_column_privilege($1,'agentstudio.tool_connection_headers','value_nonce','SELECT') AND NOT has_column_privilege($1,'agentstudio.tool_connection_headers','value_tag','SELECT') AS ok",[role])).rows[0]
    if(!safe?.ok)refuse()
  }
  await db.query("SET LOCAL ROLE agentstudio_api")
  try{await verifyKnowledgeHelperCredentials(db);if(!await verifyAgentMemoryCredentials(db)||!await verifyAgentMemoryContextCredentials(db))refuse()}finally{await db.query("RESET ROLE")}
  return {tables:tables.length,forced_rls_tables:tables.length-1,empty_business_tables:tables.length-1,migration_versions:snapshot.versions.length,
    roles:roles.length,service_logins_enabled:false,knowledge_privileges_verified:true,memory_privileges_verified:true,production_cutover_allowed:false}
}
export function freshRuntimeReceiptBody(snapshot:Snapshot){return JSON.stringify({format:"pg18_fresh_runtime_v1",source_sha256:snapshot.source_sha256,
  sources:snapshot.sources,latest_migration:"pg_v9_050",legacy_rows_copied:0,legacy_import_versions_fabricated:false})}
export async function installFreshRuntime(db:SqlClient,snapshot:Snapshot){
  // Role changes and all DDL share the baseline's transaction. An initialization
  // failure cannot leave a service login enabled or a partial schema committed.
  await db.query("ALTER ROLE agentstudio_stage_login NOLOGIN; ALTER ROLE agentstudio_stage_worker NOLOGIN")
  for(const step of snapshot.steps)await db.query(step.sql)
  const verification=await verifyFreshRuntime(db,snapshot)
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES($1,$2)",[freshRuntimeReceipt,freshRuntimeReceiptBody(snapshot)])
  await verifyFreshRuntime(db,snapshot,true)
  return verification
}
