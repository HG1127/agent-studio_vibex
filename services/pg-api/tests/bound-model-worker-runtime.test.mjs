import test from "node:test"
import assert from "node:assert/strict"
import {AgentModelWorker} from "../src/model-worker.ts"
import {selectBoundModelWorkerMode,createApprovedBoundModelWorkerDispatch}
  from "../src/bound-model-worker-runtime.ts"

const directory="/run/credentials/agentstudio-pg18-model.service"
const env={
  AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY",
  AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
  AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY",
  AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
  AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true",
  AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:"true",
  AGENT_STUDIO_PG_PILOT_ENABLED:"true",
  AGENT_STUDIO_PG_HOST:"127.0.0.1",AGENT_STUDIO_PG_PORT:"5333",
  AGENT_STUDIO_PG_DATABASE:"agent_studio",AGENT_STUDIO_PG_WORKER_USER:"agentstudio_stage_worker",
  CREDENTIALS_DIRECTORY:directory,AGENT_STUDIO_PG_WORKER_PASSWORD_FILE:directory+"/worker.secret",
  AGENT_STUDIO_PG_BOUND_DISPATCH_ORIGIN:"https://127.0.0.1:7453",
  AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT:"AB".repeat(32),
}
test("default Worker mode keeps its existing provider and never reads mTLS credentials",()=>{
  assert.equal(selectBoundModelWorkerMode({}),"fixed")
  let reads=0
  assert.throws(()=>createApprovedBoundModelWorkerDispatch({},
    {uid:1001,platform:"linux",readCredential(){reads++;return Buffer.from("never")}}),
  /unsafe_bound_worker_transport/)
  assert.equal(reads,0)
})
test("bound Worker transport independently checks paid approval, exact database and protected unit",()=>{
  assert.equal(selectBoundModelWorkerMode(env,1001,"linux"),"bound")
  for(const changes of [
    {AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:undefined},
    {AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"false"},
    {AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:"wrong"},
    {AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:undefined},
    {AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:undefined},
    {AGENT_STUDIO_PG_DATABASE:"another_database"},{AGENT_STUDIO_PG_PORT:"5432"},
    {AGENT_STUDIO_PG_WORKER_USER:"postgres"},{DATABASE_URL:"postgres://private"},
    {CREDENTIALS_DIRECTORY:"/run/credentials/unreviewed.service"},
    {AGENT_STUDIO_PG_BOUND_DISPATCH_ORIGIN:"https://remote.invalid:7453"},
    {AGENT_STUDIO_PG_BOUND_DISPATCH_SERVER_FINGERPRINT:"invalid"},
  ])assert.throws(()=>selectBoundModelWorkerMode({...env,...changes},1001,"linux"),
    /unsafe_bound_worker_transport/)
  assert.throws(()=>selectBoundModelWorkerMode(env,0,"linux"),/unsafe_bound_worker_transport/)
  assert.throws(()=>selectBoundModelWorkerMode(env,1001,"win32"),/unsafe_bound_worker_transport/)
})
test("approved transport reads only its three TLS credentials and cannot read model secrets",()=>{
  const names=[]
  const send=createApprovedBoundModelWorkerDispatch(env,{
    uid:1001,platform:"linux",readCredential(name){names.push(name);return Buffer.from("synthetic")},
  })
  assert.equal(typeof send,"function")
  assert.deepEqual(names,["dispatch-ca.pem","dispatch-worker.pem","dispatch-worker.key"])
})
test("bound-only Worker cannot be constructed without an independently approved gateway",()=>{
  const pool={async connect(){throw Error("must not connect")}}
  const provider={async generate(){throw Error("must not call a provider")}}
  assert.throws(()=>new AgentModelWorker(pool,"synthetic",provider,{boundOnly:true}),
    /bound_model_execution_disabled/)
  assert.throws(()=>new AgentModelWorker(pool,"synthetic",provider,{
    boundOnly:true,boundModelDispatch:async()=>({status:"succeeded",text:"synthetic"})}),
    /bound_model_execution_disabled/)
  const worker=new AgentModelWorker(pool,"synthetic",provider,{
    boundOnly:true,boundExecutionApproved:true,
    boundModelDispatch:async()=>({status:"succeeded",text:"synthetic"})})
  assert.equal(worker.boundOnly,true)
})
