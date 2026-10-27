// Offline/early-refusal CLI tests only. No DB/SQL or real target is contacted.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {EventEmitter} from 'node:events'
import {startAgentAssessmentService,runAgentAssessmentServiceCli,createAgentAssessmentServiceAdmission,attachAgentAssessmentShutdown} from '../src/agent-assessment-service.ts'
const entry=fileURLToPath(new URL('../src/agent-assessment-service.ts',import.meta.url))
function cli(args){const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));Object.assign(env,{AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'false',AGENT_STUDIO_PG18_REVIEW_EXECUTION_APPROVED:'synthetic-private-approval',DATABASE_URL:'postgres://synthetic-forbidden-never-contact',CREDENTIALS_DIRECTORY:'/never/read/synthetic-private-key'});const r=spawnSync(process.execPath,['--experimental-strip-types',entry,...args],{env,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(r.error,undefined);assert.doesNotMatch(r.stdout+r.stderr,/synthetic-private|never-contact|never\/read/);return r}
test('standalone --plan/--help exit successfully with hostile ambient DB/credential settings and no activation',()=>{
  for(const arg of ['--plan','--help']){const r=cli([arg]);assert.equal(r.status,0);const report=JSON.parse(r.stdout);assert.equal(report.production_cutover_allowed,false);assert.equal(report.default_enabled,false);assert.equal(r.stderr,'')}
})
test('unapproved preflight/serve refuse early for both actual service kinds and emit only a fixed safe code',()=>{
  for(const mode of ['--preflight','--serve'])for(const kind of ['worker','broker']){const r=cli([mode,kind]);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'AGENT_ASSESSMENT_SERVICE_REFUSED\n')}
})
test('missing/ambiguous modes cannot start or preflight any service',()=>{
  for(const args of [[],['--serve'],['--preflight'],['--serve','worker','--force'],['--serve','api']]){const r=cli(args);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.equal(r.stderr,'AGENT_ASSESSMENT_SERVICE_REFUSED\n')}
})
test('programmatic starts refuse at the consent gate before even inspecting credential paths',async()=>{
  for(const mode of ['preflight','serve'])for(const kind of ['worker','broker']){let later=0;const env={AGENT_STUDIO_PG18_REVIEW_EXECUTION_ENABLED:'false'};Object.defineProperty(env,'CREDENTIALS_DIRECTORY',{get(){later++;throw Error('credential access')}});await assert.rejects(startAgentAssessmentService(kind,mode,env),{message:'agent_assessment_service_not_approved'});assert.equal(later,0)}
})
test('programmatic offline CLI never inspects its environment',async()=>{
  const env=new Proxy({},{get(){throw Error('offline environment access')},ownKeys(){throw Error('offline environment enumeration')}})
  const original=process.stdout.write;const captured=[];process.stdout.write=value=>{captured.push(String(value));return true}
  try{await runAgentAssessmentServiceCli(['--plan'],env);await runAgentAssessmentServiceCli(['--help'],env)}finally{process.stdout.write=original}
  assert.equal(captured.length,2);assert.equal(JSON.parse(captured[0]).credentials_read,false);assert.equal(JSON.parse(captured[1]).preflight_read_only,true)
})
const proof={request_id:'abcdef01-abcd-4abc-8def-123456789abc',lease_token:'fedcba01-fedc-4fed-8cba-abcdef012345',lease_version:1,worker_id:'11111111-1111-4111-8111-111111111111'}
const result={request_id:proof.request_id,state:'unknown'}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function response(){return {status:undefined,headers:undefined,body:undefined,writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=JSON.parse(body)}}}
function socket(){const sock=new EventEmitter();sock.destroyed=0;sock.destroy=()=>{sock.destroyed++;sock.emit('close')};return sock}
test('Broker stopping refuses request callbacks without reading bodies and refuses dispatch after an already-started body read',async()=>{
  let calls=0,reads=0,finishBody
  const admission=createAgentAssessmentServiceAdmission(async()=>{calls++;return result}),handler=admission.handler(async()=>{reads++;await new Promise(resolve=>{finishBody=resolve});await admission.dispatch(proof)})
  const reading=handler({},response());await flush();assert.equal(reads,1)
  admission.close();admission.close()
  const denied=response();await handler({},denied);assert.equal(denied.status,503);assert.equal(denied.headers.Connection,'close');assert.deepEqual(denied.body,{error:'agent_assessment_service_closing'});assert.equal(reads,1)
  const refused=assert.rejects(reading,{message:'agent_assessment_service_closing'});finishBody();await refused;assert.equal(calls,0)
})
test('Broker drain keeps application promises alive after HTTP disconnect and spends one shared55s budget before cleanup',async()=>{
  let finishDispatch,settled=false;const events=[],raw=socket()
  const admission=createAgentAssessmentServiceAdmission(async()=>{events.push('dispatch-start');await new Promise(resolve=>{finishDispatch=resolve});events.push('dispatch-end');return result},async(work,budget)=>{events.push(['budget',budget]);await work})
  const handler=admission.handler(async()=>{await admission.dispatch(proof);events.push('handler-end')})
  admission.trackSocket(raw);const request=handler({},response());await flush();raw.emit('close')
  const server={listening:true,close(callback){events.push('http-already-disconnected');callback()},closeAllConnections(){events.push('force-http')}}
  const drain=admission.drain(server).then(()=>{settled=true;events.push('pool-end');events.push('key-clear')})
  await flush();assert.equal(settled,false);assert.ok(!events.includes('pool-end'));assert.deepEqual(events.filter(event=>Array.isArray(event)),[['budget',55000]])
  await assert.rejects(admission.dispatch(proof),{message:'agent_assessment_service_closing'})
  finishDispatch();await request;await drain
  assert.ok(events.indexOf('dispatch-end')<events.indexOf('handler-end'));assert.ok(events.indexOf('handler-end')<events.indexOf('pool-end'));assert.ok(events.indexOf('pool-end')<events.indexOf('key-clear'));assert.ok(!events.includes('force-http'))
})
test('Broker drain also tracks admitted dispatch without relying on an HTTP handler or socket',async()=>{
  let finish,drained=false
  const admission=createAgentAssessmentServiceAdmission(async()=>{await new Promise(resolve=>{finish=resolve});return result},async(work,budget)=>{assert.equal(budget,55000);await work})
  const dispatch=admission.dispatch(proof);await flush()
  const server={listening:false,close(){throw Error('not listening')},closeAllConnections(){throw Error('not timed out')}}
  const drain=admission.drain(server).then(()=>{drained=true});await flush();assert.equal(drained,false)
  finish();assert.deepEqual(await dispatch,result);await drain;assert.equal(drained,true)
})
test('shared Broker deadline destroys raw pending-TLS sockets, refuses late connections, and is idempotent',async()=>{
  let expire,waits=0,serverCloses=0,httpDestroys=0,completed=false
  const admission=createAgentAssessmentServiceAdmission(async()=>result,async(work,budget)=>{waits++;assert.equal(budget,55000);return new Promise((resolve,reject)=>{expire=()=>reject(Error('synthetic deadline'));work.then(()=>{completed=true;resolve()},reject)})}),tlsHandshake=socket(),closedSocket=socket()
  admission.trackSocket(tlsHandshake);admission.trackSocket(closedSocket);closedSocket.emit('close')
  const server={listening:true,close(callback){serverCloses++;callback()},closeAllConnections(){httpDestroys++}}
  const drain=admission.drain(server);assert.equal(admission.drain(server),drain);assert.equal(tlsHandshake.destroyed,0)
  const late=socket();admission.trackSocket(late);assert.equal(late.destroyed,1)
  const rejected=assert.rejects(drain,{message:'agent_assessment_shutdown_timeout'});await flush();assert.equal(completed,false);assert.equal(tlsHandshake.destroyed,0);expire();await rejected
  assert.equal(tlsHandshake.destroyed,1);assert.equal(closedSocket.destroyed,0);assert.equal(httpDestroys,1);assert.equal(serverCloses,1);assert.equal(waits,1)
})
test('an early HTTP close error does not cut short the active application drain',async()=>{
  let finish,settled=false,waits=0
  const admission=createAgentAssessmentServiceAdmission(async()=>{await new Promise(resolve=>{finish=resolve});return result},async(work,budget)=>{waits++;assert.equal(budget,55000);await work})
  const dispatch=admission.dispatch(proof);await flush()
  const drain=admission.drain({listening:true,close(callback){callback(Error('synthetic close failure'))},closeAllConnections(){}})
  const rejected=assert.rejects(drain,{message:'agent_assessment_shutdown_timeout'}).then(()=>{settled=true})
  await flush();assert.equal(settled,false);finish();await dispatch;await rejected;assert.equal(waits,1)
})
test('same SIGTERM remains handled throughout drain, closes once and removes signal/timer handles after success',async()=>{
  const signals=new EventEmitter();let release,calls=0,exits=0,reports=0,timers=0,cleared=0;const token={}
  attachAgentAssessmentShutdown(async()=>{calls++;await new Promise(resolve=>{release=resolve})},{signals,timer(_callback,ms){assert.equal(ms,65000);timers++;return token},clear(value){assert.equal(value,token);cleared++},exit(){exits++},reportFailure(){reports++}})
  signals.emit('SIGTERM');await flush();signals.emit('SIGTERM');signals.emit('SIGINT');assert.equal(calls,1);assert.equal(timers,1);assert.equal(signals.listenerCount('SIGTERM'),1);assert.equal(signals.listenerCount('SIGINT'),1);assert.equal(cleared,0);assert.equal(exits,0)
  release();await flush();assert.equal(cleared,1);assert.equal(signals.listenerCount('SIGTERM'),0);assert.equal(signals.listenerCount('SIGINT'),0);assert.equal(exits,0);assert.equal(reports,0)
})
test('failed graceful shutdown clears handlers/timer and reports only the fixed failure path',async()=>{
  const signals=new EventEmitter();let exits=0,reports=0,cleared=0
  attachAgentAssessmentShutdown(async()=>{throw Error('private shutdown detail')},{signals,timer(_callback,ms){assert.equal(ms,65000);return {}},clear(){cleared++},exit(){exits++},reportFailure(){reports++}})
  signals.emit('SIGTERM');signals.emit('SIGTERM');await flush();assert.equal(exits,1);assert.equal(reports,1);assert.equal(cleared,1);assert.equal(signals.listenerCount('SIGTERM'),0);assert.equal(signals.listenerCount('SIGINT'),0)
})
