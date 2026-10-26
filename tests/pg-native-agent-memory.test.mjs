import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
import {agentMemoryChoice,agentMemoryReceipt,agentMemoryPage} from '../src/lib/pgNativeAgentMemory.ts'
const hash=s=>createHash('sha256').update(s).digest('hex')
const choice=()=>({action:'remember',request_id:randomUUID(),spec_id:randomUUID(),expected_revision:1,fact:'report token=syntheticMemorySecret',confirm:true})
const response=(c,extra={})=>({request_id:c.request_id,memory_id:c.action==='remember'?c.request_id:c.memory_id,spec_id:c.spec_id,action:c.action,content_sha256:c.action==='remember'?hash('report token=***'):c.expected_sha256,recorded:true,replayed:false,...extra})
test('memory SDK binds exact sanitized content, original action and confirm-only recovery before accepting a receipt',async()=>{
  const c=choice();assert.equal((await agentMemoryReceipt(response(c),c)).recorded,true)
  for(const changed of [response(c,{memory_id:randomUUID()}),response(c,{content_sha256:hash(c.fact)}),response(c,{action:'forget'}),response(c,{fact:'unexpected body'}),response(c,{recorded:'true'})])
    await assert.rejects(agentMemoryReceipt(changed,c),/invalid_agent_memory_projection/)
  await assert.rejects(agentMemoryReceipt(response(c),c,true),/invalid_agent_memory_projection/)
  assert.equal((await agentMemoryReceipt(response(c,{replayed:true}),c,true)).replayed,true)
  for(const bad of [{...c,owner_user_id:randomUUID()},{...c,confirm:false},{...c,fact:'😀'.repeat(251)},{...c,expected_revision:NaN}])assert.throws(()=>agentMemoryChoice(bad))
})
test('memory inventory projection refuses private fields, mixed kinds, duplicated ids, unmasked secrets and foreign roles',async()=>{
  const c=choice(),item={id:c.request_id,kind:'user',fact:'report token=***',content_sha256:hash('report token=***'),created_at:'2026-10-26T10:00:00.000Z',tools_used:'',run_id:null}
  const page={spec_id:c.spec_id,limit:50,items:[item]}
  assert.equal((await agentMemoryPage(page,c.spec_id)).items.length,1)
  for(const bad of [{...page,owner_user_id:randomUUID()},{...page,spec_id:randomUUID()},{...page,items:[item,item]},{...page,items:[{...item,kind:'fact'}]},
    {...page,items:[{...item,fact:c.fact,content_sha256:hash(c.fact)}]},{...page,items:[{...item,tools_used:'private tool'}]},{...page,items:[{...item,run_id:randomUUID()}]}])
    await assert.rejects(agentMemoryPage(bad,c.spec_id),/invalid_agent_memory_projection/)
})
test('memory transport uses same-origin Cookie and CSRF, performs one write, and queries only the original receipt after a lost reply',async()=>{
  const c=choice(),seen=[]
  const api=createPgNativePilotApi(async(path,options)=>{
    seen.push({path,options})
    assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.headers['X-AgentStudio-Request'],'1')
    assert.equal(options.headers.Authorization,undefined);assert.deepEqual(JSON.parse(options.body),c)
    if(path.endsWith('/change'))throw Error('synthetic response lost after commit')
    return Response.json(response(c,{replayed:true}))
  })
  await assert.rejects(api.changeAgentMemory(c),e=>e.status===0)
  assert.equal(seen.length,1)
  const recovered=await api.confirmAgentMemory(c);assert.equal(recovered.replayed,true)
  assert.deepEqual(seen.map(r=>r.path),['/__pg_native/api/v2/agent-memories/change','/__pg_native/api/v2/agent-memories/confirm'])
  await assert.rejects(api.changeAgentMemory({...c,owner_user_id:randomUUID()}),e=>e.status===400);assert.equal(seen.length,2)
})
