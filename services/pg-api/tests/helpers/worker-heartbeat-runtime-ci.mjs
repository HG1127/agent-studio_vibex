// Hosted synthetic telemetry ONLY. Import-safe: builtins + the original gate.
// This is not a production activator, reporter, Native grant or Worker runner.
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

export const heartbeatRuntimeKinds=Object.freeze(['prepare','model','workflow_safe','workflow_v2','agent_autonomous','knowledge_index','knowledge_query','assessment'])
const protocol='native_worker_heartbeat_report_v1',readerName='studio_telemetry_reader'
const rawPin='5ed1080d9f7b651ea2ae7fceca09db7f61c679f107e196df13ae201a8f99505f',companyPin='fc02db13a38de7fcb7a78afdadf9c966e58fc8339fd9cc1e57bac3fa84243923'
const bodies={record:'4e1fd93b6217d5cf414189f568d395f48a3e3e54e1ee455e65d28d4717e15143',snapshot:'17215237dbc5f81ba8fbbb2fd8eae2a9da7e0e0cfa859124ab50f3ccd60671ec'}
const digest=value=>createHash('sha256').update(value).digest('hex'),quote=value=>'"'+value.replaceAll('"','""')+'"'
const rpc='SELECT studio_telemetry.record($1::text,$2::text,$3::bigint,$4::text,$5::text) AS value'
export function heartbeatRuntimeCheck(ok,label){if(!ok)throw Error('telemetry_runtime_check_'+label)}
export const heartbeatRuntimeEqual=(a,b,label)=>heartbeatRuntimeCheck(JSON.stringify(a)===JSON.stringify(b),label)
export function heartbeatRuntimeSafeError(label,error){
 const code=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'no_sqlstate'
 const detail=/^telemetry_runtime_(?:check|timeout)_[a-z0-9_-]{1,100}$/.test(error?.message??'')?error.message:'operation_failed'
 // No cause, original stack, PG detail/query, parameters, role password or
 // generation is attached, even when a check or database operation fails.
 return Error('telemetry_runtime_'+label+'_'+code+'_'+detail)
}
export async function heartbeatRuntimeReject(operation,code){
 let refused=false
 try{await operation()}catch(error){refused=error?.code===code}
 heartbeatRuntimeCheck(refused,'expected_'+code)
}
async function bounded(operation,label,ms=12000){
 let timer
 try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('telemetry_runtime_timeout_'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
function ack(value,sequence){
 heartbeatRuntimeEqual(Object.keys(value??{}).sort(),['accepted','observed_at','sequence'],'ack_shape')
 heartbeatRuntimeCheck(value.accepted===true&&value.sequence===Number(sequence),'ack_sequence')
 heartbeatRuntimeCheck(typeof value.observed_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observed_at)&&Number.isFinite(Date.parse(value.observed_at)),'ack_database_stamp')
 return value
}

export async function workerHeartbeatRuntimeFixture(capability){
 // A cloned/forged plan fails BEFORE driver/source/fixture imports or writes.
 const options=workerHeartbeatCiAdminOptions(capability,'telemetry')
 const [{workerHeartbeatDomainFixture},{default:pg},audit,contract,company,{makeNativeScramVerifier}]=await Promise.all([
  import('./worker-heartbeat-domain-fixture.mjs'),import('pg'),import('../../src/worker-heartbeat-audit.ts'),
  import('../../src/worker-heartbeat-contract.ts'),import('../../src/company-overview-audit.ts'),import('../../src/native-activation-cli.mjs'),
 ])
 let domain,ended=false,beforeImage,lockSerial=0
 const clients=new Set(),actors=new Map(),secrets=new Map(),generations=new Map(),installedRoleIds=new Map()
 const check=heartbeatRuntimeCheck,equal=heartbeatRuntimeEqual
 const live=client=>{client.on('error',()=>{});clients.add(client);return client}
 const closeClient=async client=>{clients.delete(client);try{await bounded(client.end(),'client_cleanup',6000)}catch{throw Error('telemetry_runtime_check_client_cleanup')}}
 const makeClient=(role,password)=>live(new pg.Client({...options,user:role,password,application_name:'telemetry_runtime_synthetic',connectionTimeoutMillis:5000,statement_timeout:12000,query_timeout:17000}))
 const roleFor=(kind,slot)=>'studio_telemetry_tx_'+kind+'_'+slot
 const keyFor=(kind,slot)=>kind+':'+slot
 const validKind=kind=>check(heartbeatRuntimeKinds.includes(kind),'fixture_kind')
 async function install(pool,source){const db=await pool.connect();try{await db.query(source)}finally{try{await db.query('ROLLBACK')}finally{db.release()}}}
 async function image(){
  const rows=(await domain.db.query("SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows
  check(rows.some(r=>r.nspname==='agentstudio_auth'&&r.relname==='sessions'),'main_auth_image_present')
  const parts=rows.map(r=>"SELECT '"+r.nspname+'.'+r.relname+"' AS name,coalesce(jsonb_agg(jsonb_build_array(x.xmin::text,x.ctid::text,to_jsonb(x)) ORDER BY x.ctid),'[]'::jsonb) AS rows FROM "+quote(r.nspname)+'.'+quote(r.relname)+' x')
  const result=(await domain.db.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS image FROM ('+parts.join(' UNION ALL ')+') s')).rows[0].image
  return digest(JSON.stringify(result)) // Private comparison only, never emitted.
 }
 const full=()=>domain.h.withActor(domain.pool,domain.identities.alice,async db=>{check(await domain.h.verifyAgentDescriptivePatchCredentials(db)===true,'old_full060');await company.verifyCompanyOverviewSchema(db)})
 async function expectActiveAuditRefused(){let refused=false;try{await audit.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool)}catch(error){refused=error?.status===503&&error?.code==='worker_heartbeat_schema_unavailable'}check(refused,'active_dormant_audit_refused')}
 async function rowFingerprint(kind,slot,db=domain.telemetryPool){
  const rows=(await db.query('SELECT xmin::text AS xmin,ctid::text AS ctid,to_jsonb(s) AS value FROM studio_telemetry.slot_state s WHERE kind=$1 AND slot_no=$2',[kind,slot])).rows
  check(rows.length===1,'slot_present');return digest(JSON.stringify(rows))
 }
 async function row(kind,slot){
  const rows=(await domain.telemetryPool.query("SELECT last_sequence::text AS sequence,state,reason,draining,enabled,xmin::text AS xmin,ctid::text AS ctid,to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS observed_at FROM studio_telemetry.slot_state WHERE kind=$1 AND slot_no=$2",[kind,slot])).rows
  check(rows.length===1,'slot_view_present');return rows[0] // No generation/password.
 }
 async function kindTransaction(kind,operation,{shared=false}={}){
  validKind(kind);await domain.verifyTelemetryTarget()
  const db=await domain.telemetryPool.connect()
  try{
   await db.query('BEGIN')
   await db.query('SELECT kind FROM studio_telemetry.kind_config WHERE kind=$1 FOR '+(shared?'SHARE':'UPDATE'),[kind])
   await db.query('SELECT slot_no FROM studio_telemetry.slot_state WHERE kind=$1 ORDER BY slot_no FOR UPDATE',[kind])
   const result=await operation(db);await db.query('COMMIT');return result
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
 }
 async function reset(kind){
  validKind(kind);const next=[randomUUID(),randomUUID()]
  await kindTransaction(kind,async db=>{
   await db.query('UPDATE studio_telemetry.kind_config SET instrumented=true,enabled=true WHERE kind=$1',[kind])
   for(const slot of [1,2])await db.query('UPDATE studio_telemetry.slot_state SET enabled=true,generation=$3::uuid,last_sequence=0,state=NULL,reason=NULL,observed_at=NULL,draining=false WHERE kind=$1 AND slot_no=$2',[kind,slot,next[slot-1]])
  })
  for(const slot of [1,2]){const key=keyFor(kind,slot),previous=generations.get(key)?.current;generations.set(key,{current:next[slot-1],previous})}
 }
 async function setKind(kind,instrumented,enabled){await kindTransaction(kind,db=>db.query('UPDATE studio_telemetry.kind_config SET instrumented=$2,enabled=$3 WHERE kind=$1',[kind,instrumented,enabled]))}
 async function setSlotEnabled(kind,slot,enabled){await kindTransaction(kind,db=>db.query('UPDATE studio_telemetry.slot_state SET enabled=$3 WHERE kind=$1 AND slot_no=$2',[kind,slot,enabled]))}
 async function age(kind,ages){
  check(ages.length===2&&ages.every(n=>Number.isInteger(n)&&n>=0&&n<=3600000),'fixture_ages')
  await kindTransaction(kind,db=>db.query("UPDATE studio_telemetry.slot_state SET observed_at=date_trunc('milliseconds',clock_timestamp())-CASE slot_no WHEN 1 THEN $2::bigint ELSE $3::bigint END*interval '1 millisecond' WHERE kind=$1 AND last_sequence>0",[kind,...ages]))
 }
 async function injectTime(kind,slot,mode){
  check(['future','infinity','year10000','restore'].includes(mode),'fixture_clock_mode')
  const expression={future:"date_trunc('milliseconds',clock_timestamp())+interval '1 day'",infinity:"'infinity'::timestamptz",year10000:"'10000-01-01 00:00:00+00'::timestamptz",restore:"date_trunc('milliseconds',clock_timestamp())-interval '1 second'"}[mode]
  await kindTransaction(kind,db=>db.query('UPDATE studio_telemetry.slot_state SET observed_at='+expression+' WHERE kind=$1 AND slot_no=$2 AND last_sequence>0',[kind,slot]))
 }
 function parameters(actor,sequence,state='ready',reason='startup_checks_complete',changes={}){
  const tokens=generations.get(keyFor(actor.kind,actor.slot))
  let generation=tokens?.current
  if(Object.hasOwn(changes,'generation'))generation=changes.generation==='previous'?tokens?.previous:changes.generation
  return [Object.hasOwn(changes,'protocol')?changes.protocol:protocol,generation,sequence,state,reason]
 }
 async function send(actor,sequence,state='ready',reason='startup_checks_complete',changes={}){return ack((await actor.client.query(rpc,parameters(actor,sequence,state,reason,changes))).rows[0].value,sequence)}
 async function rejectReport(actor,sequence,state='ready',reason='startup_checks_complete',changes={},code='22023'){
  const before=await rowFingerprint(actor.kind,actor.slot)
  await heartbeatRuntimeReject(()=>actor.client.query(rpc,parameters(actor,sequence,state,reason,changes)),code)
  check(await rowFingerprint(actor.kind,actor.slot)===before,'refusal_did_not_mutate_slot')
 }
 async function snapshot({readonly=true}={}){
  const reader=actors.get(readerName)
  await reader.client.query(readonly?'BEGIN READ ONLY':'BEGIN')
  try{
   const result=(await reader.client.query('SELECT studio_telemetry.snapshot() AS value')).rows[0].value
   await reader.client.query('COMMIT')
   const parsed=contract.parseWorkerHeartbeatSnapshot(result)
   equal(parsed.workers.map(r=>r.kind),heartbeatRuntimeKinds,'eight_kind_order')
   check(parsed.stale_after_ms===90000,'snapshot_ttl')
   return parsed
  }catch(error){await reader.client.query('ROLLBACK').catch(()=>{});throw error}
 }
 async function identity(actor){
  const r=(await actor.client.query("SELECT current_database() AS database,session_user::text AS login,current_user::text AS actor,pg_backend_pid()::integer AS pid,r.oid::integer AS oid,r.rolcanlogin AS login_enabled,r.rolsuper AS super,r.rolinherit AS inherit,r.rolbypassrls AS bypass,r.rolcreatedb AS createdb,r.rolcreaterole AS createrole,r.rolreplication AS replication,r.rolconnlimit AS limit,r.rolconfig IS NULL AS no_config,(SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS memberships FROM pg_catalog.pg_roles r WHERE r.rolname=session_user")).rows[0]
  check(r.database==='agent_studio_telemetry'&&r.login===actor.role&&r.actor===actor.role&&r.login_enabled===true,'actual_independent_login')
  check(['super','inherit','bypass','createdb','createrole','replication'].every(key=>r[key]===false)&&r.no_config===true&&r.memberships===0,'restricted_role_flags')
  check(r.limit===(actor.role===readerName?2:1)&&Number.isSafeInteger(r.pid)&&r.pid>0&&installedRoleIds.get(actor.role)===r.oid,'role_limit_pid_and_original_oid')
  actor.pid=r.pid
  if(actor.kind){const slot=(await domain.telemetryPool.query('SELECT login_oid::integer AS oid,login_name FROM studio_telemetry.slot_state WHERE kind=$1 AND slot_no=$2',[actor.kind,actor.slot])).rows[0];check(slot.oid===r.oid&&slot.login_name===actor.role,'fixed_role_oid_slot')}
  return true
 }
 async function openActors(){
  const definitions=[{role:readerName},...heartbeatRuntimeKinds.flatMap(kind=>[1,2].map(slot=>({role:roleFor(kind,slot),kind,slot})))]
  for(const def of definitions){
   const password=randomBytes(40).toString('hex');secrets.set(def.role,password)
   const verifier=makeNativeScramVerifier(password)
   // Only fixture-owned telemetry roles are activated. No membership/ACL or
   // production grant changes; OIDs and slot names remain the installed ones.
   await domain.telemetryPool.query('ALTER ROLE '+quote(def.role)+" LOGIN PASSWORD '"+verifier.replaceAll("'","''")+"'")
   const client=makeClient(def.role,password);await client.connect();const actor={...def,client};actors.set(def.role,actor);await identity(actor)
  }
  check(new Set([...actors.values()].map(a=>a.pid)).size===17,'independent_seventeen_backends')
  await expectActiveAuditRefused()
 }
 async function connectionLimits(){
  const writer=actors.get(roleFor('prepare',1)),duplicate=makeClient(writer.role,secrets.get(writer.role))
  try{await heartbeatRuntimeReject(()=>duplicate.connect(),'53300')}finally{await closeClient(duplicate)}
  const second=makeClient(readerName,secrets.get(readerName));await second.connect()
  try{
   const extra={role:readerName,client:second};await identity(extra);check(extra.pid!==actors.get(readerName).pid,'reader_second_real_backend')
   const third=makeClient(readerName,secrets.get(readerName));try{await heartbeatRuntimeReject(()=>third.connect(),'53300')}finally{await closeClient(third)}
  }finally{await closeClient(second)}
 }
 async function permissions(){
  const reader=actors.get(readerName),writer=actors.get(roleFor('prepare',1))
  for(const actor of [reader,writer]){
   for(const statement of ['SELECT * FROM studio_telemetry.kind_config','SELECT * FROM studio_telemetry.slot_state',"UPDATE studio_telemetry.slot_state SET enabled=false",'SELECT * FROM pg_catalog.pg_authid','SELECT * FROM pg_catalog.pg_shadow','SET ROLE studio_telemetry_owner','SET ROLE agentstudio_api','SET ROLE agentstudio_worker'])await heartbeatRuntimeReject(()=>actor.client.query(statement),'42501')
   for(const name of ['reset','boot','begin_boot'])await heartbeatRuntimeReject(()=>actor.client.query('SELECT studio_telemetry.'+name+'()'),'42883')
  }
  await heartbeatRuntimeReject(()=>reader.client.query(rpc,parameters(writer,1)),'42501')
  await heartbeatRuntimeReject(()=>writer.client.query('SELECT studio_telemetry.snapshot()'),'42501')
  await heartbeatRuntimeReject(()=>snapshot({readonly:false}),'55000')
  await reader.client.query('BEGIN READ ONLY')
  try{await reader.client.query('SELECT studio_telemetry.snapshot()');await reader.client.query('COMMIT')}catch(error){await reader.client.query('ROLLBACK').catch(()=>{});throw error}
  const privileges=(await domain.telemetryPool.query("SELECT bool_and(NOT has_database_privilege(r.oid,'agent_studio_telemetry','CREATE') AND NOT has_database_privilege(r.oid,'agent_studio_telemetry','TEMPORARY')) AS narrow FROM pg_catalog.pg_roles r WHERE starts_with(r.rolname,'studio_telemetry_') AND r.rolname<>'studio_telemetry_owner'")).rows[0]
  check(privileges.narrow===true,'no_create_or_temp')
  for(const name of ['agentstudio_api','agentstudio_worker']){
   const rights=(await domain.telemetryPool.query("SELECT has_database_privilege($1::name,'agent_studio_telemetry','CONNECT') AS connect,has_function_privilege($1::name,'studio_telemetry.snapshot()','EXECUTE') AS reader,has_function_privilege($1::name,'studio_telemetry.record(text,text,bigint,text,text)','EXECUTE') AS writer",[name])).rows[0]
   check(rights.connect===false&&rights.reader===false&&rights.writer===false,'old_principals_no_telemetry_grants')
  }
  const mainOptions=workerHeartbeatCiAdminOptions(capability,'main')
  for(const name of ['agentstudio_stage_login','agentstudio_stage_worker']){
   const password=createHash('sha512').update(mainOptions.password+':assessment:'+name).digest('hex').slice(0,80)
   const client=makeClient(name,password);try{await heartbeatRuntimeReject(()=>client.connect(),'42501')}finally{await closeClient(client)}
  }
 }
 async function attributes(){
  const writer=actors.get(roleFor('prepare',1)),reader=actors.get(readerName)
  for(const [role,change,restore,operation,code]of [
   [writer.role,'NOLOGIN','LOGIN',()=>writer.client.query(rpc,parameters(writer,7)),'22023'],
   [writer.role,'CONNECTION LIMIT 2','CONNECTION LIMIT 1',()=>writer.client.query(rpc,parameters(writer,7)),'22023'],
   [reader.role,'CONNECTION LIMIT 1','CONNECTION LIMIT 2',()=>snapshot(),'55000'],
  ]){await domain.telemetryPool.query('ALTER ROLE '+quote(role)+' '+change);try{await heartbeatRuntimeReject(operation,code)}finally{await domain.telemetryPool.query('ALTER ROLE '+quote(role)+' '+restore)}}
  await identity(writer);await identity(reader)
 }
 async function waitBlocked(writerPid,blockerPid,advisory){
  const until=Date.now()+9000
  while(Date.now()<until){
   const r=(await domain.telemetryPool.query("SELECT a.wait_event_type='Lock' AND $2::integer=ANY(pg_catalog.pg_blocking_pids(a.pid)) AND CASE WHEN $3::boolean THEN a.wait_event='advisory' ELSE a.wait_event<>'advisory' AND position('studio_telemetry.record' in a.query)>0 END AS blocked FROM pg_catalog.pg_stat_activity a WHERE a.pid=$1 AND a.datid=$4",[writerPid,blockerPid,advisory,domain.telemetryDatabaseOid])).rows[0]
   if(r?.blocked===true)return // Actual server lock facts, no fixed sleep.
  }
  throw Error('telemetry_runtime_timeout_observed_lock')
 }
 async function fenced(mode){
  check(['rotate','disable_kind','disable_slot'].includes(mode),'fixture_fence_mode')
  await reset('prepare');const actor=actors.get(roleFor('prepare',1)),oldArgs=parameters(actor,1)
  const db=await domain.telemetryPool.connect(),key=++lockSerial,namespace=71061
  let work,advisoryHeld=false,writerBegun=false,afterMutation,next
  try{
   const blockerPid=(await db.query('SELECT pg_backend_pid()::integer AS pid')).rows[0].pid
   await db.query('SELECT pg_catalog.pg_advisory_lock($1::integer,$2::integer)',[namespace,key]);advisoryHeld=true
   await db.query('BEGIN')
   await db.query('SELECT kind FROM studio_telemetry.kind_config WHERE kind=$1 FOR '+(mode==='disable_slot'?'SHARE':'UPDATE'),['prepare'])
   await db.query('SELECT slot_no FROM studio_telemetry.slot_state WHERE kind=$1 ORDER BY slot_no FOR UPDATE',['prepare'])
   await actor.client.query('BEGIN');writerBegun=true
   work=(async()=>{await actor.client.query('SELECT pg_catalog.pg_advisory_xact_lock($1::integer,$2::integer)',[namespace,key]);return actor.client.query(rpc,oldArgs)})()
   work.catch(()=>{})
   await waitBlocked(actor.pid,blockerPid,true)
   check((await db.query('SELECT pg_catalog.pg_advisory_unlock($1::integer,$2::integer) AS released',[namespace,key])).rows[0].released===true,'advisory_handshake_released');advisoryHeld=false
   await waitBlocked(actor.pid,blockerPid,false)
   if(mode==='rotate'){
    next=randomUUID();await db.query('UPDATE studio_telemetry.slot_state SET generation=$3::uuid WHERE kind=$1 AND slot_no=$2',['prepare',1,next])
   }else if(mode==='disable_kind')await db.query('UPDATE studio_telemetry.kind_config SET enabled=false WHERE kind=$1',['prepare'])
   else await db.query('UPDATE studio_telemetry.slot_state SET enabled=false WHERE kind=$1 AND slot_no=$2',['prepare',1])
   afterMutation=await rowFingerprint('prepare',1,db)
   await db.query('COMMIT')
   if(next){const key=keyFor('prepare',1),previous=generations.get(key).current;generations.set(key,{current:next,previous})}
   await heartbeatRuntimeReject(()=>bounded(work,'fenced_report'),'22023')
   await actor.client.query('ROLLBACK');writerBegun=false
   check(await rowFingerprint('prepare',1)===afterMutation,'queued_report_did_not_mutate_post_fence')
   if(mode==='rotate')await send(actor,1)
  }finally{
   // Roll back/unlock the locker BEFORE waiting for a blocked writer. No fixed
   // sleeps, fabricated pg.Result, backend killing or guessed lock ownership.
   await db.query('ROLLBACK').catch(()=>{})
   if(advisoryHeld)await db.query('SELECT pg_catalog.pg_advisory_unlock($1::integer,$2::integer)',[namespace,key]).catch(()=>{})
   db.release()
   if(work)await bounded(work.catch(()=>{}),'fence_cleanup').catch(()=>{})
   if(writerBegun)await actor.client.query('ROLLBACK').catch(()=>{})
  }
 }
 async function databaseNow(){return (await domain.telemetryPool.query("SELECT to_char(date_trunc('milliseconds',clock_timestamp()) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS at")).rows[0].at}
 async function validatePins(){
  const rows=(await domain.telemetryPool.query("SELECT p.proname::text AS name,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS sha FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='studio_telemetry' ORDER BY p.proname")).rows
  check(rows.length===2&&rows.every(r=>bodies[r.name]===r.sha),'actual_rpc_prosrc_pins')
 }
 async function finish(){
  await domain.verifyTelemetryTarget();await validatePins();await expectActiveAuditRefused();await full();check(await image()===beforeImage,'main_business_auth_rows_unchanged')
  const roles=(await domain.telemetryPool.query("SELECT oid::integer AS oid,rolname::text AS name,rolcanlogin AS login FROM pg_catalog.pg_roles WHERE starts_with(rolname,'studio_telemetry_')")).rows
  check(roles.length===18&&roles.every(role=>installedRoleIds.get(role.name)===role.oid&&role.login===(role.name!=='studio_telemetry_owner')),'role_oids_and_owner_nologin_retained')
 }
 try{
  domain=await workerHeartbeatDomainFixture() // Full060 plus genuinely new DB.
  const companySql=readFileSync(new URL('../../../../db/postgres/migrations/pg_v9_061_company_overview.sql',import.meta.url),'utf8')
  check(digest(companySql)===companyPin,'old061_raw_pin');await install(domain.adminPool,companySql);await full();beforeImage=await image()
  check(await audit.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool)===false,'new_domain_empty')
  const ddl=readFileSync(new URL('../../../../db/postgres/telemetry/001_worker_heartbeats.sql',import.meta.url),'utf8')
  check(digest(ddl)===rawPin,'telemetry_raw_pin');await install(domain.telemetryPool,ddl)
  equal(await audit.inspectWorkerHeartbeatSchemaFull(domain.telemetryPool),{schema:'telemetry_v1',phase:'schema_full_dormant',runtime_activated:false},'dormant_before_any_activation')
  const installed=(await domain.telemetryPool.query("SELECT oid::integer AS oid,rolname::text AS name,rolcanlogin AS login FROM pg_catalog.pg_roles WHERE starts_with(rolname,'studio_telemetry_')")).rows
  check(installed.length===18&&installed.every(role=>role.login===false),'eighteen_dormant_roles_before_activation')
  for(const role of installed)installedRoleIds.set(role.name,role.oid)
  await validatePins();await full();check(await image()===beforeImage,'main_unchanged_after_domain_install')
  return {kinds:heartbeatRuntimeKinds,check,equal,send,rejectReport,snapshot,row,reset,setKind,setSlotEnabled,age,injectTime,databaseNow,
   actor:(kind,slot)=>{const actor=actors.get(roleFor(kind,slot));check(!!actor,'writer_open');return actor},
   openActors,connectionLimits,permissions,attributes,fenced,expectActiveAuditRefused,finish,
   async rejectSnapshot(){await heartbeatRuntimeReject(()=>snapshot(),'55000')},
   async wrongArity(){const a=actors.get(roleFor('prepare',1));await heartbeatRuntimeReject(()=>a.client.query('SELECT studio_telemetry.record($1::text,$2::text,$3::bigint,$4::text)',parameters(a,1).slice(0,4)),'42883');await heartbeatRuntimeReject(()=>a.client.query('SELECT studio_telemetry.record($1::text,$2::text,$3::bigint,$4::text,$5::text,$6::text)',[...parameters(a,1),'no_identity_argument']),'42883')},
   async close(){if(ended)return;ended=true;let failed=false;for(const client of [...clients])try{await closeClient(client)}catch{failed=true}try{await domain.close()}catch{failed=true}secrets.clear();generations.clear();if(failed)throw Error('telemetry_runtime_check_cleanup')},
  }
 }catch(error){
  for(const client of [...clients])await closeClient(client).catch(()=>{})
  await domain?.close().catch(()=>{});secrets.clear();generations.clear();throw heartbeatRuntimeSafeError('fixture_failed',error)
 }
}
