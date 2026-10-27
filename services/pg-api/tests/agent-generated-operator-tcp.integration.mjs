// Separate hosted5333 profile. No weakening/reuse of the original5432 guard.
// The first gate deliberately precedes even the fixture's dynamic import.
import test from 'node:test'
import assert from 'node:assert/strict'
const p='AGENT_STUDIO_GENERATED_OPERATOR_CI_',env=process.env
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),positive=v=>typeof v==='string'&&/^[1-9][0-9]{0,31}$/.test(v)
const allowed=['EPHEMERAL','PURPOSE','WRITE_APPROVED','NONCE','MAIN_CONTAINER_ID','RESTORE_CONTAINER_ID','IMAGE_ID','ARCHIVE_SHA256','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256','ADMIN_PASSWORD']
if(process.platform!=='linux'||process.getuid?.()!==0||process.getgid?.()!==0||env.GITHUB_ACTIONS!=='true'||env.CI!=='true'||env.RUNNER_OS!=='Linux'||env.RUNNER_ENVIRONMENT!=='github-hosted'||
 env.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||env.GITHUB_WORKFLOW!=='Agent Studio PG18 generated operator isolated verification'||env.GITHUB_JOB!=='pg18-generated-operator'||!positive(env.GITHUB_RUN_ID)||!positive(env.GITHUB_RUN_ATTEMPT)||
 env[p+'EPHEMERAL']!=='true'||env[p+'PURPOSE']!=='GENERATED_059_OPERATOR_SYNTHETIC_ONLY'||env[p+'WRITE_APPROVED']!=='YES_DISPOSABLE_GENERATED_OPERATOR_ONLY'||
 !['NONCE','MAIN_CONTAINER_ID','RESTORE_CONTAINER_ID','ARCHIVE_SHA256','SOURCE_MANIFEST_SHA256','RUNTIME_MANIFEST_SHA256'].every(k=>hex(env[p+k]))||env[p+'MAIN_CONTAINER_ID']===env[p+'RESTORE_CONTAINER_ID']||!/^sha256:[a-f0-9]{64}$/.test(env[p+'IMAGE_ID']??'')||
 env[p+'ADMIN_PASSWORD']!=='synthetic-generated-operator-'+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT||
 Object.keys(env).some(k=>env[k]!==undefined&&(k==='DATABASE_URL'||/^PG[A-Z_]/.test(k)||k.startsWith(p)&&!allowed.includes(k.slice(p.length))||
  ['NODE_OPTIONS','NODE_PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','DOCKER_HOST','DOCKER_CONTEXT','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED'].includes(k))))throw Error('refuse_non_ephemeral_generated_operator_ci')

