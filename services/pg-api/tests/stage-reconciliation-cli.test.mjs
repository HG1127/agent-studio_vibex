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
const cli=path.join(root,"services/pg-api/src/stage-reconciliation-cli.ts")
const legacyId="employee-confidential-test"
const pgId="11111111-1111-4111-8111-111111111111"
const marker="PRIVATE_REAL_USER_DATA_NEVER_PUBLISH"
function fixture(){
  const dir=mkdtempSync(path.join(tmpdir(),"pg-reconcile-cli-synthetic-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"mapping.json")
  const oidc=path.join(dir,"reviewed-oidc.json")
  const approval=path.join(dir,"approval.json")
  const db=new DatabaseSync(snapshot)
  db.exec("CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);"+
    "CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,name TEXT);")
  db.prepare("INSERT INTO studio_users VALUES(?,?)").run(legacyId,marker)
  db.close()
  const bytes=readFileSync(snapshot)
  const hash=createHash("sha256").update(bytes).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    sha256:hash,bytes:bytes.length,
    tables:{studio_users:1,agent_specs:0},
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:hash,
    records:[{
      old_id:legacyId,
      new_studio_user_id:pgId,
      verified_by:"Synthetic security reviewer",
      approved_at:"2026-10-15T00:00:00Z",
    }],
  }))
  writeFileSync(oidc,JSON.stringify({
    schema_version:"studio-reviewed-oidc-provision-v1",
    source_sha256:hash,
    records:[{
      old_id:legacyId,new_studio_user_id:pgId,
      external_issuer:"https://oidc.example.invalid/tenant/v2.0",
      external_subject:"private-verified-subject",
      reviewed_by:"Synthetic IdP reviewer",
      reviewed_at:"2026-10-15T00:00:00Z",
    }],
  }))
  writeFileSync(approval,JSON.stringify({
    source_sha256:hash,
    approved_by:"Synthetic authorised reviewer",
    approved_at:"2026-10-15T00:01:00Z",
  }))
  return {dir,snapshot,manifest,mapping,approval,oidc}
}
function call(f,mode="--plan",extraEnv={},args=[]){
  return spawnSync(process.execPath,[
    "--experimental-strip-types",cli,mode,
    "--snapshot",f.snapshot,"--manifest",f.manifest,
    "--mapping",f.mapping,"--approval",f.approval,...args,
  ],{cwd:root,encoding:"utf8",timeout:22000,
    env:{...process.env,
      AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED:"false",
      ...extraEnv,
    },
  })
}
test("offline plan reads verified frozen data and emits only domain counts without connecting PG",()=>{
  const f=fixture()
  try{
    const output=call(f)
    assert.equal(output.status,0,output.stderr)
    const info=JSON.parse(output.stdout)
    assert.equal(info.result,"source_inventory_only")
    assert.equal(info.source_verified,true)
    assert.equal(info.production_cutover_allowed,false)
    assert.equal(info.contains_user_ids,false)
    assert.equal(info.contains_secrets,false)
    assert.equal(info.output_complete_source_coverage,false)
    assert.equal(info.domains.find(x=>x.domain==="studio_users").source_count,1)
    assert.equal(info.domains.find(x=>x.domain==="agent_specs").source_count,0)
    assert.equal(info.domains.find(x=>x.domain==="agent_runs").source_count,null)
    for(const personal of [legacyId,pgId,marker, f.snapshot]){
      assert.ok(!output.stdout.includes(personal)&&
        !output.stderr.includes(personal))
    }
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("reviewed OIDC subject can be included for stronger source identity fidelity without DB access",()=>{
  const f=fixture()
  try{
    const out=call(f,"--plan",{},["--reviewed-idp",f.oidc])
    assert.equal(out.status,0,out.stderr)
    const report=JSON.parse(out.stdout)
    assert.equal(report.source_verified,true)
    assert.equal(report.production_cutover_allowed,false)
    assert.ok(!out.stdout.includes("private-verified-subject"))
    assert.ok(!out.stdout.includes(legacyId))
    const bad=JSON.parse(readFileSync(f.oidc,"utf8"))
    bad.source_sha256="a".repeat(64)
    writeFileSync(f.oidc,JSON.stringify(bad))
    const invalid=call(f,"--plan",{},["--reviewed-idp",f.oidc])
    assert.equal(invalid.status,2)
    assert.deepEqual(JSON.parse(invalid.stdout).blockers,
      ["identity_evidence_invalid"])
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("an execute request defaults disabled before connecting to any database",()=>{
  const f=fixture()
  try{
    const blocked=call(f,"--execute")
    assert.equal(blocked.status,1)
    assert.match(blocked.stderr,/reconciliation_disabled/)
    assert.doesNotMatch(blocked.stderr,/ECONNREFUSED|ENOTFOUND/)
    const bad=call(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"production.database.invalid",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_RECONCILIATION_USER:"agentstudio_admin",
    })
    assert.equal(bad.status,1)
    assert.match(bad.stderr,/unsafe_stage_target/)
    assert.doesNotMatch(bad.stderr,/ECONNREFUSED|ENOTFOUND/)
    const missingSecret=call(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"127.0.0.1",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_RECONCILIATION_USER:"agentstudio_admin",
      AGENT_STUDIO_PG_STAGE_RECONCILIATION_PASSWORD_FILE:"",
    })
    assert.equal(missingSecret.status,1)
    assert.match(missingSecret.stderr,/stage_password_file_required/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("tampered manifest or mapping is refused without exposing source content",()=>{
  const f=fixture()
  try{
    const old=JSON.parse(readFileSync(f.manifest,"utf8"))
    writeFileSync(f.manifest,JSON.stringify({...old,sha256:"0".repeat(64)}))
    const output=call(f)
    assert.equal(output.status,2)
    const info=JSON.parse(output.stdout)
    assert.equal(info.result,"blocked")
    assert.equal(info.production_cutover_allowed,false)
    assert.deepEqual(info.blockers,["invalid_manifest"])
    assert.ok(!output.stdout.includes(marker))
    assert.ok(!output.stderr.includes(legacyId))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("unreviewed approval is rejected without connecting to PostgreSQL",()=>{
  const f=fixture()
  try{
    writeFileSync(f.approval,JSON.stringify({
      source_sha256:"0".repeat(64),approved_by:"",
      approved_at:"invalid",
    }))
    const result=call(f)
    assert.equal(result.status,1)
    assert.match(result.stderr,/approval_review_invalid/)
    assert.equal(result.stdout,"")
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
