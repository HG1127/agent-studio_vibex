// Independent CI source/assets union. Original complete and F05 seal ABIs stay
// unchanged. No target, driver, credential, process or network is opened here.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {assertCompleteProfileCiPermit,completeProfileCiBinding} from './pg18-complete-install-ci-guard.mjs'
import {companionCiPurpose,companionCiF05Purpose,companionCiFinalPathEnabled,companionCiPackageBindings,mergeCompanionCiSourceRecords,companionCiFail as fail} from './pg18-complete-companion-ci-contract.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),sha=b=>createHash('sha256').update(b).digest('hex'),sealed=new WeakSet()
export const companionCiHarnessFiles=Object.freeze([...['contract','stage','fixture','run'].map(n=>'services/pg-api/tests/helpers/pg18-complete-companion-ci-'+n+'.mjs'),'services/pg-api/tests/helpers/pg18-complete-install-ci-guard.mjs','docs/PG18_FULL069_FIVE_COMPANION_CI_BRIDGE.md'])
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v}
const safe=n=>typeof n==='string'&&(companionCiPackageBindings.some(r=>r.path===n)||/^(?:services\/pg-api\/(?:src|tests\/helpers)|shared|db\/postgres|ops|docs)\/[A-Za-z0-9_./-]+$/.test(n))&&n.split('/').every(x=>x&&x!=='.'&&x!=='..')
function raw(base,name,deployment=false){
 if(!safe(name))fail('stage_source_path');let at=base
 for(const part of name.split('/')){const s=fs.lstatSync(at);if(s.isSymbolicLink()||!s.isDirectory()||deployment&&(s.uid!==0||s.gid!==0||(s.mode&0o022)!==0))fail('stage_source_parent');at=path.join(at,part)}
 const s=fs.lstatSync(at);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<1||s.size>16*1024*1024||fs.realpathSync(at)!==at||deployment&&(s.uid!==0||s.gid!==0||(s.mode&0o222)!==0))fail('stage_source_file')
 const b=fs.readFileSync(at),z=fs.lstatSync(at);if(['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode'].some(k=>s[k]!==z[k])||b.includes(0)||!Buffer.from(b.toString('utf8')).equals(b))fail('stage_source_changed');return b
}
// Pure source inspection only; no permit/stage authority or file read is returned.
export async function inspectCompanionCiRelativeImports(name,bytes){
 const ts=await import('typescript');if(ts.version!=='5.9.3')fail('closure_parser');const edges=[]
 const ast=ts.createSourceFile(name,bytes.toString('utf8'),ts.ScriptTarget.Latest,true,name.endsWith('.mjs')||name.endsWith('.js')?ts.ScriptKind.JS:ts.ScriptKind.TS);if(ast.parseDiagnostics.length)fail('closure_syntax')
 const literal=n=>{if(!ts.isStringLiteralLike(n))return;const ref=n.text;if(!ref.startsWith('.'))return;const to=path.posix.normalize(path.posix.join(path.posix.dirname(name),ref));if(!safe(to)||!to.match(/\.(?:mjs|js|ts|mts)$/))fail('closure_relative_path');edges.push({from:name,to})}
 const visit=n=>{if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)literal(n.moduleSpecifier);if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&n.arguments.length===1)literal(n.arguments[0]);if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument))literal(n.argument.literal);ts.forEachChild(n,visit)};visit(ast);return freeze(edges)
}
async function relativeClosure(base,roots,known,deployment,all13){
 const pending=[...roots],seen=new Set(),application=[],harness=[],edges=[]
 while(pending.length){
  const name=pending.pop();if(seen.has(name))continue;if(seen.size>=2048||!safe(name)||!/^.*\.(?:mjs|js|ts|mts)$/.test(name))fail('closure_source');seen.add(name)
  const bytes=raw(base,name,deployment),digest=sha(bytes),old=known.get(name);if(old&&old!==digest)fail('source_union_overlap')
  // Genuine Final/Control snapshots already close their application graphs.
  if(old)continue
  const row={path:name,sha256:digest};(name.startsWith('services/pg-api/tests/helpers/')?harness:application).push(row)
  for(const edge of await inspectCompanionCiRelativeImports(name,bytes)){
   // This single optional import is reached only under the exact all13 purpose.
   if(!all13&&name==='services/pg-api/tests/helpers/pg18-complete-companion-ci-stage.mjs'&&edge.to==='services/pg-api/tests/helpers/pg18-full069-final-path-ci-sources.mjs')continue
   edges.push(edge);pending.push(edge.to)
  }
 }
 const order=(a,b)=>(a.from+'\0'+a.to).localeCompare(b.from+'\0'+b.to,'en');return {application,harness,edges:edges.sort(order)}
}
export function completeCompanionCiStageEnabled(permit){
 assertCompleteProfileCiPermit(permit);const all13=companionCiFinalPathEnabled(process.env.AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE),value=process.env.AGENT_STUDIO_COMPANION_CI_PURPOSE;if(value===undefined){if(all13)fail('new_purpose_required');return false}
 if(value!==companionCiPurpose||process.env.AGENT_STUDIO_PLAN_WORKFLOW_PAIR_CI_PURPOSE!==companionCiF05Purpose)fail('new_purpose_required');return true
}
async function capture(base,complete,deployment=false,permit,stageSourceProof){
 const original=await import(pathToFileURL(base+'/services/pg-api/src/pg18-complete-profile-source.mjs').href)
 if(deployment)original.assertCompleteProfileDeployment(complete,complete.source_sha256);else original.assertCompleteProfileSnapshot(complete,complete.source_sha256)
 const source=await import(pathToFileURL(base+'/services/pg-api/src/pg18-full069-final-sources.mjs').href),snapshot=await source.captureFull069FinalSources();source.assertFull069FinalSources(snapshot,snapshot.source_sha256,{deployment})
 if(snapshot.complete.source_sha256!==complete.source_sha256)fail('source_union_parent')
 const rows=new Map(),add=r=>{if(!safe(r.path)||!/^[a-f0-9]{64}$/.test(r.sha256))fail('source_union_path');const old=rows.get(r.path);if(old&&old.sha256!==r.sha256)fail('source_union_overlap');rows.set(r.path,{path:r.path,sha256:r.sha256})}
 for(const r of snapshot.manifest.sources)add(r)
 let B=null,overlay=null,view=null
 if(companionCiFinalPathEnabled(process.env.AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE)){
  // Relative HOST import deliberately shares the original permit WeakSet.
  // The B helper selects the deployment source module using our private base.
  B=await import('./pg18-full069-final-path-ci-sources.mjs');overlay=await B.captureFinalPathCiSourceOverlay(permit,base,complete,snapshot,{deployment,stageSourceProof});view=B.finalPathCiSourceOverlayView(overlay)
  if(view.manifest.complete_source_sha256!==complete.source_sha256||view.manifest.final_source_sha256!==snapshot.source_sha256)fail('overlay_source_parent')
  for(const r of companionCiPackageBindings)if(sha(raw(base,r.path,deployment))!==r.sha256)fail('overlay_package_binding')
 }
 const known=new Map([...rows.values(),...(view?.manifest.application_additions??[])].map(r=>[r.path,r.sha256])),closure=await relativeClosure(base,[...companionCiHarnessFiles.filter(p=>p.endsWith('.mjs')),...(view?.manifest.harness_files.map(r=>r.path)??[])],known,deployment,!!view)
 const merged=mergeCompanionCiSourceRecords([...rows.values(),...closure.application],[...companionCiHarnessFiles.map(p=>({path:p,sha256:sha(raw(base,p,deployment))})),...closure.harness],view),apps=merged.application_files,harness=merged.harness_files
 const manifest=freeze({format:'complete069_five_companion_ci_sources_v1',complete_source_sha256:complete.source_sha256,final_source_sha256:snapshot.source_sha256,broker_source_sha256:snapshot.companions.source_sha256,plan_workflow_source_sha256:snapshot.planWorkflow.source_sha256,application_files:apps,harness_files:harness,ci_relative_imports:closure.edges,...(view?{final_path_overlay:merged.final_path_overlay}:{})})
 const assert=()=>{if(companionCiFinalPathEnabled(process.env.AGENT_STUDIO_FINAL13_PATH_CI_PURPOSE)!==!!view)fail('overlay_purpose_changed');if(deployment)original.assertCompleteProfileDeployment(complete,complete.source_sha256);else original.assertCompleteProfileSnapshot(complete,complete.source_sha256);source.assertFull069FinalSources(snapshot,snapshot.source_sha256,{deployment});if(overlay){B.assertFinalPathCiSourceOverlay(overlay);for(const r of companionCiPackageBindings)if(sha(raw(base,r.path,deployment))!==r.sha256)fail('overlay_package_binding')}for(const r of [...apps,...harness])if(sha(raw(base,r.path,deployment))!==r.sha256)fail('stage_source_changed')}
 assert();return {manifest,assert,snapshot}
}
export async function collectCompleteCompanionCiStage(permit,complete){
 assertCompleteProfileCiPermit(permit);if(!completeCompanionCiStageEnabled(permit)||completeProfileCiBinding(permit).kind!=='provision')fail('stage_provision_required')
 const s=await capture(root,complete,false,permit),entries=[...s.manifest.application_files,...s.manifest.harness_files].map(r=>({...r,bytes:raw(root,r.path)}));s.assert();return {entries,manifest:Buffer.from(JSON.stringify(s.manifest))}
}
export async function verifyCompleteCompanionCiStage(permit,tree,input,complete,expectedSha,stageSourceProof){
 assertCompleteProfileCiPermit(permit);if(!completeCompanionCiStageEnabled(permit))fail('new_purpose_required');const b=completeProfileCiBinding(permit),prefix='/root/agentstudio-complete-install-input/'+b.run+'-'+b.attempt+'-'
 if(typeof input!=='string'||!input.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(input.slice(prefix.length))||tree!==input+'/tree'||!/^[a-f0-9]{64}$/.test(expectedSha)||b.kind==='fixture'&&input.slice(prefix.length)!==b.nonce)fail('stage_binding')
 if(b.kind==='fixture'&&process.env.AGENT_STUDIO_COMPANION_CI_SOURCE_MANIFEST_SHA256!==expectedSha)fail('independent_stage_manifest_pin')
 const file=input+'/companion-ci-source-manifest.json',s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==0||s.gid!==0||(s.mode&0o7777)!==0o600||s.size<1||s.size>4*1024*1024||fs.realpathSync(file)!==file)fail('stage_manifest_metadata')
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let bytes
 try{const a=fs.fstatSync(fd);for(const key of ['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode'])if(a[key]!==s[key])fail('stage_manifest_changed');bytes=fs.readFileSync(fd);const z=fs.fstatSync(fd),now=fs.lstatSync(file);for(const key of ['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode'])if(a[key]!==z[key]||a[key]!==now[key])fail('stage_manifest_changed')}finally{fs.closeSync(fd)}
 if(sha(bytes)!==expectedSha)fail('stage_manifest_changed')
 const cap=await capture(tree,complete,true,permit,stageSourceProof);if(!bytes.equals(Buffer.from(JSON.stringify(cap.manifest))))fail('stage_manifest_changed')
 const handle=Object.freeze({sourceSha:expectedSha,manifest:cap.manifest,paths:Object.freeze(cap.manifest.application_files.map(r=>r.path)),assert:cap.assert});sealed.add(handle);return handle
}
export function assertCompleteCompanionCiStage(handle){if(!sealed.has(handle))fail('stage_unsealed_reference');handle.assert();return handle}
