import test from "node:test"
import assert from "node:assert/strict"
import { evaluateComplexAgentAcceptance } from "../src/lib/complexAgentAcceptance.ts"
import { evaluateAgentJourney } from "../src/lib/agentCreateJourney.ts"

const role=(id,depends_on,tools)=>({
  id,name:id,responsibility:"严格按阶段交付证据",tasks:["执行本阶段"],
  inputs:["上一阶段成果"],deliverables:["带来源的报告"],depends_on,tools,
  done_criteria:["输出来源及结果"],
})
const spec = {
  goal:"跨网页、PDF、Excel 的多角色企业研究与审核交付",
  task_scope:"只使用已授权资料与测试工具",
  deliverables:["来源证据","页码信息","单元格公式","已审批交付物"],
  task_plan:["读取网页","提取文档","计算表格","复核并交付"],
  done_criteria:["每项必需工具真实执行","角色顺序完成","写入经人工批准"],
  tools:["browser_read","pdf_extract","sheet_analyze","send_report"],
  roles:[
    role("web",[],["browser_read"]),
    role("pdf",["web"],["pdf_extract"]),
    role("sheet",["pdf"],["sheet_analyze"]),
    role("review",["sheet"],[]),
    role("send",["review"],["send_report"]),
  ],
  capability_requirements:[
    {id:"web",title:"浏览器读取",kind:"browser",access:"read",required:true,role_ids:["web"],suggested_tool_ids:["browser_read"]},
    {id:"pdf",title:"PDF提取",kind:"document",access:"read",required:true,role_ids:["pdf"],suggested_tool_ids:["pdf_extract"]},
    {id:"sheet",title:"Excel核算",kind:"document",access:"read",required:true,role_ids:["sheet"],suggested_tool_ids:["sheet_analyze"]},
    {id:"send",title:"审批后交付",kind:"integration",access:"write",required:true,role_ids:["send"],suggested_tool_ids:["send_report"]},
  ],
}
const completed = spec.roles.map(role => role.id)
const roleState = {
  completed,outputs:Object.fromEntries(completed.map(id=>[id,"STAGE_EVIDENCE_"+id])),
}
const completedEvents = completed.map((id,i)=>({
  event_type:"status",step_index:i*2+2,content:{role_phase:"completed",role_id:id},
}))
const toolEvents=spec.capability_requirements.flatMap((need,i)=>{
  const step_index=2*i+1
  const tool=need.suggested_tool_ids[0]
  const role_id=need.role_ids[0]
  const result=[
    {event_type:"tool_call",step_index,content:{tool,role_id}},
    {event_type:"tool_result",step_index,content:{tool,output:"OK VERIFIED "+tool}},
  ]
  if(need.access==="write")result.push({event_type:"approval",step_index,content:{tool,decision:"approve"}})
  return result
})
const proof = {
  status:"succeeded",result:"FINAL_APPROVED_DELIVERY 120 30 90 with source",
  checkpoint:{role_state:roleState},events:[...completedEvents,...toolEvents],
}
const journey = run=>evaluateAgentJourney({
  spec,specName:"跨来源投研 Agent",savedId:"abc123def456xyz",dirty:false,
  enabledModelCount:1,modelState:"ready",accessibleKnowledgeBaseIds:[],
  toolStatusOf:()=> "ready",lastSavedAt:Date.parse("2026-10-23T10:00:00Z"),
  capabilityIssues:[],run:{
    spec_id:"abc123def456xyz",created:"2026-10-23T10:01:00Z",spec_snapshot:spec,...run,
  },runState:"ready",
})

test("complex five-role trace can prove completed handoffs, all required tools and human approval",()=>{
  const outcome=evaluateComplexAgentAcceptance(spec,proof)
  assert.equal(outcome.applicable,true)
  assert.equal(outcome.verified,true,JSON.stringify(outcome.issues))
  assert.equal(outcome.stageTotal,5)
  assert.equal(outcome.stagesVerified,5)
  assert.equal(outcome.requiredTotal,4)
  assert.equal(outcome.requiredVerified,4)
  assert.equal(journey(proof).canPublish,true)
})
test("a fabricated final success without the backing role and tool records blocks complex publishing",()=>{
  const unsupported=evaluateComplexAgentAcceptance(spec,{
    ...proof,checkpoint:{role_state:{completed:["web"],outputs:{web:"claimed final"}}},events:[],
  })
  assert.equal(unsupported.verified,false)
  assert.ok(unsupported.issues.some(s=>s.includes("角色")))
  assert.ok(unsupported.issues.some(s=>s.includes("工具")))
  const step=journey({...proof,checkpoint:{role_state:{completed:[],outputs:{}}},events:[]})
  assert.equal(step.canPublish,false)
  assert.equal(step.trial.state,"quality_blocked")
  assert.match(step.trial.detail,/角色交接.*工具调用/)
})
test("approval events cannot authorize another role, another step or a failed write",()=>{
  for(const invalid of [
    proof.events.filter(row=>row.event_type!=="approval"),
    proof.events.map(row=>row.event_type==="approval"?{...row,step_index:999}:row),
    proof.events.filter(row=>!(row.event_type==="tool_result" && row.content.tool==="send_report")),
    proof.events.map(row=>row.event_type==="tool_call" && row.content.tool==="send_report"
      ? {...row,content:{...row.content,role_id:"review"}}:row),
  ]) {
    const result=evaluateComplexAgentAcceptance(spec,{...proof,events:invalid})
    assert.equal(result.verified,false,JSON.stringify(invalid))
    assert.ok(result.issues.some(x=>x.includes("交付")))
  }
})
test("stage completion must match the stored dependency order and persist each output",()=>{
  const swapped={...proof,checkpoint:{role_state:{...roleState,completed:["pdf","web","sheet","review","send"]}}}
  const missing={...proof,checkpoint:{role_state:{...roleState,outputs:{web:"",pdf:"PDF"}}}}
  const noEvent={...proof,events:proof.events.filter(row=>!(row.event_type==="status" && row.content.role_id==="review"))}
  for(const candidate of [swapped,missing,noEvent]){
    const outcome=evaluateComplexAgentAcceptance(spec,candidate)
    assert.equal(outcome.verified,false)
    assert.ok(outcome.issues.some(s=>s.includes("角色")))
  }
})
test("an explicit required capability without an exact binding cannot be silently treated as executed",()=>{
  const missing={...spec,capability_requirements:spec.capability_requirements.map(need=>
    need.id==="pdf"?{...need,suggested_tool_ids:[]}:need)}
  assert.equal(evaluateComplexAgentAcceptance(missing,proof).verified,false)
  const optional={...spec,capability_requirements:spec.capability_requirements.map(need=>
    need.id==="pdf"?{...need,required:false}:need)}
  assert.equal(evaluateComplexAgentAcceptance(optional,{...proof,
    events:proof.events.filter(row=>!(row.content?.tool==="pdf_extract"))}).verified,true)
})
test("non-tool model-text capability does not demand a fabricated tool event",()=>{
  const withText={...spec,capability_requirements:[...spec.capability_requirements,{
    id:"summary",title:"交付摘要",kind:"text",access:"read",required:true,
    role_ids:["review"],suggested_tool_ids:[],
  }]}
  assert.equal(evaluateComplexAgentAcceptance(withText,proof).verified,true)
})
test("older single assistants are unaffected by the new multi-role proof requirement",()=>{
  const single={...spec,roles:[],capability_requirements:[]}
  assert.equal(evaluateComplexAgentAcceptance(single,null).applicable,false)
  assert.equal(evaluateComplexAgentAcceptance(single,null).verified,true)
})
