import test from "node:test"
import assert from "node:assert/strict"
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {
  prepareDisabledUserProvision,provisionDisabledStageUsers,
} from "../src/stage-user-import.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=file=>readFileSync(path.join(root,file),"utf8")
  .split(/\r?\n/).filter(x=>!x.trim().startsWith("\\")).join("\n")
const old=["old_a","old_b"]
const uuids=[
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]
const issuer="https://stage-oidc.synthetic.invalid"
function fixture(){
  const temp=mkdtempSync(path.join(tmpdir(),"stage-user-fixture-"))
  const snapshot=path.join(temp,"snapshot.sqlite")
  const manifest=path.join(temp,"manifest.json")
  const mapping=path.join(temp,"mapping.json")
  const idp=path.join(temp,"approved-oidc.json")
  const db=new DatabaseSync(snapshot)
  db.exec("CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT,email TEXT);"+
    "CREATE TABLE agent_specs(id TEXT PRIMARY KEY);")
  for(const [i,value] of old.entries())
    db.prepare("INSERT INTO studio_users VALUES(?,?,?)").run(
      value,"SECRET_HASH_NOT_FOR_IMPORT_"+i,
      "private"+i+"@synthetic.invalid",
    )
  db.close()
  const source=readFileSync(snapshot)
  const sourceHash=createHash("sha256").update(source).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:source.length,sha256:sourceHash,
    tables:{studio_users:2,agent_specs:0},
  }))
  const identity={
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sourceHash,
    records:old.map((id,i)=>({
      old_id:id,new_studio_user_id:uuids[i],
      verified_by:"SYNTHETIC human review",
      approved_at:"2026-10-15T09:00:00Z",
    })),
  }
  const idpDoc={
    schema_version:"studio-reviewed-oidc-provision-v1",
    source_sha256:sourceHash,
    records:old.map((id,i)=>({
      old_id:id,new_studio_user_id:uuids[i],
      external_issuer:issuer,
      external_subject:"synthetic-subject-"+i,
      reviewed_by:"SYNTHETIC IdP operator",
      reviewed_at:"2026-10-15T09:15:00Z",
    })),
  }
  writeFileSync(mapping,JSON.stringify(identity))
  writeFileSync(idp,JSON.stringify(idpDoc))
  return {temp,snapshot,manifest,mapping,idp,identity,idpDoc}
}
async function dbFixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(sql("db/postgres/001_stage_schema.sql"))
  const migration=sql("db/postgres/migrations/pg_v8_011_legacy_user_provision.sql")
  const name=(await pg.query("SELECT current_database() AS db")).rows[0].db
  const adapted=migration
    .replace("current_database()<>'agentstudio_stage'",
      "current_database()<>'"+name+"'")
    .replace("session_user<>'agentstudio_admin'","false")
    .replace(
      "current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",
      "false")
  await pg.exec(adapted)
  await pg.exec(adapted)
  return pg
}
function adapter(pg,opts={}){
  let calls=0
  return {async connect(){return {
    release(){},
    async query(statement,values=[]){
      if(statement.startsWith("SELECT current_database() AS database"))
        return {rows:[{
          database:opts.badDatabase?"company_live":"agentstudio_stage",
          login:"agentstudio_admin",admin:true,version:170004,
        }]}
      if(opts.failSecond &&
        statement.startsWith("INSERT INTO agentstudio.users")){
        calls++
        if(calls===2)throw Error("synthetic_user_write_aborted")
      }
      return pg.query(statement,values)
    },
  }}}
}
test("reviewed snapshot and OIDC map preprovision disabled users, never activate SSO",async()=>{
  const f=fixture(),pg=await dbFixture()
  try{
    const plan=prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp)
    assert.equal(plan.rows.length,2)
    const receipt=await provisionDisabledStageUsers(adapter(pg),plan)
    assert.deepEqual([
      receipt.users_created,receipt.users_replayed,receipt.users_reconciled],
      [2,0,2])
    assert.equal(receipt.new_accounts_active,false)
    assert.equal(receipt.production_cutover_allowed,false)
    const again=await provisionDisabledStageUsers(adapter(pg),plan)
    assert.deepEqual([again.users_created,again.users_replayed],[0,2])
    const data=await pg.query(
      "SELECT id,external_issuer,external_subject,status,display_name "+
      "FROM agentstudio.users ORDER BY id")
    assert.equal(data.rows.length,2)
    assert.deepEqual(data.rows.map(x=>x.status),["disabled","disabled"])
    assert.deepEqual(data.rows.map(x=>x.display_name),["",""])
    assert.deepEqual(data.rows.map(x=>x.external_issuer),[issuer,issuer])
    assert.equal((await pg.query("SELECT count(*)::int AS n "+
      "FROM agentstudio.legacy_user_imports")).rows[0].n,2)
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      const actor=await pg.query(
        "SELECT agentstudio.identity_user_id($1::text,$2::text) AS id",
        [issuer,"synthetic-subject-0"])
      assert.equal(actor.rows[0].id,null,
        "disabled reviewer-managed accounts cannot login via API")
      await assert.rejects(pg.query(
        "SELECT * FROM agentstudio.legacy_user_imports"),
        /permission denied/i)
    }finally{await pg.exec("ROLLBACK")}
    await assert.rejects(provisionDisabledStageUsers(
      adapter(pg),structuredClone(plan)),/identity_unverified_or_mutated_plan/)
  }finally{
    await pg.close()
    rmSync(f.temp,{recursive:true,force:true})
  }
})
test("partial SQL error rolls back all users and provenance, never leaks identities",async()=>{
  const f=fixture(),pg=await dbFixture()
  try{
    const plan=prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp)
    await assert.rejects(provisionDisabledStageUsers(
      adapter(pg,{failSecond:true}),plan),/identity_stage_sql_failed/)
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.users")).rows[0].n,0)
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.legacy_user_imports"))
      .rows[0].n,0)
    await assert.rejects(provisionDisabledStageUsers(
      adapter(pg,{badDatabase:true}),plan),
      /refuse_nonisolated_identity_target/)
    assert.equal((await provisionDisabledStageUsers(
      adapter(pg),plan)).users_created,2)
    for(const text of ["SECRET_HASH_NOT_FOR_IMPORT","private0@synthetic.invalid"]){
      assert.doesNotMatch(JSON.stringify(plan),new RegExp(text))
    }
  }finally{
    await pg.close()
    rmSync(f.temp,{recursive:true,force:true})
  }
})
test("tenant-scoped OIDC issuers retain exact paths to prevent cross-tenant identity collapse",()=>{
  const f=fixture()
  try{
    const doc=JSON.parse(readFileSync(f.idp,"utf8"))
    doc.records[0].external_issuer="https://login.example.invalid/tenant-one/v2.0"
    doc.records[1].external_issuer="https://login.example.invalid/tenant-two/v2.0"
    doc.records[0].external_subject="same-subject"
    doc.records[1].external_subject="same-subject"
    writeFileSync(f.idp,JSON.stringify(doc))
    const plan=prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp)
    assert.notEqual(plan.rows[0].issuer,plan.rows[1].issuer)
    assert.ok(plan.rows.every(row=>row.issuer.includes("/tenant-")))
    assert.equal(plan.rows.length,2)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("unreviewed or altered identity snapshots fail closed before DB connections",async()=>{
  const f=fixture()
  try{
    const original=readFileSync(f.idp)
    const changed=JSON.parse(original.toString())
    changed.records[1].external_subject=changed.records[0].external_subject
    writeFileSync(f.idp,JSON.stringify(changed))
    assert.throws(()=>prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp),/oidc_duplicate_identity/)
    writeFileSync(f.idp,original)
    changed.records[1].external_subject="unique-other"
    changed.records[1].new_studio_user_id=uuids[0]
    writeFileSync(f.idp,JSON.stringify(changed))
    assert.throws(()=>prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp),/oidc_mapping_not_reviewed/)
    writeFileSync(f.idp,original)
    const altered=JSON.parse(readFileSync(f.manifest,"utf8"))
    altered.sha256="f".repeat(64)
    writeFileSync(f.manifest,JSON.stringify(altered))
    assert.throws(()=>prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp),
      /identity_snapshot_sha_mismatch/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("source metadata and reviewed OIDC subject require exact coverage",async()=>{
  const f=fixture()
  try{
    const idpDoc=JSON.parse(readFileSync(f.idp,"utf8"))
    idpDoc.records.pop()
    writeFileSync(f.idp,JSON.stringify(idpDoc))
    assert.throws(()=>prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp),/oidc_mapping_incomplete/)
    const mapping=JSON.parse(readFileSync(f.mapping,"utf8"))
    mapping.records.pop()
    writeFileSync(f.mapping,JSON.stringify(mapping))
    assert.throws(()=>prepareDisabledUserProvision(
      f.snapshot,f.manifest,f.mapping,f.idp),/identity_mapping_incomplete/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
