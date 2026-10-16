import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {createHash} from "node:crypto"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {DatabaseSync} from "node:sqlite"
import {contentHash} from "../src/stage-agent-import.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const cli=path.join(root,"services/pg-api/src/stage-domain-import-cli.ts")
const operator=path.join(root,"ops/pg-stage-operator.mjs")
const owner="aaaaaaaaaaaaaaa"
const schedule="bbbbbbbbbbbbbbb"
const run="ccccccccccccccc"
const occurrence="ddddddddddddddd"
const pgOwner="11111111-1111-4111-8111-111111111111"
const reviewedAt="2026-10-16T00:00:00Z"
const reviewBy="Synthetic external reviewer"
const h=(x)=>createHash("sha256").update(x).digest("hex")
function source(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"w28-cli-synthetic-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"mapping.json")
  const oidc=path.join(dir,"oidc.json")
  const approval=path.join(dir,"approval.json")
  const row={
    id:occurrence,schedule_id:schedule,rh_user_id:owner,
    scheduled_for_ms:1792090200123,schedule_revision:1,run_id:run,
    status:"running",attempts:2,locked_until_ms:1792090270000,
    next_retry_ms:1792090299000,error:"SYNTHETIC_PAST_FAILURE_PRIVATE",
    created_ms:1792090200200,updated_ms:1792090200300,
  }
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);"+
    "CREATE TABLE agent_studio_schedules(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE agent_runs(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE agent_studio_schedule_occurrences("+
    "id TEXT PRIMARY KEY,schedule_id TEXT,rh_user_id TEXT,"+
    "scheduled_for_ms INTEGER,schedule_revision INTEGER,run_id TEXT,status TEXT,"+
    "attempts INTEGER,locked_until_ms INTEGER,next_retry_ms INTEGER,error TEXT,"+
    "created_ms INTEGER,updated_ms INTEGER)"
  )
  db.prepare("INSERT INTO studio_users VALUES(?,?)")
    .run(owner,"SYNTHETIC_PRIVATE_USER_CREDENTIAL_DO_NOT_ECHO")
  db.prepare("INSERT INTO agent_studio_schedules VALUES(?,?)").run(schedule,owner)
  db.prepare("INSERT INTO agent_runs VALUES(?,?)").run(run,owner)
  db.prepare("INSERT INTO agent_studio_schedule_occurrences VALUES("+
    Object.keys(row).map(()=>"?").join(",")+")").run(...Object.values(row))
  const tables=Object.fromEntries(db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'"
  ).all().map(r=>[r.name,db.prepare(
    'SELECT COUNT(*) AS n FROM "'+r.name+'"').get().n]))
  db.close()
  const bytes=fs.readFileSync(snapshot)
  const sha=h(bytes)
  fs.writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:sha,
    records:[{old_id:owner,new_studio_user_id:pgOwner,
      verified_by:"Independent synthetic ID reviewer",approved_at:reviewedAt}],
  }))
  fs.writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",bytes:bytes.length,sha256:sha,tables,
    schedule_occurrence_archive_review:{
      source_sha256:sha,identity_mapping_sha256:h(fs.readFileSync(mapping)),
      credentials_absent:true,verified_by:reviewBy,approved_at:reviewedAt,
      tables:{agent_studio_schedule_occurrences:{row_sha256:[contentHash(row)]}},
    },
  }))
  fs.writeFileSync(oidc,JSON.stringify({
    schema_version:"studio-reviewed-oidc-provision-v1",source_sha256:sha,
    records:[{old_id:owner,new_studio_user_id:pgOwner,
      external_issuer:"https://synthetic.identity.invalid",
      external_subject:"synthetic-subject",
      reviewed_by:"Separate synthetic IdP reviewer",reviewed_at:reviewedAt}],
  }))
  fs.writeFileSync(approval,JSON.stringify({
    source_sha256:sha,approved_by:"Synthetic source auditor",approved_at:reviewedAt,
  }))
  return {dir,snapshot,manifest,mapping,oidc,approval}
}
function invoke(f,execute=false,extras=[],env={}){
  return spawnSync(process.execPath,[
    "--experimental-strip-types",cli,execute?"--execute":"--plan",
    "--domain","schedule-occurrences",
    "--snapshot",f.snapshot,"--manifest",f.manifest,
    "--mapping",f.mapping,...extras,
  ],{cwd:root,encoding:"utf8",timeout:35000,env:{
    ...process.env,AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED:"false",...env,
  }})
}
test("reviewed W28 occurrence history plan is accepted offline; all old leases/jobs remain inactive",()=>{
  const f=source()
  try{
    const out=invoke(f)
    assert.equal(out.status,0,out.stderr)
    const info=JSON.parse(out.stdout)
    assert.equal(info.domain,"schedule-occurrences")
    assert.equal(info.source_rows,1)
    assert.equal(info.result,"source_plan_verified")
    assert.equal(info.old_schedules_enabled,false)
    assert.equal(info.historical_runs_replayed,false)
    assert.equal(info.production_cutover_allowed,false)
    for(const raw of [owner,run,schedule,occurrence,pgOwner,
      "SYNTHETIC_PAST_FAILURE_PRIVATE",f.snapshot]){
      assert.ok(!out.stdout.includes(raw)&&!out.stderr.includes(raw),
        "history identity must stay out of diagnostic output")
    }
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("W28 execution requires explicit reviewed stage, opt-in and safe DB target",()=>{
  const f=source()
  try{
    const noConfirm=invoke(f,true)
    assert.equal(noConfirm.status,1)
    assert.match(noConfirm.stderr,/operator_stage_confirmation_required/)
    const disabled=invoke(f,true,["--confirm-stage","agentstudio_stage"])
    assert.equal(disabled.status,1)
    assert.match(disabled.stderr,/stage_domain_import_disabled/)
    const unsafe=invoke(f,true,["--confirm-stage","agentstudio_stage"],{
      AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"prod.internal.invalid",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    })
    assert.equal(unsafe.status,1)
    assert.match(unsafe.stderr,/unsafe_stage_domain_database_target/)
    assert.doesNotMatch(unsafe.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("missing row-level source review blocks W28 without a database connection",()=>{
  const f=source()
  try{
    const manifest=JSON.parse(fs.readFileSync(f.manifest,"utf8"))
    delete manifest.schedule_occurrence_archive_review
    fs.writeFileSync(f.manifest,JSON.stringify(manifest))
    const out=invoke(f)
    assert.equal(out.status,1)
    assert.equal(out.stdout,"")
    assert.match(out.stderr,/stage_domain_import_failed/)
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
test("unified operator dispatches W28 occurrence_history rather than dropping nonempty source history",()=>{
  const f=source()
  try{
    const out=spawnSync(process.execPath,[
      operator,"--plan",
      "--snapshot",f.snapshot,"--manifest",f.manifest,
      "--mapping",f.mapping,"--oidc",f.oidc,"--approval",f.approval,
    ],{cwd:root,encoding:"utf8",timeout:45000,
      env:{...process.env,AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:"false"}})
    assert.equal(out.status,2,out.stderr)
    const info=JSON.parse(out.stdout)
    assert.equal(info.unmapped_nonempty_tables,0)
    assert.ok(info.phase_results.some(x=>
      x.phase==="occurrence_history"&&x.status==="passed"))
    assert.equal(info.result,"preflight_blocked")
    assert.equal(info.production_cutover_allowed,false)
    assert.ok(!out.stdout.includes("SYNTHETIC_PAST_FAILURE_PRIVATE"))
  }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
})
