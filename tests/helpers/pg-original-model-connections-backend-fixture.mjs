import {requireOriginalModelConnectionsBrowserCi} from './pg-original-model-connections-browser-guard.mjs'
import {verifyOriginalModelConnectionsReviewedSources} from './pg-original-model-connections-reviewed-check.mjs'
// Dedicated disposable composition. Existing read-only Login/Home fixtures
// and their zero-model teardown checks are not relabeled or weakened.
export async function originalModelConnectionsBackendFixture(env=process.env){
 const permit=requireOriginalModelConnectionsBrowserCi(env),reviewed=await verifyOriginalModelConnectionsReviewedSources(env)
 const [fs,path,crypto,https,{default:assert},base,source,review070,review071,review072,homeAudit,catalogAudit,statsAudit,monitorAudit,homeRuntime,catalogRuntime,monitorRuntime,nativeModule,designHttp,designLedger,http,tools,knowledge,workflow,own,outcome,ownHttp,policy,modelModule]=await Promise.all([
  import('node:fs'),import('node:path'),import('node:crypto'),import('node:https'),import('node:assert/strict'),
  import('../../services/pg-api/tests/helpers/agent-design-genuine-fixture.mjs'),import('../../services/pg-api/src/pg18-complete-profile-source.mjs'),
  import('../../ops/pg18-original-home070-review-plan.mjs'),import('../../ops/pg18-original-home071-review-plan.mjs'),import('../../ops/pg18-original-home072-review-plan.mjs'),
  import('../../services/pg-api/src/native-home-authoring-audit.ts'),import('../../services/pg-api/src/native-agent-catalog-audit.ts'),import('../../services/pg-api/src/native-home-knowledge-stats-audit.ts'),import('../../services/pg-api/src/native-monitor-inbox-audit.ts'),
  import('../../services/pg-api/src/native-home-agent-specs-runtime.ts'),import('../../services/pg-api/src/native-agent-catalog-runtime.ts'),import('../../services/pg-api/src/native-monitor-inbox-runtime.ts'),
  import('../../services/pg-api/src/native-auth-http.mjs'),import('../../services/pg-api/src/agent-design-http.ts'),import('../../services/pg-api/src/agent-design-ledger.ts'),import('../../services/pg-api/src/http.ts'),
  import('../../services/pg-api/src/tool-connection-repository.ts'),import('../../services/pg-api/src/knowledge-repository.ts'),import('../../services/pg-api/src/workflow-repository.ts'),
  import('../../services/pg-api/src/own-operations-repository.ts'),import('../../services/pg-api/src/agent-memory-outcome-audit.ts'),import('../../services/pg-api/src/own-operations-http.ts'),import('../../services/pg-api/src/native-config-uat-policy.ts'),import('../../services/pg-api/src/model-connection-repository.ts')])
 const uatPolicy=policy.selectNativePg18UatCapabilities(env,true,permit.origin)
 assert.equal(uatPolicy.configurationWrites,true,'original ModelConnections requires explicit original config UAT approval')
 assert.equal(uatPolicy.modelProbeUat,false,'metadata-only ModelConnections must keep original provider probe closed')
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
 const snapshot=await source.captureCompleteProfileSources(),p070=await review070.captureOriginalHome070ReviewPlan(),p071=await review071.captureOriginalHome071ReviewPlan(),p072=await review072.captureOriginalHome072ReviewPlan()
 assert.equal(p070.manifest.base_source_sha256,snapshot.source_sha256);assert.equal(p071.manifest.predecessor_source_sha256,p070.source_sha256);assert.equal(p072.manifest.predecessor_source_sha256,p071.source_sha256)
 const readPin=pin=>{const bytes=fs.readFileSync(path.join(reviewed.repo,pin.path));assert.equal(sha(bytes),pin.sha256);return bytes.toString('utf8')}
 let f,server,native,home,catalog,monitor,generic,models,modelCredentialReads=0,closed=false;const paginationSeeds=[]
 const cookies=new Map(),identities={}
 const close=async()=>{if(closed)return;closed=true;const failures=[]
  if(server){server.closeAllConnections();try{await new Promise(resolve=>server.close(resolve))}catch(e){failures.push(e)}}
  try{if(f){assert.equal(modelCredentialReads,0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);f.assertNoProviderErrors()}}catch(e){failures.push(e)}
  try{await f?.close()}catch(e){failures.push(e)}
  cookies.clear();try{reviewed.check()}catch(e){failures.push(e)}
  if(failures.length)throw new AggregateError(failures,'original_model_connections_backend_cleanup_failed')
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
  // Root owns this Native option/marker. It is selected from the same actual
  // repository instance; the actual Cookie capability check below also runs.
  const strictModelContract=models.originalUiProtocol==='native_model_connections_owner_cas_v1'
  assert.equal(strictModelContract,true,'actual strict model repository contract required')
  native=nativeModule.createNativeAuthHttpHandler({auth:f.auth,allowedOrigin:permit.origin,allowConfigurationWrites:uatPolicy.configurationWrites,allowOwnOperations:true,allowModelProbe:false,allowOriginalModelConnections:strictModelContract,originalModelPaginationProtocol:Object.getOwnPropertyDescriptor(models,'paginationProtocol')?.value,
   businessHandler:async(req,res)=>{
    if(home&&await home(req,res))return
    if(catalog&&await catalog(req,res))return
    if(monitor&&await monitor(req,res))return
    return generic(req,res)
   }})
  home=await homeRuntime.prepareNativeHomeAgentSpecs({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_HOME_ENABLED:'true',AGENT_STUDIO_PG18_ORIGINAL_HOME_SHARED_STATISTICS_ENABLED:'true'},listen:true,allowedOrigin:permit.origin,configurationWrites:uatPolicy.configurationWrites,allowNativeLocalAgentSpecs:false,authenticateRequest:native.authenticateRequest});assert(home)
  const cat=await catalogRuntime.prepareNativeAgentCatalog({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_AGENT_CATALOG_ENABLED:'true'},listen:true,allowedOrigin:permit.origin,configurationWrites:uatPolicy.configurationWrites});assert(cat);catalog=cat.createHandler(native.authenticateRequest)
  const mon=await monitorRuntime.prepareNativeMonitorInbox({pool:f.pool,env:{AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'},listen:true,allowedOrigin:permit.origin});assert(mon);monitor=mon.createHandler(native.authenticateRequest)
  generic=http.createHandler({repository:f.agents,modelConnectionRepository:models,toolConnectionRepository:new tools.ToolConnectionRepository(f.pool,f.key),workflowRepository:new workflow.WorkflowRepository(f.pool),knowledgeRepository:new knowledge.KnowledgeBaseRepository(f.pool),allowedOrigin:permit.origin,authenticateRequest:native.authenticateRequest,verifyToken:async()=>{throw Error('original_model_connections_Native_Cookie_only')}})
  const available=await own.inspectOwnOperationsSchema(f.pool,await outcome.inspectAgentMemoryOutcomeSchema(f.pool));assert.equal(available,true)
  generic=ownHttp.createNativeOwnOperationsBusinessHandler({repository:new own.OwnOperationsRepository(f.pool),available,policy:uatPolicy,businessHandler:generic,allowedOrigin:permit.origin,authenticateRequest:native.authenticateRequest})
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
   assert(['alice','bob'].includes(who)&&typeof route==='string'&&route.startsWith('/api/')&&!route.includes('?')&&['GET','POST','PATCH','DELETE'].includes(method))
   const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),upstream=new URL(nativeOrigin)
   return new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:Number(upstream.port),servername:'localhost',path:route,method,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(8000),headers:{Accept:'application/json',Origin:permit.origin,Cookie:cookies.get(who),...(method==='GET'?{}:{'Content-Type':'application/json','X-AgentStudio-Request':'1'}),...(bytes?{'Content-Length':String(bytes.length)}:{}),...(expectedEmployee?{'X-AgentStudio-Expected-Employee':expectedEmployee}:{})}},res=>{let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy();return}chunks.push(Buffer.from(chunk))});res.once('error',reject);res.once('aborted',()=>reject(Error('original_model_connections_probe_response_lost')));res.once('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))})}catch{reject(Error('original_model_connections_probe_invalid_response'))}})});req.once('error',reject);req.end(bytes)})
  }
  const actualCap=await request('alice','/api/native-auth/capabilities')
  assert.equal(actualCap.status,200);assert.equal(actualCap.body.mode,'native_pg18');assert.equal(actualCap.body.original_model_connections_protocol,'native_model_connections_owner_cas_v1');assert.equal(actualCap.body.config_writes_enabled,true);assert.equal(actualCap.body.model_probe_enabled,false);assert.equal(actualCap.body.original_model_pagination_protocol,'native_model_connections_paging_v1')
  assert.equal(modelCredentialReads,0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0)
  reviewed.check()
  return{...f,models,nativeOrigin,allowedOrigin:permit.origin,profiles,homeKnowledge,request,close,
   pageModelCredentialReads:()=>modelCredentialReads,
   assertNoModelEffects(){assert.equal(modelCredentialReads,0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0);f.assertNoProviderErrors()},
    async seedPaginationRows(){
     assert.equal(paginationSeeds.length,0);const before=(await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.model_connections WHERE owner_user_id=$1::uuid',[f.users.alice])).rows[0].n
     for(let i=0;i<251;i++){
      const row=await models.create(identities.alice,{name:'Original pagination synthetic Alice '+String(i).padStart(3,'0'),provider:'openai',base_url:'https://api.openai.com/v1',api_key:'synthetic-pagination-never-provider-'+String(i).padStart(4,'0'),models:['synthetic-pagination-model'],enabled:true},f.users.alice)
      assert.equal(row.owner_user_id,f.users.alice);paginationSeeds.push({id:row.id,revision:row.revision})
     }
     assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.model_connections WHERE owner_user_id=$1::uuid',[f.users.alice])).rows[0].n,before+251)
     return{added_rows:251,expected_owner_rows:before+251,last_page_original_name:f.resources.alice.model.name}
    },
    async cleanupPaginationRows(){
     let removed=0
     while(paginationSeeds.length){const row=paginationSeeds.at(-1);const result=await models.delete(identities.alice,row.id,row.revision,f.users.alice);assert.equal(result,true);paginationSeeds.pop();removed++}
     return{removed_rows:removed,remaining_seed_rows:paginationSeeds.length}
    },
   async modelCounts(){return(await f.db.query("SELECT (SELECT count(*)::integer FROM agentstudio.model_connections) AS connections,(SELECT count(*)::integer FROM agentstudio.audit_events WHERE target_kind='model_connection') AS model_audit")).rows[0]},
   async modelFor(who,id){assert(['alice','bob'].includes(who));return models.get(identities[who],id)},
   async modelAudit(who,id){assert(['alice','bob'].includes(who));const rows=(await f.db.query("SELECT owner_user_id,actor_user_id,action,result,metadata FROM agentstudio.audit_events WHERE target_kind='model_connection' AND target_id=$1::text",[id])).rows;assert(rows.length>0);const actions=['model.connection_create','model.connection_update','model.connection_enable','model.connection_disable','model.connection_delete'];for(const row of rows){assert.equal(row.owner_user_id,f.users[who]);assert.equal(row.actor_user_id,f.users[who]);assert.equal(row.result,'succeeded');assert(actions.includes(row.action));assert.deepEqual(Object.keys(row.metadata),['revision']);assert(Number.isSafeInteger(row.metadata.revision)&&row.metadata.revision>=1)}return{count:rows.length,entries:rows.map(row=>({action:row.action,revision:row.metadata.revision})).sort((a,b)=>a.action.localeCompare(b.action)),actual_owner_audit_verified:true,sensitive_fields_absent:true}},
   browserHomeProfile:Object.freeze({profile:permit.profile,head:permit.head,actual_F01_fixture:true,optional070_verified:true,optional071_verified:true,optional072_verified:true,optional073_verified:true,own_operations_verified:true,F01_audit_after_optional_catalog_verified:true,configuration_writes:uatPolicy.configurationWrites,complete069_original_initializer_verified:false,Native_server_process_entry_verified:false,synthetic_only:true,production_GO:false}),
   async agent(who,id){assert(['alice','bob'].includes(who));return f.agents.get(identities[who],id)},
   async agentsFor(who){assert(['alice','bob'].includes(who));return f.agents.list(identities[who],50)},
   async manualSaveAudit(who,id){const actual=await f.agents.get(identities[who],id);assert(actual);const row=(await f.db.query('SELECT authoring FROM agentstudio.agent_spec_authoring WHERE owner_user_id=$1::uuid AND agent_spec_id=$2::uuid',[f.users[who],id])).rows;assert.equal(row.length,1);const history=(await f.db.query("SELECT spec_revision,safe_spec FROM agentstudio.agent_collaboration_revisions WHERE owner_user_id=$1::uuid AND spec_id=$2::uuid AND kind='edited' ORDER BY spec_revision",[f.users[who],id])).rows;return{actual,authoring:row[0].authoring,history}},
  }
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'original_model_connections_backend_start_and_cleanup_failed')}throw error}
}
