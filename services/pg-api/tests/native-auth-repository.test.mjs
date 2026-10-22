import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles} from "./helpers/native-pg18-embedded.mjs"
import {hashEmployeePassword,NATIVE_LOCAL_ISSUER} from "../src/native-employee-auth.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=readFileSync(path.join(root,"db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
async function harness(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec("CREATE DATABASE agent_studio")
  await db.exec(freshSchemaForTest().sql)
  await prepareNativeAuthPgliteRoles(db)
  const body=reviewedNativeSqlForEmbeddedTest(sql)
  await db.exec(body)
  const pool={async connect(){
    return {
      async query(sql,params=[]){return db.query(sql,params)},
      release(){},
    }
  }}
  return {db,pool,store:new NativeAuthRepository(pool)}
}
test("native credential login, session identity lookup and logout are isolated",async()=>{
  const {db,store}=await harness()
  const uuid="a882d7da-93e2-455d-b398-f264651e92e7"
  const email="employee@example.com"
  const subject="native-employee-one"
  const pwd="Long-Synthetic-Test-Passphrase#2048"
  try{
    const record=await hashEmployeePassword(pwd)
    await db.query(
      "INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name) "+
      "VALUES($1,$2,$3,'Test Employee')",[uuid,NATIVE_LOCAL_ISSUER,subject])
    await db.query(
      "INSERT INTO agentstudio_auth.accounts(user_id,email,password_record) VALUES($1,$2,$3)",
      [uuid,email,record])
    const account=await store.login(" Employee@Example.com ",pwd)
    assert.equal(account.authenticated,true)
    assert.equal(account.identity.issuer,NATIVE_LOCAL_ISSUER)
    assert.equal(account.identity.subject,subject)
    assert.equal(account.token.length,43)
    // Invalid email must never be accepted, even if an internal account
    // happens to have the reserved dummy lookup email.
    const decoyId="c6c12464-7a21-459c-a456-5589b079d2a4"
    await db.query(
      "INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name) "+
      "VALUES($1,$2,$3,'Reserved Test')",
      [decoyId,NATIVE_LOCAL_ISSUER,"reserved-test"])
    await db.query(
      "INSERT INTO agentstudio_auth.accounts(user_id,email,password_record) "+
      "VALUES($1,$2,$3)",[decoyId,"nonexistent@invalid.example",record])
    await assert.rejects(store.login("not-an-email",pwd),/invalid_employee_credentials/)
    const decoy=(await db.query(
      "SELECT failed_attempts FROM agentstudio_auth.accounts WHERE user_id=$1",
      [decoyId])).rows[0]
    assert.equal(decoy.failed_attempts,0)

    assert.equal((await store.verifySession(account.token))?.subject,subject)
    assert.equal(await store.revokeSession(account.token),true)
    assert.equal(await store.verifySession(account.token),null)
    assert.equal(await store.revokeSession(account.token),false)
    assert.equal(await store.verifySession("invalid"),null)
    const extra=await db.query(
      "SELECT count(*)::integer AS n FROM agentstudio_auth.sessions")
    assert.equal(extra.rows[0].n,1)
    const p=await db.query(
      "SELECT count(*)::integer AS n FROM agentstudio.agent_specs")
    assert.equal(p.rows[0].n,0)
  }finally{await db.close()}
})
test("employee inventory is admin-only, bounded and never returns password/session material",async()=>{
  const {db,store}=await harness()
  const adminPassword="Synthetic-Admin-Passphrase#2048"
  const staffPassword="Synthetic-Staff-Passphrase#2049"
  try{
    await store.provisionInitialAdmin({
      email:"admin-inventory@example.com",
      password:adminPassword,display_name:"Inventory Admin"})
    const admin=await store.login("admin-inventory@example.com",adminPassword)
    await store.provisionEmployee(admin.token,{
      email:"staff-inventory@example.com",
      password:staffPassword,display_name:"Inventory Staff"})
    const rows=await store.listEmployees(admin.token,20)
    assert.equal(rows.length,2)
    assert.ok(rows.some(row=>row.email==="admin-inventory@example.com"&&row.is_admin))
    assert.ok(rows.some(row=>row.email==="staff-inventory@example.com"&&!row.is_admin))
    for(const row of rows){
      assert.equal(typeof row.enabled,"boolean")
      assert.ok(["active","disabled"].includes(row.status))
      assert.equal("password_record" in row,false)
      assert.equal("token_digest" in row,false)
    }
    const staff=await store.login("staff-inventory@example.com",staffPassword)
    await assert.rejects(store.listEmployees(staff.token),/admin_session_required/)
    await assert.rejects(store.listEmployees("invalid-session"),/admin_session_required/)
    assert.equal((await store.listEmployees(admin.token,1000)).length,2)
  }finally{await db.close()}
})
test("wrong credentials and unknown email are generic and failed attempts locked",async()=>{
  const {db,store}=await harness()
  const uuid="a882d7da-93e2-455d-b398-f264651e92e8"
  const pwd="Another-Synthetic-Test-Passphrase#2048"
  try{
    const record=await hashEmployeePassword(pwd)
    await db.query(
      "INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name) "+
      "VALUES($1,$2,$3,'Locked Employee')",[uuid,NATIVE_LOCAL_ISSUER,"native-subject-two"])
    await db.query(
      "INSERT INTO agentstudio_auth.accounts(user_id,email,password_record) VALUES($1,$2,$3)",
      [uuid,"locked@example.com",record])
    for(let i=0;i<5;i++)
      await assert.rejects(store.login("locked@example.com","bad password 012345"),/invalid_employee_credentials/)
    await assert.rejects(store.login("someone@example.com",pwd),/invalid_employee_credentials/)
    await assert.rejects(store.login("locked@example.com",pwd),/invalid_employee_credentials/)
    const row=await db.query(
      "SELECT failed_attempts,locked_until FROM agentstudio_auth.accounts WHERE user_id=$1",
      [uuid])
    assert.equal(row.rows[0].failed_attempts,5)
    assert.ok(new Date(row.rows[0].locked_until).getTime()>Date.now())
    const sessions=await db.query(
      "SELECT count(*)::integer AS n FROM agentstudio_auth.sessions")
    assert.equal(sessions.rows[0].n,0)
  }finally{await db.close()}
})
