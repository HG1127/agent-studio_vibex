// Business contracts for the human/resource loop. Live form, network and
// persistence coverage lives in agent-review.chrome.mjs (part of the E2E gate).
import test from 'node:test'
import assert from 'node:assert/strict'
import {evaluateAgentJourney} from '../src/lib/agentCreateJourney.ts'
import {resolveAgentToolRequirements,prepareGeneratedAgentPermissions} from '../src/lib/agentToolMatcher.ts'
import {getVerifiedMarketTools} from '../src/lib/marketToolSelection.ts'
import {buildAgentCapabilityPlan,agentCapabilityReadiness} from '../src/lib/agentCapabilityPlan.ts'
import {createAgentResourceHandoff,isMatchingAgentResourceHandoff} from '../src/lib/agentResourceHandoff.ts'
import {agentResourceSetupUrl} from '../src/lib/toolSearchPrivacy.ts'
const id='abcdefghijklmno',saved=Date.parse('2026-10-30T08:00:00Z')
const spec={goal:'汇总已授权的内部资料',task_scope:'仅使用员工已授权资料',tools:[],task_plan:['读取资料','提交审核'],deliverables:['可核验的结论'],done_criteria:['结论有证据'],require_plan_review:true}
const run=(status='succeeded',patch={})=>({spec_id:id,status,created:'2026-10-30T08:01:00Z',result:'已审核的研究结论',spec_snapshot:structuredClone(spec),...patch})
const journey=(patch={})=>evaluateAgentJourney({spec,specName:'内部助手',savedId:id,dirty:false,enabledModelCount:1,modelState:'ready',toolStatusOf:()=> 'ready',accessibleKnowledgeBaseIds:[],lastSavedAt:saved,runState:'ready',...patch})

test('pending human input and tool approval remain waiting even when the model claims success',()=>{
 for(const status of ['awaiting_input','awaiting_approval']){const value=journey({run:run(status)});assert.equal(value.trial.state,'waiting');assert.equal(value.canPublish,false);assert.equal(value.trial.action,'view')}
 for(const status of ['running','queued']){const value=journey({run:run(status)});assert.equal(value.trial.state,'running');assert.equal(value.canPublish,false)}
})
test('approval does not certify a changed plan, a missing snapshot or an unchecked refresh',()=>{
 assert.equal(journey({run:run()}).canPublish,true)
 for(const patch of [{spec:{...spec,require_plan_review:false}},{spec:{...spec,tools:['web_search']}},{run:run('succeeded',{spec_snapshot:null})},{dirty:true},{runState:'checking'},{runState:'unavailable'}])assert.equal(journey({run:run(),...patch}).canPublish,false)
})
test('successful output cannot override lost model or knowledge access',()=>{
 assert.equal(journey({enabledModelCount:0,run:run()}).canTry,false)
 assert.equal(journey({modelState:'unavailable',run:run()}).canPublish,false)
 const linked={...spec,knowledge_base_ids:['revoked-kb']};assert.equal(journey({spec:linked,run:run('succeeded',{spec_snapshot:linked})}).canPublish,false)
})
test('resource return signals carry only the original record and capability, and expire',()=>{
 const signal=createAgentResourceHandoff(id,'lookup',100000);assert.ok(signal);assert.equal(isMatchingAgentResourceHandoff(signal,id,['lookup'],100001),true);assert.equal(isMatchingAgentResourceHandoff(signal,'otheragent00000',['lookup'],100001),false);assert.equal(isMatchingAgentResourceHandoff(signal,id,['other'],100001),false);assert.equal(isMatchingAgentResourceHandoff(signal,id,['lookup'],500001),false)
 const url=agentResourceSetupUrl('/tool-connections',id,'lookup');assert.ok(url.includes(id));assert.ok(!url.includes('goal='));assert.ok(!url.includes('prompt='))
})
test('a newly unprobed or disabled tool invalidates resource readiness rather than retaining a cached green label',()=>{
 const connection={id,title:'Documents',enabled:true,last_probe_status:'ok',tool_count:1,tools:[{name:'pdf_extract',description:'Extract PDF text',read_only:true,destructive:false}]};const tools=getVerifiedMarketTools([connection]);const need={id:'pdf',title:'读取 PDF',purpose:'提取页码证据',kind:'document',access:'read',required:true,role_ids:[],search_terms:[],suggested_tool_ids:[tools[0].id]};const plan={...spec,tools:[tools[0].id],capability_requirements:[need]};assert.deepEqual(agentCapabilityReadiness(plan,null,[],tools),[])
 for(const next of [{...connection,enabled:false},{...connection,last_probe_status:'untested'}]){const current=getVerifiedMarketTools([next]);assert.equal(current.length,0);assert.ok(agentCapabilityReadiness(plan,null,[],current).length>0)}
})
test('model-proposed tools cannot override denied resources or pre-grant write roles',()=>{
 const tool={id:'mkt__abcdefghijklmno__gmail_send',name:'gmail_send',label:'Gmail',description:'Send email',connectionTitle:'Gmail',readOnly:true,destructive:false};const proposed={...spec,tools:[tool.id],roles:[{id:'sender',tools:[tool.id]}],capability_requirements:[{id:'send',kind:'integration',access:'write',required:true}]};const selection=resolveAgentToolRequirements('禁止使用 Gmail',proposed,[],[tool]);const prepared=prepareGeneratedAgentPermissions(proposed,selection);assert.ok(!prepared.tools.includes(tool.id));assert.ok(prepared.tools.includes('knowledge_search'));assert.deepEqual(prepared.roles[0].tools,[]);assert.equal(prepared.require_approval,true);assert.ok(selection.excluded.some(row=>row.id===tool.id))
})
test('a falsely read-only sender cannot satisfy an approved read-only capability',()=>{
 const tool={id:'mkt__abcdefghijklmno__pdf_delete',name:'pdf_delete',label:'PDF',description:'Delete PDF documents',connectionTitle:'Documents',readOnly:true,destructive:false};const plan={...spec,tools:[tool.id],capability_requirements:[{id:'pdf',title:'读取 PDF',purpose:'只提取内容',kind:'document',access:'read',required:true,role_ids:[],search_terms:[],suggested_tool_ids:[tool.id]}]};assert.equal(buildAgentCapabilityPlan(plan,null,[],[tool])[0].state,'missing')
})
