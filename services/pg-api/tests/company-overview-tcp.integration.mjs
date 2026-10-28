// AUTHORED ONLY. Genuine PG18 execution belongs to the dedicated disposable CI
// job. The unchanged complete060 fixture and original Linux guard are mandatory.
// No local/ambient URL, emulator, skip, fake SQL result or alternative fixture.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {descriptivePatchTarget,descriptivePatchFixture,descriptivePatchBounded} from './helpers/agent-descriptive-patch-fixture.mjs'

const sql061Sha='fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923'
const ownerRole='agentstudio_company_metadata_reader',issuer='urn:agentstudio:local:v1'
const opKeys=['agent_running','workflow_running','pending_approvals','human_input','failed_7d','overdue_schedules','knowledge_bases']
const uuid=number=>'10000000-0000-4000-8000-'+number.toString(16).padStart(12,'0')
const quote=value=>'"'+value.replaceAll('"','""')+'"'
const fixed503=e=>e.status===503&&e.code==='company_projection_unavailable'&&e.message==='company_projection_unavailable'
const denied=code=>e=>e.status===code&&e.code===(code===403?'admin_required':'session_required')
const sqlDenied=message=>e=>e.code==='P0001'&&e.message===message
const permissionDenied=e=>e.code==='42501'
function observe(promise){const state={done:false};state.promise=promise.then(value=>{state.done=true;return {ok:true,value}},error=>{state.done=true;return {ok:false,error}});return state}
async function blocking(admin,waiter,blocker,state,label){
 const until=Date.now()+15000
 while(Date.now()<until){
  if(state.done){const result=await state.promise;if(!result.ok)throw result.error;assert.fail(label+': projection completed without required real backend lock')}
  const row=(await admin.query('SELECT wait_event_type,query,pg_blocking_pids(pid) AS blockers FROM pg_catalog.pg_stat_activity WHERE pid=$1',[waiter])).rows[0]
  if(row?.wait_event_type==='Lock'&&row.blockers.includes(blocker)&&row.query.includes('ct03_snapshot_gate'))return
  await delay(15) // Observe PostgreSQL's actual lock edge; never a fake race delay.
 }
 assert.fail(label+': independent PostgreSQL backend did not expose the required advisory lock edge')
}

