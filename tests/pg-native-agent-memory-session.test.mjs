import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createPgNativeMemorySession} from '../src/lib/pgNativeAgentMemorySession.ts'
import {createPgNativeDerivedMemorySession} from '../src/lib/pgNativeAgentDerivedMemorySession.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
const role=()=>({id:randomUUID(),name:'本人角色',revision:3})
const item=()=>({id:randomUUID(),kind:'user',fact:'财务报告使用中文',content_sha256:'a'.repeat(64),created_at:'2026-10-26T10:00:00Z',tools_used:'',run_id:null})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const ready=async(api,r=role())=>{const session=createPgNativeMemorySession(api);session.setActive(true);session.setWritable(true);await session.select(r);return session}

const derivedFixture=()=>{
  const r=role(),run=randomUUID(),preview={spec_id:r.id,run_id:run,kind:'fact',source_sha256:'a'.repeat(64),fact:'private source report',tools_used:'calculate',content_sha256:'b'.repeat(64),tools_sha256:'c'.repeat(64)}
  const entry={...preview,id:randomUUID(),created_at:'2026-10-26T10:00:00Z',source_current:true}
  return {r,run,preview,entry,api:{listAgentDerivedMemories:async()=>({spec_id:r.id,items:[entry],limit:50}),listAutonomousAgentRuns:async()=>[{id:run,agent_spec_id:r.id,status:'succeeded',instruction_preview:'Owned task',private_binding:'never enter view'}],previewAgentDerivedMemory:async()=>preview,changeAgentDerivedMemory:async()=>({recorded:true}),confirmAgentDerivedMemory:async()=>({recorded:true})}}
}
const derivedReady=async f=>{const s=createPgNativeDerivedMemorySession(f.api);s.setActive(true);s.setWritable(true);await s.select({...f.r,private_binding:'never copy role'});return s}

test('derived memory preview is inert; one source intent survives a lost reply and is confirmed with writes revoked',async()=>{
  const f=derivedFixture(),seen=[];f.api.changeAgentDerivedMemory=async body=>{seen.push(structuredClone(body));throw new PgNativePilotError(0,'lost')}
  f.api.confirmAgentDerivedMemory=async body=>{assert.deepEqual(body,seen[0]);return {recorded:true}}
  const s=await derivedReady(f);assert.equal(JSON.stringify(s.snapshot()).includes('never'),false)
  await s.previewRun(f.run);assert.equal(s.snapshot().preview.fact,f.preview.fact);await s.save(false);assert.equal(seen.length,0)
  await s.save(true);assert.equal(seen.length,1);assert.equal(seen[0].expected_source_sha256,f.preview.source_sha256);assert.equal(seen[0].source_run_id,f.run)
  assert.equal(JSON.stringify(s.snapshot()).includes('private source report'),false);assert.equal(Object.hasOwn(seen[0],'fact'),false)
  await s.select(role());await s.save(true);assert.equal(seen.length,1)
  s.setWritable(false);await s.retrySameRequest();assert.equal(seen.length,1);await s.confirm();assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().items[0].id,f.entry.id)
})

test('derived forgetting binds both immutable hashes even after source revocation; missing receipt keeps the exact request',async()=>{
  const f=derivedFixture(),seen=[];f.entry.source_current=false;f.entry.fact=null;f.entry.tools_used=null
  f.api.changeAgentDerivedMemory=async body=>{seen.push(structuredClone(body));if(seen.length===1)throw new PgNativePilotError(0,'lost');return {recorded:true}}
  f.api.confirmAgentDerivedMemory=async()=>{throw new PgNativePilotError(404,'missing')}
  const s=await derivedReady(f);await s.forget(f.entry.id,false);assert.equal(seen.length,0)
  await s.forget(f.entry.id,true);assert.equal(seen[0].expected_content_sha256,f.entry.content_sha256);assert.equal(seen[0].expected_tools_sha256,f.entry.tools_sha256)
  await s.confirm();assert.equal(seen.length,1);assert.equal(s.snapshot().pending.action,'forget')
  await s.retrySameRequest();assert.equal(seen.length,2);assert.deepEqual(seen[0],seen[1]);assert.equal(s.snapshot().pending,null)
})

test('derived navigation fences late previews; changing role keeps only the newly selected owner metadata',async()=>{
  const f=derivedFixture(),read=deferred(),other=role();f.api.previewAgentDerivedMemory=()=>read.promise
  const s=await derivedReady(f),loading=s.previewRun(f.run);s.setActive(false)
  read.resolve(f.preview);await loading;assert.equal(s.snapshot().preview,null);assert.equal(s.snapshot().role,null)
  s.setActive(true);await s.select(other);assert.equal(s.snapshot().role.id,other.id);assert.deepEqual(s.snapshot().runs,[])
  await s.previewRun(f.run);assert.equal(s.snapshot().preview,null)
  await s.select(f.r);f.api.previewAgentDerivedMemory=async()=>f.preview;await s.previewRun(f.run);await s.previewRun('');assert.equal(s.snapshot().preview,null);assert.equal(s.snapshot().selectedRun,'')
})

test('derived logout discards unknown intent and a late write never publishes data into another employee session',async()=>{
  const f=derivedFixture(),write=deferred();let expired=0
  f.api.changeAgentDerivedMemory=()=>write.promise;const s=await derivedReady(f);await s.previewRun(f.run)
  const operation=s.save(true);s.dispose();write.resolve({recorded:true});await operation;assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().notice,'')
  f.api.changeAgentDerivedMemory=async()=>{throw new PgNativePilotError(0,'lost')};f.api.confirmAgentDerivedMemory=async()=>{throw new PgNativePilotError(401,'expired')}
  const next=createPgNativeDerivedMemorySession(f.api,{onExpired:()=>{expired++}});next.setActive(true);next.setWritable(true);await next.select(f.r);await next.previewRun(f.run);await next.save(true);await next.confirm()
  assert.equal(expired,1);assert.equal(next.snapshot().role,null);assert.equal(next.snapshot().pending,null)
})
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
