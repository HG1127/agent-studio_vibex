// Genuine source/archive/extraction/offline plans only. No target SQL, business
// process, browser, credentials or installed runtime capability is exercised.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import cp from 'node:child_process'
import {createHash} from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'
import http2 from 'node:http2'
import dgram from 'node:dgram'
import dns from 'node:dns'
import dnsPromises from 'node:dns/promises'
import workerThreads from 'node:worker_threads'
import {registerHooks,syncBuiltinESMExports} from 'node:module'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex'),env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
// Private native call: only the fixed harness and the validated tar broker below
// retain it. No tested module receives an original process API or permit.
const originalSpawnSync=cp.spawnSync
let archivePolicy=null
function directoryIdentity(file){const s=fs.lstatSync(file,{bigint:true});assert.equal(s.isDirectory(),true);assert.equal(s.isSymbolicLink(),false);assert.equal(fs.realpathSync(file),file);return {file,dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode}}
function assertDirectory(record){const s=directoryIdentity(record.file);for(const key of ['dev','ino','uid','gid','mode']){if(s[key]!==record[key])process.stderr.write(JSON.stringify({event:'offline_final_review_directory_changed',phase:archivePolicy?.phase??null,field:key,before:String(record[key]),after:String(s[key]),observed_data_only:true})+'\n');assert.equal(s[key],record[key])}return record.file}
function archiveChild(file,prefix){assertDirectory(archivePolicy.output);assert.equal(path.dirname(file),archivePolicy.output.file);assert.match(path.basename(file),new RegExp('^'+prefix+'[A-Za-z0-9]{6}$'));return directoryIdentity(file)}
function regularFile(file){const s=fs.lstatSync(file);assert.equal(s.isFile(),true);assert.equal(s.isSymbolicLink(),false);assert.equal(s.nlink,1);assert.equal(fs.realpathSync(file),file)}
function sourceTree(directory){for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),s=fs.lstatSync(file);assert.equal(s.isSymbolicLink(),false);assert.equal(fs.realpathSync(file),file);if(s.isDirectory())sourceTree(file);else regularFile(file)}}
function beginArchivePolicy(output,owned,parent,cfg){
 assert.equal(archivePolicy,null);assert.equal(path.dirname(output),parent);assert.match(path.basename(output),/^full069-final-review-test-[A-Za-z0-9]{6}$/)
 const identity=directoryIdentity(output);assert.equal(identity.dev,owned.dev);assert.equal(identity.ino,owned.ino)
 for(const key of ['expectedSource','expectedFinalSource'])assert.match(cfg[key],/^[a-f0-9]{64}$/)
 archivePolicy={output:identity,phase:'enrolled',archive:path.join(output,'agentstudio_full069_final_source_review_'+cfg.expectedSource.slice(0,16)+'_'+cfg.expectedFinalSource.slice(0,16)+'.tar.gz')}
}
function allowArchiveTar(command,args,options){
 assert.ok(archivePolicy);assertDirectory(archivePolicy.output);assert.equal(command,'tar');assert.ok(Array.isArray(args));assert.ok(args.every(a=>typeof a==='string'&&!a.includes('\0')))
 const harness=archivePolicy.phase==='harness_enrolled',keys=harness?['encoding','env','maxBuffer','timeout']:['env','maxBuffer','timeout','windowsHide']
 assert.deepEqual(Object.keys(options).sort(),keys);assert.deepEqual(options.env,env);assert.equal(options.timeout,harness?30000:60000);assert.equal(options.maxBuffer,harness?2097152:8388608)
 if(harness)assert.equal(options.encoding,'utf8');else assert.equal(options.windowsHide,true)
 let phase,directories
 if(archivePolicy.phase==='enrolled'){
  assert.equal(args.length,5);assert.equal(args[0],'-czf');assert.equal(args[2],'-C');assert.equal(args[4],'.')
  const source=archiveChild(args[3],'full069-final-review-source-'),checked=archiveChild(path.dirname(args[1]),'full069-final-review-check-')
  assert.notEqual(source.file,checked.file);assert.equal(args[1],path.join(checked.file,'payload.tar.gz'));assert.equal(fs.existsSync(args[1]),false);sourceTree(source.file)
  Object.assign(archivePolicy,{source,checked,partial:args[1]});phase='packed';directories=[source,checked]
 }else if(archivePolicy.phase==='packed'){
  assertDirectory(archivePolicy.checked);regularFile(archivePolicy.partial);assert.deepEqual(args,['-tzf',archivePolicy.partial]);phase='listed';directories=[archivePolicy.checked]
 }else if(archivePolicy.phase==='listed'){
  assertDirectory(archivePolicy.checked);regularFile(archivePolicy.partial);const unpacked=path.join(archivePolicy.checked.file,'unpacked'),identity=directoryIdentity(unpacked)
  assert.deepEqual(args,['-xzf',archivePolicy.partial,'-C',unpacked]);assert.deepEqual(fs.readdirSync(unpacked),[]);phase='extracted';directories=[archivePolicy.checked,identity]
 }else if(harness){
  assertDirectory(archivePolicy.unpacked);regularFile(archivePolicy.archive);assert.equal(sha(fs.readFileSync(archivePolicy.archive)),archivePolicy.archiveSha)
  assert.deepEqual(args,['-xzf',archivePolicy.archive,'-C',archivePolicy.unpacked.file]);assert.deepEqual(fs.readdirSync(archivePolicy.unpacked.file),[]);phase='harness_extracted';directories=[archivePolicy.unpacked]
 }else throw Error('offline_final_review_tar_phase_refused')
 const result=originalSpawnSync('tar',args,options);assertDirectory(archivePolicy.output);for(const directory of directories)assertDirectory(directory);archivePolicy.phase=phase;return result
}
function enrollHarnessExtraction(unpacked,result){assert.ok(archivePolicy);assert.equal(archivePolicy.phase,'extracted');assertDirectory(archivePolicy.output);assert.equal(result.archive,archivePolicy.archive);regularFile(result.archive);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.equal(sha(fs.readFileSync(result.archive)),result.sha256);assert.equal(unpacked,path.join(archivePolicy.output.file,'unpacked'));archivePolicy.unpacked=directoryIdentity(unpacked);archivePolicy.archiveSha=result.sha256;archivePolicy.phase='harness_enrolled'}
function observedArchiveTar(command,args,options){try{return allowArchiveTar(command,args,options)}catch(error){process.stderr.write(JSON.stringify({event:'offline_final_review_tar_refused',phase:archivePolicy?.phase??null,observed_data_only:true})+'\n');throw error}}
// This exact implementation is preloaded in each fixed offline child as well.
// It only rejects effects and delegates parent tar after private path checks.
function installOfflineGuard(allowedSpawn){
 let attempted=false
 const deny=()=>{attempted=true;throw Error('offline_final_review_effect_refused')}
 net.Socket.prototype.connect=deny;net.Server.prototype.listen=deny
 for(const key of ['connect','createConnection','createServer'])net[key]=deny
 tls.connect=deny;tls.createServer=deny;tls.TLSSocket.prototype.connect=deny
 for(const object of [http,https])for(const key of ['request','get','createServer'])object[key]=deny
 for(const key of ['connect','createServer','createSecureServer'])http2[key]=deny
 for(const key of ['bind','connect','send','addMembership','addSourceSpecificMembership'])dgram.Socket.prototype[key]=deny
 dgram.createSocket=deny;dgram.Socket=deny
 for(const object of [dns,dnsPromises]){
  for(const key of Object.keys(object))if(/^(?:lookup|resolve|reverse)/.test(key)&&typeof object[key]==='function')object[key]=deny
  for(const key of Object.getOwnPropertyNames(object.Resolver.prototype))if(/^(?:resolve|reverse)/.test(key)&&typeof object.Resolver.prototype[key]==='function')object.Resolver.prototype[key]=deny
 }
 workerThreads.Worker=deny
 for(const key of ['spawn','fork','exec','execSync','execFile','execFileSync'])cp[key]=deny
 cp.ChildProcess.prototype.spawn=deny
  cp.spawnSync=(command,args,options)=>{if(typeof allowedSpawn!=='function')return deny();try{return allowedSpawn(command,args,options)}catch{return deny()}}
 globalThis.fetch=deny;globalThis.WebSocket=deny
 registerHooks({resolve(specifier,context,next){
  if(specifier==='pg'||specifier.startsWith('pg/')||['jszip','mammoth'].includes(specifier)||specifier.startsWith('pdfjs-dist/')||specifier.endsWith('.node'))deny()
  const resolved=next(specifier,context),url=resolved.url??''
  if(/\.node(?:[?#]|$)/.test(url)||url.includes('/node_modules/')&&!/\/node_modules\/typescript\/(?:lib\/typescript\.js|package\.json)$/.test(url))deny()
  return resolved
 }})
 syncBuiltinESMExports();process.on('exit',()=>{if(attempted)process.exitCode=95})
}
installOfflineGuard(observedArchiveTar)
// All application imports, source captures and collectors run after the guard.
const {captureFull069FinalSources,finalModules}=await import('../services/pg-api/src/pg18-full069-final-sources.mjs')
const {parseFull069FinalReviewArguments,collectFull069FinalReviewSources,buildFull069FinalReviewBundle}=await import('../ops/build-pg18-full069-final-review-bundle.mjs')
const nonAuthority=['application_cli_executed','dependency_installation_performed','source_is_runtime_capability','actual_final14_runtime_validated','actual_24h_window_started','production_cutover_allowed']
test('final review parser requires all independent source hashes and rejects target, activation, duplicate and relative output arguments',()=>{
 const output=path.join(os.tmpdir(),'full069-final-parser-never-created'),valid=['--profile','complete069','--expected-source-sha256','a'.repeat(64),'--expected-live-source-sha256','b'.repeat(64),'--expected-final-source-sha256','c'.repeat(64),'--output-dir',output]
 assert.deepEqual(parseFull069FinalReviewArguments(valid),{expectedSource:'a'.repeat(64),expectedLiveSource:'b'.repeat(64),expectedFinalSource:'c'.repeat(64),output:path.resolve(output)})
 for(const args of[[],valid.slice(0,-2),[...valid,'--run-final'],[...valid,'--output-dir',output],valid.map((v,i)=>i===1?'complete050':v),valid.map((v,i)=>i===7?'bad-sha':v),valid.map((v,i)=>i===9?'relative-output':v)])assert.throws(()=>parseFull069FinalReviewArguments(args),/arguments_refused/)
})
test('genuine final14 union preserves exact complete/live/Broker/F05 bytes and independent full inventory with parser-only dependencies',async()=>{
 const s=await captureFull069FinalSources(),r=await collectFull069FinalReviewSources(s.complete.source_sha256,s.live.source_sha256,s.source_sha256),get=n=>r.entries.get(n)
 assert.equal(r.reviewOnly,true);assert.equal(r.snapshot.source_sha256,s.source_sha256);assert.equal(s.complete.manifest.sql_sources.length,53)
 for(const f of[...s.manifest.sources,...s.complete.manifest.sql_sources])assert.equal(sha(get(f.path)),f.sha256,f.path)
 assert.equal(finalModules.length,13);for(const n of finalModules)assert.ok(get(n),n)
 for(const n of[...s.companions.manifest.assets,...s.planWorkflow.manifest.assets.map(n=>({path:n}))])assert.ok(get(n.path),n.path)
 const finalManifest=JSON.parse(get('FULL069_FINAL_SOURCE_MANIFEST.json')),review=JSON.parse(get('REVIEW_MANIFEST.json')),boundary=JSON.parse(get('FULL069_FINAL_DEPENDENCY_BOUNDARY.json')),base=JSON.parse(get('DEPENDENCY_BOUNDARY.json'))
 assert.equal(sha(Buffer.from(JSON.stringify(finalManifest))),s.source_sha256);assert.equal(review.format,'full069_final14_source_review_v1');assert.equal(review.sql_source_count,53)
 assert.deepEqual(review.files.map(f=>f.path).sort(),r.files.filter(n=>!['REVIEW_MANIFEST.json','SHA256SUMS'].includes(n)))
 for(const f of review.files){assert.equal(get(f.path).length,f.bytes);assert.equal(sha(get(f.path)),f.sha256)}
 for(const k of nonAuthority)assert.equal(boundary[k],false,k)
 assert.deepEqual([boundary.business_logins,boundary.application_processes,boundary.original_workers,boundary.heartbeat_kinds,boundary.companions,boundary.minimum_ms],[14,13,7,8,5,86400000])
 assert.deepEqual(r.files.filter(n=>n.includes('/node_modules/')),base.exact_parser_files.map(f=>f.path).sort());assert.equal(base.exact_parser_files.length,4)
 for(const f of base.exact_parser_files)assert.equal(sha(get(f.path)),f.sha256)
 const sums=get('SHA256SUMS').toString().trim().split('\n').map(l=>/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(l));assert.ok(sums.every(Boolean));assert.deepEqual(sums.map(m=>m[2]).sort(),r.files.filter(n=>n!=='SHA256SUMS'));for(const m of sums)assert.equal(sha(get(m[2])),m[1])
 const text=get('README_REVIEW_ONLY.txt').toString();assert.match(text,/final14 acknowledgements/);assert.match(text,/Minimum86400000ms/);assert.match(text,/before successors\/Telemetry/);assert.match(text,/Recapture every genuine source union/)
 await assert.rejects(collectFull069FinalReviewSources(s.complete.source_sha256,s.live.source_sha256,'0'.repeat(64)),/source_refused/)
})
test('real final archive exact extraction and actual source recapture/offline plans forbid every network, driver and process effect',async()=>{
 const parent=fs.realpathSync(os.tmpdir()),output=fs.mkdtempSync(path.join(parent,'full069-final-review-test-')),owned=fs.statSync(output,{bigint:true})
 try{
  const s=await captureFull069FinalSources(),cfg={expectedSource:s.complete.source_sha256,expectedLiveSource:s.live.source_sha256,expectedFinalSource:s.source_sha256,output};beginArchivePolicy(output,owned,parent,cfg);const result=await buildFull069FinalReviewBundle(cfg)
  assert.equal(sha(fs.readFileSync(result.archive)),result.sha256);for(const k of[...nonAuthority,'network_used','sql_executed','services_started'])assert.equal(result[k],false,k);assert.equal(result.archive_extracted_inventory_verified,true);assert.equal(result.archive_extracted_hashes_verified,true)
   const unpacked=path.join(output,'unpacked');fs.mkdirSync(unpacked,{mode:0o700});enrollHarnessExtraction(unpacked,result);const unpack=cp.spawnSync('tar',['-xzf',result.archive,'-C',unpacked],{env,encoding:'utf8',timeout:30000,maxBuffer:2097152});assert.equal(unpack.status,0,unpack.stderr)
  const actual=[];const walk=(dir,prefix='')=>{for(const n of fs.readdirSync(dir)){const rel=prefix+n,f=path.join(dir,n),st=fs.lstatSync(f);assert.equal(st.isSymbolicLink(),false);if(st.isDirectory())walk(f,rel+'/');else{assert.equal(st.isFile(),true);assert.equal(st.nlink,1);actual.push(rel)}}};walk(unpacked)
  const read=n=>fs.readFileSync(path.join(unpacked,n)),sums=read('SHA256SUMS').toString().trim().split('\n').map(l=>/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(l));assert.ok(sums.every(Boolean));assert.equal(actual.length,result.packed_files);assert.deepEqual(actual.sort(),[...sums.map(m=>m[2]),'SHA256SUMS'].sort());for(const m of sums)assert.equal(sha(read(m[2])),m[1],m[2])
  // No child permit reaches tested code. Only these three fixed offline
  // harness commands can use the private original Node spawn reference.
  const guardImports="import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import http2 from 'node:http2';import dgram from 'node:dgram';import dns from 'node:dns';import dnsPromises from 'node:dns/promises';import workerThreads from 'node:worker_threads';import cp from 'node:child_process';import{registerHooks,syncBuiltinESMExports}from'node:module';"
  const guard=guardImports+'('+installOfflineGuard.toString()+')();',preload='data:text/javascript,'+encodeURIComponent(guard),poison={...env,DATABASE_URL:'postgres://never-use-offline-final-review',CREDENTIALS_DIRECTORY:'/never/read/offline-final-review',AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:'/never/read/offline-final-review'}
  const offlineCases=Object.freeze({final_plan:Object.freeze(['services/pg-api/src/pg18-full069-final-cli.mjs','--plan']),F05_plan:Object.freeze(['services/pg-api/src/pg18-complete-plan-workflow-cli.mjs','--plan']),recapture:Object.freeze(['--input-type=module','--eval',"import{captureFull069FinalSources}from'./services/pg-api/src/pg18-full069-final-sources.mjs';const s=await captureFull069FinalSources();console.log(JSON.stringify({complete:s.complete.source_sha256,live:s.live.source_sha256,final:s.source_sha256}))"])})
  const run=kind=>{assert.ok(Object.hasOwn(offlineCases,kind));assert.equal(archivePolicy.phase,'harness_extracted');assertDirectory(archivePolicy.output);assert.equal(assertDirectory(archivePolicy.unpacked),unpacked);const args=offlineCases[kind],r=originalSpawnSync(process.execPath,['--experimental-strip-types','--import',preload,...args],{cwd:unpacked,env:poison,encoding:'utf8',timeout:60000,maxBuffer:3145728});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout)}
  const plan=run('final_plan');assert.deepEqual([plan.business_accounts.length,plan.application_processes,plan.companions.length,plan.workers.length,plan.workers.flatMap(w=>w.kinds).length,plan.limits.minimumMs],[14,13,5,7,8,86400000]);for(const k of['network_used','secrets_read','writes_performed','qualifying_window_started','runtime_authorization','qualifies_run','production_cutover_allowed'])assert.equal(plan[k],false,k)
  const pair=run('F05_plan');assert.equal(pair.network_used,false);assert.equal(pair.services_started,false);assert.equal(pair.preparation_is_runtime_authorization,false)
  const recaptured=run('recapture');assert.deepEqual(recaptured,{complete:cfg.expectedSource,live:cfg.expectedLiveSource,final:cfg.expectedFinalSource})
  const before=fs.statSync(result.archive,{bigint:true});await assert.rejects(buildFull069FinalReviewBundle(cfg),/archive_already_exists/);assert.equal(fs.statSync(result.archive,{bigint:true}).ino,before.ino);assert.equal(sha(fs.readFileSync(result.archive)),result.sha256)
  assert.deepEqual(fs.readdirSync(output).sort(),[path.basename(result.archive),'unpacked'].sort());const forbidden=path.join(root,'must-not-create-final-review-output');await assert.rejects(buildFull069FinalReviewBundle({...cfg,output:forbidden}),/output_outside_checkout_required/);assert.equal(fs.existsSync(forbidden),false)
 }finally{archivePolicy=null;const current=fs.lstatSync(output,{bigint:true});assert.equal(current.isSymbolicLink(),false);assert.equal(current.dev,owned.dev);assert.equal(current.ino,owned.ino);assert.equal(path.dirname(fs.realpathSync(output)),parent);assert.ok(path.basename(output).startsWith('full069-final-review-test-'));fs.rmSync(output,{recursive:true})}
})
