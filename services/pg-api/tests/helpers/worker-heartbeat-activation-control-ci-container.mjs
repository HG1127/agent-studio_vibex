// New controller-test container only. Import-safe; NEVER borrows another workflow
// permit or accepts a host/DB/image/container/password supplied by a caller.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import {randomBytes} from 'node:crypto'
import {execFileSync,spawnSync} from 'node:child_process'
import {workerHeartbeatActivationControlCiMainOptions,workerHeartbeatActivationControlCiDescriptor} from './worker-heartbeat-activation-control-ci-guard.mjs'

const leases=new WeakMap(),image='pgvector/pgvector:0.8.7-pg18'
const workflow='Agent Studio PG18 telemetry control isolated verification',job='pg18-telemetry-control-domain'
const fail=code=>{throw Error('telemetry_control_container_ci_refused:'+code)}
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const env=()=>({PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8'})
function state(lease){const s=leases.get(lease);if(!s)fail('private_created_lease_required');return s}
function safeFailure(phase,error){
 let code;try{code=Object.getOwnPropertyDescriptor(error,'code')?.value}catch{}
 return Error('telemetry_control_container_ci_refused:'+phase+':'+(typeof code==='string'&&/^[A-Z0-9]{5}$/.test(code)?code:'NO_SQLSTATE'))
}
function spec(run,attempt,nonce){
 assert.match(run,/^[1-9][0-9]{0,31}$/);assert.match(attempt,/^[1-9][0-9]{0,31}$/);assert.ok(hex(nonce))
 return Object.freeze({name:'agentstudio-telemetry-control-'+run+'-'+attempt+'-'+nonce.slice(0,16),port:5333,
  pgdata:'/var/lib/postgresql/telemetry-control-'+nonce.slice(0,24),cluster:'ci-telemetry-control-'+nonce.slice(0,24)})
}
function command(s,args,{extraEnv={},timeout=45000}={}){
 try{return execFileSync('/usr/bin/docker',['--config',s.config,...args],{env:{...env(),HOME:s.config,...extraEnv},timeout,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe'],windowsHide:true})}
 catch{fail('bounded_docker_operation')}
}
function inspect(s,{running=true}={}){
 assert.ok(hex(s.id))
 const rows=JSON.parse(command(s,['inspect',s.id])),c=rows[0],h=c?.HostConfig,labels=c?.Config?.Labels??{}
 assert.ok(rows.length===1&&c.Id===s.id&&c.Name==='/'+s.spec.name&&c.Image===s.imageId&&c.Config.Image===s.imageId)
 assert.ok(!running||c.State?.Running)
 assert.ok(h?.NetworkMode==='host'&&h.Privileged===false&&h.PublishAllPorts===false)
 assert.ok(!(h.Binds??[]).length&&!(h.Devices??[]).length&&!(h.VolumesFrom??[]).length&&!(h.CapAdd??[]).length&&!Object.keys(h.PortBindings??{}).length&&['','private'].includes(h.PidMode))
 assert.deepEqual(Object.keys(h.Tmpfs??{}).sort(),['/run','/var/lib/postgresql'])
 assert.ok(Array.isArray(c.Mounts)&&c.Mounts.every(m=>m.Type==='tmpfs'&&['/run','/var/lib/postgresql'].includes(m.Destination)))
 assert.deepEqual(c.Config.Entrypoint,['docker-entrypoint.sh'])
 assert.deepEqual(c.Config.Cmd,['postgres','-p','5333','-c','listen_addresses=127.0.0.1','-c','cluster_name='+s.spec.cluster])
 assert.ok(Object.entries({run:s.run,attempt:s.attempt,job,nonce:s.nonce,purpose:'telemetry-control-owned-fixture'}).every(([key,value])=>labels['org.agentstudio.telemetry-control.'+key]===value))
 // Boolean assertions never print the inspected environment or synthetic pwd.
 assert.ok(['POSTGRES_USER=postgres','POSTGRES_DB=postgres','PGDATA='+s.spec.pgdata,'POSTGRES_PASSWORD='+s.password,'POSTGRES_INITDB_ARGS=--encoding=UTF8'].every(value=>c.Config.Env.includes(value)))
 return c
}
const identitySql="SELECT current_database() AS database,session_user::text AS login,current_user::text AS actor,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,(pg_control_system()).system_identifier::text AS system_identifier,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner,(SELECT datallowconn AND NOT datistemplate AND datconnlimit=-1 FROM pg_database WHERE datname=current_database()) AS normal_database,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS superuser,NOT pg_is_in_recovery() AS primary,current_setting('data_directory') AS data,current_setting('cluster_name') AS cluster,pg_postmaster_start_time()::text AS started"
const emptySql="SELECT (SELECT count(*)::integer FROM pg_namespace WHERE NOT starts_with(nspname,'pg_') AND nspname NOT IN('public','information_schema')) AS schemas,(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS relations,(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS functions,(SELECT array_agg(rolname::text ORDER BY rolname) FROM pg_roles WHERE NOT starts_with(rolname,'pg_')) AS roles,(SELECT count(*)::integer FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles c ON c.oid=m.member WHERE NOT starts_with(p.rolname,'pg_') OR NOT starts_with(c.rolname,'pg_')) AS members,(SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql') AS extensions,EXISTS(SELECT 1 FROM pg_database WHERE datname='agent_studio') AS target_exists,EXISTS(SELECT 1 FROM pg_database WHERE datname='agent_studio_telemetry') AS telemetry_exists"
function checkIdentity(row,database,login,port){
 assert.ok(row);assert.equal(row.database,database);assert.equal(row.login,login);assert.equal(row.actor,login);assert.equal(row.owner,login)
 assert.equal(net.isIP(row.address),4);assert.equal(row.port,port);assert.equal(row.encoding,'UTF8');assert.equal(row.superuser,true);assert.equal(row.primary,true);assert.equal(row.normal_database,true)
 assert.ok(row.version>=180000&&row.version<190000);assert.match(row.oid,/^[1-9][0-9]*$/);assert.match(row.system_identifier,/^[1-9][0-9]*$/)
}
function checkEmpty(row,login){assert.deepEqual(row,{schemas:0,relations:0,functions:0,roles:[login],members:0,extensions:0,target_exists:false,telemetry_exists:false})}
function options(s,database){
 assert.ok(['postgres','agent_studio','agent_studio_telemetry'].includes(database))
 return {host:'127.0.0.1',port:5333,database,user:'postgres',password:s.password,ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000}
}
async function withPool(s,settings,body){const pool=new s.Pool(settings);pool.on('error',()=>{});try{return await body(pool)}finally{await pool.end()}}
async function verifyMain(s){
 await withPool(s,{...s.mainOptions,ssl:false,options:''},async pool=>{
  const row=(await pool.query(identitySql)).rows[0];checkIdentity(row,'agentstudio_pg18_ci','agentstudio_admin',5432)
  const empty=(await pool.query(emptySql)).rows[0];checkEmpty(empty,'agentstudio_admin')
  if(s.main)assert.deepEqual(row,s.main);else s.main=Object.freeze(row)
 })
}
function controlSystem(s){
 const text=command(s,['exec','--user','postgres','--env','LC_ALL=C',s.id,'pg_controldata',s.spec.pgdata]).toString('utf8')
 const value=/^Database system identifier:\s*([1-9][0-9]{0,19})\s*$/m.exec(text)?.[1]
 assert.ok(value);return value
}
function checkNative(s,row,database){
 checkIdentity(row,database,'postgres',5333);assert.equal(row.address,'127.0.0.1');assert.equal(row.data,s.spec.pgdata);assert.equal(row.cluster,s.spec.cluster)
 assert.equal(row.system_identifier,s.system);assert.notEqual(row.system_identifier,s.main.system_identifier)
 const expected=database==='postgres'?s.maintenance:database==='agent_studio'?s.target:s.telemetry
 if(expected)assert.deepEqual(row,expected)
}
async function verifyNative(s){
 inspect(s);assert.equal(controlSystem(s),s.system)
 await withPool(s,options(s,'postgres'),async pool=>{const row=(await pool.query(identitySql)).rows[0];checkNative(s,row,'postgres')})
 await withPool(s,options(s,'agent_studio'),async pool=>{const row=(await pool.query(identitySql)).rows[0];checkNative(s,row,'agent_studio')})
 if(s.telemetry)await withPool(s,options(s,'agent_studio_telemetry'),async pool=>{const row=(await pool.query(identitySql)).rows[0];checkNative(s,row,'agent_studio_telemetry')})
}

export async function createTelemetryControlCiContainer(capability){
 // Original private capability admission precedes env, fs, sockets, pg/Docker.
 const mainOptions=workerHeartbeatActivationControlCiMainOptions(capability),descriptor=workerHeartbeatActivationControlCiDescriptor(capability)
 const run=descriptor.run,attempt=descriptor.attempt
 if(process.platform!=='linux'||process.env.GITHUB_WORKFLOW!==workflow||process.env.GITHUB_JOB!==job||mainOptions.host!=='127.0.0.1'||mainOptions.port!==5432||mainOptions.database!=='agentstudio_pg18_ci'||mainOptions.user!=='agentstudio_admin'||mainOptions.password!=='synthetic-agentstudio-pg18-ci-'+run)fail('original_main_binding')
 const nonce=descriptor.nonce,definition=spec(run,attempt,nonce)
 const {default:pg}=await import('pg')
 const lease=Object.freeze({}),s={mainOptions,Pool:pg.Pool,run,attempt,nonce,spec:definition,password:randomBytes(40).toString('hex'),id:null,ready:false}
 leases.set(lease,s);let phase='original_main'
 try{
  await verifyMain(s)
  phase='private_docker_configuration'
  s.config=fs.mkdtempSync('/tmp/agentstudio-telemetry-control-'+run+'-'+attempt+'-');fs.chmodSync(s.config,0o700)
  const st=fs.lstatSync(s.config);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&st.gid===process.getgid()&&(st.mode&0o7777)===0o700)
  const fd=fs.openSync(s.config+'/config.json',fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,0o600)
  try{fs.writeFileSync(fd,'{"auths":{}}\n');fs.fchmodSync(fd,0o600);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  phase='exclusive_port'
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('telemetry_control_container_ci_refused:existing_port')));server.listen({host:'127.0.0.1',port:5333,exclusive:true},()=>server.close(resolve))})
  phase='image'
  command(s,['pull',image],{timeout:120000});const images=JSON.parse(command(s,['image','inspect',image]));s.imageId=images[0]?.Id
  assert.ok(images.length===1&&/^sha256:[a-f0-9]{64}$/.test(s.imageId??''))
  assert.equal(command(s,['ps','--all','--quiet','--filter','name=^/'+definition.name+'$']).toString().trim(),'')
  phase='created_container'
  const args=['run','--detach','--name',definition.name,'--network','host','--tmpfs','/var/lib/postgresql:rw,nosuid,nodev,size=768m','--tmpfs','/run:rw,nosuid,nodev,size=32m']
  for(const [key,value]of Object.entries({run,attempt,job,nonce,purpose:'telemetry-control-owned-fixture'}))args.push('--label','org.agentstudio.telemetry-control.'+key+'='+value)
  args.push('--env','POSTGRES_USER=postgres','--env','POSTGRES_DB=postgres','--env','POSTGRES_PASSWORD','--env','POSTGRES_INITDB_ARGS=--encoding=UTF8','--env','PGDATA='+definition.pgdata,s.imageId,'postgres','-p','5333','-c','listen_addresses=127.0.0.1','-c','cluster_name='+definition.cluster)
  const id=command(s,args,{extraEnv:{POSTGRES_PASSWORD:s.password}}).toString().trim();assert.ok(hex(id));s.id=id
  phase='readiness'
  const until=Date.now()+60000;let ready=false
  while(Date.now()<until){inspect(s);const result=spawnSync('/usr/bin/docker',['--config',s.config,'exec','--user','postgres',s.id,'pg_isready','--host=127.0.0.1','--port=5333','--username=postgres','--dbname=postgres'],{env:{...env(),HOME:s.config},timeout:5000,stdio:'ignore',windowsHide:true});if(result.status===0){ready=true;break}await new Promise(done=>setTimeout(done,250))}
  assert.equal(ready,true)
  phase='fresh_actual_native'
  const created=inspect(s);s.system=controlSystem(s)
  await withPool(s,options(s,'postgres'),async pool=>{
   const row=(await pool.query(identitySql)).rows[0];checkNative(s,row,'postgres');checkEmpty((await pool.query(emptySql)).rows[0],'postgres')
   const started=Date.parse(row.started),createdAt=Date.parse(created.Created)
   assert.ok(Number.isFinite(started)&&started>=createdAt-5000&&started<=Date.now()+2000&&Date.now()-started<120000)
   assert.deepEqual((await pool.query("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname")).rows,[{datname:'postgres'}])
   s.maintenance=Object.freeze(row)
   phase='create_fixed_native_database'
   await pool.query('CREATE DATABASE agent_studio TEMPLATE template0 OWNER postgres')
  })
  await withPool(s,options(s,'agent_studio'),async pool=>{const row=(await pool.query(identitySql)).rows[0];checkNative(s,row,'agent_studio');s.target=Object.freeze(row);assert.notEqual(row.oid,s.maintenance.oid)})
  await verifyMain(s);await verifyNative(s);s.ready=true
  return lease
 }catch(error){
  const primary=safeFailure(phase,error)
  try{await closeTelemetryControlCiContainer(lease)}catch(cleanup){throw new AggregateError([primary,safeFailure('owned_cleanup',cleanup)],'telemetry_control_container_ci_refused:setup_and_cleanup_failed')}
  throw primary
 }
}
export function telemetryControlCiContainerNativeOptions(lease){const s=state(lease);if(!s.ready)fail('attested_target_required');return Object.freeze({...options(s,'agent_studio'),max:2})}
export async function verifyTelemetryControlCiContainer(lease){const s=state(lease);if(!s.ready)fail('attested_target_required');try{await verifyMain(s);await verifyNative(s);return true}catch(error){throw safeFailure('actual_ownership_changed',error)}}
export async function closeTelemetryControlCiContainer(lease){
 const s=state(lease)
 try{
  if(s.id){
   const c=inspect(s,{running:false})
   // An attested running container must still match both its actual clusters
   // and DBs. A partial startup has only its own recorded ID+inspect binding.
   if(c.State?.Running&&s.ready){await verifyMain(s);await verifyNative(s)}
   command(s,['rm','--force','--volumes',s.id])
  }
  leases.delete(lease)
 }catch(error){throw safeFailure('owned_cleanup',error)}
 // Only the synthetic empty Docker config remains for runner temp disposal.
}

// Call only after native schema setup when that is part of the case. This
// creates one fixed NEW template0 DB in the attested own container. It does not
// install telemetry SQL, create LOGINs, or authorize the production controller.
export async function createTelemetryControlCiDatabase(lease){
 const s=state(lease);if(!s.ready||s.telemetry)fail('new_telemetry_target_required')
 try{
  await verifyMain(s);await verifyNative(s)
  await withPool(s,options(s,'postgres'),async pool=>{
   const exists=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='agent_studio_telemetry') AS exists")).rows[0]
   assert.ok(exists?.exists===false)
   await pool.query('CREATE DATABASE agent_studio_telemetry TEMPLATE template0 OWNER postgres')
  })
  await withPool(s,options(s,'agent_studio_telemetry'),async pool=>{
   const row=(await pool.query(identitySql)).rows[0];checkNative(s,row,'agent_studio_telemetry')
   assert.notEqual(row.oid,s.target.oid);assert.notEqual(row.oid,s.maintenance.oid)
   const empty=(await pool.query("SELECT (SELECT count(*)::integer FROM pg_namespace WHERE NOT starts_with(nspname,'pg_') AND nspname NOT IN('public','information_schema')) AS schemas,(SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS relations,(SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT starts_with(n.nspname,'pg_') AND n.nspname<>'information_schema') AS functions,(SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql') AS extensions")).rows[0]
   assert.deepEqual(empty,{schemas:0,relations:0,functions:0,extensions:0})
   s.telemetry=Object.freeze(row)
  })
  await verifyMain(s);await verifyNative(s)
 }catch(error){throw safeFailure('create_new_telemetry',error)}
}
export function telemetryControlCiContainerTelemetryOptions(lease){
 const s=state(lease);if(!s.ready||!s.telemetry)fail('attested_telemetry_required')
 return Object.freeze({...options(s,'agent_studio_telemetry'),max:2})
}