const {generatedOperatorCiFixture,traceGeneratedOperatorPool,operatorGate,operatorUntil}=await import('./helpers/agent-generated-operator-ci-fixture.mjs')
const settle=promise=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}))
const errorCode=code=>error=>error.message===code
test('real isolated PG18 optional059 operator: restored058, actual same-client full audit, rollback and uncertain commit', {timeout:1200000,concurrency:false},async t=>{
 const f=await generatedOperatorCiFixture(),start=async()=>{await f.reset();return await f.evidence()},persist=e=>record=>e.persist(record)
 try{
  await t.test('actual trusted extracted plan and default/half-configuration refusal precede secrets and pg',async()=>{
   const plan=await f.actualPlan();assert.equal(plan.code,0,plan.stderr);const value=JSON.parse(plan.stdout)
   assert.equal(value.source_sha256,f.snapshot.source_sha256);assert.equal(value.default_fresh_latest,'pg_v9_050');assert.equal(value.network_used,false);assert.equal(value.secret_read,false)
   const absent=await f.rawNode([]);assert.notEqual(absent.code,0);assert.match(absent.stderr,/generated_operator_invalid_arguments/)
   const e=await start(),half=await f.cli('apply',e,{AGENT_STUDIO_GENERATED_059_READ_APPROVED:undefined,AGENT_STUDIO_GENERATED_059_ADMIN_PASSWORD_FILE:'/nonexistent-generated-operator-secret'})
   assert.notEqual(half.code,0);assert.match(half.stderr,/generated_operator_disabled/);await f.assertUnchanged(e)
  })
  await t.test('real default/custom/NOINHERIT review/API/index members block installation while idle',async()=>{
   const e=await start()
   for(const login of ['agentstudio_review_worker_login','agentstudio_review_dispatch_login','ci_custom_review_worker','ci_custom_review_dispatch','ci_custom_api','ci_nested_api','agentstudio_knowledge_index_worker_login']){
    const runtime=f.runtime(login),client=await runtime.pool.connect(),trace=traceGeneratedOperatorPool(f.admin)
    try{
     const actual=(await client.query('SELECT session_user AS login,current_user AS role,pg_backend_pid() AS pid')).rows[0]
     assert.equal(actual.login,login);assert.equal(actual.role,login)
     const attrs=(await f.admin.query('SELECT rolinherit,rolsuper FROM pg_roles WHERE rolname=$1',[login])).rows[0];assert.deepEqual(attrs,{rolinherit:false,rolsuper:false})
     const activity=(await f.admin.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[actual.pid])).rows[0];assert.equal(activity.state,'idle')
     await assert.rejects(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,persist(e)),errorCode('generated_operator_runtime_connections_present'))
     assert.ok(!trace.trace.some(q=>q.sql===f.snapshot.body||q.sql==='COMMIT'));assert.equal(trace.trace.at(-1).sql,'ROLLBACK');await f.assertUnchanged(e)
    }finally{client.release();await runtime.close()}
   }
  })
  await t.test('one real privileged client sees uncommitted059 and direct FULL audits; postgres observer does not count as runtime',async()=>{
   const e=await start(),gate=operatorGate(),observer=await f.admin.connect();let identity
   const trace=traceGeneratedOperatorPool(f.admin,{async after({sql,raw,pid}){
    if(sql===f.snapshot.body){identity=(await raw.query('SELECT session_user AS login,current_user AS role,pg_backend_pid() AS pid,to_regclass(\'agentstudio.agent_generated_acceptances\') IS NOT NULL AS visible')).rows[0];assert.equal(identity.pid,pid);await gate.hold(identity)}
   }})
   const state=settle(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,persist(e)))
   try{
    await observer.query('BEGIN READ ONLY');await observer.query('SELECT 1')
    const seen=await Promise.race([gate.reached,state.then(r=>{throw r.error??Error('missing real DDL gate')})])
    assert.deepEqual({...seen,pid:0},{login:'postgres',role:'postgres',pid:0,visible:true})
    assert.equal((await observer.query("SELECT to_regclass('agentstudio.agent_generated_acceptances') IS NULL AS absent")).rows[0].absent,true,'independent connection cannot see uncommitted059')
    assert.equal((await f.recover(e)).state,'pending')
    const loser=traceGeneratedOperatorPool(f.admin);await assert.rejects(f.core.applyGeneratedOperator(loser.pool,f.snapshot,e.approval,persist(e)),errorCode('generated_operator_schema_lock_busy'))
    assert.ok(!loser.trace.some(q=>q.sql===f.snapshot.body));gate.release()
    const reply=await state;if(!reply.ok)throw reply.error;assert.equal(reply.value.invocation_commit_acknowledged,true);assert.equal(reply.value.runtime_login_verified,false)
    const sql=trace.trace.map(q=>q.sql),body=sql.indexOf(f.snapshot.body),commit=sql.indexOf('COMMIT')
    assert.ok(body>0&&commit>body)
    const after=sql.slice(body+1,commit);assert.ok(after.includes('SET LOCAL ROLE agentstudio_api'));assert.ok(after.includes('RESET ROLE'))
    assert.ok(after.some(s=>s.includes("to_regprocedure('agentstudio.agent_opinion_body(uuid,text,text)')")),'actual full059 core query executed, not a positive audit double')
    assert.ok(after.some(s=>s.includes('p.proname')&&s.includes('pg_catalog.pg_proc')))
    assert.ok(trace.trace.slice(body,commit+1).every(q=>q.pid===identity.pid));assert.equal(sql.filter(s=>s===f.snapshot.body).length,1)
    await f.full(f.admin,true);assert.equal(await f.business(f.admin),e.beforeBusiness)
   }finally{gate.release();await state;await observer.query('ROLLBACK').catch(()=>{});observer.release()}
  })
  await t.test('actual private-root CLI preflight/apply/recover and independent actual runtime login pools',async()=>{
   const e=await start(),preflight=await f.cli('preflight',e);assert.equal(preflight.code,0,preflight.stderr);assert.equal(JSON.parse(preflight.stdout).state,'predecessor_exact')
   const installed=await f.cli('apply',e);assert.equal(installed.code,0,installed.stderr);const value=JSON.parse(installed.stdout)
   assert.equal(value.state,'installed_exact');assert.equal(value.invocation_commit_acknowledged,true);assert.equal(value.feature_activation_authorized,false);await f.full(f.admin,true)
   const recovery=await f.cli('recover',e,{AGENT_STUDIO_GENERATED_059_JOURNAL_FILE:e.directory+'/cli-journal.jsonl'});assert.equal(recovery.code,0,recovery.stderr)
   const status=JSON.parse(recovery.stdout);assert.equal(status.state,'installed_exact');assert.equal(status.invocation_commit_acknowledged,false);assert.equal(status.automatic_retry_authorized,false)
   for(const [kind,login]of [['api','agentstudio_stage_login'],['worker','agentstudio_stage_worker'],['identity','agentstudio_bound_dispatch_login'],['broker','agentstudio_model_broker_login']]){
    const runtime=f.runtime(login);try{const result=await f.core.verifyGeneratedOperatorRuntimeLogin(runtime.pool,kind,{system_identifier:e.approval.system_identifier,database_oid:e.approval.database_oid});assert.equal(result.actual_login_verified,true);assert.equal(result.login,login)}finally{await runtime.close()}
   }
   await assert.rejects(f.core.verifyGeneratedOperatorRuntimeLogin(f.admin,'api',{system_identifier:e.approval.system_identifier,database_oid:e.approval.database_oid}),errorCode('generated_operator_runtime_login_unsafe'))
   assert.equal(await f.business(f.admin),e.beforeBusiness)
  })
  await t.test('actual DDL and privilege drift failure before COMMIT fully rolls back with058/full catalog intact',async()=>{
   for(const fault of ['before_ddl','after_ddl','postflight_acl','reset_role']){
    const e=await start();let ddl=false,resets=0,reached=false
    const trace=traceGeneratedOperatorPool(f.admin,{
     async before({sql}){if(sql===f.snapshot.body&&fault==='before_ddl'){reached=true;throw Error('synthetic_operator_before_ddl')}if(sql==='RESET ROLE'&&++resets===2&&fault==='reset_role'){reached=true;throw Error('synthetic_operator_reset_role')}},
     async after({sql,raw}){if(sql===f.snapshot.body){ddl=true;if(fault==='after_ddl'){reached=true;throw Error('synthetic_operator_after_ddl')}if(fault==='postflight_acl'){reached=true;await raw.query('REVOKE EXECUTE ON FUNCTION agentstudio.agent_generated_accept(jsonb) FROM agentstudio_api')}}},
    })
    const result=await settle(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,persist(e)));assert.equal(result.ok,false);assert.equal(reached,true)
    assert.equal(ddl,fault!=='before_ddl');assert.ok(trace.trace.some(q=>q.sql==='ROLLBACK'));assert.ok(!trace.trace.some(q=>q.sql==='COMMIT'))
    if(fault==='postflight_acl')assert.equal(result.error.message,'unsafe_agent_generated_privileges')
    await f.assertUnchanged(e)
   }
  })
  await t.test('actual acknowledged COMMIT lost to caller resolves installed_exact without another DDL attempt',async()=>{
   const e=await start();let commits=0
   const trace=traceGeneratedOperatorPool(f.admin,{async after({sql}){if(sql==='COMMIT'){commits++;throw Error('synthetic_operator_lost_ack')}}})
   await assert.rejects(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,persist(e)),f.core.GeneratedOperatorCommitUnknown)
   assert.equal(e.journal.at(-1).phase,'commit_unknown');assert.equal(commits,1);assert.equal(trace.trace.filter(q=>q.sql===f.snapshot.body).length,1);assert.ok(!trace.trace.some(q=>q.sql==='ROLLBACK'))
   const result=await f.recover(e);assert.equal(result.state,'installed_exact');assert.equal(result.invocation_commit_acknowledged,false);assert.equal(result.automatic_retry_authorized,false)
   await f.full(f.admin,true);assert.equal(await f.business(f.admin),e.beforeBusiness)
  })
  await t.test('real journal/postcheck failures distinguish rollback before COMMIT from installed-but-unverified afterward',async()=>{
   for(const fault of ['pending_journal','ack_journal','durable_postcheck']){
    const e=await start();let committed=false,reached=false
    const trace=traceGeneratedOperatorPool(f.admin,{
     async before({sql}){if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'&&committed&&fault==='durable_postcheck'){reached=true;throw Error('synthetic_operator_postcheck_transport')}},
     async after({sql}){if(sql==='COMMIT')committed=true},
    })
    const write=async record=>{await e.persist(record);if(record.phase===(fault==='pending_journal'?'commit_pending':'commit_acknowledged')&&fault!=='durable_postcheck'){reached=true;throw Error('synthetic_operator_journal_transport')}}
    const result=await settle(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,write));assert.equal(result.ok,false);assert.equal(reached,true)
    if(fault==='pending_journal'){assert.equal(committed,false);assert.ok(trace.trace.some(q=>q.sql==='ROLLBACK'));await f.assertUnchanged(e)}
    else{assert.ok(result.error instanceof f.core.GeneratedOperatorInstalledUnverified);assert.equal(committed,true);assert.equal((await f.recover(e)).state,'installed_exact');await f.full(f.admin,true);assert.equal(await f.business(f.admin),e.beforeBusiness)}
   }
  })
  await t.test('server termination at COMMIT really rolls DDL back; recovery observes predecessor without retry',async()=>{
   const e=await start();let terminated=false
   const trace=traceGeneratedOperatorPool(f.admin,{async before({sql,pid}){if(sql==='COMMIT'){
    const current=(await f.admin.query('SELECT backend_start::text AS start FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];assert.equal(current.start,e.journal.at(-1).backend_start)
    terminated=(await f.admin.query('SELECT pg_terminate_backend($1) AS ended',[pid])).rows[0].ended;assert.equal(terminated,true)
   }}})
   await assert.rejects(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,persist(e)),f.core.GeneratedOperatorCommitUnknown);assert.equal(terminated,true)
   await operatorUntil(async()=>!(await f.admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start::text=$2) AS alive',[e.journal.at(-1).backend_pid,e.journal.at(-1).backend_start])).rows[0].alive,'terminated_backend')
   const result=await f.recover(e);assert.equal(result.state,'predecessor_exact');assert.equal(result.automatic_retry_authorized,false);await f.assertUnchanged(e)
  })
  await t.test('unknown transport while server still executes remains pending until real transaction has ended',async()=>{
   const e=await start();let sleeping=false,sleepPromise
   const trace=traceGeneratedOperatorPool(f.admin,{async before({sql,raw,pid}){if(sql==='COMMIT'){
    // A real in-flight server command models a delayed close. Wait for the
    // actual PgSleep observation before injecting a lost outbound transport.
    sleepPromise=raw.query('SELECT pg_sleep(8)').catch(()=>{})
    await operatorUntil(async()=>{sleeping=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='PgSleep' AND xact_start IS NOT NULL) AS sleeping",[pid])).rows[0].sleeping;return sleeping},'actual_inflight_server')
    throw Error('synthetic_operator_unknown_inflight_transport')
   }}})
   await assert.rejects(f.core.applyGeneratedOperator(trace.pool,f.snapshot,e.approval,persist(e)),f.core.GeneratedOperatorCommitUnknown);assert.equal(sleeping,true)
   assert.equal((await f.recover(e)).state,'pending');assert.equal(trace.trace.filter(q=>q.sql===f.snapshot.body).length,1)
   await operatorUntil(async()=>(await f.recover(e)).state==='predecessor_exact','unknown_actual_rollback',20000);await sleepPromise;await f.assertUnchanged(e)
  })
  await t.test('real wrong target, modified approval and tampered trusted-copy059 refuse with no source normalization',async()=>{
   const e=await start()
   await assert.rejects(f.core.applyGeneratedOperator(f.restoreAdmin,f.snapshot,e.approval,persist(e)),error=>error.code==='P0001'&&error.message==='service_login_target_not_approved')
   const bad=await f.cli('preflight',e,{AGENT_STUDIO_GENERATED_059_APPROVAL_SHA256:'0'.repeat(64),AGENT_STUDIO_GENERATED_059_ADMIN_PASSWORD_FILE:'/not-read-generated-operator-secret'})
   assert.notEqual(bad.code,0);assert.match(bad.stderr,/generated_operator_evidence_changed/)
   const fs=await import('node:fs'),sql=f.root+'/db/postgres/migrations/pg_v9_059_agent_generated_acceptance.sql',bytes=fs.readFileSync(sql)
   assert.ok(sql.startsWith(f.root+'/'))
   try{fs.writeFileSync(sql,Buffer.from(bytes.toString('utf8').replaceAll('\n','\r\n')));const tampered=await f.actualPlan();assert.notEqual(tampered.code,0);assert.match(tampered.stderr,/generated_operator_source_refused/)}finally{fs.writeFileSync(sql,bytes)}
   await f.assertUnchanged(e)
  })
 }finally{await f.close()}
})
