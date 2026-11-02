import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {spawnSync} from "node:child_process"
import ts from "typescript"
import {collectRuntimeInitReviewSources,buildRuntimeInitReview} from "../ops/build-pg18-runtime-init-review-bundle.mjs"

// Exercise the actual collector against terminal source text. No archive,
// subprocess, initializer, SQL client or network is created by these tests.
const collectorSource=fs.readFileSync(new URL("../ops/build-pg18-runtime-init-review-bundle.mjs",import.meta.url),"utf8")
const collectorTree=ts.createSourceFile("builder.mjs",collectorSource,ts.ScriptTarget.Latest,true)
assert.equal(collectorTree.parseDiagnostics.length,0)
let collectorBody,sharedDeclaration
function findCollector(node){
  if(ts.isFunctionDeclaration(node)&&node.name?.text==="collectRuntimeInitReviewSources")collectorBody=node.body.getText(collectorTree)
  if(ts.isVariableDeclaration(node)&&node.name.getText(collectorTree)==="sharedDependencies")sharedDeclaration=node.getText(collectorTree)
  ts.forEachChild(node,findCollector)
}
findCollector(collectorTree);assert(collectorBody);assert(sharedDeclaration)
function terminalSources(importText){
  const entry="services/pg-api/src/baota-pg18-runtime-init.mjs",root=path.resolve("terminal-review-root"),read=[]
  const sourceFs={existsSync:()=>true,lstatSync:()=>({isSymbolicLink:()=>false}),statSync:()=>({isFile:()=>true}),readFileSync:file=>{const rel=path.relative(root,file).split(path.sep).join("/");read.push(rel);return rel===entry?importText:""}}
  const collect=Function("captureFreshRuntimeSources","fs","path","root","entry","refuse","const "+sharedDeclaration+";return function()"+collectorBody)(()=>({sources:[]}),sourceFs,path,root,entry,code=>{throw Error("PG18_RUNTIME_REVIEW_REFUSED:"+code)})
  return {result:collect(),read}
}
test("review source collector includes the exact shared account contract transitively",()=>{
  const {result,read}=terminalSources('import {password} from "../../../shared/original-account-contract.ts"')
  assert.ok(result.files.includes("shared/original-account-contract.ts"));assert.equal(read.filter(file=>file==="shared/original-account-contract.ts").length,1)
})
test("review source collector still refuses unknown shared and outside source dependencies",()=>{
  for(const dep of ["../../../shared/original-account-contract-extra.ts","../../../shared/unreviewed.ts","../../../ops/private.mjs","../../../../outside.ts"])
    for(const text of [`import {value} from "${dep}"`,`const value=import("${dep}")`])
      assert.throws(()=>terminalSources(text),/PG18_RUNTIME_REVIEW_REFUSED:outside_dependency/)
})

test("full runtime review contains the real migration map and every initializer dependency, with offline plan and default refusal",()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),"pg18-runtime-review-test-"))
  try{
    const {files,snapshot}=collectRuntimeInitReviewSources()
    assert.ok(files.includes("db/postgres/migrations/pg_v9_019_model_connections.sql"));assert.ok(files.includes("db/postgres/migrations/pg_v9_043_workflow_sample_lineage.sql"))
    assert.ok(files.includes("db/postgres/migrations/pg_v9_044_schedule_execution.sql"));assert.ok(files.includes("services/pg-api/src/schedule-runtime-audit.ts"))
    assert.ok(files.includes("db/postgres/migrations/pg_v9_045_agent_collaboration.sql"));assert.ok(files.includes("services/pg-api/src/agent-collaboration-audit.ts"))
    assert.ok(files.includes("db/postgres/migrations/pg_v9_046_agent_releases.sql"));assert.ok(files.includes("services/pg-api/src/agent-release-audit.ts"))
    assert.ok(files.includes("shared/agent-role-limits.mjs"));assert.ok(files.includes("shared/agent-role-limits.d.mts"))
    assert.deepEqual(files.filter(file=>file.startsWith("shared/")),["shared/agent-role-limits.d.mts","shared/agent-role-limits.mjs","shared/original-account-contract.ts"])
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
