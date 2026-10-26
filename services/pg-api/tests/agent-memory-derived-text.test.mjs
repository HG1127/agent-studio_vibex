import test from 'node:test'
import assert from 'node:assert/strict'
import {successfulMemoryFallback,failedMemoryLesson,feedbackMemoryLesson,memoryRefinementInput} from '../src/agent-memory-derived-text.ts'

test('derived text fallback and model projection retain bounded source wording and redact before clipping',()=>{
  const secrets='sk-syntheticMemoryKey123 Bearer syntheticBearer token=syntheticToken api_key=syntheticApi'
  const result='文'.repeat(495)+secrets
  const fallback=successfulMemoryFallback(result,['calculate','calculate','summarize'])
  assert.equal(fallback.kind,'fact');assert.equal(fallback.fact.length,500);assert.equal(fallback.tools_used,'calculate,summarize')
  assert.equal(fallback.fact,'文'.repeat(495)+'*** B')
  assert.equal(successfulMemoryFallback(' \n ',[]),null)
  const input=memoryRefinementInput('任'.repeat(601),'果'.repeat(1501),['calculate','calculate'])
  assert.deepEqual(input,{instruction:'任'.repeat(600),result:'果'.repeat(1500),tools_used:'calculate'})
  const safe=JSON.stringify(memoryRefinementInput(secrets,secrets,['calculate']))
  for(const value of ['syntheticMemoryKey123','syntheticBearer','syntheticToken','syntheticApi'])assert.equal(safe.includes(value),false)
  assert.equal(Object.hasOwn(input,'paid_execution_approved'),false)
})

test('failure and negative feedback remain separate lesson sources; cancellation and positive feedback add no lesson',()=>{
  const error='token=syntheticToken'
  assert.deepEqual(failedMemoryLesson('failed','财务报告',error),{kind:'lesson',fact:'教训：财务报告 → token=***',tools_used:''})
  assert.equal(failedMemoryLesson('cancelled','财务报告',''),null)
  assert.equal(feedbackMemoryLesson('up','财务报告',[],''),null)
  assert.deepEqual(feedbackMemoryLesson('down','财务报告',['事实错误','需复核'],'api_key=syntheticKey'),{kind:'lesson',fact:'用户反馈：财务报告 → 事实错误、需复核 api_key=***',tools_used:''})
  assert.ok(failedMemoryLesson('failed','文'.repeat(2000),'错'.repeat(1000)).fact.length<=500)
  assert.ok(feedbackMemoryLesson('down','文'.repeat(2000),Array(8).fill('标'.repeat(20)),'评'.repeat(500)).fact.length<=500)
  for(const run of [()=>failedMemoryLesson('succeeded','',''),()=>feedbackMemoryLesson('down','',Array(9).fill('tag'),''),
    ()=>feedbackMemoryLesson('down','',['x'.repeat(21)],''),()=>memoryRefinementInput('x'.repeat(2001),'',[]),
    ()=>successfulMemoryFallback('x'.repeat(20001),[]),()=>successfulMemoryFallback('good',['bad\nname']),()=>successfulMemoryFallback('good',{})])
    assert.throws(run,e=>e.code==='invalid_agent_memory_derived_text')
})
