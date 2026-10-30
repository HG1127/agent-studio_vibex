// Copied/adapted from independently hosted594 runtime publisher; no auto-main import.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {assertCompleteProfileCiPermit,completeProfileCiBinding} from './pg18-complete-install-ci-guard.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
const sourceSha='bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67',lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Error('complete_install_stage_refused:'+code)}
const stages=new WeakSet(),loadedStages=new WeakSet()
const parserPins={'lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675','package.json':'822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6','LICENSE.txt':'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47','ThirdPartyNoticeText.txt':'1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c'}
function privateDirectory(file,create=false){
 if(!file.startsWith('/root/agentstudio-complete-install-')||path.normalize(file)!==file)fail('private_path')
 if(create)fs.mkdirSync(file,{recursive:true,mode:0o700})
 let at='/'
 for(const part of file.split('/').filter(Boolean)){at=path.join(at,part);const s=fs.lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||s.gid!==0||(s.mode&0o7022)!==0){process.stderr.write(JSON.stringify({phase:'private_ancestor',path:at,uid:s.uid,gid:s.gid,mode:s.mode&0o7777})+'\n');fail('private_ancestor')}}
}
function read(file,expected){
 const a=fs.lstatSync(file)
 if(!a.isFile()||a.size<1||a.size>16*1024*1024)fail('input_file')
 const b=fs.readFileSync(file),z=fs.lstatSync(file)
 for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])if(a[k]!==z[k])fail('input_changed')
 if(expected&&sha(b)!==expected||b.length!==a.size||b.includes(0)||!Buffer.from(b.toString('utf8')).equals(b))fail('input_hash_or_encoding')
 return b
}
function write(file,bytes,mode=0o444){
 privateDirectory(path.dirname(file),true)
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW|fs.constants.O_WRONLY,mode)
 try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,mode);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 const s=fs.lstatSync(file);if(s.uid!==0||s.gid!==0||s.nlink!==1||sha(fs.readFileSync(file))!==sha(bytes))fail('output_integrity')
}
const posix=relative=>typeof relative==='string'&&/^[a-zA-Z0-9_@./+-]+$/.test(relative)&&!relative.startsWith('/')&&!relative.split('/').some(s=>!s||s==='.'||s==='..')
export async function buildCompleteProfileStage(permit){
 assertCompleteProfileCiPermit(permit);const proof=completeProfileCiBinding(permit)
 if(proof.kind!=='provision')fail('provision_permit_required')
 // The guard precedes every source capture, read, directory, Docker call and
 // runtime import. Only offline capture/policy exports are used on this host.
 const source=await import(pathToFileURL(path.join(root,'services/pg-api/src/agent-descriptive-patch-operator-source.mjs')).href)
 const {descriptivePatchOperatorRuntimePolicy:policy}=await import(pathToFileURL(path.join(root,'services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs')).href)
 const snapshot=await source.captureDescriptivePatchOperatorSources()
 source.assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)
 if(policy.lock_sha256!==lockSha||snapshot.manifest.predecessor.source_sha256!=='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'||snapshot.manifest.default_fresh_latest!=='pg_v9_050')fail('source_binding')
 const completeSource=await import(pathToFileURL(path.join(root,'services/pg-api/src/pg18-complete-profile-source.mjs')).href),complete=await completeSource.captureCompleteProfileSources()
 if(complete.manifest.profile!=='complete069'||complete.manifest.latest_migration!=='pg_v9_069'||complete.manifest.sql_sources.length!==53)fail('complete_source_binding')
 completeSource.assertCompleteProfileSnapshot(complete,complete.source_sha256)
 const f05Stage=await import('./pg18-complete-plan-workflow-ci-stage.mjs'),f05=f05Stage.complete069PlanWorkflowCiStageEnabled(permit)?await f05Stage.collectComplete069PlanWorkflowCiStage(permit,complete):null
 const companionStage=await import('./pg18-complete-companion-ci-stage.mjs'),companion=companionStage.completeCompanionCiStageEnabled(permit)?await companionStage.collectCompleteCompanionCiStage(permit,complete):null
 const nonce=randomBytes(32).toString('hex'),label=proof.run+'-'+proof.attempt+'-'+nonce
 // Host staging uses a new private root directory. The container has its own
 // /opt ancestry and receives only the two readonly, reviewed bind mounts.
 const input='/root/agentstudio-complete-install-input/'+label,harness='/root/agentstudio-complete-install-harness/'+label,tools='/root/agentstudio-complete-install-tools/'+label
 for(const dir of [input,harness,tools]){if(fs.existsSync(dir))fail('existing_stage');privateDirectory(dir,true)}
 const tree=input+'/tree',records=new Map()
 const add=(relative,bytes,expected)=>{
  if(!posix(relative)||expected&&sha(bytes)!==expected)fail('source_record')
  const old=records.get(relative);if(old){if(old.sha256!==sha(bytes))fail('duplicate_record');return}
  records.set(relative,{path:relative,sha256:sha(bytes),bytes:bytes.length});write(tree+'/'+relative,bytes)
 }
 for(const r of [...snapshot.manifest.sources,...snapshot.manifest.fresh_sources,snapshot.manifest.sql,snapshot.manifest.predecessor.manifest.sql,...complete.manifest.sources,...complete.manifest.sql_sources])add(r.path,read(path.join(root,r.path),r.sha256),r.sha256)
 if(f05)for(const entry of f05.entries)add(entry.path,entry.bytes,entry.sha256)
 if(companion)for(const entry of companion.entries)add(entry.path,entry.bytes,entry.sha256)
 add('services/pg-api/package.json',read(path.join(root,'services/pg-api/package.json'),packageSha),packageSha)
 add('services/pg-api/pnpm-lock.yaml',read(path.join(root,'services/pg-api/pnpm-lock.yaml'),lockSha),lockSha)
 const apiRequire=createRequire(path.join(root,'services/pg-api/package.json'))
 const tsEntry=apiRequire.resolve('typescript');let tsRoot=path.dirname(tsEntry)
 while(!fs.existsSync(path.join(tsRoot,'package.json'))){const parent=path.dirname(tsRoot);if(parent===tsRoot)fail('parser_metadata');tsRoot=parent}
 for(const[relative,pin]of Object.entries(parserPins))add('services/pg-api/node_modules/typescript/'+relative,read(path.join(tsRoot,relative),pin),pin)
 const packages=new Map(),pending=[{name:'pg',require:apiRequire}]
 while(pending.length){
  const {name,require}=pending.pop(),p=policy.packages[name];if(!p)fail('unreviewed_dependency')
  const entry=fs.realpathSync(require.resolve(name));let dir=path.dirname(entry)
  while(true){const candidate=path.join(dir,'package.json');if(fs.existsSync(candidate)&&JSON.parse(read(candidate)).name===name)break;const parent=path.dirname(dir);if(parent===dir)fail('dependency_metadata');dir=parent}
  dir=fs.realpathSync(dir)
  const old=packages.get(name);if(old){if(old!==dir)fail('ambiguous_dependency');continue}
  const pkg=JSON.parse(read(path.join(dir,'package.json')))
  if(pkg.name!==name||pkg.version!==p.version)fail('dependency_version')
  const deps={...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies};if(name==='pg')delete deps['pg-native']
  if(Object.keys(deps).sort().join('\0')!==[...p.dependencies].sort().join('\0'))fail('dependency_graph')
  packages.set(name,dir);const child=createRequire(path.join(dir,'package.json'))
  for(const dependency of p.dependencies)pending.push({name:dependency,require:child})
 }
 if(packages.size!==14)fail('dependency_count')
 const runtimeFiles=[]
 for(const[name,dir]of [...packages].sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const walk=relative=>{
   for(const item of fs.readdirSync(path.join(dir,relative)).sort()){
    const next=relative?relative+'/'+item:item,file=path.join(dir,next),st=fs.lstatSync(file)
    if(st.isSymbolicLink())fail('dependency_link')
    if(st.isDirectory()){walk(next);continue}
    if(!st.isFile()||!posix(next)||next.split('/').includes('node_modules')||/\.(?:node|wasm|dll|exe|so|dylib|pem|key)$/i.test(next)||!fs.realpathSync(file).startsWith(dir+path.sep))fail('dependency_file')
    const bytes=read(file),target='services/pg-api/node_modules/'+name+'/'+next
    add(target,bytes);runtimeFiles.push(records.get(target))
   }
  };walk('')
 }
 runtimeFiles.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
 const manifest={format:policy.format,lock_sha256:lockSha,pg_version:'8.23.1',packages:Object.keys(policy.packages).sort().map(name=>({name,version:policy.packages[name].version})),files:runtimeFiles}
 const sourceBytes=Buffer.from(JSON.stringify(snapshot.manifest)),runtimeBytes=Buffer.from(JSON.stringify(manifest))
 if(sha(sourceBytes)!==sourceSha)fail('source_manifest')
 write(input+'/source-manifest.json',sourceBytes,0o600);write(input+'/runtime-manifest.json',runtimeBytes,0o600)
 if(f05)write(input+'/plan-workflow-source-manifest.json',f05.manifest,0o600)
 if(companion)write(input+'/companion-ci-source-manifest.json',companion.manifest,0o600)
 const seal=dir=>{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),st=fs.lstatSync(file);if(st.isSymbolicLink())fail('stage_link');if(st.isDirectory())seal(file);else if(!st.isFile()||st.nlink!==1||(st.mode&0o7777)!==0o444)fail('stage_file')}fs.chmodSync(dir,0o555)}
 seal(tree)
 const result=Object.freeze({input,harness,tools,nonce,profileSha:complete.source_sha256,sourceManifestSha:sha(sourceBytes),runtimeManifestSha:sha(runtimeBytes),runtimeFiles:runtimeFiles.length,...(companion?{companionManifestSha:sha(companion.manifest)}:{})});stages.add(result);return result
}
export function completeProfileStageDescriptor(permit){
 const b=completeProfileCiBinding(permit);if(b.kind!=='fixture')fail('fixture_permit_required')
 return Object.freeze({input:'/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'+b.nonce,nonce:b.nonce,profileSha:b.profileSha,sourceManifestSha:b.sourceManifestSha,runtimeManifestSha:b.runtimeManifestSha})
}
export async function loadVerifiedCompleteProfileStage(permit,stage){
 const b=completeProfileCiBinding(permit)
 if(b.kind==='provision'?!stages.has(stage):stage.input!=='/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'+b.nonce||stage.nonce!==b.nonce||stage.sourceManifestSha!==b.sourceManifestSha||stage.runtimeManifestSha!==b.runtimeManifestSha||stage.profileSha!==b.profileSha)fail('stage_origin')
 privateDirectory(stage.input)
 const tree=stage.input+'/tree';let allowedSources
 const from=file=>{if(typeof file!=='string'||!posix(file)||(allowedSources?!allowedSources.has(file):file!=='services/pg-api/src/agent-descriptive-patch-operator-source.mjs'))fail('sealed_source_path');return import(pathToFileURL(tree+'/'+file).href)}
 const source=await from('services/pg-api/src/agent-descriptive-patch-operator-source.mjs'),snapshot=await source.captureDescriptivePatchOperatorSources()
 allowedSources=new Set(snapshot.manifest.sources.map(file=>file.path))
 source.assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)
 if(snapshot.manifest.sources.length!==55||snapshot.manifest.imports.length!==119||stage.sourceManifestSha!==sourceSha||sha(read(stage.input+'/source-manifest.json',sourceSha))!==sourceSha)fail('source_manifest')
 read(tree+'/services/pg-api/package.json',packageSha);read(tree+'/services/pg-api/pnpm-lock.yaml',lockSha)
 const runtime=await from('services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs')
 const capability=runtime.verifyDescriptivePatchOperatorRuntime(snapshot,sourceSha,{manifestFile:stage.input+'/runtime-manifest.json',manifestSha256:stage.runtimeManifestSha,lockSha256:lockSha})
 const handle=runtime.loadDescriptivePatchOperatorPg(capability);runtime.assertDescriptivePatchOperatorRuntime(capability)
 const completeSource=await import(pathToFileURL(tree+'/services/pg-api/src/pg18-complete-profile-source.mjs').href),complete=await completeSource.captureCompleteProfileSources()
 completeSource.assertCompleteProfileDeployment(complete,stage.profileSha)
 const f05Stage=await import('./pg18-complete-plan-workflow-ci-stage.mjs'),f05=f05Stage.complete069PlanWorkflowCiStageEnabled(permit)?await f05Stage.verifyComplete069PlanWorkflowCiStage(permit,tree,stage.input,complete,sha(read(stage.input+'/plan-workflow-source-manifest.json'))):null
 const companionStage=await import('./pg18-complete-companion-ci-stage.mjs'),companion=companionStage.completeCompanionCiStageEnabled(permit)?await companionStage.verifyCompleteCompanionCiStage(permit,tree,stage.input,complete,b.kind==='provision'?stage.companionManifestSha:process.env.AGENT_STUDIO_COMPANION_CI_SOURCE_MANIFEST_SHA256):null
 allowedSources=new Set([...allowedSources,...complete.manifest.sources.map(f=>f.path),...(f05?f05.paths:[]),...(companion?companion.paths:[])])
 const loaded=Object.freeze({Pool:handle.Pool,from,tree,snapshot,runtime,complete,profileSha:stage.profileSha,stageInput:stage.input,stageNonce:stage.nonce,planWorkflow:f05,companionCi:companion,assertRuntime:()=>{runtime.assertDescriptivePatchOperatorRuntime(capability);completeSource.assertCompleteProfileDeployment(complete,stage.profileSha);f05?.assert();companion?.assert()}});loadedStages.add(loaded);return loaded
}
export function assertVerifiedCompleteProfileStage(loaded){if(!loadedStages.has(loaded))fail('verified_stage_reference_required');loaded.assertRuntime()}
