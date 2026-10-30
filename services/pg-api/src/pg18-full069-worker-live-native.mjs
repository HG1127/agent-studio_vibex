// Fixed local TLS -> owned original NativeServer. No Reader bypass or adapter.
import https from 'node:https'
import {isNativeError,isProxy} from 'node:util/types'
import {parseFull069NativeReaderPhase} from './pg18-full069-native-reader-failure-observation.mjs'
import http from 'node:http'
import {X509Certificate,createPrivateKey} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {setTimeout as delay} from 'node:timers/promises'
import {parseWorkerHeartbeatControlJson} from './worker-heartbeat-activation-control-contract.ts'
import {parseWorkerHeartbeatSnapshot} from './worker-heartbeat-contract.ts'
import {readFull069RootJournal} from './pg18-full069-worker-live-runtime.mjs'
import {reviewFull069NativeReaderCatalogAudit} from './pg18-full069-reader-audit-phase.mjs'
import {liveContext,readLivePrivate,assertLiveStable} from './pg18-full069-worker-live-trust.mjs'
import {observeFull069OwnedProcesses} from './pg18-full069-worker-live-processes.mjs'
import {closed,liveLimits,freeze,liveFail} from './pg18-full069-worker-live-contract.mjs'
const readerFailureObservations=new WeakMap()
export function full069OwnedNativeReaderFailureObservation(error){try{return isNativeError(error)&&!isProxy(error)?readerFailureObservations.get(error)??null:null}catch{return null}}
const observations=new WeakSet(),states=new WeakMap(),origin='https://127.0.0.1:17443',route='/api/v2/company-worker-heartbeats',routes=new Map([['/api/native-auth/login','POST'],['/api/native-auth/logout','POST'],['/api/native-auth/me','GET'],['/api/native-auth/capabilities','GET'],[route,'GET']])
function state(handle){const s=states.get(handle);if(!s||s.closed)liveFail('untrusted_native');assertLiveStable(s.trust);observeFull069OwnedProcesses(s.processes,{complete:false});return s}
function tlsMaterial(ctx){const p=ctx.profile.credentials,ca=readLivePrivate(p.tls_ca,{max:131072}).bytes,cert=readLivePrivate(p.tls_certificate,{max:131072}).bytes,key=readLivePrivate(p.tls_key,{max:131072}).bytes,x509=new X509Certificate(cert);if(x509.checkIP('127.0.0.1')!=='127.0.0.1'||!x509.checkPrivateKey(createPrivateKey(key))||Date.parse(x509.validFrom)>Date.now()-30000||Date.parse(x509.validTo)<Date.now()+ctx.profile.minimum_ms+600000)liveFail('tls_validity');return {ca,cert,key}}
export async function openFull069OwnedNative(trust,processes){
 const ctx=liveContext(trust);if(!ctx.write)liveFail('native_not_approved');observeFull069OwnedProcesses(processes,{complete:false});const material=tlsMaterial(ctx),s={trust,processes,material,closed:false,failed:false,server:/** @type {import('node:https').Server|null} */(null),sockets:new Set(),upstreams:new Set()},handle=Object.freeze(Object.create(null))
 const server=https.createServer({key:material.key,cert:material.cert,minVersion:'TLSv1.2',maxHeaderSize:8192,requestTimeout:8000,headersTimeout:8000},(req,res)=>{
  if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!=='127.0.0.1:17443'||req.headers.origin!==origin||routes.get(req.url??'')!==req.method||req.headers.authorization!==undefined||req.headers['x-rh-user-id']!==undefined){res.writeHead(403);res.end();return}
  const upstream=http.request({host:'127.0.0.1',port:17403,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:17403'},agent:false,timeout:8000,maxHeaderSize:8192},remote=>{res.writeHead(remote.statusCode??502,remote.headers);remote.pipe(res);remote.once('error',()=>res.destroy())});s.upstreams.add(upstream);upstream.once('close',()=>s.upstreams.delete(upstream));upstream.once('timeout',()=>upstream.destroy());upstream.once('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.once('aborted',()=>upstream.destroy());res.once('close',()=>{if(!res.writableEnded)upstream.destroy()});req.pipe(upstream)
 });s.server=server;server.setTimeout(8000,socket=>socket.destroy());server.on('connection',socket=>{s.sockets.add(socket);socket.once('close',()=>s.sockets.delete(socket))});server.on('error',()=>{s.failed=true});states.set(handle,s)
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17443,'127.0.0.1',()=>resolve(undefined))});return handle}catch(error){await closeFull069OwnedNative(handle);throw error}
}
/** @returns {Promise<{status:number,headers:import('node:http').IncomingHttpHeaders,value:Record<string,any>}>} */
function request(s,method,path,body,cookie,deadline){
 if(routes.get(path)!==method||performance.now()>=deadline)liveFail('native_deadline')
 return new Promise((resolve,reject)=>{const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body)),headers={Origin:origin,'X-AgentStudio-Request':'1',...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length)}:{}),...(cookie?{Cookie:cookie}:{})},timer=setTimeout(()=>req.destroy(),Math.max(1,deadline-performance.now())),req=https.request(origin+path,{method,headers,ca:s.material.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,timeout:Math.max(1,deadline-performance.now()),maxHeaderSize:8192},res=>{let size=0;const chunks=[];res.on('data',b=>{size+=b.length;if(size>131072)res.destroy();else chunks.push(b)});res.once('error',reject);res.once('end',()=>{try{const status=res.statusCode;if(performance.now()>=deadline||status===undefined||status>=300&&status<400)liveFail('native_response');const decoded=parseWorkerHeartbeatControlJson(Buffer.concat(chunks),131072);if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))liveFail('native_response');const value=closed(decoded,Object.keys(decoded));resolve({status,headers:res.headers,value})}catch{reject(Error('full069_worker_live_native_response'))}})});req.once('timeout',()=>req.destroy());req.once('error',()=>reject(Error('full069_worker_live_native_io')));req.once('close',()=>clearTimeout(timer));req.end(bytes)})
}
export async function observeFull069OwnedNative(handle,{ready=true,initial=false}={}){
 const s=state(handle),ctx=liveContext(s.trust);if(s.failed)liveFail('native_proxy_failed');const deadline=performance.now()+liveLimits.nativeMs,p=closed(parseWorkerHeartbeatControlJson(readLivePrivate(ctx.profile.credentials.employee_profile,{max:2048}).bytes,2048),['email','display_name']),password=readLivePrivate(ctx.profile.credentials.employee_password,{max:4096}).bytes.toString('utf8');if(typeof p.email!=='string'||!p.email.includes('@')||typeof p.display_name!=='string'||password.trim()!==password||password.length<12)liveFail('employee_input')
 let cookie=null,snapshot,readerAudit,readerPhase='native_authorization',loggedOut=false
 try{
  if(initial){const anonymous=await request(s,'GET',route,undefined,null,deadline);if(anonymous.status!==401)liveFail('native_anonymous_guard')}
  const login=await request(s,'POST','/api/native-auth/login',{email:p.email,password},null,deadline);if(login.status!==200||login.value.authenticated!==true||login.value.role!=='admin')liveFail('native_admin_login');const cookies=login.headers['set-cookie'];if(!Array.isArray(cookies)||cookies.length!==1)liveFail('native_cookie');const line=cookies[0];if(!/^__Host-agentstudio_session=[A-Za-z0-9_-]+;/.test(line)||!/; Secure(?:;|$)/i.test(line)||!/; HttpOnly(?:;|$)/i.test(line)||!/; SameSite=Strict(?:;|$)/i.test(line)||!/; Path=\/(?:;|$)/i.test(line)||/; Domain=/i.test(line))liveFail('native_cookie');cookie=line.split(';')[0]
  const me=await request(s,'GET','/api/native-auth/me',undefined,cookie,deadline);if(me.status!==200||me.value.authenticated!==true||me.value.user?.is_admin!==true)liveFail('native_current_admin')
  // Only this real HTTPS request may reach Controller admission, acquire the
  // original 5s Reader lease and run the RR/read-only catalog audit.
  readerPhase='controller_reader_audit';const readerBefore=readFull069RootJournal()
  const heartbeats=await request(s,'GET',route,undefined,cookie,deadline);if(heartbeats.status!==200||heartbeats.headers['cache-control']!=='no-store')liveFail('native_heartbeat_unavailable');snapshot=parseWorkerHeartbeatSnapshot(heartbeats.value);const age=Date.now()-Date.parse(snapshot.as_of);if(age<0||age>8000||ready&&snapshot.workers.some(w=>w.state!=='ready'||w.reason!=='fresh_ready_report'||Date.parse(snapshot.as_of)-Date.parse(w.last_seen_at)>45000))liveFail('native_not_ready')
  readerAudit=reviewFull069NativeReaderCatalogAudit(readerBefore,readFull069RootJournal(),{instance_id:ctx.profile.telemetry_instance_id,epoch:ctx.profile.telemetry_epoch,role_oid:ctx.rootProfile.binding.roles[1].oid,database_oid:ctx.rootProfile.binding.database_oid},snapshot.as_of);readerPhase='verified_before_native_logout'
  const logout=await request(s,'POST','/api/native-auth/logout',{},cookie,deadline);if(logout.status!==200||logout.value.ok!==true)liveFail('native_logout');loggedOut=true
  if(initial){const revoked=await request(s,'GET','/api/native-auth/me',undefined,cookie,deadline);if(revoked.status!==401)liveFail('native_revocation')}
  if(performance.now()>=deadline)liveFail('native_deadline');state(handle);const observation=freeze({original_native_https:true,actual_current_admin:true,secure_host_cookie:true,logout_revoked:true,as_of:snapshot.as_of,workers:snapshot.workers,reader_catalog_audit:readerAudit,elapsed_ms:Math.ceil(liveLimits.nativeMs-(deadline-performance.now()))});observations.add(observation);return observation
 }catch(error){
  // Closed phase data survives a refused read without disclosing credentials,
  // errors or snapshots, and never changes the original failure outcome.
  try{const data=parseFull069NativeReaderPhase({event:'full069_worker_live_reader_catalog_phase',phase:readerPhase,completed_native_observation:false,qualifies_run:false,production_cutover_allowed:false});if(isNativeError(error)&&!isProxy(error)&&!readerFailureObservations.has(error))readerFailureObservations.set(error,data);process.stderr.write(JSON.stringify(data)+'\n')}catch{}
  throw error
 }finally{
  // Never replay a read/login after a failure. A best-effort logout gets the
  // same remaining budget; its failure leaves this run disqualified.
  if(cookie&&!loggedOut&&performance.now()<deadline)try{await request(s,'POST','/api/native-auth/logout',{},cookie,deadline)}catch{}
 }
}
// One-use in-process provenance only, minted after real TLS/Cookie/logout and
// source checks above. JSON phase data alone cannot satisfy either sampler.
export function consumeFull069OwnedNativeReaderAudit(observation){if(!observations.delete(observation))liveFail('reader_catalog_native_observation_required')}
export async function closeFull069OwnedNative(handle){const s=states.get(handle);if(!s||s.closed)return {graceful:true};s.closed=true;let done=false;s.server.close(()=>{done=true});s.server.closeIdleConnections();const end=performance.now()+8000;while(!done&&performance.now()<end)await delay(50);const graceful=done&&s.upstreams.size===0;if(!done){for(const r of s.upstreams)r.destroy();for(const socket of s.sockets)socket.destroy();s.server.closeAllConnections()}return freeze({graceful,proxy_closed:done,owned_proxy_only:true})}
