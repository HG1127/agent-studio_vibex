import test from "node:test"
import assert from "node:assert/strict"
import {
  STUDIO_WORKSPACES, workspacesForRole, routesForRole,
  workspaceForPath, searchStudioRoutes,
} from "../src/lib/studioNavigation.ts"
import { evaluateAgentJourney,agentPlanContentIssues } from "../src/lib/agentCreateJourney.ts"
import {shouldShowTaskComposer,needsLocalDevice,defaultRunView} from "../src/lib/taskExperience.ts"
import {getRunGuidance} from "../src/lib/agentRunGuidance.ts"
import {invocationViewKey,isInvocationViewCurrent} from "../src/lib/invocationViewKey.ts"
import {resolveToolHubView} from "../src/lib/toolHubView.ts"
import {scheduleState,scheduleTimingKey,buildScheduleTiming,filterSchedules,schedulePage} from '../src/lib/scheduleWorkspace.ts'
import {knowledgeView,selectedKnowledgeId,visibleKnowledgeDocuments} from '../src/lib/knowledgeWorkspace.ts'
import { normalizeAgentQualityChecks, evaluateAgentQualityChecks } from "../src/lib/agentQualityChecks.ts"
import {AGENT_DRAFT_TTL_MS,agentDraftKey,saveAgentDraft,readAgentDraft,
  clearAgentDraft,normalizeAgentDraft} from "../src/lib/agentEditorDraft.ts"
import {
  registerUnsavedWorkCheck, hasUnsavedWork, shouldNavigateFromUnsavedWork,
  recoverHistoryOffset, isSameEditorRoute,
} from "../src/lib/unsavedNavigation.ts"

test('schedule timing identity ignores name and irrelevant controls, not meaningful time changes',()=>{
  const f={name:'A',recurrence_kind:'daily',time_zone:'Asia/Singapore',start_date:'2026-11-01',local_time:'09:00',weekday:1,interval_minutes:60}
  assert.equal(scheduleTimingKey(f),scheduleTimingKey({...f,name:'B',weekday:5,interval_minutes:180}))
  assert.notEqual(scheduleTimingKey(f),scheduleTimingKey({...f,local_time:'10:00'}))
  assert.notEqual(scheduleTimingKey({...f,recurrence_kind:'interval'}),scheduleTimingKey({...f,recurrence_kind:'interval',interval_minutes:180}))
  assert.notEqual(scheduleTimingKey({...f,recurrence_kind:'weekly'}),scheduleTimingKey({...f,recurrence_kind:'weekly',weekday:2}))
})
test('schedule timing preview rejects past single runs and skipped local DST times',()=>{
  const f={recurrence_kind:'once',time_zone:'Asia/Singapore',start_date:'2026-11-01',local_time:'09:00',weekday:1,interval_minutes:60}
  const now=Date.parse('2026-10-31T00:00:00Z')
  assert.equal(buildScheduleTiming(f,now).nextAt,Date.parse('2026-11-01T01:00:00Z'))
  assert.throws(()=>buildScheduleTiming(f,Date.parse('2026-11-02T00:00:00Z')),/晚于/)
  assert.throws(()=>buildScheduleTiming({...f,time_zone:'Invalid/zone'},now),/时区/)
  assert.throws(()=>buildScheduleTiming({...f,time_zone:'America/New_York',start_date:'2026-03-08',local_time:'02:30'},Date.parse('2026-03-07T00:00:00Z')),/夏令时/)
})
test('schedule list distinguishes paused from ended one-shot plans and filters without mutation',()=>{
  const rows=[{name:'Alpha',instruction:'研究财报',target_kind:'agent',enabled:true,recurrence_kind:'daily',next_at_ms:10},
    {name:'Beta',instruction:'系统检查',target_kind:'workflow',enabled:false,recurrence_kind:'daily',next_at_ms:10},
    {name:'Gamma',instruction:'结束不等于成功',target_kind:'agent',enabled:false,recurrence_kind:'once',next_at_ms:0}]
  const before=JSON.stringify(rows)
  assert.equal(scheduleState(rows[2]),'completed')
  assert.deepEqual(filterSchedules(rows,'ALPHA','active','agent'),[rows[0]])
  assert.deepEqual(filterSchedules(rows,'','paused','all'),[rows[1]])
  assert.equal(JSON.stringify(rows),before)
})
test('schedule URL pagination is bounded and ignores malformed pages',()=>{
  for(const p of [null,'','0','-3','1.5','1e4','1000000','bad'])assert.equal(schedulePage(p),1)
  assert.equal(schedulePage('3'),3)
})

