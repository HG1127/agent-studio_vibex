// F01 test-only actual PG18/Native HTTPS/mTLS fixture. Import is side-effect free.
// Ordinary hosts fail before pg/fixture imports, Pool, SQL, files or sockets.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

const workflow='Agent Studio F01 Agent Design genuine PG18 isolated verification'
const jobs=new Set(['pg18-agent-design-genuine','pg18-agent-design-browser'])
// Reviewed runtime source pins are test provenance only. They never authorize
// a role: every positive still executes the actual original-client auditor.
export const agentDesignGenuineFrozenSources=Object.freeze({
  "db/postgres/migrations/pg_v9_062_agent_design.sql": "bd735c5a61dab098c846c93e30a2fad636b409ded40064a8cf311e0710a1e82e",
  "services/pg-api/src/agent-design-audit-core.ts": "31d99e0f28c9d04402ec1b75db3714a41947c296cfba74a99d3dabcdf182a872",
  "services/pg-api/src/agent-design-audit.ts": "1efe6de5bea8e14fa4b957e050edddcfee9a595f438d636f9a4046cce0921f78",
  "services/pg-api/src/native-auth-http.mjs": "9e685f0ca21bd6ada835aa69af44508b207bbc8001b765685a624722bf72fa6f",
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "services/pg-api/src/agent-design-value-contract.ts": "a7e6ca69da599cd6423feb300010d6297fc104b5bd11c7864aa9000c86dc2110",
  "services/pg-api/src/agent-design-contract.ts": "29a358f47c84a6be8b8385cf3b878fb78989a97b00811a9fc99327aff6008542",
  "services/pg-api/src/agent-design-rpc-contract.ts": "57bbccd6657dbc680fa47d917efc6fb8b5dcadead37c4e91cd06e1bc3783e823",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/approval-delegation-audit-core.ts": "7a2b204e095b4f31632b61d1e6ecfeffca040b41aaf5ac27fa82d30f5cdd5396",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "206cce0bb3cca19cdf169f22dfbc2cb971b9c73925ffc9ef48abfe99138c884a",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "ed429165f1fba857b986a2248c46f289aca220a01e4fe4a77ad27c278ef9968d",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "496621ea40c73bb0aaa02703047bc306788eb970ff4b9a6cb716a56ad871e3fa",
  "services/pg-api/src/http.ts": "68e7d8b34791dbf44e2ed52314aa2620f43b33ed3e62642988c4c60c3abf318f",
  "services/pg-api/src/native-auth-http.d.mts": "c28022dc065f11aa934ef16058cf11b0051325aa81dc53ed5993a1b411f41963",
  "services/pg-api/src/native-config-uat-policy.ts": "a22cfe6b0ce07e54fb6010367fb2001052c782f2e0b4d8ef667e05c38003e331",
  "services/pg-api/src/native-server.ts": "2680c2370c193d690791e8096bb5ea2ffaa69d24a30e2c01edb64641d9627390",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "35b9aa6e2fd95cfde2b514c7c8a33bcb153673acbffa22db14187d61dd6db686",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "85a1e2ee7122ab005271eddfab7c76beb53ec4c5d470f15393c815f535b2cc74",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "97675ea3f633525ce529e5fa39099b0d030211dcae6fb50843d5b5ac051e7856",
  "services/pg-api/src/pg18-complete-profile.ts": "56d14a2a16bcc78330308c7a9f99c804ad5a6b3558b7b140f612ae34da5979ff",
  "services/pg-api/src/run-repository.ts": "303c2b60256dc42295d74702e14b0ab07d5a556dbe7bd5fbce6fd6c999421f15",
  "services/pg-api/src/worker-heartbeat-activation-control.ts": "edc0956ec2820bf701a147111d37e7e40eb21dd664d1c90f231a964e7831a8d6",
  "services/pg-api/src/workflow-v2-run-repository.ts": "6c0a8a3be99f08f692a2ce8a1133911260dfeae5a9206e4932856c4ed36ee487",
  "services/pg-api/src/workflow-v2-worker.ts": "3100b792b0a2fc6d2b9b16e69d82fa1245b61534586ee1a77abf4d358e35bfe7",
  "shared/approval-delegation-contract.ts": "258990650146987fe4306abf1a21e1b27954cdac9bbf3c58fb0366563b323c26",
  "src/lib/pgNativeAgentCreateJourney.ts": "5063c237e5d1c2fb7ef67bac18f76d488a10560add4ba90216064cdf87c9499d",
  "src/lib/pgNativeAgentCreateJourneyCache.ts": "d1a88ef5b2980cee63c1419912028ea41416a407c4c1bbada87d55be4c1ca06b",
  "src/lib/pgNativeAgentRunControl.ts": "149d2df06e614b2fc6b85945d9837e6b0be43ae702d23b520d66d5f814f2f622",
  "src/lib/pgNativeApprovalDelegationSession.ts": "7c63f1c1c2a69799686c7c7b9ca497d1170af7ff11d4643679ff9d8cb1aa6da4",
  "src/lib/pgNativeApprovalDelegations.ts": "dbc833a13803a9a3355de49b5f922754db53a0e8f405463c5dec97eebd5510a1",
  "src/lib/pgNativeAutonomousAgentSession.ts": "cb51f3680021377041dac425b4767172debaa853b47a68cbaf3562855ee50d4b",
  "src/lib/pgNativeDurableRunSession.ts": "60510959997a035535c66556ccf9ccc0a344b155e4ccd90c5b286a768a33d71d",
  "src/lib/pgNativePilotApi.ts": "53e514d3eb8980a189d7e9a6b2b5009292a25d505a38bfdcd1d379ac10f26ddb",
  "src/lib/pgNativeStudioNavigation.ts": "8509911393486f8f092386a34234f8d521185865325c8619281a3b9098135991",
  "src/pages/PgNativePilot/PgNativeAgentCreateJourney.tsx": "b7f42039e592775dfc96b063c14cd4686eac4f8f1b79d5b54caa6ca2dfd7ba8e",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "e3f8ebac7e181e783ae7e93be6f649c940f7a06abde745d697d580db9d2b90c9",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "88abe0b779b09e5b769d591724ed428b096aecfc3ec8d196339255caa1bd1958",
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec"
})
export function requireAgentDesignGenuineCi(env=process.env,platform=process.platform,uid=process.getuid?.()??0){
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!==workflow||!jobs.has(env.GITHUB_JOB)||env.AGENT_STUDIO_F01_GENUINE_CI!=='YES_DISPOSABLE_F01_ONLY'||Object.keys(env).some(k=>env[k]!==undefined&&['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(k)))throw Error('refuse_non_ephemeral_agent_design_genuine_ci')
  return requireEphemeralPg18Ci(env)
}

export async function agentDesignGenuineFixture(env=process.env,{browserMode=false}={}){
  const target=requireAgentDesignGenuineCi(env)
  if(browserMode!==(env.GITHUB_JOB==='pg18-agent-design-browser'))throw Error('agent_design_genuine_job_mode_required')
  const [assertModule,crypto,https,pgModule,baseModule,tlsModule,nativeModule,authModule,cookieModule,designHttp,designLedger,designBroker,designWorker,designClient,designPolicy,designContract,designResult,contracts,toolsModule,knowledgeModule,accessModule]=await Promise.all([
    import('node:assert/strict'),import('node:crypto'),import('node:https'),import('pg'),import('./agent-assessment-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),import('../../src/native-auth-http.mjs'),import('../../src/native-auth-repository.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/agent-design-http.ts'),import('../../src/agent-design-ledger.ts'),import('../../src/agent-design-broker.ts'),import('../../src/agent-design-worker.ts'),import('../../src/agent-design-client.ts'),import('../../src/agent-design-runtime-policy.ts'),import('../../src/agent-design-contract.ts'),import('../../src/agent-design-result.ts'),import('../../src/contracts.ts'),import('../../src/tool-connection-repository.ts'),import('../../src/knowledge-repository.ts'),import('../../src/knowledge-access-repository.ts')])
  const assert=assertModule.default,{randomUUID,createHash}=crypto,{AgentDesignLedgerRepository}=designLedger
  const fs=await import('node:fs')
  for(const [relative,expected] of Object.entries(agentDesignGenuineFrozenSources)){
    const raw=fs.readFileSync(new URL('../../../../'+relative,import.meta.url))
    assert.equal(createHash('sha256').update(raw).digest('hex'),expected,'Root must install the frozen final DB source, never a drafting template')
  }
  const audit=await designPolicy.loadAgentDesignAuditVerifier() // actual final DB author module; no stub/fallback
  const f=await baseModule.agentAssessmentTcpFixture(env),extraPools=[],cookies=new Map(),events=[],providerRequests=[],proofs=[],providerErrors=[],ticks=new Set()
  const activation={executionEnabled:true,executionApproval:designPolicy.agentDesignExecutionApproval,audit}
  const gates=new Set(),postWaiters=[],mutable={submissions:true,saves:true,dropSubmit:false,dropSave:false,dropPrivate:false,afterPost:null,beforeDispatch:null,providerMode:'success'}
  const output=(who='alice')=>({name:'F01 Genuine Designed Agent '+who,goal:'Synthetic complete design goal '+who,task_scope:'Synthetic complete task scope',deliverables:['Synthetic deliverable one','Synthetic deliverable two'],tools:['Advisory capability only'],task_plan:['Synthetic step one','Synthetic step two'],done_criteria:['Synthetic done criterion']})
  const apiPassword=login=>createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80)
  const connect=(login,password)=>{const pool=new pgModule.default.Pool({...target,user:login,password,max:4,statement_timeout:10000,query_timeout:15000});pool.on('error',()=>{});extraPools.push(pool);return {knowledgeSharing:true,connect:()=>pool.connect()}}
  const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
  let nativeServer,privateClient,worker,broker,lifetime,resolveLifetime,readyResolve,readyReject,serverTls,nativeOrigin,allowedOrigin,closed=false
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
  const finish=new Promise(resolve=>{resolveLifetime=resolve})
  const bounded=async(promise,ms=10000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('agent_design_genuine_cleanup_timeout')),ms)})])}finally{clearTimeout(timer)}}
  const raw=(url,{method='GET',body,cookie,headers={}}={})=>{
    const selected=new URL(url);assert.equal(selected.protocol,'https:');assert.equal(selected.hostname,'localhost');assert.ok(nativeOrigin&&selected.origin===nativeOrigin)
    const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
    return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:Number(selected.port),servername:'localhost',path:selected.pathname+selected.search,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',Origin:allowedOrigin,...(method==='POST'?{'Content-Type':'application/json','X-AgentStudio-Request':'1'}:{}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>524288){res.destroy();return};chunks.push(Buffer.from(b))});res.once('error',reject);res.once('aborted',()=>reject(Error('agent_design_genuine_response_lost')));res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),headers:res.headers})}catch{reject(Error('agent_design_genuine_invalid_response'))}})});req.once('error',reject);req.end(bytes)})
  }
  const request=(who,path,body,options={})=>raw(nativeOrigin+path,{...options,method:body===undefined?'GET':'POST',body,cookie:cookies.get(who)})
  const login=async who=>{const response=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(response.status,200);const values=response.headers['set-cookie'];assert.ok(Array.isArray(values));const cookie=values.find(v=>v.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie}
  const counts=async()=> (await f.db.query(`SELECT
    (SELECT count(*)::integer FROM agentstudio.agent_design_requests) AS requests,
    (SELECT count(*)::integer FROM agentstudio.agent_design_reservations) AS reservations,
    (SELECT count(*)::integer FROM agentstudio.agent_design_outcomes) AS outcomes,
    (SELECT count(*)::integer FROM agentstudio.agent_design_outputs) AS outputs,
    (SELECT count(*)::integer FROM agentstudio.agent_design_save_receipts) AS saves,
    (SELECT count(*)::integer FROM agentstudio.agent_collaboration_revisions) AS history,
    (SELECT count(*)::integer FROM agentstudio.agent_specs) AS agents,
    (SELECT count(*)::integer FROM agentstudio.runs) AS runs,
    (SELECT count(*)::integer FROM agentstudio.external_effects) AS old_effects`)).rows[0]
  const record=async(owner,requestId)=>(await f.db.query(`SELECT r.*,j.state,
    (SELECT count(*)::integer FROM agentstudio.agent_design_reservations e WHERE e.owner_user_id=r.owner_user_id AND e.request_id=r.request_id) AS reservations,
    (SELECT count(*)::integer FROM agentstudio.agent_design_outputs o WHERE o.owner_user_id=r.owner_user_id AND o.request_id=r.request_id) AS outputs,
    (SELECT count(*)::integer FROM agentstudio.agent_design_save_receipts s WHERE s.owner_user_id=r.owner_user_id AND s.design_request_id=r.request_id) AS saves,
    (SELECT count(*)::integer FROM agentstudio.agent_design_tombstones t WHERE t.owner_user_id=r.owner_user_id AND t.request_id=r.request_id) AS tombstones
    FROM agentstudio.agent_design_requests r JOIN agentstudio.agent_design_jobs j USING(owner_user_id,request_id) WHERE r.owner_user_id=$1 AND r.request_id=$2`,[owner,requestId])).rows[0]
  const wireControl=async(who,requestId,action)=>{const body={action,request_id:randomUUID(),design_request_id:requestId,confirm:true},response=await request(who,'/api/v2/agent-design/control',body);assert.equal(response.status,200);return {body,response}}
  const close=async()=>{
    if(closed)return;closed=true
    const failures=[]
    for(const release of gates)release();gates.clear();worker?.closeNewClaims();privateClient?.close();broker?.close()
    await bounded(Promise.allSettled([...ticks]),60000).catch(e=>failures.push(e))
    if(nativeServer){nativeServer.closeAllConnections();await bounded(new Promise(resolve=>nativeServer.close(resolve))).catch(e=>failures.push(e))}
    resolveLifetime();await bounded(lifetime??Promise.resolve(),15000).catch(e=>failures.push(e))
    try{const results=await bounded(Promise.allSettled(extraPools.map(p=>p.end())));for(const r of results)if(r.status==='rejected')failures.push(r.reason)}catch(e){failures.push(e)}
    await f.close();cookies.clear();if(failures.length)throw new AggregateError(failures,'agent_design_genuine_cleanup_failed')
  }
  try{
    // Existing fixture verifies fresh real18/5432 server and installs001-057.
    // These fixed final sources must exist after Root merges the DB author's062.
    for(const part of ['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design'])await f.db.exec(f.sql('migrations/pg_v9_'+part+'.sql'))
    const designPassword=kind=>createHash('sha512').update(target.password+':F01-design:'+kind).digest('hex').slice(0,80)
    const {makeNativeScramVerifier}=await import('../../src/native-activation-cli.mjs')
    for(const [login,role,kind] of [['synthetic_design_worker','agentstudio_design_worker','worker'],['synthetic_design_dispatch','agentstudio_design_dispatch','dispatch']]){
      await f.db.exec('CREATE ROLE '+login+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+makeNativeScramVerifier(designPassword(kind))+"'")
      await f.db.exec('GRANT '+role+' TO '+login+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
    }
    const workerPool=connect('synthetic_design_worker',designPassword('worker')),dispatchPool=connect('synthetic_design_dispatch',designPassword('dispatch')),adminPool=connect(target.user,target.password)
    const authPool=connect('agentstudio_native_login',apiPassword('agentstudio_native_login')),auth=new authModule.NativeAuthRepository(authPool)
    // Observe actual original connections only. Queries/results are untouched;
    // no fake metadata, role identity or permission projection is substituted.
    let credentialReads=0
    const secretPool={async connect(){const db=await f.secretPool.connect();return {async query(sql,args=[]){if(sql.includes('api_key_ciphertext')){
      const proof=proofs.at(-1);assert.ok(proof)
      const reservations=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.agent_design_reservations WHERE owner_user_id=$1 AND request_id=$2',[args[1],proof.request_id])).rows[0].n
      assert.equal(reservations,1,'this request reservation is committed on an independent connection before key SELECT')
      const role=(await db.query('SELECT current_user AS role,session_user AS login')).rows[0];assert.equal(role.role,'agentstudio_model_broker');assert.equal(role.login,'synthetic_assessment_secret')
      credentialReads++;events.push({kind:'credential',owner:args[1],connection:args[0],request_id:proof.request_id})
    }return db.query(sql,args)},release:()=>db.release()}}}
    let config
    const resolver={resolve4:async host=>{assert.equal(host,'api.openai.com');return ['93.184.216.34']},resolve6:async()=>[]}
    const providerRequest=(options,callback)=>{
      assert.equal(options.hostname,'api.openai.com');assert.equal(options.port,443);assert.equal(options.path,'/v1/chat/completions');assert.equal(options.method,'POST');assert.equal(options.rejectUnauthorized,true)
      assert.ok(config);return https.request({...options,hostname:'127.0.0.1',port:7459,servername:'localhost',lookup:undefined,ca:config.ca,cert:config.cert,key:config.key,agent:false},callback)
    }
    broker=new designBroker.AgentDesignBroker(f.pool,dispatchPool,secretPool,f.key,{...activation,resolver,request:providerRequest})
    const handlerFactory=tls=>{
      const handle=designClient.createAgentDesignInternalHandler({...activation,...tls,dispatch:proof=>broker.dispatch(proof)})
      return async(req,res)=>{
        if(req.url!=='/v1/chat/completions'){
          if(mutable.dropPrivate&&req.url===designPolicy.agentDesignPrivateRoute){mutable.dropPrivate=false;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
          return handle(req,res)
        }
        try{
          assert.equal(req.socket.authorized,true);assert.equal(req.method,'POST')
          const chunks=[];let size=0;for await(const p of req){size+=p.length;assert.ok(size<=524288);chunks.push(Buffer.from(p))}
          const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))
          const who=['alice','bob'].find(w=>req.headers.authorization==='Bearer synthetic-'+w+'-assessment-key-never-network');assert.ok(who,'actual selected decrypted fixture key reaches only synthetic TLS provider')
          const proof=proofs.at(-1);assert.ok(proof)
          const row=await record(f.users[who],proof.request_id);assert.equal(row.reservations,1)
          const last=events.at(-1);assert.equal(last?.kind,'credential');assert.equal(last.request_id,proof.request_id);assert.equal(last.owner,f.users[who])
          const actual=(await f.db.query('SELECT body FROM agentstudio.agent_design_inputs WHERE owner_user_id=$1 AND request_id=$2',[f.users[who],proof.request_id])).rows[0]?.body
          assert.deepEqual(body.messages,actual.messages);assert.equal(body.model,actual.choice.model_binding.model_id);assert.equal(body.max_completion_tokens,actual.output_token_limit)
          assert.doesNotMatch(JSON.stringify(body),/api_key_ciphertext|knowledge-body-never-send|fixture-header-never-send|owner_user_id|lease_token/)
          providerRequests.push({who,request_id:proof.request_id,input_sha256:row.input_sha256,cap:body.max_completion_tokens});events.push({kind:'provider_post',request_id:proof.request_id,owner:f.users[who]});for(const notify of postWaiters.splice(0))notify()
          if(mutable.afterPost)await mutable.afterPost({who,request_id:proof.request_id})
          if(mutable.providerMode==='disconnect'){res.destroy();return}
          const result=output(who),content=mutable.providerMode==='partial'?'{"name":"incomplete"}':JSON.stringify(result)
          res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:mutable.providerMode==='truncated'?'length':'stop',message:{role:'assistant',content}}]}))
        }catch(error){providerErrors.push(error);res.destroy()}
      }
    }
    lifetime=tlsModule.withDisposableBoundModelTls(proof=>broker.dispatch(proof),async tls=>{
      config=tls;assert.equal(tls.origin,'https://127.0.0.1:7459');assert.ok(tls.serverTls,'Root must apply the explicit fixture delta; no product TLS bypass')
      serverTls=tls.serverTls
      privateClient=designClient.createAgentDesignMutualTlsClient({...activation,...tls})
      worker=new designWorker.AgentDesignWorker(workerPool,randomUUID(),async proof=>{proofs.push({...proof});if(mutable.beforeDispatch)await mutable.beforeDispatch(proof);return privateClient(proof)},activation)
      let nativeHandler
      nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return};void nativeHandler(req,res).catch(()=>res.destroy())})
      await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)})
      nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
      const repositories=()=>({open:new AgentDesignLedgerRepository(f.pool,{audit,allowSubmissions:mutable.submissions,allowSaves:mutable.saves})})
      const [{createHandler},{WorkflowRepository}]=await Promise.all([import('../../src/http.ts'),import('../../src/workflow-repository.ts')])
      let generic
      const native=nativeModule.createNativeAuthHttpHandler({auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,allowAgentDesign:true,allowAgentDesignSubmissions:true,allowAgentDesignSaves:true,businessHandler:async(req,res)=>{
        // Fresh repositories read test toggles; actual source/SQL/receipt gates
        // are never mocked, and original recovery remains the product path.
        const handler=designHttp.createAgentDesignHttpHandler({repository:repositories().open,authenticateRequest:native.authenticateRequest,allowedOrigin})
        if(await handler(req,res))return
        return generic(req,res)
      }})
      generic=createHandler({repository:f.agents,modelConnectionRepository:f.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(f.pool,f.key),workflowRepository:new WorkflowRepository(f.pool),knowledgeRepository:new knowledgeModule.KnowledgeBaseRepository(f.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F01_genuine_Native_cookie_only')}})
      nativeHandler=async(req,res)=>{
        const drop=mutable.dropSubmit&&req.url==='/api/v2/agent-design/submit'||mutable.dropSave&&req.url==='/api/v2/agent-design/save'
        if(drop){if(mutable.dropSubmit&&req.url.endsWith('/submit'))mutable.dropSubmit=false;else mutable.dropSave=false;const original=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this};return original.apply(this,args)}}
        return native.handler(req,res)
      }
      await login('alice');await login('bob')
      readyResolve();await finish
    },{handlerFactory,listenPort:7459,includeServerTls:true}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{})
    await ready
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];const actual=await auth.verifySession(token);assert.ok(actual);return actual}
    const createDesign=async(who='alice',purpose='generate',options={})=>{
      const binding=f.resources[who].binding;let source=null
      if(purpose==='revise'){const s=await request(who,'/api/v2/agent-design/sources/'+(options.specId??f.resources[who].spec.id));assert.equal(s.status,200);source=s.body.source}
      const choice={action:'preview',purpose,instruction:options.instruction??'SYNTHETIC F01 design complete six descriptions; tools are advice only',model_binding:binding,output_token_limit:options.cap??4096,source}
      const preview=await request(who,'/api/v2/agent-design/preview',choice);assert.equal(preview.status,200)
      const {action:_action,...selected}=choice,body={...selected,action:'submit',request_id:options.requestId??randomUUID(),expected_input_sha256:preview.body.input_sha256,confirm:true,fee_acknowledgement:designContract.agentDesignFees[purpose]}
      return {who,owner:f.users[who],choice,preview:preview.body,body,request_id:body.request_id}
    }
    const submit=async p=>{const response=await request(p.who,'/api/v2/agent-design/submit',p.body);assert.equal(response.status,200);p.receipt=response.body;return response}
    const tick=()=>{const work=worker.tick();ticks.add(work);void work.finally(()=>ticks.delete(work)).catch(()=>{});return work}
    const waitForPost=async(after=0)=>{if(providerRequests.length>after)return;await new Promise(resolve=>postWaiters.push(resolve))}
    const savePreview=async(p,edits={})=>{const view=await request(p.who,'/api/v2/agent-design/requests/'+p.request_id);assert.equal(view.status,200);assert.equal(view.body.result_status,'available');const {tools:_tools,...original}=view.body.result.result;const fields={...original,...edits};const body={action:'preview_save',design_request_id:p.request_id,expected_result_sha256:view.body.result.result_sha256,fields};const preview=await request(p.who,'/api/v2/agent-design/preview-save',body);assert.equal(preview.status,200);return {view:view.body,body,preview:preview.body}}
    const saveBody=(p,s,requestId=randomUUID())=>({intent:{action:'save',request_id:requestId,design_request_id:p.request_id,expected_preview_sha256:s.preview.preview_sha256,expected_result_sha256:s.preview.result_sha256,expected_source_sha256:s.preview.source_sha256,expected_candidate_sha256:s.preview.candidate.candidate_sha256,confirm:true,save_acknowledgement:'APPROVE_EXACT_AGENT_DESIGN_SAVE_ONLY_V1'},preview:s.body})
    const governance=async(who,enabled)=>{const items=await request('alice','/api/native-auth/employees');assert.equal(items.status,200);const row=items.body.items.find(r=>r.id===f.users[who]);assert.ok(row);const body={request_id:randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true};const changed=await request('alice','/api/native-auth/employees/change',body);assert.equal(changed.status,200);return changed.body}
    const withResource=async(who='alice')=>{const identity=await identityFor(who),tools=new toolsModule.ToolConnectionRepository(f.pool,f.key),tool=await tools.create(identity,{name:'F01 synthetic HTTP resource',description:'Resource authority test only',url:'https://example.com/f01-fixture',method:'GET',headers:[{key:'X-Synthetic-Fixture',value:'fixture-header-never-send'}],body_template:'',timeout_s:5,enabled:true});const previous=await f.agents.get(identity,f.resources[who].spec.id),{require_approval:_approval,...spec}=previous.spec;const role=await f.agents.update(identity,previous.id,previous.name,contracts.safeAgentSpec({...spec,tools:[...new Set([...spec.tools,'http_f01'])],http_tools:[{name:'http_f01',description:'Fixture',connection_id:tool.id,connection_revision:tool.revision}]}),previous.revision);return {tool,role,tools,identity}}
    const sharedKnowledge=async()=>{const alice=await identityFor('alice'),bob=await identityFor('bob'),bases=new knowledgeModule.KnowledgeBaseRepository(f.pool),base=await bases.create(alice,'F01 synthetic shared KB','Private fixture body stays out of model design'),access=new accessModule.KnowledgeAccessRepository(f.pool,(identity,email)=>auth.resolveKnowledgeRecipient(identity,email));await bases.createTextDocument(alice,base.id,{filename:'f01-private-fixture.txt',text:'knowledge-body-never-send: actual stored synthetic private KB body.'});const granted=await access.change(alice,base.id,{action:'grant',request_id:randomUUID(),expected_revision:0,recipient_email:credentials.bob.email,role:'viewer',semantic_allowed:false});const prior=await f.agents.get(bob,f.resources.bob.spec.id),{require_approval:_a,...spec}=prior.spec;const role=await f.agents.update(bob,prior.id,prior.name,contracts.safeAgentSpec({...spec,tools:[...new Set([...spec.tools,'knowledge_search'])],knowledge_base_ids:[base.id]}),prior.revision);return {base,role,revoke:()=>access.change(alice,base.id,{action:'revoke',request_id:randomUUID(),expected_revision:granted.item.revision,recipient_id:f.users.bob})}}
    return {...f,target,adminPool,workerPool,dispatchPool,authPool,auth,audit,activation,request,login,nativeOrigin,allowedOrigin,serverTls,credentials,createDesign,submit,tick,wireControl,savePreview,saveBody,counts,record,governance,withResource,sharedKnowledge,identityFor,output,mutable,events,proofs,providerRequests,providerErrors,credentialReads:()=>credentialReads,waitForPost,
      pauseProvider(){let release;const held=new Promise(resolve=>{release=resolve});gates.add(release);mutable.afterPost=async()=>held;return ()=>{gates.delete(release);release();mutable.afterPost=null}},
      assertNoProviderErrors(){assert.deepEqual(providerErrors,[])},close}
  }catch(error){await close();throw error}
}
