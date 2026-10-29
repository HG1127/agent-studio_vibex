// Source-only tests. Collection reads actual source/parser bytes. The archive
// case is for Root CI; it never executes SQL, a target mode or an application.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {captureCompleteProfileSources} from '../services/pg-api/src/pg18-complete-profile-source.mjs'
import {parseComplete069ReviewArguments,collectComplete069ReviewSources,buildComplete069ReviewBundle} from '../ops/build-pg18-complete069-review-bundle.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>createHash('sha256').update(b).digest('hex')
test('strict review parser rejects target/activation/ambiguous options without creating output',()=>{
 const output=path.join(os.tmpdir(),'complete069-parser-not-created'),valid=['--profile','complete069','--expected-source-sha256','a'.repeat(64),'--output-dir',output]
 assert.deepEqual(parseComplete069ReviewArguments(valid),{expectedSource:'a'.repeat(64),output:path.resolve(output)})
 for(const args of [[],valid.slice(0,-1),[...valid,'--serve'],[...valid,'--with-local-executor-operator'],[...valid,'--output-dir',output],valid.map((v,i)=>i===1?'complete050':v),valid.map((v,i)=>i===3?'not-a-sha':v),valid.map((v,i)=>i===5?'relative-output':v)])assert.throws(()=>parseComplete069ReviewArguments(args),/arguments_refused/)
})
test('actual source collection includes full069 preparation and exact parser while separating fourteen-package PG and business dependencies',async()=>{
 const expected=await captureCompleteProfileSources(),r=await collectComplete069ReviewSources(expected.source_sha256),read=name=>r.entries.get(name)
 assert.equal(r.reviewOnly,true);assert.equal(r.snapshot.source_sha256,expected.source_sha256)
 for(const f of [...expected.manifest.sources,...expected.manifest.sql_sources])assert.equal(hash(read(f.path)),f.sha256,f.path)
 for(const name of ['pg18-complete-service-cli.mjs','pg18-complete-service-core.mjs','pg18-complete-service-journal.mjs','pg18-complete-service-plan.mjs','baota-pg18-complete-init.mjs','native-first-admin-cli.mjs','native-auth-repository.mjs','native-server.ts'])assert.ok(read('services/pg-api/src/'+name),name)
 assert.equal(expected.manifest.sql_sources.length,53);assert.equal(expected.steps.length,19);assert.equal(expected.tables.length,133);assert.equal(expected.versions.length+2,57)
 assert.equal(expected.generated.source_sha256,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb');assert.equal(expected.descriptive.source_sha256,'bf8a681699139a57ad4d6743173af247613cec4be2426a2f70dc68b76c77af67')
 const source=JSON.parse(read('COMPLETE_SOURCE_MANIFEST.json')),boundary=JSON.parse(read('DEPENDENCY_BOUNDARY.json')),plan=JSON.parse(read('BOOTSTRAP_PLAN.json')),review=JSON.parse(read('REVIEW_MANIFEST.json'))
 assert.equal(hash(Buffer.from(JSON.stringify(source))),expected.source_sha256);assert.equal(review.source_sha256,expected.source_sha256)
 assert.equal(Object.keys(boundary.operator_pg_packages).length,14);assert.equal(boundary.operator_pg_runtime_bundled,false);assert.equal(boundary.operator_runtime_manifest_bundled,false);assert.equal(boundary.business_dependency_runtime_bundled,false);assert.equal(boundary.dependency_installation_performed,false)
 assert.equal(boundary.executor_provisioning_assets_included,false);assert.equal(boundary.telemetry_provisioning_included,false)
 assert.deepEqual(r.files.filter(n=>n.includes('/node_modules/')),boundary.exact_parser_files.map(f=>f.path).sort());for(const f of boundary.exact_parser_files)assert.equal(hash(read(f.path)),f.sha256)
 assert.equal(hash(read('services/pg-api/pnpm-lock.yaml')),boundary.lock_sha256);assert.equal(hash(read('services/pg-api/package.json')),boundary.package_json_sha256)
 assert.equal(JSON.parse(read('services/pg-api/package.json')).dependencies.jszip,boundary.business_dependency_declarations.jszip)
 assert.deepEqual(plan.actions,['api','native-auth','first-admin','worker','identity','broker','index-worker','index-broker']);assert.equal(plan.old_protocol_changed,false);assert.equal(plan.migration_ledger_write,false);assert.equal(plan.executor_account_included,false)
 for(const f of review.files){assert.equal(hash(read(f.path)),f.sha256);assert.equal(read(f.path).length,f.bytes)}
 const sums=read('SHA256SUMS').toString('utf8').trim().split('\n').map(line=>{const m=/^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$/.exec(line);assert.ok(m);return m})
 assert.deepEqual(sums.map(m=>m[2]).sort(),r.files.filter(n=>n!=='SHA256SUMS'));for(const m of sums)assert.equal(hash(read(m[2])),m[1])
 assert.match(read('README_REVIEW_ONLY.txt').toString(),/SOURCE REVIEW ONLY/);assert.match(read('README_REVIEW_ONLY.txt').toString(),/api -> native-auth -> first-admin/)
 assert.ok(read('docs/PG18_COMPLETE_069_PREPARATION.md'));assert.equal(r.files.includes('services/pg-api/src/native-local-executor-service-preflight-cli.mjs'),false)
 for(const name of r.files)assert.doesNotMatch(name,/(?:^|\/)(?:\.env[^/]*|pb_data|secrets?|credentials?)(?:\/|$)|\.(?:db|sqlite|wal|exe|dll|pem|key|zip)$/i)
 await assert.rejects(collectComplete069ReviewSources('0'.repeat(64)),/complete069_source_refused/)
})
test('ROOT archive integration: exact extraction and genuine dependency-free prepare plan only',async()=>{
 const parent=fs.realpathSync(os.tmpdir()),output=fs.mkdtempSync(path.join(parent,'complete069-review-root-')),stat=fs.statSync(output,{bigint:true})
 try{
  const snapshot=await captureCompleteProfileSources(),r=await buildComplete069ReviewBundle({expectedSource:snapshot.source_sha256,output})
  assert.equal(hash(fs.readFileSync(r.archive)),r.sha256);assert.equal(r.archive_extracted_hashes_verified,true)
  for(const k of ['application_cli_executed','dependency_installation_performed','network_used','sql_executed','services_started','production_cutover_allowed'])assert.equal(r[k],false)
  const extracted=path.join(output,'root-extracted');fs.mkdirSync(extracted)
  const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
  const tar=spawnSync('tar',['-xzf',r.archive,'-C',extracted],{env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});assert.equal(tar.status,0)
  const preload='data:text/javascript,'+encodeURIComponent("import net from 'node:net';import{syncBuiltinESMExports}from'node:module';net.Socket.prototype.connect=()=>{throw Error('source_review_no_network')};syncBuiltinESMExports();")
  for(const [entry,args]of [['pg18-complete-service-cli.mjs',['--plan']],['baota-pg18-complete-init.mjs',['--plan','--profile','complete069']]]){
   const result=spawnSync(process.execPath,['--experimental-strip-types','--import',preload,'services/pg-api/src/'+entry,...args],{cwd:extracted,env,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout);assert.equal(plan.production_cutover_allowed,false);assert.equal(plan.network_used,false);assert.equal(plan.writes_performed,false)
  }
  await assert.rejects(buildComplete069ReviewBundle({expectedSource:snapshot.source_sha256,output}),/archive_already_exists/)
 }finally{
  const current=fs.lstatSync(output,{bigint:true});assert.equal(current.isSymbolicLink(),false);assert.equal(current.dev,stat.dev);assert.equal(current.ino,stat.ino);assert.equal(path.dirname(fs.realpathSync(output)),parent);assert.ok(path.basename(output).startsWith('complete069-review-root-'));fs.rmSync(output,{recursive:true})
 }
})
