import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveAgentToolRequirements} from '../src/lib/agentToolMatcher.ts'
import {roleSkillSummary,roleSkillDetail,createOriginalRoleApi} from '../src/lib/originalRoleApi.ts'
import {createOriginalHomeAgentApi} from '../src/lib/originalHomeAgentApi.ts'
const employee='00000001-1111-4111-8111-111111111111',specId='00000002-1111-4111-8111-111111111111'
const spec=(tools=[])=>({goal:'原任务',task_scope:'owned',task_plan:[],deliverables:[],done_criteria:[],tools,knowledge_base_ids:[],require_approval:true})
const response=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}})
const summary=()=>({id:'abc123abc123abc',name:'分析方法',description:'方法说明',source_url:'',active:true,latest_version:2,approved_version:1,approved_hash:'a'.repeat(64),updated_ms:1730000000000})
const detail=()=>({id:'abc123abc123abc',name:'分析方法',description:'方法说明',content:'逐项核对',source_url:'',version:2,hash:'b'.repeat(64),active:true,approved:false})
const home=()=>({id:specId,owner_user_id:employee,name:'原助手',revision:3,spec:spec(['calculate']),created_at:'2026-11-03T00:00:00Z',updated_at:'2026-11-03T01:00:00Z',authoring:null})

test('real resolver excludes forbidden builtin despite model and explicit prior selections',()=>{
 const r=resolveAgentToolRequirements('禁止使用计算器；不要联网',spec(['calculate','web_search']),[],[],['calculate','web_search'])
 assert.deepEqual(r.resolvedTools,[]);assert.deepEqual(r.safeAutoBindings,[])
 assert.ok(r.excluded.some(v=>v.id==='calculate'));assert.ok(r.excluded.some(v=>v.id==='web_search'))
 assert.equal(new Set(r.excluded.map(v=>v.id)).size,r.excluded.length)
})
test('real resolver excludes forbidden connected resources through ID and human label aliases',()=>{
 const http={name:'http_orders',display_name:'订单接口',description:'查询订单',method:'GET',status:'ok'}
 const market={id:'mkt__gmail__search',name:'gmail_search',label:'Gmail',connectionTitle:'Gmail',description:'search mail',readOnly:true,destructive:false}
 const r=resolveAgentToolRequirements('不要使用订单接口；禁止使用 Gmail',spec([http.name,market.id]),[http],[market],[http.name,market.id])
 assert.deepEqual(r.resolvedTools,[]);assert.deepEqual(r.gaps,[])
 assert.deepEqual(new Set(r.excluded.map(v=>v.id)),new Set([http.name,market.id]))
})
test('mutating name prevents auto authorization despite readOnly or GET metadata',()=>{
 const market={id:'mkt__gmail__send',name:'gmail_send',label:'Gmail send',connectionTitle:'Gmail',description:'send email',readOnly:true,destructive:false}
 const http={name:'http_delete_order',display_name:'删除订单',description:'delete order',method:'GET',status:'ok'}
 const r=resolveAgentToolRequirements('发送邮件并删除订单',spec([market.id,http.name]),[http],[market])
 assert.deepEqual(r.safeAutoBindings,[]);assert.deepEqual(r.resolvedTools,[])
 assert.equal(r.recommendations.length,2);assert.ok(r.recommendations.every(v=>v.status==='needs_confirmation'))
 const chosen=resolveAgentToolRequirements('发送邮件并删除订单',spec([market.id,http.name]),[http],[market],[market.id,http.name])
 assert.deepEqual(chosen.resolvedTools,[market.id,http.name]);assert.deepEqual(chosen.safeAutoBindings,[])
})
test('Root available builtin catalog and business capability survive accepted UI algorithm merge',()=>{
 const allowed=new Set(['calculate']),r=resolveAgentToolRequirements('结构化事实并计算金额',spec(['business_record_write','calculate']),[],[],['business_record_write'],allowed)
 assert.deepEqual(r.resolvedTools,['calculate']);assert.ok(!r.recommendations.some(v=>v.id==='business_record_write'))
 const business=resolveAgentToolRequirements('结构化事实',spec(['business_record_write']))
 assert.ok(business.resolvedTools.includes('business_record_write'));assert.equal(business.excluded,undefined)
})
test('verified HTTP read retains display name and exact executable binding',()=>{
 const http={name:'http_orders',display_name:'订单接口',description:'读取订单',method:'GET',status:'ok'}
 const r=resolveAgentToolRequirements('读取订单',spec([http.name]),[http])
 assert.deepEqual(r.resolvedTools,[http.name]);assert.equal(r.recommendations[0].label,'订单接口');assert.equal(r.excluded,undefined)
})
test('validated Skill DTOs are explicit independent values and preserve all reviewed fields',()=>{
 const s=summary(),d=detail(),a=roleSkillSummary(s),b=roleSkillDetail(d)
 assert.deepEqual(a,s);assert.deepEqual(b,d);assert.notEqual(a,s);assert.notEqual(b,d)
 for(const raw of [{...s,latest_version:'2'},{...s,approved_hash:''},{...s,active:1},{...s,extra:true}])assert.throws(()=>roleSkillSummary(raw),/response_invalid/)
 for(const raw of [{...d,version:'2'},{...d,content:'\uD800'},{...d,approved:'false'}])assert.throws(()=>roleSkillDetail(raw),/response_invalid/)
})
test('Skill DTO rejects accessor without invoking it and null Response body fails closed',async()=>{
 let calls=0;const s=summary();Object.defineProperty(s,'name',{enumerable:true,get(){calls++;throw Error('executed')}})
 assert.throws(()=>roleSkillSummary(s),/response_invalid/);assert.equal(calls,0)
 const api=createOriginalRoleApi({employeeId:employee,storage:null,transport:async()=>new Response(null,{headers:{'content-type':'application/json'}})})
 await assert.rejects(()=>api.list(),/response_invalid/)
})
test('Home GET constructs fully validated owner DTO and rejects foreign scope or malformed field',async()=>{
 const good=home(),api=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({item:good})}),saved=await api.get(specId)
 assert.deepEqual(saved,good)
 for(const raw of [{...home(),owner_user_id:specId},{...home(),revision:'3'},{...home(),id:employee},{...home(),created_at:3},{...home(),updated_at:'bad-date'},{...home(),extra:true}]){
  const client=createOriginalHomeAgentApi({employeeId:employee,transport:async()=>response({item:raw})})
  await assert.rejects(()=>client.get(specId),/invalid_original_home_response/)
 }
})
