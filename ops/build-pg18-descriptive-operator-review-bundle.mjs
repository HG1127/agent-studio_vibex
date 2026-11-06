#!/usr/bin/env node
// Review artifact only. No SQL, credential access, dependency installation or target action.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {spawnSync} from 'node:child_process'
import {captureDescriptivePatchOperatorSources,assertDescriptivePatchOperatorSnapshot,descriptivePatchOperatorSqlBody,descriptivePatchOperatorPlan} from '../services/pg-api/src/agent-descriptive-patch-operator-source.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const entry='services/pg-api/src/agent-descriptive-patch-operator-cli.mjs',prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_'
const sourceSha='bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67'
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const parserRoot='services/pg-api/node_modules/typescript/'
const parserPins=Object.freeze({
  'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675',
  'package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6',
  'LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47',
  'ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c',
})
const metadata=['OPERATOR_SOURCE_MANIFEST.json','OPERATOR_PLAN.json','DEPENDENCY_REVIEW.json','README_REVIEW_ONLY.txt']
const manifestName='REVIEW_MANIFEST.json',maxFile=16*1024*1024,maxTotal=32*1024*1024
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n')
function refuse(code){throw Error('DESCRIPTIVE_OPERATOR_REVIEW_REFUSED:'+code)}
function safeName(name){
  if(typeof name!=='string'||name.length>100||!name||!/^[A-Za-z0-9_./-]+$/.test(name)||path.posix.normalize(name)!==name||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')||/(?:^|\/)(?:\.env[^/]*|pb_data|secrets?|credentials?)(?:\/|$)|\.(?:sqlite|db|wal|exe|dll|zip)$/i.test(name))refuse('unsafe_path')
  return name
}
function noLinks(file){
  const absolute=path.resolve(file);let current=path.parse(absolute).root
  for(const part of absolute.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())refuse('symlink')}
  if(fs.realpathSync(absolute)!==absolute)refuse('noncanonical_path')
  return absolute
}
function readFile(file){
  noLinks(file);const st=fs.lstatSync(file)
  if(!st.isFile()||st.size<1||st.size>maxFile)refuse('unsafe_file')
  const bytes=fs.readFileSync(file),text=bytes.toString('utf8')
  if(bytes.includes(0)||text.startsWith('\uFEFF')||!Buffer.from(text).equals(bytes))refuse('non_text_file')
  return bytes
}
function objectFile(entries,name){try{return JSON.parse(entries.get(name).toString('utf8'))}catch{refuse('invalid_metadata')}}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function sourceManifest(manifest){
  if(sha(Buffer.from(JSON.stringify(manifest)))!==sourceSha||manifest.format!=='agent_descriptive_patch_operator_sources_v1'||manifest.sources.length!==55||manifest.imports.length!==119||manifest.fresh_sources.length!==34||manifest.default_fresh_latest!=='pg_v9_050'||manifest.latest_migration!=='pg_v9_060'||manifest.predecessor?.source_sha256!=='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb')refuse('source_manifest')
}
function expectedPaths(manifest){return [...manifest.sources.map(f=>f.path),...manifest.fresh_sources.map(f=>f.path),manifest.sql.path,manifest.predecessor.manifest.sql.path,'services/pg-api/package.json','services/pg-api/pnpm-lock.yaml',...Object.keys(parserPins).map(f=>parserRoot+f),...metadata].sort()}
function dependencyReview(entries){
  const pkg=objectFile(entries,'services/pg-api/package.json'),lock=entries.get('services/pg-api/pnpm-lock.yaml')
  if(sha(entries.get('services/pg-api/package.json'))!==packageSha||pkg.type!=='module'||pkg.dependencies?.pg!=='^8.23.1'||pkg.devDependencies?.typescript!=='~5.9.3'||sha(lock)!==lockSha)refuse('locked_dependencies')
  for(const [file,digest]of Object.entries(parserPins))if(sha(entries.get(parserRoot+file))!==digest)refuse('parser_bytes')
  const parser=objectFile(entries,parserRoot+'package.json')
  if(parser.version!=='5.9.3'||parser.main!=='./lib/typescript.js')refuse('parser_package')
  return {review_only:true,source_sha256:sourceSha,package_json_sha256:sha(entries.get('services/pg-api/package.json')),lockfile_sha256:lockSha,
    pg:{version:'8.23.1',lock_integrity:'sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==',bundled:false,runtime_install_verified:false},
    typescript:{version:'5.9.3',lock_integrity:'sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==',bundled_files:Object.entries(parserPins).map(([file,sha256])=>({path:parserRoot+file,sha256})),purpose:'Exact parser bytes for offline AST/plan only; no compiler CLI bundled'},
    dependency_installation_performed:false,independent_ci_runtime_install_required:true}
}
function planFromManifest(manifest){return {mode:'plan',...manifest,source_sha256:sourceSha,database:'agent_studio',postgres_major:18,read_only:true,network_used:false,secret_read:false,initializes_database:false,services_started:false,writes_performed:false,installation_supported:false,recovery_supported:false,production_cutover_allowed:false,expected_source_sha256:sourceSha,operator_execution_verified:false}}
function reviewPlan(snapshot){return {...descriptivePatchOperatorPlan(snapshot),expected_source_sha256:sourceSha,operator_execution_verified:false}}
const readme=Buffer.from('CONTROLLED060 SOURCE REVIEW ONLY. Production remains NO-GO. No target action, dependency installation, credentials, database or backup archive is included.\nVerify the externally trusted archive SHA256 and REVIEW_MANIFEST.json before extraction.\nOffline plan: node services/pg-api/src/agent-descriptive-patch-operator-cli.mjs --plan --expected-source-sha256 '+sourceSha+'\nThe exact TypeScript5.9.3 parser is included only for AST and offline plan verification. pg8.23.1 and a verified runtime manifest are NOT bundled. All source, runtime, root ownership, credential, backup/restore, worker-quiescence and target guards remain required. A plan is not an approval, runtime capability, restore proof or permission to apply.\nThis package contains source for an optional060 operation on an independently prepared and fully verified059 target. It does not install the prerequisite schema or enable any worker. Default fresh remains050. The original059 source digest is preserved; its old058 proof cannot be relabeled as a full059 backup.\nReal production use requires a separately approved target, private full059 archive/restore evidence, current operator approvals and locked dependency preparation. Never run apply or recovery against company data based only on this review package or historical CI.\n')
function reviewManifest(entries){return {format:'agent_descriptive_patch_operator_review_v1',review_only:true,source_sha256:sourceSha,default_fresh_latest:'pg_v9_050',initializes_database:false,activation_performed:false,pg_runtime_install_verified:false,files:[...entries].filter(([name])=>name!==manifestName).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length}))}}
function verifyEntries(entries){
  const manifest=objectFile(entries,'OPERATOR_SOURCE_MANIFEST.json');sourceManifest(manifest)
  const paths=expectedPaths(manifest)
  if(paths.length!==new Set(paths).size||!equal([...entries.keys()].sort(),[...paths,manifestName].sort()))refuse('allowlist')
  for(const [name,bytes]of entries){safeName(name);if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>maxFile||bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes))refuse('non_text_file')}
  for(const f of [...manifest.sources,...manifest.fresh_sources,manifest.sql,manifest.predecessor.manifest.sql])if(sha(entries.get(f.path))!==f.sha256)refuse('source_hash')
  const sql=entries.get(manifest.sql.path).toString('utf8'),body=descriptivePatchOperatorSqlBody(sql)
  if(sha(Buffer.from(body))!==manifest.sql.body_sha256)refuse('sql_body_hash')
  const actual={};for(const m of body.matchAll(/CREATE FUNCTION agentstudio\.(agent_descriptive_patch_[a-z_]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g))actual[m[1]]=sha(Buffer.from(m[2]))
  if(!equal(actual,manifest.prosrc)||!equal(objectFile(entries,'OPERATOR_PLAN.json'),planFromManifest(manifest))||!equal(objectFile(entries,'DEPENDENCY_REVIEW.json'),dependencyReview(entries))||!entries.get('README_REVIEW_ONLY.txt').equals(readme)||!equal(objectFile(entries,manifestName),reviewManifest(entries)))refuse('metadata_binding')
  return {source_sha256:sourceSha,files:entries.size,AST_files:55,AST_edges:119,fresh_sql_assets:34,raw060_sha256:manifest.sql.sha256,predecessor059_source_sha256:manifest.predecessor.source_sha256,body_sha256:manifest.sql.body_sha256,prosrc:manifest.prosrc,review_only:true,pg_runtime_install_verified:false}
}

