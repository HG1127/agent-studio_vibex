import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222",request="33333333-3333-4333-8333-333333333333",hash="a".repeat(64)
const choice={action:"snapshot",request_id:request,expected_spec_revision:3,source_sha256:hash,note:"  Owned version  ",test_run_id:null}
const saved={spec_id:id,request_id:request,replayed:true,version_id:version,version_no:1,version_revision:1,version_sha256:"b".repeat(64),release_revision:1,source_sha256:hash,status:"draft",test_passed:false}

test("full version SDK retains the exact normalized request after a lost response and refuses client snapshots or test results before transport",async()=>{
  const requests=[];let lose=true
  const api=createPgNativePilotApi(async(route,init)=>{requests.push({route,init});if(lose){lose=false;throw Error("Synthetic response lost")}
    return new Response(JSON.stringify({item:saved}),{status:200})})
  await assert.rejects(api.changeAgentRelease(id,choice))
  assert.equal((await api.confirmAgentRelease(id,choice)).version_id,version)
  assert.equal(requests[0].init.body,requests[1].init.body)
  assert.ok(requests[0].route.endsWith("/change"));assert.ok(requests[1].route.endsWith("/confirm"))
  assert.equal(JSON.parse(requests[1].init.body).note,"Owned version")
  assert.equal(requests[1].init.credentials,"same-origin");assert.equal(Object.hasOwn(requests[1].init.headers,"Authorization"),false)
  for(const extra of [{spec_snapshot:{}},{test_passed:true},{owner_user_id:version},{api_key:"forbidden"}])
    await assert.rejects(api.changeAgentRelease(id,{...choice,...extra}),e=>e.status===400)
  assert.equal(requests.length,2)
})

test("version acknowledgements bind source/request/status revisions and independent acceptance uses its own route",async()=>{
  for(const change of [{spec_id:version},{request_id:version},{version_revision:2},{source_sha256:"f".repeat(64)},{test_passed:true},{status:"published"}]){
    const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({item:{...saved,...change}}),{status:200}))
    await assert.rejects(api.confirmAgentRelease(id,choice),e=>e.code==="invalid_pg_native_agent_release_response")
  }
  const start={action:"acceptance",request_id:request,expected_spec_revision:3,source_sha256:hash,instruction:"Synthetic task",max_steps:8,model_binding:null,confirm:true},routes=[]
  const api=createPgNativePilotApi(async(route)=>{routes.push(route);return new Response(JSON.stringify({item:{spec_id:id,request_id:request,replayed:false,run_id:version,spec_revision:3,source_sha256:hash,status:"queued"}}),{status:200})})
  assert.equal((await api.changeAgentRelease(id,start)).run_id,version);assert.ok(routes[0].endsWith("/acceptance"))
  assert.equal((await api.confirmAgentRelease(id,start)).run_id,version);assert.ok(routes[1].endsWith("/confirm"))
})

test("version views reject false current-test labels and capabilities cannot enable acceptance without both write and Agent execution permission",async()=>{
  const workspace={spec_id:id,name:"Owned role",spec_revision:3,source_sha256:hash,release_revision:1,next_version_no:2,active_version_id:null,acceptance_runs:[],
    versions:[{id:version,version_no:1,spec_revision:3,source_sha256:hash,version_sha256:"b".repeat(64),name:"Owned role",note:"",test_run_id:null,test_passed:false,test_current:true,
      status:"draft",revision:1,created_at:"2026-10-26T00:00:00Z",published_at:null}]}
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({item:workspace}),{status:200}))
  await assert.rejects(api.getAgentReleases(id),e=>e.code==="invalid_pg_native_agent_release_response")
  const valid={mode:"native_pg18",config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false,agent_releases_available:true,
    agent_release_acceptance_enabled:true,autonomous_agent_submission_enabled:true}
  for(const change of [{config_writes_enabled:false},{autonomous_agent_submission_enabled:false},{agent_releases_available:false},{agent_release_acceptance_enabled:"true"}]){
    const client=createPgNativePilotApi(async()=>new Response(JSON.stringify({...valid,...change}),{status:200}))
    await assert.rejects(client.getConfigCapabilities(),e=>e.status===503)
  }
})
