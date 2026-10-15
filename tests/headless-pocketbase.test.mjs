import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import { prepareHeadlessPocketBase, spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const pb=process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")

test("headless test bootstrap refuses every persistent or wrongly-scoped directory",()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"not-an-agentstudio-database-"))
  try {
    assert.throws(
      ()=>prepareHeadlessPocketBase(pb,folder),
      /headless_pocketbase_refuses_persistent_or_production_database/,
    )
    assert.throws(
      ()=>prepareHeadlessPocketBase(pb,path.join(root,"pocketbase","pb_data")),
      /headless_pocketbase_refuses_persistent_or_production_database|ENOENT/,
    )
    assert.throws(
      ()=>spawnHeadlessPocketBase(pb,["serve","--http=0.0.0.0:8090","--dir="+folder,"--hooksDir=pb_hooks"]),
      /headless_serve_requires_temp_data_hooks_and_localhost/,
    )
    assert.equal(fs.existsSync(path.join(folder,"data.db")),false)
  } finally { fs.rmSync(folder,{recursive:true,force:true}) }
})

test("PocketBase 0.40 compatible headless setup does not register removed onServe JSVM hook",()=>{
  const script=fs.readFileSync(path.join(root,"pocketbase/pb_hooks/headless_installer.pb.js"),"utf8")
  assert.doesNotMatch(script,/(?:^|\n)\s*onServe\s*\(/m)
  // Disposable-test superuser is created by prepareHeadlessPocketBase
  // before serve. Do not fall back to a browser installer.
  assert.match(fs.readFileSync(path.join(root,"tests/helpers/headless-pocketbase.mjs"),"utf8"),/superuser.*create/)
})