export async function collectDescriptiveOperatorReviewSources(){
  const snapshot=await captureDescriptivePatchOperatorSources();assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha);sourceManifest(snapshot.manifest)
  const entries=new Map()
  for(const f of [...snapshot.manifest.sources,...snapshot.manifest.fresh_sources,snapshot.manifest.sql,snapshot.manifest.predecessor.manifest.sql]){
    safeName(f.path);const bytes=readFile(path.join(root,f.path));if(sha(bytes)!==f.sha256)refuse('source_changed');entries.set(f.path,bytes)
  }
  for(const relative of ['services/pg-api/package.json','services/pg-api/pnpm-lock.yaml']){
    const bytes=readFile(path.join(root,relative))
    // Git's Windows checkout may use CRLF for package.json. Bundle the exact
    // reviewed Linux/Git LF bytes, never a different structured package.
    entries.set(relative,relative.endsWith('/package.json')?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')):bytes)
  }
  const require=createRequire(path.join(root,'services/pg-api/package.json')),parser=fs.realpathSync(require.resolve('typescript')),parserDirectory=path.dirname(path.dirname(parser))
  if(path.basename(parser)!=='typescript.js'||sha(readFile(parser))!==parserPins['lib/typescript.js'])refuse('parser_resolution')
  for(const file of Object.keys(parserPins))entries.set(parserRoot+file,readFile(path.join(parserDirectory,file)))
  entries.set('OPERATOR_SOURCE_MANIFEST.json',json(snapshot.manifest));entries.set('OPERATOR_PLAN.json',json(reviewPlan(snapshot)))
  entries.set('DEPENDENCY_REVIEW.json',json(dependencyReview(entries)));entries.set('README_REVIEW_ONLY.txt',readme)
  entries.set(manifestName,json(reviewManifest(entries)));verifyEntries(entries)
  return {snapshot,files:[...entries.keys()].sort(),entries}
}

