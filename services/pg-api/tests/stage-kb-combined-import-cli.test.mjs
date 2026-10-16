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
const cli=path.join(root,"services/pg-api/src/stage-kb-combined-import-cli.ts")
const secret="SYNTHETIC_PRIVATE_MODEL_KEY_NEVER_ECHO"
const body="SYNTHETIC_PRIVATE_DOC_TEXT_NEVER_ECHO"
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"combined-kb-cli-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"identity-map.json")
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY);"+
    "CREATE TABLE agent_studio_kb_bases("+
    "id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,description TEXT,created_ms INTEGER,updated_ms INTEGER);"+
    "CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT);"+
    "CREATE TABLE agent_studio_kb_documents("+
    "id TEXT PRIMARY KEY,base_id TEXT,rh_user_id TEXT,filename TEXT,size_chars INTEGER,chunk_count INTEGER,created_ms INTEGER);"+
    "CREATE TABLE agent_studio_kb_chunks("+
    "id TEXT PRIMARY KEY,base_id TEXT,document_id TEXT,rh_user_id TEXT,chunk_index INTEGER,text_content TEXT);"+
    "CREATE TABLE agent_studio_kb_vectors("+
    "chunk_id TEXT PRIMARY KEY,rh_user_id TEXT,base_id TEXT,document_id TEXT,connection_id TEXT,model_name TEXT,dimensions INTEGER,vector_json TEXT,indexed_ms INTEGER);"+
    "CREATE TABLE agent_studio_kb_embedding_settings("+
    "rh_user_id TEXT PRIMARY KEY,connection_id TEXT,model_name TEXT,updated_ms INTEGER);"+
    "CREATE TABLE agent_studio_kb_embedding_queue("+
    "rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER,PRIMARY KEY(rh_user_id,base_id))"
  )
  db.prepare("INSERT INTO studio_users VALUES(?)").run("employee0000001")
  db.prepare("INSERT INTO agent_studio_kb_bases VALUES(?,?,?,?,?,?)").run(
    "baseA","employee0000001","Synthetic KB","",1792030400000,1792030400000)
  db.prepare("INSERT INTO model_connections VALUES(?,?,?)")
    .run("connA","employee0000001",secret)
  db.prepare("INSERT INTO agent_studio_kb_documents VALUES(?,?,?,?,?,?,?)").run(
    "docA","baseA","employee0000001","private-filename.txt",12,1,1792030400100)
  db.prepare("INSERT INTO agent_studio_kb_chunks VALUES(?,?,?,?,?,?)").run(
    "chunkA","baseA","docA","employee0000001",0,body)
  db.prepare("INSERT INTO agent_studio_kb_vectors VALUES(?,?,?,?,?,?,?,?,?)").run(
    "chunkA","employee0000001","baseA","docA","connA","synthetic-model",3,
    "[ 1.0, -0.0, 2e-3 ]",1792030400130)
  db.prepare("INSERT INTO agent_studio_kb_embedding_settings VALUES(?,?,?,?)").run(
    "employee0000001","connA","synthetic-embedding-model",1792030400110)
  db.prepare("INSERT INTO agent_studio_kb_embedding_queue VALUES(?,?,?,?,?,?,?)").run(
    "employee0000001","baseA",2,1792030400200,1792030400300,
    "PRIVATE_SYNTHETIC_ERROR_TEXT",1792030400400)
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'")
    .all().map(x=>String(x.name))
  const counts=Object.fromEntries(names.map(name=>[name,
    Number(db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n)]))
  db.close()
  const bytes=fs.readFileSync(snapshot)
  const sha=createHash("sha256").update(bytes).digest("hex")
  fs.writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    sha256:sha,bytes:bytes.length,tables:counts,
  }))
  fs.writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{old_id:"employee0000001",
      new_studio_user_id:"11111111-1111-4111-8111-111111111111",
      verified_by:"Synthetic reviewer",approved_at:"2026-10-15T00:00:00Z"}],
  }))
  return {dir,snapshot,manifest,mapping}
}
function invoke(f,mode="--plan",extra={},more=[]){
  return spawnSync(process.execPath,[
    "--experimental-strip-types",cli,mode,
    "--snapshot",f.snapshot,"--manifest",f.manifest,
    "--mapping",f.mapping,...more,
  ],{cwd:root,encoding:"utf8",timeout:28000,env:{
    ...process.env,AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED:"false",...extra,
  }})
}
test("combined W2/W6/W16 offline plan verifies all related data without a PG connection",()=>{
  const f=fixture()
  try{
    const result=invoke(f)
    assert.equal(result.status,0,result.stderr)
    const report=JSON.parse(result.stdout)
    assert.equal(report.result,"verified_frozen_combined_source")
    assert.equal(report.knowledge_archive_only,true)
    assert.equal(report.source_read_only,true)
    assert.equal(report.rag_enabled,false)
    assert.equal(report.embedding_enabled,false)
    assert.equal(report.production_cutover_allowed,false)
    for(const privateValue of [secret,body,"employee0000001",
      "private-filename.txt","11111111-1111-4111-8111-111111111111",f.snapshot]){
      assert.ok(!result.stdout.includes(privateValue))
      assert.ok(!result.stderr.includes(privateValue))
    }
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("combined execution defaults disabled and blocks unapproved target before PG access",()=>{
  const f=fixture()
  try{
    const plain=invoke(f,"--execute")
    assert.equal(plain.status,1)
    assert.match(plain.stderr,/isolated_kb_stage_confirmation_required/)
    const disabled=invoke(f,"--execute",{},["--confirm-stage","agentstudio_stage"])
    assert.equal(disabled.status,1)
    assert.match(disabled.stderr,/kb_combined_stage_disabled/)
    const unsafe=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"production.invalid",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    },["--confirm-stage","agentstudio_stage"])
    assert.equal(unsafe.status,1)
    assert.match(unsafe.stderr,/kb_combined_stage_target_unsafe/)
    assert.doesNotMatch(unsafe.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("tampered complete snapshot refuses before networking without revealing content",()=>{
  const f=fixture()
  try{
    const bad=JSON.parse(fs.readFileSync(f.manifest,"utf8"))
    bad.sha256="f".repeat(64)
    fs.writeFileSync(f.manifest,JSON.stringify(bad))
    const result=invoke(f)
    assert.equal(result.status,1)
    assert.match(result.stderr,/kb_combined_stage_failed/)
    assert.equal(result.stdout,"")
    assert.doesNotMatch(result.stderr,/SYNTHETIC_PRIVATE/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
