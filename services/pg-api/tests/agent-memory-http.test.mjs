import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {agentFixture} from './helpers/workflow-v2-agent-fixture.mjs'
import {AgentMemoryRepository} from '../src/agent-memory-repository.ts'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {createHandler} from '../src/http.ts'
import {createPgNativePilotApi} from '../../../src/lib/pgNativePilotApi.ts'

test('manual memory uses verified Native Cookie/Origin/CSRF; lost save and forget recover after write opt-out without resending',async()=>{
  const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true});let server,handler,enabled=true
  try{
    await f.db.exec(f.sql('migrations/pg_v9_049_agent_memory.sql'))
    const auth=new NativeAuthRepository(f.pool)
    server=createServer((req,res)=>{void handler(req,res)})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
    const configure=()=>{
      let business
      const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:enabled,allowAgentMemory:true,businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:enabled})){
          res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
        }return business(req,res)
      }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('Cookie required')},authenticateRequest:native.authenticateRequest,repository:f.agents,
        agentMemoryRepository:new AgentMemoryRepository(f.pool,{allowWrites:enabled})})
      handler=native.handler
    };configure()
    const call=async(path,{cookie,body,csrf=true,extra={}}={})=>{
      const result=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
      return {status:result.status,headers:result.headers,body:await result.json()}
    }
    const login=async(email,password)=>{const r=await call('/api/native-auth/login',{body:{email,password}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
    const alice=await login('synthetic-admin@example.test','SyntheticServiceAdmin#2026'),bob=await login('collaborator@example.test','SyntheticCollaborator#2026')
    const makeClient=(cookie,lose='')=>createPgNativePilotApi(async(path,options)=>{
      const result=await fetch(origin+path,{...options,headers:{...options.headers,Origin:origin,Cookie:cookie}})
      if(path===lose&&result.ok){await result.arrayBuffer();throw Error('synthetic successful reply lost')}
      return result
    },'')
    const api=makeClient(alice),foreign=makeClient(bob),role=f.resources.alice.spec
    const body={action:'remember',request_id:randomUUID(),spec_id:role.id,expected_revision:role.revision,fact:'report token=syntheticMemorySecret',confirm:true},path='/api/v2/agent-memories/change'
    assert.equal((await api.getConfigCapabilities()).agent_memory_writes_enabled,true)
    assert.equal((await call(path,{body,extra:{'X-Rh-User-Id':f.users.alice}})).status,401)
    assert.equal((await call(path,{cookie:alice,body,csrf:false})).status,403)
    assert.equal((await call(path,{cookie:alice,body,extra:{Origin:'https://foreign.invalid'}})).status,403)
    assert.equal((await call(path,{cookie:bob,body,extra:{'X-Rh-User-Id':f.users.alice}})).status,404)
    assert.equal((await call(path,{cookie:alice,body:{...body,owner_user_id:f.users.bob}})).status,400)
    await assert.rejects(foreign.listAgentMemories(role.id),e=>e.status===404)
    assert.equal((await call('/api/v2/agent-memories?spec_id='+role.id+'&spec_id='+role.id,{cookie:alice})).status,400)
    await assert.rejects(makeClient(alice,path).changeAgentMemory(body),e=>e.status===0)
    enabled=false;configure()
    assert.equal((await api.getConfigCapabilities()).agent_memory_writes_enabled,false)
    await assert.rejects(api.changeAgentMemory(body),e=>e.status===405)
    const saved=await api.confirmAgentMemory(body);assert.equal(saved.replayed,true)
    const page=await api.listAgentMemories(role.id);assert.equal(page.items.length,1);assert.equal(page.items[0].fact,'report token=***')
    await assert.rejects(foreign.confirmAgentMemory(body),e=>e.status===404)
    enabled=true;configure()
    const forget={action:'forget',request_id:randomUUID(),spec_id:role.id,memory_id:saved.memory_id,expected_sha256:saved.content_sha256,confirm:true}
    await assert.rejects(makeClient(alice,path).changeAgentMemory(forget),e=>e.status===0)
    enabled=false;configure()
    assert.equal((await api.confirmAgentMemory(forget)).replayed,true)
    assert.equal((await api.confirmAgentMemory(body)).replayed,true)
    assert.equal((await api.listAgentMemories(role.id)).items.length,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_receipts')).rows[0].n,2)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
    await call('/api/native-auth/logout',{cookie:alice,body:{}})
    await assert.rejects(api.listAgentMemories(role.id),e=>e.status===401)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close()}
})
