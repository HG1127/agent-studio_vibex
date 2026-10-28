// Pure candidate/provenance/journal/transport checks ONLY. Never manufacture a
// passed backup/restore object or bypass the original059 private proof store.
import test,{before} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as ts from 'typescript'
import {captureDescriptivePatchOperatorSources} from '../src/agent-descriptive-patch-operator-source.mjs'
import {captureGeneratedOperatorSources} from '../src/agent-generated-operator-source.mjs'
import {parseGeneratedOperatorApproval} from '../src/agent-generated-operator-core.ts'
import {
  parseDescriptivePatchOperatorApproval,authorizeDescriptivePatchOperator,assertDescriptivePatchOperatorAuthorization,
  assertDescriptivePatchOperatorHost,assertDescriptivePatchOperatorSealedSnapshot,parseDescriptivePatchOperatorJournal,parseDescriptivePatchOperatorJournalRecords,
  commitDescriptivePatchOperatorTransaction,DescriptivePatchOperatorCommitUnknown,DescriptivePatchOperatorInstalledUnverified,
  inspectDescriptivePatchOperator,applyDescriptivePatchOperator,recoverDescriptivePatchOperator,verifyDescriptivePatchOperatorRuntimeLogin,
  descriptivePatchOperatorCatalogSql,descriptivePatchOperatorContextSql,descriptivePatchOperatorTargetSql,
  descriptivePatchOperatorLockSql,descriptivePatchOperatorRuntimeRoles,descriptivePatchOperatorQuiescenceSql,
} from '../src/agent-descriptive-patch-operator-core.ts'

let snapshot,predecessor
const digest='a'.repeat(64),predecessorSha='c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb'
// Independently supplied foundation digest. This is NOT a seal of new core/CLI.
const expected='35fb4b198db7f7517ac5e5b174f1c3813cc035213a408337b436a82a6ae3112d'
before(async()=>{snapshot=await captureDescriptivePatchOperatorSources();predecessor=await captureGeneratedOperatorSources()})
function candidate(options={}){
  return {format:'agent_descriptive_patch_operator_approval_v1',source_sha256:expected,predecessor_source_sha256:predecessorSha,
    system_identifier:'1234567890123456789',database_oid:'42',predecessor_schema_sha256:digest,
    fresh_runtime_source_sha256:snapshot.manifest.default_fresh_source_sha256,backup_manifest_sha256:digest,
    backup_archive_sha256:digest,restore_evidence_sha256:digest,expires_at:new Date(Date.now()+3600000).toISOString(),
    feature_disabled:true,maintenance_approved:true,workers_stopped:true,writes_disabled:true,installation_approved:true,...options}
}
const parsed=options=>parseDescriptivePatchOperatorApproval(candidate(options),snapshot,expected)
function unverifiedPredecessor(approval){
  // Candidate parse only. Deliberately do NOT call the backup verifier: this
  // object has no original private provenance and must never authorize060.
  return parseGeneratedOperatorApproval({format:'agent_generated_operator_approval_v1',source_sha256:predecessorSha,
    system_identifier:approval.system_identifier,database_oid:approval.database_oid,predecessor_schema_sha256:approval.predecessor_schema_sha256,
    fresh_runtime_source_sha256:approval.fresh_runtime_source_sha256,backup_manifest_sha256:approval.backup_manifest_sha256,
    backup_archive_sha256:approval.backup_archive_sha256,restore_evidence_sha256:approval.restore_evidence_sha256,
    expires_at:approval.expires_at,feature_disabled:true,maintenance_approved:true},predecessor)
}
const journal=(approval=parsed(),phase='before_ddl')=>({format:'agent_descriptive_patch_operator_journal_v1',source_sha256:approval.source_sha256,
  system_identifier:approval.system_identifier,database_oid:approval.database_oid,predecessor_schema_sha256:approval.predecessor_schema_sha256,
  nonce:'00000000-0000-4000-8000-000000000001',backend_pid:77,backend_start:'synthetic transport identity, not a PG backend',phase})

