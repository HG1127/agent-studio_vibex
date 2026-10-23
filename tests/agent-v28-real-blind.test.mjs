import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import { V28_UNSEEN_TASKS } from "./fixtures/agent-v28-unseen-tasks.mjs"
import { AGENT_DESIGN_SYSTEM_PROMPT, agentDesignTokenBudget,
  parseAgentDesignResponse } from "../src/lib/agentDesignProtocol.ts"
import { evaluateBlindAgentPlan } from "../src/lib/agentDesignEvaluation.ts"
import { explainBlindDiagnostic } from "../src/lib/agentBlindDiagnostics.ts"
import { availableAgentDesignModels, chooseAgentDesignModel } from "../src/lib/agentDesignModelSelection.ts"
import { prepareGeneratedAgentPermissions, resolveAgentToolRequirements } from "../src/lib/agentToolMatcher.ts"

test("V28 covers ten held-out synthetic cases with mixed write policies and role counts",()=>{
  assert.equal(V28_UNSEEN_TASKS.length,10)
  assert.equal(new Set(V28_UNSEEN_TASKS.map(row=>row.id)).size,10)
  assert.ok(V28_UNSEEN_TASKS.some(row=>row.write))
  assert.ok(V28_UNSEEN_TASKS.some(row=>!row.write))
  assert.ok(V28_UNSEEN_TASKS.some(row=>row.roles[1]===8))
  assert.ok(V28_UNSEEN_TASKS.every(row=>row.task.length>40))
  assert.ok(!V28_UNSEEN_TASKS.some(row=>/API.?KEY|Bearer\s+[A-Za-z0-9]{20}/i.test(row.task)))
  assert.match(AGENT_DESIGN_SYSTEM_PROMPT,/2-8 个/)
  assert.match(AGENT_DESIGN_SYSTEM_PROMPT,/tools 初始留空/)
})

test("real planner and benchmark share the same safe production parser",()=>{
  const text=JSON.stringify({
    name:"审批审计助手", goal:"检查政策合规并出具带出处的冲突清单",
    task_scope:"只能阅读内部已授权资料",deliverables:["审查表","出处"],tools:["虚构邮件连接"],
    task_plan:["提取政策","复核"],done_criteria:["记录来源"],
    require_plan_review:false,require_approval:true,
    roles:[
      {id:"reader",name:"提取",responsibility:"读取",tasks:["读"],inputs:[],deliverables:["证据"],
        done_criteria:["页码"],depends_on:[],tools:[]},
      {id:"reviewer",name:"审核",responsibility:"审查",tasks:["复核"],inputs:["证据"],deliverables:["报告"],
        done_criteria:["清单"],depends_on:["reader"],tools:[]},
      {id:"publisher",name:"交付",responsibility:"汇总",tasks:["整理"],inputs:["报告"],deliverables:["审计件"],
        done_criteria:["可复核"],depends_on:["reviewer"],tools:[]},
    ],
    capability_requirements:[
      {id:"pdf",title:"读取PDF",purpose:"核查政策页码",kind:"document",access:"read",required:true,
        role_ids:["reader"],suggested_tool_ids:[],search_terms:["document"]},
      {id:"kb",title:"检索知识库",purpose:"对照授权采购制度",kind:"knowledge",access:"read",required:true,
        role_ids:["reviewer"],suggested_tool_ids:[],search_terms:["knowledge"]},
    ],
  })
  const parsed=parseAgentDesignResponse(text)
  assert.equal(parsed.spec.require_approval,true)
  const score=evaluateBlindAgentPlan(V28_UNSEEN_TASKS[0],text)
  assert.equal(score.parsed,true)
  assert.equal(score.mechanicallyPassed,true,JSON.stringify(score.diagnostics))
  assert.equal(score.stageCount,3)
  assert.equal(score.matchedRequired,2)
  assert.equal(score.humanReview,"pending")
  assert.equal(score.modelPreGrantedRoles,0)
  assert.equal(score.requiredRoleOwnershipValid,true)
  const noOwners=JSON.stringify({...JSON.parse(text),capability_requirements:
    JSON.parse(text).capability_requirements.map(need=>({...need,role_ids:[]}))})
  const missingOwnerScore=evaluateBlindAgentPlan(V28_UNSEEN_TASKS[0],noOwners)
  assert.equal(missingOwnerScore.mechanicallyPassed,false)
  assert.equal(missingOwnerScore.requiredRoleOwnershipValid,false)
  assert.ok(missingOwnerScore.diagnostics.some(code=>code.startsWith("invalid_capability_role_owner:")))
  const phantomOwner=JSON.stringify({...JSON.parse(text),capability_requirements:
    JSON.parse(text).capability_requirements.map((need,i)=>i===0?{...need,role_ids:["nonexistent_role"]}:need)})
  assert.equal(evaluateBlindAgentPlan(V28_UNSEEN_TASKS[0],phantomOwner).mechanicallyPassed,false)
  const forged=JSON.stringify({...JSON.parse(text),roles:JSON.parse(text).roles.map((role,i)=>
    i===0?{...role,tools:["forged_sender"]}:role)})
  assert.equal(evaluateBlindAgentPlan(V28_UNSEEN_TASKS[0],forged).mechanicallyPassed,false)
  assert.equal(evaluateBlindAgentPlan(V28_UNSEEN_TASKS[0],forged).modelPreGrantedRoles,1)
  const guarded=prepareGeneratedAgentPermissions(parsed.spec,
    resolveAgentToolRequirements("",parsed.spec,[],[]))
  assert.ok(guarded.roles.every(role=>role.tools.length===0))
  assert.ok(!guarded.tools.includes("forged_sender"))
  assert.equal(agentDesignTokenBudget("建立八个角色做代码审查"),9500)
  assert.equal(agentDesignTokenBudget("只要三个角色"),6500)
})

