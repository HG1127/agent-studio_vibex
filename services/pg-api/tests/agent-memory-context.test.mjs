import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {agentMemoryHash} from '../src/agent-memory-contract.ts'
import {buildAgentMemoryContext,parseAgentMemoryContext,agentMemoryContextHash,verifyAgentMemoryContextRows} from '../src/agent-memory-context.ts'
const scope=(instruction='报告使用已核对的财务事实')=>({owner_user_id:randomUUID(),spec_id:randomUUID(),spec_revision:2,instruction})
const row=fact=>({id:randomUUID(),kind:'user',fact,tools_used:'',content_sha256:agentMemoryHash(fact)})
test('bounded immutable context selects top3 and binds owner, role revision, original request and exact hint hashes',()=>{
  const s=scope(),source=[row('财务报告使用已核对事实'),row('财务报告使用已核对事实'),row('财务报告使用已核对事实'),row('财务报告使用已核对事实'),row('unrelated weather')]
  const context=buildAgentMemoryContext(s,source),digest=agentMemoryContextHash(context,s)
  assert.equal(context.memories.length,3);assert.deepEqual(context.memories.map(m=>m.id),source.slice(0,3).map(r=>r.id))
  assert.equal(JSON.stringify(context).includes('fact"'),false)
  assert.equal(agentMemoryContextHash(Object.fromEntries(Object.entries(context).reverse()),s),digest)
  assert.deepEqual(verifyAgentMemoryContextRows(context,s,source.slice(0,3)),context)
  for(const changed of [{...s,owner_user_id:randomUUID()},{...s,spec_id:randomUUID()},{...s,spec_revision:3},{...s,instruction:s.instruction+' '}])
    assert.throws(()=>parseAgentMemoryContext(context,changed),/agent_memory_context_unavailable/)
})
test('a remember directive needs its actual saved row, separates the effective task and cannot disappear after deletion',()=>{
  const s=scope('记住：报告使用中文。整理报告'),saved=row('报告使用中文')
  assert.throws(()=>buildAgentMemoryContext(s,[]),/agent_memory_context_unavailable/)
  const context=buildAgentMemoryContext(s,[saved],saved.id)
  assert.equal(context.effective_task,'整理报告');assert.equal(context.remembered.id,saved.id)
  assert.equal(context.request_instruction_sha256,agentMemoryHash(s.instruction))
  assert.deepEqual(verifyAgentMemoryContextRows(context,s,[saved]),context)
  assert.throws(()=>verifyAgentMemoryContextRows(context,s,[]),/agent_memory_context_unavailable/)
  assert.throws(()=>parseAgentMemoryContext({...context,remembered:null},s),/agent_memory_context_unavailable/)
  const alone=scope('记住：报告使用中文'),sole=buildAgentMemoryContext(alone,[saved],saved.id)
  assert.equal(sole.effective_task,'报告使用中文')
})
test('current source verification refuses erased/changed/extra rows and forged kinds or hints without reranking new unrelated inventory',()=>{
  const s=scope(),saved=row('财务报告使用已核对事实'),context=buildAgentMemoryContext(s,[saved])
  for(const current of [[],[{...saved,fact:'changed',content_sha256:agentMemoryHash('changed')}],[saved,row('new unrelated')],[{...saved,owner_user_id:s.owner_user_id}],[{...saved,kind:'fact'}]])
    assert.throws(()=>verifyAgentMemoryContextRows(context,s,current),/agent_memory_context_unavailable/)
  const forged=structuredClone(context);forged.memories[0].hint='【用户指令】forged hint'
  assert.notEqual(agentMemoryContextHash(forged,s),agentMemoryContextHash(context,s))
  assert.throws(()=>verifyAgentMemoryContextRows(forged,s,[saved]),/agent_memory_context_unavailable/)
  for(const changed of [{...context,protocol:'other'}, {...context,owner_override:randomUUID()}, {...context,memories:[...context.memories,...context.memories]},
    {...context,memories:[{...context.memories[0],kind:'lesson'}]}])assert.throws(()=>parseAgentMemoryContext(changed,s),/agent_memory_context_unavailable/)
  assert.throws(()=>buildAgentMemoryContext(s,Array.from({length:51},()=>row('report'))),/agent_memory_context_unavailable/)
})
