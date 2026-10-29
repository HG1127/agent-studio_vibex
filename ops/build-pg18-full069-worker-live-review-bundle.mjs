#!/usr/bin/env node
// Independent SOURCE review delivery. No runtime capability, installation,
// credential collection, SQL, listener or business Worker is created here.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {collectComplete069ReviewSources} from './build-pg18-complete069-review-bundle.mjs'
import {assertCompleteProfileSnapshot} from '../services/pg-api/src/pg18-complete-profile-source.mjs'
import {captureFull069WorkerLiveSources,assertFull069WorkerLiveSources,liveModules} from '../services/pg-api/src/pg18-full069-worker-live-sources.mjs'
import {full069WorkerLivePlan} from '../services/pg-api/src/pg18-full069-worker-live-cli.mjs'
import {complete069ExecutorPlan} from '../services/pg-api/src/pg18-complete-executor-plan.mjs'
import {complete069ReviewWorkerPlan} from '../services/pg-api/src/pg18-complete-review-worker-plan.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),maxFile=16*1024*1024
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n')
const fail=code=>{throw Error('full069_live_review_'+code)}
const parserRoot='services/pg-api/node_modules/typescript/',parserFiles=new Set(['lib/typescript.js','package.json','LICENSE.txt','ThirdPartyNoticeText.txt'])
const executorExamples=Object.freeze(['ops/templates/native-local-executor-pg-hba.conf.example','ops/templates/agentstudio-pg18-native-local-executor.conf.example'])
const reviewFiles=['docs/PG18_COMPLETE_069_REVIEW_WORKER_PREPARATION.md','docs/PG18_COMPLETE_069_EXECUTOR_PREPARATION.md','docs/PG18_FULL069_WORKER_LIVE_OPERATIONS.json','ops/build-pg18-complete069-review-bundle.mjs','ops/build-pg18-full069-worker-live-review-bundle.mjs','tests/pg18-full069-worker-live-review-bundle.test.mjs',...executorExamples]
// The old complete archive's generated outer index is replaced, not reused as
// an index of this larger delivery. Its underlying source/SQL bytes are kept.
const outerIndexes=new Set(['REVIEW_MANIFEST.json','SHA256SUMS','README_REVIEW_ONLY.txt'])
function safeName(name){
 if(typeof name!=='string'||!/^[A-Za-z0-9_./-]+$/.test(name)||path.posix.normalize(name)!==name||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')||/(?:^|\/)(?:\.env[^/]*|pb_data|secrets?|credentials?)(?:\/|$)|\.(?:db|sqlite|wal|exe|dll|pem|key|zip|tar|gz)$/i.test(name))fail('unsafe_name')
 if(name.includes('/node_modules/')&&(!name.startsWith(parserRoot)||!parserFiles.has(name.slice(parserRoot.length))))fail('unexpected_dependency_file')
 return name
}
// A pure byte merge, not an injectable capture/runtime interface. The collector
// below obtains and reasserts both genuine WeakSet-branded source snapshots.
export function mergeFull069WorkerLiveReviewSource(entries,name,bytes){
 safeName(name)
 if(!(entries instanceof Map)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>maxFile)fail('source_bytes')
 if(entries.has(name)&&!entries.get(name).equals(bytes))fail('source_conflict')
 if(!entries.has(name))entries.set(name,Buffer.from(bytes))
}
function readText(file){
 const before=fs.lstatSync(file)
 if(before.isSymbolicLink()||!before.isFile()||before.nlink!==1||before.size<1||before.size>maxFile||fs.realpathSync(file)!==file)fail('source_file')
 const bytes=fs.readFileSync(file),after=fs.lstatSync(file)
 for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])if(before[k]!==after[k])fail('source_changed')
 if(bytes.includes(0)||bytes.toString('utf8').startsWith('\uFEFF')||!Buffer.from(bytes.toString('utf8')).equals(bytes))fail('source_encoding')
 return bytes
}
function readSource(name){
 safeName(name);let at=root
 for(const part of name.split('/')){if(fs.lstatSync(at).isSymbolicLink())fail('source_symlink');at=path.join(at,part)}
 return readText(at)
}
const readme=Buffer.from([
 'FULL069 WORKER LIVE SOURCE REVIEW ONLY. Production NO-GO. This archive is not a runtime capability or an installed application.',
 'Verify an externally trusted archive SHA256, then the independent REVIEW_MANIFEST.json and complete SHA256SUMS exact inventory before reviewing source.',
 'Included: genuine current complete069 source closure, all53 original SQL sources, original API package/lock, exactly four pinned TypeScript5.9.3 parser files, and the independent full069 live source closure.',
 'Both COMPLETE_SOURCE_MANIFEST.json and FULL069_WORKER_LIVE_SOURCE_MANIFEST.json bind actual source bytes. Their hashes are review observations, not deployment targets or capability evidence.',
 'Recapture and approve complete and independent live hashes from the final installed read-only source tree after all Root integration/CI changes. Do not copy this offline hash into a running target.',
 'Read docs/PG18_COMPLETE_069_EXECUTOR_PREPARATION.md, docs/PG18_COMPLETE_069_PREPARATION.md, docs/PG18_COMPLETE_069_REVIEW_WORKER_PREPARATION.md and docs/PG18_FULL069_WORKER_LIVE_OPERATIONS.json.',
 'Required order: fresh complete069 installation -> C eight actions api -> native-auth -> first-admin -> worker -> identity -> broker -> index-worker -> index-broker -> separate fixed Review LOGIN preparation -> separate fixed Executor preparation -> independent Review Dispatch/Design/Plan Workflow preparation (must be completed before final qualification) -> separate Telemetry/Root Controller provisioning and original runtime preflights -> reviewed owned-Linux live validation.',
 'Preserve C intent/result records and COMMIT-unknown states. Review preparation is not live readiness. Do not rerun the fresh-only C catalog after adding Review LOGIN or synthesize old receipts.',
 'Offline source plan: node --experimental-strip-types services/pg-api/src/baota-pg18-complete-init.mjs --plan --profile complete069',
 'Offline C preparation plan: node services/pg-api/src/pg18-complete-service-cli.mjs --plan',
 'Offline Review preparation plan: node services/pg-api/src/pg18-complete-review-worker-cli.mjs --plan',
 'Offline Executor preparation plan: node services/pg-api/src/pg18-complete-executor-cli.mjs --plan',
 'Offline live plan: node services/pg-api/src/pg18-full069-worker-live-cli.mjs --plan',
 'Only these offline plans are described here. No --run, installation, login preparation, target inspection, service start or dependency installation is performed by the builder.',
 'The original minimum24h qualifying window has NOT started. It still requires independent operator acknowledgements, genuine original processes, real HTTPS/SQL audits, process ownership and cleanup evidence on an explicitly approved isolated Linux host.',
 'The two existing fixed Executor HBA and Native service drop-in source examples are included for review only; they do not enable device opt-ins or install/start a service.',
 'No 14-package PostgreSQL operator runtime, runtime manifest, business dependency runtime, credentials, environment files, database, binary, private key, TLS material or Telemetry/Controller provisioning assets are bundled. No system service is installed.',
 'The four TypeScript parser files support AST/offline plans only. Original package/lock are review inputs; optional document parser child assets and business runtimes need separate verified provisioning.',
 'Verify the original exact 14-package PostgreSQL runtime and its external manifest separately using the original private capability path; a source archive or source hash never grants that capability.',
 'Default050, frozen059/060, original C eight actions, old six-account protocols and existing builder CLI flags are unchanged. No production deployment or real company data operation is authorized.',
 '',
].join('\n'))
export function parseFull069WorkerLiveReviewArguments(argv){
 if(!Array.isArray(argv)||argv.length!==8||argv[0]!=='--profile'||argv[1]!=='complete069'||argv[2]!=='--expected-source-sha256'||!hex(argv[3])||argv[4]!=='--expected-live-source-sha256'||!hex(argv[5])||argv[6]!=='--output-dir'||typeof argv[7]!=='string'||!path.isAbsolute(argv[7])||argv[7].includes('\0'))fail('arguments_refused')
 return Object.freeze({expectedSource:argv[3],expectedLiveSource:argv[5],output:path.resolve(argv[7])})
}
function assertCaptured(collected,live,cfg){
 assertCompleteProfileSnapshot(collected.snapshot,cfg.expectedSource)
 assertFull069WorkerLiveSources(live,cfg.expectedLiveSource)
 if(live.complete.source_sha256!==cfg.expectedSource||live.manifest.complete_source_sha256!==cfg.expectedSource)fail('source_cohort')
}
export async function collectFull069WorkerLiveReviewSources(expectedSource,expectedLiveSource){
 if(!hex(expectedSource)||!hex(expectedLiveSource))fail('source_sha_required')
 const collected=await collectComplete069ReviewSources(expectedSource),live=await captureFull069WorkerLiveSources(),cfg={expectedSource,expectedLiveSource}
 assertCaptured(collected,live,cfg)
 const entries=new Map(),add=(name,bytes)=>mergeFull069WorkerLiveReviewSource(entries,name,bytes)
 for(const [name,bytes]of collected.entries)if(!outerIndexes.has(name))add(name,bytes)
 for(const entry of live.manifest.sources){const bytes=readSource(entry.path);if(sha(bytes)!==entry.sha256)fail('source_changed');add(entry.path,bytes)}
 for(const name of reviewFiles)add(name,readSource(name))
 add('FULL069_WORKER_LIVE_SOURCE_MANIFEST.json',json(live.manifest))
 add('FULL069_WORKER_LIVE_PLAN.json',json(full069WorkerLivePlan()))
 add('REVIEW_WORKER_PLAN.json',json(complete069ReviewWorkerPlan()))
 add('EXECUTOR_PLAN.json',json(complete069ExecutorPlan()))
 add('FULL069_WORKER_LIVE_DEPENDENCY_BOUNDARY.json',json({format:'full069_worker_live_source_dependency_boundary_v1',complete_source_sha256:expectedSource,live_source_sha256:expectedLiveSource,operator_pg_runtime_bundled:false,operator_runtime_manifest_bundled:false,business_dependency_runtime_bundled:false,dependency_installation_performed:false,executor_source_examples:executorExamples,system_service_installed:false,telemetry_controller_provisioning_assets_bundled:false,source_is_runtime_capability:false,source_is_target_authorization:false,review_preparation_is_live_readiness:false,actual_24h_window_started:false,actual_24h_window_passed:false,owned_linux_validation_performed:false,production_cutover_allowed:false}))
 add('README_REVIEW_ONLY.txt',readme)
 const records=[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length}))
 add('REVIEW_MANIFEST.json',json({format:'full069_worker_live_source_review_v1',profile:'complete069',complete_source_sha256:expectedSource,live_source_sha256:expectedLiveSource,complete_source_count:collected.snapshot.manifest.sources.length,sql_source_count:collected.snapshot.manifest.sql_sources.length,live_source_count:live.manifest.sources.length,live_entry_modules:liveModules,review_only:true,source_is_runtime_capability:false,old_builder_flags_changed:false,default050_unchanged:true,old059060_unchanged:true,actual_24h_window_started:false,owned_linux_validation_performed:false,files:records,production_cutover_allowed:false}))
 add('SHA256SUMS',Buffer.from([...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,b])=>sha(b)+'  '+name).join('\n')+'\n'))
 assertCaptured(collected,live,cfg)
 return {collected,live,entries,files:[...entries.keys()].sort(),reviewOnly:true}
}
function outputDirectory(output){
 if(typeof output!=='string'||!path.isAbsolute(output)||path.resolve(output)!==output||output.includes('\0'))fail('output_outside_checkout_required')
 const relative=path.relative(root,output)
 if(output===path.parse(output).root||!relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))fail('output_outside_checkout_required')
 let at=path.parse(output).root
 for(const part of output.slice(at.length).split(path.sep).filter(Boolean)){at=path.join(at,part);if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())fail('output_symlink')}
 fs.mkdirSync(output,{recursive:true});if(fs.realpathSync(output)!==output)fail('output_noncanonical')
}
function tar(args){
 const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
 const r=spawnSync('tar',args,{env,timeout:60000,maxBuffer:8*1024*1024,windowsHide:true});if(r.error||r.status!==0)fail('archive_operation');return r.stdout.toString('utf8')
}
function ownDirectory(output,prefix){const dir=fs.mkdtempSync(path.join(output,prefix)),s=fs.statSync(dir,{bigint:true});return {dir,dev:s.dev,ino:s.ino,prefix}}
function removeOwn(output,owned){
 const absolute=path.resolve(owned.dir),rel=path.relative(output,absolute),s=fs.lstatSync(absolute,{bigint:true})
 if(!rel||rel.includes(path.sep)||path.isAbsolute(rel)||!rel.startsWith(owned.prefix)||s.isSymbolicLink()||s.dev!==owned.dev||s.ino!==owned.ino||fs.realpathSync(absolute)!==absolute)fail('cleanup_identity')
 fs.rmSync(absolute,{recursive:true})
}
function verifyExtracted(directory,entries){
 const names=[]
 const visit=(dir,prefix='')=>{for(const name of fs.readdirSync(dir)){const relative=prefix+name,file=path.join(dir,name),st=fs.lstatSync(file);if(st.isSymbolicLink())fail('archive_file_type');if(st.isDirectory()){if(![...entries.keys()].some(entry=>entry.startsWith(relative+'/')))fail('archive_extracted_inventory');visit(file,relative+'/')}else if(st.isFile()&&st.nlink===1){safeName(relative);names.push(relative)}else fail('archive_file_type')}}
 visit(directory)
 if(JSON.stringify(names.sort())!==JSON.stringify([...entries.keys()].sort()))fail('archive_extracted_inventory')
 for(const [name,bytes]of entries){const extracted=readText(path.join(directory,name));if(extracted.length!==bytes.length||sha(extracted)!==sha(bytes))fail('archive_hash')}
}
export async function buildFull069WorkerLiveReviewBundle(cfg){
 const captured=await collectFull069WorkerLiveReviewSources(cfg.expectedSource,cfg.expectedLiveSource)
 outputDirectory(cfg.output)
 const archive=path.join(cfg.output,'agentstudio_full069_worker_live_source_review_'+cfg.expectedSource.slice(0,16)+'_'+cfg.expectedLiveSource.slice(0,16)+'.tar.gz')
 if(fs.existsSync(archive))fail('archive_already_exists')
 const stage=ownDirectory(cfg.output,'full069-live-review-source-')
 try{
  for(const [name,bytes]of captured.entries){const file=path.join(stage.dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'})}
  assertCaptured(captured.collected,captured.live,cfg)
  const checked=ownDirectory(cfg.output,'full069-live-review-check-')
  try{
   const partial=path.join(checked.dir,'payload.tar.gz'),extracted=path.join(checked.dir,'unpacked');fs.mkdirSync(extracted)
   tar(['-czf',partial,'-C',stage.dir,'.'])
   const names=tar(['-tzf',partial]).split(/\r?\n/).filter(v=>v&&!v.endsWith('/')).map(v=>v.replace(/^\.\//,'')).sort()
   if(JSON.stringify(names)!==JSON.stringify(captured.files))fail('archive_inventory')
   tar(['-xzf',partial,'-C',extracted]);verifyExtracted(extracted,captured.entries)
   assertCaptured(captured.collected,captured.live,cfg)
   // Exclusive publication also refuses a concurrent archive at the same name.
   try{fs.linkSync(partial,archive)}catch(error){if(error?.code==='EEXIST')fail('archive_already_exists');fail('archive_publish')}
  }finally{removeOwn(cfg.output,checked)}
  return {format:'full069_worker_live_source_review_bundle_result_v1',archive,sha256:sha(fs.readFileSync(archive)),complete_source_sha256:cfg.expectedSource,live_source_sha256:cfg.expectedLiveSource,packed_files:captured.files.length,source_manifest_verified:true,archive_extracted_inventory_verified:true,archive_extracted_hashes_verified:true,application_cli_executed:false,dependency_installation_performed:false,network_used:false,sql_executed:false,services_started:false,source_is_runtime_capability:false,actual_24h_window_started:false,owned_linux_validation_performed:false,production_cutover_allowed:false}
 }finally{removeOwn(cfg.output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const cfg=parseFull069WorkerLiveReviewArguments(process.argv.slice(2));process.stdout.write(JSON.stringify(await buildFull069WorkerLiveReviewBundle(cfg))+'\n')}
 catch(error){const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value;process.stderr.write(typeof v==='string'&&/^full069_live_review_[a-z_]+$/.test(v)?v+'\n':'full069_live_review_source_or_archive_refused\n');process.exitCode=1}
}
