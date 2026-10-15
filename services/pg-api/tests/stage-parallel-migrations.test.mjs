// V8.4 integration contract: independently developed migration scripts can be
// replayed onto the same EMPTY stage schema without cross-domain conflicts.
// Uses PGlite SQL engine, NEVER an existing or production PostgreSQL instance.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=(file)=>readFileSync(path.join(root,file),"utf8")
  .split(/\r?\n/).filter(x=>!x.trim().startsWith("\\")).join("\n")
const migrationFiles=[
  "db/postgres/migrations/pg_v8_006_legacy_workflow_import.sql",
  "db/postgres/migrations/pg_v8_007_legacy_kb_import.sql",
  "db/postgres/migrations/pg_v8_008_legacy_schedule_import.sql",
  "db/postgres/migrations/pg_v8_009_legacy_collaboration_import.sql",
  "db/postgres/migrations/pg_v8_010_legacy_kb_content.sql",
  "db/postgres/migrations/pg_v8_011_legacy_user_provision.sql",
  "db/postgres/migrations/pg_v8_013_legacy_kb_embedding_state.sql",
  "db/postgres/migrations/pg_v9_014_legacy_workflow_history.sql",
  "db/postgres/migrations/pg_v8_012_legacy_run_history.sql",
]
test("parallel domain migrations converge to one consistent schema and read-only stage verification",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec(sql("db/postgres/001_stage_schema.sql"))
    const dbname=(await pg.query("SELECT current_database() AS db")).rows[0].db
    assert.ok(/^[a-z_][a-z0-9_]*$/.test(dbname))
    const prepare=file=>sql(file)
      .replaceAll("current_database()<>'agentstudio_stage'",
        "current_database()<>'"+dbname+"'")
      // PGlite is PostgreSQL SQL but not necessarily server major v17.
      // Production SQL retains its mandatory real PostgreSQL 17 guard.
      .replaceAll("session_user<>'agentstudio_admin'","false")
      .replaceAll("current_user<>'agentstudio_admin'","false")
      .replaceAll("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",
        "false")
    for(const file of migrationFiles){
      const command=prepare(file)
      await pg.exec(command)
      await pg.exec(command)
    }
    const result=await pg.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='agentstudio'")
    assert.equal(result.rows[0].n,34)
    const rls=await pg.query(
      "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n "+
      "ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' "+
      "AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")
    assert.equal(rls.rows[0].n,33)
    const policies=await pg.query(
      "SELECT count(*)::int AS n FROM pg_policies "+
      "WHERE schemaname='agentstudio'")
    assert.equal(policies.rows[0].n,22)
    for(const [migration,table] of [
      ["pg_v8_006","legacy_workflow_imports"],
      ["pg_v8_007","legacy_knowledge_base_imports"],
      ["pg_v8_008","legacy_schedule_imports"],
      ["pg_v8_009","legacy_collaboration_imports"],
      ["pg_v8_010","legacy_kb_content_snapshots"],
      ["pg_v8_010","legacy_kb_document_archive"],
      ["pg_v8_010","legacy_kb_chunk_archive"],
      ["pg_v8_010","legacy_kb_vector_archive"],
      ["pg_v8_011","legacy_user_imports"],
      ["pg_v9_014","legacy_workflow_history"],
      ["pg_v8_013","legacy_kb_embedding_snapshots"],
      ["pg_v8_013","legacy_kb_embedding_base_refs"],
      ["pg_v8_013","legacy_kb_embedding_state_archive"],
      ["pg_v8_012","legacy_run_history"],
    ]){
      assert.equal((await pg.query(
        "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
        "WHERE version=$1",[migration])).rows[0].n,1)
      const rights=await pg.query(
        "SELECT has_table_privilege('agentstudio_api',$1,'SELECT') AS api,"+
        "has_table_privilege('agentstudio_worker',$1,'INSERT') AS worker",
        ["agentstudio."+table])
      assert.equal(rights.rows[0].api,false)
      assert.equal(rights.rows[0].worker,false)
    }
    const audit=prepare("db/postgres/010_verify_stage.sql")
    await pg.exec(audit)
    // No records are inserted except the immutable schema migration ledger.
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.agent_specs")).rows[0].n,0)
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.knowledge_bases")).rows[0].n,0)
  }finally{await pg.close()}
})
