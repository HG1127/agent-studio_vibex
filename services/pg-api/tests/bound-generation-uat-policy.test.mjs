import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {selectNativePg18UatCapabilities,permitNativePg18BusinessUatRequest} from "../src/native-config-uat-policy.ts"

const https="https://127.0.0.1:7443"
const config={
  AGENT_STUDIO_PG18_CONFIG_WRITE_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_UAT_APPROVAL:"APPROVE_ISOLATED_PG18_CONFIG_UAT_ONLY",
}
const run={
  ...config,
  AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_RUN_APPROVAL_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_RUN_APPROVAL_UAT_ONLY",
}
const bound={
  ...run,
  AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"true",
  AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_OWNER_BOUND_GENERATION_UAT_ONLY",
}
const choose=(env,listen=true,origin=https,uid=1200)=>
  selectNativePg18UatCapabilities(env,listen,origin,uid)

test("bound model execution requires its own explicit config+run+paid UAT permission",()=>{
  for(const env of [{},config,run,
    {...config,AGENT_STUDIO_PG18_MODEL_PROBE_UAT_ENABLED:"true",
      AGENT_STUDIO_PG18_MODEL_PROBE_UAT_APPROVED:"APPROVE_DISPOSABLE_PG18_PROVIDER_READONLY_PROBE_ONLY"}
  ])assert.notEqual(choose(env).boundModelExecutionUat,true)
  assert.equal(choose(bound).boundModelExecutionUat,true)
  for(const env of [
    {...config,AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"true",
      AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:bound.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED},
    {...run,AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"true"},
    {...bound,AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:"wrong"},
    {...run,AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED:bound.AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_APPROVED},
    {...bound,AGENT_STUDIO_PG18_BOUND_GENERATION_UAT_ENABLED:"false"},
  ])assert.throws(()=>choose(env),/unsafe_native_pg18_uat_config/)
  assert.throws(()=>choose(bound,false),/unsafe_native_pg18_uat_config/)
  assert.throws(()=>choose(bound,true,"http://127.0.0.1:7443"),/unsafe_native_pg18_uat_config/)
  assert.throws(()=>choose(bound,true,https,0),/unsafe_native_pg18_uat_config/)
})
test("paid UAT capability alone does not register any browser-facing model execution route",()=>{
  const cap=choose(bound)
  for(const [path,method] of [
    ["/api/v2/models/generate","POST"],
    ["/api/v2/model-connections/generate","POST"],
    ["/api/v2/runs/863eb81f-2a04-4147-91d6-b1c71f0e8d38/generate","POST"],
    ["/api/v2/model-connections/863eb81f-2a04-4147-91d6-b1c71f0e8d38/execute","POST"],
  ])assert.equal(permitNativePg18BusinessUatRequest(path,method,cap),false)
})
test("native API never mounts the private Worker/Broker paid dispatch handler",()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
  const api=readFileSync(path.join(root,"services/pg-api/src/native-server.ts"),"utf8")
  assert.match(api,/scopedKnowledgePool\(adapter\(businessPool\),capabilities\.knowledgeSharingUat===true\)/)
  assert.match(api,/createNativeRunRepository\(business,capabilities\)/)
  for(const source of [api]){
    assert.doesNotMatch(source,/allowBoundModelRuns/)
    assert.doesNotMatch(source,/boundModelDispatch/)
    assert.doesNotMatch(source,/boundExecutionApproved/)
    assert.doesNotMatch(source,/BoundLeaseIdentityRepository/)
    assert.doesNotMatch(source,/verifyBoundWorkerMutualTlsPeer/)
    assert.doesNotMatch(source,/createIsolatedBoundModelInternalHandler/)
  }
})
