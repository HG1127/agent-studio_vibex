import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
import {scheduleActivationLocalStart,scheduleActivationWindow} from "../src/lib/pgNativeScheduleTime.ts"
import {parseScheduleActivation} from "../services/pg-api/src/schedule-runtime-contract.ts"
import {safeRunRequest} from "../services/pg-api/src/run-repository.ts"
import {safeWorkflowV2Request} from "../services/pg-api/src/workflow-v2-run-repository.ts"
const id="11111111-1111-4111-8111-111111111111",authority="22222222-2222-4222-8222-222222222222"
const body={expected_revision:1,expected_target_revision:2,instruction:"Synthetic background work",max_steps:1,anchor_at:"2026-10-24T00:00:00.000Z",expires_at:null,max_occurrences:null,max_auto_effects:10,background_ack:"AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1",knowledge_charge_ack:null,request_id:authority}
test("schedule activation retry retains the exact owner consent request and uses same-origin Cookie/CSRF transport",async()=>{
  const requests=[];let lost=true
  const api=createPgNativePilotApi(async(route,init)=>{requests.push({route,init});if(lost){lost=false;throw Error("synthetic_lost_response")}
    return new Response(JSON.stringify({state:{id,revision:2,authority_id:authority,replayed:true}}),{status:200})})
  await assert.rejects(api.activateSchedule(id,body))
  assert.equal((await api.activateSchedule(id,body)).replayed,true)
  assert.equal(requests[0].init.body,requests[1].init.body)
  assert.equal(requests[1].route,"/__pg_native/api/v2/schedules/"+id+"/activate")
  assert.equal(requests[1].init.credentials,"same-origin");assert.equal(requests[1].init.headers["X-AgentStudio-Request"],"1")
  assert.equal(Object.hasOwn(requests[1].init.headers,"Authorization"),false)
})
test("schedule client refuses a mismatched activation acknowledgement and inconsistent background capability",async()=>{
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({state:{id:authority,revision:2,authority_id:authority,replayed:true}}),{status:200}))
  await assert.rejects(api.activateSchedule(id,body),e=>e.code==="invalid_schedule_activation_response")
  const capabilities=createPgNativePilotApi(async()=>new Response(JSON.stringify({mode:"native_pg18",config_writes_enabled:true,run_execution_enabled:false,model_probe_enabled:false,workflow_v2_submission_enabled:true,schedule_execution_enabled:true}),{status:200}))
  await assert.rejects(capabilities.getConfigCapabilities(),e=>e.code==="invalid_native_capabilities")
})
test("future activation uses the plan timezone, rejects DST gaps and requires authority to cover the first occurrence",()=>{
  const window=(start,timeZone="Asia/Shanghai",options={})=>scheduleActivationWindow({start,timeZone,now:Date.parse("2026-03-01T00:00:00Z"),unlimited:false,days:30,...options})
  assert.equal(window({date:"2026-03-02",time:"09:00"}).anchor_at,"2026-03-02T01:00:00.000Z")
  assert.throws(()=>window({date:"2026-03-08",time:"02:30"},"America/New_York"),/dst_local_time_missing/)
  assert.throws(()=>window({date:"2026-03-01",time:"07:00"}),/schedule_start_in_past/)
  assert.throws(()=>window({date:"2026-04-05",time:"09:00"}),/schedule_expiry_before_start/)
  assert.equal(window({date:"2026-04-05",time:"09:00"},"Asia/Shanghai",{unlimited:true}).expires_at,null)
  assert.equal(window({date:"2026-11-01",time:"01:30"},"America/New_York",{unlimited:true}).anchor_at,"2026-11-01T05:30:00.000Z")
  assert.deepEqual(scheduleActivationLocalStart("2026-03-02T01:00:00.000Z","Asia/Shanghai",Date.parse("2026-03-01T00:00:00Z")),{date:"2026-03-02",time:"09:00"})
  assert.equal(scheduleActivationLocalStart("2026-03-02T01:00:00.000Z","Asia/Shanghai",Date.parse("2026-03-03T00:00:00Z")),null)
})
test("Native task boundaries retain all2000 UTF16 units and reject2001 without truncating replay bodies",async()=>{
  const instruction="迁".repeat(1998)+"🚀",now=Date.now(),request={instruction,idempotency_key:"synthetic-full-task-2000"}
  assert.equal(instruction.length,2000)
  assert.equal(safeRunRequest(request).instruction,instruction)
  assert.equal(safeWorkflowV2Request({...request,expected_revision:1}).instruction,instruction)
  const row={id,name:"Task boundary",kind:"workflow",workflow_id:authority,agent_spec_id:null,time_zone:"UTC",revision:1,deleted_at:null,execution:{},
    recurrence:{config_format:"pg_schedule_draft_v1",execution_supported:false,rule:{kind:"interval",interval_minutes:15}}}
  const activation={...body,instruction,anchor_at:new Date(now).toISOString()}
  assert.equal(parseScheduleActivation(activation,row,now).execution.instruction,instruction)
  for(const parse of [v=>safeRunRequest({...request,instruction:v}),v=>safeWorkflowV2Request({...request,expected_revision:1,instruction:v}),v=>parseScheduleActivation({...activation,instruction:v},row,now)]){
    assert.throws(()=>parse(instruction+"x"));assert.throws(()=>parse("x\0y"))
  }
  const requests=[],api=createPgNativePilotApi(async(route,init)=>{requests.push({route,init});return new Response(JSON.stringify({state:{id,revision:2,authority_id:authority,replayed:false}}),{status:200})})
  await api.activateSchedule(id,activation);assert.equal(JSON.parse(requests[0].init.body).instruction,instruction)
})
