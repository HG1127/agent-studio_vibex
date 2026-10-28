// Pure candidate derivation only. These tests prove no DB grant/save/provider operation.
import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAgentSpec} from '../src/contracts.ts'
import {deriveAgentDesignCandidate,normalizeAgentDesignCompletion,agentDesignResultHash} from '../src/agent-design-result.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),hash='a'.repeat(64)
const result=()=>({name:'新助手',goal:'新目标',task_scope:'新范围',deliverables:['新交付'],task_plan:['新步骤'],done_criteria:['新标准'],tools:['任意建议','mcp_unowned','http_unowned']})
const before=()=>({name:'旧助手',spec:safeAgentSpec({goal:'旧目标',task_scope:'旧范围',tools:['calculate','http_report','mcp_lookup','knowledge_search'],
  http_tools:[{name:'http_report',description:'current private config',connection_id:id(4),connection_revision:2}],mcp_tools:[{name:'mcp_lookup',connection_id:id(5),connection_revision:2,tool_name:'lookup',catalog_sha256:'c'.repeat(64)}],
  knowledge_base_ids:[id(6)],knowledge_retrieval:{mode:'semantic',profile_id:id(7),profile_revision:1,consent_revision:2},model_binding:{connection_id:id(8),connection_revision:2,model_id:'runtime-model'},require_plan_review:true})})
test('new design preserves all descriptions and advisory tools but grants no executable resource or runtime model',()=>{
  const value=deriveAgentDesignCandidate(null,result());assert.equal(value.name,'新助手');assert.equal(value.spec.task_scope,'新范围')
  assert.deepEqual(value.spec.deliverables,['新交付']);assert.deepEqual(value.spec.done_criteria,['新标准']);assert.deepEqual(value.tool_suggestions,result().tools)
  assert.deepEqual(value.spec.tools,[]);assert.deepEqual(value.spec.knowledge_base_ids,[]);assert.equal(value.spec.require_approval,true)
  assert.equal(value.spec.model_binding,undefined);assert.equal(value.authority,false)
})
test('revision changes only name/descriptions, retaining exact model/tools/KB/approval/plan flags',()=>{
  const old=before(),value=deriveAgentDesignCandidate(old,result())
  for(const key of ['tools','http_tools','mcp_tools','knowledge_base_ids','knowledge_retrieval','model_binding','require_approval','require_plan_review'])assert.deepEqual(value.spec[key],old.spec[key])
  assert.equal(value.spec.goal,'新目标');assert.equal(value.spec.task_scope,'新范围');assert.deepEqual(value.spec.task_plan,['新步骤']);assert.equal(value.authority,false)
})
test('explicit editable6 field preview is hashed but cannot inject tools, budget or approval changes',()=>{
  const raw=result(),{tools,...edits}=raw;edits.goal='员工手动修改'
  const value=deriveAgentDesignCandidate(before(),raw,edits);assert.equal(value.edited,true);assert.equal(value.spec.goal,'员工手动修改')
  for(const extra of [{tools},{require_approval:false},{model_binding:null},{budget:999999}])assert.throws(()=>deriveAgentDesignCandidate(before(),raw,{...edits,...extra}))
})
test('malformed and grant-bearing model outputs never become a candidate even if edits would look safe',()=>{
  for(const raw of [{name:'only',goal:'only'},{...result(),http_tools:[]},{...result(),tools:['x'.repeat(301)]}])assert.throws(()=>deriveAgentDesignCandidate(null,raw))
  let called=0;const old=Object.defineProperty(before(),'name',{enumerable:true,get(){called++;return'bad'}})
  assert.throws(()=>deriveAgentDesignCandidate(old,result()));assert.equal(called,0)
})
test('completion normalizes only bounded full JSON and unknown never invents a result or replay permission',()=>{
  const succeeded=normalizeAgentDesignCompletion({status:'succeeded',model_json:JSON.stringify(result())});assert.deepEqual(succeeded.result,result())
  const unknown=normalizeAgentDesignCompletion({status:'unknown',failure_code:'transport_unknown'});assert.deepEqual(unknown,{status:'unknown',failure_code:'transport_unknown'})
  assert.throws(()=>normalizeAgentDesignCompletion({status:'succeeded',result:result()}));assert.throws(()=>normalizeAgentDesignCompletion({status:'unknown',failure_code:'x',retry:true}))
})
test('result hash binds actual purpose/request/input/source/result without making a receipt or accepting review purpose',()=>{
  const original=agentDesignResultHash(id(1),'generate',hash,hash,result())
  for(const args of [[id(2),'generate',hash,hash,result()],[id(1),'revise',hash,hash,result()],[id(1),'generate','b'.repeat(64),hash,result()],
    [id(1),'generate',hash,'b'.repeat(64),result()],[id(1),'generate',hash,hash,{...result(),task_scope:'另一范围'}]])assert.notEqual(agentDesignResultHash(...args),original)
  assert.throws(()=>agentDesignResultHash(id(1),'optimize',hash,hash,result()));assert.match(original,/^[a-f0-9]{64}$/)
})
