import test from "node:test"
import assert from "node:assert/strict"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest,loginSqlForTest,verifyFreshForTest}
  from "../src/baota-pg18-fresh-init.mjs"

const apiPassword="synthetic-api-password-0123456789abcdefghijklmnopqrstuvwxyz"
const workerPassword="synthetic-worker-password-0123456789abcdefghijklmnopqrstuvwxyz"

test("real embedded PostgreSQL applies one atomic fresh-schema and least privilege role transaction",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    // PGlite normally contains only its default database. Provision the
    // reserved database name for SQL GRANT/REVOKE syntax validation.
    await pg.exec("CREATE DATABASE agent_studio")
    await pg.exec("BEGIN")
    await pg.exec("SET LOCAL password_encryption = 'scram-sha-256'")
    const baseline=freshSchemaForTest()
    assert.ok(!baseline.sql.includes("\\set ON_ERROR_STOP on"))
    await pg.exec(baseline.sql)
    await pg.query("SELECT set_config('agentstudio.bootstrap_api_password',$1,true)",[apiPassword])
    await pg.query("SELECT set_config('agentstudio.bootstrap_worker_password',$1,true)",[workerPassword])
    await pg.exec(loginSqlForTest)
    const verified=await verifyFreshForTest(pg)
    assert.deepEqual(verified,{
      tables:23,rls:22,pgvector:true,ledger:3,users:0,jobs:0,login_roles:2})
    await pg.exec("COMMIT")
    const userPassword=(await pg.query(
      "SELECT rolpassword FROM pg_authid WHERE rolname='agentstudio_stage_login'")).rows[0]?.rolpassword
    assert.match(userPassword,/^SCRAM-SHA-256\$/)
    assert.ok(!userPassword.includes(apiPassword))
    const workerPasswordHash=(await pg.query(
      "SELECT rolpassword FROM pg_authid WHERE rolname='agentstudio_stage_worker'")).rows[0]?.rolpassword
    assert.match(workerPasswordHash,/^SCRAM-SHA-256\$/)
    assert.ok(!workerPasswordHash.includes(workerPassword))
    const forbidden=(await pg.query(
      "SELECT pg_has_role('agentstudio_stage_login','agentstudio_worker','member') AS worker")).rows[0].worker
    assert.equal(forbidden,false)
  }finally{await pg.close()}
})
test("uncommitted schema and roles disappear on rollback",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    // PGlite normally contains only its default database. Provision the
    // reserved database name for SQL GRANT/REVOKE syntax validation.
    await pg.exec("CREATE DATABASE agent_studio")
    await pg.exec("BEGIN")
    await pg.exec("SET LOCAL password_encryption = 'scram-sha-256'")
    await pg.exec(freshSchemaForTest().sql)
    await pg.query("SELECT set_config('agentstudio.bootstrap_api_password',$1,true)",[apiPassword])
    await pg.query("SELECT set_config('agentstudio.bootstrap_worker_password',$1,true)",[workerPassword])
    await pg.exec(loginSqlForTest)
    await pg.exec("ROLLBACK")
    assert.equal((await pg.query(
      "SELECT to_regnamespace('agentstudio') AS schema")).rows[0].schema,null)
    const roles=(await pg.query(
      "SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_stage_login','agentstudio_stage_worker')")).rows[0].n
    assert.equal(roles,0)
  }finally{await pg.close()}
})
