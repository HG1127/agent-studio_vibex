// Isolated real PocketBase + deterministic OpenAI-compatible model:
// requirements -> clarification -> user confirms -> checkpoint resume -> final plan.
// Never touches employee data, production service, secrets or the browser.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:http"
import { spawnHeadlessPocketBase, stopHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const bin = process.env.POCKETBASE_BIN || path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(bin), "Set POCKETBASE_BIN to a local PocketBase executable")
const dir = fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-review-input-"))
const pbPort = Number(process.env.PB_REVIEW_INPUT_PORT || "7378")
const origin = "http://127.0.0.1:" + pbPort
const pause = ms => new Promise(resolve => setTimeout(resolve,ms))
const owner = "review-agent-user"
const other = "unrelated-employee"
const ownerHeaders = {"X-Rh-User-Id":owner}
let logs = "", actualModelDecisions = 0, modelRequests = 0
let finalPrompt = ""
const mock = createServer(async (req,res) => {
  let raw = ""
  for await (const chunk of req) raw += chunk.toString()
  modelRequests++
  const payload = JSON.parse(raw || "{}")
  const system = (payload.messages || []).find(msg => msg.role === "system")?.content || ""
  const user = (payload.messages || []).filter(msg => msg.role === "user").map(msg => msg.content).join("\n")
  let content = "本次任务经验：逐步收集需求，先确认，再做任务分解。"
  if (system.includes("助手执行引擎")) {
    actualModelDecisions++
    if (user.includes("STRICT_REVIEW_GATE")) {
      // Deliberately ignore the prompt instruction to ask for confirmation.
      // The engine, not the model, must block a premature final result.
      let draft = "【首轮需求草案】目标：完成知识库检索"
      if (system.includes("方案确认关卡已通过")) {
        finalPrompt = user
        draft = "【最终实施计划】需求方案已批准；第1阶段权限与资料接入，第2阶段检索与引用，第3阶段验收与部署"
      } else if (user.includes("草案不予批准")) {
        draft = "【修订需求草案】范围缩小到知识库检索与权限管理；等待用户批准"
      }
      content = JSON.stringify({thought:"Review-sensitive phase",action:"final",final_answer:draft})
    } else if (user.includes("【用户回复／确认】")) {
      finalPrompt = user
      content = JSON.stringify({
        thought:"需求草案已经获得用户的确认，完成实施计划",
        action:"final",
        final_answer:"【正式确认的需求方案】内部资料自动检索与总结。\n【落地计划】第一阶段建立资料库与权限，第二阶段接入检索，第三阶段验收输出并持续优化。\n【用户意见】" + (user.includes("优先实现检索") ? "优先实现检索" : "无"),
      })
    } else {
      content = JSON.stringify({
        thought:"先给出结构化需求草案，等待业务方确认",
        action:"ask_user",
        question:"【需求方案草案】目标：团队成员快速找到内部资料。范围：文档检索与摘要。交付物：需求文档与分阶段落地计划。\n请确认草案，或提供需要修改的地方。",
      })
    }
  }
  res.writeHead(200,{"Content-Type":"application/json"})
  res.end(JSON.stringify({choices:[{message:{role:"assistant",content}}]}))
})
const pb = spawnHeadlessPocketBase(bin,[
  "serve","--http=127.0.0.1:"+pbPort,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{
  cwd:path.join(root,"pocketbase"),
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false"},
  windowsHide:true,
})
pb.stdout.on("data",chunk=>{logs=(logs+chunk).slice(-6500)})
pb.stderr.on("data",chunk=>{logs=(logs+chunk).slice(-6500)})

async function api(method,route,body,headers=ownerHeaders) {
  const response = await fetch(origin+route,{
    method,
    headers:{"Content-Type":"application/json",...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(15000),
  })
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
async function ok(method,route,body,headers) {
  const result=await api(method,route,body,headers)
  assert.equal(result.status,200,method+" "+route+" "+JSON.stringify(result.data))
  return result.data
}
async function start(specId,modelConnectionId,maxSteps=5,instruction="团队需要把知识库检索需求形成正式方案，方案先经人工确认，再给出落地步骤",source="") {
  const result=await ok("POST","/api/agent-runs/start",{
    spec_id:specId,instruction,
    model:"review-model",
    config:{max_steps:maxSteps,source,tools:{},custom_model:{connection_id:modelConnectionId,model_id:"review-model"}},
  })
  return result.run_id
}
async function state(id) { return ok("GET","/api/agent_runs/"+id) }
async function tick(id) { return api("POST","/api/llm/agent-engine/"+id+"/tick",{}) }
try {
  await new Promise(resolve=>mock.listen(0,"127.0.0.1",resolve))
  const modelPort=mock.address().port
  let ready=false
  for(let i=0;i<90;i++) {
    if(pb.exitCode!==null) break
    try {if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(500)})).ok){ready=true;break}}catch{}
    await pause(150)
  }
  assert.ok(ready,"Isolated PocketBase not ready. Logs="+logs.slice(-1400))
  const model=await ok("POST","/api/model-connections",{
    name:"Review local model",provider:"openai",base_url:"http://127.0.0.1:"+modelPort+"/v1",
    api_key:"integration-test-only",models:["review-model"],
  })
  const spec=await ok("POST","/api/agent_specs",{
    name:"需求落地助手",
    spec:{
      goal:"整理输入需求，产出可确认的需求方案，并在确认后制定落地计划",
      task_scope:"仅负责方案设计与制定计划，不自动发布或修改公司资产",
      deliverables:["需求方案","执行分解与验收计划"],
      task_plan:["结构化整理需求","提交草案等待确认","制定实施计划"],
      done_criteria:["方案得到人工确认","输出分阶段的实施计划"],
      tools:[],
    },
  })
  const id=await start(spec.id,model.item.id)
  const first=await tick(id)
  assert.equal(first.status,200,JSON.stringify(first))
  const awaiting=await state(id)
  assert.equal(awaiting.status,"awaiting_input",JSON.stringify(awaiting))
  assert.equal(awaiting.current_step,1)
  assert.match(awaiting.checkpoint.pending_input.question,/需求方案草案/)
  assert.equal(awaiting.checkpoint.pending_input.step_index,1)
  const saved=await ok("GET","/api/agent-runs/"+id+"/detail")
  assert.equal(saved.run.status,"awaiting_input","Reload must return persisted pending input")
  assert.match(saved.run.checkpoint.pending_input.question,/请确认/)
  const lastCall=actualModelDecisions
  const noRetry=await tick(id)
  assert.ok([200,409].includes(noRetry.status),JSON.stringify(noRetry))
  assert.equal(actualModelDecisions,lastCall,"Pending confirmation must never re-call the model")

  assert.equal((await api("POST","/api/agent-runs/"+id+"/respond",{answer:"非法跨用户确认"},{"X-Rh-User-Id":other})).status,404)
  assert.equal((await api("POST","/api/agent-runs/"+id+"/respond",{answer:""})).status,400)
  assert.equal((await state(id)).status,"awaiting_input")
  const ack=await ok("POST","/api/agent-runs/"+id+"/respond",{
    answer:"确认草案，优先实现检索；要求保留原文引用和权限隔离。",
  })
  assert.equal(ack.status,"running")
  assert.equal((await api("POST","/api/agent-runs/"+id+"/respond",{answer:"重复提交"})).status,409,
    "A double-click or second browser tab must not overwrite the accepted answer")
  const checkpoint=await state(id)
  assert.equal(checkpoint.checkpoint.pending_input,null)
  assert.match(JSON.stringify(checkpoint.checkpoint.steps),/优先实现检索/)
  assert.equal(checkpoint.checkpoint.done_steps,1)
  assert.equal(checkpoint.current_step,1)

  const second=await tick(id)
  assert.equal(second.status,200,JSON.stringify(second))
  const completed=await state(id)
  assert.equal(completed.status,"succeeded",JSON.stringify(completed))
  assert.match(completed.result,/正式确认的需求方案/)
  assert.match(completed.result,/落地计划/)
  assert.match(finalPrompt,/优先实现检索/,"Model must receive the actual user reply")
  assert.equal(actualModelDecisions,2)
  const after=await ok("GET","/api/agent-runs/"+id+"/detail")
  const types=(after.events||[]).map(item=>item.event_type)
  assert.ok(types.includes("input_pending"),JSON.stringify(types))
  assert.ok(types.includes("input_received"),JSON.stringify(types))
  assert.equal((await api("POST","/api/agent-runs/"+id+"/respond",{answer:"完成后再回复"})).status,409)

  // Release UX integrity: a successful run only certifies the exact AgentSpec
  // that was executed, not a later modified tool/approval/goal configuration.
  const ordinaryRunVersion=await ok("POST","/api/spec-versions",{
    spec_id:spec.id,test_run_id:id,note:"普通试跑不能伪装验收",
  })
  assert.equal(ordinaryRunVersion.item.test_passed,false,
    "A normal succeeded Agent run must not be silently certified as acceptance")
  const acceptanceId=await start(spec.id,model.item.id,5,
    "团队需要把知识库检索需求形成正式方案，供人确认后完成实施计划","acceptance_test")
  await tick(acceptanceId)
  assert.equal((await state(acceptanceId)).status,"awaiting_input")
  await ok("POST","/api/agent-runs/"+acceptanceId+"/respond",{
    answer:"批准方案，可以继续完成正式落地计划。",
  })
  await tick(acceptanceId)
  assert.equal((await state(acceptanceId)).status,"succeeded")
  const firstAcceptance=await ok("POST","/api/spec-versions",{
    spec_id:spec.id,test_run_id:acceptanceId,note:"正式验收对应原始保存版本",
  })
  assert.equal(firstAcceptance.item.test_passed,true,
    "The exact AgentSpec passed by an acceptance run must be eligible")
  const changedPlan=await ok("PATCH","/api/agent_specs/"+spec.id,{
    expected_updated:spec.updated,
    spec:{...spec.spec,goal:"【重大修改后的需求】新增其他外部写入步骤"},
  })
  assert.equal(changedPlan.spec.goal,"【重大修改后的需求】新增其他外部写入步骤")
  const oldRunNewSpec=await ok("POST","/api/spec-versions",{
    spec_id:spec.id,test_run_id:acceptanceId,note:"旧运行不可以验证新方案",
  })
  assert.equal(oldRunNewSpec.item.test_passed,false,
    "Never promote a stale success run to a newly edited AgentSpec")
  assert.equal(oldRunNewSpec.item.test_run_id,acceptanceId,
    "Keep audit trail of a stale test without falsely claiming it passed")

  // Strict phase review: the model outputs final anyway; server must force
  // an actual review checkpoint, support return-for-revision and approve.
  const gatedSpec=await ok("POST","/api/agent_specs",{
    name:"强制阶段审批",
    spec:{...spec.spec,goal:"先送审需求方案，再制定落地计划",require_plan_review:true},
  })
  const gated=await start(gatedSpec.id,model.item.id,5,"STRICT_REVIEW_GATE：先提交需求草案供我确认，再给落地计划")
  assert.equal((await tick(gated)).status,200)
  const gateWaiting=await state(gated)
  assert.equal(gateWaiting.status,"awaiting_input","Even an incorrect LLM final must be blocked")
  assert.equal(gateWaiting.checkpoint.pending_input.kind,"plan_review")
  assert.match(gateWaiting.checkpoint.pending_input.question,/首轮需求草案/)
  assert.equal(Boolean(gateWaiting.checkpoint.plan_review_confirmed),false)
  assert.equal((await api("POST","/api/agent-runs/"+gated+"/respond",{decision:"reply",answer:"批准"})).status,400)
  assert.equal((await api("POST","/api/agent-runs/"+gated+"/respond",{decision:"revise",answer:""})).status,400)
  await ok("POST","/api/agent-runs/"+gated+"/respond",{
    decision:"revise",answer:"缩小范围，删除无关功能，优先处理权限隔离。",
  })
  assert.equal((await state(gated)).checkpoint.plan_review_confirmed,false)
  assert.equal((await tick(gated)).status,200)
  const revised=await state(gated)
  assert.equal(revised.status,"awaiting_input","Revision must loop back to human review")
  assert.equal(revised.checkpoint.pending_input.kind,"plan_review")
  assert.match(revised.checkpoint.pending_input.question,/修订需求草案/)
  await ok("POST","/api/agent-runs/"+gated+"/respond",{decision:"approve",answer:""})
  const approved=await state(gated)
  assert.equal(approved.checkpoint.plan_review_confirmed,true)
  assert.equal(approved.status,"running")
  assert.equal((await tick(gated)).status,200)
  const gatedCompleted=await state(gated)
  assert.equal(gatedCompleted.status,"succeeded",JSON.stringify(gatedCompleted))
  assert.match(gatedCompleted.result,/最终实施计划/)
  assert.match(finalPrompt,/草案已批准/)

  // Genuine concurrent browser-tab click: only one decision may be accepted.
  const concurrentId=await start(gatedSpec.id,model.item.id,5,"STRICT_REVIEW_GATE concurrent review")
  await tick(concurrentId)
  const concurrent=await Promise.all([
    api("POST","/api/agent-runs/"+concurrentId+"/respond",{decision:"approve",answer:"审核方 A"}),
    api("POST","/api/agent-runs/"+concurrentId+"/respond",{decision:"approve",answer:"审核方 B"}),
  ])
  assert.deepEqual(concurrent.map(row=>row.status).sort((a,b)=>a-b),[200,409],
    "Concurrent approval attempts must accept exactly one winner")
  const concurrentDetail=await ok("GET","/api/agent-runs/"+concurrentId+"/detail")
  assert.equal((concurrentDetail.events||[]).filter(event=>event.event_type==="input_received").length,1)

  const cancelledId=await start(spec.id,model.item.id)
  await tick(cancelledId)
  assert.equal((await state(cancelledId)).status,"awaiting_input")
  await ok("POST","/api/agent-runs/"+cancelledId+"/cancel",{})
  assert.equal((await state(cancelledId)).status,"cancelled")
  assert.equal((await api("POST","/api/agent-runs/"+cancelledId+"/respond",{answer:"取消后的回复"})).status,409)
  const budgetId=await start(spec.id,model.item.id,1)
  await tick(budgetId)
  const budget=await state(budgetId)
  assert.equal(budget.status,"failed","A question cannot consume the final step and leave an unresumable run")
  assert.ok(modelRequests>=4)
  console.log(JSON.stringify({result:"PASS",scenario:"requirement->user-confirmation->implementation-plan",
    server:"isolated-local",confirmedRun:id,finalStatus:completed.status,
    ownerFence:true,duplicateReplyRejected:true,reloadRecovery:true,cancelledFence:true,
    budgetStop:true,strictPlanReview:true,revisionLoop:true,concurrentApproveGuard:true,modelDecisions:actualModelDecisions}))
} catch(error) {
  console.error("AGENT_HUMAN_LOOP_INTEGRATION_FAILED",error.stack||String(error))
  console.error("PB_LOG_TAIL",logs.replace(/\/pbinstall\/[A-Za-z0-9._-]+/g,"/pbinstall/***").slice(-2400))
  process.exitCode=1
} finally {
  await stopHeadlessPocketBase(pb).catch(()=>{})
  await new Promise(resolve=>mock.close(resolve))
  try {fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{}
}
