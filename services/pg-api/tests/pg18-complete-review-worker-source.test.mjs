// Genuine closed source graph and control-flow checks; no PG driver, fake
// credential identity, DB execution, operator CLI or positive mock auditor.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import {captureCompleteProfileSources,assertCompleteProfileSnapshot} from '../src/pg18-complete-profile-source.mjs'
import {verifyPg18ServiceHbaOrder} from '../src/native-activation-cli.mjs'
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')
function ast(p){const source=read(p),tree=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0);return tree}
function walk(root,predicate){const found=[];const visit=n=>{if(predicate(n))found.push(n);ts.forEachChild(n,visit)};visit(root);return found}
const calls=(root,tree,name)=>walk(root,n=>ts.isCallExpression(n)&&n.expression.getText(tree)===name)
const fn=(tree,name)=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)
test('full069 closure binds the separate preparer and original assessment operator with exact predecessor and SQL cohorts',async()=>{
 const s=await captureCompleteProfileSources();assertCompleteProfileSnapshot(s,s.source_sha256)
 const names=new Set(s.manifest.sources.map(r=>r.path))
 for(const p of ['pg18-complete-review-worker-cli.mjs','pg18-complete-review-worker-core.mjs','pg18-complete-review-worker-plan.mjs','pg18-complete-review-worker-journal.mjs','agent-assessment-service.ts','agent-assessment-service-config.ts','agent-assessment-role.ts','agent-assessment-audit.ts','agent-assessment-audit-core.ts'])assert.ok(names.has('services/pg-api/src/'+p),p)
 assert.equal(s.manifest.sql_sources.length,53);assert.equal(s.steps.length,19);assert.equal(s.tables.length,133);assert.equal(s.versions.length+2,57)
 assert.equal(s.roles.includes('agentstudio_review_worker_login'),false)
 assert.equal(s.generated.source_sha256,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb')
 assert.equal(s.descriptive.source_sha256,'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67')
 assert.equal(s.manifest.sql_sources.find(r=>r.path.endsWith('pg_v9_067_native_local_devices.sql')).sha256,'908beb0a10c726d665968036e7f5fa01373afff61610b9db1356c52f374ef563')
 assert.ok(s.manifest.imports.some(r=>r.from==='services/pg-api/src/pg18-complete-review-worker-core.mjs'&&r.to==='services/pg-api/src/agent-assessment-service.ts'))
})
test('actual preparation has gated imports, durable intent before DML, original live auditor and no runtime authorization',()=>{
 const cli=ast('../src/pg18-complete-review-worker-cli.mjs'),run=fn(cli,'runComplete069ReviewWorker'),gate=calls(run,cli,'host')[0],load=calls(run,cli,'runtime.loadCompleteProfileOperatorPg')[0]
 assert.ok(gate&&load&&gate.getStart(cli)<load.getStart(cli))
 assert.ok(calls(run,cli,'source.assertCompleteProfileDeployment')[0].getStart(cli)<load.getStart(cli))
 const core=ast('../src/pg18-complete-review-worker-core.mjs'),prepare=fn(core,'prepareComplete069ReviewWorker'),intent=calls(prepare,core,'start')[0],dml=calls(prepare,core,'db.query').find(n=>n.arguments[0]?.getText(core)==='reservation')
 assert.ok(intent&&dml&&intent.getStart(core)<dml.getStart(core))
 const verify=fn(core,'verifyComplete069ReviewWorkerLogin');assert.equal(calls(verify,core,'inspectAgentAssessmentOperatorPool').length,1)
 assert.ok(verify.getText(core).includes("user:abi.login,expectedMajor:18},'worker'"))
 const code=read('../src/pg18-complete-review-worker-core.mjs')
 assert.match(code,/WHERE r\.rolname LIKE 'agentstudio_%' ORDER BY r\.rolname/)
 assert.match(code,/a\.privilege_type='CONNECT' AND NOT a\.is_grantable/)
 assert.match(code,/d\.datname<>current_database\(\) OR a\.privilege_type<>'CONNECT' OR a\.is_grantable/)
 assert.match(code,/await db\.query\('COMMIT'\);begun=false/)
 assert.doesNotMatch(code,/INSERT INTO.*schema_migrations|CREATE TABLE|CREATE FUNCTION|CREATE SCHEMA|SET SESSION AUTHORIZATION|new AgentAssessmentWorker/)
 const cliCode=read('../src/pg18-complete-review-worker-cli.mjs');assert.match(cliCode,/runtime_authorization:false/);assert.match(cliCode,/prior_commit_acknowledged:false/)
 assert.equal(verifyPg18ServiceHbaOrder([],'agentstudio_review_worker_login').tcp,false)
})
test('actual CI continuation calls the genuine prep and original nonroot preflight and preserves all133 images',()=>{
 const tree=ast('./helpers/pg18-complete-review-worker-ci.mjs'),run=fn(tree,'verifyComplete069ReviewWorkerCi')
 assert.ok(calls(run,tree,'requireCompleteProfileFixtureCi')[0].getStart(tree)<calls(run,tree,'ownedCompleteProfilePool')[0].getStart(tree))
 const code=read('./helpers/pg18-complete-review-worker-ci.mjs')
 assert.match(code,/pg18-complete-review-worker-cli\.mjs/)
 assert.match(code,/agent-assessment-service\.ts',\['--preflight','worker'\]/)
 assert.match(code,/\{uid,gid,cwd:/)
 assert.match(code,/equal\(await image\(\),beforeImage\)/)
 assert.match(code,/code==='agent_assessment_session_role_refused'/)
 assert.match(code,/r\.refusal==='complete069_review_worker_hba_refused'/)
 assert.doesNotMatch(code,/CREATE ROLE|INSERT INTO|--serve|SET SESSION AUTHORIZATION|new AgentAssessmentWorker/)
 const fixture=read('./pg18-complete-service-ci.integration.mjs');assert.ok(fixture.indexOf('await verifyComplete069ReviewWorkerCi')>fixture.indexOf('await runOriginalNativeEntrySmoke'))
})
