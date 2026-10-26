import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createPgNativeMemorySession} from '../src/lib/pgNativeAgentMemorySession.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
const role=()=>({id:randomUUID(),name:'本人角色',revision:3})
const item=()=>({id:randomUUID(),kind:'user',fact:'财务报告使用中文',content_sha256:'a'.repeat(64),created_at:'2026-10-26T10:00:00Z',tools_used:'',run_id:null})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const ready=async(api,r=role())=>{const session=createPgNativeMemorySession(api);session.setActive(true);session.setWritable(true);await session.select(r);return session}
test('memory session retains one exact intent after lost reply, hides its plaintext and recovers with writes revoked',async()=>{
  const r=role(),saved=item(),seen=[];let list=[]
  const s=await ready({listAgentMemories:async()=>({spec_id:r.id,items:list,limit:50}),changeAgentMemory:async body=>{seen.push(structuredClone(body));list=[saved];throw new PgNativePilotError(0,'lost')},confirmAgentMemory:async body=>{assert.deepEqual(body,seen[0]);return {recorded:true}}},r)
  await s.remember('private preference',false);assert.equal(seen.length,0)
  await s.remember('private preference',true);assert.equal(seen.length,1);assert.equal(s.snapshot().pending.action,'remember')
  assert.equal(JSON.stringify(s.snapshot()).includes('private preference'),false)
  await s.select(role());assert.equal(s.snapshot().role.id,r.id)
  await s.remember('replacement request',true);assert.equal(seen.length,1)
  s.setWritable(false);await s.retrySameRequest();assert.equal(seen.length,1)
  await s.confirm();assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().items[0].id,saved.id)
})
test('memory selection retains only role metadata and does not copy private bindings into page state',async()=>{
  const r={...role(),spec:{model_binding:{private:'must not enter memory selection'}}}
  const s=await ready({listAgentMemories:async()=>({spec_id:r.id,items:[],limit:50}),changeAgentMemory:async()=>({recorded:true}),confirmAgentMemory:async()=>({recorded:true})},r)
  assert.deepEqual(Object.keys(s.snapshot().role).sort(),['id','name','revision'])
  assert.equal(JSON.stringify(s.snapshot()).includes('must not enter memory selection'),false)
})
test('forget requires explicit confirmation and binds the selected content hash; a missing receipt never silently sends a replacement',async()=>{
  const r=role(),entry=item(),seen=[];let list=[entry],confirmCalls=0
  const s=await ready({listAgentMemories:async()=>({spec_id:r.id,items:list,limit:50}),changeAgentMemory:async body=>{seen.push(structuredClone(body));if(seen.length===1)throw new PgNativePilotError(0,'lost');list=[];return {recorded:true}},confirmAgentMemory:async()=>{confirmCalls++;throw new PgNativePilotError(404,'agent_memory_receipt_not_found')}},r)
  await s.forget(entry.id,false);assert.equal(seen.length,0)
  await s.forget(entry.id,true);const original=seen[0]
  assert.equal(original.expected_sha256,entry.content_sha256);assert.equal(original.memory_id,entry.id)
  await s.confirm();assert.equal(confirmCalls,1);assert.equal(seen.length,1);assert.equal(s.snapshot().pending.action,'forget')
  await s.retrySameRequest();assert.equal(seen.length,2);assert.deepEqual(seen[1],original)
  assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().items.length,0)
})
test('inactive navigation and disposal fence late facts, while an unknown request can only resume in its original session',async()=>{
  const r=role(),read=deferred();let next=false
  const s=createPgNativeMemorySession({listAgentMemories:async()=>next?{spec_id:r.id,items:[],limit:50}:read.promise,changeAgentMemory:async()=>{throw new PgNativePilotError(0,'lost')},confirmAgentMemory:async()=>({recorded:true})})
  s.setActive(true);s.setWritable(true);const selected=s.select(r);s.setActive(false)
  read.resolve({spec_id:r.id,items:[item()],limit:50});await selected
  assert.equal(s.snapshot().items.length,0);assert.equal(s.snapshot().role,null)
  next=true;s.setActive(true);await s.select(r);await s.remember('never persist to browser storage',true)
  s.setActive(false);assert.equal(s.snapshot().pending,null)
  s.setActive(true);assert.equal(s.snapshot().pending.action,'remember')
  s.dispose();assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().role,null)
  await s.confirm();assert.equal(s.snapshot().pending,null)
})
test('logout clears private intent and a late mutation response cannot publish data into a new employee session',async()=>{
  const r=role(),mutation=deferred();let expired=0
  const api={listAgentMemories:async()=>({spec_id:r.id,items:[],limit:50}),changeAgentMemory:async()=>mutation.promise,confirmAgentMemory:async()=>{throw new PgNativePilotError(401,'invalid_token')}}
  const s=await ready(api,r),run=s.remember('private owner text',true);s.dispose();mutation.resolve({recorded:true});await run
  assert.equal(s.snapshot().notice,'');assert.equal(s.snapshot().pending,null)
  const next=createPgNativeMemorySession({...api,changeAgentMemory:async()=>{throw new PgNativePilotError(0,'lost')}},{onExpired:()=>{expired++}})
  next.setActive(true);next.setWritable(true);await next.select(r);await next.remember('private',true);await next.confirm()
  assert.equal(expired,1);assert.equal(next.snapshot().role,null);assert.equal(next.snapshot().pending,null)
})
