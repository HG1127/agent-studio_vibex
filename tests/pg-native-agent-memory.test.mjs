import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {createPgNativePilotApi} from '../src/lib/pgNativePilotApi.ts'
import {agentMemoryChoice,agentMemoryReceipt,agentMemoryPage} from '../src/lib/pgNativeAgentMemory.ts'
import {agentDerivedMemoryChoice,agentDerivedMemoryReceipt,agentDerivedMemoryPreview,agentDerivedMemoryPage} from '../src/lib/pgNativeAgentDerivedMemory.ts'
const hash=s=>createHash('sha256').update(s).digest('hex')
const choice=()=>({action:'remember',request_id:randomUUID(),spec_id:randomUUID(),expected_revision:1,fact:'report token=syntheticMemorySecret',confirm:true})
const response=(c,extra={})=>({request_id:c.request_id,memory_id:c.action==='remember'?c.request_id:c.memory_id,spec_id:c.spec_id,action:c.action,content_sha256:c.action==='remember'?hash('report token=***'):c.expected_sha256,recorded:true,replayed:false,...extra})

test('derived SDK accepts only source-bound owner intent and exact original receipts, with no text or fee fields',async()=>{
  const c={action:'save_success',request_id:randomUUID(),spec_id:randomUUID(),source_run_id:randomUUID(),expected_source_sha256:'a'.repeat(64),confirm:true}
  const receipt={request_id:c.request_id,memory_id:c.request_id,spec_id:c.spec_id,source_run_id:c.source_run_id,action:c.action,kind:'fact',source_sha256:c.expected_source_sha256,content_sha256:hash('report'),tools_sha256:hash('calculate'),recorded:true,replayed:false}
  assert.deepEqual(agentDerivedMemoryChoice(c),c);assert.deepEqual(agentDerivedMemoryReceipt(receipt,c),receipt)
  for(const field of ['fact','kind','tools_used','owner_user_id','paid','execute','request_sha256'])assert.throws(()=>agentDerivedMemoryChoice({...c,[field]:'forbidden'}))
  for(const change of [{kind:'lesson'},{source_run_id:randomUUID()},{source_sha256:'f'.repeat(64)},{memory_id:randomUUID()},{fact:'private'},{replayed:'true'}])assert.throws(()=>agentDerivedMemoryReceipt({...receipt,...change},c))
  assert.throws(()=>agentDerivedMemoryReceipt(receipt,c,true));assert.equal(agentDerivedMemoryReceipt({...receipt,replayed:true},c,true).replayed,true)
  const forget={action:'forget',request_id:randomUUID(),spec_id:c.spec_id,memory_id:c.request_id,expected_content_sha256:receipt.content_sha256,expected_tools_sha256:receipt.tools_sha256,confirm:true}
  assert.deepEqual(agentDerivedMemoryChoice(forget),forget);assert.throws(()=>agentDerivedMemoryChoice({...forget,request_id:forget.memory_id}))
  assert.throws(()=>agentDerivedMemoryReceipt({...receipt,request_id:forget.request_id,action:'forget',tools_sha256:'f'.repeat(64)},forget))
})

