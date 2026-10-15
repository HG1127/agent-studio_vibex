import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from "node:fs"
import path from "node:path"
import {tmpdir} from "node:os"
import {spawnSync} from "node:child_process"
import {DatabaseSync} from "node:sqlite"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const cli=path.join(root,"ops/pg-migration-readiness.mjs")
const secret="NEVER_EXPOSE_PRIVATE_MODEL_KEY_123"
const owner="owner-sensitive-legacy-id"
function fixture(){
  const temp=mkdtempSync(path.join(tmpdir(),"pg-inventory-synthetic-"))
  const dbFile=path.join(temp,"backup.sqlite")
  const manifestFile=dbFile+".manifest.json"
  const db=new DatabaseSync(dbFile)
  db.exec(
    "CREATE TABLE studio_users(id TEXT, display_name TEXT, password TEXT);"+
    "CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,name TEXT,spec TEXT);"+
    "CREATE TABLE model_connections(id TEXT,rh_user_id TEXT,api_key TEXT);"+
    "CREATE TABLE agent_studio_kb_bases(id TEXT,rh_user_id TEXT);"+
    "CREATE TABLE other_new_feature(id TEXT, payload TEXT);"+
    "INSERT INTO studio_users VALUES('"+owner+"','Tester','HASHED_PASSWORD');"+
    "INSERT INTO agent_specs VALUES('a-legacy','"+owner+"','Agent','{}');"+
    "INSERT INTO model_connections VALUES('m-legacy','"+owner+"','"+secret+"');"+
    "INSERT INTO agent_studio_kb_bases VALUES('k-legacy','"+owner+"');"+
    "INSERT INTO other_new_feature VALUES('other-legacy','PRIVATE_BODY');")
  db.close()
  const buf=readFileSync(dbFile)
  const sha256=createHash("sha256").update(buf).digest("hex")
  const tables={
    studio_users:1,agent_specs:1,model_connections:1,
    agent_studio_kb_bases:1,other_new_feature:1,
  }
  writeFileSync(manifestFile,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    bytes:buf.length,sha256,tables,
  }))
  return {temp,dbFile,manifestFile}
}
const cliCall=(f,args=[])=>spawnSync(process.execPath,[
  cli,"--snapshot",f.dbFile,"--manifest",f.manifestFile,...args,
],{cwd:root,encoding:"utf8",timeout:15000})
test("read-only scanner reports row counts / feature blockers without leaking secrets, IDs or bodies",()=>{
  const f=fixture()
  try{
    const r=cliCall(f)
    assert.equal(r.status,0,r.stderr)
    const inventory=JSON.parse(r.stdout)
    assert.equal(inventory.format,"agentstudio-pg-migration-readiness-v1")
    assert.equal(inventory.read_only,true)
    assert.equal(inventory.snapshot_manifest_full_coverage_verified,true)
    assert.equal(inventory.scanned_tables,5)
    assert.equal(inventory.scanned_rows,5)
    assert.equal(inventory.ready_for_production_cutover,false)
    assert.equal(inventory.credential_sensitive_tables,2)
    assert.equal(inventory.unmapped_nonempty_tables,1)
    const agent=inventory.inventory.find(x=>x.table==="agent_specs")
    assert.equal(agent.postgres_target,"agent_specs")
    assert.equal(agent.group,"configs")
    const unknown=inventory.inventory.find(x=>x.table==="other_new_feature")
    assert.equal(unknown.action,"unknown_table_requires_review")
    assert.equal(inventory.groups.credentials.rows,1)
    for(const sensitive of [secret,owner,"HASHED_PASSWORD","PRIVATE_BODY"]){
      assert.ok(!r.stdout.includes(sensitive))
      assert.ok(!r.stderr.includes(sensitive))
    }
    const strict=cliCall(f,["--strict"])
    assert.equal(strict.status,2,"strict mode blocks unknown/untransformed data")
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("missing/altered manifests fail closed without reporting SQLite data",()=>{
  const f=fixture()
  try{
    writeFileSync(f.manifestFile,JSON.stringify({
      format:"agent-studio-sqlite-snapshot-v1",
      bytes:readFileSync(f.dbFile).length,
      sha256:"0".repeat(64),tables:{studio_users:1},
    }))
    const result=cliCall(f)
    assert.equal(result.status,1)
    assert.match(result.stderr,/snapshot_sha256_mismatch/)
    assert.doesNotMatch(result.stderr,/NEVER_EXPOSE|owner-sensitive/)
    const noManifest=spawnSync(process.execPath,[cli,"--snapshot",f.dbFile],
      {encoding:"utf8",timeout:15000})
    assert.equal(noManifest.status,1)
    assert.match(noManifest.stderr,/verified_manifest_required/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("incomplete legacy backup manifest rejects omitted tables even when SHA matches",()=>{
  const f=fixture()
  try{
    const info=JSON.parse(readFileSync(f.manifestFile,"utf8"))
    delete info.tables.other_new_feature
    writeFileSync(f.manifestFile,JSON.stringify(info))
    const result=cliCall(f)
    assert.equal(result.status,1)
    assert.match(result.stderr,/snapshot_manifest_incomplete/)
    assert.doesNotMatch(result.stderr,/PRIVATE_BODY|owner-sensitive/)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
test("readiness report is create-only with redacted JSON and no ability to alter backup",()=>{
  const f=fixture()
  try{
    const report=path.join(f.temp,"inventory.json")
    const before=readFileSync(f.dbFile)
    assert.equal(cliCall(f,["--output",report]).status,0)
    const parsed=JSON.parse(readFileSync(report,"utf8"))
    assert.equal(parsed.ready_for_production_cutover,false)
    assert.ok(!readFileSync(report,"utf8").includes(secret))
    assert.deepEqual(readFileSync(f.dbFile),before)
    const duplicate=cliCall(f,["--output",report])
    assert.equal(duplicate.status,1,"must not overwrite existing inventory")
    assert.deepEqual(readFileSync(f.dbFile),before)
  }finally{rmSync(f.temp,{recursive:true,force:true})}
})
