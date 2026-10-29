// Only the shared, pure F07 guard is loaded before context validation.
import {requireAgentTemplateMarketGenuineCi} from './agent-template-market-genuine-guard.mjs'

export function validateAgentTemplateMarketDatabaseCiContext(env,platform,uid){
  const target=requireAgentTemplateMarketGenuineCi(env,platform,uid)
  if(env.GITHUB_JOB!=='pg18-template-market-genuine'||env.AGENT_STUDIO_F07_GENUINE_SUITE!=='database')throw Error('refuse_non_ephemeral_agent_template_market_database_ci')
  return target
}
export function requireAgentTemplateMarketDatabaseCi(env=process.env){return validateAgentTemplateMarketDatabaseCiContext(env,process.platform,process.getuid?.()??0)}
export async function createAgentTemplateMarketDatabaseFixture(env=process.env){
  requireAgentTemplateMarketDatabaseCi(env)
  const {agentTemplateMarketGenuineFixture}=await import('./agent-template-market-genuine-fixture.mjs')
  return agentTemplateMarketGenuineFixture(env)
}

const tables=['publications','snapshots','receipts','tombstones'].map(s=>'agent_template_market_'+s)
const signatures={source:'uuid',publish_preview:'jsonb',use_preview:'jsonb',market:'jsonb',mine:'',detail:'uuid',receipt:'uuid',record:'jsonb'}

