import test from "node:test"
import assert from "node:assert/strict"
import {selectPgRuntimeTarget,verifyPgRuntimeTarget}
  from "../src/pg-runtime-target.ts"

const apiUser="agentstudio_stage_login"
const workerUser="agentstudio_stage_worker"
const legacyApi={AGENT_STUDIO_PG_HOST:"postgres",
  AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
  AGENT_STUDIO_PG_USER:apiUser}
const legacyWorker={AGENT_STUDIO_PG_HOST:"127.0.0.1",
  AGENT_STUDIO_PG_DATABASE:"agentstudio_stage",
  AGENT_STUDIO_PG_WORKER_USER:workerUser}
const baotaApi={AGENT_STUDIO_PG_HOST:"127.0.0.1",
  AGENT_STUDIO_PG_DATABASE:"agent_studio",AGENT_STUDIO_PG_PORT:"5333",
  AGENT_STUDIO_PG_USER:apiUser,
  AGENT_STUDIO_PG_PILOT_ENABLED:"true",
  AGENT_STUDIO_PG_BAOTA18_ENABLED:"true",
  AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true"}
const baotaWorker={...baotaApi,AGENT_STUDIO_PG_USER:undefined,
  AGENT_STUDIO_PG_WORKER_USER:workerUser,
  AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:"true"}

test("legacy PG17 API/Worker retain exact isolated stage defaults",()=>{
  assert.deepEqual(selectPgRuntimeTarget(legacyApi,"api"),{
    mode:"pg17_stage",host:"postgres",port:5432,database:"agentstudio_stage",
    user:apiUser,expectedMajor:17})
  assert.deepEqual(selectPgRuntimeTarget(legacyWorker,"worker"),{
    mode:"pg17_stage",host:"127.0.0.1",port:5432,
    database:"agentstudio_stage",user:workerUser,expectedMajor:17})
  assert.equal(selectPgRuntimeTarget({...legacyApi,AGENT_STUDIO_PG_PORT:"5432"},"api").port,5432)
})
test("BaoTa PG18 target is opt-in, localhost:5333 and protected from accidental worker start",()=>{
  assert.deepEqual(selectPgRuntimeTarget(baotaApi,"api","linux"),{
    mode:"baota_pg18",host:"127.0.0.1",port:5333,
    database:"agent_studio",user:apiUser,expectedMajor:18})
  assert.equal(selectPgRuntimeTarget(baotaWorker,"worker","linux").user,workerUser)
  assert.throws(()=>selectPgRuntimeTarget(baotaApi,"api","win32"),/unsafe_pg_runtime_target/)
  assert.throws(()=>selectPgRuntimeTarget(baotaApi,"worker","linux"),/unsafe_pg_runtime_target/)
  assert.throws(()=>selectPgRuntimeTarget({
    ...baotaWorker,AGENT_STUDIO_PG_BAOTA18_WORKER_TRIAL_ALLOWED:undefined
  },"worker","linux"),/unsafe_pg_runtime_target/)
})
test("reject wrong DB, network endpoint, roles, implicit environment overrides and incomplete guards",()=>{
  const corrupt=[
    {AGENT_STUDIO_PG_HOST:"192.168.1.133"},
    {AGENT_STUDIO_PG_HOST:"localhost"},
    {AGENT_STUDIO_PG_PORT:"5432"},
    {AGENT_STUDIO_PG_PORT:"05333"},
    {AGENT_STUDIO_PG_DATABASE:"vcaios"},
    {AGENT_STUDIO_PG_DATABASE:"postgres"},
    {AGENT_STUDIO_PG_USER:"postgres"},
    {AGENT_STUDIO_PG_USER:"agent_studio"},
    {AGENT_STUDIO_PG_BAOTA18_ENABLED:"false"},
    {AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"false"},
    {AGENT_STUDIO_PG_PILOT_ENABLED:undefined},
    {PGHOST:"127.0.0.1"},
    {PGPORT:"5333"},
    {DATABASE_URL:"postgresql://anything"},
  ]
  for(const change of corrupt)
    assert.throws(()=>selectPgRuntimeTarget({...baotaApi,...change},"api","linux"),
      /unsafe_pg_runtime_target/,JSON.stringify(change))
  for(const bad of [
    {...legacyApi,AGENT_STUDIO_PG_PORT:"5333"},
    {...legacyApi,AGENT_STUDIO_PG_DATABASE:"agent_studio"},
    {...legacyApi,AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED:"true"},
    {...legacyWorker,AGENT_STUDIO_PG_WORKER_USER:"postgres"},
  ])assert.throws(()=>selectPgRuntimeTarget(bad,bad.AGENT_STUDIO_PG_WORKER_USER?"worker":"api"),
    /unsafe_pg_runtime_target/)
})

function fakePool(row){
  let released=false
  return {
    async connect(){
      return {
        async query(query){
          assert.match(query,/server_version_num/)
          assert.match(query,/inet_server_port/)
          // Fail regression if the SQL returns 127.0.0.1/32 instead of its host.
          assert.match(query,/host\(inet_server_addr\(\)\)/)
          assert.doesNotMatch(query,/inet_server_addr\(\)::text/)
          return {rows:[row]}
        },
        release(){released=true},
      }
    },
    get released(){return released},
  }
}
function row(target){
  return {
    db:target.database,serverVersion:target.expectedMajor*10000,
    serverPort:target.port,serverAddress:target.mode==="baota_pg18"?
      "127.0.0.1":"172.18.0.2",
    login:target.user,superuser:false,bypassrls:false,
  }
}
test("server facts must match exactly before enabling PG18 API or Worker",async()=>{
  const target=selectPgRuntimeTarget(baotaApi,"api","linux")
  const valid=fakePool(row(target))
  await verifyPgRuntimeTarget(valid,target)
  assert.equal(valid.released,true)
  for(const alteration of [
    {db:"vcaios"},{db:"postgres"},{login:"postgres"},
    {serverVersion:170009},{serverVersion:190000},
    {serverPort:5432},{serverPort:undefined},
    {serverAddress:"192.168.1.133"},
    {serverAddress:"127.0.0.2"},
    {superuser:true},{bypassrls:true},
  ]){
    const pool=fakePool({...row(target),...alteration})
    await assert.rejects(verifyPgRuntimeTarget(pool,target),/pg_runtime_target_mismatch/,
      JSON.stringify(alteration))
    assert.equal(pool.released,true)
  }
})
test("legacy PG17 SQL server target check remains unchanged",async()=>{
  const stage=selectPgRuntimeTarget(legacyWorker,"worker")
  await verifyPgRuntimeTarget(fakePool(row(stage)),stage)
  await assert.rejects(verifyPgRuntimeTarget(fakePool({
    ...row(stage),serverVersion:180000}),stage),/pg_runtime_target_mismatch/)
})
