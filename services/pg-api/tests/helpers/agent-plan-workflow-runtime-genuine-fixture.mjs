// Real guarded PG18/Native HTTPS/Worker->Broker mTLS/model TLS fixture.
// The model endpoint is synthetic; no real provider or employee data is used.
// No DB/file/socket work occurs before the actual dedicated-purpose guard.
import {requireAgentPlanWorkflowGenuineCi,agentPlanWorkflowGenuineRuntimeJob,agentPlanWorkflowGenuineBrowserJob} from './agent-plan-workflow-genuine-guard.mjs'
export const agentPlanWorkflowRuntimeFrozenSources=Object.freeze({
  "services/pg-api/src/agent-plan-workflow-provider.ts": "610e7ee30e8ba2848094602e6e6ffbe2dadcb701a95ec119a8b222dea9c5323c",
  "services/pg-api/src/agent-plan-workflow-broker.ts": "300941ba28ad4967f41e37affbff2990cf15cd173369ec55a80afd7e35436c22",
  "services/pg-api/src/agent-plan-workflow-worker.ts": "ac291508277075095956d4449f8d2bfe424a7a3cd2a43f80fa8f308dca3de782",
  "services/pg-api/src/agent-plan-workflow-http.ts": "6ac88862f167d5855bb43d3ce904970b9a5e67969c6be6818bf2f3068546c7c4",
  "services/pg-api/src/agent-plan-workflow-client.ts": "5575cf2def09f53d75424f3250920a426bfa00aa8f5fe6335fc4aa8077df1e73",
  "services/pg-api/src/agent-plan-workflow-composition.ts": "e786b50d08821c958800d904f06cc9b25563e6d84136529d190f81392cf72146",
  "services/pg-api/src/agent-plan-workflow-service.ts": "4ef3076ee7fd20df225bd7e62542b25bdefa660f67f20655cf0f75d19de28bd6",
  "services/pg-api/src/agent-plan-workflow-service-config.ts": "5cac3bfad64bb5a2aa3705d830386c190aa47e9b68b1fbb25cfd702cdebd85db",
  "services/pg-api/src/native-auth-http.mjs": "9e685f0ca21bd6ada835aa69af44508b207bbc8001b765685a624722bf72fa6f",
  "services/pg-api/src/native-server.ts": "2680c2370c193d690791e8096bb5ea2ffaa69d24a30e2c01edb64641d9627390",
  "services/pg-api/src/server.ts": "60a141847ed0838190d229ba6740f67d7efd46f808c9e4e3cda00bb05bf286b7",
  "services/pg-api/src/agent-run-control.ts": "fa018e968096ac539f1aeb90cd8cb01c9716d1097c9f3284d57bd338d8c439e1",
  "services/pg-api/src/approval-delegation-audit-core.ts": "0be2d8be27c0b373a0dd69e09a196ba4b97f2758b7d2713baf90fcd1809c9029",
  "services/pg-api/src/approval-delegation-audit.ts": "37f0a4a4d8ad12f856d79aa37acb6fb302e09bbe14ab5d785de2975cf74d9da9",
  "services/pg-api/src/approval-delegation-contract.ts": "5587f36b21169e28a2a7482682d388247b47ad9c9e9b03290173201a9898cca4",
  "services/pg-api/src/approval-delegation-http.ts": "206cce0bb3cca19cdf169f22dfbc2cb971b9c73925ffc9ef48abfe99138c884a",
  "services/pg-api/src/approval-delegation-preview.ts": "763bb4f7436075f10759125ed61bb8ab7c5224e49bf32e993d8a11b75d8d483b",
  "services/pg-api/src/approval-delegation-repository.ts": "b7f8cf52060ebbdd9a81b3fd8397f10333ab2993e8523f42c40d43bbb59a1e9c",
  "services/pg-api/src/approval-delegation-runtime-policy.ts": "6ac4449a950f0e17b0fa79fc5a9f2ed0f4560efc14e63f37713d8c2fee9be8ee",
  "services/pg-api/src/autonomous-agent-run-repository.ts": "512a1f75ba19fc0f16ce9ba7bc0d2c3b5f1120f8832068e4b6e8e575f92de0f9",
  "services/pg-api/src/baota-pg18-complete-init.mjs": "496621ea40c73bb0aaa02703047bc306788eb970ff4b9a6cb716a56ad871e3fa",
  "services/pg-api/src/http.ts": "68e7d8b34791dbf44e2ed52314aa2620f43b33ed3e62642988c4c60c3abf318f",
  "services/pg-api/src/native-auth-http.d.mts": "c28022dc065f11aa934ef16058cf11b0051325aa81dc53ed5993a1b411f41963",
  "services/pg-api/src/native-config-uat-policy.ts": "a22cfe6b0ce07e54fb6010367fb2001052c782f2e0b4d8ef667e05c38003e331",
  "services/pg-api/src/owned-step-decision-context.ts": "6e842015da3721caee315368706c0fdea608c020236816cd4210cf13bc025643",
  "services/pg-api/src/pg18-complete-operator-runtime.d.mts": "6950c0bfa97869ff1d4377f8c960849df73d7802f59935dc5785bd0998220879",
  "services/pg-api/src/pg18-complete-operator-runtime.mjs": "35b9aa6e2fd95cfde2b514c7c8a33bcb153673acbffa22db14187d61dd6db686",
  "services/pg-api/src/pg18-complete-profile-source.d.mts": "85a1e2ee7122ab005271eddfab7c76beb53ec4c5d470f15393c815f535b2cc74",
  "services/pg-api/src/pg18-complete-profile-source.mjs": "97049578f3d339e864189538ae14e64d7ef13f6eb74627e9730ae8866641f893",
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
  "src/pages/PgNativePilot/PgNativeAgentDesignPanel.tsx": "f89a79554f2774a05b16582bc1a2153bd5dc98586ef9dda4bd17f909927ee219",
  "src/pages/PgNativePilot/PgNativeAgentReleasePanel.tsx": "aa4386aa86a25bc7a8e4fb1d3ed7b75503d4174ac328f8e642d38aa70b09ed95",
  "src/pages/PgNativePilot/PgNativeAgentRunControl.tsx": "081e1035a9fcd37320ec1c1260d9d5e0a9c6f88b072fe2d7ba5123d5e2327410",
  "src/pages/PgNativePilot/PgNativeAgentRunPanel.tsx": "3ee603b16eabc3dcd14a67c896dcb1ed00cfc7fa6318737e616e9539dfd7c9d6",
  "src/pages/PgNativePilot/PgNativeApprovalDelegationPanel.tsx": "f405a122ed527f5dd5d9a4494cad7df120ad76a86f904a45dfedb920e8e4c958",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentDetail.tsx": "6e1efa93718a62501a3fb3d5f30955a6fc3b825a31460537eafba9e925ab3445",
  "src/pages/PgNativePilot/PgNativeAutonomousAgentPanel.tsx": "e3f8ebac7e181e783ae7e93be6f649c940f7a06abde745d697d580db9d2b90c9",
  "src/pages/PgNativePilot/PgNativePilotPage.tsx": "88abe0b779b09e5b769d591724ed428b096aecfc3ec8d196339255caa1bd1958",
  "src/pages/PgNativePilot/PgNativeStudioNavigation.tsx": "51f73a5138a41092a3d41277cf414ad2a36d62e9f034ace8aab4f28cbc8ed8ec",
  "services/pg-api/src/agent-run-control-admission.ts": "e907b0bfb6b445c8077f6ee17b3e3c9d73a1b373d56d8a9b9ae205bc20950a94",
  "services/pg-api/src/own-operations-contract.ts": "c5a5ababb17bed11959279b01657195b28af96ea909ff461535f9f19a26979ab",
  "services/pg-api/src/own-operations-repository.ts": "e685eb185d1d92596d93decd213aacaa7bcdaf12504dce4c5bb3ccaaa5afb075"
})
export async function agentPlanWorkflowRuntimeGenuineFixture(env=process.env,{browserMode=false}={}){
  requireAgentPlanWorkflowGenuineCi(env)
  if(env.GITHUB_JOB!==(browserMode?agentPlanWorkflowGenuineBrowserJob:agentPlanWorkflowGenuineRuntimeJob))throw Error('F05_exact_runtime_browser_job_required')
  const [a,fs,path,url,crypto,https,baseModule,tlsModule,nativeModule,cookieModule,httpModule,ledgerModule,brokerModule,workerModule,clientModule,policy,contract,result,toolsModule,kbModule,workflowModule,peerModule,contracts,composition]=await Promise.all([
    import('node:assert/strict'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:https'),import('./agent-plan-workflow-genuine-fixture.mjs'),import('./bound-model-loopback-tls.mjs'),
    import('../../src/native-auth-http.mjs'),import('../../src/native-employee-auth.mjs'),import('../../src/http.ts'),import('../../src/agent-plan-workflow-ledger.ts'),import('../../src/agent-plan-workflow-broker.ts'),import('../../src/agent-plan-workflow-worker.ts'),
    import('../../src/agent-plan-workflow-client.ts'),import('../../src/agent-plan-workflow-runtime-policy.ts'),import('../../src/agent-plan-workflow-contract.ts'),import('../../src/agent-plan-workflow-result.ts'),import('../../src/tool-connection-repository.ts'),
    import('../../src/knowledge-repository.ts'),import('../../src/workflow-repository.ts'),import('../../src/bound-worker-mtls.ts'),import('../../src/contracts.ts'),import('../../src/agent-plan-workflow-composition.ts')])
  const assert=a.default,root=path.resolve(url.fileURLToPath(new URL('../../../../',import.meta.url))),hash=value=>crypto.createHash('sha256').update(contract.canonicalAgentPlanWorkflowValue(value),'utf8').digest('hex')
  assert.ok(Object.keys(agentPlanWorkflowRuntimeFrozenSources).length>=9,'Root must review actual product composition, runtime and metadata sources before any database connection')
  for(const [rel,expected]of Object.entries(agentPlanWorkflowRuntimeFrozenSources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex'),expected,'reviewed F05 runtime source changed')
  assert.equal(policy.selectAgentPlanWorkflowServiceOptIn(env),true)
  let f,broker,brokerRuntime,workerRuntime,worker,privateClient,nativeServer,nativeHandler,nativeOrigin,allowedOrigin,serverTls,modelTls,lifetime,closed=false
  let reviewedClientFingerprint256
  let readyResolve,readyReject,finishResolve
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject}),finish=new Promise(resolve=>{finishResolve=resolve}),cookies=new Map(),ticks=new Set(),dispatches=new Set(),gates=new Set()
  const providerEvents=[],proofs=[],credentialEvents=[],businessEvents=[]
  const mutable={available:true,submissions:true,saves:true,dropNext:null,afterBusiness:null,providerMode:'success',providerGate:null}
  const credentials={alice:{email:'assessment-alice@example.test',password:'SyntheticAssessmentAlice#2026'},bob:{email:'assessment-bob@example.test',password:'SyntheticAssessmentBob#2026'}}
  const bounded=async(promise,ms=20000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('F05_actual_fixture_timeout')),ms)})])}finally{clearTimeout(timer)}}
  const output=()=>({protocol:'agent_plan_workflow_model_output_v1',name:'F05 Synthetic Model Workflow',graph:{version:2,description:'A bounded graph returned by the actual synthetic TLS model endpoint',nodes:[
    {id:'start',type:'start',position:{x:0,y:80},data:{title:'开始'}},{id:'analysis',type:'model',position:{x:250,y:80},data:{title:'分析',prompt:'模型设计的分析 {{input}}'}},
    {id:'end',type:'end',position:{x:500,y:80},data:{title:'结束',output_template:'{{分析.output}}'}}],edges:[{id:'begin',source:'start',target:'analysis'},{id:'finish',source:'analysis',target:'end'}]}})
  const request=async(who,pathName,body,options={})=>{
    const selected=new URL(pathName,nativeOrigin),method=options.method??(body===undefined?'GET':'POST'),bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
    return bounded(new Promise((resolve,reject)=>{
      const req=https.request({hostname:'127.0.0.1',port:Number(selected.port),servername:'localhost',path:selected.pathname+selected.search,method,ca:serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(20000),headers:{Accept:'application/json',Origin:allowedOrigin,...(cookies.has(who)?{Cookie:cookies.get(who)}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length),'X-AgentStudio-Request':'1'}:{}),...options.headers}},res=>{
        const chunks=[];let size=0;res.on('data',piece=>{size+=piece.length;if(size>524288){res.destroy();reject(Error('F05_actual_reply_too_large'));return}chunks.push(Buffer.from(piece))});res.once('error',reject);res.once('aborted',()=>reject(Error('F05_actual_reply_aborted')))
        res.once('end',()=>{try{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode,headers:res.headers,body:text?JSON.parse(text):null})}catch(error){reject(error)}})
      });req.once('error',reject);if(bytes)req.end(bytes);else req.end()
    }))
  }
  const login=async who=>{
    const reply=await request(who,'/api/native-auth/login',credentials[who]);assert.equal(reply.status,200);const values=reply.headers['set-cookie'];assert.ok(Array.isArray(values));const cookie=values.find(v=>v.startsWith(cookieModule.NATIVE_SESSION_COOKIE+'='))?.split(';',1)[0];assert.ok(cookie);cookies.set(who,cookie);return cookie
  }
  const close=async()=>{
    if(closed)return;closed=true;for(const release of gates)release();gates.clear();workerRuntime?.close();brokerRuntime?.close()
    const failures=[]
    try{await bounded(Promise.allSettled([...ticks,...dispatches]))}catch(e){failures.push(e)}
    if(nativeServer){nativeServer.closeAllConnections();try{await bounded(new Promise(resolve=>nativeServer.close(resolve)))}catch(e){failures.push(e)}}
    finishResolve();try{await bounded(lifetime??Promise.resolve())}catch(e){failures.push(e)}
    try{await f?.close()}catch(e){failures.push(e)}cookies.clear()
    if(failures.length)throw new AggregateError(failures,'F05_actual_runtime_cleanup_failed')
  }
  try{
    f=await baseModule.agentPlanWorkflowGenuineFixture(env)
    const activation={executionEnabled:true,executionApproval:policy.agentPlanWorkflowExecutionApproval,audit:f.audit},generationModels={}
    for(const who of ['alice','bob']){
      const created=await f.models.create(f.identities[who],{name:'F05 Generation Model '+who,provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-'+who+'-F05-generation-key',models:['synthetic-generation'],enabled:true})
      const model=await f.models.testConnection(f.identities[who],created.id,created.revision,async()=>({status:'ok',latency_ms:1,error_code:''}));generationModels[who]={model,binding:{connection_id:model.id,connection_revision:model.revision,model_id:'synthetic-generation'}}
    }
    const secretPool={async connect(){const db=await f.secretPool.connect();return {async query(sql,args){
      if(sql.startsWith('SELECT owner_user_id,revision,provider,base_url,enabled,status,models,api_key_ciphertext')){
        const proof=proofs.at(-1);assert.ok(proof);await f.mustClient(db,'agentstudio_model_broker')
        const count=await f.admin(async client=>(await client.query('SELECT count(*)::integer AS n FROM agentstudio.agent_plan_workflow_reservations WHERE owner_user_id=$1 AND request_id=$2',[args[1],proof.request_id])).rows[0].n)
        assert.equal(count,1,'one real committed reservation must precede original credential SELECT');credentialEvents.push({request_id:proof.request_id,owner_user_id:args[1]})
      }
      return db.query(sql,args)
    },release:()=>db.release()}}}
    const providerRequest=(options,callback)=>{
      assert.equal(options.hostname,'api.openai.com');assert.equal(options.port,443);assert.equal(options.method,'POST');assert.equal(options.path,'/v1/chat/completions');assert.equal(options.rejectUnauthorized,true);assert.ok(modelTls)
      return https.request({...options,hostname:'127.0.0.1',port:Number(new URL(modelTls.origin).port),servername:'localhost',lookup:undefined,ca:modelTls.ca,cert:modelTls.cert,key:modelTls.key,agent:false},callback)
    }
    const dispatch=async proof=>{
      assert.ok(broker);proofs.push(proof);const work=broker.dispatch(proof);dispatches.add(work);void work.finally(()=>dispatches.delete(work)).catch(()=>{});return work
    }
    const providerFactory=options=>async(req,res)=>{
      try{
        peerModule.verifyBoundWorkerMutualTlsPeer(req.socket,options.reviewedClientFingerprint256)
        assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers['content-type'],'application/json')
        const known=['alice','bob'].some(who=>req.headers.authorization==='Bearer synthetic-'+who+'-F05-generation-key');assert.equal(known,true,'model request must use the real selected synthetic credential')
        let size=0;const chunks=[];for await(const piece of req){size+=piece.length;assert.ok(size<=524288);chunks.push(Buffer.from(piece))}
        const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));assert.equal(value.model,'synthetic-generation');assert.ok([4096,8192,16384].includes(value.max_completion_tokens));assert.equal(value.response_format?.type,'json_object');assert.equal(value.messages?.length,2);assert.equal(value.messages[0].role,'system');assert.equal(value.messages[1].role,'user')
        providerEvents.push({messages_sha256:hash({protocol:'agent_plan_workflow_messages_v1',messages:value.messages}),cap:value.max_completion_tokens,request_id:proofs.at(-1)?.request_id})
        if(mutable.providerGate)await mutable.providerGate
        if(mutable.providerMode==='disconnect'){req.socket.destroy();return}
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:mutable.providerMode==='bad-json'?'not a graph':JSON.stringify(output())}}]}))
      }catch{res.destroy()}
    }
    lifetime=tlsModule.withDisposableBoundModelTls(dispatch,async privateTls=>{
      return tlsModule.withDisposableBoundModelTls(async()=>{throw Error('F05_model_endpoint_is_not_dispatch')},async providerTls=>{
        modelTls=providerTls;serverTls=providerTls.serverTls;assert.ok(serverTls)
        brokerRuntime=await composition.createAgentPlanWorkflowBrokerRuntime({...activation,businessPool:f.pool,dispatchPool:f.privatePools.dispatch,secretPool,key:f.key,reviewedClientFingerprint256,resolver:{resolve4:async host=>{assert.equal(host,'api.openai.com');return ['93.184.216.34']},resolve6:async()=>[]},request:providerRequest})
        broker=brokerRuntime.broker
        const actualDispatch=broker.dispatch.bind(broker);broker.dispatch=proof=>{proofs.push(proof);const work=actualDispatch(proof);dispatches.add(work);void work.finally(()=>dispatches.delete(work)).catch(()=>{});return work}
        workerRuntime=await composition.createAgentPlanWorkflowWorkerRuntime({...activation,workerPool:f.privatePools.worker,workerId:crypto.randomUUID(),reviewedOrigin:privateTls.origin,reviewedServerFingerprint256:privateTls.reviewedServerFingerprint256,ca:privateTls.ca,cert:privateTls.cert,key:privateTls.key})
        worker=workerRuntime.worker;privateClient=workerRuntime.client
        nativeServer=https.createServer({...serverTls,minVersion:'TLSv1.2'},(req,res)=>{if(!nativeHandler){res.writeHead(503);res.end();return}void nativeHandler(req,res).catch(()=>res.destroy())})
        await new Promise((resolve,reject)=>{nativeServer.once('error',reject);nativeServer.listen(0,'127.0.0.1',resolve)});nativeOrigin='https://localhost:'+nativeServer.address().port;allowedOrigin=browserMode?'https://localhost:17443':nativeOrigin
        const caps=policy.selectNativeAgentPlanWorkflowCapabilities(env,true,allowedOrigin,true);assert.equal(caps.available,true);assert.equal(caps.submissions,true);assert.equal(caps.saves,true)
        let selectedFlags,prepared,native,generic,family
        nativeHandler=async(req,res)=>{
          const flags=JSON.stringify([mutable.available,mutable.submissions,mutable.saves])
          if(flags!==selectedFlags){
            const selectedEnv=mutable.available?{...env,AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_AVAILABLE:'true',AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_APPROVED:policy.agentPlanWorkflowNativeApproval,...(mutable.submissions?{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SUBMISSIONS_ENABLED:'true'}:{}),...(mutable.saves?{AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SAVES_ENABLED:'true'}:{})}:{}
            if(!mutable.submissions)delete selectedEnv.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SUBMISSIONS_ENABLED
            if(!mutable.saves)delete selectedEnv.AGENT_STUDIO_PG18_AGENT_PLAN_WORKFLOW_SAVES_ENABLED
            prepared=await composition.prepareAgentPlanWorkflowNative({pool:f.pool,env:selectedEnv,listen:true,allowedOrigin,configurationWrites:true})
            native=nativeModule.createNativeAuthHttpHandler({auth:f.auth,allowedOrigin,allowConfigurationWrites:true,allowEmployeeGovernance:true,...prepared.metadataOptions,businessHandler:async(incoming,outgoing)=>{if(family&&await family(incoming,outgoing))return;return generic(incoming,outgoing)}})
            family=prepared.createHandler(native.authenticateRequest)
            generic=httpModule.createHandler({repository:f.agents,modelConnectionRepository:f.models,toolConnectionRepository:new toolsModule.ToolConnectionRepository(f.pool,f.key),workflowRepository:new workflowModule.WorkflowRepository(f.pool),knowledgeRepository:new kbModule.KnowledgeBaseRepository(f.pool),allowedOrigin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('F05_actual_Native_cookie_only')}})
            selectedFlags=flags
          }
          const drop=mutable.dropNext
          if(drop&&req.method===drop.method&&req.url===drop.path){mutable.dropNext=null;const end=res.end;res.end=function(...args){if(this.statusCode===200){this.destroy();return this}return end.apply(this,args)}}
          // Observes a real completed response. It cannot manufacture business
          // success or bypass the product's post-await Native identity check.
          const after=mutable.afterBusiness
          if(after){const end=res.end;res.end=function(...args){if(this.statusCode===200){void Promise.resolve().then(()=>after({operation:req.url})).then(()=>end.apply(this,args),()=>this.destroy());return this}return end.apply(this,args)}}
          businessEvents.push({operation:req.url})
          return native.handler(req,res)
        }
        await login('alice');await login('bob');readyResolve();await finish
      },{handlerFactory:providerFactory,listenPort:0,includeServerTls:true})
    },{handlerFactory:options=>{reviewedClientFingerprint256=options.reviewedClientFingerprint256;return async(req,res)=>{if(!brokerRuntime){res.writeHead(503);res.end();return}return brokerRuntime.handler(req,res)}},listenPort:0}).catch(error=>{readyReject(error);throw error})
    void lifetime.catch(()=>{});await ready
    const tick=async()=>{const work=worker.tick();ticks.add(work);try{return await work}finally{ticks.delete(work)}}
    const identityFor=async who=>{const token=cookies.get(who)?.split('=',2)[1];assert.ok(token);const value=await f.auth.verifySession(token);assert.ok(value);return value}
    const governance=async(who,enabled)=>{const listed=await request('alice','/api/native-auth/employees');assert.equal(listed.status,200);const row=listed.body.items.find(r=>r.id===f.users[who]);assert.ok(row);const changed=await request('alice','/api/native-auth/employees/change',{request_id:crypto.randomUUID(),target_id:row.id,expected_revision:row.revision,is_admin:row.is_admin,enabled,share_enabled:row.share_enabled??true,confirm:true});assert.equal(changed.status,200);return changed.body}
    const holdProvider=()=>{assert.equal(mutable.providerGate,null);let release;const wait=new Promise(resolve=>{release=()=>{if(mutable.providerGate===wait)mutable.providerGate=null;gates.delete(release);resolve()}});mutable.providerGate=wait;gates.add(release);return release}
    return {...f,nativeOrigin,allowedOrigin,serverTls,generationModels,credentials,request,login,identityFor,governance,tick,holdProvider,worker,mutable,providerEvents,credentialEvents,businessEvents,proofs,output,hash,close,
      evidenceScope:'actual PG18 + original Native Cookie + dedicated minimum-role Worker/Broker + real mTLS + synthetic TLS model response; no real vendor/fee or system-drain claim'}
  }catch(error){await close();throw error}
}
