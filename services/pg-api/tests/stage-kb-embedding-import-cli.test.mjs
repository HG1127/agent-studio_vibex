import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {createHash} from "node:crypto"
import {fileURLToPath} from "node:url"
import {spawnSync} from "node:child_process"
import {DatabaseSync} from "node:sqlite"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const cli=path.join(root,"services/pg-api/src/stage-kb-embedding-import-cli.ts")
const secretMarker="DO_NOT_ECHO_SYNTHETIC_MODEL_KEY"
const textMarker="PRIVATE_QUEUE_ERROR_TRACE_NEVER_ECHO"
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"w16-embedding-cli-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"reviewed-map.json")
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY);"+
    "CREATE TABLE agent_studio_kb_bases(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT);"+
    "CREATE TABLE agent_studio_kb_embedding_settings("+
    "rh_user_id TEXT PRIMARY KEY,connection_id TEXT,model_name TEXT,updated_ms INTEGER);"+
    "CREATE TABLE agent_studio_kb_embedding_queue("+
    "rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,"+
    "lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER)"
  )
  db.prepare("INSERT INTO studio_users VALUES(?)").run("staffA")
  db.prepare("INSERT INTO agent_studio_kb_bases VALUES(?,?)")
    .run("baseA","staffA")
  db.prepare("INSERT INTO model_connections VALUES(?,?,?)")
    .run("connA","staffA",secretMarker)
  db.prepare("INSERT INTO agent_studio_kb_embedding_settings VALUES(?,?,?,?)")
    .run("staffA","connA","Synthetic test embedding model  ",1792030400123)
  db.prepare("INSERT INTO agent_studio_kb_embedding_queue VALUES(?,?,?,?,?,?,?)")
    .run("staffA","baseA",4,1792030400654,1792030400678,
      textMarker,1792030400999)
  const tables=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'"
  ).all().map(row=>String(row.name))
  const counts=Object.fromEntries(tables.map(name=>[
    name,Number(db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n),
  ]))
  db.close()
  const data=fs.readFileSync(snapshot)
  const source=createHash("sha256").update(data).digest("hex")
  fs.writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    sha256:source,bytes:data.length,tables:counts,
  }))
  fs.writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:source,
    records:[{
      old_id:"staffA",
      new_studio_user_id:"11111111-1111-4111-8111-111111111111",
      verified_by:"Synthetic reviewer",
      approved_at:"2026-10-15T00:00:00Z",
    }],
  }))
  return {dir,snapshot,manifest,mapping}
}
function call(f,mode="--plan",env={},extras=[]){
  return spawnSync(process.execPath,[
    "--experimental-strip-types",cli,mode,
    "--snapshot",f.snapshot,"--manifest",f.manifest,
    "--mapping",f.mapping,...extras,
  ],{cwd:root,encoding:"utf8",timeout:26000,env:{
    ...process.env,
    AGENT_STUDIO_PG_STAGE_EMBEDDING_ARCHIVE_ENABLED:"false",
    ...env,
  }})
}
test("W16 offline plan checks complete snapshot and emits only redacted counts",()=>{
  const f=fixture()
  try{
    const result=call(f)
    assert.equal(result.status,0,result.stderr)
    const report=JSON.parse(result.stdout)
    assert.equal(report.result,"verified_offline_plan_only")
    assert.equal(report.settings_rows,1)
    assert.equal(report.queue_rows,1)
    assert.equal(report.embedding_enabled,false)
    assert.equal(report.jobs_created,0)
    assert.equal(report.historical_queue_replayed,false)
    assert.equal(report.production_cutover_allowed,false)
    for(const sensitive of [secretMarker,textMarker,"staffA","connA",
      "11111111-1111-4111-8111-111111111111",f.snapshot]){
      assert.ok(!result.stdout.includes(sensitive),"private content in stdout")
      assert.ok(!result.stderr.includes(sensitive),"private content in stderr")
    }
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("W16 execute refuses missing approval, inactive opt-in and unsafe targets before PG",()=>{
  const f=fixture()
  try{
    const absent=call(f,"--execute")
    assert.equal(absent.status,1)
    assert.match(absent.stderr,/stage_confirmation_required/)
    const disabled=call(f,"--execute",{},
      ["--confirm-stage","agentstudio_stage"])
    assert.equal(disabled.status,1)
    assert.match(disabled.stderr,/embedding_stage_import_disabled/)
    const unsafe=call(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_EMBEDDING_ARCHIVE_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"db.production.invalid",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    },["--confirm-stage","agentstudio_stage"])
    assert.equal(unsafe.status,1)
    assert.match(unsafe.stderr,/embedding_stage_target_unsafe/)
    assert.doesNotMatch(unsafe.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("W16 missing stage secret refuses even with proper loopback environment",()=>{
  const f=fixture()
  try{
    const result=call(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_EMBEDDING_ARCHIVE_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"127.0.0.1",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
      AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:"",
    },["--confirm-stage","agentstudio_stage"])
    assert.equal(result.status,1)
    assert.match(result.stderr,/embedding_stage_secret_required/)
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("W16 tampered manifest does not connect or leak raw diagnostics",()=>{
  const f=fixture()
  try{
    const json=JSON.parse(fs.readFileSync(f.manifest,"utf8"))
    json.sha256="0".repeat(64)
    fs.writeFileSync(f.manifest,JSON.stringify(json))
    const invalid=call(f)
    assert.equal(invalid.status,1)
    assert.equal(invalid.stdout,"")
    assert.match(invalid.stderr,/embedding_archive_staging_failed/)
    assert.doesNotMatch(invalid.stderr,/DO_NOT_ECHO|staffA|PRIVATE_QUEUE_ERROR_TRACE/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
