import test from "node:test"
import assert from "node:assert/strict"
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createHash} from "node:crypto"
import {DatabaseSync} from "node:sqlite"
import {spawnSync} from "node:child_process"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const cli=path.join(root,"services/pg-api/src/stage-kb-atomic-import-cli.ts")
const secret="PRIVATE_SOURCE_VECTOR_API_SECRET_NEVER_LOG"
function fixture({withContent=true}={}){
  const dir=mkdtempSync(path.join(tmpdir(),"kb-atomic-cli-fixture-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"approved-id-map.json")
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY);"+
    "CREATE TABLE agent_studio_kb_bases("+
    "id TEXT,rh_user_id TEXT,name TEXT,description TEXT,"+
    "created_ms INTEGER,updated_ms INTEGER);"+
    "CREATE TABLE model_connections(id TEXT,rh_user_id TEXT,api_key TEXT);"+
    "CREATE TABLE agent_studio_kb_documents("+
    "id TEXT,base_id TEXT,rh_user_id TEXT,filename TEXT,"+
    "size_chars INTEGER,chunk_count INTEGER,created_ms INTEGER);"+
    "CREATE TABLE agent_studio_kb_chunks("+
    "id TEXT,base_id TEXT,document_id TEXT,rh_user_id TEXT,"+
    "chunk_index INTEGER,text_content TEXT);"+
    "CREATE TABLE agent_studio_kb_vectors("+
    "chunk_id TEXT,rh_user_id TEXT,base_id TEXT,document_id TEXT,"+
    "connection_id TEXT,model_name TEXT,dimensions INTEGER,"+
    "vector_json TEXT,indexed_ms INTEGER);",
  )
  db.prepare("INSERT INTO studio_users VALUES(?)").run("employee0000001")
  db.prepare("INSERT INTO agent_studio_kb_bases VALUES(?,?,?,?,?,?)")
    .run("baseA","employee0000001","Synthetic KB","",
      1792030400000,1792030400000)
  db.prepare("INSERT INTO model_connections VALUES(?,?,?)")
    .run("connection00001","employee0000001",secret)
  if(withContent){
    db.prepare("INSERT INTO agent_studio_kb_documents VALUES(?,?,?,?,?,?,?)")
      .run("docA","baseA","employee0000001","private_document.txt",12,1,1792030400123)
    db.prepare("INSERT INTO agent_studio_kb_chunks VALUES(?,?,?,?,?,?)")
      .run("chunkA","baseA","docA","employee0000001",0,"PRIVATE_KB_TEXT_NEVER_LOG")
    db.prepare("INSERT INTO agent_studio_kb_vectors VALUES(?,?,?,?,?,?,?,?,?)")
      .run("chunkA","employee0000001","baseA","docA","connection00001",
        "legacy-model",3,"[ 1.0, -0.0, 2e-3 ]",1792030400456)
  }
  const tables=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all()
    .map(x=>String(x.name))
  const count=Object.fromEntries(tables.map(table=>[
    table,Number(db.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n),
  ]))
  db.close()
  const data=readFileSync(snapshot)
  const sha=createHash("sha256").update(data).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:data.length,sha256:sha,tables:count,
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{
      old_id:"employee0000001",
      new_studio_user_id:"11111111-1111-4111-8111-111111111111",
      verified_by:"TEST-ONLY reviewer",
      approved_at:"2026-10-15T00:00:00Z",
    }],
  }))
  return {dir,snapshot,manifest,mapping}
}
function invoke(f,mode="--plan",env={}){
  return spawnSync(process.execPath,[
    "--experimental-strip-types",cli,mode,
    "--snapshot",f.snapshot,"--manifest",f.manifest,
    "--mapping",f.mapping,
  ],{cwd:root,encoding:"utf8",timeout:22000,env:{
    ...process.env,
    AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED:"false",
    ...env,
  }})
}
test("atomic KB CLI --plan checks verified frozen content without PG and redacts all identities",()=>{
  const f=fixture()
  try{
    const outcome=invoke(f)
    assert.equal(outcome.status,0,outcome.stderr)
    const r=JSON.parse(outcome.stdout)
    assert.equal(r.result,"dry_run_only")
    assert.equal(r.metadata_bases_with_content,1)
    assert.deepEqual(r.content_records,{documents:1,chunks:1,vectors:1})
    assert.equal(r.old_content_in_runtime_rag,false)
    assert.equal(r.old_acl_activated,false)
    assert.equal(r.production_cutover_allowed,false)
    for(const marker of [
      secret,"employee0000001","private_document.txt",
      "PRIVATE_KB_TEXT_NEVER_LOG","connection00001",
      "11111111-1111-4111-8111-111111111111",
    ])assert.ok(!outcome.stdout.includes(marker)&&
      !outcome.stderr.includes(marker),"should not expose source content")
    const denied=invoke(f,"--execute")
    assert.equal(denied.status,1)
    assert.match(denied.stderr,/atomic_stage_import_disabled/)
    assert.equal(denied.stdout,"")
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("even opted-in execute refuses unsafe database targets without network access",()=>{
  const f=fixture()
  try{
    const bad=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"production.database.internal",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    })
    assert.equal(bad.status,1)
    assert.match(bad.stderr,/unsafe_postgres_target/)
    assert.doesNotMatch(bad.stderr,/ECONNREFUSED|ENOTFOUND/)
    const missingSecret=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"127.0.0.1",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    })
    assert.equal(missingSecret.status,1)
    assert.match(missingSecret.stderr,/stage_secret_file_required/)
    assert.doesNotMatch(missingSecret.stderr,/ECONNREFUSED/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("tampered snapshot and reviewed mapping are blocked before a DB connection",()=>{
  const f=fixture()
  try{
    const bad=JSON.parse(readFileSync(f.manifest,"utf8"))
    bad.sha256="0".repeat(64)
    writeFileSync(f.manifest,JSON.stringify(bad))
    const outcome=invoke(f)
    assert.equal(outcome.status,1)
    assert.equal(outcome.stdout,"")
    assert.ok(!outcome.stderr.includes(secret))
    assert.match(outcome.stderr,/atomic_stage_import_failed/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("empty content is explicitly not reported as an executed archive",()=>{
  const f=fixture({withContent:false})
  try{
    const planned=invoke(f)
    assert.equal(planned.status,0,planned.stderr)
    const result=JSON.parse(planned.stdout)
    assert.equal(result.metadata_bases_with_content,0)
    assert.deepEqual(result.content_records,{documents:0,chunks:0,vectors:0})
    const denied=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED:"true",
    })
    assert.equal(denied.status,1)
    assert.match(denied.stderr,/no_atomic_content_to_import/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
