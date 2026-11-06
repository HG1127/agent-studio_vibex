import {requireOriginalVersionReleaseCi,assertOriginalVersionReleaseServiceContracts} from './pg-original-version-release-browser-guard.mjs'
import {verifyOriginalVersionReleaseReviewedSources} from './pg-original-version-release-reviewed-check.mjs'
import {verifyReleaseCommitEvidence} from './pg-original-version-release-proof-contract.mjs'
import {createRequire} from 'node:module'
export function originalReleaseApiRequire(){return createRequire(new URL('../../services/pg-api/package.json',import.meta.url))}
// Stored output fixes approval to true; only editable input returns to its parser.
export function originalReleaseSpecInput(spec){const {require_approval,...editable}=spec;return editable}
// Dedicated disposable composition. Existing read-only Login/Home fixtures
// and their zero-model teardown checks are not relabeled or weakened.
export async function originalVersionReleaseBackendFixture(env=process.env){
 const permit=requireOriginalVersionReleaseCi(env);assertOriginalVersionReleaseServiceContracts(permit.policy);const reviewed=await verifyOriginalVersionReleaseReviewedSources(env)
 const [fs,path,crypto,https,{default:assert},base,source,review070,review071,review072,homeAudit,catalogAudit,statsAudit,monitorAudit,homeRuntime,catalogRuntime,monitorRuntime,nativeModule,http,tools,knowledge,workflow,own,outcome,ownHttp,policy,modelModule,nativeRun,safeRun,v2Run,autoRun,memory,memoryAudit,memoryContextAudit,feedback,feedbackAudit,humanAudit,contract,releaseModule,releaseAudit,workerModule,scramModule]=await Promise.all([
  import('node:fs'),import('node:path'),import('node:crypto'),import('node:https'),import('node:assert/strict'),
  import('../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'),import('../../services/pg-api/src/pg18-complete-profile-source.mjs'),
  import('../../ops/pg18-original-home070-review-plan.mjs'),import('../../ops/pg18-original-home071-review-plan.mjs'),import('../../ops/pg18-original-home072-review-plan.mjs'),
  import('../../services/pg-api/src/native-home-authoring-audit.ts'),import('../../services/pg-api/src/native-agent-catalog-audit.ts'),import('../../services/pg-api/src/native-home-knowledge-stats-audit.ts'),import('../../services/pg-api/src/native-monitor-inbox-audit.ts'),
  import('../../services/pg-api/src/native-home-agent-specs-runtime.ts'),import('../../services/pg-api/src/native-agent-catalog-runtime.ts'),import('../../services/pg-api/src/native-monitor-inbox-runtime.ts'),
  import('../../services/pg-api/src/native-auth-http.mjs'),import('../../services/pg-api/src/http.ts'),
  import('../../services/pg-api/src/tool-connection-repository.ts'),import('../../services/pg-api/src/knowledge-repository.ts'),import('../../services/pg-api/src/workflow-repository.ts'),
  import('../../services/pg-api/src/own-operations-repository.ts'),import('../../services/pg-api/src/agent-memory-outcome-audit.ts'),import('../../services/pg-api/src/own-operations-http.ts'),import('../../services/pg-api/src/native-config-uat-policy.ts'),import('../../services/pg-api/src/model-connection-repository.ts'),import('../../services/pg-api/src/native-run-repository.ts'),import('../../services/pg-api/src/workflow-safe-run-repository.ts'),import('../../services/pg-api/src/workflow-v2-run-repository.ts'),import('../../services/pg-api/src/autonomous-agent-run-repository.ts'),import('../../services/pg-api/src/agent-memory-repository.ts'),import('../../services/pg-api/src/agent-memory-audit.ts'),import('../../services/pg-api/src/agent-memory-context-audit.ts'),import('../../services/pg-api/src/agent-feedback-repository.ts'),import('../../services/pg-api/src/agent-feedback-audit.ts'),import('../../services/pg-api/src/agent-human-input-audit.ts'),import('../../services/pg-api/src/contracts.ts'),import('../../services/pg-api/src/agent-release-repository.ts'),import('../../services/pg-api/src/agent-release-audit.ts'),import('../../services/pg-api/src/workflow-v2-worker.ts'),import('../../services/pg-api/src/native-activation-cli.mjs')])
  const Pg=originalReleaseApiRequire()('pg')
 const selectedEnv={...env};let selectedPolicy=policy.selectNativePg18UatCapabilities(selectedEnv,true,permit.origin)
 for(const key of ['configurationWrites','runApprovalUat','workflowExecutionUat','workflowV2ExecutionUat','autonomousAgentUat','agentMemoryUat','agentFeedbackUat','knowledgeSharingUat'])assert.equal(selectedPolicy[key],true,'actual isolated selector approval required before PG: '+key)
 assert.equal(selectedPolicy.modelProbeUat,false);assert.notEqual(selectedPolicy.boundModelExecutionUat,true);assert.notEqual(selectedPolicy.knowledgeToolExecutionUat,true)
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
 const snapshot=await source.captureCompleteProfileSources(),p070=await review070.captureOriginalHome070ReviewPlan(),p071=await review071.captureOriginalHome071ReviewPlan(),p072=await review072.captureOriginalHome072ReviewPlan()
 assert.equal(p070.manifest.base_source_sha256,snapshot.source_sha256);assert.equal(p071.manifest.predecessor_source_sha256,p070.source_sha256);assert.equal(p072.manifest.predecessor_source_sha256,p071.source_sha256)
 const readPin=pin=>{const bytes=fs.readFileSync(path.join(reviewed.repo,pin.path));assert.equal(sha(bytes),pin.sha256);return bytes.toString('utf8')}
 let f,server,native,home,catalog,monitor,generic,business,models,proofs,configure,available,memoryAvailable,feedbackAvailable,humanAvailable,modelCredentialReads=0,closed=false,finalOwnerAudit=false,finalZeroProof=null
 let workerPool,worker,workerPg,workerTicks=0,releaseAvailable=false
 const assertNoModelExecution=async()=>{if(finalZeroProof)return finalZeroProof;if(!f)return null;assert.equal(modelCredentialReads,0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);f.assertNoProviderErrors();const rows=(await f.db.query("SELECT (SELECT count(*)::integer FROM agentstudio.external_effects) AS effects,(SELECT count(*)::integer FROM agentstudio.audit_events WHERE action='model.connection_probe') AS probes")).rows[0];assert.equal(rows.effects,0);assert.equal(rows.probes,2);return{provider_calls:0,external_effects:0,model_material_reads:0,extra_model_probes:0,inherited_seed_probes:2}}
 const cookies=new Map(),identities={}
 const close=async()=>{if(closed)return;closed=true;const failures=[]
  if(server){server.closeAllConnections();try{await new Promise(resolve=>server.close(resolve))}catch(e){failures.push(e)}}
  try{if(f){assert.equal(modelCredentialReads,0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);f.assertNoProviderErrors()}}catch(e){failures.push(e)}
  try{if(f){const db=await f.pool.connect();try{await db.query('BEGIN READ ONLY');try{await db.query('SET LOCAL ROLE agentstudio_api');assert.equal(await f.audit(db),true);finalOwnerAudit=true}finally{await db.query('ROLLBACK')}}finally{db.release()}}}catch(e){failures.push(e)}
  try{if(f)finalZeroProof=Object.freeze(await assertNoModelExecution())}catch(e){failures.push(e)}
  proofs?.clearProofs()
  try{worker?.closeNewClaims();await workerPg?.end()}catch(e){failures.push(e)}
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
  releaseAvailable=await releaseAudit.inspectAgentReleaseSchema(f.pool);assert.equal(releaseAvailable,true)
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
    allowAgentReleases:releaseAvailable,allowAgentFeedback:feedbackAvailable,allowAgentFeedbackSubmission:selectedPolicy.agentFeedbackUat===true,allowAgentFeedbackLessons:selectedPolicy.agentFeedbackLessonsUat===true,
    allowKnowledgeSharing:selectedPolicy.knowledgeSharingUat===true,businessHandler:(req,res)=>business(req,res)})
   generic=http.createHandler({agentReleaseRepository:new releaseModule.AgentReleaseRepository(f.pool,{enabled:selectedPolicy.configurationWrites===true,allowAcceptance:selectedPolicy.autonomousAgentUat===true,allowHumanInput:humanAvailable}),repository:f.agents,modelConnectionRepository:models,toolConnectionRepository:new tools.ToolConnectionRepository(f.pool,f.key),workflowRepository:new workflow.WorkflowRepository(f.pool),knowledgeRepository:new knowledge.KnowledgeBaseRepository(f.pool),
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
  const request=async(who,route,method='GET',body,expectedEmployee,actualCookie)=>{
   assert(['alice','bob'].includes(who)&&typeof route==='string'&&route.startsWith('/api/')&&route.length<4096&&['GET','POST','PATCH','DELETE'].includes(method))
   const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),upstream=new URL(nativeOrigin)
   return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:route,method,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(8000),headers:{Accept:'application/json',Origin:permit.origin,Cookie:actualCookie??cookies.get(who),...(route.startsWith('/api/v2/original-ui/agent-releases/')?{'X-AgentStudio-Original-Release':'1'}:{}),...(method==='GET'?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(expectedEmployee?{'X-AgentStudio-Expected-Employee':expectedEmployee}:{})}},res=>{let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy();return}chunks.push(Buffer.from(chunk))});res.once('error',reject);res.once('aborted',()=>reject(Error('original_run_queued_probe_response_lost')));res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))})}catch{reject(Error('original_run_queued_probe_invalid_response'))}})});req.once('error',reject);req.end(bytes)})
  }

  const actualCap=await request('alice','/api/native-auth/capabilities');assert.equal(actualCap.status,200);assert.equal(actualCap.body.agent_releases_available,true);assert.equal(actualCap.body.agent_release_acceptance_enabled,true)
  const releases=new releaseModule.AgentReleaseRepository(f.pool,{enabled:true,allowAcceptance:true,allowHumanInput:humanAvailable}),randomUUID=crypto.randomUUID
  const acl=await f.sharedKnowledge(),owned={}
  for(const who of ['alice','bob'])owned[who]=await f.agents.get(identities[who],f.resources[who].spec.id)
  const resource=await f.withResource('alice'),baseSpec=resource.role.spec
  owned.alice=await f.agents.update(identities.alice,resource.role.id,'Original release Alice FULL A',contract.safeAgentSpec({...originalReleaseSpecInput(baseSpec),goal:'Synthetic complete goal A',task_scope:'Synthetic complete scope A',deliverables:['Synthetic full deliverable A'],task_plan:['Synthetic full step A'],done_criteria:['Synthetic full criteria A'],tools:[...new Set([...baseSpec.tools,'knowledge_search'])],knowledge_base_ids:[homeKnowledge.alice.id]}),resource.role.revision)
  const snap=async(who,note)=>{const spec=owned[who].id,w=await releases.workspace(identities[who],spec,f.users[who]);return releases.change(identities[who],spec,{action:'snapshot',request_id:randomUUID(),expected_spec_revision:w.spec_revision,source_sha256:w.source_sha256,note,test_run_id:null},f.users[who])}
  const first=await snap('alice','Synthetic full snapshot A'),firstDetail=await releases.detail(identities.alice,owned.alice.id,first.version_id,f.users.alice)
  const firstHead=await releases.workspace(identities.alice,owned.alice.id,f.users.alice)
  await releases.change(identities.alice,owned.alice.id,{action:'publish',request_id:randomUUID(),expected_spec_revision:firstHead.spec_revision,source_sha256:firstHead.source_sha256,version_id:first.version_id,version_sha256:firstDetail.version_sha256,expected_version_revision:firstDetail.revision,expected_release_revision:firstHead.release_revision,confirm:true,acknowledge_untested:true},f.users.alice)
  for(let n=2;n<=103;n++)await snap('alice','Synthetic historical row '+n)
  const bobSnapshot=await snap('bob','Synthetic Bob private snapshot')
  owned.alice=await f.agents.update(identities.alice,owned.alice.id,'Original release Alice FULL B',contract.safeAgentSpec({...originalReleaseSpecInput(owned.alice.spec),goal:'Synthetic goal B',task_scope:'Synthetic scope B',deliverables:['Synthetic deliverable B'],task_plan:['Synthetic step B'],done_criteria:['Synthetic criteria B'],tools:['calculate','knowledge_search'],http_tools:[],knowledge_base_ids:[homeKnowledge.alice.id]}),owned.alice.revision)
  const latest=await snap('alice','Synthetic full snapshot B')
  const counts=async()=>{const r=(await f.db.query("SELECT (SELECT count(*)::integer FROM agentstudio.agent_release_receipts) AS receipts,(SELECT count(*)::integer FROM agentstudio.audit_events WHERE action LIKE 'agent.release.%') AS audits")).rows[0];return{receipts:r.receipts,audits:r.audits}}
  const sourceEdit=async()=>{const row=await f.agents.get(identities.alice,owned.alice.id);owned.alice=await f.agents.update(identities.alice,row.id,'Original release Alice refreshed source',contract.safeAgentSpec({...originalReleaseSpecInput(row.spec),goal:row.spec.goal+' updated by actual owner API'}),row.revision);return{revision:owned.alice.revision}}
  const disableActualModel=async()=>{const current=await models.get(identities.alice,f.resources.alice.model.id,f.users.alice);assert(current);const saved=await models.update(identities.alice,current.id,{name:current.name,provider:current.provider,base_url:current.base_url,models:current.models,enabled:false},current.revision,f.users.alice);assert(saved);return{revision:saved.revision,enabled:saved.enabled,status:saved.status}}
  const sameState=async()=>({counts:await counts(),source:await f.agents.get(identities.alice,owned.alice.id)})
  const proveRollback=async()=>{const spec=owned.alice.id,w=await releases.workspace(identities.alice,spec,f.users.alice),before=await sameState(),id=randomUUID();const response=await request('alice','/api/v2/original-ui/agent-releases/'+spec+'/change','POST',{action:'snapshot',request_id:id,expected_spec_revision:w.spec_revision+1,source_sha256:w.source_sha256,note:'Synthetic stale CAS must roll back',test_run_id:null},f.users.alice);assert.equal(response.status,409);assert.deepEqual(await sameState(),before);const wrongOwner=await request('bob','/api/v2/original-ui/agent-releases/'+spec,'GET',undefined,f.users.bob);assert.equal(wrongOwner.status,404);const wrongExpected=await request('bob','/api/v2/original-ui/agent-releases/'+owned.bob.id,'GET',undefined,f.users.alice);assert.equal(wrongExpected.status,409);return{actual_Cookie_owner:true,actual_CAS409:true,actual_audit_receipt_source_unchanged:true,foreign_owner404:true,expected_employee409:true}}
  const proveRevokedRestore=async()=>{await acl.revoke();const spec=owned.bob.id,w=await releases.workspace(identities.bob,spec,f.users.bob),d=await releases.detail(identities.bob,spec,bobSnapshot.version_id,f.users.bob),before=await counts(),sourceBefore=await f.agents.get(identities.bob,spec);const response=await request('bob','/api/v2/original-ui/agent-releases/'+spec+'/change','POST',{action:'restore',request_id:randomUUID(),expected_spec_revision:w.spec_revision,source_sha256:w.source_sha256,version_id:d.id,version_sha256:d.version_sha256,expected_version_revision:d.revision,confirm:true,reason:'Synthetic revoked resource restore must fail'},f.users.bob);assert([403,404,409].includes(response.status));assert.deepEqual(await counts(),before);assert.deepEqual(await f.agents.get(identities.bob,spec),sourceBefore);return{actual_KB_revoke:true,actual_restore_refused:true,actual_source_receipts_audit_unchanged:true}}
  const actualRestoreProof=async(version)=>{const d=await releases.detail(identities.alice,owned.alice.id,version,f.users.alice),current=await f.agents.get(identities.alice,owned.alice.id);assert.equal(current.name,d.name);assert.deepEqual(current.spec,d.spec_snapshot);return{actual_full_snapshot_equal:true,all_stored_fields_checked:true,nonempty_MCP_acceptance:false}}
  const assertCommittedAck=async(ack,{action,spec,choice,before,cookie})=>{const parsed=releaseContract.parseAgentReleaseChoice(choice),hash=sha(JSON.stringify({spec_id:spec,...parsed}));assert.equal(parsed.action,action);const me=await request('alice','/api/native-auth/me','GET',undefined,undefined,cookie);assert.equal(me.status,200);const receipt=(await f.db.query('SELECT actor_user_id,request_id,spec_id,action,request_sha256,result FROM agentstudio.agent_release_receipts WHERE actor_user_id=$1::uuid AND request_id=$2::uuid',[me.body.user.id,parsed.request_id])).rows;assert.equal(receipt.length,1);const audit=(await f.db.query("SELECT owner_user_id,actor_user_id,action,target_kind,target_id,result,metadata FROM agentstudio.audit_events WHERE owner_user_id=$1::uuid AND actor_user_id=$1::uuid AND action=$2::text AND target_kind='agent_spec' AND target_id=$3::text ORDER BY occurred_at DESC,id DESC LIMIT 1",[me.body.user.id,'agent.release.'+action,spec])).rows;assert.equal(audit.length,1);return verifyReleaseCommitEvidence({ack,expected:{owner:me.body.user.id,spec,request:parsed.request_id,action,request_sha256:hash},receipt:receipt[0],before,after:await counts(),audit:audit[0],nativeOwner:me.body.user.id})}
  const releaseContract=await import('../../services/pg-api/src/agent-release-contract.ts')
  const workerLogin='synthetic_release_agent_worker',workerPassword=crypto.randomBytes(40).toString('hex'),workerVerifier=scramModule.makeNativeScramVerifier(workerPassword)
  await f.db.exec("CREATE ROLE "+workerLogin+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+workerVerifier+"'")
  await f.db.exec('GRANT agentstudio_worker,agentstudio_api TO '+workerLogin+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
  workerPg=new Pg.Pool({...permit.target,user:workerLogin,password:workerPassword,max:1,statement_timeout:8000,query_timeout:10000})
  workerPool={knowledgeSharing:true,async connect(){const db=await workerPg.connect();return{query:(text,args=[])=>db.query(text,args),release:destroy=>db.release(destroy)}}}
  const role=await workerPg.query("SELECT session_user::text AS login,current_user::text AS role,NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND pg_has_role(r.oid,'agentstudio_worker','MEMBER') AND pg_has_role(r.oid,'agentstudio_api','MEMBER') AS safe FROM pg_catalog.pg_roles r WHERE r.rolname=session_user");assert.equal(role.rows.length,1);assert.equal(role.rows[0].login,workerLogin);assert.equal(role.rows[0].safe,true)
  const memberships=(await workerPg.query("SELECT parent.rolname,NOT m.admin_option AND NOT m.inherit_option AND m.set_option AS safe FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE member.rolname=session_user ORDER BY parent.rolname")).rows;assert.deepEqual(memberships,[{rolname:'agentstudio_api',safe:true},{rolname:'agentstudio_worker',safe:true}])
  worker=new workerModule.WorkflowV2Worker(workerPool,'original-release-parent-only',{executionMode:'agent_native_v2',agentExecutionApproved:true,humanInputApproved:humanAvailable,batchSize:1})
  const advanceAcceptanceToRealApproval=async(run)=>{assert(workerTicks===0);let tick;for(const expected of ['progressed','progressed','awaiting_approval']){tick=await worker.tick();workerTicks++;assert.equal(tick.run_id,run);assert.equal(tick.status,expected)}assert.equal(tick.status,'awaiting_approval');const status=await request('alice','/api/v2/original-ui/agent-releases/'+owned.alice.id+'/acceptance/'+run,'GET',undefined,f.users.alice);assert.equal(status.status,200);assert.equal(status.body.item.status,'awaiting_approval');assert.equal(status.body.item.test_current,false);await assertNoModelExecution();return{actual_Worker:true,actual_tick_status:tick.status,actual_run_id:run,test_current:false,model_steps_executed:0}}
  const historyMetadata=(await releases.workspace(identities.alice,owned.alice.id,f.users.alice)).versions.map(v=>({id:v.id,version_no:v.version_no}))
  await assertNoModelExecution();reviewed.check()
  return{users:f.users,credentials:f.credentials,profiles,serverTls:f.serverTls,nativeOrigin,allowedOrigin:permit.origin,owned,first,latest,bobSnapshot,historyMetadata,request,counts,sourceEdit,disableActualModel,proveRollback,proveRevokedRestore,actualRestoreProof,assertCommittedAck,advanceAcceptanceToRealApproval,workerTicks:()=>workerTicks,assertNoModelExecution,finalOwnerAudit:()=>finalOwnerAudit,close,
   browserHomeProfile:Object.freeze({head:permit.head,profile:permit.profile,actual_F01_fixture:true,optional070_verified:true,optional071_verified:true,optional072_verified:true,optional073_verified:true,actual_release046_verified:true,current_Root_original_release_protocol:true,actual_worker_mode:'parent_approval_only',current_worker_pass:false,seeded_version_rows:104,history_complete:false,model_provider_calls:0,production_GO:false})}
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_version_release_backend_start_and_cleanup_failed')}throw error}
}