test('knowledge workspace preserves the selected library and does not escalate shared settings',()=>{
  const rows=[{id:'a'},{id:'b'}]
  assert.equal(selectedKnowledgeId(rows,''),'a')
  assert.equal(selectedKnowledgeId(rows,'b'),'b')
  assert.equal(selectedKnowledgeId(rows,'private-unavailable'),'')
  assert.equal(knowledgeView('settings',false),'documents')
  assert.equal(knowledgeView('settings',true),'settings')
  assert.equal(knowledgeView('sharing',false),'sharing')
  assert.equal(knowledgeView('bogus',true),'documents')
  const docs=[{filename:'Report-A.txt'},{filename:'资料-B.md'}]
  assert.deepEqual(visibleKnowledgeDocuments(docs,'REPORT'),[docs[0]])
  assert.equal(isSameEditorRoute('/knowledge-bases?base=a&view=documents','/knowledge-bases?base=a&view=search'),true)
  assert.equal(isSameEditorRoute('/knowledge-bases?base=a','/knowledge-bases?base=b'),false)
})

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

test("tool diagnostics subroutes have one canonical view, including old deep links",()=>{
  for(const v of ["devices","debug","activity","monitor"])
    assert.equal(resolveToolHubView(v),v)
  for(const v of [null,"","bad","connections","../../admin"])
    assert.equal(resolveToolHubView(v),"devices")
})

test("history display never projects old rows under a different filter, owner, run or page",()=>{
  const original=invocationViewKey("employee-a","run123456789012","calculate","","","",1)
  assert.equal(isInvocationViewCurrent(original,original),true)
  assert.equal(isInvocationViewCurrent(original,""),false)
  for(const changed of [
    ["employee-b","run123456789012","calculate","","","",1],
    ["employee-a","other_run1234567","calculate","","","",1],
    ["employee-a","run123456789012","web_fetch","","","",1],
    ["employee-a","run123456789012","calculate","v2","","",1],
    ["employee-a","run123456789012","calculate","","failed","",1],
    ["employee-a","run123456789012","calculate","","","agent_run",1],
    ["employee-a","run123456789012","calculate","","","",2],
  ]){
    assert.equal(isInvocationViewCurrent(invocationViewKey(...changed),original),false)
  }
})

