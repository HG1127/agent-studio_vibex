// Guard-safe pure argument/stat/JSON/journal tests. No real secret file, target,
// backup/restore approval capability, database, pg import or local SQL engine.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import * as ts from 'typescript'
import {
  parseDescriptivePatchOperatorCliArguments,assertDescriptivePatchOperatorExternalPath,
  assertDescriptivePatchOperatorFileMetadata,parseDescriptivePatchOperatorJson,
  formatDescriptivePatchOperatorJournalLine,parseDescriptivePatchOperatorJournalFile,runDescriptivePatchOperatorCli,
} from '../src/agent-descriptive-patch-operator-cli.mjs'
const prefix='AGENT_STUDIO_DESCRIPTIVE_PATCH_060_',hash=raw=>createHash('sha256').update(raw).digest('hex'),digest='a'.repeat(64)
const expected='daa6e1c402221335d204c55e1469d290ca3aaf898b1c66fdc09d0262f5298247'
const cli=fileURLToPath(new URL('../src/agent-descriptive-patch-operator-cli.mjs',import.meta.url))
const args=mode=>['--'+mode,'--confirm-database','agent_studio','--expected-source-sha256',expected]
const env=mode=>Object.fromEntries(Object.entries({ENABLED:'true',READ_APPROVED:'APPROVE_DESCRIPTIVE_PATCH_060_READ_ONLY',
  APPROVAL_FILE:'/vault/approval.json',APPROVAL_SHA256:digest,PREDECESSOR_APPROVAL_FILE:'/vault/original059.json',PREDECESSOR_APPROVAL_SHA256:digest,
  BACKUP_MANIFEST_FILE:'/vault/backup.json',BACKUP_ARCHIVE_FILE:'/vault/archive.dump',RESTORE_EVIDENCE_FILE:'/vault/restore.json',
  ADMIN_PASSWORD_FILE:'/vault/admin.txt',ADMIN_PASSWORD_SHA256:digest,
  RUNTIME_MANIFEST_FILE:'/vault/runtime.json',RUNTIME_MANIFEST_SHA256:digest,RUNTIME_LOCK_SHA256:'eb56da11d2713724419f938ef874991fd50fc082dda09837b779ee5841a21c6a',
  ...(mode==='apply'?{WRITE_APPROVED:'APPROVE_DESCRIPTIVE_PATCH_060_INSTALL_ONLY',JOURNAL_FILE:'/vault/new-journal.jsonl'}:{}),
  ...(mode==='recover'?{JOURNAL_FILE:'/vault/existing-journal.jsonl',JOURNAL_SHA256:digest}:{}),
}).map(([k,v])=>[prefix+k,v]))
const parse=(argv,values,platform='linux',uid=0,gid=0)=>parseDescriptivePatchOperatorCliArguments(argv,values,platform,uid,gid)
const metadata=(patch={})=>({type:'file',symlink:false,uid:0,gid:0,mode:0o100600,nlink:1,size:20,...patch})
const record=(phase='before_ddl',patch={})=>({format:'agent_descriptive_patch_operator_journal_v1',source_sha256:expected,
  system_identifier:'1234567890123456789',database_oid:'42',predecessor_schema_sha256:digest,
  nonce:'00000000-0000-4000-8000-000000000001',backend_pid:77,backend_start:'synthetic identity only',phase,...patch})
function journal(records=[record(),record('commit_pending'),record('commit_unknown')],binding=digest){
  let previous=binding;const lines=[]
  for(const [index,value] of records.entries()){const entry=formatDescriptivePatchOperatorJournalLine(value,index,previous);lines.push(entry.line);previous=entry.sha256}
  return {text:lines.join(''),last:previous}
}

