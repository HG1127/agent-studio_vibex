import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {spawnSync} from 'node:child_process'
import {contentHash} from '../src/stage-agent-import.ts'
import {executionFenceSqlSha256} from '../src/stage-execution-fence-import.ts'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const cli=path.join(root,'services/pg-api/src/stage-execution-fence-import-cli.ts')
const temp=path.join(root,'.tmp')
fs.mkdirSync(temp,{recursive:true})
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x))
const edit=(p,fn)=>{const x=JSON.parse(fs.readFileSync(p));fn(x);write(p,x)}
const owner='aaaaaaaaaaaaaaa',run='rrrrrrrrrrrrrrr',flow='wwwwwwwwwwwwwww'
const marker='SYNTHETIC-PRIVATE-NOT-FOR-OUTPUT'
const att={reviewed_by:'independent synthetic security reviewer',reviewed_at:'2026-10-16T00:00:00Z',credentials_absent:true,inert_opaque_text:true}
const tables=['agent_runs','workflow_runs','agent_studio_run_leases','agent_studio_side_effects']
// All bytes and attestations are synthetic. Only this fixture issues digests;
// mutation/forgery tests retain the separately pinned original review digest.
function fixture(){
  const dir=fs.mkdtempSync(path.join(temp,'fence-cli-synthetic-'))
  const f=Object.fromEntries(['snapshot','manifest','mapping','review'].map(k=>[k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const db=new DatabaseSync(f.snapshot)
  const context={module:{exports:{}},__hooks:'/synthetic',require:()=>({applySteps(_app,steps){
    for(const step of steps)step.apply({db:()=>({newQuery:s=>({execute:()=>db.exec(s)})})})
  }})}
  vm.runInNewContext(fs.readFileSync(path.join(root,'pocketbase/pb_hooks/modules/runtime_schema.js'),'utf8'),context)
  context.module.exports.applyExecutionMigrations({})
  db.exec('CREATE TABLE studio_users(id TEXT); CREATE TABLE agent_runs(id TEXT,rh_user_id TEXT,content TEXT); CREATE TABLE workflow_runs(id TEXT,rh_user_id TEXT,content TEXT)')
  db.prepare('INSERT INTO studio_users VALUES(?)').run(owner)
  db.prepare('INSERT INTO agent_runs VALUES(?,?,?)').run(run,owner,marker)
  db.prepare('INSERT INTO workflow_runs VALUES(?,?,?)').run(flow,owner,'synthetic flow')
  db.prepare('INSERT INTO agent_studio_run_leases VALUES(?,?,?,?,?,?)').run('agent',run,'inert synthetic lease',1,2,1)
  db.prepare('INSERT INTO agent_studio_side_effects VALUES(?,?,?,?,?,?,?,?,?,?)').run('workflow',flow,'step','synthetic','a'.repeat(64),'inert synthetic key','unknown',marker,1,2)
  db.close()
  f.mutate=fn=>{const db=new DatabaseSync(f.snapshot);try{fn(db)}finally{db.close()}}
  f.issueSyntheticReview=()=>{
    const db=new DatabaseSync(f.snapshot,{readOnly:true})
    try{
      const sha=hash(f.snapshot)
      write(f.manifest,{format:'agent-studio-sqlite-snapshot-v1',sha256:sha,bytes:fs.statSync(f.snapshot).size,
        tables:Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'").all().map(({name})=>[name,db.prepare('SELECT count(*) AS n FROM '+name).get().n]))})
      write(f.mapping,{schema_version:'studio-approved-identity-map-v2',source_sha256:sha,records:[{old_id:owner,new_studio_user_id:'11111111-1111-4111-8111-111111111111',verified_by:'synthetic identity reviewer',approved_at:att.reviewed_at}]})
      write(f.review,{format:'studio-execution-fence-source-review-v1',source_sha256:sha,manifest_sha256:hash(f.manifest),identity_mapping_sha256:hash(f.mapping),...att,
        tables:Object.fromEntries(tables.map(t=>[t,{...att,rows:db.prepare('SELECT * FROM '+t).all().map(r=>({...att,row_sha256:contentHash(r)}))}]))})
      f.trusted=hash(f.review)
    }finally{db.close()}
  }
  f.issueSyntheticReview()
  f.args=(mode='--plan')=>[mode,...['snapshot','manifest','mapping','review'].flatMap(k=>['--'+k,f[k]]),'--review-sha256',f.trusted]
  f.close=()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(temp)+path.sep));fs.rmSync(dir,{recursive:true,force:true})}
  return f
}
// Runs in every child: any driver import or network attempt is fatal and marks
// stderr. A passing plan must never even resolve pg. No real PG is contacted.
const guard=`
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns';
const blocked=()=>{process.stderr.write('FORBIDDEN_NETWORK_ATTEMPT');throw Error('blocked')};
net.Socket.prototype.connect=blocked;http.request=blocked;https.request=blocked;dns.lookup=blocked;globalThis.fetch=blocked;
syncBuiltinESMExports();
registerHooks({resolve(specifier,context,next){if(specifier==='pg'){process.stderr.write('FORBIDDEN_PG_IMPORT');throw Error('blocked')}return next(specifier,context)}});
`
const guardUrl='data:text/javascript,'+encodeURIComponent(guard)
function invoke(args,overrides={},preload=guardUrl,entry=cli){
  const env={...process.env}
  for(const k of Object.keys(env))if(/^PG|^AGENT_STUDIO_PG_|^GITHUB_ACTIONS$|^NODE_OPTIONS$|^DATABASE_URL$/i.test(k))delete env[k]
  Object.assign(env,overrides)
  const r=spawnSync(process.execPath,['--experimental-strip-types','--import',preload,entry,...args],{env,encoding:'utf8',timeout:15000})
  assert.ifError(r.error)
  assert.doesNotMatch(r.stderr,/FORBIDDEN_NETWORK_ATTEMPT|FORBIDDEN_PG_IMPORT/)
  return r
}
function refused(r,code){
  assert.equal(r.status,1);assert.equal(r.stdout,'')
  if(code)assert.ok(r.stderr.split(/\r?\n/).includes(code),r.stderr)
  for(const s of [marker,owner,run,flow,att.reviewed_by,root])assert.equal(r.stderr.includes(s),false)
}
const target={AGENT_STUDIO_PG_STAGE_FENCE_IMPORT_ENABLED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',AGENT_STUDIO_PG_DATABASE:'agentstudio_stage',AGENT_STUDIO_PG_IMPORT_USER:'agentstudio_admin'}

test('good synthetic offline plan: exact allowlist, no driver/network, all four inputs unchanged',()=>{
  const f=fixture();try{
    const files=['snapshot','manifest','mapping','review'].map(k=>f[k]),before=files.map(hash)
    const result=invoke(f.args(),{PGHOST:'forbidden.example',AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:'missing-private-path'})
    assert.equal(result.status,0,result.stderr)
    assert.deepEqual(JSON.parse(result.stdout),{source_sha256:hash(f.snapshot),counts:{parents:2,leases:1,side_effect_records:1},source_read_only:true,executable:false,execution_enabled:false,runtime_jobs_created:0,runtime_runs_created:0,side_effects_created:0,production_cutover_allowed:false})
    assert.deepEqual(files.map(hash),before)
    assert.deepEqual(fs.readdirSync(path.dirname(f.snapshot)).sort(),['manifest.json','mapping.json','review.json','snapshot.sqlite'])
    for(const s of [marker,run,flow,owner,att.reviewed_by,f.snapshot,f.trusted])assert.equal(result.stdout.includes(s),false)
  }finally{f.close()}
})
test('strict mode/options and independent 64hex SHA required; uppercase hex accepted',()=>{
  const f=fixture();try{
    for(const args of [[],f.args().slice(1),[...f.args(),'--execute'],[...f.args(),'--plan'],[...f.args(),'--host','prod'],f.args().slice(0,-2),[...f.args().slice(0,-1),'x'.repeat(64)]])refused(invoke(args))
    assert.equal(invoke([...f.args().slice(0,-1),f.trusted.toUpperCase()]).status,0)
    refused(invoke([...f.args().slice(0,-1),'0'.repeat(64)]),'execution_fence_import_refused')
  }finally{f.close()}
})
test('forged review is rejected against pinned digest; no automatic hashing',()=>{
  const f=fixture();try{
    const trusted=f.trusted
    edit(f.review,r=>r.reviewed_by='forged content reviewer')
    assert.notEqual(hash(f.review),trusted)
    refused(invoke(f.args()),'execution_fence_import_refused')
  }finally{f.close()}
})

// Synthetic driver/filesystem boundary only. No password is written outside the
// workspace and no PG17 connection is made. The actual W27 importer runs intact.
function executeGuard(f,wrongDatabase=false,sqlFailure=false){
  const db=new DatabaseSync(f.snapshot,{readOnly:true})
  let parents
  try{parents=Object.fromEntries(['agent_runs','workflow_runs'].map(t=>[t,db.prepare('SELECT * FROM '+t).get()]))}finally{db.close()}
  const driver=`
    import assert from 'node:assert/strict';
    import {contentHash} from ${JSON.stringify(pathToFileURL(path.join(root,'services/pg-api/src/stage-agent-import.ts')).href)};
    const parents=${JSON.stringify(parents)}, archive=[];
    let poolCount=0, ended=0, released=0,commits=0,rollbacks=0;
    process.on('exit',()=>{assert.equal(poolCount,ended);assert.equal(poolCount,released);assert.equal(${wrongDatabase||sqlFailure},rollbacks>0);if(!${wrongDatabase||sqlFailure})assert.equal(commits,poolCount)});
    export class Pool {
      constructor(c){poolCount++;assert.deepEqual(c,{host:'127.0.0.1',port:5432,database:'agentstudio_stage',user:'agentstudio_admin',password:'synthetic-external-password-value-1234567890',ssl:false,options:'',application_name:'execution_fence_archive',max:1,connectionTimeoutMillis:5000,statement_timeout:35000,idleTimeoutMillis:1000})}
      on(){} async end(){ended++}
      async connect(){return {release(){released++},async query(s,v=[]){
        if(s==='COMMIT'){commits++;return {rows:[]}}
        if(s==='ROLLBACK'){rollbacks++;return {rows:[]}}
        if(${sqlFailure}&&s.startsWith('LOCK TABLE'))throw Error('synthetic SQL private diagnostic ${marker}');
        if(s==='BEGIN'||s.startsWith('SET LOCAL')||s.startsWith('LOCK TABLE'))return {rows:[]};
        if(s.startsWith('SELECT current_database()'))return {rows:[{database:${JSON.stringify(wrongDatabase?'production':'agentstudio_stage')},login:'agentstudio_admin',role:'agentstudio_admin',admin:true,version:170004}]};
        if(s.includes("WHERE version='pg_v9_017'"))return {rows:[{description:'execution_fence_sql_sha256:${executionFenceSqlSha256}'}]};
        if(s.startsWith('SELECT 1 FROM agentstudio.jobs UNION')||s.startsWith('SELECT 1 FROM agentstudio.legacy_execution_fence_archive WHERE source_snapshot'))return {rows:[]};
        if(s.startsWith('SELECT 1 FROM agentstudio.legacy_user_imports'))return {rows:[{}]};
        if(s.startsWith('SELECT * FROM agentstudio.legacy_run_history')||s.startsWith('SELECT * FROM agentstudio.legacy_workflow_history')){
          const raw=parents[v[0]];return {rows:[{owner_user_id:'11111111-1111-4111-8111-111111111111',executable:false,source_snapshot_sha256:'${hash(f.snapshot)}',identity_mapping_sha256:'${hash(f.mapping)}',manifest_sha256:'${hash(f.manifest)}',payload_sha256:contentHash(raw),source_record:raw}]};
        }
        if(s.startsWith('INSERT INTO agentstudio.legacy_execution_fence_archive')){
          const keys=['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256','source_review_sha256','source_table','kind','legacy_run_id','step_key','legacy_owner_id','owner_user_id','parent_payload_sha256','source_record','payload_sha256'];
          const row=Object.fromEntries(keys.map((k,i)=>[k,k==='source_record'?JSON.parse(v[i]):v[i]]));archive.push({...row,executable:false,evidence_status:'historical_unverified'});return {rows:[]};
        }
        if(s.startsWith('SELECT * FROM agentstudio.legacy_execution_fence_archive'))return {rows:archive.filter(r=>[r.source_table,r.kind,r.legacy_run_id,r.step_key].every((x,i)=>x===v[i]))};
        if(s.startsWith('SELECT count(*)::int AS n FROM agentstudio.legacy_execution_fence_archive'))return {rows:[{n:archive.length}]};
        throw Error('unexpected synthetic query ${marker}');
      }}}
    }
  `
  const driverUrl='data:text/javascript,'+encodeURIComponent(driver)
  const secret=path.resolve(root,'../synthetic-virtual-fence-password')
  const setup=`
    import fs from 'node:fs';
    const secret=${JSON.stringify(secret)},real=fs.realpathSync,stat=fs.statSync,read=fs.readFileSync,lstat=fs.lstatSync;
    fs.realpathSync=(p,...a)=>p===secret?secret:real(p,...a);
    fs.lstatSync=(p,...a)=>p===secret?{isSymbolicLink:()=>false}:lstat(p,...a);
    fs.statSync=(p,...a)=>p===secret?{isFile:()=>true,size:44,mode:0o600,dev:987654,ino:987654}:stat(p,...a);
    fs.readFileSync=(p,...a)=>p===secret?Buffer.from('synthetic-external-password-value-1234567890'):read(p,...a);
    syncBuiltinESMExports();
    registerHooks({resolve(s,c,n){if(s==='pg')return {url:${JSON.stringify(driverUrl)},shortCircuit:true};return n(s,c)}});
  `
  return {secret,preload:'data:text/javascript,'+encodeURIComponent(guard.slice(0,guard.indexOf('registerHooks({'))+setup)}
}
test('execute delegates real W27 transaction/import/replay and emits only sanitized receipt via synthetic PG driver',()=>{
  const f=fixture();try{
    const {secret,preload}=executeGuard(f)
    const args=[...f.args('--execute'),'--confirm-stage','agentstudio_stage']
    // data entry is passed via -e; invokes the public wrapper twice in one
    // process so the synthetic DB can prove unchanged replay behavior.
    const script=`import {runCli} from ${JSON.stringify(pathToFileURL(cli).href)};const args=${JSON.stringify(args)};console.log(JSON.stringify([await runCli(args),await runCli(args)]));`
    const r=invoke(['--input-type=module','-e',script],{...target,AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:secret},preload,'--no-warnings')
    assert.equal(r.status,0,r.stderr)
    const [first,second]=JSON.parse(r.stdout)
    assert.deepEqual(first.counts,{parents:2,leases:1,side_effect_records:1,imported:2,replayed:0,reconciled:2})
    assert.deepEqual(second.counts,{parents:2,leases:1,side_effect_records:1,imported:0,replayed:2,reconciled:2})
    for(const report of [first,second])for(const key of ['executable','execution_enabled','production_cutover_allowed'])assert.equal(report[key],false)
    for(const s of [marker,run,flow,owner,secret,att.reviewed_by])assert.equal((r.stdout+r.stderr).includes(s),false)
  }finally{f.close()}
})
test('execute rolls back wrong server identity, closes driver and redacts SQL failure',()=>{
  const f=fixture();try{
    const {secret,preload}=executeGuard(f,true)
    refused(invoke([...f.args('--execute'),'--confirm-stage','agentstudio_stage'],{...target,AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:secret},preload),'execution_fence_import_refused')
  }finally{f.close()}
})
test('execute redacts raw driver SQL diagnostics and rolls back/releases on injected failure',()=>{
  const f=fixture();try{
    const {secret,preload}=executeGuard(f,false,true)
    refused(invoke([...f.args('--execute'),'--confirm-stage','agentstudio_stage'],{...target,AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:secret},preload),'execution_fence_import_refused')
  }finally{f.close()}
})
test('omitted source row, forged row SHA and review/source/mapping/manifest bindings fail closed',()=>{
  const cases=[
    f=>edit(f.review,r=>r.tables.agent_studio_run_leases.rows=[]),
    f=>edit(f.review,r=>r.tables.workflow_runs.rows[0].row_sha256='0'.repeat(64)),
    f=>edit(f.review,r=>r.source_sha256='0'.repeat(64)),
    f=>edit(f.review,r=>r.identity_mapping_sha256='0'.repeat(64)),
    f=>edit(f.review,r=>r.manifest_sha256='0'.repeat(64)),
    f=>edit(f.review,r=>r.reviewed_by='synthetic identity reviewer'),
    f=>edit(f.review,r=>r.tables.agent_runs.rows[0].credentials_absent=false),
    f=>edit(f.review,r=>delete r.tables.workflow_runs),
  ]
  for(const change of cases){const f=fixture();try{
    change(f)
    // Synthetic adversarial approvals only: even a newly pinned forged document
    // cannot bypass the W27 structural/row/provenance checks.
    f.trusted=hash(f.review)
    refused(invoke(f.args()),'execution_fence_import_refused')
  }finally{f.close()}}
})
test('source SHA mismatch, hot backup and omitted inventory fail closed',()=>{
  for(const change of [f=>fs.appendFileSync(f.snapshot,'changed'),...['-wal','-shm','-journal'].map(s=>f=>fs.writeFileSync(f.snapshot+s,'synthetic')),f=>{
    edit(f.manifest,m=>delete m.tables.studio_users);edit(f.review,r=>r.manifest_sha256=hash(f.manifest));f.trusted=hash(f.review)
  }]){const f=fixture();try{change(f);refused(invoke(f.args()),'execution_fence_import_refused')}finally{f.close()}}
})
test('secret text, schema/field mismatch and orphan parent refuse even with synthetic approval',()=>{
  for(const change of [
    db=>db.prepare('UPDATE agent_studio_side_effects SET result_text=?').run('password='+marker),
    db=>db.prepare('UPDATE agent_studio_run_leases SET lease_token=?').run('Bearer '+marker),
    db=>db.exec('ALTER TABLE agent_studio_run_leases ADD COLUMN extra TEXT'),
    db=>db.prepare('UPDATE agent_studio_run_leases SET run_id=?').run('ooooooooooooooo'),
  ]){const f=fixture();try{f.mutate(change);f.issueSyntheticReview();refused(invoke(f.args()),'execution_fence_import_refused')}finally{f.close()}}
})
test('execute requires operator confirmation, enable flag, exact host/db/admin before driver access',()=>{
  const f=fixture();try{
    refused(invoke(f.args('--execute'),target),'stage_confirmation_required')
    const args=[...f.args('--execute'),'--confirm-stage','agentstudio_stage']
    refused(invoke([...f.args('--execute'),'--confirm-stage','production'],target),'stage_confirmation_required')
    refused(invoke(args),'stage_import_disabled')
    for(const extra of [{AGENT_STUDIO_PG_HOST:'localhost'},{AGENT_STUDIO_PG_HOST:'prod.example'},{AGENT_STUDIO_PG_HOST:'127.0.0.1.evil'},{AGENT_STUDIO_PG_DATABASE:'postgres'},{AGENT_STUDIO_PG_IMPORT_USER:'postgres'}])refused(invoke(args,{...target,...extra}),'unsafe_postgres_target')
    for(const extra of [{PGHOST:'prod'},{PGOPTIONS:'unsafe'},{DATABASE_URL:['postgres:','//synthetic-user:','not-a-secret@','example.invalid/db'].join('')},{AGENT_STUDIO_PG_PASSWORD:marker}])refused(invoke(args,{...target,...extra}),'ambient_pg_configuration_forbidden')
    refused(invoke(args,target),'external_password_file_required')
    refused(invoke(args,{...target,AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:f.snapshot}),'external_password_file_required')
  }finally{f.close()}
})
test('GitHub Actions is refused before reading inputs; network paths and FS errors are redacted',()=>{
  const f=fixture();try{
    refused(invoke(f.args(),{GITHUB_ACTIONS:'true'}),'github_actions_forbidden')
    refused(invoke([...f.args('--execute'),'--confirm-stage','agentstudio_stage'],{...target,GITHUB_ACTIONS:'true'}),'github_actions_forbidden')
    for(const name of ['\\\\prod\\share\\'+marker,'https://prod/'+marker,path.join(temp,marker)]){
      const args=f.args();args[2]=name;refused(invoke(args))
    }
    const args=f.args();args[4]=f.snapshot;refused(invoke(args),'execution_fence_import_refused')
  }finally{f.close()}
})
