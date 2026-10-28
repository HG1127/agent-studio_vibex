// Parent-owned synthetic hosted CI only. Import-safe; no DB/UDS on import.
// Fixture JSON/markers are comparison data, never a context or authority grant.
// The unchanged Facade performs real H3 pre/post and fixed-path SDK IPC.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'

const helper='services/pg-api/tests/helpers/native-company-worker-heartbeats-control-ci-child.mjs'
const fixtureName='native-control-ci-fixture.json'
const sourcePins=Object.freeze({
 'native-company-worker-heartbeats.ts':'6058c7bd324155790939f6e8d6762ed85ade39e05e024915b76d71be061b89a1',
 'native-company-worker-heartbeats-http.ts':'0158cb5217331ecf302c14321c30e99369faad7baed37510320dd8d43f4d8917',
 'native-auth-http.mjs':'54ef0b9573b0d4e0b00223c1cc069aa83d0268f9ebf1543e439e2fc9a35748fc',
 'native-current-company-admin.mjs':'83fc4c1d49f3805fd0439e3e4d6a1f093bfed8556940179220e1deeafc2ea889',
 'native-employee-auth.mjs':'96cc6b4978faae6c285335f364b1da89eded8319699ae4599aab98244804dfee',
 'native-employee-governance-audit.mjs':'ff01bd91b44d4c84d2c2a1332a8768e182e70a00bdecb177757839c6818bc238',
 'worker-heartbeat-activation-control-client.ts':'c3af81b5e5e95aa9e06900010ecefe9b1823fb670a98527bdc6e8666fe3c5eab',
 'worker-heartbeat-activation-control-contract.ts':'3d1a9b65a50cba9f3538256203dab134ccff3d1166a9017d7f6e4fa916d55662',
 'worker-heartbeat-contract.ts':'336cebafc1c1b54542fc6828093cb0e87d333950bb3ace1ef318ad75f2d10eba',
})
const packages=Object.freeze({pg:'8.23.1','pg-cloudflare':'1.4.1','pg-connection-string':'2.14.1','pg-int8':'1.0.1','pg-pool':'3.14.0','pg-protocol':'1.16.1','pg-types':'2.2.0',pgpass:'1.0.5','postgres-array':'2.0.0','postgres-bytea':'1.0.1','postgres-date':'1.0.7','postgres-interval':'1.2.0',split2:'4.2.0',xtend:'4.0.2'})
const fixtureKeys=['run','attempt','source_revision','nonce','system_id','database_oid','login_oid','postmaster_started_us','native_uid','native_gid']
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const refuse=()=>{throw Error('native_control_ci_refused')}
const uint=(value,max)=>typeof value==='string'&&/^[1-9][0-9]{0,31}$/.test(value)&&BigInt(value)<=max
async function grammar(){return import('../../src/worker-heartbeat-activation-control-contract.ts')}
function fixture(raw,object){
 const x=object(raw,fixtureKeys)
 if(typeof x.run!=='string'||!/^[1-9][0-9]{0,31}$/.test(x.run)||typeof x.attempt!=='string'||!/^[1-9][0-9]{0,31}$/.test(x.attempt)||
  typeof x.source_revision!=='string'||!/^[a-f0-9]{40}$/.test(x.source_revision)||!hex(x.nonce)||
  !uint(x.system_id,18446744073709551615n)||!uint(x.database_oid,4294967295n)||!uint(x.login_oid,4294967295n)||
  !uint(x.postmaster_started_us,999999999999999999999999999999n)||
  !Number.isSafeInteger(x.native_uid)||x.native_uid<1||x.native_uid>2147483647||
  !Number.isSafeInteger(x.native_gid)||x.native_gid<1||x.native_gid>2147483647)refuse()
 return Object.freeze(x)
}
/** Closed data parser only. Calling it grants no host, connection or context. */
export async function parseNativeControlCiChildFrame(raw){
 const bytes=Buffer.from(raw)
 if(bytes.length<5||bytes.length>16388||bytes.readUInt32BE(0)!==bytes.length-4)refuse()
 const {parseWorkerHeartbeatControlJson,controlObject}=await grammar()
 const x=controlObject(parseWorkerHeartbeatControlJson(bytes.subarray(4)),['protocol','fixture_sha256','fixture','auth_password','cookie'])
 if(x.protocol!=='native_company_worker_heartbeats_control_ci_child_v1'||!hex(x.fixture_sha256)||
  typeof x.auth_password!=='string'||!/^[a-f0-9]{80}$/.test(x.auth_password)||
  typeof x.cookie!=='string'||Buffer.byteLength(x.cookie)>512||/[\0\r\n]/.test(x.cookie))refuse()
 return Object.freeze({...x,fixture:fixture(x.fixture,controlObject)})
}
function host(){
 const e=process.env
 if(process.argv.length!==3||!['--run','--http-run'].includes(process.argv[2])||process.platform!=='linux'||process.versions.node.split('.')[0]!=='24'||
  process.getuid?.()===undefined||process.getuid()===0||process.getgid?.()===undefined||process.getgid()===0||
  process.geteuid()!==process.getuid()||process.getegid()!==process.getgid()||process.getgroups().includes(0)||
  process.execArgv.some(v=>v!=='--experimental-strip-types')||e.CI!=='true'||e.GITHUB_ACTIONS!=='true'||
  e.RUNNER_OS!=='Linux'||e.RUNNER_ENVIRONMENT!=='github-hosted'||e.GITHUB_REPOSITORY!=='HG1127/agent-studio_vibex'||
  e.GITHUB_WORKFLOW!=='Agent Studio PG18 telemetry control isolated verification'||e.GITHUB_JOB!=='pg18-telemetry-control-domain'||
  !['push','workflow_dispatch'].includes(e.GITHUB_EVENT_NAME)||
  !/^[1-9][0-9]{0,31}$/.test(e.GITHUB_RUN_ID??'')||!/^[1-9][0-9]{0,31}$/.test(e.GITHUB_RUN_ATTEMPT??'')||
  !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA??'')||!/^refs\/heads\/codex\/pg18-[A-Za-z0-9][A-Za-z0-9._/-]{0,179}$/.test(e.GITHUB_REF??'')||
  e.GITHUB_REF.includes('..')||e.GITHUB_REF.includes('//')||e.GITHUB_REF.endsWith('/')||
  e.GITHUB_WORKFLOW_REF!=='HG1127/agent-studio_vibex/.github/workflows/pg18-telemetry-control-ci.yml@'+e.GITHUB_REF||
  e.AGENT_STUDIO_NATIVE_CONTROL_CI_CHILD!=='YES_DISPOSABLE_NATIVE_READ_FIXTURE_ONLY')refuse()
 for(const [key,value]of Object.entries(e))if(/^PG|^NODE_PG_|^DOCKER_|^LD_|^DYLD_/.test(key)||
  ['DATABASE_URL','NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_V8_COVERAGE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES'].includes(key)&&value||
  key.startsWith('AGENT_STUDIO_NATIVE_CONTROL_CI_')&&key!=='AGENT_STUDIO_NATIVE_CONTROL_CI_CHILD')refuse()
 const status=fs.readFileSync('/proc/self/status','utf8')
 for(const key of ['CapInh','CapPrm','CapEff','CapAmb'])if(!new RegExp('^'+key+':\\s+0+$','m').test(status))refuse()
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
 if(!/^\/var\/lib\/agentstudio-telemetry-native-ci-[1-9][0-9]{0,31}-[1-9][0-9]{0,31}-[a-f0-9]{16}$/.test(root)||
  fileURLToPath(import.meta.url)!==root+'/'+helper)refuse()
 let at='/'
 for(const part of root.split('/').filter(Boolean)){at=path.join(at,part);const st=fs.lstatSync(at);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7022)!==0)refuse()}
 return root
}
function readSealed(file,max=16777216){
 const a=fs.lstatSync(file)
 if(!a.isFile()||a.isSymbolicLink()||a.uid!==0||a.gid!==0||a.nlink!==1||(a.mode&0o7777)!==0o444||a.size<1||a.size>max||fs.realpathSync(file)!==file)refuse()
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)
 try{const bytes=fs.readFileSync(fd),b=fs.fstatSync(fd),c=fs.lstatSync(file);for(const key of ['dev','ino','size','mode','uid','gid','mtimeMs','ctimeMs','nlink'])if(a[key]!==b[key]||a[key]!==c[key])refuse();if(bytes.length!==a.size)refuse();return bytes}finally{fs.closeSync(fd)}
}
function sealedStage(root){
 let files=0,total=0
 function walk(dir){const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o555)refuse();for(const entry of fs.readdirSync(dir)){const file=path.join(dir,entry),s=fs.lstatSync(file);if(s.isSymbolicLink())refuse();if(s.isDirectory())walk(file);else{if(++files>4096||file.endsWith('.node'))refuse();total+=readSealed(file).length;if(total>268435456)refuse()}}}
 walk(root)
 for(const [name,pin]of Object.entries(sourcePins))if(sha(readSealed(root+'/services/pg-api/src/'+name))!==pin)refuse()
 const modules=root+'/services/pg-api/node_modules',names=fs.readdirSync(modules)
 if(names.some(n=>!Object.hasOwn(packages,n)&&n!=='typescript')||Object.keys(packages).some(n=>!names.includes(n)))refuse()
 for(const name of names){const p=JSON.parse(readSealed(modules+'/'+name+'/package.json').toString('utf8'));if(p.name!==name||p.version!==(name==='typescript'?'5.9.3':packages[name]))refuse()}
}
function readFrame(){return new Promise((resolve,reject)=>{
 let bytes=Buffer.alloc(0),ended=false
 const finish=(error)=>{if(ended)return;ended=true;clearTimeout(timer);process.stdin.off('data',data);process.stdin.off('end',end);process.stdin.off('error',bad);if(error){process.stdin.destroy();reject(Error('native_control_ci_refused'))}else resolve(bytes)}
 const bad=()=>finish(true),data=chunk=>{bytes=Buffer.concat([bytes,chunk]);if(bytes.length>16388||bytes.length>=4&&(bytes.readUInt32BE(0)<1||bytes.readUInt32BE(0)>16384||bytes.length>bytes.readUInt32BE(0)+4))finish(true)},end=()=>finish(false)
 const timer=setTimeout(bad,5000);process.stdin.on('data',data);process.stdin.once('end',end);process.stdin.once('error',bad);process.stdin.resume()
})}
async function bind(root,input){
 const raw=readSealed(root+'/'+fixtureName,8192)
 if(sha(raw)!==input.fixture_sha256)refuse()
 const {parseWorkerHeartbeatControlJson,controlObject}=await grammar(),meta=controlObject(parseWorkerHeartbeatControlJson(raw),['protocol','fixture','child_sha256'])
 if(meta.protocol!=='native_company_worker_heartbeats_control_ci_fixture_v1'||!hex(meta.child_sha256)||meta.child_sha256!==sha(readSealed(root+'/'+helper)))refuse()
 const actual=fixture(meta.fixture,controlObject),x=input.fixture,e=process.env
 if(JSON.stringify(actual)!==JSON.stringify(x)||x.run!==e.GITHUB_RUN_ID||x.attempt!==e.GITHUB_RUN_ATTEMPT||x.source_revision!==e.GITHUB_SHA||
  process.getuid()!==x.native_uid||process.getgid()!==x.native_gid||root!=='/var/lib/agentstudio-telemetry-native-ci-'+x.run+'-'+x.attempt+'-'+x.nonce.slice(0,16))refuse()
}
const identitySql="SELECT current_database() AS database,d.oid::text AS database_oid,session_user::text AS login,current_user::text AS actor,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::integer AS version,current_setting('server_encoding') AS encoding,(extract(epoch FROM pg_postmaster_start_time())*1000000)::numeric(30,0)::text AS started,r.oid::text AS login_oid,r.rolcanlogin AS can_login,r.rolsuper AS super,r.rolinherit AS inherit,r.rolbypassrls AS bypass,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,current_setting('transaction_read_only') AS read_only,current_setting('default_transaction_read_only') AS default_read_only FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.rolname=session_user WHERE d.datname=current_database()"
async function target(pool,fixture){
 const client=await pool.connect();let active=false,destroy=false
 try{await client.query('BEGIN READ ONLY');active=true;const rows=(await client.query(identitySql)).rows,r=rows[0];if(rows.length!==1||r.database!=='agent_studio'||r.database_oid!==fixture.database_oid||r.login!=='agentstudio_native_login'||r.actor!==r.login||r.address!=='127.0.0.1'||r.port!==5333||r.version<180000||r.version>=190000||r.encoding!=='UTF8'||r.started!==fixture.postmaster_started_us||r.login_oid!==fixture.login_oid||r.can_login!==true||r.read_only!=='on'||r.default_read_only!=='on'||['super','inherit','bypass','create_db','create_role','replication'].some(k=>r[k]!==false))refuse()}
 finally{if(active)try{await client.query('ROLLBACK')}catch{destroy=true}client.release(destroy)}
 if(destroy)refuse()
}
function errorCode(error){
 try{const status=Object.getOwnPropertyDescriptor(error,'status')?.value,code=Object.getOwnPropertyDescriptor(error,'code')?.value
  if(status===401&&code==='session_required'||status===403&&code==='admin_required'||status===503&&code==='company_worker_heartbeats_unavailable')return {status,code}
 }catch{}
 return {status:503,code:'native_control_ci_failed'}
}
// Genuine CI-only HTTP lifecycle; every request uses the same unmodified
// Facade and actual pg.Pool. IPC changes availability/observes local state only.
async function serveNativeHttp(reader,pool,emit){
 if(typeof process.send!=='function'||!process.connected)refuse()
 const {createServer}=await import('node:http')
 const {createNativeCompanyWorkerHeartbeatsHttpHandler}=await import('../../src/native-company-worker-heartbeats-http.ts')
 const {controlObject}=await grammar(),origin='https://native-control-ci.example.test'
 const off=createNativeCompanyWorkerHeartbeatsHttpHandler({component:reader,allowedOrigin:origin})
 const on=createNativeCompanyWorkerHeartbeatsHttpHandler({component:reader,allowedOrigin:origin,enabled:true})
 let enabled=false,settled=false,closing,warmWork,holdWork,holdTimer
 const warmClients=[],heldClients=[],unconfirmedClients=new Set()
 let warmReleaseErrors=0,hold={cycle:0,phase:'idle',acquired:0,released:0,release_errors:0,failed:false,release_reason:null,started:null,finished:null}
 const receipts=[],requestIds=new Set()
 let resolveDone,rejectDone
 const done=new Promise((yes,no)=>{resolveDone=yes;rejectDone=no})
 const finish=error=>{if(settled)return;settled=true;error?rejectDone(Error('native_http_ci_refused')):resolveDone()}
 const holdStatus=()=>({cycle:hold.cycle,phase:hold.phase,held:heldClients.length,acquired:hold.acquired,released:hold.released,
  release_errors:hold.release_errors,failed:hold.failed,release_reason:hold.release_reason,
  elapsed_ms:hold.started===null?0:Math.floor(performance.now()-hold.started),
  duration_ms:hold.finished===null||hold.started===null?0:Math.floor(hold.finished-hold.started),
  warming:warmWork!==undefined,warm_held:warmClients.length,warm_release_errors:warmReleaseErrors,unconfirmed:unconfirmedClients.size})
 const status=()=>({protocol:'native_company_worker_heartbeats_http_ci_status_v2',enabled,
  local:reader.localStatus(),pool:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount},hold:holdStatus(),responses:receipts.slice()})
 // Fixed test operations on this actual pool only. No duration, SQL, target or
 // adapter field can enter the closed IPC grammar.
 const releaseHeld=reason=>{
  if(holdTimer!==undefined){clearTimeout(holdTimer);holdTimer=undefined}
  const clients=heldClients.splice(0)
  if(!clients.length)return
  hold.release_reason=reason
  for(const client of clients)try{client.release(hold.failed);hold.released++}catch{unconfirmedClients.add(client);hold.release_errors++;hold.failed=true}
  hold.finished=performance.now();hold.phase=hold.failed?'failed':'released'
  if(hold.failed)finish(true)
 }
 const primeAuthClients=()=>{
  if(closing||warmWork||holdWork||heldClients.length||reader.localStatus().inFlight!==0)refuse()
  const work=(async()=>{
   let failed=false
   try{
    for(let i=0;i<2;i++)warmClients.push(await pool.connect())
    if(new Set(warmClients).size!==2)refuse()
    for(const client of warmClients){const result=await client.query('SELECT 1 AS warm');if(result.rows.length!==1||result.rows[0].warm!==1)refuse()}
   }catch(error){failed=true;throw error}
   finally{
    for(const client of warmClients.splice(0))try{client.release(failed)}catch{unconfirmedClients.add(client);warmReleaseErrors++;failed=true}
    if(warmReleaseErrors)refuse()
   }
  })()
  warmWork=work
  return work.finally(()=>{if(warmWork===work)warmWork=undefined})
 }
 const holdAuthClientsOneSecond=()=>{
  if(closing||warmWork||holdWork||heldClients.length||reader.localStatus().inFlight!==0||
   pool.totalCount!==2||pool.idleCount!==2||pool.waitingCount!==0)refuse()
  hold={cycle:hold.cycle+1,phase:'acquiring',acquired:0,released:0,release_errors:0,failed:false,release_reason:null,started:null,finished:null}
  const work=(async()=>{
   try{
    // Idle checkout performs no SQL; the real existing clients stay owned.
    for(let i=0;i<2;i++){heldClients.push(await pool.connect());hold.acquired++}
    if(closing||reader.localStatus().inFlight!==0||new Set(heldClients).size!==2)refuse()
    hold.started=performance.now();hold.phase='held'
    const deadline=hold.started+1000
    const timer=()=>{
     const left=deadline-performance.now()
     if(left>0){holdTimer=setTimeout(timer,Math.max(1,Math.ceil(left)));return}
     releaseHeld('timer')
    }
    holdTimer=setTimeout(timer,1000)
   }catch(error){hold.failed=true;releaseHeld('error');hold.phase='failed';throw error}
  })()
  holdWork=work
  return work.finally(()=>{if(holdWork===work)holdWork=undefined})
 }
 const server=createServer((req,res)=>{
  const id=req.headers['x-agentstudio-ci-request']
  res.once('finish',()=>{
   if(typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)){
    receipts.push({request_id:id,status:res.statusCode,local:reader.localStatus()});if(receipts.length>32)receipts.shift()
   }
  })
  void (async()=>{
   if(await(enabled?on:off)(req,res))return
   res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'})
   res.end(JSON.stringify({error:'company_worker_heartbeats_unavailable'}))
  })().catch(()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'company_worker_heartbeats_unavailable'}))}else res.destroy()})
 })
 server.requestTimeout=15000;server.headersTimeout=12000;server.maxRequestsPerSocket=100
 const stop=()=>{
  if(closing)return closing
  enabled=false
  closing=(async()=>{
   if(warmWork)await warmWork.catch(()=>{})
   if(holdWork)await holdWork.catch(()=>{})
   releaseHeld('stop')
   if(unconfirmedClients.size){
    // Keep uncertain ownership visible. Attempt to close only these actual
    // owned clients, then fail; a failed release never becomes drain proof.
    for(const client of unconfirmedClients)try{await client.end()}catch{}
    refuse()
   }
   if(warmClients.length||heldClients.length||warmReleaseErrors||hold.release_errors||hold.failed)refuse()
   await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections()})
   const deadline=performance.now()+20000
   while(reader.localStatus().inFlight!==0){if(performance.now()>=deadline)refuse();await new Promise(resolve=>setTimeout(resolve,10))}
   if(reader.localStatus().cleanupUnknown!==0||pool.waitingCount!==0)refuse()
  })()
  return closing
 }
 const send=(request_id,ok,value)=>new Promise((resolve,reject)=>{
  if(!process.connected)return reject(Error('native_http_ci_refused'))
  process.send({protocol:'native_company_worker_heartbeats_http_ci_reply_v2',request_id,ok,value},error=>error?reject(error):resolve())
 })
 const message=raw=>{void(async()=>{
  let id
  try{
   const command=controlObject(raw,['protocol','request_id','op']);id=command.request_id
   if(command.protocol!=='native_company_worker_heartbeats_http_ci_command_v2'||typeof id!=='string'||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)||
    !['enable','disable','status','stop','prime_auth_clients','hold_auth_clients_1s'].includes(command.op)||requestIds.has(id)||requestIds.size>=4096)refuse()
   requestIds.add(id)
   if(command.op==='enable'){if(closing)refuse();enabled=true}
   if(command.op==='disable')enabled=false
   if(command.op==='prime_auth_clients')await primeAuthClients()
   if(command.op==='hold_auth_clients_1s')await holdAuthClientsOneSecond()
   if(command.op==='stop'){await stop();await send(id,true,status());finish();return}
   await send(id,true,status())
  }catch{if(typeof id==='string'&&process.connected)await send(id,false,{code:'native_http_ci_refused'}).catch(()=>{});finish(true)}
 })()}
 const disconnected=()=>{void stop().then(()=>finish(),()=>finish(true))}
 const terminated=()=>{void stop().then(()=>finish(),()=>finish(true))}
 process.on('message',message);process.once('disconnect',disconnected);process.once('SIGTERM',terminated)
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  server.on('error',()=>finish(true))
  const address=server.address()
  if(!address||typeof address==='string'||address.address!=='127.0.0.1'||!Number.isInteger(address.port)||address.port<1024||address.port>65535)refuse()
  emit({protocol:'native_company_worker_heartbeats_http_ci_ready_v2',host:'127.0.0.1',port:address.port,origin,enabled:false,local:reader.localStatus()})
  await done
 }finally{
  process.off('message',message);process.off('disconnect',disconnected);process.off('SIGTERM',terminated)
  if(server.listening)await stop()
  if(process.connected)process.disconnect()
 }
}

