// Source/AST proofs only. No DB, injected positive auditor, mock Pool or SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {captureCompleteProfileSources} from '../src/pg18-complete-profile-source.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),require=createRequire(import.meta.url),ts=require('typescript'),base='services/pg-api/src/pg18-complete-review-stack-'
function parsed(name){const s=read(name),tree=ts.createSourceFile(name,s,ts.ScriptTarget.Latest,true,name.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);assert.equal(tree.parseDiagnostics.length,0,name);return {s,tree}}
function fn(file,name){let out;const {tree}=parsed(file);const walk=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===name)out=n.getText(tree);ts.forEachChild(n,walk)};walk(tree);assert.ok(out,name);return out}
test('complete closure captures the independent preparer and genuine original auditors without changing frozen 059/060',async()=>{
 const snapshot=await captureCompleteProfileSources(),names=new Set(snapshot.manifest.sources.map(f=>f.path))
 assert.equal(snapshot.manifest.sql_sources.length,53);assert.equal(snapshot.steps.length,19);assert.equal(snapshot.tables.length,133);assert.equal(snapshot.versions.length+2,57)
 for(const n of ['cli','plan','core','journal'])assert.ok(names.has(base+n+'.mjs'))
 for(const n of ['agent-assessment-service.ts','agent-design-runtime-policy.ts','agent-design-audit.ts','pg18-complete-executor-core.mjs','native-local-device-audit.ts'])assert.ok(names.has('services/pg-api/src/'+n),n)
 const source=read('services/pg-api/src/pg18-complete-profile-source.mjs');assert.ok(source.includes("old059='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'"));assert.ok(source.includes("old060='bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67'"))
})
test('all-global catalog precedes limited normalization and includes public/future/RLS/parameter ACLs',()=>{
 const f=fn(base+'core.mjs','readReviewStackCatalog')
 assert.match(f,/FROM pg_roles r JOIN pg_authid a ON a\.oid=r\.oid ORDER BY r\.rolname/)
 assert.match(f,/FROM pg_auth_members m JOIN pg_roles c/);assert.doesNotMatch(f,/FROM pg_roles[^"\n]*WHERE|rolname (?:LIKE|!~)|nspname IN/)
 assert.ok(f.indexOf('inspectReviewStackRoleMatrix(')<f.indexOf('roles:roles.filter('))
 for(const n of ['pg_db_role_setting','pg_default_acl','pg_policy','pg_parameter_acl','pg_tablespace','pg_foreign_server','pg_foreign_data_wrapper','attacl','typacl','proacl'])assert.ok(f.includes(n),n)
 assert.match(f,/newNames\.has\(r\.grantor\)/);assert.match(f,/r\.role_oid!=='0'/);assert.match(f,/memberships:memberships\.filter\(r=>!newNames\.has\(r\.child\)\)/)
 const p=read(base+'plan.mjs');assert.match(p,/unknown_global_role_refused/);assert.match(p,/Number\(r\.id\)>=16384/);assert.match(p,/r\.id!=='10'/)
})
test('durable bound intent precedes exactly fixed DDL and full images/API checks surround COMMIT',()=>{
 const f=fn(base+'core.mjs','prepareReviewStack'),j=read(base+'journal.mjs'),c=read(base+'cli.mjs')
 assert.ok(f.indexOf('await start(')<f.indexOf('for(const statement of statements)await db.query(statement)'))
 assert.match(f,/LOCK TABLE '\+snapshot\.tables\.map\(quote\)\.join\(','\)\+' IN SHARE MODE/)
 assert.equal((f.match(/await apiCatalog\(pools\.api\)/g)||[]).length,2);assert.equal((f.match(/await reviewStackImages\(db,snapshot\)/g)||[]).length,2)
 assert.ok(f.lastIndexOf('await completeServiceTarget(')<f.indexOf("db.query('COMMIT')"));assert.match(j,/O_EXCL\|fs\.constants\.O_NOFOLLOW/);assert.match(j,/fs\.fsyncSync\(d\)/)
 for(const n of ['executor_intent_sha256','review_intent_sha256','parent_state_changed','parent_record_changed','independent_secret_required','matchesServiceScram'])assert.ok(c.includes(n),n)
 assert.ok(c.indexOf('await original.completeServiceTarget(lock,cfg.target)')<c.indexOf('parents=readParents()'))
 assert.doesNotMatch(c,/--serve|startAgentAssessmentService\(|new (?:Agent.*Worker|.*Broker)\(|spawn\(/)
 assert.match(c,/prior_commit_acknowledged:false/);assert.match(c,/observed_ready:Object\.values\(observed\)\.every/)
})
test('fresh real dedicated pools use unchanged original audit functions including Executor; no old phase observer after accounts',()=>{
 const c=read(base+'core.mjs'),p=fn(base+'core.mjs','verifyReviewStackPriorPools'),n=fn(base+'core.mjs','verifyReviewStackNewPools'),o=fn(base+'core.mjs','observeReviewStack')
 assert.match(p,/verifyPgRuntimeTarget\(pools\.executor/);assert.match(p,/inspectNativeLocalDevicePool\(pools\.executor,'agentstudio_local_executor'\)/)
 assert.match(n,/inspectAgentAssessmentOperatorPool\(pools\.review_dispatch/);assert.match(n,/await loadAgentDesignAuditVerifier\(\)/)
 assert.match(n,/inspectAgentDesignOperatorPool\(pools\.design_worker/);assert.match(n,/inspectAgentDesignOperatorPool\(pools\.design_dispatch/)
 assert.match(o,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(o,/verifyCompleteProfile\(admin,pools\.api,snapshot,cfg\.sourceSha256\)/)
 assert.doesNotMatch(o,/prepareReviewStack\(|startReviewStackOperation\(|COMMIT|CREATE ROLE|ALTER ROLE/)
 assert.doesNotMatch(c,/inspectComplete069ReviewWorker\(|inspectComplete069Executor\(|inspectCompleteServiceCatalog\(|audit\s*=\s*(?:async)?\s*\(?\)?\s*=>\s*true/)
})
test('new actual CI is guarded/owned, calls original nonroot broker and worker, and has an independent completed counter',()=>{
 const helper='services/pg-api/tests/helpers/pg18-complete-review-stack-ci.mjs',f=fn(helper,'verifyComplete069ReviewStackCi'),pre=fn(helper,'originalReadOnlyStackCli'),containers=fn('services/pg-api/tests/helpers/pg18-complete-install-ci-containers.mjs','configureOwnedCompleteReviewStackHba')
 assert.ok(f.indexOf('requireCompleteProfileFixtureCi()')<f.indexOf('ownedCompleteProfilePool('));assert.ok(f.indexOf('ownedCompleteProfilePool(')<f.indexOf('fs.mkdirSync('));assert.match(containers,/const s=await owned\(target\)/)
 const hbaAst=ts.createSourceFile('hba.mjs',containers,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),separators=[];const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(hbaAst)==='reviewRules.join')for(const a of n.arguments)if(ts.isStringLiteral(a))separators.push(a.text);ts.forEachChild(n,visit)};visit(hbaAst);assert.deepEqual(separators,['\n'])
 for(const code of ['unknown_global_role_refused','partial_role_state_refused','private_record_required','existing_roles_no_takeover','membership_matrix_refused','direct_privileges_refused','observed_state_changed'])assert.ok(f.includes(code),code)
 assert.match(f,/actual_pg_commit_ack_loss_injected:false/);assert.match(f,/completed\.length===groups\.length/);assert.doesNotMatch(f,/caseCounter\.(?:finish|complete)|passed:10/)
 assert.match(pre,/for\(const kind of \['broker','worker'\]\)/);assert.match(pre,/\['--preflight',kind\]/);assert.match(pre,/\{uid,gid,cwd:/);assert.match(pre,/verified_roles!==\(kind==='worker'\?2:6\)/)
 for(const n of ['design-worker.secret','design-dispatch.secret','model-encryption.secret','AGENT_STUDIO_PG18_DESIGN_EXECUTION_APPROVED','encryption_key_loaded!==false','worker_started!==false','external_model_calls!==false'])assert.ok(pre.includes(n),n)
 assert.doesNotMatch(pre,/--serve|chmodSync\('\/opt|chmodSync\('\/var|chmodSync\('\/run/)
 const entry=read('services/pg-api/tests/pg18-complete-service-ci.integration.mjs');assert.ok(entry.indexOf('verifyComplete069ExecutorCi(loaded')<entry.indexOf('verifyComplete069ReviewStackCi(loaded'));assert.match(entry,/passed:caseCounter\.finish\(\)/)
})
test('source-only archive contains base preflight examples and disabled independent Design credential drop-ins',()=>{
 const archive=read('ops/build-pg18-complete069-review-bundle.mjs')
 for(const kind of ['worker','broker']){
  const drop='ops/templates/agentstudio-pg18-review-'+kind+'-design.conf.example',d=read(drop),original='ops/templates/agent-assessment-'+kind+'.service.example',s=read(original)
  assert.ok(archive.includes(drop));assert.ok(archive.includes(original));assert.match(d,/DESIGN_EXECUTION_ENABLED=false/);assert.match(d,/DESIGN_EXECUTION_APPROVED=REVIEW_REQUIRED/)
  assert.match(d,new RegExp('LoadCredential=design-'+(kind==='worker'?'worker':'dispatch')+'\\.secret:'))
  assert.match(s,/Type=oneshot/);assert.ok(s.includes('--preflight '+kind));assert.doesNotMatch(s,/^\[Install\]|^ExecStart=.*--serve/m)
 }
 assert.ok(archive.includes('docs/PG18_COMPLETE_069_REVIEW_DESIGN_PREPARATION.md'));assert.match(archive,/review_stack_runtime_authorization:false/)
})
