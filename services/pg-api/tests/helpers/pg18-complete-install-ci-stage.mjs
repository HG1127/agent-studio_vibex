// Copied/adapted from independently hosted594 runtime publisher; no auto-main import.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {isNativeError} from 'node:util/types'
import {assertCompleteProfileCiPermit,completeProfileCiBinding} from './pg18-complete-install-ci-guard.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
const sourceSha='bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67',lockSha='eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',packageSha='90488a84c79a53a83efea6440062941f08668765f76b7effd97bf6a33e4b9d58'
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Error('complete_install_stage_refused:'+code)}
const stages=new WeakSet(),loadedStages=new WeakSet(),sourceStageOrigins=new WeakMap(),stageSourceProofs=new WeakMap()
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
 const result=Object.freeze({input,harness,tools,nonce,profileSha:complete.source_sha256,sourceManifestSha:sha(sourceBytes),runtimeManifestSha:sha(runtimeBytes),runtimeFiles:runtimeFiles.length,...(companion?{companionManifestSha:sha(companion.manifest)}:{})});stages.add(result);sourceStageOrigins.set(result,permit);return result
}
export function completeProfileStageDescriptor(permit){
 const b=completeProfileCiBinding(permit);if(b.kind!=='fixture')fail('fixture_permit_required')
 const result=Object.freeze({input:'/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'+b.nonce,nonce:b.nonce,profileSha:b.profileSha,sourceManifestSha:b.sourceManifestSha,runtimeManifestSha:b.runtimeManifestSha});sourceStageOrigins.set(result,permit);return result
}
const completeStageFailurePhases=new Set(["stage_origin","private_input","operator_source_capture","operator_source_verify","operator_manifests","operator_runtime_import","operator_runtime_verify","operator_runtime_load","complete_source_capture","complete_source_verify","F05_source_verify","source_proof_prepare","companion_source_verify","loaded_publish"]),completeStageKnownRefusals=new Set(["complete_companion_ci_actual_report","complete_companion_ci_arguments","complete_companion_ci_closure_parser","complete_companion_ci_closure_relative_path","complete_companion_ci_closure_source","complete_companion_ci_closure_syntax","complete_companion_ci_entry","complete_companion_ci_final13_purpose","complete_companion_ci_independent_stage_manifest_pin","complete_companion_ci_new_purpose_required","complete_companion_ci_overlay_application","complete_companion_ci_overlay_binding","complete_companion_ci_overlay_harness","complete_companion_ci_overlay_overlap","complete_companion_ci_overlay_package_binding","complete_companion_ci_overlay_purpose_changed","complete_companion_ci_overlay_record","complete_companion_ci_overlay_source_parent","complete_companion_ci_source_union_overlap","complete_companion_ci_source_union_parent","complete_companion_ci_source_union_path","complete_companion_ci_stage_binding","complete_companion_ci_stage_manifest_changed","complete_companion_ci_stage_manifest_metadata","complete_companion_ci_stage_provision_required","complete_companion_ci_stage_source_changed","complete_companion_ci_stage_source_file","complete_companion_ci_stage_source_parent","complete_companion_ci_stage_source_path","complete_companion_ci_stage_unsealed_reference","complete_install_stage_refused:ambiguous_dependency","complete_install_stage_refused:complete_source_binding","complete_install_stage_refused:dependency_count","complete_install_stage_refused:dependency_file","complete_install_stage_refused:dependency_graph","complete_install_stage_refused:dependency_link","complete_install_stage_refused:dependency_metadata","complete_install_stage_refused:dependency_version","complete_install_stage_refused:duplicate_record","complete_install_stage_refused:existing_stage","complete_install_stage_refused:fixture_permit_required","complete_install_stage_refused:input_changed","complete_install_stage_refused:input_file","complete_install_stage_refused:input_hash_or_encoding","complete_install_stage_refused:output_integrity","complete_install_stage_refused:parser_metadata","complete_install_stage_refused:private_ancestor","complete_install_stage_refused:private_path","complete_install_stage_refused:provision_permit_required","complete_install_stage_refused:sealed_source_path","complete_install_stage_refused:source_binding","complete_install_stage_refused:source_manifest","complete_install_stage_refused:source_proof_binding","complete_install_stage_refused:source_proof_origin","complete_install_stage_refused:source_proof_reference","complete_install_stage_refused:source_record","complete_install_stage_refused:stage_file","complete_install_stage_refused:stage_link","complete_install_stage_refused:stage_origin","complete_install_stage_refused:unreviewed_dependency","complete_install_stage_refused:verified_stage_reference_required","full069_final_path_ci_arguments","full069_final_path_ci_new_purpose_required","full069_final_path_ci_original_30s_progress","full069_final_path_ci_permit_binding","full069_final_path_ci_permit_target","full069_final_path_ci_permit_time","full069_final_path_ci_report","full069_final_path_ci_source_changed","full069_final_path_ci_source_file","full069_final_path_ci_source_overlap","full069_final_path_ci_source_parent","full069_final_path_ci_source_path","full069_final_path_ci_source_root","full069_final_path_ci_untrusted_source_overlay"]),completeStageNodeCodes=new Set(['ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_UNSUPPORTED_DIR_IMPORT','ERR_REQUIRE_ESM','ERR_INVALID_ARG_TYPE','ENOENT','EACCES','EPERM','EIO','ELOOP','EMFILE','ENFILE','ENOSPC','ETIMEDOUT','ECONNREFUSED','ECONNRESET','EPIPE']),completeStageErrorClasses=new Map([[Error.prototype,'Error'],[TypeError.prototype,'TypeError'],[RangeError.prototype,'RangeError'],[SyntaxError.prototype,'SyntaxError'],[ReferenceError.prototype,'ReferenceError'],[EvalError.prototype,'EvalError'],[URIError.prototype,'URIError']])
// Closed observation DATA only. No caller error message/value is returned.
export function completeProfileStageFailureData(phase,error){if(!completeStageFailurePhases.has(phase))return null;let errorClass=null,errorCode=null,refusalCode=null;try{if(isNativeError(error)){errorClass=completeStageErrorClasses.get(Object.getPrototypeOf(error))??null;if(errorClass){const own=k=>{const d=Object.getOwnPropertyDescriptor(error,k);return d&&Object.hasOwn(d,'value')?d.value:null},message=own('message'),code=own('code');if(typeof message==='string'&&completeStageKnownRefusals.has(message))refusalCode=message;if(typeof code==='string'&&completeStageNodeCodes.has(code))errorCode=code}}}catch{errorClass=null;errorCode=null;refusalCode=null}return Object.freeze({event:'complete069_ci_verified_stage_failure',phase,refusal_code:refusalCode,error_class:errorClass,error_code:errorCode,observed_data_only:true,runtime_authorization:false,qualifies_run:false,production_GO:false})}
export async function loadVerifiedCompleteProfileStage(permit,stage){
 let failurePhase='stage_origin'
 try{
 const b=completeProfileCiBinding(permit)
 if(b.kind==='provision'?!stages.has(stage):stage.input!=='/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'+b.nonce||stage.nonce!==b.nonce||stage.sourceManifestSha!==b.sourceManifestSha||stage.runtimeManifestSha!==b.runtimeManifestSha||stage.profileSha!==b.profileSha)fail('stage_origin')
 failurePhase='private_input';privateDirectory(stage.input)
 const tree=stage.input+'/tree';let allowedSources
 const from=file=>{if(typeof file!=='string'||!posix(file)||(allowedSources?!allowedSources.has(file):file!=='services/pg-api/src/agent-descriptive-patch-operator-source.mjs'))fail('sealed_source_path');return import(pathToFileURL(tree+'/'+file).href)}
 failurePhase='operator_source_capture';const source=await from('services/pg-api/src/agent-descriptive-patch-operator-source.mjs'),snapshot=await source.captureDescriptivePatchOperatorSources()
 allowedSources=new Set(snapshot.manifest.sources.map(file=>file.path))
 failurePhase='operator_source_verify';source.assertDescriptivePatchOperatorSnapshot(snapshot,sourceSha)
 failurePhase='operator_manifests';if(snapshot.manifest.sources.length!==55||snapshot.manifest.imports.length!==119||stage.sourceManifestSha!==sourceSha||sha(read(stage.input+'/source-manifest.json',sourceSha))!==sourceSha)fail('source_manifest')
 read(tree+'/services/pg-api/package.json',packageSha);read(tree+'/services/pg-api/pnpm-lock.yaml',lockSha)
 failurePhase='operator_runtime_import';const runtime=await from('services/pg-api/src/agent-descriptive-patch-operator-runtime.mjs')
 failurePhase='operator_runtime_verify';const capability=runtime.verifyDescriptivePatchOperatorRuntime(snapshot,sourceSha,{manifestFile:stage.input+'/runtime-manifest.json',manifestSha256:stage.runtimeManifestSha,lockSha256:lockSha})
 failurePhase='operator_runtime_load';const handle=runtime.loadDescriptivePatchOperatorPg(capability);runtime.assertDescriptivePatchOperatorRuntime(capability)
 failurePhase='complete_source_capture';const completeSource=await import(pathToFileURL(tree+'/services/pg-api/src/pg18-complete-profile-source.mjs').href),complete=await completeSource.captureCompleteProfileSources()
 failurePhase='complete_source_verify';completeSource.assertCompleteProfileDeployment(complete,stage.profileSha)
 failurePhase='F05_source_verify';const f05Stage=await import('./pg18-complete-plan-workflow-ci-stage.mjs'),f05=f05Stage.complete069PlanWorkflowCiStageEnabled(permit)?await f05Stage.verifyComplete069PlanWorkflowCiStage(permit,tree,stage.input,complete,sha(read(stage.input+'/plan-workflow-source-manifest.json'))):null
 failurePhase='source_proof_prepare';const stageSourceProof=Object.freeze(Object.create(null));stageSourceProofs.set(stageSourceProof,{permit,stage,complete,tree,input:stage.input,nonce:stage.nonce,profileSha:stage.profileSha,kind:b.kind,run:b.run,attempt:b.attempt,assert:()=>{privateDirectory(stage.input);runtime.assertDescriptivePatchOperatorRuntime(capability);completeSource.assertCompleteProfileDeployment(complete,stage.profileSha);f05?.assert()}})
 failurePhase='companion_source_verify';const companionStage=await import('./pg18-complete-companion-ci-stage.mjs'),companion=companionStage.completeCompanionCiStageEnabled(permit)?await companionStage.verifyCompleteCompanionCiStage(permit,tree,stage.input,complete,b.kind==='provision'?stage.companionManifestSha:process.env.AGENT_STUDIO_COMPANION_CI_SOURCE_MANIFEST_SHA256,stageSourceProof):null
 failurePhase='loaded_publish';allowedSources=new Set([...allowedSources,...complete.manifest.sources.map(f=>f.path),...(f05?f05.paths:[]),...(companion?companion.paths:[])])
 const loaded=Object.freeze({Pool:handle.Pool,from,tree,snapshot,runtime,complete,profileSha:stage.profileSha,stageInput:stage.input,stageNonce:stage.nonce,planWorkflow:f05,companionCi:companion,assertRuntime:()=>{runtime.assertDescriptivePatchOperatorRuntime(capability);completeSource.assertCompleteProfileDeployment(complete,stage.profileSha);f05?.assert();companion?.assert()}});loadedStages.add(loaded);return loaded
 }catch(error){try{const b=completeProfileCiBinding(permit);if(b.kind==='provision'&&b.run===process.env.GITHUB_RUN_ID&&b.attempt===process.env.GITHUB_RUN_ATTEMPT&&process.platform==='linux'&&process.getuid?.()===0&&process.getgid?.()===0&&process.argv.length===3&&path.resolve(process.argv[1])===path.join(root,'ops/pg18-complete-service-ci.mjs')&&process.argv[2]==='--run'&&process.env.AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE==='YES_DISPOSABLE_FULL069_FINAL14_ALL13_PATHS_ONLY'&&process.env.AGENT_STUDIO_COMPANION_CI_PURPOSE==='YES_DISPOSABLE_FULL069_FIVE_COMPANIONS_ONLY'&&process.env.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE==='YES_DISPOSABLE_FULL069_FIXED_F05_PAIR_ONLY'){const data=completeProfileStageFailureData(failurePhase,error);if(data)fs.writeSync(2,JSON.stringify(data)+'\n')}}catch{}throw error}
}
function sameCompleteProfileStageSourceClaim(s,permit,base,complete,b,originPermit){
 return !!s&&originPermit===permit&&s.permit===permit&&s.complete===complete&&s.tree===base&&s.input===s.stage.input&&s.nonce===s.stage.nonce&&s.profileSha===s.stage.profileSha&&s.tree===s.input+'/tree'&&s.kind===b.kind&&s.run===b.run&&s.attempt===b.attempt&&/^[a-f0-9]{64}$/.test(s.nonce)&&s.input==='/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'+s.nonce&&(b.kind==='provision'||b.kind==='fixture'&&b.nonce===s.nonce&&b.profileSha===s.profileSha&&b.sourceManifestSha===s.stage.sourceManifestSha&&b.runtimeManifestSha===s.stage.runtimeManifestSha)
}
// Source-read scope only: issued inside the original verified load path. This
// is not a loaded Stage, SQL/Pool capability or caller-supplied path approval.
export function assertCompleteProfileStageSourceProof(proof,permit,base,complete){const s=stageSourceProofs.get(proof);if(!s)fail('source_proof_reference');const b=completeProfileCiBinding(permit);if(!sameCompleteProfileStageSourceClaim(s,permit,base,complete,b,sourceStageOrigins.get(s.stage)))fail('source_proof_binding');if(b.kind==='provision'&&!stages.has(s.stage))fail('source_proof_origin');s.assert();return true}
export function assertVerifiedCompleteProfileStage(loaded){if(!loadedStages.has(loaded))fail('verified_stage_reference_required');loaded.assertRuntime()}
