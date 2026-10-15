import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {DatabaseSync} from "node:sqlite"
import {spawnSync} from "node:child_process"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const cli=path.join(root,"ops/pg-identity-map-audit.mjs")
const userA="aliceprivate001",userB="bobprivate002"
const uuidA="11111111-1111-4111-8111-111111111111"
const uuidB="22222222-2222-4222-8222-222222222222"
function fixture(extra=false){
  const dir=mkdtempSync(path.join(tmpdir(),"pg-mapping-fixture-"))
  const snapshot=path.join(dir,"snapshot.sqlite")
  const manifest=snapshot+".manifest.json"
  const mapping=path.join(dir,"approved-map.json")
  const db=new DatabaseSync(snapshot)
  db.exec(
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY);"+
    "CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,spec TEXT);"+
    "CREATE TABLE agent_studio_spec_access(spec_id TEXT,owner_uid TEXT,member_uid TEXT);")
  db.prepare("INSERT INTO studio_users VALUES(?)").run(userA)
  db.prepare("INSERT INTO studio_users VALUES(?)").run(userB)
  db.prepare("INSERT INTO agent_specs VALUES(?,?,?)")
    .run("legacy-1",userA,"PRIVATE_PROMPT_DO_NOT_LEAK")
  db.prepare("INSERT INTO agent_studio_spec_access VALUES(?,?,?)")
    .run("legacy-1",userA,extra?"unknown-private-id":userB)
  db.close()
  const buf=readFileSync(snapshot)
  const fingerprint=createHash("sha256").update(buf).digest("hex")
  writeFileSync(manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:buf.length,sha256:fingerprint,
    tables:{agent_specs:1,agent_studio_spec_access:1,studio_users:2},
  }))
  const current={
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:fingerprint,
    records:[
      {old_id:userA,new_studio_user_id:uuidA,verified_by:"Security review",
        approved_at:"2026-10-15T09:00:00Z"},
      {old_id:userB,new_studio_user_id:uuidB,verified_by:"Security review",
        approved_at:"2026-10-15T09:00:00Z"},
    ],
  }
  writeFileSync(mapping,JSON.stringify(current))
  return {dir,snapshot,manifest,mapping,current}
}
const invoke=f=>spawnSync(process.execPath,[cli,
  "--snapshot",f.snapshot,"--manifest",f.manifest,"--mapping",f.mapping,
],{encoding:"utf8",timeout:20000,cwd:root})
test("identity audit binds reviewed UUID mapping to verified backup, no IDs or raw text emitted",()=>{
  const f=fixture()
  try{
    const check=invoke(f)
    assert.equal(check.status,0,check.stderr)
    const result=JSON.parse(check.stdout)
    assert.equal(result.mapping_structurally_complete,true)
    assert.equal(result.source_users,2)
    assert.equal(result.referenced_source_ids,2)
    assert.equal(result.approved_unique_pairs,2)
    assert.equal(result.oidc_provisioning_verified,false)
    assert.equal(result.ready_for_production_cutover,false)
    for(const sensitive of [userA,userB,uuidA,uuidB,"PRIVATE_PROMPT_DO_NOT_LEAK"]){
      assert.ok(!check.stdout.includes(sensitive))
      assert.ok(!check.stderr.includes(sensitive))
    }
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("stale/template mappings cannot authorize another snapshot or silent user merge",()=>{
  const f=fixture()
  try{
    writeFileSync(f.mapping,JSON.stringify({
      ...f.current,schema_version:"studio-approved-identity-map-v1",
    }))
    const old=invoke(f)
    assert.equal(old.status,1)
    assert.match(old.stderr,/approved_mapping_bound_to_snapshot_required/)
    writeFileSync(f.mapping,JSON.stringify({
      ...f.current,source_sha256:"0".repeat(64),
    }))
    assert.equal(invoke(f).status,1)
    writeFileSync(f.mapping,JSON.stringify({
      ...f.current,records:[
        f.current.records[0],
        {...f.current.records[1],new_studio_user_id:uuidA},
      ],
    }))
    const sameUser=invoke(f)
    assert.equal(sameUser.status,2)
    assert.equal(JSON.parse(sameUser.stdout).duplicate_records,1)
    assert.equal(JSON.parse(sameUser.stdout).mapping_structurally_complete,false)
    writeFileSync(f.mapping,JSON.stringify({
      ...f.current,records:[f.current.records[0]],
    }))
    const missing=invoke(f)
    assert.equal(missing.status,2)
    assert.equal(JSON.parse(missing.stdout).unmapped_source_users,1)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("identity mapping audit rejects a manifest that omits an old collection",()=>{
  const f=fixture()
  try{
    const manifest=JSON.parse(readFileSync(f.manifest,"utf8"))
    delete manifest.tables.agent_studio_spec_access
    writeFileSync(f.manifest,JSON.stringify(manifest))
    const result=invoke(f)
    assert.equal(result.status,1)
    assert.match(result.stderr,/identity_manifest_incomplete/)
    assert.doesNotMatch(result.stderr,/aliceprivate|bobprivate/)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test("orphan legacy member references explicitly block identity cutover",()=>{
  const f=fixture(true)
  try{
    const outcome=invoke(f)
    assert.equal(outcome.status,2)
    const result=JSON.parse(outcome.stdout)
    assert.equal(result.orphaned_owner_references,1)
    assert.equal(result.unmapped_owner_references,1)
    assert.ok(!outcome.stdout.includes("unknown-private-id"))
  }finally{rmSync(f.dir,{recursive:true,force:true})}
})
