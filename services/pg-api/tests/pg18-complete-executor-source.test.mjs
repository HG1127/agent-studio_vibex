// Source/closed capture verification only; actual identity proofs run in hosted
// PG18 CI through the unchanged original auditors and original nonroot CLI.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot} from '../src/pg18-complete-profile-source.mjs'
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8'),ast=p=>{const code=read(p),tree=ts.createSourceFile(p,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0);return tree}
const fn=(tree,name)=>{const f=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(f,name);return f}
function calls(root,tree,name){const out=[];const walk=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)===name)out.push(n);ts.forEachChild(n,walk)};walk(root);return out}
test('the genuine full069 closure includes the new preparer and original Executor C/service preflight, retaining frozen cohorts',async()=>{
 const s=await captureCompleteProfileSources();assertCompleteProfileSnapshot(s,s.source_sha256);const names=new Set(s.manifest.sources.map(r=>r.path))
 for(const name of ['pg18-complete-executor-cli.mjs','pg18-complete-executor-core.mjs','pg18-complete-executor-plan.mjs','pg18-complete-executor-journal.mjs','native-local-executor-service-preflight-cli.mjs','native-local-executor-service-preflight.ts','native-local-executor-operator-plan.mjs'])assert.ok(names.has('services/pg-api/src/'+name),name)
 assert.equal(s.manifest.sql_sources.length,53);assert.equal(s.tables.length,133);assert.equal(s.versions.length+2,57);assert.equal(s.roles.includes('agentstudio_local_executor_login'),false)
 assert.equal(s.generated.source_sha256,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb');assert.equal(s.descriptive.source_sha256,'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67')
})
test('host/source/runtime gates precede opening PG, durable intent precedes fixed DDL and original C proves the real pool',()=>{
 const cli=ast('../src/pg18-complete-executor-cli.mjs'),run=fn(cli,'runComplete069Executor'),load=calls(run,cli,'runtime.loadCompleteProfileOperatorPg')[0]
 assert.ok(calls(run,cli,'host')[0].getStart(cli)<load.getStart(cli));assert.ok(calls(run,cli,'source.assertCompleteProfileDeployment')[0].getStart(cli)<load.getStart(cli))
 const core=ast('../src/pg18-complete-executor-core.mjs'),prepare=fn(core,'prepareComplete069Executor'),intent=calls(prepare,core,'start')[0],ddl=calls(prepare,core,'db.query').find(n=>n.arguments[0]?.getText(core)==='reservation')
 assert.ok(intent.getStart(core)<ddl.getStart(core));assert.equal(calls(fn(core,'verifyComplete069ExecutorLogin'),core,'inspectNativeLocalExecutorPreflight').length,1)
 assert.equal(calls(prepare,core,'completeServiceCatalog').length,0)
 const code=read('../src/pg18-complete-executor-core.mjs');assert.match(code,/SELECT rolname AS name FROM pg_roles WHERE rolname !~ '\^pg_'/);assert.match(code,/ORDER BY c\.rolname,p\.rolname,g\.rolname/)
 assert.doesNotMatch(code,/INSERT INTO|CREATE TABLE|CREATE FUNCTION|SET SESSION AUTHORIZATION|new NativeLocalExecutor/)
})
test('guarded CI invokes actual Root preparation before original nonroot preflight and verifies negative grants plus all133 table images',()=>{
 const tree=ast('./helpers/pg18-complete-executor-ci.mjs'),run=fn(tree,'verifyComplete069ExecutorCi')
 assert.ok(calls(run,tree,'requireCompleteProfileFixtureCi')[0].getStart(tree)<calls(run,tree,'ownedCompleteProfilePool')[0].getStart(tree))
 const code=read('./helpers/pg18-complete-executor-ci.mjs');assert.match(code,/native-local-executor-service-preflight-cli\.mjs',\['--service-preflight'\]/);assert.match(code,/\{uid,gid,cwd:/)
 assert.match(code,/equal\(await image\(\),beforeImage\)/);assert.match(code,/global_role_inventory_refused/);assert.match(code,/GRANT SELECT ON agentstudio\.native_local_devices TO agentstudio_local_executor_login/)
 assert.doesNotMatch(code,/--serve|--start|device_pair\(|new NativeLocalExecutor/)
 const fixture=read('./pg18-complete-service-ci.integration.mjs');assert.ok(fixture.indexOf('await verifyComplete069ExecutorCi')>fixture.indexOf('await verifyComplete069ReviewWorkerCi'))
})
