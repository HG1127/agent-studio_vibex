// Test-only. Top-level import is the existing PURE disposable-target guard.
// No driver, Pool, SQL, source/secret read or socket before the live guard.
import {requireEphemeralPg18Ci} from '../../src/pg18-ephemeral-ci-guard.mjs'

export function validateAgentDesignDatabaseCiContext(env,platform,uid){
  if(platform!=='linux'||!Number.isSafeInteger(uid)||uid<=0||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!=='Agent Studio F01 Agent Design genuine PG18 isolated verification'||env.GITHUB_JOB!=='pg18-agent-design-genuine'||env.AGENT_STUDIO_F01_GENUINE_CI!=='YES_DISPOSABLE_F01_ONLY'||Object.keys(env).some(k=>env[k]!==undefined&&['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'].includes(k)))throw Error('refuse_non_ephemeral_agent_design_database_ci')
  return requireEphemeralPg18Ci(env)
}
export function requireAgentDesignDatabaseCi(env=process.env){return validateAgentDesignDatabaseCiContext(env,process.platform,process.getuid?.()??0)}
export async function createAgentDesignDatabaseFixture(env=process.env){
  requireAgentDesignDatabaseCi(env)
  const {agentDesignGenuineFixture}=await import('./agent-design-genuine-fixture.mjs')
  return agentDesignGenuineFixture(env)
}

const tables=['requests','inputs','jobs','reservations','outcomes','outputs','controls','tombstones','save_receipts'].map(x=>'agent_design_'+x)
const roles={worker:'agentstudio_design_worker',dispatch:'agentstudio_design_dispatch'}
const logins={api:'synthetic_assessment_api',worker:'synthetic_design_worker',dispatch:'synthetic_design_dispatch',oldWorker:'synthetic_assessment_worker',oldDispatch:'synthetic_assessment_dispatch',secret:'synthetic_assessment_secret'}
const signatures={owner_state:'',receipt:'uuid',record:'jsonb,jsonb',claim:'uuid',context:'uuid,uuid,bigint,uuid',reserve:'uuid,uuid,bigint,uuid',finish:'uuid,uuid,bigint,uuid,jsonb',pause:'uuid,uuid,bigint,uuid',control_receipt:'uuid',control:'jsonb',read_result:'uuid',save_receipt:'uuid',save_record:'jsonb,jsonb'}

