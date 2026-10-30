// Parent-owned synthetic stage producer, NOT controller production authority.
// Every effect requires the distinct actual hosted-process CI reference first.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createRequire,isBuiltin} from 'node:module'
import {createHash} from 'node:crypto'
import {workerHeartbeatActivationControlCiDescriptor} from './worker-heartbeat-activation-control-ci-guard.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
const privateStages=new WeakMap()
const lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a'
const packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const parserPins={'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675','package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6','LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47','ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c'}
const childRelative='services/pg-api/tests/helpers/native-company-worker-heartbeats-control-ci-child.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
const fail=code=>{throw Error('telemetry_control_ci_stage_refused:'+code)}
const safe=relative=>typeof relative==='string'&&relative.length<200&&/^[A-Za-z0-9_@./+-]+$/.test(relative)&&!relative.startsWith('/')&&!relative.split('/').some(p=>!p||p==='.'||p==='..')
function read(file,pin){
 const absolute=path.resolve(file),a=fs.lstatSync(absolute)
 if(!a.isFile()||a.isSymbolicLink()||a.size<1||a.size>16*1024*1024||fs.realpathSync(absolute)!==absolute)fail('input_file')
 const fd=fs.openSync(absolute,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK)
 try{
  const bytes=fs.readFileSync(fd),b=fs.fstatSync(fd),c=fs.lstatSync(absolute)
  for(const k of ['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode','nlink'])if(a[k]!==b[k]||a[k]!==c[k])fail('input_changed')
  if(bytes.length!==a.size||bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes)||pin&&sha(bytes)!==pin)fail('input_hash')
  return bytes
 }finally{fs.closeSync(fd)}
}
function ancestors(dir){
 let at=path.parse(dir).root
 for(const p of dir.slice(at.length).split(path.sep).filter(Boolean)){
  at=path.join(at,p)
  if(!fs.existsSync(at))break
  const st=fs.lstatSync(at)
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7022)!==0||fs.realpathSync(at)!==at)fail('ancestor:'+at+':'+st.uid+':'+st.gid+':'+(st.mode&0o7777).toString(8))
 }
}
function makeNew(dir){
 ancestors(path.dirname(dir));if(fs.existsSync(dir))fail('existing_stage')
 fs.mkdirSync(dir,{recursive:false,mode:0o700});fs.chmodSync(dir,0o700)
 const st=fs.lstatSync(dir)
 if(st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o700)fail('private_directory')
}
function directories(base,relative){
 let at=base
 for(const part of relative.split('/').slice(0,-1)){
  at=path.join(at,part)
  if(!fs.existsSync(at))fs.mkdirSync(at,{mode:0o700})
  const st=fs.lstatSync(at)
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o700)fail('output_directory')
 }
}
function write(base,relative,bytes,mode=0o444){
 if(!safe(relative))fail('output_path')
 directories(base,relative)
 const target=path.join(base,relative),fd=fs.openSync(target,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,mode)
 try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 const st=fs.lstatSync(target)
 if(st.nlink!==1||st.uid!==0||st.gid!==0||sha(fs.readFileSync(target))!==sha(bytes))fail('output_integrity')
}
function seal(base){
 const visit=dir=>{
  for(const name of fs.readdirSync(dir)){
   const file=path.join(dir,name),s=fs.lstatSync(file)
   if(s.isSymbolicLink()||s.uid!==0||s.gid!==0)fail('seal_owner')
   if(s.isDirectory())visit(file)
   else if(!s.isFile()||s.nlink!==1||(s.mode&0o7777)!==0o444)fail('seal_file')
  }
  fs.chmodSync(dir,0o555)
 };visit(base)
}
function discoverNative(ts){
 const pending=['services/pg-api/src/native-company-worker-heartbeats.ts','services/pg-api/src/native-auth-repository.mjs',childRelative],files=new Map()
 while(pending.length){
  const relative=pending.pop()
  if(!safe(relative)||! /^(?:services\/pg-api\/(?:src|tests\/helpers)|shared)\/.+\.(?:ts|mts|mjs|js)$/.test(relative))fail('native_source_path')
  if(files.has(relative))continue
  if(files.size>=300)fail('native_source_bounds')
  const bytes=read(path.join(root,relative)),tree=ts.createSourceFile(relative,bytes.toString('utf8'),ts.ScriptTarget.Latest,true,/\.m?js$/.test(relative)?ts.ScriptKind.JS:ts.ScriptKind.TS)
  if(tree.parseDiagnostics.length)fail('native_syntax')
  files.set(relative,bytes)
  const add=node=>{
   if(!ts.isStringLiteralLike(node))fail('native_computed_import')
   const value=node.text
   if(value.startsWith('.'))pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(relative),value)))
   else if(!(value.startsWith('node:')&&isBuiltin(value))&&!['pg','typescript'].includes(value))fail('native_external_import')
  }
  const visit=node=>{
   if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier)add(node.moduleSpecifier)
   if(ts.isImportTypeNode(node)){if(!ts.isLiteralTypeNode(node.argument))fail('native_import_type');add(node.argument.literal)}
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){if(node.arguments.length!==1)fail('native_import_arity');add(node.arguments[0])}
   if(ts.isImportEqualsDeclaration(node))fail('native_import_equals')
   ts.forEachChild(node,visit)
  };visit(tree)
  if(relative.endsWith('.mjs')){const declaration=relative.slice(0,-4)+'.d.mts';if(fs.existsSync(path.join(root,declaration)))pending.push(declaration)}
 }
 return files
}
function dependencies(apiRequire,policy){
 const found=new Map(),pending=[{name:'pg',require:apiRequire}]
 while(pending.length){
  const {name,require}=pending.pop(),expected=policy.packages[name];if(!expected)fail('unreviewed_dependency')
  const entry=fs.realpathSync(require.resolve(name));let dir=path.dirname(entry)
  while(true){const file=path.join(dir,'package.json');if(fs.existsSync(file)&&JSON.parse(read(file)).name===name)break;const next=path.dirname(dir);if(next===dir)fail('dependency_metadata');dir=next}
  dir=fs.realpathSync(dir)
  if(found.has(name)){if(found.get(name)!==dir)fail('ambiguous_dependency');continue}
  const pkg=JSON.parse(read(path.join(dir,'package.json'))),deps={...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies}
  if(name==='pg')delete deps['pg-native']
  if(pkg.name!==name||pkg.version!==expected.version||Object.keys(deps).sort().join('\0')!==[...expected.dependencies].sort().join('\0'))fail('dependency_graph')
  found.set(name,dir);const child=createRequire(path.join(dir,'package.json'))
  for(const dep of expected.dependencies)pending.push({name:dep,require:child})
 }
 if(found.size!==14)fail('dependency_count')
 const payload=new Map()
 for(const[name,dir]of [...found].sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const walk=relative=>{
   for(const nameInDir of fs.readdirSync(path.join(dir,relative)).sort()){
    const next=relative?relative+'/'+nameInDir:nameInDir,file=path.join(dir,next),s=fs.lstatSync(file)
    if(s.isSymbolicLink())fail('dependency_link')
    if(s.isDirectory()){walk(next);continue}
    if(!safe(next)||next.split('/').includes('node_modules')||!s.isFile()||/\.(?:node|wasm|dll|exe|so|dylib|pem|key)$/i.test(next)||!fs.realpathSync(file).startsWith(dir+path.sep))fail('dependency_file')
    payload.set('services/pg-api/node_modules/'+name+'/'+next,read(file))
   }
  };walk('')
 }
 if(payload.size!==138)fail('runtime_inventory_count')
 return payload
}
export async function publishWorkerHeartbeatControlCiStages(proof){
 const ci=workerHeartbeatActivationControlCiDescriptor(proof)
 const suffix=ci.run+'-'+ci.attempt+'-'+ci.nonce.slice(0,16)
 const controlRoot='/var/lib/agentstudio-telemetry-control-ci-'+suffix,nativeRoot='/var/lib/agentstudio-telemetry-native-ci-'+suffix
 const parent='/root/agentstudio-telemetry-control-ci-input',tools=parent+'/'+suffix
 // Fixed host-directory metadata only; no credentials or target information.
 // Hosted images may make /opt writable by their ordinary runner account.
 for(const dir of ['/opt','/var/lib','/root']){const st=fs.lstatSync(dir);process.stdout.write(JSON.stringify({event:'telemetry_control_ci_stage_parent_metadata',path:dir,uid:st.uid,gid:st.gid,mode:(st.mode&0o7777).toString(8),symlink:st.isSymbolicLink()})+'\n')}
 for(const dir of [controlRoot,nativeRoot])makeNew(dir)
 if(!fs.existsSync(parent))makeNew(parent)
 else{ancestors(parent);if((fs.lstatSync(parent).mode&0o7777)!==0o700)fail('private_parent')}
 makeNew(tools)
 const source=await import(pathToFileURL(path.join(root,'services/pg-api/src/worker-heartbeat-activation-control-source.mjs')).href)
 const {workerHeartbeatActivationControlRuntimePolicy:policy}=await import(pathToFileURL(path.join(root,'services/pg-api/src/worker-heartbeat-activation-control-runtime.mjs')).href)
 if(policy.lock_sha256!==lockSha)fail('runtime_lock')
 const snapshot=await source.captureWorkerHeartbeatActivationControlSources()
 const code=new Map(snapshot.manifest.sources.map(f=>[f.path,read(path.join(root,f.path),f.sha256)]))
 if(sha(code.get('services/pg-api/package.json'))!==packageSha||sha(code.get('services/pg-api/pnpm-lock.yaml'))!==lockSha)fail('canonical_api_package')
 const apiRequire=createRequire(path.join(root,'services/pg-api/package.json')),tsEntry=fs.realpathSync(apiRequire.resolve('typescript')),tsRoot=path.dirname(path.dirname(tsEntry))
 if(sha(read(tsEntry))!==parserPins['lib/typescript.js'])fail('parser_resolution')
 const ts=apiRequire('typescript');if(ts.version!=='5.9.3')fail('parser_version')
 const native=discoverNative(ts)
 native.set('services/pg-api/package.json',code.get('services/pg-api/package.json'))
 native.set('services/pg-api/pnpm-lock.yaml',code.get('services/pg-api/pnpm-lock.yaml'))
 const payload=dependencies(apiRequire,policy)
 for(const[p,b]of payload){code.set(p,b);native.set(p,b)}
 for(const[p,pin]of Object.entries(parserPins)){
  const relative='services/pg-api/node_modules/typescript/'+p,bytes=read(path.join(tsRoot,p),pin)
  code.set(relative,bytes);native.set(relative,bytes)
 }
 const runtimeFiles=[...payload].map(([path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
 const runtime={format:policy.format,lock_sha256:lockSha,pg_version:'8.23.1',packages:Object.keys(policy.packages).sort().map(name=>({name,version:policy.packages[name].version})),files:runtimeFiles}
 for(const[p,b]of code)write(controlRoot,p,b)
 for(const[p,b]of native)write(nativeRoot,p,b)
 const sourceBytes=Buffer.from(JSON.stringify(snapshot.manifest)),runtimeBytes=Buffer.from(JSON.stringify(runtime)),nativeBytes=Buffer.from(JSON.stringify({format:'worker_heartbeat_native_ci_files_v1',source_revision:ci.source_revision,files:[...native].map(([path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)}))
 write(tools,'source-manifest.json',sourceBytes,0o600);write(tools,'runtime-manifest.json',runtimeBytes,0o600);write(tools,'native-manifest.json',nativeBytes,0o600)
 seal(controlRoot);seal(nativeRoot)
 // Recapture the actual copied immutable tree, not its working-copy metadata.
 const copied=await import(pathToFileURL(path.join(controlRoot,'services/pg-api/src/worker-heartbeat-activation-control-source.mjs')).href)
 const sealedSnapshot=await copied.captureWorkerHeartbeatActivationControlSources()
 copied.assertWorkerHeartbeatActivationControlSources(sealedSnapshot,snapshot.source_sha256)
 if(sha(sourceBytes)!==sealedSnapshot.source_sha256)fail('copied_source_changed')
 const stage=Object.freeze(Object.create(null)),descriptor=Object.freeze({format:'worker_heartbeat_control_ci_stages_v1',controlRoot,nativeRoot,tools,
  sourceSha:sealedSnapshot.source_sha256,sourceManifestFile:tools+'/source-manifest.json',sourceManifestSha256:sha(sourceBytes),
  runtimeManifestFile:tools+'/runtime-manifest.json',runtimeManifestSha256:sha(runtimeBytes),runtimeFiles:runtimeFiles.length,
  nativeManifestFile:tools+'/native-manifest.json',nativeManifestSha256:sha(nativeBytes),nativeChildPath:path.join(nativeRoot,childRelative),
  nodePath:process.execPath,nonce:ci.nonce,run:ci.run,attempt:ci.attempt})
 privateStages.set(stage,{proof,descriptor})
 return stage
}
export function describeWorkerHeartbeatControlCiStages(proof,stage){
 const ci=workerHeartbeatActivationControlCiDescriptor(proof),s=privateStages.get(stage)
 if(!s||s.proof!==proof||s.descriptor.nonce!==ci.nonce)fail('private_stage_required')
 for(const dir of [s.descriptor.controlRoot,s.descriptor.nativeRoot]){const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0||st.gid!==0||(st.mode&0o7777)!==0o555||fs.realpathSync(dir)!==dir)fail('stage_changed')}
 for(const[file,pin]of [[s.descriptor.sourceManifestFile,s.descriptor.sourceManifestSha256],[s.descriptor.runtimeManifestFile,s.descriptor.runtimeManifestSha256],[s.descriptor.nativeManifestFile,s.descriptor.nativeManifestSha256]])if(sha(read(file))!==pin)fail('manifest_changed')
 return s.descriptor
}
