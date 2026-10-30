// Pure value decoding/capacity only. No real source, DB identity or fee proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAgentDesignModelJson,parseAgentDesignModelOutput,parseAgentDesignEditableFields,agentDesignMaxModelJsonBytes,AgentDesignValueError} from '../src/agent-design-value-contract.ts'
const output=()=>({name:'设计助手',goal:'完成目标',task_scope:'本次范围',deliverables:['完整交付物'],tools:['需要另行连接的能力'],task_plan:['执行步骤'],done_criteria:['验收标准']})
test('all seven original model fields survive JSON and one complete JSON fence',()=>{
  const value=output();assert.deepEqual(parseAgentDesignModelJson(JSON.stringify(value)),value)
  assert.deepEqual(parseAgentDesignModelJson('```json\n'+JSON.stringify(value)+'\n```'),value)
  for(const key of Object.keys(value)){const missing={...value};delete missing[key];assert.throws(()=>parseAgentDesignModelOutput(missing),AgentDesignValueError)}
})
test('full native descriptive capacity, including escapedUnicode, is accepted without truncation',()=>{
  const value={name:'名'.repeat(120),goal:'目'.repeat(3000),task_scope:'域'.repeat(4000),deliverables:Array(30).fill('交'.repeat(500)),
    task_plan:Array(30).fill('步'.repeat(500)),done_criteria:Array(30).fill('标'.repeat(500)),tools:Array(20).fill('能'.repeat(300))}
  const escaped=JSON.stringify(value).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))
  assert.ok(new TextEncoder().encode(escaped).length<agentDesignMaxModelJsonBytes);assert.deepEqual(parseAgentDesignModelJson(escaped),value)
})
test('oversized fields/lists and malformed Unicode/control values are rejected, never sliced',()=>{
  for(const extra of [{name:'n'.repeat(121)},{goal:'g'.repeat(3001)},{task_scope:'s'.repeat(4001)},
    {deliverables:Array(31).fill('x')},{task_plan:['x'.repeat(501)]},{tools:Array(21).fill('x')},{tools:['x'.repeat(301)]},
    {goal:'\ud800'},{name:'bad\0'},{goal:'\u000b'},{goal:'   '}])assert.throws(()=>parseAgentDesignModelOutput({...output(),...extra}),AgentDesignValueError)
})
test('duplicate keys/escaped aliases/trailing prose/BOM and extra grant fields fail closed',()=>{
  for(const text of ['{"name":"x","na\\u006de":"y"}',JSON.stringify({...output(),model_binding:{connection_id:'PRIVATE'}}),
    '说明 '+JSON.stringify(output()),JSON.stringify(output())+' 尾注','\ufeff'+JSON.stringify(output()),'{}{}','```json\n{}\n``` trailing',
    JSON.stringify(output()).replace('"tools":','"tools":[],"tools":')])assert.throws(()=>parseAgentDesignModelJson(text),AgentDesignValueError)
})
test('accessors, symbols, sparse arrays and nonplain output do not execute hidden getters',()=>{
  let called=0;const value=Object.defineProperty(output(),'goal',{enumerable:true,get(){called++;return'x'}})
  assert.throws(()=>parseAgentDesignModelOutput(value));assert.equal(called,0)
  const sparse=[];sparse.length=1
  for(const bad of [Object.assign(output(),{[Symbol('x')]:1}),Object.assign(Object.create({}),output()),{...output(),tools:sparse}])assert.throws(()=>parseAgentDesignModelOutput(bad))
})
test('editable preview is full6 descriptions only and tool advice does not become editable grants',()=>{
  const {tools,...fields}=output();assert.deepEqual(parseAgentDesignEditableFields(fields),fields)
  for(const extra of [{tools},{require_approval:false},{knowledge_base_ids:[]},{budget:200000},{http_tools:[]}])assert.throws(()=>parseAgentDesignEditableFields({...fields,...extra}))
})
