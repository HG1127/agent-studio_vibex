// Opt-in client-controller -> real Native HTTP/Cookie/RLS -> embedded SQL
// -> private mTLS Worker smoke test. Requires a fresh, explicitly started
// native-run-browser-fixture. No installed PostgreSQL or real provider used.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {createPgNativePilotApi} from "../../../src/lib/pgNativePilotApi.ts"
import {createPgNativeRunSubmission} from "../../../src/lib/pgNativeRunSubmission.ts"

test("employee Run controller recovers a committed lost response and completes an owner-isolated mTLS task once",async()=>{
  if(process.env.AGENT_STUDIO_PG_BROWSER_FIXTURE!=="SYNTHETIC_LOCAL_ONLY")
    throw Error("synthetic_local_browser_fixture_required")
  const info=JSON.parse(readFileSync(new URL("../../../.tmp/pg-migration-completion/native-run-browser-info.json",import.meta.url),"utf8"))
  assert.equal(info.synthetic_only,true)
  assert.ok(Number.isSafeInteger(info.apiPort)&&info.apiPort>1024&&info.apiPort<65536)
  assert.equal(new URL(info.url).origin,"http://localhost:17443")
  const base="http://127.0.0.1:"+info.apiPort,origin="http://localhost:17443"
  const control=async(name,method="POST")=>{
    const res=await fetch(base+"/__fixture/"+name,{method,
      headers:{"X-AgentStudio-Synthetic-Fixture":"1"},signal:AbortSignal.timeout(15000)})
    assert.equal(res.status,200);return res.json()
  }
  const before=await control("state","GET")
  assert.equal(before.runs,0,"test requires fresh synthetic fixture")
  assert.equal(before.generated,0)
  let cookie=""
  const api=createPgNativePilotApi(async(route,options={})=>{
    const response=await fetch(base+route,{...options,headers:{...options.headers,
      ...(cookie?{Cookie:cookie}:{}),Origin:origin},signal:AbortSignal.timeout(15000)})
    const saved=response.headers.get("set-cookie")
    if(saved)cookie=saved.split(";")[0]
    return response
  },"")
  await api.login("alice@example.com","SyntheticAlicePassword#2026")
  const capability=await api.getConfigCapabilities()
  assert.equal(capability.run_submission_enabled,true)
  assert.equal(capability.bound_model_runs_enabled,true)
  const [agent]=await api.listAgents()
  assert.equal(agent.name,"Alice Browser Agent")
  const guard=createPgNativeRunSubmission(()=>"synthetic-controller-request-0001")
  const draft={agentId:agent.id,instruction:"Alice controller synthetic task"}
  await control("drop-next")
  await assert.rejects(guard.submit(api,draft))
  assert.ok(guard.pending())
  assert.equal((await control("state","GET")).runs,1,"lost response must follow committed task")
  const accepted=await guard.submit(api,{agentId:agent.id,instruction:"This edited draft must not replace the pending request"})
  assert.equal(accepted.replayed,true)
  assert.equal(accepted.run.instruction,draft.instruction)
  assert.equal(guard.pending(),null)
  const recovered=await control("state","GET")
  assert.equal(recovered.runs,1)
  assert.equal(recovered.submissions,2)
  assert.equal(recovered.submitHashes.length,2)
  assert.equal(recovered.submitHashes[0],recovered.submitHashes[1])
  assert.equal((await control("prepare")).status,"prepared")
  const prepared=await api.getRun(accepted.run.id)
  assert.equal(prepared.approval.status,"pending")
  assert.equal(prepared.run.checkpoint.spec_revision,agent.revision)
  await api.login("bob@example.com","SyntheticBobPassword#2026")
  assert.equal((await api.listAgents())[0].name,"Bob Browser Agent")
  assert.deepEqual(await api.listRuns(),[])
  await assert.rejects(api.getRun(accepted.run.id),e=>e.status===404)
  await assert.rejects(api.decideModel(accepted.run.id,"approved"),e=>e.status===404)
  await api.login("alice@example.com","SyntheticAlicePassword#2026")
  await api.decideModel(accepted.run.id,"approved")
  assert.equal((await api.decideModel(accepted.run.id,"approved")).replayed,true)
  assert.equal((await control("model")).status,"succeeded")
  assert.equal((await control("model")).status,"idle")
  const result=await api.getRun(accepted.run.id)
  assert.equal(result.run.status,"succeeded")
  assert.equal(result.run.result_text,"Browser synthetic bound result")
  const final=await control("state","GET")
  assert.equal(final.runs,1);assert.equal(final.generated,1)
  console.log(JSON.stringify({synthetic_only:true,runs:final.runs,submission_requests:final.submissions,
    generated:final.generated,same_recovery_request:true,employee_isolation:true,private_mtls:true}))
})