// Intercepts only the real projection statement. All connection, actor, catalog,
// query, Result and repository decoding paths remain actual production code.
// before: a separate real statement waits BEFORE the projection obtains a fresh
// READ COMMITTED statement snapshot. after: a MATERIALIZED CTE blocks INSIDE
// the projection's already acquired statement snapshot, before its target list.
function barrierPool(base,{after,key,overviewSql,employeesSql}){
 let resolvePid,connections=0,matched=0
 const pid=new Promise(resolve=>{resolvePid=resolve}),trace=[]
 const pool=new Proxy(base,{get(target,property){
  if(property!=='connect'){const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value}
  return async()=>{
   assert.equal(++connections,1,'one repository read must use one actual admission client')
   const client=await target.connect()
   try{resolvePid((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)}catch(error){client.release();throw error}
   return new Proxy(client,{get(db,property){
    if(property!=='query'){const value=Reflect.get(db,property,db);return typeof value==='function'?value.bind(db):value}
    return async(text,values=[])=>{
     trace.push(text)
     if((text===overviewSql||text===employeesSql)&&matched++===0){
      if(!after){await db.query('/* ct03_snapshot_gate before */ SELECT pg_catalog.pg_advisory_xact_lock($1::bigint)',[key]);return db.query(text,values)}
      const parameter=values.length+1
      const actual='WITH ct03_snapshot_gate AS MATERIALIZED (SELECT pg_catalog.pg_advisory_xact_lock($'+parameter+'::bigint)) '+text+' FROM ct03_snapshot_gate'
      return db.query(actual,[...values,key])
     }
     return db.query(text,values)
    }
   }})
  }
 }})
 return {pool,pid,trace,get matched(){return matched}}
}

// All ordinary application/auth tables, including every business/audit journal,
// credential/session row and MVCC tuple identity. Only the guarded synthetic
// administrator reads these images; no image is printed or returned as a DTO.
async function snapshot(f){
 const names=(await f.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows
 assert.ok(names.some(r=>r.nspname==='agentstudio_auth'&&r.relname==='sessions'))
 assert.ok(names.some(r=>r.relname==='audit_events'))
 const pieces=names.map(({nspname,relname})=>"SELECT '"+nspname+'.'+relname+"'::text AS name,coalesce(jsonb_agg(jsonb_build_array(r.xmin::text,r.ctid::text,to_jsonb(r)) ORDER BY r.ctid),'[]'::jsonb) AS rows FROM "+quote(nspname)+'.'+quote(relname)+' r')
 const value=(await f.db.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS value FROM ('+pieces.join(' UNION ALL ')+') s')).rows[0].value
 return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function rawClosed(raw,kind,limit=20){
 assert.equal(raw.protocol,kind==='overview'?'native_company_overview_v1':'native_company_employee_stats_v1');assert.equal(raw.scope,'company_metadata_only')
 assert.deepEqual(Object.keys(raw).sort(),(kind==='overview'?['protocol','scope','as_of','window_days','totals','worker']:['protocol','scope','as_of','limit','items','has_more','next_after']).sort())
 assert.match(raw.as_of,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
 const counts=kind==='overview'?[raw.totals]:raw.items
 if(kind==='overview'){assert.deepEqual(Object.keys(raw.totals).sort(),['employees','active',...opKeys].sort());assert.deepEqual(raw.worker,{availability:'unavailable',reason:'telemetry_not_installed'})}
 else{assert.equal(raw.limit,limit);assert.ok(raw.items.length<=limit);for(const row of raw.items)assert.deepEqual(Object.keys(row).sort(),['employee_id','display_name','is_admin','enabled','status',...opKeys].sort())}
 for(const row of counts)for(const key of kind==='overview'?['employees','active',...opKeys]:opKeys){assert.equal(typeof row[key],'string',key);assert.match(row[key],/^(0|[1-9][0-9]*)$/)}
 assert.doesNotMatch(JSON.stringify(raw),/"(?:email|password_record|token_digest|checkpoint|instruction|result_text|payload|lease_token|worker_id|queue|identity|owner_user_id|api_key)"|CT03_PRIVATE_CANARY/)
}

test('CT03 company overview genuine independent PG18 full061 plus unchanged full060',{concurrency:false,timeout:900000},async t=>{
 const target=descriptivePatchTarget() // Exact original guard before ALL DB/runtime imports.
 const f=await descriptivePatchFixture() // Complete original001..060 fixture, never copied/trimmed.
 let server,authPool
 try{
  const [audit,contract,repository,http,native,ownHttp,ownRepository,policy,{default:pg},{createServer},{NativeAuthRepository}]=await Promise.all([
   import('../src/company-overview-audit.ts'),import('../src/company-overview-contract.ts'),import('../src/company-overview-repository.ts'),import('../src/company-overview-http.ts'),import('../src/native-auth-http.mjs'),import('../src/own-operations-http.ts'),import('../src/own-operations-repository.ts'),import('../src/native-config-uat-policy.ts'),import('pg'),import('node:http'),import('../src/native-auth-repository.mjs')
  ])
  const {withActor}=f.h,{verifyCompanyOverviewSchema,inspectCompanyOverviewSchema}=audit
  const full=()=>withActor(f.pool,f.identities.alice,db=>verifyCompanyOverviewSchema(db))
  const oldFull=()=>withActor(f.pool,f.identities.alice,async db=>assert.equal(await f.h.verifyAgentDescriptivePatchCredentials(db),true))
  await oldFull();assert.equal(await inspectCompanyOverviewSchema(f.pool),false)
  const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_061_company_overview.sql',import.meta.url),'utf8')
  assert.equal(createHash('sha256').update(ddl,'utf8').digest('hex'),sql061Sha,'exact frozen061 only')
  const installer=await f.adminPool.connect()
  try{await installer.query(ddl)}catch(error){await installer.query('ROLLBACK').catch(()=>{});throw error}finally{installer.release()}
  const repo=new repository.CompanyOverviewRepository(f.pool)
  const rawOverview=()=>withActor(f.pool,f.identities.alice,async db=>(await db.query(repository.companyOverviewSql)).rows[0].value)
  const rawPage=(limit=20,after=null)=>withActor(f.pool,f.identities.alice,async db=>(await db.query(repository.companyEmployeeStatsSql,[limit,after])).rows[0].value)

  await t.test('exact061 installs beside all original060 FULL checks without granting a raw business identity',async()=>{
   const before=await snapshot(f);await full();await oldFull();assert.equal(await inspectCompanyOverviewSchema(f.pool),true)
   const raw=await rawOverview();rawClosed(raw,'overview');assert.equal(raw.totals.employees,'2')
   assert.deepEqual((await repo.overview(f.identities.alice)).totals,{employees:2,active:2,...Object.fromEntries(opKeys.map(k=>[k,0]))})
   assert.equal(await snapshot(f),before)
  })

  // Seed only disposable synthetic company rows. Existing fixture employees
  // Alice/Bob plus203 Native accounts give exactly205; the extra OIDC account
  // deliberately owns the same activities but must remain entirely excluded.
  const seeded=Array.from({length:203},(_,i)=>({id:uuid(i+1),n:i+1})),foreign={id:uuid(900),n:900}
  const disabled=seeded[0].id,tail=seeded.at(-1).id,sourceRows=[...seeded,foreign]
  assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM agentstudio.runs')).rows[0].n,0)
  await f.db.query(`INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name,status)
   SELECT x.id::uuid,CASE WHEN x.n=900 THEN 'https://ct03-oidc.example.test' ELSE $2 END,'ct03-'||x.n,
    CASE WHEN x.n=2 THEN '   ' WHEN x.n=203 THEN repeat('😀',220) ELSE 'CT03 Employee '||x.n END,
    CASE WHEN x.n IN(1,3) THEN 'disabled' ELSE 'active' END
   FROM jsonb_to_recordset($1::jsonb) x(id text,n integer)`,[JSON.stringify(sourceRows),issuer])
  await f.db.query(`INSERT INTO agentstudio_auth.accounts(user_id,email,password_record,enabled,is_admin)
   SELECT x.id::uuid,'ct03-'||x.n||'@example.test',(SELECT password_record FROM agentstudio_auth.accounts WHERE user_id=$2),x.n NOT IN(2,3),false
   FROM jsonb_to_recordset($1::jsonb) x(id text,n integer)`,[JSON.stringify(sourceRows),f.users.alice])
  for(const employee of sourceRows){
   employee.spec=(await f.db.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) VALUES($1,'CT03 fixture','{}') RETURNING id",[employee.id])).rows[0].id
   employee.workflow=(await f.db.query("INSERT INTO agentstudio.workflows(owner_user_id,name,graph) VALUES($1,'CT03 fixture','{}') RETURNING id",[employee.id])).rows[0].id
  }
  const runs=[]
  for(const employee of sourceRows)for(const [kind,status,mode,age] of [
   ['agent','running','agent_native_v2',1],['agent','running',null,1],['workflow','running','workflow_native_v2',1],['workflow','running','start_end_only',1],
   ['agent','awaiting_approval',null,1],['workflow','awaiting_input','workflow_native_v2',1],['agent','failed',null,1],['workflow','failed',null,8],['agent','queued',null,1],['agent','paused',null,1]
  ])runs.push({id:randomUUID(),owner:employee.id,spec:kind==='agent'?employee.spec:null,workflow:kind==='workflow'?employee.workflow:null,kind,status,age,checkpoint:mode?{execution_mode:mode,private_canary:'CT03_PRIVATE_CANARY'}:{private_canary:'CT03_PRIVATE_CANARY'}})
  const edgeRuns=Array.from({length:3},()=>({id:randomUUID(),owner:disabled,spec:seeded[0].spec,workflow:null,kind:'agent',status:'failed',age:8,checkpoint:{}}));runs.push(...edgeRuns)
  await f.db.query(`INSERT INTO agentstudio.runs(id,owner_user_id,agent_spec_id,workflow_id,kind,status,created_at,instruction,result_text,checkpoint)
   SELECT x.id,x.owner,x.spec,x.workflow,x.kind,x.status,clock_timestamp()-x.age*interval '1 day','CT03_PRIVATE_CANARY','CT03_PRIVATE_CANARY',x.checkpoint
   FROM jsonb_to_recordset($1::jsonb) x(id uuid,owner uuid,spec uuid,workflow uuid,kind text,status text,age integer,checkpoint jsonb)`,[JSON.stringify(runs)])
  const schedules=[]
  for(const employee of sourceRows)for(const [enabled,deleted,hours] of [[true,false,-2],[true,false,168],[false,false,-2],[true,true,-2],[true,false,null]])schedules.push({id:randomUUID(),owner:employee.id,spec:employee.spec,enabled,deleted,hours})
  const edgeSchedules=Array.from({length:3},()=>({id:randomUUID(),owner:disabled,spec:seeded[0].spec,enabled:true,deleted:false,hours:168}));schedules.push(...edgeSchedules)
  await f.db.query(`INSERT INTO agentstudio.schedules(id,owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,next_at,enabled,deleted_at)
   SELECT x.id,x.owner,'agent',x.spec,'CT03 fixture','{}','UTC',CASE WHEN x.hours IS NULL THEN NULL ELSE clock_timestamp()+x.hours*interval '1 hour' END,x.enabled,CASE WHEN x.deleted THEN clock_timestamp() ELSE NULL END
   FROM jsonb_to_recordset($1::jsonb) x(id uuid,owner uuid,spec uuid,enabled boolean,deleted boolean,hours integer)`,[JSON.stringify(schedules)])
  await f.db.query(`INSERT INTO agentstudio.knowledge_bases(owner_user_id,name,description)
   SELECT x.id::uuid,'CT03 knowledge '||g,'CT03_PRIVATE_CANARY' FROM jsonb_to_recordset($1::jsonb) x(id text,n integer) CROSS JOIN generate_series(1,2) g
   UNION ALL SELECT $2::uuid,'CT03 disabled third','CT03_PRIVATE_CANARY'`,[JSON.stringify(sourceRows),disabled])
  await f.db.query("INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key,payload) VALUES($1,'run_tick','ct03-private-canary','{\"private\":\"CT03_PRIVATE_CANARY\"}')",[disabled])
  const expected={employees:205,active:202,agent_running:406,workflow_running:406,pending_approvals:203,human_input:203,failed_7d:203,overdue_schedules:203,knowledge_bases:407}

  await t.test('205 Native employees, disabled nonzero activity, all persisted modes and independent11 pages have exact global aggregates',async()=>{
   const before=await snapshot(f),raw=await rawOverview();rawClosed(raw,'overview');assert.deepEqual(raw.totals,Object.fromEntries(Object.entries(expected).map(([k,v])=>[k,String(v)])))
   const overview=await repo.overview(f.identities.alice);assert.deepEqual(overview.totals,expected);assert.deepEqual(contract.parseCompanyOverview(overview),overview)
   const ids=[],items=[];let after=null,pages=0
   do{
    const page=await repo.employees(f.identities.alice,{limit:20,after});pages++;assert.deepEqual(contract.parseCompanyEmployeePage(page,{limit:20,after}),page)
    assert.equal(page.items.length,page.has_more?20:5);assert.equal(page.has_more,pages<11);assert.equal(page.next_after,page.has_more?page.items.at(-1).employee_id:null)
    for(const item of page.items){assert.ok(after===null||item.employee_id>after);ids.push(item.employee_id);items.push(item)}
    after=page.next_after
   }while(after!==null)
   assert.equal(pages,11);assert.equal(ids.length,205);assert.equal(new Set(ids).size,205);assert.deepEqual(ids,[...ids].sort());assert.ok(!ids.includes(foreign.id))
   const row=items.find(x=>x.employee_id===disabled);assert.equal(row.status,'disabled');assert.equal(row.enabled,true);assert.equal(row.knowledge_bases,3);assert.equal(row.agent_running,2);assert.equal(row.workflow_running,2)
   assert.equal(items.find(x=>x.employee_id===uuid(2)).enabled,false);assert.equal(items.find(x=>x.employee_id===uuid(2)).display_name,'员工');assert.equal(items.find(x=>x.employee_id===tail).display_name,'😀'.repeat(100))
   for(const key of opKeys)assert.equal(items.reduce((sum,row)=>sum+row[key],0),expected[key],key)
   const tiny=await rawPage(1);rawClosed(tiny,'page',1);assert.equal(tiny.items.length,1);assert.equal(tiny.has_more,true);assert.equal(tiny.next_after,tiny.items[0].employee_id)
   const empty=await repo.employees(f.identities.alice,{limit:20,after:'ffffffff-ffff-ffff-ffff-ffffffffffff'});assert.deepEqual(empty.items,[]);assert.equal(empty.has_more,false);assert.equal(empty.next_after,null)
   assert.deepEqual((await repo.overview(f.identities.alice)).totals,expected);assert.equal(await snapshot(f),before)
  })

  await t.test('exact7d inclusive and60s strict thresholds share the real statement message timestamp, with rollback-only fixture setup',async()=>{
   const before=await snapshot(f)
   // PostgreSQL statement_timestamp is the receipt time of the current frontend
   // command message. This ONE real simple-query message sets fixture boundary
   // timestamps then reads actual functions; no replaced clock/helper/function.
   // It is an administrator setup transaction, NOT a production read-only GET.
   const setup=[...edgeRuns.map((r,i)=>"UPDATE agentstudio.runs SET created_at=date_trunc('milliseconds',statement_timestamp())-interval '7 days'"+['',"-interval '1 millisecond'","+interval '1 millisecond'"][i]+" WHERE id='"+r.id+"'"),...edgeSchedules.map((r,i)=>"UPDATE agentstudio.schedules SET next_at=date_trunc('milliseconds',statement_timestamp())-interval '60 seconds'"+['',"-interval '1 millisecond'","+interval '1 millisecond'"][i]+" WHERE id='"+r.id+"'")]
   const client=await f.adminPool.connect();let result
   try{result=await client.query('BEGIN; '+setup.join('; ')+"; SET LOCAL ROLE agentstudio_api; SELECT set_config('agentstudio.actor_id','"+f.users.alice+"',true); SELECT to_char(date_trunc('milliseconds',statement_timestamp()) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS anchor; "+repository.companyOverviewSql+'; SELECT agentstudio.company_employee_stats(20,\''+uuid(0)+"'::uuid) AS value; ROLLBACK")}
   finally{await client.query('ROLLBACK').catch(()=>{});client.release()}
   const anchor=result.find(r=>r.rows?.[0]?.anchor)?.rows[0].anchor,values=result.flatMap(r=>r.rows??[]).filter(r=>r.value).map(r=>r.value)
   assert.equal(values.length,2);for(const value of values)assert.equal(value.as_of,anchor)
   rawClosed(values[0],'overview');rawClosed(values[1],'page');assert.equal(values[0].totals.failed_7d,'205');assert.equal(values[0].totals.overdue_schedules,'204')
   const row=values[1].items.find(x=>x.employee_id===disabled);assert.equal(row.failed_7d,'3');assert.equal(row.overdue_schedules,'2');assert.equal(await snapshot(f),before)
  })

  // Actual Native session authentication and the shared global allowlist stay
  // outside BOTH Own and Company handlers. This composition needs no UI or
  // unfinished server entrypoint; production modules themselves are exercised.
  authPool=new pg.Pool({...target,user:'agentstudio_native_login',password:createHash('sha512').update(target.password+':assessment:agentstudio_native_login').digest('hex').slice(0,80),max:2})
  const auth=new NativeAuthRepository({connect:()=>authPool.connect()}),origin='http://localhost:17443'
  let business
  const nativeHandler=native.createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowOwnOperations:true,allowCompanyOverview:await inspectCompanyOverviewSchema(f.pool),businessHandler:(req,res)=>business(req,res)})
  const company=http.createCompanyOverviewHttpHandler({repository:repo,authenticateRequest:nativeHandler.authenticateRequest,allowedOrigin:origin})
  business=ownHttp.createNativeOwnOperationsBusinessHandler({repository:new ownRepository.OwnOperationsRepository(f.pool),available:true,authenticateRequest:nativeHandler.authenticateRequest,allowedOrigin:origin,policy:{configurationWrites:false,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false},businessHandler:async(req,res)=>{if(await company(req,res))return;res.writeHead(404);res.end()}})
  for(const path of ['/api/v2/company-overview','/api/v2/company-overview/employees'])assert.equal(policy.permitNativePg18BusinessUatRequest(path,'GET',{configurationWrites:false,employeeProvisioning:false,runApprovalUat:false,knowledgeIngestUat:false,modelProbeUat:false}),true)
  server=createServer((req,res)=>Promise.resolve(nativeHandler.handler(req,res)).catch(()=>res.destroy()))
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port
  // Login creates the real synthetic sessions BEFORE all read-only snapshots.
  const aliceSession=await auth.login('assessment-alice@example.test','SyntheticAssessmentAlice#2026'),bobSession=await auth.login('assessment-bob@example.test','SyntheticAssessmentBob#2026')
  const request=async(path='/api/v2/company-overview',{token=aliceSession.token,method='GET',headers={}}={})=>{
   const response=await fetch(base+path,{method,headers:{Origin:origin,'X-AgentStudio-Request':'1',...(token?{Cookie:'__Host-agentstudio_session='+token}:{}),...headers},signal:AbortSignal.timeout(20000)})
   return {status:response.status,headers:response.headers,body:await response.json()}
  }
  const getNoWrite=async(path,options,expectedStatus)=>{const before=await snapshot(f),reply=await request(path,options);assert.equal(reply.status,expectedStatus);assert.equal(reply.headers.get('cache-control'),'no-store');assert.equal(await snapshot(f),before);return reply}

  await t.test('real Cookie GETs cross global policy, use closed actual repository DTOs and write zero business/auth/audit tuples',async()=>{
   assert.equal((await getNoWrite('/api/native-auth/capabilities',{},200)).body.company_overview_available,true,'only the genuine full061 installation advertises admin metadata')
   assert.equal(Object.hasOwn((await getNoWrite('/api/native-auth/capabilities',{token:bobSession.token},200)).body,'company_overview_available'),false,'current nonadmin profile receives no company capability')
   const overview=await getNoWrite('/api/v2/company-overview',{},200);assert.deepEqual(overview.body.totals,expected);assert.deepEqual(contract.parseCompanyOverview(overview.body),overview.body)
   const page=await getNoWrite('/api/v2/company-overview/employees?limit=1',{},200);assert.deepEqual(contract.parseCompanyEmployeePage(page.body,{limit:1,after:null}),page.body)
   for(const options of [{token:null},{headers:{Authorization:'Bearer forged.jwt'}},{headers:{'X-Rh-User-Id':f.users.bob}}])await getNoWrite('/api/v2/company-overview',options,401)
   await getNoWrite('/api/v2/company-overview',{token:bobSession.token},403)
   await getNoWrite('/api/v2/company-overview',{method:'POST'},405)
   for(const query of ['limit=0','limit=21','limit=01','after=bad','owner_user_id='+f.users.alice])await getNoWrite('/api/v2/company-overview/employees?'+query,{},400)
   assert.equal((await request('/api/v2/own-overview',{method:'POST'})).status,405,'shared global policy encloses Own as well')
  })

  async function asRole(pool,role,body){
   assert.match(role,/^[a-z_]+$/)
   const client=await pool.connect()
   try{await client.query('BEGIN READ ONLY');await client.query('SET LOCAL ROLE '+role);assert.equal((await client.query('SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false);return await body(client)}
   finally{await client.query('ROLLBACK').catch(()=>{});client.release()}
  }
  await t.test('unreachable nonlogin metadata owner has exactly16 SELECT columns, no private rows, writes, Worker objects or cross-role EXECUTE',async()=>{
   const before=await snapshot(f)
   const role=(await f.db.query('SELECT oid,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolconfig FROM pg_catalog.pg_roles WHERE rolname=$1',[ownerRole])).rows[0]
   for(const key of ['rolcanlogin','rolinherit','rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication'])assert.equal(role[key],false,key)
   assert.equal(role.rolconfig,null);assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM pg_catalog.pg_auth_members WHERE roleid=$1 OR member=$1',[role.oid])).rows[0].n,0)
   const columns=(await f.db.query("SELECT n.nspname||'.'||c.relname||'.'||a.attname AS name,has_column_privilege($1,c.oid,a.attnum,'SELECT') AS read,has_column_privilege($1,c.oid,a.attnum,'INSERT,UPDATE,REFERENCES') AS write FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped",[role.oid])).rows
   assert.deepEqual(columns.filter(c=>c.read).map(c=>c.name).sort(),[
    'agentstudio.users.id','agentstudio.users.external_issuer','agentstudio.users.display_name','agentstudio.users.status',
    'agentstudio_auth.accounts.user_id','agentstudio_auth.accounts.enabled','agentstudio_auth.accounts.is_admin',
    'agentstudio.runs.owner_user_id','agentstudio.runs.kind','agentstudio.runs.status','agentstudio.runs.created_at',
    'agentstudio.schedules.owner_user_id','agentstudio.schedules.enabled','agentstudio.schedules.deleted_at','agentstudio.schedules.next_at','agentstudio.knowledge_bases.owner_user_id'
   ].sort());assert.ok(columns.every(c=>!c.write))
   const owned=(await f.db.query("SELECT p.proname FROM pg_catalog.pg_proc p WHERE p.proowner=$1 ORDER BY p.proname",[role.oid])).rows.map(r=>r.proname)
   assert.deepEqual(owned,['company_employee_stats','company_overview']);assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM pg_catalog.pg_class WHERE relowner=$1',[role.oid])).rows[0].n,0)
   for(const text of ['SELECT email FROM agentstudio_auth.accounts','SELECT password_record FROM agentstudio_auth.accounts','SELECT token_digest FROM agentstudio_auth.sessions','SELECT checkpoint FROM agentstudio.runs','SELECT instruction FROM agentstudio.runs','SELECT payload FROM agentstudio.jobs','SELECT * FROM agentstudio.knowledge_bases'])await assert.rejects(asRole(f.adminPool,ownerRole,client=>client.query(text)),permissionDenied)
   await assert.rejects(asRole(f.adminPool,ownerRole,client=>client.query(repository.companyOverviewSql)),sqlDenied('company_native_session_required'))
   await assert.rejects(asRole(f.pool,'agentstudio_api',client=>client.query('SET LOCAL ROLE '+ownerRole)),permissionDenied)
   await assert.rejects(asRole(f.pool,'agentstudio_api',client=>client.query('SELECT email FROM agentstudio_auth.accounts')),permissionDenied)
   const effective=(await f.db.query("SELECT rolname,has_function_privilege(oid,'agentstudio.company_overview()','EXECUTE') AS overview,has_function_privilege(oid,'agentstudio.company_employee_stats(integer,uuid)','EXECUTE') AS employees FROM pg_catalog.pg_roles WHERE NOT rolsuper ORDER BY rolname")).rows
   for(const r of effective){assert.equal(r.overview,[ownerRole,'agentstudio_api'].includes(r.rolname),r.rolname);assert.equal(r.employees,r.overview,r.rolname)}
   for(const [pool,role] of [[f.workerPool,'agentstudio_review_worker'],[f.dispatchPool,'agentstudio_review_dispatch'],[f.secretPool,'agentstudio_model_broker'],[{connect:()=>authPool.connect()},'agentstudio_native_auth'],[f.adminPool,'agentstudio_worker'],[f.adminPool,'agentstudio_scheduler']]){
    for(const [text,args] of [[repository.companyOverviewSql,[]],[repository.companyEmployeeStatsSql,[20,null]]])await assert.rejects(asRole(pool,role,client=>client.query(text,args)),permissionDenied)
   }
   assert.equal(await snapshot(f),before)
  })

  await t.test('both SQL guards independently deny invalid/stale/nonNative/current nonadmin actors and invalid page limits',async()=>{
   const before=await snapshot(f)
   for(const actor of ['',null,'invalid-uuid',randomUUID(),foreign.id,disabled,uuid(2)])for(const [text,args] of [[repository.companyOverviewSql,[]],[repository.companyEmployeeStatsSql,[20,null]]]){
    await assert.rejects(asRole(f.pool,'agentstudio_api',async client=>{await client.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor??'']);return client.query(text,args)}),sqlDenied('company_native_session_required'))
   }
   for(const [text,args] of [[repository.companyOverviewSql,[]],[repository.companyEmployeeStatsSql,[20,null]]])await assert.rejects(withActor(f.pool,f.identities.bob,client=>client.query(text,args)),sqlDenied('company_admin_required'))
   for(const limit of [null,0,-1,21])await assert.rejects(withActor(f.pool,f.identities.alice,client=>client.query(repository.companyEmployeeStatsSql,[limit,null])),sqlDenied('invalid_company_employee_query'))
   await assert.rejects(repo.overview({issuer,subject:'ct03-2'}),denied(401));await assert.rejects(repo.overview({issuer:'https://ct03-oidc.example.test',subject:'ct03-900'}),denied(401))
   assert.equal(await snapshot(f),before)
  })

  const mutations=[
   {name:'current admin demotion',apply:'UPDATE agentstudio_auth.accounts SET is_admin=false WHERE user_id=$1',restore:'UPDATE agentstudio_auth.accounts SET is_admin=true WHERE user_id=$1',status:403},
   {name:'current account disable',apply:'UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',restore:'UPDATE agentstudio_auth.accounts SET enabled=true WHERE user_id=$1',status:401},
   {name:'current employee disable',apply:"UPDATE agentstudio.users SET status='disabled' WHERE id=$1",restore:"UPDATE agentstudio.users SET status='active' WHERE id=$1",status:401}
  ]
  let lockKey=6100000000n
  for(const change of mutations)for(const after of [false,true])for(const method of ['overview','employees'])await t.test(change.name+' '+(after?'after projection snapshot allows one bounded read':'before projection snapshot denies')+' '+method,async()=>{
   const blocker=await f.adminPool.connect(),mutator=await f.adminPool.connect(),key=String(++lockKey)
   let state,opened=false
   try{
    await blocker.query('BEGIN');opened=true
    const blockerPid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    await blocker.query('SELECT pg_catalog.pg_advisory_xact_lock($1::bigint)',[key])
    const traced=barrierPool(f.pool,{after,key,overviewSql:repository.companyOverviewSql,employeesSql:repository.companyEmployeeStatsSql})
    const guarded=new repository.CompanyOverviewRepository(traced.pool)
    state=observe(method==='overview'?guarded.overview(f.identities.alice):guarded.employees(f.identities.alice,{limit:1,after:null}))
    const waiter=await descriptivePatchBounded(traced.pid,'company_real_pid')
    await blocking(f.db,waiter,blockerPid,state,change.name)
    // Independent real transaction must COMMIT while the read backend remains
    // blocked. This proves the projection has no account/user FOR SHARE fence.
    await mutator.query('BEGIN');await mutator.query(change.apply,[f.users.alice]);await mutator.query('COMMIT')
    const before=await snapshot(f)
    await blocker.query('ROLLBACK');opened=false
    const result=await descriptivePatchBounded(state.promise,'company_snapshot_projection')
    if(after){assert.equal(result.ok,true,result.error?.message);if(method==='overview'){assert.deepEqual(contract.parseCompanyOverview(result.value),result.value);assert.deepEqual(result.value.totals,expected)}else assert.deepEqual(contract.parseCompanyEmployeePage(result.value,{limit:1,after:null}),result.value)}
    else{assert.equal(result.ok,false);assert.ok(denied(change.status)(result.error))}
    assert.equal(traced.matched,1);assert.ok(traced.trace.includes('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'))
    assert.equal(await snapshot(f),before,'the admitted/read-denied operation wrote no business/auth/audit tuple')
    await assert.rejects(repo.overview(f.identities.alice),denied(change.status),'a subsequent fresh statement cannot reuse prior admin authority')
    if(change.status===403)assert.equal(Object.hasOwn((await getNoWrite('/api/native-auth/capabilities',{},200)).body,'company_overview_available'),false,'Native capability checks the current demoted profile')
   }finally{
    if(opened)await blocker.query('ROLLBACK').catch(()=>{})
    await mutator.query('ROLLBACK').catch(()=>{})
    if(state)await descriptivePatchBounded(state.promise,'company_snapshot_cleanup').catch(()=>{})
    try{await f.db.query(change.restore,[f.users.alice])}finally{blocker.release();mutator.release()}
   }
   await full();assert.deepEqual((await repo.overview(f.identities.alice)).totals,expected)
  })

  // Only legal standalone DDL/grants are used, committed one mutation at a
  // time so a genuinely separate restricted API connection observes the drift.
  // Each case restores its original catalog state and proves FULL/read success.
  const drifts=[
   ['owner LOGIN','ALTER ROLE '+ownerRole+' LOGIN','ALTER ROLE '+ownerRole+' NOLOGIN'],
   ['owner INHERIT','ALTER ROLE '+ownerRole+' INHERIT','ALTER ROLE '+ownerRole+' NOINHERIT'],
   ['owner SUPERUSER','ALTER ROLE '+ownerRole+' SUPERUSER','ALTER ROLE '+ownerRole+' NOSUPERUSER'],
   ['owner BYPASSRLS','ALTER ROLE '+ownerRole+' BYPASSRLS','ALTER ROLE '+ownerRole+' NOBYPASSRLS'],
   ['owner CREATEROLE','ALTER ROLE '+ownerRole+' CREATEROLE','ALTER ROLE '+ownerRole+' NOCREATEROLE'],
   ['owner CREATEDB','ALTER ROLE '+ownerRole+' CREATEDB','ALTER ROLE '+ownerRole+' NOCREATEDB'],
   ['owner REPLICATION','ALTER ROLE '+ownerRole+' REPLICATION','ALTER ROLE '+ownerRole+' NOREPLICATION'],
   ['owner connection limit','ALTER ROLE '+ownerRole+' CONNECTION LIMIT 0','ALTER ROLE '+ownerRole+' CONNECTION LIMIT -1'],
   ['owner connection configuration','ALTER ROLE '+ownerRole+" SET search_path='public'",'ALTER ROLE '+ownerRole+' RESET ALL'],
   ['owner incoming membership','GRANT '+ownerRole+' TO agentstudio_api','REVOKE '+ownerRole+' FROM agentstudio_api'],
   ['owner outgoing membership','GRANT agentstudio_api TO '+ownerRole,'REVOKE agentstudio_api FROM '+ownerRole],
   ['owner schema CREATE','GRANT CREATE ON SCHEMA agentstudio TO '+ownerRole,'REVOKE CREATE ON SCHEMA agentstudio FROM '+ownerRole],
   ['extra explicit schema grant','GRANT USAGE ON SCHEMA public TO '+ownerRole,'REVOKE USAGE ON SCHEMA public FROM '+ownerRole],
   ['private email column','GRANT SELECT(email) ON agentstudio_auth.accounts TO '+ownerRole,'REVOKE SELECT(email) ON agentstudio_auth.accounts FROM '+ownerRole],
   ['private job payload','GRANT SELECT(payload) ON agentstudio.jobs TO '+ownerRole,'REVOKE SELECT(payload) ON agentstudio.jobs FROM '+ownerRole],
   ['private session digest','GRANT SELECT(token_digest) ON agentstudio_auth.sessions TO '+ownerRole,'REVOKE SELECT(token_digest) ON agentstudio_auth.sessions FROM '+ownerRole],
   ['extra table SELECT','GRANT SELECT ON agentstudio.users TO '+ownerRole,'REVOKE SELECT ON agentstudio.users FROM '+ownerRole],
   ['metadata write column','GRANT UPDATE(is_admin) ON agentstudio_auth.accounts TO '+ownerRole,'REVOKE UPDATE(is_admin) ON agentstudio_auth.accounts FROM '+ownerRole],
   ['column grant option','GRANT SELECT(is_admin) ON agentstudio_auth.accounts TO '+ownerRole+' WITH GRANT OPTION','REVOKE GRANT OPTION FOR SELECT(is_admin) ON agentstudio_auth.accounts FROM '+ownerRole],
   ['API raw-auth grant','GRANT SELECT(email) ON agentstudio_auth.accounts TO agentstudio_api','REVOKE SELECT(email) ON agentstudio_auth.accounts FROM agentstudio_api'],
   ['PUBLIC EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.company_overview() TO PUBLIC','REVOKE EXECUTE ON FUNCTION agentstudio.company_overview() FROM PUBLIC'],
   ['old review-worker EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.company_employee_stats(integer,uuid) TO agentstudio_review_worker','REVOKE EXECUTE ON FUNCTION agentstudio.company_employee_stats(integer,uuid) FROM agentstudio_review_worker'],
   ['API function grant option','GRANT EXECUTE ON FUNCTION agentstudio.company_overview() TO agentstudio_api WITH GRANT OPTION','REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION agentstudio.company_overview() FROM agentstudio_api'],
   ['unrelated definer EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_generated_accept(jsonb) TO '+ownerRole,'REVOKE EXECUTE ON FUNCTION agentstudio.agent_generated_accept(jsonb) FROM '+ownerRole],
   ['function volatility','ALTER FUNCTION agentstudio.company_overview() VOLATILE','ALTER FUNCTION agentstudio.company_overview() STABLE'],
   ['function parallel ABI','ALTER FUNCTION agentstudio.company_overview() PARALLEL SAFE','ALTER FUNCTION agentstudio.company_overview() PARALLEL UNSAFE'],
   ['function STRICT ABI','ALTER FUNCTION agentstudio.company_employee_stats(integer,uuid) STRICT','ALTER FUNCTION agentstudio.company_employee_stats(integer,uuid) CALLED ON NULL INPUT'],
   ['function search_path',"ALTER FUNCTION agentstudio.company_overview() SET search_path=public",'ALTER FUNCTION agentstudio.company_overview() SET search_path=pg_catalog'],
   ['Native subject policy','ALTER POLICY company_users_select ON agentstudio.users USING(true)',"ALTER POLICY company_users_select ON agentstudio.users USING(external_issuer='urn:agentstudio:local:v1')"],
   ['active-only account policy','ALTER POLICY company_accounts_select ON agentstudio_auth.accounts USING(enabled)','ALTER POLICY company_accounts_select ON agentstudio_auth.accounts USING(true)'],
   ['PUBLIC subject policy','ALTER POLICY company_runs_select ON agentstudio.runs TO PUBLIC','ALTER POLICY company_runs_select ON agentstudio.runs TO '+ownerRole],
   ['extra applicable PUBLIC policy','CREATE POLICY synthetic_ct03_broad ON agentstudio.runs FOR SELECT TO PUBLIC USING(true)','DROP POLICY synthetic_ct03_broad ON agentstudio.runs'],
   ['FORCE RLS','ALTER TABLE agentstudio.users NO FORCE ROW LEVEL SECURITY','ALTER TABLE agentstudio.users FORCE ROW LEVEL SECURITY'],
   ['base RLS','ALTER TABLE agentstudio.schedules DISABLE ROW LEVEL SECURITY','ALTER TABLE agentstudio.schedules ENABLE ROW LEVEL SECURITY'],
   ['metadata nullability','ALTER TABLE agentstudio.users ALTER COLUMN display_name DROP NOT NULL','ALTER TABLE agentstudio.users ALTER COLUMN display_name SET NOT NULL'],
   ['base heap options','ALTER TABLE agentstudio.users SET (fillfactor=90)','ALTER TABLE agentstudio.users RESET (fillfactor)'],
   ['identity primary-index options','ALTER INDEX agentstudio_auth.accounts_pkey SET (fillfactor=75)','ALTER INDEX agentstudio_auth.accounts_pkey RESET (fillfactor)'],
   ['actor helper configuration','ALTER FUNCTION agentstudio.actor_id() SET search_path=public','ALTER FUNCTION agentstudio.actor_id() RESET ALL'],
   ['unrecognized company routine',"CREATE FUNCTION agentstudio.company_shadow() RETURNS integer LANGUAGE sql AS 'SELECT 1'",'DROP FUNCTION agentstudio.company_shadow()'],
  ]
  const overviewDefinition=ddl.match(/CREATE FUNCTION agentstudio\.company_overview\(\)[^]*?\$fn\$;/)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
  drifts.push(['literal routine body',overviewDefinition.replace(/\$fn\$;$/,'\n-- CT03 exact byte drift\n$fn$;'),overviewDefinition])
  const stamp=(await f.db.query("SELECT description,applied_at::text AS applied_at FROM agentstudio.schema_migrations WHERE version='pg_v9_061'")).rows[0]
  drifts.push(['061 stamp',"DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_061'",()=>f.db.query("INSERT INTO agentstudio.schema_migrations(version,description,applied_at) VALUES('pg_v9_061',$1,$2::timestamptz)",[stamp.description,stamp.applied_at])])
  for(const [name,apply,restore] of drifts)await t.test('legal single catalog drift fails closed and restores: '+name,async()=>{
   await f.db.exec(apply)
   try{
    await assert.rejects(full(),fixed503)
    await assert.rejects(inspectCompanyOverviewSchema(f.pool),fixed503)
    const reply=await getNoWrite('/api/v2/company-overview',{},503);assert.deepEqual(reply.body,{error:'company_overview_unavailable'})
   }finally{if(typeof restore==='function')await restore();else await f.db.exec(restore)}
   await full();await oldFull();assert.deepEqual((await repo.overview(f.identities.alice)).totals,expected)
  })
  await t.test('new061 core alone cannot replace the genuine unchanged060 FULL predecessor chain',async()=>{
   const {verifyCompanyOverviewCore}=await import('../src/company-overview-audit-core.ts')
   // Actual old function catalog drift, not a mocked old-verifier result. The
   // new-family core is demonstrably still positive while FULL rejects it.
   await f.db.exec('ALTER FUNCTION agentstudio.agent_descriptive_patch_accept(jsonb) STABLE')
   try{
    assert.equal(await withActor(f.pool,f.identities.alice,verifyCompanyOverviewCore),true)
    await assert.rejects(oldFull(),e=>e.message==='unsafe_agent_descriptive_patch_privileges')
    await assert.rejects(full(),fixed503)
    const reply=await getNoWrite('/api/v2/company-overview',{},503);assert.deepEqual(reply.body,{error:'company_overview_unavailable'})
   }finally{await f.db.exec('ALTER FUNCTION agentstudio.agent_descriptive_patch_accept(jsonb) VOLATILE')}
   await full();await oldFull();assert.deepEqual((await repo.overview(f.identities.alice)).totals,expected)
  })
  await t.test('final real FULL coexistence, exact source pin and GET zero-write state remain intact',async()=>{
   await full();await oldFull();assert.equal(await inspectCompanyOverviewSchema(f.pool),true)
   const reply=await getNoWrite('/api/v2/company-overview',{},200);assert.deepEqual(reply.body.totals,expected)
   const pins=(await f.db.query("SELECT proname,encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS sha FROM pg_catalog.pg_proc WHERE oid IN('agentstudio.company_overview()'::regprocedure,'agentstudio.company_employee_stats(integer,uuid)'::regprocedure) ORDER BY proname")).rows
   assert.deepEqual(pins,[{proname:'company_employee_stats',sha:'ac6b0eedcb87d0e9c60ab68217c4e3ec11f35003b7daa428a90d8340f31989b8'},{proname:'company_overview',sha:'db392df51b3033d09558f196fc4fe94a54ce6bca48e9fe01877eb1818b3330ed'}])
  })
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  await authPool?.end();await f.close()
 }
})
