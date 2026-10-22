import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {boundDispatchOfflinePlan,boundDispatchServerConfig} from "../src/bound-dispatch-server.ts"

const baseline={AGENT_STUDIO_PG_BOUND_DISPATCH_REVIEWED:"true",
  CREDENTIALS_DIRECTORY:"/run/credentials/agentstudio-pg18-dispatch.service",
  AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT:"AB".repeat(32),
  AGENT_STUDIO_PG_PILOT_ENABLED:"true",AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
  AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true",AGENT_STUDIO_PG_HOST:"127.0.0.1",
  AGENT_STUDIO_PG_PORT:"5333",AGENT_STUDIO_PG_DATABASE:"agent_studio",
  AGENT_STUDIO_PG_USER:"agentstudio_stage_login"}
const paid={...baseline,
  AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY",
  AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
  AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY"}
test("private Broker plan is offline and rejects implicit CLI startup before credential or database access",()=>{
  const plan=boundDispatchOfflinePlan()
  assert.equal(plan.network_used,false);assert.equal(plan.credentials_read,false)
  assert.equal(plan.external_model_calls,false);assert.equal(plan.production_cutover_allowed,false)
  const source=fileURLToPath(new URL("../src/bound-dispatch-server.ts",import.meta.url))
  const run=args=>spawnSync(process.execPath,["--experimental-strip-types",source,...args],{
    encoding:"utf8",timeout:15000,env:{...process.env,DATABASE_URL:"postgres://must-never-connect"},
  })
  const offline=run(["--plan"])
  assert.equal(offline.status,0,offline.stderr)
  assert.equal(JSON.parse(offline.stdout).network_used,false)
  const missing=run([])
  assert.equal(missing.status,2)
  assert.match(missing.stderr,/BOUND_DISPATCH_EXPLICIT_MODE_REQUIRED/)
  const unsafe=run(["--serve"])
  assert.equal(unsafe.status,1)
  assert.equal(unsafe.stderr.trim(),"BOUND_DISPATCH_START_FAILED")
})
test("private Broker preflight is scoped to a non-root Linux service and the exact reviewed PG18 target",()=>{
  const cfg=boundDispatchServerConfig(baseline,"preflight","linux",1001)
  assert.equal(cfg.origin,"https://127.0.0.1:7453")
  assert.equal(cfg.target.database,"agent_studio")
  for(const delta of [{AGENT_STUDIO_PG_BOUND_DISPATCH_REVIEWED:undefined},
    {CREDENTIALS_DIRECTORY:"/tmp/credentials"},{AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT:"bad"},
    {AGENT_STUDIO_PG_PORT:"5432"},{AGENT_STUDIO_PG_DATABASE:"other_database"},
    {AGENT_STUDIO_PG_USER:"postgres"},{PGHOST:"company.invalid"}])
    assert.throws(()=>boundDispatchServerConfig({...baseline,...delta},"preflight","linux",1001))
  assert.throws(()=>boundDispatchServerConfig(baseline,"preflight","linux",0))
  assert.throws(()=>boundDispatchServerConfig(baseline,"preflight","win32",1001))
})
test("private serving requires independent paid execution approval beyond a successful read-only preflight",()=>{
  assert.throws(()=>boundDispatchServerConfig(baseline,"serve","linux",1001),/bound_model_execution_disabled/)
  assert.equal(boundDispatchServerConfig(paid,"serve","linux",1001).port,7453)
  for(const name of ["AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED",
    "AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED","AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED"])
    assert.throws(()=>boundDispatchServerConfig({...paid,[name]:undefined},"serve","linux",1001))
})
test("private Broker preview unit cannot become a paid service by installation",()=>{
  const unit=readFileSync(new URL("../../../ops/templates/agentstudio-pg18-dispatch.service.example",import.meta.url),"utf8")
  assert.match(unit,/^ExecStart=.*bound-dispatch-server\.ts --preflight\r?$/m)
  assert.doesNotMatch(unit,/^\[Install\]|^ExecStart=.*--serve/m)
  assert.doesNotMatch(unit,/^Environment=AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED=true/m)
  assert.match(unit,/^DynamicUser=yes/m)
  assert.match(unit,/^IPAddressAllow=127\.0\.0\.0\/8/m)
})

test("Workflow V2 serving needs its own enable pair and a distinct client certificate pin",()=>{
  const flags={AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:"true",
    AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED:"APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY"}
  assert.equal(boundDispatchServerConfig(paid,"serve","linux",1001).workflowModelEnabled,false)
  for(const delta of [flags,{...flags,AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT:baseline.AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT},
    {AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:"true"}])
    assert.throws(()=>boundDispatchServerConfig({...paid,...delta},"serve","linux",1001))
  const cfg=boundDispatchServerConfig({...paid,...flags,AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT:"CD".repeat(32)},"serve","linux",1001)
  assert.equal(cfg.workflowModelEnabled,true)
})