async function harness(f,env){
  const target=requireAgentDesignDatabaseCi(env)
  const [a,crypto,pgModule,repository,source,contract,result,catalog,mcp,contracts,activation]=await Promise.all([
    import('node:assert/strict'),import('node:crypto'),import('pg'),import('../../src/repository.ts'),import('../../src/agent-design-source.ts'),import('../../src/agent-design-contract.ts'),import('../../src/agent-design-result.ts'),import('../../src/mcp-catalog.ts'),import('../../src/mcp-connection-repository.ts'),import('../../src/contracts.ts'),import('../../src/native-activation-cli.mjs')])
  const assert=a.default,pg=pgModule.default,pools=[],legacy='f01_design_db_legacy_api_worker'
  const quote=name=>{assert.match(name,/^[a-z_][a-z_0-9]*$/);return '"'+name+'"'}
  const mustClient=async(db,login,role,superuser=false)=>{
    assert.ok(db instanceof pg.Client,'actual original node-postgres Client required')
    assert.equal(db.connectionParameters.host,'127.0.0.1');assert.equal(Number(db.connectionParameters.port),5432);assert.equal(db.connectionParameters.database,'agentstudio_pg18_ci')
    assert.equal(db.connection.stream.remoteAddress,'127.0.0.1');assert.equal(db.connection.stream.remotePort,5432)
    const row=(await db.query("SELECT session_user AS login,current_user AS role,pg_backend_pid() AS pid,current_database() AS db,current_setting('server_version_num')::integer AS version,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=session_user) AS superuser")).rows[0]
    assert.equal(row.login,login);assert.equal(row.role,role);assert.equal(row.pid,db.processID);assert.equal(row.db,target.database);assert.equal(row.superuser,superuser);assert.ok(row.version>=180000&&row.version<190000)
    return row
  }
  const admin=async body=>{const db=await f.adminPool.connect();try{await mustClient(db,target.user,target.user,true);return await body(db)}finally{db.release()}}
  const api=async(who,body,{audit=true}={})=>{
    // identity comes from the fixture's actual verified Native Cookie session,
    // not f.identities, an owner header or a caller supplied user ID.
    const identity=await f.identityFor(who)
    return repository.withActor(f.pool,identity,async(db,owner)=>{
      await mustClient(db,logins.api,'agentstudio_api');assert.equal(owner,f.users[who]);if(audit)assert.equal(await f.audit(db),true)
      await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='15s'")
      return body(db,owner,identity)
    })
  }
  const asRole=async(pool,login,role,body,{readOnly=false,audit=false}={})=>{
    const db=await pool.connect();let begun=false
    try{
      await mustClient(db,login,login);await db.query(readOnly?'BEGIN READ ONLY':'BEGIN');begun=true
      await db.query('SET LOCAL ROLE '+quote(role));await mustClient(db,login,role)
      await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='15s'")
      if(audit)assert.equal(await f.audit(db),true)
      const value=await body(db);await db.query('COMMIT');begun=false;return value
    }finally{try{if(begun)await db.query('ROLLBACK')}finally{db.release()}}
  }
  const selectedRole=(kind,body,options)=>asRole(kind==='worker'?f.workerPool:f.dispatchPool,logins[kind],roles[kind],body,options)
  const call=async(db,name,args=[])=>{
    assert.ok(Object.hasOwn(signatures,name));const casts=signatures[name]?signatures[name].split(','):[];assert.equal(args.length,casts.length)
    return (await db.query('SELECT agentstudio.agent_design_'+name+'('+casts.map((t,i)=>'$'+(i+1)+'::'+t).join(',')+') AS value',args.map((v,i)=>casts[i]==='jsonb'?JSON.stringify(v):v))).rows[0].value
  }
  const proofArgs=p=>[p.request_id,p.lease_token,p.lease_version,p.worker_id]
  const finishSql=async(p,normalizedResult=f.output(p.who))=>{
    const proof=await selectedRole('worker',db=>call(db,'claim',[crypto.randomUUID()]),{audit:true});assert.ok(proof);assert.equal(proof.request_id,p.request_id)
    const context=await selectedRole('dispatch',db=>call(db,'context',proofArgs(proof)),{audit:true})
    const reservation=await selectedRole('dispatch',db=>call(db,'reserve',proofArgs(proof)),{audit:true});assert.equal(reservation.state,'reserved')
    const completion={status:'succeeded',result:normalizedResult},reply=await selectedRole('dispatch',db=>call(db,'finish',[...proofArgs(proof),completion]),{audit:true})
    assert.equal(reply.state,'succeeded')
    // A real SQL completion primitive with synthetic full7 data. This does NOT
    // assert a provider or Worker/mTLS positive; UI suite owns that evidence.
    return {proof,context,reservation,completion,reply}
  }
  const create=async(purpose='generate',options={})=>{const p=await f.createDesign('alice',purpose,options);await f.submit(p);return p}
  const plainIntent=v=>{const {request_sha256:_hash,...raw}=v;return raw}
  const actualPrepared=async p=>api('alice',(db,owner,identity)=>new source.AgentDesignSourceRepository(f.pool,f.audit).prepareOnClient(identity,db,owner,p.choice))
  const snapshot=()=>admin(async db=>{
    const value=(await db.query(`SELECT jsonb_build_object(
      'versions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY version) FROM agentstudio.schema_migrations s),
      'tables',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relreplident,
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM (SELECT attnum,attname,atttypid,atttypmod,attnotnull,attidentity,attgenerated,attcollation,attstorage,attcompression FROM pg_catalog.pg_attribute WHERE attrelid=c.oid AND attnum>0) a),
        (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grantee,g.privilege_type,g.is_grantable) FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) g)) ORDER BY c.relname) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio' AND c.relname=ANY($1::text[])),
      'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid,false),k.convalidated,k.conenforced,k.condeferrable,k.condeferred,k.connoinherit) ORDER BY c.relname,k.conname) FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid WHERE c.relnamespace='agentstudio'::regnamespace AND c.relname=ANY($1::text[])),
      'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,oidvectortypes(p.proargtypes),pg_get_functiondef(p.oid),p.proowner,
        (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.grantee,g.privilege_type,g.is_grantable) FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) g)) ORDER BY n.nspname,p.proname,oidvectortypes(p.proargtypes)) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE starts_with(p.proname,'agent_design_') OR starts_with(p.proname,'f01_design_db_')),
      'roles',(SELECT jsonb_agg(jsonb_build_array(r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolconnlimit,r.rolconfig,r.rolvaliduntil) ORDER BY r.rolname) FROM pg_catalog.pg_roles r WHERE starts_with(r.rolname,'agentstudio_design_') OR starts_with(r.rolname,'synthetic_design_') OR starts_with(r.rolname,'f01_design_db_')),
      'members',(SELECT jsonb_agg(jsonb_build_array(a.rolname,b.rolname,m.admin_option,m.inherit_option,m.set_option,g.rolname) ORDER BY a.rolname,b.rolname,g.rolname) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles a ON a.oid=m.roleid JOIN pg_catalog.pg_roles b ON b.oid=m.member JOIN pg_catalog.pg_roles g ON g.oid=m.grantor WHERE starts_with(a.rolname,'agentstudio_design_') OR starts_with(b.rolname,'synthetic_design_') OR starts_with(b.rolname,'f01_design_db_')),
      'triggers',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,p.proname,t.tgtype,t.tgenabled,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,CASE WHEN k.oid IS NOT NULL THEN pg_get_constraintdef(k.oid,false) END) ORDER BY n.nspname,c.relname,p.proname,t.tgtype,coalesce(pg_get_constraintdef(k.oid,false),'')) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint WHERE n.nspname='agentstudio' AND (c.relname=ANY($1::text[]) OR starts_with(t.tgname,'f01_design_db_') OR starts_with(t.tgname,'agent_design_'))),
      'types',(SELECT jsonb_agg(jsonb_build_array(n.nspname,y.typname,y.typtype,y.typowner,y.typnotnull,y.typdefault) ORDER BY n.nspname,y.typname) FROM pg_catalog.pg_type y JOIN pg_catalog.pg_namespace n ON n.oid=y.typnamespace WHERE starts_with(y.typname,'agent_design_') OR starts_with(y.typname,'_agent_design_')),
      'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY c.relname) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE starts_with(c.relname,'agent_design_')),
      'policies',(SELECT jsonb_agg(jsonb_build_array(p.polname,c.relname,p.polcmd,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='agentstudio'::regnamespace AND c.relname=ANY($1::text[])),
      'defaults',(SELECT jsonb_agg(jsonb_build_array(r.rolname,n.nspname,d.defaclobjtype,d.defaclacl) ORDER BY r.rolname,n.nspname,d.defaclobjtype) FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace WHERE starts_with(r.rolname,'agentstudio_design_')),
      'schemas',(SELECT jsonb_agg(jsonb_build_array(n.nspname,n.nspowner,n.nspacl) ORDER BY n.nspname) FROM pg_catalog.pg_namespace n WHERE starts_with(n.nspname,'f01_design_db_'))
    ) AS value`,[tables])).rows[0].value
    return crypto.createHash('sha256').update(catalog.canonicalMcpJson(value)).digest('hex')
  })
  const auditPositive=()=>api('alice',async db=>assert.equal(await f.audit(db),true),{audit:false})
  const auditNegative=()=>api('alice',async db=>assert.rejects(()=>f.audit(db),/unsafe_agent_design_privileges/),{audit:false})
  const commitAdmin=async body=>admin(async db=>{let begun=false;try{await db.query('BEGIN');begun=true;await body(db);await db.query('COMMIT');begun=false}finally{if(begun)await db.query('ROLLBACK')}})
  const tamper=async(name,apply,restore,{fingerprint=true}={})=>{
    await auditPositive();const before=fingerprint?await snapshot():null;let applied=false,primary
    try{await commitAdmin(apply);applied=true;await auditNegative()}
    catch(error){primary=error;throw error}
    finally{if(applied){try{await commitAdmin(restore);await auditPositive();if(fingerprint)assert.equal(await snapshot(),before,name+' logical catalog restored exactly')}catch(error){throw new AggregateError([...(primary?[primary]:[]),error],name+' exact restoration failed')}}}
  }
  const routine=async name=>admin(async db=>(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS def',[name])).rows[0].def)
  const ownState=specId=>admin(async db=>(await db.query(`SELECT jsonb_build_object('agent',(SELECT to_jsonb(s) FROM agentstudio.agent_specs s WHERE id=$1),'history',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM agentstudio.agent_collaboration_revisions r WHERE r.spec_id=$1),'saves',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.save_request_id),'[]'::jsonb) FROM agentstudio.agent_design_save_receipts r WHERE r.spec_id=$1),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM agentstudio.audit_events r WHERE r.target_id=$1::text OR r.metadata->>'spec_id'=$1::text)) AS value`,[specId])).rows[0].value)
  const createLegacy=async()=>{
    const password=crypto.randomBytes(40).toString('hex'),verifier=activation.makeNativeScramVerifier(password)
    await commitAdmin(async db=>{await db.query('CREATE ROLE '+quote(legacy)+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+verifier+"'");await db.query('GRANT agentstudio_api,agentstudio_worker TO '+quote(legacy)+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')})
    const pool=new pg.Pool({...target,user:legacy,password,max:1});pool.on('error',()=>{});pools.push(pool);return pool
  }
  const oldPool=kind=>{const login=logins[kind],password=crypto.createHash('sha512').update(target.password+':assessment:'+login).digest('hex').slice(0,80),pool=new pg.Pool({...target,user:login,password,max:1});pool.on('error',()=>{});pools.push(pool);return pool}
  const settle=async()=>{for(const pool of pools)await pool.end();if(pools.some(p=>!p.ended))throw Error('database_test_owned_pool_not_closed');await commitAdmin(async db=>{if((await db.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1',[legacy])).rowCount)await db.query('DROP ROLE '+quote(legacy))})}
  return {assert,crypto,pg,repository,source,contract,result,catalog,mcp,contracts,admin,api,asRole,selectedRole,call,proofArgs,finishSql,create,plainIntent,actualPrepared,snapshot,auditPositive,auditNegative,commitAdmin,tamper,routine,ownState,createLegacy,oldPool,quote,settle,mustClient}
}

// Root/UI may call this with their existing actual fixture immediately after
// bootstrap and before the UI flow. No new initializer or fake metadata path.
export async function runAgentDesignDatabaseSuite(t,f,env=process.env){
  requireAgentDesignDatabaseCi(env)
  const h=await harness(f,env)
  const {assert,crypto,contract,result,catalog,admin,api,asRole,selectedRole,call,proofArgs,create,finishSql,plainIntent,actualPrepared,tamper,commitAdmin,routine}=h
  assert.equal((await f.counts()).requests,0,'database suite must run before UI business flow or on its own fresh fixture')
  const noProviderBefore=f.providerRequests.length,noKeysBefore=f.credentialReads()
  // node:test records a failed child without rejecting its returned promise.
  // Stop the mutation sequence after that child, and still run owned cleanup.
  const runCase=async(name,body)=>{
    let completed=false,caseError
    await t.test(name,async context=>{try{await body(context);completed=true}catch(error){caseError=error;throw error}})
    if(!completed)throw caseError??Error('agent_design_database_child_did_not_complete:'+name)
  }
  let failure
  try{
    await h.auditPositive() // fail before any mutation if installed baseline is unsafe
    await runCase('installed062 audit succeeds only on original independently authenticated API/worker/dispatch clients',async()=>{
      await h.auditPositive()
      for(const kind of ['worker','dispatch'])await selectedRole(kind,async db=>{
        assert.equal(await f.audit(db),true)
        const row=(await db.query('SELECT current_user AS role,session_user AS login')).rows[0]
        assert.deepEqual(row,{role:roles[kind],login:logins[kind]})
      },{readOnly:true})
      const stamp=await admin(async db=>(await db.query("SELECT version FROM agentstudio.schema_migrations WHERE version IN('pg_v9_061','pg_v9_062') ORDER BY version")).rows)
      assert.deepEqual(stamp.map(r=>r.version),['pg_v9_061','pg_v9_062'])
    })
    await runCase('reapplying the actual062 source refuses without changing installed objects, versions or data',async()=>{
      const before=await h.snapshot(),counts=await f.counts()
      await admin(async db=>{
        try{await assert.rejects(()=>db.query(f.sql('migrations/pg_v9_062_agent_design.sql')),e=>e.code==='P0001'&&/agent_design_installation_refused/.test(e.message))}
        finally{await db.query('ROLLBACK')}
      })
      assert.equal(await h.snapshot(),before);assert.deepEqual(await f.counts(),counts);await h.auditPositive()
    })
    for(const version of ['pg_v9_062','pg_v9_061'])await runCase('missing '+version+' is a partial-family refusal and restores exact original stamp',async()=>{
      const saved=await admin(async db=>(await db.query('SELECT to_jsonb(s) AS row FROM agentstudio.schema_migrations s WHERE version=$1',[version])).rows[0].row)
      await tamper('stamp '+version,db=>db.query('DELETE FROM agentstudio.schema_migrations WHERE version=$1',[version]),db=>db.query('INSERT INTO agentstudio.schema_migrations SELECT * FROM jsonb_populate_record(NULL::agentstudio.schema_migrations,$1::jsonb)',[JSON.stringify(saved)]))
    })
    await runCase('real role sessions deny all private tables, columns, secrets and out-of-domain RPCs',async()=>{
      const oldWorker=h.oldPool('oldWorker'),oldDispatch=h.oldPool('oldDispatch'),secret=h.oldPool('secret')
      const sessions=[
        ['api',body=>api('alice',body,{audit:false})],
        ['worker',body=>selectedRole('worker',body)],['dispatch',body=>selectedRole('dispatch',body)],
        ['oldWorker',body=>asRole(oldWorker,logins.oldWorker,'agentstudio_review_worker',body)],
        ['oldDispatch',body=>asRole(oldDispatch,logins.oldDispatch,'agentstudio_review_dispatch',body)]
      ]
      for(const [kind,run] of sessions){
        for(const table of tables)await assert.rejects(()=>run(db=>db.query('SELECT * FROM agentstudio.'+h.quote(table))),e=>e.code==='42501',kind+' private table '+table)
        for(const sql of ['SELECT body FROM agentstudio.agent_design_inputs','SELECT result FROM agentstudio.agent_design_outputs','SELECT api_key_ciphertext FROM agentstudio.model_connections','SELECT value_ciphertext FROM agentstudio.tool_connection_headers','SELECT value_ciphertext FROM agentstudio.mcp_connection_headers','SELECT api_key_ciphertext FROM agentstudio.smithery_credentials','SELECT password_record FROM agentstudio_auth.accounts','SELECT token_digest FROM agentstudio_auth.sessions','SELECT * FROM pg_catalog.pg_authid','SELECT * FROM pg_catalog.pg_shadow'])await assert.rejects(()=>run(db=>db.query(sql)),e=>e.code==='42501',kind+' sensitive column/catalog')
        await assert.rejects(()=>run(db=>db.query("SELECT agentstudio.agent_design_digest('{}'::jsonb)")),e=>e.code==='42501',kind+' private helper')
      }
      for(const [pool,login,role] of [[oldWorker,logins.oldWorker,'agentstudio_review_worker'],[oldDispatch,logins.oldDispatch,'agentstudio_review_dispatch'],[secret,logins.secret,'agentstudio_model_broker'],[f.authPool,'agentstudio_native_login','agentstudio_native_auth']]){
        for(const name of Object.keys(signatures))await assert.rejects(()=>asRole(pool,login,role,db=>call(db,name,signatures[name]?signatures[name].split(',').map(type=>type==='jsonb'?{}:type==='bigint'?1:crypto.randomUUID()):[])),e=>e.code==='42501',role+' cannot call '+name)
        for(const table of tables)await assert.rejects(()=>asRole(pool,login,role,db=>db.query('SELECT * FROM agentstudio.'+h.quote(table))),e=>e.code==='42501',role+' no new private table SELECT')
      }
      await assert.rejects(()=>selectedRole('worker',db=>call(db,'context',[crypto.randomUUID(),crypto.randomUUID(),1,crypto.randomUUID()])),e=>e.code==='42501')
      await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'claim',[crypto.randomUUID()])),e=>e.code==='42501')
      for(const name of ['claim','context','reserve','finish','pause'])await assert.rejects(()=>api('alice',db=>call(db,name,signatures[name].split(',').map(type=>type==='jsonb'?{}:type==='bigint'?1:crypto.randomUUID())),{audit:false}),e=>e.code==='42501')
      for(const kind of ['worker','dispatch'])for(const name of ['owner_state','receipt','record','control_receipt','control','read_result','save_receipt','save_record'])await assert.rejects(()=>selectedRole(kind,db=>call(db,name,signatures[name]?signatures[name].split(',').map(type=>type==='jsonb'?{}:crypto.randomUUID()):[])),e=>e.code==='42501')
      await h.auditPositive()
    })
    await runCase('a real two-parent legacy worker/API LOGIN cannot borrow API062 authority',async()=>{
      const pool=await h.createLegacy(),identity=await f.identityFor('alice')
      await assert.rejects(()=>asRole(pool,'f01_design_db_legacy_api_worker','agentstudio_api',async db=>{
        const owner=(await db.query('SELECT agentstudio.identity_user_id($1::text,$2::text) AS id',[identity.issuer,identity.subject])).rows[0].id;assert.equal(owner,f.users.alice)
        await db.query("SELECT set_config('agentstudio.actor_id',$1::text,true)",[owner])
        return call(db,'owner_state')
      }),e=>e.code==='P0001'&&/agent_design_session_refused/.test(e.message))
      await assert.rejects(()=>asRole(pool,'f01_design_db_legacy_api_worker','agentstudio_api',db=>f.audit(db)),/unsafe_agent_design_privileges/)
    })

    // Mutations are committed by the real fixture admin so an independent
    // authenticated API connection sees them. Each test restores only its
    // exact owned DDL/grant, then re-audits and compares logical catalog state.
    const stateSignature='agentstudio.agent_design_owner_state()'
    const stateDef=await routine(stateSignature)
    const catalogCases=[
      ['extra private-family table',db=>db.query('CREATE TABLE agentstudio.agent_design_db_extra(id integer)'),db=>db.query('DROP TABLE agentstudio.agent_design_db_extra')],
      ['extra private-family view',db=>db.query('CREATE VIEW agentstudio.agent_design_db_extra AS SELECT 1 AS value'),db=>db.query('DROP VIEW agentstudio.agent_design_db_extra')],
      ['extra private-family sequence',db=>db.query('CREATE SEQUENCE agentstudio.agent_design_db_extra'),db=>db.query('DROP SEQUENCE agentstudio.agent_design_db_extra')],
      ['extra private-family index',db=>db.query('CREATE INDEX agent_design_db_extra ON agentstudio.agent_design_requests(created_at)'),db=>db.query('DROP INDEX agentstudio.agent_design_db_extra')],
      ['extra private-family type/array',db=>db.query("CREATE TYPE agentstudio.agent_design_db_extra AS ENUM('synthetic')"),db=>db.query('DROP TYPE agentstudio.agent_design_db_extra')],
      ['extra success-looking function',db=>db.query("CREATE FUNCTION agentstudio.agent_design_db_extra() RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true'"),db=>db.query('DROP FUNCTION agentstudio.agent_design_db_extra()')],
      ['unapproved overload',db=>db.query("CREATE FUNCTION agentstudio.agent_design_digest(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT $1'"),db=>db.query('DROP FUNCTION agentstudio.agent_design_digest(text)')],
      ['disabled RLS',db=>db.query('ALTER TABLE agentstudio.agent_design_inputs DISABLE ROW LEVEL SECURITY'),db=>db.query('ALTER TABLE agentstudio.agent_design_inputs ENABLE ROW LEVEL SECURITY')],
      ['unforced RLS',db=>db.query('ALTER TABLE agentstudio.agent_design_inputs NO FORCE ROW LEVEL SECURITY'),db=>db.query('ALTER TABLE agentstudio.agent_design_inputs FORCE ROW LEVEL SECURITY')],
      ['permissive private policy',db=>db.query('CREATE POLICY f01_design_db_policy ON agentstudio.agent_design_inputs TO agentstudio_design_worker USING(true)'),db=>db.query('DROP POLICY f01_design_db_policy ON agentstudio.agent_design_inputs')],
      ['private table SELECT grant',db=>db.query('GRANT SELECT ON agentstudio.agent_design_inputs TO agentstudio_design_worker'),db=>db.query('REVOKE SELECT ON agentstudio.agent_design_inputs FROM agentstudio_design_worker')],
      ['private column SELECT grant',db=>db.query('GRANT SELECT(body) ON agentstudio.agent_design_inputs TO agentstudio_design_dispatch'),db=>db.query('REVOKE SELECT(body) ON agentstudio.agent_design_inputs FROM agentstudio_design_dispatch')],
      ['encrypted model column grant',db=>db.query('GRANT SELECT(api_key_ciphertext) ON agentstudio.model_connections TO agentstudio_design_worker'),db=>db.query('REVOKE SELECT(api_key_ciphertext) ON agentstudio.model_connections FROM agentstudio_design_worker')],
      ['private helper PUBLIC execute',db=>db.query('GRANT EXECUTE ON FUNCTION agentstudio.agent_design_native(uuid) TO PUBLIC'),db=>db.query('REVOKE EXECUTE ON FUNCTION agentstudio.agent_design_native(uuid) FROM PUBLIC')],
      ['wrong execution group grant',db=>db.query('GRANT EXECUTE ON FUNCTION agentstudio.agent_design_claim(uuid) TO agentstudio_design_dispatch'),db=>db.query('REVOKE EXECUTE ON FUNCTION agentstudio.agent_design_claim(uuid) FROM agentstudio_design_dispatch')],
      ['changed definer flag',db=>db.query('ALTER FUNCTION '+stateSignature+' SECURITY INVOKER'),db=>db.query(stateDef)],
      ['changed trusted search path',db=>db.query('ALTER FUNCTION '+stateSignature+' SET search_path=public,pg_catalog'),db=>db.query(stateDef)],
      ['changed function body',db=>db.query("CREATE OR REPLACE FUNCTION "+stateSignature+" RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $tamper$ BEGIN RETURN '{}'::jsonb; END $tamper$"),db=>db.query(stateDef)],
      ['unknown PUBLIC invoker',db=>db.query("CREATE FUNCTION public.f01_design_db_public() RETURNS integer LANGUAGE sql IMMUTABLE SECURITY INVOKER AS 'SELECT 1'"),db=>db.query('DROP FUNCTION public.f01_design_db_public()')],
      ['unknown PUBLIC definer',db=>db.query("CREATE FUNCTION public.f01_design_db_public() RETURNS integer LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS 'SELECT 1'"),db=>db.query('DROP FUNCTION public.f01_design_db_public()')],
      ['unknown schema grant',async db=>{await db.query('CREATE SCHEMA f01_design_db_schema');await db.query('GRANT USAGE ON SCHEMA f01_design_db_schema TO agentstudio_design_worker')},async db=>{await db.query('REVOKE USAGE ON SCHEMA f01_design_db_schema FROM agentstudio_design_worker');await db.query('DROP SCHEMA f01_design_db_schema')}],
      ['disabled real RI triggers',db=>db.query('ALTER TABLE agentstudio.agent_design_inputs DISABLE TRIGGER ALL'),db=>db.query('ALTER TABLE agentstudio.agent_design_inputs ENABLE TRIGGER ALL')],
      ['extra real user trigger',async db=>{await db.query("CREATE FUNCTION agentstudio.f01_design_db_tgfn() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RETURN NEW; END $fn$");await db.query('REVOKE ALL ON FUNCTION agentstudio.f01_design_db_tgfn() FROM PUBLIC');await db.query('CREATE TRIGGER f01_design_db_trigger BEFORE INSERT ON agentstudio.agent_design_requests FOR EACH ROW EXECUTE FUNCTION agentstudio.f01_design_db_tgfn()')},async db=>{await db.query('DROP TRIGGER f01_design_db_trigger ON agentstudio.agent_design_requests');await db.query('DROP FUNCTION agentstudio.f01_design_db_tgfn()')}],
      ['unsafe default ACL',db=>db.query('ALTER DEFAULT PRIVILEGES FOR ROLE agentstudio_design_worker IN SCHEMA agentstudio GRANT SELECT ON TABLES TO agentstudio_api'),db=>db.query('ALTER DEFAULT PRIVILEGES FOR ROLE agentstudio_design_worker IN SCHEMA agentstudio REVOKE SELECT ON TABLES FROM agentstudio_api')]
    ]
    for(const [name,apply,restore] of catalogCases)await runCase('actual catalog refusal: '+name,()=>tamper(name,apply,restore))
    for(const [changed,original] of [['LOGIN','NOLOGIN'],['INHERIT','NOINHERIT'],['SUPERUSER','NOSUPERUSER'],['BYPASSRLS','NOBYPASSRLS'],['CREATEDB','NOCREATEDB'],['CREATEROLE','NOCREATEROLE'],['REPLICATION','NOREPLICATION'],['CONNECTION LIMIT 1','CONNECTION LIMIT -1']])await runCase('actual role attribute refusal: '+changed,()=>tamper(changed,db=>db.query('ALTER ROLE agentstudio_design_worker '+changed),db=>db.query('ALTER ROLE agentstudio_design_worker '+original)))
    for(const [changed,original] of [['INHERIT','NOINHERIT'],['SUPERUSER','NOSUPERUSER'],['BYPASSRLS','NOBYPASSRLS'],['CREATEDB','NOCREATEDB'],['CREATEROLE','NOCREATEROLE'],['REPLICATION','NOREPLICATION']])await runCase('actual independent login attribute refusal: '+changed,()=>tamper('login '+changed,db=>db.query('ALTER ROLE synthetic_design_worker '+changed),db=>db.query('ALTER ROLE synthetic_design_worker '+original)))
    await runCase('actual group/session configuration pollution is refused',()=>tamper('role config',db=>db.query('ALTER ROLE agentstudio_design_worker SET search_path=public'),db=>db.query('ALTER ROLE agentstudio_design_worker RESET search_path')))
    await runCase('actual inherited group pollution is refused',()=>tamper('group parent',db=>db.query('GRANT agentstudio_review_worker TO agentstudio_design_worker WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'),db=>db.query('REVOKE agentstudio_review_worker FROM agentstudio_design_worker')))
    await runCase('actual dedicated login second parent is refused',()=>tamper('login second parent',db=>db.query('GRANT agentstudio_design_dispatch TO synthetic_design_worker WITH ADMIN FALSE, INHERIT FALSE, SET TRUE'),db=>db.query('REVOKE agentstudio_design_dispatch FROM synthetic_design_worker')))
    await runCase('an extra otherwise-safe independent login/member is not silently accepted',()=>tamper('extra member',async db=>{await db.query('CREATE ROLE f01_design_db_extra_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION');await db.query('GRANT agentstudio_design_worker TO f01_design_db_extra_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')},async db=>{await db.query('REVOKE agentstudio_design_worker FROM f01_design_db_extra_login');await db.query('DROP ROLE f01_design_db_extra_login')}))
    for(const option of ['ADMIN TRUE','INHERIT TRUE','SET FALSE'])await runCase('actual member option refusal: '+option,()=>tamper(option,db=>db.query('GRANT agentstudio_design_worker TO synthetic_design_worker WITH '+option),db=>db.query('GRANT agentstudio_design_worker TO synthetic_design_worker WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')))
    for(const kind of ['c','p','u','f'])await runCase('actual '+kind+' constraint tamper is refused and restored',async()=>{
      const table=kind==='p'||kind==='f'?'agent_design_save_receipts':kind==='u'?'agent_design_jobs':'agent_design_requests'
      const original=await admin(async db=>(await db.query('SELECT conname,pg_get_constraintdef(oid,false) AS def FROM pg_catalog.pg_constraint WHERE conrelid=$1::regclass AND contype=$2 ORDER BY conname LIMIT 1',['agentstudio.'+table,kind])).rows[0]);assert.ok(original)
      await tamper('constraint '+kind,async db=>{await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' DROP CONSTRAINT '+h.quote(original.conname));if(kind==='c')await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' ADD CONSTRAINT '+h.quote(original.conname)+' CHECK (true)')},async db=>{if(kind==='c')await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' DROP CONSTRAINT '+h.quote(original.conname));await db.query('ALTER TABLE agentstudio.'+h.quote(table)+' ADD CONSTRAINT '+h.quote(original.conname)+' '+original.def)})
    })
    await runCase('actual SQL compact/digest matches all finite numeric, escaping and UTF16/numeric-property golden cases',async()=>{
      await h.auditPositive()
      const values=[null,true,false,0,0.1,-0.1,1e-7,1e-6,1e20,1e21,Number.MIN_VALUE,Number.MAX_VALUE,Number.EPSILON,Number.MAX_SAFE_INTEGER-2,Number.MAX_SAFE_INTEGER,
        '中文 😀\n\t\r"/\\\u2028\u2029','backspace\bformfeed\f',[],{},[1,'😀',false,null],
        {'10':'ten','2':'two','0':'zero','00':'double-zero','4294967294':'index','4294967295':'not-index','-1':'negative','\ue000':'BMP','😀':'astral'},
        {protocol:'sql_mcp_nested_fixture',schema:{type:'object',properties:{'2':{type:'integer',minimum:0},'10':{type:'number',minimum:1e-7,maximum:1e21},'😀':{type:'string'},'\ue000':{type:'string'}}}}]
      for(const value of values){
        const wire=JSON.stringify(value),expected=catalog.canonicalMcpJson(value),sha=crypto.createHash('sha256').update(expected).digest('hex')
        const row=await admin(async db=>(await db.query('SELECT agentstudio.agent_design_compact($1::jsonb) AS compact,agentstudio.agent_design_digest($1::jsonb) AS sha',[wire])).rows[0])
        assert.equal(row.compact,expected);assert.equal(row.sha,sha)
      }
    })
    let savedGenerate,ownedMcpRole
    await runCase('actual SQL admission/source/input/content/resource/completion/result/candidate/preview/save/control hashes match current Node protocols',async()=>{
      const p=await create(),prepared=await actualPrepared(p),parsed=contract.parseAgentDesignSubmission(p.body)
      const original=await admin(async db=>(await db.query('SELECT r.*,i.body,i.resource_snapshot,i.model_snapshot FROM agentstudio.agent_design_requests r JOIN agentstudio.agent_design_inputs i USING(owner_user_id,request_id) WHERE r.owner_user_id=$1 AND r.request_id=$2',[p.owner,p.request_id])).rows[0])
      assert.deepEqual(original.body,prepared);assert.equal(original.request_sha256,parsed.request_sha256)
      for(const key of ['input_sha256','content_sha256','source_sha256','resources_sha256'])assert.equal(original[key],prepared[key])
      assert.equal(original.resource_versions_sha256,contract.agentDesignHash(original.resource_snapshot));assert.equal(original.model_versions_sha256,contract.agentDesignHash(original.model_snapshot))
      const normalized={...f.output('alice'),name:'SQL方案 😀',goal:'SQL owned result\nUnicode \u2028 test',tools:['建议工具😀']},done=await finishSql(p,normalized)
      assert.equal(done.reply.result_sha256,result.agentDesignResultHash(p.request_id,'generate',prepared.input_sha256,prepared.source_sha256,normalized))
      assert.equal(done.reply.completion_sha256,contract.agentDesignHash({protocol:'agent_design_completion_v1',request_id:p.request_id,completion:done.completion}))
      await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'reserve',proofArgs(done.proof))))
      const exact=await selectedRole('dispatch',db=>call(db,'finish',[...proofArgs(done.proof),done.completion]));assert.deepEqual(exact,done.reply)
      await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'finish',[...proofArgs(done.proof),{status:'unknown',failure_code:'different_completion'}])))
      const preview=await f.savePreview(p,{name:'Explicit SQL save 😀'}),save=f.saveBody(p,preview),saveId=await api('alice',db=>call(db,'save_record',[save.intent,preview.preview]))
      assert.equal(saveId,save.intent.request_id)
      const receipt=await api('alice',db=>call(db,'save_receipt',[saveId])),parsedSave=contract.parseAgentDesignSaveIntent(save.intent)
      assert.equal(receipt.request_sha256,parsedSave.request_sha256);assert.equal(receipt.candidate_sha256,preview.preview.candidate.candidate_sha256);assert.equal(receipt.preview_sha256,preview.preview.preview_sha256)
      const agent=await f.agents.get(await f.identityFor('alice'),receipt.spec_id);assert.equal(agent.revision,1);assert.equal(agent.name,preview.preview.fields.name);assert.deepEqual(agent.spec,preview.preview.candidate.spec)
      assert.deepEqual(agent.spec.tools,[]);assert.deepEqual(agent.spec.knowledge_base_ids,[]);assert.equal(agent.spec.require_approval,true);assert.equal(Object.hasOwn(agent.spec,'model_binding'),false)
      const state=await h.ownState(agent.id);assert.equal(state.history.filter(r=>Number(r.spec_revision)===1&&r.kind==='edited').length,1)
      const control=contract.parseAgentDesignControl({action:'erase',request_id:crypto.randomUUID(),design_request_id:p.request_id,confirm:true})
      await api('alice',db=>call(db,'control',[plainIntent(control)]))
      const controlReceipt=await api('alice',db=>call(db,'control_receipt',[control.request_id]));assert.equal(controlReceipt.request_sha256,control.request_sha256)
      assert.equal(await api('alice',db=>call(db,'read_result',[p.request_id])),null)
      assert.equal(await api('alice',db=>call(db,'save_record',[save.intent,{}])),saveId,'old exact save recovery reads no erased body/preview')
      assert.deepEqual(await h.ownState(agent.id),state,'save recovery never changes Agent/history/audit/receipt')
      savedGenerate={p,agent,save,receipt}
    })
    await runCase('actual Unicode/numeric MCP catalog/schema/header hash and protected revise source/save remain current',async()=>{
      await h.auditPositive()
      const identity=await f.identityFor('alice'),repo=new h.mcp.McpConnectionRepository(f.pool,f.key)
      const connection=await repo.create(identity,{name:'F01 SQL MCP fixture',description:'Synthetic metadata only',url:'https://example.com/f01-database-fixture',enabled:true,headers:[{key:'X-Fixture-Static',value:'synthetic-header-only'}]})
      const schema={type:'object',properties:{'2':{type:'integer',minimum:0},'10':{type:'number',minimum:1e-7,maximum:1e21},'😀':{type:'string'},'\ue000':{type:'string'},header:{type:'string','x-mcp-header':'X-Fixture-Dynamic'}},additionalProperties:false}
      const mcpCatalog=catalog.parseMcpCatalog({version:'2026-07-28',tools:[{name:'fixture_lookup',description:'Synthetic 😀 lookup',input_schema:schema,read_only:true,destructive:false,requires_tasks:false}]}),catalogHash=crypto.createHash('sha256').update(catalog.canonicalMcpJson(mcpCatalog)).digest('hex')
      // Synthetic discovery metadata persisted in an actual owned connection;
      // no external MCP request or provider positive is claimed by this setup.
      await commitAdmin(db=>db.query("UPDATE agentstudio.mcp_connections SET status='ok',catalog=$2::jsonb WHERE id=$1",[connection.id,JSON.stringify(mcpCatalog)]))
      const spec=h.contracts.safeAgentSpec({goal:'MCP SQL owned original',tools:['calculate','mcp_db_lookup'],knowledge_base_ids:[],mcp_tools:[{name:'mcp_db_lookup',connection_id:connection.id,connection_revision:connection.revision,tool_name:'fixture_lookup',catalog_sha256:catalogHash}],require_plan_review:true,model_binding:f.resources.alice.binding})
      const agent=await f.agents.create(identity,'MCP SQL owned source',spec)
      const golden=await admin(async db=>(await db.query('SELECT agentstudio.agent_design_digest($1::jsonb) AS sha,agentstudio.agent_design_schema_tree($2::jsonb,0) AS tree,agentstudio.agent_design_schema_headers($2::jsonb,true,ARRAY[]::text[],0) AS headers',[JSON.stringify(mcpCatalog),JSON.stringify(schema)])).rows[0])
      assert.equal(golden.sha,catalogHash);assert.equal(golden.tree,true);assert.deepEqual(golden.headers,['x-fixture-dynamic'])
      for(const bad of [{type:'object',properties:{a:{type:'string','x-mcp-header':'X-Same'},b:{type:'integer','x-mcp-header':'x-same'}}},{type:'object',items:{type:'string','x-mcp-header':'X-Unreachable'}}])assert.equal(await admin(async db=>(await db.query('SELECT agentstudio.agent_design_schema_headers($1::jsonb,true,ARRAY[]::text[],0) AS value',[JSON.stringify(bad)])).rows[0].value),null)
      const p=await create('revise',{specId:agent.id}),prepared=await actualPrepared(p),fresh=await admin(async db=>(await db.query('SELECT agentstudio.agent_design_source($1::uuid,$2::jsonb,false) AS value',[p.owner,JSON.stringify(p.choice)])).rows[0].value)
      assert.deepEqual(fresh.prepared,prepared);assert.ok(fresh.resource_snapshot.some(r=>r.kind==='mcp'));assert.ok(fresh.resource_snapshot.some(r=>r.kind==='mcp_header'))
      await finishSql(p);const preview=await f.savePreview(p,{goal:'MCP protected fields preserved 😀'}),body=f.saveBody(p,preview)
      const save=await api('alice',db=>call(db,'save_record',[body.intent,preview.preview])),receipt=await api('alice',db=>call(db,'save_receipt',[save])),after=await f.agents.get(identity,agent.id)
      assert.equal(after.revision,2)
      for(const key of ['tools','mcp_tools','model_binding','knowledge_base_ids','require_approval','require_plan_review'])assert.deepEqual(after.spec[key],agent.spec[key])
      const history=(await h.ownState(agent.id)).history;assert.equal(history.filter(r=>r.kind==='before_edit'&&Number(r.spec_revision)===1).length,1);assert.equal(history.filter(r=>r.kind==='edited'&&Number(r.spec_revision)===2).length,1)
      assert.equal(receipt.before_revision,1);assert.equal(receipt.after_revision,2)
      ownedMcpRole=after
    })
    for(const injection of ['history','receipt','audit'])await runCase('real SQL save rolls Agent/045 history/receipt/audit back on '+injection+' failure',async()=>{
      await h.auditPositive()
      assert.ok(ownedMcpRole)
      const identity=await f.identityFor('alice'),beforeAgent=await f.agents.get(identity,ownedMcpRole.id),p=await create('revise',{specId:beforeAgent.id});await finishSql(p)
      const preview=await f.savePreview(p,{goal:'Rollback '+injection+' should never persist'}),body=f.saveBody(p,preview),before=await h.ownState(beforeAgent.id)
      const target=injection==='history'?'agent_collaboration_revisions':injection==='receipt'?'agent_design_save_receipts':'audit_events'
      const predicate=injection==='history'?"NEW.spec_id='"+beforeAgent.id+"'::uuid":injection==='receipt'?"NEW.save_request_id='"+body.intent.request_id+"'::uuid":"NEW.action='agent.design.saved' AND NEW.target_id='"+p.request_id+"'"
      let installed=false
      try{
        await commitAdmin(async db=>{await db.query("CREATE FUNCTION agentstudio.f01_design_db_abort() RETURNS trigger LANGUAGE plpgsql AS $fail$ BEGIN IF "+predicate+" THEN RAISE EXCEPTION 'f01_design_db_injected_rollback'; END IF; RETURN NEW; END $fail$");await db.query('REVOKE ALL ON FUNCTION agentstudio.f01_design_db_abort() FROM PUBLIC');await db.query('CREATE TRIGGER agent_design_db_abort AFTER INSERT ON agentstudio.'+h.quote(target)+' FOR EACH ROW EXECUTE FUNCTION agentstudio.f01_design_db_abort()')});installed=true
        await h.auditNegative()
        // Direct original API SQL primitive only, after proving application
        // catalog verification refuses the injection. No audit stub is used.
        await assert.rejects(()=>api('alice',db=>call(db,'save_record',[body.intent,preview.preview]),{audit:false}),e=>e.code==='P0001'&&/f01_design_db_injected_rollback/.test(e.message))
        assert.deepEqual(await h.ownState(beforeAgent.id),before)
        assert.equal(await api('alice',db=>call(db,'save_receipt',[body.intent.request_id]),{audit:false}),null)
      }finally{if(installed)await commitAdmin(async db=>{await db.query('DROP TRIGGER agent_design_db_abort ON agentstudio.'+h.quote(target));await db.query('DROP FUNCTION agentstudio.f01_design_db_abort()')})}
      await h.auditPositive();assert.deepEqual(await h.ownState(beforeAgent.id),before)
      const committed=await api('alice',db=>call(db,'save_record',[body.intent,preview.preview]));assert.equal(committed,body.intent.request_id)
      const after=await f.agents.get(identity,beforeAgent.id);assert.equal(after.revision,beforeAgent.revision+1);ownedMcpRole=after
    })
    await runCase('real SQL owner scope cannot read/control another Native employee receipt or private result',async()=>{
      assert.ok(savedGenerate)
      assert.equal(await api('bob',db=>call(db,'receipt',[savedGenerate.p.request_id])),null)
      assert.equal(await api('bob',db=>call(db,'read_result',[savedGenerate.p.request_id])),null)
      assert.equal(await api('bob',db=>call(db,'save_receipt',[savedGenerate.save.intent.request_id])),null)
      const intent={action:'erase',request_id:crypto.randomUUID(),design_request_id:savedGenerate.p.request_id,confirm:true}
      await assert.rejects(()=>api('bob',db=>call(db,'control',[intent])),e=>e.code==='P0001'&&/agent_design_request_not_found/.test(e.message))
    })
    await runCase('unknown completion SQL hash is exact, creates no result body and can never become a late success',async()=>{
      const p=await create(),proof=await selectedRole('worker',db=>call(db,'claim',[crypto.randomUUID()]),{audit:true});assert.equal(proof.request_id,p.request_id)
      await selectedRole('dispatch',db=>call(db,'reserve',proofArgs(proof)),{audit:true})
      const completion={status:'unknown',failure_code:'synthetic_sql_unknown'},reply=await selectedRole('dispatch',db=>call(db,'finish',[...proofArgs(proof),completion]),{audit:true})
      assert.equal(reply.state,'unknown');assert.equal(reply.completion_sha256,contract.agentDesignHash({protocol:'agent_design_completion_v1',request_id:p.request_id,completion}))
      assert.equal(await api('alice',db=>call(db,'read_result',[p.request_id])),null)
      await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'finish',[...proofArgs(proof),{status:'succeeded',result:f.output('alice')}])))
      const row=await f.record(p.owner,p.request_id);assert.equal(row.reservations,1);assert.equal(row.outputs,0)
    })
    await runCase('actual header row ABA invalidates private SQL snapshot while pure input/source hashes stay equal',async()=>{
      const p=await create('revise',{specId:ownedMcpRole.id}),old=await actualPrepared(p),proof=await selectedRole('worker',db=>call(db,'claim',[crypto.randomUUID()]),{audit:true});assert.equal(proof.request_id,p.request_id)
      await selectedRole('dispatch',db=>call(db,'reserve',proofArgs(proof)),{audit:true})
      const ref=ownedMcpRole.spec.mcp_tools[0],header=await admin(async db=>(await db.query('SELECT id,to_jsonb(updated_at) AS stamp FROM agentstudio.mcp_connection_headers WHERE owner_user_id=$1 AND mcp_connection_id=$2 ORDER BY id LIMIT 1',[p.owner,ref.connection_id])).rows[0]);assert.ok(header)
      try{
        await commitAdmin(db=>db.query("UPDATE agentstudio.mcp_connection_headers SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[header.id]))
        const stillPure=await actualPrepared(p);assert.equal(stillPure.input_sha256,old.input_sha256);assert.equal(stillPure.source_sha256,old.source_sha256)
        await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'context',proofArgs(proof))),e=>e.code==='P0001'&&/agent_design_source_changed/.test(e.message))
      }finally{await commitAdmin(db=>db.query('UPDATE agentstudio.mcp_connection_headers SET updated_at=$2::timestamptz WHERE id=$1',[header.id,header.stamp]))}
      const restoredPure=await actualPrepared(p);assert.equal(restoredPure.input_sha256,old.input_sha256)
      await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'context',proofArgs(proof))),e=>e.code==='P0001'&&/agent_design_source_changed/.test(e.message))
      await assert.rejects(()=>selectedRole('dispatch',db=>call(db,'finish',[...proofArgs(proof),{status:'succeeded',result:f.output('alice')}])))
      assert.equal((await selectedRole('worker',db=>call(db,'pause',proofArgs(proof)))).state,'paused')
      const row=await f.record(p.owner,p.request_id);assert.equal(row.reservations,1);assert.equal(row.outputs,0)
      await api('alice',db=>call(db,'control',[{action:'erase',request_id:crypto.randomUUID(),design_request_id:p.request_id,confirm:true}]))
    })
    await runCase('real621 receipt wait precedes620 target lock and concurrent same-Agent saves commit once',async()=>{
      const first=await create('revise',{specId:ownedMcpRole.id});await finishSql(first)
      const second=await create('revise',{specId:ownedMcpRole.id});await finishSql(second)
      const preview1=await f.savePreview(first,{goal:'Only first concurrent save persists'}),preview2=await f.savePreview(second,{goal:'Second stale save never persists'}),body1=f.saveBody(first,preview1),body2=f.saveBody(second,preview2)
      const before=await f.agents.get(await f.identityFor('alice'),ownedMcpRole.id)
      const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r}),resolve:()=>resolve()}}
      const started1=deferred(),returned1=deferred(),commit1=deferred(),started2=deferred();let pid1,pid2,work1,work2,gateOpen=false
      const gate=await f.adminPool.connect()
      const lock=async(pid,key,seed)=>admin(async db=>(await db.query("WITH k AS(SELECT hashtextextended($2::text,$3::bigint) AS n) SELECT coalesce(bool_or(l.granted),false) AS granted,coalesce(bool_or(NOT l.granted),false) AS waiting FROM pg_catalog.pg_locks l CROSS JOIN k WHERE l.pid=$1 AND l.locktype='advisory' AND l.objsubid=1 AND l.classid::bigint=((k.n>>32)&4294967295) AND l.objid::bigint=(k.n&4294967295)",[pid,key,seed])).rows[0])
      const until=async(predicate,label)=>{const start=performance.now();for(;;){if(await predicate())return;if(performance.now()-start>3500)throw Error('actual_lock_observation_timeout:'+label);await new Promise(r=>setTimeout(r,20))}}
      const key621=first.owner+':save:'+body1.intent.request_id,key620=first.owner+':design:'+first.request_id
      try{
        await h.mustClient(gate,f.target.user,f.target.user,true)
        await gate.query('BEGIN');gateOpen=true;await gate.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,621))',[key621])
        work1=api('alice',async db=>{pid1=db.processID;started1.resolve();const value=await call(db,'save_record',[body1.intent,preview1.preview]);returned1.resolve();await commit1.promise;return value});void work1.catch(()=>{})
        await Promise.race([started1.promise,work1]);await until(async()=>(await lock(pid1,key621,621)).waiting,'first waits621')
        assert.equal((await lock(pid1,key620,620)).granted,false,'no target620 lock before blocked receipt621')
        await gate.query('COMMIT');gateOpen=false;await Promise.race([returned1.promise,work1])
        assert.equal((await lock(pid1,key621,621)).granted,true);assert.equal((await lock(pid1,key620,620)).granted,true)
        work2=api('alice',async db=>{pid2=db.processID;started2.resolve();return call(db,'save_record',[body2.intent,preview2.preview])}).then(value=>({value}),error=>({error}))
        await Promise.race([started2.promise,work2.then(value=>{if(value.error)throw value.error})]);await until(async()=>admin(async db=>(await db.query('SELECT $2::integer=ANY(pg_catalog.pg_blocking_pids($1)) AS blocked',[pid2,pid1])).rows[0].blocked),'second waits actual Agent writer')
        assert.equal((await lock(pid2,second.owner+':save:'+body2.intent.request_id,621)).granted,true)
        assert.equal((await lock(pid2,second.owner+':design:'+second.request_id,620)).granted,true)
        commit1.resolve();assert.equal(await work1,body1.intent.request_id)
        const stale=await work2;assert.ok(stale.error);assert.equal(stale.error.code,'P0001');assert.match(stale.error.message,/agent_design_source_changed/)
      }finally{commit1.resolve();try{if(gateOpen)await gate.query('ROLLBACK')}finally{gate.release();await Promise.allSettled([work1,work2].filter(Boolean))}}
      const after=await f.agents.get(await f.identityFor('alice'),before.id);assert.equal(after.revision,before.revision+1);assert.equal(after.spec.goal,preview1.preview.fields.goal)
      assert.ok(await api('alice',db=>call(db,'save_receipt',[body1.intent.request_id])));assert.equal(await api('alice',db=>call(db,'save_receipt',[body2.intent.request_id])),null)
      const committed=await h.ownState(before.id)
      assert.equal(committed.history.filter(r=>r.kind==='before_edit'&&Number(r.spec_revision)===before.revision).length,1)
      assert.equal(committed.history.filter(r=>r.kind==='edited'&&Number(r.spec_revision)===after.revision).length,1)
      assert.equal(committed.saves.filter(r=>r.save_request_id===body1.intent.request_id||r.save_request_id===body2.intent.request_id).length,1)
      ownedMcpRole=after
    })
  }catch(error){failure=error;throw error}
  finally{try{await h.settle();await h.auditPositive();assert.equal(f.providerRequests.length,noProviderBefore);assert.equal(f.credentialReads(),noKeysBefore)}catch(error){throw new AggregateError([...(failure?[failure]:[]),error],'agent_design_database_suite_cleanup_failed')}}
}
