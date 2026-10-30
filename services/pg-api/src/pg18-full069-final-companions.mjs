// Five original companions, authenticated exclusively by B's final trust.
// Private handles own every process. No caller DTO/Pool/PID/clock or auditor.
import fs from 'node:fs'
import path from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto'
import {request} from 'node:https'
import {checkServerIdentity} from 'node:tls'
import {performance} from 'node:perf_hooks'
import {setTimeout as delay} from 'node:timers/promises'
import {finalContext,assertFinalStable,writeFinalRecord} from './pg18-full069-final-trust.mjs'
import {readLivePrivate} from './pg18-full069-worker-live-trust.mjs'
import {finalCompanionChildFile} from './pg18-full069-final-companion-child.mjs'
import {finalCompanionStartOrder,finalCompanionStopOrder,finalCompanionBudgets as budgets,finalCompanionFreeze as freeze,finalCompanionOwnData as closed,finalCompanionFail as fail,checkFinalCompanionSpecs,checkFinalCompanionOriginalPreflight,inspectFinalCompanionNetworkPolicy,finalCompanionTlsRoutes,checkFinalCompanionCertificatePins,finalCompanionFingerprint} from './pg18-full069-final-companion-contract.mjs'
import {readFinalCompanionKernelProcess as kernel,sameFinalCompanionKernel as same,matchFinalCompanionKernel as matches,assertFinalCompanionExclusiveUids as exclusive,finalCompanionOwnsListener as listener} from './pg18-full069-final-companion-kernel.mjs'
const handles=new WeakMap(),sha=b=>createHash('sha256').update(b).digest('hex')
function owned(handle){const s=handles.get(handle);if(!s)fail('untrusted_handle');return s}
function network(ctx){for(const[exe,family]of [['/usr/sbin/iptables-save',4],['/usr/sbin/ip6tables-save',6]]){const text=execFileSync(exe,[],{encoding:'utf8',env:{PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8'},timeout:5000,maxBuffer:1048576,windowsHide:true});inspectFinalCompanionNetworkPolicy(text,ctx.companions,family)}}
function stable(s){const ctx=finalContext(s.trust);assertFinalStable(s.trust);checkFinalCompanionSpecs(ctx.companions,ctx.base);if(ctx.profileSha256!==s.profileSha||ctx.source.source_sha256!==s.sourceSha||ctx.base.profile.run_id!==s.runId)fail('context_changed');assertTlsBindings(ctx);network(ctx);return ctx}
function allowed(s){return new Map([...s.actors.values()].filter(c=>c.pid&&c.start_ticks&&!c.exit).map(c=>[c.pid,c.start_ticks]))}
function identity(s,c){const outer=kernel(c.outer.pid);if(c.failed||c.exit||c.outerExited||outer.start_ticks!==c.outerStart||outer.mount_namespace!==c.outerNamespace||!['R','S'].includes(outer.state)||JSON.stringify(outer.argv)!==JSON.stringify(c.outerArgv)||!matches(kernel(c.pid),c))fail('owned_process_changed');exclusive(s.specs,allowed(s));return true}
function snapshot(c){return freeze({id:c.spec.id,pid:c.pid,start_ticks:c.start_ticks,supervisor_pid:c.outer.pid,supervisor_start_ticks:c.outerStart,uid:c.spec.uid,gid:c.spec.gid,groups:[...c.spec.groups],entry:c.spec.entry,args:[...c.args],actual_namespace:true,actual_original_entry:true,capabilities_zero:true,no_new_privs:true})}
export function openFull069FinalCompanions(finalTrust){
 const ctx=finalContext(finalTrust);assertFinalStable(finalTrust);checkFinalCompanionSpecs(ctx.companions,ctx.base);if(ctx.write!==true||!ctx.store)fail('store_not_open');assertTlsBindings(ctx);network(ctx);exclusive(ctx.companions,new Map())
 const handle=Object.freeze(Object.create(null));handles.set(handle,{trust:finalTrust,specs:ctx.companions,profileSha:ctx.profileSha256,sourceSha:ctx.source.source_sha256,runId:ctx.base.profile.run_id,phase:'new',actors:new Map(),launches:new Map(),preflights:new Map(),closed:false});return handle
}
function launchBinding(s,spec){
 if(s.launches.has(spec.id))return s.launches.get(spec.id)
 const ctx=stable(s),parent=kernel(process.pid),nonce=randomUUID(),record={format:'pg18_full069_final_companion_launch_v1',run_id:s.runId,profile_sha256:s.profileSha,source_sha256:s.sourceSha,id:spec.id,spec_sha256:sha(JSON.stringify(spec)),parent_pid:process.pid,parent_start_ticks:parent.start_ticks,parent_mount_namespace:parent.mount_namespace,nonce,allowed_modes:['preflight','serve']},recordSha=writeFinalRecord(s.trust,'companion-'+spec.id+'.json',record),binding={nonce,recordSha,parentNamespace:parent.mount_namespace};s.launches.set(spec.id,binding);return binding
}
async function launch(s,spec,mode){
 const ctx=stable(s);exclusive(s.specs,allowed(s));const binding=launchBinding(s,spec),filename=ctx.root+'/services/pg-api/src/'+spec.entry,args=mode==='preflight'?spec.preflight_args:spec.args
 const env={PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8',HOME:'/nonexistent',AGENT_STUDIO_FULL069_WORKER_FINAL_ENABLED:'true',AGENT_STUDIO_FULL069_WORKER_FINAL_APPROVED:'RUN_DISPOSABLE_FULL069_FINAL14_QUALIFICATION_ONLY',AGENT_STUDIO_FULL069_WORKER_LIVE_ENABLED:'true',AGENT_STUDIO_FULL069_WORKER_LIVE_APPROVED:'RUN_DISPOSABLE_FULL069_WORKER_QUALIFICATION_ONLY'}
 const outer=spawn('/usr/bin/unshare',['--mount','--propagation','private',process.execPath,'--experimental-strip-types',ctx.root+'/services/pg-api/src/'+finalCompanionChildFile,'--launch',spec.id,mode,binding.nonce,binding.recordSha],{cwd:ctx.root,env,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true})
 const c={spec,mode,entry:filename,args:[...args],outer,outerArgv:[process.execPath,'--experimental-strip-types',ctx.root+'/services/pg-api/src/'+finalCompanionChildFile,'--launch',spec.id,mode,binding.nonce,binding.recordSha],pid:null,start_ticks:null,outerStart:null,parentNamespace:binding.parentNamespace,nonce:binding.nonce,failed:false,exit:null,outerExited:false,stdout:'',workerReady:false,stopping:false};s.actors.set(spec.id,c)
 c.done=new Promise(resolve=>outer.once('close',(code,signal)=>{c.exit={code,signal};resolve(c.exit)}));outer.once('error',()=>{c.failed=true});outer.once('exit',()=>{c.outerExited=true});outer.once('spawn',()=>{try{c.outerStart=kernel(outer.pid).start_ticks}catch{c.failed=true}})
 outer.on('message',message=>{try{
  const event=message&&typeof message==='object'?Object.getOwnPropertyDescriptor(message,'event')?.value:null;if(message?.id!==spec.id||message?.mode!==mode||message?.nonce!==binding.nonce)fail('process_channel')
  if(event==='companion_started'){closed(message,['event','id','mode','nonce','pid']);if(c.pid!==null||!Number.isSafeInteger(message.pid)||message.pid<1)fail('process_channel');c.pid=message.pid}
  else if(event==='companion_worker_output'){closed(message,['event','id','mode','nonce','text']);if(mode!=='serve'||spec.id!=='plan_workflow_worker'||typeof message.text!=='string'||Buffer.byteLength(message.text)>budgets.max_output_bytes)fail('process_channel');c.stdout=message.text;let v;try{v=JSON.parse(c.stdout)}catch{return}if(v.mode==='serve'&&v.service==='worker'&&v.ready===true&&v.worker_started===true&&v.execution_enabled===true&&v.production_cutover_allowed===false)c.workerReady=true;else fail('worker_boot_report')}
  else if(event==='companion_closed'){closed(message,['event','id','mode','nonce','code','signal','stdout','failed']);if(typeof message.stdout!=='string'||Buffer.byteLength(message.stdout)>budgets.max_output_bytes||typeof message.failed!=='boolean')fail('process_channel');c.stdout=message.stdout;c.appExit={code:message.code,signal:message.signal};if(message.failed)c.failed=true}
  else if(event==='companion_failed'){closed(message,['event','id','mode','nonce']);c.failed=true}else fail('process_channel')
 }catch{c.failed=true}})
 const end=performance.now()+budgets.start_ms
 while(performance.now()<end&&!c.failed&&!c.exit){if(c.pid!==null)try{const p=kernel(c.pid),outerActual=kernel(c.outer.pid);c.start_ticks??=p.start_ticks;c.outerNamespace=outerActual.mount_namespace;if(outerActual.parent_pid===process.pid&&matches(p,c)&&c.outerStart&&same(c.outer.pid,c.outerStart))return c}catch{}await delay(25)}
 fail('process_launch')
}
async function waitExit(c,ms){const end=performance.now()+ms;while(!c.exit&&performance.now()<end)await delay(25);return c.exit!==null}
export async function preflightFull069FinalCompanions(handle){
 const s=owned(handle);if(s.phase!=='new'||s.closed)fail('preflight_phase');s.phase='preflighting';const observations=[]
 try{for(const spec of s.specs){const ctx=stable(s),ref=ctx.bindings.companions.find(x=>x.id===spec.id).preflight,pinned=readLivePrivate(ref.file,{mode:[0o400,0o600],max:budgets.max_output_bytes});if(pinned.sha256!==ref.sha256)fail('preflight_pin');const c=await launch(s,spec,'preflight');if(!await waitExit(c,budgets.preflight_ms)||c.failed||c.exit.code!==0||c.exit.signal!==null||c.appExit?.code!==0||c.appExit?.signal!==null)fail('original_preflight_exit');const raw=Buffer.from(c.stdout);if(!raw.equals(pinned.bytes)||sha(raw)!==ref.sha256)fail('preflight_pin');checkFinalCompanionOriginalPreflight(spec.id,JSON.parse(c.stdout));exclusive(s.specs,allowed(s));const row=freeze({id:spec.id,actual_original_cli:true,actual_nonroot_namespace:true,raw_stdout_sha256:sha(raw),protected_preflight_sha256:ref.sha256,exit_code:0,provenance_only:true,current_readiness:false,production_cutover_allowed:false});s.preflights.set(spec.id,row);observations.push(row)}s.phase='preflighted';return freeze(observations)}catch(error){s.phase='failed';throw error}
}
function pinnedMount(profile,leaf){const m=profile.mounts.find(x=>x.leaf===leaf);if(!m)fail('TLS_mount');const r=readLivePrivate(m.source,{owner:profile.uid,mode:[0o400],max:2097152});if(r.sha256!==m.sha256)fail('TLS_mount_changed');return r.bytes}
const fingerprint=finalCompanionFingerprint
function routeClient(ctx,route){return route.client_source==='companion'?ctx.companions.find(s=>s.id===route.client_id):ctx.base.profile.workers.find(s=>s.id===route.client_id)}
function assertTlsBindings(ctx){
 const routes=finalCompanionTlsRoutes(ctx.companions,ctx.base)
 for(const route of routes){const broker=ctx.companions.find(s=>s.id===route.broker_id),client=routeClient(ctx,route);checkFinalCompanionCertificatePins(route,pinnedMount(broker,route.server_leaf),pinnedMount(client,route.client_leaves[1]))}
 return routes
}
async function probeRoute(s,c,ctx,route){
 const client=routeClient(ctx,route),server=pinnedMount(c.spec,route.server_leaf),ca=pinnedMount(client,route.client_leaves[0]),cert=pinnedMount(client,route.client_leaves[1])
 checkFinalCompanionCertificatePins(route,server,cert)
 const serverPin=fingerprint(route.server_pin),key=pinnedMount(client,route.client_leaves[2])
 try{identity(s,c);if(!listener(c.pid,Number(new URL(route.origin).port)))fail('listener_missing')
  return await new Promise((resolve,reject)=>{let finished=false,authorized=false,bytes=0,timer,req;const done=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);if(error){req?.destroy();reject(Error('full069_final_companion_current_TLS_readiness'))}else resolve(value)}
   req=request({hostname:'127.0.0.1',port:Number(new URL(route.origin).port),servername:'',path:route.safe_path,method:'GET',ca,cert,key,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,headers:{Connection:'close'},checkServerIdentity:(_name,peer)=>{const error=checkServerIdentity('127.0.0.1',peer);if(error)return error;try{if(timingSafeEqual(serverPin,fingerprint(peer.fingerprint256)))return undefined}catch{}return Error('full069_final_companion_TLS_server_pin')}},res=>{res.on('data',b=>{bytes+=b.length;if(bytes>4096){res.destroy();done(true)}});res.once('error',()=>done(true));res.once('aborted',()=>done(true));res.once('end',()=>done(!authorized||res.statusCode!==404,{client_id:route.client_id,TLS_verified:true,client_pin_verified:true,server_pin_verified:true,safe_route_status:res.statusCode,provider_request_sent:false}))})
   req.once('socket',socket=>socket.once('secureConnect',()=>{authorized=socket.authorized===true}));req.once('error',()=>done(true));timer=setTimeout(()=>done(true),budgets.TLS_ms);req.end()
  })
 }finally{key.fill(0)}
}
async function probe(s,c,ctx=stable(s)){
 const routes=finalCompanionTlsRoutes(ctx.companions,ctx.base).filter(r=>r.broker_id===c.spec.id);if(routes.length<1)fail('transport_profile')
 const clients=await Promise.all(routes.map(route=>probeRoute(s,c,ctx,route)))
 return freeze({id:c.spec.id,TLS_verified:true,client_pin_verified:true,server_pin_verified:true,safe_route_status:404,provider_request_sent:false,clients})
}
export async function startFull069FinalCompanions(handle){
 const s=owned(handle);if(s.phase!=='preflighted'||s.preflights.size!==5||s.closed)fail('start_phase');s.phase='starting'
 try{for(const id of finalCompanionStartOrder){const spec=s.specs.find(x=>x.id===id),c=await launch(s,spec,'serve'),end=performance.now()+budgets.start_ms;let ready=false;while(performance.now()<end&&!c.failed&&!c.exit){identity(s,c);if(id==='plan_workflow_worker'){if(c.workerReady){ready=true;break}}else try{await probe(s,c);ready=true;break}catch{}await delay(50)}if(!ready)fail('current_startup_readiness')}s.phase='running';return await observeFull069FinalCompanions(handle,{ready:true})}catch(error){s.phase='failed';throw error}
}
export async function observeFull069FinalCompanions(handle,options={ready:true}){
 closed(options,['ready']);if(typeof options.ready!=='boolean')fail('readiness_required');const s=owned(handle);if(s.phase!=='running'||s.closed||s.actors.size!==5)fail('observe_phase');const ctx=stable(s)
 const rows=await Promise.all(s.specs.map(async spec=>{const c=s.actors.get(spec.id);if(c.mode!=='serve')fail('serve_missing');identity(s,c);let readiness={kernel_identity_only:true};if(options.ready){if(spec.id==='plan_workflow_worker'){if(!c.workerReady)fail('worker_not_ready');readiness={original_serve_worker_report:true,current_process_verified:true}}else readiness=await probe(s,c,ctx)}identity(s,c);return freeze({...snapshot(c),current_readiness:options.ready,readiness})}));stable(s);return freeze(rows)
}
async function stopActor(s,c){
 c.stopping=true;let forced=false,unknown=false
 if(c.exit)return {id:c.spec.id,graceful:false,forced:false,identity_verified:false,absent:c.pid&&c.start_ticks?!same(c.pid,c.start_ticks):false,supervisor_absent:c.outerStart?!same(c.outer.pid,c.outerStart):false}
 try{identity(s,c)}catch{unknown=true}
 if(!c.outerStart||!same(c.outer.pid,c.outerStart))unknown=true;else c.outer.kill('SIGTERM')
 if(!await waitExit(c,budgets.drain_ms)){forced=true;if(c.pid&&c.start_ticks&&same(c.pid,c.start_ticks))try{process.kill(c.pid,'SIGKILL')}catch{unknown=true}if(!await waitExit(c,budgets.force_ms)){if(c.outerStart&&same(c.outer.pid,c.outerStart))c.outer.kill('SIGKILL');else unknown=true;await waitExit(c,1000)}}
 return {id:c.spec.id,graceful:!forced&&!unknown&&!c.failed&&c.exit?.code===0&&c.exit?.signal===null&&c.appExit?.code===0&&c.appExit?.signal===null,forced,identity_verified:!unknown,absent:c.pid&&c.start_ticks?!same(c.pid,c.start_ticks):c.appExit!==undefined,supervisor_absent:c.outerStart?!same(c.outer.pid,c.outerStart):c.exit!==null}
}
export async function stopFull069FinalCompanions(handle){
 const s=owned(handle);if(s.closed)fail('stop_phase');let stableAtStop=true;try{stable(s)}catch{stableAtStop=false}const results=[];s.phase='stopping'
 for(const id of finalCompanionStopOrder){const c=s.actors.get(id);if(c)try{const row=await stopActor(s,c);results.push({...row,graceful:row.graceful&&stableAtStop,profile_stable:stableAtStop})}catch{results.push({id,graceful:false,forced:false,identity_verified:false,absent:false,supervisor_absent:false,profile_stable:stableAtStop})}}
 s.closed=true;s.phase='closed';exclusive(s.specs,new Map());return freeze(results)
}
