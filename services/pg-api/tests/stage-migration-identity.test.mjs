import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {isApprovedStageMigrationOwner} from "../src/stage-migration-identity.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=f=>readFileSync(path.join(root,f),"utf8")
  .split(/\r?\n/).filter(x=>!x.trim().startsWith("\\")).join("\n")
function adapter(pg){return {async query(sql,values=[]){
  return pg.query(sql,values)
}}}
test("reviewed disabled migration identities can own staging archives without becoming active",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec(read("db/postgres/001_stage_schema.sql"))
    const name=(await pg.query("SELECT current_database() AS db")).rows[0].db
    const migrate=read("db/postgres/migrations/pg_v8_011_legacy_user_provision.sql")
      .replace("current_database()<>'agentstudio_stage'",
        "current_database()<>'"+name+"'")
      .replace("session_user<>'agentstudio_admin'","false")
      .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999","false")
    await pg.exec(migrate)
    const source="a".repeat(64)
    const disabled=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject,status) "+
      "VALUES('https://stage.invalid','migrated','disabled') RETURNING id"
    )).rows[0].id
    const active=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject,status) "+
      "VALUES('https://stage.invalid','other','active') RETURNING id"
    )).rows[0].id
    assert.equal(await isApprovedStageMigrationOwner(adapter(pg),disabled,source),false)
    await pg.query(
      "INSERT INTO agentstudio.legacy_user_imports "+
      "(source_snapshot_sha256,legacy_user_id,target_user_id,"+
      "reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) "+
      "VALUES($1,'old-person-id',$2,$3,$4,$5)",
      [source,disabled,"b".repeat(64),"c".repeat(64),"d".repeat(64)])
    assert.equal(await isApprovedStageMigrationOwner(adapter(pg),disabled,source),true)
    assert.equal(await isApprovedStageMigrationOwner(adapter(pg),disabled,"e".repeat(64)),false)
    assert.equal(await isApprovedStageMigrationOwner(adapter(pg),active,source),true)
    const status=(await pg.query(
      "SELECT status FROM agentstudio.users WHERE id=$1",[disabled])).rows[0].status
    assert.equal(status,"disabled","import provenance must NEVER enable login")
    const revoked=await pg.query(
      "SELECT agentstudio.identity_user_id('https://stage.invalid','migrated') AS id")
    assert.equal(revoked.rows[0].id,null)
  }finally{await pg.close()}
})
test("without the v8_011 migration ledger a disabled owner remains blocked",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    await pg.exec(read("db/postgres/001_stage_schema.sql"))
    const id=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject,status) "+
      "VALUES('https://stage.invalid','not-provisioned','disabled') RETURNING id"
    )).rows[0].id
    assert.equal(await isApprovedStageMigrationOwner(adapter(pg),id,"f".repeat(64)),false)
  }finally{await pg.close()}
})
