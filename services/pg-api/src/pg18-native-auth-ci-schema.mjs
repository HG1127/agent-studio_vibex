// CI-only translator for the REVIEWED production PG18 Native Auth schema.
// Substitute ONLY the database/port/admin login of this disposable job.
// Everything else, including PG18, roles, RLS, policy and vector guards,
// remains byte-for-byte unchanged. No network, passwords or DDL execution.
import {readFileSync} from "node:fs"
import {createHash} from "node:crypto"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const substitutions=[
  ["current_database() <> 'agent_studio'",
   "current_database() <> 'agentstudio_pg18_ci'"],
  ["current_setting('port')::integer <> 5333",
   "current_setting('port')::integer <> 5432"],
  ["session_user <> 'postgres'",
   "session_user <> 'agentstudio_admin'"],
  ["GRANT CONNECT ON DATABASE agent_studio TO agentstudio_native_login;",
   "GRANT CONNECT ON DATABASE agentstudio_pg18_ci TO agentstudio_native_login;"],
]
export function loadNativeAuthPg18CiSchema(){
  const original=readFileSync(path.join(root,
    "db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
  for(const needle of [
    "CREATE ROLE agentstudio_native_auth NOLOGIN",
    "CREATE TABLE agentstudio_auth.accounts",
    "CREATE TABLE agentstudio_auth.sessions",
    "CREATE POLICY native_auth_insert_local_users",
    "CREATE POLICY native_auth_verified_local_users",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "current_setting('server_version_num')::int < 180000",
    "current_setting('server_version_num')::int >= 190000",
    "(SELECT extversion FROM pg_extension WHERE extname='vector') IS DISTINCT FROM '0.8.7'",
    "NOT pg_has_role('agentstudio_stage_login','agentstudio_api','member')",
    "COMMIT;"
  ])if(!original.includes(needle))throw Error("pg18_native_auth_ci_schema_contract_changed")
  let sql=original
  for(const [before,after] of substitutions){
    if(sql.split(before).length!==2)
      throw Error("pg18_native_auth_ci_substitution_not_unique")
    sql=sql.replace(before,after)
  }
  if(/\b(?:DROP|TRUNCATE)\s+(?:DATABASE|SCHEMA|TABLE)\b/i.test(sql)||
     sql.includes("current_setting('server_version_num')::int < 180000")===false)
    throw Error("pg18_native_auth_ci_schema_unsafe")
  return Object.freeze({sql,
    originalSha256:createHash("sha256").update(original).digest("hex"),
    ci_only:true,production_cutover_allowed:false})
}
