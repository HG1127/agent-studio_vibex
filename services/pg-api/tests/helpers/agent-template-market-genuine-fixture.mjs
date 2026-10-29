// Actual new-purpose F07 PG18/Native HTTPS fixture. No pool/file/socket before
// the strict F07 wrapper. No F01-purpose impersonation, PGlite or auditor stub.
import {requireAgentTemplateMarketGenuineCi} from './agent-template-market-genuine-guard.mjs'

// SOURCE_PINS_INSERTED_BY_AUTHOR_FROM_ACTUAL_REVIEWED_H
export const agentTemplateMarketGenuineFrozenSources=Object.freeze({
  "db/postgres/migrations/pg_v9_062_agent_design.sql": "bd735c5a61dab098c846c93e30a2fad636b409ded40064a8cf311e0710a1e82e",
  "db/postgres/migrations/pg_v9_063_agent_template_market.sql": "b582c1ab75780b36828f0f81c926f0bf9eb727a5b78d24be9fb838b5a9d1c80b",
  "services/pg-api/src/agent-design-audit-core.ts": "31d99e0f28c9d04402ec1b75db3714a41947c296cfba74a99d3dabcdf182a872",
  "services/pg-api/src/agent-design-audit.ts": "1efe6de5bea8e14fa4b957e050edddcfee9a595f438d636f9a4046cce0921f78",
  "services/pg-api/src/agent-template-market-audit-core.ts": "1f2c8edd622d4ade4f4198e0a7bd1c64e71be18944682b3b892fa37c87565e65",
  "services/pg-api/src/agent-template-market-audit.ts": "6fbc677dc83b845ab39ad7bb893309c8f1f2efc4be7eb41fff11d37255ff6d37",
  "services/pg-api/src/agent-template-market-runtime-policy.ts": "7ab3bb7ab746615d297d594b93910321ae580f2a1d1e0a8c668ff7bd5ab3345c",
  "services/pg-api/src/agent-template-market-repository.ts": "0627b514b7d0a797c9f66c4bb243dc2dd8d7adceb4cfb731387cb201f96d1b77",
  "services/pg-api/src/agent-template-market-http.ts": "ed5fed1c84e5c49b95eb4ccd8decc3aa24b4126a375a9f96eecce9ed08ebf421",
  "services/pg-api/src/agent-template-market-contract.ts": "345d339ad6a7499a7c64005dfa429ff1187c24c3a285a356a992f675a2c2e819",
  "services/pg-api/src/agent-template-market-result.ts": "d9d420f346dc5cc8915e77b3ce3593e2b6fdecec9988ffcbe55949f6cedb0953",
  "services/pg-api/src/native-auth-http.mjs": "602361e783e85c0c95faa26fb7cf127d11f300562fb73275f6aa7c6482cb9585"
})

