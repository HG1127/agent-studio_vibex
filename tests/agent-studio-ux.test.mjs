import test from "node:test"
import assert from "node:assert/strict"
import {
  STUDIO_WORKSPACES, workspacesForRole, routesForRole,
  workspaceForPath, searchStudioRoutes,
} from "../src/lib/studioNavigation.ts"
import { evaluateAgentJourney } from "../src/lib/agentCreateJourney.ts"
import { normalizeAgentQualityChecks, evaluateAgentQualityChecks } from "../src/lib/agentQualityChecks.ts"
import {AGENT_DRAFT_TTL_MS,agentDraftKey,saveAgentDraft,readAgentDraft,
  clearAgentDraft,normalizeAgentDraft} from "../src/lib/agentEditorDraft.ts"
import {
  registerUnsavedWorkCheck, hasUnsavedWork, shouldNavigateFromUnsavedWork,
  recoverHistoryOffset, isSameEditorRoute,
} from "../src/lib/unsavedNavigation.ts"

const spec = {
  goal:"研究竞争格局并形成决策摘要",
  task_scope:"限定公开资料",
  deliverables:["一页决策摘要"],
  tools:["calculate"],
  task_plan:["收集事实","验证"],
  done_criteria:["有来源引用且所有事实可核验"],
  knowledge_base_ids:[],
}
const ready = {
  spec,specName:"行业助手",savedId:"abcdefghijklmno",dirty:false,
  enabledModelCount:2,modelState:"ready",
  toolStatusOf:()=> "ready",accessibleKnowledgeBaseIds:[],
  lastSavedAt:Date.parse("2026-10-16T00:00:00Z"),
}

test("owner-scoped temporary Agent draft expires and excludes credential-like fields",()=>{
  const data=new Map(),original=globalThis.sessionStorage
  globalThis.sessionStorage={
    getItem:key=>data.get(key)||null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:key=>data.delete(key),
  }
  try{
    const owner="employee123456"
    const source={version:1,ownerId:owner,editedAt:Date.now(),
      userInput:"研究上市公司",spec:{...spec,api_key:"do-not-store",password:"secret"},
      specName:"研究助手",sourceMode:"create",templateKey:"",
      editingRecordId:"record123",serverUpdated:"2026-10-16 14:30:01.000Z",
      token:"user-session-token"}
    assert.equal(saveAgentDraft(owner,source),true)
    assert.equal(readAgentDraft("otherEmployee123"),null)
    const raw=data.get(agentDraftKey(owner))
    assert.ok(raw && !raw.includes("do-not-store") && !raw.includes("user-session-token"))
    assert.equal(readAgentDraft(owner).spec.goal,spec.goal)
    assert.equal(readAgentDraft(owner).editingRecordId,"record123")
    assert.equal(normalizeAgentDraft(source,owner,Date.now()+AGENT_DRAFT_TTL_MS+10),null)
    assert.equal(normalizeAgentDraft({...source,ownerId:"unknown"},owner),null)
    clearAgentDraft(owner)
    assert.equal(readAgentDraft(owner),null)
  }finally{
    if(original===undefined)delete globalThis.sessionStorage
    else globalThis.sessionStorage=original
  }
})


