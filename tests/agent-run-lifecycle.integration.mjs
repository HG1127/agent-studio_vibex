import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {DatabaseSync} from "node:sqlite"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary),"isolated PocketBase binary required")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-run-lifecycle-e2e-"))
const port=await new Promise((resolve,reject)=>{
  const socket=net.createServer()
  socket.once("error",reject)
  socket.listen(0,"127.0.0.1",()=>{const selected=socket.address().port;socket.close(()=>resolve(selected))})
})
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(binary,[
  "serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),windowsHide:true,
  env:{...process.env,AGENT_STUDIO_ALLOW_ANON:"false"}})
let logs=""
server.stdout.on("data",chunk=>logs=(logs+chunk.toString()).slice(-8000))
server.stderr.on("data",chunk=>logs=(logs+chunk.toString()).slice(-8000))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function request(method,route,owner,body){
  const response=await fetch(origin+route,{
    method,
    headers:{"Content-Type":"application/json",...(owner?{"X-Rh-User-Id":owner}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(16000),
  })
  return {status:response.status,body:await response.json().catch(()=>({}))}
}
async function ok(method,route,owner,body,status=200){
  const result=await request(method,route,owner,body)
  assert.equal(result.status,status,method+" "+route+" => "+JSON.stringify(result.body).slice(0,500))
  return result.body
}
function setRunState(runId,status,error,attemptNo){
  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    const row=db.prepare("SELECT checkpoint FROM agent_runs WHERE id=?").get(runId)
    assert.ok(row,"run row must exist")
    const checkpoint=JSON.parse(String(row.checkpoint||"{}"))
    if(attemptNo!==undefined)checkpoint.attempt_no=attemptNo
    db.prepare("UPDATE agent_runs SET status=?,error=?,result='',checkpoint=? WHERE id=?")
      .run(status,error,JSON.stringify(checkpoint),runId)
  }finally{db.close()}
}
function setExecutionBudget(runId,usage){
  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  const now=Date.now()
  try{
    db.prepare(
      "INSERT INTO agent_studio_execution_budgets(run_id,owner_uid,limits,limits_hash,question_id,started_ms,"+
      "model_intents,tool_intents,search_intents,read_intents,closing_intents,updated_ms) "+
      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run(runId,"employee-alpha",JSON.stringify({
      model_calls:42,tool_calls:20,search_calls:20,read_calls:20,wall_ms:3600000,closing_model_calls:1,
    }),"fixture-limits-hash","",now-5000,usage.model,usage.tool,usage.search,usage.read,usage.closing,now)
  }finally{db.close()}
}
try{
  let ready=false
  for(let i=0;i<140;i++){
    if(server.exitCode!==null)break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(700)})).ok){ready=true;break}}catch{}
    await sleep(120)
  }
  assert.ok(ready,"temporary PocketBase unavailable: "+logs.slice(-1400))

  const agent=await ok("POST","/api/agent_specs","employee-alpha",{
    name:"任务重试与生命周期 Agent",
    spec:{
      goal:"对输入任务进行分析并输出可验收结果",
      task_scope:"只在用户授权范围内执行",
      task_plan:["分析任务","核验信息","形成结果"],
      tools:["calculate"],
      deliverables:["分析结果"],
      done_criteria:["结果完整且可复核"],
    },
  })
  const started=await ok("POST","/api/agent-runs/start","employee-alpha",{
    spec_id:agent.id,instruction:"生命周期集成测试，不执行真实模型调用",
  })
  const runId=started.run_id
  assert.ok(runId)
  setRunState(runId,"failed","fixture_custom_openai_http_429",1)
  setExecutionBudget(runId,{model:7,tool:4,search:2,read:1,closing:1})

  const firstRetry=await ok("POST","/api/agent-runs/"+runId+"/retry","employee-alpha",{
    request_id:"retry-attempt-00000001",model:"qwen3.7-max",
  })
  assert.equal(firstRetry.run_id,runId,"retry must reuse the original task ID")
  assert.equal(firstRetry.status,"running")
  assert.equal(firstRetry.attempt_no,2)
  assert.equal(firstRetry.deduplicated,false)

  const duplicate=await ok("POST","/api/agent-runs/"+runId+"/retry","employee-alpha",{
    request_id:"retry-attempt-00000001",model:"qwen3.7-max",
  })
  assert.equal(duplicate.run_id,runId)
  assert.equal(duplicate.deduplicated,true,"same idempotency key must not create a second attempt")
  assert.equal((await request("POST","/api/agent-runs/"+runId+"/retry","employee-alpha",{
    request_id:"retry-attempt-00000001",model:"claude-opus-4.8",
  })).status,409,"reusing an idempotency key with a different model must be rejected")
  assert.equal((await request("POST","/api/agent-runs/"+runId+"/retry","employee-alpha",{
    request_id:"retry-attempt-00000002",model:"claude-opus-4.8",
  })).status,409,"a different retry must not start while the same task is running")

  const firstBudgetDb=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    assert.equal(Number(firstBudgetDb.prepare(
      "SELECT COUNT(*) AS n FROM agent_studio_execution_budgets WHERE run_id=?"
    ).get(runId).n),0,"a new attempt must not inherit exhausted durable request-intent budgets")
    const archived=JSON.parse(String(firstBudgetDb.prepare(
      "SELECT snapshot_json FROM agent_studio_run_attempts WHERE run_id=? AND attempt_no=1"
    ).get(runId).snapshot_json))
    assert.equal(archived.execution_budget.model_intents,7)
    assert.equal(archived.execution_budget.tool_intents,4)
    assert.equal(archived.execution_budget.closing_intents,1)
  }finally{firstBudgetDb.close()}

  const running=await ok("GET","/api/agent_runs/"+runId,"employee-alpha")
  assert.equal(running.id,runId)
  assert.equal(running.status,"running")
  assert.equal(running.model,"qwen3.7-max","the retry must use the quick-selected model")
  const firstArchive=await ok("GET","/api/agent-runs/"+runId+"/attempts","employee-alpha")
  assert.equal(firstArchive.items.length,1)
  assert.equal(firstArchive.items[0].attempt_no,1)
  assert.equal(firstArchive.items[0].status,"failed")
  assert.equal(firstArchive.items[0].error,"fixture_custom_openai_http_429")
  assert.equal(firstArchive.items[0].model,"claude-opus-4.8")

  setRunState(runId,"failed","fixture_second_attempt_failed",2)
  setExecutionBudget(runId,{model:2,tool:1,search:1,read:0,closing:0})
  const secondRetry=await ok("POST","/api/agent-runs/"+runId+"/retry","employee-alpha",{
    request_id:"retry-attempt-00000002",model:"claude-opus-4.8",
  })
  assert.equal(secondRetry.run_id,runId)
  assert.equal(secondRetry.attempt_no,3)
  const twoArchives=await ok("GET","/api/agent-runs/"+runId+"/attempts","employee-alpha")
  assert.deepEqual(twoArchives.items.map(item=>item.attempt_no),[2,1])
  assert.equal(twoArchives.items[0].error,"fixture_second_attempt_failed")
  assert.equal(twoArchives.items[1].error,"fixture_custom_openai_http_429")

  const secondBudgetDb=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    assert.equal(Number(secondBudgetDb.prepare(
      "SELECT COUNT(*) AS n FROM agent_studio_execution_budgets WHERE run_id=?"
    ).get(runId).n),0,"every retry must reset its own durable budget row")
    const archivedSecond=JSON.parse(String(secondBudgetDb.prepare(
      "SELECT snapshot_json FROM agent_studio_run_attempts WHERE run_id=? AND attempt_no=2"
    ).get(runId).snapshot_json))
    assert.equal(archivedSecond.execution_budget.model_intents,2)
    assert.equal(archivedSecond.execution_budget.tool_intents,1)
  }finally{secondBudgetDb.close()}

  const db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM agent_runs WHERE id=?").get(runId).n),1,
      "retries must not create independent agent_runs rows")
  }finally{db.close()}

  const visibleAgent=await ok("POST","/api/agent_specs","employee-alpha",{
    name:"保留的 Agent",spec:{goal:"保留任务",task_scope:"只读",task_plan:["梳理"],tools:["calculate"]},
  })
  const visibleRun=await ok("POST","/api/agent-runs/start","employee-alpha",{
    spec_id:visibleAgent.id,instruction:"此任务用于验证另一个 Agent 的任务仍可见",
  })
  const linkedRun=await ok("POST","/api/agent-runs/start","employee-alpha",{
    spec_id:agent.id,instruction:"此任务随所属 Agent 删除并停止",
  })

  // Add representative queued local work, an active lease and a pending schedule.
  const db2=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  const now=Date.now()
  const scheduleId="sched_lifecycle_agent_delete"
  const occurrenceId="occ_lifecycle_agent_delete"
  try{
    db2.prepare(
      "INSERT INTO studio_local_jobs(id,owner,device_id,run_id,job_key,args_hash,payload,status,created_ms,deadline_ms) "+
      "VALUES(?,?,?,?,?,?,?,'queued',?,?)"
    ).run("localjob_lifecycle_delete","employee-alpha","device-fixture",linkedRun.run_id,
      "lifecycle-delete-key","fixture-hash",'{"tool":"files.list","arguments":{}}',now,now+120000)
    db2.prepare(
      "INSERT INTO agent_studio_run_leases(kind,run_id,lease_token,acquired_ms,expires_ms,attempts,owner_instance) "+
      "VALUES('agent',?,?,?,?,1,'')"
    ).run(linkedRun.run_id,"a".repeat(40),now,now+60000)
    db2.prepare(
      "INSERT INTO agent_studio_schedules(id,rh_user_id,name,target_kind,target_id,instruction,recurrence_kind,"+
      "interval_minutes,time_zone,local_time,weekday,start_at_ms,next_at_ms,model_connection_id,model_id,max_steps,"+
      "enabled,deleted,revision,created_ms,updated_ms,last_due_ms) "+
      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1,?,?,0)"
    ).run(scheduleId,"employee-alpha","删除 Agent 后停止计划","agent",agent.id,"自动执行测试","daily",
      1440,"Asia/Singapore","09:00",1,now,now+86400000,"","",6,now,now)
    db2.prepare(
      "INSERT INTO agent_studio_schedule_occurrences(id,schedule_id,rh_user_id,scheduled_for_ms,schedule_revision,"+
      "run_id,status,attempts,locked_until_ms,next_retry_ms,error,created_ms,updated_ms) "+
      "VALUES(?,?,?,?,?,?,'pending',0,0,0,'',?,?)"
    ).run(occurrenceId,scheduleId,"employee-alpha",now+86400000,1,"",now,now)
  }finally{db2.close()}

  assert.equal((await request("DELETE","/api/agent_specs/"+agent.id,"employee-beta")).status,404,
    "a different owner must not delete an Agent")
  const deletion=await ok("DELETE","/api/agent_specs/"+agent.id,"employee-alpha")
  assert.ok(deletion.archived_runs>=2)
  const archivedDetail=await ok("GET","/api/agent-runs/"+linkedRun.run_id+"/detail","employee-alpha")
  assert.equal(archivedDetail.run.agent_deleted,true)
  assert.equal(archivedDetail.run.status,"cancelled")
  assert.equal(archivedDetail.run.error,"Agent 已删除，任务已归档")
  const directArchived=await ok("GET","/api/agent_runs/"+linkedRun.run_id,"employee-alpha")
  assert.equal(directArchived.agent_deleted,true,
    "the primary run-record API used by the Agent Studio UI must expose deleted-Agent state")
  assert.equal(directArchived.attempt_no,1)

  assert.equal((await request("POST","/api/agent-runs/"+linkedRun.run_id+"/retry","employee-alpha",{
    request_id:"retry-after-agent-delete",model:"qwen3.7-max",
  })).status,409,"deleted Agent tasks must never be retryable")
  assert.equal((await request("POST","/api/agent-runs/"+runId+"/retry","employee-alpha",{
    request_id:"retry-attempt-00000002",model:"claude-opus-4.8",
  })).status,409,"a previously used idempotency key must not bypass deletion read-only protection")

  assert.equal((await request("POST","/api/agent-runs/"+linkedRun.run_id+"/evaluate","employee-alpha",{})).status,409,
    "deleted Agent tasks must not accept new evaluations")
  assert.equal((await request("POST","/api/agent-runs/"+linkedRun.run_id+"/feedback","employee-alpha",{
    rating:"up",tags:[],comment:"late feedback",
  })).status,409,"deleted Agent tasks must not accept new or edited feedback")

  assert.equal((await request("POST","/api/llm/agent-engine/"+linkedRun.run_id+"/tick","employee-alpha",{})).status,409,
    "a deleted Agent task must not be ticked")
  assert.equal((await request("POST","/api/agent-runs/"+linkedRun.run_id+"/resume","employee-alpha",{})).status,409,
    "a deleted Agent task must not be resumed")

  const normalList=await ok("GET","/api/agent_runs?rh_user_id=employee-alpha&perPage=50","employee-alpha")
  assert.ok(normalList.items.some(item=>item.id===visibleRun.run_id))
  assert.ok(!normalList.items.some(item=>item.spec_id===agent.id),
    "tasks of a deleted Agent must disappear from the normal task list")
  const recent=await ok("GET","/api/agent-runs/recent?archive=1&status=all","employee-alpha")
  assert.ok(!recent.items.some(item=>item.spec_id===agent.id),
    "deleted Agent tasks must be excluded from the normal run archive")
  const archivedAttempts=await ok("GET","/api/agent-runs/"+runId+"/attempts","employee-alpha")
  assert.equal(archivedAttempts.items.length,2,
    "deleting an Agent must not delete immutable attempt audit records")

  const db3=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    const local=db3.prepare("SELECT status,error FROM studio_local_jobs WHERE id=?").get("localjob_lifecycle_delete")
    assert.equal(local.status,"cancelled")
    assert.equal(local.error,"agent_deleted")
    assert.equal(Number(db3.prepare("SELECT COUNT(*) AS n FROM agent_studio_run_leases WHERE run_id=?").get(linkedRun.run_id).n),0)
    const schedule=db3.prepare("SELECT enabled,deleted FROM agent_studio_schedules WHERE id=?").get(scheduleId)
    assert.equal(Number(schedule.enabled),0)
    assert.equal(Number(schedule.deleted),1)
    const occurrence=db3.prepare("SELECT status,error FROM agent_studio_schedule_occurrences WHERE id=?").get(occurrenceId)
    assert.equal(occurrence.status,"cancelled_schedule")
    assert.equal(occurrence.error,"agent_deleted")
  }finally{db3.close()}

  assert.equal((await request("GET","/api/agent-runs/"+runId+"/attempts","employee-beta")).status,404)
  console.log("PASS Agent run lifecycle: retry reuses task ID, attempts and execution budgets remain immutable, every retry gets fresh budgets, model can change, idempotency and ownership hold, Agent deletion archives and stops all linked work")
}catch(error){
  console.error("AGENT_RUN_LIFECYCLE_FAILURE",error.stack||error)
  console.error("POCKETBASE_LOG",logs.slice(-2200))
  process.exitCode=1
}finally{
  try{await stopHeadlessPocketBase(server)}catch{}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