function octal(value,width){const text=value.toString(8).padStart(width-1,'0')+'\0';if(text.length!==width)refuse('tar_size');return text}
function tarBytes(entries){
  const output=[]
  for(const [name,bytes]of [...entries].sort(([a],[b])=>a<b?-1:a>b?1:0)){
    safeName(name);const header=Buffer.alloc(512)
    header.write(name,0,'ascii');header.write(octal(0o644,8),100,'ascii');header.write(octal(0,8),108,'ascii');header.write(octal(0,8),116,'ascii');header.write(octal(bytes.length,12),124,'ascii');header.write(octal(0,12),136,'ascii')
    header.fill(32,148,156);header.write('0',156,'ascii');header.write('ustar\0',257,'ascii');header.write('00',263,'ascii');header.write('root',265,'ascii');header.write('root',297,'ascii')
    header.write([...header].reduce((a,n)=>a+n,0).toString(8).padStart(6,'0')+'\0 ',148,'ascii')
    output.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512))
  }
  return Buffer.concat([...output,Buffer.alloc(1024)])
}
function untar(raw){
  if(raw.length>maxTotal||raw.length%512!==0)refuse('tar_bounds')
  const files=new Map(),folded=new Set();let offset=0
  const number=(header,start,width)=>{const value=header.subarray(start,start+width).toString('ascii').split('\0')[0].trim();if(!/^[0-7]+$/.test(value))refuse('tar_number');return parseInt(value,8)}
  while(offset+512<=raw.length){
    const header=raw.subarray(offset,offset+512)
    if(header.every(n=>n===0)){if(raw.length-offset!==1024||raw.subarray(offset).some(n=>n!==0))refuse('tar_end');return files}
    const expected=number(header,148,8),copy=Buffer.from(header);copy.fill(32,148,156)
    if([...copy].reduce((a,n)=>a+n,0)!==expected||header.subarray(257,263).toString('ascii')!=='ustar\0'||header.subarray(263,265).toString('ascii')!=='00'||header[156]!==48||header.subarray(157,257).some(n=>n)||header.subarray(345).some(n=>n))refuse('tar_header')
    const name=safeName(header.subarray(0,100).toString('ascii').split('\0')[0]),size=number(header,124,12)
    if(number(header,100,8)!==0o644||number(header,108,8)!==0||number(header,116,8)!==0||number(header,136,12)!==0||size<1||size>maxFile||files.size>=128||folded.has(name.toLowerCase()))refuse('tar_entry')
    offset+=512;const padded=Math.ceil(size/512)*512
    if(offset+padded>raw.length||raw.subarray(offset+size,offset+padded).some(n=>n))refuse('tar_payload')
    files.set(name,Buffer.from(raw.subarray(offset,offset+size)));folded.add(name.toLowerCase());offset+=padded
  }
  refuse('tar_end')
}
function archiveEntries(archive,options={}){
  noLinks(archive);const st=fs.lstatSync(archive);if(!st.isFile()||st.size<1||st.size>maxFile)refuse('archive_bounds')
  const compressed=fs.readFileSync(archive),digest=sha(compressed)
  if(options.expectedSha256!==undefined&&(!/^[a-f0-9]{64}$/.test(options.expectedSha256)||digest!==options.expectedSha256))refuse('archive_digest')
  let raw;try{raw=gunzipSync(compressed,{maxOutputLength:maxTotal})}catch{refuse('archive_compression')}
  const entries=untar(raw);if(!tarBytes(entries).equals(raw))refuse('noncanonical_tar')
  return {entries,result:{archive_sha256:digest,external_digest_verified:options.expectedSha256!==undefined,...verifyEntries(entries)}}
}
export function verifyDescriptiveOperatorReviewArchive(archive,options={}){return archiveEntries(archive,options).result}
export function verifyDescriptiveOperatorReviewDirectory(directory){
  noLinks(directory);const entries=new Map()
  const manifest=JSON.parse(readFile(path.join(directory,'OPERATOR_SOURCE_MANIFEST.json')).toString('utf8'));sourceManifest(manifest)
  const directories=new Set(expectedPaths(manifest).flatMap(name=>{const parts=name.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/'))}))
  function walk(folder,prefix=''){
    for(const name of fs.readdirSync(folder)){
      const file=path.join(folder,name),relative=prefix+name,st=fs.lstatSync(file)
      if(st.isSymbolicLink())refuse('symlink')
      if(st.isDirectory()){if(!directories.has(relative))refuse('extra_directory');walk(file,relative+'/')}
      else{safeName(relative);if(st.nlink!==1||entries.size>=128)refuse('directory_bounds');entries.set(relative,readFile(file))}
    }
  }
  walk(directory);return verifyEntries(entries)
}
export function extractDescriptiveOperatorReviewArchive(archive,directory,options={}){
  const {entries,result}=archiveEntries(archive,options);noLinks(directory)
  if(!fs.lstatSync(directory).isDirectory()||fs.readdirSync(directory).length)refuse('empty_destination_required')
  for(const [relative,bytes]of entries){const target=path.join(directory,relative);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o644})}
  verifyDescriptiveOperatorReviewDirectory(directory);return result
}

function ownedCleanup(output,directory){
  const base=fs.realpathSync(output),resolved=path.resolve(directory)
  if(path.dirname(resolved)!==base||!/^descriptive-review-(?:source|check)-[A-Za-z0-9_-]+$/.test(path.basename(resolved))||fs.lstatSync(resolved).isSymbolicLink()||fs.realpathSync(resolved)!==resolved)refuse('unsafe_cleanup')
  fs.rmSync(resolved,{recursive:true,force:true})
}
function outputDirectory(output){
  if(typeof output!=='string'||!path.isAbsolute(output)||output.includes('\0')||output.startsWith('\\\\'))refuse('absolute_local_output_required')
  const resolved=path.resolve(output),relative=path.relative(root,resolved)
  if(resolved===path.parse(resolved).root||relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))refuse('output_outside_checkout_required')
  let current=path.parse(resolved).root
  for(const part of resolved.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())refuse('symlink_output')}
  fs.mkdirSync(resolved,{recursive:true,mode:0o700});noLinks(resolved);return resolved
}
function offlinePreload(directory){
  return 'data:text/javascript,'+encodeURIComponent(`
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import tls from 'node:tls';import{registerHooks,syncBuiltinESMExports}from'node:module';import{fileURLToPath}from'node:url';
const root=${JSON.stringify(directory)},parser=path.join(root,${JSON.stringify(parserRoot+'lib/typescript.js')});
const trace={parser_modules:[],pg_imports:0,network_attempts:0,outside_reads:0,ancestor_denials:0};
const inside=p=>{const rel=path.relative(root,path.resolve(p));return rel===''||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)};
registerHooks({resolve(specifier,context,next){if(specifier==='pg'){trace.pg_imports++;throw Error('review_pg_not_installed')}const result=next(specifier,context);if(result.url.startsWith('file:')){const file=fileURLToPath(result.url);if(!inside(file)){trace.ancestor_denials++;throw Error('review_ancestor_dependency_refused')}if(specifier==='typescript'){if(file!==parser)throw Error('review_parser_location');trace.parser_modules.push(file)}}else if(!result.url.startsWith('node:'))throw Error('review_nonfile_module');return result}});
for(const name of ['readFileSync','openSync']){const actual=fs[name];fs[name]=function(file,...args){const p=file instanceof URL?fileURLToPath(file):file;if(typeof p==='string'&&!inside(p)){trace.outside_reads++;throw Error('review_outside_read')}return actual.call(this,file,...args)}}
const block=()=>{trace.network_attempts++;throw Error('review_network_forbidden')};net.Socket.prototype.connect=block;net.connect=block;net.createConnection=block;tls.connect=block;globalThis.fetch=block;syncBuiltinESMExports();
process.on('exit',()=>process.stderr.write('REVIEW_OFFLINE_TRACE:'+JSON.stringify(trace)+'\\n'));
`)
}
function offlineRun(directory,args,env={}){
  const environment=Object.fromEntries(['PATH','SystemRoot','SYSTEMROOT','WINDIR','TMP','TEMP','TMPDIR'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]))
  const run=spawnSync(process.execPath,['--import',offlinePreload(directory),entry,...args],{cwd:directory,env:{...environment,...env},encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,windowsHide:true})
  if(run.error||run.signal)refuse('offline_process')
  const traces=run.stderr.split(/\r?\n/).filter(s=>s.startsWith('REVIEW_OFFLINE_TRACE:'))
  if(traces.length!==1)refuse('offline_trace')
  const trace=JSON.parse(traces[0].slice('REVIEW_OFFLINE_TRACE:'.length))
  if(trace.pg_imports||trace.network_attempts||trace.outside_reads)refuse('offline_boundary')
  return {...run,trace}
}
function verifyOffline(directory,expectedPlan,checkRoot){
  const ambient=path.join(checkRoot,'node_modules/typescript');fs.mkdirSync(ambient,{recursive:true})
  fs.writeFileSync(path.join(ambient,'package.json'),JSON.stringify({name:'typescript',version:'0.0.0',main:'index.js'}))
  fs.writeFileSync(path.join(ambient,'index.js'),"throw Error('ANCESTOR_PARSER_MUST_NEVER_EXECUTE')\n")
  const planned=offlineRun(directory,['--plan','--expected-source-sha256',sourceSha])
  if(planned.status!==0||!equal(JSON.parse(planned.stdout),expectedPlan)||new Set(planned.trace.parser_modules).size!==1||planned.trace.ancestor_denials)refuse('extracted_plan')
  const args=mode=>['--'+mode,'--confirm-database','agent_studio','--expected-source-sha256',sourceSha]
  const secret=path.join(checkRoot,'FORBIDDEN_REVIEW_SECRET'),half={[prefix+'ADMIN_PASSWORD_FILE']:secret}
  const refusals=[{args:[],env:half},{args:args('apply'),env:{...half,[prefix+'ENABLED']:'true'}},{args:args('preflight'),env:{...half,[prefix+'READ_APPROVED']:'APPROVE_DESCRIPTIVE_PATCH_060_READ_ONLY'}},{args:args('recover'),env:{...half,[prefix+'ENABLED']:'true',[prefix+'READ_APPROVED']:'APPROVE_DESCRIPTIVE_PATCH_060_READ_ONLY',[prefix+'WRITE_APPROVED']:'APPROVE_DESCRIPTIVE_PATCH_060_INSTALL_ONLY'}}]
  for(const check of refusals){const run=offlineRun(directory,check.args,check.env);if(run.status===0||!/^DESCRIPTIVE_PATCH_060_REFUSED:descriptive_patch_operator_/m.test(run.stderr)||run.trace.parser_modules.length||run.trace.ancestor_denials||/FORBIDDEN_REVIEW_SECRET|ANCESTOR_PARSER_MUST_NEVER_EXECUTE/.test(run.stdout+run.stderr))refuse('early_refusal')}
  const parserDirectory=path.join(directory,parserRoot),held=path.join(directory,'services/pg-api/node_modules/held-typescript')
  if(!path.resolve(parserDirectory).startsWith(path.resolve(directory)+path.sep)||!path.resolve(held).startsWith(path.resolve(directory)+path.sep))refuse('unsafe_parser_move')
  fs.renameSync(parserDirectory,held)
  try{const missing=offlineRun(directory,['--plan','--expected-source-sha256',sourceSha]);if(missing.status===0||missing.trace.parser_modules.length||missing.trace.ancestor_denials!==1||/ANCESTOR_PARSER_MUST_NEVER_EXECUTE/.test(missing.stdout+missing.stderr))refuse('ancestor_fallback')}
  finally{fs.renameSync(held,parserDirectory)}
  verifyDescriptiveOperatorReviewDirectory(directory)
  return {offline_plan_verified:true,no_ancestor_dependency_fallback_verified:true,default_and_half_marker_refusals:refusals.length,network_attempts:0,pg_imports:0,secret_or_outside_reads:0}
}

