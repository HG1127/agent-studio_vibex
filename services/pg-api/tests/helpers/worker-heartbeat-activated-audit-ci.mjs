// Author-only TCP2 for ONE fresh disposable hosted PG18 service.
// Import-safe: builtins + original private gate only. No SQL is run locally.
// Not an operator/receipt, Native bridge, reporter, or production activation.
import {createHash,randomBytes} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

const reader='studio_telemetry_reader',owner='studio_telemetry_owner'
const kinds=['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment']
const writers=kinds.flatMap(kind=>[1,2].map(slot=>'studio_telemetry_tx_'+kind+'_'+slot))
const roleNames=[owner,reader,...writers]
const enabledLogins=[reader,'studio_telemetry_tx_prepare_1','studio_telemetry_tx_model_2']
const extraRole='studio_telemetry_tcp_catalog_extra',aliasAm='telemetry_tcp_catalog_heap_alias'
const pins=[
 ['../../../../db/postgres/telemetry/001_worker_heartbeats.sql','5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f'],
 ['../../../../db/postgres/migrations/pg_v9_050_agent_memory_context.sql','d7889f7dc7be4cd6a8d6d00d2895a1c954c29da6d66d1b55ba02534e43275c89'],
 ['../../../../db/postgres/migrations/pg_v9_060_agent_descriptive_patch.sql','b8aac275e692a81d2e05c8825f33bba7e5f418199e3dce97a409832f951ccbc9'],
 ['../../../../db/postgres/migrations/pg_v9_061_company_overview.sql','fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923'],
 ['../../src/worker-heartbeat-audit-core.ts','1f90a04ff358f9922020f6070a931c4f1aa621b945b4de927454b0fb5607b33e'],
 ['../../src/worker-heartbeat-audit.ts','da5923b04947a7338a90e9f065ebd07f39909372805741e0dc6986b0a86452db'],
 ['../worker-heartbeat-audit.test.mjs','d00cf851d4b892a26e14526e117b3a65ff22a9eff0ad19846101a2c41962f7f1'],
 ['../../src/worker-heartbeat-activated-audit-core.ts','ba670a1722b241781f6cd28b85bbd571ff1919bac47e5f1ebca090ddfcff28b5'],
 ['../../src/worker-heartbeat-activated-audit.ts','977bc53eeee5aec9f4fcb7e663b11e121583618246df6615ed8b0554eedba1ee'],
 ['../worker-heartbeat-activated-audit.test.mjs','e2989f563f2a63de44d4c9b4e7ba3c5beeb6eeb0185e83b2eeca0c4176c4d9fb'],
]
const expectedResult={schema:'telemetry_v1',phase:'activated_reader_catalog_only',catalog_verified:true,
 registry_verified:false,activation_current_verified:false,native_authorization_verified:false,runtime_readiness_verified:false}