export async function agentTemplateMarketGenuineFixture(env=process.env,{browserMode=false}={}){
  const target=requireAgentTemplateMarketGenuineCi(env)
  if(browserMode!==(env.GITHUB_JOB==='pg18-template-market-browser'))throw Error('agent_template_market_genuine_job_mode_required')
  const [assertModule,fs,path,url,crypto]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')])
  const assert=assertModule.default,root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url))),{createHash,randomUUID}=crypto
  if(Object.keys(agentTemplateMarketGenuineFrozenSources).length<12)throw Error('agent_template_market_reviewed_source_pins_required')
  for(const [relative,expected]of Object.entries(agentTemplateMarketGenuineFrozenSources)){
    if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))throw Error('agent_template_market_reviewed_source_pin_pending')
    const raw=fs.readFileSync(path.join(root,relative));assert.equal(createHash('sha256').update(raw).digest('hex'),expected,'Root must update exact reviewed F07 provenance after final integration')
  }
  const [https,pgModule,baseModule,tlsModule,nativeModule,authModule,cookieModule,marketAudit,marketRepo,marketHttp,policy,contracts,toolsModule,knowledgeModule,httpModule,workflowModule]=await Promise.all([
    import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-http.mjs'),
    import('../../src/native-auth-repository.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/agent-template-market-audit.ts'),
    import('../../src/agent-template-market-repository.ts'),import('../../src/agent-template-market-http.ts'),import('../../src/agent-template-market-runtime-policy.ts'),
    import('../../src/contracts.ts'),import('../../src/tool-connection-repository.ts'),import('../../src/knowledge-repository.ts'),import('../../src/http.ts'),import('../../src/workflow-repository.ts')])
  const audit=marketAudit.verifyAgentTemplateMarketCredentials
  if(typeof audit!=='function')throw Error('agent_template_market_actual_auditor_required')
  let base,nativeServer,lifetime,resolveLifetime,readyResolve,readyReject,serverTls,nativeOrigin,allowedOrigin,closed=false,dispatches=0
  const extraPools=[],cookies=new Map(),events=[]
  const mutable={available:true,writes:true,dropNext:null,beforeAuthenticate:null,afterBusiness:null}
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{resolveLifetime=resolve})
  const bounded=async(promise,ms=15000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('agent_template_market_fixture_timeout')),ms)})])}finally{clearTimeout(timer)}}
  const connect=(login,password)=>{const pool=new pgModule.default.Pool({...target,user:login,password,max:4,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});extraPools.push(pool);return{knowledgeSharing:true,connect:()=>pool.connect()}}
  const passwordFor=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
  const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
  const raw=(selectedUrl,{method='GET',body,cookie,headers={}}={})=>{
    const selected=new URL(selectedUrl);assert.equal(selected.protocol,'https:');assert.equal(selected.hostname,'localhost');assert.ok(nativeOrigin&&selected.origin===nativeOrigin)
    const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),max=selected.pathname.endsWith('/market')?33554432:524288
    return new Promise((resolve,reject)=>{
      const req=https.request({hostname:'127.0.0.1',port:Number(selected.port),servername:'localhost',path:selected.pathname+selected.search,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',Origin:allowedOrigin,
        ...(method!=='GET'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{
        const chunks=[];let size=0
        res.on('data',piece=>{size+=piece.length;if(size>max){res.destroy(Error('agent_template_market_fixture_response_bound'));return};chunks.push(Buffer.from(piece))})
        res.once('error',reject);res.once('aborted',()=>reject(Error('agent_template_market_genuine_response_lost')))
        res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),headers:res.headers})}catch{reject(Error('agent_template_market_genuine_invalid_response'))}})
      });req.once('error',reject);req.end(bytes)
    })
  }
  const request=(who,selectedPath,body,options={})=>raw(nativeOrigin+selectedPath,{...options,method:options.method??(body===undefined?'GET':'POST'),body,cookie:cookies.get(who)})
  const login=async who=>{assert.ok(Object.hasOwn(credentials,who));const response=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(response.status,200);const values=response.headers['set-cookie'];assert.ok(Array.isArray(values));const cookie=values.find(value=>value.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie}
  const close=async()=>{
    if(closed)return;closed=true
    const failures=[]
    if(nativeServer){nativeServer.closeAllConnections();await bounded(new Promise(resolve=>nativeServer.close(resolve))).catch(error=>failures.push(error))}
    resolveLifetime();await bounded(lifetime??Promise.resolve()).catch(error=>failures.push(error))
    await bounded(Promise.allSettled(extraPools.map(pool=>pool.end()))).then(results=>{for(const result of results)if(result.status==='rejected')failures.push(result.reason)},error=>failures.push(error))
    try{await base?.close()}catch(error){failures.push(error)}cookies.clear()
    if(failures.length)throw new AggregateError(failures,'agent_template_market_genuine_cleanup_failed')
  }
  try{
    base=await baseModule.agentAssessmentTcpFixture(env)
    for(const part of['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market'])await base.db.exec(base.sql('migrations/pg_v9_'+part+'.sql'))
    const adminPool=connect(target.user,target.password),authPool=connect('agentstudio_native_login',passwordFor('agentstudio_native_login')),auth=new authModule.NativeAuthRepository(authPool)
    // Failure-only diagnostics on startup's still-checked-out actual client.
    // Runtime repositories and expected negative catalog cases keep audit itself.
    const startupAudit=async db=>{try{return await audit(db)}catch(originalError){
      try{const {rethrowAgentTemplateMarketAuditFailureWithDiagnostics}=await import('./agent-template-market-catalog-diagnostics.mjs');await rethrowAgentTemplateMarketAuditFailureWithDiagnostics(db,originalError,env)}
      finally{throw originalError}
    }}
    await policy.inspectAgentTemplateMarketApiPool(base.pool,startupAudit)
    const repository=()=>new marketRepo.AgentTemplateMarketRepository(base.pool,{available:mutable.available,allowWrites:mutable.writes&&mutable.available,verifyCredentials:audit})
    const counts=async()=> (await base.db.query(`SELECT
      (SELECT count(*)::integer FROM agentstudio.agent_template_market_publications) AS publications,
      (SELECT count(*)::integer FROM agentstudio.agent_template_market_snapshots) AS snapshots,
      (SELECT count(*)::integer FROM agentstudio.agent_template_market_receipts) AS receipts,
      (SELECT count(*)::integer FROM agentstudio.agent_template_market_tombstones) AS tombstones,
      (SELECT count(*)::integer FROM agentstudio.agent_specs) AS agents,
      (SELECT count(*)::integer FROM agentstudio.agent_collaboration_revisions) AS history,
      (SELECT count(*)::integer FROM agentstudio.audit_events WHERE action LIKE 'agent.template_market.%') AS audit,
      (SELECT count(*)::integer FROM agentstudio.agent_design_requests) AS design_requests,
      (SELECT count(*)::integer FROM agentstudio.agent_design_reservations) AS design_reservations,
      (SELECT count(*)::integer FROM agentstudio.agent_review_requests) AS review_requests,
      (SELECT count(*)::integer FROM agentstudio.runs) AS runs,
      (SELECT count(*)::integer FROM agentstudio.external_effects) AS old_effects`)).rows[0]
    const modelBaseline=await counts()
    lifetime=tlsModule.withDisposableBoundModelTls(async()=>{dispatches++;throw Error('unexpected_F07_model_dispatch')},async tls=>{
      assert.ok(tls.serverTls);serverTls=tls.serverTls
      let nativeHandler
      nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return};void nativeHandler(req,res).catch(()=>res.destroy())})
      await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)})
      nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
      const selected=policy.selectNativeAgentTemplateMarketCapabilities(env,true,allowedOrigin,true)
      assert.equal(selected.available,true,'Root must explicitly opt in F07 Native available in the isolated job');assert.equal(selected.writes,true,'Root must explicitly opt in initial F07 writes')
      nativeHandler=async(req,res)=>{
        const product=repository(),observed={}
        for(const operation of['sources','source','market','mine','detail','previewPublish','previewUse','record','recover'])observed[operation]=async(...args)=>{
          const value=await product[operation](...args)
          events.push({kind:'business',operation})
          if(mutable.afterBusiness)await mutable.afterBusiness({operation,identity:structuredClone(args[0]),input:args[1]===undefined?undefined:structuredClone(args[1])})
          return value
        }
        let generic,family,native
        native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowAgentTemplateMarket:mutable.available,allowAgentTemplateMarketWrites:mutable.available&&mutable.writes,businessHandler:async(incoming,outgoing)=>{if(await family(incoming,outgoing))return;return generic(incoming,outgoing)}})
        const authenticateRequest=async incoming=>{if(mutable.beforeAuthenticate)await mutable.beforeAuthenticate({path:incoming.url,method:incoming.method});return native.authenticateRequest(incoming)}
        family=marketHttp.createAgentTemplateMarketHttpHandler({repository:observed,authenticateRequest,allowedOrigin})
        generic=httpModule.createHandler({repository:base.agents,modelConnectionRepository:base.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(base.pool,base.key),workflowRepository:new workflowModule.WorkflowRepository(base.pool),knowledgeRepository:new knowledgeModule.KnowledgeBaseRepository(base.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F07_genuine_Native_cookie_only')}})
        const drop=mutable.dropNext
        if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
        return native.handler(req,res)
      }
      await login('alice');await login('bob');readyResolve();await finish
    },{listenPort:0,includeServerTls:true}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{});await ready
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const actual=await auth.verifySession(token);assert.ok(actual);return actual}
    const governance=async(who,enabled)=>{const response=await request('alice','/api/native-auth/employees');assert.equal(response.status,200);const row=response.body.items.find(item=>item.id===base.users[who]);assert.ok(row);const changed=await request('alice','/api/native-auth/employees/change',{request_id:randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true});assert.equal(changed.status,200);return changed.body}
    const withHttpSource=async(who='alice')=>{const identity=await identityFor(who),tools=new toolsModule.ToolConnectionRepository(base.pool,base.key),tool=await tools.create(identity,{name:'F07 owner HTTP '+who,description:'Synthetic owner connector',method:'GET',url:'https://example.com/',headers:[{key:'X-F07-Private',value:'F07-private-header-never-public'}],body_template:'',timeout_s:5,enabled:true});const previous=await base.agents.get(identity,base.resources[who].spec.id),{require_approval:_approval,...before}=previous.spec;const role=await base.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...before,tools:[...new Set([...before.tools,'http_f07'])],http_tools:[{name:'http_f07',description:'F07 private HTTP connector',connection_id:tool.id,connection_revision:tool.revision}]}),previous.revision);assert.ok(role);return{tool,role,identity,tools}}
    const withKnowledgeSource=async(who='alice')=>{const identity=await identityFor(who),bases=new knowledgeModule.KnowledgeBaseRepository(base.pool),baseRow=await bases.create(identity,'F07 owner KB '+who,'Synthetic private source');await bases.createTextDocument(identity,baseRow.id,{filename:'f07-private.txt',text:'F07-private-document-never-public'});const previous=await base.agents.get(identity,base.resources[who].spec.id),{require_approval:_approval,...before}=previous.spec;const role=await base.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...before,tools:[...new Set([...before.tools,'knowledge_search'])],knowledge_base_ids:[baseRow.id]}),previous.revision);assert.ok(role);return{base:baseRow,role,identity}}
    const assertNoModelEffects=async()=>{assert.equal(dispatches,0);const after=await counts();for(const key of['design_requests','design_reservations','review_requests','runs','old_effects'])assert.equal(after[key],modelBaseline[key],'F07 must not create '+key)}
    return{...base,target,adminPool,authPool,auth,audit,repository,request,login,identityFor,credentials,mutable,nativeOrigin,allowedOrigin,serverTls,counts,governance,withHttpSource,withKnowledgeSource,events,assertNoModelEffects,close}
  }catch(error){await close();throw error}
}
