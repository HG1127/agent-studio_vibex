// Hosted authoring only. Import-safe builtins + the unchanged private CI guard.
// Never adapts the fixed Native database/login, grants ledger access, or starts
// a Worker/provider/HTTP/telemetry service. The service owns final DB disposal.
import assert from 'node:assert/strict'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {isIP} from 'node:net'
import {workerHeartbeatCiAdminOptions} from './worker-heartbeat-ci-guard.mjs'

const freshPin='0a3baa8dd28309b5b133c10be944f803d10a71fc5bef1805d26153c69e813a13'
const baselinePin='af29a65a28c3dbde02bde8723b726f5493886d6d155142bc3bf00fd127be0f58'
export const nativeAdminGuardPins=Object.freeze({
 'native-current-company-admin.mjs':'83fc4c1d49f3805fd0439e3e4d6a1f093bfed8556940179220e1deeafc2ea889',
 'native-current-company-admin.d.mts':'329ebb4a75bf484c5e7a4ccc4b78e588825faf7c236607e3656b9c9a2a6f2285',
 '../tests/native-current-company-admin.test.mjs':'661fda8eb170124e594ecd848ffaca4c53c7dc7f00fa5f9d1eac640bef06ec20',
})
const sha=value=>createHash('sha256').update(value).digest('hex')
export function nativeAdminDeferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
export async function nativeAdminBounded(promise,label,ms=25000){
 let timer
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('native_admin_ci_timeout:'+label)),ms)})])}
 finally{clearTimeout(timer)}
}
// Real monotonic elapsed time only, never a database clock/expiry/TTL update.
export async function nativeAdminElapsed(){const start=performance.now();while(performance.now()-start<10100)await new Promise(done=>setTimeout(done,Math.max(1,10100-(performance.now()-start))))}

