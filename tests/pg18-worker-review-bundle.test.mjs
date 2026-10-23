import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import {workerReviewBundle} from "../ops/build-pg18-worker-readonly-review-bundle.mjs"

test("worker review tarball is source-only and both extracted workers refuse implicit execution",()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"pg18-worker-review-test-"))
  try{
    const result=workerReviewBundle(folder)
    assert.equal(result.archived_files,22)
    assert.equal(result.manifest_verified,true)
    assert.equal(result.extracted_offline_plans_verified,2)
    assert.equal(result.node_modules_included,false)
    assert.equal(result.secrets_included,false)
    assert.equal(result.network_used,false)
    assert.equal(result.worker_started,false)
    assert.equal(result.cutover_allowed,false)
    assert.match(result.sha256,/^[0-9a-f]{64}$/)
    assert.ok(fs.existsSync(result.archive))
    const tar=spawnSync("tar",["-tzf",result.archive],{
      encoding:"utf8",timeout:12000
    })
    assert.equal(tar.status,0,tar.stderr)
    const names=tar.stdout.split(/\r?\n/).filter(Boolean)
    assert.ok(names.some(n=>n.endsWith("/worker-role-preflight.ts")))
    assert.ok(names.some(n=>n.endsWith("/optional-credential-boundary.ts")))
    assert.ok(names.some(n=>n.endsWith("/knowledge-index-audit.ts")))
    assert.ok(names.some(n=>n.endsWith("/knowledge-query-audit.ts")))
    assert.ok(names.some(n=>n.endsWith("/knowledge-execution-audit.ts")))
    assert.ok(names.some(n=>n.endsWith("/knowledge-keyword-audit.ts")))
    assert.ok(names.some(n=>n.endsWith("/agentstudio-pg18-prepare.service.example")))
    assert.ok(names.some(n=>n.endsWith("/SHA256SUMS")))
    assert.ok(names.some(n=>n.endsWith("/README_REVIEW_FIRST.txt")))
    assert.ok(names.every(n=>!/(node_modules|\.env|\/pb_data\/|\.secret|\.key)/i.test(n)))
  }finally{
    fs.rmSync(folder,{recursive:true,force:true})
  }
})

test("review bundle must never include execution engines or API key handlers",()=>{
  const source=readFileSync(
    new URL("../ops/build-pg18-worker-readonly-review-bundle.mjs",import.meta.url),
    "utf8",
  )
  assert.match(source,/sourceFiles=\[/)
  assert.match(source,/mode!=="plan"/)
  assert.match(source,/default_start_refused:true/)
  assert.doesNotMatch(source,/^\s*"services\/pg-api\/src\/model-worker\.ts",/m)
  assert.doesNotMatch(source,/^\s*"services\/pg-api\/src\/agent-worker\.ts",/m)
  assert.doesNotMatch(source,/^\s*"services\/pg-api\/src\/model-provider\.ts",/m)
})
