import test from "node:test"
import assert from "node:assert/strict"
import { buildRunComparison,runMetrics } from "../src/lib/runComparison.ts"
const row=(id,goal,extra={})=>({
  id,spec_id:"same-agent-id",created:"2026-10-21 08:00:00.000Z",
  status:"succeeded",spec_snapshot:{
    goal,task_scope:"研究范围",tools:["calculate"],
    task_plan:["检索","总结"],done_criteria:["引用"],
  },
  checkpoint:{harness_stats:{llm_calls:4,tool_calls:1,est_prompt_chars:600,est_out_chars:1200}},
  ...extra,
})
const event=(type,time)=>({event_type:type,created:"2026-10-21 08:00:"+time+".000Z",content:{}})
test("compares persisted fields and distinguishes LLM score from rule fallback",()=>{
  const old=row("before","初始目标",{
    feedback:{rating:"down",tags:["理解偏差"],comment:"增加具体范围"},
    evaluation:{score:65,mode:"llm"},
  })
  const next=row("after","改进目标",{
    spec_snapshot:{...old.spec_snapshot,goal:"改进目标",tools:["calculate","knowledge_search"]},
    evaluation:{score:80,mode:"rule",degraded:true},
  })
  const report=buildRunComparison(old,next,
    [event("status","00"),event("tool_result","08"),event("status","10")],
    [event("status","00"),event("tool_result","12"),event("status","20")])
  assert.equal(report.changes.length,2)
  assert.deepEqual(report.changes.map(x=>x.key),["goal","tools"])
  assert.equal(report.scoreDifference,15)
  assert.equal(report.beforeScoreMode,"llm")
  assert.equal(report.afterScoreMode,"rule")
  assert.equal(report.earlier.durationSeconds,10)
  assert.equal(report.later.durationSeconds,20)
  assert.equal(report.feedback.comment,"增加具体范围")
  assert.equal(report.earlier.estimatedChars,1800)
})
test("no fake billing or token numbers when stats/timestamps unavailable",()=>{
  const stats=runMetrics(row("x","A",{checkpoint:null}),[])
  assert.equal(stats.durationSeconds,null)
  assert.equal(stats.estimatedChars,null)
  assert.equal(stats.modelCalls,null)
  assert.equal(stats.toolResultCount,0)
})
test("same run and cross-Agent comparisons fail closed",()=>{
  const r=row("same","test")
  assert.throws(()=>buildRunComparison(r,r,[],[]))
  assert.throws(()=>buildRunComparison(r,row("other","test",{spec_id:"foreign"}),[],[]))
})
test("missing saved snapshot does not invent field changes",()=>{
  const report=buildRunComparison(row("a","A",{spec_snapshot:null}),row("b","B"),[],[])
  assert.equal(report.hasSnapshots,false)
  assert.deepEqual(report.changes,[])
  assert.equal(report.scoreDifference,null)
})