test("blind scorer fails closed on missing roles, fabricated tools and unwanted writes",()=>{
  const criteria=V28_UNSEEN_TASKS[0]
  const minimal=JSON.stringify({
    name:"不完整",goal:"审计合规",task_scope:"仅授权文件",
    deliverables:["报告"],tools:["send_email"],task_plan:["审计"],done_criteria:["结束"],
    roles:[],capability_requirements:[],
  })
  assert.equal(evaluateBlindAgentPlan(criteria,minimal).mechanicallyPassed,false)
  assert.equal(evaluateBlindAgentPlan(criteria,"not valid json").parsed,false)
  const unknown=JSON.stringify({
    name:"无权限",goal:"审阅供应商守则",task_scope:"只读",deliverables:["证据"],tools:["send_email"],
    task_plan:["收集","校验","结论"],done_criteria:["能复核"],
    roles:[
      {id:"a",name:"A",responsibility:"提取",tasks:["提取"],inputs:[],deliverables:["PDF"],done_criteria:["页码"],depends_on:[],tools:[]},
      {id:"b",name:"B",responsibility:"对照",tasks:["对照"],inputs:[],deliverables:["审计"],done_criteria:["校验"],depends_on:["a"],tools:[]},
      {id:"c",name:"C",responsibility:"审核",tasks:["核验"],inputs:[],deliverables:["冲突"],done_criteria:["完成"],depends_on:["b"],tools:[]},
    ],
    capability_requirements:[
      {id:"doc",title:"文档",purpose:"PDF",kind:"document",access:"read",required:true,
        role_ids:["a"],search_terms:[],suggested_tool_ids:["invented_pdf_123"]},
      {id:"kb",title:"知识库",purpose:"授权模板",kind:"knowledge",access:"read",required:true,
        role_ids:["b"],search_terms:[],suggested_tool_ids:[]},
      {id:"email",title:"外发",purpose:"发送",kind:"integration",access:"write",required:true,
        role_ids:["c"],search_terms:[],suggested_tool_ids:[]},
    ],
  })
  const score=evaluateBlindAgentPlan(criteria,unknown)
  assert.equal(score.mechanicallyPassed,false)
  assert.ok(score.unverifiableSuggestions>0)
  assert.equal(score.writePolicyCorrect,false)
})

test("V28 failure diagnostics explain role ownership and required capabilities",()=>{
  assert.match(explainBlindDiagnostic("invalid_capability_role_owner:pdf"), /负责角色/)
  assert.match(explainBlindDiagnostic("missing_required_capability:document:read"), /文档处理.*只读/)
  assert.match(explainBlindDiagnostic("missing_required_capability:integration:write"), /第三方系统.*写入/)
  assert.match(explainBlindDiagnostic("unrequested_write_capability"), /未经请求的写入/)
  assert.match(explainBlindDiagnostic("model_omitted_required_approval"), /人工审批/)
  assert.match(explainBlindDiagnostic("very_secret_unknown_code"), /结构校验未通过/)
  assert.ok(!explainBlindDiagnostic("very_secret_unknown_code").includes("secret"))
})

