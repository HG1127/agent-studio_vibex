import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {spawnSync} from "node:child_process"
import {collectRuntimeInitReviewSources,buildRuntimeInitReview} from "../ops/build-pg18-runtime-init-review-bundle.mjs"

test("full runtime review contains the real migration map and every initializer dependency, with offline plan and default refusal",()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"pg18-runtime-review-test-"))
  try{
    const {files,snapshot}=collectRuntimeInitReviewSources()
    assert.ok(files.includes("db/postgres/migrations/pg_v9_019_model_connections.sql"));assert.ok(files.includes("db/postgres/migrations/pg_v9_043_workflow_sample_lineage.sql"))
    assert.ok(files.includes("db/postgres/migrations/pg_v9_044_schedule_execution.sql"));assert.ok(files.includes("services/pg-api/src/schedule-runtime-audit.ts"))
    assert.ok(files.includes("db/postgres/migrations/pg_v9_045_agent_collaboration.sql"));assert.ok(files.includes("services/pg-api/src/agent-collaboration-audit.ts"))
    assert.ok(files.includes("db/postgres/migrations/pg_v9_046_agent_releases.sql"));assert.ok(files.includes("services/pg-api/src/agent-release-audit.ts"))
    assert.ok(files.includes("shared/agent-role-limits.mjs"));assert.ok(files.includes("shared/agent-role-limits.d.mts"))
    assert.ok(files.includes("services/pg-api/src/pg18-fresh-runtime-source.d.mts"));assert.ok(files.includes("services/pg-api/src/knowledge-lineage-audit.ts"))
    assert.ok(files.includes("services/pg-api/src/native-activation-cli.mjs"));assert.ok(files.includes("services/pg-api/src/native-first-admin-cli.mjs"))
    assert.ok(files.includes("services/pg-api/src/pg18-service-login-cli.mjs"));assert.ok(files.includes("services/pg-api/src/pg18-service-login-inspector.ts"))
    assert.ok(files.includes("services/pg-api/src/pg18-service-login-secrets.d.mts"));assert.ok(files.includes("services/pg-api/pnpm-lock.yaml"))
    assert.ok(files.includes("services/pg-api/src/pg18-runtime-postcheck-cli.mjs"));assert.ok(files.includes("docs/PG18_RUNTIME_PREPARATION_POSTCHECK.md"))
    assert.equal(files.some(f=>/model-provider|node_modules|\.env|pb_data|\.sqlite|\.exe/.test(f)),false)
    const result=buildRuntimeInitReview(output)
    assert.equal(result.source_sha256,snapshot.source_sha256);assert.equal(result.manifest_verified,true);assert.equal(result.offline_plan_verified,true)
    assert.equal(result.default_execution_refused,true);assert.equal(result.contains_credentials,false);assert.equal(result.network_used,false)
    assert.equal(result.offline_plans_verified,13)
    const listed=spawnSync("tar",["-tzf",result.archive],{encoding:"utf8",timeout:15000,windowsHide:true});assert.equal(listed.status,0,listed.stderr)
    for(const file of files)assert.ok(listed.stdout.includes(file),file)
    assert.ok(listed.stdout.includes("INITIALIZATION_PLAN.json"));assert.ok(listed.stdout.includes("SHA256SUMS"))
    assert.throws(()=>buildRuntimeInitReview(output),/archive_already_exists/)
  }finally{
    const resolved=path.resolve(output);assert.ok(path.relative(os.tmpdir(),resolved).startsWith("pg18-runtime-review-test-"));fs.rmSync(resolved,{recursive:true,force:true})
  }
})

test("review builder refuses implicit or checkout-contained destinations before creating an artifact",()=>{
  for(const bad of [undefined,"relative","/",path.parse(process.cwd()).root,process.cwd(),path.join(process.cwd(),".tmp","forbidden-runtime-review")])
    assert.throws(()=>buildRuntimeInitReview(bad),/PG18_RUNTIME_REVIEW_REFUSED/)
})
