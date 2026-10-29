// Genuine source capture/archive/extraction and offline plans only. No SQL,
// target mode, business Worker, credentials or dependency installation.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {captureCompleteProfileSources} from '../services/pg-api/src/pg18-complete-profile-source.mjs'
import {captureFull069WorkerLiveSources} from '../services/pg-api/src/pg18-full069-worker-live-sources.mjs'
import {parseFull069WorkerLiveReviewArguments,mergeFull069WorkerLiveReviewSource,collectFull069WorkerLiveReviewSources,buildFull069WorkerLiveReviewBundle} from '../ops/build-pg18-full069-worker-live-review-bundle.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>createHash('sha256').update(b).digest('hex')
const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
const nonAuthority=['operator_pg_runtime_bundled','operator_runtime_manifest_bundled','business_dependency_runtime_bundled','dependency_installation_performed','source_is_runtime_capability','source_is_target_authorization','review_preparation_is_live_readiness','actual_24h_window_started','actual_24h_window_passed','owned_linux_validation_performed','production_cutover_allowed']
test('independent parser and pure merge refuse ambiguous flags, unsafe files and conflicting source bytes',()=>{
 const output=path.join(os.tmpdir(),'full069-live-parser-never-created'),valid=['--profile','complete069','--expected-source-sha256','a'.repeat(64),'--expected-live-source-sha256','b'.repeat(64),'--output-dir',output]
 assert.deepEqual(parseFull069WorkerLiveReviewArguments(valid),{expectedSource:'a'.repeat(64),expectedLiveSource:'b'.repeat(64),output:path.resolve(output)})
 for(const args of [[],valid.slice(0,-2),[...valid,'--run'],[...valid,'--with-local-executor-operator'],[...valid,'--output-dir',output],valid.map((v,i)=>i===1?'complete050':v),valid.map((v,i)=>i===5?'bad-sha':v),valid.map((v,i)=>i===7?'relative-output':v)])assert.throws(()=>parseFull069WorkerLiveReviewArguments(args),/arguments_refused/)
 const entries=new Map(),name='services/pg-api/src/native-server.ts',bytes=Buffer.from('same original source\n')
 mergeFull069WorkerLiveReviewSource(entries,name,bytes);bytes[0]=0
 assert.equal(entries.get(name).toString(),'same original source\n')
 mergeFull069WorkerLiveReviewSource(entries,name,Buffer.from('same original source\n'));assert.equal(entries.size,1)
 assert.throws(()=>mergeFull069WorkerLiveReviewSource(entries,name,Buffer.from('different source\n')),/source_conflict/)
 for(const unsafe of ['../source.mjs','/source.mjs','a/../source.mjs','.env.local','pb_data/data.db','secrets/secret.txt','runtime/node_modules/pg/index.js','services/pg-api/node_modules/typescript/bin/tsc'])assert.throws(()=>mergeFull069WorkerLiveReviewSource(entries,unsafe,Buffer.from('x')),/unsafe_name|unexpected_dependency_file/)
})
test('genuine complete and live captures merge exact bytes with independent indexes and explicit runtime boundaries',async()=>{
 const complete=await captureCompleteProfileSources(),live=await captureFull069WorkerLiveSources(),r=await collectFull069WorkerLiveReviewSources(complete.source_sha256,live.source_sha256),read=name=>r.entries.get(name)
 assert.equal(r.reviewOnly,true);assert.equal(r.live.complete.source_sha256,complete.source_sha256)
 for(const f of [...complete.manifest.sources,...complete.manifest.sql_sources,...live.manifest.sources])assert.equal(hash(read(f.path)),f.sha256,f.path)
 assert.equal(complete.manifest.sql_sources.length,53)
 for(const name of ['pg18-complete-service-cli.mjs','pg18-complete-review-worker-cli.mjs','pg18-complete-review-worker-core.mjs','pg18-complete-review-worker-journal.mjs','pg18-complete-review-worker-plan.mjs','pg18-full069-worker-live-cli.mjs','pg18-full069-worker-live-runner.mjs','native-server.ts','worker-loop.ts','model-worker-loop.ts','workflow-worker-loop.ts','workflow-v2-worker-loop.ts','autonomous-agent-worker-loop.ts','knowledge-index-service.ts','agent-assessment-service.ts'])assert.ok(read('services/pg-api/src/'+name),name)
 for(const name of ['docs/PG18_COMPLETE_069_REVIEW_WORKER_PREPARATION.md','docs/PG18_FULL069_WORKER_LIVE_OPERATIONS.json','ops/build-pg18-complete069-review-bundle.mjs','ops/build-pg18-full069-worker-live-review-bundle.mjs','tests/pg18-full069-worker-live-review-bundle.test.mjs'])assert.equal(hash(read(name)),hash(fs.readFileSync(path.join(root,name))),name)
 assert.equal(hash(Buffer.from(JSON.stringify(JSON.parse(read('COMPLETE_SOURCE_MANIFEST.json'))))),complete.source_sha256)
 assert.equal(hash(Buffer.from(JSON.stringify(JSON.parse(read('FULL069_WORKER_LIVE_SOURCE_MANIFEST.json'))))),live.source_sha256)
 const boundary=JSON.parse(read('DEPENDENCY_BOUNDARY.json')),liveBoundary=JSON.parse(read('FULL069_WORKER_LIVE_DEPENDENCY_BOUNDARY.json')),review=JSON.parse(read('REVIEW_MANIFEST.json'))
 assert.equal(review.format,'full069_worker_live_source_review_v1');assert.equal(review.complete_source_sha256,complete.source_sha256);assert.equal(review.live_source_sha256,live.source_sha256)
 assert.equal(review.complete_source_count,complete.manifest.sources.length);assert.equal(review.live_source_count,live.manifest.sources.length)
 for(const k of nonAuthority)assert.equal(liveBoundary[k],false,k)
 assert.equal(Object.keys(boundary.operator_pg_packages).length,14)
 assert.deepEqual(r.files.filter(n=>n.includes('/node_modules/')),boundary.exact_parser_files.map(f=>f.path).sort())
 for(const f of boundary.exact_parser_files)assert.equal(hash(read(f.path)),f.sha256)
 assert.equal(hash(read('services/pg-api/package.json')),boundary.package_json_sha256);assert.equal(hash(read('services/pg-api/pnpm-lock.yaml')),boundary.lock_sha256)
 for(const f of review.files){assert.equal(hash(read(f.path)),f.sha256,f.path);assert.equal(read(f.path).length,f.bytes)}
 assert.deepEqual(review.files.map(f=>f.path).sort(),r.files.filter(n=>!['REVIEW_MANIFEST.json','SHA256SUMS'].includes(n)))
 const sums=read('SHA256SUMS').toString().trim().split('\n').map(line=>{const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m);return m})
 assert.deepEqual(sums.map(m=>m[2]).sort(),r.files.filter(n=>n!=='SHA256SUMS'));for(const m of sums)assert.equal(hash(read(m[2])),m[1])
 const text=read('README_REVIEW_ONLY.txt').toString();assert.match(text,/SOURCE REVIEW ONLY/);assert.match(text,/index-broker -> separate fixed Review LOGIN preparation -> separate Telemetry\/Root Controller/);assert.match(text,/minimum24h qualifying window has NOT started/);assert.match(text,/Recapture and approve complete and independent live hashes/)
 await assert.rejects(collectFull069WorkerLiveReviewSources(complete.source_sha256,'0'.repeat(64)),/source_binding/)
})
test('real archive has exact extracted inventory, refuses overwrite and runs all four real plans with driver, process and network blocked',async()=>{
 const parent=fs.realpathSync(os.tmpdir()),output=fs.mkdtempSync(path.join(parent,'full069-live-review-test-')),owned=fs.statSync(output,{bigint:true})
 try{
  const complete=await captureCompleteProfileSources(),live=await captureFull069WorkerLiveSources(),cfg={expectedSource:complete.source_sha256,expectedLiveSource:live.source_sha256,output},result=await buildFull069WorkerLiveReviewBundle(cfg)
  assert.equal(hash(fs.readFileSync(result.archive)),result.sha256)
  for(const k of ['application_cli_executed','dependency_installation_performed','network_used','sql_executed','services_started','source_is_runtime_capability','actual_24h_window_started','owned_linux_validation_performed','production_cutover_allowed'])assert.equal(result[k],false,k)
  assert.equal(result.archive_extracted_inventory_verified,true);assert.equal(result.archive_extracted_hashes_verified,true)
  const extracted=path.join(output,'extracted');fs.mkdirSync(extracted)
  const unpack=spawnSync('tar',['-xzf',result.archive,'-C',extracted],{env,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.equal(unpack.status,0,unpack.stderr)
  const actual=[];const walk=(dir,prefix='')=>{for(const name of fs.readdirSync(dir)){const relative=prefix+name,file=path.join(dir,name),st=fs.lstatSync(file);assert.equal(st.isSymbolicLink(),false);if(st.isDirectory())walk(file,relative+'/');else{assert.equal(st.isFile(),true);assert.equal(st.nlink,1);actual.push(relative)}}};walk(extracted)
  const read=name=>fs.readFileSync(path.join(extracted,name)),sums=read('SHA256SUMS').toString().trim().split('\n').map(line=>{const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m);return m})
  assert.equal(actual.length,result.packed_files);assert.deepEqual(actual.sort(),[...sums.map(m=>m[2]),'SHA256SUMS'].sort());for(const m of sums)assert.equal(hash(read(m[2])),m[1],m[2])
  // No fake plan implementations: these hooks only refuse attempted effects.
  // Any attempted effect also fails process exit, even if an entry catches it.
  const guard=`import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dgram from 'node:dgram';import cp from 'node:child_process';import{registerHooks,syncBuiltinESMExports}from'node:module';let attempted=false;const deny=()=>{attempted=true;throw Error('offline_source_review_effect_refused')};for(const o of [net.Socket.prototype,net.Server.prototype]){if(o===net.Socket.prototype)o.connect=deny;else o.listen=deny}tls.connect=deny;tls.createServer=deny;http.request=deny;http.get=deny;http.createServer=deny;https.request=deny;https.get=deny;https.createServer=deny;dgram.createSocket=deny;for(const k of ['spawn','spawnSync','fork','exec','execSync','execFile','execFileSync'])cp[k]=deny;globalThis.fetch=deny;registerHooks({resolve(s,c,n){if(s==='pg'||s.startsWith('pg/')||['jszip','mammoth'].includes(s)||s.startsWith('pdfjs-dist/')||s.endsWith('.node'))deny();return n(s,c)}});syncBuiltinESMExports();process.on('exit',()=>{if(attempted)process.exitCode=95});`
  const preload='data:text/javascript,'+encodeURIComponent(guard),poison={...env,TAR_OPTIONS:'--files-from=/never/read/source-review',DATABASE_URL:'postgres://never-use-source-review',AGENT_STUDIO_BAOTA_PG_ADMIN_PASSWORD_FILE:'/never/read/source-review/secret',CREDENTIALS_DIRECTORY:'/never/read/source-review'}
  const plans=[['baota-pg18-complete-init.mjs',['--plan','--profile','complete069']],['pg18-complete-service-cli.mjs',['--plan']],['pg18-complete-review-worker-cli.mjs',['--plan']],['pg18-full069-worker-live-cli.mjs',['--plan']]]
  for(const [entry,args]of plans){
   const probe=spawnSync(process.execPath,['--experimental-strip-types','--import',preload,'services/pg-api/src/'+entry,...args],{cwd:extracted,env:poison,encoding:'utf8',timeout:60000,maxBuffer:3*1024*1024});assert.equal(probe.error,undefined,entry);assert.equal(probe.status,0,entry+': '+probe.stderr)
   const plan=JSON.parse(probe.stdout);for(const key of ['network_used','writes_performed','production_cutover_allowed'])assert.equal(plan[key],false,entry+': '+key)
   if(entry==='baota-pg18-complete-init.mjs'){assert.equal(plan.source_sha256,complete.source_sha256);assert.equal(plan.all_services_disabled,true);assert.equal(plan.secret_read,false)}
   else assert.equal(plan.services_started??plan.qualifying_window_started,false,entry)
   if(entry==='pg18-complete-service-cli.mjs')assert.deepEqual(plan.actions,['api','native-auth','first-admin','worker','identity','broker','index-worker','index-broker'])
   if(entry==='pg18-complete-review-worker-cli.mjs'){assert.equal(plan.credentials_read,false);assert.equal(plan.preparation_is_runtime_authorization,false)}
   if(entry==='pg18-full069-worker-live-cli.mjs'){assert.equal(plan.secrets_read,false);assert.equal(plan.qualifying_window_started,false);assert.equal(plan.qualifies_run,false);assert.equal(plan.limits.minimumMs,86400000)}
  }
  const original=fs.statSync(result.archive,{bigint:true});await assert.rejects(buildFull069WorkerLiveReviewBundle(cfg),/archive_already_exists/)
  const unchanged=fs.statSync(result.archive,{bigint:true});assert.equal(unchanged.ino,original.ino);assert.equal(hash(fs.readFileSync(result.archive)),result.sha256)
  assert.deepEqual(fs.readdirSync(output).sort(),[path.basename(result.archive),'extracted'].sort())
  await assert.rejects(buildFull069WorkerLiveReviewBundle({...cfg,output:path.join(root,'must-not-create-live-review-output')}),/output_outside_checkout_required/);assert.equal(fs.existsSync(path.join(root,'must-not-create-live-review-output')),false)
 }finally{
  const current=fs.lstatSync(output,{bigint:true});assert.equal(current.isSymbolicLink(),false);assert.equal(current.dev,owned.dev);assert.equal(current.ino,owned.ino);assert.equal(path.dirname(fs.realpathSync(output)),parent);assert.ok(path.basename(output).startsWith('full069-live-review-test-'));fs.rmSync(output,{recursive:true})
 }
})
