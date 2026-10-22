import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {assertPgWorkerActivation,assertPg18WorkerCredentialBinding,
  pgWorkerOfflinePlan,
  PG18_WORKER_TRIAL_APPROVAL}
  from "../src/worker-activation-guard.ts"

const src=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../src")
const prepare=path.join(src,"worker-loop.ts")
const model=path.join(src,"model-worker-loop.ts")
const clean={PATH:process.env.PATH,HOME:process.env.HOME}
const launch=(file,args,env={})=>spawnSync(process.execPath,
  ["--experimental-strip-types",file,...args],{
    encoding:"utf8",timeout:12000,
    env:{...clean,DATABASE_URL:"postgres://would-be-invalid",...env},
  })

test("both PG Workers default to offline plan with no network or external effects",()=>{
  for(const [file,kind] of [[prepare,"prepare"],[model,"model"]]){
    const result=launch(file,["--plan"],{
      AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
      AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:"bogus",
    })
    assert.equal(result.status,0,result.stderr)
    assert.deepEqual(JSON.parse(result.stdout),pgWorkerOfflinePlan(kind))
    assert.equal(JSON.parse(result.stdout).worker_started,false)
    assert.equal(JSON.parse(result.stdout).external_model_calls,false)
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|password|FATAL:/)
  }
})
test("both PG Workers refuse accidental no-arg starts before reading credentials",()=>{
  for(const file of [prepare,model]){
    const result=launch(file,[])
    assert.equal(result.status,1)
    assert.match(result.stderr,/EXPLICIT_MODE_REQUIRED/)
    assert.doesNotMatch(result.stderr,/password|ECONNREFUSED|FATAL:/)
  }
})
test("PG18 read-only preflight is explicit and rejects missing target before TCP",()=>{
  for(const file of [prepare,model]){
    const missing=launch(file,["--preflight"])
    assert.equal(missing.status,1)
    assert.doesNotMatch(missing.stderr,/ECONNREFUSED|FATAL:|password/i)
    const bad=launch(file,["--preflight"],{
      AGENT_STUDIO_PG_PILOT_ENABLED:"true",
      AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
      AGENT_STUDIO_PG_HOST:"127.0.0.1",
      AGENT_STUDIO_PG_PORT:"5333",
      AGENT_STUDIO_PG_DATABASE:"vcaios",
      AGENT_STUDIO_PG_WORKER_USER:"agentstudio_stage_worker",
      AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:"true",
    })
    // PG18 now uses the common, stage-coded read-only preflight; a missing
    // credential binding is rejected before either DB access or model calls.
    assert.equal(bad.status,3)
    const evidence=JSON.parse(bad.stdout)
    assert.equal(evidence.stage,"credential_binding")
    assert.equal(evidence.status,"failed")
    assert.equal(evidence.db_writes_performed,false)
    assert.equal(evidence.worker_started,false)
    assert.equal(evidence.external_model_calls,false)
    assert.doesNotMatch(bad.stderr,/ECONNREFUSED|FATAL:|password/i)
    const source=readFileSync(file,"utf8")
    assert.match(source,/verifyPgWorkerRoleBoundary/)
    assert.match(source,/mode:"preflight"/)
    assert.match(source,/worker_started:false/)
    assert.match(source,/db_writes_performed:false/)
    assert.match(source,/external_model_calls:false/)
  }
})
test("shared PostgreSQL Worker verifier uses only read-only transactions",()=>{
  const text=readFileSync(path.join(src,"worker-role-preflight.ts"),"utf8")
  assert.match(text,/BEGIN READ ONLY/)
  assert.match(text,/workerCanReadAgentSpecs/)
  assert.match(text,/loginCanJoinNativeAuth/)
})
test("PG18 runtime Worker requires independent operator approval and exact serve mode",()=>{
  const env={
    AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
    AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:"true",
    AGENT_STUDIO_PG_PILOT_ENABLED:"true",
    AGENT_STUDIO_PG_PREPARE_WORKER_ENABLED:"true",
    AGENT_STUDIO_PG_MODEL_WORKER_ENABLED:"true",
  }
  for(const file of [prepare,model]){
    const actual=launch(file,["--serve"],env)
    assert.equal(actual.status,1)
    assert.match(actual.stderr,/pg18_worker_not_approved/)
    assert.doesNotMatch(actual.stderr,/ECONNREFUSED|password|FATAL:/)
  }
  assert.throws(()=>assertPgWorkerActivation(
    {...env,AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:"invalid"},
    ["--serve"],"linux",1001),/pg18_worker_not_approved/)
  assert.throws(()=>assertPgWorkerActivation(
    {...env,AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:PG18_WORKER_TRIAL_APPROVAL},
    ["--serve"],"win32",1001),/pg18_worker_not_approved/)

  assert.throws(()=>assertPgWorkerActivation(
    {...env,AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:PG18_WORKER_TRIAL_APPROVAL},
    ["--serve"],"linux",0),/pg18_worker_not_approved/)
  assert.throws(()=>assertPgWorkerActivation(
    {...env,AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:PG18_WORKER_TRIAL_APPROVAL},
    ["--serve"],"linux",undefined),/pg18_worker_not_approved/)
  assert.doesNotThrow(()=>assertPgWorkerActivation(
    {...env,AGENT_STUDIO_PG18_WORKER_TRIAL_OPERATOR_APPROVED:PG18_WORKER_TRIAL_APPROVAL},
    ["--serve"],"linux",1001))
})
test("PG18 Worker requires exact systemd credential directory, service role and non-root UID",()=>{
  for(const [kind,service] of [
    ["prepare","agentstudio-pg18-prepare.service"],
    ["model","agentstudio-pg18-model.service"],
  ]){
    const directory="/run/credentials/"+service
    const env={AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
      CREDENTIALS_DIRECTORY:directory,
      AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:directory+"/worker.secret"}
    assert.doesNotThrow(()=>assertPg18WorkerCredentialBinding(env,kind,1001))
    assert.throws(()=>assertPg18WorkerCredentialBinding(env,kind,0),
      /pg18_worker_credential_binding_required/)
    assert.throws(()=>assertPg18WorkerCredentialBinding(
      {...env,AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:"/root/secret"},kind,1001),
      /pg18_worker_credential_binding_required/)
    assert.throws(()=>assertPg18WorkerCredentialBinding(
      {...env,CREDENTIALS_DIRECTORY:"/run/credentials/other.service"},kind,1001),
      /pg18_worker_credential_binding_required/)
  }
  // Existing isolated PG17 staging Worker remains separate.
  assert.doesNotThrow(()=>assertPg18WorkerCredentialBinding(
    {AGENT_STUDIO_PG_BAOTA18_ENABLED:undefined},"prepare",undefined))
})
test("the Worker launch gate leaves the live PocketBase worker and PostgreSQL unchanged",()=>{
  const repo=readFileSync(path.join(src,"worker-activation-guard.ts"),"utf8")
  for(const sourceFile of [prepare,model]){
    const content=readFileSync(sourceFile,"utf8")
    assert.match(content,/assertPgWorkerActivation/)
    assert.match(content,/--serve/)
    assert.match(content,/--plan/)
    assert.match(content,/production|Worker|postgres/i)
  }
  assert.doesNotMatch(repo,/\b(?:fetch|new Pool|new PocketBase|systemctl|execSync|spawnSync)\b/)
  assert.equal(pgWorkerOfflinePlan("model").production_cutover_allowed,false)
})
