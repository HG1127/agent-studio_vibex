// Independent SOURCE/ASSET review closure. No role provisioning, application
// CLI import, secret/TLS read, DB connection, installation or service launch.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {isBuiltin} from 'node:module'
import {createHash} from 'node:crypto'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot,assertCompleteProfileDeployment} from './pg18-complete-profile-source.mjs'
import {liveEntries,liveLimits} from './pg18-full069-worker-live-contract.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),snapshots=new WeakSet(),sha=b=>createHash('sha256').update(b).digest('hex'),fail=c=>{throw Error('complete069_companion_'+c)}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v},hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export const companionServices=freeze([
 {id:'bound_broker',entry:'services/pg-api/src/bound-dispatch-server.ts',preflight_args:['--preflight'],serve_args:['--serve'],unit:'agentstudio-pg18-dispatch.service',template:'ops/templates/agentstudio-pg18-dispatch.service.example',origin:'https://127.0.0.1:7453',credential_kind:'dispatch',credential_directory:'/run/credentials/agentstudio-pg18-dispatch.service',credential_leaves:['api.secret','identity.secret','broker.secret','model-encryption.secret','dispatch-ca.pem','dispatch-server.pem','dispatch-server.key'],database_logins:['agentstudio_stage_login','agentstudio_bound_dispatch_login','agentstudio_model_broker_login'],review_gate:'AGENT_STUDIO_PG_BOUND_DISPATCH_REVIEWED',client_fingerprint:'AGENT_STUDIO_PG_BOUND_DISPATCH_CLIENT_FINGERPRINT',original_auditors:['verifyBoundDispatchRole'],preflight_loads_encryption_key:true,preflight_constructs_provider:false},
 {id:'knowledge_broker',entry:'services/pg-api/src/knowledge-index-service.ts',preflight_args:['--preflight','broker'],serve_args:['--serve','broker'],unit:'agentstudio-pg18-knowledge-index-broker.service',template:'ops/templates/agentstudio-pg18-knowledge-index-broker.service.example',origin:'https://127.0.0.1:7455',credential_kind:'knowledge-index-broker',credential_directory:'/run/credentials/agentstudio-pg18-knowledge-index-broker.service',credential_leaves:['index.secret','broker.secret','model-encryption.secret','dispatch-ca.pem','dispatch-server.pem','dispatch-server.key'],database_logins:['agentstudio_knowledge_index_broker_login','agentstudio_model_broker_login'],review_gate:'AGENT_STUDIO_PG_KNOWLEDGE_INDEX_REVIEWED',client_fingerprint:'AGENT_STUDIO_PG_KNOWLEDGE_INDEX_CLIENT_FINGERPRINT',original_auditors:['verifyPgRuntimeTarget','verifyKnowledgeIndexLogin','verifyBoundDispatchRole'],preflight_loads_encryption_key:true,preflight_constructs_provider:false},
])
export const companionReviewAssets=Object.freeze([...companionServices.map(v=>v.template),'docs/PG18_COMPLETE_069_BROKER_COMPANIONS_REVIEW.md','ops/build-pg18-complete069-companion-review-bundle.mjs','ops/build-pg18-complete069-review-bundle.mjs'])
const self='services/pg-api/src/pg18-complete-companion-sources.mjs',allowedSource=n=>typeof n==='string'&&/^(?:services\/pg-api\/src|shared)\/[A-Za-z0-9_./-]+\.(?:ts|mts|mjs|js)$/.test(n)&&n.split('/').every(p=>p&&p!=='.'&&p!=='..')
function bytes(relative){
 if(!allowedSource(relative)&&!companionReviewAssets.includes(relative))fail('source_path')
 let at=root
 for(const part of relative.split('/')){if(fs.lstatSync(at).isSymbolicLink())fail('source_path');at=path.join(at,part)}
 const a=fs.lstatSync(at);if(a.isSymbolicLink()||!a.isFile()||a.nlink!==1||a.size<1||a.size>16*1024*1024||fs.realpathSync(at)!==at)fail('source_file')
 const raw=fs.readFileSync(at),z=fs.lstatSync(at);if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>a[k]!==z[k])||raw.includes(0)||raw.toString('utf8').startsWith('\uFEFF')||!Buffer.from(raw.toString('utf8')).equals(raw))fail('source_changed')
 return raw
}
function validateTemplates(){
 for(const service of companionServices){
  const text=bytes(service.template).toString('utf8'),lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')),get=k=>lines.filter(s=>s.startsWith(k+'=')).map(s=>s.slice(k.length+1))
  if(lines.includes('[Install]')||get('Type').join()!=='oneshot'||get('Restart').join()!=='no'||get('ExecStart').length!==1||get('ExecStart')[0]!=='/opt/agentstudio-node24/bin/node --experimental-strip-types '+(service.id==='bound_broker'?'/opt/agentstudio-pg18-native-api-v2/':'/opt/agentstudio-pg18-api-preflight-v1/')+service.entry+' '+service.preflight_args.join(' ')||lines.some(s=>/^Exec(?:StartPre|StartPost|Stop|Reload)=/.test(s)))fail('template_abi')
  const leaves=get('LoadCredential').map(v=>v.split(':')[0]).sort()
  if(JSON.stringify(leaves)!==JSON.stringify([...service.credential_leaves].sort())||!get('Environment').includes(service.review_gate+'=true')||!get('Environment').includes(service.client_fingerprint+'=REPLACE_WITH_REVIEWED_'+(service.id==='bound_broker'?'WORKER':'INDEX_WORKER')+'_SHA256'))fail('template_abi')
 }
}
export async function captureComplete069CompanionSources(){
 const complete=await captureCompleteProfileSources(),ts=await import('typescript');if(ts.version!=='5.9.3')fail('parser')
 const sources=new Map(complete.manifest.sources.map(x=>[x.path,{...x}])),edges=new Map(complete.manifest.imports.map(x=>[x.from+'\0'+x.to,{...x}])),externals=new Set(complete.manifest.externals),pending=[self,...companionServices.map(v=>v.entry)],seen=new Set()
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);if(!allowedSource(file))fail('source_path')
  const raw=bytes(file),tree=ts.createSourceFile(file,raw.toString('utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS);if(tree.parseDiagnostics.length)fail('source_parse');sources.set(file,{path:file,sha256:sha(raw)})
  const add=n=>{if(!ts.isStringLiteralLike(n))fail('source_dynamic_import');const spec=n.text;if(spec.startsWith('.')){const to=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));if(!allowedSource(to))fail('source_path');edges.set(file+'\0'+to,{from:file,to});pending.push(to)}else if(spec.startsWith('node:')&&isBuiltin(spec)||['pg','typescript'].includes(spec)||file==='services/pg-api/src/document-parser.ts'&&['jszip','pdfjs-dist/legacy/build/pdf.mjs','mammoth'].includes(spec))externals.add(spec);else fail('source_external')}
  const visit=n=>{if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)add(n.moduleSpecifier);if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')){if(n.arguments.length!==1)fail('source_dynamic_import');add(n.arguments[0])}if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument))add(n.argument.literal);ts.forEachChild(n,visit)};visit(tree)
 }
 validateTemplates()
 const workerKinds=new Set(liveEntries.flatMap(v=>v.kinds));if(liveEntries.length!==7||workerKinds.size!==8||liveLimits.minimumMs!==86400000||companionServices.some(s=>liveEntries.some(w=>'services/pg-api/src/'+w.file===s.entry&&JSON.stringify(w.args)===JSON.stringify(s.serve_args))))fail('qualification_scope')
 const manifest=freeze({format:'complete069_broker_companion_sources_v1',profile:'complete069',complete_source_sha256:complete.source_sha256,roots:[self,...companionServices.map(v=>v.entry)],services:companionServices,sources:[...sources.values()].sort((a,b)=>a.path.localeCompare(b.path,'en')),imports:[...edges.values()].sort((a,b)=>(a.from+'\0'+a.to).localeCompare(b.from+'\0'+b.to,'en')),externals:[...externals].sort(),assets:companionReviewAssets.map(p=>({path:p,sha256:sha(bytes(p))})),worker_qualification:{source:'services/pg-api/src/pg18-full069-worker-live-contract.mjs',entries:liveEntries.map(v=>({id:v.id,file:v.file,args:v.args,kinds:v.kinds})),entry_count:liveEntries.length,kind_count:workerKinds.size,minimum_ms:liveLimits.minimumMs,brokers_started_by_seven_entries:false},source_import_closure_only:true,business_dependency_runtime_bundled:false,credential_or_tls_material_bundled:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false})
 const snapshot=Object.freeze({manifest,source_sha256:sha(JSON.stringify(manifest)),complete});snapshots.add(snapshot);assertComplete069CompanionSources(snapshot,snapshot.source_sha256);return snapshot
}
export function assertComplete069CompanionSources(snapshot,expected,{deployment=false}={}){
 if(!snapshots.has(snapshot)||!hex(expected)||snapshot.source_sha256!==expected||sha(JSON.stringify(snapshot.manifest))!==expected)fail('source_binding')
 if(deployment)assertCompleteProfileDeployment(snapshot.complete,snapshot.complete.source_sha256);else assertCompleteProfileSnapshot(snapshot.complete,snapshot.complete.source_sha256)
 for(const entry of [...snapshot.manifest.sources,...snapshot.manifest.assets]){if(sha(bytes(entry.path))!==entry.sha256)fail('source_changed');if(deployment){const s=fs.lstatSync(path.join(root,entry.path));if(s.uid!==0||s.gid!==0||(s.mode&0o222)!==0)fail('deployment_permissions')}}
 return true
}
export function complete069CompanionSourcePlan(snapshot){
 assertComplete069CompanionSources(snapshot,snapshot.source_sha256)
 return {format:'complete069_broker_companion_source_plan_v1',complete_source_sha256:snapshot.complete.source_sha256,companion_source_sha256:snapshot.source_sha256,services:companionServices,source_files:snapshot.manifest.sources.length,review_assets:snapshot.manifest.assets.length,qualification:snapshot.manifest.worker_qualification,new_roles:0,existing_role_or_auditor_changes:0,application_cli_executed:false,credential_files_read:false,network_used:false,sql_executed:false,services_started:false,runtime_authorization:false,qualifies:false,production_cutover_allowed:false}
}
