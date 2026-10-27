import test from "node:test"
import assert from "node:assert/strict"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {boundDispatchServerConfig} from "../src/bound-dispatch-server.ts"
import {assertPg18WorkerCredentialBinding} from "../src/worker-activation-guard.ts"
import {expectedPg18CredentialFile,pg18CredentialMetadataAccepted} from "../src/worker-credential-policy.ts"
import {boundCredentialDirectory} from "../src/bound-runtime-credentials.ts"
import {AUTONOMOUS_AGENT_APPROVAL} from "../src/durable-v2-root.ts"
const file=fileURLToPath(new URL("../src/autonomous-agent-worker-loop.ts",import.meta.url))
const clean=Object.fromEntries(["PATH","Path","SystemRoot","TEMP","TMP","TMPDIR","HOME","USERPROFILE"]
  .filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))
test("autonomous CLI defaults closed; offline plan and shared import perform no activation",()=>{
  const run=(args,extra={})=>spawnSync(process.execPath,["--experimental-strip-types",file,...args],{
    env:{...clean,DATABASE_URL:"postgres://never-connect.invalid/db",...extra},encoding:"utf8",timeout:5000,windowsHide:true})
  const plan=run(["--plan"],{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:"true"})
  assert.equal(plan.status,0,plan.stderr);const body=JSON.parse(plan.stdout)
  assert.equal(body.worker,"agent");assert.equal(body.workflow_execution,"agent_native_v2");assert.equal(body.network_used,false)
  assert.equal(body.worker_started,false);assert.equal(body.production_cutover_allowed,false)
  for(const args of [[],["--serve"],["--preflight"],["--plan","--serve"]]){
    const result=run(args);assert.notEqual(result.status,0);assert.equal(result.stdout,"")
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|password authentication|ENOENT/)
  }
  const outcome={AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_ENABLED:"true",AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_OUTCOME_MEMORY_ONLY"}
  const withoutExecution=run(["--preflight"],outcome)
  assert.notEqual(withoutExecution.status,0);assert.match(withoutExecution.stderr,/unsafe_agent_outcome_memory_worker_scope/)
  const malformed=run(["--preflight"],{...outcome,AGENT_STUDIO_PG_AGENT_OUTCOME_MEMORY_APPROVED:"wrong"})
  assert.notEqual(malformed.status,0);assert.match(malformed.stderr,/unsafe_agent_outcome_memory_config/)
  const shared=new URL("../src/workflow-v2-worker-loop.ts",import.meta.url).href
  const imported=spawnSync(process.execPath,["--experimental-strip-types","--input-type=module","-e","await import("+JSON.stringify(shared)+")"],{
    env:clean,encoding:"utf8",timeout:5000,windowsHide:true})
  assert.equal(imported.status,0,imported.stderr);assert.equal(imported.stdout,"");assert.equal(imported.stderr,"")
})
test("autonomous Worker accepts only its own credential directory and Broker requires a third distinct client pin",()=>{
  const directory=boundCredentialDirectory("agent"),file=expectedPg18CredentialFile("agent")
  const env={AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",CREDENTIALS_DIRECTORY:directory,AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:file}
  assert.doesNotThrow(()=>assertPg18WorkerCredentialBinding(env,"agent",1100))
  assert.throws(()=>assertPg18WorkerCredentialBinding(env,"workflow",1100))
  const stat={isFile:()=>true,isSymbolicLink:()=>false,mode:0o440,uid:0,gid:0,size:48}
  assert.equal(pg18CredentialMetadataAccepted({kind:"agent",env,file,stat,uid:1100,canRead:true}),true)
  assert.equal(pg18CredentialMetadataAccepted({kind:"agent",env,file:file.replace("-agent.","-workflow."),stat,uid:1100,canRead:true}),false)
  const broker={AGENT_STUDIO_PG_BOUND_DISPATCH_REVIEWED:"true",CREDENTIALS_DIRECTORY:boundCredentialDirectory("dispatch"),
    AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT:"AB".repeat(32),AGENT_STUDIO_PG_WORKFLOW_V2_CLIENT_FINGERPRINT:"CD".repeat(32),
    AGENT_STUDIO_PG_PILOT_ENABLED:"true",AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true",
    AGENT_STUDIO_PG_HOST:"127.0.0.1",AGENT_STUDIO_PG_PORT:"5333",AGENT_STUDIO_PG_DATABASE:"agent_studio",AGENT_STUDIO_PG_USER:"agentstudio_stage_login",
    AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:"true",AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_APPROVED:"APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_MODEL_ONLY",
    AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED:"true",AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_APPROVED:"APPROVE_DISPOSABLE_PG18_WORKFLOW_V2_TOOLS_ONLY",
    AGENT_STUDIO_PG_AUTONOMOUS_AGENT_ENABLED:"true",AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:AUTONOMOUS_AGENT_APPROVAL,
    AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT:"EF".repeat(32)}
  const cfg=boundDispatchServerConfig(broker,"preflight","linux",1100)
  assert.equal(cfg.autonomousEnabled,true);assert.equal(cfg.workflowAgentsEnabled,false)
  for(const changes of [{AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT:undefined},
    {AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT:"AB".repeat(32)},
    {AGENT_STUDIO_PG_AUTONOMOUS_AGENT_CLIENT_FINGERPRINT:"CD".repeat(32)},
    {AGENT_STUDIO_PG_AUTONOMOUS_AGENT_APPROVED:undefined},{AGENT_STUDIO_PG_WORKFLOW_V2_MODEL_ENABLED:undefined},
    {AGENT_STUDIO_PG_WORKFLOW_V2_TOOLS_ENABLED:undefined}])
    assert.throws(()=>boundDispatchServerConfig({...broker,...changes},"preflight","linux",1100))
})
