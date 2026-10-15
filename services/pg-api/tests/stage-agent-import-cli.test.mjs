// Tests the opt-in CLI reading only a verified offline SQLite snapshot.
// No actual PostgreSQL connection is created by these tests.
import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {DatabaseSync} from "node:sqlite"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const script=path.join(root,"services/pg-api/src/stage-agent-import-cli.ts")
const owner="old_a"
const target="11111111-1111-4111-8111-111111111111"
const sensitive="PRIVATE_CONFIDENTIAL_AGENT_INSTRUCTIONS_DO_NOT_EXPORT"
const spec=()=>({
  goal:"Prepare public due diligence",
  task_scope:"Public materials only",
  deliverables:["Brief notes"],task_plan:["Review"],
  done_criteria:["Uncertainties"],tools:["summarize"],
  knowledge_base_ids:[],require_approval:true,
})
function fixture(transform=(s=>s)){
  const dir=mkdtempSync(path.join(tmpdir(),"pg-stage-import-fixture-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"snapshot.sqlite.manifest.json")
  const mapping=path.join(dir,"approved.json")
  const db=new DatabaseSync(snapshot)
  db.exec("CREATE TABLE studio_users(id TEXT PRIMARY KEY);"+
    "CREATE TABLE agent_specs(id TEXT PRIMARY KEY,rh_user_id TEXT,"+
    "name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT);"+
    "CREATE TABLE model_connections(id TEXT PRIMARY KEY,api_key TEXT);")
  db.prepare("INSERT INTO studio_users VALUES(?)").run(owner)
  db.prepare("INSERT INTO agent_specs VALUES(?,?,?,?,?,?,?,?)").run(
    "legacy-spec-A",owner,"Synthetic Agent",JSON.stringify(transform(spec())),
    "","","2026-10-14 09:00:00.000Z","2026-10-14 12:00:00.000Z")
  db.prepare("INSERT INTO model_connections VALUES('secret',?)").run(sensitive)
  db.close()
  const file=readFileSync(snapshot)
  const sha=createHash("sha256").update(file).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:file.length,sha256:sha,
    tables:{agent_specs:1},
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{old_id:owner,new_studio_user_id:target,
      verified_by:"Test operator",approved_at:"2026-10-15T00:00:00Z"}],
  }))
  return {dir,snapshot,manifest,mapping}
}
const exec=(fixture,mode="--plan",env={})=>spawnSync(process.execPath,[
  "--experimental-strip-types",script,mode,
  "--snapshot",fixture.snapshot,"--manifest",fixture.manifest,
  "--mapping",fixture.mapping,
],{cwd:root,encoding:"utf8",timeout:30000,env:{...process.env,...env}})
test("stage agent CLI dry-run reports compatible count and never exports secrets",()=>{
  const f=fixture()
  try{
    const x=exec(f)
    assert.equal(x.status,0,x.stderr)
    const report=JSON.parse(x.stdout)
    assert.equal(report.mode,"plan_only")
    assert.equal(report.compatible_records,1)
    assert.equal(report.incompatible_records,0)
    assert.equal(report.production_cutover_allowed,false)
    assert.equal(report.result,"dry_run_only")
    assert.equal(report.contains_content,false)
    assert.equal(report.contains_user_ids,false)
    for(const secret of [sensitive,owner,target,
      "Prepare public due diligence","Synthetic Agent"]){
      assert.ok(!x.stdout.includes(secret))
      assert.ok(!x.stderr.includes(secret))
    }
    const noPermission=exec(f,"--execute")
    assert.equal(noPermission.status,1)
    assert.match(noPermission.stderr,/stage_import_disabled/)
    const unsafeTarget=exec(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"production.company.invalid",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
    })
    assert.equal(unsafeTarget.status,1)
    assert.match(unsafeTarget.stderr,/unsafe_stage_connection/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("unsafe features block ALL stage imports without exposing source records",()=>{
  const f=fixture(s=>({...s,knowledge_base_ids:["old_kb_private"]}))
  try{
    const x=exec(f)
    assert.equal(x.status,2)
    const report=JSON.parse(x.stdout)
    assert.equal(report.compatible_records,0)
    assert.equal(report.incompatible_records,1)
    assert.equal(report.result,"blocked_lossless_import_required")
    assert.equal(report.blocker_codes.legacy_spec_requires_lossless_feature_mapping,1)
    assert.ok(!x.stdout.includes("old_kb_private"))
    const run=exec(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED:"true",
    })
    assert.equal(run.status,2)
    assert.doesNotMatch(run.stderr,/ECONNREFUSED|connect ETIMEDOUT/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("CLI rejects tampered snapshot or mapping and cannot touch running PocketBase",()=>{
  const f=fixture()
  try{
    const data=JSON.parse(readFileSync(f.mapping,"utf8"))
    writeFileSync(f.mapping,JSON.stringify({...data,
      source_sha256:"0".repeat(64)}))
    const mapped=exec(f)
    assert.equal(mapped.status,1)
    assert.match(mapped.stderr,/mapping_not_approved_for_snapshot/)
    const corrupted=JSON.parse(readFileSync(f.manifest,"utf8"))
    writeFileSync(f.manifest,JSON.stringify({...corrupted,
      sha256:"f".repeat(64)}))
    const tampered=exec(f)
    assert.equal(tampered.status,1)
    assert.match(tampered.stderr,/snapshot_file_hash_mismatch/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
