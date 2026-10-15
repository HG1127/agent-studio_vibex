import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {DatabaseSync} from "node:sqlite"

test("legacy identity inventory is read-only and protects raw identifiers",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-identity-test-"))
 try{
  const filename=path.join(dir,"frozen-snapshot.sqlite")
  const db=new DatabaseSync(filename)
  db.exec("CREATE TABLE sample_agent(id text, rh_user_id text);"+
    "CREATE TABLE sample_invite(id text, owner_uid text, used_by text);")
  db.prepare("INSERT INTO sample_agent VALUES (?,?)").run("a","legacy-A")
  db.prepare("INSERT INTO sample_agent VALUES (?,?)").run("b","legacy-B")
  db.prepare("INSERT INTO sample_invite VALUES (?,?,?)").run("x","legacy-A","legacy-B")
  db.close()
  const dataBefore=fs.readFileSync(filename)
  const script=path.resolve("ops/standalone-identity-inventory.mjs")
  const r=spawnSync(process.execPath,[script,"--db",filename],{encoding:"utf8",timeout:14000})
  assert.equal(r.status,0,r.stderr)
  const report=JSON.parse(r.stdout)
  assert.equal(report.read_only,true)
  assert.equal(report.total_owner_references,4)
  assert.equal(report.tables_with_identity,3)
  assert.doesNotMatch(r.stdout,/legacy-A|legacy-B/)
  assert.deepEqual(fs.readFileSync(filename),dataBefore,"source DB must be byte-for-byte unchanged")
  const reportFile=path.join(dir,"report.json")
  const mapFile=path.join(dir,"manual-map.json")
  const r2=spawnSync(process.execPath,[script,"--db",filename,
    "--output",reportFile,"--mapping-template",mapFile],{encoding:"utf8",timeout:14000})
  assert.equal(r2.status,0,r2.stderr)
  const mapping=JSON.parse(fs.readFileSync(mapFile,"utf8"))
  assert.deepEqual(mapping.records.map(x=>x.old_id),["legacy-A","legacy-B"])
  assert.ok(mapping.records.every(x=>x.new_studio_user_id===null),"no automatic user matching")
  assert.equal(fs.existsSync(reportFile),true)
  const r3=spawnSync(process.execPath,[script,"--db",filename,"--output",reportFile],
    {encoding:"utf8",timeout:14000})
  assert.notEqual(r3.status,0,"must not overwrite an existing report")
  assert.deepEqual(fs.readFileSync(filename),dataBefore)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
