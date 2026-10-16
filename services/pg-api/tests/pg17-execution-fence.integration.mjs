// W30: opt-in GitHub-hosted disposable PG17 only. No production input interface.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import vm from 'node:vm'
import {fileURLToPath} from 'node:url'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const self=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(self),'../../..')
const refusal='refuse_non_ephemeral_pg17_execution_fence'
const sha=x=>createHash('sha256').update(x).digest('hex')
// Independent implementation of canonical raw-row hashing, checked against the library.
const canonical=x=>Array.isArray(x)?x.map(canonical):x!==null&&typeof x==='object'?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
const rawHash=x=>sha(JSON.stringify(canonical(x)))
const at='2026-10-16T00:00:00Z'
const old=['aaaaaaaaaaaaaaa','bbbbbbbbbbbbbbb']
const ar='rrrrrrrrrrrrrrr',wr='wwwwwwwwwwwwwww',spec='sssssssssssssss',workflow='vvvvvvvvvvvvvvv'
const reviewedTables=['agent_runs','workflow_runs','agent_studio_run_leases','agent_studio_side_effects']
const migration='db/postgres/migrations/pg_v9_017_legacy_execution_fence_archive.sql'
const archive='agentstudio.legacy_execution_fence_archive'

// Pure gate: no fs, dynamic imports, SQLite, child process or socket operations.
function requireEphemeral(e,platform=process.platform){
  const run=e.GITHUB_RUN_ID||'',password=e.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  const suffix=password.slice(prefix.length)
  const required={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
    AGENT_STUDIO_PG17_TEST_ENABLED:'true',AGENT_STUDIO_PG17_W30_EXECUTION_FENCE_TEST_ENABLED:'true',
    AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',AGENT_STUDIO_PG17_HOST:'127.0.0.1',
    AGENT_STUDIO_PG17_PORT:'5432',AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
    AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin'}
  if(platform!=='linux'||Object.entries(required).some(([k,v])=>e[k]!==v)||
    !/^[0-9]{1,32}$/.test(run)||!password.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(suffix)||
    new Set(suffix).size<12||!e.RUNNER_TEMP||!path.posix.isAbsolute(e.RUNNER_TEMP)||
    path.posix.normalize(e.RUNNER_TEMP)!==e.RUNNER_TEMP||e.RUNNER_TEMP.endsWith('/')||
    Object.keys(e).some(k=>/^PG/i.test(k)||
      (/^(?:DATABASE_URL|NODE_OPTIONS|NODE_PATH|AGENT_STUDIO_PG_(?:PASSWORD|IMPORT_PASSWORD|IMPORT_PASSWORD_FILE|HOST|DATABASE|IMPORT_USER))$/.test(k)&&e[k])))
    throw Error(refusal)
  return {host:'127.0.0.1',port:5432,database:'agentstudio_stage',user:'agentstudio_admin',password,
    ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:35000,
    idleTimeoutMillis:1000,application_name:'synthetic_w30_execution_fence'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
  GITHUB_RUN_ID:'123456',RUNNER_TEMP:'/tmp/w30',AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W30_EXECUTION_FENCE_TEST_ENABLED:'true',AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: every W30 gate is mandatory before filesystem or TCP',()=>{
  const e=validEnv(),deny=x=>assert.throws(()=>requireEphemeral(x,'linux'),{message:refusal})
  assert.equal(requireEphemeral(e,'linux').port,5432)
  for(const k of Object.keys(e)){
    const absent={...e};delete absent[k];deny(absent);deny({...e,[k]:'invalid'})
  }
  for(const platform of ['win32','darwin'])assert.throws(()=>requireEphemeral(e,platform),{message:refusal})
  for(const h of ['localhost','postgres','::1','production.invalid'])deny({...e,AGENT_STUDIO_PG17_HOST:h})
  for(const d of ['/','relative','/tmp/../tmp/w30','/tmp/w30/'])deny({...e,RUNNER_TEMP:d})
  for(const r of ['1\n','1x','1'.repeat(33)])deny({...e,GITHUB_RUN_ID:r})
  for(const k of ['PGHOST','PGSERVICE','PGPASSWORD','DATABASE_URL','NODE_OPTIONS','NODE_PATH',
    'AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE','AGENT_STUDIO_PG_PASSWORD'])deny({...e,[k]:'forbidden'})
  deny({...e,AGENT_STUDIO_PG17_ADMIN_PASSWORD:e.AGENT_STUDIO_PG17_ADMIN_PASSWORD.slice(0,-64)+'a'.repeat(64)})
})

test('fail-closed: rejected real entry performs no fixture FS or TCP access',()=>{
  // Node's test harness performs internal realpath/stat checks on Linux.
  // Trap source/fixture creation and sockets without intercepting the test
  // runner's own file metadata access. The pure environment gate remains FIRST.
  const preload='data:text/javascript,'+encodeURIComponent(`
    import fs from 'node:fs';import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';
    import {before} from 'node:test';before(()=>{
    // On GitHub's Linux runner the Node test harness can perform its own
    // filesystem writes after the before() hook, including RUNNER_TEMP
    // bookkeeping. Only W30's own synthetic fixture files are in scope:
    // a rejected environment must not create/read those or connect TCP.
    for(const k of ['mkdirSync','mkdtempSync','writeFileSync','appendFileSync',
                    'rmSync','readFileSync','openSync']){
      const original=fs[k];fs[k]=function(...args){
        const target=String(args[0]??'');
        if(/w30-pg17-synthetic-/.test(target))
          throw Error('W30_FORBIDDEN_FS');
        return original.apply(this,args);
      };
    }
    net.Socket.prototype.connect=()=>{throw Error('W30_FORBIDDEN_TCP')};syncBuiltinESMExports();});`)
  for(const change of [{AGENT_STUDIO_PG17_W30_EXECUTION_FENCE_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},{AGENT_STUDIO_PG17_ADMIN_PASSWORD:'real-forbidden'},
    {RUNNER_ENVIRONMENT:'self-hosted'},{RUNNER_TEMP:'relative'}]){
    const env={...validEnv(),...change}
    const child=spawnSync(process.execPath,['--import',preload,'--test',
      '--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1)
    const output=child.stdout+child.stderr
    assert.ok(output.includes(refusal),'isolation refusal must precede I/O')
    assert.ok(!/W30_FORBIDDEN_FS|W30_FORBIDDEN_TCP|ECONNREFUSED|ENOTFOUND/.test(output))
    assert.ok(!output.includes('W30_PG17_FENCE_ARCHIVE_PASS'))
  }
})

test('fail-closed: unchanged fence CLI refuses GitHub Actions without opening inputs',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(`
    import fs from 'node:fs';import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';
    for(const k of ['realpathSync','statSync','lstatSync','readFileSync','openSync']){
      const original=fs[k];fs[k]=function(...args){
        if(String(args[0]).includes('__w30_never_read__'))throw Error('W30_CLI_INPUT_OPENED');
        return original.apply(this,args);
      };
    }
    net.Socket.prototype.connect=()=>{throw Error('W30_CLI_TCP_OPENED')};syncBuiltinESMExports();`)
  const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
    path.join(root,'services/pg-api/src/stage-execution-fence-import-cli.ts'),'--plan',
    ...['snapshot','manifest','mapping','review'].flatMap(k=>['--'+k,'__w30_never_read__/'+k]),
    '--review-sha256','0'.repeat(64)],{env:{GITHUB_ACTIONS:'true'},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===1)
  assert.equal(child.stdout,'')
  assert.equal(child.stderr.trim().split(/\r?\n/).filter(l=>!l.includes('ExperimentalWarning')&&!l.includes('--trace-warnings')).join('\n'),
    'github_actions_forbidden')
  assert.ok(!/W30_CLI_INPUT_OPENED|W30_CLI_TCP_OPENED/.test(child.stderr))
})

const within=(p,dir)=>{const r=path.relative(dir,p);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)}
function checkedTemp(){
  // This is the FIRST test-body FS access, after the entire pure gate succeeds.
  const temp=process.env.RUNNER_TEMP
  let component=path.parse(temp).root
  for(const part of temp.slice(component.length).split(path.sep)){
    component=path.join(component,part)
    if(fs.lstatSync(component).isSymbolicLink())throw Error('w30_unsafe_runner_temp')
  }
  if(fs.realpathSync(temp)!==temp||!fs.statSync(temp).isDirectory()||temp===root||
    within(temp,root)||within(root,temp))throw Error('w30_unsafe_runner_temp')
  return temp
}
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
function sql(p){
  // Remove only the psql client directive; never rewrite SQL/probes/receipts.
  const s=read(p)
  assert.ok(s.split(/\r?\n/).filter(l=>l.trim().startsWith('\\')).every(l=>l.trim()==='\\set ON_ERROR_STOP on'))
  return s.split(/\r?\n/).filter(l=>l.trim()!=='\\set ON_ERROR_STOP on').join('\n')
}
const write=(p,x)=>fs.writeFileSync(p,typeof x==='string'?x:JSON.stringify(x),{mode:0o600,flag:'wx'})
const fileHash=p=>sha(fs.readFileSync(p))
function source(DatabaseSync,temp,dirs,owners,variant='primary'){
  const dir=fs.mkdtempSync(path.join(temp,'w30-pg17-synthetic-'))
  dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping','review','idp'].map(k=>[k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const agent={id:ar,rh_user_id:old[0],spec_id:spec,spec_name:'Synthetic agent',instruction:variant,
    status:'running',current_step:0,max_steps:3,model:'',config:'{}',spec_snapshot:'{}',result:'',error:'',
    checkpoint:'null',evaluation:'{}',feedback:'{}',created:at,updated:at}
  const flow={id:wr,rh_user_id:old[1],workflow_id:workflow,workflow_name:'Synthetic workflow',instruction:variant,
    status:'running',graph_snapshot:'{}',checkpoint:'null',result:'',error:'',done_nodes:0,total_nodes:2,created:at,updated:at}
  const rows={agent_runs:[agent],workflow_runs:[flow],agent_studio_run_leases:[
    {kind:'agent',run_id:ar,lease_token:'inert opaque A',acquired_ms:1,expires_ms:2,attempts:1},
    {kind:'workflow',run_id:wr,lease_token:'inert opaque B',acquired_ms:2,expires_ms:Number.MAX_SAFE_INTEGER,attempts:3}],
    agent_studio_side_effects:['started','unknown','succeeded'].map((status,i)=>({kind:i===1?'workflow':'agent',
      run_id:i===1?wr:ar,step_key:'step-'+i,tool_name:'external.synthetic.unknown-tool',args_hash:String(i+1).repeat(64),
      idempotency_key:'inert opaque '+i,status,result_text:' 原样\n\t 😀 unknown historical result '+i+' ',created_ms:1,updated_ms:3}))}
  const db=new DatabaseSync(files.snapshot)
  let tables
  try{
    db.exec('PRAGMA journal_mode=DELETE')
    // Use the actual source execution migrations, never a permissive fake schema.
    const context={module:{exports:{}},__hooks:'/synthetic',require:name=>{
      assert.equal(name,'/synthetic/modules/schema_journal.js')
      return {applySteps(_app,steps){for(const step of steps)step.apply({db:()=>({newQuery:s=>({execute:()=>db.exec(s)})})})}}
    }}
    vm.runInNewContext(read('pocketbase/pb_hooks/modules/runtime_schema.js'),context,{timeout:5000})
    context.module.exports.applyExecutionMigrations({})
    db.exec('CREATE TABLE studio_users(id TEXT,password TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT); CREATE TABLE workflows(id TEXT,rh_user_id TEXT,spec_id TEXT)')
    for(const [table,parents] of [['agent_runs',[agent]],['workflow_runs',[flow]]]){
      db.exec('CREATE TABLE '+table+'('+Object.entries(parents[0]).map(([k,v])=>k+' '+(typeof v==='number'?'INTEGER':'TEXT')).join(',')+')')
    }
    db.exec('CREATE TABLE workflow_events(id TEXT,run_id TEXT,node_id TEXT,seq INTEGER,event_type TEXT,content TEXT,created TEXT,updated TEXT)')
    for(const id of old)db.prepare('INSERT INTO studio_users VALUES(?,?)').run(id,'SYNTHETIC-NEVER-ARCHIVE-USER-FIELD')
    db.prepare('INSERT INTO agent_specs VALUES(?,?)').run(spec,old[0])
    db.prepare('INSERT INTO workflows VALUES(?,?,?)').run(workflow,old[1],'')
    for(const [table,records] of Object.entries(rows))for(const row of records)
      db.prepare('INSERT INTO '+table+' VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row))
    tables=Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")
      .all().map(({name})=>{assert.match(name,/^[a-z_]+$/);return [name,db.prepare('SELECT count(*) AS n FROM '+name).get().n]}))
  }finally{db.close()}
  fs.chmodSync(files.snapshot,0o600)
  const digest=fileHash(files.snapshot)
  const identityReview={verified_by:'Synthetic identity reviewer',approved_at:at}
  write(files.mapping,{schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
    records:old.map((old_id,i)=>({old_id,new_studio_user_id:owners[i],...identityReview}))})
  write(files.idp,{synthetic_only:true,source_sha256:digest,reviewed_by:'Synthetic IdP reviewer',
    reviewed_at:at,owners})
  const parentReview={source_sha256:digest,identity_mapping_sha256:fileHash(files.mapping),credentials_absent:true,...identityReview}
  write(files.manifest,{format:'agent-studio-sqlite-snapshot-v1',sha256:digest,bytes:fs.statSync(files.snapshot).size,tables,
    history_archive_review:{...parentReview,table:'agent_runs',row_sha256:rows.agent_runs.map(rawHash)},
    workflow_history_archive_review:{...parentReview,tables:{workflow_runs:{row_sha256:rows.workflow_runs.map(rawHash)},workflow_events:{row_sha256:[]}}}})
  const attest={reviewed_by:'Independent synthetic content reviewer',reviewed_at:at,credentials_absent:true,inert_opaque_text:true}
  // ONLY self-created synthetic bytes are self-attested here. No external file args.
  write(files.review,{format:'studio-execution-fence-source-review-v1',source_sha256:digest,
    identity_mapping_sha256:fileHash(files.mapping),manifest_sha256:fileHash(files.manifest),...attest,
    tables:Object.fromEntries(reviewedTables.map(t=>[t,{...attest,rows:rows[t].map(r=>({...attest,row_sha256:rawHash(r)}))}]))})
  assert.equal(new Set(Object.values(files).map(p=>{const s=fs.statSync(p);return s.dev+':'+s.ino})).size,5)
  const trusted=fileHash(files.review) // Synthetic-only out-of-band digest stand-in.
  const seals=Object.values(files).map(p=>{fs.chmodSync(p,0o400);return {p,hash:fileHash(p),st:fs.statSync(p)}})
  const verify=()=>{
    for(const {p,hash,st} of seals){
      assert.ok(within(p,temp)&&fs.realpathSync(p)===p&&!fs.lstatSync(p).isSymbolicLink())
      const now=fs.statSync(p)
      assert.ok(now.ino===st.ino&&now.size===st.size&&now.mtimeMs===st.mtimeMs&&now.mode===st.mode&&fileHash(p)===hash)
      assert.equal(now.mode&0o277,0)
    }
    for(const suffix of ['-wal','-shm','-journal'])assert.equal(fs.existsSync(files.snapshot+suffix),false)
  }
  verify();return {dir,files,rows,digest,trusted,verify}
}
const quote=x=>'"'+x.replaceAll('"','""')+'"'
async function fingerprint(db){
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='agentstudio' ORDER BY tablename")).rows
  const result=[]
  for(const {tablename} of tables)result.push([tablename,(await db.query(
    'SELECT row_to_json(t)::text AS row FROM agentstudio.'+quote(tablename)+' t ORDER BY row_to_json(t)::text')).rows])
  return sha(JSON.stringify(result))
}
async function zeroRuntime(db){
  for(const t of ['jobs','runs','run_steps','run_leases','external_effects','schedules','schedule_occurrences'])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n,0)
}
// All results are actual PG responses. Only the failure adapter adds an actual
// failing SQL statement after the first successful INSERT, in the SAME session.
function poolAdapter(pool,probe){return {async connect(){const c=await pool.connect();let inserted=0;return {
  release(){c.release()},async query(s,v=[]){
    if(probe&&s.startsWith('INSERT INTO '+archive)&&inserted===1){
      probe.sawFirst=(await c.query('SELECT count(*)::int AS n FROM '+archive)).rows[0].n===1
      probe.injected=true
      await c.query('SELECT 1/0') // Real 22012 abort, no mocked driver exception.
    }
    const r=await c.query(s,v)
    if(s.startsWith('INSERT INTO '+archive))inserted++
    if(probe&&s==='ROLLBACK')probe.rolledBack=true
    return {rows:r.rows}
  }}}}}

