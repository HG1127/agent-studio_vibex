import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
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
