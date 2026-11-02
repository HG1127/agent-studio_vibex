import {requireMonitorOrdinaryProfileCi} from './helpers/monitor-ordinary-profile-ci-guard.mjs'
const permit=requireMonitorOrdinaryProfileCi()
const [{default:assert},{default:test},fs,path,url,crypto,child,{nativeMonitor074ReviewedSources:reviewed}]=await Promise.all([import('node:assert/strict'),import('node:test'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto'),import('node:child_process'),import('./helpers/native-monitor074-reviewed-sources.mjs')])
// The shared immutable inventory proves bytes only. This purpose has its own
// admission above and grants neither074 execution nor external source egress.
const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),'../../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
function sources(){
 assert(reviewed&&Object.isFrozen(reviewed));assert.equal(child.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),permit.head)
 assert.equal(child.execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim(),'')
 for(const file of ['services/pg-api/src/native-monitor-schema-profile.ts','services/pg-api/src/native-ordinary-case-audit.ts','services/pg-api/src/native-monitor-live-audit.ts','services/pg-api/tests/helpers/monitor-ordinary-profile-ci-guard.mjs','services/pg-api/tests/native-monitor-ordinary-profile-genuine-pg18.test.mjs','db/postgres/migrations/pg_v9_077_ordinary_case_runs.sql','services/pg-api/tests/helpers/native-monitor074-prerequisites.mjs'])assert(Object.hasOwn(reviewed,file),file)
 for(const [relative,hash]of Object.entries(reviewed)){
  assert(/^[A-Za-z0-9_./-]+$/.test(relative)&&!relative.startsWith('/')&&!relative.split('/').includes('..'));assert.match(hash,/^[a-f0-9]{64}$/)
  let at=root;for(const part of relative.split('/')){assert(!fs.lstatSync(at).isSymbolicLink());at=path.join(at,part)}
  const stat=fs.lstatSync(at);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=16*1024*1024);assert.equal(sha(fs.readFileSync(at)),hash,relative)
 }
}
sources()
const [{agentDesignGenuineFixture},{installMonitor074Prerequisites},{inspectOptionalMonitorLive},{inspectOptionalOrdinaryCase}]=await Promise.all([import('./helpers/agent-design-genuine-fixture.mjs'),import('./helpers/native-monitor074-prerequisites.mjs'),import('../src/native-monitor-live-audit.ts'),import('../src/native-ordinary-case-audit.ts')])
test('actual explicit074+077 schema profile retains default refusal and rejects modified or unrelated incoming edges',{timeout:180000},async()=>{
 let f,altered=false,shadow=false;const cleanup=[];let primary
 const originalFK='ALTER TABLE agentstudio.ordinary_case_runs DROP CONSTRAINT ordinary_case_runs_fk3; ALTER TABLE agentstudio.ordinary_case_runs ADD CONSTRAINT ordinary_case_runs_fk3 FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id)'
 try{
  f=await agentDesignGenuineFixture();sources();await installMonitor074Prerequisites(f)
  for(const file of ['pg_v9_073_monitor_inbox.sql','pg_v9_074_monitor_live.sql','pg_v9_077_ordinary_case_runs.sql'])await f.db.exec(fs.readFileSync(path.join(root,'db/postgres/migrations',file),'utf8'))
  assert.equal(await inspectOptionalMonitorLive(f.pool,permit.profile),'installed');assert.equal(await inspectOptionalOrdinaryCase(f.pool),'installed')
  await assert.rejects(inspectOptionalMonitorLive(f.pool),/unsafe_monitor_live/)
  await f.db.exec(originalFK+' ON DELETE CASCADE');altered=true
  await assert.rejects(inspectOptionalMonitorLive(f.pool,permit.profile),/unsafe_monitor_live_schema_profile/)
  await f.db.exec(originalFK);altered=false
  assert.equal(await inspectOptionalOrdinaryCase(f.pool),'installed')
  await f.db.exec('CREATE TABLE agentstudio.fixture_unapproved_monitor_edge(case_id uuid,owner_user_id uuid,CONSTRAINT fixture_unapproved_monitor_edge_fk FOREIGN KEY(case_id,owner_user_id) REFERENCES agentstudio.monitor_live_cases(id,owner_user_id))');shadow=true
  await assert.rejects(inspectOptionalMonitorLive(f.pool,permit.profile),/unsafe_monitor_live_schema_profile/)
  await f.db.exec('DROP TABLE agentstudio.fixture_unapproved_monitor_edge');shadow=false
  assert.equal(await inspectOptionalOrdinaryCase(f.pool),'installed');sources()
 }catch(error){primary=error}
 finally{
  if(f){if(shadow)try{await f.db.exec('DROP TABLE agentstudio.fixture_unapproved_monitor_edge')}catch(error){cleanup.push(error)};if(altered)try{await f.db.exec(originalFK)}catch(error){cleanup.push(error)};try{await f.close()}catch(error){cleanup.push(error)}}
 }
 if(primary||cleanup.length)throw new AggregateError([...(primary?[primary]:[]),...cleanup],'monitor_ordinary_profile_genuine_failed')
})
