import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const entry=path.join(root,"services/pg-api/src/workflow-worker-loop.ts")
test("Workflow Worker --plan is offline and explicitly limits execution to Start/End",()=>{
  const result=spawnSync(process.execPath,["--experimental-strip-types",entry,"--plan"],{
    cwd:root,encoding:"utf8",timeout:12000
  })
  assert.equal(result.error,undefined,result.error?.message)
  assert.equal(result.status,0,result.stderr)
  const plan=JSON.parse(result.stdout.trim())
  assert.equal(plan.worker,"workflow")
  assert.equal(plan.workflow_execution,"start_end_only")
  assert.equal(plan.separate_approval_required,true)
  assert.equal(plan.production_cutover_allowed,false)
  assert.doesNotMatch(result.stdout,/password|DATABASE_URL|BEGIN|INSERT INTO/i)
})
test("Workflow Worker refuses to serve without explicit isolated runtime approval",()=>{
  const env={...process.env}
  for(const key of Object.keys(env)){
    if(key.startsWith("AGENT_STUDIO_PG_")||key==="DATABASE_URL"||
       key.startsWith("PGHOST")||key.startsWith("PGPORT")||
       key.startsWith("PGUSER")||key.startsWith("PGPASSWORD")||
       key.startsWith("PGDATABASE"))delete env[key]
  }
  env.AGENT_STUDIO_PG_PILOT_ENABLED="true"
  env.AGENT_STUDIO_PG_WORKFLOW_WORKER_ENABLED="true"
  const result=spawnSync(process.execPath,["--experimental-strip-types",entry,"--serve"],{
    cwd:root,encoding:"utf8",timeout:12000,env
  })
  assert.equal(result.error,undefined,result.error?.message)
  assert.notEqual(result.status,0,"worker must not start without a separate approval marker")
  assert.equal(result.stdout.trim(),"","worker must fail before announcing readiness")
  assert.match(result.stderr,/workflow_worker_(?:not_approved|start_failed)/)
  assert.doesNotMatch(result.stderr,/postgres(?:ql)?:\/\/|password=|BEGIN;|UPDATE agentstudio/i)
})
test("Workflow Worker requires an explicit command mode",()=>{
  const result=spawnSync(process.execPath,["--experimental-strip-types",entry],{
    cwd:root,encoding:"utf8",timeout:12000
  })
  assert.equal(result.status,1)
  assert.match(result.stderr,/PG_WORKFLOW_WORKER_EXPLICIT_MODE_REQUIRED/)
  assert.equal(result.stdout.trim(),"")
})
