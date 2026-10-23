// Internal employee dashboard, real headless PocketBase and isolated SQLite.
// Verify owner isolation, actionable counts and that instructions/results stay private.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { spawnHeadlessPocketBase } from "./helpers/headless-pocketbase.mjs"

const root = process.cwd()
const pb = process.env.POCKETBASE_BIN || path.join(root, "vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(pb), "PocketBase test binary required")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentstudio-internal-overview-"))
const port = Number(process.env.PB_INTERNAL_OVERVIEW_PORT || 7401)
const origin = "http://127.0.0.1:" + port
const server = spawnHeadlessPocketBase(pb, [
  "serve", "--http=127.0.0.1:" + port, "--dir=" + dir,
  "--hooksDir=" + path.join(root, "pocketbase/pb_hooks"),
], { cwd: path.join(root, "pocketbase"), windowsHide: true,
  env: {...process.env, AGENT_STUDIO_ALLOW_ANON:"false"} })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let logs = ""
server.stdout.on("data", chunk => logs = (logs + chunk).slice(-12000))
server.stderr.on("data", chunk => logs = (logs + chunk).slice(-12000))

async function call(method, route, owner, body) {
  const headers = {"Content-Type":"application/json"}
  if (owner) headers["X-Rh-User-Id"] = owner
  const response = await fetch(origin + route, {
    method, headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(13000),
  })
  return {status:response.status, data:await response.json().catch(() => ({}))}
}
async function requireStatus(method, route, owner, body, expected=200) {
  const result = await call(method,route,owner,body)
  assert.equal(result.status,expected, method + " " + route + " => " + JSON.stringify(result.data))
  return result.data
}
const graph = { nodes: [
  {id:"start",type:"start",data:{title:"开始"},position:{x:0,y:0}},
  {id:"end",type:"end",data:{title:"结束",output_template:"{{input}}"},position:{x:200,y:0}},
], edges:[{id:"edge",source:"start",target:"end"}] }

