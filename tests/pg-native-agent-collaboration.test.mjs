import test from "node:test"
import assert from "node:assert/strict"
import {createPgNativePilotApi} from "../src/lib/pgNativePilotApi.ts"
const id="11111111-1111-4111-8111-111111111111",member="22222222-2222-4222-8222-222222222222",request="33333333-3333-4333-8333-333333333333"
const choice={action:"grant",request_id:request,recipient_email:"Member@Example.test",role:"editor",expected_access_revision:0}
const saved={spec_id:id,request_id:request,recipient_id:member,role:"editor",active:true,revision:1,replayed:true}
test("collaboration SDK seals the same normalized request for read-only confirmation and refuses credentials before transport",async()=>{
  const requests=[];let lose=true
  const api=createPgNativePilotApi(async(route,init)=>{requests.push({route,init});if(lose){lose=false;throw Error("Synthetic response lost")}
    return new Response(JSON.stringify({item:saved}),{status:200})})
  await assert.rejects(api.changeAgentCollaboration(id,choice))
  assert.equal((await api.confirmAgentCollaboration(id,choice)).replayed,true)
  assert.equal(requests[0].init.body,requests[1].init.body)
  assert.ok(requests[0].route.endsWith("/change"));assert.ok(requests[1].route.endsWith("/confirm"))
  assert.equal(requests[1].init.credentials,"same-origin");assert.equal(Object.hasOwn(requests[1].init.headers,"Authorization"),false)
  assert.equal(JSON.parse(requests[1].init.body).recipient_email,"member@example.test")
  const count=requests.length
  await assert.rejects(api.changeAgentCollaboration(id,{...choice,api_key:"forbidden"}),e=>e.status===400)
  await assert.rejects(api.changeAgentCollaboration(id,{action:"edit",request_id:request,expected_spec_revision:1,source_sha256:"a".repeat(64),safe:{goal:"Safe",model_binding:{connection_id:member}}}),e=>e.status===400)
  assert.equal(requests.length,count)
})
test("collaboration SDK refuses a mismatched acknowledgement and never renders protected fields in a safe-text response",async()=>{
  for(const change of [{spec_id:member},{request_id:member},{revision:2},{active:false},{role:"viewer"}]){
    const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({item:{...saved,...change}}),{status:200}))
    await assert.rejects(api.confirmAgentCollaboration(id,choice),e=>e.code==="invalid_pg_native_agent_collaboration_response")
  }
  const api=createPgNativePilotApi(async()=>new Response(JSON.stringify({item:{id,name:"Shared",revision:1,role:"viewer",source_sha256:"a".repeat(64),
    safe:{goal:"Safe",task_scope:"",deliverables:[],task_plan:[],done_criteria:[],model_binding:{api_key:"PRIVATE"}},grants:[],proposals:[]}}),{status:200}))
  await assert.rejects(api.getAgentCollaboration(id),e=>e.code==="invalid_pg_native_agent_collaboration_response")
})