test('all modes require an explicit source pin; exact plan is offline and never inspects an environment getter',()=>{
  const poisoned=new Proxy({},{get(){throw Error('environment read forbidden')},ownKeys(){throw Error('environment enumeration forbidden')}})
  assert.deepEqual(parseDescriptivePatchOperatorCliArguments(['--plan','--expected-source-sha256',expected],poisoned,'win32'),{mode:'plan',expected_source_sha256:expected})
  for(const argv of [[],['--plan'],['--apply'],['--plan','--expected-source-sha256','A'.repeat(64)],[...args('preflight'),'extra'],
    ['--apply','--confirm-database','company','--expected-source-sha256',expected]])assert.throws(()=>parse(argv,env('apply')),/invalid_arguments/)
  let reads=0;const accessor=['--plan','--expected-source-sha256',expected]
  Object.defineProperty(accessor,'0',{get(){reads++;return '--plan'},enumerable:true})
  assert.throws(()=>parse(accessor,{}),/invalid_arguments/);assert.equal(reads,0)
  assert.throws(()=>parse(new Array(3),{}),/invalid_arguments/)
})

test('read/install/recovery approvals are separate, immutable, complete and contain distinct external file pins',()=>{
  for(const mode of ['preflight','apply','recover']){
    const cfg=parse(args(mode),env(mode));assert.equal(cfg.mode,mode);assert.ok(Object.isFrozen(cfg));assert.ok(Object.isFrozen(cfg.files))
    assert.equal(cfg.predecessor_approval_sha256,digest);assert.equal(cfg.admin_password_sha256,digest)
  }
  for(const key of ['ENABLED','READ_APPROVED','APPROVAL_FILE','APPROVAL_SHA256','PREDECESSOR_APPROVAL_FILE','PREDECESSOR_APPROVAL_SHA256',
    'BACKUP_MANIFEST_FILE','BACKUP_ARCHIVE_FILE','RESTORE_EVIDENCE_FILE','ADMIN_PASSWORD_FILE','ADMIN_PASSWORD_SHA256','RUNTIME_MANIFEST_FILE','RUNTIME_MANIFEST_SHA256','RUNTIME_LOCK_SHA256']){
    const values=env('preflight');delete values[prefix+key];assert.throws(()=>parse(args('preflight'),values))
  }
  for(const [mode,key] of [['apply','WRITE_APPROVED'],['apply','JOURNAL_FILE'],['recover','JOURNAL_SHA256']]){
    const values=env(mode);delete values[prefix+key];assert.throws(()=>parse(args(mode),values))
  }
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),[prefix+'WRITE_APPROVED']:'APPROVE_DESCRIPTIVE_PATCH_060_INSTALL_ONLY'}),/write_not_approved/)
  assert.throws(()=>parse(args('recover'),{...env('recover'),[prefix+'WRITE_APPROVED']:''}),/write_not_approved/)
  assert.throws(()=>parse(args('apply'),{...env('apply'),[prefix+'JOURNAL_SHA256']:digest}),/incomplete_configuration/)
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),[prefix+'JOURNAL_FILE']:'/vault/no'}),/incomplete_configuration/)
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),[prefix+'BACKUP_ARCHIVE_FILE']:'/vault/backup.json'}),/private_file_required/)
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),[prefix+'RUNTIME_LOCK_SHA256']:digest}),/incomplete_configuration/)
})

test('ordinary hosts, ambient PG/loader/TLS credentials and unknown prefix fields refuse without reading getters',()=>{
  for(const [platform,uid,gid] of [['win32',0,0],['linux',1000,0],['linux',0,1000]])assert.throws(()=>parse(args('preflight'),env('preflight'),platform,uid,gid),/disabled/)
  for(const key of ['DATABASE_URL','PGHOST','PGPASSWORD','PGPASSFILE','PGSERVICEFILE','PGOPTIONS','NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS',
    'NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_FILE','SSL_CERT_DIR','OPENSSL_CONF','OPENSSL_MODULES','NODE_PG_FORCE_NATIVE','NODE_PG_FORCE_JS','LD_PRELOAD','LD_LIBRARY_PATH','AGENT_STUDIO_GENERATED_059_APPROVAL_FILE']){
    assert.throws(()=>parse(args('preflight'),{...env('preflight'),[key]:'do-not-use'}),/ambient_configuration_refused/,key)
  }
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),PGHOST:''}),/ambient_configuration_refused/)
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),NODE_PG_FORCE_NATIVE:''}),/ambient_configuration_refused/)
  assert.throws(()=>parse(args('preflight'),{...env('preflight'),[prefix+'DATABASE_URL']:'do-not-use'}),/incomplete_configuration/)
  let reads=0;const values=env('preflight');Object.defineProperty(values,prefix+'ADMIN_PASSWORD_FILE',{get(){reads++;return '/do-not-read'},enumerable:true})
  assert.throws(()=>parse(args('preflight'),values),/disabled/);assert.equal(reads,0)
})