try {
  let ready=false
  for(let i=0;i<135;i++) {
    if(server.exitCode !== null) break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(600)})).ok){ready=true;break}}catch{}
    await sleep(150)
  }
  assert.ok(ready,"PocketBase unavailable "+logs.slice(-2200))
  await requireStatus("GET","/api/internal/overview","",undefined,401)

  const empty = await requireStatus("GET","/api/internal/overview","A")
  assert.equal(empty.scope,"current_user")
  assert.equal(empty.counters.awaiting_approval,0)
  assert.equal(empty.counters.awaiting_input,0)
  assert.equal(empty.action_items.length,0)
  assert.equal(empty.recent_runs.length,0)

  const bSpec = await requireStatus("POST","/api/agent_specs","B",{
    name:"B: PRIVATE-DO-NOT-LEAK",spec:{goal:"confidential"},
  })
  const bRun = await requireStatus("POST","/api/agent-runs/start","B",{
    spec_id:bSpec.id,instruction:"PRIVATE-B-SECRET-INSTRUCTION",
  })
  assert.match(bRun.run_id,/^[A-Za-z0-9]{15}$/)

  // A cannot override its authorized owner with client-supplied query parameters.
  const spoof = await requireStatus("GET","/api/internal/overview?rh_user_id=B","A")
  assert.equal(spoof.counters.running,0)
  assert.equal(spoof.recent_runs.length,0)
  assert.doesNotMatch(JSON.stringify(spoof),/PRIVATE-B|DO-NOT-LEAK/)

  const aSpec=await requireStatus("POST","/api/agent_specs","A",{
    name:"团队内部 Agent",spec:{goal:"operator check",tools:[]},
  })
  const aRun=await requireStatus("POST","/api/agent-runs/start","A",{
    spec_id:aSpec.id,instruction:"CONFIDENTIAL-A-INSTRUCTION",
  })
  const aInputRun=await requireStatus("POST","/api/agent-runs/start","A",{
    spec_id:aSpec.id,instruction:"CONFIDENTIAL-INPUT-NEEDS-REVIEW",
  })
  const workflow=await requireStatus("POST","/api/workflow-studio/create","A",{
    name:"内部资料整理流程",graph,
  })
  const wfRun=await requireStatus("POST","/api/workflow-runs/start","A",{
    workflow_id:workflow.id,instruction:"CONFIDENTIAL-WORKFLOW-INSTRUCTION",
  })
  const kb=await requireStatus("POST","/api/knowledge-bases/manage","A",{
    action:"create",name:"公司内部知识库",description:"仅归属A",
  })
  assert.match(kb.id,/^[A-Za-z0-9]{15}$/)
  const future=Date.now()+600000
  const schedule=await requireStatus("POST","/api/schedules/manage","A",{
    action:"create",name:"每日内部检查",target_kind:"workflow",target_id:workflow.id,
    instruction:"DO-NOT-LEAK-SCHEDULE-CONTENT",recurrence_kind:"once",
    time_zone:"Asia/Tokyo",local_time:"10:00",weekday:1,interval_minutes:60,
    start_at_ms:future,next_at_ms:future,
  })
  assert.match(schedule.id,/^[A-Za-z0-9]{15}$/)

  const before=await requireStatus("GET","/api/internal/overview","A")
  assert.equal(before.counters.running,3)
  assert.equal(before.counters.schedules_active,1)
  assert.equal(before.counters.knowledge_bases,1)
  assert.equal(before.counters.schedules_overdue,0)
  assert.equal(before.recent_runs.length,3)
  assert.ok(before.recent_runs.every(item=>item.kind==="agent"||item.kind==="workflow"))
  assert.doesNotMatch(JSON.stringify(before),/CONFIDENTIAL|DO-NOT-LEAK/)

  // Change current run states in the disposable database to emulate a failed
  // workflow, an Agent awaiting human approval, an overdue schedule and a tool
  // write with an unknown external outcome. No model or external writes occur.
  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try {
    db.prepare("UPDATE agent_runs SET status='awaiting_approval' WHERE id=?").run(aRun.run_id)
    db.prepare("UPDATE agent_runs SET status='awaiting_input' WHERE id=?").run(aInputRun.run_id)
    db.prepare("UPDATE workflow_runs SET status='failed' WHERE id=?").run(wfRun.run_id)
    db.prepare("UPDATE agent_studio_schedules SET next_at_ms=? WHERE id=?")
      .run(Date.now()-120000,schedule.id)
    db.prepare(
      "INSERT INTO agent_studio_side_effects ("+
      "kind,run_id,step_key,tool_name,args_hash,idempotency_key,status,result_text,created_ms,updated_ms) "+
      "VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run("agent",aRun.run_id,"step-1","mock-write","hash","idempotency","unknown","",Date.now(),Date.now())
  } finally {db.close()}

  const overview=await requireStatus("GET","/api/internal/overview","A")
  assert.equal(overview.counters.running,0)
  assert.equal(overview.counters.awaiting_approval,1)
  assert.equal(overview.counters.awaiting_input,1)
  assert.equal(overview.counters.failed_7d,1)
  assert.equal(overview.counters.schedules_active,1)
  assert.equal(overview.counters.schedules_overdue,1)
  assert.equal(overview.counters.writes_need_review,1)
  assert.equal(overview.counters.knowledge_bases,1)
  assert.deepEqual(new Set(overview.action_items.map(item=>item.category)),
    new Set(["input","approval","review","overdue","failed"]))
  assert.ok(overview.action_items.some(item=>item.kind==="agent"&&item.id===aRun.run_id))
  assert.ok(overview.action_items.some(item=>item.category==="input"&&item.id===aInputRun.run_id))
  assert.ok(overview.action_items.some(item=>item.kind==="schedule"&&item.id===schedule.id))
  assert.ok(overview.action_items.some(item=>item.kind==="workflow"&&item.id===wfRun.run_id))
  assert.doesNotMatch(JSON.stringify(overview),/CONFIDENTIAL|DO-NOT-LEAK|args_hash|idempotency/)
  assert.equal(overview.sampling.failed_window_days,7)
  assert.equal(overview.worker.configured,false)

  const other=await requireStatus("GET","/api/internal/overview","B")
  assert.equal(other.counters.awaiting_approval,0)
  assert.equal(other.counters.awaiting_input,0)
  assert.equal(other.counters.failed_7d,0)
  assert.equal(other.counters.schedules_overdue,0)
  assert.equal(other.counters.writes_need_review,0)
  assert.equal(other.counters.knowledge_bases,0)
  assert.equal(other.recent_runs.length,1)
  // Existing Harness Monitor is also employee-owned. It must never aggregate
  // a colleague's agent/workflow events into the caller's metrics.
  const monitorA = await requireStatus("GET","/api/harness/monitor","A")
  const monitorB = await requireStatus("GET","/api/harness/monitor","B")
  assert.equal(monitorA.totals.runs,3)
  assert.equal(monitorB.totals.runs,1)

  assert.ok(other.recent_runs.every(item=>item.id!==aRun.run_id && item.id!==wfRun.run_id))
  assert.doesNotMatch(JSON.stringify(other),/每日内部检查|团队内部 Agent|内部资料整理流程/)

  // Desktop pending queue must include older Agent runs outside the recent-12 window.
  const oldDb=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try {
    oldDb.prepare("UPDATE agent_runs SET created='2024-01-01 00:00:00.000Z' WHERE id IN (?,?)")
      .run(aRun.run_id,aInputRun.run_id)
  } finally {oldDb.close()}
  for(let i=0;i<14;i++){
    await requireStatus("POST","/api/agent-runs/start","A",{
      spec_id:aSpec.id,instruction:"RECENT-WORKBENCH-TEST-"+i,
    })
  }
  const recentA=await requireStatus("GET","/api/agent-runs/recent?limit=12","A")
  assert.equal(recentA.items.length,12)
  assert.equal(recentA.pending_count,2,"Pending owner count must not be bounded by recent runs")
  assert.equal(recentA.pending_items.length,2)
  assert.deepEqual(new Set(recentA.pending_items.map(row=>row.id)),
    new Set([aRun.run_id,aInputRun.run_id]))
  assert.ok(recentA.items.every(row=>row.id!==aRun.run_id&&row.id!==aInputRun.run_id),
    "Older pending records must be outside recent history in this fixture")
  assert.doesNotMatch(JSON.stringify(recentA.pending_items),
    /CONFIDENTIAL|PRIVATE|INSTRUCTION|checkpoint|pending_input|input_preview/)
  const recentB=await requireStatus("GET","/api/agent-runs/recent?limit=20&rh_user_id=A","B")
  assert.equal(recentB.pending_count,0)
  assert.equal(recentB.pending_items.length,0)
  assert.ok(recentB.items.every(row=>row.id!==aRun.run_id&&row.id!==aInputRun.run_id))
  assert.doesNotMatch(JSON.stringify(recentB),/CONFIDENTIAL-A|团队内部 Agent/)

  // A narrowly scoped design-wizard query must apply spec_id inside SQL,
  // before the global top-20 limit. An older Agent should not appear as
  // "unrun" merely because 20 other tasks were started later.
  const targetSpec = await requireStatus("POST","/api/agent_specs","A",{
    name:"跨任务历史核验",spec:{goal:"验证当前 Agent 的独立运行记录",tools:[]},
  })
  const targetRun = await requireStatus("POST","/api/agent-runs/start","A",{
    spec_id:targetSpec.id,instruction:"OWNER-SCOPED-TARGET-RUN",
  })
  for (let i=0;i<20;i++) {
    await requireStatus("POST","/api/agent-runs/start","A",{
      spec_id:aSpec.id,instruction:"SCOPED-HISTORY-DISPLACER-"+i,
    })
  }
  const globalPage = await requireStatus("GET","/api/agent-runs/recent?limit=20","A")
  assert.ok(!globalPage.items.some(item=>item.id===targetRun.run_id),
    "the target's run must genuinely be older than the global recent page")
  const targetPage = await requireStatus("GET",
    "/api/agent-runs/recent?limit=20&spec_id="+targetSpec.id,"A")
  assert.deepEqual(targetPage.items.map(item=>item.id),[targetRun.run_id])
  assert.equal(targetPage.items[0].spec_id,targetSpec.id)
  assert.ok(!targetPage.items.some(item=>item.instruction.startsWith("SCOPED-HISTORY-DISPLACER")))
  const otherUserPage = await requireStatus("GET",
    "/api/agent-runs/recent?spec_id="+targetSpec.id+"&rh_user_id=A","B")
  assert.deepEqual(otherUserPage.items,[],"a foreign owner cannot obtain the target run")
  const wrongOwnerPage = await requireStatus("GET",
    "/api/agent-runs/recent?spec_id="+bSpec.id,"A")
  assert.deepEqual(wrongOwnerPage.items,[])
  await requireStatus("GET","/api/agent-runs/recent?spec_id=bad'OR'1=1","A",undefined,400)


  // More than a page of pending tasks: filters and paging must be from SQL,
  // not an in-memory slice of the 20 latest records.
  const pagingDb=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    pagingDb.prepare(
      "UPDATE agent_runs SET status='awaiting_input' "+
      "WHERE rh_user_id='A' AND instruction LIKE 'RECENT-WORKBENCH-TEST-%'"
    ).run()
  }finally{pagingDb.close()}
  const allPending=await requireStatus("GET","/api/agent-runs/pending?page=1&perPage=5","A")
  assert.equal(allPending.totalItems,16)
  assert.equal(allPending.totalPages,4)
  assert.equal(allPending.items.length,5)
  const nextPending=await requireStatus("GET","/api/agent-runs/pending?page=2&perPage=5","A")
  assert.equal(nextPending.items.length,5)
  assert.equal(new Set([...allPending.items,...nextPending.items].map(item=>item.id)).size,10)
  const approvals=await requireStatus("GET","/api/agent-runs/pending?status=awaiting_approval","A")
  assert.equal(approvals.totalItems,1)
  assert.equal(approvals.items[0].id,aRun.run_id)
  const replies=await requireStatus("GET","/api/agent-runs/pending?status=awaiting_input&perPage=20","A")
  assert.equal(replies.totalItems,15)
  assert.equal(replies.items.length,15)
  const matched=await requireStatus("GET","/api/agent-runs/pending?q="+encodeURIComponent("团队内部"),"A")
  assert.equal(matched.totalItems,16)
  assert.doesNotMatch(JSON.stringify(matched),/INSTRUCTION|CONFIDENTIAL|checkpoint|answer|args_hash/)
  assert.equal((await call("GET","/api/agent-runs/pending?status=failed","A")).status,400)
  const denied=await requireStatus("GET","/api/agent-runs/pending?rh_user_id=A","B")
  assert.equal(denied.totalItems,0)
  assert.equal(denied.items.length,0)
  assert.equal((await call("GET","/api/agent-runs/pending","")).status,401)
  console.log("PASS V18 pending inbox paging + status/search + owner-scoped redaction")
  console.log("PASS full-owner desktop pending queue: older tasks retained, no leaks")
  console.log("PASS internal employee dashboard: status queue, safe summaries, tenant isolation, no secret text")
} finally {
  server.kill()
  await Promise.race([new Promise(resolve=>server.once("exit",resolve)),sleep(1800)])
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
