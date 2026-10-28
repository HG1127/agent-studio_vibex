// AUTHORED genuinePG18 + real Native Cookie + loopback HTTP proof, NOT local
// passing evidence. HTTPS/private mTLS is a separate existing runtime job.
// The original exact Linux CI guard MUST run before any DB/runtime imports,
// connection or HTTP listener. Never execute against company/user data.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {descriptivePatchTarget,descriptivePatchFixture} from './helpers/agent-descriptive-patch-fixture.mjs'

test('S1 actual Native Cookie, policy, HTTP and isolated PG18 foundation',{concurrency:false,timeout:360000},async t=>{
  const target=descriptivePatchTarget()
  const [{default:pg},{createServer},{NativeAuthRepository},{createNativeAuthHttpHandler},{createHandler},{permitNativePg18BusinessUatRequest},{createAgentDescriptivePatchHttpHandler},{AgentDescriptivePatchAcceptanceRepository},{AgentGeneratedAcceptanceRepository},{inspectAgentDescriptivePatchSchema}]=await Promise.all([
    import('pg'),import('node:http'),import('../src/native-auth-repository.mjs'),import('../src/native-auth-http.mjs'),import('../src/http.ts'),import('../src/native-config-uat-policy.ts'),
    import('../src/agent-descriptive-patch-http.ts'),import('../src/agent-descriptive-patch-acceptance-repository.ts'),import('../src/agent-generated-acceptance-repository.ts'),import('../src/agent-descriptive-patch-audit.ts')
  ])
  const route='/api/v2/agent-descriptive-patches',oldRoute='/api/v2/agent-generated-acceptances',origin='http://localhost:17443'
  const state={config:true,fresh:true,drop:false,dropped:false,policyCalls:0,oidcFallbacks:0}
  const policy=()=>({configurationWrites:state.config,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false})
  // Strict prerequisite, not a test-only allowlist. Parent must actually add
  // these paths to the shared policy; unavailable policy support FAILS here.
  for(const path of [route+'/preview',route+'/accept',route+'/confirm'])assert.equal(permitNativePg18BusinessUatRequest(path,'POST',{...policy(),configurationWrites:false}),true,'shared real Native policy must preserve exact-original reachability: '+path)
  assert.equal(permitNativePg18BusinessUatRequest(route+'/reviews/'+randomUUID(),'GET',{...policy(),configurationWrites:false}),true)
  assert.equal(permitNativePg18BusinessUatRequest(route+'/accept','DELETE',policy()),false)

  const f=await descriptivePatchFixture()
  const authPool=new pg.Pool({...target,user:'agentstudio_native_login',password:createHash('sha512').update(target.password+':assessment:agentstudio_native_login').digest('hex').slice(0,80),max:2})
  const auth=new NativeAuthRepository({connect:()=>authPool.connect()})
  let native,server,base,alice,bob
  const configure=async()=>{
    assert.equal(await inspectAgentDescriptivePatchSchema(f.pool),true,'real full060->full059 chain before composition')
    let patch,legacy
    native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:state.config,
      allowAgentDescriptivePatch:true,allowAgentDescriptivePatchWrites:state.fresh,businessHandler:async(req,res)=>{
      state.policyCalls++
      if(!permitNativePg18BusinessUatRequest(new URL(req.url,'http://localhost').pathname,req.method,policy())){
        res.writeHead(405,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'pilot_business_writes_disabled'}));return
      }
      if(await patch(req,res))return
      return legacy(req,res)
    }})
    patch=createAgentDescriptivePatchHttpHandler({repository:new AgentDescriptivePatchAcceptanceRepository(f.pool,{allowAcceptance:state.config&&state.fresh}),allowedOrigin:origin,authenticateRequest:native.authenticateRequest})
    legacy=createHandler({repository:f.agents,allowedOrigin:origin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{state.oidcFallbacks++;throw Error('OIDC_forbidden_in_actual_Native_proof')},agentGeneratedAcceptanceRepository:new AgentGeneratedAcceptanceRepository(f.pool,{allowAcceptance:state.config&&state.fresh})})
  }
  const scopes=async(config,fresh)=>{state.config=config;state.fresh=fresh;await configure()}
  const request=async(path,{method='GET',cookie,body,raw,originHeader=origin,csrf=true,headers={}}={})=>{
    const wire=raw??(body===undefined?undefined:JSON.stringify(body))
    const reply=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(originHeader?{Origin:originHeader}:{}),...(csrf?{'X-AgentStudio-Request':'1'}:{}),...(wire!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:wire,signal:AbortSignal.timeout(20000)})
    const text=await reply.text();return {status:reply.status,headers:reply.headers,body:text?JSON.parse(text):null}
  }
  const login=async who=>{
    const reply=await request('/api/native-auth/login',{method:'POST',body:{email:'assessment-'+who+'@example.test',password:who==='alice'?'SyntheticAssessmentAlice#2026':'SyntheticAssessmentBob#2026'}})
    assert.equal(reply.status,200);const cookie=reply.headers.get('set-cookie');assert.ok(cookie?.startsWith('__Host-agentstudio_session='));return cookie.split(';')[0]
  }
  const previewInput=p=>({action:'preview',review_id:p.raw.request_id,spec_id:p.role.id,target_run_id:p.runId})
  const preview=async(p,cookie=alice)=>{
    const reply=await request(route+'/preview',{method:'POST',cookie,body:previewInput(p)})
    assert.equal(reply.status,200);assert.equal(reply.body.recorded,false);assert.equal(reply.body.source.review_id,p.raw.request_id);return reply
  }
  const noStore=reply=>{assert.equal(reply.headers.get('cache-control'),'no-store');assert.equal(reply.headers.get('x-content-type-options'),'nosniff');assert.equal(reply.headers.get('referrer-policy'),'no-referrer')}
  const capabilities=async(config,fresh)=>{
    const reply=await request('/api/native-auth/capabilities',{cookie:alice})
    assert.equal(reply.status,200);assert.equal(reply.body.agent_descriptive_patch_available,true)
    assert.equal(reply.body.agent_descriptive_patch_enabled,config&&fresh);assert.equal(reply.body.config_writes_enabled,config);noStore(reply)
  }
  const withoutD=spec=>Object.fromEntries(Object.entries(spec).filter(([key])=>!['goal','task_scope','deliverables','task_plan','done_criteria'].includes(key)))
  const full=()=>({goal:'HTTP完整生成 '+randomUUID(),task_scope:'仅描述',deliverables:['核对😀'],task_plan:['实施'],done_criteria:['验收']})
  const noPrivate=body=>assert.doesNotMatch(JSON.stringify(body),/"(?:descriptive|messages|choice|identity|owner_user_id|model_binding|lease_token|rationale|tools_note|comment)"|api_key|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback/)
  try{
    await configure()
    server=createServer((req,res)=>{
      if(state.drop&&req.method==='POST'&&req.url===route+'/accept'){
        state.drop=false;state.dropped=true
        // Actual response loss AFTER repository resolves and HTTP sends its
        // receipt; the real committed witness is queried below, never faked.
        res.end=()=>{res.destroy();return res}
      }
      Promise.resolve(native.handler(req,res)).catch(()=>{res.destroy()})
    })
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
    const address=server.address();assert.ok(address&&typeof address!=='string');base='http://127.0.0.1:'+address.port
    alice=await login('alice');bob=await login('bob');await capabilities(true,true)

    await t.test('real Cookie/Origin/CSRF and strict private or selected input pass shared policy but never mutate configuration',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),input=previewInput(p),before=await f.patchSnapshot(),policyBefore=state.policyCalls
      for(const settings of [{headers:{'X-Rh-User-Id':p.owner}},{cookie:alice,headers:{Authorization:'Bearer forged.jwt'}},{cookie:alice,headers:{'X-Rh-User-Id':f.users.bob}},{cookie:alice,originHeader:'https://foreign.example.test'},{cookie:alice,csrf:false},{cookie:alice,headers:{'Sec-Fetch-Site':'same-site'}}]){
        const r=await request(route+'/preview',{method:'POST',body:input,...settings});assert.ok(r.status===401||r.status===403);noStore(r)
      }
      for(const raw of [Buffer.from([0xff]),'{',JSON.stringify({...input,private_body:'do not accept'}),JSON.stringify({...input,owner_user_id:p.owner})])assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,raw})).status,400)
      assert.equal((await request(route+'/preview',{method:'POST',cookie:alice,raw:' '.repeat(8193)})).status,413)
      assert.equal((await request(route+'/preview?owner='+p.owner,{method:'POST',cookie:alice,body:input})).status,400)
      const view=await preview(p);noStore(view);const original=f.patchOriginal(view.body)
      for(const patch of [{selected_keys:['goal']},{human_patch:{goal:'forged'}},{result:{}},{identity:f.identities.alice},{owner_user_id:p.owner},{expected_patch_sha256:'0'.repeat(64)}]){
        const r=await request(route+'/accept',{method:'POST',cookie:alice,body:{...original,...patch}});assert.equal(r.status,Object.hasOwn(patch,'expected_patch_sha256')?409:400);assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE|pg_catalog|SELECT|api_key/)
      }
      assert.equal(await f.patchSnapshot(),before);assert.ok(state.policyCalls>policyBefore);assert.equal(state.oidcFallbacks,0)
    })

    await t.test('actual HTTP partial1..4 and full5 commit true055/045 plus new witness while preserving all protected fields',async()=>{
      const cases=[()=>({goal:'HTTP一字段 '+randomUUID()}),()=>({goal:'HTTP二字段 '+randomUUID(),task_scope:''}),()=>({goal:'HTTP三字段 '+randomUUID(),deliverables:[],task_plan:['实施']}),()=>({goal:'HTTP四字段 '+randomUUID(),task_scope:'描述',deliverables:['交付'],done_criteria:['留证']}),full]
      for(const [index,descriptive] of cases.entries()){
        const p=await f.patchReady({descriptive,isolatedReviewModel:true}),view=await preview(p),original=f.patchOriginal(view.body),before=await f.agents.get(p.identity,p.role.id)
        assert.equal(view.body.model_patch.provided_keys.length,index+1);assert.deepEqual([...view.body.model_patch.provided_keys].sort(),Object.keys(p.result.descriptive).sort())
        const r=await request(route+'/accept',{method:'POST',cookie:alice,body:original});assert.equal(r.status,200);assert.equal(r.body.replayed,false);assert.equal(r.body.recorded,true);noStore(r);noPrivate(r.body)
        const after=await f.agents.get(p.identity,p.role.id);assert.equal(after.revision,before.revision+1);assert.equal(after.name,before.name);assert.deepEqual(withoutD(after.spec),withoutD(before.spec));assert.equal(after.spec.require_approval,true)
        for(const key of ['goal','task_scope','deliverables','task_plan','done_criteria'])assert.deepEqual(after.spec[key],Object.hasOwn(p.result.descriptive,key)?p.result.descriptive[key]:before.spec[key])
        assert.deepEqual(r.body.provided_keys,view.body.model_patch.provided_keys)
        const chain=(await f.db.query('SELECT w.before_revision_id,w.after_revision_id,w.optimization_candidate_sha256,l.candidate_sha256,l.run_id FROM agentstudio.agent_descriptive_patch_acceptances w JOIN agentstudio.agent_optimization_links l USING(owner_user_id,request_id) WHERE w.owner_user_id=$1 AND w.request_id=$2',[p.owner,original.request_id])).rows[0]
        assert.ok(chain);assert.equal(chain.before_revision_id,r.body.before.revision_id);assert.equal(chain.after_revision_id,r.body.after.revision_id);assert.equal(chain.optimization_candidate_sha256,chain.candidate_sha256);assert.equal(chain.run_id,view.body.anchor.run_id)
        const kinds=(await f.db.query('SELECT kind FROM agentstudio.agent_collaboration_revisions WHERE id=ANY($1::uuid[]) ORDER BY kind',[[chain.before_revision_id,chain.after_revision_id]])).rows.map(r=>r.kind)
        assert.deepEqual(kinds,['before_edit','edited'])
      }
    })

    await t.test('real repository independently requires configuration AND fresh opt-in while shared policy preserves readonly and original endpoints',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),view=await preview(p),original=f.patchOriginal(view.body)
      try{
        for(const [config,fresh] of [[false,false],[true,false],[false,true]]){
          await scopes(config,fresh);await capabilities(config,fresh);const before=await f.patchSnapshot(),r=await request(route+'/accept',{method:'POST',cookie:alice,body:original})
          assert.equal(r.status,403);assert.deepEqual(r.body,{error:'agent_descriptive_patch_acceptance_disabled'});noStore(r)
          assert.equal((await preview(p)).status,200);assert.equal((await request(route+'/confirm',{method:'POST',cookie:alice,body:original})).status,404);assert.equal(await f.patchSnapshot(),before)
        }
        await scopes(true,true);await capabilities(true,true);assert.equal((await request(route+'/accept',{method:'POST',cookie:alice,body:original})).status,200)
      }finally{await scopes(true,true)}
    })

    await t.test('actual HTTP response loss after COMMIT recovers SAME original with both gates closed and after real private-body erasure',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),view=await preview(p),original=f.patchOriginal(view.body),saved=structuredClone(original)
      state.drop=true;state.dropped=false
      try{
        await assert.rejects(request(route+'/accept',{method:'POST',cookie:alice,body:original}));assert.equal(state.dropped,true)
        const rows=(await f.db.query('SELECT review_id FROM agentstudio.agent_descriptive_patch_acceptances WHERE owner_user_id=$1 AND request_id=$2',[p.owner,original.request_id])).rows
        assert.deepEqual(rows,[{review_id:p.raw.request_id}],'lost reply follows a genuine committed new witness')
        await scopes(false,false);await capabilities(false,false);const before=await f.patchSnapshot(),confirmed=await request(route+'/confirm',{method:'POST',cookie:alice,body:original})
        assert.equal(confirmed.status,200);assert.equal(confirmed.body.replayed,true);noStore(confirmed);noPrivate(confirmed.body)
        assert.deepEqual((await request(route+'/accept',{method:'POST',cookie:alice,body:original})).body,confirmed.body)
        assert.deepEqual((await request(route+'/reviews/'+p.raw.request_id,{cookie:alice})).body,confirmed.body);assert.equal(await f.patchSnapshot(),before);assert.deepEqual(original,saved)
        await f.eraseOpinion(p);for(const selected of p.selected)await f.eraseFeedback(selected)
        await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id])
        await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner]);alice=await login('alice')
        assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_assessment_outputs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])).rows[0].n,0)
        assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_feedback_bodies WHERE owner_user_id=$1 AND feedback_id=ANY($2::uuid[])',[p.owner,p.selected.map(s=>s.feedback.feedback_id)])).rows[0].n,0)
        const erased=await f.patchSnapshot()
        for(const [path,body] of [[route+'/reviews/'+p.raw.request_id,undefined],[route+'/confirm',original],[route+'/accept',original]]){
          const r=await request(path,{method:body?'POST':'GET',cookie:alice,body});assert.equal(r.status,200);assert.deepEqual(r.body,confirmed.body);noPrivate(r.body);noStore(r)
        }
        assert.equal(await f.patchSnapshot(),erased)
        assert.equal((await request(route+'/reviews/'+p.raw.request_id,{cookie:bob})).status,404)
      }finally{state.drop=false;await scopes(true,true)}
    })

    await t.test('actual Bob sessions cannot assume Alice owner and disabled Alice Cookie cannot recover until valid employee login',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),view=await preview(p),original=f.patchOriginal(view.body),before=await f.patchSnapshot()
      for(const [path,body] of [[route+'/preview',previewInput(p)],[route+'/accept',original],[route+'/confirm',original],[route+'/reviews/'+p.raw.request_id,undefined]])assert.equal((await request(path,{method:body?'POST':'GET',cookie:bob,body})).status,404)
      assert.equal((await request(route+'/accept',{method:'POST',cookie:alice,body:original})).status,200)
      const receipt=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice});assert.equal(receipt.status,200)
      const accepted=await f.patchSnapshot();assert.notEqual(accepted,before)
      await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false,governance_revision=governance_revision+1 WHERE user_id=$1',[p.owner])
      try{
        const r=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice});assert.equal(r.status,401);assert.deepEqual(r.body,{error:'session_required'});assert.equal(await f.patchSnapshot(),accepted)
      }finally{await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=true,governance_revision=governance_revision+1 WHERE user_id=$1',[p.owner]);alice=await login('alice')}
      const restored=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice});assert.equal(restored.status,200);assert.deepEqual(restored.body,receipt.body);assert.equal(await f.patchSnapshot(),accepted)
    })

    await t.test('real FULL060 catalog failure stays private and closed even on immutable recovery while fresh/config off',async()=>{
      const p=await f.patchReady({isolatedReviewModel:true}),original=f.patchOriginal((await preview(p)).body)
      assert.equal((await request(route+'/accept',{method:'POST',cookie:alice,body:original})).status,200)
      await scopes(false,false);const before=await f.patchSnapshot()
      await f.db.exec('ALTER FUNCTION agentstudio.agent_descriptive_patch_receipt(uuid,text) RESET search_path')
      try{
        await assert.rejects(inspectAgentDescriptivePatchSchema(f.pool),/unsafe_agent_descriptive_patch_privileges/)
        const r=await request(route+'/reviews/'+p.raw.request_id,{cookie:alice});assert.equal(r.status,500);assert.deepEqual(r.body,{error:'internal_error'});noStore(r)
        assert.doesNotMatch(JSON.stringify(r.body),/search_path|pg_catalog|agentstudio|SELECT|unsafe_agent/)
      }finally{await f.db.exec('ALTER FUNCTION agentstudio.agent_descriptive_patch_receipt(uuid,text) SET search_path=pg_catalog');await scopes(true,true)}
      assert.equal(await inspectAgentDescriptivePatchSchema(f.pool),true);assert.equal((await request(route+'/reviews/'+p.raw.request_id,{cookie:alice})).status,200);assert.equal(await f.patchSnapshot(),before)
    })

    await t.test('actual old059/new060 HTTP routes accept a full5 review only once in either order with one real055/history lineage',async()=>{
      for(const first of ['old059','new060']){
        const p=await f.patchReady({descriptive:full(),isolatedReviewModel:true}),newOriginal=f.patchOriginal((await preview(p)).body)
        const oldPreview=await request(oldRoute+'/preview',{method:'POST',cookie:alice,body:previewInput(p)});assert.equal(oldPreview.status,200)
        const oldOriginal=f.h.generatedAcceptanceChoice(oldPreview.body),before=await f.agents.get(p.identity,p.role.id)
        const winner=await request((first==='old059'?oldRoute:route)+'/accept',{method:'POST',cookie:alice,body:first==='old059'?oldOriginal:newOriginal});assert.equal(winner.status,200)
        const committed=await f.patchSnapshot(),loser=await request((first==='old059'?route:oldRoute)+'/accept',{method:'POST',cookie:alice,body:first==='old059'?newOriginal:oldOriginal})
        assert.equal(loser.status,409);assert.equal(await f.patchSnapshot(),committed);assert.equal((await f.agents.get(p.identity,p.role.id)).revision,before.revision+1)
        const counts=(await f.db.query(`SELECT
          (SELECT count(*)::integer FROM agentstudio.agent_generated_acceptances WHERE owner_user_id=$1 AND review_id=$2) AS old,
          (SELECT count(*)::integer FROM agentstudio.agent_descriptive_patch_acceptances WHERE owner_user_id=$1 AND review_id=$2) AS patch,
          (SELECT count(*)::integer FROM agentstudio.agent_optimization_links WHERE owner_user_id=$1 AND request_id=ANY($3::uuid[])) AS links,
          (SELECT count(*)::integer FROM agentstudio.agent_collaboration_revisions WHERE id=ANY($4::uuid[])) AS history`,[p.owner,p.raw.request_id,[oldOriginal.request_id,newOriginal.request_id],[winner.body.before.revision_id,winner.body.after.revision_id]])).rows[0]
        assert.equal(counts.old+counts.patch,1);assert.equal(counts.old,first==='old059'?1:0);assert.equal(counts.patch,first==='new060'?1:0);assert.equal(counts.links,1);assert.equal(counts.history,2)
      }
      assert.equal(state.oidcFallbacks,0);assert.ok(state.policyCalls>0)
    })
  }finally{
    if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    await authPool.end();await f.close()
  }
})
