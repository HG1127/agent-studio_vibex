import test from 'node:test'
import assert from 'node:assert/strict'
import {parseOriginalHomeAuthoring} from '../shared/original-home-authoring.ts'
const value=()=>({format:'agentstudio.home-authoring.v1',source:'template',template_key:'research',tool_requirements:['网络搜索','尚未接入的工具','网络搜索']})

test('Home template source and descriptive tool names round trip without execution grants',()=>{
  const input=value(),out=parseOriginalHomeAuthoring(input)
  assert.deepEqual(out,input);assert.deepEqual(Object.keys(out),['format','source','template_key','tool_requirements'])
  input.tool_requirements[0]='changed';assert.equal(out.tool_requirements[0],'网络搜索')
  assert(Object.isFrozen(out));assert(Object.isFrozen(out.tool_requirements));assert(!Object.hasOwn(out,'tools'))
})
test('Home authoring refuses owner, credential and capability injection',()=>{
  for(const key of['owner_user_id','api_key','tools','approved','runtime_authorization'])assert.throws(()=>parseOriginalHomeAuthoring({...value(),[key]:'injected'}))
})
test('Home metadata accessors are rejected without invocation',()=>{
  let calls=0;const raw=value();Object.defineProperty(raw,'source',{enumerable:true,get(){calls++;return 'template'}})
  assert.throws(()=>parseOriginalHomeAuthoring(raw));assert.equal(calls,0)
})
test('Descriptive tool arrays reject accessors, holes and non-JSON properties',()=>{
  let calls=0;const raw=value();Object.defineProperty(raw.tool_requirements,'0',{get(){calls++;return 'calculate'}})
  assert.throws(()=>parseOriginalHomeAuthoring(raw));assert.equal(calls,0)
  assert.throws(()=>parseOriginalHomeAuthoring({...value(),tool_requirements:Array(2)}))
  const tools=['one'];tools[Symbol('hidden')]=true;assert.throws(()=>parseOriginalHomeAuthoring({...value(),tool_requirements:tools}))
})
test('Source markers retain distinct create/template meaning',()=>{
  assert.equal(parseOriginalHomeAuthoring({...value(),source:'create',template_key:''}).source,'create')
  for(const patch of[{source:'create'},{template_key:''},{source:'manual'},{template_key:' research'}])assert.throws(()=>parseOriginalHomeAuthoring({...value(),...patch}))
})
test('Metadata bounds refuse excess input rather than silently truncating',()=>{
  assert.equal(parseOriginalHomeAuthoring({...value(),template_key:'x'.repeat(120),tool_requirements:Array(20).fill('中'.repeat(300))}).tool_requirements.length,20)
  for(const patch of[{template_key:'x'.repeat(121)},{tool_requirements:Array(21).fill('tool')},{tool_requirements:['x'.repeat(301)]},{tool_requirements:['a\u0000b']},{tool_requirements:['  ']}])assert.throws(()=>parseOriginalHomeAuthoring({...value(),...patch}))
})
