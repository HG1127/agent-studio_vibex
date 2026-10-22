import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
const file=fileURLToPath(new URL("../src/workflow-v2-worker-loop.ts",import.meta.url))
const clean=Object.fromEntries(["PATH","Path","SystemRoot","TEMP","TMP","TMPDIR","HOME","USERPROFILE"]
  .filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))
test("V2 Worker offline plan never inherits permission; serving requires its own explicit approval",()=>{
  const run=(args,extra={})=>spawnSync(process.execPath,["--experimental-strip-types",file,...args],{
    env:{...clean,...extra},encoding:"utf8",timeout:5000,windowsHide:true})
  const plan=run(["--plan"],{AGENT_STUDIO_PG_WORKFLOW_WORKER_ENABLED:"true",
    AGENT_STUDIO_PG_WORKFLOW_WORKER_APPROVED:"APPROVE_ISOLATED_PG_WORKFLOW_START_END_ONLY"})
  assert.equal(plan.status,0,plan.stderr)
  const value=JSON.parse(plan.stdout)
  assert.equal(value.workflow_execution,"workflow_native_v2");assert.equal(value.effect_executor_installed,false)
  assert.equal(value.production_cutover_allowed,false)
  for(const args of [[],["--serve"],["--preflight"],["--plan","--serve"]]){
    const result=run(args)
    assert.notEqual(result.status,0);assert.equal(result.stdout,"")
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|password authentication|ENOENT.*worker.password/)
  }
})