test('PG17 TCP: W30 immutable execution fence archive, synthetic only, NO-GO',async(t)=>{
  const config=requireEphemeral(process.env)
  const temp=checkedTemp(),dirs=[],fixtures=[],runtimePools=[]
  let admin,phase='bootstrap'
  try{
    const connect=net.Socket.prototype.connect
    t.mock.method(net.Socket.prototype,'connect',function(...args){
      const x=args[0],port=typeof x==='object'?x.port:x,host=typeof x==='object'?x.host:args[1]
      assert.ok(host==='127.0.0.1'&&Number(port)===5432,'w30_tcp_target_refused')
      return connect.apply(this,args)
    })
    t.mock.method(globalThis,'fetch',()=>{throw Error('w30_external_fetch_refused')})
    const [{default:pg},{DatabaseSync},fence,history,workflowHistory,agentModule]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-execution-fence-import.ts'),
      import('../src/stage-history-import.ts'),import('../src/stage-workflow-history-import.ts'),import('../src/stage-agent-import.ts')])
    const {prepareExecutionFenceImport:prepare,importLegacyExecutionFenceToStage:importFence}=fence
    admin=new pg.Pool(config);admin.on('error',()=>{})
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,inet_server_port() AS port,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super")).rows[0]
    assert.ok(g.db===config.database&&g.login===config.user&&g.role===g.login&&g.super===true&&
      g.version>=170000&&g.version<180000&&g.address!==null&&g.port===5432)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS n")).rows[0].n,null)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname<>'plpgsql'")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('agentstudio_api','agentstudio_worker','agentstudio_w30_api_login','agentstudio_w30_worker_login')")).rows[0].n,0)
    phase='real_schema_invalid_or_incomplete'
    await admin.query(sql('db/postgres/001_stage_schema.sql'))
    for(const m of ['pg_v8_011_legacy_user_provision.sql','pg_v8_012_legacy_run_history.sql',
      'pg_v9_014_legacy_workflow_history.sql'])await admin.query(sql('db/postgres/migrations/'+m))
    // Verify exact checked-in migration checksum and receipt, without adaptation.
    const raw=read(migration).replace(/\r\n/g,'\n')
    assert.equal(sha(raw.replace(/execution_fence_sql_sha256:[a-f0-9]{64}/g,'execution_fence_sql_sha256:'+'0'.repeat(64))),fence.executionFenceSqlSha256)
    assert.equal(raw.split('execution_fence_sql_sha256:'+fence.executionFenceSqlSha256).length,3)
    await admin.query(sql(migration));await admin.query(sql(migration))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    assert.equal((await admin.query("SELECT description FROM agentstudio.schema_migrations WHERE version='pg_v9_017'")).rows[0].description,
      'execution_fence_sql_sha256:'+fence.executionFenceSqlSha256)
    phase='synthetic_source'
    const owners=[randomUUID(),randomUUID()]
    const f=source(DatabaseSync,temp,dirs,owners),different=source(DatabaseSync,temp,dirs,owners,'other snapshot')
    fixtures.push(f,different)
    assert.notEqual(f.digest,different.digest)
    const prepareSource=x=>{x.verify();return prepare(x.files.snapshot,x.files.manifest,x.files.mapping,x.files.review,x.trusted)}
    const plan=prepareSource(f)
    for(const r of plan.rows)assert.equal(rawHash(r.source_record),agentModule.contentHash(r.source_record))
    assert.equal(plan.rows.length,5)
    assert.throws(()=>prepare(f.files.snapshot,f.files.manifest,f.files.mapping,f.files.review,'0'.repeat(64)),
      {message:'execution_fence_untrusted_review'})
    // Independent files with newly sealed, deliberately invalid synthetic review.
    // A matching file digest alone must never approve missing/misbound row evidence.
    const reviewData=JSON.parse(fs.readFileSync(f.files.review,'utf8'))
    for(const [name,change,code] of [
      ['missing-row',x=>x.tables.agent_studio_side_effects.rows.pop(),'execution_fence_table_review_required'],
      ['wrong-row',x=>{x.tables.agent_runs.rows[0].row_sha256='0'.repeat(64)},'execution_fence_row_review_mismatch'],
      ['same-reviewer',x=>{x.reviewed_by='Synthetic identity reviewer'},'execution_fence_source_review_required'],
      ['wrong-manifest',x=>{x.manifest_sha256='0'.repeat(64)},'execution_fence_source_review_required']]){
      const bad=structuredClone(reviewData);change(bad)
      const file=path.join(f.dir,name+'.json');write(file,bad);fs.chmodSync(file,0o400)
      assert.throws(()=>prepare(f.files.snapshot,f.files.manifest,f.files.mapping,file,fileHash(file)),{message:code})
    }
    const mutated=prepareSource(f);mutated.rows[0].owner_user_id=owners[1]
    await assert.rejects(importFence(poolAdapter(admin),mutated),{message:'execution_fence_unverified_or_mutated_plan'})
    phase='parent_identity_and_source'
    // Synthetic crosswalk scaffold, NOT a real identity approval or provisioning run.
    for(const [i,owner] of owners.entries()){
      await admin.query('INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,$2,$3,$4)',
        [owner,'https://w30.synthetic.invalid',String(i),i===0?'disabled':'active'])
      await admin.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$6)',
        [f.digest,old[i],owner,fileHash(f.files.mapping),fileHash(f.files.idp),rawHash({id:old[i]})])
    }
    const beforeParents=await fingerprint(admin)
    await assert.rejects(importFence(poolAdapter(admin),plan),{message:'execution_fence_parent_source_or_owner_mismatch'})
    assert.equal(await fingerprint(admin),beforeParents)
    // Existing parent importers write the actual historical SQL tables.
    await history.importLegacyHistoryToStage(poolAdapter(admin),history.prepareHistoryImport(f.files.snapshot,f.files.manifest,f.files.mapping))
    await workflowHistory.importLegacyWorkflowHistoryToStage(poolAdapter(admin),workflowHistory.prepareWorkflowHistoryImport(f.files.snapshot,f.files.manifest,f.files.mapping))
    for(const table of ['legacy_run_history','legacy_workflow_history']){
      const r=(await admin.query('SELECT * FROM agentstudio.'+table)).rows
      assert.equal(r.length,1);assert.equal(r[0].source_record.status,'running');assert.equal(r[0].executable,false)
      assert.equal(rawHash(r[0].source_record),r[0].payload_sha256)
    }
    await zeroRuntime(admin)
    const baseline=await fingerprint(admin)
    await assert.rejects(importFence(poolAdapter(admin),prepareSource(different)),{message:'execution_fence_target_identity_unverified'})
    assert.equal(await fingerprint(admin),baseline)
    // Deliberately inconsistent SYNTHETIC crosswalks exercise real server checks.
    // Restore exact scaffold evidence; never disable archive immutability triggers.
    for(const owner of owners){
      await admin.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1 WHERE target_user_id=$2',
        ['0'.repeat(64),owner])
      try{await assert.rejects(importFence(poolAdapter(admin),prepareSource(f)),{message:'execution_fence_target_identity_unverified'})}
      finally{await admin.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1 WHERE target_user_id=$2',
        [fileHash(f.files.mapping),owner])}
      assert.equal(await fingerprint(admin),baseline)
    }
    // Even an internally consistent reviewed identity for another synthetic source
    // cannot authorize importing against parents archived from the original source.
    await admin.query('UPDATE agentstudio.legacy_user_imports SET source_snapshot_sha256=$1,reviewed_mapping_sha256=$2,reviewed_idp_sha256=$3',
      [different.digest,fileHash(different.files.mapping),fileHash(different.files.idp)])
    try{await assert.rejects(importFence(poolAdapter(admin),prepareSource(different)),{message:'execution_fence_parent_source_or_owner_mismatch'})}
    finally{await admin.query('UPDATE agentstudio.legacy_user_imports SET source_snapshot_sha256=$1,reviewed_mapping_sha256=$2,reviewed_idp_sha256=$3',
      [f.digest,fileHash(f.files.mapping),fileHash(f.files.idp)])}
    assert.equal(await fingerprint(admin),baseline)
    phase='sql_rollback'
    const probe={}
    await assert.rejects(importFence(poolAdapter(admin,probe),plan),{message:'execution_fence_sql_failed'})
    assert.deepEqual(probe,{sawFirst:true,injected:true,rolledBack:true})
    assert.equal(await fingerprint(admin),baseline)
    await zeroRuntime(admin)
    phase='archive_and_replay'
    const result=await importFence(poolAdapter(admin),plan)
    assert.deepEqual(result,{imported:5,replayed:0,reconciled:5,execution_enabled:false,
      runtime_jobs_created:0,side_effects_created:0,production_cutover_allowed:false})
    const stored=(await admin.query('SELECT * FROM '+archive)).rows
    assert.equal(stored.length,5)
    for(const r of stored){
      const expected=plan.rows.find(x=>x.source_table===r.source_table&&x.kind===r.kind&&x.legacy_run_id===r.legacy_run_id&&x.step_key===r.step_key)
      assert.ok(expected)
      for(const k of Object.keys(expected))assert.deepEqual(r[k],expected[k])
      assert.equal(rawHash(r.source_record),r.payload_sha256)
      assert.equal(r.executable,false);assert.equal(r.evidence_status,'historical_unverified')
      for(const k of ['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256','source_review_sha256'])assert.equal(r[k],plan[k])
      assert.equal(r.owner_user_id,r.kind==='agent'?owners[0]:owners[1])
    }
    assert.ok(!JSON.stringify(stored).includes('SYNTHETIC-NEVER-ARCHIVE-USER-FIELD'))
    const first=await fingerprint(admin)
    assert.deepEqual(await importFence(poolAdapter(admin),prepareSource(f)),{...result,imported:0,replayed:5})
    assert.equal(await fingerprint(admin),first) // Includes archive UUIDs/timestamps.
    await assert.rejects(importFence(poolAdapter(admin),prepareSource(different)),{message:'execution_fence_snapshot_or_review_conflict'})
    assert.equal(await fingerprint(admin),first)
    phase='sql_fencing_and_immutability'
    // Direct SQL cannot bypass parent hash, source, reviewed owner or inert flags.
    const r=plan.rows[0]
    const insert='INSERT INTO '+archive+'(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_review_sha256,source_table,kind,legacy_run_id,step_key,legacy_owner_id,owner_user_id,parent_payload_sha256,source_record,payload_sha256,executable,evidence_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)'
    const values=[plan.source_snapshot_sha256,plan.identity_mapping_sha256,plan.manifest_sha256,plan.source_review_sha256,
      r.source_table,r.kind,r.legacy_run_id,r.step_key,r.legacy_owner_id,r.owner_user_id,r.parent_payload_sha256,JSON.stringify(r.source_record),r.payload_sha256,false,'historical_unverified']
    for(const [index,value,code] of [[0,'0'.repeat(64),'P0001'],[2,'0'.repeat(64),'P0001'],
      [9,owners[1],'P0001'],[10,'0'.repeat(64),'P0001'],[13,true,'23514'],[14,'verified','23514']]){
      const bad=[...values];bad[index]=value
      // Flags are checked before UNIQUE; parent mismatches by BEFORE INSERT trigger.
      await assert.rejects(admin.query(insert,bad),e=>e.code===code)
    }
    for(const statement of ['UPDATE '+archive+' SET executable=true','DELETE FROM '+archive,'TRUNCATE '+archive])
      await assert.rejects(admin.query(statement),e=>e.code==='P0001'&&e.message==='execution_fence_immutable')
    assert.equal(await fingerprint(admin),first)
    phase='runtime_rls'
    const rel=(await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[archive])).rows[0]
    assert.deepEqual(rel,{relrowsecurity:true,relforcerowsecurity:true})
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_policy WHERE polrelid=$1::regclass",[archive])).rows[0].n,0)
    for(const role of ['agentstudio_api','agentstudio_worker']){
      const login=role==='agentstudio_api'?'agentstudio_w30_api_login':'agentstudio_w30_worker_login'
      const password='synthetic-'+process.env.GITHUB_RUN_ID+'-'+randomBytes(32).toString('hex')
      await admin.query('CREATE ROLE '+login+" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '"+password+"'")
      await admin.query('GRANT '+role+' TO '+login)
      const pool=new pg.Pool({...config,user:login,password});pool.on('error',()=>{});runtimePools.push(pool)
      const c=await pool.connect()
      try{
        const loginFlags=(await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]
        assert.deepEqual(loginFlags,{rolsuper:false,rolbypassrls:false})
        await c.query('SET ROLE '+role)
        assert.deepEqual((await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],loginFlags)
        for(const s of ['SELECT * FROM '+archive,'INSERT INTO '+archive+' DEFAULT VALUES',
          'UPDATE '+archive+' SET executable=true','DELETE FROM '+archive,'TRUNCATE '+archive])
          await assert.rejects(c.query(s),e=>e.code==='42501')
        await admin.query('GRANT SELECT ON '+archive+' TO '+role)
        try{
          for(const actor of ['',...owners,randomUUID()]){
            await c.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
            assert.equal((await c.query('SELECT count(*)::int AS n FROM '+archive)).rows[0].n,0)
          }
        }finally{await admin.query('REVOKE SELECT ON '+archive+' FROM '+role)}
      }finally{c.release()}
    }
    await zeroRuntime(admin);assert.equal(await fingerprint(admin),first)
    for(const x of fixtures)x.verify()
  }catch{
    // Fixed phase is public; driver SQL diagnostics, row diffs and credentials are not.
    throw Error('w30_pg17_fence_trial_failed_redacted phase='+phase)
  }finally{
    try{for(const p of runtimePools)await p.end()}finally{
      try{if(admin)await admin.end()}finally{
        for(const dir of dirs){
          if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('w30-pg17-synthetic-')||
            fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('w30_cleanup_refused')
          fs.rmSync(dir,{recursive:true,force:true})
        }
      }
    }
    // No DROP/restore. GitHub owns service destruction, including failed schema DDL.
  }
  console.log('W30_PG17_FENCE_ARCHIVE_PASS real_tcp=true synthetic_only=true cutover=NO-GO')
})
