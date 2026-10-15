// Standalone initialization exercises a disposable clone of the installer.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {DatabaseSync} from "node:sqlite"

test("standalone init creates fresh isolated local DB/secrets once and refuses overwrite",()=>{
 const root=process.cwd()
 const bin=process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
 assert.ok(fs.existsSync(bin),"PocketBase executable required")
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-init-test-"))
 try{
  const clonedOps=path.join(temp,"ops")
  fs.mkdirSync(clonedOps)
  fs.copyFileSync(path.join(root,"ops/standalone-init.mjs"),path.join(clonedOps,"standalone-init.mjs"))
  const run=(...args)=>spawnSync(process.execPath,[path.join(clonedOps,"standalone-init.mjs"),...args],{
   cwd:temp,encoding:"utf8",windowsHide:true,timeout:35000,
   env:{...process.env,AGENT_STUDIO_POCKETBASE_BIN:bin}
  })
  const first=run("--dry-run")
  assert.equal(first.status,0,first.stderr)
  assert.equal(fs.existsSync(path.join(temp,"pocketbase/pb_data/data.db")),false)
  const initial=run()
  assert.equal(initial.status,0,initial.stderr)
  assert.equal(fs.existsSync(path.join(temp,"pocketbase/pb_data/data.db")),true)
  const env=fs.readFileSync(path.join(temp,".env.local"),"utf8")
  const creds=fs.readFileSync(path.join(temp,"standalone/operator-credentials.local"),"utf8")
  assert.match(env,/AGENT_STUDIO_AUTH_MODE=standalone/)
  assert.match(env,/AGENT_STUDIO_ALLOW_ANON=false/)
  assert.match(env,/AGENT_STUDIO_SECRET_KEY=[^\n]{32}/)
  assert.match(env,/AGENT_STUDIO_WORKER_TOKEN=[^\n]{32,}/)
  assert.doesNotMatch(initial.stdout,/AGENT_STUDIO_WORKER_TOKEN=|PASSWORD=/)
  const db=new DatabaseSync(path.join(temp,"pocketbase/pb_data/data.db"),{readOnly:true})
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _superusers").get().n,1)
  db.close()
  const next=run()
  assert.notEqual(next.status,0,"must not overwrite any existing config or database")
  assert.equal(fs.readFileSync(path.join(temp,".env.local"),"utf8"),env)
  assert.equal(fs.readFileSync(path.join(temp,"standalone/operator-credentials.local"),"utf8"),creds)
 }finally{
  assert.equal(path.dirname(temp),os.tmpdir())
  fs.rmSync(temp,{recursive:true,force:true})
 }
})