export async function runNativeCompanyWorkerHeartbeatsControlCiChild(){
 let pool,reader,sent=false
 const emit=value=>{if(sent)return;sent=true;process.stdout.write(JSON.stringify(value)+'\n')}
 try{
  const root=host();sealedStage(root)
  const input=await parseNativeControlCiChildFrame(await readFrame());await bind(root,input)
  const entry=fileURLToPath(import.meta.resolve('pg'))
  if(entry!==root+'/services/pg-api/node_modules/pg/esm/index.mjs')refuse()
  const {default:pg}=await import('pg'),{NativeCompanyWorkerHeartbeats}=await import('../../src/native-company-worker-heartbeats.ts')
  pool=new pg.Pool({host:'127.0.0.1',port:5333,database:'agent_studio',user:'agentstudio_native_login',password:input.auth_password,max:2,ssl:false,
   options:'-c default_transaction_read_only=on -c search_path=pg_catalog',application_name:process.argv[2]==='--http-run'?'agentstudio-native-http-control-ci':'agentstudio-native-control-ci',connectionTimeoutMillis:2000,statement_timeout:3000,query_timeout:4000,idleTimeoutMillis:process.argv[2]==='--http-run'?30000:1000})
  pool.on('error',()=>{});await target(pool,input.fixture)
  reader=new NativeCompanyWorkerHeartbeats(pool)
  if(process.argv[2]==='--http-run'){await serveNativeHttp(reader,pool,emit);return}
  try{const snapshot=await reader.read(input.cookie);emit({snapshot,local:reader.localStatus()})}
  catch(error){process.exitCode=1;emit({error:errorCode(error),local:reader.localStatus()})}
 }catch{process.exitCode=2;emit({error:{status:503,code:'native_control_ci_refused'},local:null})}
 finally{if(pool)try{await pool.end()}catch{process.exitCode=1}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.on('error',()=>{process.exitCode=1})
 void runNativeCompanyWorkerHeartbeatsControlCiChild().catch(()=>{process.exitCode=1})
}