test('lexical private paths must be absolute canonical external POSIX files outside project and package directories',()=>{
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorExternalPath('/var/lib/studio-private/approval.json','/srv/studio'))
  for(const file of ['/srv/studio/a','/srv/studio','relative/a','/vault/../a','/vault//a','/vault/./a','/vault/a/','/vault/line\nfile','/vault/zero\0file',
    'C:\\vault\\a','/a/node_modules/secret','/a/.pnpm/secret','/a/.git/secret','/a/.codex/secret','/a/.agents/secret'])assert.throws(()=>assertDescriptivePatchOperatorExternalPath(file,'/srv/studio'),/private_file_required/,file)
})

test('actual stat policy requires root UID/GID,0700 container/0600 single-link regular files and bounded sizes',()=>{
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorFileMetadata(metadata(),'private-file'))
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorFileMetadata(metadata({type:'directory',mode:0o40700,nlink:2}),'private-directory'))
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorFileMetadata(metadata({type:'directory',mode:0o40755,nlink:2}),'directory'))
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorFileMetadata(metadata({mode:0o100644}),'source-file'))
  assert.doesNotThrow(()=>assertDescriptivePatchOperatorFileMetadata(metadata({size:0}),'journal-file'))
  for(const patch of [{uid:1},{gid:1},{symlink:true},{mode:0o100640},{mode:0o104600},{nlink:2},{type:'other'},{size:0},{size:65537}])assert.throws(()=>assertDescriptivePatchOperatorFileMetadata(metadata(patch),'private-file'),/private_file_required/)
  for(const mode of [0o40755,0o41700,0o42700,0o40770])assert.throws(()=>assertDescriptivePatchOperatorFileMetadata(metadata({type:'directory',mode,nlink:2}),'private-directory'),/private_file_required/)
  assert.throws(()=>assertDescriptivePatchOperatorFileMetadata(metadata({type:'directory',mode:0o41777,nlink:2}),'directory'),/private_file_required/)
  let reads=0;const accessor=metadata();Object.defineProperty(accessor,'uid',{get(){reads++;return 0},enumerable:true})
  assert.throws(()=>assertDescriptivePatchOperatorFileMetadata(accessor,'private-file'),/invalid_evidence/);assert.equal(reads,0)
})

test('strict bounded JSON rejects duplicate decoded keys, prototype pollution, invalid UTF8 and unsafe grammar at every depth',()=>{
  const result=parseDescriptivePatchOperatorJson(' {"a":[1,true,false,null,{"name":"员工🌱"}],"b":"quote\\\""}\n')
  assert.equal(result.a[4].name,'员工🌱');assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.a));assert.ok(Object.isFrozen(result.a[4]))
  for(const raw of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"x":{"v":1,"v":2}}','{"__proto__":{}}','{"constructor":1}','{"prototype":1}',
    '\uFEFF{}','{}\0','{"x":"\\ud800"}','{"x":"\\u0000"}','{"x":9007199254740992}','{"x":1e400}','{"x":-0}',
    '{"a":NaN}','{"a":0.1}','{"a":01}','{"a":1,}','[1,]','{} trailing','{}{}','/*x*/{}','{"x":"unclosed}',
    '['.repeat(34)+'0'+']'.repeat(34),'['+Array(4100).fill('1').join(',')+']',' '.repeat(65536)+'{}',Buffer.from([0xc3,0x28])]){
    assert.throws(()=>parseDescriptivePatchOperatorJson(raw),/invalid_evidence/)
  }
  assert.deepEqual(parseDescriptivePatchOperatorJson('[1e2,-7,0]'),[100,-7,0])
})

