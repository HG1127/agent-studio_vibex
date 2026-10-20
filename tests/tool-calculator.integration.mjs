// Real PocketBase calculator tool roundtrip: both Workflow and Agent share Goja module.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"

const root=process.cwd()
const pb=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb),"POCKETBASE_BIN must point to PocketBase binary")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-calculator-integration-"))
const port=Number(process.env.PB_CALCULATOR_TEST_PORT||7361)
const modelPort=Number(process.env.PB_CALCULATOR_MODEL_PORT||7362)
const origin="http://127.0.0.1:"+port
const uid="calc-test-user"
const server=spawnHeadlessPocketBase(pb,["serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks")],{
  cwd:path.join(root,"pocketbase"),windowsHide:true,
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false"},
})
let logs=""
server.stdout.on("data",x=>logs=(logs+x).slice(-15000))
server.stderr.on("data",x=>logs=(logs+x).slice(-15000))
let modelRequests = 0
const model=createServer(async(request,response)=>{
  let raw=""
  for await(const chunk of request) raw+=chunk.toString()
  const message=JSON.parse(raw||"{}")
  modelRequests++
  const texts=(message.messages||[]).filter(item=>item.role==="user").map(item=>String(item.content||"")).join("\n")
  const initial=texts.includes("（尚无，这是第一步）")
  const content=initial
    ? JSON.stringify(texts.includes("HARNESS_INVALID_ARGS_CASE")
      ? {action:"tool",thought:"Bad calculator parameters",tool:"calculate",tool_input:{expression:{nested:"unsafe"}}}
      : {action:"tool",thought:"Use the calculator",tool:"calculate",tool_input:{expression:"(2+3)*4"}})
    : JSON.stringify({action:"final",thought:"Verified calculation",final_answer:"CALCULATOR_AGENT_COMPLETE 20"})
  response.writeHead(200,{"Content-Type":"application/json"})
  response.end(JSON.stringify({choices:[{message:{role:"assistant",content}}]}))
})
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function call(method,route,body) {
  const res=await fetch(origin+route,{
    method,headers:{"Content-Type":"application/json","X-Rh-User-Id":uid},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(12000),
  })
  const data=await res.json().catch(()=>({}))
  assert.equal(res.status,200,method+" "+route+": "+JSON.stringify(data))
  return data
}
try {
  await new Promise(resolve=>model.listen(modelPort,"127.0.0.1",resolve))
  let ready=false
  for(let i=0;i<120;i++){
    if(server.exitCode!==null) break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
    await sleep(150)
  }
  assert.ok(ready,"PocketBase not ready "+logs.slice(-2500))
  const graph={nodes:[
    {id:"s",type:"start",data:{title:"开始"},position:{x:0,y:0}},
    {id:"calc",type:"tool",data:{title:"计算",tool:"calculate",params_template:'{"expression":"(2+3)*4"}'},position:{x:120,y:0}},
    {id:"end",type:"end",data:{title:"结束",output_template:"{{计算.output}}"},position:{x:240,y:0}},
  ],edges:[{id:"e1",source:"s",target:"calc"},{id:"e2",source:"calc",target:"end"}]}
  const wf=await call("POST","/api/workflow-studio/create",{name:"Shared calculator",graph})
  const wfRun=await call("POST","/api/workflow-runs/start",{workflow_id:wf.id,instruction:"Calculate a deterministic expression"})
  let workflow=null
  for(let i=0;i<9;i++){
    await call("POST","/api/llm/workflow-engine/"+wfRun.run_id+"/tick",{})
    const data=await call("GET","/api/workflow-runs/"+wfRun.run_id+"/detail")
    workflow=data.run
    if(["succeeded","failed"].includes(workflow.status))break
  }
  assert.equal(workflow?.status,"succeeded",JSON.stringify(workflow))
  assert.match(workflow.result,/\(2\+3\)\*4 = 20/)
  const wfTrace=await call("GET","/api/execution-traces?kind=workflow&run_id="+wfRun.run_id)
  assert.ok(wfTrace.items.some(item=>item.operation==="tool"&&item.status==="succeeded"))
  assert.ok(wfTrace.summary.tool_calls >= 1)
  assert.ok(wfTrace.summary.p95_ms >= 0)
  assert.doesNotMatch(JSON.stringify(wfTrace),/expression|api_key|headers|Bearer /i)
  const conn=await call("POST","/api/model-connections",{
    name:"Calc mock",provider:"openai",base_url:"http://127.0.0.1:"+modelPort+"/v1",
    api_key:"test-only-key",models:["calc-model"],
  })
  const spec=await call("POST","/api/agent_specs",{
    name:"Calculate",
    spec:{goal:"calculate (2+3)*4",task_scope:"Use calculate tool",tools:["calculate"],deliverables:["result"],
      task_plan:["Calculate","Answer"],done_criteria:["Correct result"]},
  })
  const run=await call("POST","/api/agent-runs/start",{
    spec_id:spec.id,instruction:"CALCULATOR_AGENT_TEST calculate (2+3)*4",
    model:"calc-model",config:{max_steps:5,tools:{calculate:true},
      custom_model:{connection_id:conn.item.id,model_id:"calc-model"}},
  })
  // Reboot recovery: only checkpoint claims the worker is busy, but the
  // authoritative lease table contains no live holder. New tick must proceed.
  const agentDB = new DatabaseSync(path.join(dir,"data.db"), {timeout:5000})
  try {
    const raw = agentDB.prepare("SELECT checkpoint FROM agent_runs WHERE id=?")
      .get(run.run_id).checkpoint
    const stalled = JSON.parse(raw)
    stalled.claim_until = Date.now()+3600_000
    agentDB.prepare("UPDATE agent_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify(stalled),run.run_id)
  } finally {agentDB.close()}
  let result
  for(let i=0;i<7;i++){
    await call("POST","/api/llm/agent-engine/"+run.run_id+"/tick",{})
    result=await call("GET","/api/agent_runs/"+run.run_id)
    if(["succeeded","failed"].includes(result.status))break
  }
  assert.equal(result?.status,"succeeded",JSON.stringify(result))
  assert.match(result.result,/CALCULATOR_AGENT_COMPLETE 20/)
  const detail=await call("GET","/api/agent-runs/"+run.run_id+"/detail")
  assert.match(JSON.stringify(detail.events||[]),/20/,"Agent must have run a real calculator, not only printed final answer")
  const agentTrace=await call("GET","/api/execution-traces?kind=agent&run_id="+run.run_id)
  assert.ok(agentTrace.items.some(item=>item.operation==="tool"&&item.status==="succeeded"))
  assert.ok(agentTrace.items.some(item=>item.operation==="model"&&item.status==="succeeded"))
  assert.ok(agentTrace.summary.model_calls >= 1)
  assert.ok(agentTrace.summary.tool_calls >= 1)
  assert.doesNotMatch(JSON.stringify(agentTrace),/expression|api_key|headers|Bearer /i)
  // A real test-only PocketBase Agent must reserve calls before provider I/O.
  // The second planning step cannot reach the mock model after a one-call cap.
  const beforeBudget = modelRequests
  const budgeted=await call("POST","/api/agent-runs/start",{
    spec_id:spec.id,instruction:"HARNESS_BUDGET_TEST calculate",model:"calc-model",
    config:{max_steps:5,max_model_calls:1,tools:{calculate:true},
      custom_model:{connection_id:conn.item.id,model_id:"calc-model"}},
  })
  await call("POST","/api/llm/agent-engine/"+budgeted.run_id+"/tick",{})
  await call("POST","/api/llm/agent-engine/"+budgeted.run_id+"/tick",{})
  const budgetRow=await call("GET","/api/agent_runs/"+budgeted.run_id)
  assert.equal(budgetRow.status,"failed",JSON.stringify(budgetRow))
  assert.match(budgetRow.error,/model_call_budget_exhausted/)
  assert.equal(budgetRow.checkpoint.harness_stats.llm_calls,1)
  assert.equal(modelRequests-beforeBudget,1,"Budget must prevent a second paid model request")

  const invalid=await call("POST","/api/agent-runs/start",{
    spec_id:spec.id,instruction:"HARNESS_INVALID_ARGS_CASE",model:"calc-model",
    config:{max_steps:5,max_model_calls:4,tools:{calculate:true},
      custom_model:{connection_id:conn.item.id,model_id:"calc-model"}},
  })
  await call("POST","/api/llm/agent-engine/"+invalid.run_id+"/tick",{})
  const denied=await call("GET","/api/agent_runs/"+invalid.run_id)
  assert.equal(denied.checkpoint.steps[0].action,"tool_input_invalid")
  const deniedDetail=await call("GET","/api/agent-runs/"+invalid.run_id+"/detail")
  assert.match(JSON.stringify(deniedDetail.events||[]),/tool_input_expression_invalid/)
  // Optional wall-clock guard: expired run preserves its checkpoint and must
  // not call the model even once after the deadline is reached.
  const modelCallsBeforeDeadline = modelRequests
  const deadlineRun = await call("POST","/api/agent-runs/start",{
    spec_id:spec.id,instruction:"HARNESS_DEADLINE_TEST",model:"calc-model",
    config:{max_steps:5,max_model_calls:4,max_runtime_minutes:1,tools:{calculate:true},
      custom_model:{connection_id:conn.item.id,model_id:"calc-model"}},
  })
  const deadlineDb = new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try {
    const raw = deadlineDb.prepare("SELECT checkpoint FROM agent_runs WHERE id=?")
      .get(deadlineRun.run_id).checkpoint
    const expired = JSON.parse(raw)
    assert.ok(expired.execution_deadline_ms>Date.now())
    expired.execution_deadline_ms = Date.now()-1000
    expired.evidence_refs = [{type:"knowledge",locator:"test-doc",excerpt:"preexisting",step:1,status:"retrieved"}]
    deadlineDb.prepare("UPDATE agent_runs SET checkpoint=? WHERE id=?")
      .run(JSON.stringify(expired),deadlineRun.run_id)
  } finally {deadlineDb.close()}
  const prevented=await call("POST","/api/llm/agent-engine/"+deadlineRun.run_id+"/tick",{})
  assert.equal(prevented.status,"failed")
  assert.equal(prevented.deadline_exceeded,true)
  const deadlineRow=await call("GET","/api/agent_runs/"+deadlineRun.run_id)
  assert.equal(deadlineRow.status,"failed")
  assert.equal(deadlineRow.error,"run_runtime_deadline_exceeded")
  assert.equal(deadlineRow.checkpoint.evidence_refs[0].locator,"test-doc")
  assert.equal(modelRequests,modelCallsBeforeDeadline,"Expired run may not send a model request")
  console.log("HARNESS_V2_AGENT_DEADLINE_PASS")

  console.log("HARNESS_V2_E2E_BUDGET_TOOL_SCHEMA_STALE_HINT_PASS")

  console.log("PASS shared calculator and owner-scoped tool traces: real Workflow and Agent")
} finally {
  server.kill()
  model.close()
  await Promise.race([new Promise(resolve=>server.once("exit",resolve)),sleep(1200)])
  await sleep(100)
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{}
}
