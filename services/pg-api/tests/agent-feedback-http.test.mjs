// Synthetic SQL and loopback Native Cookie HTTP only; no model transport.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AgentFeedbackRepository} from '../src/agent-feedback-repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {createHandler} from '../src/http.ts'
async function fixture(){
  const f=await agentMemoryFixture();let handler,server,submitting=false,lessons=false,config=false
  try{
    for(const migration of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback'])await f.db.exec(f.sql('migrations/pg_v9_'+migration+'.sql'))
    const auth=new NativeAuthRepository(f.pool),owned=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true})
    server=createServer((req,res)=>{void handler(req,res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const origin='http://127.0.0.1:'+server.address().port
    const configure=(next={})=>{
      ({submitting=false,lessons=false,config=false}=next);let business
      const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:config,allowAgentFeedback:true,allowAgentFeedbackSubmission:submitting,allowAgentFeedbackLessons:lessons,businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:config,agentFeedbackUat:submitting,agentFeedbackLessonsUat:lessons})){
          res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
        }return business(req,res)
      }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('Native Cookie required')},authenticateRequest:native.authenticateRequest,repository:f.agents,
        agentFeedbackRepository:new AgentFeedbackRepository(f.pool,{allowSubmit:config&&submitting,allowLessonStorage:config&&submitting&&lessons})})
      handler=native.handler
    };configure()
    const call=async(route,{cookie,body,csrf=true,extra={},method=body?'POST':'GET',lose=false}={})=>{
      const response=await fetch(origin+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
      const value=await response.json();if(lose&&response.ok)throw Error('synthetic committed feedback response lost')
      return {status:response.status,headers:response.headers,body:value}
    }
    const login=async(email,password)=>{const response=await call('/api/native-auth/login',{body:{email,password}});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0]}
    const alice=await login('synthetic-admin@example.test','SyntheticServiceAdmin#2026'),bob=await login('collaborator@example.test','SyntheticCollaborator#2026')
    const role=f.resources.alice.spec,started=await owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,require_plan_review:false,idempotency_key:'synthetic-feedback-http-'+randomUUID(),instruction:'Synthetic cancelled task token=syntheticFeedbackTaskPrivate'})
    await owned.cancel(f.identities.alice,started.run.id)
    const base='/api/v2/agent-feedback/'+started.run.id
    const state=async()=>(await call(base,{cookie:alice})).body
    const choice=async(patch={})=>{const current=await state();return {action:'submit',request_id:randomUUID(),spec_id:role.id,run_id:started.run.id,expected_revision:current.revision,expected_source_sha256:current.source.source_sha256,rating:'down',tags:['核对:😀'],comment:'Synthetic feedback token=syntheticFeedbackOnlySecret',remember_lesson:true,confirm:true,...patch}}
    const counts=async()=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    return {...f,server,call,configure,alice,bob,base,state,choice,counts,runId:started.run.id,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await f.close()}}
  }catch(error){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close();throw error}
}
test('feedback HTTP verifies Native owner Cookie, Origin, CSRF, closed payloads and separate inert storage scope; lost originals and privacy deletion survive disabled admission',async()=>{
  const f=await fixture()
  try{
    const {base,alice,bob,call}=f,before=await f.counts(),raw=await f.choice()
    let caps=(await call('/api/native-auth/capabilities',{cookie:alice})).body
    assert.equal(caps.agent_feedback_available,true);assert.equal(caps.agent_feedback_submission_enabled,false);assert.equal(caps.agent_feedback_lesson_storage_enabled,false)
    assert.equal((await call(base+'/change',{cookie:alice,body:raw})).status,403)
    f.configure({submitting:true,config:true})
    caps=(await call('/api/native-auth/capabilities',{cookie:alice})).body
    assert.equal(caps.agent_feedback_submission_enabled,true);assert.equal(caps.agent_feedback_lesson_storage_enabled,false)
    assert.equal((await call(base,{extra:{'X-Rh-User-Id':f.users.alice,Authorization:'Bearer synthetic'}})).status,401)
    assert.equal((await call(base,{cookie:alice,extra:{Authorization:'Bearer synthetic'}})).status,401)
    assert.equal((await call(base,{cookie:bob,extra:{'X-Rh-User-Id':f.users.alice}})).status,404)
    assert.equal((await call(base+'?owner_user_id='+f.users.alice,{cookie:alice})).status,400)
    for(const request of [{csrf:false},{extra:{Origin:'https://foreign.invalid'}}])assert.equal((await call(base+'/change',{cookie:alice,body:raw,...request})).status,403)
    assert.equal((await call(base+'/change',{cookie:bob,body:raw})).status,404)
    assert.equal((await call(base+'/change',{cookie:alice,body:{...raw,owner_user_id:f.users.bob}})).status,400)
    assert.equal((await call(base+'/change',{cookie:alice,body:{...raw,run_id:randomUUID()}})).status,400)
    assert.equal((await call(base+'/change?admin=true',{cookie:alice,body:raw})).status,400)
    assert.equal((await call(base+'/change',{cookie:alice,body:{...raw,remember_lesson:'true'}})).status,400)
    assert.equal((await call(base+'/change',{cookie:alice,body:{...raw,unexpected:'x'.repeat(9000)}})).status,413)
    for(const method of ['PATCH','DELETE'])assert.equal((await call(base+'/change',{cookie:alice,method})).status,405)
    const first=await call(base+'/change',{cookie:alice,body:raw});assert.equal(first.status,200);assert.equal(first.body.lesson_result.decision,'writes_disabled')
    assert.doesNotMatch(JSON.stringify(first.body),/syntheticFeedbackOnlySecret|syntheticFeedbackTaskPrivate/)
    f.configure({submitting:true,lessons:true,config:true})
    const next=await f.choice();await assert.rejects(call(base+'/change',{cookie:alice,body:next,lose:true}),/committed feedback response lost/)
    let current=await f.state();assert.equal(current.revision,2);assert.equal(current.current.body.comment,'Synthetic feedback token=***');assert.equal(current.lessons[0].source_current,true);assert.equal(current.lessons[0].tools_used,'')
    const lesson=current.lessons[0],forget={action:'forget_lesson',request_id:randomUUID(),spec_id:current.spec_id,run_id:f.runId,feedback_id:lesson.feedback_id,expected_content_sha256:lesson.content_sha256,confirm:true}
    f.configure()
    const confirmed=await call(base+'/confirm',{cookie:alice,body:next});assert.equal(confirmed.status,200);assert.equal(confirmed.body.replayed,true);assert.equal(confirmed.body.lesson_result.decision,'stored')
    assert.equal((await call(base+'/confirm',{cookie:bob,body:next})).status,404)
    assert.equal((await call(base+'/change',{cookie:alice,body:{...next,comment:'Synthetic feedback token=differentPrivateText'}})).status,409)
    assert.equal((await call(base+'/change',{cookie:alice,body:await f.choice()})).status,403)
    await assert.rejects(call(base+'/change',{cookie:alice,body:forget,lose:true}),/committed feedback response lost/)
    assert.equal((await call(base+'/confirm',{cookie:alice,body:forget})).body.replayed,true)
    current=await f.state();assert.equal(current.lessons.length,0);assert.equal(current.current.body.rating,'down')
    const erase={action:'erase_feedback',request_id:randomUUID(),spec_id:current.spec_id,run_id:f.runId,expected_revision:2,expected_feedback_sha256:current.current.feedback_sha256,confirm:true}
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[f.runId])
    await assert.rejects(call(base+'/change',{cookie:alice,body:erase,lose:true}),/committed feedback response lost/)
    assert.equal((await call(base+'/confirm',{cookie:alice,body:erase})).body.replayed,true)
    assert.equal((await call(base+'/change',{cookie:alice,body:next})).body.replayed,true)
    current=await f.state();assert.equal(current.state,'erased');assert.equal(current.current,null);assert.equal(current.source,null)
    for(const table of ['bodies','lessons'])assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_'+table)).rows[0].n,0)
    assert.deepEqual(await f.counts(),before)
    await call('/api/native-auth/logout',{cookie:alice,body:{}});assert.equal((await call(base,{cookie:alice})).status,401)
  }finally{await f.close()}
})
test('feedback HTTP preserves the employee statement when lesson storage fails and readonly original recovery does not retry storage',async()=>{
  const f=await fixture()
  try{
    f.configure({submitting:true,lessons:true,config:true});const raw=await f.choice();let attempts=0
    f.setFault(sql=>{if(sql.startsWith('INSERT INTO agentstudio.agent_feedback_lessons(')){attempts++;throw Error('synthetic_feedback_lesson_storage_fault')}})
    await assert.rejects(f.call(f.base+'/change',{cookie:f.alice,body:raw,lose:true}),/committed feedback response lost/)
    f.setFault(undefined);f.configure()
    const confirmed=await f.call(f.base+'/confirm',{cookie:f.alice,body:raw});assert.equal(confirmed.status,200);assert.equal(confirmed.body.lesson_result.decision,'write_failed');assert.equal(confirmed.body.replayed,true)
    assert.equal((await f.call(f.base+'/change',{cookie:f.alice,body:raw})).body.replayed,true)
    const current=await f.state();assert.equal(current.state,'active');assert.equal(current.current.body.rating,'down');assert.equal(current.lessons.length,0);assert.equal(attempts,1)
    assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
  }finally{f.setFault(undefined);await f.close()}
})
