#!/usr/bin/env node
// Independent SOURCE/ASSET archive only. No application CLI or DB execution.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {collectComplete069ReviewSources} from './build-pg18-complete069-review-bundle.mjs'
import {captureComplete069CompanionSources,assertComplete069CompanionSources,complete069CompanionSourcePlan} from '../services/pg-api/src/pg18-complete-companion-sources.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),fail=c=>{throw Error('complete069_companion_review_'+c)},json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n')
function safe(n){if(typeof n!=='string'||!/^[A-Za-z0-9_./-]+$/.test(n)||path.posix.normalize(n)!==n||n.startsWith('/')||n.split('/').some(p=>!p||p==='.'||p==='..')||/(?:^|\/)(?:\.env[^/]*|pb_data|secrets?|credentials?)(?:\/|$)|\.(?:db|sqlite|wal|exe|dll|pem|key|zip)$/i.test(n))fail('unsafe_name');return n}
function readText(file){const a=fs.lstatSync(file);if(a.isSymbolicLink()||!a.isFile()||a.nlink!==1||a.size<1||a.size>16*1024*1024)fail('source_file');const b=fs.readFileSync(file),z=fs.lstatSync(file);if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>a[k]!==z[k])||b.includes(0)||!Buffer.from(b.toString('utf8')).equals(b))fail('source_changed');return b}
export function parseCompanionReviewArguments(argv){
 if(Array.isArray(argv)&&argv.length===1&&argv[0]==='--plan')return {mode:'plan'}
 if(!Array.isArray(argv)||argv.length!==8||argv.some(v=>typeof v!=='string')||argv[0]!=='--profile'||argv[1]!=='complete069'||argv[2]!=='--expected-source-sha256'||!hex(argv[3])||argv[4]!=='--expected-companion-sha256'||!hex(argv[5])||argv[6]!=='--output-dir'||!path.isAbsolute(argv[7])||argv[7].includes('\0'))fail('arguments_refused')
 return Object.freeze({mode:'build',expectedSource:argv[3],expectedCompanion:argv[5],output:path.resolve(argv[7])})
}
export async function collectCompanionReviewSources(expectedSource,expectedCompanion){
 if(!hex(expectedSource)||!hex(expectedCompanion))fail('expected_hashes_required')
 const snapshot=await captureComplete069CompanionSources();assertComplete069CompanionSources(snapshot,expectedCompanion)
 if(snapshot.complete.source_sha256!==expectedSource)fail('parent_source_mismatch')
 const base=await collectComplete069ReviewSources(expectedSource),entries=new Map(base.entries)
 if(base.snapshot.source_sha256!==snapshot.complete.source_sha256)fail('parent_source_mismatch')
 const baseManifest=entries.get('REVIEW_MANIFEST.json');if(!baseManifest)fail('base_manifest')
 entries.delete('REVIEW_MANIFEST.json');entries.delete('SHA256SUMS')
 const add=(n,b)=>{safe(n);if(entries.has(n)&&!entries.get(n).equals(b))fail('duplicate_source');entries.set(n,b)}
 add('BASE_COMPLETE069_REVIEW_MANIFEST.json',baseManifest)
 for(const f of [...snapshot.manifest.sources,...snapshot.manifest.assets]){const b=readText(path.join(root,safe(f.path)));if(sha(b)!==f.sha256)fail('source_changed');add(f.path,b)}
 add('BROKER_COMPANION_SOURCE_MANIFEST.json',json(snapshot.manifest));add('BROKER_COMPANION_PLAN.json',json(complete069CompanionSourcePlan(snapshot)))
 add('BROKER_COMPANION_BOUNDARY.json',json({format:'complete069_broker_companion_boundary_v1',complete_source_sha256:expectedSource,companion_source_sha256:expectedCompanion,original_entrypoints_and_auditors_unchanged:true,new_roles:0,credentials_or_TLS_material_included:false,operator_or_business_runtime_installed:false,original_preflights_executed:false,original_preflights_load_model_encryption_key:true,original_worker_qualification_includes_brokers:false,seven_entries_eight_kinds_86400000ms_unchanged:true,all_services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false}))
 const intro=Buffer.from('SOURCE/ASSET REVIEW ONLY. Production NO-GO. Read docs/PG18_COMPLETE_069_BROKER_COMPANIONS_REVIEW.md.\nThis independent companion seal extends the complete069 source review with the original Bound/Knowledge Broker entrypoints, exact configs, existing readonly unit examples and credential/TLS ABI. It prepares no role, installs/starts nothing and bundles no live credential, certificate, key or runtime.\nOriginal Broker preflight reads a real encryption key; it is not metadata-only and has NOT been executed by this builder. The old seven Worker entries never prove these Brokers are running.\n')
 add('BROKER_COMPANION_README_REVIEW_ONLY.txt',intro)
 const records=[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,b])=>({path,sha256:sha(b),bytes:b.length}))
 add('REVIEW_MANIFEST.json',json({format:'complete069_broker_companion_review_v1',profile:'complete069',complete_source_sha256:expectedSource,companion_source_sha256:expectedCompanion,review_only:true,files:records,application_cli_executed:false,sql_executed:false,services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false}))
 add('SHA256SUMS',Buffer.from([...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([n,b])=>sha(b)+'  '+n).join('\n')+'\n'))
 assertComplete069CompanionSources(snapshot,expectedCompanion)
 return {snapshot,entries,files:[...entries.keys()].sort(),reviewOnly:true}
}
function outputDirectory(output){
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
export async function buildCompanionReviewBundle(cfg){
 const collected=await collectCompanionReviewSources(cfg.expectedSource,cfg.expectedCompanion)
 outputDirectory(cfg.output)
 const archive=path.join(cfg.output,'agentstudio_complete069_broker_companions_'+cfg.expectedCompanion.slice(0,16)+'.tar.gz');if(fs.existsSync(archive))fail('archive_already_exists')
 const stage=ownDirectory(cfg.output,'complete069-companion-source-')
 try{
  for(const[n,b]of collected.entries){const f=path.join(stage.dir,safe(n));fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b,{flag:'wx'})}
  assertComplete069CompanionSources(collected.snapshot,cfg.expectedCompanion)
  const extracted=ownDirectory(cfg.output,'complete069-companion-check-')
  try{const partial=path.join(extracted.dir,'payload.tar.gz');tar(['-czf',partial,'-C',stage.dir,'.']);const names=tar(['-tzf',partial]).split(/\r?\n/).filter(v=>v&&!v.endsWith('/')).map(v=>v.replace(/^\.\//,'')).sort();if(JSON.stringify(names)!==JSON.stringify(collected.files))fail('archive_inventory');tar(['-xzf',partial,'-C',extracted.dir]);for(const[n,b]of collected.entries)if(sha(readText(path.join(extracted.dir,n)))!==sha(b))fail('archive_hash');try{fs.linkSync(partial,archive)}catch{fail('archive_publish')}}finally{removeOwn(cfg.output,extracted)}
  return {format:'complete069_broker_companion_bundle_result_v1',archive,sha256:sha(fs.readFileSync(archive)),complete_source_sha256:cfg.expectedSource,companion_source_sha256:cfg.expectedCompanion,packed_files:collected.files.length,source_manifest_verified:true,archive_extracted_hashes_verified:true,application_cli_executed:false,dependency_installation_performed:false,network_used:false,sql_executed:false,services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false}
 }finally{removeOwn(cfg.output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const cfg=parseCompanionReviewArguments(process.argv.slice(2)),result=cfg.mode==='plan'?complete069CompanionSourcePlan(await captureComplete069CompanionSources()):await buildCompanionReviewBundle(cfg);process.stdout.write(JSON.stringify(result)+'\n')}
 catch(error){const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value;process.stderr.write(typeof v==='string'&&/^complete069_companion(?:_review)?_[a-z_]+$/.test(v)?v+'\n':'complete069_companion_review_source_or_archive_refused\n');process.exitCode=1}
}