test('derived previews and lists require exact hashes, safe text and null text after original source revocation',async()=>{
  const spec=randomUUID(),run=randomUUID(),preview={spec_id:spec,run_id:run,kind:'fact',source_sha256:'a'.repeat(64),fact:'report token=***',tools_used:'calculate',content_sha256:hash('report token=***'),tools_sha256:hash('calculate')}
  assert.deepEqual(await agentDerivedMemoryPreview(preview,spec,run),preview)
  const {run_id,spec_id,...rest}=preview,item={...rest,id:randomUUID(),spec_id:spec,run_id:run,created_at:'2026-10-26T10:00:00.000Z',source_current:true},page={spec_id:spec,limit:50,items:[item]}
  assert.equal((await agentDerivedMemoryPage(page,spec)).items[0].fact,preview.fact)
  assert.equal((await agentDerivedMemoryPage({...page,items:[{...item,source_current:false,fact:null,tools_used:null}]},spec)).items[0].fact,null)
  for(const changed of [{...preview,content_sha256:'f'.repeat(64)},{...preview,tools_sha256:'f'.repeat(64)},{...preview,fact:'report token=unmasked',content_sha256:hash('report token=unmasked')},{...preview,private_state:{}},{...preview,spec_id:randomUUID()}])await assert.rejects(agentDerivedMemoryPreview(changed,spec,run))
  for(const items of [[item,item],[{...item,source_current:false}],[{...item,source_current:true,fact:null}],[{...item,owner_user_id:randomUUID()}],[{...item,spec_id:randomUUID()}]])await assert.rejects(agentDerivedMemoryPage({...page,items},spec))
})

test('derived transport writes once, confirms the identical original intent read-only and rejects inconsistent capabilities',async()=>{
  const c={action:'save_failure',request_id:randomUUID(),spec_id:randomUUID(),source_run_id:randomUUID(),expected_source_sha256:'b'.repeat(64),confirm:true},seen=[]
  const receipt={request_id:c.request_id,memory_id:c.request_id,spec_id:c.spec_id,source_run_id:c.source_run_id,action:c.action,kind:'lesson',source_sha256:c.expected_source_sha256,content_sha256:hash('lesson'),tools_sha256:hash(''),recorded:true,replayed:true}
  const api=createPgNativePilotApi(async(path,options)=>{
    seen.push(path);assert.deepEqual(JSON.parse(options.body),c);assert.equal(options.credentials,'same-origin');assert.equal(options.headers['X-AgentStudio-Request'],'1');assert.equal(options.headers.Authorization,undefined)
    if(path.endsWith('/change'))throw Error('synthetic derived reply lost');return Response.json(receipt)
  })
  await assert.rejects(api.changeAgentDerivedMemory(c),e=>e.status===0);assert.equal(seen.length,1)
  assert.equal((await api.confirmAgentDerivedMemory(c)).replayed,true);assert.deepEqual(seen,['/__pg_native/api/v2/agent-derived-memories/change','/__pg_native/api/v2/agent-derived-memories/confirm'])
  await assert.rejects(api.changeAgentDerivedMemory({...c,fact:'forged'}),e=>e.status===400);assert.equal(seen.length,2)
  const base={mode:'native_pg18',config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false,agent_derived_memory_available:true,agent_derived_memory_writes_enabled:true}
  assert.equal((await createPgNativePilotApi(async()=>Response.json(base)).getConfigCapabilities()).agent_derived_memory_writes_enabled,true)
  for(const changed of [{...base,config_writes_enabled:false},{...base,agent_derived_memory_available:false},{...base,agent_derived_memory_writes_enabled:'true'}])await assert.rejects(createPgNativePilotApi(async()=>Response.json(changed)).getConfigCapabilities(),e=>e.code==='invalid_native_capabilities')
})
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
test('memory runtime capability cannot claim execution without current config, owned memory and standalone admission scope',async()=>{
  const base={mode:'native_pg18',config_writes_enabled:true,model_probe_enabled:false,run_execution_enabled:false,autonomous_agent_submission_enabled:true,agent_memory_available:true,agent_memory_writes_enabled:true,agent_memory_runtime_enabled:true}
  const api=value=>createPgNativePilotApi(async()=>Response.json(value))
  assert.equal((await api(base).getConfigCapabilities()).agent_memory_runtime_enabled,true)
  for(const changed of [{...base,agent_memory_available:false},{...base,autonomous_agent_submission_enabled:false},{...base,config_writes_enabled:false},{...base,agent_memory_runtime_enabled:'true'}])
    await assert.rejects(api(changed).getConfigCapabilities(),e=>e.status===503&&e.code==='invalid_native_capabilities')
})
