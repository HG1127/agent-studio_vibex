// Pure proposed contract tests only; no HTTP, SQL or provider calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {parseAgentFeedbackChange} from '../src/agent-feedback-contract.ts'
const submit=()=>({action:'submit',request_id:randomUUID(),spec_id:randomUUID(),run_id:randomUUID(),expected_revision:0,expected_source_sha256:'a'.repeat(64),rating:'down',tags:[' 证据不足 '],comment:' 仅合成反馈 token=syntheticFeedbackSecret ',remember_lesson:true,confirm:true})
const invalid=e=>e.status===400&&e.code==='invalid_agent_feedback_change'

test('a closed employee statement explicitly separates negative-feedback storage from model optimization',()=>{
  const raw=submit(),v=parseAgentFeedbackChange(raw)
  assert.deepEqual(v.tags,['证据不足']);assert.equal(v.comment,'仅合成反馈 token=***');assert.equal(v.remember_lesson,true)
  assert.match(v.request_sha256,/^[a-f0-9]{64}$/);assert.match(v.statement_sha256,/^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(v).includes('syntheticFeedbackSecret'),false);assert.equal(raw.comment.includes('syntheticFeedbackSecret'),true)
  assert.equal(parseAgentFeedbackChange({...raw,remember_lesson:false}).remember_lesson,false)
  assert.equal(parseAgentFeedbackChange({...raw,rating:'up',remember_lesson:false}).rating,'up')
  assert.throws(()=>parseAgentFeedbackChange({...raw,rating:'up'}),invalid)
})

test('original intent survives property ordering but changes in raw private input, source, revision or choice conflict',()=>{
  const raw=submit(),first=parseAgentFeedbackChange(raw)
  assert.equal(parseAgentFeedbackChange(Object.fromEntries(Object.entries(raw).reverse())).request_sha256,first.request_sha256)
  assert.equal(parseAgentFeedbackChange({...raw,run_id:raw.run_id.toUpperCase()}).request_sha256,first.request_sha256)
  const changed=parseAgentFeedbackChange({...raw,comment:raw.comment.replace('syntheticFeedbackSecret','syntheticDifferentSecret')})
  assert.equal(changed.comment,first.comment);assert.equal(changed.statement_sha256,first.statement_sha256);assert.notEqual(changed.request_sha256,first.request_sha256)
  for(const patch of [{expected_revision:1},{expected_source_sha256:'b'.repeat(64)},{remember_lesson:false},{request_id:randomUUID()},{run_id:randomUUID()},{tags:['其他原因']}])assert.notEqual(parseAgentFeedbackChange({...raw,...patch}).request_sha256,first.request_sha256)
})

test('unknown identity, private run claims, paid authority, malformed Unicode, overflow and extra fields are rejected',()=>{
  const raw=submit()
  for(const patch of [{owner_user_id:randomUUID()},{owner_epoch:4},{model_approved:true},{optimization_context:{}},{fact:'invented'},{tools_used:['paid']},{run_status:'failed'},
    {confirm:false},{rating:'cancelled'},{remember_lesson:'true'},{expected_revision:-1},{expected_revision:1.1},{expected_revision:Number.MAX_SAFE_INTEGER},{expected_revision:'0'},
    {expected_source_sha256:'A'.repeat(64)},{tags:['a'.repeat(21)]},{tags:Array(9).fill('a')},{tags:[' ']},{tags:['line\nbreak']},{tags:[null]},{comment:'a'.repeat(501)},{comment:'\ud800'},{comment:'\udc00'},{comment:'\0'},{request_id:'not-a-uuid'}])assert.throws(()=>parseAgentFeedbackChange({...raw,...patch}),invalid)
  const missing={...raw};delete missing.remember_lesson;assert.throws(()=>parseAgentFeedbackChange(missing),invalid)
  assert.throws(()=>parseAgentFeedbackChange({...raw,tags:Array(1)}),invalid)
  const symbol={...raw,[Symbol('extra')]:true};assert.throws(()=>parseAgentFeedbackChange(symbol),invalid)
  assert.throws(()=>parseAgentFeedbackChange(Object.create(raw)),invalid)
  assert.throws(()=>parseAgentFeedbackChange([]),invalid)
  const unicode=parseAgentFeedbackChange({...raw,tags:['😀'.repeat(10)],comment:'😀'.repeat(250)});assert.equal(unicode.comment.length,500)
})

test('feedback erasure and lesson forgetting bind original metadata and cannot supply new source text or fee authority',()=>{
  const raw=submit(),base={request_id:raw.request_id,spec_id:raw.spec_id,run_id:raw.run_id,confirm:true}
  const erase={...base,action:'erase_feedback',expected_revision:2,expected_feedback_sha256:'b'.repeat(64)},forget={...base,action:'forget_lesson',feedback_id:randomUUID(),expected_content_sha256:'c'.repeat(64)}
  assert.equal(parseAgentFeedbackChange(erase).action,'erase_feedback');assert.equal(parseAgentFeedbackChange(forget).action,'forget_lesson')
  assert.notEqual(parseAgentFeedbackChange(erase).request_sha256,parseAgentFeedbackChange(forget).request_sha256)
  for(const choice of [erase,forget]){
    assert.throws(()=>parseAgentFeedbackChange({...choice,expected_source_sha256:raw.expected_source_sha256}),invalid)
    assert.throws(()=>parseAgentFeedbackChange({...choice,remember_lesson:true}),invalid)
    assert.notEqual(parseAgentFeedbackChange({...choice,run_id:randomUUID()}).request_sha256,parseAgentFeedbackChange(choice).request_sha256)
  }
  assert.throws(()=>parseAgentFeedbackChange({...erase,expected_revision:0}),invalid)
  assert.throws(()=>parseAgentFeedbackChange({...forget,feedback_id:forget.request_id}),invalid)
})
