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
const entry=path.join(root,"services/pg-api/src/stage-user-import-cli.ts")
const privateMarker="SYNTHETIC_PASSWORD_HASH_NEVER_EXPORT_THIS"
function fixture(){
  const dir=mkdtempSync(path.join(tmpdir(),"stage-user-cli-synthetic-"))
  const snapshot=path.join(dir,"fixture.sqlite")
  const manifest=path.join(dir,"manifest.json")
  const mapping=path.join(dir,"reviewed-map.json")
  const oidc=path.join(dir,"reviewed-oidc.json")
  const db=new DatabaseSync(snapshot)
  db.exec("CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT)")
  db.prepare("INSERT INTO studio_users VALUES(?,?)").run(
    "legacy-employee-a",privateMarker)
  db.close()
  const data=readFileSync(snapshot)
  const fingerprint=createHash("sha256").update(data).digest("hex")
  const legacyId="legacy-employee-a"
  const userId="11111111-1111-4111-8111-111111111111"
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    sha256:fingerprint,bytes:data.length,tables:{studio_users:1},
  }))
  writeFileSync(mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:fingerprint,
    records:[{
      old_id:legacyId,new_studio_user_id:userId,
      verified_by:"TEST IdP reviewer",approved_at:"2026-10-15T12:00:00Z",
    }],
  }))
  writeFileSync(oidc,JSON.stringify({
    schema_version:"studio-reviewed-oidc-provision-v1",
    source_sha256:fingerprint,
    records:[{
      old_id:legacyId,new_studio_user_id:userId,
      external_issuer:"https://synthetic-staging-oidc.invalid",
      external_subject:"private-synthetic-idp-subject",
      reviewed_by:"TEST security operator",
      reviewed_at:"2026-10-15T12:01:00Z",
    }],
  }))
  return {dir,snapshot,manifest,mapping,oidc}
}
function invoke(files,mode="--plan",additional={}){
  const env={...process.env,...additional}
  return spawnSync(process.execPath,[
    "--experimental-strip-types",entry,mode,
    "--snapshot",files.snapshot,"--manifest",files.manifest,
    "--mapping",files.mapping,"--oidc",files.oidc,
  ],{cwd:root,encoding:"utf8",timeout:20000,env})
}
test("CLI plan verifies offline identity inputs without PostgreSQL or sensitive logs",()=>{
  const f=fixture()
  try{
    const plan=invoke(f)
    assert.equal(plan.status,0,plan.stderr)
    const report=JSON.parse(plan.stdout)
    assert.equal(report.operation,"plan_only")
    assert.equal(report.reviewed_users,1)
    assert.equal(report.result,"dry_run_only")
    assert.equal(report.users_enabled,false)
    assert.equal(report.production_cutover_allowed,false)
    assert.equal(report.passwords_copied,false)
    for(const secret of [privateMarker,"legacy-employee-a",
      "11111111-1111-4111-8111-111111111111",
      "private-synthetic-idp-subject"]){
      assert.ok(!plan.stdout.includes(secret))
      assert.ok(!plan.stderr.includes(secret))
    }
    const denied=invoke(f,"--execute")
    assert.equal(denied.status,1)
    assert.match(denied.stderr,/identity_import_disabled/)
    const bad=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"postgres.production.internal",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
    })
    assert.equal(bad.status,1)
    assert.match(bad.stderr,/unsafe_identity_postgres_target/)
    assert.doesNotMatch(bad.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("CLI rejects mismatching OIDC review before any PG network request",()=>{
  const f=fixture()
  try{
    const json=JSON.parse(readFileSync(f.oidc,"utf8"))
    json.source_sha256="0".repeat(64)
    writeFileSync(f.oidc,JSON.stringify(json))
    const bad=invoke(f)
    assert.equal(bad.status,1)
    assert.doesNotMatch(bad.stderr,/private-synthetic-idp-subject/)
    const blocked=invoke(f,"--execute",{
      AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"127.0.0.1",
      AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
      AGENT_STUDIO_PG_IMPORT_USER:"agentstudio_admin",
    })
    assert.equal(blocked.status,1)
    assert.doesNotMatch(blocked.stderr,/ECONNREFUSED|ENOTFOUND/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
