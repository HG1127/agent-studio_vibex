// Real PostgreSQL WASM privilege test using the actual stage-login SQL.
// Reduced schema fixture avoids allocating the full pgvector index on
// memory-constrained Windows development machines. Does NOT replace the full
// PostgreSQL 17 staging parity and all-table permission tests.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const load=relative=>fs.readFileSync(path.join(root,relative),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")

const lowMemory=process.platform==="win32" && os.freemem()<650*1024*1024
test("staging role bootstrap from actual SQL prevents privilege escalation",{
  skip:lowMemory?"Insufficient free Windows memory for even the reduced PostgreSQL engine":undefined,
},async()=>{
  const pg=await PGlite.create()
  try{
    const schema=load("db/postgres/001_stage_schema.sql")
    const functionSql=schema.match(/CREATE FUNCTION agentstudio\.identity_user_id\([\s\S]*?\$identity\$;/)?.[0]
    assert.ok(functionSql,"Identity resolver must match production schema")
    // Minimal real PG fixture: only tables needed for DB role + RLS security.
    await pg.exec([
      "CREATE SCHEMA agentstudio;",
      "CREATE ROLE agentstudio_api NOLOGIN NOINHERIT;",
      "CREATE TABLE agentstudio.users("+
        "id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"+
        "external_issuer text NOT NULL, external_subject text NOT NULL,"+
        "status text NOT NULL DEFAULT 'active');",
      "CREATE TABLE agentstudio.agent_specs("+
        "id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"+
        "owner_user_id uuid NOT NULL REFERENCES agentstudio.users(id),"+
        "name text NOT NULL, spec jsonb NOT NULL);",
      "GRANT USAGE ON SCHEMA agentstudio TO agentstudio_api;",
      "GRANT SELECT,INSERT,UPDATE,DELETE ON agentstudio.agent_specs TO agentstudio_api;",
      "GRANT SELECT ON agentstudio.users TO agentstudio_api;",
      "CREATE FUNCTION agentstudio.actor_id() RETURNS uuid "+
        "LANGUAGE sql STABLE AS $actor$ SELECT NULLIF("+
        "current_setting('agentstudio.actor_id',true),'')::uuid $actor$;",
      "GRANT EXECUTE ON FUNCTION agentstudio.actor_id() TO agentstudio_api;",
      functionSql,
      "REVOKE ALL ON FUNCTION agentstudio.identity_user_id(text,text) FROM PUBLIC;",
      "GRANT EXECUTE ON FUNCTION agentstudio.identity_user_id(text,text) TO agentstudio_api;",
      "ALTER TABLE agentstudio.agent_specs ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE agentstudio.agent_specs FORCE ROW LEVEL SECURITY;",
      "CREATE POLICY owner_agent_specs ON agentstudio.agent_specs "+
        "TO agentstudio_api USING(owner_user_id=agentstudio.actor_id()) "+
        "WITH CHECK(owner_user_id=agentstudio.actor_id());",
    ].join("\n"))

    const original=load("db/postgres/011_stage_api_login.sql")
    const dbName=String((await pg.query("SELECT current_database() AS name")).rows[0].name)
    assert.match(dbName,/^[a-z_][a-z0-9_]*$/)
    assert.match(original,/current_database\(\) <> 'agentstudio_stage'/)
    assert.match(original,/pg_read_file\('\/run\/secrets\/api_login_password'\)/)
    const stageSql=original
      .replace("current_database() <> 'agentstudio_stage'",
        "current_database() <> '"+dbName+"'")
      .replace("pg_read_file('/run/secrets/api_login_password')",
        "'SYNTHETIC-PGLITE-ROLE-CHECK-ONLY-X7jK8lV9mQ0rT'")
      .replaceAll("ON DATABASE agentstudio_stage", "ON DATABASE "+dbName)
    await pg.exec(stageSql)
    const role=await pg.query(
      "SELECT rolcanlogin,rolsuper,rolbypassrls "+
      "FROM pg_roles WHERE rolname='agentstudio_stage_login'")
    assert.deepEqual(role.rows,[{rolcanlogin:true,rolsuper:false,rolbypassrls:false}])
    const issuer="https://identity.example.invalid"
    const a=await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,'A') RETURNING id",[issuer])
    const b=await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,'B') RETURNING id",[issuer])
    const aid=a.rows[0].id,bid=b.rows[0].id

    await pg.exec("SET SESSION AUTHORIZATION agentstudio_stage_login")
    const me=await pg.query("SELECT session_user,current_user")
    assert.equal(me.rows[0].session_user,"agentstudio_stage_login")
    await assert.rejects(pg.query("SELECT * FROM agentstudio.agent_specs"),/permission denied/i)
    await pg.exec("BEGIN")
    try {
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      const result=await pg.query(
        "SELECT agentstudio.identity_user_id($1,$2) AS id",[issuer,"A"])
      assert.equal(result.rows[0].id,aid)
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[aid])
      await pg.exec("SAVEPOINT users_mutation_denied")
      await assert.rejects(pg.query(
        "UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[aid]),
        /permission denied/i)
      await pg.exec("ROLLBACK TO SAVEPOINT users_mutation_denied")

      const own=await pg.query(
        "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
        "VALUES($1,'My Agent','{}'::jsonb) RETURNING id",[aid])
      assert.equal(own.rows.length,1)
      await pg.exec("SAVEPOINT denied")
      await assert.rejects(
        pg.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
          "VALUES($1,'Other employee','{}'::jsonb)",[bid]),
        /row.level security|violates row.level security/i,
      )
      await pg.exec("ROLLBACK TO SAVEPOINT denied")
      const visible=await pg.query("SELECT count(*)::int AS count FROM agentstudio.agent_specs")
      assert.equal(visible.rows[0].count,1)
      await pg.exec("COMMIT")
    }catch(error){await pg.exec("ROLLBACK");throw error}
    const after=await pg.query("SELECT current_user")
    assert.equal(after.rows[0].current_user,"agentstudio_stage_login")
  }finally{await pg.close()}
})
