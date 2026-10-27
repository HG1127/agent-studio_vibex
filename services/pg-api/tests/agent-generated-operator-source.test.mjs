// Pure file/AST/argument checks. No pg import, credential read or SQL engine.
import test,{before} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {captureGeneratedOperatorSources,assertGeneratedOperatorSnapshot,generatedOperatorSqlBody,generatedOperatorPins,generatedOperatorSha,generatedOperatorPlan} from '../src/agent-generated-operator-source.mjs'
import {parseGeneratedOperatorArguments,runGeneratedOperator} from '../src/agent-generated-operator-cli.mjs'
let snapshot
before(async()=>{snapshot=await captureGeneratedOperatorSources()})
const p='AGENT_STUDIO_GENERATED_059_',digest='a'.repeat(64)
const args=mode=>['--'+mode,'--confirm-database','agent_studio','--expected-source-sha256',digest]
const env=()=>Object.fromEntries(Object.entries({ENABLED:'true',READ_APPROVED:'APPROVE_GENERATED_059_READ_ONLY',APPROVAL_FILE:'/vault/approval',APPROVAL_SHA256:digest,BACKUP_MANIFEST_FILE:'/vault/backup',RESTORE_EVIDENCE_FILE:'/vault/restore',ADMIN_PASSWORD_FILE:'/vault/admin'}).map(([k,v])=>[p+k,v]))
test('default, malformed arguments and half approval refuse before run can capture sources or read secrets',async()=>{
  await assert.rejects(runGeneratedOperator([],{}),/invalid_arguments/)
  for(const argv of [[],['--apply'],['--preflight','agent_studio'],args('apply').slice(0,4),[...args('recover'),'extra']])assert.throws(()=>parseGeneratedOperatorArguments(argv,env(),'linux',0),/invalid_arguments/)
  for(const missing of ['ENABLED','READ_APPROVED','APPROVAL_FILE','APPROVAL_SHA256','BACKUP_MANIFEST_FILE','RESTORE_EVIDENCE_FILE','ADMIN_PASSWORD_FILE']){
    const value=env();delete value[p+missing];assert.throws(()=>parseGeneratedOperatorArguments(args('preflight'),value,'linux',0))
  }
  assert.throws(()=>parseGeneratedOperatorArguments(args('apply'),env(),'linux',0),/write_not_approved/)
  assert.throws(()=>parseGeneratedOperatorArguments(args('recover'),env(),'linux',0),/incomplete_configuration/)
})
test('independent read/write modes reject ambient connection or loader overrides and runtime hosts',()=>{
  const valid=env();assert.equal(parseGeneratedOperatorArguments(args('preflight'),valid,'linux',0).mode,'preflight')
  for(const [key,value]of [['DATABASE_URL','forbidden'],['PGHOST','forbidden'],['NODE_OPTIONS','forbidden'],['NODE_PATH','forbidden'],[p+'WRITE_APPROVED','APPROVE_GENERATED_059_INSTALL_ONLY']])assert.throws(()=>parseGeneratedOperatorArguments(args('preflight'),{...valid,[key]:value},'linux',0))
  for(const [platform,uid]of [['win32',0],['linux',1000]])assert.throws(()=>parseGeneratedOperatorArguments(args('preflight'),valid,platform,uid),/disabled/)
  assert.equal(parseGeneratedOperatorArguments(args('apply'),{...valid,[p+'WRITE_APPROVED']:'APPROVE_GENERATED_059_INSTALL_ONLY',[p+'JOURNAL_FILE']:'/vault/journal'},'linux',0).mode,'apply')
  assert.equal(parseGeneratedOperatorArguments(['--plan'],{},'win32',undefined).mode,'plan')
})
test('real TypeScript AST captures full059/predecessor closure, types, shared modules and exact dependency externals',async()=>{
  const paths=new Set(snapshot.manifest.sources.map(s=>s.path)),edges=snapshot.manifest.imports
  for(const name of ['agent-generated-audit.ts','agent-generated-audit-core.ts','agent-opinion-audit.ts','agent-assessment-audit.ts','agent-review-audit.ts','agent-optimization-audit.ts','agent-collaboration-audit.ts','contracts.ts','agent-generated-operator-source.d.mts'])assert.ok(paths.has('services/pg-api/src/'+name),name)
  assert.ok(paths.has('shared/agent-role-limits.mjs'))
  assert.ok(edges.some(e=>e.from.endsWith('agent-generated-audit.ts')&&e.to.endsWith('agent-opinion-audit.ts')))
  assert.deepEqual(snapshot.manifest.parser,{name:'typescript',version:'5.9.3',sha256:'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675'})
  assert.ok(snapshot.manifest.externals.every(x=>x.startsWith('node:')||['pg','typescript'].includes(x)))
  assert.equal((await captureGeneratedOperatorSources()).source_sha256,snapshot.source_sha256)
})
test('only frozen raw LF059 is executable; extracted body preserves both actual raw UTF8 prosrc pins',()=>{
  assert.equal(snapshot.manifest.sql.sha256,'74f884019a36ef33b8f8c95396fe6fa8ec128ece904c915e3495312d4a0d8063')
  assert.equal(generatedOperatorSqlBody(snapshot.sql),snapshot.body)
  assert.equal(generatedOperatorSha(snapshot.body),snapshot.manifest.sql.body_sha256)
  assert.doesNotMatch(snapshot.body,/^BEGIN;|^COMMIT;/m)
  const actual={};for(const m of snapshot.body.matchAll(/CREATE FUNCTION agentstudio\.(agent_generated_[a-z_]+)\([^]*?AS \$fn\$([^]*?)\$fn\$;/g))actual[m[1]]=generatedOperatorSha(m[2])
  assert.deepEqual(actual,generatedOperatorPins)
  for(const changed of ['\uFEFF'+snapshot.sql,snapshot.sql.replaceAll('\n','\r\n'),snapshot.sql.replace('complete-five','complete-six'),snapshot.sql+'COMMIT;\n'])assert.throws(()=>generatedOperatorSqlBody(changed),/source_refused/)
})
test('captured bytes and all nested manifest objects are immutable; clones and wrong approval digests cannot execute',()=>{
  assert.throws(()=>snapshot.manifest.sources.push({path:'foreign',sha256:digest}),TypeError)
  assert.throws(()=>{snapshot.manifest.prosrc.agent_generated_accept=digest},TypeError)
  assert.throws(()=>{snapshot.body+='SELECT 1'},TypeError)
  assert.throws(()=>assertGeneratedOperatorSnapshot(structuredClone(snapshot),snapshot.source_sha256),/source_refused/)
  assert.throws(()=>assertGeneratedOperatorSnapshot(snapshot,digest),/source_refused/)
  assertGeneratedOperatorSnapshot(snapshot,snapshot.source_sha256)
})
test('plan reports offline optional059 and keeps the original default fresh050 source descriptor untouched',()=>{
  const plan=generatedOperatorPlan(snapshot)
  assert.equal(plan.latest_migration,'pg_v9_059');assert.equal(plan.default_fresh_latest,'pg_v9_050')
  for(const field of ['network_used','secret_read','initializes_database','services_started','production_cutover_allowed'])assert.equal(plan[field],false)
  const source=readFileSync(new URL('../src/pg18-fresh-runtime-source.mjs',import.meta.url),'utf8')
  assert.match(source,/latest_migration:"pg_v9_050"/);assert.doesNotMatch(source,/059_agent_generated/)
})
