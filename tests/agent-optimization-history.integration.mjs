import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import {performance} from "node:perf_hooks"
import {DatabaseSync} from "node:sqlite"
import {spawnHeadlessPocketBase,stopHeadlessPocketBase} from "./helpers/headless-pocketbase.mjs"

const root=process.cwd()
const binary=process.env.POCKETBASE_BIN||path.join(root,"vibex-local/bin/windows/pocketbase.exe")
assert.ok(fs.existsSync(binary),"PocketBase binary required")
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentstudio-v19-lineage-"))
const port=await new Promise((resolve,reject)=>{
  const s=net.createServer()
  s.once("error",reject)
  s.listen(0,"127.0.0.1",()=>{const port=s.address().port;s.close(()=>resolve(port))})
})
const origin="http://127.0.0.1:"+port
const server=spawnHeadlessPocketBase(binary,[
  "serve","--http=127.0.0.1:"+port,"--dir="+dir,
  "--hooksDir="+path.join(root,"pocketbase/pb_hooks"),
],{cwd:path.join(root,"pocketbase"),windowsHide:true,env:{
  ...process.env,AGENT_STUDIO_ALLOW_ANON:"false",
}})
let logs=""
server.stdout.on("data",part=>logs=(logs+part.toString()).slice(-10000))
server.stderr.on("data",part=>logs=(logs+part.toString()).slice(-10000))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function call(method,route,user,body){
  const response=await fetch(origin+route,{
    method,headers:{"Content-Type":"application/json",...(user?{"X-Rh-User-Id":user}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(14000),
  })
  return {status:response.status,data:await response.json().catch(()=>({}))}
}
async function ok(method,route,user,body){
  const result=await call(method,route,user,body)
  assert.equal(result.status,200,method+" "+route+" "+JSON.stringify(result.data).slice(0,750))
  return result.data
}
try{
  let ready=false
  for(let i=0;i<125;i++){
    if(server.exitCode!==null)break
    try{if((await fetch(origin+"/api/health",{signal:AbortSignal.timeout(700)})).ok){ready=true;break}}
    catch{}
    await sleep(130)
  }
  assert.ok(ready,"PB startup unavailable "+logs.slice(-1200))
  const saved=await ok("POST","/api/agent_specs","A",{
    name:"V19原版",spec:{goal:"旧方案：处理反馈",
      task_plan:["收集","审批"],done_criteria:["完成"],
      tools:["calculate"],require_plan_review:true},
  })
  const other=await ok("POST","/api/agent_specs","B",{
    name:"B私有",spec:{goal:"仅B员工",task_plan:["内部工作"]},
  })
  const first=await ok("POST","/api/agent-runs/start","A",{
    spec_id:saved.id,instruction:"V19人工审批与反馈溯源模拟",
  })
  const baseGoal=saved.spec.goal
  const updatedPlan={...saved.spec,goal:"已根据反馈修改的需求方案",
    done_criteria:["输出可操作的交付清单","人工确认"]}
  const context={spec:updatedPlan,expected_updated:saved.updated,
    optimization_context:{source_run_id:first.run_id}}
  assert.equal((await call("PATCH","/api/agent_specs/"+saved.id,"A",context)).status,409,
    "No feedback: must not falsely claim feedback-triggered optimization")
  const check=await ok("GET","/api/agent_specs/"+saved.id,"A")
  assert.equal(check.spec.goal,baseGoal,"Rejected optimization may not change server spec")
  let db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{db.prepare("UPDATE agent_runs SET status='succeeded' WHERE id=?").run(first.run_id)}
  finally{db.close()}
  const feedback=await ok("POST","/api/agent-runs/"+first.run_id+"/feedback","A",{
    rating:"down",tags:["未注明风险"],comment:"请补充明确验收步骤及负责人",
  })
  assert.ok(feedback.ok)
  const unrelated=await call("PATCH","/api/agent_specs/"+saved.id,"B",context)
  assert.equal(unrelated.status,404)
  const forgedRun=await call("PATCH","/api/agent_specs/"+saved.id,"A",{
    ...context,optimization_context:{source_run_id:"a".repeat(15)}
  })
  assert.equal(forgedRun.status,404)
  const accepted=await ok("PATCH","/api/agent_specs/"+saved.id,"A",context)
  assert.equal(accepted.spec.goal,updatedPlan.goal)
  const auditId=accepted.optimization_lineage_id
  assert.match(auditId,/^[A-Za-z0-9]{15}$/)
  assert.equal((await call("PATCH","/api/agent_specs/"+saved.id,"A",context)).status,409,
    "Old tab cannot apply the same draft twice")
  const history=await ok("GET","/api/agent-specs/"+saved.id+
    "/optimization-lineage?audit_id="+auditId,"A")
  assert.equal(history.items.length,1)
  const proof=history.items[0]
  assert.equal(proof.source_run_id,first.run_id)
  assert.deepEqual(proof.changed_keys,["goal","done_criteria"])
  assert.equal(proof.feedback_unchanged,true)
  assert.equal(proof.is_current_spec,true,"Accepted change must be recoverable after browser refresh")
  assert.notEqual(proof.before_hash,proof.after_hash)
  assert.match(proof.accepted_revision_id,/^[A-Za-z0-9]{15}$/)
  assert.ok(!JSON.stringify(proof).includes("请补充明确验收步骤"),
    "Audit metadata must not leak actual feedback comments")
  assert.equal((await call("GET","/api/agent-specs/"+saved.id+
    "/optimization-lineage","B")).status,404)
  const next=await ok("POST","/api/agent-runs/start","A",{
    spec_id:saved.id,instruction:"V19再次试跑",
    config:{optimization_lineage_id:auditId},
  })
  const nextRun=await ok("GET","/api/agent_runs/"+next.run_id,"A")
  assert.equal(nextRun.config.optimization_lineage_id,auditId)
  assert.equal(nextRun.spec_snapshot.goal,updatedPlan.goal)
  assert.equal((await call("POST","/api/agent-runs/start","B",{
    spec_id:other.id,instruction:"forged audit",
    config:{optimization_lineage_id:auditId},
  })).status,404,"Another owner cannot reuse an audit ID")
  await ok("POST","/api/agent-runs/"+first.run_id+"/feedback","A",{
    rating:"up",comment:"反馈后来已经修改",
  })
  const changedFeedback=await ok("GET","/api/agent-specs/"+saved.id+
    "/optimization-lineage?audit_id="+auditId,"A")
  assert.equal(changedFeedback.items[0].feedback_unchanged,false,
    "Changing feedback after acceptance must be clearly detectable")
  const revised=await ok("PATCH","/api/agent_specs/"+saved.id,"A",{
    expected_updated:accepted.updated,
    spec:{...updatedPlan,goal:"后续另一次独立调整"},
  })
  assert.equal(revised.spec.goal,"后续另一次独立调整")
  const outdated=await ok("GET","/api/agent-specs/"+saved.id+
    "/optimization-lineage?audit_id="+auditId,"A")
  assert.equal(outdated.items[0].is_current_spec,false,
    "Version lookup must stop offering an audit after subsequent Agent edits")
  assert.equal((await call("POST","/api/agent-runs/start","A",{
    spec_id:saved.id,instruction:"invalid old lineage",
    config:{optimization_lineage_id:auditId},
  })).status,409,"A subsequent edit invalidates a provenance token for retest")

  // 170 old runs: metadata paging remains user-owned and lightweight.
  db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    db.exec("BEGIN")
    const add=db.prepare(
      "INSERT INTO agent_runs(id,rh_user_id,spec_id,spec_name,instruction,status,created,updated) "+
      "VALUES(?,?,?,?,?,?,?,?)"
    )
    for(let i=0;i<170;i++){
      const rid="f"+String(i).padStart(14,"0")
      const created="2026-10-20 "+String(Math.floor(i/3600)).padStart(2,"0")+":"+
        String(Math.floor(i/60)%60).padStart(2,"0")+":"+
        String(i%60).padStart(2,"0")+".000Z"
      add.run(rid,"A",saved.id,"V19 Long-run",
        "INSTRUCTION_PRIVATE_DO_NOT_SHARE_"+i,"succeeded",created,created)
    }
    db.exec("COMMIT")
  }catch(err){try{db.exec("ROLLBACK")}catch{}throw err}
  finally{db.close()}
  const runPage=await ok("GET","/api/agent-specs/"+saved.id+
    "/run-history?page=1&perPage=25","A")
  assert.equal(runPage.totalItems,172)
  assert.equal(runPage.totalPages,7)
  assert.equal(runPage.items.length,25)
  assert.doesNotMatch(JSON.stringify(runPage),/INSTRUCTION_PRIVATE_DO_NOT_SHARE/)
  let seen=new Set(runPage.items.map(row=>row.id))
  for(let page=2;page<=7;page++){
    const part=await ok("GET","/api/agent-specs/"+saved.id+
      "/run-history?page="+page+"&perPage=25","A")
    for(const entry of part.items){assert.ok(!seen.has(entry.id));seen.add(entry.id)}
  }
  assert.equal(seen.size,172,"All runs, including >100 old runs, must be accessible")
  assert.equal((await call("GET","/api/agent-specs/"+saved.id+"/run-history","B")).status,404)
  const bHistory=await ok("GET","/api/agent-specs/"+other.id+"/run-history","B")
  assert.equal(bHistory.totalItems,0)

  // Performance baseline on >1000 Agents; never mistake a count for latency.
  const performanceIndexes=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    const found=new Set(performanceIndexes.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' "+
      "AND name IN ('idx_agent_catalog_owner_updated','idx_agent_catalog_owner_name',"+
      "'idx_agent_catalog_owner_source','idx_run_history_owner_spec_created')"
    ).all().map(row=>row.name))
    for(const index of ["idx_agent_catalog_owner_updated","idx_agent_catalog_owner_name",
      "idx_agent_catalog_owner_source","idx_run_history_owner_spec_created"])
      assert.ok(found.has(index),"Expected actual SQLite performance index: "+index)
  }finally{performanceIndexes.close()}

  db=new DatabaseSync(path.join(dir,"data.db"),{timeout:5000})
  try{
    db.exec("BEGIN")
    const addAgent=db.prepare(
      "INSERT INTO agent_specs(id,rh_user_id,name,spec,source,created,updated) "+
      "VALUES(?,?,?,?,?,?,?)"
    )
    for(let i=0;i<1250;i++){
      const id="g"+String(i).padStart(14,"0")
      const marker=i%213===0?"UNIQUE_FAST_FIND":"normal"
      const name="Enterprise agent "+String(i).padStart(4,"0")
      const spec=JSON.stringify({goal:marker+" large workspace test "+i,
        task_scope:"需求方案",task_plan:["检索","验证"],tools:["calculate"]})
      addAgent.run(id,"A",name,spec,i%2?"create":"template",
        "2026-10-20 08:00:00.000Z","2026-10-20 08:00:00.000Z")
    }
    db.exec("COMMIT")
  }catch(err){try{db.exec("ROLLBACK")}catch{}throw err}
  finally{db.close()}
  const timings=[]
  for(const route of [
    "/api/agent_specs?page=1&perPage=18&sort=updated_desc",
    "/api/agent_specs?page=43&perPage=18&sort=name_asc",
    "/api/agent_specs?q=UNIQUE_FAST_FIND&perPage=18&source=template",
    "/api/agent_specs?perPage=18&favorite=1",
    "/api/agent_specs?perPage=18&sort=favorite_desc",
  ]){
    const started=performance.now()
    const data=await ok("GET",route,"A")
    const elapsed=Math.round(performance.now()-started)
    timings.push({route,ms:elapsed})
    assert.equal(data.totalItems>=1251 || route.includes("q=")||route.includes("favorite=1"),true)
    assert.ok(data.items.length<=18,"Catalog must not return full AgentSpecs for every row")
    assert.ok(Buffer.byteLength(JSON.stringify(data))<100000,
      "One desktop page payload should stay bounded")
  }
  assert.equal((await ok("GET","/api/agent_specs?q=UNIQUE_FAST_FIND&perPage=18","A")).totalItems,6)
  const slowest=Math.max(...timings.map(row=>row.ms))
  console.log("V19_AGENT_CATALOG_1251_PERF",JSON.stringify({timings,slowestMs:slowest}))
  console.log("PASS V19 feedback->accepted revision->specific retest lineage, >100 runs paging, 1251 Agent API performance and owner ACL")
}catch(error){
  console.error("V19_OPTIMIZATION_HISTORY_FAILURE",error.stack||String(error))
  console.error("POCKETBASE_LOG",logs.slice(-2100))
  process.exitCode=1
}finally{
  try{await stopHeadlessPocketBase(server)}catch{}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
}
