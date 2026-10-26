import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import {timelineNearBottom} from "../src/lib/timelineFollow.ts"
import {latestRunActivity} from "../src/lib/runActivitySummary.ts"

test("only internal viewport proximity enables event auto-follow",()=>{
  assert.equal(timelineNearBottom({scrollTop:336,clientHeight:500,scrollHeight:900}),true)
  assert.equal(timelineNearBottom({scrollTop:335,clientHeight:500,scrollHeight:900}),false)
  assert.equal(timelineNearBottom({scrollTop:0,clientHeight:450,scrollHeight:1000}),false)
  assert.equal(timelineNearBottom({scrollTop:0,clientHeight:500,scrollHeight:350}),true)
  assert.equal(timelineNearBottom({scrollTop:0,clientHeight:500,scrollHeight:600},100),true)
})
test("status summary describes only the last saved event, not unverified progress",()=>{
  assert.equal(latestRunActivity([]),null)
  const event=(type,content={},step=2)=>({
    id:"synthetic",run_id:"synthetic-run",event_type:type,content,
    step_index:step,seq:1,created:"2026-10-26 15:00:00.000Z"
  })
  assert.deepEqual(latestRunActivity([
    event("status",{message:"FORGED_PROGRESS_COMPLETE",role_phase:"started",role_name:"analyst"}),
    event("tool_result",{tool:"calculate",output:"PASSWORD=SECRET_VALUE"},3),
  ]),{label:"已记录工具结果",stepLabel:"第 3 步",roleName:""})
  const last=latestRunActivity([event("status",{
    role_phase:"completed",role_name:"research",
    output:"UNVERIFIED_SECRET_RESULT"
  })])
  assert.deepEqual(last,{label:"角色阶段已提交成果",stepLabel:"第 2 步",roleName:"research"})
  assert.ok(!JSON.stringify(last).includes("SECRET"))
  assert.equal(latestRunActivity([event("error",{},0)]).stepLabel,"准备阶段")
})
test("run and detail timelines use a bounded viewport and never force window scroll",()=>{
  for(const sourceFile of [
    "src/components/agent-run/RunTimeline.tsx",
    "src/components/run-detail/RunTimelineBody.tsx",
  ]){
    const source=fs.readFileSync(sourceFile,"utf8")
    assert.match(source,/useTimelineFollow\(/)
    assert.match(source,/overflow-y-auto/)
    assert.match(source,/aria-label=".*运行事件列表"/)
    assert.doesNotMatch(source,/scrollIntoView\(/)
  }
  const page=fs.readFileSync("src/pages/AgentRun/AgentRunPage.tsx","utf8")
  assert.match(page,/visible=\{selectedView === "process"\}/,
    "force-mounted but invisible tabs must not trigger auto-follow")
  assert.match(page,/key=\{p\.activeRun\?\.id \|\| "no-run"\}/,
    "timeline follow state must reset after selecting another run")
})
