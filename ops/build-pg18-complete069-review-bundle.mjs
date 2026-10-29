#!/usr/bin/env node
// Independent complete069 SOURCE review archive. No target, credentials,
// dependency installation, application CLI, SQL, listener or service execution.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot,completeProfilePlan} from '../services/pg-api/src/pg18-complete-profile-source.mjs'
import {completeServicePlan} from '../services/pg-api/src/pg18-complete-service-plan.mjs'
import {completeProfileOperatorRuntimePolicy} from '../services/pg-api/src/pg18-complete-operator-runtime.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),maxFile=16*1024*1024
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Error('complete069_review_'+code)}
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const parserRoot='services/pg-api/node_modules/typescript/',parserPins=Object.freeze({'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675','package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6','LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47','ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c'})
const documents=["docs/PG18_COMPLETE_069_PREPARATION.md","docs/PG18_NATIVE_LOCAL_EXECUTOR_OPERATOR_REVIEW.md","docs/PG18_COMPLETE_069_REVIEW_DESIGN_PREPARATION.md","ops/templates/agent-assessment-worker.service.example","ops/templates/agent-assessment-broker.service.example","ops/templates/agentstudio-pg18-review-worker-design.conf.example","ops/templates/agentstudio-pg18-review-broker-design.conf.example"]
const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
function safeName(name){
 if(typeof name!=='string'||!/^[A-Za-z0-9_./-]+$/.test(name)||path.posix.normalize(name)!==name||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')||/(?:^|\/)(?:\.env[^/]*|pb_data|secrets?|credentials?)(?:\/|$)|\.(?:db|sqlite|wal|exe|dll|pem|key|zip)$/i.test(name))fail('unsafe_name')
 if(name.includes('/node_modules/')&&(!name.startsWith(parserRoot)||!Object.hasOwn(parserPins,name.slice(parserRoot.length))))fail('unexpected_dependency_file')
 return name
}
function readText(file){
 const a=fs.lstatSync(file);if(a.isSymbolicLink()||!a.isFile()||a.size<1||a.size>maxFile)fail('source_file')
 const bytes=fs.readFileSync(file),z=fs.lstatSync(file)
 for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])if(a[k]!==z[k])fail('source_changed')
 if(bytes.includes(0)||bytes.toString('utf8').startsWith('\uFEFF')||!Buffer.from(bytes.toString('utf8')).equals(bytes))fail('source_encoding')
 return bytes
}
const readme=Buffer.from([
 'COMPLETE069 SOURCE REVIEW ONLY. Production NO-GO. This archive is not an installer or a running application.',
 'Verify the externally trusted archive SHA256, then REVIEW_MANIFEST.json and SHA256SUMS before using any source.',
 'Read docs/PG18_COMPLETE_069_PREPARATION.md FIRST. Default050, original059/060 and old six-account protocols remain unchanged.',
 'Included: exact current complete source closure, all53 SQL sources, installer/preparer and original NativeAuth/first-admin code, original API package/lock and four exact TypeScript5.9.3 parser files.',
 'Offline source plans only: node --experimental-strip-types services/pg-api/src/baota-pg18-complete-init.mjs --plan --profile complete069',
 'Offline fixed account plan: node services/pg-api/src/pg18-complete-service-cli.mjs --plan',
 'Account order after a separately approved genuine fresh installation: api -> native-auth -> first-admin -> worker/identity/broker/index-worker/index-broker.',
 'Do not run old native-activation/service-login/runtime-postcheck050 operations against full069, filter ledger rows, or synthesize old receipts.',
 'No PG driver runtime, business dependency runtime, model/employee/DB secret, database, binary or installed system service is bundled.',
 'The pinned14-package PG operator runtime is a SEPARATE verified tree and external manifest; do not install full business node_modules into it or filter its inventory.',
 'Original package/lock are business dependency review inputs. This archive performs no dependency installation and does not attest optional document parsing, Worker, provider or full business readiness.',
 'The complete069 contract source graph is not a full executable/asset closure for every business Worker, URL-referenced parser child, system unit or template. Review those assets separately.',
 'Executor provisioning assets and telemetry provisioning are separate reviewed deliveries AFTER bootstrap. Neither is enabled here.',
 'COMMIT unknown: preserve unknown and use the separate readonly observation; do not replay installation, role changes or admin enrollment.',
 'No target/deployment/start/enable/apply operation is executed by this builder. Do not use a source package or old CI pass as production authority.',
 '',
].join('\n'))
export function parseComplete069ReviewArguments(argv){
 if(!Array.isArray(argv)||argv.length!==6||argv[0]!=='--profile'||argv[1]!=='complete069'||argv[2]!=='--expected-source-sha256'||!hex(argv[3])||argv[4]!=='--output-dir'||typeof argv[5]!=='string'||!path.isAbsolute(argv[5])||argv[5].includes('\0'))fail('arguments_refused')
 return Object.freeze({expectedSource:argv[3],output:path.resolve(argv[5])})
}
export async function collectComplete069ReviewSources(expectedSource){
 if(!hex(expectedSource))fail('source_sha_required')
 const snapshot=await captureCompleteProfileSources();assertCompleteProfileSnapshot(snapshot,expectedSource)
 if(snapshot.manifest.profile!=='complete069'||snapshot.manifest.sql_sources.length!==53||snapshot.steps.length!==19||snapshot.tables.length!==133||snapshot.versions.length+2!==57)fail('source_shape')
 const entries=new Map(),add=(name,bytes)=>{safeName(name);if(entries.has(name)&&!entries.get(name).equals(bytes))fail('duplicate_source');entries.set(name,bytes)}
 for(const f of [...snapshot.manifest.sources,...snapshot.manifest.sql_sources]){const b=readText(path.join(root,f.path));if(sha(b)!==f.sha256)fail('source_changed');add(f.path,b)}
 const pkgBytes=Buffer.from(readText(path.join(root,'services/pg-api/package.json')).toString('utf8').replaceAll('\r\n','\n')),lock=readText(path.join(root,'services/pg-api/pnpm-lock.yaml'))
 if(sha(pkgBytes)!==packageSha||sha(lock)!==lockSha||completeProfileOperatorRuntimePolicy.lock_sha256!==lockSha||Object.keys(completeProfileOperatorRuntimePolicy.packages).length!==14)fail('locked_dependency_metadata')
 add('services/pg-api/package.json',pkgBytes);add('services/pg-api/pnpm-lock.yaml',lock)
 const require=createRequire(path.join(root,'services/pg-api/package.json')),parser=fs.realpathSync(require.resolve('typescript')),parserDir=path.dirname(path.dirname(parser))
 if(path.basename(parser)!=='typescript.js')fail('parser_resolution')
 for(const [name,pin]of Object.entries(parserPins)){const b=readText(path.join(parserDir,name));if(sha(b)!==pin)fail('parser_pin');add(parserRoot+name,b)}
 for(const name of documents)add(name,readText(path.join(root,name)))
 add('COMPLETE_SOURCE_MANIFEST.json',json(snapshot.manifest));add('COMPLETE_PROFILE_PLAN.json',json(completeProfilePlan(snapshot)));add('BOOTSTRAP_PLAN.json',json(completeServicePlan()))
 add('DEPENDENCY_BOUNDARY.json',json({format:'complete069_source_dependency_boundary_v1',source_sha256:expectedSource,package_json_sha256:packageSha,lock_sha256:lockSha,operator_pg_packages:completeProfileOperatorRuntimePolicy.packages,operator_pg_runtime_bundled:false,operator_runtime_manifest_bundled:false,exact_parser_files:Object.entries(parserPins).map(([name,sha256])=>({path:parserRoot+name,sha256})),parser_purpose:'AST/offline plan only; not full compiler CLI',business_dependency_declarations:JSON.parse(pkgBytes).dependencies,business_dependency_runtime_bundled:false,executor_provisioning_assets_included:false,telemetry_provisioning_included:false,review_stack_preparation_source_included:true,review_stack_credential_examples_included:true,review_stack_runtime_authorization:false,dependency_installation_performed:false,production_cutover_allowed:false}))
 add('README_REVIEW_ONLY.txt',readme)
 const records=[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length}))
 add('REVIEW_MANIFEST.json',json({format:'complete069_source_review_v1',profile:'complete069',source_sha256:expectedSource,review_only:true,default050_unchanged:true,old059060_unchanged:true,old_six_receipts_changed:false,pg_runtime_install_verified:false,files:records,production_cutover_allowed:false}))
 add('SHA256SUMS',Buffer.from([...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,b])=>sha(b)+'  '+name).join('\n')+'\n'))
 assertCompleteProfileSnapshot(snapshot,expectedSource)
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
export async function buildComplete069ReviewBundle(cfg){
 const collected=await collectComplete069ReviewSources(cfg.expectedSource)
 outputDirectory(cfg.output)
 const archive=path.join(cfg.output,'agentstudio_complete069_source_review_'+cfg.expectedSource.slice(0,16)+'.tar.gz')
 if(fs.existsSync(archive))fail('archive_already_exists')
 const stage=ownDirectory(cfg.output,'complete069-review-source-')
 try{
  for(const [name,bytes]of collected.entries){const file=path.join(stage.dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'})}
  assertCompleteProfileSnapshot(collected.snapshot,cfg.expectedSource)
  const extracted=ownDirectory(cfg.output,'complete069-review-check-')
  try{
   const partial=path.join(extracted.dir,'payload.tar.gz')
   tar(['-czf',partial,'-C',stage.dir,'.'])
   const names=tar(['-tzf',partial]).split(/\r?\n/).filter(v=>v&&!v.endsWith('/')).map(v=>v.replace(/^\.\//,'')).sort()
   if(JSON.stringify(names)!==JSON.stringify(collected.files))fail('archive_inventory')
   tar(['-xzf',partial,'-C',extracted.dir]);for(const [name,bytes]of collected.entries)if(sha(readText(path.join(extracted.dir,name)))!==sha(bytes))fail('archive_hash')
   // Publish atomically without overwriting an existing deliverable, including
   // a concurrent build. Removing only our own temporary hardlink leaves nlink1.
   try{fs.linkSync(partial,archive)}catch(error){if(error?.code==='EEXIST')fail('archive_already_exists');fail('archive_publish')}
  }finally{removeOwn(cfg.output,extracted)}
  return {format:'complete069_source_review_bundle_result_v1',archive,sha256:sha(fs.readFileSync(archive)),source_sha256:cfg.expectedSource,packed_files:collected.files.length,source_manifest_verified:true,archive_extracted_hashes_verified:true,application_cli_executed:false,dependency_installation_performed:false,network_used:false,sql_executed:false,services_started:false,production_cutover_allowed:false}
 }finally{removeOwn(cfg.output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const cfg=parseComplete069ReviewArguments(process.argv.slice(2));process.stdout.write(JSON.stringify(await buildComplete069ReviewBundle(cfg))+'\n')}
 catch(error){const v=Object.getOwnPropertyDescriptor(error??{},'message')?.value;process.stderr.write(typeof v==='string'&&/^complete069_review_[a-z_]+$/.test(v)?v+'\n':'complete069_review_source_or_archive_refused\n');process.exitCode=1}
}