test("run guidance selects a real next action without implying success means accepted quality",()=>{
  const base={hasAgent:false,hasModel:false,resourcesLoading:false,
    readinessIssues:[],hasTask:false,canStart:false}
  assert.equal(getRunGuidance(base).action,"create")
  assert.equal(getRunGuidance({...base,hasAgent:true}).action,"connect-model")
  assert.equal(getRunGuidance({...base,hasAgent:true,hasModel:true,resourcesLoading:true}).action,"configure")
  assert.equal(getRunGuidance({...base,hasAgent:true,hasModel:true,readinessIssues:["角色未绑定"]}).action,"configure")
  assert.match(getRunGuidance({...base,hasAgent:true,hasModel:true,readinessIssues:["Skill 未审核"]}).detail,/Skill/)
  assert.equal(getRunGuidance({...base,hasAgent:true,hasModel:true}).action,"focus-task")
  assert.equal(getRunGuidance({...base,hasAgent:true,hasModel:true,hasTask:true,canStart:true}).action,"focus-run")
  assert.equal(getRunGuidance({...base,status:"awaiting_approval"}).action,"respond")
  assert.equal(getRunGuidance({...base,status:"awaiting_input"}).action,"respond")
  assert.equal(getRunGuidance({...base,status:"paused"}).action,"trace")
  assert.equal(getRunGuidance({...base,isStarting:true}).action,"wait")
  assert.equal(getRunGuidance({...base,status:"awaiting_approval",isStarting:true}).action,"wait")
  assert.equal(getRunGuidance({...base,status:"failed"}).action,"trace")
  const done=getRunGuidance({...base,status:"succeeded"})
  assert.equal(done.action,"results")
  assert.match(done.detail,/不代表内容已通过质量验收/)
  assert.equal(done.steps[3],true)
})

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
    "工作台","设计与编排","工具与连接","运行与验收","管理中心",
  ])
  const leaves=routesForRole("admin")
  assert.equal(new Set(leaves.map(x=>x.to)).size,leaves.length)
  assert.equal(workspaceForPath("/agent-create","employee")?.label,"设计与编排")
  assert.equal(workspaceForPath("/workflow-canvas","employee")?.label,"设计与编排")
  assert.equal(workspaceForPath("/knowledge-bases","employee")?.label,"工具与连接")
  assert.equal(workspaceForPath("/execution-connections","employee")?.label,"工具与连接")
  assert.equal(workspaceForPath("/tool-hub","employee")?.label,"工具与连接")
  assert.equal(workspaceForPath("/tool-connections","employee")?.label,"工具与连接")
  assert.equal(routesForRole("employee").some(route=>route.to==="/tool-connections"),false,
    "HTTP connection configuration remains reachable as an execution-resource drilldown")
  assert.equal(searchStudioRoutes("工具连接","employee")[0].to,"/execution-connections")
  assert.equal(workspaceForPath("/harness","employee")?.label,"运行与验收")
  assert.equal(routesForRole("employee").some(route=>route.to==="/harness"),false,
    "advanced monitor is one drilldown, not a duplicate main navigation item")
  assert.equal(routesForRole("employee").some(route=>route.to==="/tool-hub"),false,
    "tool diagnosis belongs inside the unified execution-resource workspace")
  assert.equal(workspaceForPath("/scheduled-tasks","employee")?.label,"运行与验收")
})
test("navigation hides staff and management destinations from employee UI including Ctrl+K",()=>{
  assert.equal(workspacesForRole("employee").length,4)
  const employeePaths=routesForRole("employee").map(x=>x.to)
  for(const path of ["/staff","/manager"])
    assert.equal(employeePaths.includes(path),false)
  assert.equal(workspaceForPath("/staff","employee"),undefined)
  assert.ok(employeePaths.includes("/internal-overview"),"personal task API is owner-scoped, not company-wide")
  assert.ok(employeePaths.includes("/approvals"),"employees can delegate only their own task steps")
  assert.equal(workspaceForPath("/account","employee")?.label,"工作台")
  assert.equal(workspaceForPath("/internal-overview","employee")?.label,"工作台")
  assert.equal(searchStudioRoutes("员工权限","employee").some(x=>x.to==="/staff"),false)
  assert.equal(searchStudioRoutes("员工","admin").some(x=>x.to==="/staff"),true)
  assert.equal(searchStudioRoutes("工作流","employee")[0].to,"/workflow-canvas")
  assert.equal(searchStudioRoutes("Agent","employee").some(x=>x.to==="/agent-create"),true)
})
test("save-and-continue validates content without removing saved revision gates",()=>{
  assert.deepEqual(agentPlanContentIssues(spec,"测试 Agent"),[])
  assert.ok(agentPlanContentIssues({...spec,done_criteria:[]},"测试 Agent").length)
  assert.ok(agentPlanContentIssues(spec,"").length)
  assert.ok(agentPlanContentIssues(null,"测试 Agent").length)
  assert.equal(evaluateAgentJourney({...ready,savedId:""}).canTry,false)
  assert.equal(evaluateAgentJourney({...ready,dirty:true}).canTry,false)
})
test("task presentation hides irrelevant launch controls, not permissions",()=>{
  assert.equal(shouldShowTaskComposer(false,false),false)
  assert.equal(shouldShowTaskComposer(true,false),true)
  assert.equal(shouldShowTaskComposer(true,true),false)
  assert.equal(needsLocalDevice(["calculate"],""),false)
  assert.equal(needsLocalDevice(["local_computer"],""),true)
  assert.equal(needsLocalDevice([],"explicit-device"),true)
  for(const state of ["running","queued","awaiting_input","awaiting_approval"])
    assert.equal(defaultRunView(state),"process")
  for(const state of [undefined,"succeeded","failed","cancelled"])
    assert.equal(defaultRunView(state),"results")
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
  assert.deepEqual(good.planIssues,[])
  assert.deepEqual(good.resourceIssues,[])
  assert.deepEqual(good.qualityIssues,[])
  assert.equal(good.canTry,true)
  assert.equal(good.canPublish,false)
  assert.equal(good.trial.state,"untried")
  assert.ok(good.trialIssues.length>0)
})
test("journey only unlocks publish after an authorized successful run of the saved revision",()=>{
  const succeed={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z",spec_snapshot:spec}
  assert.equal(evaluateAgentJourney({...ready,run:succeed}).canPublish,true)
  for(const bad of [
    {...succeed,status:"failed"},
    {...succeed,status:"awaiting_approval"},
    {...succeed,spec_id:"another-owner-spec"},
    {...succeed,created:"2026-10-15T00:00:00Z"},
    {...succeed,spec_snapshot:undefined},
    {...succeed,spec_snapshot:{...spec,roles:[{id:"changed_after_run"}]}},
    {...succeed,spec_snapshot:{...spec,capability_requirements:[{id:"changed_after_run"}]}},
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

test("trial presentation and publish gate agree after saved goal, role or capability changes",()=>{
  const run={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z",spec_snapshot:spec}
  for(const changed of [
    {...spec,goal:"改为研究另一行业"},
    {...spec,roles:[{id:"researcher",name:"研究员",responsibility:"研究",tasks:["研究"],inputs:[],
      deliverables:["报告"],done_criteria:["有来源"],depends_on:[],tools:[]}]},
    {...spec,capability_requirements:[{id:"research",description:"搜索资料",kind:"tool"}]},
  ]){
    const state=evaluateAgentJourney({...ready,spec:changed,run})
    assert.equal(state.canPublish,false)
    assert.equal(state.canTry,true,"saved valid edits remain runnable")
    assert.deepEqual(state.qualityIssues,[],"trial evidence has its own blocker even without assertions")
    assert.equal(state.trial.state,"stale")
    assert.equal(state.trial.action,"retry")
    assert.match(state.trial.label,/旧版本.*重新试跑/)
    assert.ok(state.trialIssues.length>0,"sidebar must explain blocked continuation even without quality assertions")
  }
  assert.deepEqual(run.spec_snapshot,spec,"evaluation preserves original frozen evidence")
})

test("trial states retain original run recovery and give an actionable next step",()=>{
  const run={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z",spec_snapshot:spec}
  for(const [status,state,action] of [
    ["queued","running","view"],["running","running","view"],
    ["awaiting_approval","waiting","view"],["awaiting_input","waiting","view"],
    ["failed","failed","retry"],["cancelled","failed","retry"],["aborted","failed","retry"],
    ["unexpected","unknown","view"],
  ]){
    const output=evaluateAgentJourney({...ready,run:{...run,status}})
    assert.equal(output.trial.state,state)
    assert.equal(output.trial.action,action)
    assert.equal(output.canPublish,false)
    assert.ok(output.trialIssues.length>0)
  }
  for(const runState of ["checking","unavailable"]){
    const output=evaluateAgentJourney({...ready,run,runState})
    assert.equal(output.canPublish,false,"cached success cannot override an unverified refresh")
    assert.equal(output.trial.state,runState)
    assert.equal(output.trial.action,"refresh")
  }
  const unsaved=evaluateAgentJourney({...ready,run,dirty:true})
  assert.equal(unsaved.trial.state,"unsaved")
  assert.equal(unsaved.trial.action,"save")
  for(const spec_snapshot of [undefined,null,"{}",[],{}]){
    const output=evaluateAgentJourney({...ready,run:{...run,spec_snapshot}})
    assert.equal(output.canPublish,false)
    assert.equal(output.trial.state,"unproven")
    assert.ok(output.trialIssues.length>0)
    assert.equal(output.trial.action,"retry")
  }
  assert.equal(evaluateAgentJourney({...ready,run:{...run,spec_id:"other"}}).trial.state,"untried")
})

test("trial uses full content evidence across timestamp formats and precision boundaries",()=>{
  const run={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:00:00Z",spec_snapshot:spec}
  const reordered=Object.fromEntries(Object.entries(spec).reverse())
  for(const created of ["2026-10-16 00:00:00.000Z","2026-10-16T08:00:00+08:00",
    "2026-10-15T23:59:59.500Z"]){
    const output=evaluateAgentJourney({...ready,run:{...run,created,spec_snapshot:reordered}})
    assert.equal(output.canPublish,true)
    assert.equal(output.trial.state,"ready")
    assert.deepEqual(output.trialIssues,[])
    assert.match(output.trial.detail,/不代表内容质量已验证/)
    const mismatch=evaluateAgentJourney({...ready,run:{...run,created,spec_snapshot:{...spec,goal:"changed"}}})
    assert.equal(mismatch.canPublish,false,"same instant is insufficient when complete content differs")
    assert.equal(mismatch.trial.state,"stale")
  }
  for(const created of ["invalid","2026-10-15T23:59:58Z"]){
    const output=evaluateAgentJourney({...ready,run:{...run,created}})
    assert.equal(output.canPublish,false)
    assert.equal(output.trial.state,"unproven")
  }
  for(const lastSavedAt of [undefined,NaN,0]){
    assert.equal(evaluateAgentJourney({...ready,lastSavedAt,run}).canPublish,false)
  }
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
  const run={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z",spec_snapshot:checked}
  const absent=evaluateAgentJourney({...ready,spec:checked,run})
  assert.equal(absent.canPublish,false)
  assert.ok(absent.qualityIssues.some(x=>x.includes("真实结果")))
  const bad=evaluateAgentJourney({...ready,spec:checked,run:{...run,result:"暂无报告"}})
  assert.equal(bad.canPublish,false)
  assert.equal(bad.trial.state,"quality_blocked")
  assert.ok(bad.trialIssues.length>0)
  assert.ok(bad.qualityIssues.some(x=>x.includes("未通过")))
  const good=evaluateAgentJourney({...ready,spec:checked,run:{...run,result:"研究结论：依据公开来源"}})
  assert.equal(good.canPublish,true)
  assert.equal(good.trial.state,"ready")
  assert.deepEqual(good.qualityIssues,[])
  assert.equal(evaluateAgentJourney({...ready,spec:checked,run:{...run,result:"研究结论 拒绝审核"}}).canPublish,false)
})

test("resource failures do not mislabel verified passing output assertions as a failed trial",()=>{
  const checked={...spec,quality_checks:[{type:"contains",expected:"研究结论"}]}
  const run={spec_id:ready.savedId,status:"succeeded",created:"2026-10-16T00:02:00Z",spec_snapshot:checked,result:"研究结论：依据公开来源"}
  for(const modelState of ["loading","unavailable"]){
    const state=evaluateAgentJourney({...ready,spec:checked,run,modelState})
    assert.equal(state.canTry,false)
    assert.equal(state.canPublish,false,"a verified result never bypasses unavailable resources")
    assert.equal(state.trial.state,"blocked")
    assert.ok(state.resourceIssues.length>0)
    assert.deepEqual(state.qualityIssues,[],"the existing real output passes its configured assertion")
    assert.match(state.trial.detail,/方案与资源/)
  }
})
