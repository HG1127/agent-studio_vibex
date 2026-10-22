import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {buildNonrootPg18PreflightBundle}
  from "../ops/build-pg18-nonroot-worker-preflight-bundle.mjs"

test("PG18 transient nonroot preflight source-only bundle is complete",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pg18-nonroot-bundle-"))
  try{
    const report=buildNonrootPg18PreflightBundle(dir)
    assert.equal(report.files,12)
    assert.equal(report.manifest_verified,true)
    assert.equal(report.source_only,true)
    assert.equal(report.two_worker_offline_plans_verified,true)
    assert.equal(report.implicit_start_denied,true)
    assert.equal(report.secrets_included,false)
    assert.equal(report.pg_driver_included,false)
    assert.equal(report.api_worker_started,false)
    assert.equal(report.network_used,false)
    assert.equal(report.production_modified,false)
    assert.equal(report.production_cutover_allowed,false)
    assert.match(report.sha256,/^[a-f0-9]{64}$/)
    const command=spawnSync("tar",["-tzf",report.archive],{
      encoding:"utf8",timeout:18000
    })
    assert.equal(command.status,0,command.stderr)
    const names=command.stdout.split(/\r?\n/).filter(s=>s&&!s.endsWith("/"))
      .map(s=>s.replace(/^\.\//,"")).sort()
    assert.deepEqual(names,[
      "README_NONROOT_PREFLIGHT.txt",
      "SHA256SUMS",
      "ops/baota-pg18-nonroot-worker-preflight.py",
      "services/pg-api/src/worker-loop.ts",
      "services/pg-api/src/model-worker-loop.ts",
      "services/pg-api/src/worker-activation-guard.ts",
      "services/pg-api/src/worker-role-preflight.ts",
      "services/pg-api/src/optional-credential-boundary.ts",
      "services/pg-api/src/worker-credential-policy.ts",
      "services/pg-api/src/pg18-native-worker-readonly.ts",
      "services/pg-api/src/pg-runtime-target.ts",
      "services/pg-api/src/contracts.ts",
    ].sort())
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test("builder refuses to create an artifact within source checkout",()=>{
  const src=fs.readFileSync(new URL(
    "../ops/build-pg18-nonroot-worker-preflight-bundle.mjs",import.meta.url),"utf8")
  assert.match(src,/output_inside_repo/)
  assert.match(src,/secrets_included:false/)
  assert.match(src,/implicit_start_denied:true/)
  assert.match(src,/sourcesSafe\(payload\)/)
  assert.match(src,/find \/opt\/agentstudio-pg18-worker-preflight-v1 -type d -exec chmod 755/)
  assert.match(src,/find \/opt\/agentstudio-pg18-worker-preflight-v1 -type f -exec chmod 644/)
  assert.match(src,/sha256sum -c SHA256SUMS/)
  assert.doesNotMatch(src,/^\s*"(?:services\/pg-api\/src\/(?:agent-worker|model-worker|model-provider)\.ts|.*worker.secret)"\s*,?\s*$/m)
})
