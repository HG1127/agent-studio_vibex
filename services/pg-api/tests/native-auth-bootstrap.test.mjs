import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {AgentSpecRepository} from "../src/repository.ts"
import {NATIVE_LOCAL_ISSUER,validateEmployeeDisplayName}
  from "../src/native-employee-auth.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const migration=readFileSync(path.join(root,
  "db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")

async function setup(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db)
  const testCopy=reviewedNativeSqlForEmbeddedTest(migration)
  await db.exec(testCopy)
  const pool={async connect(){return {
    query:(sql,params=[])=>db.query(sql,params),release(){}
  }}}
  return {db,pool,auth:new NativeAuthRepository(pool),
    business:new AgentSpecRepository(pool)}
}
test("initial admin is exclusive, can provision staff, and both identities map to owner-only RLS",async()=>{
  const h=await setup()
  const adminPassword="TestStrongNativeAdminPassword-2026"
  const staffPassword="EmployeeNativeSecurePassword-2026"
  try{
    const init=await h.auth.provisionInitialAdmin({
      email:"  Admin@Example.com ",password:adminPassword,display_name:"Admin"
    })
    assert.equal(init.email,"admin@example.com")
    assert.equal(init.is_admin,true)
    await assert.rejects(h.auth.provisionInitialAdmin({
      email:"other@example.com",password:adminPassword,display_name:"Other"
    }),/native_admin_already_initialized/)
    const admin=await h.auth.login("ADMIN@example.com",adminPassword)
    assert.equal(admin.is_admin,true)
    assert.equal(admin.identity.issuer,NATIVE_LOCAL_ISSUER)
    const staff=await h.auth.provisionEmployee(admin.token,{
      email:"staff@example.com",password:staffPassword,display_name:"Staff"
    })
    assert.equal(staff.is_admin,false)
    assert.equal(staff.email,"staff@example.com")
    const staffSession=await h.auth.login("staff@example.com",staffPassword)
    assert.equal(staffSession.is_admin,false)
    await assert.rejects(h.auth.provisionEmployee(staffSession.token,{
      email:"unauthorized@example.com",password:staffPassword,display_name:"Staff"
    }),/admin_session_required/)
    const spec={goal:"Synthetic local employee owner",task_scope:"",
      deliverables:[],tools:[],task_plan:[],done_criteria:[]}
    const adminSpec=await h.business.create(admin.identity,"Admin private",spec)
    const staffSpec=await h.business.create(staffSession.identity,"Staff private",spec)
    assert.equal((await h.business.list(admin.identity)).length,1)
    assert.equal((await h.business.list(staffSession.identity)).length,1)
    assert.equal(await h.business.get(admin.identity,staffSpec.id),null)
    assert.equal(await h.business.get(staffSession.identity,adminSpec.id),null)
    const groups=await h.db.query(
      "SELECT rolname FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_native_auth')")
    assert.equal(groups.rows.length,3)
    const apiMember=(await h.db.query(
      "SELECT pg_has_role('agentstudio_api','agentstudio_native_auth','member') AS allowed")).rows[0]
    assert.equal(apiMember.allowed,false)
    assert.equal((await h.db.query(
      "SELECT count(*)::integer AS n FROM agentstudio_auth.accounts")).rows[0].n,2)
  }finally{await h.db.close()}
})
test("operator bootstrap enforces email/display/password and rejects damaged source",async()=>{
  const h=await setup()
  try{
    for(const name of ["","", "Alice\nBob", "\u0000Bad", " Z ".repeat(50)])
      assert.throws(()=>validateEmployeeDisplayName(name),/invalid_employee_display_name/)
    for(const input of [
      {email:"invalid",password:"ExampleAdminPassword-2026",display_name:"Admin"},
      {email:"admin@example.com",password:"short",display_name:"Admin"},
      {email:"admin@example.com",password:"ExampleAdminPassword-2026",display_name:"Invalid\nAdmin"}
    ])await assert.rejects(h.auth.provisionInitialAdmin(input))
    const count=(await h.db.query(
      "SELECT count(*)::integer AS n FROM agentstudio_auth.accounts")).rows[0].n
    assert.equal(count,0)
  }finally{await h.db.close()}
})