export async function nativeCurrentAdminTcpFixture(capability){
 // This exact original branded capability MUST refuse before files/imports/pg.
 const mainOptions=workerHeartbeatCiAdminOptions(capability,'main')
 for(const [file,pin]of Object.entries(nativeAdminGuardPins))assert.equal(sha(readFileSync(new URL('../../src/'+file,import.meta.url))),pin,'frozen H Native guard trio')
 const [{default:pg},fresh,installer,baseline,activation,native,guardModule]=await Promise.all([
  import('pg'),import('../../src/pg18-fresh-runtime-source.mjs'),import('../../src/pg18-fresh-runtime-install.ts'),
  import('../../src/baota-pg18-fresh-init.mjs'),import('../../src/native-activation-cli.mjs'),
  import('../../src/native-auth-repository.mjs'),import('../../src/native-current-company-admin.mjs'),
 ])
 const snapshot=fresh.captureFreshRuntimeSources()
 assert.equal(snapshot.source_sha256,freshPin);assert.equal(snapshot.baseline.hash,baselinePin);assert.equal(snapshot.sources.length,34)
 assert.equal(snapshot.versions.at(-1),'pg_v9_050')
 const pools=new Set(),live=new Set(),probes=new Set(),seen=new WeakSet()
 const add=options=>{const pool=new pg.Pool(options);pool.on('error',()=>{});pools.add(pool);return pool}
 const main=add({...mainOptions,ssl:false,options:''})
 let admin,auth,repo,rootIdentity,targetIdentity,closed=false,schemaBaseline
 const watch=client=>{if(!seen.has(client)){seen.add(client);client.on('error',()=>{})}return client}
 const release=(client,destroy=false)=>{live.delete(client);client.release(destroy)}
 const connect=async pool=>{const client=watch(await pool.connect());live.add(client);return client}
 const end=async pool=>{pools.delete(pool);await pool.end()}
 async function identity(pool,database){
  const row=(await pool.query("SELECT current_database() AS database,session_user::text AS login,current_user::text AS actor,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,(pg_control_system()).system_identifier::text AS system_identifier,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS superuser,NOT pg_is_in_recovery() AS primary")).rows[0]
  assert.equal(row.database,database);assert.equal(row.login,'agentstudio_admin');assert.equal(row.actor,row.login)
  // Client host stays the original private guard's127.0.0.1:5432. PostgreSQL
  // reports its actual container interface behind that published client port.
  // Preserve that IPv4 as observed metadata; never rewrite it to loopback.
  assert.equal(isIP(row.host),4);assert.equal(row.port,5432);assert.equal(row.encoding,'UTF8');assert.equal(row.owner,'agentstudio_admin')
  assert.equal(row.superuser,true);assert.equal(row.primary,true);assert.ok(row.version>=180000&&row.version<190000)
  assert.match(row.oid,/^[1-9][0-9]*$/);assert.match(row.system_identifier,/^[1-9][0-9]*$/)
  if(rootIdentity){assert.equal(row.host,rootIdentity.host);assert.equal(row.system_identifier,rootIdentity.system_identifier)}
  const expected=database==='agentstudio_pg18_ci'?rootIdentity:targetIdentity
  if(expected)assert.equal(row.oid,expected.oid)
  return row
 }
 async function nativeRoles(enabled){
  const rows=(await admin.query("SELECT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolvaliduntil,r.rolconfig,ARRAY(SELECT p.rolname::text FROM pg_roles p WHERE p.rolname<>r.rolname AND pg_has_role(r.oid,p.oid,'MEMBER') ORDER BY p.rolname) AS reachable FROM pg_roles r WHERE r.rolname='agentstudio_native_login'")).rows
  assert.equal(rows.length,1);const row=rows[0];assert.equal(row.rolcanlogin,enabled)
  for(const key of ['rolinherit','rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','rolreplication'])assert.equal(row[key],false,key)
  assert.equal(row.rolvaliduntil,null);assert.equal(row.rolconfig,null);assert.deepEqual(row.reachable,['agentstudio_native_auth'])
  const members=(await admin.query("SELECT p.rolname::text AS parent,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles c ON c.oid=m.member JOIN pg_roles p ON p.oid=m.roleid WHERE c.rolname='agentstudio_native_login' ORDER BY p.rolname")).rows
  // Observe ORIGINAL fresh GRANT defaults before any activation, do not repair.
  assert.deepEqual(members,[{parent:'agentstudio_native_auth',admin_option:false,inherit_option:false,set_option:true}])
  const rights=(await admin.query("SELECT NOT has_table_privilege('agentstudio_native_auth','agentstudio.schema_migrations','SELECT') AND NOT has_any_column_privilege('agentstudio_native_auth','agentstudio.schema_migrations','SELECT') AS no_ledger,NOT pg_has_role('agentstudio_native_login','agentstudio_api','MEMBER') AND NOT pg_has_role('agentstudio_native_login','agentstudio_worker','MEMBER') AS no_business,NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='agent_studio_telemetry') AS no_telemetry,(SELECT bool_and(NOT rolcanlogin) FROM pg_roles WHERE rolname IN('agentstudio_stage_login','agentstudio_stage_worker')) AS stages_disabled")).rows[0]
  assert.deepEqual(rights,{no_ledger:true,no_business:true,no_telemetry:true,stages_disabled:true})
  return {row,members,rights}
 }
 async function schema(){
  const c=await connect(admin)
  let destroy=false
  try{await c.query('BEGIN READ ONLY');await installer.verifyRuntimeSchemaReceipt(c,snapshot,true)}
  finally{try{await c.query('ROLLBACK')}catch{destroy=true}release(c,destroy)}
  const records=(await admin.query("SELECT version,description FROM agentstudio.schema_migrations ORDER BY version")).rows
  const catalog=(await admin.query("SELECT jsonb_build_object('columns',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY n.nspname,c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN('agentstudio','agentstudio_auth')),'constraints',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.conname,pg_get_constraintdef(c.oid)) ORDER BY n.nspname,c.conname,c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),'policies',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,p.polname,p.polroles,p.polcmd,p.polpermissive,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY n.nspname,c.relname,p.polname) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),'acl',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth')),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r WHERE NOT starts_with(r.rolname,'pg_')),'membership',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m)) AS catalog")).rows[0].catalog
  return sha(JSON.stringify({records,catalog}))
 }
 async function image(){
  const names=(await admin.query("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('agentstudio','agentstudio_auth') AND c.relkind='r' ORDER BY n.nspname,c.relname")).rows
  const q=s=>'"'+s.replaceAll('"','""')+'"',parts=names.map(r=>"SELECT '"+r.nspname+'.'+r.relname+"' AS name,coalesce(jsonb_agg(jsonb_build_array(x.xmin::text,x.ctid::text,to_jsonb(x)) ORDER BY to_jsonb(x)::text),'[]'::jsonb) AS rows FROM "+q(r.nspname)+'.'+q(r.relname)+' x')
  return sha(JSON.stringify((await admin.query('SELECT jsonb_agg(to_jsonb(s) ORDER BY name) AS image FROM ('+parts.join(' UNION ALL ')+') s')).rows[0].image))
 }
 async function readOnly(operation){
  const before=await image();let result,primary
  try{result=await operation()}catch(error){primary=error}
  try{assert.equal(await image(),before,'guard must not modify physical business/auth/ledger rows')}
  catch(error){if(primary)throw new AggregateError([primary,error],'native_admin_ci_read_and_integrity_failed');throw error}
  if(primary)throw primary;return result
 }
 async function close(){
  if(closed)return;closed=true;const errors=[]
  for(const p of [...probes])try{await p.close()}catch(error){errors.push(error)}
  for(const c of [...live])try{release(c,true)}catch(error){errors.push(error)}
  for(const pool of [...pools])try{await end(pool)}catch(error){errors.push(error)}
  if(errors.length)throw new AggregateError(errors,'native_admin_ci_owned_pool_cleanup_failed')
 }
 try{
  rootIdentity=await identity(main,'agentstudio_pg18_ci')
  const empty=(await main.query("SELECT (SELECT count(*)::integer FROM pg_namespace WHERE NOT starts_with(nspname,'pg_') AND nspname NOT IN('public','information_schema')) AS schemas,(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS relations,(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS functions,(SELECT count(*)::integer FROM pg_roles WHERE NOT starts_with(rolname,'pg_')) AS roles,(SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql') AS extensions,EXISTS(SELECT 1 FROM pg_database WHERE datname='agent_studio') AS target_exists")).rows[0]
  assert.deepEqual(empty,{schemas:0,relations:0,functions:0,roles:1,extensions:0,target_exists:false},'Native matrix requires one completely fresh isolated service')
  // Exclusive fixed NEW database only. Never DROP/rename/replace an existing DB.
  await main.query('CREATE DATABASE agent_studio TEMPLATE template0 OWNER agentstudio_admin')
  admin=add({...mainOptions,database:'agent_studio',ssl:false,options:'',max:2})
  targetIdentity=await identity(admin,'agent_studio')
  assert.equal(targetIdentity.system_identifier,rootIdentity.system_identifier);assert.notEqual(targetIdentity.oid,rootIdentity.oid)
  const c=await connect(admin)
  try{
   await c.query('BEGIN');await c.query(snapshot.baseline.sql)
   for(const [name,groups]of [['agentstudio_stage_login',['agentstudio_api']],['agentstudio_stage_worker',['agentstudio_api','agentstudio_worker']]]){
    const secret=randomBytes(40).toString('hex')
    await c.query('CREATE ROLE '+name+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(secret)+"'")
    for(const group of groups)await c.query('GRANT '+group+' TO '+name+' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE')
   }
   await baseline.verifyFreshForTest(c);await installer.installFreshRuntime(c,snapshot);await c.query('COMMIT')
  }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{release(c)}
  await nativeRoles(false)
  const nativePassword=randomBytes(40).toString('hex')
  await admin.query("ALTER ROLE agentstudio_native_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+activation.makeNativeScramVerifier(nativePassword)+"'")
  await nativeRoles(true)
  const authOptions={...mainOptions,database:'agent_studio',user:'agentstudio_native_login',password:nativePassword,ssl:false,options:'',max:2}
  auth=add(authOptions);repo=new native.NativeAuthRepository(auth)
  const credentials={A:{email:'native-ci-a@example.test',password:'NativeCiA#2026'+randomBytes(16).toString('hex')},B:{email:'native-ci-b@example.test',password:'NativeCiB#2026'+randomBytes(16).toString('hex')},C:{email:'native-ci-c@example.test',password:'NativeCiC#2026'+randomBytes(16).toString('hex')}}
  const users={A:await repo.provisionInitialAdmin({...credentials.A,display_name:'Synthetic Native A'})}
  const A=await repo.login(credentials.A.email,credentials.A.password)
  users.B=await repo.createGovernedEmployee(A.token,{...credentials.B,display_name:'Synthetic Native B',is_admin:true,share_enabled:true})
  users.C=await repo.createGovernedEmployee(A.token,{...credentials.C,display_name:'Synthetic Native C',is_admin:false,share_enabled:true})
  assert.equal((await repo.listEmployees(A.token)).length,3);assert.equal(await repo.inspectEmployeeGovernance(),true)
  schemaBaseline=await schema()
  function probe({max=2,onConnect,onQuery}={}){
   assert.ok(max===1||max===2)
   // Synthetic slow-queue profile only: exceed the real10100ms hold so the
   // unchanged guard10s TTL decides after actual SQL/COMMIT, not a5s pool error.
   // Ordinary repository authOptions retain the original5s connection timeout.
   const rawPool=add({...authOptions,max,connectionTimeoutMillis:20000}),trace=[],releases=[],gates=new Set(),active=new Map()
   let connections=0,ended=false
   const gate=()=>{const d=nativeAdminDeferred();gates.add(d);return d}
   const pool={async connect(){
    const ordinal=++connections,raw=await connect(rawPool)
    let backend
    try{
     backend=(await admin.query("SELECT pid,backend_start::text AS started,usename::text AS login,datname::text AS database FROM pg_stat_activity WHERE pid=$1 AND datname='agent_studio' AND usename='agentstudio_native_login'",[raw.processID])).rows[0]
     assert.ok(backend)
     assert.equal(backend.login,'agentstudio_native_login');assert.equal(backend.database,'agent_studio')
     active.set(ordinal,{raw,backend});if(onConnect)await onConnect({ordinal,backend,gate})
    }catch(error){active.delete(ordinal);release(raw,true);throw error}
    return new Proxy(raw,{get(target,key){
     if(key==='release')return destroy=>{releases.push({ordinal,destroy:!!destroy});active.delete(ordinal);return release(raw,destroy)}
     if(key==='query')return async(sql,...args)=>{
      trace.push({ordinal,sql});if(onQuery)await onQuery({ordinal,sql,backend,gate})
      const result=await Reflect.apply(target.query,target,[sql,...args])
      if(typeof sql==='string'&&sql.startsWith('BEGIN ')){
       // Independent admin observation only: the Native client's SQL and
       // Result/Result[] remain exactly the original guard's protocol.
       const actual=(await admin.query("SELECT xact_start::text AS began FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz AND datname='agent_studio' AND usename='agentstudio_native_login'",[backend.pid,backend.started])).rows[0]
       assert.ok(actual&&typeof actual.began==='string');trace.push({ordinal,observation:actual})
      }
      return result // Original driver Result/Result[] is returned unchanged.
     }
     const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
    }})
   }}
   const p={guard:new guardModule.NativeCurrentCompanyAdmin(pool),trace,releases,gate,get connections(){return connections},get waiting(){return rawPool.waitingCount},
    async hold(){const raw=await connect(rawPool);let done=false;return ()=>{if(!done){done=true;release(raw)}}},
    async terminate(backend){
     assert.ok([...active.values()].some(item=>item.backend===backend))
     const row=(await admin.query("SELECT pg_terminate_backend(pid) AS stopped FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz AND datname='agent_studio' AND usename='agentstudio_native_login'",[backend.pid,backend.started])).rows
     assert.deepEqual(row,[{stopped:true}])
     const until=performance.now()+5000;let gone=false
     while(performance.now()<until){gone=(await admin.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz) AS gone',[backend.pid,backend.started])).rows[0].gone;if(gone)break;await new Promise(done=>setTimeout(done,20))}
     assert.equal(gone,true,'owned failed backend must actually disappear before post resumes')
    },
    async close(){if(ended)return;ended=true;for(const d of gates)d.resolve();for(const {raw}of active.values())if(live.has(raw))release(raw,true);active.clear();await nativeAdminBounded(end(rawPool),'probe_close');probes.delete(p)},
   };probes.add(p);return p
  }
  const login=async name=>{assert.ok(Object.hasOwn(credentials,name));return repo.login(credentials[name].email,credentials[name].password)}
  const changeB=async changes=>{const current=(await repo.listEmployees(A.token)).find(row=>row.id===users.B.id);assert.ok(current);return repo.changeEmployee(A.token,{request_id:randomUUID(),target_id:users.B.id,expected_revision:current.revision,is_admin:current.is_admin,enabled:current.enabled,share_enabled:current.share_enabled,...changes,confirm:true})}
  return {probe,login,changeB,repo,A,users,readOnly,image,guardModule,
   async unchangedSchema(){assert.equal(await schema(),schemaBaseline);await nativeRoles(true);assert.deepEqual(await identity(main,'agentstudio_pg18_ci'),rootIdentity);assert.deepEqual(await identity(admin,'agent_studio'),targetIdentity);assert.equal(fresh.captureFreshRuntimeSources().source_sha256,freshPin)},
   async final(){await nativeRoles(true);assert.equal(await repo.inspectEmployeeGovernance(),true);const rows=(await admin.query("SELECT (SELECT count(*)::integer FROM agentstudio_auth.accounts) AS accounts,(SELECT count(*)::integer FROM agentstudio_auth.employee_governance_events) AS audit,(SELECT count(*)::integer FROM agentstudio.jobs) AS jobs,(SELECT count(*)::integer FROM agentstudio.runs) AS runs,NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='agent_studio_telemetry') AS no_telemetry")).rows[0];assert.equal(rows.accounts,3);assert.ok(rows.audit>=6);assert.equal(rows.jobs,0);assert.equal(rows.runs,0);assert.equal(rows.no_telemetry,true);await this.unchangedSchema()},
   close,
  }
 }catch(error){try{await close()}catch(cleanup){throw new AggregateError([error,cleanup],'native_admin_ci_setup_and_cleanup_failed')}throw error}
}