test("normal complex Agent creation must explicitly bind an employee-owned model",()=>{
  const options=availableAgentDesignModels([
    {id:"mini",name:"MiniMax",enabled:true,models:["MiniMax-M3.1-Flash","MiniMax-Text"]},
    {id:"disabled",name:"Disabled",enabled:false,models:["dangerous-fallback"]},
    {id:"empty",name:"Empty",enabled:true,models:[]},
    {id:"mini",name:"duplicate",enabled:true,models:["MiniMax-M3.1-Flash"]},
    {id:"other",name:"Other",enabled:true,models:["Claude-X"]},
  ])
  assert.equal(options.length,3)
  const selected=chooseAgentDesignModel(options,options[1].key)
  assert.equal(selected?.connectionId,"mini")
  assert.equal(selected?.modelId,"MiniMax-Text")
  assert.equal(chooseAgentDesignModel(options,""),null,"more than one model requires an explicit selection")
  assert.equal(chooseAgentDesignModel(options.slice(0,1),"")?.modelId,"MiniMax-M3.1-Flash")
  assert.equal(chooseAgentDesignModel(options,JSON.stringify(["disabled","dangerous-fallback"])),null)
  assert.equal(chooseAgentDesignModel(options,JSON.stringify(["mini","deleted-model"])),null)
  assert.equal(availableAgentDesignModels({items:options}).length,0)
  assert.equal(JSON.stringify(options).includes("api_key"),false)
})

test("real creation client binds chosen connection and fails fast on stale model without polling",async()=>{
  const source=readFileSync(new URL("../src/lib/llm.ts",import.meta.url),"utf8")
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS}}).outputText
  const calls=[]
  const scope={exports:{},AbortController,
    window:{setTimeout:()=>1,clearTimeout:()=>{}},
    require:spec=>spec==="./pb"?{pb:{authStore:{token:"test-token"}},getPocketBaseUrl:()=>"http://fixture.invalid"}:
      spec==="./auth"?{getAuthHeaders:()=>({})}:{},
    fetch:async (_url,options)=>{
      calls.push(JSON.parse(options.body))
      return {status:400,ok:false,json:async()=>({error:"model_not_permitted"})}
    },
  }
  vm.runInNewContext(compiled,scope,{timeout:1500})
  const result=await scope.exports.callLlmWithFallback("MiniMax-M3.1-Flash",{
    page:"home",request_id:"design-binding-test-unique",
    messages:[{role:"user",content:"synthetic task"}],
    connection_id:"owner-connection",strict_model:true,max_tokens:6500,
  })
  assert.equal(result.error,"model_not_permitted")
  assert.equal(result.status,"failed")
  assert.equal(calls.length,1,"a denied binding must never enter long polling or a second billable request")
  assert.equal(calls[0].model,"MiniMax-M3.1-Flash")
  assert.equal(calls[0].connection_id,"owner-connection")
  assert.equal(calls[0].strict_model,true)
})

test("strict employee model selection never downgrades to unverified legacy endpoints",async()=>{
  const source=readFileSync(new URL("../src/lib/llm.ts",import.meta.url),"utf8")
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.CommonJS}}).outputText
  for (const oldRouteUsed of [false,true]) {
    const paths=[]
    const scope={exports:{},AbortController,window:{setTimeout:()=>1,clearTimeout:()=>{}},
      require:spec=>spec==="./pb"?{pb:{authStore:{token:"test-token"}},getPocketBaseUrl:()=>"http://fixture.invalid"}:
        spec==="./auth"?{getAuthHeaders:()=>({})}:{},
      fetch:async url=>{paths.push(String(url));return {status:404,ok:false}},
    }
    vm.runInNewContext(compiled + (oldRouteUsed?"\nlegacyLlmRoutes = true;":""),scope,{timeout:1500})
    const result=await scope.exports.callLlmWithFallback("MiniMax-M3.1-Flash",{
      page:"home",request_id:"strict-no-fallback-test",messages:[{role:"user",content:"synthetic"}],
      connection_id:"owned-connection",strict_model:true,max_tokens:6500,
    })
    assert.equal(result.status,"failed")
    assert.equal(result.error,"strict_model_route_unavailable")
    assert.deepEqual(paths,["http://fixture.invalid/api/llm/chat"],
      "strict model binding must never switch to legacy routes or send a second request")
  }
})

test("default benchmark check and missing-credential live mode make zero provider calls",()=>{
  const env={...process.env,AGENT_STUDIO_V28_PROVIDER:"",AGENT_STUDIO_V28_MODEL:"",
    AGENT_STUDIO_V28_MODEL_API_KEY:"",AGENT_STUDIO_V28_CONFIRM_LIVE:""}
  const check=spawnSync(process.execPath,["ops/agent-v28-real-planning-benchmark.mjs","--check"],
    {env,encoding:"utf8",timeout:15000})
  assert.equal(check.status,0,String(check.stderr))
  const status=JSON.parse(check.stdout.trim())
  assert.equal(status.liveCalls,0)
  assert.equal(status.status,"NO_CONNECTED_REAL_MODEL")
  assert.equal(status.plannedCalls,30)
  const forbidden=spawnSync(process.execPath,["ops/agent-v28-real-planning-benchmark.mjs","--live"],
    {env,encoding:"utf8",timeout:15000})
  assert.equal(forbidden.status,3)
  assert.match(forbidden.stderr,/REAL_MODEL_UNAVAILABLE/)
})
