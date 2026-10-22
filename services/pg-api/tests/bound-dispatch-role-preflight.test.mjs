// Real embedded PostgreSQL privilege SQL; server TCP identity is synthetic.
// This cannot certify a live PG18 login or target-host deployment.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {verifyBoundDispatchRole} from "../src/bound-dispatch-role-preflight.ts"

const sql=name=>readFileSync(new URL("../../../db/postgres/"+name,import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const target={mode:"baota_pg18",host:"127.0.0.1",port:5333,
  database:"agent_studio",user:"agentstudio_stage_login",expectedMajor:18}
const login={api:"agentstudio_stage_login",identity:"agentstudio_bound_dispatch_login",
  broker:"agentstudio_model_broker_login"}
const group={api:"agentstudio_api",identity:"agentstudio_bound_dispatch",broker:"agentstudio_model_broker"}

test("private Broker preflight validates actual isolated role grants and rejects transitive or direct privilege leaks",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec(sql("001_stage_schema.sql"))
    await pg.exec("CREATE SCHEMA agentstudio_auth; REVOKE ALL ON SCHEMA agentstudio_auth FROM PUBLIC")
    await pg.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_023','synthetic predecessor')")
    await pg.exec(sql("migrations/pg_v9_024_bound_dispatch_identity.sql"))
    for(const kind of Object.keys(login))await pg.exec(
      "CREATE ROLE "+login[kind]+" LOGIN NOINHERIT; GRANT "+group[kind]+" TO "+login[kind])
    const seen=[]
    const check=async(kind)=>{
      await pg.exec("SET SESSION AUTHORIZATION "+login[kind])
      const pool={async connect(){return {
        async query(statement,values=[]){
          seen.push(statement)
          if(statement.includes("current_setting('server_version_num')"))return {rows:[{
            db:"agent_studio",serverVersion:180001,serverPort:5333,serverAddress:"127.0.0.1",
            login:login[kind],superuser:false,bypassrls:false,
          }]}
          return pg.query(statement,values)
        },release(){},
      }}}
      try{await verifyBoundDispatchRole(pool,target,kind)}
      // PGlite keeps the selected identity as RESET's default; explicitly
      // restore its original synthetic administrator between test sessions.
      finally{await pg.exec("RESET ROLE; SET SESSION AUTHORIZATION postgres")}
    }
    for(const kind of Object.keys(login))await check(kind)
    // No capability flags are enabled here. Installed optional schemas must
    // still participate in the general private-service startup boundary.
    for(const migration of ["025_workflow_model_identity","026_workflow_tool_identity","027_workflow_agent_identity","028_autonomous_agent_identity","029_mcp_connections","030_mcp_tool_identity","031_smithery_managed"])
      await pg.exec(sql("migrations/pg_v9_"+migration+".sql"))
    for(const kind of Object.keys(login))await check(kind)
    for(const [grant,revoke,kind] of [
      ["SELECT(value_nonce) ON agentstudio.mcp_connection_headers TO agentstudio_api","SELECT(value_nonce) ON agentstudio.mcp_connection_headers FROM agentstudio_api","api"],
      ["SELECT(api_key_tag) ON agentstudio.smithery_credentials TO agentstudio_stage_login","SELECT(api_key_tag) ON agentstudio.smithery_credentials FROM agentstudio_stage_login","api"],
      ["SELECT(namespace) ON agentstudio.smithery_connections TO agentstudio_bound_dispatch","SELECT(namespace) ON agentstudio.smithery_connections FROM agentstudio_bound_dispatch","identity"],
      ["UPDATE(key_tail) ON agentstudio.smithery_credentials TO agentstudio_model_broker","UPDATE(key_tail) ON agentstudio.smithery_credentials FROM agentstudio_model_broker","broker"],
    ]){
      await pg.exec("GRANT "+grant);await assert.rejects(check(kind),/unsafe_bound_dispatch_database_role/)
      await pg.exec("REVOKE "+revoke);await check(kind)
    }
    await pg.exec("ALTER TABLE agentstudio.smithery_connections NO FORCE ROW LEVEL SECURITY")
    await assert.rejects(check("api"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("ALTER TABLE agentstudio.smithery_connections FORCE ROW LEVEL SECURITY")
    await check("api")
    await pg.exec("GRANT pg_read_server_files TO agentstudio_bound_dispatch_login")
    await assert.rejects(check("identity"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("REVOKE pg_read_server_files FROM agentstudio_bound_dispatch_login")
    await pg.exec("GRANT agentstudio_model_broker TO agentstudio_stage_login")
    await assert.rejects(check("api"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("REVOKE agentstudio_model_broker FROM agentstudio_stage_login")
    await pg.exec("GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_api")
    await assert.rejects(check("api"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_api")
    await check("api")
    await pg.exec("GRANT USAGE ON SCHEMA agentstudio_auth TO agentstudio_model_broker")
    await assert.rejects(check("broker"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("REVOKE USAGE ON SCHEMA agentstudio_auth FROM agentstudio_model_broker")
    await check("broker")
    await pg.exec("ALTER TABLE agentstudio.model_connections NO FORCE ROW LEVEL SECURITY")
    await assert.rejects(check("broker"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("ALTER TABLE agentstudio.model_connections FORCE ROW LEVEL SECURITY")
    await check("broker")
    await pg.exec("ALTER ROLE agentstudio_model_broker CREATEROLE")
    await assert.rejects(check("broker"),/unsafe_bound_dispatch_database_role/)
    await pg.exec("ALTER ROLE agentstudio_model_broker NOCREATEROLE")
    await check("broker")
    assert.ok(seen.includes("BEGIN READ ONLY"))
    assert.ok(seen.includes("ROLLBACK"))
    assert.equal(seen.some(q=>/^\s*(INSERT|UPDATE|DELETE|GRANT|ALTER|CREATE)\b/i.test(q)),false)
  }finally{await pg.close()}
})