async function harness(f,env){
  const target=requireAgentTemplateMarketDatabaseCi(env)
  const [a,crypto,pgModule,fs,repository,audit,contract,result,contracts,vectors,catalogCases,http]=await Promise.all([
    import('node:assert/strict'),import('node:crypto'),import('pg'),import('node:fs'),import('../../src/repository.ts'),
    import('../../src/agent-template-market-audit.ts'),import('../../src/agent-template-market-contract.ts'),import('../../src/agent-template-market-result.ts'),
    import('../../src/contracts.ts'),import('./agent-template-market-database-vectors.mjs'),import('./agent-template-market-database-catalog-cases.mjs'),import('../../src/agent-template-market-http.ts')])
  const assert=a.default,pg=pgModule.default,pools=[],ownedRoles=[]
  const adminPool=new pg.Pool({...target,max:3,statement_timeout:15000,query_timeout:20000});adminPool.on('error',()=>{});pools.push(adminPool)
  const quote=name=>{assert.match(name,/^[a-z_][a-z_0-9]*$/);return '"'+name+'"'}
  const mustClient=async(db,role,superuser=false)=>{
    assert.ok(db instanceof pg.Client,'actual original node-postgres Client required')
    assert.equal(db.connectionParameters.host,'127.0.0.1');assert.equal(Number(db.connectionParameters.port),5432);assert.equal(db.connectionParameters.database,target.database)
    assert.equal(db.connection.stream.remoteAddress,'127.0.0.1');assert.equal(db.connection.stream.remotePort,5432)
    const row=(await db.query("SELECT session_user AS login,current_user AS role,pg_backend_pid() AS pid,current_database() AS db,current_setting('server_version_num')::integer AS version,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser")).rows[0]
    assert.equal(row.login,db.connectionParameters.user);assert.equal(row.role,role);assert.equal(row.pid,db.processID);assert.equal(row.db,target.database);assert.equal(row.superuser,superuser);assert.ok(row.version>=180000&&row.version<190000)
    if(superuser)assert.equal(row.login,target.user);else assert.notEqual(row.login,target.user)
    return row
  }
  const admin=async body=>{const db=await adminPool.connect();try{await mustClient(db,target.user,true);return await body(db)}finally{db.release()}}
  const api=async(who,body,{auditCatalog=true}={})=>{
    const identity=await f.identityFor(who)
    return repository.withActor(f.pool,identity,async(db,owner)=>{
      await mustClient(db,'agentstudio_api');assert.equal(owner,f.users[who])
      if(auditCatalog)assert.equal(await audit.verifyAgentTemplateMarketCredentials(db),true)
      await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='15s'")
      return body(db,owner,identity)
    })
  }
  const call=async(db,name,args=[])=>{
    assert.ok(Object.hasOwn(signatures,name));const casts=signatures[name]?signatures[name].split(','):[];assert.equal(casts.length,args.length)
    const sql='SELECT agentstudio.agent_template_market_'+name+'('+casts.map((cast,i)=>'$'+(i+1)+'::'+cast).join(',')+') AS value'
    return (await db.query(sql,args.map((arg,i)=>casts[i]==='jsonb'?JSON.stringify(arg):arg))).rows[0].value
  }
  const commitAdmin=async body=>admin(async db=>{let begun=false;try{await db.query('BEGIN');begun=true;const v=await body(db);await db.query('COMMIT');begun=false;return v}finally{if(begun)await db.query('ROLLBACK')}})
  const catalogApi=async body=>{
    const db=await f.pool.connect();let begun=false
    try{await db.query('BEGIN READ ONLY');begun=true;await db.query('SET LOCAL ROLE agentstudio_api');await mustClient(db,'agentstudio_api');return await body(db)}
    finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
  }
  const positive=()=>catalogApi(async db=>assert.equal(await audit.verifyAgentTemplateMarketCredentials(db),true))
  const negative=()=>catalogApi(db=>assert.rejects(()=>audit.verifyAgentTemplateMarketCredentials(db),/unsafe_agent_template_market_privileges/))
  const routine=signature=>admin(async db=>(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS def',[signature])).rows[0].def)
  const asRole=async(pool,role,body)=>{
    const db=await pool.connect();let begun=false
    try{await mustClient(db,db.connectionParameters.user);await db.query('BEGIN');begun=true;await db.query('SET LOCAL ROLE '+quote(role));await mustClient(db,role);const value=await body(db);await db.query('COMMIT');begun=false;return value}
    finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
  }
  const ownPool=(login,password)=>{const pool=new pg.Pool({...target,user:login,password,max:2,statement_timeout:15000,query_timeout:20000});pool.on('error',()=>{});pools.push(pool);return pool}
  const designNegativePrincipals=async()=>{
    const {makeNativeScramVerifier}=await import('../../src/native-activation-cli.mjs'),principals=[]
    for(const role of ['agentstudio_design_worker','agentstudio_design_dispatch']){
      const members=await admin(async db=>(await db.query('SELECT count(*)::integer AS n FROM pg_catalog.pg_auth_members WHERE roleid=$1::regrole',[role])).rows[0].n)
      assert.equal(members,0,'fresh shared F07 fixture must not start a design Worker or another design login')
      const login='f07_market_fixture_'+role.slice('agentstudio_'.length),password=crypto.randomBytes(40).toString('hex')
      await commitAdmin(async db=>{await db.query('CREATE ROLE '+quote(login)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+makeNativeScramVerifier(password)+"'");await db.query('GRANT '+quote(role)+' TO '+quote(login)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')})
      ownedRoles.push({login,role});principals.push({pool:ownPool(login,password),role})
    }
    return principals
  }
  const legacyApiPool=async()=>{
    const login='agentstudio_stage_worker'
    // The unchanged fresh initializer intentionally disabled this existing
    // two-parent login. Open it only inside this guarded disposable test.
    const original=await admin(async db=>(await db.query("SELECT r.rolcanlogin AS login,NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL AND r.rolvaliduntil IS NULL AS safe,ARRAY(SELECT p.rolname::text FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid ORDER BY p.rolname) AS parents,NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid AND (m.admin_option OR m.inherit_option OR NOT m.set_option)) AS membership_safe FROM pg_catalog.pg_roles r WHERE r.rolname=$1::text",[login])).rows[0])
    assert.ok(original);assert.equal(original.login,false);assert.equal(original.safe,true);assert.equal(original.membership_safe,true);assert.deepEqual(original.parents,['agentstudio_api','agentstudio_worker'])
    await commitAdmin(db=>db.query('ALTER ROLE '+quote(login)+' LOGIN'))
    let pool,restored=false
    const restore=async()=>{
      if(restored)return;restored=true
      try{if(pool)await pool.end()}
      finally{
        if(pool){const index=pools.indexOf(pool);assert.ok(index>=0);pools.splice(index,1)}
        await commitAdmin(db=>db.query('ALTER ROLE '+quote(login)+' NOLOGIN'))
      }
    }
    try{pool=ownPool(login,crypto.createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80));return{pool,restore}}
    catch(error){await restore();throw error}
  }
  const catalogState=()=>admin(async db=>(await db.query(`SELECT jsonb_build_object(
    'versions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY version) FROM agentstudio.schema_migrations s),
    'relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,c.reltablespace,
      (SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attstorage,a.attcompression,a.attisdropped,a.atthasmissing,a.attmissingval,a.attacl,pg_get_expr(d.adbin,d.adrelid,false)) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0),
      (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grantee,g.privilege_type,g.is_grantable) FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) g)) ORDER BY n.nspname,c.relname) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE starts_with(c.relname,'agent_template_market_')),
    'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,oidvectortypes(p.proargtypes),pg_get_functiondef(p.oid),p.proowner,
      (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grantee,g.privilege_type,g.is_grantable) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) g)) ORDER BY n.nspname,p.proname,oidvectortypes(p.proargtypes)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE starts_with(p.proname,'agent_template_market_')),
    'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid,false),k.convalidated,k.conenforced,k.condeferrable,k.condeferred,k.connoinherit) ORDER BY c.relname,k.conname) FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid WHERE starts_with(c.relname,'agent_template_market_') OR starts_with(k.conname,'agent_template_market_')),
    'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,CASE WHEN t.tgisinternal THEN null ELSE t.tgname END,p.proname,t.tgtype,t.tgenabled,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,CASE WHEN k.oid IS NOT NULL THEN pg_get_constraintdef(k.oid,false) END) ORDER BY c.relname,p.proname,t.tgtype,coalesce(pg_get_constraintdef(k.oid,false),'')) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint WHERE starts_with(c.relname,'agent_template_market_') OR starts_with(t.tgname,'agent_template_market_')),
    'types',(SELECT jsonb_agg(jsonb_build_array(n.nspname,y.typname,y.typtype,y.typowner,y.typnotnull,y.typdefault,y.typacl) ORDER BY n.nspname,y.typname) FROM pg_catalog.pg_type y JOIN pg_catalog.pg_namespace n ON n.oid=y.typnamespace WHERE starts_with(y.typname,'agent_template_market_') OR starts_with(y.typname,'_agent_template_market_')),
    'roles',(SELECT jsonb_agg(jsonb_build_array(r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolconfig,r.rolvaliduntil) ORDER BY r.rolname) FROM pg_catalog.pg_roles r WHERE r.rolname='agentstudio_api' OR starts_with(r.rolname,'agent_template_market_') OR r.oid IN(SELECT member FROM pg_catalog.pg_auth_members WHERE roleid='agentstudio_api'::regrole)),
    'members',(SELECT jsonb_agg(jsonb_build_array(a.rolname,b.rolname,m.admin_option,m.inherit_option,m.set_option,g.rolname) ORDER BY a.rolname,b.rolname,g.rolname) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles a ON a.oid=m.roleid JOIN pg_catalog.pg_roles b ON b.oid=m.member JOIN pg_catalog.pg_roles g ON g.oid=m.grantor WHERE a.rolname='agentstudio_api' OR b.rolname='agentstudio_api'),
    'policies',(SELECT jsonb_agg(jsonb_build_array(p.polname,c.relname,p.polcmd,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid WHERE starts_with(c.relname,'agent_template_market_') OR starts_with(p.polname,'agent_template_market_')),
    'statistics',(SELECT jsonb_agg(jsonb_build_array(s.stxname,c.relname,pg_get_statisticsobjdef(s.oid)) ORDER BY s.stxname) FROM pg_catalog.pg_statistic_ext s JOIN pg_catalog.pg_class c ON c.oid=s.stxrelid WHERE starts_with(c.relname,'agent_template_market_') OR starts_with(s.stxname,'agent_template_market_')),
    'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl) ORDER BY nspname) FROM pg_catalog.pg_namespace WHERE starts_with(nspname,'agent_template_market_')),
    'defaults',(SELECT jsonb_agg(jsonb_build_array(defaclrole,defaclobjtype,defaclacl) ORDER BY defaclrole,defaclobjtype) FROM pg_catalog.pg_default_acl WHERE defaclnamespace='agentstudio'::regnamespace)
    ) AS value`)).rows[0].value)
  const state=()=>admin(async db=>(await db.query(`SELECT jsonb_build_object(
    'publications',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM agentstudio.agent_template_market_publications r),
    'snapshots',(SELECT jsonb_agg(to_jsonb(r) ORDER BY template_id) FROM agentstudio.agent_template_market_snapshots r),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY owner_user_id,request_id) FROM agentstudio.agent_template_market_receipts r),
    'tombstones',(SELECT jsonb_agg(to_jsonb(r) ORDER BY template_id) FROM agentstudio.agent_template_market_tombstones r),
    'agents',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM agentstudio.agent_specs r WHERE owner_user_id=ANY($1::uuid[])),
    'history',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM agentstudio.agent_collaboration_revisions r WHERE owner_user_id=ANY($1::uuid[])),
    'audits',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM agentstudio.audit_events r WHERE owner_user_id=ANY($1::uuid[]) AND action LIKE 'agent.template_market.%')
    ) AS value`,[Object.values(f.users)])).rows[0].value)
  const tamper=async(name,apply,restore)=>{
    await positive();const before=await catalogState();let installed=false,failed
    try{await commitAdmin(apply);installed=true;await negative()}catch(error){failed=error;throw error}
    finally{if(installed){try{await commitAdmin(restore);await positive();assert.deepEqual(await catalogState(),before,'exact semantic catalog restoration: '+name)}catch(error){if(failed)throw new AggregateError([failed,error],'catalog refusal and restoration failed: '+name);throw error}}}
  }
  const close=async()=>{
    const failures=[],results=await Promise.allSettled(pools.filter(pool=>pool!==adminPool).map(pool=>pool.end()));for(const v of results)if(v.status==='rejected')failures.push(v.reason)
    try{for(const {login,role}of ownedRoles)await commitAdmin(async db=>{await db.query('REVOKE '+quote(role)+' FROM '+quote(login));await db.query('DROP ROLE '+quote(login))})}catch(error){failures.push(error)}
    try{await adminPool.end()}catch(error){failures.push(error)}if(failures.length)throw new AggregateError(failures,'F07 database owned cleanup failed')
  }
  return {assert,crypto,pg,fs,repository,audit,contract,result,contracts,admin,adminPool,api,catalogApi,asRole,designNegativePrincipals,legacyApiPool,call,commitAdmin,positive,negative,routine,catalogState,state,tamper,quote,mustClient,close,httpBase:http.agentTemplateMarketHttpBase,vectorBuilder:vectors.agentTemplateMarketDatabaseGoldenVectors,catalogCases:catalogCases.agentTemplateMarketCatalogCases}
}

// The shared F07 Native fixture owns the sole initializer and authenticated
// employee sessions. Its final ABI is checked before this export is registered.
export async function runAgentTemplateMarketDatabaseSuite(t,f,env=process.env){
  requireAgentTemplateMarketDatabaseCi(env)
  const h=await harness(f,env),{assert,admin,api,call,contract,result,crypto,commitAdmin,tamper}=h
  const run=async(name,body)=>{let completed=false,failure;await t.test(name,async c=>{try{await body(c);completed=true}catch(error){failure=error;throw error}});if(!completed)throw failure??Error('agent_template_market_database_child_incomplete:'+name)}
  try{
    await h.positive()
    await run('actual installed063 and predecessor catalogs pass under the original API login',async()=>{
      const stamp=await admin(async db=>(await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version IN('pg_v9_062','pg_v9_063') ORDER BY version")).rows.map(row=>row.version))
      assert.deepEqual(stamp,['pg_v9_062','pg_v9_063']);await h.positive()
      const rows=await admin(async db=>(await db.query("SELECT proname,oidvectortypes(proargtypes) AS args FROM pg_catalog.pg_proc WHERE pronamespace='agentstudio'::regnamespace AND starts_with(proname,'agent_template_market_') AND has_function_privilege('agentstudio_api',oid,'EXECUTE') ORDER BY proname")).rows)
      assert.deepEqual(rows,Object.entries(signatures).map(([name,args])=>({proname:'agent_template_market_'+name,args:args.replaceAll(',',', ')})).sort((a,b)=>a.proname.localeCompare(b.proname)))
    })
    await run('reapplying exact installed063 refuses and changes neither catalogs nor business rows',async()=>{
      const before=await h.catalogState(),business=await h.state(),sql=h.fs.readFileSync(new URL('../../../../db/postgres/migrations/pg_v9_063_agent_template_market.sql',import.meta.url),'utf8')
      await admin(async db=>{try{await assert.rejects(()=>db.query(sql),e=>e.code==='P0001'&&/agent_template_market_installation_refused/.test(e.message))}finally{await db.query('ROLLBACK')}})
      assert.deepEqual(await h.catalogState(),before);assert.deepEqual(await h.state(),business);await h.positive()
    })
    for(const version of ['pg_v9_063','pg_v9_062'])await run('missing '+version+' cannot be accepted as absent or complete',async()=>{
      const saved=await admin(async db=>(await db.query('SELECT to_jsonb(s) AS row FROM agentstudio.schema_migrations s WHERE version=$1',[version])).rows[0].row)
      await tamper(version,db=>db.query('DELETE FROM agentstudio.schema_migrations WHERE version=$1',[version]),db=>db.query('INSERT INTO agentstudio.schema_migrations SELECT * FROM jsonb_populate_record(NULL::agentstudio.schema_migrations,$1::jsonb)',[JSON.stringify(saved)]))
    })
    for(const c of h.catalogCases)await run('real catalog refusal: '+c.name,()=>tamper(c.name,db=>db.query(c.apply),db=>db.query(c.restore)))
    await run('a success-looking replacement body cannot replace a reviewed fixed RPC',async()=>{
      const signature='agentstudio.agent_template_market_mine()',saved=await h.routine(signature)
      await tamper('body digest',db=>db.query("CREATE OR REPLACE FUNCTION "+signature+" RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $changed$ BEGIN RETURN '{\"ok\":true,\"items\":[]}'::jsonb; END $changed$"),db=>db.query(saved))
    })
    for(const kind of ['c','p','f'])await run('actual '+kind+' constraint tamper is refused',async()=>{
      const table=kind==='p'?'agent_template_market_receipts':kind==='f'?'agent_template_market_snapshots':'agent_template_market_publications'
      const original=await admin(async db=>(await db.query('SELECT conname,pg_get_constraintdef(oid,false) AS def FROM pg_catalog.pg_constraint WHERE conrelid=$1::regclass AND contype=$2 ORDER BY conname LIMIT 1',['agentstudio.'+table,kind])).rows[0]);assert.ok(original)
      await tamper('constraint '+kind,async db=>{await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' DROP CONSTRAINT '+h.quote(original.conname));if(kind==='c')await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' ADD CONSTRAINT '+h.quote(original.conname)+' CHECK(true)')},async db=>{if(kind==='c')await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' DROP CONSTRAINT '+h.quote(original.conname));await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' ADD CONSTRAINT '+h.quote(original.conname)+' '+original.def)})
    })
    for(const [changed,original] of [['LOGIN','NOLOGIN'],['INHERIT','NOINHERIT'],['BYPASSRLS','NOBYPASSRLS'],['CREATEDB','NOCREATEDB'],['CREATEROLE','NOCREATEROLE'],['REPLICATION','NOREPLICATION']])await run('actual API group attribute refusal: '+changed,()=>tamper(changed,db=>db.query('ALTER ROLE agentstudio_api '+changed),db=>db.query('ALTER ROLE agentstudio_api '+original)))
    await run('actual API group configuration and parent memberships cannot widen authority',async()=>{
      await tamper('API config',db=>db.query('ALTER ROLE agentstudio_api SET search_path=public'),db=>db.query('ALTER ROLE agentstudio_api RESET search_path'))
      await tamper('API group parent',db=>db.query('GRANT agentstudio_review_worker TO agentstudio_api WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'),db=>db.query('REVOKE agentstudio_review_worker FROM agentstudio_api'))
    })
    const apiLogin=await h.catalogApi(async db=>db.connectionParameters.user)
    for(const role of ['agentstudio_api',apiLogin])await run('actual selected API connection refuses a superuser flag on '+role,async()=>{
      const before=await h.catalogState()
      await h.catalogApi(async db=>{
        let applied=false
        try{await commitAdmin(d=>d.query('ALTER ROLE '+h.quote(role)+' SUPERUSER'));applied=true;await assert.rejects(()=>h.audit.verifyAgentTemplateMarketCredentials(db),/unsafe_agent_template_market_privileges/)}
        finally{if(applied)await commitAdmin(d=>d.query('ALTER ROLE '+h.quote(role)+' NOSUPERUSER'))}
      })
      await h.positive();assert.deepEqual(await h.catalogState(),before)
    })
    for(const [changed,original] of [['INHERIT','NOINHERIT'],['BYPASSRLS','NOBYPASSRLS'],['CREATEDB','NOCREATEDB'],['CREATEROLE','NOCREATEROLE'],['REPLICATION','NOREPLICATION']])await run('actual authenticating API login attribute refusal: '+changed,()=>tamper(changed,db=>db.query('ALTER ROLE '+h.quote(apiLogin)+' '+changed),db=>db.query('ALTER ROLE '+h.quote(apiLogin)+' '+original)))
    for(const option of ['ADMIN TRUE','INHERIT TRUE','SET FALSE'])await run('actual API membership option refusal: '+option,async()=>{
      if(option==='SET FALSE'){
        // Keep one genuinely authenticated, already selected API connection:
        // revoking future SET ROLE must not hide the unsafe current catalog.
        const before=await h.catalogState();await h.catalogApi(async db=>{
          let applied=false
          try{await commitAdmin(d=>d.query('GRANT agentstudio_api TO '+h.quote(apiLogin)+' WITH SET FALSE'));applied=true;await assert.rejects(()=>h.audit.verifyAgentTemplateMarketCredentials(db),/unsafe_agent_template_market_privileges/)}
          finally{if(applied)await commitAdmin(d=>d.query('GRANT agentstudio_api TO '+h.quote(apiLogin)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'))}
        });await h.positive();assert.deepEqual(await h.catalogState(),before)
      }else await tamper(option,db=>db.query('GRANT agentstudio_api TO '+h.quote(apiLogin)+' WITH '+option),db=>db.query('GRANT agentstudio_api TO '+h.quote(apiLogin)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'))
    })
    await run('actual SQL value helpers agree with the frozen Node snapshot, copy, full intent and Unicode/numeric protocols',async()=>{
      // These admin-only pure helper comparisons are NOT an employee/source
      // authority positive. Later cases obtain real pins from actual Native rows.
      const v=await h.vectorBuilder()
      for(const vector of v.projection){
        const actual=await admin(async db=>(await db.query('SELECT agentstudio.agent_template_market_project($1::jsonb) AS projection,agentstudio.agent_design_digest(agentstudio.agent_template_market_project($1::jsonb)->\'snapshot\') AS sha',[JSON.stringify(vector.raw)])).rows[0])
        assert.deepEqual(actual.projection,vector.expected);assert.equal(actual.sha,vector.snapshot_sha256)
        for(const copy of vector.copies)assert.deepEqual(await admin(async db=>(await db.query('SELECT agentstudio.agent_template_market_copy($1::jsonb,$2::text,$3::text) AS value',[JSON.stringify(vector.expected.snapshot),copy.published_name,copy.copy_name])).rows[0].value),copy.expected)
      }
      for(const vector of v.intents)assert.equal(await admin(async db=>(await db.query('SELECT agentstudio.agent_design_digest($1::jsonb) AS sha',[JSON.stringify(vector.payload)])).rows[0].sha),vector.expected)
      for(const vector of v.canonical){const actual=await admin(async db=>(await db.query('SELECT agentstudio.agent_design_compact($1::jsonb) AS compact,agentstudio.agent_design_digest($1::jsonb) AS sha',[JSON.stringify(vector.value)])).rows[0]);assert.equal(actual.compact,vector.compact);assert.equal(actual.sha,vector.expected)}
      for(const vector of v.integers)assert.equal(await admin(async db=>(await db.query('SELECT agentstudio.agent_template_market_int($1::jsonb,$2::bigint) AS value',[JSON.stringify(vector.value),vector.min])).rows[0].value),vector.expected)
      for(const raw of v.rejectedSources)await assert.rejects(()=>admin(db=>db.query('SELECT agentstudio.agent_template_market_project($1::jsonb)',[JSON.stringify(raw)])),e=>e.code==='P0001'&&/agent_template_market_invalid_source/.test(e.message))
    })
    const baseSpec={goal:'F07 full public goal 中文 😀',task_scope:'F07 exact public task scope',deliverables:['F07 full deliverable'],task_plan:['F07 full step'],done_criteria:['F07 full completion'],tools:['calculate','summarize','knowledge_search','web_search','web_fetch'],knowledge_base_ids:[],require_plan_review:true}
    const makeSource=async(who='alice')=>f.agents.create(await f.identityFor(who),'F07 genuine owned source '+crypto.randomUUID(),h.contracts.safeAgentSpec({...baseSpec,model_binding:f.resources[who].binding}))
    const selected=async(who,specId)=>api(who,db=>call(db,'source',[specId]))
    const publish=async({who='alice',sourceAgent,category='research',name='F07 reviewed public name',description='F07 reviewed public summary',requestId=crypto.randomUUID()}={})=>{
      const agent=sourceAgent??await makeSource(who),source=await selected(who,agent.id)
      const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:source.source,name,description,category})
      const preview=await api(who,db=>call(db,'publish_preview',[choice]))
      assert.deepEqual(preview,await result.deriveAgentTemplateMarketPublishPreview(choice,agent.name,agent.spec))
      const intent=contract.parseAgentTemplateMarketPublishIntent({...choice,action:'publish',request_id:requestId,expected_snapshot_sha256:preview.snapshot_sha256,confirm:true,acknowledgement:contract.agentTemplateMarketPublishAcknowledgement})
      const receipt=await api(who,db=>call(db,'record',[intent]));result.parseAgentTemplateMarketReceipt(receipt)
      return {who,agent,source,choice,preview,intent,receipt,pin:{template_id:receipt.item.id,revision:receipt.item.revision,snapshot_sha256:receipt.item.snapshot_sha256}}
    }
    const use=async(p,{who='bob',copyName='F07 actual independent copy 😀',requestId=crypto.randomUUID()}={})=>{
      const choice=contract.parseAgentTemplateMarketUseChoice({action:'preview_use',template:p.pin,copy_name:copyName})
      const preview=await api(who,db=>call(db,'use_preview',[choice]))
      const expected=result.deriveAgentTemplateMarketCopy(p.preview.snapshot,p.preview.name,choice.copy_name)
      assert.deepEqual(preview.spec,expected.spec);assert.equal(preview.name,expected.name)
      assert.equal(preview.copy_sha256,await result.agentTemplateMarketCopyDigest(p.preview.snapshot,p.preview.name,choice.copy_name))
      const intent=contract.parseAgentTemplateMarketUseIntent({action:'use',request_id:requestId,template:p.pin,copy_name:choice.copy_name,expected_copy_sha256:preview.copy_sha256,confirm:true})
      return {who,choice,preview,intent}
    }
    const record=async u=>{const receipt=await api(u.who,db=>call(db,'record',[u.intent]));result.parseAgentTemplateMarketReceipt(receipt);return receipt}
    const lifecycle=async(p,action)=>{
      const intent=contract.parseAgentTemplateMarketLifecycleIntent({action,request_id:crypto.randomUUID(),template:p.pin,confirm:true}),receipt=await api(p.who,db=>call(db,'record',[intent]))
      result.parseAgentTemplateMarketReceipt(receipt);p.pin={...p.pin,revision:receipt.revision};return {intent,receipt}
    }
    const refuseStalePublish=async(who,choice,oldSnapshot)=>{
      const refused=e=>e.code==='P0001'&&/agent_template_market_source_changed/.test(e.message)
      await assert.rejects(()=>api(who,db=>call(db,'publish_preview',[choice])),refused)
      const intent=contract.parseAgentTemplateMarketPublishIntent({...choice,action:'publish',request_id:crypto.randomUUID(),expected_snapshot_sha256:await contract.agentTemplateMarketDigest(oldSnapshot),confirm:true,acknowledgement:contract.agentTemplateMarketPublishAcknowledgement}),before=await h.state()
      await assert.rejects(()=>api(who,db=>call(db,'record',[intent])),refused);assert.deepEqual(await h.state(),before)
    }
    const assertCopy=async(u,receipt)=>{
      const agent=await f.agents.get(await f.identityFor(u.who),receipt.spec_id)
      assert.equal(agent.owner_user_id,f.users[u.who]);assert.equal(agent.revision,1);assert.equal(agent.name,u.preview.name);assert.deepEqual(agent.spec,u.preview.spec)
      assert.deepEqual(agent.spec.knowledge_base_ids,[]);assert.equal(agent.spec.require_approval,true)
      for(const key of ['model_binding','http_tools','mcp_tools','knowledge_retrieval','quality_checks'])assert.equal(Object.hasOwn(agent.spec,key),false)
      const rows=await admin(async db=>(await db.query('SELECT * FROM agentstudio.agent_collaboration_revisions WHERE spec_id=$1',[agent.id])).rows)
      assert.equal(rows.length,1);assert.equal(rows[0].owner_user_id,f.users[u.who]);assert.equal(rows[0].actor_user_id,f.users[u.who]);assert.equal(rows[0].kind,'edited');assert.equal(Number(rows[0].spec_revision),1);assert.equal(rows[0].source_revision_id,null);assert.equal(rows[0].proposal_id,null)
      const actual=await admin(async db=>(await db.query('SELECT source_sha256=agentstudio.agent_optimization_role_sha(a.id,a.owner_user_id,a.name,a.revision,a.spec) AND safe_spec=agentstudio.collaboration_safe_text(a.spec) AS valid FROM agentstudio.agent_collaboration_revisions h JOIN agentstudio.agent_specs a ON a.id=h.spec_id WHERE h.spec_id=$1',[agent.id])).rows[0].valid)
      assert.equal(actual,true)
      const audits=await admin(async db=>(await db.query("SELECT * FROM agentstudio.audit_events WHERE owner_user_id=$1 AND action='agent.template_market.use' AND metadata->>'request_id'=$2",[f.users[u.who],u.intent.request_id])).rows)
      assert.equal(audits.length,1);assert.equal(audits[0].metadata.copied_spec_id,agent.id);assert.equal(audits[0].metadata.provider_called,false)
      return agent
    }
    assert.equal(typeof f.assertNoModelEffects,'function','actual shared F07 fixture effects observer required')
    const beforeEffects=await f.counts()
    await run('actual API can execute only fixed RPCs and cannot read private tables or helpers',async()=>{
      for(const table of tables)await assert.rejects(()=>api('alice',db=>db.query('SELECT * FROM agentstudio.'+h.quote(table))),e=>e.code==='42501')
      for(const sql of ["SELECT agentstudio.agent_template_market_context()","SELECT agentstudio.agent_template_market_project('{}'::jsonb)","SELECT agentstudio.agent_template_market_private_source(gen_random_uuid(),gen_random_uuid())","SELECT snapshot FROM agentstudio.agent_template_market_snapshots","SELECT intent_sha256 FROM agentstudio.agent_template_market_receipts","SELECT api_key_ciphertext FROM agentstudio.model_connections","SELECT value_ciphertext FROM agentstudio.tool_connection_headers","SELECT value_ciphertext FROM agentstudio.mcp_connection_headers","SELECT password_record FROM agentstudio_auth.accounts","SELECT token_digest FROM agentstudio_auth.sessions"])await assert.rejects(()=>api('alice',db=>db.query(sql)),e=>e.code==='42501')
    })
    await run('actual legacy review,model,Native and F01 design logins have no F07 RPC or private-table authority',async()=>{
      const designPrincipals=await h.designNegativePrincipals(),{verifyAgentDesignCredentials}=await import('../../src/agent-design-audit.ts')
      for(const {pool,role}of designPrincipals)await h.asRole(pool,role,async db=>assert.equal(await verifyAgentDesignCredentials(db),true,'original062 role-aware predecessor chain still accepts '+role))
      const principals=[{pool:f.workerPool,role:'agentstudio_review_worker'},{pool:f.dispatchPool,role:'agentstudio_review_dispatch'},{pool:f.secretPool,role:'agentstudio_model_broker'},{pool:f.authPool,role:'agentstudio_native_auth'},...designPrincipals]
      await h.positive()
      for(const {pool,role}of principals){
        for(const [name,signature]of Object.entries(signatures)){const args=signature?signature.split(',').map(type=>type==='jsonb'?{}:crypto.randomUUID()):[];await assert.rejects(()=>h.asRole(pool,role,db=>call(db,name,args)),e=>e.code==='42501',role+' cannot call '+name)}
        for(const table of tables)await assert.rejects(()=>h.asRole(pool,role,db=>db.query('SELECT * FROM agentstudio.'+h.quote(table))),e=>e.code==='42501',role+' cannot SELECT '+table)
      }
    })
    await run('an actual existing two-parent Worker/API login cannot borrow the API receipt or auditor',async()=>{
      const before=await h.catalogState(),{pool,restore}=await h.legacyApiPool()
      try{
        // asRole proves an original authenticated TCP Client, login/role/PID,
        // database and PG18 BEFORE either original refusal assertion runs.
        await h.asRole(pool,'agentstudio_api',async()=>undefined)
        await assert.rejects(()=>h.asRole(pool,'agentstudio_api',db=>call(db,'receipt',[crypto.randomUUID()])),e=>e.code==='P0001'&&/agent_design_session_refused/.test(e.message))
        await assert.rejects(()=>h.asRole(pool,'agentstudio_api',db=>h.audit.verifyAgentTemplateMarketCredentials(db)),/unsafe_agent_template_market_privileges/)
      }finally{await restore();assert.deepEqual(await h.catalogState(),before,'restore original two-parent NOLOGIN fixture');await h.positive()}
    })
    let owned,originalCopy,originalUse,originalUseReceipt
    await run('actual Native owner source and publication retain all descriptions and remove resource authority',async()=>{
      owned=await publish();assert.equal(owned.source.authority,false);assert.equal(owned.preview.authority,false);assert.equal(owned.preview.public_text_review_required,true)
      assert.notEqual(owned.source.source.source_sha256,owned.preview.snapshot_sha256)
      assert.equal(owned.preview.removed.model_binding,true)
      assert.equal(JSON.stringify(owned.preview.snapshot).includes(f.resources.alice.binding.connection_id),false)
      await assert.rejects(()=>selected('bob',owned.agent.id),e=>e.code==='P0001'&&/agent_template_market_source_unavailable/.test(e.message))
      const market=await api('bob',db=>call(db,'market',[{category:'research',search:'F07 reviewed'}]));result.parseAgentTemplateMarketPage(market)
      const item=market.items.find(row=>row.id===owned.pin.template_id);assert.ok(item);assert.equal(Object.hasOwn(item,'publisher_user_id'),false);assert.ok(!item.source_spec_id)
      const mine=await api('alice',db=>call(db,'mine'));result.parseAgentTemplateMarketMinePage(mine);assert.ok(mine.items.some(row=>row.id===owned.pin.template_id))
      const detail=await api('bob',db=>call(db,'detail',[owned.pin.template_id]));assert.deepEqual(detail.spec,owned.preview.snapshot.spec)
      const options=await f.request('alice',h.httpBase+'/sources');assert.equal(options.status,200);assert.ok(options.body.items.length<=200)
      for(const option of options.body.items)assert.deepEqual(Object.keys(option).sort(),['name','revision','spec_id'])
      assert.ok(options.body.items.some(option=>option.spec_id===owned.agent.id));assert.ok(!options.body.items.some(option=>option.spec_id===f.resources.bob.spec.id))
      const chosen=await f.request('alice',h.httpBase+'/sources/'+owned.agent.id);assert.equal(chosen.status,200);assert.deepEqual(Object.keys(chosen.body).sort(),['name','source']);assert.deepEqual(chosen.body.source,owned.source.source)
      for(const category of ['knowledge','data','other']){const p=await publish({sourceAgent:owned.agent,category,name:'F07 category '+category});const filtered=await api('bob',db=>call(db,'market',[{category,search:'F07 category'}]));assert.ok(filtered.items.some(row=>row.id===p.pin.template_id))}
    })
    await run('actual Cookie perimeter refuses missing identity,forged owner headers and foreign origins',async()=>{
      const before=await h.state()
      const missing=await f.request('missing',h.httpBase+'/market');assert.equal(missing.status,401)
      const forged=await f.request('bob',h.httpBase+'/sources/'+owned.agent.id,undefined,{headers:{'X-Rh-User-Id':f.users.alice}});assert.equal(forged.status,403)
      const origin=await f.request('alice',h.httpBase+'/market',undefined,{headers:{Origin:'https://foreign.invalid'}});assert.equal(origin.status,403)
      const foreign=await f.request('bob',h.httpBase+'/sources/'+owned.agent.id);assert.equal(foreign.status,404)
      assert.deepEqual(await h.state(),before)
    })
    await run('request UUID scope belongs to each actual Native owner and never grants foreign lifecycle authority',async()=>{
      const sameId=await publish({who:'bob',requestId:owned.intent.request_id,name:'F07 Bob independent same request UUID'})
      assert.notEqual(sameId.pin.template_id,owned.pin.template_id)
      assert.deepEqual(await api('alice',db=>call(db,'receipt',[owned.intent.request_id])),{status:'recorded',receipt:owned.receipt})
      assert.deepEqual(await api('bob',db=>call(db,'receipt',[owned.intent.request_id])),{status:'recorded',receipt:sameId.receipt})
      const before=await h.state(),intent=contract.parseAgentTemplateMarketLifecycleIntent({action:'unpublish',request_id:crypto.randomUUID(),template:owned.pin,confirm:true})
      await assert.rejects(()=>api('bob',db=>call(db,'record',[intent])),e=>e.code==='P0001'&&/agent_template_market_owner_required/.test(e.message))
      assert.deepEqual(await h.state(),before)
    })
    await run('real Bob copy creates one fresh private Agent,045 history, provenance audit and immutable receipt',async()=>{
      originalUse=await use(owned);originalUseReceipt=await record(originalUse);originalCopy=await assertCopy(originalUse,originalUseReceipt)
      assert.notEqual(originalCopy.id,owned.agent.id)
      const recovery=await api('bob',db=>call(db,'receipt',[originalUse.intent.request_id]));assert.deepEqual(recovery,{status:'recorded',receipt:originalUseReceipt})
      assert.deepEqual(await api('alice',db=>call(db,'receipt',[originalUse.intent.request_id])),{status:'not_recorded',request_id:originalUse.intent.request_id})
      const before=await h.state();assert.deepEqual(await record(originalUse),originalUseReceipt);assert.deepEqual(await h.state(),before)
      for(const sql of ['UPDATE agentstudio.agent_template_market_receipts SET receipt=receipt WHERE owner_user_id=$1 AND request_id=$2','DELETE FROM agentstudio.agent_template_market_receipts WHERE owner_user_id=$1 AND request_id=$2'])await assert.rejects(()=>admin(db=>db.query(sql,[f.users.bob,originalUse.intent.request_id])),e=>e.code==='P0001'&&/agent_template_market_immutable_receipt/.test(e.message))
      assert.deepEqual(await h.state(),before)
    })
    await run('actual saved maximum-capacity descriptions publish and copy without truncating any field',async()=>{
      const full={...baseSpec,goal:'😀'.repeat(1500),task_scope:'界'.repeat(4000),deliverables:Array.from({length:30},()=> '😀'.repeat(250)),task_plan:Array.from({length:30},()=> '步'.repeat(500)),done_criteria:Array.from({length:30},()=> '验'.repeat(500))}
      const agent=await f.agents.create(await f.identityFor('alice'),'F07 actual full capacity source',h.contracts.safeAgentSpec(full)),p=await publish({sourceAgent:agent,name:'F07 actual full capacity publication'}),u=await use(p),receipt=await record(u),copied=await assertCopy(u,receipt)
      for(const key of ['goal','task_scope','deliverables','task_plan','done_criteria'])assert.deepEqual(copied.spec[key],full[key])
    })
    await run('same request changed full intent conflicts even when receipt metadata alone cannot detect it',async()=>{
      const changed={...originalUse,intent:{...originalUse.intent,copy_name:'Another reviewed name'}}
      await assert.rejects(()=>record(changed),e=>e.code==='P0001'&&/agent_template_market_request_conflict/.test(e.message))
      const altered={...owned.intent,name:'Changed publish name'}
      await assert.rejects(()=>api('alice',db=>call(db,'record',[altered])),e=>e.code==='P0001'&&/agent_template_market_request_conflict/.test(e.message))
      assert.deepEqual(await record(originalUse),originalUseReceipt)
    })
    await run('a genuinely lost post-commit HTTP ACK recovers one original UUID and one committed copy',async()=>{
      const p=await publish(),u=await use(p),before=await h.state(),path=h.httpBase+'/'+p.pin.template_id+'/use'
      f.mutable.dropNext={method:'POST',path}
      await assert.rejects(()=>f.request('bob',path,u.intent))
      const recovery=await f.request('bob',h.httpBase+'/requests/'+u.intent.request_id);assert.equal(recovery.status,200);assert.equal(recovery.body.status,'recorded')
      const receipt=recovery.body.receipt;result.parseAgentTemplateMarketReceipt(receipt);await assertCopy(u,receipt)
      const after=await h.state();assert.equal(after.agents.length,before.agents.length+1);assert.equal(after.receipts.length,before.receipts.length+1);assert.equal(after.history.length,before.history.length+1);assert.equal(after.audits.length,before.audits.length+1)
      f.mutable.writes=false
      try{const same=await f.request('bob',path,u.intent);assert.equal(same.status,200);assert.deepEqual(same.body,receipt)}finally{f.mutable.writes=true}
      assert.deepEqual(await h.state(),after)
    })
    await run('ordinary caller rollback removes Agent,045 history,count,audit and receipt together',async()=>{
      const prepared=await use(owned),before=await h.state();let proposed
      await assert.rejects(()=>api('bob',async db=>{proposed=await call(db,'record',[prepared.intent]);throw Error('f07_market_explicit_rollback')}),/f07_market_explicit_rollback/)
      assert.ok(proposed?.spec_id);assert.deepEqual(await h.state(),before)
      assert.deepEqual(await api('bob',db=>call(db,'receipt',[prepared.intent.request_id])),{status:'not_recorded',request_id:prepared.intent.request_id})
      const receipt=await record(prepared);assert.notEqual(receipt.spec_id,proposed.spec_id);await assertCopy(prepared,receipt)
    })
    for(const stage of ['agent','history','count','audit','receipt'])await run('real copy transaction rolls every owned effect back after '+stage+' failure',async()=>{
      const prepared=await use(owned,{copyName:'F07 injected '+stage}),before=await h.state(),table={agent:'agent_specs',history:'agent_collaboration_revisions',count:'agent_template_market_publications',audit:'audit_events',receipt:'agent_template_market_receipts'}[stage]
      const predicate=stage==='agent'?"NEW.owner_user_id='"+f.users.bob+"'::uuid AND NEW.name='F07 injected "+stage+"'":stage==='history'?"NEW.owner_user_id='"+f.users.bob+"'::uuid AND NEW.note='Owner copied reviewed template'":stage==='count'?"NEW.id='"+owned.pin.template_id+"'::uuid AND NEW.use_count>OLD.use_count":stage==='audit'?"NEW.action='agent.template_market.use' AND NEW.metadata->>'request_id'='"+prepared.intent.request_id+"'":"NEW.request_id='"+prepared.intent.request_id+"'::uuid"
      let installed=false
      try{
        await commitAdmin(async db=>{await db.query("CREATE FUNCTION agentstudio.f07_market_fixture_abort() RETURNS trigger LANGUAGE plpgsql AS $abort$ BEGIN IF "+predicate+" THEN RAISE EXCEPTION 'f07_market_injected_rollback'; END IF; RETURN NEW; END $abort$");await db.query('REVOKE ALL ON FUNCTION agentstudio.f07_market_fixture_abort() FROM PUBLIC');await db.query('CREATE TRIGGER agent_template_market_fixture_abort AFTER '+(stage==='count'?'UPDATE':'INSERT')+' ON agentstudio.'+h.quote(table)+' FOR EACH ROW EXECUTE FUNCTION agentstudio.f07_market_fixture_abort()')});installed=true
        await h.negative()
        // The application auditor has refused this catalog. This explicit
        // original API primitive verifies rollback only, with no fake auditor.
        await assert.rejects(()=>api('bob',db=>call(db,'record',[prepared.intent]),{auditCatalog:false}),e=>e.code==='P0001'&&/f07_market_injected_rollback/.test(e.message))
        assert.deepEqual(await h.state(),before)
      }finally{if(installed)await commitAdmin(async db=>{await db.query('DROP TRIGGER agent_template_market_fixture_abort ON agentstudio.'+h.quote(table));await db.query('DROP FUNCTION agentstudio.f07_market_fixture_abort()')})}
      await h.positive();assert.deepEqual(await h.state(),before)
      const receipt=await record(prepared);await assertCopy(prepared,receipt)
    })
    await run('unpublish,own unlisted detail,republish and delete preserve frozen bytes and independent copies',async()=>{
      const staleCopy=await use(owned),unpublished=await lifecycle(owned,'unpublish')
      assert.equal(await api('bob',db=>call(db,'detail',[owned.pin.template_id])),null)
      await assert.rejects(()=>record(staleCopy),e=>e.code==='P0001'&&/agent_template_market_template_changed/.test(e.message))
      const ownDetail=await api('alice',db=>call(db,'detail',[owned.pin.template_id]));assert.equal(ownDetail.public,false);assert.deepEqual(ownDetail.spec,owned.preview.snapshot.spec)
      const ownHttp=await f.request('alice',h.httpBase+'/'+owned.pin.template_id),foreignHttp=await f.request('bob',h.httpBase+'/'+owned.pin.template_id)
      assert.equal(ownHttp.status,200);assert.equal(ownHttp.body.item.public,false);assert.deepEqual(ownHttp.body.snapshot,owned.preview.snapshot);assert.equal(foreignHttp.status,404)
      const sourceIdentity=await f.identityFor('alice'),{require_approval:_approval,...updated}=owned.agent.spec
      await f.agents.update(sourceIdentity,owned.agent.id,'F07 later changed source',h.contracts.safeAgentSpec({...updated,goal:'New source text must never replace published snapshot'}),owned.agent.revision)
      const republished=await lifecycle(owned,'republish'),detail=await api('bob',db=>call(db,'detail',[owned.pin.template_id]));assert.deepEqual(detail.spec,owned.preview.snapshot.spec)
      // Remove only this synthetic fixture source to exercise an absent source
      // condition, without claiming an employee deletion endpoint exists.
      await commitAdmin(db=>db.query('DELETE FROM agentstudio.agent_specs WHERE id=$1 AND owner_user_id=$2',[owned.agent.id,f.users.alice]))
      assert.equal(await f.agents.get(sourceIdentity,owned.agent.id),null)
      const detached=await api('bob',db=>call(db,'detail',[owned.pin.template_id]));assert.deepEqual(detached.spec,owned.preview.snapshot.spec)
      const beforeDeleteAgent=await f.agents.get(await f.identityFor('bob'),originalCopy.id),history=await admin(async db=>(await db.query('SELECT to_jsonb(r) AS row FROM agentstudio.agent_collaboration_revisions r WHERE spec_id=$1',[originalCopy.id])).rows)
      const deleted=await lifecycle(owned,'delete')
      const scrub=await admin(async db=>(await db.query('SELECT to_jsonb(p) AS publication,(SELECT count(*)::integer FROM agentstudio.agent_template_market_snapshots s WHERE s.template_id=p.id) AS bodies,(SELECT count(*)::integer FROM agentstudio.agent_template_market_tombstones t WHERE t.template_id=p.id AND t.revision=p.revision AND t.snapshot_sha256=p.snapshot_sha256) AS tombstones FROM agentstudio.agent_template_market_publications p WHERE id=$1',[owned.pin.template_id])).rows[0])
      assert.equal(scrub.publication.state,'deleted');assert.equal(scrub.bodies,0);assert.equal(scrub.tombstones,1)
      for(const key of ['name','description','category','source_spec_id','source_sha256'])assert.equal(scrub.publication[key],null)
      for(const who of ['alice','bob'])assert.equal(await api(who,db=>call(db,'detail',[owned.pin.template_id])),null)
      await assert.rejects(()=>lifecycle(owned,'republish'),e=>e.code==='P0001'&&/agent_template_market_unavailable/.test(e.message))
      assert.deepEqual(await f.agents.get(await f.identityFor('bob'),originalCopy.id),beforeDeleteAgent)
      assert.deepEqual(await admin(async db=>(await db.query('SELECT to_jsonb(r) AS row FROM agentstudio.agent_collaboration_revisions r WHERE spec_id=$1',[originalCopy.id])).rows),history)
      for(const {intent,receipt} of [unpublished,republished,deleted,{intent:owned.intent,receipt:owned.receipt}])assert.deepEqual(await api('alice',db=>call(db,'record',[intent])),receipt)
      assert.deepEqual(await record(originalUse),originalUseReceipt)
    })
    await run('editing the independent copied Agent cannot rewrite the original use receipt',async()=>{
      const identity=await f.identityFor('bob'),prior=await f.agents.get(identity,originalCopy.id),{require_approval:_approval,...spec}=prior.spec
      const changed=await f.agents.update(identity,prior.id,'F07 independent copy later edited',h.contracts.safeAgentSpec({...spec,goal:'F07 later private recipient edit'}),prior.revision);assert.ok(changed);assert.equal(changed.revision,2)
      const before=await h.state();assert.deepEqual(await record(originalUse),originalUseReceipt);assert.equal(originalUseReceipt.spec_revision,1);assert.deepEqual(await h.state(),before)
    })
    await run('actual receipt-first HTTP recovery returns original deleted outcomes with writes off and rejects changed intent',async()=>{
      const before=await h.state();f.mutable.writes=false
      try{
        const recovered=await f.request('bob',h.httpBase+'/requests/'+originalUse.intent.request_id);assert.equal(recovered.status,200);assert.deepEqual(recovered.body,{status:'recorded',receipt:originalUseReceipt})
        const repeated=await f.request('bob',h.httpBase+'/'+originalUse.intent.template.template_id+'/use',originalUse.intent);assert.equal(repeated.status,200);assert.deepEqual(repeated.body,originalUseReceipt)
        const changed=await f.request('bob',h.httpBase+'/'+originalUse.intent.template.template_id+'/use',{...originalUse.intent,copy_name:'F07 changed old intent'});assert.equal(changed.status,409)
        const freshId=crypto.randomUUID(),fresh=await f.request('bob',h.httpBase+'/'+originalUse.intent.template.template_id+'/use',{...originalUse.intent,request_id:freshId});assert.equal(fresh.status,409);assert.equal(fresh.body.error,'agent_template_market_writes_disabled')
        const unknown=await f.request('bob',h.httpBase+'/requests/'+freshId);assert.equal(unknown.status,200);assert.deepEqual(unknown.body,{status:'not_recorded',request_id:freshId})
      }finally{f.mutable.writes=true}
      assert.deepEqual(await h.state(),before)
    })
    const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:()=>resolve()}}
    const bounded=async(promise,ms=10000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('f07_market_database_barrier_timeout')),ms)})])}finally{clearTimeout(timer)}}
    const contend=async(first,second,key,seed)=>{
      const firstReady=deferred(),secondReady=deferred(),commit=deferred();let pid1,pid2,work1,work2,observed
      const start=async(prepared,firstClient)=>api(prepared.who,async db=>{
        if(firstClient){pid1=db.processID;const value=await call(db,'record',[prepared.intent]);firstReady.resolve();await commit.promise;return value}
        pid2=db.processID;secondReady.resolve();return call(db,'record',[prepared.intent])
      })
      try{
        work1=start(first,true);void work1.catch(()=>{})
        await bounded(Promise.race([firstReady.promise,work1.then(()=>{throw Error('first transaction ended before barrier')})]))
        work2=start(second,false);void work2.catch(()=>{})
        await bounded(Promise.race([secondReady.promise,work2.then(()=>{throw Error('second transaction ended before barrier')})]))
        const deadline=Date.now()+5000
        do{
          observed=await admin(async db=>(await db.query("WITH k AS(SELECT hashtextextended($3::text,$4::bigint) AS n) SELECT pg_blocking_pids($2::integer) AS blockers,EXISTS(SELECT 1 FROM pg_catalog.pg_locks l CROSS JOIN k WHERE l.pid=$1 AND l.locktype='advisory' AND l.granted AND l.objsubid=1 AND l.classid::bigint=((k.n>>32)&4294967295) AND l.objid::bigint=(k.n&4294967295)) AS held,EXISTS(SELECT 1 FROM pg_catalog.pg_locks l CROSS JOIN k WHERE l.pid=$2 AND l.locktype='advisory' AND NOT l.granted AND l.objsubid=1 AND l.classid::bigint=((k.n>>32)&4294967295) AND l.objid::bigint=(k.n&4294967295)) AS waiting",[pid1,pid2,key,seed])).rows[0])
          if(observed.held&&observed.waiting&&observed.blockers.includes(pid1))break
          await new Promise(resolve=>setTimeout(resolve,25))
        }while(Date.now()<deadline)
        assert.ok(observed.held&&observed.waiting&&observed.blockers.includes(pid1),'real pg_locks and pg_blocking_pids must prove the expected contention')
        assert.notEqual(pid1,pid2);commit.resolve()
        const results=await bounded(Promise.allSettled([work1,work2]));return {results,observed,pid1,pid2}
      }finally{
        commit.resolve()
        const pending=[work1,work2].filter(Boolean);if(pending.length)await bounded(Promise.allSettled(pending),20000)
      }
    }
    await run('real two-client same request waits on631 and commits one original copy only',async()=>{
      const p=await publish(),u=await use(p),before=await h.state()
      const race=await contend(u,u,f.users.bob+':request:'+u.intent.request_id,631)
      for(const item of race.results)assert.equal(item.status,'fulfilled')
      const [first,second]=race.results.map(item=>item.value);assert.deepEqual(first,second);await assertCopy(u,first)
      const after=await h.state();assert.equal(after.agents.length,before.agents.length+1);assert.equal(after.receipts.length,before.receipts.length+1);assert.equal(after.history.length,before.history.length+1);assert.equal(after.audits.length,before.audits.length+1)
    })
    await run('real distinct copy requests wait on630 and both retain the same visibility revision',async()=>{
      const p=await publish(),first=await use(p,{copyName:'F07 concurrent first'}),second=await use(p,{copyName:'F07 concurrent second'})
      const race=await contend(first,second,'template:'+p.pin.template_id,630)
      for(const item of race.results)assert.equal(item.status,'fulfilled')
      const [a,b]=race.results.map(item=>item.value);assert.notEqual(a.spec_id,b.spec_id);assert.equal(a.revision,p.pin.revision);assert.equal(b.revision,p.pin.revision);assert.equal(a.use_count,1);assert.equal(b.use_count,2)
      await assertCopy(first,a);await assertCopy(second,b)
      const detail=await api('bob',db=>call(db,'detail',[p.pin.template_id]));assert.equal(detail.use_count,2);assert.equal(detail.revision,p.pin.revision)
    })
    for(const action of ['unpublish','delete'])await run('real '+action+' commit excludes a blocked stale copy with no partial effect',async()=>{
      const p=await publish(),copy=await use(p),change={who:'alice',intent:contract.parseAgentTemplateMarketLifecycleIntent({action,request_id:crypto.randomUUID(),template:p.pin,confirm:true})},before=await h.state()
      const race=await contend(change,copy,'template:'+p.pin.template_id,630)
      assert.equal(race.results[0].status,'fulfilled');assert.equal(race.results[1].status,'rejected');assert.equal(race.results[1].reason.code,'P0001');assert.match(race.results[1].reason.message,/agent_template_market_(template_changed|unavailable)/)
      const after=await h.state();assert.equal(after.agents.length,before.agents.length);assert.equal(after.history.length,before.history.length);assert.equal(after.receipts.length,before.receipts.length+1);assert.equal(after.audits.length,before.audits.length+1)
      assert.deepEqual(await api('bob',db=>call(db,'receipt',[copy.intent.request_id])),{status:'not_recorded',request_id:copy.intent.request_id})
    })
    for(const action of ['unpublish','delete'])await run('a real copy committing before blocked '+action+' keeps its independent Agent and original receipt',async()=>{
      const p=await publish(),copy=await use(p),change={who:'alice',intent:contract.parseAgentTemplateMarketLifecycleIntent({action,request_id:crypto.randomUUID(),template:p.pin,confirm:true})}
      const race=await contend(copy,change,'template:'+p.pin.template_id,630)
      for(const item of race.results)assert.equal(item.status,'fulfilled')
      const [receipt,changed]=race.results.map(item=>item.value);assert.equal(changed.operation,action);assert.equal(changed.revision,p.pin.revision+1);await assertCopy(copy,receipt)
      assert.deepEqual(await api('bob',db=>call(db,'receipt',[copy.intent.request_id])),{status:'recorded',receipt})
      const publication=await admin(async db=>(await db.query('SELECT state,use_count::integer AS uses FROM agentstudio.agent_template_market_publications WHERE id=$1',[p.pin.template_id])).rows[0]);assert.equal(publication.state,action==='delete'?'deleted':'unlisted');assert.equal(publication.uses,1)
    })
    await run('real concurrent lifecycle actions compare the same original revision after waiting on630',async()=>{
      const p=await publish(),change=action=>({who:'alice',intent:contract.parseAgentTemplateMarketLifecycleIntent({action,request_id:crypto.randomUUID(),template:p.pin,confirm:true})}),first=change('unpublish'),second=change('delete')
      const race=await contend(first,second,'template:'+p.pin.template_id,630)
      assert.equal(race.results[0].status,'fulfilled');assert.equal(race.results[1].status,'rejected');assert.equal(race.results[1].reason.code,'P0001');assert.match(race.results[1].reason.message,/agent_template_market_template_changed/)
      assert.deepEqual(await api('alice',db=>call(db,'receipt',[second.intent.request_id])),{status:'not_recorded',request_id:second.intent.request_id})
      const detail=await api('alice',db=>call(db,'detail',[p.pin.template_id]));assert.equal(detail.revision,p.pin.revision+1);assert.equal(detail.public,false)
    })
    await run('actual source row ABA cannot reuse a previous publication proof even with unchanged revision and values',async()=>{
      const agent=await makeSource(),old=await selected('alice',agent.id),choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:old.source,name:'F07 ABA public name',description:'F07 ABA reviewed summary',category:'research'})
      await commitAdmin(db=>db.query('UPDATE agentstudio.agent_specs SET name=$2 WHERE id=$1',[agent.id,'F07 temporary source ABA value']))
      await commitAdmin(db=>db.query('UPDATE agentstudio.agent_specs SET name=$2 WHERE id=$1',[agent.id,agent.name]))
      const current=await selected('alice',agent.id);assert.equal(current.source.revision,old.source.revision);assert.equal(current.name,old.name);assert.deepEqual(current.snapshot,old.snapshot);assert.notEqual(current.source.source_sha256,old.source.source_sha256)
      await refuseStalePublish('alice',choice,old.snapshot)
    })
    await run('actual model ciphertext row ABA invalidates the opaque proof without exposing ciphertext',async()=>{
      const agent=await makeSource(),old=await selected('alice',agent.id),connection=f.resources.alice.binding.connection_id
      const {encryptModelSecret}=await import('../../src/model-connection-crypto.ts'),replacement=encryptModelSecret('F07-synthetic-replacement-never-dispatched',f.key)
      const saved=await admin(async db=>(await db.query('SELECT api_key_ciphertext,api_key_nonce,api_key_tag,api_key_tail,to_jsonb(updated_at) AS stamp FROM agentstudio.model_connections WHERE id=$1',[connection])).rows[0]);assert.ok(saved)
      try{await commitAdmin(db=>db.query("UPDATE agentstudio.model_connections SET api_key_ciphertext=$2,api_key_nonce=$3,api_key_tag=$4,api_key_tail='ched',updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[connection,replacement.ciphertext,replacement.nonce,replacement.tag]))}
      finally{await commitAdmin(db=>db.query('UPDATE agentstudio.model_connections SET api_key_ciphertext=$2,api_key_nonce=$3,api_key_tag=$4,api_key_tail=$5,updated_at=$6::timestamptz WHERE id=$1',[connection,saved.api_key_ciphertext,saved.api_key_nonce,saved.api_key_tag,saved.api_key_tail,saved.stamp]))}
      const current=await selected('alice',agent.id);assert.deepEqual(current.snapshot,old.snapshot);assert.notEqual(current.source.source_sha256,old.source.source_sha256)
      const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:old.source,name:'',description:'Reviewed resource ABA summary',category:'other'})
      await refuseStalePublish('alice',choice,old.snapshot)
      assert.equal(JSON.stringify(current).includes(saved.api_key_ciphertext.toString('hex')),false)
    })
    await run('an actual owned HTTP header ciphertext ABA cannot reuse the previous publication proof',async()=>{
      const {ToolConnectionRepository}=await import('../../src/tool-connection-repository.ts'),{encryptModelSecret}=await import('../../src/model-connection-crypto.ts')
      const identity=await f.identityFor('alice'),tools=new ToolConnectionRepository(f.pool,f.key)
      const tool=await tools.create(identity,{name:'F07 actual header ABA',description:'Synthetic owned connection',url:'https://example.com/f07-fixture',method:'GET',headers:[{key:'X-F07-Private',value:'F07_PRIVATE_HEADER_NEVER_PUBLIC'}],body_template:'',timeout_s:5,enabled:true})
      const spec=h.contracts.safeAgentSpec({...baseSpec,tools:[...baseSpec.tools,'http_f07_db'],http_tools:[{name:'http_f07_db',description:'Private HTTP advice',connection_id:tool.id,connection_revision:tool.revision}]})
      const agent=await f.agents.create(identity,'F07 HTTP ABA source',spec),old=await selected('alice',agent.id)
      assert.equal(old.removed.http_tools,1);assert.equal(JSON.stringify(old.snapshot).includes(tool.id),false);assert.equal(JSON.stringify(old.snapshot).includes('F07_PRIVATE_HEADER_NEVER_PUBLIC'),false)
      const saved=await admin(async db=>(await db.query('SELECT id,value_ciphertext,value_nonce,value_tag,to_jsonb(updated_at) AS stamp FROM agentstudio.tool_connection_headers WHERE tool_connection_id=$1 AND owner_user_id=$2 ORDER BY id',[tool.id,f.users.alice])).rows[0]);assert.ok(saved)
      const replacement=encryptModelSecret(JSON.stringify({value:'F07_PRIVATE_REPLACEMENT_NEVER_PUBLIC'}),f.key)
      try{await commitAdmin(db=>db.query("UPDATE agentstudio.tool_connection_headers SET value_ciphertext=$2,value_nonce=$3,value_tag=$4,updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[saved.id,replacement.ciphertext,replacement.nonce,replacement.tag]))}
      finally{await commitAdmin(db=>db.query('UPDATE agentstudio.tool_connection_headers SET value_ciphertext=$2,value_nonce=$3,value_tag=$4,updated_at=$5::timestamptz WHERE id=$1',[saved.id,saved.value_ciphertext,saved.value_nonce,saved.value_tag,saved.stamp]))}
      const current=await selected('alice',agent.id);assert.deepEqual(current.snapshot,old.snapshot);assert.notEqual(current.source.source_sha256,old.source.source_sha256)
      const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:old.source,name:'',description:'Reviewed HTTP source',category:'other'})
      await refuseStalePublish('alice',choice,old.snapshot)
    })
    await run('owned MCP metadata fixture uses the actual Unicode/numeric catalog hash and detects header ABA',async()=>{
      const {McpConnectionRepository}=await import('../../src/mcp-connection-repository.ts'),catalog=await import('../../src/mcp-catalog.ts'),identity=await f.identityFor('alice')
      const repo=new McpConnectionRepository(f.pool,f.key),connection=await repo.create(identity,{name:'F07 owned MCP metadata fixture',description:'Synthetic metadata only; no discovery or external call',url:'https://example.com/f07-database-fixture',enabled:true,headers:[{key:'X-Fixture-Static',value:'F07_PRIVATE_MCP_HEADER_NEVER_PUBLIC'}]})
      const schema={type:'object',properties:{'2':{type:'integer',minimum:0},'10':{type:'number',minimum:1e-7,maximum:1e21},'😀':{type:'string'},'\ue000':{type:'string'},header:{type:'string','x-mcp-header':'X-Fixture-Dynamic'}},additionalProperties:false}
      const value=catalog.parseMcpCatalog({version:'2026-07-28',tools:[{name:'fixture_lookup',description:'Synthetic 😀 metadata',input_schema:schema,read_only:true,destructive:false,requires_tasks:false}]}),hash=crypto.createHash('sha256').update(catalog.canonicalMcpJson(value)).digest('hex')
      // The same explicit synthetic stored-catalog pattern used by the existing
      // genuine F01 SQL suite. It proves F07 source/value checks, never an MCP
      // discovery/network positive. The hash is from the actual Node validator.
      await commitAdmin(db=>db.query("UPDATE agentstudio.mcp_connections SET status='ok',catalog=$2::jsonb WHERE id=$1 AND owner_user_id=$3",[connection.id,JSON.stringify(value),f.users.alice]))
      const sqlHash=await admin(async db=>(await db.query('SELECT agentstudio.agent_design_digest($1::jsonb) AS sha',[JSON.stringify(value)])).rows[0].sha);assert.equal(sqlHash,hash)
      const spec=h.contracts.safeAgentSpec({...baseSpec,tools:[...baseSpec.tools,'mcp_f07_db'],mcp_tools:[{name:'mcp_f07_db',connection_id:connection.id,connection_revision:connection.revision,tool_name:'fixture_lookup',catalog_sha256:hash}]})
      const agent=await f.agents.create(identity,'F07 actual owned MCP source',spec),old=await selected('alice',agent.id)
      assert.equal(old.removed.mcp_tools,1);assert.equal(JSON.stringify(old.snapshot).includes(connection.id),false);assert.equal(JSON.stringify(old.snapshot).includes('F07_PRIVATE_MCP_HEADER_NEVER_PUBLIC'),false)
      assert.deepEqual(old.snapshot,result.deriveAgentTemplateMarketSnapshot(agent.spec).snapshot)
      const saved=await admin(async db=>(await db.query('SELECT id,to_jsonb(updated_at) AS stamp FROM agentstudio.mcp_connection_headers WHERE mcp_connection_id=$1 AND owner_user_id=$2 ORDER BY id',[connection.id,f.users.alice])).rows[0]);assert.ok(saved)
      try{await commitAdmin(db=>db.query("UPDATE agentstudio.mcp_connection_headers SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[saved.id]))}
      finally{await commitAdmin(db=>db.query('UPDATE agentstudio.mcp_connection_headers SET updated_at=$2::timestamptz WHERE id=$1',[saved.id,saved.stamp]))}
      const current=await selected('alice',agent.id);assert.deepEqual(current.snapshot,old.snapshot);assert.notEqual(current.source.source_sha256,old.source.source_sha256)
      const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:old.source,name:'',description:'Reviewed MCP metadata fixture',category:'other'})
      await refuseStalePublish('alice',choice,old.snapshot)
    })
    await run('actual KB access revoke and regrant invalidates an old source proof while the safe snapshot stays identical',async()=>{
      const {KnowledgeBaseRepository}=await import('../../src/knowledge-repository.ts'),{KnowledgeAccessRepository}=await import('../../src/knowledge-access-repository.ts')
      const alice=await f.identityFor('alice'),bob=await f.identityFor('bob'),bases=new KnowledgeBaseRepository(f.pool),base=await bases.create(alice,'F07 actual shared KB','Private fixture metadata')
      await bases.createTextDocument(alice,base.id,{filename:'f07-private-source.txt',text:'F07_PRIVATE_KB_BODY_NEVER_PUBLIC'})
      const access=new KnowledgeAccessRepository(f.pool,(identity,email)=>f.auth.resolveKnowledgeRecipient(identity,email))
      const granted=await access.change(alice,base.id,{action:'grant',request_id:crypto.randomUUID(),expected_revision:0,recipient_email:f.credentials.bob.email,role:'viewer',semantic_allowed:false})
      const agent=await f.agents.create(bob,'F07 Bob shared KB source',h.contracts.safeAgentSpec({...baseSpec,knowledge_base_ids:[base.id]})),old=await selected('bob',agent.id)
      assert.equal(old.removed.knowledge_bases,1);assert.deepEqual(old.snapshot.spec.knowledge_base_ids,[]);assert.equal(JSON.stringify(old.snapshot).includes('F07_PRIVATE_KB_BODY_NEVER_PUBLIC'),false)
      const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:old.source,name:'',description:'Reviewed shared KB source',category:'knowledge'})
      const revoked=await access.change(alice,base.id,{action:'revoke',request_id:crypto.randomUUID(),expected_revision:granted.item.revision,recipient_id:f.users.bob})
      await assert.rejects(()=>selected('bob',agent.id),e=>e.code==='P0001'&&/agent_template_market_source_resource_changed/.test(e.message))
      await access.change(alice,base.id,{action:'grant',request_id:crypto.randomUUID(),expected_revision:revoked.item.revision,recipient_email:f.credentials.bob.email,role:'viewer',semantic_allowed:false})
      const current=await selected('bob',agent.id);assert.deepEqual(current.snapshot,old.snapshot);assert.notEqual(current.source.source_sha256,old.source.source_sha256)
      await refuseStalePublish('bob',choice,old.snapshot)
    })
    await run('actual Native disable and enable changes governance epoch and invalidates an old source proof',async()=>{
      const agent=await makeSource('bob'),old=await selected('bob',agent.id)
      await f.governance('bob',false)
      const denied=await f.request('bob',h.httpBase+'/sources/'+agent.id);assert.ok([401,403].includes(denied.status))
      await f.governance('bob',true);await f.login('bob')
      const current=await selected('bob',agent.id);assert.deepEqual(current.snapshot,old.snapshot);assert.notEqual(current.source.source_sha256,old.source.source_sha256)
      const choice=contract.parseAgentTemplateMarketPublishChoice({action:'preview_publish',source:old.source,name:'',description:'Reviewed Native source',category:'other'})
      await refuseStalePublish('bob',choice,old.snapshot)
    })
    await run('all market metadata operations leave actual dispatch,request,reservation,run and effect observations unchanged',async()=>{
      await f.assertNoModelEffects();const after=await f.counts()
      for(const key of ['design_requests','design_reservations','review_requests','runs','old_effects'])assert.equal(after[key],beforeEffects[key])
    })
  }finally{await h.close()}
}
