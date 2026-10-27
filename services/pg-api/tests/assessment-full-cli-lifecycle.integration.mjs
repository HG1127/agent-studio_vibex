// Hosted-only actual child CLI lifecycle tests. Fixture attestation precedes
// every SQL/credential/listener/child effect. No provider or systemd is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFile,readdir,readlink} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {createServer as httpsServer,request as httpsRequest} from 'node:https'
import {createServer as tcpServer,createConnection} from 'node:net'
import {checkServerIdentity} from 'node:tls'
import {setTimeout as delay} from 'node:timers/promises'
import {assessmentFullCliFixture} from './helpers/assessment-full-cli-fixture.mjs'
import {assessmentRequest,assessmentRows,assessmentCounts} from './helpers/agent-assessment-fixture.mjs'
import {createAgentAssessmentInternalHandler} from '../src/agent-assessment-client.ts'
import {agentAssessmentApproval,agentAssessmentRoute} from '../src/agent-assessment-contract.ts'

const entry=fileURLToPath(new URL('../src/agent-assessment-service.ts',import.meta.url))
const backend=fileURLToPath(new URL('../',import.meta.url)),port=7459
const allowedEnv=new Set(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','SystemRoot',
  'CREDENTIALS_DIRECTORY','AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED','AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED',
  'AGENT_STUDIO_PG_REVIEW_SERVICE_REVIEWED','AGENT_STUDIO_PG_REVIEW_ORIGIN','AGENT_STUDIO_PG_REVIEW_SERVER_FINGERPRINT','AGENT_STUDIO_PG_REVIEW_CLIENT_FINGERPRINT',
  'AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN','AGENT_STUDIO_PG_REVIEW_DISPATCH_LOGIN','AGENT_STUDIO_PG_PILOT_ENABLED','AGENT_STUDIO_PG_BAOTA18_ENABLED',
  'AGENT_STUDIO_PG_BAOTA18_TARGET_CONFIRMED','AGENT_STUDIO_PG_HOST','AGENT_STUDIO_PG_PORT','AGENT_STUDIO_PG_DATABASE','AGENT_STUDIO_PG_USER',
  'AGENT_STUDIO_PG_KNOWLEDGE_SHARING_ENABLED','AGENT_STUDIO_PG_KNOWLEDGE_SHARING_APPROVED','AGENT_STUDIO_PG_KNOWLEDGE_TOOL_ENABLED','AGENT_STUDIO_PG_KNOWLEDGE_TOOL_APPROVED'])
