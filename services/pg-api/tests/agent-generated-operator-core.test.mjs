// Pure query doubles only. These tests are not PostgreSQL/DDL acceptance.
import test,{before} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {captureGeneratedOperatorSources} from '../src/agent-generated-operator-source.mjs'
import {parseGeneratedOperatorApproval,verifyGeneratedOperatorBackupEvidence,assertGeneratedOperatorAuthorization,parseGeneratedOperatorJournal,applyGeneratedOperator,inspectGeneratedOperator,
  commitGeneratedOperatorTransaction,GeneratedOperatorCommitUnknown,GeneratedOperatorInstalledUnverified,verifyGeneratedOperatorRuntimeLogin,
  generatedOperatorCatalogSql,generatedOperatorContextSql,generatedOperatorTargetSql} from '../src/agent-generated-operator-core.ts'
let snapshot
before(async()=>{snapshot=await captureGeneratedOperatorSources()})
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),catalog={synthetic:'catalog metadata only'},prefix='a'.repeat(64)
function evidence({backupAge=20000,restoreAge=10000,expiresIn=3600000}={}){
  const now=Date.now(),target={system_identifier:'1234567890123456789',database_oid:'42'},schema=hash(catalog),fresh=snapshot.manifest.default_fresh_source_sha256
  const backup={format:'pg18_generated_059_backup_v1',archive_sha256:prefix,...target,predecessor_schema_sha256:schema,fresh_runtime_source_sha256:fresh,captured_at:new Date(now-backupAge).toISOString()}
  const restore={format:'pg18_generated_059_restore_v1',backup_manifest_sha256:hash(backup),archive_sha256:prefix,...target,predecessor_schema_sha256:schema,verified_at:new Date(now-restoreAge).toISOString(),restored:true}
  const raw={format:'agent_generated_operator_approval_v1',source_sha256:snapshot.source_sha256,...target,predecessor_schema_sha256:schema,fresh_runtime_source_sha256:fresh,
    backup_manifest_sha256:hash(backup),backup_archive_sha256:prefix,restore_evidence_sha256:hash(restore),expires_at:new Date(now+expiresIn).toISOString(),feature_disabled:true,maintenance_approved:true}
  const approval=parseGeneratedOperatorApproval(raw,snapshot)
  verifyGeneratedOperatorBackupEvidence(approval,backup,restore,hash(backup),hash(restore))
  return {approval,raw,backup,restore}
}
const journal=approval=>({format:'agent_generated_operator_journal_v1',source_sha256:approval.source_sha256,system_identifier:approval.system_identifier,database_oid:approval.database_oid,
  predecessor_schema_sha256:approval.predecessor_schema_sha256,nonce:'00000000-0000-4000-8000-000000000001',backend_pid:77,backend_start:'2026-10-27 00:00:00+00',phase:'before_ddl'})
