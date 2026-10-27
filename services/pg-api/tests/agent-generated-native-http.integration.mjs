// Authored genuinePG18/Cookie/Native HTTP proof. This entry MUST refuse the
// ordinary machine before importing pg, fixtures or runtime/server modules.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {generatedAcceptanceTarget,generatedAcceptanceFixture,generatedAcceptanceChoice,generatedPreviewChoice} from './helpers/agent-generated-acceptance-fixture.mjs'

test('generated acceptance uses actual Native sessions and full audits on isolated TCP PG18', {concurrency:false,timeout:180000},async t=>{
  const target=generatedAcceptanceTarget()
  const [{default:pg},{NativeAuthRepository},{createNativeAuthHttpHandler},{createHandler},{permitNativePg18BusinessUatRequest},{AgentGeneratedAcceptanceRepository},{inspectAgentGeneratedSchema}]=await Promise.all([
    import('pg'),import('../src/native-auth-repository.mjs'),import('../src/native-auth-http.mjs'),import('../src/http.ts'),import('../src/native-config-uat-policy.ts'),
    import('../src/agent-generated-acceptance-repository.ts'),import('../src/agent-generated-audit.ts')
  ])
  const f=await generatedAcceptanceFixture(),origin='http://localhost:17443'
  // This is the fixture's real independently authenticated Native login. It
  // does not impersonate the privileged installer or an API/Worker login.
  const authPool=new pg.Pool({...target,user:'agentstudio_native_login',password:createHash('sha512').update(target.password+':assessment:agentstudio_native_login').digest('hex').slice(0,80),max:2})
  const auth=new NativeAuthRepository({async connect(){const db=await authPool.connect();return {query:(sql,args=[])=>db.query(sql,args),release:()=>db.release()}}})
  const state={fresh:true,config:true,drop:false},server=createServer((req,res)=>{
    if(state.drop&&req.method==='POST'&&req.url==='/api/v2/agent-generated-acceptances/accept'){
      state.drop=false;res.end=()=>{res.destroy();return res}
    }
    return native.handler(req,res)
  })
  let native
  const configure=()=>{
    let business
    native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:state.config,
      allowAgentGeneratedAcceptance:true,allowAgentGeneratedAcceptanceWrites:state.fresh,
      businessHandler:(req,res)=>{
        const caps={configurationWrites:state.config,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false,agentGeneratedAcceptanceUat:state.fresh}
        if(!permitNativePg18BusinessUatRequest(new URL(req.url,'http://localhost').pathname,req.method,caps)){
          res.writeHead(405,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
        }
        return business(req,res)
      }})
    business=createHandler({allowedOrigin:origin,verifyToken:async()=>{throw Error('OIDC_bearer_forbidden_in_native_http_proof')},authenticateRequest:native.authenticateRequest,repository:f.agents,
      agentGeneratedAcceptanceRepository:new AgentGeneratedAcceptanceRepository(f.pool,{allowAcceptance:state.fresh&&state.config})})
  }
  configure()
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const address=server.address();assert.ok(address&&typeof address!=='string')
  const base='http://127.0.0.1:'+address.port
  // HTTP here exercises the public handler+Cookie bridge. The existing bound
  // runtime job separately proves actual HTTPS/private mTLS and Worker paths.
  const request=async(path,{method='GET',cookie,body,raw,originHeader=origin,csrf=true,headers={}}={})=>{
    const wire=raw??(body===undefined?undefined:JSON.stringify(body))
    const reply=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(originHeader?{Origin:originHeader}:{}),...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(wire!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:wire,signal:AbortSignal.timeout(20000)})
    const text=await reply.text();return {status:reply.status,headers:reply.headers,body:text?JSON.parse(text):null}
  }
  const login=async who=>{
    const reply=await request('/api/native-auth/login',{method:'POST',body:{email:'assessment-'+who+'@example.test',password:who==='alice'?'SyntheticAssessmentAlice#2026':'SyntheticAssessmentBob#2026'}})
    assert.equal(reply.status,200);const cookie=reply.headers.get('set-cookie');assert.ok(cookie)
    return cookie.split(';')[0]
  }
  const route='/api/v2/agent-generated-acceptances'
  let accepted,original,p,alice,bob
  try{
    alice=await login('alice');bob=await login('bob')
    await t.test('actual Cookie/Origin/CSRF and closed input boundaries reject spoofing before configuration mutation',async()=>{
      p=await f.complete({isolatedReviewModel:true})
      const preview=generatedPreviewChoice(p),before=await f.snapshot()
      assert.equal((await request(route+'/preview',{method:'POST',body:preview,headers:{'X-Rh-User-Id':f.users.alice}})).status,401)
      assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,body:preview,headers:{Authorization:'Bearer forged.jwt.value'}})).status,401)
      assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,body:preview,originHeader:'https://foreign.example.test'})).status,403)
      assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,body:preview,csrf:false})).status,403)
      for(const raw of [Buffer.from([0xff]),'{',JSON.stringify({...preview,private_body:'refuse'})]){
        assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,raw})).status,400)
      }
      assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,raw:' '.repeat(8193)})).status,413)
      assert.equal((await request(route+'/preview?alternate=1',{method:'POST',cookie:alice,body:preview})).status,400)
      const prepared=await request(route+'/preview',{method:'POST',cookie:alice,body:preview})
      assert.equal(prepared.status,200);assert.equal(prepared.headers.get('cache-control'),'no-store')
      assert.equal(prepared.headers.get('x-content-type-options'),'nosniff');assert.equal(prepared.headers.get('referrer-policy'),'no-referrer')
      assert.equal(prepared.body.source.review_id,p.raw.request_id);assert.equal(await f.snapshot(),before)
      original=generatedAcceptanceChoice(prepared.body)
    })
    await t.test('actual COMMIT response loss recovers identical original through confirm and accept after both fresh and configuration scopes close',async()=>{
      state.drop=true
      await assert.rejects(request(route+'/accept',{method:'POST',cookie:alice,body:original}))
      const row=(await f.db.query('SELECT request_id,review_id FROM agentstudio.agent_generated_acceptances WHERE owner_user_id=$1 AND request_id=$2',[p.owner,original.request_id])).rows
      assert.equal(row.length,1);assert.equal(row[0].review_id,p.raw.request_id,'drop must follow the genuine committed mutation')
      state.fresh=false;state.config=false;configure()
      const caps=await request('/api/native-auth/capabilities',{cookie:alice})
      assert.equal(caps.status,200);assert.equal(caps.body.agent_generated_acceptance_available,true)
      assert.equal(caps.body.agent_generated_acceptance_enabled,false);assert.equal(caps.body.config_writes_enabled,false)
      const before=await f.snapshot(),confirmed=await request(route+'/confirm',{method:'POST',cookie:alice,body:original})
      assert.equal(confirmed.status,200);assert.equal(confirmed.body.replayed,true);accepted=confirmed.body
      const replay=await request(route+'/accept',{method:'POST',cookie:alice,body:original})
      assert.equal(replay.status,200);assert.deepEqual(replay.body,accepted)
      const known=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice})
      assert.equal(known.status,200);assert.deepEqual(known.body,accepted);assert.equal(await f.snapshot(),before)
      const fresh=await f.complete({isolatedReviewModel:true}),preview=await request(route+'/preview',{method:'POST',cookie:alice,body:generatedPreviewChoice(fresh)})
      assert.equal(preview.status,200,'readonly preview remains independently available')
      const freshBefore=await f.snapshot()
      assert.equal((await request(route+'/accept',{method:'POST',cookie:alice,body:generatedAcceptanceChoice(preview.body)})).status,403)
      assert.equal(await f.snapshot(),freshBefore)
    })
    await t.test('known receipt survives actual body/feedback/model/epoch changes while foreign Cookie identity remains404',async()=>{
      await f.eraseOpinion(p);await f.eraseFeedback(p.selected[0])
      await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id])
      await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
      const before=await f.snapshot(),receipt=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice})
      assert.equal(receipt.status,200);assert.deepEqual(receipt.body,accepted)
      assert.doesNotMatch(JSON.stringify(receipt.body),/"(?:descriptive|messages|choice|identity|owner_user_id|model_binding|lease_token|rationale|tools_note)"|api_key/)
      for(const [path,body] of [[route+'/reviews/'+p.raw.request_id,undefined],[route+'/confirm',original],[route+'/accept',original]]){
        const reply=await request(path,{method:body?'POST':'GET',cookie:bob,body,headers:{'X-Rh-User-Id':f.users.alice}})
        assert.equal(reply.status,404)
      }
      assert.equal(await f.snapshot(),before)
    })
    await t.test('runtime full059 audit still refuses genuine catalog drift while all mutation flags are off',async()=>{
      const before=await f.snapshot()
      await f.db.exec('ALTER FUNCTION agentstudio.agent_generated_receipt(uuid,text) RESET search_path')
      try{
        await assert.rejects(inspectAgentGeneratedSchema(f.pool),/unsafe_agent_generated_privileges/)
        const reply=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice})
        assert.equal(reply.status,500);assert.equal(reply.body.error,'internal_error')
        assert.doesNotMatch(JSON.stringify(reply.body),/search_path|pg_catalog|agentstudio|SELECT|unsafe_agent_generated/)
      }finally{await f.db.exec('ALTER FUNCTION agentstudio.agent_generated_receipt(uuid,text) SET search_path=pg_catalog')}
      assert.equal(await inspectAgentGeneratedSchema(f.pool),true)
      assert.equal((await request(route+'/reviews/'+p.raw.request_id,{cookie:alice})).status,200)
      assert.equal(await f.snapshot(),before)
    })
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
    await authPool.end();await f.close()
  }
})