export async function buildDescriptiveOperatorReview(output){
  output=outputDirectory(output)
  const archive=path.join(output,'agentstudio_descriptive_060_operator_review_'+sourceSha.slice(0,16)+'.tar.gz')
  if(fs.existsSync(archive))refuse('archive_already_exists')
  const stage=fs.mkdtempSync(path.join(output,'descriptive-review-source-'));let created=false
  try{
    const {snapshot,entries}=await collectDescriptiveOperatorReviewSources()
    const compressed=gzipSync(tarBytes(entries),{level:9});fs.writeFileSync(archive,compressed,{flag:'wx',mode:0o600});created=true
    const digest=sha(compressed),verified=verifyDescriptiveOperatorReviewArchive(archive,{expectedSha256:digest})
    const check=fs.mkdtempSync(path.join(output,'descriptive-review-check-'))
    try{
      const extracted=path.join(check,'payload');fs.mkdirSync(extracted,{mode:0o700});extractDescriptiveOperatorReviewArchive(archive,extracted,{expectedSha256:digest})
      const offline=verifyOffline(extracted,reviewPlan(snapshot),check)
      // No source or dependency can change unnoticed between capture and publication.
      assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)
      for(const f of [...snapshot.manifest.sources,...snapshot.manifest.fresh_sources,snapshot.manifest.sql,snapshot.manifest.predecessor.manifest.sql])if(sha(readFile(path.join(root,f.path)))!==f.sha256)refuse('source_changed')
      return {archive,sha256:digest,source_sha256:sourceSha,packed_files:verified.files,AST_files:55,AST_edges:119,fresh_sql_assets:34,manifest_verified:true,...offline,parser_bundled:true,pg_runtime_installed:false,pg_runtime_install_verified:false,review_only:true,default_fresh_latest:'pg_v9_050',target_initialized:false,activation_performed:false,dependency_installation_performed:false,production_cutover_allowed:false}
    }finally{ownedCleanup(output,check)}
  }catch(error){if(created){if(path.dirname(archive)!==output||fs.lstatSync(archive).isSymbolicLink())refuse('unsafe_archive_cleanup');fs.unlinkSync(archive)}throw error}
  finally{ownedCleanup(output,stage)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==4||process.argv[2]!=='--output-dir')refuse('explicit_output_required');process.stdout.write(JSON.stringify(await buildDescriptiveOperatorReview(process.argv[3]))+'\n')}
  catch(error){process.stderr.write((error instanceof Error&&error.message.startsWith('DESCRIPTIVE_OPERATOR_REVIEW_REFUSED:')?error.message:'DESCRIPTIVE_OPERATOR_REVIEW_FAILED')+'\n');process.exitCode=1}
}