const dormantResult={schema:'telemetry_v1',phase:'schema_full_dormant',runtime_activated:false}
const hash=value=>createHash('sha256').update(value).digest('hex')
const quote=value=>'"'+value.replaceAll('"','""')+'"'
const check=(ok,label)=>{if(!ok)throw Error('telemetry_active_catalog_check_'+label)}
const equal=(a,b,label)=>check(JSON.stringify(a)===JSON.stringify(b),label)
export function heartbeatActivatedAuditSafeError(label,error){
 const code=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'no_sqlstate'
 const detail=/^telemetry_active_catalog_(?:check|timeout)_[a-z0-9_]{1,100}$/.test(error?.message??'')?error.message:'operation_failed'
 return Error('telemetry_active_catalog_'+label+'_'+code+'_'+detail)
}
async function bounded(work,label,ms=6000){
 let timer
 try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('telemetry_active_catalog_timeout_'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
async function sqlRefused(work,code){let ok=false;try{await work()}catch(error){ok=error?.code===code}check(ok,'expected_sqlstate_'+code)}
function sources(){
 return pins.map(([path,pin])=>{const text=readFileSync(new URL(path,import.meta.url),'utf8');check(hash(text)===pin,'source_pin');return text})
}

export async function workerHeartbeatActivatedAuditFixture(capability){
 // The genuine WeakSet capability must be checked before file reads, pg,
 // business imports or any database access. No copied plan grants authority.
 const options=workerHeartbeatCiAdminOptions(capability,'telemetry')
 const source=sources()
 const [{workerHeartbeatDomainFixture},{default:pg},active,core,dormant,company,{makeNativeScramVerifier}]=await Promise.all([
  import('./worker-heartbeat-domain-fixture.mjs'),import('pg'),import('../../src/worker-heartbeat-activated-audit.ts'),
  import('../../src/worker-heartbeat-activated-audit-core.ts'),import('../../src/worker-heartbeat-audit.ts'),
  import('../../src/company-overview-audit.ts'),import('../../src/native-activation-cli.mjs'),
 ])
 let domain,rawReaderPool,profile,mainImage,registryImage,originalRoles,snapshotDefinition,legacyOid
 let ended=false,finished=false,poolEnded=false,loginReset=false
 const secrets=new Map(),activated=new Set(),directClients=new Set(),leases=new Set(),trace=[]
 const tag=sql=>/^\/\* telemetry_v1_reader_catalog:([a-z_]+) \*\//.exec(sql)?.[1]
 const readerPool={async connect(){
  const db=await rawReaderPool.connect();leases.add(db)
  let released=false
  return {
   // Observe literal queries only; forward the REAL pg.Result unchanged.
   query(sql,args){trace.push(sql);return db.query(sql,args)},
   release(){check(!released,'no_double_release');db.release();released=true;leases.delete(db)},
  }
 }}
 async function install(pool,ddl){
  const db=await pool.connect()
  try{await db.query(ddl)}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
 }
 async function full(){
  await domain.h.withActor(domain.pool,domain.identities.alice,async db=>{
   check(await domain.h.verifyAgentDescriptivePatchCredentials(db)===true,'original_full060')
   await company.verifyCompanyOverviewSchema(db)
  })
 }
 async function image(){
  const tables=(await domain.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows
  check(tables.some(r=>r.nspname==='agentstudio_auth'&&r.relname==='sessions'),'main_sessions_in_physical_image')
  const parts=tables.map(r=>"SELECT '"+r.nspname+'.'+r.relname+"' AS name,coalesce(jsonb_agg(jsonb_build_array(x.xmin::text,x.ctid::text,to_jsonb(x)) ORDER BY x.ctid),'[]'::jsonb) AS rows FROM "+quote(r.nspname)+'.'+quote(r.relname)+' x')
  const result=(await domain.db.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS image FROM ('+parts.join(' UNION ALL ')+') s')).rows[0].image
  return hash(JSON.stringify(result)) // Private digest, never logged.
 }
 async function registry(){
  const rows=(await domain.telemetryPool.query("SELECT jsonb_build_object('kinds',(SELECT jsonb_agg(to_jsonb(k) ORDER BY ordinal) FROM studio_telemetry.kind_config k),'slots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY kind,slot_no) FROM studio_telemetry.slot_state s)) AS value")).rows
  check(rows.length===1,'registry_admin_image')
  return hash(JSON.stringify(rows[0].value)) // All values, no raw generation emitted.
 }
 async function roleRows(){
  return (await domain.telemetryPool.query("SELECT oid::integer AS oid,rolname::text AS name,rolcanlogin AS login,rolinherit AS inherit,rolsuper AS super,rolbypassrls AS bypass,rolcreatedb AS create_db,rolcreaterole AS create_role,rolreplication AS replication,rolconnlimit AS connection_limit,rolconfig AS config,rolvaliduntil IS NULL AS no_expiry,(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS memberships FROM pg_catalog.pg_roles r WHERE starts_with(rolname,'studio_telemetry_') ORDER BY rolname")).rows
 }
 async function transaction(work){
  await domain.verifyTelemetryTarget()
  const db=await domain.telemetryPool.connect()
  try{await db.query('BEGIN');await work(db);await db.query('COMMIT')}
  catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
  finally{db.release()}
 }
 async function commands(db,statements){for(const sql of statements)await db.query(sql)}
 async function audit(expectation=profile){
  let value
  try{value=await active.inspectWorkerHeartbeatActivatedCatalog(readerPool,expectation)}catch(error){
   const allowed=['target','roles','namespace','tables','columns','not_nulls','constraints','indexes','policies','routines','acl','boundaries','database_acl','sensitive']
   const last=trace.map(tag).filter(Boolean).at(-1)
   process.stderr.write(JSON.stringify({diagnostic:'worker_heartbeat_active_catalog_failure_v1',last_catalog_query:allowed.includes(last)?last:'none'})+'\n')
   throw error
  }
  equal(value,expectedResult,'catalog_only_result')
  check(Object.isFrozen(value)&&leases.size===0,'audit_released_all_clients')
  return value
 }
 async function refused(expectation=profile,requiredTag){
  const start=trace.length
  let ok=false
  try{await active.inspectWorkerHeartbeatActivatedCatalog(readerPool,expectation)}
  catch(error){ok=error?.status===503&&error?.code==='worker_heartbeat_reader_catalog_unavailable'}
  check(ok&&leases.size===0,'actual_reader_catalog_refused')
  if(requiredTag)check(trace.slice(start).some(sql=>tag(sql)===requiredTag),'actual_query_reached_'+requiredTag)
 }
 async function withReader(work){
  const db=await readerPool.connect()
  try{return await work(db)}finally{db.release()}
 }
 async function scopedCoreRefused(db,begin='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',path='pg_catalog'){
  await db.query(begin)
  try{
   check(['pg_catalog','public'].includes(path),'closed_context_path')
   await db.query('SET LOCAL search_path='+path)
   let ok=false
   try{await core.verifyWorkerHeartbeatActivatedCatalogCore(db,profile)}catch(error){ok=error?.message==='unsafe_worker_heartbeat_reader_catalog'}
   check(ok,'real_context_core_refused')
  }finally{await db.query('ROLLBACK')}
 }
 async function drift(apply,restore,observe,requiredTag){
  await audit()
  const before=await registry()
  // A distinct real reader cannot see uncommitted DDL. Commit a visible drift,
  // then compensate in finally and verify real recovery. Never fake visibility.
  try{
   await transaction(db=>commands(db,apply))
   if(observe)await observe()
   await refused(profile,requiredTag)
  }finally{
   await transaction(db=>commands(db,restore))
   check(await registry()===before,'drift_preserves_registry_logical_values')
   await audit()
  }
 }
 const clientFor=(name,password)=>{
  const db=new pg.Client({...options,user:name,password,application_name:'telemetry_catalog_tcp_synthetic',
   connectionTimeoutMillis:5000,statement_timeout:12000,query_timeout:17000})
  db.on('error',()=>{});directClients.add(db);return db
 }
 async function endClient(db){
  await bounded(db.end(),'direct_client_end');directClients.delete(db)
 }
 async function activate(){
  for(const name of enabledLogins){
   check(roleNames.includes(name)&&name!==owner,'fixture_owned_login')
   const password=randomBytes(40).toString('hex'),verifier=makeNativeScramVerifier(password)
   secrets.set(name,password);activated.add(name)
   await domain.telemetryPool.query('ALTER ROLE '+quote(name)+" LOGIN PASSWORD '"+verifier.replaceAll("'","''")+"'")
  }
  rawReaderPool=new pg.Pool({...options,user:reader,password:secrets.get(reader),max:2,min:0,idleTimeoutMillis:0,
   connectionTimeoutMillis:5000,statement_timeout:12000,query_timeout:17000,application_name:'telemetry_catalog_tcp_reader'})
  rawReaderPool.on('error',()=>{})
  const rows=await roleRows()
  equal(rows.map(r=>r.name).sort(),[...roleNames].sort(),'exact_eighteen_role_names')
  for(const row of rows){
   check(originalRoles.get(row.name)===row.oid&&row.login===enabledLogins.includes(row.name),'actual_oid_login_profile')
   check(['inherit','super','bypass','create_db','create_role','replication'].every(k=>row[k]===false)&&row.config===null&&row.no_expiry===true&&row.memberships===0,'actual_restricted_flags')
   check(row.connection_limit===(row.name===owner?-1:row.name===reader?2:1),'actual_connection_limits')
  }
  const target=(await domain.telemetryPool.query("SELECT d.oid::integer AS database_oid,d.datdba::integer AS database_owner_oid,(SELECT oid::integer FROM pg_catalog.pg_namespace WHERE nspname='studio_telemetry') AS schema_oid FROM pg_catalog.pg_database d WHERE datname=current_database()")).rows[0]
  // Actual ADMIN catalog values become TEST comparisons only, not a receipt.
  profile={protocol:'worker_heartbeat_reader_catalog_expectations_v1',...target,roles:roleNames.map(name=>structuredClone(rows.find(r=>r.name===name)))}
  snapshotDefinition=(await domain.telemetryPool.query("SELECT pg_catalog.pg_get_functiondef('studio_telemetry.snapshot()'::regprocedure) AS ddl")).rows[0].ddl
  legacyOid=(await domain.telemetryPool.query("SELECT oid::integer AS oid FROM pg_catalog.pg_roles WHERE rolname='agentstudio_api'")).rows[0].oid
  await audit()
 }
 async function closeActors(){
  let failed=leases.size!==0
  for(const db of [...directClients])try{await endClient(db)}catch{failed=true}
  if(rawReaderPool&&!poolEnded){
   if(rawReaderPool.waitingCount!==0)failed=true
   try{
    await bounded(rawReaderPool.end(),'reader_pool_end')
    if(rawReaderPool.totalCount!==0||rawReaderPool.idleCount!==0)failed=true
   }catch{failed=true}
   poolEnded=true
  }
  check(!failed,'owned_connections_closed')
 }
 async function resetLogins(){
  if(loginReset)return
  for(const name of activated)await domain.telemetryPool.query('ALTER ROLE '+quote(name)+' NOLOGIN PASSWORD NULL')
  secrets.clear();loginReset=true
 }
 async function finish(){
  if(finished)return
  sources();await domain.verifyTelemetryTarget();await audit()
  check(await registry()===registryImage,'original_registry_values_unchanged')
  check(leases.size===0&&rawReaderPool.waitingCount===0,'reader_pool_fully_released')
  await closeActors();await resetLogins()
  equal(await dormant.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool),dormantResult,'original_dormant_schema_restored')
  const roles=await roleRows()
  check(roles.length===18&&roles.every(r=>r.login===false&&originalRoles.get(r.name)===r.oid),'all_original_role_oids_nologin_restored')
  check((await domain.telemetryPool.query('SELECT count(*)::integer AS n FROM pg_catalog.pg_am WHERE amname=$1',[aliasAm])).rows[0].n===0,'no_heap_alias_left')
  await full();check(await image()===mainImage,'main_physical_rows_unchanged')
  check(await registry()===registryImage,'final_registry_logical_rows_unchanged')
  finished=true
 }
 try{
  domain=await workerHeartbeatDomainFixture()
  await install(domain.adminPool,source[3]) // Original061, before main baseline.
  await full()
  equal((await domain.db.query("SELECT version FROM agentstudio.schema_migrations WHERE version=ANY($1::text[]) ORDER BY version",[['pg_v9_050','pg_v9_060','pg_v9_061']])).rows.map(r=>r.version),['pg_v9_050','pg_v9_060','pg_v9_061'],'original_050_060_061_present')
  mainImage=await image()
  check(await dormant.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool)===false,'empty_new_domain')
  await install(domain.telemetryPool,source[0])
  equal(await dormant.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool),dormantResult,'original_dormant_before_logins')
  const installed=await roleRows()
  check(installed.length===18&&installed.every(r=>r.login===false),'eighteen_initial_nologin')
  originalRoles=new Map(installed.map(r=>[r.name,r.oid]));registryImage=await registry()
  await activate()
  check(await image()===mainImage,'domain_setup_did_not_change_main_rows')
  return {
   async baseline(){sources();await domain.verifyTelemetryTarget();await full();await audit();check(await registry()===registryImage&&await image()===mainImage,'baseline_isolated')},
   async readerIdentityAndLimits(){
    const a=await readerPool.connect(),b=await readerPool.connect()
    try{
     const facts=[]
     for(const db of [a,b])facts.push((await db.query("SELECT session_user::text AS login,current_user::text AS actor,pg_backend_pid()::integer AS pid,current_database() AS database,r.oid::integer AS oid,r.rolcanlogin AS enabled,r.rolconnlimit AS limit FROM pg_catalog.pg_roles r WHERE rolname=session_user")).rows[0])
     check(facts.every(r=>r.login===reader&&r.actor===reader&&r.database==='agent_studio_telemetry'&&r.oid===originalRoles.get(reader)&&r.enabled===true&&r.limit===2)&&facts[0].pid!==facts[1].pid,'two_real_reader_backends')
     const third=clientFor(reader,secrets.get(reader))
     try{await sqlRefused(()=>third.connect(),'53300')}finally{await endClient(third)}
    }finally{a.release();b.release()}
    await audit()
   },
   async ownerAndWriterRefused(){
    const admin=await domain.telemetryPool.connect()
    try{check((await admin.query('SELECT session_user::text AS name')).rows[0].name==='agentstudio_admin','actual_database_owner_session');await scopedCoreRefused(admin)}finally{admin.release()}
    const name=enabledLogins[1],db=clientFor(name,secrets.get(name))
    try{
     await db.connect()
     const actual=(await db.query('SELECT session_user::text AS name,current_user::text AS actor')).rows[0]
     check(actual.name===name&&actual.actor===name,'actual_writer_login')
     await scopedCoreRefused(db)
    }finally{await endClient(db)}
    await audit()
   },
   async profileRefusals(){
    const bad=structuredClone(profile);bad.roles[2].oid=legacyOid
    await refused(bad,'roles')
    const mismatch=structuredClone(profile);mismatch.roles[2].login=!mismatch.roles[2].login
    await refused(mismatch,'roles')
    for(const change of [p=>p.roles.pop(),p=>p.roles.push({...p.roles[0]}),p=>{p.roles[0].login=true},p=>{p.roles[1].login=false},p=>{p.activation_epoch='not_a_receipt'}]){
     const invalid=structuredClone(profile);change(invalid)
     await refused(invalid)
    }
    await audit()
   },
   ownerLoginDrift:()=>drift(['ALTER ROLE '+quote(owner)+' LOGIN'],['ALTER ROLE '+quote(owner)+' NOLOGIN'],async()=>check((await roleRows()).find(r=>r.name===owner).login===true,'owner_login_drift_visible'),'roles'),
   readerNoLoginDrift:()=>drift(['ALTER ROLE '+quote(reader)+' NOLOGIN'],['ALTER ROLE '+quote(reader)+' LOGIN'],async()=>check((await roleRows()).find(r=>r.name===reader).login===false,'reader_nologin_visible_on_existing_tcp'),'roles'),
   extraRoleDrift:()=>drift(['CREATE ROLE '+quote(extraRole)+' NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION'],['DROP ROLE IF EXISTS '+quote(extraRole)],async()=>check((await roleRows()).length===19,'actual_nineteenth_role'),'roles'),
   async roleFlagDrifts(){
    const name=enabledLogins[1]
    for(const [change,restore,field,value]of [['INHERIT','NOINHERIT','inherit',true],['CONNECTION LIMIT 2','CONNECTION LIMIT 1','connection_limit',2]]){
     await drift(['ALTER ROLE '+quote(name)+' '+change],['ALTER ROLE '+quote(name)+' '+restore],async()=>check((await roleRows()).find(r=>r.name===name)[field]===value,'actual_role_attribute_drift'),'roles')
    }
   },
   async heapAliasDrift(){
    check((await domain.telemetryPool.query('SELECT count(*)::integer AS n FROM pg_catalog.pg_am WHERE amname=$1',[aliasAm])).rows[0].n===0,'fresh_heap_alias_absent')
    return drift(
    ['CREATE ACCESS METHOD '+quote(aliasAm)+' TYPE TABLE HANDLER pg_catalog.heap_tableam_handler','ALTER TABLE studio_telemetry.kind_config SET ACCESS METHOD '+quote(aliasAm)],
    ['ALTER TABLE studio_telemetry.kind_config SET ACCESS METHOD heap','DROP ACCESS METHOD IF EXISTS '+quote(aliasAm)],
    async()=>{
     const actual=(await domain.telemetryPool.query("SELECT a.amname::text AS name,a.amtype::text AS type,a.amhandler='pg_catalog.heap_tableam_handler(pg_catalog.internal)'::regprocedure::oid AS builtin FROM pg_catalog.pg_class c JOIN pg_catalog.pg_am a ON a.oid=c.relam WHERE c.oid='studio_telemetry.kind_config'::regclass")).rows[0]
     check(actual.name===aliasAm&&actual.type==='t'&&actual.builtin===true,'real_alias_with_real_builtin_handler')
    },'tables')
   },
   tableAclDrift:()=>drift(['GRANT SELECT ON studio_telemetry.slot_state TO '+quote(reader)],['REVOKE SELECT ON studio_telemetry.slot_state FROM '+quote(reader)],
    async()=>check((await domain.telemetryPool.query("SELECT has_table_privilege($1::name,'studio_telemetry.slot_state','SELECT') AS granted",[reader])).rows[0].granted===true,'real_table_acl_visible'),'acl'),
   columnAclDrift:()=>drift(['GRANT SELECT(generation) ON studio_telemetry.slot_state TO '+quote(reader)],['REVOKE SELECT(generation) ON studio_telemetry.slot_state FROM '+quote(reader)],
    async()=>check((await domain.telemetryPool.query("SELECT attacl IS NOT NULL AS changed FROM pg_catalog.pg_attribute WHERE attrelid='studio_telemetry.slot_state'::regclass AND attname='generation'")).rows[0].changed===true,'real_column_acl_visible'),'columns'),
   columnDefaultDrift:()=>drift(['ALTER TABLE studio_telemetry.kind_config ALTER COLUMN enabled SET DEFAULT true'],['ALTER TABLE studio_telemetry.kind_config ALTER COLUMN enabled SET DEFAULT false'],
    async()=>check((await domain.telemetryPool.query("SELECT pg_get_expr(d.adbin,d.adrelid) AS value FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='studio_telemetry.kind_config'::regclass AND a.attname='enabled'")).rows[0].value==='true','real_default_drift_visible'),'columns'),
   routineBodyDrift:()=>drift(
    ["CREATE OR REPLACE FUNCTION studio_telemetry.snapshot() RETURNS jsonb LANGUAGE plpgsql VOLATILE CALLED ON NULL INPUT SECURITY DEFINER PARALLEL UNSAFE SET search_path=pg_catalog AS $tcp_catalog_drift$\nBEGIN\n RETURN NULL;\nEND\n$tcp_catalog_drift$;"],
    [snapshotDefinition],async()=>check((await domain.telemetryPool.query("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS sha FROM pg_catalog.pg_proc WHERE oid='studio_telemetry.snapshot()'::regprocedure")).rows[0].sha!=='17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec','real_routine_hash_drift'),'routines'),
   async readerRawDenied(){
    await withReader(async db=>{
     for(const sql of ['SELECT * FROM studio_telemetry.kind_config','SELECT generation FROM studio_telemetry.slot_state','SELECT * FROM pg_catalog.pg_authid','SELECT * FROM pg_catalog.pg_shadow','SET ROLE studio_telemetry_owner'])await sqlRefused(()=>db.query(sql),'42501')
     const rights=(await db.query("SELECT has_function_privilege(current_user,'studio_telemetry.snapshot()','EXECUTE') AS snapshot,has_function_privilege(current_user,'studio_telemetry.record(text,text,bigint,text,text)','EXECUTE') AS record,has_table_privilege(current_user,'studio_telemetry.slot_state','SELECT') AS raw,has_database_privilege(current_user,current_database(),'TEMPORARY') AS temp")).rows[0]
     equal(rights,{snapshot:true,record:false,raw:false,temp:false},'reader_snapshot_only_rights')
    })
    await audit()
   },
   async dormantRejects(){
    let ok=false
    try{await dormant.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool)}catch(error){ok=error?.status===503&&error?.code==='worker_heartbeat_schema_unavailable'}
    check(ok,'original_dormant_rejects_actual_login_activation');await audit()
   },
   async contextsRefuse(){
    for(const [begin,path]of [['BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','pg_catalog'],['BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE','pg_catalog'],['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','public']]){
     await withReader(db=>scopedCoreRefused(db,begin,path))
    }
    await audit()
   },
   finish,
   async close(){
    if(ended)return;ended=true
    let failed=false
    try{if(!finished)await finish()}catch{failed=true}
    try{await closeActors()}catch{failed=true}
    try{await resetLogins()}catch{failed=true}
    try{if(mainImage){await full();check(await image()===mainImage,'cleanup_main_physical_unchanged')}}catch{failed=true}
    try{await domain.close()}catch{failed=true}
    secrets.clear()
    check(!failed,'cleanup_and_restoration')
   },
  }
 }catch(error){
  try{await closeActors()}catch{}
  try{if(domain)await resetLogins()}catch{}
  try{await domain?.close()}catch{}
  secrets.clear()
  throw heartbeatActivatedAuditSafeError('fixture_failed',error)
 }
}
