// Configuration and original-client call traces only, not live catalog evidence.
import test from "node:test"
import assert from "node:assert/strict"
import {selectNativeAgentTemplateMarketCapabilities,agentTemplateMarketNativeApproval,requireAgentTemplateMarketNative,
 requireAgentTemplateMarketAudit,inspectAgentTemplateMarketApiPool,loadAgentTemplateMarketAuditVerifier} from "../src/agent-template-market-runtime-policy.ts"
import {verifyAgentTemplateMarketCredentials} from "../src/agent-template-market-audit.ts"
const key="AGENT_STUDIO_PG18_AGENT_TEMPLATE_MARKET_",approved=()=>({[key+"AVAILABLE"]:"true",[key+"APPROVED"]:agentTemplateMarketNativeApproval})

test("fixed literal loader returns the real catalog verifier without invoking it",async()=>{
 assert.equal(await loadAgentTemplateMarketAuditVerifier(),verifyAgentTemplateMarketCredentials)
})
test("read/write default off and explicit Native approval needs listening HTTPS service",()=>{
 assert.deepEqual(selectNativeAgentTemplateMarketCapabilities({},false,"",false),{available:false,writes:false})
 assert.deepEqual(selectNativeAgentTemplateMarketCapabilities(approved(),true,"https://localhost:7458",false),{available:true,writes:false})
 assert.deepEqual(selectNativeAgentTemplateMarketCapabilities({...approved(),[key+"WRITES_ENABLED"]:"true"},true,"https://localhost:7458",true),{available:true,writes:true})
 for(const [env,listen,origin,writing]of[[approved(),false,"https://localhost:7458",true],[approved(),true,"http://localhost:7458",true],
 [{...approved(),[key+"APPROVED"]:"yes"},true,"https://localhost:7458",true],[{...approved(),[key+"WRITES_ENABLED"]:"true"},true,"https://localhost:7458",false],
 [{[key+"WRITES_ENABLED"]:"true"},true,"https://localhost:7458",true],[{...approved(),[key+"AVAILABLE"]:"false"},true,"https://localhost:7458",true]])assert.throws(()=>selectNativeAgentTemplateMarketCapabilities(env,listen,origin,writing))
})
test("Native identity is server-owned and actual verifier dependency has no permissive fallback",async()=>{
 for(const identity of[null,{issuer:"arbitrary",subject:"x"},{issuer:"urn:agentstudio:local:v1",subject:""}])assert.throws(()=>requireAgentTemplateMarketNative(identity))
 requireAgentTemplateMarketNative({issuer:"urn:agentstudio:local:v1",subject:"native-subject"})
 const db={};await assert.rejects(requireAgentTemplateMarketAudit(db,undefined),/actual_auditor_required/)
 await assert.rejects(requireAgentTemplateMarketAudit(db,async()=>false),e=>e.status===503)
 const problem=Error("unsafe_agent_template_market_privileges");await assert.rejects(requireAgentTemplateMarketAudit(db,async()=>{throw problem}),e=>e===problem)
})
test("startup inspector alone uses read-only and original-client actual-verifier seam, always rolling back/releasing",async()=>{
 for(const fail of[false,true]){
  const trace=[],db={query:async sql=>{trace.push(sql);return{rows:sql==="SELECT current_user AS role"?[{role:"agentstudio_api"}]:[]}},release(){trace.push("release")}},pool={connect:async()=>db}
  const audit=async client=>{assert.equal(client,db);trace.push("AUDIT_TRACE_ONLY");if(fail)throw Error("tampered");return true}
  if(fail)await assert.rejects(inspectAgentTemplateMarketApiPool(pool,audit));else await inspectAgentTemplateMarketApiPool(pool,audit)
  assert.equal(trace[0],"BEGIN READ ONLY");assert.deepEqual(trace.slice(-2),["ROLLBACK","release"]);assert.equal(trace.includes("COMMIT"),false)
 }
})
