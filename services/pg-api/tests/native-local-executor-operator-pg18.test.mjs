// New manual purpose only. Actual fresh synthetic PG18; never production5333.
import {requireLocalExecutorOperatorCi} from './helpers/native-local-executor-operator-ci-guard.mjs'
const target=requireLocalExecutorOperatorCi()
const [{default:test},{default:assert},fs,crypto,url,path,pins]=await Promise.all([import('node:test'),import('node:assert/strict'),import('node:fs'),import('node:crypto'),import('node:url'),import('node:path'),import('./helpers/native-local-executor-operator-source-pins.mjs')])
const root=url.fileURLToPath(new URL('../../../',import.meta.url))
if(Object.keys(pins.localExecutorOperatorSources).length<80)throw Error('executor_operator_reviewed_sources_required')
for(const [name,sha]of Object.entries(pins.localExecutorOperatorSources))if(!/^[a-f0-9]{64}$/.test(sha)||crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')!==sha)throw Error('executor_operator_reviewed_source_changed')
const [baseModule,pgModule,planModule,preflightModule,activationModule,auditModule]=await Promise.all([import('./helpers/agent-assessment-fixture.mjs'),import('pg'),import('../src/native-local-executor-operator-plan.mjs'),import('../src/native-local-executor-service-preflight.ts'),import('../src/native-activation-cli.mjs'),import('../src/native-local-device-audit.ts')])
test('independent minimum Executor LOGIN and original C read-only audit on real fresh PG18',async t=>{
 let f,adminPool,admin,executorPool
 try{
  f=await baseModule.agentAssessmentTcpFixture(process.env)
  for(const part of ['058_agent_opinion_read','059_agent_generated_acceptance','060_agent_descriptive_patch','061_company_overview','062_agent_design','063_agent_template_market','064_agent_plan_workflow','065_agent_internal_share','067_native_local_devices'])await f.db.exec(f.sql('migrations/pg_v9_'+part+'.sql'))
  adminPool=new pgModule.default.Pool({...target,max:1});admin=await adminPool.connect()
  const serverAddress=(await admin.query('SELECT host(inet_server_addr()) AS address')).rows[0]?.address;if(typeof serverAddress!=='string')throw Error('actual_ci_server_address_required')
  const ciPreflightTarget=Object.freeze({database:'agentstudio_pg18_ci',port:5432,observed_server_address:serverAddress})
  const baseline=(await admin.query('SELECT (SELECT count(*)::int FROM agentstudio.schema_migrations) ledger,(SELECT count(*)::int FROM agentstudio.native_local_devices) devices,(SELECT count(*)::int FROM agentstudio.native_local_jobs) jobs,(SELECT count(*)::int FROM agentstudio.native_local_receipts) receipts')).rows[0]
  await t.test('original production target guard rejects the genuine CI endpoint; no target impersonation',async()=>{await assert.rejects(admin.query(planModule.executorOperatorTargetGuardSql),/service_login_target_not_approved/)})
  await t.test('reviewed fixed reservation is initially NOLOGIN with NULL password and only the exact non-inheriting Executor membership',async()=>{
   await admin.query('BEGIN');try{await admin.query(planModule.disabledExecutorReservationSql);await admin.query(planModule.executorConnectGrant(target.database));await admin.query('COMMIT')}catch(error){await admin.query('ROLLBACK');throw error}
   const role=(await admin.query("SELECT rolcanlogin login,rolpassword IS NULL no_password,rolinherit inherit,rolsuper super,rolbypassrls bypass,rolcreatedb createdb,rolcreaterole createrole,rolreplication replication,rolconfig config,rolvaliduntil expires FROM pg_authid WHERE rolname='agentstudio_local_executor_login'")).rows[0]
   assert.deepEqual(role,{login:false,no_password:true,inherit:false,super:false,bypass:false,createdb:false,createrole:false,replication:false,config:null,expires:null})
   const member=(await admin.query("SELECT g.rolname::text name,m.admin_option admin,m.inherit_option inherit,m.set_option AS \"set\" FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles g ON g.oid=m.roleid WHERE c.rolname='agentstudio_local_executor_login'")).rows;assert.deepEqual(member,[{name:'agentstudio_local_executor',admin:false,inherit:false,set:true}])
  })
  const password=crypto.createHash('sha512').update(target.password+':independent-executor-login').digest('hex').slice(0,80),verifier=activationModule.makeNativeScramVerifier(password)
  await t.test('strict original SCRAM verifier activates only this new LOGIN; actual TCP original identity and all C catalogs pass',async()=>{
   await admin.query(planModule.executorActivationStatement(verifier));executorPool=new pgModule.default.Pool({...target,user:'agentstudio_local_executor_login',password,max:1});executorPool.on('error',()=>{})
   const result=await preflightModule.inspectNativeLocalExecutorPreflight({connect:()=>executorPool.connect()},ciPreflightTarget);assert.equal(result.original_C_audit_verified,true);assert.equal(result.live_service_proven,false);assert.equal(result.read_only,true);assert.equal(result.effect_executed,false);assert.equal(await auditModule.inspectNativeLocalDevicePool(f.pool,'agentstudio_api'),true)
  })
  await t.test('wrong password and wrong expected service target fail without contacting production5333',async()=>{
   const wrong=new pgModule.default.Client({...target,user:'agentstudio_local_executor_login',password:'synthetic-wrong-password-never-production'});try{await assert.rejects(wrong.connect(),e=>['28P01','28000'].includes(e.code))}finally{await wrong.end().catch(()=>{})}
   await assert.rejects(preflightModule.inspectNativeLocalExecutorPreflight({connect:()=>executorPool.connect()},{database:'agent_studio',port:5333}),/preflight_refused/)
  })
  await t.test('actual table or auth-schema grants and inheritable membership are rejected by the unchanged C auditor and restore independently',async()=>{
   for(const [grant,revoke]of [["GRANT SELECT ON TABLE agentstudio.native_local_devices TO agentstudio_local_executor_login","REVOKE SELECT ON TABLE agentstudio.native_local_devices FROM agentstudio_local_executor_login"],["GRANT USAGE ON SCHEMA agentstudio_auth TO agentstudio_local_executor_login","REVOKE USAGE ON SCHEMA agentstudio_auth FROM agentstudio_local_executor_login"],["GRANT agentstudio_local_executor TO agentstudio_local_executor_login WITH INHERIT TRUE","GRANT agentstudio_local_executor TO agentstudio_local_executor_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE"]]){
    await admin.query(grant);try{await assert.rejects(preflightModule.inspectNativeLocalExecutorPreflight({connect:()=>executorPool.connect()},ciPreflightTarget),/unsafe_native_local_device_schema/)}finally{await admin.query(revoke)}
    assert.equal((await preflightModule.inspectNativeLocalExecutorPreflight({connect:()=>executorPool.connect()},ciPreflightTarget)).read_only,true)
   }
  })
  await t.test('database CREATE is refused before C role switch; CONNECT-only restoration passes',async()=>{
   await admin.query('GRANT CREATE ON DATABASE agentstudio_pg18_ci TO agentstudio_local_executor_login');try{await assert.rejects(preflightModule.inspectNativeLocalExecutorPreflight({connect:()=>executorPool.connect()},ciPreflightTarget),/preflight_refused/)}finally{await admin.query('REVOKE CREATE ON DATABASE agentstudio_pg18_ci FROM agentstudio_local_executor_login')}
   assert.equal((await preflightModule.inspectNativeLocalExecutorPreflight({connect:()=>executorPool.connect()},ciPreflightTarget)).original_C_audit_verified,true)
  })
  await t.test('preflight and operator use no migration receipt, device pairing, job, table grant or effect',async()=>{
   const after=(await admin.query('SELECT (SELECT count(*)::int FROM agentstudio.schema_migrations) ledger,(SELECT count(*)::int FROM agentstudio.native_local_devices) devices,(SELECT count(*)::int FROM agentstudio.native_local_jobs) jobs,(SELECT count(*)::int FROM agentstudio.native_local_receipts) receipts')).rows[0];assert.deepEqual(after,baseline)
   const db=await executorPool.connect();try{await db.query('BEGIN READ ONLY');await db.query('SET LOCAL ROLE agentstudio_local_executor');await assert.rejects(db.query('SELECT * FROM agentstudio.native_local_devices'),e=>e.code==='42501')}finally{await db.query('ROLLBACK');db.release()}
  })
 }finally{if(executorPool)await executorPool.end();admin?.release();if(adminPool)await adminPool.end();await f?.close()}
})
