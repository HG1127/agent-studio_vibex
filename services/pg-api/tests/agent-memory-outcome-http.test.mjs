import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {AgentMemoryOutcomeRepository} from '../src/agent-memory-outcome-repository.ts'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {createHandler} from '../src/http.ts'

test('outcome HTTP verifies Cookie/CSRF and owner, freezes admission replay and recovers a lost privacy stop after write scope is disabled',async()=>{
  const f=await agentMemoryFixture();let server,handler,enabled=false,calls=0
  try{
    await f.db.exec(f.sql('migrations/pg_v9_051_agent_memory_derived.sql'));await f.db.exec(f.sql('migrations/pg_v9_052_agent_memory_outcome.sql'))
    const role=f.resources.alice.spec,auth=new NativeAuthRepository(f.pool)
    server=createServer((req,res)=>{void handler(req,res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const origin='http://127.0.0.1:'+server.address().port,submit='/api/v2/agent-specs/'+role.id+'/autonomous-runs'
    const configure=()=>{
      let business
      const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:enabled,allowAutonomousAgentSubmission:true,allowAgentDerivedMemoryWrites:enabled,allowAgentOutcomeMemory:true,allowAgentOutcomeMemoryAdmission:enabled,businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:true,autonomousAgentUat:true,agentOutcomeMemoryUat:enabled})){
          res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
        }return business(req,res)
      }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('Cookie required')},authenticateRequest:native.authenticateRequest,repository:f.agents,
        autonomousAgentRunRepository:new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true,allowOutcomeMemory:enabled}),agentOutcomeMemoryRepository:new AgentMemoryOutcomeRepository(f.pool)})
      handler=native.handler
    };configure()
    const call=async(route,{cookie,body,csrf=true,extra={},lose=false}={})=>{
      const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
      const value=await response.json();if(lose&&response.ok)throw Error('synthetic committed stop response lost')
      return {status:response.status,headers:response.headers,body:value}
    }
    const login=async(email,password)=>{const response=await call('/api/native-auth/login',{body:{email,password}});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0]}
    const alice=await login('synthetic-admin@example.test','SyntheticServiceAdmin#2026'),bob=await login('collaborator@example.test','SyntheticCollaborator#2026')
    const raw={expected_revision:role.revision,max_steps:1,instruction:'Synthetic bounded outcome task',idempotency_key:'synthetic-outcome-http-'+randomUUID(),remember_outcome:true}
    assert.equal((await call('/api/native-auth/capabilities',{cookie:alice})).body.agent_outcome_memory_admission_enabled,false)
    assert.equal((await call(submit,{cookie:alice,body:raw})).status,403)
    enabled=true;configure();assert.equal((await call('/api/native-auth/capabilities',{cookie:alice})).body.agent_outcome_memory_admission_enabled,true)
    const started=await call(submit,{cookie:alice,body:raw});assert.equal(started.status,201);const id=started.body.run.id,base='/api/v2/agent-outcome-memories/'+id
    const state=(await call(base,{cookie:alice})).body;assert.equal(state.enabled,true);assert.equal(state.state,'pending');assert.equal(state.intent_sha256,started.body.outcome_memory.intent_sha256)
    const choice={request_id:randomUUID(),run_id:id,expected_intent_sha256:state.intent_sha256,confirm:true}
    assert.equal((await call(base,{extra:{'X-Rh-User-Id':f.users.alice,Authorization:'Bearer synthetic'}})).status,401)
    assert.equal((await call(base,{cookie:bob,extra:{'X-Rh-User-Id':f.users.alice}})).status,404)
    assert.equal((await call(base+'?owner_user_id='+f.users.alice,{cookie:alice})).status,400)
    assert.equal((await call(base+'/stop',{cookie:alice,body:choice,csrf:false})).status,403)
    assert.equal((await call(base+'/stop',{cookie:alice,body:choice,extra:{Origin:'https://foreign.invalid'}})).status,403)
    assert.equal((await call(base+'/stop',{cookie:bob,body:choice})).status,404)
    assert.equal((await call(base+'/stop',{cookie:alice,body:{...choice,owner_user_id:f.users.bob}})).status,400)
    assert.equal((await call(base+'/stop',{cookie:alice,body:{...choice,run_id:randomUUID()}})).status,400)
    await assert.rejects(call(base+'/stop',{cookie:alice,body:choice,lose:true}),/committed stop response lost/)
    enabled=false;configure()
    const confirmed=await call(base+'/stop-confirm',{cookie:alice,body:choice});assert.equal(confirmed.status,200);assert.equal(confirmed.body.replayed,true);assert.equal(confirmed.body.stopped,true)
    assert.equal((await call(base+'/stop-confirm',{cookie:bob,body:choice})).status,404)
    const replay=await call(submit,{cookie:alice,body:raw});assert.equal(replay.status,200);assert.equal(replay.body.replayed,true)
    assert.equal((await call(submit,{cookie:alice,body:{...raw,remember_outcome:false}})).status,409)
    await f.privateTls(async()=>{calls++;return JSON.stringify({action:'answer',answer:'Synthetic terminal report'})},async make=>{assert.equal((await f.drive(()=>make({humanInputApproved:true,outcomeMemoryApproved:true}),id)).run.status,'succeeded')})
    const final=await call(base,{cookie:alice});assert.equal(final.body.result.decision,'revoked');assert.equal(calls,1)
    const counts=(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_memory_outcome_stops)::integer AS stops,(SELECT count(*) FROM agentstudio.agent_memory_outcome_results)::integer AS results,(SELECT count(*) FROM agentstudio.agent_memory_derived_entries)::integer AS entries,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    assert.equal(counts.stops,1);assert.equal(counts.results,1);assert.equal(counts.entries,0);assert.equal(counts.jobs,1);assert.equal(counts.effects,1)
    await call('/api/native-auth/logout',{cookie:alice,body:{}});assert.equal((await call(base,{cookie:alice})).status,401)
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close()}
})
