import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {freshSchemaForTest} from "../src/baota-pg18-fresh-init.mjs"
import {NativeAuthRepository} from "../src/native-auth-repository.mjs"
import {
  reviewedNativeSqlForEmbeddedTest,prepareNativeAuthPgliteRoles
} from "./helpers/native-pg18-embedded.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=readFileSync(path.join(root,"ops/baota-pg18-first-admin-postcheck.sql"),"utf8")
const authSql=readFileSync(path.join(root,"db/postgres/010_pg18_native_auth_proposed.sql"),"utf8")
const executable=sql.split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
function status(rows){
  return rows.flatMap(item=>item.rows||[]).find(
    item=>Object.hasOwn(item,"first_admin_postcheck"))?.first_admin_postcheck
}
test("first-admin postcheck is read-only and does not leak sensitive identity",()=>{
  assert.match(sql,/BEGIN READ ONLY;/)
  assert.match(sql,/ROLLBACK;/)
  assert.match(sql,/FIRST_ADMIN_BOOTSTRAP_OK/)
  assert.match(sql,/NO_GO_FIRST_ADMIN_BOOTSTRAP/)
  assert.doesNotMatch(sql,/\b(?:ALTER|DROP|INSERT|UPDATE|DELETE|CREATE|TRUNCATE)\s+/i)
  assert.doesNotMatch(sql,/password_record|token_digest|password_hash/i)
  const statements=sql.split("\n").filter(line=>!line.trim().startsWith("--")).join("\n")
  assert.doesNotMatch(statements,/\bemail\b|\bdisplay_name\b/i)
})
test("isolated PG SQL postcheck detects exactly one first admin and zero sessions",async()=>{
  const db=await PGlite.create({extensions:{vector}})
  try{
    await db.exec("CREATE DATABASE agent_studio")
    await db.exec(freshSchemaForTest().sql)
    await prepareNativeAuthPgliteRoles(db)
    await db.exec(reviewedNativeSqlForEmbeddedTest(authSql))
    assert.equal(status(await db.exec(executable)),"NO_GO_FIRST_ADMIN_BOOTSTRAP")
    const pool={async connect(){return {
      query:(query,params=[])=>db.query(query,params),release(){}
    }}}
    const repo=new NativeAuthRepository(pool)
    const pwd="Synthetic-Administrator-Passphrase-2026"
    await repo.provisionInitialAdmin({email:"qa@example.com",password:pwd,
      display_name:"QA Admin"})
    const reviewed=executable
      .replace("current_database()=\'agent_studio\'","TRUE")
      .replace("current_setting('server_version_num')::integer >=180000","TRUE")
      .replace("current_setting('server_version_num')::integer <190000","TRUE")
      .replace("current_setting('port')::integer=5333","TRUE")
    assert.notEqual(reviewed,executable)
    assert.equal(status(await db.exec(reviewed)),"FIRST_ADMIN_BOOTSTRAP_OK")
    await repo.login("qa@example.com",pwd)
    assert.equal(status(await db.exec(reviewed)),"NO_GO_FIRST_ADMIN_BOOTSTRAP")
  }finally{await db.close()}
})