test("requirement entered beside a saved Agent becomes a separate draft without stale record linkage",()=>{
  const owner="employee123456"
  const savedMetadata={
    version:1,ownerId:owner,editedAt:Date.now(),userInput:"新行业研究需求",
    spec:null,specName:"已保存的其他 Agent",sourceMode:"template",templateKey:"template-a",
    editingRecordId:"previous-saved-row",serverUpdated:"2026-10-16 12:00:00",
  }
  const output=normalizeAgentDraft(savedMetadata,owner)
  assert.equal(output.userInput,"新行业研究需求")
  assert.equal(output.spec,null)
  assert.equal(output.specName,"")
  assert.equal(output.editingRecordId,"")
  assert.equal(output.serverUpdated,"")
  assert.equal(output.templateKey,"")
  assert.equal(output.sourceMode,"create")
  const combined=normalizeAgentDraft({...savedMetadata,spec},owner)
  assert.equal(combined.userInput,"新行业研究需求")
  assert.equal(combined.spec.goal,spec.goal)
  assert.equal(combined.editingRecordId,"previous-saved-row")
  assert.equal(combined.serverUpdated,"2026-10-16 12:00:00")
})
test("unsaved SPA navigation guard prompts only for a real route change and cleans up",()=>{
  let confirmations=0
  const ask=()=>{confirmations++;return false}
  const release=registerUnsavedWorkCheck(()=>true)
  assert.equal(hasUnsavedWork(),true)
  assert.equal(shouldNavigateFromUnsavedWork("/agent-create","/agent-create",ask),true)
  assert.equal(shouldNavigateFromUnsavedWork("/agent-create?step=1",
    "/agent-create?step=2",ask),true)
  assert.equal(isSameEditorRoute("/agent-create?step=1","/agent-create?step=2"),true)
  assert.equal(isSameEditorRoute("/agent-create?spec=agent-a&step=1",
    "/agent-create?spec=agent-b&step=1"),false)
  assert.equal(isSameEditorRoute("/workflow-canvas?wf=workflow-a",
    "/workflow-canvas?wf=workflow-b"),false)
  assert.equal(isSameEditorRoute("/workflow-canvas?wf=workflow-a&pane=left",
    "/workflow-canvas?pane=right&wf=workflow-a"),true)
  assert.equal(isSameEditorRoute("/?spec=agent-a","/?spec=agent-b"),false)
  assert.equal(recoverHistoryOffset(6,5),1)
  assert.equal(recoverHistoryOffset(4,7),-3)
  assert.equal(recoverHistoryOffset(null,3),null)
  assert.equal(confirmations,0,"same-route action must not prompt")
  assert.equal(shouldNavigateFromUnsavedWork("/agent-create","/workflow-canvas",ask),false)
  assert.equal(confirmations,1)
  assert.equal(shouldNavigateFromUnsavedWork("/agent-create","/agent-run",()=>true),true)
  release()
  assert.equal(hasUnsavedWork(),false)
  assert.equal(shouldNavigateFromUnsavedWork("/agent-create","/agent-run",ask),true)
  assert.equal(confirmations,1,"cleanup must remove stale blocking callbacks")
})
test("navigation has five distinct main spaces and no duplicate leaf routes",()=>{
  assert.equal(STUDIO_WORKSPACES.length,5)
  assert.deepEqual(STUDIO_WORKSPACES.map(x=>x.label),[
    "工作台","创建与编排","资源中心","运行中心","管理中心",
  ])
  const leaves=routesForRole("admin")
  assert.equal(new Set(leaves.map(x=>x.to)).size,leaves.length)
  assert.equal(workspaceForPath("/agent-create","employee")?.label,"创建与编排")
  assert.equal(workspaceForPath("/workflow-canvas","employee")?.label,"创建与编排")
  assert.equal(workspaceForPath("/knowledge-bases","employee")?.label,"资源中心")
  assert.equal(workspaceForPath("/scheduled-tasks","employee")?.label,"运行中心")
})
test("navigation hides staff and management destinations from employee UI including Ctrl+K",()=>{
  assert.equal(workspacesForRole("employee").length,4)
  const employeePaths=routesForRole("employee").map(x=>x.to)
  for(const path of ["/staff","/manager","/internal-overview"])
    assert.equal(employeePaths.includes(path),false)
  assert.equal(workspaceForPath("/staff","employee"),undefined)
  assert.equal(searchStudioRoutes("员工权限","employee").some(x=>x.to==="/staff"),false)
  assert.equal(searchStudioRoutes("员工","admin").some(x=>x.to==="/staff"),true)
  assert.equal(searchStudioRoutes("工作流","employee")[0].to,"/workflow-canvas")
  assert.equal(searchStudioRoutes("Agent","employee").some(x=>x.to==="/agent-create"),true)
})
test("journey requires editable real plan, an enabled model and a saved snapshot",()=>{
  const absent=evaluateAgentJourney({...ready,spec:null,savedId:""})
  assert.equal(absent.canTry,false)
  assert.ok(absent.planIssues.length>0)
  const unsaved=evaluateAgentJourney({...ready,dirty:true})
  assert.equal(unsaved.canTry,false)
  assert.ok(unsaved.planIssues.some(x=>x.includes("未保存")))
  const noModel=evaluateAgentJourney({...ready,enabledModelCount:0})
  assert.equal(noModel.canTry,false)
  assert.ok(noModel.resourceIssues.some(x=>x.includes("模型")))
  const noResources=evaluateAgentJourney({...ready,toolStatusOf:()=> "pending"})
  assert.equal(noResources.canTry,false)
  assert.ok(noResources.resourceIssues.some(x=>x.includes("工具")))
  const good=evaluateAgentJourney(ready)
  assert.deepEqual(good,{planIssues:[],resourceIssues:[],qualityIssues:[],
    canTry:true,canPublish:false})
})
test("journey only unlocks publish after an authorized successful run of the saved revision",()=>{
  const succeed={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z"}
  assert.equal(evaluateAgentJourney({...ready,run:succeed}).canPublish,true)
  for(const bad of [
    {...succeed,status:"failed"},
    {...succeed,status:"awaiting_approval"},
    {...succeed,spec_id:"another-owner-spec"},
    {...succeed,created:"2026-10-15T00:00:00Z"},
  ]) assert.equal(evaluateAgentJourney({...ready,run:bad}).canPublish,false)
  assert.equal(evaluateAgentJourney({...ready,dirty:true,run:succeed}).canPublish,false)
  assert.equal(evaluateAgentJourney({...ready,modelState:"unavailable",run:succeed}).canPublish,false)
})
test("journey catches missing completion criteria and missing knowledge authorization",()=>{
  const faulty={...spec,done_criteria:[],knowledge_base_ids:["private-knowledge"]}
  const state=evaluateAgentJourney({...ready,spec:faulty})
  assert.equal(state.canTry,false)
  assert.ok(state.planIssues.some(x=>x.includes("完成标准")))
  assert.ok(state.resourceIssues.some(x=>x.includes("知识库")))
})

test("deterministic result assertions are bounded and do not claim factual verification",()=>{
  const checks=normalizeAgentQualityChecks([
    {type:"contains",expected:"  结论  "},
    {type:"not_contains",expected:"未经授权"},
    {type:"json_object",expected:""},
    {type:"system_eval",expected:"always-pass"},
    ...Array.from({length:20},(_,i)=>({type:"contains",expected:"x"+i})),
  ])
  assert.equal(checks.length,12)
  assert.equal(checks[0].expected,"结论")
  assert.ok(checks.every(c=>["contains","not_contains","json_object"].includes(c.type)))
  const results=evaluateAgentQualityChecks('{"结论":"通过"}',checks.slice(0,3))
  assert.deepEqual(results.map(r=>r.passed),[true,true,true])
  const failures=evaluateAgentQualityChecks("未经授权",checks.slice(0,3))
  assert.deepEqual(failures.map(r=>r.passed),[false,false,false])
  assert.equal(evaluateAgentQualityChecks("[]",[{type:"json_object",expected:""}])[0].passed,false)
})
test("publish with configured quality assertions must verify actual owner-scoped output",()=>{
  const checked={...spec,quality_checks:[{type:"contains",expected:"研究结论"},
    {type:"not_contains",expected:"拒绝审核"}]}
  const run={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z"}
  const absent=evaluateAgentJourney({...ready,spec:checked,run})
  assert.equal(absent.canPublish,false)
  assert.ok(absent.qualityIssues.some(x=>x.includes("真实结果")))
  const bad=evaluateAgentJourney({...ready,spec:checked,run:{...run,result:"暂无报告"}})
  assert.equal(bad.canPublish,false)
  assert.ok(bad.qualityIssues.some(x=>x.includes("未通过")))
  const good=evaluateAgentJourney({...ready,spec:checked,run:{...run,result:"研究结论：依据公开来源"}})
  assert.equal(good.canPublish,true)
  assert.deepEqual(good.qualityIssues,[])
  assert.equal(evaluateAgentJourney({...ready,spec:checked,run:{...run,result:"研究结论 拒绝审核"}}).canPublish,false)
})