function pool({locked=true,active=false,targetChanged=false,connections=0,catalogChanged=false,failRollback=false,failContext=false,recoveryReadOnly=true,runtimeKind,runtimeMember=true,runtimeIdentityChanged=false}={}){
  const trace=[],released=[];let connects=0
  const client={release(destroy=false){released.push(destroy)},async query(sql,values=[]){
    trace.push({sql,values})
    if(sql===generatedOperatorContextSql&&failContext)throw Error('synthetic_context_refused')
    if(sql==="SELECT pg_catalog.current_setting('transaction_read_only')='on' AS read_only")return {rows:[{read_only:recoveryReadOnly}]}
    if(runtimeKind&&sql.includes('session_user=$1'))return {rows:[{ok:true}]}
    if(runtimeKind&&sql.startsWith('SELECT pg_has_role(session_user,'))return {rows:[{ok:runtimeMember}]}
    if(runtimeKind&&sql==='SELECT session_user AS login,current_user AS role')return {rows:[{login:runtimeIdentityChanged?'different_login':{api:'agentstudio_stage_login',worker:'agentstudio_stage_worker',identity:'agentstudio_bound_dispatch_login',broker:'agentstudio_model_broker_login'}[runtimeKind],role:runtimeKind==='identity'?'agentstudio_bound_dispatch':runtimeKind==='broker'?'agentstudio_model_broker':'agentstudio_api'}]}
    if(sql===generatedOperatorTargetSql)return {rows:[{system_identifier:targetChanged?'9':'1234567890123456789',database_oid:'42',backend_pid:77,backend_start:'synthetic backend start'}]}
    if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{locked}]}
    if(sql.includes('backend_start::text=$2'))return {rows:[{active}]}
    if(sql.startsWith('SELECT count(*)::integer AS count'))return {rows:[{count:connections}]}
    if(sql==='SELECT version,description FROM agentstudio.schema_migrations ORDER BY version')return {rows:[{version:'pg_v9_058',description:'synthetic058'},{version:'pg18_fresh_runtime_001',description:JSON.stringify({format:'pg18_fresh_runtime_v1',latest_migration:'pg_v9_050',source_sha256:snapshot.manifest.default_fresh_source_sha256,legacy_rows_copied:0,legacy_import_versions_fabricated:false})}]}
    if(sql===generatedOperatorCatalogSql)return {rows:[{catalog:catalogChanged?{}:catalog}]}
    if(sql==='ROLLBACK'&&failRollback)throw Error('rollback transport failed')
    return {rows:[]}
  }}
  return {trace,released,get connects(){return connects},async connect(){connects++;return client}}
}
test('closed approval rejects scope additions, getters, absent source/target/backup binding and stale approvals',()=>{
  const {raw}=evidence()
  for(const patch of [{extra:true},{feature_disabled:false},{maintenance_approved:false},{source_sha256:prefix},{database_oid:'0'},{expires_at:new Date(0).toISOString()},{backup_archive_sha256:'bad'}])assert.throws(()=>parseGeneratedOperatorApproval({...raw,...patch},snapshot))
  let reads=0;const getter={...raw};Object.defineProperty(getter,'source_sha256',{get(){reads++;return prefix},enumerable:true})
  assert.throws(()=>parseGeneratedOperatorApproval(getter,snapshot));assert.equal(reads,0)
  assert.throws(()=>parseGeneratedOperatorApproval(Object.assign(Object.create(null),raw),snapshot))
})
test('backup and restore evidence must independently bind exact archive, target, predecessor and fresh050 digest',()=>{
  const {approval,backup,restore}=evidence()
  for(const [b,r,bh,rh]of [[backup,restore,prefix,approval.restore_evidence_sha256],[{...backup,system_identifier:'9'},restore,approval.backup_manifest_sha256,approval.restore_evidence_sha256],
    [backup,{...restore,restored:false},approval.backup_manifest_sha256,approval.restore_evidence_sha256],[backup,{...restore,verified_at:new Date(0).toISOString()},approval.backup_manifest_sha256,approval.restore_evidence_sha256]])assert.throws(()=>verifyGeneratedOperatorBackupEvidence(approval,b,r,bh,rh),/backup_changed/)
})
test('unbound evidence and forged snapshots refuse before a privileged connection is acquired',async()=>{
  const {raw,approval}=evidence(),db=pool()
  await assert.rejects(applyGeneratedOperator(db,snapshot,parseGeneratedOperatorApproval(raw,snapshot),async()=>{}),/backup_evidence_required/)
  await assert.rejects(applyGeneratedOperator(db,structuredClone(snapshot),approval,async()=>{}),/source_refused/)
  assert.equal(db.connects,0)
})
test('G059-OP-01: a previously verified approval cannot connect after real default-clock evidence expiry or refresh caller-owned timestamps',async t=>{
  let clock=Date.now();t.mock.method(Date,'now',()=>clock)
  const {approval,backup,restore}=evidence({backupAge:86400000-60000,restoreAge:86400000-90000})
  let connects=0;const sentinel={async connect(){connects++;throw Error('unexpected_connection')}}
  clock+=120000
  assert.ok(Date.parse(approval.expires_at)>Date.now(),'approval expiry remains valid; backup/restore age is the rejected condition')
  assert.throws(()=>verifyGeneratedOperatorBackupEvidence(approval,backup,restore,approval.backup_manifest_sha256,approval.restore_evidence_sha256),/backup_changed/)
  // Mutating the original proof objects cannot replace the private frozen copy
  // or re-brand the same approval with a newer unbound capture/restore time.
  backup.captured_at=new Date(clock).toISOString();restore.verified_at=new Date(clock).toISOString()
  assert.throws(()=>verifyGeneratedOperatorBackupEvidence(approval,backup,restore,approval.backup_manifest_sha256,approval.restore_evidence_sha256),/backup_changed/)
  await assert.rejects(applyGeneratedOperator(sentinel,snapshot,approval,async()=>{}),/backup_changed/)
  await assert.rejects(inspectGeneratedOperator(sentinel,snapshot,approval),/backup_changed/)
  assert.equal(connects,0)
})
test('verified backup age remains inclusive at24h and rejects the next millisecond without acquiring another connection',async t=>{
  let clock=Date.now();t.mock.method(Date,'now',()=>clock)
  const {approval}=evidence({backupAge:86400000-60000,restoreAge:86400000-90000})
  let connects=0;const sentinel={async connect(){connects++;throw Error('boundary_connection_sentinel')}}
  clock+=60000
  await assert.rejects(applyGeneratedOperator(sentinel,snapshot,approval,async()=>{}),/boundary_connection_sentinel/);assert.equal(connects,1)
  clock++
  await assert.rejects(applyGeneratedOperator(sentinel,snapshot,approval,async()=>{}),/backup_changed/);assert.equal(connects,1)
})
test('time spent awaiting a real connection capability is rechecked before BEGIN for install and readonly recovery',async t=>{
  const initial=Date.now();let clock=initial;t.mock.method(Date,'now',()=>clock)
  for(const mode of ['apply','inspect']){
    clock=initial;const {approval}=evidence({backupAge:86400000-60000,restoreAge:86400000-90000}),trace=[];let released=0
    const waiting={async connect(){await Promise.resolve();clock+=120000;return {release(){released++},async query(sql){trace.push(sql);return {rows:[]}}}}}
    await assert.rejects(mode==='apply'?applyGeneratedOperator(waiting,snapshot,approval,async()=>{}):inspectGeneratedOperator(waiting,snapshot,approval),/backup_changed/)
    assert.deepEqual(trace,['ROLLBACK'],'only cleanup may run after the awaited connection expired the proof');assert.equal(released,1)
  }
})
test('the actual pure gate used immediately before DDL rechecks immutable proof age and approval expiry after async work',async t=>{
  const initial=Date.now();let clock=initial;t.mock.method(Date,'now',()=>clock)
  for(const [options,advance,error]of [[{backupAge:86400000-60000,restoreAge:86400000-90000},120000,/backup_changed/],[{expiresIn:60000},60001,/invalid_evidence/]]){
    clock=initial;const {approval}=evidence(options)
    assert.equal(assertGeneratedOperatorAuthorization(snapshot,approval),approval)
    await Promise.resolve();clock+=advance
    assert.throws(()=>assertGeneratedOperatorAuthorization(snapshot,approval),error)
  }
})
test('wrong actual target, busy schema lock and active runtime connections rollback before any DDL or role impersonation',async()=>{
  const {approval}=evidence()
  for(const [config,error]of [[{targetChanged:true},/target_changed/],[{locked:false},/schema_lock_busy/],[{connections:1},/runtime_connections_present/],[{catalogChanged:true},/predecessor_changed/]]){
    const db=pool(config);await assert.rejects(applyGeneratedOperator(db,snapshot,approval,async()=>{}),error)
    assert.equal(db.connects,1);assert.equal(db.trace.at(-1).sql,'ROLLBACK');assert.deepEqual(db.released,[false])
    assert.ok(!db.trace.some(q=>q.sql===snapshot.body||q.sql==='COMMIT'||/SET SESSION|set_config|actor_id\(/.test(q.sql)))
  }
})
test('the real unchanged full auditor failure on the same client resets role and rolls back, never commits or skips audit',async()=>{
  const {approval}=evidence(),db=pool()
  await assert.rejects(applyGeneratedOperator(db,snapshot,approval,async()=>{}),/unsafe_agent_generated_privileges/)
  const sql=db.trace.map(q=>q.sql),role=sql.indexOf('SET LOCAL ROLE agentstudio_api')
  assert.ok(role>0);assert.ok(sql.slice(role+1).some(s=>s.includes('to_regprocedure(\'agentstudio.agent_opinion_body')))
  assert.equal(sql.at(-2),'RESET ROLE');assert.equal(sql.at(-1),'ROLLBACK');assert.equal(db.connects,1)
  assert.ok(!sql.includes(snapshot.body)&&!sql.includes('COMMIT'))
})

test('install and readonly recovery establish a fixed pg_catalog-first context before target, catalog and unchanged full audit',async()=>{
  assert.equal(generatedOperatorContextSql,'SET LOCAL search_path=pg_catalog,public')
  const {approval,raw}=evidence()
  for(const callerPath of ['pg_temp,public','attacker,pg_catalog','"$user",public'])assert.throws(()=>parseGeneratedOperatorApproval({...raw,search_path:callerPath},snapshot),/invalid_evidence/)
  for(const mode of ['apply','inspect']){
    const db=pool()
    await assert.rejects(mode==='apply'?applyGeneratedOperator(db,snapshot,approval,async()=>{}):inspectGeneratedOperator(db,snapshot,approval),/unsafe_agent_generated_privileges/)
    assert.equal(db.trace[1].sql,generatedOperatorContextSql)
    const catalogAt=db.trace.findIndex(q=>q.sql===generatedOperatorCatalogSql),contextAt=db.trace.findLastIndex((q,i)=>i<catalogAt&&q.sql===generatedOperatorContextSql)
    assert.ok(contextAt>0&&catalogAt>contextAt);assert.ok(db.trace.slice(catalogAt+1).some(q=>q.sql==='SET LOCAL ROLE agentstudio_api'))
    assert.ok(db.trace.filter(q=>q.sql.startsWith('SET LOCAL search_path')).every(q=>q.sql===generatedOperatorContextSql&&q.values.length===0))
    assert.ok(!db.trace.some(q=>/current_setting\('search_path'|RESET search_path|set_config\('search_path'/.test(q.sql)))
    assert.equal(db.trace.at(-1).sql,'ROLLBACK')
  }
})

test('failure to establish canonical context refuses install and readonly recovery before catalog, role switch or DDL',async()=>{
  const {approval}=evidence()
  for(const mode of ['apply','inspect']){
    const db=pool({failContext:true})
    await assert.rejects(mode==='apply'?applyGeneratedOperator(db,snapshot,approval,async()=>{}):inspectGeneratedOperator(db,snapshot,approval),/synthetic_context_refused/)
    assert.deepEqual(db.trace.map(q=>q.sql),[mode==='apply'?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',generatedOperatorContextSql,'ROLLBACK'])
    assert.deepEqual(db.released,[false])
  }
})
test('quiescence uses authenticated role OIDs and transitive MEMBER for custom review/index logins, excluding superuser observers',async()=>{
  const {approval}=evidence()
  const roles=['agentstudio_api','agentstudio_worker','agentstudio_native_auth','agentstudio_bound_dispatch','agentstudio_model_broker',
    'agentstudio_knowledge_index_worker','agentstudio_knowledge_index_broker','agentstudio_review_worker','agentstudio_review_dispatch']
  // The double supplies independently known catalog COUNT results; it does
  // not emulate PostgreSQL membership resolution. Hosted PG18 must prove it.
  for(const [name,expectedCount]of [['agentstudio_review_worker_login',1],['agentstudio_review_dispatch_login',1],['synthetic_assessment_worker',1],
    ['synthetic_assessment_dispatch',1],['custom_index_worker',1],['custom_api_transitive_noinherit',1],['postgres_readonly_observer',0]]){
    const db=pool({connections:expectedCount})
    await assert.rejects(applyGeneratedOperator(db,snapshot,approval,async()=>{}),expectedCount?/runtime_connections_present/:/unsafe_agent_generated_privileges/,name)
    const query=db.trace.find(q=>q.sql.startsWith('SELECT count(*)::integer AS count'))
    assert.deepEqual(query.values,[roles])
    assert.match(query.sql,/JOIN pg_catalog\.pg_roles login ON login\.oid=a\.usesysid/)
    assert.match(query.sql,/a\.pid<>pg_backend_pid\(\) AND NOT login\.rolsuper/)
    assert.match(query.sql,/pg_catalog\.pg_has_role\(login\.oid,runtime\.oid,'MEMBER'\)/)
    assert.doesNotMatch(query.sql,/usename|rolcanlogin|rolinherit|\bstate\s*=/,'no username whitelist, NOINHERIT/NOLOGIN or idle-session exemption')
    assert.ok(!db.trace.some(q=>q.sql===snapshot.body||q.sql==='COMMIT'))
    assert.equal(db.trace.at(-1).sql,'ROLLBACK');assert.deepEqual(db.released,[false])
  }
})
test('recovery is read-only and remains pending while the old transaction/serialization lock is unresolved',async()=>{
  const {approval}=evidence(),j=parseGeneratedOperatorJournal({...journal(approval),backend_pid:78},approval)
  for(const config of [{locked:false},{active:true}]){
    const db=pool(config),result=await inspectGeneratedOperator(db,snapshot,approval,j)
    assert.equal(result.state,'pending');assert.equal(result.installed,null);assert.equal(result.production_cutover_allowed,false)
    assert.equal(db.trace[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(db.trace.at(-1).sql,'ROLLBACK')
    assert.ok(!db.trace.some(q=>q.sql===snapshot.body||q.sql==='COMMIT'));assert.equal(db.connects,1)
  }
  assert.throws(()=>parseGeneratedOperatorJournal({...j,source_sha256:prefix},approval),/invalid_journal/)
})

test('recovery excludes only its own confirmed readonly backend and retains exact other-backend journal matching',async()=>{
  const {approval}=evidence(),j=parseGeneratedOperatorJournal(journal(approval),approval),db=pool()
  // The double supplies the activity predicate result; real one-connection
  // pool reuse and an independently active transaction are hosted assertions.
  await assert.rejects(inspectGeneratedOperator(db,snapshot,approval,j),/unsafe_agent_generated_privileges/)
  const active=db.trace.find(q=>q.sql.includes('backend_start::text=$2'))
  assert.match(active.sql,/pid=\$1 AND backend_start::text=\$2 AND pid<>pg_backend_pid\(\) AND xact_start IS NOT NULL/)
  assert.deepEqual(active.values,[j.backend_pid,j.backend_start]);assert.ok(db.trace.some(q=>q.sql.includes('pg_try_advisory_xact_lock')))
  const unsafe=pool({recoveryReadOnly:false});await assert.rejects(inspectGeneratedOperator(unsafe,snapshot,approval,j),/recovery_transaction_unsafe/)
  assert.deepEqual(unsafe.trace.map(q=>q.sql),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',generatedOperatorContextSql,"SELECT pg_catalog.current_setting('transaction_read_only')='on' AS read_only",'ROLLBACK'])
})

test('real-login gate precedes fixed granted audit role selection without replacing session_user or skipping original audit',async()=>{
  const expected={system_identifier:'1234567890123456789',database_oid:'42'}
  for(const [kind,role]of [['api','agentstudio_api'],['worker','agentstudio_api'],['identity','agentstudio_bound_dispatch'],['broker','agentstudio_model_broker']]){
    const db=pool({runtimeKind:kind})
    await assert.rejects(verifyGeneratedOperatorRuntimeLogin(db,kind,expected),/unsafe_agent_human_input_privileges/)
    const loginAt=db.trace.findIndex(q=>q.sql.includes('session_user=$1')),membershipAt=db.trace.findIndex(q=>q.sql.startsWith('SELECT pg_has_role(session_user,')),roleAt=db.trace.findIndex(q=>q.sql==='SET LOCAL ROLE '+role),auditAt=db.trace.findIndex(q=>q.sql==='SELECT to_regclass($1)::oid AS id')
    assert.ok(loginAt>=0&&membershipAt>loginAt&&roleAt>membershipAt&&auditAt>roleAt)
    assert.deepEqual(db.trace[membershipAt].values,[role]);assert.ok(db.trace[membershipAt].sql.includes("'SET'"))
    assert.ok(!db.trace.some(q=>/SET SESSION AUTHORIZATION|SET ROLE postgres|GRANT /.test(q.sql)));assert.equal(db.trace.at(-1).sql,'ROLLBACK')
    const denied=pool({runtimeKind:kind,runtimeMember:false});await assert.rejects(verifyGeneratedOperatorRuntimeLogin(denied,kind,expected),/runtime_login_unsafe/)
    assert.ok(!denied.trace.some(q=>q.sql.startsWith('SET LOCAL ROLE ')))
    const changed=pool({runtimeKind:kind,runtimeIdentityChanged:true});await assert.rejects(verifyGeneratedOperatorRuntimeLogin(changed,kind,expected),/runtime_login_unsafe/)
    assert.ok(!changed.trace.some(q=>q.sql==='SELECT to_regclass($1)::oid AS id'))
  }
  for(const kind of ['constructor','__proto__','postgres']){const db=pool();await assert.rejects(verifyGeneratedOperatorRuntimeLogin(db,kind,expected),/runtime_kind_invalid/);assert.equal(db.connects,0)}
})
test('commit boundary writes durable pending before COMMIT and acknowledges only its returned response',async()=>{
  const {approval}=evidence(),trace=[],j=journal(approval)
  const result=await commitGeneratedOperatorTransaction({async query(sql){trace.push(sql);return {rows:[]}}},j,async r=>{assert.ok(Object.isFrozen(r));trace.push(r.phase)})
  assert.deepEqual(trace,['commit_pending','COMMIT','commit_acknowledged']);assert.equal(result.phase,'commit_acknowledged')
})
test('lost COMMIT response records unknown with original identity; never retries DDL, COMMIT or ROLLBACK',async()=>{
  const {approval}=evidence(),j=journal(approval),trace=[]
  await assert.rejects(commitGeneratedOperatorTransaction({async query(sql){trace.push(sql);throw Error('synthetic lost response')}},j,async r=>trace.push(r.phase)),error=>{
    assert.ok(error instanceof GeneratedOperatorCommitUnknown);assert.equal(error.journal.nonce,j.nonce);assert.equal(error.journal.backend_pid,77);return true
  })
  assert.deepEqual(trace,['commit_pending','COMMIT','commit_unknown'])
  await assert.rejects(commitGeneratedOperatorTransaction({async query(){throw Error('lost')}},j,async r=>{if(r.phase==='commit_unknown')throw Error('journal full too')}),GeneratedOperatorCommitUnknown)
})
test('journal failure before commit prevents it; journal failure after acknowledged commit never claims rollback',async()=>{
  const {approval}=evidence(),j=journal(approval),trace=[]
  await assert.rejects(commitGeneratedOperatorTransaction({async query(sql){trace.push(sql)}},j,async()=>{throw Error('journal full')}),/journal full/)
  assert.deepEqual(trace,[])
  await assert.rejects(commitGeneratedOperatorTransaction({async query(sql){trace.push(sql)}},j,async r=>{if(r.phase==='commit_acknowledged')throw Error('disk lost')}),GeneratedOperatorInstalledUnverified)
  assert.deepEqual(trace,['COMMIT'])
})
test('rollback transport failure destroys the client; privileged install login cannot masquerade as runtime login',async()=>{
  const {approval}=evidence(),db=pool({targetChanged:true,failRollback:true})
  await assert.rejects(applyGeneratedOperator(db,snapshot,approval,async()=>{}),/target_changed/);assert.deepEqual(db.released,[true])
  const readonly=pool({locked:false,failRollback:true});assert.equal((await inspectGeneratedOperator(readonly,snapshot,approval)).state,'pending');assert.deepEqual(readonly.released,[true])
  const runtime=pool();await assert.rejects(verifyGeneratedOperatorRuntimeLogin(runtime,'api',{system_identifier:approval.system_identifier,database_oid:approval.database_oid}),/runtime_login_unsafe/)
  assert.ok(runtime.trace.some(q=>q.sql.includes('session_user=$1')&&q.values[0]==='agentstudio_stage_login'))
  assert.ok(!runtime.trace.some(q=>q.sql==='SET LOCAL ROLE agentstudio_api'));assert.equal(runtime.trace.at(-1).sql,'ROLLBACK')
})
