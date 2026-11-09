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
import {captureComplete069PlanWorkflowSources,assertComplete069PlanWorkflowSources,complete069PlanWorkflowModules} from '../services/pg-api/src/pg18-complete-plan-workflow-sources.mjs'
import {complete069PlanWorkflowPlan} from '../services/pg-api/src/pg18-complete-plan-workflow-plan.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),maxFile=16*1024*1024
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n')
const fail=code=>{throw Error('complete069_plan_workflow_review_'+code)}
const parserRoot='services/pg-api/node_modules/typescript/',parserFiles=new Set(['lib/typescript.js','package.json','LICENSE.txt','ThirdPartyNoticeText.txt'])
const reviewFiles=['docs/PG18_COMPLETE_069_PLAN_WORKFLOW_PREPARATION.md','ops/build-pg18-complete069-review-bundle.mjs','ops/build-pg18-complete-plan-workflow-review-bundle.mjs','tests/pg18-complete-plan-workflow-review-bundle.test.mjs']
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
export function mergeComplete069PlanWorkflowReviewSource(entries,name,bytes){
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
 'F05 PLAN WORKFLOW SOURCE REVIEW ONLY. Production NO-GO. No runtime capability, installation or account preparation is performed by this builder.',
 'Verify an externally trusted archive SHA256, then REVIEW_MANIFEST.json and the exact SHA256SUMS inventory before reading source.',
 'Includes the genuine complete069 closure, all53 SQL sources, original API package/lock and exactly four pinned TypeScript5.9.3 parser files, plus the independent F05 closure, original service CLI/config/TLS helpers and six installation examples.',
 'Order: original C8 -> Review Worker -> Executor -> Review Dispatch/Design -> F05 Worker/Dispatch -> Telemetry -> final qualification. The new preparer requires12 actual predecessor LOGINs and their original auditors; it creates only the two fixed F05 LOGINs.',
 'Read docs/PG18_COMPLETE_069_PLAN_WORKFLOW_PREPARATION.md. All unit/config/HBA/credential-path examples require separate Root review. Refused config defaults and units without Install sections are intentional.',
 'Offline original service plan: node --experimental-strip-types services/pg-api/src/agent-plan-workflow-service.ts --plan',
 'Offline new preparation plan: node services/pg-api/src/pg18-complete-plan-workflow-cli.mjs --plan',
 'Only source capture/archive and offline plans occur here. No SQL, driver, credential read, dependency installation, listener, Worker, model call, deployment or service start occurs.',
 'No14-package PG operator runtime or runtime manifest, business dependency runtime, secret, environment file, TLS private material, database, binary or installed system service is packed. The four TypeScript files support AST/offline plans only.',
 'Complete and F05 source hashes are observations of this captured tree. Recapture and approve them after final Root integration on the exact installed read-only tree. Never turn a D handoff hash into a runtime/CI target.',
 'Preparation records preserve COMMIT unknown; observation never acknowledges a previous commit or authorizes runtime. Original C8, Review ABI,050/059/060 and existing builder flags remain unchanged.',
 'Genuine owned Linux CI must still verify both new LOGINs, original nonroot preflight worker/broker, all57 ledger rows and133 table images. Source/pure/offline success does not prove those capabilities.',
 'Seven empty-queue Workers do not prove every Broker is installed. This delivery explicitly supplies F05; standalone Bound Broker source/assets remain a separate delivery and verification obligation.',
 'The original minimum24h qualification has not been started or shortened by this package. Employee UAT and production cutover are not authorized.',
 '',
].join('\n'))
export function parseComplete069PlanWorkflowReviewArguments(argv){
 if(!Array.isArray(argv)||argv.length!==8||argv[0]!=='--profile'||argv[1]!=='complete069'||argv[2]!=='--expected-source-sha256'||!hex(argv[3])||argv[4]!=='--expected-plan-workflow-source-sha256'||!hex(argv[5])||argv[6]!=='--output-dir'||typeof argv[7]!=='string'||!path.isAbsolute(argv[7])||argv[7].includes('\0'))fail('arguments_refused')
 return Object.freeze({expectedSource:argv[3],expectedF05Source:argv[5],output:path.resolve(argv[7])})
}
function assertCaptured(collected,f05,cfg){
 assertCompleteProfileSnapshot(collected.snapshot,cfg.expectedSource)
 assertComplete069PlanWorkflowSources(f05,cfg.expectedF05Source)
 if(f05.complete.source_sha256!==cfg.expectedSource||f05.manifest.complete_source_sha256!==cfg.expectedSource)fail('source_cohort')
}
export async function collectComplete069PlanWorkflowReviewSources(expectedSource,expectedF05Source){
 if(!hex(expectedSource)||!hex(expectedF05Source))fail('source_sha_required')
 const collected=await collectComplete069ReviewSources(expectedSource),f05=await captureComplete069PlanWorkflowSources(),cfg={expectedSource,expectedF05Source}
 assertCaptured(collected,f05,cfg)
 const entries=new Map(),add=(name,bytes)=>mergeComplete069PlanWorkflowReviewSource(entries,name,bytes)
 for(const [name,bytes]of collected.entries)if(!outerIndexes.has(name))add(name,bytes)
 for(const entry of f05.manifest.sources){const bytes=readSource(entry.path);if(sha(bytes)!==entry.sha256)fail('source_changed');add(entry.path,bytes)}
 for(const name of reviewFiles)add(name,readSource(name))
 add('PLAN_WORKFLOW_SOURCE_MANIFEST.json',json(f05.manifest))
 add('PLAN_WORKFLOW_PLAN.json',json(complete069PlanWorkflowPlan()))
 add('PLAN_WORKFLOW_DEPENDENCY_BOUNDARY.json',json({format:'complete069_plan_workflow_source_dependency_boundary_v1',complete_source_sha256:expectedSource,plan_workflow_source_sha256:expectedF05Source,operator_pg_runtime_bundled:false,operator_runtime_manifest_bundled:false,business_dependency_runtime_bundled:false,dependency_installation_performed:false,telemetry_controller_provisioning_assets_bundled:false,source_is_runtime_capability:false,source_is_target_authorization:false,review_preparation_is_live_readiness:false,actual_24h_window_started:false,actual_24h_window_passed:false,owned_linux_validation_performed:false,production_cutover_allowed:false}))
 add('README_REVIEW_ONLY.txt',readme)
 const records=[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length}))
 add('REVIEW_MANIFEST.json',json({format:'complete069_plan_workflow_source_review_v1',profile:'complete069',complete_source_sha256:expectedSource,plan_workflow_source_sha256:expectedF05Source,complete_source_count:collected.snapshot.manifest.sources.length,sql_source_count:collected.snapshot.manifest.sql_sources.length,plan_workflow_source_count:f05.manifest.sources.length,plan_workflow_entry_modules:complete069PlanWorkflowModules,review_only:true,source_is_runtime_capability:false,old_builder_flags_changed:false,default050_unchanged:true,old059060_unchanged:true,actual_24h_window_started:false,owned_linux_validation_performed:false,files:records,production_cutover_allowed:false}))
 add('SHA256SUMS',Buffer.from([...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,b])=>sha(b)+'  '+name).join('\n')+'\n'))
 assertCaptured(collected,f05,cfg)
 return {collected,f05,entries,files:[...entries.keys()].sort(),reviewOnly:true}
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
export async function buildComplete069PlanWorkflowReviewBundle(cfg){
 const captured=await collectComplete069PlanWorkflowReviewSources(cfg.expectedSource,cfg.expectedF05Source)
 outputDirectory(cfg.output)
 const archive=path.join(cfg.output,'agentstudio_complete069_plan_workflow_source_review_'+cfg.expectedSource.slice(0,16)+'_'+cfg.expectedF05Source.slice(0,16)+'.tar.gz')
 if(fs.existsSync(archive))fail('archive_already_exists')
 const stage=ownDirectory(cfg.output,'full069-f05-review-source-')
 try{
  for(const [name,bytes]of captured.entries){const file=path.join(stage.dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'})}
  assertCaptured(captured.collected,captured.f05,cfg)
  const checked=ownDirectory(cfg.output,'full069-f05-review-check-')
  try{
   const partial=path.join(checked.dir,'payload.tar.gz'),extracted=path.join(checked.dir,'unpacked');fs.mkdirSync(extracted)
   tar(['-czf',partial,'-C',stage.dir,'.'])
   const names=tar(['-tzf',partial]).split(/\r?\n/).filter(v=>v&&!v.endsWith('/')).map(v=>v.replace(/^\.\//,'')).sort()
   if(JSON.stringify(names)!==JSON.stringify(captured.files))fail('archive_inventory')
   tar(['-xzf',partial,'-C',extracted]);verifyExtracted(extracted,captured.entries)
   assertCaptured(captured.collected,captured.f05,cfg)
   // Exclusive publication also refuses a concurrent archive at the same name.
   try{fs.linkSync(partial,archive)}catch(error){if(error?.code==='EEXIST')fail('archive_already_exists');fail('archive_publish')}
  }finally{removeOwn(cfg.output,checked)}
  return {format:'complete069_plan_workflow_source_review_bundle_result_v1',archive,sha256:sha(fs.readFileSync(archive)),complete_source_sha256:cfg.expectedSource,plan_workflow_source_sha256:cfg.expectedF05Source,packed_files:captured.files.length,source_manifest_verified:true,archive_extracted_inventory_verified:true,archive_extracted_hashes_verified:true,application_cli_executed:false,dependency_installation_performed:false,network_used:false,sql_executed:false,services_started:false,source_is_runtime_capability:false,actual_24h_window_started:false,owned_linux_validation_performed:false,production_cutover_allowed:false}
 }finally{removeOwn(cfg.output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const cfg=parseComplete069PlanWorkflowReviewArguments(process.argv.slice(2));process.stdout.write(JSON.stringify(await buildComplete069PlanWorkflowReviewBundle(cfg))+'\n')}
 catch(error){const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value;process.stderr.write(typeof v==='string'&&/^complete069_plan_workflow_review_[a-z_]+$/.test(v)?v+'\n':'complete069_plan_workflow_review_source_or_archive_refused\n');process.exitCode=1}
}
