// AUTHORED genuine isolated PG18 + Native Cookie + loopback HTTP evidence.
// Never run on an ordinary host or company database. HTTPS/private mTLS and
// the larger061 catalog/205-staff matrix have separate genuine CI entries.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {descriptivePatchTarget,descriptivePatchFixture,descriptivePatchTracedPool,descriptivePatchBounded} from './helpers/agent-descriptive-patch-fixture.mjs'

const sql061Sha='fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923'
const issuer='urn:agentstudio:local:v1',role='agentstudio_company_metadata_reader',route='/api/v2/company-overview'
const counts=['agent_running','workflow_running','pending_approvals','human_input','failed_7d','overdue_schedules','knowledge_bases']
const uuid=n=>'20000000-0000-4000-8000-'+n.toString(16).padStart(12,'0')
const fixed503=error=>error.status===503&&error.code==='company_projection_unavailable'
const forbidden=/"(?:owner_user_id|identity|email|password_record|token_digest|checkpoint|instruction|result_text|payload|lease_token|api_key|queue|model_binding|messages)"|COMPANY_HTTP_PRIVATE_CANARY/
const quote=value=>'"'+value.replaceAll('"','""')+'"'
function observedPool(base){
  const trace=[],state={connections:0}
  const pool=new Proxy(base,{get(target,key){
    if(key!=='connect'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}
    return async()=>{
      state.connections++;const client=await target.connect()
      return new Proxy(client,{get(db,key){
        if(key!=='query'){const value=Reflect.get(db,key,db);return typeof value==='function'?value.bind(db):value}
        return async(sql,args)=>{trace.push(sql);return db.query(sql,args)}
      }})
    }
  }})
  return {pool,trace,state}
}
// Hash every real application/auth table, including MVCC tuple identity. The
// synthetic installer can read this private image; no image enters HTTP/logs.
async function snapshot(f){
  const tables=(await f.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows
  assert.ok(tables.some(row=>row.relname==='sessions'));assert.ok(tables.some(row=>row.relname==='audit_events'))
  const queries=tables.map(({nspname,relname})=>{
    assert.match(nspname,/^[a-z_]+$/);assert.match(relname,/^[a-z_0-9]+$/)
    return "SELECT '"+nspname+'.'+relname+"'::text AS name,coalesce(jsonb_agg(jsonb_build_array(r.xmin::text,r.ctid::text,to_jsonb(r)) ORDER BY r.ctid),'[]'::jsonb) AS rows FROM "+quote(nspname)+'.'+quote(relname)+' r'
  })
  const value=(await f.db.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS value FROM ('+queries.join(' UNION ALL ')+') s')).rows[0].value
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

test('CT03 actual Native Cookie, shared global policy and complete061/060 HTTP reads',{concurrency:false,timeout:900000},async t=>{
  const target=descriptivePatchTarget() // MUST precede ALL DB/runtime imports/listeners.
  const [{default:pg},{createServer},{NativeAuthRepository},{createNativeAuthHttpHandler},{hashOpaqueSession},companyHttp,ownHttp,policyModule,audit,contract,repository]=await Promise.all([
    import('pg'),import('node:http'),import('../src/native-auth-repository.mjs'),import('../src/native-auth-http.mjs'),import('../src/native-employee-auth.mjs'),
    import('../src/company-overview-http.ts'),import('../src/own-operations-http.ts'),import('../src/native-config-uat-policy.ts'),import('../src/company-overview-audit.ts'),import('../src/company-overview-contract.ts'),import('../src/company-overview-repository.ts')
  ])
  const origin='http://localhost:17443'
  const policy=policyModule.selectNativePg18UatCapabilities({},origin,false)
  assert.equal(policy.configurationWrites,false)
  for(const path of [route,route+'/employees']){
    assert.equal(policyModule.permitNativePg18BusinessUatRequest(path,'GET',policy),true)
    assert.equal(policyModule.permitNativePg18BusinessUatRequest(path,'POST',policy),false)
  }
  const f=await descriptivePatchFixture() // Unmodified complete001..060 fixture.
  const business=observedPool(f.pool)
  let server,authPool,auth,native,base,alice,bob,available=false,fallbackCalls=0
  let authObserved
  const full=()=>f.h.withActor(f.pool,f.identities.alice,db=>audit.verifyCompanyOverviewSchema(db))
  const oldFull=()=>f.h.withActor(f.pool,f.identities.alice,async db=>assert.equal(await f.h.verifyAgentDescriptivePatchCredentials(db),true))
  const profileQueries=()=>authObserved.trace.filter(sql=>sql.includes('FROM agentstudio_auth.sessions s')).length
  const configure=(pool=business.pool)=>{
    let handler
    native=createNativeAuthHttpHandler({auth,allowedOrigin:origin,allowConfigurationWrites:false,allowCompanyOverview:available,businessHandler:(req,res)=>handler(req,res)})
    const company=companyHttp.createNativeCompanyOverviewBusinessHandler({available,allowedOrigin:origin,authenticateRequest:native.authenticateRequest,
      ...(available?{repository:new repository.CompanyOverviewRepository(pool)}:{}),businessHandler:async()=>{fallbackCalls++;throw Error('unexpected_company_http_fallback')}})
    // Same production outer wrapper and actual shared policy. No test allowlist
    // or company bypass. Own metadata is unrelated and deliberately unavailable.
    handler=ownHttp.createNativeOwnOperationsBusinessHandler({available:false,policy,allowedOrigin:origin,authenticateRequest:native.authenticateRequest,businessHandler:company})
  }
  const request=async(path,{cookie=alice,method='GET',body,headers={},originHeader=origin}={})=>{
    const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(originHeader?{Origin:originHeader}:{}),...(method!=='GET'?{'X-AgentStudio-Request':'1','Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
    const text=await response.text();return {status:response.status,headers:response.headers,body:text?JSON.parse(text):null}
  }
  const noStore=reply=>{assert.equal(reply.headers.get('cache-control'),'no-store');assert.equal(reply.headers.get('x-content-type-options'),'nosniff');assert.equal(reply.headers.get('referrer-policy'),'no-referrer');assert.doesNotMatch(JSON.stringify(reply.body),forbidden)}
  const getNoWrite=async(path,settings={},status=200)=>{
    const before=await snapshot(f),reply=await request(path,settings);assert.equal(reply.status,status);noStore(reply);assert.equal(await snapshot(f),before,'GET/refusal cannot mutate business, audit, auth/session or MVCC rows');return reply
  }
  const login=async who=>{
    const response=await request('/api/native-auth/login',{cookie:null,method:'POST',body:{email:'assessment-'+who+'@example.test',password:who==='alice'?'SyntheticAssessmentAlice#2026':'SyntheticAssessmentBob#2026'}})
    assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.ok(cookie?.startsWith('__Host-agentstudio_session='));return cookie.split(';')[0]
  }
  const token=cookie=>cookie.slice(cookie.indexOf('=')+1)
  const caps=async(cookie,wanted)=>{
    const before=profileQueries(),reply=await getNoWrite('/api/native-auth/capabilities',{cookie})
    assert.equal(profileQueries(),before+1,'each capability GET must query the actual current Native profile')
    assert.equal(reply.body.config_writes_enabled,false)
    if(wanted)assert.equal(reply.body.company_overview_available,true);else assert.equal(Object.hasOwn(reply.body,'company_overview_available'),false)
    return reply
  }
  try{
    authPool=new pg.Pool({...target,user:'agentstudio_native_login',password:createHash('sha512').update(target.password+':assessment:agentstudio_native_login').digest('hex').slice(0,80),max:3})
    authObserved=observedPool(authPool);auth=new NativeAuthRepository(authObserved.pool)
    await oldFull();assert.equal(await audit.inspectCompanyOverviewSchema(f.pool),false);configure()
    server=createServer((req,res)=>{Promise.resolve(native.handler(req,res)).catch(()=>res.destroy())})
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
    const address=server.address();assert.ok(address&&typeof address!=='string');base='http://127.0.0.1:'+address.port
    alice=await login('alice');bob=await login('bob')

    await t.test('actual missing061 and a committed partial role refuse startup/HTTP without zero-filled metadata',async()=>{
      await caps(alice,false)
      for(const path of [route,route+'/employees'])assert.deepEqual((await getNoWrite(path,{},503)).body,{error:'company_overview_unavailable'})
      assert.equal(business.state.connections,0)
      await f.db.exec('CREATE ROLE '+role+' NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION')
      try{await assert.rejects(audit.inspectCompanyOverviewSchema(f.pool),fixed503);assert.deepEqual((await getNoWrite(route,{},503)).body,{error:'company_overview_unavailable'})}
      finally{await f.db.exec('DROP ROLE '+role)}
      assert.equal(await audit.inspectCompanyOverviewSchema(f.pool),false);await oldFull()
    })

    const ddl=readFileSync(new URL('../../../db/postgres/migrations/pg_v9_061_company_overview.sql',import.meta.url),'utf8')
    assert.equal(createHash('sha256').update(ddl,'utf8').digest('hex'),sql061Sha,'exact independently frozen061 source only')
    const installer=await f.adminPool.connect()
    try{await installer.query(ddl)}catch(error){await installer.query('ROLLBACK').catch(()=>{});throw error}finally{installer.release()}
    available=await audit.inspectCompanyOverviewSchema(f.pool);assert.equal(available,true);configure()

    await t.test('real full061 plus unchanged full060 enable only current admin capability and readonly GETs with config off',async()=>{
      await full();await oldFull();await caps(alice,true);await caps(bob,false)
      const overview=(await getNoWrite(route)).body;assert.deepEqual(contract.parseCompanyOverview(overview),overview)
      assert.deepEqual(overview.totals,{employees:2,active:2,...Object.fromEntries(counts.map(key=>[key,0]))})
      assert.deepEqual(overview.worker,{availability:'unavailable',reason:'telemetry_not_installed'})
      const page=(await getNoWrite(route+'/employees?limit=1')).body;assert.deepEqual(contract.parseCompanyEmployeePage(page,{limit:1,after:null}),page);assert.equal(page.items.length,1);assert.equal(page.has_more,true)
    })

    // Real synthetic rows: 25 Native accounts exceed one20-row page. One extra
    // OIDC account has large activity but must be excluded. The two active
    // fixture accounts retain their genuine Native passwords/sessions.
    const staff=Array.from({length:23},(_,index)=>({id:uuid(index+1),n:index+1})),foreign={id:uuid(900),n:900}
    await f.db.query(`INSERT INTO agentstudio.users(id,external_issuer,external_subject,display_name,status)
      SELECT x.id::uuid,CASE WHEN x.n=900 THEN 'https://company-http-oidc.example.test' ELSE $2 END,'company-http-'||x.n,
        CASE WHEN x.n=2 THEN '   ' WHEN x.n=23 THEN repeat('😀',201) ELSE 'Company HTTP staff '||x.n END,
        CASE WHEN x.n=1 THEN 'disabled' ELSE 'active' END FROM jsonb_to_recordset($1::jsonb) x(id text,n integer)`,[JSON.stringify([...staff,foreign]),issuer])
    await f.db.query(`INSERT INTO agentstudio_auth.accounts(user_id,email,password_record,enabled,is_admin)
      SELECT x.id::uuid,'company-http-'||x.n||'@example.test',(SELECT password_record FROM agentstudio_auth.accounts WHERE user_id=$2),x.n<>2,false
      FROM jsonb_to_recordset($1::jsonb) x(id text,n integer)`,[JSON.stringify([...staff,foreign]),f.users.alice])
    const activity=[{id:staff[0].id,values:[2,1,3,4,5,6,7]},{id:staff.at(-1).id,values:[5,3,4,2,6,7,8]},{id:foreign.id,values:[20,20,20,20,20,20,20]}]
    for(const person of activity){
      const spec=(await f.db.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) VALUES($1,'COMPANY_HTTP_PRIVATE_CANARY','{}') RETURNING id",[person.id])).rows[0].id
      const workflow=(await f.db.query("INSERT INTO agentstudio.workflows(owner_user_id,name,graph) VALUES($1,'COMPANY_HTTP_PRIVATE_CANARY','{}') RETURNING id",[person.id])).rows[0].id
      const runs=[]
      for(const [index,[kind,status]] of [['agent','running'],['workflow','running'],['agent','awaiting_approval'],['workflow','awaiting_input'],['agent','failed']].entries())for(let n=0;n<person.values[index];n++)runs.push({id:randomUUID(),kind,status})
      await f.db.query(`INSERT INTO agentstudio.runs(id,owner_user_id,kind,agent_spec_id,workflow_id,status,instruction,result_text,checkpoint,created_at,finished_at)
        SELECT x.id,$2::uuid,x.kind,CASE WHEN x.kind='agent' THEN $3::uuid ELSE NULL END,CASE WHEN x.kind='workflow' THEN $4::uuid ELSE NULL END,x.status,
          'COMPANY_HTTP_PRIVATE_CANARY','COMPANY_HTTP_PRIVATE_CANARY','{"private":"COMPANY_HTTP_PRIVATE_CANARY"}',clock_timestamp()-interval '1 day',CASE WHEN x.status='failed' THEN clock_timestamp() ELSE NULL END
        FROM jsonb_to_recordset($1::jsonb) x(id uuid,kind text,status text)`,[JSON.stringify(runs),person.id,spec,workflow])
      await f.db.query(`INSERT INTO agentstudio.schedules(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,next_at,enabled)
        SELECT $1::uuid,'agent',$2::uuid,'COMPANY_HTTP_PRIVATE_CANARY','{}','UTC',clock_timestamp()-interval '2 hours',true FROM generate_series(1,$3::integer)`,[person.id,spec,person.values[5]])
      await f.db.query(`INSERT INTO agentstudio.knowledge_bases(owner_user_id,name,description) SELECT $1::uuid,'Company HTTP knowledge','COMPANY_HTTP_PRIVATE_CANARY' FROM generate_series(1,$2::integer)`,[person.id,person.values[6]])
    }
    const expected={employees:25,active:23,agent_running:7,workflow_running:4,pending_approvals:7,human_input:6,failed_7d:11,overdue_schedules:13,knowledge_bases:15}

    await t.test('actual admin HTTP totals cover all25 Native staff independently of pages and preserve disabled nonzero activity',async()=>{
      const overview=(await getNoWrite(route)).body;assert.deepEqual(overview.totals,expected);assert.deepEqual(contract.parseCompanyOverview(overview),overview)
      const first=(await getNoWrite(route+'/employees?limit=20')).body,second=(await getNoWrite(route+'/employees?limit=20&after='+first.next_after)).body
      for(const [page,after] of [[first,null],[second,first.next_after]])assert.deepEqual(contract.parseCompanyEmployeePage(page,{limit:20,after}),page)
      assert.equal(first.items.length,20);assert.equal(first.has_more,true);assert.equal(first.next_after,first.items.at(-1).employee_id)
      assert.equal(second.items.length,5);assert.equal(second.has_more,false);assert.equal(second.next_after,null)
      const all=[...first.items,...second.items];assert.equal(new Set(all.map(row=>row.employee_id)).size,25);assert.equal(all.some(row=>row.employee_id===foreign.id),false)
      for(const key of counts){assert.equal(all.reduce((sum,row)=>sum+row[key],0),expected[key]);assert.notEqual(first.items.reduce((sum,row)=>sum+row[key],0),expected[key])}
      const disabled=all.find(row=>row.employee_id===staff[0].id);assert.equal(disabled.status,'disabled');assert.equal(disabled.enabled,true);assert.equal(disabled.agent_running,2);assert.equal(disabled.knowledge_bases,7)
      assert.equal(all.find(row=>row.employee_id===staff[1].id).enabled,false);assert.equal(all.find(row=>row.employee_id===staff[1].id).display_name,'员工')
      assert.equal(all.find(row=>row.employee_id===staff.at(-1).id).display_name,'😀'.repeat(100))
      assert.deepEqual((await getNoWrite(route+'/employees?limit=20&after=ffffffff-ffff-ffff-ffff-ffffffffffff')).body.items,[])
    })

    await t.test('real Bob is403 at the SQL admin guard; forged identity/Origin/query inputs never reach metadata projection',async()=>{
      for(const path of [route,route+'/employees'])assert.deepEqual((await getNoWrite(path,{cookie:bob},403)).body,{error:'admin_required'})
      const before=business.state.connections,profileBefore=profileQueries()
      for(const headers of [{'X-Rh-User-Id':f.users.alice},{'X-AgentStudio-User-Id':f.users.alice},{'X-Forwarded-User':'admin'},{'X-Forwarded-Email':'assessment-alice@example.test'},{Authorization:'Bearer forged.jwt'}])assert.deepEqual((await getNoWrite(route,{cookie:bob,headers},401)).body,{error:'session_required'})
      assert.equal(business.state.connections,before);assert.equal(profileQueries(),profileBefore)
      await getNoWrite(route,{originHeader:'https://foreign.example.test'},403);assert.equal(business.state.connections,before)
      for(const query of ['?owner_user_id='+f.users.alice,'/employees?limit=21','/employees?after=not-a-uuid','/employees?limit=1&limit=2'])await getNoWrite(route+query,{},400)
      assert.equal(business.state.connections,before)
      const writeBefore=await snapshot(f),denied=await request(route,{method:'POST',body:{is_admin:true}});assert.equal(denied.status,405);assert.deepEqual(denied.body,{error:'pilot_business_writes_disabled'});assert.equal(business.state.connections,before);assert.equal(await snapshot(f),writeBefore)
      const cap=await getNoWrite('/api/native-auth/capabilities?is_admin=true',{cookie:bob,headers:{'X-Rh-User-Id':f.users.alice}});assert.equal(Object.hasOwn(cap.body,'company_overview_available'),false)
    })

    await t.test('capability is recomputed from the real current profile and an earlier true capability never authorizes a demoted employee',async()=>{
      const prior=await caps(alice,true);assert.equal(prior.body.company_overview_available,true)
      await f.db.query('UPDATE agentstudio_auth.accounts SET is_admin=false WHERE user_id=$1',[f.users.alice])
      try{
        await caps(alice,false)
        assert.deepEqual((await getNoWrite(route,{},403)).body,{error:'admin_required'});assert.deepEqual((await getNoWrite(route+'/employees',{},403)).body,{error:'admin_required'})
      }finally{await f.db.query('UPDATE agentstudio_auth.accounts SET is_admin=true WHERE user_id=$1',[f.users.alice])}
      await caps(alice,true);assert.deepEqual((await getNoWrite(route)).body.totals,expected)
    })

    await t.test('real demotion or disable committed AFTER Cookie verification but BEFORE projection is rejected by the same-statement SQL authority',async()=>{
      for(const [column,status,code] of [['is_admin',403,'admin_required'],['enabled',401,'session_required']]){
        const traced=descriptivePatchTracedPool(f.pool,{before:/^SELECT agentstudio\.company_overview\(\) AS value$/});configure(traced.pool)
        const pending=request(route).then(value=>({ok:true,value}),error=>({ok:false,error}))
        try{
          await descriptivePatchBounded(traced.hit,'company_http_before_projection_'+column)
          assert.ok(traced.trace.some(row=>row.sql==="SELECT set_config('agentstudio.actor_id',$1::text,true)"),'real actor admission already completed')
          await f.db.query('UPDATE agentstudio_auth.accounts SET '+column+'=false WHERE user_id=$1',[f.users.alice])
          const before=await snapshot(f);traced.release();const result=await descriptivePatchBounded(pending,'company_http_current_'+column);assert.equal(result.ok,true)
          assert.equal(result.value.status,status);assert.deepEqual(result.value.body,{error:code});noStore(result.value);assert.equal(await snapshot(f),before)
          assert.equal(traced.trace.filter(row=>row.sql===repository.companyOverviewSql).length,1)
        }finally{
          traced.release();await descriptivePatchBounded(pending,'company_http_cleanup_'+column).catch(()=>{})
          await f.db.query('UPDATE agentstudio_auth.accounts SET '+column+'=true WHERE user_id=$1',[f.users.alice]);configure()
        }
      }
      await caps(alice,true);await full();await oldFull()
    })

    await t.test('disabled/revoked sessions are401 before business admission; revocation after verification retains only the existing bounded request window',async()=>{
      await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[f.users.alice])
      try{
        assert.equal((await f.db.query('SELECT revoked_at IS NULL AS live FROM agentstudio_auth.sessions WHERE token_digest=$1',[hashOpaqueSession(token(alice))])).rows[0].live,true,'disabled account differs from session revocation')
        const before=business.state.connections
        await getNoWrite(route,{},401);await getNoWrite('/api/native-auth/capabilities',{},401);assert.equal(business.state.connections,before)
      }finally{await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=true WHERE user_id=$1',[f.users.alice])}
      await caps(alice,true)
      const cookie=alice,traced=descriptivePatchTracedPool(f.pool,{before:/^SELECT agentstudio\.company_overview\(\) AS value$/});configure(traced.pool)
      const pending=request(route,{cookie}).then(value=>({ok:true,value}),error=>({ok:false,error}))
      try{
        await descriptivePatchBounded(traced.hit,'company_http_verified_before_revocation')
        assert.equal(await auth.revokeSession(token(cookie)),true)
        const before=await snapshot(f);traced.release();const result=await descriptivePatchBounded(pending,'company_http_bounded_revocation_window');assert.equal(result.ok,true)
        // The projection rechecks Native active/admin, not opaque sessions. A
        // request verified before revocation may finish this bounded read.
        assert.equal(result.value.status,200);assert.deepEqual(result.value.body.totals,expected);noStore(result.value);assert.equal(await snapshot(f),before)
      }finally{traced.release();await descriptivePatchBounded(pending,'company_http_revocation_cleanup').catch(()=>{});configure()}
      const before=business.state.connections
      await getNoWrite(route,{cookie},401);await getNoWrite('/api/native-auth/capabilities',{cookie},401);assert.equal(business.state.connections,before)
      alice=await login('alice');await caps(alice,true);assert.deepEqual((await getNoWrite(route)).body.totals,expected)
    })

    await t.test('real061 partial/catalog and predecessor060 drift become fixed503 with no private detail, zero fallback or GET writes',async()=>{
      const description=(await f.db.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg_v9_061'")).rows[0].description
      const cases=[
        ['061 body config',"ALTER FUNCTION agentstudio.company_overview() SET search_path=public",()=>f.db.exec('ALTER FUNCTION agentstudio.company_overview() SET search_path=pg_catalog')],
        ['mandatory060 full','ALTER FUNCTION agentstudio.agent_descriptive_patch_receipt(uuid,text) RESET search_path',()=>f.db.exec('ALTER FUNCTION agentstudio.agent_descriptive_patch_receipt(uuid,text) SET search_path=pg_catalog')],
        ['061 partial stamp',"DELETE FROM agentstudio.schema_migrations WHERE version='pg_v9_061'",()=>f.db.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v9_061',$1)",[description])]
      ]
      for(const [name,apply,restore] of cases){
        await f.db.exec(apply)
        try{
          await assert.rejects(audit.inspectCompanyOverviewSchema(f.pool),fixed503,name)
          await caps(alice,true) // Startup availability is not current SQL authority.
          const projectionBefore=business.trace.filter(sql=>sql===repository.companyOverviewSql||sql===repository.companyEmployeeStatsSql).length
          for(const path of [route,route+'/employees'])assert.deepEqual((await getNoWrite(path,{},503)).body,{error:'company_overview_unavailable'})
          assert.equal(business.trace.filter(sql=>sql===repository.companyOverviewSql||sql===repository.companyEmployeeStatsSql).length,projectionBefore)
        }finally{await restore()}
        assert.equal(await audit.inspectCompanyOverviewSchema(f.pool),true);await full();await oldFull();assert.deepEqual((await getNoWrite(route)).body.totals,expected)
      }
    })

    await t.test('final production composition preserves closed DTOs, genuine061/060 audits and read-only business statements',async()=>{
      assert.equal(await audit.inspectCompanyOverviewSchema(f.pool),true);await full();await oldFull();await caps(alice,true);await caps(bob,false)
      const reply=await getNoWrite(route);assert.deepEqual(contract.parseCompanyOverview(reply.body),reply.body);assert.deepEqual(reply.body.totals,expected)
      assert.ok(business.trace.some(sql=>sql==='BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'));assert.ok(business.trace.some(sql=>sql.startsWith('/* company061:stamp */')))
      for(const sql of business.trace)assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|GRANT|REVOKE)\b|^\s*SELECT\s+agentstudio\.agent_memory_outcome_epoch\(/i)
      assert.equal(fallbackCalls,0)
    })
  }finally{
    if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    await authPool?.end();await f.close()
  }
})
