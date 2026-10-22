import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {spawnSync} from "node:child_process"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const src=name=>path.join(root,"services/pg-api/src",name)

test("both audited PG18 native Worker wrappers refuse no-arg or --serve without connecting",()=>{
  for(const name of ["pg18-prepare-readonly-preflight.ts","pg18-model-readonly-preflight.ts"]){
    for(const mode of [[],["--serve"],["--plan"]]){
      const run=spawnSync(process.execPath,[
        "--experimental-strip-types",src(name),...mode
      ],{encoding:"utf8",timeout:12000,
        env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
          DATABASE_URL:"postgres://must-not-connect"}})
      assert.equal(run.status,2,run.stderr)
      assert.equal(run.stdout,"")
      assert.match(run.stderr,/EXPLICIT_MODE_REQUIRED/)
    }
  }
})

test("both wrappers return sanitized read-only failure before networking if PG18 env absent",()=>{
  for(const [name,kind] of [
    ["pg18-prepare-readonly-preflight.ts","prepare"],
    ["pg18-model-readonly-preflight.ts","model"],
  ]){
    const run=spawnSync(process.execPath,[
      "--experimental-strip-types",src(name),"--preflight"
    ],{encoding:"utf8",timeout:15000,
      env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",
        DATABASE_URL:"postgres://must-not-connect"}})
    assert.equal(run.status,3,run.stderr)
    assert.equal(run.stderr,"")
    const lines=run.stdout.trim().split(/\r?\n/)
    assert.equal(lines.length,1)
    const data=JSON.parse(lines[0])
    assert.equal(data.worker,kind)
    assert.equal(data.mode,"preflight")
    assert.equal(data.stage,"runtime_target_config")
    assert.equal(data.status,"failed")
    assert.equal(data.db_writes_performed,false)
    assert.equal(data.worker_started,false)
    assert.equal(data.external_model_calls,false)
    assert.equal(data.production_cutover_allowed,false)
    assert.doesNotMatch(run.stdout,/must-not-connect|password|model-provider/)
  }
})

test("both real Worker PG18 preflight branches call exact same shared implementation",()=>{
  for(const [name,kind] of [
    ["worker-loop.ts","prepare"],["model-worker-loop.ts","model"]
  ]){
    const file=fs.readFileSync(src(name),"utf8")
    assert.match(file,/preflight&&process\.env\.AGENT_STUDIO_PG_BAOTA18_ENABLED==="true"/)
    assert.match(file,/import\("\.\/pg18-native-worker-readonly\.ts"\)/)
    assert.ok(file.includes('runPg18NativeWorkerReadonlyPreflight("'+kind+'")'))
    assert.match(file,/if\(!preflight\)assertPgWorkerActivation/)
    assert.match(file,/if\(preflight\)/)
  }
})

test("shared implementation does not load tasks, model, tools or writable SQL",()=>{
  const text=fs.readFileSync(src("pg18-native-worker-readonly.ts"),"utf8")
  const imports=[...text.matchAll(/(?:import|from)\s*\(?["']([^"']+)["']/g)]
    .map(x=>x[1])
  assert.ok(imports.some(x=>x==="pg"))
  assert.ok(imports.some(x=>x.includes("worker-credential-policy")))
  assert.match(text,/assertPg18WorkerCredentialBinding\(process\.env,kind\)/)
  assert.match(text,/assertPg18CredentialMetadata/)
  assert.match(text,/verifyPgRuntimeTarget\(adapter,target\)/)
  assert.match(text,/verifyPgWorkerRoleBoundary\(adapter,target\)/)
  assert.match(text,/target\.mode!=="baota_pg18"/)
  assert.match(text,/max:1,connectionTimeoutMillis:4000/)
  assert.match(text,/stage,status,verified_roles:status==="passed"/)
  for(const forbidden of [
    "AgentPrepareWorker","AgentModelWorker","createStagingOpenAIProvider",
    "model-provider.ts","agent-worker.ts","model-worker.ts",
    "INSERT INTO","UPDATE agentstudio","DELETE FROM","FOR UPDATE",
    ".tick(","claimJob","--serve"
  ])assert.ok(!text.includes(forbidden),"unacceptable term "+forbidden)
})

test("no executable work is available in wrappers with only preflight entrypoint",()=>{
  for(const name of ["pg18-prepare-readonly-preflight.ts","pg18-model-readonly-preflight.ts"]){
    const file=fs.readFileSync(src(name),"utf8")
    assert.match(file,/runPg18NativeWorkerReadonlyPreflight/)
    assert.match(file,/process\.argv\[2\]==="--preflight"/)
    assert.ok(!file.includes("AgentModelWorker"))
    assert.ok(!file.includes("AgentPrepareWorker"))
    assert.ok(!file.includes(".tick("))
  }
})