test('closed060 candidate binds explicit expected hash, full059 source, target, fresh050 and all maintenance attestations',()=>{
  const approval=parsed();assert.ok(Object.isFrozen(approval));assert.equal(approval.source_sha256,expected)
  assert.equal(parsed({installation_approved:false}).installation_approved,false)
  for(const patch of [{extra:true},{source_sha256:digest},{predecessor_source_sha256:digest},{fresh_runtime_source_sha256:digest},
    {system_identifier:'0'},{database_oid:'42;DROP'},{feature_disabled:false},{maintenance_approved:false},{workers_stopped:false},
    {writes_disabled:false},{installation_approved:'true'},{backup_archive_sha256:'bad'},{expires_at:new Date(0).toISOString()}]){
    assert.throws(()=>parseDescriptivePatchOperatorApproval(candidate(patch),snapshot,expected),/invalid_evidence/)
  }
  assert.throws(()=>parseDescriptivePatchOperatorApproval(candidate(),snapshot,undefined),/source_refused/)
  assert.throws(()=>parseDescriptivePatchOperatorApproval(candidate(),snapshot,digest),/source_refused/)
  assert.throws(()=>parseDescriptivePatchOperatorApproval(candidate(),structuredClone(snapshot),expected),/source_refused/)
})

test('candidate accessors, symbols and foreign prototypes are refused without invoking getters',()=>{
  let reads=0;const getter=candidate()
  Object.defineProperty(getter,'source_sha256',{get(){reads++;return expected},enumerable:true})
  assert.throws(()=>parseDescriptivePatchOperatorApproval(getter,snapshot,expected),/invalid_evidence/);assert.equal(reads,0)
  for(const value of [Object.assign(Object.create(null),candidate()),{...candidate(),[Symbol('extra')]:true}])assert.throws(()=>parseDescriptivePatchOperatorApproval(value,snapshot,expected),/invalid_evidence/)
})

test('the frozen offline35fb foundation is explicitly unusable as a sealed core/CLI installation snapshot',()=>{
  assert.equal(snapshot.source_sha256,expected)
  assert.throws(()=>assertDescriptivePatchOperatorSealedSnapshot(snapshot,expected),/unsealed_operator_source/)
  assert.throws(()=>assertDescriptivePatchOperatorSealedSnapshot(structuredClone(snapshot),expected),/source_refused/)
  assert.throws(()=>assertDescriptivePatchOperatorSealedSnapshot(snapshot,digest),/source_refused/)
})

test('parsing never grants backup provenance; original059 unverified candidates/clones cannot mint060 capability',()=>{
  const approval=parsed(),old=unverifiedPredecessor(approval)
  assert.throws(()=>authorizeDescriptivePatchOperator(snapshot,approval,predecessor,old,'install'),/generated_operator_backup_evidence_required/)
  assert.throws(()=>authorizeDescriptivePatchOperator(snapshot,approval,predecessor,{...old},'read'),/generated_operator_backup_evidence_required/)
  for(const clone of [{...approval},structuredClone(approval),Object.create(approval)])assert.throws(()=>authorizeDescriptivePatchOperator(snapshot,clone,predecessor,old,'install'),/approval_provenance_required/)
  assert.throws(()=>authorizeDescriptivePatchOperator(structuredClone(snapshot),approval,predecessor,old,'read'),/approval_provenance_required/)
  for(const fake of [{},{approval,predecessorApproval:old},Object.freeze({}),new Proxy({}, {})])assert.throws(()=>assertDescriptivePatchOperatorAuthorization(snapshot,fake),/trusted_evidence_required/)
})

test('real-clock candidate expiration and rollback cannot be bypassed by a prior parsed identity or caller timestamps',t=>{
  let clock=Date.now();t.mock.method(Date,'now',()=>clock)
  const approval=parsed({expires_at:new Date(clock+1000).toISOString()}),old=unverifiedPredecessor(approval)
  clock+=1000
  assert.throws(()=>authorizeDescriptivePatchOperator(snapshot,approval,predecessor,old,'read'),/invalid_evidence/)
  clock-=1001
  assert.throws(()=>authorizeDescriptivePatchOperator(snapshot,approval,predecessor,old,'read'),/approval_provenance_required/)
  assert.throws(()=>parseDescriptivePatchOperatorApproval(candidate(),snapshot,expected,NaN),/invalid_evidence/)
})

test('ordinary host or absent trusted capability refuses all operational entry points before connect, SQL or journal writes',async()=>{
  let connections=0,writes=0;const pool={async connect(){connections++;throw Error('unexpected_connection')}}
  const cap=Object.freeze({}),persist=async()=>{writes++}
  for(const operation of [()=>inspectDescriptivePatchOperator(pool,snapshot,cap),()=>applyDescriptivePatchOperator(pool,snapshot,cap,persist),
    ()=>recoverDescriptivePatchOperator(pool,snapshot,cap,[journal()]),()=>verifyDescriptivePatchOperatorRuntimeLogin(pool,snapshot,cap,'api')]){
    await assert.rejects(operation(),/descriptive_patch_operator_(disabled|trusted_evidence_required)/)
  }
  assert.equal(connections,0);assert.equal(writes,0)
  if(process.platform!=='linux'||process.getuid?.()!==0)assert.throws(()=>assertDescriptivePatchOperatorHost(),/disabled/)
  else assert.doesNotThrow(()=>assertDescriptivePatchOperatorHost())
})

