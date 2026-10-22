// Prove the incremental migration upgrades a pre-model-connection staging
// baseline safely, then remains replay-safe. This is an isolated embedded DB.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schemaSource=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
const migrationSource=fs.readFileSync(
  path.join(root,"db/postgres/migrations/pg_v9_019_model_connections.sql"),"utf8")
function legacyBaseline(){
  const start=schemaSource.indexOf("-- Provider credentials are authenticated-encrypted")
  const end=schemaSource.indexOf("-- Approved, staging-only migration provenance",start)
  if(start<0||end<=start)throw Error("model_connection_schema_markers_missing")
  let legacy=schemaSource.slice(0,start)+schemaSource.slice(end)
  const currentPolicy="    'knowledge_bases','knowledge_documents','knowledge_chunks',\n    'model_connections','tool_connections','tool_connection_headers',\n    'template_invites','audit_events'"
  if(!legacy.includes(currentPolicy))throw Error("model_connection_rls_marker_missing")
  legacy=legacy.replace(currentPolicy,
    "    'knowledge_bases','knowledge_documents','knowledge_chunks',\n    'template_invites','audit_events'")
  // Reconstruct a pre-model-connection snapshot: fresh-schema broker
  // SELECT grants and RLS policy cannot target a table absent in V8.
  const startGrant=legacy.indexOf("-- Worker can become API role for existing run processing;")
  const endGrant=legacy.indexOf("-- The real API service MUST validate JWT signatures/",startGrant)
  if(startGrant<0||endGrant<startGrant)throw Error("broker_grant_markers_missing")
  legacy=legacy.slice(0,startGrant)+legacy.slice(endGrant)
  const startPolicy=legacy.indexOf("-- Owner only, SELECT-only, separate service role;")
  const endPolicy=legacy.indexOf("CREATE POLICY worker_job_queue",startPolicy)
  if(startPolicy<0||endPolicy<startPolicy)throw Error("broker_policy_markers_missing")
  legacy=legacy.slice(0,startPolicy)+legacy.slice(endPolicy)
  return legacy.split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
}
const migration=migrationSource.split(/\r?\n/)
  .filter(line=>!line.trim().startsWith("\\")).join("\n")
const brokerSql=fs.readFileSync(
  path.join(root,"db/postgres/migrations/pg_v9_020_model_credential_broker.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const toolSql=fs.readFileSync(
  path.join(root,"db/postgres/migrations/pg_v9_021_tool_connections.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")

test("incremental model connection migration upgrades old schema with owner RLS and no Worker grant",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec(legacyBaseline())
    const before=await db.query(
      "SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname='agentstudio'")
    assert.equal(before.rows[0].tables,20)
    await db.exec(migration)
    const verify=async()=>{
      const counts=(await db.query(
        "SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname='agentstudio') AS tables,"+
        "(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
        "WHERE n.nspname='agentstudio' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) AS rls,"+
        "(SELECT count(*)::int FROM agentstudio.schema_migrations WHERE version='pg_v9_019') AS ledger,"+
        "has_table_privilege('agentstudio_api','agentstudio.model_connections','SELECT') AS api_read,"+
        "has_table_privilege('agentstudio_worker','agentstudio.model_connections','SELECT') AS worker_read"
      )).rows[0]
      assert.deepEqual(counts,{
        tables:21,rls:20,ledger:1,api_read:true,worker_read:false
      })
      const policy=(await db.query(
        "SELECT cmd,roles,qual,with_check FROM pg_policies "+
        "WHERE schemaname='agentstudio' AND tablename='model_connections' "+
        "AND policyname='owner_model_connections'")).rows[0]
      assert.equal(policy.cmd,"ALL")
      assert.ok(policy.roles.some(role=>String(role)==="agentstudio_api"))
      assert.match(policy.qual,/owner_user_id/)
      assert.match(policy.qual,/actor_id/)
      assert.match(policy.with_check,/actor_id/)
    }
    await verify()
    // Reapplying is safe and does not duplicate the ledger or policy.
    await db.exec(migration)
    await verify()
    // A SECOND reviewed migration revokes API ciphertext SELECT even though
    // worker login remains a member of the API group for legacy run work.
    await db.exec(brokerSql)
    const role=async()=>(await db.query(
      "SELECT has_column_privilege('agentstudio_api',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS api,"+
      "has_column_privilege('agentstudio_model_broker',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS broker,"+
      "has_table_privilege('agentstudio_model_broker',"+
      "'agentstudio.model_connections','UPDATE') AS broker_write,"+
      "(SELECT count(*)::int FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_020') AS ledger"
    )).rows[0]
    assert.deepEqual(await role(),{api:false,broker:true,
      broker_write:false,ledger:1})
    await db.exec(brokerSql)
    assert.deepEqual(await role(),{api:false,broker:true,
      broker_write:false,ledger:1})
    await db.exec(toolSql)
    const toolCounts=(await db.query(
      "SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname='agentstudio') AS tables,"+
      "(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity) AS rls,"+
      "(SELECT count(*)::int FROM agentstudio.schema_migrations WHERE version='pg_v9_021') AS ledger,"+
      "has_column_privilege('agentstudio_api','agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS api_read,"+
      "has_column_privilege('agentstudio_worker','agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS worker_read,"+
      "has_column_privilege('agentstudio_model_broker','agentstudio.tool_connection_headers','value_ciphertext','SELECT') AS broker_read,"+
      "has_table_privilege('agentstudio_model_broker','agentstudio.tool_connection_headers','UPDATE') AS broker_write"
    )).rows[0]
    assert.deepEqual(toolCounts,{
      tables:23,rls:22,ledger:1,api_read:false,worker_read:false,
      broker_read:true,broker_write:false,
    })
    await db.exec(toolSql)
    const repeated=(await db.query(
      "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_021'")).rows[0]
    assert.equal(repeated.n,1)
  }finally{await db.close()}
})
