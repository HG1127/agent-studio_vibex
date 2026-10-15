import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {DatabaseSync} from "node:sqlite"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const cli=path.join(root,"services/pg-api/src/stage-domain-import-cli.ts")
const owner="employee0000001"
const uuid="11111111-1111-4111-8111-111111111111"
const confidential="PRIVATE_LEGACY_WORKFLOW_PROMPT_NEVER_REPORT"
const archived=[
  "workflows","agent_studio_schedules",
  "agent_studio_spec_access","agent_studio_kb_access",
  "agent_studio_spec_proposals","agent_studio_kb_access_events",
  "agent_studio_spec_collab_audit","agent_studio_spec_revisions",
  "agent_runs",
]
function fixture({legacyWorkflow=false}={}){
  const dir=mkdtempSync(path.join(tmpdir(),"stage-domain-import-synthetic-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"reviewed-identity.json")
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);"+
    "CREATE TABLE agent_specs(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    archived.map(name=>'CREATE TABLE "'+name+'"(id TEXT)').join(";")+";"
  )
  db.prepare("INSERT INTO studio_users VALUES(?,?)").run(owner,confidential)
  if(legacyWorkflow)db.prepare("INSERT INTO workflows VALUES(?)").run(confidential)
  const tables=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' "+
    "AND name NOT GLOB 'sqlite_*' ORDER BY name").all()
    .map(row=>String(row.name))
  const counts=Object.fromEntries(tables.map(name=>[
    name,Number(db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n),
  ]))
  db.close()
  const bytes=readFileSync(snapshot)
  const sha=createHash("sha256").update(bytes).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:bytes.length,sha256:sha,tables:counts,
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{old_id:owner,new_studio_user_id:uuid,
      verified_by:"Synthetic independent reviewer",
      approved_at:"2026-10-15T00:00:00Z"}],
  }))
  return {dir,snapshot,manifest,mapping}
}
function invoke(f,domain,mode="--plan",args=[],env={}){
  return spawnSync(process.execPath,[
    "--experimental-strip-types",cli,mode,
    "--domain",domain,"--snapshot",f.snapshot,
    "--manifest",f.manifest,"--mapping",f.mapping,...args,
  ],{cwd:root,encoding:"utf8",timeout:22000,env:{
    ...process.env,AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED:"false",
    ...env,
  }})
}
test("four independent empty legacy business domains are safely skipped after COMPLETE frozen manifest review",()=>{
  const f=fixture()
  try{
    for(const domain of ["workflow","schedules","collaboration","history"]){
      const result=invoke(f,domain)
      assert.equal(result.status,0,domain+" "+result.stderr)
      const report=JSON.parse(result.stdout)
      assert.equal(report.domain,domain)
      assert.equal(report.source_rows,0)
      assert.equal(report.result,"no_source_records")
      assert.equal(report.production_cutover_allowed,false)
      assert.equal(report.source_read_only,true)
      assert.equal(report.historical_runs_replayed,false)
      for(const privateValue of [owner,uuid,confidential,f.snapshot]){
        assert.ok(!result.stdout.includes(privateValue)&&
          !result.stderr.includes(privateValue))
      }
    }
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("explicit operator scope and stage opt-in are mandatory before any database contact",()=>{
  const f=fixture()
  try{
    const noConfirm=invoke(f,"workflow","--execute")
    assert.equal(noConfirm.status,1)
    assert.match(noConfirm.stderr,/operator_stage_confirmation_required/)
    const noFlag=invoke(f,"workflow","--execute",[
      "--confirm-stage","agentstudio_stage",
    ])
    assert.equal(noFlag.status,1)
    assert.match(noFlag.stderr,/stage_domain_import_disabled/)
    assert.doesNotMatch(noFlag.stderr,/ECONNREFUSED|ENOTFOUND/)
    const wrong=invoke(f,"workflow","--execute",[
      "--confirm-stage","production",
    ],{AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED:"true"})
    assert.equal(wrong.status,1)
    assert.match(wrong.stderr,/operator_stage_confirmation_required/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("omitted SQLite collection in valid-SHA manifest aborts even the zero-row plan",()=>{
  const f=fixture()
  try{
    const info=JSON.parse(readFileSync(f.manifest,"utf8"))
    delete info.tables.agent_studio_spec_revisions
    writeFileSync(f.manifest,JSON.stringify(info))
    const result=invoke(f,"workflow")
    assert.equal(result.status,1)
    assert.match(result.stderr,/stage_manifest_incomplete/)
    assert.equal(result.stdout,"")
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("existing unsupported workflow content cannot be silently erased or migrated",()=>{
  const f=fixture({legacyWorkflow:true})
  try{
    const out=invoke(f,"workflow")
    assert.equal(out.status,1)
    assert.match(out.stderr,/stage_domain_import_failed/)
    assert.equal(out.stdout,"")
    assert.doesNotMatch(out.stderr,/PRIVATE_LEGACY|employee0000001/)
    const execute=invoke(f,"workflow","--execute",[
      "--confirm-stage","agentstudio_stage",
    ],{AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED:"true"})
    assert.equal(execute.status,1)
    assert.doesNotMatch(execute.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("a fully compatible nonempty Workflow passes offline preparation without connecting PG",()=>{
  const f=fixture()
  try{
    const db=new DatabaseSync(f.snapshot)
    db.exec(
      "DROP TABLE workflows;"+
      "CREATE TABLE workflows(id TEXT,rh_user_id TEXT,name TEXT,"+
      "graph TEXT,require_approval INTEGER,created TEXT,updated TEXT)"
    )
    const graph={nodes:[
      {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
      {id:"end",type:"end",data:{title:"End"},position:{x:10,y:20}},
    ],edges:[{id:"e",source:"start",target:"end"}]}
    db.prepare("INSERT INTO workflows VALUES(?,?,?,?,?,?,?)").run(
      "aaaaaaaaaaaaaaa",owner,"Synthetic workflow",
      JSON.stringify(graph),1,
      "2026-10-14 09:00:00.000Z","2026-10-14 10:00:00.000Z",
    )
    db.close()
    const buf=readFileSync(f.snapshot)
    const sha=createHash("sha256").update(buf).digest("hex")
    const meta=JSON.parse(readFileSync(f.manifest,"utf8"))
    meta.sha256=sha;meta.bytes=buf.length;meta.tables.workflows=1
    writeFileSync(f.manifest,JSON.stringify(meta))
    const map=JSON.parse(readFileSync(f.mapping,"utf8"))
    map.source_sha256=sha;writeFileSync(f.mapping,JSON.stringify(map))
    const result=invoke(f,"workflow")
    assert.equal(result.status,0,result.stderr)
    const report=JSON.parse(result.stdout)
    assert.equal(report.result,"source_plan_verified")
    assert.equal(report.domain,"workflow")
    assert.equal(report.source_rows,1)
    assert.equal(report.old_workflows_executable,false)
    assert.equal(report.production_cutover_allowed,false)
    assert.ok(!result.stdout.includes(owner))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})

test("unreviewed identity map is rejected in every domain before domain preparation",()=>{
  const f=fixture()
  try{
    const doc=JSON.parse(readFileSync(f.mapping,"utf8"))
    doc.records[0].verified_by=""
    writeFileSync(f.mapping,JSON.stringify(doc))
    for(const domain of ["workflow","schedules","collaboration","history"]){
      const result=invoke(f,domain)
      assert.equal(result.status,1)
      assert.match(result.stderr,/stage_employee_mapping_unapproved/)
    }
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
