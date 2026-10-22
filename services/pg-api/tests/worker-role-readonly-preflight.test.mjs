import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {prepareNativeAuthPgliteRoles,
  reviewedNativeSqlForEmbeddedTest}
  from "./helpers/native-pg18-embedded.mjs"
import {verifyPgWorkerRoleBoundary} from "../src/worker-role-preflight.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const authSql=readFileSync(path.join(root,
  "db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
const target={
  mode:"baota_pg18",host:"127.0.0.1",port:5333,
  database:"agent_studio",user:"agentstudio_stage_worker",expectedMajor:18
}
test("embedded Postgres proves native-auth Worker cannot see private data during read-only preflight",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec("CREATE DATABASE agent_studio")
    await pg.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(pg)
    await pg.exec(reviewedNativeSqlForEmbeddedTest(authSql))
    // The fresh schema now denies Worker->API transitive access without
    // needing a test-only REVOKE. No BaoTa PG18 DB is mutated by this test.
    assert.equal((await pg.query(
      "SELECT has_column_privilege('agentstudio_api',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS allowed"
    )).rows[0].allowed,false)
    assert.equal((await pg.query(
      "SELECT pg_has_role('agentstudio_stage_worker',"+
      "'agentstudio_model_broker','member') AS member"
    )).rows[0].member,false)
    await pg.exec("SET SESSION AUTHORIZATION agentstudio_stage_worker")
    const SQL=[]
    let released=0
    const pool={
      async connect(){return {
        async query(text,params=[]){SQL.push(text);return pg.query(text,params)},
        release(){released++}
      }}
    }
    await verifyPgWorkerRoleBoundary(pool,target)
    assert.equal(released,1)
    assert.equal(SQL.filter(s=>s==="BEGIN READ ONLY").length,2)
    assert.equal(SQL.filter(s=>s==="ROLLBACK").length,2)
    assert.ok(SQL.every(s=>!/^\s*(?:INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE|ALTER)\b/i.test(s)))
    assert.ok(SQL.some(s=>s.includes("workerCanReadAgentSpecs")))
    await assert.rejects(pg.query(
      "SELECT instruction FROM agentstudio.runs"),/permission denied/i)
    await assert.rejects(pg.exec("SET ROLE agentstudio_model_broker"),
      /permission denied/i)
    await pg.exec("SET ROLE agentstudio_api")
    // This role switch is still needed for legacy run processing, but it
    // must not grant indirect read access to API Key ciphertext/nonce/tag.
    for(const column of [
      "api_key_ciphertext","api_key_nonce","api_key_tag"
    ])await assert.rejects(pg.query(
      "SELECT "+column+" FROM agentstudio.model_connections LIMIT 1"),
      /permission denied/i,column)
    await assert.rejects(pg.query(
      "SELECT value_ciphertext FROM agentstudio.tool_connection_headers LIMIT 1"),
      /permission denied/i,"worker cannot read encrypted tool headers through API role")
    await pg.exec("RESET ROLE")
  }finally{await pg.close()}
})

test("Worker role verifier fails closed for privileged or inherited DB logins",async()=>{
  for(const change of [
    {superuser:true},
    {bypassrls:true},
    {createRole:true},
    {inherits:true},
    {canLogin:false},
    {login:"postgres"},
  ]){
    let releaseCount=0
    const row={login:target.user,superuser:false,bypassrls:false,
      canLogin:true,createRole:false,inherits:false,...change}
    const pool={async connect(){return {
      async query(){return {rows:[row]}},
      release(){releaseCount++}
    }}}
    await assert.rejects(verifyPgWorkerRoleBoundary(pool,target),
      /unsafe_pg_worker_role_boundary/)
    assert.equal(releaseCount,1)
  }
})
test("Worker PG18 SELECT-only and indirect API grants fail closed on drift",async()=>{
  const row={login:target.user,superuser:false,bypassrls:false,
    canLogin:true,createRole:false,inherits:false}
  const expected={workerCanSeeJobs:true,workerCanUpdateStatus:true,
    workerCanReadExternalEffects:true,workerCanReadRunInstructions:false,
    workerCanReadAgentSpecs:false,workerCanReadAuthAccounts:false,
    workerCanUseAuthSchema:false,loginCanJoinNativeAuth:false,
    workerLoginCanJoinApi:true,workerLoginCanJoinBroker:false,
    apiRoleCanReadModelCiphertext:false,
    workerLoginCanReadModelCiphertext:false,
    apiRoleCanReadToolHeaderCiphertext:false,
    workerLoginCanReadToolHeaderCiphertext:false}
  for(const alter of [
    {workerCanSeeJobs:false},{workerCanUpdateStatus:false},
    {workerCanReadExternalEffects:false},{workerCanReadRunInstructions:true},
    {workerCanReadAgentSpecs:true},{workerCanReadAuthAccounts:true},
    {workerCanUseAuthSchema:true},{loginCanJoinNativeAuth:true},
    {workerLoginCanJoinApi:false},
    {workerLoginCanJoinBroker:true},
    {apiRoleCanReadModelCiphertext:true},
    {workerLoginCanReadModelCiphertext:true},
    {apiRoleCanReadToolHeaderCiphertext:true},
    {workerLoginCanReadToolHeaderCiphertext:true},
  ]){
    let n=0,released=0
    const pool={async connect(){return {
      async query(){return {rows:[n++===0?row:{...expected,...alter}]}},
      release(){released++}
    }}}
    await assert.rejects(verifyPgWorkerRoleBoundary(pool,target),
      /unsafe_pg_worker_role_boundary/)
    assert.equal(released,1)
  }
})