test('journal envelopes bind every exact LF byte to approved genesis and preserve the original request and ordered phases',()=>{
  const built=journal(),parsed=parseDescriptivePatchOperatorJournalFile(built.text,digest)
  assert.equal(parsed.sha256,hash(built.text));assert.equal(parsed.last_entry_sha256,built.last)
  assert.deepEqual(parsed.records.map(r=>r.phase),['before_ddl','commit_pending','commit_unknown'])
  assert.ok(Object.isFrozen(parsed));assert.ok(Object.isFrozen(parsed.records));assert.ok(Object.isFrozen(parsed.records[0]))
  assert.equal(parseDescriptivePatchOperatorJournalFile(journal([record()]).text,digest).records.length,1)
  assert.equal(parseDescriptivePatchOperatorJournalFile(journal([record(),record('commit_pending'),record('commit_acknowledged')]).text,digest).records[2].phase,'commit_acknowledged')
  assert.throws(()=>parseDescriptivePatchOperatorJournalFile(built.text,'b'.repeat(64)),/invalid_journal/)
})

test('journal truncation, CRLF, reserialization, duplicate fields, rewrites, reordering and mixed request identities fail closed',()=>{
  const built=journal(),lines=built.text.trimEnd().split('\n')
  const entry=JSON.parse(lines[1]);entry.record.backend_pid=99
  for(const text of [built.text.slice(0,-1),built.text.replaceAll('\n','\r\n'),built.text+'\n',lines[0]+'\n'+JSON.stringify(entry)+'\n'+lines[2]+'\n',
    lines[1]+'\n'+lines[0]+'\n',built.text.replace('"sequence":0','"sequence":0,"sequence":0'),built.text.replace('"sequence":0','"sequence": 0'),
    journal([record('commit_pending')]).text,journal([record(),record()]).text,
    journal([record(),record('commit_pending',{database_oid:'43'})]).text,
    journal([record(),record('commit_pending'),record('commit_unknown',{nonce:'00000000-0000-4000-8000-000000000002'})]).text]){
    assert.throws(()=>parseDescriptivePatchOperatorJournalFile(text,digest),/invalid_(journal|evidence)/)
  }
  assert.throws(()=>formatDescriptivePatchOperatorJournalLine(record(),3,digest),/invalid_journal/)
  assert.throws(()=>formatDescriptivePatchOperatorJournalLine(record('before_ddl',{backend_start:'\ud800'}),0,digest),/invalid_journal/)
  assert.throws(()=>formatDescriptivePatchOperatorJournalLine({...record(),extra:true},0,digest),/invalid_evidence/)
  let reads=0;const getter=record();Object.defineProperty(getter,'backend_pid',{get(){reads++;return 77},enumerable:true})
  assert.throws(()=>formatDescriptivePatchOperatorJournalLine(getter,0,digest),/invalid_evidence/);assert.equal(reads,0)
})

