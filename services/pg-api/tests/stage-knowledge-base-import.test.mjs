import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {normalizeLegacyKb,importLegacyKbsToStage}
  from "../src/stage-knowledge-base-import.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=file=>readFileSync(path.join(root,file),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const snapshot="b".repeat(64)
async function bootstrap(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(sql("db/postgres/001_stage_schema.sql"))
  const local=(await pg.query("SELECT current_database() AS db")).rows[0].db
  const migration=sql("db/postgres/migrations/pg_v8_007_legacy_kb_import.sql")
    .replace("current_database()<>'agentstudio_stage'",
      "current_database()<>'"+local+"'")
  await pg.exec(migration)
  await pg.exec(migration)
  const a=(await pg.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
    "VALUES('fixture','owner_A') RETURNING id")).rows[0].id
  const b=(await pg.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
    "VALUES('fixture','owner_B') RETURNING id")).rows[0].id
  return {pg,a,b,map:new Map([["owner_A",a],["owner_B",b]])}
}
const input=(id,owner)=>({
  id,rh_user_id:owner,
  name:"Synthetic KB "+id,
  description:"Empty test knowledge base",
  created_ms:1792030400000,
  updated_ms:1792030700000,
})
function adapter(pg,{errorOnSecond=false,badDatabase=false}={}){
  let inserts=0
  return {async connect(){return {
    async query(statement,values=[]){
      if(statement.startsWith("SELECT current_database() AS database"))
        return {rows:[{database:badDatabase?"company_live":"agentstudio_stage",
          login:"agentstudio_admin",admin:true,version:170004}]}
      if(errorOnSecond&&statement.startsWith("INSERT INTO agentstudio.knowledge_bases")){
        inserts++
        if(inserts===2)throw Error("forced_abort_all_sql_writes")
      }
      return pg.query(statement,values)
    },
    release(){},
  }}}
}
test("metadata-only KB import preserves original owner, description and timestamps; replay and RLS safe",async()=>{
  const {pg,a,b,map}=await bootstrap()
  try{
    const first=normalizeLegacyKb(input("legacy-base-a","owner_A"),map)
    const second=normalizeLegacyKb(input("legacy-base-b","owner_B"),map)
    const result=await importLegacyKbsToStage(
      adapter(pg),snapshot,[first,second])
    assert.deepEqual([result.imported,result.replayed,result.reconciled],[2,0,2])
    assert.equal(result.production_cutover_allowed,false)
    assert.deepEqual((({imported,replayed})=>[imported,replayed])(
      await importLegacyKbsToStage(adapter(pg),snapshot,[first,second])
    ),[0,2])
    const mapping=await pg.query(
      "SELECT legacy_base_id,owner_user_id,target_base_id "+
      "FROM agentstudio.legacy_knowledge_base_imports ORDER BY legacy_base_id")
    assert.equal(mapping.rows.length,2)
    assert.equal(mapping.rows[0].owner_user_id,a)
    assert.equal(mapping.rows[1].owner_user_id,b)
    const data=await pg.query(
      "SELECT name,description,visibility,created_at,updated_at "+
      "FROM agentstudio.knowledge_bases")
    assert.equal(data.rows.length,2)
    assert.ok(data.rows.every(x=>x.visibility==="private"&&
      x.description==="Empty test knowledge base"))
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[a])
      assert.equal((await pg.query("SELECT name FROM agentstudio.knowledge_bases")).rows.length,1)
      await assert.rejects(pg.query(
        "SELECT * FROM agentstudio.legacy_knowledge_base_imports"),
        /permission denied/i)
    }finally{await pg.exec("ROLLBACK")}
    const newSource=async()=>importLegacyKbsToStage(adapter(pg),
      "c".repeat(64),[first,second])
    await assert.rejects(newSource(),/stage_kb_source_snapshot_conflict/)
  }finally{await pg.close()}
})
test("atomic rollback protects legacy crosswalk when the second inserted KB fails",async()=>{
  const {pg,map}=await bootstrap()
  try{
    const rows=[
      normalizeLegacyKb(input("rollback-1","owner_A"),map),
      normalizeLegacyKb(input("rollback-2","owner_B"),map),
    ]
    await assert.rejects(importLegacyKbsToStage(
      adapter(pg,{errorOnSecond:true}),snapshot,rows),/stage_kb_sql_failed/)
    assert.equal((await pg.query(
      "SELECT count(*)::integer AS n FROM agentstudio.knowledge_bases")).rows[0].n,0)
    assert.equal((await pg.query(
      "SELECT count(*)::integer AS n FROM agentstudio.legacy_knowledge_base_imports"))
      .rows[0].n,0)
    assert.equal((await importLegacyKbsToStage(
      adapter(pg),snapshot,rows)).imported,2)
  }finally{await pg.close()}
})
test("unsupported related content, bad date, owner, and non-staging database fail closed",async()=>{
  const {pg,map}=await bootstrap()
  try{
    const inputBase=input("base-safe","owner_A")
    assert.throws(()=>normalizeLegacyKb(inputBase,map,true),
      /legacy_kb_documents_vectors_or_acl_not_migrated/)
    assert.throws(()=>normalizeLegacyKb({...inputBase,
      updated_ms:1234},map),/legacy_kb_invalid_timestamp/)
    assert.throws(()=>normalizeLegacyKb({...inputBase,
      description:"Do not clip\0"},map),/legacy_kb_name_description_invalid/)
    assert.throws(()=>normalizeLegacyKb({...inputBase,
      rh_user_id:"missing_user"},map),/legacy_kb_identity_unmapped/)
    const safe=normalizeLegacyKb(inputBase,map)
    await assert.rejects(importLegacyKbsToStage(
      adapter(pg,{badDatabase:true}),snapshot,[safe]),
      /refuse_nonisolated_pg17_target/)
    const corrupted={...safe,name:"silently modified"}
    await assert.rejects(importLegacyKbsToStage(
      adapter(pg),snapshot,[corrupted]),/stage_kb_payload_tampered/)
    assert.equal((await pg.query(
      "SELECT count(*)::integer AS n FROM agentstudio.knowledge_bases")).rows[0].n,0)
    // The next schema slice must not treat untracked metadata as migrated.
    await pg.query(
      "INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) "+
      "VALUES($1,'new untracked KB')",[map.get("owner_A")])
    await assert.rejects(importLegacyKbsToStage(
      adapter(pg),snapshot,[safe]),/stage_has_untracked_knowledge_bases/)
  }finally{await pg.close()}
})
test("migration is additive, repeatable and preserves deny-by-default access",async()=>{
  const {pg}=await bootstrap()
  try{
    const count=await pg.query("SELECT COUNT(*)::integer AS n "+
      "FROM agentstudio.schema_migrations WHERE version='pg_v8_007'")
    assert.equal(count.rows[0].n,1)
    const roles=await pg.query(
      "SELECT has_table_privilege('agentstudio_api',"+
      "'agentstudio.legacy_knowledge_base_imports','SELECT') AS api,"+
      "has_table_privilege('agentstudio_worker',"+
      "'agentstudio.legacy_knowledge_base_imports','INSERT') AS worker")
    assert.equal(roles.rows[0].api,false)
    assert.equal(roles.rows[0].worker,false)
    const rls=await pg.query(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class "+
      "WHERE oid='agentstudio.legacy_knowledge_base_imports'::regclass")
    assert.equal(rls.rows[0].relrowsecurity,true)
    assert.equal(rls.rows[0].relforcerowsecurity,true)
  }finally{await pg.close()}
})