const forbiddenOutput=/-----BEGIN|api_key|password|owner_user_id|request_id|lease_token|result_sha256|completion_sha256|model-encryption\.secret|\/run\/credentials\/|\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i
function childEnv(f,kind){
  const source=f.serviceEnv(kind),env={}
  for(const [key,value] of Object.entries(source))if(allowedEnv.has(key)&&value!==undefined){assert.equal(typeof value,'string');env[key]=value}
  assert.ok(!Object.keys(env).some(k=>k.startsWith('NODE_TEST_')||k==='NODE_TEST_CONTEXT'||k==='NODE_OPTIONS'||/^PG[A-Z_]/.test(k)||/ADMIN|PROXY|TLS_REJECT|EXTRA_CA/.test(k)))
  assert.equal(env.AGENT_STUDIO_PG_REVIEW_ORIGIN,'https://127.0.0.1:7459')
  assert.equal(env.AGENT_STUDIO_PG_PORT,'5333');assert.equal(env.AGENT_STUDIO_PG_DATABASE,'agent_studio')
  return env
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
async function bounded(promise,ms,label){
  let timer
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms)})])}
  finally{clearTimeout(timer)}
}
async function until(check,label,{ms=20000,child}={}){
  const end=performance.now()+ms
  while(performance.now()<end){const value=await check();if(value)return value;if(child?.state.closed)throw Error(label+'; child exited before the expected observation');await delay(25)}
  throw Error(label)
}
function launch(f,kind,mode='serve'){
  assert.ok(mode==='serve'||mode==='preflight','test launch mode must be an explicit trusted constant')
  const env=childEnv(f,kind),state={closed:false,code:null,signal:null,error:false,stdout:'',stderr:'',overflow:false}
  const child=spawn(process.execPath,['--experimental-strip-types',entry,'--'+mode,kind],{cwd:backend,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  const capture=field=>piece=>{state[field]+=piece.toString('utf8');if(state.stdout.length+state.stderr.length>65536){state.overflow=true;child.kill('SIGKILL')}}
  child.stdout.on('data',capture('stdout'));child.stderr.on('data',capture('stderr'));child.once('error',()=>{state.error=true})
  const done=new Promise(resolve=>child.once('close',(code,signal)=>{Object.assign(state,{closed:true,code,signal});resolve({code,signal})}))
  return {child,state,done,env}
}
function safeOutput(p){
  assert.equal(p.state.error,false,'child executable must actually start');assert.equal(p.state.overflow,false)
  assert.ok(!forbiddenOutput.test(p.state.stdout+p.state.stderr),'service output must contain only safe metadata, never identity/credential/input/result fields')
}
function reports(p){
  const lines=p.state.stdout.split(/\r?\n/),partial=lines.pop()
  if(p.state.closed&&partial)throw Error('service stdout ended with an incomplete metadata line')
  return lines.filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{throw Error('service stdout must be safe JSON metadata')}})
}
async function ready(p,kind){
  const report=await until(()=>reports(p).find(v=>v.ready===true),'service did not report actual readiness',{ms:45000,child:p})
  safeOutput(p)
  const expected=kind==='broker'?{mode:'serve',service:'broker',ready:true,bind:'127.0.0.1',port,requires_mutual_tls:true,execution_enabled:true,production_cutover_allowed:false}:
    {mode:'serve',service:'worker',ready:true,worker_started:true,execution_enabled:true,production_cutover_allowed:false}
  assert.deepEqual(report,expected)
}
async function exit(p,code=0){
  const result=await bounded(p.done,70000,'child exceeded the advertised shutdown deadline')
  safeOutput(p);assert.deepEqual(result,{code,signal:null});return result
}
async function dispose(p){
  if(!p||p.state.closed)return
  p.child.kill('SIGTERM')
  try{await bounded(p.done,70000,'cleanup child timeout')}
  catch{p.child.kill('SIGKILL');await bounded(p.done,5000,'owned child failed to terminate')}
}
async function staysAlive(p,label,ms=200){await delay(ms);assert.equal(p.state.closed,false,label)}
const workerLogin=env=>env.AGENT_STUDIO_PG_REVIEW_WORKER_LOGIN??'agentstudio_review_worker_login'
const dispatchLogin=env=>env.AGENT_STUDIO_PG_REVIEW_DISPATCH_LOGIN??'agentstudio_review_dispatch_login'
const loginsFor=(kind,env)=>kind==='worker'?[workerLogin(env)]:[dispatchLogin(env),'agentstudio_stage_login','agentstudio_model_broker_login']
async function backends(f,logins){return (await f.db.query('SELECT pid,usename FROM pg_catalog.pg_stat_activity WHERE datname=current_database() AND usename=ANY($1::text[])',[logins])).rows}
async function childBackends(f,p,kind,baseline){
  const names=loginsFor(kind,p.env),known=new Set(baseline.map(v=>v.pid))
  return until(async()=>{const rows=(await backends(f,names)).filter(v=>!known.has(v.pid));return names.every(name=>rows.some(v=>v.usename===name))?rows:null},'service did not authenticate all required independent logins',{child:p})
}
async function noLeakedBackends(f,logins,baseline){
  const known=new Set(baseline.map(v=>v.pid))
  await until(async()=>(await backends(f,logins)).every(v=>known.has(v.pid)),'service left backend connections after exit',{ms:10000})
}
async function snapshot(f){
  return {execution:await assessmentCounts(f),admission:(await f.db.query(`SELECT
    (SELECT count(*)::integer FROM agentstudio.agent_review_requests) AS requests,
    (SELECT count(*)::integer FROM agentstudio.agent_review_jobs) AS jobs,
    (SELECT count(*)::integer FROM agentstudio.agent_review_feedback_sources) AS sources,
    (SELECT count(*)::integer FROM agentstudio.agent_review_controls) AS controls`)).rows[0]}
}
async function emptyQueue(f){
  const state=await snapshot(f)
  assert.equal(state.admission.requests,0);assert.equal(state.admission.jobs,0);assert.equal(state.execution.inputs,0)
  for(const field of ['leases','effects','outcomes','outputs'])assert.equal(state.execution[field],0)
  return state
}
async function claimCalls(f){
  const raw=(await f.db.query("SELECT coalesce((SELECT calls FROM pg_catalog.pg_stat_user_functions WHERE funcid='agentstudio.agent_assessment_claim(uuid)'::regprocedure),0)::text AS calls")).rows[0].calls
  const count=Number(raw);assert.ok(Number.isSafeInteger(count)&&count>=0);return count
}
async function connectable(){
  return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});let settled=false
    const finish=value=>{if(settled)return;settled=true;socket.destroy();resolve(value)}
    socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(300,()=>finish(false))})
}
async function procRows(pid){
  const fd=await readdir('/proc/'+pid+'/fd')
  const links=await Promise.allSettled(fd.map(v=>readlink('/proc/'+pid+'/fd/'+v)))
  const owned=new Set(links.filter(v=>v.status==='fulfilled').map(v=>/^socket:\[(\d+)\]$/.exec(v.value)?.[1]).filter(Boolean)),result=[]
  for(const file of ['/proc/net/tcp','/proc/net/tcp6']){
    let raw;try{raw=await readFile(file,'utf8')}catch(error){if(error.code==='ENOENT')continue;throw error}
    for(const line of raw.trim().split('\n').slice(1)){
      const fields=line.trim().split(/\s+/),local=fields[1].split(':'),remote=fields[2].split(':')
      if(owned.has(fields[9])&&Number.parseInt(local[1],16)===port)result.push({address:local[0],port,state:fields[3],peerPort:Number.parseInt(remote[1],16)})
    }
  }
  return result
}
async function assertListener(p){
  const rows=await until(async()=>{const rows=(await procRows(p.child.pid)).filter(v=>v.state==='0A');return rows.length?rows:null},'real child did not own a listening socket',{child:p})
  assert.equal(rows.length,1);assert.equal(rows[0].address,'0100007F','actual socket must bind127.0.0.1, not a wildcard')
}
function pin(value){return value.replaceAll(':','').toLowerCase()}
async function privateRequest(f,proof,{certificate=true}={}){
  const body=Buffer.from(JSON.stringify(proof))
  return new Promise(resolve=>{
    const req=httpsRequest({hostname:'127.0.0.1',port,servername:'localhost',path:agentAssessmentRoute,method:'POST',ca:f.tls.ca,
      ...(certificate?{cert:f.tls.clientCert,key:f.tls.clientKey}:{}),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,signal:AbortSignal.timeout(10000),
      checkServerIdentity(host,cert){return checkServerIdentity(host,cert)||(pin(cert.fingerprint256)===pin(f.tls.serverFingerprint)?undefined:Error('synthetic_cli_server_pin_refused'))},
      headers:{'Content-Type':'application/json','Content-Length':String(body.length)}},res=>{
      const chunks=[];let size=0
      res.on('data',part=>{size+=part.length;if(size>4096){res.destroy();return}chunks.push(Buffer.from(part))})
      res.once('end',()=>{let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{value=null}resolve({status:res.statusCode,body:value,networkError:false})})
      res.once('error',()=>resolve({status:0,body:null,networkError:true}))
    })
    req.once('error',()=>resolve({status:0,body:null,networkError:true}));req.end(body)
  })
}
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})}
async function closeServer(server,sockets){
  if(!server)return
  for(const socket of sockets??[])socket.destroy()
  server.closeAllConnections?.()
  if(server.listening)await new Promise(resolve=>server.close(resolve))
}
async function preflights(f,initial){
  for(const kind of ['worker','broker']){
    assert.deepEqual(await snapshot(f),initial);assert.equal(await connectable(),false)
    const env=childEnv(f,kind),names=loginsFor(kind,env),baseline=await backends(f,names),p=launch(f,kind,'preflight')
    let stopped=false,opened=false
    const monitor=(async()=>{while(!stopped&&!p.state.closed){if(await connectable())opened=true;await delay(20)}})()
    try{
      await exit(p)
      assert.deepEqual(reports(p),[{mode:'preflight',service:kind,ready:true,read_only:true,verified_roles:kind==='worker'?1:3,tls_material_verified:true,
        encryption_key_loaded:false,db_writes_performed:false,port_opened:false,worker_started:false,external_model_calls:false,production_cutover_allowed:false}])
      assert.equal(p.state.stderr,'')
    }finally{stopped=true;await monitor;await dispose(p)}
    assert.equal(opened,false,'actual preflight must never expose a7459 listener while running')
    assert.equal(await connectable(),false);await noLeakedBackends(f,names,baseline)
    assert.deepEqual(await snapshot(f),initial,'actual CLI preflight must not claim, mutate or audit any pending request')
  }
}

