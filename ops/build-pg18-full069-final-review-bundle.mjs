#!/usr/bin/env node
// Source review delivery only. A source seal is neither a live target nor a
// runtime capability. The original complete/live builders stay independent.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {collectFull069WorkerLiveReviewSources,mergeFull069WorkerLiveReviewSource} from './build-pg18-full069-worker-live-review-bundle.mjs'
import {captureFull069FinalSources,assertFull069FinalSources,finalModules} from '../services/pg-api/src/pg18-full069-final-sources.mjs'
import {full069FinalPlan} from '../services/pg-api/src/pg18-full069-final-cli.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),fail=c=>{throw Error('full069_final_review_'+c)}
const outer=new Set(['REVIEW_MANIFEST.json','SHA256SUMS','README_REVIEW_ONLY.txt'])
const reviewFiles=Object.freeze(['docs/PG18_FULL069_FINAL14_RUNTIME.json','docs/PG18_FULL069_FIVE_COMPANION_SUPERVISOR.md','ops/build-pg18-full069-final-review-bundle.mjs','tests/pg18-full069-final-review-bundle.test.mjs'])
const readme=Buffer.from([
 'FULL069 FINAL14 SOURCE REVIEW ONLY. Production NO-GO. This delivery grants no installation, service start, database access or cutover authority.',
 'First verify an externally trusted archive SHA256, then the exact REVIEW_MANIFEST.json and SHA256SUMS inventory. All complete/live/final source manifests bind actual archived bytes, not a future running target.',
 'The union contains all53 original SQL sources, the original complete069 and seven Worker/Native closures, both existing Broker closures/assets, the F05 original service/preparation/assets, the final14 catalog, five-companion supervisor and final runtime closure.',
 'Exactly four original TypeScript5.9.3 parser files support AST/offline plans. Original package/lock are included; PostgreSQL/business dependency runtimes and their manifests must be provisioned and verified separately.',
 'No credential, environment file, database, binary, TLS material, signing key, generated runtime authority, Controller provisioning or production data is bundled. No dependency installation or application CLI execution is performed by the builder.',
 'Required preparation order: complete069 install -> original C eight actions through index-broker and its final readonly inspection -> Review Worker prepare/observe/preflight -> Executor prepare/observe/preflight -> Review Dispatch/Design Worker/Dispatch prepare/observe/preflights -> F05 Worker/Dispatch prepare/observe/preflights -> Telemetry/Root Controller -> final14 current inspection and all13 process validation.',
 'Capture original operation records and observations at their own stage before successors/Telemetry. Preserve COMMIT-unknown provenance; do not replay or rerun old strict stage observers after later accounts are added.',
 'The old seven-Worker qualification cannot cover the five companions or replace final14 acknowledgements. Final validation requires the same original seven Workers/eight kinds/both Knowledge, Native with Executor, assessment with Design and all five companions.',
 'Offline final plan: node services/pg-api/src/pg18-full069-final-cli.mjs --plan',
 'The final plan reads no secrets, launches no process and opens no target. Recapture every genuine source union from the final Root-owned read-only deployed tree; never promote these offline hashes into target/runtime authority.',
 'Actual final qualification still requires explicit disposable-Linux authorization, original verified operator/Control runtimes, signed final/base profiles, exact14 independent LOGINs, current catalog/HBA/ACL checks and real owned process/TLS observations.',
 'Minimum86400000ms continuous qualification, independent final BEGIN and END acknowledgements, original deadlines,128 Writer UIDs, graceful owned stop, all14 business and telemetry backend absence and four empty queues remain mandatory. No restart, shortened window or old receipt can qualify.',
 'Target networking, authenticated database/version checks, backup/restore, real employee UAT and signoff remain separate installation/cutover conditions. Default050, frozen059/060 and the existing builder CLI flags are unchanged.',
 '',
].join('\n'))
export function parseFull069FinalReviewArguments(argv){
 if(!Array.isArray(argv)||argv.length!==10||argv.some(v=>typeof v!=='string')||argv[0]!=='--profile'||argv[1]!=='complete069'||argv[2]!=='--expected-source-sha256'||!hex(argv[3])||argv[4]!=='--expected-live-source-sha256'||!hex(argv[5])||argv[6]!=='--expected-final-source-sha256'||!hex(argv[7])||argv[8]!=='--output-dir'||!path.isAbsolute(argv[9])||argv[9].includes('\0'))fail('arguments_refused')
 return Object.freeze({expectedSource:argv[3],expectedLiveSource:argv[5],expectedFinalSource:argv[7],output:path.resolve(argv[9])})
}
function readSource(name){
 if(typeof name!=='string'||!/^[A-Za-z0-9_./-]+$/.test(name)||path.posix.normalize(name)!==name||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('source_path')
 let at=root;for(const part of name.split('/')){const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink())fail('source_ancestor');at=path.join(at,part)}
 const before=fs.lstatSync(at);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>16777216||fs.realpathSync(at)!==at)fail('source_file')
 const b=fs.readFileSync(at),after=fs.lstatSync(at);if(['dev','ino','size','mtimeMs','ctimeMs','mode','uid','gid'].some(k=>before[k]!==after[k])||b.length!==before.size||b.includes(0)||b.toString('utf8').startsWith('\uFEFF')||!Buffer.from(b.toString('utf8')).equals(b))fail('source_changed');return b
}
function assertCaptured(snapshot,cfg){
 assertFull069FinalSources(snapshot,cfg.expectedFinalSource)
 if(snapshot.complete.source_sha256!==cfg.expectedSource||snapshot.live.source_sha256!==cfg.expectedLiveSource)fail('source_cohort')
}
export async function collectFull069FinalReviewSources(expectedSource,expectedLiveSource,expectedFinalSource){
 if(![expectedSource,expectedLiveSource,expectedFinalSource].every(hex))fail('expected_hashes_required')
 const snapshot=await captureFull069FinalSources(),cfg={expectedSource,expectedLiveSource,expectedFinalSource};assertCaptured(snapshot,cfg)
 const live=await collectFull069WorkerLiveReviewSources(expectedSource,expectedLiveSource),entries=new Map(),add=(n,b)=>mergeFull069WorkerLiveReviewSource(entries,n,b)
 for(const[n,b]of live.entries)if(!outer.has(n))add(n,b)
 for(const r of snapshot.manifest.sources){const b=readSource(r.path);if(sha(b)!==r.sha256)fail('source_changed');add(r.path,b)}
 for(const n of reviewFiles)add(n,readSource(n))
 add('FULL069_FINAL_SOURCE_MANIFEST.json',json(snapshot.manifest));add('FULL069_FINAL_PLAN.json',json(full069FinalPlan()))
 add('FULL069_FINAL_DEPENDENCY_BOUNDARY.json',json({format:'full069_final14_review_boundary_v1',complete_source_sha256:expectedSource,live_source_sha256:expectedLiveSource,final_source_sha256:expectedFinalSource,final_entry_modules:finalModules,business_logins:14,application_processes:13,original_workers:7,heartbeat_kinds:8,companions:5,minimum_ms:86400000,operator_pg_runtime_bundled:false,operator_runtime_manifest_bundled:false,control_runtime_manifest_bundled:false,business_dependency_runtime_bundled:false,credentials_or_TLS_material_bundled:false,dependency_installation_performed:false,application_cli_executed:false,source_is_runtime_capability:false,source_is_target_authorization:false,actual_final14_runtime_validated:false,actual_24h_window_started:false,actual_24h_window_passed:false,production_cutover_allowed:false}))
 add('README_REVIEW_ONLY.txt',readme)
 const records=[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,b])=>({path,sha256:sha(b),bytes:b.length}))
 add('REVIEW_MANIFEST.json',json({format:'full069_final14_source_review_v1',profile:'complete069',complete_source_sha256:expectedSource,live_source_sha256:expectedLiveSource,final_source_sha256:expectedFinalSource,final_source_count:snapshot.manifest.sources.length,sql_source_count:snapshot.complete.manifest.sql_sources.length,files:records,review_only:true,source_is_runtime_capability:false,actual_final14_runtime_validated:false,actual_24h_window_started:false,production_cutover_allowed:false}))
 add('SHA256SUMS',Buffer.from([...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([n,b])=>sha(b)+'  '+n).join('\n')+'\n'))
 assertCaptured(snapshot,cfg);return {snapshot,entries,files:[...entries.keys()].sort(),reviewOnly:true}
}
function outputDirectory(output){
 if(typeof output!=='string'||!path.isAbsolute(output)||path.resolve(output)!==output||output.includes('\0'))fail('output_outside_checkout_required')
 const relative=path.relative(root,output);if(output===path.parse(output).root||!relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))fail('output_outside_checkout_required')
 let at=path.parse(output).root;for(const part of output.slice(at.length).split(path.sep).filter(Boolean)){at=path.join(at,part);if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())fail('output_symlink')}
 fs.mkdirSync(output,{recursive:true});if(fs.realpathSync(output)!==output)fail('output_noncanonical')
}
function tar(args){const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]])),r=spawnSync('tar',args,{env,timeout:60000,maxBuffer:8388608,windowsHide:true});if(r.error||r.status!==0)fail('archive_operation');return r.stdout.toString('utf8')}
function ownDirectory(output,prefix){const dir=fs.mkdtempSync(path.join(output,prefix)),s=fs.statSync(dir,{bigint:true});return {dir,dev:s.dev,ino:s.ino,prefix}}
function removeOwn(output,owned){const absolute=path.resolve(owned.dir),rel=path.relative(output,absolute),s=fs.lstatSync(absolute,{bigint:true});if(!rel||rel.includes(path.sep)||path.isAbsolute(rel)||!rel.startsWith(owned.prefix)||s.isSymbolicLink()||s.dev!==owned.dev||s.ino!==owned.ino||fs.realpathSync(absolute)!==absolute)fail('cleanup_identity');fs.rmSync(absolute,{recursive:true})}
function verifyExtracted(directory,entries){
 const names=[];const visit=(dir,prefix='')=>{for(const name of fs.readdirSync(dir)){const relative=prefix+name,file=path.join(dir,name),s=fs.lstatSync(file);if(s.isSymbolicLink())fail('archive_file_type');if(s.isDirectory()){if(![...entries.keys()].some(n=>n.startsWith(relative+'/')))fail('archive_inventory');visit(file,relative+'/')}else if(s.isFile()&&s.nlink===1){const expected=entries.get(relative);if(!expected||!fs.readFileSync(file).equals(expected))fail('archive_bytes');names.push(relative)}else fail('archive_file_type')}};visit(directory)
 if(JSON.stringify(names.sort())!==JSON.stringify([...entries.keys()].sort()))fail('archive_inventory')
}
export async function buildFull069FinalReviewBundle(cfg){
 const captured=await collectFull069FinalReviewSources(cfg.expectedSource,cfg.expectedLiveSource,cfg.expectedFinalSource);outputDirectory(cfg.output)
 const archive=path.join(cfg.output,'agentstudio_full069_final_source_review_'+cfg.expectedSource.slice(0,16)+'_'+cfg.expectedFinalSource.slice(0,16)+'.tar.gz');if(fs.existsSync(archive))fail('archive_already_exists')
 const stage=ownDirectory(cfg.output,'full069-final-review-source-')
 try{
  for(const[n,b]of captured.entries){const f=path.join(stage.dir,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b,{flag:'wx'})}
  assertCaptured(captured.snapshot,cfg);const checked=ownDirectory(cfg.output,'full069-final-review-check-')
  try{const partial=path.join(checked.dir,'payload.tar.gz'),unpacked=path.join(checked.dir,'unpacked');fs.mkdirSync(unpacked,{mode:0o700});tar(['-czf',partial,'-C',stage.dir,'.']);const names=tar(['-tzf',partial]).split(/\r?\n/).filter(v=>v&&!v.endsWith('/')).map(v=>v.replace(/^\.\//,'')).sort();if(JSON.stringify(names)!==JSON.stringify(captured.files))fail('archive_inventory');tar(['-xzf',partial,'-C',unpacked]);verifyExtracted(unpacked,captured.entries);assertCaptured(captured.snapshot,cfg);try{fs.linkSync(partial,archive)}catch(error){if(error?.code==='EEXIST')fail('archive_already_exists');fail('archive_publish')}}finally{removeOwn(cfg.output,checked)}
  return {format:'full069_final14_source_review_bundle_result_v1',archive,sha256:sha(fs.readFileSync(archive)),complete_source_sha256:cfg.expectedSource,live_source_sha256:cfg.expectedLiveSource,final_source_sha256:cfg.expectedFinalSource,packed_files:captured.files.length,source_manifest_verified:true,archive_extracted_inventory_verified:true,archive_extracted_hashes_verified:true,application_cli_executed:false,dependency_installation_performed:false,network_used:false,sql_executed:false,services_started:false,source_is_runtime_capability:false,actual_final14_runtime_validated:false,actual_24h_window_started:false,production_cutover_allowed:false}
 }finally{removeOwn(cfg.output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{process.stdout.write(JSON.stringify(await buildFull069FinalReviewBundle(parseFull069FinalReviewArguments(process.argv.slice(2))))+'\n')}catch(error){const m=Object.getOwnPropertyDescriptor(error??{},'message')?.value;process.stderr.write(typeof m==='string'&&/^full069_final_review_[a-z_]+$/.test(m)?m+'\n':'full069_final_review_source_or_archive_refused\n');process.exitCode=1}