test('journal parsing binds exact060 source/target/schema and preserves only a single ordered original request',()=>{
  const approval=parsed(),first=journal(approval),middle={...first,phase:'commit_pending'}
  const result=parseDescriptivePatchOperatorJournalRecords([first,middle,{...first,phase:'commit_unknown'}],approval)
  assert.equal(result.phase,'commit_unknown');assert.ok(Object.isFrozen(result))
  assert.equal(parseDescriptivePatchOperatorJournalRecords([first,middle,{...first,phase:'commit_acknowledged'}],approval).phase,'commit_acknowledged')
  assert.equal(parseDescriptivePatchOperatorJournalRecords([first],approval).phase,'before_ddl')
  for(const patch of [{source_sha256:digest},{database_oid:'43'},{predecessor_schema_sha256:'b'.repeat(64)},{backend_pid:0},{nonce:'not-a-nonce'},
    {phase:'apply_again'},{phase:{toString(){throw Error('must not coerce')}}},{backend_start:'\0'}])assert.throws(()=>parseDescriptivePatchOperatorJournal({...first,...patch},approval),/invalid_journal/)
  for(const records of [[],[middle],[first,first],[first,{...middle,backend_pid:78}],[first,middle,{...first,phase:'commit_unknown'},first],
    [first,middle,{...first,nonce:'00000000-0000-4000-8000-000000000002',phase:'commit_unknown'}]])assert.throws(()=>parseDescriptivePatchOperatorJournalRecords(records,approval),/invalid_journal/)
  assert.throws(()=>parseDescriptivePatchOperatorJournal(first,{...approval}),/approval_provenance_required/)
})

test('sparse/accessor journal arrays and record getters fail without reading caller code',()=>{
  const approval=parsed(),first=journal(approval);let reads=0
  const sparse=new Array(2);sparse[0]=first
  const accessor=[first];Object.defineProperty(accessor,'0',{get(){reads++;return first},enumerable:true})
  for(const records of [sparse,accessor,Object.assign([first],{extra:true})])assert.throws(()=>parseDescriptivePatchOperatorJournalRecords(records,approval),/invalid_journal/)
  const getter={...first};Object.defineProperty(getter,'backend_pid',{get(){reads++;return 77},enumerable:true})
  assert.throws(()=>parseDescriptivePatchOperatorJournal(getter,approval),/invalid_evidence/);assert.equal(reads,0)
})

test('COMMIT transport boundary persists pending first and acknowledges only the returned COMMIT',async()=>{
  const trace=[],base=journal()
  const result=await commitDescriptivePatchOperatorTransaction({async query(sql){trace.push(sql);return {rows:[]}}},base,async record=>{
    assert.ok(Object.isFrozen(record));trace.push(record.phase)
  })
  assert.deepEqual(trace,['commit_pending','COMMIT','commit_acknowledged']);assert.ok(Object.isFrozen(result));assert.equal(result.backend_pid,77)
})

test('lost COMMIT response preserves captured identity, records unknown and never retries or pretends rollback',async()=>{
  const trace=[],base=journal()
  await assert.rejects(commitDescriptivePatchOperatorTransaction({async query(sql){trace.push(sql);throw Error('synthetic lost response')}},base,async record=>{
    trace.push(record.phase);if(record.phase==='commit_pending'){base.backend_pid=99;base.nonce='00000000-0000-4000-8000-000000000099'}
  }),error=>{
    assert.ok(error instanceof DescriptivePatchOperatorCommitUnknown);assert.equal(error.journal.backend_pid,77)
    assert.equal(error.journal.nonce,'00000000-0000-4000-8000-000000000001');assert.ok(Object.isFrozen(error.journal));return true
  })
  assert.deepEqual(trace,['commit_pending','COMMIT','commit_unknown'])
  await assert.rejects(commitDescriptivePatchOperatorTransaction({async query(){throw Error('lost')}},journal(),async record=>{
    if(record.phase==='commit_unknown')throw Error('journal unavailable too')
  }),DescriptivePatchOperatorCommitUnknown)
  await assert.rejects(commitDescriptivePatchOperatorTransaction({async query(){throw Error('lost')}},journal(),record=>{
    if(record.phase==='commit_unknown')throw Error('synchronous journal failure')
    return Promise.resolve()
  }),DescriptivePatchOperatorCommitUnknown)
})

