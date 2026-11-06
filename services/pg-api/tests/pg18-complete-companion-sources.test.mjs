// Source/asset and pure archive-collection tests only. No application entrypoint
// import/execution, SQL, mock Pool, preflight, key generation or archive command.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {captureComplete069CompanionSources as capture,assertComplete069CompanionSources as checked,complete069CompanionSourcePlan as plan,companionServices as services,companionReviewAssets as assets} from '../src/pg18-complete-companion-sources.mjs'
import {liveEntries,liveLimits} from '../src/pg18-full069-worker-live-contract.mjs'
import {serviceLoginKinds} from '../src/pg18-service-login-policy.mjs'
import {completeServiceActions} from '../src/pg18-complete-service-plan.mjs'
import {parseCompanionReviewArguments as args,collectCompanionReviewSources as collect} from '../../../ops/build-pg18-complete069-companion-review-bundle.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),require=createRequire(import.meta.url),ts=require('typescript'),sha=b=>createHash('sha256').update(b).digest('hex');let current
async function snapshot(){return current??=await capture()}
function tree(n){const text=read(n),t=ts.createSourceFile(n,text,ts.ScriptTarget.Latest,true,n.endsWith('.mjs')?ts.ScriptKind.JS:ts.ScriptKind.TS);assert.equal(t.parseDiagnostics.length,0,n);return t}
function fn(n,name){const t=tree(n);let out;const visit=x=>{if(ts.isFunctionDeclaration(x)&&x.name?.text===name)out=x;ts.forEachChild(x,visit)};visit(t);assert.ok(out,name);return {text:out.getText(t),node:out,tree:t}}
test('independent closed module/import and fixed-asset seal retains exact complete parent and original frozen cohorts',async()=>{
 const s=await snapshot(),source=new Set(s.manifest.sources.map(f=>f.path));assert.equal(checked(s,s.source_sha256),true)
 assert.equal(s.complete.manifest.sql_sources.length,53);assert.equal(s.complete.tables.length,133);assert.equal(s.complete.versions.length+2,57)
 for(const v of services)assert.ok(source.has(v.entry));assert.ok(source.has('services/pg-api/src/pg18-complete-companion-sources.mjs'))
 for(const p of ['bound-runtime-credentials.ts','bound-tls-material.ts','bound-dispatch-role-preflight.ts','knowledge-index-privileges.ts','knowledge-query-audit.ts','pg18-full069-worker-live-contract.mjs'])assert.ok(source.has('services/pg-api/src/'+p),p)
 for(const edge of s.manifest.imports)assert.ok(source.has(edge.from)&&source.has(edge.to),edge.to)
 for(const f of [...s.manifest.sources,...s.manifest.assets])assert.equal(sha(fs.readFileSync(root+'/'+f.path)),f.sha256,f.path)
 assert.deepEqual(s.manifest.assets.map(f=>f.path),assets);assert.equal(assets.length,5)
 assert.deepEqual(s.complete.manifest.predecessors,{generated:'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb',descriptive:'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67'})
})
test('snapshot identity and expected digest cannot be replaced by parsed metadata or a foreign source seal',async()=>{
 const s=await snapshot();assert.ok(Object.isFrozen(s.manifest.services[0].credential_leaves));assert.throws(()=>checked({...s},s.source_sha256));assert.throws(()=>checked(s,'0'.repeat(64)))
 const p=plan(s);for(const k of ['application_cli_executed','credential_files_read','network_used','sql_executed','services_started','runtime_authorization','qualifies','production_cutover_allowed'])assert.equal(p[k],false,k);assert.equal(p.new_roles,0)
})
test('fixed two original broker ABIs equal existing credential-reader sets and readonly unit command/mounts',()=>{
 const n='services/pg-api/src/bound-runtime-credentials.ts',t=tree(n);let names
 const visit=x=>{if(ts.isVariableDeclaration(x)&&x.name.getText(t)==='names')names=x.initializer;ts.forEachChild(x,visit)};visit(t);assert.ok(ts.isObjectLiteralExpression(names))
 for(const s of services){const prop=names.properties.find(p=>(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&p.name.text===s.credential_kind);assert.ok(prop);assert.ok(ts.isNewExpression(prop.initializer));const a=prop.initializer.arguments[0];assert.ok(ts.isArrayLiteralExpression(a));assert.deepEqual(a.elements.map(v=>v.text),s.credential_leaves)
  const unit=read(s.template);assert.ok(unit.includes(s.entry+' '+s.preflight_args.join(' ')));assert.match(unit,/Type=oneshot/);assert.match(unit,/Restart=no/);assert.doesNotMatch(unit,/^\[Install\]|^ExecStart=.*--serve/m)
  const actual=unit.split(/\r?\n/).filter(v=>v.startsWith('LoadCredential=')).map(v=>v.slice(15).split(':')[0]);assert.deepEqual(actual,s.credential_leaves)
  assert.equal(s.credential_directory,'/run/credentials/'+s.unit)
 }
 assert.deepEqual(services.map(s=>s.database_logins.length),[3,2]);assert.deepEqual(services.map(s=>s.origin),['https://127.0.0.1:7453','https://127.0.0.1:7455'])
})
test('original preflights remain before provider/listener construction and honestly load then clear encryption keys',()=>{
 const b=fn(services[0].entry,'startBoundDispatchServer').text,k=fn(services[1].entry,'startKnowledgeIndexService').text
 for(const s of services)assert.equal(s.preflight_loads_encryption_key,true)
 assert.ok(b.indexOf('parseModelEncryptionKey(read("model-encryption.secret")')<b.indexOf('if(mode==="preflight")'))
 assert.ok(b.indexOf('if(mode==="preflight")')<b.indexOf('const executor=createIsolatedBoundModelExecutor'));assert.ok(b.includes('encryptionKey.fill(0)'));assert.ok(b.includes('verified_roles:3'))
 assert.ok(k.indexOf('key=parseModelEncryptionKey(')<k.indexOf('if(mode==="preflight")'))
 assert.ok(k.indexOf('if(mode==="preflight")')<k.indexOf('createKnowledgeEmbeddingTransport(embeddingEndpointPolicy'));assert.ok(k.includes('key?.fill(0)'));assert.ok(k.includes('roles_verified:true,credentials_read:true,network_used:true,provider_calls:false,workers_started:false'))
 for(const s of services)for(const auditor of s.original_auditors)assert.ok(read(s.entry).includes('await '+auditor+'('),auditor)
 const tls=fn('services/pg-api/src/bound-tls-material.ts','assertBoundDispatchTlsMaterial').text;for(const v of ['checkHost("localhost")','checkIP("127.0.0.1")','checkPrivateKey','1.3.6.1.5.5.7.3.1'])assert.ok(tls.includes(v),v)
})
test('original seven entries/eight telemetry kinds/day duration and old account protocols remain unchanged',async()=>{
 const s=await snapshot();assert.equal(liveEntries.length,7);assert.equal(new Set(liveEntries.flatMap(v=>v.kinds)).size,8);assert.equal(liveLimits.minimumMs,86400000);assert.equal(serviceLoginKinds.length,6);assert.equal(completeServiceActions.length,8)
 assert.deepEqual(liveEntries.find(v=>v.id==='knowledge').args,['--serve','worker']);assert.deepEqual(liveEntries.find(v=>v.id==='assessment').args,['--serve','worker'])
 for(const c of services)assert.equal(liveEntries.some(v=>'services/pg-api/src/'+v.file===c.entry&&JSON.stringify(v.args)===JSON.stringify(c.serve_args)),false)
 assert.equal(s.manifest.worker_qualification.brokers_started_by_seven_entries,false)
})
test('new archive CLI requires both independent source hashes and never accepts a role, application command or output inside plan',()=>{
 const raw=['--profile','complete069','--expected-source-sha256','a'.repeat(64),'--expected-companion-sha256','b'.repeat(64),'--output-dir',path.resolve(root,'../outside-review')],p=args(raw);assert.equal(p.expectedCompanion,'b'.repeat(64));assert.deepEqual(args(['--plan']),{mode:'plan'})
 for(const [at,v]of [[1,'fresh050'],[3,'bad'],[5,'bad'],[7,'relative']]){const x=[...raw];x[at]=v;assert.throws(()=>args(x))}
 assert.throws(()=>args([...raw,'--serve']));assert.throws(()=>args(['--preflight','broker']));assert.throws(()=>args(['--role','postgres']))
})
test('source-only archive collection includes genuine broker entrypoints/assets and regenerates its own bounded manifests',async()=>{
 const s=await snapshot(),c=await collect(s.complete.source_sha256,s.source_sha256),top=JSON.parse(c.entries.get('REVIEW_MANIFEST.json')),old=JSON.parse(c.entries.get('BASE_COMPLETE069_REVIEW_MANIFEST.json'))
 assert.equal(top.format,'complete069_broker_companion_review_v1');assert.equal(old.format,'complete069_source_review_v1');assert.equal(top.companion_source_sha256,s.source_sha256)
 for(const v of services)assert.ok(c.entries.has(v.entry)&&c.entries.has(v.template))
 for(const v of ['BROKER_COMPANION_SOURCE_MANIFEST.json','BROKER_COMPANION_BOUNDARY.json','BROKER_COMPANION_PLAN.json'])assert.ok(c.entries.has(v))
 assert.ok(c.entries.has('services/pg-api/package.json')&&c.entries.has('services/pg-api/pnpm-lock.yaml'))
 for(const f of top.files)assert.equal(sha(c.entries.get(f.path)),f.sha256,f.path)
 for(const f of old.files)assert.equal(sha(c.entries.get(f.path)),f.sha256,'preserved base subset: '+f.path)
 const sums=c.entries.get('SHA256SUMS').toString('utf8').trim().split('\n');assert.equal(sums.length,c.entries.size-1);assert.ok(sums.includes(sha(c.entries.get('REVIEW_MANIFEST.json'))+'  REVIEW_MANIFEST.json'))
 for(const n of c.files)assert.doesNotMatch(n,/\.(?:pem|key|db|sqlite|exe|zip)$/)
 for(const k of ['application_cli_executed','sql_executed','services_started','runtime_authorization','qualifies','production_cutover_allowed'])assert.equal(top[k],false,k)
})
test('new source collector cannot execute an application and archive effects follow both seals with owned cleanup only',()=>{
 const source=read('services/pg-api/src/pg18-complete-companion-sources.mjs');assert.doesNotMatch(source,/from ['"]\.\/(?:bound-dispatch-server|knowledge-index-service)|spawn\(|execFile|new Pool|readBoundRuntimeCredential\(/)
 assert.match(source,/source_dynamic_import/);assert.match(source,/source_external/);assert.match(source,/source_changed/);assert.match(source,/snapshots\.has\(snapshot\)/)
 const builder=fn('ops/build-pg18-complete069-companion-review-bundle.mjs','buildCompanionReviewBundle').text;assert.ok(builder.indexOf('await collectCompanionReviewSources(')<builder.indexOf('outputDirectory('));assert.match(builder,/fs\.linkSync\(partial,archive\)/)
 const cleanup=fn('ops/build-pg18-complete069-companion-review-bundle.mjs','removeOwn').text;for(const n of ['rel.includes(path.sep)','s.dev!==owned.dev','s.ino!==owned.ino','fs.realpathSync(absolute)!==absolute'])assert.ok(cleanup.includes(n),n)
 const full=read('ops/build-pg18-complete069-companion-review-bundle.mjs');assert.doesNotMatch(full,/--preflight|new Pool|\.query\(|sudo|systemctl|pnpm install/)
})
