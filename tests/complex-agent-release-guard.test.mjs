import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const moduleRef = {exports:{}}
vm.runInNewContext(fs.readFileSync("pocketbase/pb_hooks/modules/harness_complex_release.js","utf8"),
  {module:moduleRef}, {timeout:1000})
const guard = moduleRef.exports
const role = (id, deps, tools) => ({
  id, name:id, depends_on:deps, tools, responsibility:id,
  tasks:["execute"], inputs:[],deliverables:["saved result"],done_criteria:["evidence"],
})
const spec = {
  tools:["browser_read","pdf_extract","sheet_analyze","send_report"],
  roles:[role("web",[],["browser_read"]),role("pdf",["web"],["pdf_extract"]),
    role("sheet",["pdf"],["sheet_analyze"]),role("review",["sheet"],[]),
    role("sender",["review"],["send_report"])],
  capability_requirements:[
    {id:"web",required:true,kind:"browser",access:"read",role_ids:["web"],suggested_tool_ids:["browser_read"]},
    {id:"pdf",required:true,kind:"document",access:"read",role_ids:["pdf"],suggested_tool_ids:["pdf_extract"]},
    {id:"sheet",required:true,kind:"document",access:"read",role_ids:["sheet"],suggested_tool_ids:["sheet_analyze"]},
    {id:"send",required:true,kind:"integration",access:"write",role_ids:["sender"],suggested_tool_ids:["send_report"]},
  ],
  quality_checks:[{type:"contains",expected:"metric 90"}],
}
const done = ["web","pdf","sheet","review","sender"]
const run = {status:"succeeded",result:"Reviewed metric 90",
  checkpoint:{role_state:{completed:done,outputs:Object.fromEntries(done.map(id=>[id,"handed off "+id]))}}}
const events = [
  ...done.map((id,i)=>({event_type:"status",step_index:i*2+2,content:{role_id:id,role_phase:"completed"}})),
  ...spec.capability_requirements.flatMap((need,i)=>{
    const step_index=i*2+1,tool=need.suggested_tool_ids[0],role_id=need.role_ids[0]
    return [
      {event_type:"tool_call",step_index,content:{tool,role_id}},
      {event_type:"tool_result",step_index,content:{tool,output:"verified"}},
      ...(need.access==="write"?[{event_type:"approval",step_index,content:{tool,decision:"approve"}}]:[]),
    ]
  }),
]
test("Goja release gate accepts the complete five-role evidence, not model completion alone", () => {
  const accepted=guard.verify(spec,run,events)
  assert.equal(accepted.applicable,true)
  assert.equal(accepted.passed,true)
  assert.equal(accepted.issues.length,0)
  assert.equal(guard.verify({...spec,roles:[]},run,[]).applicable,false)
})
test("Goja release gate fails closed when stage, tool, approval, or quality evidence is missing", () => {
  const variants = [
    [spec,{...run,checkpoint:{role_state:{completed:["web"],outputs:{web:"only"}}}},events],
    [spec,run,events.filter(ev=>!(ev.event_type==="tool_result" && ev.content.tool==="pdf_extract"))],
    [spec,run,events.filter(ev=>ev.event_type!=="approval")],
    [spec,run,events.map(ev=>ev.event_type==="tool_call" && ev.content.tool==="send_report"
      ? {...ev,content:{...ev.content,role_id:"review"}}:ev)],
    [{...spec,capability_requirements:spec.capability_requirements.map(need=>
      need.id==="send"?{...need,suggested_tool_ids:[]}:need)},run,events],
    [spec,{...run,result:"Invented result without the required metric"},events],
    [spec,{...run,status:"failed"},events],
    [spec,run,[]],
  ]
  for (const [s,r,e] of variants){
    const result=guard.verify(s,r,e)
    assert.equal(result.passed,false,JSON.stringify(result))
    assert.ok(result.issues.length>0)
  }
})
test("Goja release gate detects role cycles and spoofed completion", () => {
  const cycle={...spec,roles:[role("a",["b"],[]),role("b",["a"],[])]}
  assert.equal(guard.verify(cycle,run,events).passed,false)
  const reversed={...run,checkpoint:{role_state:{...run.checkpoint.role_state,completed:[...done].reverse()}}}
  assert.equal(guard.verify(spec,reversed,events).passed,false)
})
