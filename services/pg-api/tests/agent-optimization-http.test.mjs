// Actual synthetic owner SQL + loopback Native Cookie HTTP, no provider.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {agentMemoryFixture} from './helpers/agent-memory-fixture.mjs'
import {AgentFeedbackRepository} from '../src/agent-feedback-repository.ts'
import {AgentOptimizationRepository} from '../src/agent-optimization-repository.ts'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {createHandler} from '../src/http.ts'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {withActor} from '../src/repository.ts'
import {safeAgentSpec} from '../src/contracts.ts'
async function fixture(){
  const f=await agentMemoryFixture();let handler,server
  try{
    for(const migration of ['051_agent_memory_derived','052_agent_memory_outcome','053_agent_memory_failure_source','054_agent_feedback','055_agent_optimization'])await f.db.exec(f.sql('migrations/pg_v9_'+migration+'.sql'))
    const feedback=new AgentFeedbackRepository(f.pool,{allowSubmit:true}),owned=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true}),auth=new NativeAuthRepository(f.pool)
    server=createServer((req,res)=>{void handler(req,res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const origin='http://127.0.0.1:'+server.address().port
    const configure=({enabled=false,config=false}={})=>{
      let business
      const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:config,allowAgentOptimization:true,allowAgentOptimizationAcceptance:enabled,businessHandler:(req,res)=>{
        if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:config,agentOptimizationUat:enabled})){
          res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
        }return business(req,res)
      }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('Native Cookie required')},authenticateRequest:native.authenticateRequest,repository:f.agents,agentOptimizationRepository:new AgentOptimizationRepository(f.pool,{allowAcceptance:config&&enabled})});handler=native.handler
    };configure()
    const call=async(path,{cookie,body,extra={},csrf=true,lose=false,method=body?'POST':'GET'}={})=>{
      const response=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})
      const value=await response.json();if(lose&&response.ok)throw Error('synthetic committed role acceptance reply lost')
      return {status:response.status,headers:response.headers,body:value}
    }
    const login=async(email,password)=>{const r=await call('/api/native-auth/login',{body:{email,password}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
    const alice=await login('synthetic-admin@example.test','SyntheticServiceAdmin#2026'),bob=await login('collaborator@example.test','SyntheticCollaborator#2026')
    const role=f.resources.alice.spec,started=await owned.submit(f.identities.alice,role.id,{expected_revision:role.revision,max_steps:1,require_plan_review:false,idempotency_key:'synthetic-optimization-http-'+randomUUID(),instruction:'Synthetic owner cancelled source token=syntheticOptimizationHttpTaskPrivate'})
    await owned.cancel(f.identities.alice,started.run.id)
    const state=await feedback.status(f.identities.alice,started.run.id)
    const feedbackReceipt=await feedback.change(f.identities.alice,{action:'submit',request_id:randomUUID(),spec_id:role.id,run_id:started.run.id,expected_revision:0,expected_source_sha256:state.source.source_sha256,rating:'down',tags:['核对😀'],comment:'Synthetic author statement token=syntheticOptimizationHttpFeedbackPrivate',remember_lesson:false,confirm:true})
    const roleSha=(await withActor(f.pool,f.identities.alice,db=>db.query('SELECT agentstudio.agent_optimization_role_sha(id,owner_user_id,name,revision,spec) AS sha FROM agentstudio.agent_specs WHERE id=$1',[role.id]))).rows[0].sha
    const {require_approval:_,...spec}=role.spec,base='/api/v2/agent-optimizations'
    const draft={action:'preview',spec_id:role.id,run_id:started.run.id,feedback_id:feedbackReceipt.feedback_id,expected_feedback_sha256:feedbackReceipt.feedback_sha256,expected_spec_revision:role.revision,expected_spec_sha256:roleSha,name:role.name,spec:{...spec,goal:'Synthetic reviewed owner correction'}}
    const counts=async()=>(await f.db.query('SELECT (SELECT count(*) FROM agentstudio.agent_optimization_intents)::integer AS intents,(SELECT count(*) FROM agentstudio.agent_optimization_links)::integer AS links,(SELECT count(*) FROM agentstudio.agent_collaboration_revisions)::integer AS history,(SELECT count(*) FROM agentstudio.jobs)::integer AS jobs,(SELECT count(*) FROM agentstudio.external_effects)::integer AS effects')).rows[0]
    return {...f,feedback,base,draft,alice,bob,call,configure,counts,runId:started.run.id,specId:role.id,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await f.close()}}
  }catch(error){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close();throw error}
}
test('Native optimization HTTP checks Cookie/CSRF/owner, preserves full supported role capacity, and confirms a lost original after feedback erasure, later role edit and closed new scope',async()=>{
  const f=await fixture()
  try{
    const {base,alice,bob,call}=f,before=await f.counts(),caps=()=>call('/api/native-auth/capabilities',{cookie:alice})
    assert.equal((await caps()).body.agent_optimization_available,true);assert.equal((await caps()).body.agent_optimization_acceptance_enabled,false)
    const full={...f.draft,spec:{...f.draft.spec,goal:'合'.repeat(3000),task_scope:'范'.repeat(4000),deliverables:Array.from({length:30},()=> '交'.repeat(500)),task_plan:Array.from({length:30},()=> '计'.repeat(500)),done_criteria:Array.from({length:30},()=> '验'.repeat(500))}}
    const original={...full,action:'accept',request_id:randomUUID(),confirm:true};assert.ok(Buffer.byteLength(JSON.stringify(original),'utf8')>32768)
    assert.equal((await call(base+'/accept',{cookie:alice,body:original})).status,403)
    assert.equal((await call(base+'/preview',{cookie:alice,body:full})).body.recorded,false);assert.deepEqual(await f.counts(),before)
    f.configure({enabled:true,config:true});assert.equal((await caps()).body.agent_optimization_acceptance_enabled,true)
    assert.equal((await call(base+'?spec_id='+f.specId,{extra:{Authorization:'Bearer synthetic','X-Rh-User-Id':f.users.alice}})).status,401)
    assert.equal((await call(base+'?spec_id='+f.specId,{cookie:alice,extra:{Authorization:'Bearer synthetic'}})).status,401)
    assert.equal((await call(base+'?spec_id='+f.specId,{cookie:bob,extra:{'X-Rh-User-Id':f.users.alice}})).status,404)
    assert.equal((await call(base+'?spec_id='+f.specId+'&spec_id='+f.specId,{cookie:alice})).status,400)
    assert.equal((await call(base+'?spec_id='+f.specId+'&owner_user_id='+f.users.alice,{cookie:alice})).status,400)
    for(const extra of [{csrf:false},{extra:{Origin:'https://foreign.invalid'}}])assert.equal((await call(base+'/accept',{cookie:alice,body:original,...extra})).status,403)
    assert.equal((await call(base+'/accept',{cookie:bob,body:original})).status,404)
    for(const patch of [{owner_user_id:f.users.alice},{paid_optimization_approved:true},{changed_keys:['goal']},{accepted_revision_id:randomUUID()},{action:'preview'}])assert.equal((await call(base+'/accept',{cookie:alice,body:{...original,...patch}})).status,400)
    assert.equal((await call(base+'/accept?admin=true',{cookie:alice,body:original})).status,400)
    assert.equal((await call(base+'/accept',{cookie:alice,body:{...original,unexpected:'x'.repeat(530000)}})).status,413)
    for(const method of ['PATCH','DELETE'])assert.equal((await call(base+'/accept',{cookie:alice,method})).status,405)
    await assert.rejects(call(base+'/accept',{cookie:alice,body:original,lose:true}),/committed role acceptance reply lost/)
    let role=await f.agents.get(f.identities.alice,f.specId);assert.equal(role.spec.goal.length,3000);assert.equal(role.spec.task_scope.length,4000);assert.deepEqual(role.spec.deliverables,full.spec.deliverables);assert.deepEqual(role.spec.task_plan,full.spec.task_plan);assert.deepEqual(role.spec.done_criteria,full.spec.done_criteria)
    await f.db.query("UPDATE agentstudio.runs SET checkpoint='{}'::jsonb WHERE id=$1",[f.runId])
    const feedbackState=await f.feedback.status(f.identities.alice,f.runId)
    await new AgentFeedbackRepository(f.pool).change(f.identities.alice,{action:'erase_feedback',request_id:randomUUID(),spec_id:f.specId,run_id:f.runId,expected_revision:feedbackState.revision,expected_feedback_sha256:feedbackState.current.feedback_sha256,confirm:true})
    const {require_approval:_,...stored}=role.spec;await f.agents.update(f.identities.alice,role.id,role.name,safeAgentSpec({...stored,goal:'Later unrelated owner role'}),role.revision)
    f.configure()
    const confirmed=await call(base+'/confirm',{cookie:alice,body:original});assert.equal(confirmed.status,200);assert.equal(confirmed.body.replayed,true);assert.equal(confirmed.body.recorded,true)
    assert.equal((await call(base+'/accept',{cookie:alice,body:original})).body.replayed,true)
    assert.equal((await call(base+'/confirm',{cookie:bob,body:original})).status,404)
    assert.equal((await call(base+'/accept',{cookie:alice,body:{...original,spec:{...original.spec,goal:'Changed original intent'}}})).status,409)
    assert.equal((await call(base+'/accept',{cookie:alice,body:{...original,request_id:randomUUID()}})).status,403)
    const page=await call(base+'?spec_id='+f.specId,{cookie:alice});assert.equal(page.status,200);assert.equal(page.body.items.length,1);assert.equal(page.body.items[0].feedback_unchanged,false);assert.equal(page.body.items[0].role_current,false)
    assert.doesNotMatch(JSON.stringify(page.body),/syntheticOptimizationHttpTaskPrivate|syntheticOptimizationHttpFeedbackPrivate|Later unrelated owner/)
    const after=await f.counts();assert.equal(after.links,1);assert.equal(after.intents,1);assert.equal(after.jobs,before.jobs);assert.equal(after.effects,before.effects);assert.equal((await f.feedback.status(f.identities.alice,f.runId)).state,'erased')
    role=await f.agents.get(f.identities.alice,f.specId);assert.equal(role.spec.goal,'Later unrelated owner role')
    await call('/api/native-auth/logout',{cookie:alice,body:{}});assert.equal((await call(base+'?spec_id='+f.specId,{cookie:alice})).status,401)
  }finally{await f.close()}
})
test('Native HTTP provenance audit failure gives no accepted receipt or partial role; original explicit retry works only after the fault is removed',async()=>{
  const f=await fixture()
  try{
    f.configure({enabled:true,config:true});const original={...f.draft,action:'accept',request_id:randomUUID(),confirm:true},before=await f.counts(),role=await f.agents.get(f.identities.alice,f.specId)
    await f.db.exec("CREATE FUNCTION agentstudio.synthetic_http_optimization_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='agent.optimization_accept' THEN RAISE EXCEPTION 'synthetic_hidden_optimization_http_fault'; END IF; RETURN NEW; END$$; CREATE TRIGGER synthetic_http_optimization_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_http_optimization_audit()")
    try{const failed=await f.call(f.base+'/accept',{cookie:f.alice,body:original});assert.equal(failed.status,500);assert.doesNotMatch(JSON.stringify(failed.body),/synthetic_hidden_optimization_http_fault|INSERT|agentstudio/)}finally{await f.db.exec('DROP TRIGGER synthetic_http_optimization_audit ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_http_optimization_audit()')}
    assert.deepEqual(await f.counts(),before);assert.deepEqual(await f.agents.get(f.identities.alice,f.specId),role)
    f.configure();assert.equal((await f.call(f.base+'/confirm',{cookie:f.alice,body:original})).status,404);assert.deepEqual(await f.counts(),before)
    f.configure({enabled:true,config:true});assert.equal((await f.call(f.base+'/accept',{cookie:f.alice,body:original})).body.recorded,true);assert.equal((await f.call(f.base+'/confirm',{cookie:f.alice,body:original})).body.replayed,true)
    assert.equal((await f.counts()).links,1);assert.equal((await f.counts()).effects,before.effects)
  }finally{await f.close()}
})
