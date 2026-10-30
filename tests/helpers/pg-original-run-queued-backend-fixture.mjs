import {requireOriginalRunQueuedBrowserCi} from './pg-original-run-queued-browser-guard.mjs'
import {verifyOriginalRunQueuedReviewedSources} from './pg-original-run-queued-reviewed-check.mjs'
import {createOriginalRunQueuedProofs} from './pg-original-run-queued-proofs.mjs'
// Dedicated disposable composition. Existing read-only Login/Home fixtures
// and their zero-model teardown checks are not relabeled or weakened.
export async function originalRunQueuedBackendFixture(env=process.env){
 const permit=requireOriginalRunQueuedBrowserCi(env),reviewed=await verifyOriginalRunQueuedReviewedSources(env)
 const [fs,path,crypto,https,{default:assert},base,source,review070,review071,review072,homeAudit,catalogAudit,statsAudit,monitorAudit,homeRuntime,catalogRuntime,monitorRuntime,nativeModule,http,tools,knowledge,workflow,own,outcome,ownHttp,policy,modelModule,nativeRun,safeRun,v2Run,autoRun,memory,memoryAudit,memoryContextAudit,feedback,feedbackAudit,humanAudit,contract]=await Promise.all([
  import('node:fs'),import('node:path'),import('node:crypto'),import('node:https'),import('node:assert/strict'),
  import('../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'),import('../../services/pg-api/src/pg18-complete-profile-source.mjs'),
  import('../../ops/pg18-original-home070-review-plan.mjs'),import('../../ops/pg18-original-home071-review-plan.mjs'),import('../../ops/pg18-original-home072-review-plan.mjs'),
  import('../../services/pg-api/src/native-home-authoring-audit.ts'),import('../../services/pg-api/src/native-agent-catalog-audit.ts'),import('../../services/pg-api/src/native-home-knowledge-stats-audit.ts'),import('../../services/pg-api/src/native-monitor-inbox-audit.ts'),
  import('../../services/pg-api/src/native-home-agent-specs-runtime.ts'),import('../../services/pg-api/src/native-agent-catalog-runtime.ts'),import('../../services/pg-api/src/native-monitor-inbox-runtime.ts'),
  import('../../services/pg-api/src/native-auth-http.mjs'),import('../../services/pg-api/src/http.ts'),
  import('../../services/pg-api/src/tool-connection-repository.ts'),import('../../services/pg-api/src/knowledge-repository.ts'),import('../../services/pg-api/src/workflow-repository.ts'),
  import('../../services/pg-api/src/own-operations-repository.ts'),import('../../services/pg-api/src/agent-memory-outcome-audit.ts'),import('../../services/pg-api/src/own-operations-http.ts'),import('../../services/pg-api/src/native-config-uat-policy.ts'),import('../../services/pg-api/src/model-connection-repository.ts'),import('../../services/pg-api/src/native-run-repository.ts'),import('../../services/pg-api/src/workflow-safe-run-repository.ts'),import('../../services/pg-api/src/workflow-v2-run-repository.ts'),import('../../services/pg-api/src/autonomous-agent-run-repository.ts'),import('../../services/pg-api/src/agent-memory-repository.ts'),import('../../services/pg-api/src/agent-memory-audit.ts'),import('../../services/pg-api/src/agent-memory-context-audit.ts'),import('../../services/pg-api/src/agent-feedback-repository.ts'),import('../../services/pg-api/src/agent-feedback-audit.ts'),import('../../services/pg-api/src/agent-human-input-audit.ts'),import('../../services/pg-api/src/contracts.ts')])
 const selectedEnv={...env};let selectedPolicy=policy.selectNativePg18UatCapabilities(selectedEnv,true,permit.origin)
 for(const key of ['configurationWrites','runApprovalUat','workflowExecutionUat','workflowV2ExecutionUat','autonomousAgentUat','agentMemoryUat','agentFeedbackUat','knowledgeSharingUat'])assert.equal(selectedPolicy[key],true,'actual isolated selector approval required before PG: '+key)
 assert.equal(selectedPolicy.modelProbeUat,false);assert.notEqual(selectedPolicy.boundModelExecutionUat,true);assert.notEqual(selectedPolicy.knowledgeToolExecutionUat,true)
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
 const snapshot=await source.captureCompleteProfileSources(),p070=await review070.captureOriginalHome070ReviewPlan(),p071=await review071.captureOriginalHome071ReviewPlan(),p072=await review072.captureOriginalHome072ReviewPlan()
 assert.equal(p070.manifest.base_source_sha256,snapshot.source_sha256);assert.equal(p071.manifest.predecessor_source_sha256,p070.source_sha256);assert.equal(p072.manifest.predecessor_source_sha256,p071.source_sha256)
 const readPin=pin=>{const bytes=fs.readFileSync(path.join(reviewed.repo,pin.path));assert.equal(sha(bytes),pin.sha256);return bytes.toString('utf8')}
 let f,server,native,home,catalog,monitor,generic,business,models,proofs,configure,available,memoryAvailable,feedbackAvailable,humanAvailable,modelCredentialReads=0,closed=false,finalOwnerAudit=false,finalZeroProof=null
 const cookies=new Map(),identities={}
 const close=async()=>{if(closed)return;closed=true;const failures=[]
  if(server){server.closeAllConnections();try{await new Promise(resolve=>server.close(resolve))}catch(e){failures.push(e)}}
  try{if(f){assert.equal(modelCredentialReads,0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);f.assertNoProviderErrors()}}catch(e){failures.push(e)}
  try{if(f){const db=await f.pool.connect();try{await db.query('BEGIN READ ONLY');try{await db.query('SET LOCAL ROLE agentstudio_api');assert.equal(await f.audit(db),true);finalOwnerAudit=true}finally{await db.query('ROLLBACK')}}finally{db.release()}}}catch(e){failures.push(e)}
  try{if(proofs)finalZeroProof=Object.freeze(await proofs.assertZeroExecution())}catch(e){failures.push(e)}
  proofs?.clearProofs()
  try{await f?.close()}catch(e){failures.push(e)}
  cookies.clear();try{reviewed.check()}catch(e){failures.push(e)}
  if(failures.length)throw new AggregateError(failures,'original_run_queued_backend_cleanup_failed')
 }
 try{
  f=await base.agentDesignGenuineFixture(env,{browserMode:true})
  const target=(await f.db.query("SELECT current_database() AS database,session_user::text AS login,current_setting('server_version_num')::integer AS version,NOT pg_is_in_recovery() AS primary")).rows[0]
  assert.equal(target.database,permit.target.database);assert.equal(target.login,permit.target.user);assert(target.version>=180000&&target.version<190000&&target.primary===true)
  const before=await f.counts();for(const key of ['requests','reservations','outcomes','outputs','saves','runs','old_effects'])assert.equal(before[key],0,'fresh F01 natural authoring service required')
  for(const version of ['063','064','065','066','067','068','069']){
   const pin=snapshot.manifest.sql_sources.find(row=>row.path.startsWith('db/postgres/migrations/pg_v9_'+version+'_'));assert(pin);await f.db.exec(readPin(pin))
  }
  assert.equal(await homeAudit.inspectOptionalNativeHomeAuthoringSchema(f.pool),'absent')
  await f.db.exec(readPin(p070.manifest.optional_sql_sources[0]));assert.equal(await homeAudit.inspectOptionalNativeHomeAuthoringSchema(f.pool),'installed')
  assert.equal(await catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool),'absent')
  await f.db.exec(readPin(p071.manifest.optional_sql_sources[0]));assert.equal(await catalogAudit.inspectOptionalNativeAgentCatalogSchema(f.pool),'installed')
  assert.equal(await statsAudit.inspectOptionalOriginalHomeKnowledgeStatisticsSchema(f.pool),'absent')
  await f.db.exec(readPin(p072.manifest.optional_sql_sources[0]));assert.equal(await statsAudit.inspectOptionalOriginalHomeKnowledgeStatisticsSchema(f.pool),'installed')
  assert.equal(await monitorAudit.inspectOptionalNativeMonitorInbox(f.pool),'absent')
  // The fixed reviewed source check above pins this exact optional migration.
  await f.db.exec(fs.readFileSync(path.join(reviewed.repo,'db/postgres/migrations/pg_v9_073_monitor_inbox.sql'),'utf8'))
  assert.equal(await monitorAudit.inspectOptionalNativeMonitorInbox(f.pool),'installed')
  // No preflight stub: the original F01 verifier must accept this actual catalog.
  const db=await f.pool.connect();try{await db.query('BEGIN READ ONLY');try{await db.query('SET LOCAL ROLE agentstudio_api');assert.equal(await f.audit(db),true)}finally{await db.query('ROLLBACK')}}finally{db.release()}
  // Observe original broker queries without rewriting SQL, identities or results.
  const observedBroker={...f.secretPool,async connect(){const db=await f.secretPool.connect();return{async query(sql,args=[]){if(typeof sql==='string'&&sql.includes('api_key_ciphertext'))modelCredentialReads++;return db.query(sql,args)},release(){db.release()}}}}
  models=new modelModule.ModelConnectionRepository(f.pool,f.key,observedBroker)
  memoryAvailable=await memoryAudit.inspectAgentMemorySchema(f.pool);assert.equal(memoryAvailable,true)
  assert.equal(await memoryContextAudit.inspectAgentMemoryContextSchema(f.pool),true)
  feedbackAvailable=await feedbackAudit.inspectAgentFeedbackSchema(f.pool);assert.equal(feedbackAvailable,true)
  humanAvailable=await humanAudit.inspectAgentHumanInputSchema(f.pool);assert.equal(humanAvailable,true)
  available=await own.inspectOwnOperationsSchema(f.pool,await outcome.inspectAgentMemoryOutcomeSchema(f.pool));assert.equal(available,true)
  const strictModelContract=models.originalUiProtocol==='native_model_connections_owner_cas_v1',paginationProtocol=Object.getOwnPropertyDescriptor(models,'paginationProtocol')?.value
  assert.equal(strictModelContract,true);assert.equal(paginationProtocol,'native_model_connections_paging_v1');assert.equal(typeof models.listPage,'function')
  configure=()=>{
   selectedPolicy=policy.selectNativePg18UatCapabilities(selectedEnv,true,permit.origin)
   native=nativeModule.createNativeAuthHttpHandler({auth:f.auth,allowedOrigin:permit.origin,
    allowConfigurationWrites:selectedPolicy.configurationWrites,allowRunSubmission:selectedPolicy.runApprovalUat,allowBoundRunSubmission:selectedPolicy.boundModelExecutionUat===true,
    allowWorkflowExecution:selectedPolicy.workflowExecutionUat===true,allowWorkflowV2Submission:selectedPolicy.workflowV2ExecutionUat===true,allowAutonomousAgentSubmission:selectedPolicy.autonomousAgentUat===true,
    allowOriginalModelConnections:strictModelContract,originalModelPaginationProtocol:paginationProtocol,allowOwnOperations:available,
    allowAgentHumanInput:humanAvailable,allowAgentMemory:memoryAvailable,allowAgentMemoryRuntime:selectedPolicy.agentMemoryUat===true,
    allowAgentFeedback:feedbackAvailable,allowAgentFeedbackSubmission:selectedPolicy.agentFeedbackUat===true,allowAgentFeedbackLessons:selectedPolicy.agentFeedbackLessonsUat===true,
    allowKnowledgeSharing:selectedPolicy.knowledgeSharingUat===true,businessHandler:(req,res)=>business(req,res)})
   generic=http.createHandler({repository:f.agents,modelConnectionRepository:models,toolConnectionRepository:new tools.ToolConnectionRepository(f.pool,f.key),workflowRepository:new workflow.WorkflowRepository(f.pool),knowledgeRepository:new knowledge.KnowledgeBaseRepository(f.pool),
    runRepository:nativeRun.createNativeRunRepository(f.pool,selectedPolicy),workflowSafeRunRepository:new safeRun.WorkflowSafeRunRepository(f.pool),workflowV2RunRepository:new v2Run.WorkflowV2RunRepository(f.pool,'workflow_native_v2',{allowHumanInput:humanAvailable}),
    autonomousAgentRunRepository:new autoRun.AutonomousAgentRunRepository(f.pool,{allowHumanInput:humanAvailable,allowMemory:selectedPolicy.agentMemoryUat===true}),
    agentMemoryRepository:new memory.AgentMemoryRepository(f.pool,{allowWrites:selectedPolicy.configurationWrites}),agentFeedbackRepository:new feedback.AgentFeedbackRepository(f.pool,{allowSubmit:selectedPolicy.configurationWrites&&selectedPolicy.agentFeedbackUat===true,allowLessonStorage:selectedPolicy.agentFeedbackLessonsUat===true}),
    allowedOrigin:permit.origin,authenticateRequest:req=>native.authenticateRequest(req),verifyToken:async()=>{throw Error('original_run_queued_Native_Cookie_only')}})
   const ownBusiness=ownHttp.createNativeOwnOperationsBusinessHandler({repository:new own.OwnOperationsRepository(f.pool),available,policy:selectedPolicy,businessHandler:generic,allowedOrigin:permit.origin,authenticateRequest:req=>native.authenticateRequest(req)})
   business=async(req,res)=>{if(home&&await home(req,res))return;if(catalog&&await catalog(req,res))return;if(monitor&&await monitor(req,res))return;return ownBusiness(req,res)}
  }
  configure()
  home=await homeRuntime.prepareNativeHomeAgentSpecs({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:'true',AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED:'true'},listen:true,allowedOrigin:permit.origin,configurationWrites:selectedPolicy.configurationWrites,allowNativeLocalAgentSpecs:false,authenticateRequest:req=>native.authenticateRequest(req)});assert(home)
  const cat=await catalogRuntime.prepareNativeAgentCatalog({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_AGENT_CATALOG_ENABLED:'true'},listen:true,allowedOrigin:permit.origin,configurationWrites:selectedPolicy.configurationWrites});assert(cat);catalog=cat.createHandler(req=>native.authenticateRequest(req))
  const mon=await monitorRuntime.prepareNativeMonitorInbox({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},listen:true,allowedOrigin:permit.origin});assert(mon);monitor=mon.createHandler(req=>native.authenticateRequest(req))
  server=https.createServer({...f.serverTls,minVersion:'TLSv1.2'},(req,res)=>{void native.handler(req,res).catch(()=>res.destroy())})
  server.requestTimeout=30000;server.headersTimeout=15000;await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const nativeOrigin='https://localhost:'+server.address().port
  for(const who of ['alice','bob']){cookies.set(who,await f.login(who));identities[who]=await f.identityFor(who)}
  // Actual owner repository creates selector resources; no fabricated resource
  // DTO, catalog status, grant, execution binding or model output is injected.
  const homeKnowledge={},bases=new knowledge.KnowledgeBaseRepository(f.pool)
  for(const who of ['alice','bob'])homeKnowledge[who]=await bases.create(identities[who],'Original Home synthetic private KB '+who,'Disposable owner metadata selected through the original Home checkbox')
  const profiles={};for(const who of ['alice','bob']){const actual=await f.request(who,'/api/native-auth/me');assert.equal(actual.status,200);assert.equal(actual.body.user.id,f.users[who]);profiles[who]=actual.body.user}
  const request=async(who,route,method='GET',body,expectedEmployee)=>{
   assert(['alice','bob'].includes(who)&&typeof route==='string'&&route.startsWith('/api/')&&route.length<4096&&['GET','POST','PATCH','DELETE'].includes(method))
   const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),upstream=new URL(nativeOrigin)
   return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:route,method,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(8000),headers:{Accept:'application/json',Origin:permit.origin,Cookie:cookies.get(who),...(method==='GET'?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(expectedEmployee?{'X-AgentStudio-Expected-Employee':expectedEmployee}:{})}},res=>{let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy();return}chunks.push(Buffer.from(chunk))});res.once('error',reject);res.once('aborted',()=>reject(Error('original_run_queued_probe_response_lost')));res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))})}catch{reject(Error('original_run_queued_probe_invalid_response'))}})});req.once('error',reject);req.end(bytes)})
  }
  const actualCap=await request('alice','/api/native-auth/capabilities')
  assert.equal(actualCap.status,200);assert.equal(actualCap.body.config_writes_enabled,true);assert.equal(actualCap.body.run_submission_enabled,true);assert.equal(actualCap.body.workflow_execution_enabled,true);assert.equal(actualCap.body.workflow_v2_submission_enabled,true);assert.equal(actualCap.body.autonomous_agent_submission_enabled,true);assert.equal(actualCap.body.agent_memory_runtime_enabled,true);assert.equal(actualCap.body.agent_feedback_submission_enabled,true);assert.equal(actualCap.body.original_model_pagination_protocol,'native_model_connections_paging_v1');assert.equal(actualCap.body.model_probe_enabled,false)
  // Existing F01 readiness seeds use their reviewed synthetic probe port. This
  // host adds no probe, status override, model call, Worker tick or event row.
  const initialProbeAudits=(await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE action='model.connection_probe'")).rows[0].n
  assert.equal(initialProbeAudits,2)
  for(let i=0;i<60;i++)await models.create(identities.alice,{name:'Queued selector '+String(i+1).padStart(2,'0'),provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-queued-selector-key-'+i,models:['synthetic'],enabled:true},f.users.alice)
  const acl=await f.sharedKnowledge(),owned={}
  const graph=version=>contract.safeWorkflowGraph({...(version===2?{version:2}:{}),nodes:[{id:'start',type:'start',data:{title:'Stored start'},position:{x:0,y:0}},{id:'end',type:'end',data:{title:'Stored end'},position:{x:250,y:0}}],edges:[{id:'stored-start-end',source:'start',target:'end'}]})
  for(const who of ['alice','bob']){
   const identity=identities[who],parent=await f.agents.get(identity,f.resources[who].spec.id)
   const single=await f.agents.create(identity,'Original safe Agent '+who,contract.safeAgentSpec({goal:'Original safe queue '+who,task_scope:'Disposable owned read/control only',task_plan:[],done_criteria:['No execution'],deliverables:['Queued record'],tools:[],knowledge_base_ids:[]}))
   const safeWorkflow=await new workflow.WorkflowRepository(f.pool).create(identity,'Original safe Workflow '+who,graph(1)),versioned=await new workflow.WorkflowRepository(f.pool).create(identity,'Original V2 Workflow '+who,graph(2))
   const routes={agent_single:['/api/v2/agent-specs/'+single.id+'/runs',{instruction:'Original safe queue '+who,idempotency_key:'original_safe_queue_'+who}],workflow_safe:['/api/v2/workflows/'+safeWorkflow.id+'/runs',{expected_revision:safeWorkflow.revision,idempotency_key:'original_wfsafe_queue_'+who}],workflow_v2:['/api/v2/workflows/'+versioned.id+'/native-runs',{expected_revision:versioned.revision,idempotency_key:'original_wfv2_queue_'+who,instruction:'Original V2 queue '+who}],agent_autonomous:['/api/v2/agent-specs/'+parent.id+'/autonomous-runs',{expected_revision:parent.revision,idempotency_key:'original_auto_queue_'+who,instruction:'Original autonomous queue '+who,max_steps:3,require_plan_review:false}]}
   owned[who]={parent,single,safeWorkflow,versioned,runs:{}}
   for(const[kind,[route,body]]of Object.entries(routes)){const actual=await request(who,route,'POST',body,f.users[who]);assert.equal(actual.status,['agent_single','workflow_safe'].includes(kind)?202:201,'actual queued submit '+kind);assert.equal(actual.body.run.status,'queued');assert.equal(actual.body.run.step_count,0);owned[who].runs[kind]=actual.body}
  }
  proofs=createOriginalRunQueuedProofs(f,owned,identities,{modelCredentialReads:()=>modelCredentialReads,initialProbeAudits})
  await proofs.assertZeroExecution();await proofs.proveAdmission()
  reviewed.check()
  return{users:f.users,credentials:f.credentials,serverTls:f.serverTls,profiles,owned,nativeOrigin,allowedOrigin:permit.origin,request,close,...proofs,
   finalOwnerAudit:()=>finalOwnerAudit,
   async assertZeroExecution(){if(!closed)return proofs.assertZeroExecution();assert(finalZeroProof,'final zero proof must have completed before actual pool close');return {...finalZeroProof,verified_before_actual_pool_close:true}},
   async revokeKnowledge(){const actual=await acl.revoke();const current=await request('bob','/api/v2/agent-autonomous-runs/'+owned.bob.runs.agent_autonomous.run.id);assert.equal(current.status,200);assert.equal(current.body.knowledge_outputs_available,false,'actual empty-memory receipt must recheck original KB ACL');assert(actual);return{actual_acl_revoke:true,actual_queued_source_unavailable:true}},
   setFeedbackSubmission(enabled){assert.equal(typeof enabled,'boolean');if(enabled){selectedEnv.AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED=env.AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED;selectedEnv.AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED=env.AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED}else{delete selectedEnv.AGENT_STUDIO_PG_AGENT_FEEDBACK_ENABLED;delete selectedEnv.AGENT_STUDIO_PG_AGENT_FEEDBACK_APPROVED}configure();assert.equal(selectedPolicy.agentFeedbackUat===true,enabled)},
   backendProfile:Object.freeze({head:permit.head,profile:permit.profile,actual_F01_fixture:true,optional070_verified:true,optional071_verified:true,optional072_verified:true,optional073_verified:true,actual_memory_context_audit:true,actual_feedback_audit:true,actual_own_operations_audit:true,actual_global_selector:true,actual_four_engine_submit:true,actual_model_selector_rows:61,actual_inherited_readiness_seed_probes:2,extra_model_probes:0,actual_provider_DNS_TLS_acceptance:false,Worker_ticks:0,production_GO:false})}
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_run_queued_backend_start_and_cleanup_failed')}throw error}
}