test('actual CLI entry and exported run refuse incomplete or ordinary operational requests without source, private files or network',async()=>{
  for(const argv of [[],['--apply'],['--plan']]){
    await assert.rejects(runDescriptivePatchOperatorCli(argv,{}),/invalid_arguments/)
    const child=spawnSync(process.execPath,[cli,...argv],{encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',DATABASE_URL:'forbidden://not-used'}})
    assert.equal(child.status,1,child.stderr);assert.equal(child.stdout,'');assert.equal(child.stderr,'DESCRIPTIVE_PATCH_060_REFUSED:descriptive_patch_operator_invalid_arguments\n')
  }
  // Deliberately half-approved even on Linux root, so this stays guard-safe
  // AFTER the parent seals the new source graph. No private path is inspected.
  const half=env('apply');delete half[prefix+'READ_APPROVED']
  const child=spawnSync(process.execPath,[cli,...args('apply')],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,...half}})
  assert.equal(child.status,1,child.stderr);assert.equal(child.stdout,'')
  assert.match(child.stderr,/DESCRIPTIVE_PATCH_060_REFUSED:descriptive_patch_operator_disabled\n/)
  assert.doesNotMatch(child.stderr,/\/vault\/|password|postgres:\/\//)
})

test('actual offline plan captures exact source pins and rejects wrong explicit pin without reading credential environment',async()=>{
  const poisoned=new Proxy({},{get(){throw Error('secret environment read')},ownKeys(){throw Error('secret environment enumeration')}})
  const plan=await runDescriptivePatchOperatorCli(['--plan','--expected-source-sha256',expected],poisoned)
  assert.equal(plan.source_sha256,expected);assert.equal(plan.expected_source_sha256,expected)
  assert.equal(plan.predecessor.source_sha256,'c934562ba2b8fa6c204bf0fa25573d2a63dc45cfdd6be22f30120a914d2d4bcb')
  for(const field of ['network_used','secret_read','writes_performed','installation_supported','recovery_supported','operator_execution_verified','production_cutover_allowed'])assert.equal(plan[field],false)
  assert.equal(plan.latest_migration,'pg_v9_060');assert.equal(plan.default_fresh_latest,'pg_v9_050')
  await assert.rejects(runDescriptivePatchOperatorCli(['--plan','--expected-source-sha256',digest],poisoned),/source_refused/)
})

test('actual AST preserves sealed-before-private-before-pg order, original raw-file proof references and fsync/readback boundary hashes',()=>{
  const source=readFileSync(cli,'utf8'),tree=ts.createSourceFile('operator-cli.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  assert.equal(tree.parseDiagnostics.length,0)
  const run=tree.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name.text==='runDescriptivePatchOperatorCli').getText(tree)
  const seal=run.indexOf('core.assertDescriptivePatchOperatorSealedSnapshot('),file=run.indexOf('readPrivate('),pg=run.indexOf('runtime.loadDescriptivePatchOperatorPg(')
  const verified=run.indexOf('runtime.verifyDescriptivePatchOperatorRuntime('),secret=run.indexOf('const credential=')
  assert.ok(seal>0&&verified>seal&&pg>verified&&file>pg&&secret>pg)
  assert.doesNotMatch(source,/import\(['"]pg['"]\)/)
  const coverage=run.indexOf('assertEntrySealed(snapshot)'),deployment=run.indexOf('assertDeployment(snapshot)'),coreImport=run.indexOf("import('./agent-descriptive-patch-operator-core.ts')")
  assert.ok(coverage>0&&deployment>coverage&&coreImport>deployment&&seal>coreImport)
  assert.match(run,/original\.verifyGeneratedOperatorBackupEvidence\(predecessorApproval,backup,restore,/)
  assert.match(run,/core\.authorizeDescriptivePatchOperator\(snapshot,approval,predecessor,predecessorApproval,/)
  assert.match(run,/readPrivate\(cfg\.files\.BACKUP_ARCHIVE_FILE,approval\.backup_archive_sha256/)
  assert.doesNotMatch(run,/restored:true|restored: true|pg18_generated_059_backup_v1/)
  for(const token of ['O_NOFOLLOW','O_EXCL','O_NONBLOCK','O_DIRECTORY','fsyncSync(fd)','fsyncSync(directory)','readback.sha256!==sha(contents)',
    'back.sha256!==sha(expectedText)','verifyReceipts(receipts)','core.assertDescriptivePatchOperatorAuthorization(snapshot,capability)'])assert.ok(source.includes(token),token)
  assert.match(run,/host:'127\.0\.0\.1',port:5333,database:'agent_studio',user:'postgres',password,ssl:false,options:''/)
  const recovery=run.slice(run.indexOf("if(cfg.mode==='recover')"),run.indexOf('const credential='))
  assert.match(recovery,/parseDescriptivePatchOperatorJournalFile/);assert.doesNotMatch(recovery,/writeSync|createJournal|applyDescriptive/)
})