test('pending journal failure prevents COMMIT; post-ack journal failure reports installed-unverified without rollback',async()=>{
  const trace=[]
  await assert.rejects(commitDescriptivePatchOperatorTransaction({async query(sql){trace.push(sql)}},journal(),async()=>{throw Error('synthetic journal full')}),/synthetic journal full/)
  assert.deepEqual(trace,[])
  await assert.rejects(commitDescriptivePatchOperatorTransaction({async query(sql){trace.push(sql)}},journal(),async record=>{
    if(record.phase==='commit_acknowledged')throw Error('synthetic journal lost')
  }),error=>{assert.ok(error instanceof DescriptivePatchOperatorInstalledUnverified);assert.equal(error.journal.phase,'commit_acknowledged');return true})
  assert.deepEqual(trace,['COMMIT'])
  for(const patch of [{phase:'commit_pending'},{extra:true}])await assert.rejects(commitDescriptivePatchOperatorTransaction({async query(){throw Error('must not query')}},{...journal(),...patch},async()=>{}),/invalid_(journal|evidence)/)
})

test('fixed metadata scope keeps full059 while excluding only060; old locks and transitive authenticated quiescence remain',()=>{
  assert.equal(descriptivePatchOperatorContextSql,'SET LOCAL search_path=pg_catalog,public')
  assert.match(descriptivePatchOperatorTargetSql,/pg_control_system/)
  assert.match(descriptivePatchOperatorCatalogSql,/version<>'pg_v9_060'/)
  assert.doesNotMatch(descriptivePatchOperatorCatalogSql,/version<>'pg_v9_059'|agent_generated_/)
  assert.match(descriptivePatchOperatorCatalogSql,/left\(c\.relname,24\)<>'agent_descriptive_patch_'/)
  assert.match(descriptivePatchOperatorCatalogSql,/left\(t\.typname,25\)<>'_agent_descriptive_patch_'/)
  assert.match(descriptivePatchOperatorLockSql,/61824,271828/);assert.match(descriptivePatchOperatorLockSql,/61824,20261024/)
  assert.ok(Object.isFrozen(descriptivePatchOperatorRuntimeRoles))
  for(const role of ['agentstudio_api','agentstudio_native_auth','agentstudio_review_worker','agentstudio_review_dispatch','agentstudio_knowledge_index_worker'])assert.ok(descriptivePatchOperatorRuntimeRoles.includes(role))
  assert.match(descriptivePatchOperatorQuiescenceSql,/login\.oid=a\.usesysid/)
  assert.match(descriptivePatchOperatorQuiescenceSql,/pg_has_role\(login\.oid,runtime\.oid,'MEMBER'\)/)
  assert.doesNotMatch(descriptivePatchOperatorQuiescenceSql,/usename|rolcanlogin|rolinherit|\bstate\s*=/)
})

test('actual AST shows one fixed-body DDL, direct full059/full060 auditors, readonly recovery and no manufactured evidence or entry side effects',()=>{
  const source=readFileSync(new URL('../src/agent-descriptive-patch-operator-core.ts',import.meta.url),'utf8')
  const tree=ts.createSourceFile('operator-core.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  assert.equal(tree.parseDiagnostics.length,0)
  const calls=[]
  const scan=node=>{
    if(ts.isCallExpression(node))calls.push(node.expression.getText(tree))
    if(ts.isPropertyAccessExpression(node)&&node.expression.getText(tree)==='process')assert.notEqual(node.name.text,'env')
    if(ts.isImportDeclaration(node))assert.ok(!['pg','node:fs','node:child_process'].includes(node.moduleSpecifier.text))
    ts.forEachChild(node,scan)
  }
  scan(tree)
  assert.ok(calls.includes('assertGeneratedOperatorAuthorization'))
  assert.ok(calls.includes('verifyAgentGeneratedCredentials'));assert.ok(calls.includes('verifyAgentDescriptivePatchCredentials'))
  assert.equal(calls.includes('verifyGeneratedOperatorBackupEvidence'),false)
  assert.equal((source.match(/db\.query\(snapshot\.body\)/g)||[]).length,1)
  assert.match(source,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(source,/pid<>pg_backend_pid\(\) AND xact_start IS NOT NULL/)
  assert.doesNotMatch(source,/new Pool\(|SET SESSION AUTHORIZATION|set_config\(|actor_id\(/)
  const recovery=tree.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name.text==='recoverDescriptivePatchOperator').getText(tree)
  assert.doesNotMatch(recovery,/applyDescriptivePatchOperator|snapshot\.body|COMMIT/)
  assert.match(source,/automatic_retry_authorized:false/)
})
