// V8.3 lossless staging-only Agent configuration importer.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {
  normalizeLegacyAgent,importLegacyAgentsToStage,StageImportError,
} from "../src/stage-agent-import.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=p=>readFileSync(path.join(root,p),"utf8")
  .split(/\r?\n/).filter(l=>!l.trim().startsWith("\\")).join("\n")
const schema=read("db/postgres/001_stage_schema.sql")
const snapshot="a".repeat(64)
const makeSpec=()=>({
  goal:"Synthesize public reports on semiconductor suppliers",
  task_scope:"Synthetic public domain data only",
  deliverables:["Diligence brief"],
  task_plan:["Review assumptions"],
  done_criteria:["Cite uncertainties"],
  tools:["summarize"],
  knowledge_base_ids:[],
  require_approval:true,
})
const row=(id,user)=>({
  id,rh_user_id:user,name:"Test Agent "+id,
  spec:JSON.stringify(makeSpec()),
  source:"",template_key:"",
  created:"2026-10-14 09:00:00.000Z",
  updated:"2026-10-14 12:00:00.000Z",
})
const poolFor=(pg,opt={})=>({
  async connect(){
    return {
      async query(sql,values=[]){
        if(sql.startsWith("SELECT current_database() AS database"))
          return {rows:[{database:opt.invalidDatabase||"agentstudio_stage",
            login:"agentstudio_admin",admin:true,version:170004}]}
        if(opt.failOnSecondSpec&&sql.startsWith("INSERT INTO agentstudio.agent_specs")){
          opt.insertCount=(opt.insertCount||0)+1
          if(opt.insertCount===2)throw Error("synthetic_forced_sql_write_error")
        }
        return pg.query(sql,values)
      },release(){},
    }
  },
})
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(schema)
  const a=(await pg.query("INSERT INTO agentstudio.users"+
    "(external_issuer,external_subject) VALUES('pg-stage-test','a') RETURNING id"))
    .rows[0].id
  const b=(await pg.query("INSERT INTO agentstudio.users"+
    "(external_issuer,external_subject) VALUES('pg-stage-test','b') RETURNING id"))
    .rows[0].id
  const owners=new Map([["old_a",a],["old_b",b]])
  return {pg,a,b,owners}
}
test("imports exact compatible legacy Agent snapshots, records crosswalk, checks RLS and is idempotent",async()=>{
  const {pg,a,b,owners}=await fixture()
  try{
    const batch=[
      normalizeLegacyAgent(row("old-spec-a","old_a"),owners),
      normalizeLegacyAgent(row("old-spec-b","old_b"),owners),
    ]
    const r=await importLegacyAgentsToStage(poolFor(pg),snapshot,batch)
    assert.deepEqual([r.imported,r.replayed,r.reconciled],[2,0,2])
    assert.equal(r.production_cutover_allowed,false)
    const repeat=await importLegacyAgentsToStage(poolFor(pg),snapshot,batch)
    assert.deepEqual([repeat.imported,repeat.replayed],[0,2])
    const mapping=await pg.query(
      "SELECT legacy_spec_id,target_spec_id,owner_user_id,payload_sha256 "+
      "FROM agentstudio.legacy_agent_imports ORDER BY legacy_spec_id")
    assert.equal(mapping.rows.length,2)
    assert.equal(mapping.rows[0].owner_user_id,a)
    assert.equal(mapping.rows[1].owner_user_id,b)
    assert.ok(mapping.rows.every(x=>/^[a-f0-9]{64}$/.test(x.payload_sha256)))
    assert.equal((await pg.query("SELECT count(*)::int AS n "+
      "FROM agentstudio.agent_specs")).rows[0].n,2)
    // Crosswalk never becomes visible to the normal API/Worker roles.
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[a])
      assert.equal((await pg.query("SELECT name FROM agentstudio.agent_specs"))
        .rows.length,1)
    }finally{await pg.exec("ROLLBACK")}
    await pg.exec("BEGIN")
    try{
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await assert.rejects(pg.query(
        "SELECT legacy_spec_id FROM agentstudio.legacy_agent_imports"),
        /permission denied/i)
    }finally{await pg.exec("ROLLBACK")}
    const mutated=[{...batch[0],name:"Different"}]
    await assert.rejects(importLegacyAgentsToStage(poolFor(pg),snapshot,mutated),
      /stage_batch_tampered_or_duplicate/)
    await assert.rejects(importLegacyAgentsToStage(
      poolFor(pg),"b".repeat(64),batch),/stage_import_source_conflict/)
  }finally{await pg.close()}
})
test("any failed SQL write rolls back the whole staging batch, including crosswalk",async()=>{
  const {pg,owners}=await fixture()
  try{
    const batch=[
      normalizeLegacyAgent(row("rollback-a","old_a"),owners),
      normalizeLegacyAgent(row("rollback-b","old_b"),owners),
    ]
    await assert.rejects(importLegacyAgentsToStage(
      poolFor(pg,{failOnSecondSpec:true}),snapshot,batch),
      /stage_import_sql_failed/)
    assert.equal((await pg.query("SELECT count(*)::int AS n "+
      "FROM agentstudio.agent_specs")).rows[0].n,0)
    assert.equal((await pg.query("SELECT count(*)::int AS n "+
      "FROM agentstudio.legacy_agent_imports")).rows[0].n,0)
    // Retrying after fixing environment starts from clean rollback state.
    const repaired=await importLegacyAgentsToStage(poolFor(pg),snapshot,batch)
    assert.equal(repaired.imported,2)
  }finally{await pg.close()}
})
test("rejects unprovisioned users, unsupported features, metadata, unknown JSON and unsafe target",async()=>{
  const {pg,owners}=await fixture()
  try{
    const safe=row("strict-agent","old_a")
    const wrong=poolFor(pg,{invalidDatabase:"company_live_db"})
    const supported=normalizeLegacyAgent(safe,owners)
    await assert.rejects(importLegacyAgentsToStage(wrong,snapshot,[supported]),
      /refuse_nonisolated_postgres_database/)
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM "+
      "agentstudio.agent_specs")).rows[0].n,0)
    const cannotMap={...safe,rh_user_id:"unknown-employee"}
    assert.throws(()=>normalizeLegacyAgent(cannotMap,owners),
      /legacy_agent_identity_not_mapped/)
    const connected={...makeSpec(),knowledge_base_ids:["private_knowledge"]}
    assert.throws(()=>normalizeLegacyAgent({
      ...safe,spec:JSON.stringify(connected),
    },owners),/legacy_spec_requires_lossless_feature_mapping/)
    assert.throws(()=>normalizeLegacyAgent({
      ...safe,spec:JSON.stringify({...makeSpec(),unknown_field:"must keep"}),
    },owners),/legacy_spec_requires_lossless_feature_mapping/)
    assert.throws(()=>normalizeLegacyAgent({
      ...safe,spec:JSON.stringify({...makeSpec(),require_approval:false}),
    },owners),/legacy_spec_requires_lossless_feature_mapping/)
    assert.throws(()=>normalizeLegacyAgent({
      ...safe,spec:JSON.stringify({...makeSpec(),goal:"  trimmed silently"}),
    },owners),/legacy_spec_would_be_normalized/)
    assert.throws(()=>normalizeLegacyAgent({
      ...safe,source:"template",
    },owners),/legacy_source_metadata_not_supported/)
    const malicious={...safe,spec:JSON.stringify({
      ...makeSpec(),tools:["unknown_external_tool"],
    })}
    assert.throws(()=>normalizeLegacyAgent(malicious,owners),
      /legacy_spec_invalid_or_unsupported_tool/)
    await pg.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1,'Untracked config','{}'::jsonb)",[owners.get("old_a")])
    await assert.rejects(importLegacyAgentsToStage(
      poolFor(pg),snapshot,[supported]),/stage_existing_untracked_agents/)
  }finally{await pg.close()}
})
test("V8.3 incremental crosswalk SQL runs twice and never grants API visibility",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try{
    let old=schema.replace(/-- Approved, staging-only migration provenance[\s\S]*?-- One run may reference exactly one agent spec or workflow\./,
      "-- One run may reference exactly one agent spec or workflow.")
      .replace("REVOKE ALL ON agentstudio.legacy_agent_imports FROM agentstudio_api,agentstudio_worker;\n","")
      .replace(/\nINSERT INTO agentstudio.schema_migrations\(version,description\)\s+VALUES\('pg_v8_005'[^\n]*\);/,"")
    await pg.exec(old)
    assert.equal((await pg.query(
      "SELECT to_regclass('agentstudio.legacy_agent_imports') AS missing"))
      .rows[0].missing,null)
    const db=(await pg.query("SELECT current_database() AS db")).rows[0].db
    const migration=read("db/postgres/migrations/pg_v8_005_legacy_agent_import.sql")
      .replace("current_database()<>'agentstudio_stage'",
        "current_database()<>'"+db+"'")
    await pg.exec(migration)
    await pg.exec(migration)
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v8_005'")).rows[0].n,1)
    const perms=await pg.query(
      "SELECT has_table_privilege('agentstudio_api',"+
      "'agentstudio.legacy_agent_imports','SELECT') AS canread")
    assert.equal(perms.rows[0].canread,false)
  }finally{await pg.close()}
})
