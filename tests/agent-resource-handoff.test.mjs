import test from "node:test"
import assert from "node:assert/strict"
import {
 AGENT_RESOURCE_HANDOFF_CHANNEL,createAgentResourceHandoff,
 isMatchingAgentResourceHandoff,notifyOtherAgentTabs,
} from "../src/lib/agentResourceHandoff.ts"
import {EMPTY_AGENT_RESOURCE_FOCUS,requestAgentResourceFocus,resourceFocusForAgent,resourceFocusCapability} from "../src/lib/agentResourceFocus.ts"
import {toolConnectionTestRoute} from "../src/lib/toolConnectionNavigation.ts"

const agentId="abcdefghijklmno"
const capability="browser_need"
const now=1782560000000

test("capability HTTP test deep-link resolves only real owner-scoped IDs, not raw names or secrets",()=>{
  const rows=[{id:"connection12345",name:"private-browser-READ"},
    {id:"otherowner?token",name:"unsafe-name"}]
  assert.equal(toolConnectionTestRoute(rows,["private-browser-READ"]),
    "/tool-connections?connection=connection12345")
  assert.equal(toolConnectionTestRoute(rows,["unsafe-name"]),"/tool-connections")
  assert.equal(toolConnectionTestRoute(rows,["missing"] ),"/tool-connections")
  assert.equal(toolConnectionTestRoute(rows,["missing","private-browser-READ"]),
    "/tool-connections?connection=connection12345")
  assert.ok(!toolConnectionTestRoute(rows,["private-browser-READ"]).includes("private-browser"))
})

test("resource focus is one-shot, repeatable and scoped to the exact saved Agent",()=>{
  const first=requestAgentResourceFocus(EMPTY_AGENT_RESOURCE_FOCUS,agentId,capability)
  assert.deepEqual(resourceFocusForAgent(first,agentId),{token:1,capabilityId:capability})
  assert.deepEqual(resourceFocusForAgent(first,"123456789012345"),{token:0,capabilityId:""},
    "switching Agent must not focus another draft's capability")
  const second=requestAgentResourceFocus(first,agentId,capability)
  assert.equal(second.token,2,"clicking the same capability must trigger a new focus request")
  assert.equal(requestAgentResourceFocus(second,"../bad",capability).token,0)
  assert.deepEqual(resourceFocusForAgent(second,"../bad"),{token:0,capabilityId:""})
  assert.equal(requestAgentResourceFocus(second,agentId,"../../secret").capabilityId,"")
})

test("saved-version capability deep link never targets another Agent",()=>{
  assert.equal(resourceFocusCapability(undefined,agentId,agentId,capability),capability)
  assert.equal(resourceFocusCapability(undefined,"123456789012345",agentId,capability),"")
  assert.equal(resourceFocusCapability(undefined,null,agentId,capability),"")
  assert.equal(resourceFocusCapability("",agentId,agentId,capability),"",
    "explicit cleared focus must suppress a stale URL")
  assert.equal(resourceFocusCapability("selected_need",agentId,agentId,capability),"selected_need")
  assert.equal(resourceFocusCapability("../../secret",agentId,agentId,capability),"")
})

test("resource handoff includes identifiers and a short timestamp only, never drafts",()=>{
  const signal=createAgentResourceHandoff(agentId,capability,now)
  assert.deepEqual(signal,{
    type:"resource-review-request",specId:agentId,capabilityId:capability,issuedAt:now,
  })
  assert.deepEqual(Object.keys(signal).sort(),["capabilityId","issuedAt","specId","type"])
  assert.equal(createAgentResourceHandoff("../admin",capability,now),null)
  assert.equal(createAgentResourceHandoff(agentId,capability,-1),null)
  assert.equal(createAgentResourceHandoff(agentId,"../../secret",now)?.capabilityId,"")
})

test("handoff rejects another Agent, revoked capability, stale/future event and forged payload",()=>{
  const signal=createAgentResourceHandoff(agentId,capability,now)
  assert.equal(isMatchingAgentResourceHandoff(signal,agentId,[capability],now+300),true)
  assert.equal(isMatchingAgentResourceHandoff(signal,"123456789012345",[capability],now),false)
  assert.equal(isMatchingAgentResourceHandoff(signal,agentId,["different"],now),false)
  assert.equal(isMatchingAgentResourceHandoff(signal,agentId,[capability],now+301001),false)
  assert.equal(isMatchingAgentResourceHandoff(signal,agentId,[capability],now-6000),false)
  for(const invalid of [null,[],{},new Date(),{...signal,type:"publish-agent"},
    {...signal,capabilityId:"../secret"},{...signal,issuedAt:"invalid"},
    {...signal,issuedAt:Infinity},{...signal,issuedAt:now+1.1}])
    assert.equal(isMatchingAgentResourceHandoff(invalid,agentId,[capability],now),false)
})

test("legacy Agent without an explicit ability can accept only an unscoped reminder",()=>{
  const signal=createAgentResourceHandoff(agentId,"",now)
  assert.equal(isMatchingAgentResourceHandoff(signal,agentId,[],now),true)
  assert.equal(isMatchingAgentResourceHandoff({...signal,capabilityId:"old_need"},agentId,[],now),false)
})

test("sending via BroadcastChannel reaches an already-open other tab without saving anything",async()=>{
  if(typeof BroadcastChannel==="undefined")return
  const receiver=new BroadcastChannel(AGENT_RESOURCE_HANDOFF_CHANNEL)
  try{
    const message=Promise.race([
      new Promise(resolve=>receiver.addEventListener("message",event=>resolve(event.data),{once:true})),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("broadcast_not_delivered")),1200)),
    ])
    assert.equal(notifyOtherAgentTabs(createAgentResourceHandoff(agentId,capability)),true)
    const received=await message
    assert.equal(isMatchingAgentResourceHandoff(received,agentId,[capability]),true)
  }finally{receiver.close()}
  assert.equal(notifyOtherAgentTabs(null),false)
})
