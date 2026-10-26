import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {agentFixture} from './helpers/workflow-v2-agent-fixture.mjs'
import {AutonomousAgentRunRepository} from '../src/autonomous-agent-run-repository.ts'
import {WorkflowV2RunRepository} from '../src/workflow-v2-run-repository.ts'
import {AgentHumanInputRepository} from '../src/agent-human-input-repository.ts'
import {AgentSpecRepository} from '../src/repository.ts'
import {NativeAuthRepository} from '../src/native-auth-repository.mjs'
import {createNativeAuthHttpHandler} from '../src/native-auth-http.mjs'
import {permitNativePg18BusinessUatRequest} from '../src/native-config-uat-policy.ts'
import {createHandler} from '../src/http.ts'
import {createPgNativePilotApi} from '../../../src/lib/pgNativePilotApi.ts'
test('Native Cookie human replies require exact owner/CSRF/current source; concurrent intent has one winner and confirmation stays read-only after opt-out',async()=>{
  const f=await agentFixture({autonomous:true,sharing:true,nativeEmployees:true});let server,handler,enabled=true,workflowEnabled=false,calls=0
  try{
    await f.db.exec(f.sql('migrations/pg_v9_048_agent_human_input.sql'))
    const auth=new NativeAuthRepository(f.pool),owned=new AutonomousAgentRunRepository(f.pool,{allowHumanInput:true})
    server=createServer((req,res)=>{void handler(req,res)})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
    const configure=()=>{
      let business
      const native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:enabled,allowAutonomousAgentSubmission:enabled,allowWorkflowV2Submission:workflowEnabled,allowAgentHumanInput:true,
        businessHandler:(req,res)=>{
          if(!permitNativePg18BusinessUatRequest(new URL(req.url,origin).pathname,req.method,{configurationWrites:enabled,autonomousAgentUat:enabled,workflowV2ExecutionUat:workflowEnabled})){
            res.writeHead(405,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
          }return business(req,res)
        }})
      business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('Cookie required')},authenticateRequest:native.authenticateRequest,
        repository:new AgentSpecRepository(f.pool),autonomousAgentRunRepository:owned,workflowV2RunRepository:new WorkflowV2RunRepository(f.pool),
        agentHumanInputRepository:new AgentHumanInputRepository(f.pool,'agent_native_v2',{allowResponses:enabled}),workflowHumanInputRepository:new AgentHumanInputRepository(f.pool,'workflow_native_v2',{allowResponses:enabled})})
      handler=native.handler
    };configure()
    const call=async(path,{cookie,body,csrf=true,extra={}}={})=>{
      const result=await fetch(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
      return {status:result.status,headers:result.headers,body:await result.json()}
    }
    const login=async(email,password)=>{const r=await call('/api/native-auth/login',{body:{email,password}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
    const alice=await login('synthetic-admin@example.test','SyntheticServiceAdmin#2026'),bob=await login('collaborator@example.test','SyntheticCollaborator#2026')
    const client=cookie=>createPgNativePilotApi((path,options)=>fetch(origin+path,{...options,headers:{...options.headers,Origin:origin,Cookie:cookie}}),'')
    const api=client(alice),foreign=client(bob),role=f.resources.alice.spec
    assert.equal((await api.getConfigCapabilities()).agent_human_responses_enabled,true)
    const admitted=await api.submitAutonomousAgentRun(role.id,role.revision,'Native owner clarification','synthetic-human-http-'+randomUUID(),3),id=admitted.run.id
    await f.privateTls(async()=>{calls++;return JSON.stringify({action:'ask_user',question:'Owner date <script>untrusted</script>?'})},async makeWorker=>{
      let pending
      for(let i=0;i<40;i++){
        pending=await api.getAutonomousAgentRun(id)
        if(pending.run.status==='awaiting_input')break
        if(pending.run.status==='awaiting_approval'){const p=pending.pending_effect;await api.decideAutonomousAgentNode(id,'approved',p.step_key,p.input_sha256)}
        await makeWorker({humanInputApproved:true}).tick()
      }
      assert.equal(pending.run.status,'awaiting_input');assert.equal(calls,1)
      const p=pending.human_input,body={request_id:randomUUID(),pending_step_key:p.pending_step_key,pending_sha256:p.pending_sha256,source_sha256:p.source_sha256,decision:'reply',answer:'A private owner deadline.',confirm:true}
      const path='/api/v2/agent-autonomous-runs/'+id+'/respond'
      assert.equal((await call(path,{body,extra:{'X-Rh-User-Id':f.users.alice}})).status,401)
      assert.equal((await call(path,{cookie:alice,body,csrf:false})).status,403)
      assert.equal((await call(path,{cookie:alice,body,extra:{Origin:'https://foreign.invalid'}})).status,403)
      assert.equal((await call(path,{cookie:bob,body,extra:{'X-Rh-User-Id':f.users.alice}})).status,404)
      await assert.rejects(foreign.confirmAutonomousAgentResponse(id,body),e=>e.status===404)
      await assert.rejects(api.confirmAutonomousAgentResponse(id,body),e=>e.code==='agent_human_response_not_found')
      assert.equal((await call(path,{cookie:alice,body:{...body,source_sha256:'f'.repeat(64)}})).status,409)
      assert.equal((await call('/api/v2/workflow-v2-runs/'+id+'/respond',{cookie:alice,body})).status,405)
      workflowEnabled=true;configure()
      assert.equal((await call('/api/v2/workflow-v2-runs/'+id+'/respond',{cookie:alice,body})).status,404)
      workflowEnabled=false;configure()
      const other={...body,request_id:randomUUID(),answer:'Competing owner choice'}
      const attempts=await Promise.all([call(path,{cookie:alice,body}),call(path,{cookie:alice,body:other})])
      assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409])
      const selected=attempts[0].status===200?body:other
      assert.equal((await api.respondAutonomousAgent(id,selected)).replayed,true)
      assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_human_input_responses WHERE run_id=$1',[id])).rows[0].n,1)
      enabled=false;configure()
      const capability=await api.getConfigCapabilities();assert.equal(capability.agent_human_input_available,true);assert.equal(capability.agent_human_responses_enabled,false)
      await assert.rejects(api.respondAutonomousAgent(id,selected),e=>e.status===405)
      assert.equal((await api.confirmAutonomousAgentResponse(id,selected)).replayed,true)
      const history=await api.getAutonomousAgentHumanHistory(id,'',1)
      assert.equal(history.available,true);assert.equal(history.items[0].answer,selected.answer);assert.equal(history.next_after,null)
      await assert.rejects(foreign.getAutonomousAgentHumanHistory(id),e=>e.status===404)
      assert.equal((await call('/api/v2/agent-autonomous-runs/'+id+'/human-history?limit=1&limit=2',{cookie:alice})).status,400)
      assert.equal((await call('/api/v2/workflow-v2-runs/'+id+'/human-history',{cookie:alice})).status,404)
      assert.equal((await api.getAutonomousAgentRun(id)).run.status,'queued');assert.equal(calls,1)
      assert.equal((await makeWorker({humanInputApproved:true}).tick()).status,'awaiting_approval');assert.equal(calls,1)
      const next=await owned.get(f.identities.alice,id);assert.equal(next.pending_effect.kind,'model')
      assert.equal(JSON.stringify(await api.confirmAutonomousAgentResponse(id,selected)).includes(selected.answer),false)
    })
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await f.close()}
})
