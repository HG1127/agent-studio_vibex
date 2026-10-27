import test from "node:test"
import assert from "node:assert/strict"
import {extractAgentSafeText,normalizeAgentSafeText} from "../src/agent-safe-text.ts"
test("collaborative text projection never delegates private execution bindings",()=>{
  const privateSpec={goal:"Shared goal",task_scope:"Safe scope",deliverables:["Report"],task_plan:["Read"],done_criteria:["Done"],
    model_binding:{connection_id:"PRIVATE_MODEL",api_key:"PRIVATE_KEY"},knowledge_base_ids:["PRIVATE_KB"],tools:["PRIVATE_TOOL"],http_tools:[{url:"PRIVATE_URL"}],require_approval:true}
  const view=extractAgentSafeText(privateSpec)
  assert.deepEqual(view,{goal:"Shared goal",task_scope:"Safe scope",deliverables:["Report"],task_plan:["Read"],done_criteria:["Done"]})
  for(const field of ["model_binding","knowledge_base_ids","tools","http_tools","mcp_tools","require_approval","owner_user_id","revision"])
    assert.throws(()=>normalizeAgentSafeText({...view,[field]:privateSpec[field]??"forbidden"}),e=>e.code==="agent_collaboration_protected_field")
  assert.equal(JSON.stringify(view).includes("PRIVATE"),false)
})
test("safe role fields retain original collaborative limits and reject overflow instead of truncation",()=>{
  const value={goal:"目".repeat(2998)+"🚀",task_scope:"域".repeat(4000),deliverables:Array.from({length:30},()=>"项".repeat(500)),task_plan:[],done_criteria:[]}
  assert.deepEqual(normalizeAgentSafeText(value),value)
  for(const change of [{goal:value.goal+"x"},{task_scope:value.task_scope+"x"},{deliverables:[...value.deliverables,"x"]},{deliverables:["x".repeat(501)]},{goal:" "},{task_scope:"x\0y"},
    {task_plan:["x\0y"]},{done_criteria:Array.from({length:30},()=>"x".repeat(500))}])
    assert.throws(()=>normalizeAgentSafeText({...value,...change}),e=>e.code==="invalid_agent_collaboration_text")
  assert.deepEqual(normalizeAgentSafeText({goal:"Minimal"}),{goal:"Minimal",task_scope:"",deliverables:[],task_plan:[],done_criteria:[]})
  const large={...value,task_plan:[...value.deliverables],done_criteria:[...value.deliverables]}
  assert.deepEqual(extractAgentSafeText({...large,model_binding:{api_key:"PRIVATE"}}),large)
  assert.throws(()=>normalizeAgentSafeText(large),e=>e.code==="invalid_agent_collaboration_text")
})
