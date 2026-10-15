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
  assert.equal(before.counters.running,2)
  assert.equal(before.counters.schedules_active,1)
  assert.equal(before.counters.knowledge_bases,1)
  assert.equal(before.counters.schedules_overdue,0)
  assert.equal(before.recent_runs.length,2)
  assert.ok(before.recent_runs.every(item=>item.kind==="agent"||item.kind==="workflow"))
  assert.doesNotMatch(JSON.stringify(before),/CONFIDENTIAL|DO-NOT-LEAK/)

  // Change current run states in the disposable database to emulate a failed
  // workflow, an Agent awaiting human approval, an overdue schedule and a tool
  // write with an unknown external outcome. No model or external writes occur.
  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try {
    db.prepare("UPDATE agent_runs SET status='awaiting_approval' WHERE id=?").run(aRun.run_id)
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
  assert.equal(overview.counters.failed_7d,1)
  assert.equal(overview.counters.schedules_active,1)
  assert.equal(overview.counters.schedules_overdue,1)
  assert.equal(overview.counters.writes_need_review,1)
  assert.equal(overview.counters.knowledge_bases,1)
  assert.deepEqual(new Set(overview.action_items.map(item=>item.category)),
    new Set(["approval","review","overdue","failed"]))
  assert.ok(overview.action_items.some(item=>item.kind==="agent"&&item.id===aRun.run_id))
  assert.ok(overview.action_items.some(item=>item.kind==="schedule"&&item.id===schedule.id))
  assert.ok(overview.action_items.some(item=>item.kind==="workflow"&&item.id===wfRun.run_id))
  assert.doesNotMatch(JSON.stringify(overview),/CONFIDENTIAL|DO-NOT-LEAK|args_hash|idempotency/)
  assert.equal(overview.sampling.failed_window_days,7)
  assert.equal(overview.worker.configured,false)

  const other=await requireStatus("GET","/api/internal/overview","B")
  assert.equal(other.counters.awaiting_approval,0)
  assert.equal(other.counters.failed_7d,0)
  assert.equal(other.counters.schedules_overdue,0)
  assert.equal(other.counters.writes_need_review,0)
  assert.equal(other.counters.knowledge_bases,0)
  assert.equal(other.recent_runs.length,1)
  // Existing Harness Monitor is also employee-owned. It must never aggregate
  // a colleague's agent/workflow events into the caller's metrics.
  const monitorA = await requireStatus("GET","/api/harness/monitor","A")
  const monitorB = await requireStatus("GET","/api/harness/monitor","B")
  assert.equal(monitorA.totals.runs,2)
  assert.equal(monitorB.totals.runs,1)

  assert.ok(other.recent_runs.every(item=>item.id!==aRun.run_id && item.id!==wfRun.run_id))
  assert.doesNotMatch(JSON.stringify(other),/每日内部检查|团队内部 Agent|内部资料整理流程/)

  console.log("PASS internal employee dashboard: status queue, safe summaries, tenant isolation, no secret text")
} finally {
  server.kill()
  await Promise.race([new Promise(resolve=>server.once("exit",resolve)),sleep(1800)])
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