test('attested full CLI: actual Broker listener/bind/TLS drain and Worker idle/inflight SIGTERM use only synthetic credentials and loopback mTLS', {concurrency:false,timeout:420000},async t=>{
  // The fixture enforces the independent hosted container/target attestation
  // BEFORE any SQL, credential mount, listener or child is opened here.
  const f=await assessmentFullCliFixture()
  let pending
  try{
    await t.test('actual worker and broker CLI preflight are readonly with a genuinely empty queue',async()=>{
      await preflights(f,await emptyQueue(f))
    })
    await t.test('empty Broker CLI owns the real pinned mTLS listener and drains on SIGTERM without work',async()=>{
      const initial=await emptyQueue(f),env=childEnv(f,'broker'),names=loginsFor('broker',env),baseline=await backends(f,names)
      assert.equal(await connectable(),false)
      const p=launch(f,'broker')
      try{
        await ready(p,'broker');await childBackends(f,p,'broker',baseline);await assertListener(p)
        const proof={request_id:randomUUID(),lease_token:randomUUID(),lease_version:1,worker_id:randomUUID()}
        assert.deepEqual(await privateRequest(f,proof),{status:503,body:{error:'agent_assessment_outcome_unavailable'},networkError:false})
        assert.equal((await privateRequest(f,proof,{certificate:false})).networkError,true,'real listener must require a client certificate')
        assert.equal((await privateRequest(f,{...proof,owner_user_id:f.users.alice})).status,400)
        assert.deepEqual(await snapshot(f),initial)
        assert.equal(p.child.kill('SIGTERM'),true);await exit(p)
        assert.equal(await connectable(),false);await noLeakedBackends(f,names,baseline)
        assert.deepEqual(await snapshot(f),initial);assert.equal(p.state.stderr,'')
      }finally{await dispose(p)}
    })
    await t.test('empty Broker CLI reports real occupied-port failure and closes its authenticated pools',async()=>{
      const initial=await emptyQueue(f),env=childEnv(f,'broker'),names=loginsFor('broker',env),baseline=await backends(f,names),sockets=new Set()
      const occupied=tcpServer(socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))})
      let p
      try{
        await listen(occupied);p=launch(f,'broker');await exit(p,1)
        assert.equal(p.state.stdout,'');assert.equal(p.state.stderr,'AGENT_ASSESSMENT_SERVICE_REFUSED\n')
        assert.equal(occupied.listening,true);assert.equal(await connectable(),true,'only the harness closes its original listener')
        await noLeakedBackends(f,names,baseline);assert.deepEqual(await snapshot(f),initial)
      }finally{await dispose(p);await closeServer(occupied,sockets)}
      assert.equal(await connectable(),false)
    })
    await t.test('empty Broker CLI waits for an actual pending TLS socket after repeated SIGTERM before closing pools',async()=>{
      const initial=await emptyQueue(f),env=childEnv(f,'broker'),names=loginsFor('broker',env),baseline=await backends(f,names)
      const p=launch(f,'broker');let peer
      try{
        await ready(p,'broker');const owned=await childBackends(f,p,'broker',baseline);await assertListener(p)
        peer=createConnection({host:'127.0.0.1',port});peer.on('error',()=>{})
        await bounded(new Promise((resolve,reject)=>{peer.once('connect',resolve);peer.once('error',reject)}),5000,'raw TLS peer could not connect')
        await until(async()=>(await procRows(p.child.pid)).some(v=>v.state==='01'&&v.peerPort===peer.localPort),'child did not accept the actual pending TLS socket',{child:p})
        await delay(50);assert.equal(p.child.kill('SIGTERM'),true)
        await until(async()=>!await connectable(),'Broker kept accepting after SIGTERM',{child:p})
        await staysAlive(p,'Broker must drain its held pre-handshake socket')
        assert.equal(p.child.kill('SIGTERM'),true);await staysAlive(p,'second same SIGTERM must not bypass graceful drain')
        const stillOpen=new Set((await backends(f,names)).map(v=>v.pid))
        assert.ok(owned.every(v=>stillOpen.has(v.pid)),'pools stay available until socket drain finishes')
        peer.destroy();await exit(p)
        assert.equal(await connectable(),false);await noLeakedBackends(f,names,baseline)
        assert.deepEqual(await snapshot(f),initial);assert.equal(p.state.stderr,'')
      }finally{peer?.destroy();await dispose(p)}
    })
    await t.test('empty Worker CLI stops idle polling and closes its sole dedicated login on SIGTERM',async()=>{
      const initial=await emptyQueue(f),env=childEnv(f,'worker'),names=loginsFor('worker',env),baseline=await backends(f,names)
      assert.equal(workerLogin(env),'agentstudio_review_worker_login')
      const settings=(await f.db.query("SELECT rolconfig FROM pg_catalog.pg_roles WHERE rolname='agentstudio_review_worker_login'")).rows[0].rolconfig??[]
      assert.ok(!settings.some(v=>v.startsWith('track_functions=')),'fresh dedicated login must have no pre-existing tracking override')
      // Fixture-only diagnostics, not an authorization/SQL-result bypass.
      // Real server function stats distinguish an actual idle claim from a
      // ready report whose loop never executed. Reset before the final case.
      await f.db.exec("ALTER ROLE agentstudio_review_worker_login SET track_functions='pl'")
      const callsBefore=await claimCalls(f);let p
      try{
        p=launch(f,'worker')
        await ready(p,'worker');await childBackends(f,p,'worker',baseline)
        // Empty claims write no lease/audit row. On backend exit PostgreSQL
        // flushes the real PL/pgSQL call count used as the separate oracle.
        await delay(1000);assert.equal(p.child.kill('SIGTERM'),true);await exit(p)
        await noLeakedBackends(f,names,baseline)
        await until(async()=>await claimCalls(f)>callsBefore,'actual Worker did not execute any idle claim',{ms:5000})
        const stoppedCalls=await claimCalls(f);await delay(850);assert.equal(await claimCalls(f),stoppedCalls,'no idle tick continues after process exit')
        assert.deepEqual(reports(p).filter(v=>v.service==='agent-assessment-worker'),[],'idle polling emits no fake completed work')
        assert.equal(await connectable(),false)
        assert.deepEqual(await snapshot(f),initial);assert.equal(p.state.stderr,'')
      }finally{try{await dispose(p)}finally{await f.db.exec('ALTER ROLE agentstudio_review_worker_login RESET track_functions')}}
    })
    await t.test('actual worker and broker CLI preflight leave two pending requests entirely untouched',async()=>{
      // Seed only now. The preceding Broker/idle-Worker cases therefore had
      // genuinely empty queues. Preflight must not consume this pending work.
      await emptyQueue(f)
      const first=await assessmentRequest(f,{purpose:'evaluate'}),second=await assessmentRequest(f,{purpose:'evaluate'}),before=await snapshot(f)
      pending={first,second,before}
      assert.equal(before.admission.requests,2);assert.equal(before.admission.jobs,2);assert.equal(before.execution.inputs,2)
      assert.equal(before.execution.leases,0);assert.equal(before.execution.effects,0)
      await preflights(f,before)
      for(const p of [first,second])assert.equal((await assessmentRows(f,p.raw.request_id,p.owner)).leases.length,0)
    })
    await t.test('Worker CLI drains one real fixed7459 mTLS RPC after two SIGTERMs, performs protected pause on real503, and never ticks the second pending review',async()=>{
      assert.ok(pending,'the preceding real pending-preflight case must supply the two requests')
      const {first,second,before}=pending
      assert.deepEqual(await snapshot(f),before)
      const received=deferred(),release=deferred(),sockets=new Set(),errors=[];let calls=0
      const handler=createAgentAssessmentInternalHandler({executionEnabled:true,executionApproval:agentAssessmentApproval,reviewedClientFingerprint256:f.tls.clientFingerprint,
        dispatch:async proof=>{calls++;received.resolve({...proof});await release.promise;throw Error('synthetic_cli_transport_unavailable')}})
      const fake=httpsServer({ca:f.tls.ca,cert:f.tls.serverCert,key:f.tls.serverKey,requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},(req,res)=>{
        void (async()=>{assert.equal(req.socket.authorized,true);await handler(req,res)})().catch(error=>{errors.push(error);res.destroy()})
      })
      fake.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))});fake.on('tlsClientError',()=>{})
      const env=childEnv(f,'worker'),names=loginsFor('worker',env),baseline=await backends(f,names);let p
      try{
        await listen(fake);p=launch(f,'worker');await ready(p,'worker');await childBackends(f,p,'worker',baseline)
        const proof=await bounded(received.promise,15000,'actual Worker did not reach the real synthetic mTLS handler')
        assert.equal(proof.request_id,first.raw.request_id);assert.equal(calls,1)
        const claimed=await assessmentRows(f,first.raw.request_id,first.owner)
        assert.equal(claimed.leases.length,1);assert.equal(claimed.leases[0].state,'claimed')
        assert.equal((await assessmentRows(f,second.raw.request_id,second.owner)).leases.length,0)
        assert.equal(p.child.kill('SIGTERM'),true);await staysAlive(p,'first SIGTERM must await the real in-flight private RPC')
        assert.equal(p.child.kill('SIGTERM'),true);await staysAlive(p,'second SIGTERM must not fall through to default process termination')
        // A real503 from the authentic handler makes the real Worker call
        // protected pause. Resolved unknown metadata is a different contract;
        // this fake Broker never fabricates a durable success/result/outcome.
        release.resolve();await exit(p)
        assert.equal(errors.length,0,'synthetic TLS handler must complete without hidden errors')
        assert.equal(calls,1);assert.equal(p.state.stderr,'')
        assert.deepEqual(reports(p).filter(v=>v.service==='agent-assessment-worker'),[{service:'agent-assessment-worker',state:'paused'}])
        const paused=await assessmentRows(f,first.raw.request_id,first.owner),untouched=await assessmentRows(f,second.raw.request_id,second.owner)
        assert.equal(paused.leases[0].state,'paused');assert.equal(untouched.leases.length,0)
        for(const rows of [paused,untouched])for(const name of ['effects','outcomes','outputs'])assert.equal(rows[name].length,0)
        const after=await snapshot(f)
        assert.deepEqual(after,{execution:{...before.execution,leases:before.execution.leases+1,audits:before.execution.audits+2},admission:before.admission},'only the actual claim and protected pause change durable state')
        await noLeakedBackends(f,names,baseline)
      }finally{release.resolve();await dispose(p);await closeServer(fake,sockets)}
      assert.equal(await connectable(),false)
    })
  }finally{await f.close()}
})
