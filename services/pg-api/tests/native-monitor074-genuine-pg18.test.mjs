// Isolated actual PG18/TCP/Native HTTPS chain source. Ordinary hosts refuse
// before pg, filesystem, SQL, sockets, Worker or provider imports/effects.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireNativeMonitor074Ci} from './helpers/native-monitor074-ci-guard.mjs'
const permit=requireNativeMonitor074Ci()
const {nativeMonitor074ReviewedSources:reviewed}=await import('./helpers/native-monitor074-reviewed-sources.mjs')
if(!reviewed||!Object.isFrozen(reviewed)||Object.keys(reviewed).length<25)throw Error('monitor074_Root_reviewed_source_inventory_required')
const fs=await import('node:fs'),path=await import('node:path'),url=await import('node:url'),crypto=await import('node:crypto'),child=await import('node:child_process')
const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'../../..'),sha=v=>crypto.createHash('sha256').update(v).digest('hex')
function assertSources(){
 assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),permit.head)
 assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim(),'')
  for(const file of ['db/postgres/migrations/pg_v9_074_monitor_live.sql','services/pg-api/src/native-monitor-original-executor.ts','services/pg-api/src/native-monitor-worker.ts','services/pg-api/src/native-monitor-live-audit.ts','services/pg-api/src/native-monitor-row-lock.ts','services/pg-api/tests/helpers/native-monitor074-row-lock-genuine.mjs','services/pg-api/src/workflow-v2-worker.ts','services/pg-api/src/workflow-v2-agent-machine.ts'])assert(Object.hasOwn(reviewed,file),file)
 for(const file of ["services/pg-api/tests/helpers/native-monitor074-prerequisites.mjs","services/pg-api/src/pg18-complete-profile-source.mjs","services/pg-api/src/approval-delegation-audit.ts","services/pg-api/src/native-local-device-audit.ts","services/pg-api/src/agent-caller-audit.ts","services/pg-api/src/owner-tool-trial-audit.ts","db/postgres/migrations/pg_v9_063_agent_template_market.sql","db/postgres/migrations/pg_v9_064_agent_plan_workflow.sql","db/postgres/migrations/pg_v9_065_agent_internal_share.sql","db/postgres/migrations/pg_v9_066_agent_approval_delegation.sql","db/postgres/migrations/pg_v9_067_native_local_devices.sql","db/postgres/migrations/pg_v9_068_agent_public_callers.sql","db/postgres/migrations/pg_v9_069_owner_tool_trials.sql"])assert(Object.hasOwn(reviewed,file),file)
 for(const [relative,expected]of Object.entries(reviewed)){
  assert(!relative.startsWith('/')&&!relative.split('/').includes('..'));assert.match(expected,/^[a-f0-9]{64}$/)
  let at=root
  for(const piece of relative.split('/')){assert.equal(fs.lstatSync(at).isSymbolicLink(),false);at=path.join(at,piece)}
  const stat=fs.lstatSync(at);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=16*1024*1024);assert.equal(sha(fs.readFileSync(at)),expected,relative)
 }
}
assertSources()
const {installMonitor074Prerequisites}=await import('./helpers/native-monitor074-prerequisites.mjs')
const [{agentDesignGenuineFixture},{makeNativeScramVerifier},{default:pg},https,{createNativeAuthHttpHandler},{prepareNativeMonitorLive},{inspectOptionalMonitorLive},{AgentSpecRepository},{safeNativeMonitorBusinessSpec},{ScheduleDraftRepository},{ScheduleRuntimeRepository},{ScheduleRuntimeWorker},{WorkflowV2Worker},{AutonomousAgentRunRepository},{NativeMonitorGetTransport},{NativeMonitorCaptureDispatcher},{NativeMonitorOriginalExecutor},{createWorkflowToolNetwork}]=await Promise.all([
 import('./helpers/agent-design-genuine-fixture.mjs'),import('../src/native-activation-cli.mjs'),import('pg'),import('node:https'),import('../src/native-auth-http.mjs'),import('../src/native-monitor-live-runtime.ts'),import('../src/native-monitor-live-audit.ts'),import('../src/repository.ts'),import('../src/native-monitor-business-contract.ts'),import('../src/schedule-draft-repository.ts'),import('../src/schedule-runtime-repository.ts'),import('../src/schedule-runtime-worker.ts'),import('../src/workflow-v2-worker.ts'),import('../src/autonomous-agent-run-repository.ts'),import('../src/native-monitor-live-transport.ts'),import('../src/native-monitor-live-capture.ts'),import('../src/native-monitor-original-executor.ts'),import('../src/workflow-v2-tool-network.ts')
])
const newId=()=>crypto.randomUUID(),declaredText='FACT: Synthetic Person has an EMPLOYMENT relation with Synthetic Organization from 2020. This is a disposable DEMO dataset, not company data.',sourceUrl='https://httpbin.org/base64/'+Buffer.from(declaredText).toString('base64')
test('074 real Native schedule->approved step->one-use GET->business ledger->freeze->employee review/baseline', {timeout:240000},async t=>{
 let f,server,handler,primary,monitorExecutor,monitorCoordinator;const extraPools=[],cleanup=[],cookies=new Map();let sourceGets=0,modelCalls=0
 try{
  f=await agentDesignGenuineFixture();assertSources()
  await installMonitor074Prerequisites(f)
  assert.equal(await inspectOptionalMonitorLive(f.pool),'absent')
  await f.db.exec(fs.readFileSync(path.join(root,'db/postgres/migrations/pg_v9_073_monitor_inbox.sql'),'utf8'))
  await f.db.exec(fs.readFileSync(path.join(root,'db/postgres/migrations/pg_v9_074_monitor_live.sql'),'utf8'))
  const makePool=async(name,roles)=>{
   assert.match(name,/^[a-z_]+$/);assert.match(roles,/^[a-z_,]+$/)
   const password=crypto.randomBytes(40).toString('hex')
   await f.db.query('CREATE ROLE '+name+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+makeNativeScramVerifier(password)+"'")
   await f.db.query('GRANT '+roles+' TO '+name)
   const pool=new pg.Pool({...permit.target,user:name,password,max:4,statement_timeout:10000,query_timeout:15000});pool.on('error',()=>{});extraPools.push(pool)
   return{knowledgeSharing:true,connect:()=>pool.connect()}
  }
  const originalPool=await makePool('monitor_ci_original','agentstudio_api,agentstudio_worker'),coordinatorPool=await makePool('monitor_ci_coordinator','agentstudio_api,agentstudio_monitor_worker'),sourcePool=await makePool('monitor_ci_source','agentstudio_monitor_dispatch')
  assert.equal(await inspectOptionalMonitorLive(f.pool),'installed')
  server=https.createServer({...f.serverTls,minVersion:'TLSv1.2'},(req,res)=>{void handler(req,res).catch(()=>res.destroy())})
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const origin='https://localhost:'+server.address().port
  const runtime=await prepareNativeMonitorLive({pool:f.pool,listen:true,allowedOrigin:origin,configurationWrites:true,env:{AGENT_STUDIO_PG18_MONITOR_LIVE_ENABLED:'true',AGENT_STUDIO_PG18_MONITOR_LIVE_APPROVED:'APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_ONLY',AGENT_STUDIO_PG18_MONITOR_LIVE_EXECUTION_APPROVED:'APPROVE_DISPOSABLE_PG18_MONITOR_LIVE_EXECUTION_ONLY',AGENT_STUDIO_PG18_ORIGINAL_MONITOR_INBOX_ENABLED:'true'}});assert(runtime)
  const native=createNativeAuthHttpHandler({auth:f.auth,allowedOrigin:origin,businessHandler:async(req,res)=>{if(await runtime.createHandler(native.authenticateRequest)(req,res))return;res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"not_found"}')}});handler=native.handler
  const request=(route,{who='alice',method='GET',body,headers={},cookie}={})=>new Promise((resolve,reject)=>{
   const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
   const req=https.request({hostname:'127.0.0.1',servername:'localhost',port:server.address().port,path:route,method,ca:f.serverTls.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(15000),headers:{Origin:origin,Accept:'application/json','X-AgentStudio-Expected-Employee':f.users[who],...(method==='POST'?{'X-AgentStudio-Request':'1'}:{}),...(cookie===null?{}:{Cookie:cookie??cookies.get(who)??''}),...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length)}:{}),...headers}},res=>{
    const chunks=[];let length=0;res.on('data',b=>{length+=b.length;if(length>1048576){res.destroy();return};chunks.push(b)});res.once('error',reject);res.once('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))})}catch(error){reject(error)}})
   });req.once('error',reject);req.end(bytes)
  })
  for(const who of ['alice','bob']){const signed=await request('/api/native-auth/login',{who,method:'POST',cookie:null,body:f.credentials[who]});assert.equal(signed.status,200);cookies.set(who,signed.headers['set-cookie'].find(s=>s.startsWith('__Host-agentstudio_session=')).split(';')[0])}
  const identity=await f.identityFor('alice'),api='/api/v2/original-ui/business',created=await request(api+'/cases',{method:'POST',body:{title:'074 actual owned DEMO case',data_space:'DEMO',questions:['What does the declared synthetic source support?']}});assert.equal(created.status,200)
  const caseId=created.body.case_id,entities={}
  for(const [name,type]of [['person','PERSON'],['organization','ORGANIZATION']]){
   const response=await request(api+'/cases/'+caseId+'/records',{method:'POST',body:{expected_version:0,schema_id:'research.entity.v1',payload:{canonical_name:type==='PERSON'?'Synthetic Person':'Synthetic Organization',entity_type:type,aliases:[],identity_status:'CONFIRMED',identity_basis:'Explicit employee confirmation of a disposable synthetic identity'},source_refs:[],idempotency_key:'entity-'+name}})
   assert.equal(response.status,200);entities[name]=response.body.record_id
  }
  const spec=await new AgentSpecRepository(f.pool).create(identity,'074 real collector',safeNativeMonitorBusinessSpec({goal:'Use only the declared synthetic source, read its receipt and write the bounded owned relation.',tools:['web_fetch','business_case_get','business_record_query','business_record_write','result_read'],knowledge_base_ids:[],model_binding:f.resources.alice.binding},true))
  const draft=await new ScheduleDraftRepository(f.pool).create(identity,{name:'074 real Native schedule',kind:'agent',target_id:spec.id,time_zone:'UTC',rule:{kind:'interval',interval_minutes:1}})
  const schedules=new ScheduleRuntimeRepository(f.pool,{enabled:true,allowMonitorBusiness:true}),anchor=new Date(Date.now()+120000).toISOString()
  const activation=revision=>({expected_revision:revision,expected_target_revision:Number(spec.revision),instruction:'Collect the declared synthetic source and persist its supported DEMO relation.',max_steps:10,anchor_at:anchor,expires_at:null,max_occurrences:10,max_auto_effects:20,background_ack:'AUTHORIZE_NATIVE_SCHEDULE_BACKGROUND_V1',knowledge_charge_ack:null,request_id:newId(),model_binding:f.resources.alice.binding})
  const active=await schedules.activate(identity,draft.id,activation(Number(draft.revision)));assert(active)
  const proposal={title:'074 actual synthetic employment monitor',schedule_id:draft.id,adapter_id:'research.relationship-events.v1',target_entity_ids:[entities.person],relation_types:['EMPLOYMENT'],sources:[{source_id:'declared_fact',tool:'web_fetch',input:{url:sourceUrl},adapter_id:'web.text.v1',required_markers:['FACT:','Synthetic Person']}],execution_budget:{model_calls:20,tool_calls:30,read_calls:30,search_calls:0,closing_model_calls:1,wall_ms:600000}}
  const preview=await request(api+'/cases/'+caseId+'/monitors/preview',{method:'POST',body:proposal});assert.equal(preview.status,200)
  const saved=await request(api+'/cases/'+caseId+'/monitors',{method:'POST',body:{definition:proposal,preview_hash:preview.body.preview_hash,idempotency_key:'074-monitor'}});assert.equal(saved.status,200);assert.equal(saved.body.enabled,false)
  const monitorId=saved.body.monitor_id
  assert.equal((await request(api+'/cases/'+caseId,{who:'bob'})).status,404)
  assert.equal((await request(api+'/monitors/'+monitorId+'/control',{method:'POST',body:{enabled:true,expected_revision:saved.body.revision,expected_schedule_revision:saved.body.schedule_revision}})).status,409)
  // A fresh actual Native acknowledgement is submitted explicitly. The monitor
  // control code never copies or fabricates this activation request.
  const reactivated=await schedules.activate(identity,draft.id,activation(saved.body.schedule_revision));assert(reactivated)
  const enabled=await request(api+'/monitors/'+monitorId+'/control',{method:'POST',body:{enabled:true,expected_revision:saved.body.revision,expected_schedule_revision:reactivated.revision}});assert.equal(enabled.status,200);assert.equal(enabled.body.enabled,true)
  const network=createWorkflowToolNetwork(),transport=new NativeMonitorGetTransport(sourcePool,f.key,{monitorHttp:async()=>assert.fail('undeclared HTTP tool'),monitorWebFetch:async(url,signal)=>{assert.equal(url,sourceUrl);assert(++sourceGets<=permit.declared_source_egress_max);return network.monitorWebFetch(url,signal)}})
  let collection=0
  const delegate={supports:request=>request.kind==='model',execute:async(request,lease)=>{
   assert.equal(request.kind,'model');modelCalls++
   const prompt=JSON.parse(request.input),round=prompt.round
   if(round===1)return JSON.stringify({action:'tool',tool:'business_case_get',params:{}})
   if(round===2)return JSON.stringify({action:'tool',tool:'web_fetch',params:{url:sourceUrl}})
   const source=JSON.parse(prompt.history[1].observation)
   if(round===3)return JSON.stringify({action:'tool',tool:'result_read',params:{run_id:lease.run_id,result_id:source.result_id,field:'text',offset:0,limit:4000}})
   if(round===4){
    if(collection>1)return JSON.stringify({action:'tool',tool:'business_record_query',params:{schema_id:'research.relation.v1',limit:5}})
    const page=JSON.parse(prompt.history[2].observation)
    assert.equal(page.text,declaredText)
    return JSON.stringify({action:'tool',tool:'business_record_write',params:{expected_version:0,schema_id:'research.relation.v1',payload:{from_id:entities.person,to_id:entities.organization,relation_type:'EMPLOYMENT',description:'Declared synthetic DEMO employment fact',valid_from:'2020',valid_to:null,status:'SOURCE_SUPPORTED',missing:[]},source_refs:[{run_id:lease.run_id,result_id:source.result_id,start:0,end:page.text.length,quote:page.text}],idempotency_key:'074-supported-relation'}})
   }
   return JSON.stringify({action:'answer',answer:'Declared DEMO source collected; evidence and controlled ledger are ready for employee review.'})
  }}
  const executor=monitorExecutor=new NativeMonitorOriginalExecutor(originalPool,delegate,new NativeMonitorCaptureDispatcher(sourcePool,transport),{executionApproved:true})
  const original=new WorkflowV2Worker(originalPool,'monitor_original',{executor,executionMode:'agent_native_v2',agentExecutionApproved:true,scheduleExecutionApproved:true,monitorBusinessExecutionApproved:true})
  const launcher=new ScheduleRuntimeWorker(originalPool,'monitor_scheduler',{allowMonitorBusiness:true}),coordinator=monitorCoordinator=runtime.createWorker(coordinatorPool,'monitor_coordinator'),agentRuns=new AutonomousAgentRunRepository(f.pool,{allowMonitorBusiness:true})
  const runCollection=async(stopBeforeAnalysis=false)=>{
   collection++
   const queued=await schedules.runNow(identity,draft.id,reactivated.revision);assert(queued?.run_id)
   const launched=await launcher.tick();assert.equal(launched.status,'started');assert.equal(launched.run_id,queued.run_id)
   for(let i=0;i<120;i++){
    const before=(await f.db.query('SELECT status FROM agentstudio.monitor_live_checks WHERE run_id=$1',[queued.run_id])).rows[0].status
    if(stopBeforeAnalysis&&before==='analyzing')return queued.run_id
    await coordinator.tick()
    const tick=await original.tick()
    if(tick.status==='awaiting_approval'){
     const pending=(await f.db.query("SELECT step_key,substring(reason_code from 5) AS input_sha256 FROM agentstudio.approvals WHERE run_id=$1 AND owner_user_id=$2 AND status='pending'",[queued.run_id,f.users.alice])).rows
     assert(pending.length>0)
     for(const approval of pending)await agentRuns.decide(identity,queued.run_id,{decision:'approved',step_key:approval.step_key,input_sha256:approval.input_sha256})
    }
    const row=(await f.db.query('SELECT status,error FROM agentstudio.monitor_live_checks WHERE run_id=$1',[queued.run_id])).rows[0]
    if(row.status==='needs_review')return queued.run_id
    assert(!['incomplete','cancelled'].includes(row.status),row.error)
   }
   assert.fail('074 collector/coordinator did not converge in120 bounded ticks')
  }
  const firstRun=await runCollection(),firstCheck=(await f.db.query('SELECT id FROM agentstudio.monitor_live_checks WHERE run_id=$1',[firstRun])).rows[0].id
  const {verifyMonitor074ActualRowLocks}=await import('./helpers/native-monitor074-row-lock-genuine.mjs')
  const locks=await verifyMonitor074ActualRowLocks({pool:f.pool,alice:identity,bob:await f.identityFor('bob'),rows:{case:caseId,monitor:monitorId,check:firstCheck}})
  assert.equal(locks.actual_lock_modes_and_transaction_boundaries,12)
  const receipts=(await f.db.query('SELECT id,payload,step_key FROM agentstudio.monitor_live_receipts WHERE run_id=$1',[firstRun])).rows
  assert.equal(receipts.length,1);assert.equal(receipts[0].payload.text,declaredText);assert.match(receipts[0].step_key,/^wf2_00002_agent_a02t$/)
  const read=await request(api+'/runs/'+firstRun+'/results/'+receipts[0].id+'?field=text&offset=0&limit=4000');assert.equal(read.status,200);assert.equal(read.body.text,declaredText);assert.equal(read.body.coverage.stored_complete,true)
  const review=await request(api+'/monitor-checks/'+firstCheck+'/review-preview');assert.equal(review.status,200)
  const accepted=await request(api+'/monitor-checks/'+firstCheck+'/review',{method:'POST',body:{preview_hash:review.body.preview_hash,rationale:'Employee explicitly accepts the exact quoted synthetic DEMO fact and identities.'}});assert.equal(accepted.status,200)
  assert.equal((await request(api+'/monitors/'+monitorId)).body.baseline_check_id,firstCheck)
  // A second actual minute is required by the original scheduler's unique
  // occurrence key. No fake clock or manually fabricated origin/check is used.
  const firstMinute=Math.floor(Date.now()/60000)
  while(Math.floor(Date.now()/60000)===firstMinute)await new Promise(resolve=>setTimeout(resolve,Math.min(1000,60000-Date.now()%60000+50)))
  const secondRun=await runCollection(true),secondCheck=(await f.db.query('SELECT id FROM agentstudio.monitor_live_checks WHERE run_id=$1',[secondRun])).rows[0].id
  const relation=(await f.db.query("SELECT record_id,version::text AS version FROM agentstudio.monitor_live_records WHERE owner_user_id=$1 AND case_id=$2 AND schema_id='research.relation.v1' ORDER BY version DESC LIMIT 1",[f.users.alice,caseId])).rows[0]
  const rejected=await request(api+'/cases/'+caseId+'/reviews',{method:'POST',body:{record_id:relation.record_id,record_version:Number(relation.version),decision:'rejected',rationale:'Explicit later employee rejection; previous monitor acceptance cannot authorize another baseline.'}});assert.equal(rejected.status,200)
  await coordinator.tick()
  assert.equal((await f.db.query('SELECT status FROM agentstudio.monitor_live_checks WHERE id=$1',[secondCheck])).rows[0].status,'needs_review')
  assert.equal((await request(api+'/monitors/'+monitorId)).body.baseline_check_id,firstCheck)
  assert.equal(sourceGets,2);assert(modelCalls>0);assert.equal(f.providerRequests.length,0);assert.equal(f.credentialReads(),0)
  const inbox=await request('/api/v2/original-ui/monitor-inbox?limit=10');assert.equal(inbox.status,200);assert(inbox.body.items.some(i=>i.item_id==='check:'+secondCheck&&i.kind==='needs_review'))
  assert.equal((await request(api+'/monitor-checks/'+secondCheck+'/review-preview',{who:'bob'})).status,404)
  assert.equal(await inspectOptionalMonitorLive(f.pool),'installed');f.assertNoProviderErrors();assertSources()
 }catch(error){primary=error}
 finally{
  monitorCoordinator?.closeNewClaims();monitorExecutor?.close()
  if(server){server.closeAllConnections();try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}catch(error){cleanup.push(error)}}
  for(const pool of extraPools)try{await pool.end()}catch(error){cleanup.push(error)}
  if(f)try{await f.close()}catch(error){cleanup.push(error)}
 }
 if(primary&&cleanup.length)throw new AggregateError([primary,...cleanup],'monitor074_chain_and_cleanup_failed')
 if(primary)throw primary;if(cleanup.length)throw new AggregateError(cleanup,'monitor074_cleanup_failed')
})
