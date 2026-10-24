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
import {randomUUID} from "node:crypto"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"

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

test("knowledge recipient lookup is exact, native, active and returns only id/name through the separate auth role",async()=>{
  const {db,store,pool}=await harness()
  try{
    const password=await hashEmployeePassword("Synthetic-Recipient-Only#2026"),ids={}
    for(const who of ["owner","reader"]){
      ids[who]=randomUUID()
      await db.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name) VALUES($1,$2,$3,$3)",[ids[who],NATIVE_LOCAL_ISSUER,who])
      await db.query("INSERT INTO agentstudio_auth.accounts(user_id,email,password_record) VALUES($1,$2,$3)",[ids[who],who+"@example.test",password])
    }
    const identity={issuer:NATIVE_LOCAL_ISSUER,subject:"owner"}
    // The marker is synthetic predecessor setup for this focused auth fixture;
    // the hosted suite applies every actual migration through 032.
    await db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_031','synthetic auth fixture predecessor') ON CONFLICT DO NOTHING")
    await db.exec(readFileSync(path.join(root,"db/postgres/migrations/pg_v9_032_knowledge_access.sql"),"utf8"))
    const access=new KnowledgeAccessRepository(pool,(who,email)=>store.resolveKnowledgeRecipient(who,email))
    const base=await new KnowledgeBaseRepository(pool).create(identity,"Native shared metadata","Synthetic only")
    await access.change(identity,base.id,{action:"grant",recipient_email:"reader@example.test",role:"viewer",semantic_allowed:false,expected_revision:0,request_id:randomUUID()})
    const reader={issuer:NATIVE_LOCAL_ISSUER,subject:"reader"}
    assert.equal((await access.listShared(reader)).length,1)
    assert.deepEqual(await store.resolveKnowledgeRecipient(identity," Reader@Example.test "),{id:ids.reader,display_name:"reader"})
    assert.equal(await store.resolveKnowledgeRecipient(identity,"owner@example.test"),null)
    assert.equal(await store.resolveKnowledgeRecipient(identity,"read@example.test"),null)
    await assert.rejects(store.resolveKnowledgeRecipient({issuer:"foreign",subject:"owner"},"reader@example.test"),/native_employee_identity_required/)
    await assert.rejects(store.resolveKnowledgeRecipient({...identity,subject:"missing"},"reader@example.test"),/native_employee_identity_required/)
    await db.query("UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1",[ids.reader])
    assert.equal(await store.resolveKnowledgeRecipient(identity,"reader@example.test"),null)
    assert.equal((await access.listShared(reader)).length,0)
    await db.query("UPDATE agentstudio_auth.accounts SET enabled=true WHERE user_id=$1",[ids.reader])
    await db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[ids.reader])
    assert.equal(await store.resolveKnowledgeRecipient(identity,"reader@example.test"),null)
    await db.query("UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1",[ids.owner])
    await assert.rejects(store.resolveKnowledgeRecipient(identity,"reader@example.test"),/native_employee_identity_required/)
    await db.query("UPDATE agentstudio.users SET status='active' WHERE id=$1",[ids.reader])
    assert.equal((await access.listShared(reader)).length,0)
    for(const column of ["email","password_record","failed_attempts","locked_until"])
      assert.equal((await db.query("SELECT has_column_privilege('agentstudio_knowledge_acl','agentstudio_auth.accounts',$1::text,'SELECT') AS access",[column])).rows[0].access,false)
    assert.equal((await db.query("SELECT has_table_privilege('agentstudio_knowledge_acl','agentstudio_auth.sessions','SELECT') AS access")).rows[0].access,false)
    assert.equal((await db.query("SELECT has_schema_privilege('agentstudio_api','agentstudio_auth','USAGE') AS access")).rows[0].access,false)
  }finally{await db.close()}
})
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
