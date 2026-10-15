import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"
import { nextScheduleTime } from "../src/lib/scheduleTime.js"

const root = process.cwd()
const pbBin = process.env.POCKETBASE_BIN || path.join(root, "vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pbBin), "PocketBase required")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-schedule-integration-"))
const port = Number(process.env.PB_SCHEDULE_TEST_PORT || 7281)
const modelPort = Number(process.env.PB_SCHEDULE_MODEL_PORT || 7282)
const origin = "http://127.0.0.1:" + port
const token = "schedule-integration-test-token-32-characters"
const env = {
  ...process.env, AGENT_STUDIO_WORKER_TOKEN: token,
  AGENT_STUDIO_BACKGROUND_WORKER: "true", AGENT_STUDIO_WORKER_INTERNAL_URL: origin,
  AGENT_STUDIO_WORKER_URL: origin, AGENT_STUDIO_ALLOW_ANON: "false",
}
let log = "", modelCalls = 0
const server = spawnHeadlessPocketBase(pbBin, ["serve", "--http=127.0.0.1:" + port,
  "--dir=" + dir, "--hooksDir=" + path.join(root, "pocketbase/pb_hooks"),
], { cwd: path.join(root,"pocketbase"), env, windowsHide: true })
server.stdout.on("data", x => { log = (log + x).slice(-12000) })
server.stderr.on("data", x => { log = (log + x).slice(-12000) })
const model = createServer(async (req, res) => {
  for await (const _ of req) { /* drain */ }
  modelCalls++
  res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ choices: [{ message: { role: "assistant",
    content: JSON.stringify({ action: "final", thought: "done", final_answer: "scheduled Agent completed" }),
  } }] }))
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function call(method, uri, body, user = "A") {
  const headers = { "Content-Type": "application/json" }
  if (user) headers["X-Rh-User-Id"] = user
  const response = await fetch(origin + uri, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  return { status: response.status, data: await response.json().catch(() => ({})) }
}
async function expected(method, uri, body, code, user = "A") {
  const resp = await call(method, uri, body, user)
  assert.equal(resp.status, code, method + " " + uri + ": " + JSON.stringify(resp.data))
  return resp.data
}
async function workerOnce() {
  const child = spawn(process.execPath, ["worker/run.mjs","--once"], {
    cwd: root, env, windowsHide:true,
  })
  let stdout = "", stderr = ""
  child.stdout.on("data", x => { stdout += x })
  child.stderr.on("data", x => { stderr += x })
  const exit = await Promise.race([
    new Promise(r => child.once("exit",r)),
    sleep(30000).then(() => { child.kill(); return -1 }),
  ])
  assert.equal(exit,0,"worker crash "+stderr+" "+stdout)
  return stdout
}
async function internal(endpoint, payload = {}) {
  const r = await fetch(origin + endpoint, {
    method:"POST", headers:{"Content-Type":"application/json", "X-Agent-Studio-Worker-Token":token},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(20000),
  })
  return {status:r.status, data:await r.json()}
}
async function finish(runId, kind = "workflow", max = 8) {
  for (let i=0;i<max;i++) {
    const res = await expected("GET",kind==="agent"?"/api/agent_runs/"+runId:"/api/workflow-runs/"+runId+"/detail",undefined,200)
    const run = kind==="agent"?res:res.run
    if(["succeeded","failed","cancelled"].includes(run.status))return run
    await workerOnce()
  }
  return null
}
let modelStarted=false
try {
  await new Promise(r=>model.listen(modelPort,"127.0.0.1",r))
  modelStarted=true
  let ready=false
  for(let i=0;i<100;i++){try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}await sleep(150)}
  assert.ok(ready,"PB unavailable "+log.slice(-1500))
  await expected("GET","/api/schedules",undefined,401,"")
  assert.equal((await internal("/api/internal/schedules/next")).status,200)
  const authWrong=await fetch(origin+"/api/internal/schedules/next",{method:"POST",headers:{"X-Agent-Studio-Worker-Token":"wrong","Content-Type":"application/json"},body:"{}"})
  assert.equal(authWrong.status,401)
  const graph={nodes:[
    {id:"s",type:"start",data:{title:"开始"},position:{x:0,y:0}},
    {id:"e",type:"end",data:{title:"结束",output_template:"{{input}}"},position:{x:200,y:0}},
  ],edges:[{id:"edge",source:"s",target:"e"}]}
  const workflow=await expected("POST","/api/workflow-studio/create",{name:"Scheduled Workflow",graph},200)
  const wfId=workflow.id
  const start=Date.now()+2500
  const create=await expected("POST","/api/schedules/manage",{
    action:"create", name:"一次性任务",target_kind:"workflow",target_id:wfId,
    instruction:"Scheduled task executed",recurrence_kind:"once",time_zone:"Asia/Tokyo",
    local_time:"10:00",interval_minutes:60,weekday:1,start_at_ms:start,next_at_ms:start,
  },200)
  assert.match(create.id,/^[A-Za-z0-9]{15}$/)
  const sid=create.id
  const bList=await expected("GET","/api/schedules",undefined,200,"B")
  assert.equal(bList.items.length,0)
  assert.equal((await call("POST","/api/schedules/manage",{action:"run_now",id:sid},"B")).status,404)
  const list=await expected("GET","/api/schedules",undefined,200)
  assert.equal(list.items.length,1)
  assert.equal(list.items[0].next_at_ms,start)
  const monitor=await expected("GET","/api/worker/status",undefined,200)
  assert.ok(monitor.queue.scheduled_active>=1,"Worker status should expose current user scheduled task count")
  const otherMonitor=await expected("GET","/api/worker/status",undefined,200,"B")
  assert.equal(otherMonitor.queue.scheduled_active,0,"Scheduled task monitoring must be owner-scoped")
  // V7.2: overdue alert is tenant-scoped and uses a one-minute grace period.
  const testDb = new DatabaseSync(path.join(dir, "data.db"), { timeout: 5000 })
  try {
    testDb.prepare("UPDATE agent_studio_schedules SET next_at_ms = ? WHERE id=?")
      .run(Date.now() - 90_000, sid)
  } finally { testDb.close() }
  const overdueA = await expected("GET", "/api/worker/status", undefined, 200)
  assert.ok(overdueA.queue.scheduled_overdue >= 1, "Overdue schedule should be surfaced")
  assert.ok(overdueA.queue.oldest_due_age_ms >= 60_000)
  assert.ok(Number.isFinite(overdueA.observed_at_ms))
  const overdueB = await expected("GET", "/api/worker/status", undefined, 200, "B")
  assert.equal(overdueB.queue.scheduled_overdue, 0, "Never disclose another tenant's overdue schedule")
  const resetDb = new DatabaseSync(path.join(dir, "data.db"), { timeout: 5000 })
  try {
    resetDb.prepare("UPDATE agent_studio_schedules SET next_at_ms = ? WHERE id=?").run(start,sid)
  } finally { resetDb.close() }
  assert.equal((await expected("GET", "/api/worker/status", undefined, 200)).queue.scheduled_overdue,0)

  let peek=await internal("/api/internal/schedules/next")
  assert.equal(peek.data.due,false)
  await sleep(Math.max(0,start-Date.now()+200))
  let out=await workerOnce()
  assert.match(out,/scheduled_run_created/)
  let after=await expected("GET","/api/schedules",undefined,200)
  assert.equal(after.items[0].enabled,false)
  assert.equal(after.items[0].next_at_ms,0)
  assert.equal(after.history.length,1)
  assert.equal(after.history[0].run_id.length,15)
  const wfDetail=await expected("GET","/api/workflow-runs/"+after.history[0].run_id+"/detail",undefined,200)
  assert.equal(wfDetail.run?.checkpoint?.schedule_force_approval,true,"Scheduled workflows must gate external writes")
  const finished=await finish(after.history[0].run_id)
  assert.equal(finished.status,"succeeded",JSON.stringify(finished))
  assert.match(finished.result,/Scheduled task executed/)
  const history=await expected("GET","/api/schedules",undefined,200)
  assert.equal(history.history[0].status,"succeeded")
  assert.equal(history.history.length,1)
  const duplicate=await internal("/api/internal/schedules/dispatch",{
    schedule_id:sid,scheduled_for_ms:start,next_at_ms:0,
  })
  assert.equal(duplicate.status,200)
  assert.equal(duplicate.data.already_started,true)
  assert.equal((await expected("GET","/api/schedules",undefined,200)).history.length,1)


  // Scheduled knowledge-backed workflow: executes outside the browser and keeps citations.
  const kbBase=await expected("POST","/api/knowledge-bases/manage",{
    action:"create",name:"定时知识检索验证",description:"自动执行与知识库联合回归",
  },200)
  await expected("POST","/api/knowledge-bases/documents",{
    action:"upload",base_id:kbBase.id,filename:"scheduled-brief.md",
    content:"KB-SCHEDULE-PROOF: 定时工作流成功检索到真实来源片段。\n"+ "定时研究报告应标注知识库来源。".repeat(25),
  },200)
  const kbGraph={nodes:[
    {id:"ks",type:"start",data:{title:"开始"},position:{x:0,y:0}},
    {id:"kt",type:"tool",data:{title:"检索",tool:"knowledge_search",
      knowledge_base_ids:[kbBase.id],params_template:'{"query":"KB-SCHEDULE-PROOF"}'},position:{x:200,y:0}},
    {id:"ke",type:"end",data:{title:"结束",output_template:"{{检索.output}}"},position:{x:400,y:0}},
  ],edges:[{id:"kse",source:"ks",target:"kt"},{id:"kte",source:"kt",target:"ke"}]}
  const kbWf=await expected("POST","/api/workflow-studio/create",{
    name:"定时知识库报告",graph:kbGraph,
  },200)
  const kbTime=Date.now()+1900
  const kbSchedule=await expected("POST","/api/schedules/manage",{
    action:"create",name:"定时知识库检索",target_kind:"workflow",target_id:kbWf.id,
    instruction:"提取知识库真实资料",recurrence_kind:"once",time_zone:"Asia/Tokyo",
    local_time:"10:00",interval_minutes:60,weekday:1,
    start_at_ms:kbTime,next_at_ms:kbTime,
  },200)
  await sleep(Math.max(0,kbTime-Date.now()+200))
  await workerOnce()
  const kbEvents=await expected("GET","/api/schedules?id="+kbSchedule.id,undefined,200)
  assert.equal(kbEvents.history.length,1)
  const kbRun=await finish(kbEvents.history[0].run_id)
  assert.equal(kbRun.status,"succeeded",JSON.stringify(kbRun))
  assert.match(kbRun.result,/KB-SCHEDULE-PROOF/)
  assert.match(kbRun.result,/scheduled-brief\.md.*片段/)
  await expected("POST","/api/schedules/manage",{action:"delete",id:kbSchedule.id},200)
  const intervalStart=Date.now()+60_000
  const next=nextScheduleTime({recurrence_kind:"interval",start_at_ms:intervalStart,interval_minutes:60},Date.now())
  const recurring=await expected("POST","/api/schedules/manage",{
    action:"create", name:"每小时",target_kind:"workflow",target_id:wfId,
    instruction:"Recurring task",recurrence_kind:"interval",interval_minutes:60,
    time_zone:"UTC",local_time:"09:00",weekday:1,start_at_ms:intervalStart,next_at_ms:next,
  },200)
  const runNow=await expected("POST","/api/schedules/manage",{action:"run_now",id:recurring.id},200)
  assert.equal(runNow.queued,true)
  assert.equal((await call("POST","/api/schedules/manage",{action:"run_now",id:recurring.id})).status,409)
  await workerOnce()
  const intervalHistory=await expected("GET","/api/schedules?id="+recurring.id,undefined,200)
  assert.equal(intervalHistory.history.length,1)
  assert.equal(intervalHistory.history[0].run_id,runNow.run_id)
  assert.equal(intervalHistory.items.find(x=>x.id===recurring.id).next_at_ms,next)
  const off=await expected("POST","/api/schedules/manage",{action:"toggle",id:recurring.id,enabled:false},200)
  assert.equal(off.enabled,false)
  await expected("POST","/api/schedules/manage",{action:"delete",id:recurring.id},200)
  assert.equal((await expected("GET","/api/schedules",undefined,200)).items.length,1)

  const conn=await expected("POST","/api/model-connections",{
    name:"Mock Provider",provider:"openai",base_url:"http://127.0.0.1:"+modelPort+"/v1",
    api_key:"dummy",models:["model-1"],
  },200)
  const spec=await expected("POST","/api/agent_specs",{name:"Scheduled Agent",spec:{
    goal:"Return final answer",tools:["calculate"],task_plan:["Answer"],deliverables:["Result"],done_criteria:["Answer is final"],
  }},200)
  const agentTime=Date.now()+1700
  const agentSched=await expected("POST","/api/schedules/manage",{
    action:"create", name:"AI 定时执行",target_kind:"agent",target_id:spec.id,
    instruction:"Agent schedule works",recurrence_kind:"once",interval_minutes:60,
    time_zone:"Asia/Tokyo",local_time:"10:00",weekday:1,start_at_ms:agentTime,next_at_ms:agentTime,
    model_connection_id:conn.item.id,model_id:"model-1",max_steps:3,
  },200)
  await sleep(Math.max(0,agentTime-Date.now()+180))
  await workerOnce()
  const info=await expected("GET","/api/schedules?id="+agentSched.id,undefined,200)
  assert.equal(info.history.length,1)
  const agentResult=await finish(info.history[0].run_id,"agent")
  const agentSaved=await expected("GET","/api/agent_runs/"+info.history[0].run_id,undefined,200)
  assert.equal(agentSaved.config?.tools?.calculate,true,"Scheduled Agent should inherit explicitly selected builtin tools")
  assert.equal(agentResult.status,"succeeded",JSON.stringify(agentResult))
  assert.match(agentResult.result,/scheduled Agent completed/)
  assert.ok(modelCalls>=1)
  // Editing is revisioned and pauses/resumes without affecting other accounts.
  const modifiedStart=Date.now()+180000
  const mod=await expected("POST","/api/schedules/manage",{
    action:"create",name:"编辑验证",target_kind:"workflow",target_id:wfId,
    instruction:"Original",recurrence_kind:"interval",interval_minutes:60,
    time_zone:"UTC",local_time:"09:00",weekday:1,start_at_ms:modifiedStart,next_at_ms:modifiedStart,
  },200)
  const changedStart=Date.now()+250000
  await expected("POST","/api/schedules/manage",{
    action:"update",id:mod.id,name:"更新过的计划",target_kind:"workflow",target_id:wfId,
    instruction:"Updated",recurrence_kind:"interval",interval_minutes:30,
    time_zone:"UTC",local_time:"09:00",weekday:1,start_at_ms:changedStart,next_at_ms:changedStart,
  },200)
  let edited=(await expected("GET","/api/schedules",undefined,200)).items.find(x=>x.id===mod.id)
  assert.equal(edited.name,"更新过的计划")
  assert.equal(edited.instruction,"Updated")
  assert.equal(edited.revision,2)
  await expected("POST","/api/schedules/manage",{action:"toggle",id:mod.id,enabled:false},200)
  edited=(await expected("GET","/api/schedules",undefined,200)).items.find(x=>x.id===mod.id)
  assert.equal(edited.enabled,false)
  await expected("POST","/api/schedules/manage",{action:"toggle",id:mod.id,enabled:true,next_at_ms:changedStart},200)
  edited=(await expected("GET","/api/schedules",undefined,200)).items.find(x=>x.id===mod.id)
  assert.equal(edited.enabled,true)
  assert.equal((await call("POST","/api/schedules/manage",{action:"toggle",id:mod.id,enabled:false},"B")).status,404)
  await expected("POST","/api/schedules/manage",{action:"delete",id:mod.id},200)

  // Scheduled run identifiers may only be injected by the authenticated internal Worker.
  const forged=await call("POST","/api/workflow-runs/start",{
    workflow_id:wfId,instruction:"user-forged scheduled run",
    scheduled_run_id:"0123456789abcde",schedule_occurrence_id:"0123456789abcdef0123",
  })
  assert.equal(forged.status,403)

  // Bad timezone entered via direct API is quarantined by the Worker (Goja lacks Intl).
  const invalidStart=Date.now()+1700
  const invalid=await expected("POST","/api/schedules/manage",{
    action:"create",name:"Invalid TZ quarantine",target_kind:"workflow",target_id:wfId,
    instruction:"Must not run",recurrence_kind:"daily",interval_minutes:60,
    time_zone:"Invalid/Zone",local_time:"09:00",weekday:1,
    start_at_ms:invalidStart,next_at_ms:invalidStart,
  },200)
  await sleep(Math.max(0,invalidStart-Date.now()+150))
  const badWorker=await workerOnce()
  assert.match(badWorker,/scheduled_task_invalid/)
  const isolated=await expected("GET","/api/schedules?id="+invalid.id,undefined,200)
  assert.equal(isolated.items.find(x=>x.id===invalid.id).enabled,false)
  assert.equal(isolated.history[0].status,"invalid_schedule")
  assert.match(isolated.history[0].error,/invalid_time_zone/)
  // Recovery of a failed launch without replaying a previously created run.
  // The failed_start state is seeded directly to avoid minutes of retry backoff.
  const retryAt=Date.now()+120000
  const retrySchedule=await expected("POST","/api/schedules/manage",{
    action:"create",name:"Failure Retry",target_kind:"workflow",target_id:wfId,
    instruction:"Retry launch safely",recurrence_kind:"interval",interval_minutes:60,
    time_zone:"UTC",local_time:"09:00",weekday:1,start_at_ms:retryAt,next_at_ms:retryAt,
  },200)
  const retrySlot=await expected("POST","/api/schedules/manage",{action:"run_now",id:retrySchedule.id},200)
  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  let retryOccurrence=""
  try {
    db.prepare("UPDATE agent_studio_schedule_occurrences SET status='failed_start',attempts=4,next_retry_ms=0,locked_until_ms=0 WHERE run_id=?").run(retrySlot.run_id)
    retryOccurrence=String(db.prepare("SELECT id FROM agent_studio_schedule_occurrences WHERE run_id=?").get(retrySlot.run_id)?.id||"")
  } finally { db.close() }
  assert.equal(retryOccurrence.length,20)
  assert.equal((await call("POST","/api/schedules/manage",{
    action:"retry_failed_start",id:retrySchedule.id,occurrence_id:retryOccurrence,
  },"B")).status,404)
  const retried=await expected("POST","/api/schedules/manage",{
    action:"retry_failed_start",id:retrySchedule.id,occurrence_id:retryOccurrence,
  },200)
  assert.equal(retried.queued,true)
  assert.equal((await call("POST","/api/schedules/manage",{
    action:"retry_failed_start",id:retrySchedule.id,occurrence_id:retryOccurrence,
  })).status,404)
  await workerOnce()
  const retryHistory=await expected("GET","/api/schedules?id="+retrySchedule.id,undefined,200)
  assert.equal(retryHistory.history[0].run_id,retrySlot.run_id)
  assert.equal(retryHistory.history[0].status,"running")
  const retryFinished=await finish(retrySlot.run_id)
  assert.equal(retryFinished.status,"succeeded")
  console.log(JSON.stringify({status:"PASS", onceRun:history.history[0].run_id,
    recurringRunNow:runNow.run_id,agentRun:info.history[0].run_id,modelCalls,
    ownerIsolation:true,tokenAuth:true,deduplication:true,history:true,
    editsAndPause:true, forgedRunRejected:true, badTimezoneQuarantined:true,
    failedStartManualRetry:true}))
} catch(err){
  console.error("SCHEDULE_INTEGRATION_FAILED",err.stack||String(err))
  console.error("SERVER_LOG",log.slice(-2000).replace(/\/pbinstall\/[A-Za-z0-9._-]+/g,"/pbinstall/***"))
  process.exitCode=1
} finally {
  server.kill()
  if(modelStarted)await new Promise(r=>model.close(r))
  await Promise.race([new Promise(r=>server.once("exit",r)),sleep(1200)])
  try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
}
