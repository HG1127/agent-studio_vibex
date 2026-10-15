import test from "node:test"
import assert from "node:assert/strict"
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import path from "node:path"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const cli=path.join(root,"services/pg-api/src/stage-knowledge-base-import-cli.ts")
const privateText="SENSITIVE_KNOWLEDGE_CHUNK_BODY_DO_NOT_REPORT"
const oldOwner="owner_A"
const toUuid="11111111-1111-4111-8111-111111111111"
const fixture=({withDocs=false,badUser=false}={})=>{
  const temp=mkdtempSync(path.join(tmpdir(),"stage-kb-cli-synthetic-"))
  const snapshot=path.join(temp,"snapshot.sqlite")
  const manifest=path.join(temp,"snapshot.sqlite.manifest.json")
  const mapping=path.join(temp,"approved.json")
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT);"+
    "CREATE TABLE agent_studio_kb_bases("+
    "id TEXT,rh_user_id TEXT,name TEXT,description TEXT,"+
    "created_ms INTEGER,updated_ms INTEGER);"+
    "CREATE TABLE agent_studio_kb_documents("+
    "id TEXT,base_id TEXT,rh_user_id TEXT,filename TEXT,size_chars INTEGER);")
  db.prepare("INSERT INTO studio_users(id) VALUES(?)").run(oldOwner)
  db.prepare("INSERT INTO agent_studio_kb_bases VALUES(?,?,?,?,?,?)")
    .run("old_kb_123456",badUser?"missing_owner":oldOwner,
      "Synthetic empty base","Private fixture note",
      1792030400000,1792030500000)
  if(withDocs){
    db.prepare("INSERT INTO agent_studio_kb_documents VALUES(?,?,?,?,?)")
      .run("doc1","old_kb_123456",oldOwner,privateText,80)
  }
  db.close()
  const data=readFileSync(snapshot)
  const sha=createHash("sha256").update(data).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    sha256:sha,bytes:data.length,
    tables:{agent_studio_kb_bases:1,
      agent_studio_kb_documents:withDocs?1:0},
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{old_id:oldOwner,new_studio_user_id:toUuid,
      verified_by:"Test-only reviewer",
      approved_at:"2026-10-15T00:00:00Z"}],
  }))
  return {temp,snapshot,manifest,mapping}
}
const invoke=(f,mode="--plan",extra={})=>spawnSync(process.execPath,[
  "--experimental-strip-types",cli,mode,
  "--snapshot",f.snapshot,"--manifest",f.manifest,
  "--mapping",f.mapping,
],{cwd:root,encoding:"utf8",timeout:30000,
  env:{...process.env,...extra}})
test("KB CLI --plan creates a redacted offline report, never contacts PostgreSQL",()=>{
  const f=fixture()
  try{
    const out=invoke(f)
    assert.equal(out.status,0,out.stderr)
    const data=JSON.parse(out.stdout)
    assert.equal(data.operation,"plan_only")
    assert.equal(data.compatible_bases,1)
    assert.equal(data.blocked_bases,0)
    assert.equal(data.result,"dry_run_only")
    assert.equal(data.production_cutover_allowed,false)
    assert.equal(data.secret_values_exported,false)
    for(const value of [oldOwner,toUuid,"old_kb_123456",privateText,
      "Private fixture note"]){
      assert.ok(!out.stdout.includes(value))
      assert.ok(!out.stderr.includes(value))
    }
    const forbidden=invoke(f,"--execute")
    assert.equal(forbidden.status,1)
    assert.match(forbidden.stderr,/stage_kb_import_disabled/)
    const wrong=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"database.production.invalid",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    })
    assert.equal(wrong.status,1)
    assert.match(wrong.stderr,/unsafe_kb_postgres_target/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("existing KB documents prevent false-positive metadata migration",()=>{
  const f=fixture({withDocs:true})
  try{
    const out=invoke(f)
    assert.equal(out.status,2)
    const data=JSON.parse(out.stdout)
    assert.equal(data.compatible_bases,0)
    assert.equal(data.blocked_bases,1)
    assert.equal(data.blockers.legacy_kb_documents_vectors_or_acl_not_migrated,1)
    assert.equal(data.result,"blocked_no_write")
    assert.ok(!out.stdout.includes(privateText))
    const execution=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED:"true",
    })
    assert.equal(execution.status,2,"incompatible batch must not reach database")
    assert.doesNotMatch(execution.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("KB source and approved UUID map are bound to the exact SHA256 manifest",()=>{
  const f=fixture({badUser:true})
  try{
    const orphan=invoke(f)
    assert.equal(orphan.status,2)
    assert.equal(JSON.parse(orphan.stdout).blockers.legacy_kb_identity_unmapped,1)
    const raw=JSON.parse(readFileSync(f.manifest,"utf8"))
    writeFileSync(f.manifest,JSON.stringify({...raw,sha256:"0".repeat(64)}))
    const tamper=invoke(f)
    assert.equal(tamper.status,1)
    assert.match(tamper.stderr,/kb_snapshot_sha256_mismatch/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
