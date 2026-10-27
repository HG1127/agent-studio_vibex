import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryDerivedRepository} from '../src/agent-memory-derived-repository.ts'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {createHandler} from '../src/http.ts'
import {createPgNativePilotApi} from '../../../src/lib/pgNativePilotApi.ts'

test('derived HTTP uses verified Cookie/CSRF and separate write scope; lost saves/erasure recover read-only without replaying execution',async()=>{
  const f=await agentMemoryFixture();let server,handler,enabled=false,calls=0
  try{
    await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'))
    const role=f.resources.alice.spec,owned=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true})
    const source=await owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,instruction:'Synthetic source-bound report',idempotency_key:'synthetic-derived-http-source'})
    await f.privateTls(async()=>{calls++;return JSON.stringify({action:'answer',answer:'Reusable report token=syntheticDerivedHttpSecret'})},async make=>{assert.equal((await f.drive(()=>make({humanInputApproved:true}),source.run.id)).run.status,'succeeded')})
    const auth=new NativeAuthRepository(f.pool)
    server=createServer((req,res)=>{void handler(req,res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const origin='http://127.0.0.1:'+server.address().port,path='/api/v2/agent-derived-memories/change'
    const configure=()=>{
      let business
      const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:true,allowAgentDerivedMemory:true,allowAgentDerivedMemoryWrites:enabled,businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:true,agentDerivedMemoryUat:enabled})){
          res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
        }return business(req,res)
      }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('Cookie required')},authenticateRequest:native.authenticateRequest,repository:f.agents,agentDerivedMemoryRepository:new AgentMemoryDerivedRepository(f.pool,{allowWrites:enabled})})
      handler=native.handler
    };configure()
    const call=async(route,{cookie,body,csrf=true,extra={}}={})=>{
      const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
      return {status:response.status,headers:response.headers,body:await response.json()}
    }
    const login=async(email,password)=>{const response=await call('/api/native-auth/login',{body:{email,password}});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0]}
    const alice=await login('synthetic-admin@example.test','SyntheticServiceAdmin#2026'),bob=await login('collaborator@example.test','SyntheticCollaborator#2026')
    const client=(cookie,lose='')=>createPgNativePilotApi(async(route,options)=>{
      const response=await fetch(origin+route,{...options,headers:{...options.headers,Origin:origin,Cookie:cookie}})
      if(route===lose&&response.ok){await response.arrayBuffer();throw Error('synthetic derived committed response lost')}return response
    },'')
    const api=client(alice),foreign=client(bob),preview=await api.previewAgentDerivedMemory(role.id,source.run.id)
    assert.equal(preview.fact,'Reusable report token=***');assert.equal((await api.getConfigCapabilities()).agent_derived_memory_writes_enabled,false)
    const save={action:'save_success',request_id:randomUUID(),spec_id:role.id,source_run_id:source.run.id,expected_source_sha256:preview.source_sha256,confirm:true}
    await assert.rejects(api.changeAgentDerivedMemory(save),e=>e.status===405)
    enabled=true;configure();assert.equal((await api.getConfigCapabilities()).agent_derived_memory_writes_enabled,true)
    assert.equal((await call(path,{body:save,extra:{'X-Rh-User-Id':f.users.alice}})).status,401)
    assert.equal((await call(path,{cookie:alice,body:save,csrf:false})).status,403)
    assert.equal((await call(path,{cookie:alice,body:save,extra:{Origin:'https://foreign.invalid'}})).status,403)
    assert.equal((await call(path,{cookie:bob,body:save,extra:{'X-Rh-User-Id':f.users.alice}})).status,404)
    assert.equal((await call(path,{cookie:alice,body:{...save,owner_user_id:f.users.bob}})).status,400)
    await assert.rejects(foreign.previewAgentDerivedMemory(role.id,source.run.id),e=>e.status===404)
    for(const query of ['?spec_id='+role.id+'&spec_id='+role.id,'/preview?spec_id='+role.id+'&run_id='+source.run.id+'&run_id='+source.run.id])assert.equal((await call('/api/v2/agent-derived-memories'+query,{cookie:alice})).status,400)
    const counts=async()=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0],before=await counts()
    await assert.rejects(client(alice,path).changeAgentDerivedMemory(save),e=>e.status===0)
    enabled=false;configure();const saved=await api.confirmAgentDerivedMemory(save);assert.equal(saved.replayed,true)
    await assert.rejects(foreign.confirmAgentDerivedMemory(save),e=>e.status===404)
    assert.equal((await api.listAgentDerivedMemories(role.id)).items[0].source_current,true)
    await f.db.query('UPDATE agentstudio.agent_specs SET revision=revision+1 WHERE id=$1',[role.id])
    const hidden=(await api.listAgentDerivedMemories(role.id)).items[0];assert.equal(hidden.source_current,false);assert.equal(hidden.fact,null)
    const forget={action:'forget',request_id:randomUUID(),spec_id:role.id,memory_id:saved.memory_id,expected_content_sha256:saved.content_sha256,expected_tools_sha256:saved.tools_sha256,confirm:true}
    enabled=true;configure();await assert.rejects(client(alice,path).changeAgentDerivedMemory(forget),e=>e.status===0)
    enabled=false;configure();assert.equal((await api.confirmAgentDerivedMemory(forget)).replayed,true);assert.equal((await api.confirmAgentDerivedMemory(save)).replayed,true)
    assert.equal((await api.listAgentDerivedMemories(role.id)).items.length,0);assert.equal(calls,1);assert.deepEqual(await counts(),before)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_derived_entries')).rows[0].n,0)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_memory_derived_receipts')).rows[0].n,2)
    await call('/api/native-auth/logout',{cookie:alice,body:{}});await assert.rejects(api.listAgentDerivedMemories(role.id),e=>e.status===401)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close()}
})
