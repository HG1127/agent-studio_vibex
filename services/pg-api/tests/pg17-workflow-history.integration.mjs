// W23: synthetic-only, standalone; refuse before pg/SQLite/importer imports or TCP.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const self=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(self),'../../..')
const sha=data=>createHash('sha256').update(data).digest('hex')
const stamp='2026-10-15T01:00:00.000Z'
const refusal='refuse_non_ephemeral_pg17_workflow_history'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_W23_WORKFLOW_HISTORY_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED!=='true'||
    env.AGENT_STUDIO_PG17_HOST!=='127.0.0.1'||
    env.AGENT_STUDIO_PG17_DATABASE!=='agentstudio_stage'||
    env.AGENT_STUDIO_PG17_ADMIN_USER!=='agentstudio_admin'||
    env.AGENT_STUDIO_PG17_PORT!=='5432'||
    !/^[0-9]{1,32}$/.test(run)||run.trim()!==run||!password.startsWith(prefix)||
    password.slice(prefix.length).length!==64||
    !/^[a-f0-9]{64}$/.test(password.slice(prefix.length))||
    new Set(password.slice(prefix.length)).size<12||
    !env.RUNNER_TEMP||!path.posix.isAbsolute(env.RUNNER_TEMP)||
    path.posix.normalize(env.RUNNER_TEMP)!==env.RUNNER_TEMP||env.RUNNER_TEMP==='/')
    throw Error(refusal)
  return {host:'127.0.0.1',port:5432,database:'agentstudio_stage',
    user:'agentstudio_admin',password,ssl:false,options:'',max:1,
    connectionTimeoutMillis:5000,statement_timeout:20000,idleTimeoutMillis:1000,
    application_name:'synthetic_w23_workflow_history'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w23',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W23_WORKFLOW_HISTORY_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W23 environment gates are mandatory before imports or I/O',()=>{
  const valid=validEnv(),deny=env=>assert.throws(()=>requireEphemeral(env,'linux'),
    e=>e.message===refusal)
  assert.equal(requireEphemeral(valid,'linux').host,'127.0.0.1')
  for(const key of Object.keys(valid)){
    const absent={...valid};delete absent[key]
    deny(absent)
    deny({...valid,[key]:'invalid'})
  }
  for(const platform of ['win32','darwin'])assert.throws(
    ()=>requireEphemeral(valid,platform),e=>e.message===refusal)
  for(const host of ['localhost','postgres','::1','neon.invalid'])
    deny({...valid,AGENT_STUDIO_PG17_HOST:host})
  for(const run of ['','12x','1\n','1'.repeat(33)])deny({...valid,GITHUB_RUN_ID:run})
  for(const suffix of ['', 'a'.repeat(64)])deny({...valid,
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+suffix})
  for(const run of ['1\n','1\r','123x'])deny({...valid,GITHUB_RUN_ID:run,
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-'+run+'-'+randomBytes(32).toString('hex')})
  deny({...valid,AGENT_STUDIO_PG17_ADMIN_PASSWORD:valid.AGENT_STUDIO_PG17_ADMIN_PASSWORD+'\n'})
  deny({...valid,RUNNER_ENVIRONMENT:'self-hosted'})
  for(const run of ['1\n','1\r','1\t'])deny({...valid,GITHUB_RUN_ID:run,
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-'+run+'-'+randomBytes(32).toString('hex')})
  deny({...valid,AGENT_STUDIO_PG17_ADMIN_PASSWORD:valid.AGENT_STUDIO_PG17_ADMIN_PASSWORD+'\n'})
  for(const temp of ['/','/tmp/../tmp/w23','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W23 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';import fs from 'node:fs';import {registerHooks} from 'node:module';"+
    "Object.defineProperty(process,'platform',{value:'linux'});"+
    "net.Socket.prototype.connect=function(){throw Error('W23_FORBIDDEN_SOCKET')};"+
    "for(const key of ['writeFileSync','appendFileSync','mkdtempSync','mkdirSync','chmodSync','rmSync'])"+
    "fs[key]=()=>{throw Error('W23_FORBIDDEN_WRITE')};"+
    "registerHooks({resolve(specifier,context,next){"+
    "if(specifier==='pg'||specifier==='node:sqlite'||specifier.endsWith('/stage-workflow-history-import.ts')||specifier.endsWith('/stage-agent-import.ts'))"+
    "throw Error('W23_FORBIDDEN_IMPORT');return next(specifier,context)}});")
  for(const change of [{AGENT_STUDIO_PG17_W23_WORKFLOW_HISTORY_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'},
    {RUNNER_TEMP:'/__w23_nonexistent_runner_temp__'}]){
    const env={...process.env,...validEnv(),...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!out.includes('W23_PG17_WORKFLOW_HISTORY_PASS'),'a refused entry cannot report real PG17 success')
    assert.ok(!/W23_FORBIDDEN_(SOCKET|WRITE|IMPORT)|ECONNREFUSED|ENOTFOUND/.test(out),
      'no socket, filesystem write or database/importer import attempted')
  }
})

const sqlFile=file=>fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)
  .filter(line=>!line.trim().startsWith('\\')).join('\n')
const quote=name=>'"'+name.replaceAll('"','""')+'"'
async function fingerprint(db){
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='agentstudio' ORDER BY tablename")).rows
  const rows=[]
  for(const {tablename} of tables)rows.push([tablename,(await db.query(
    `SELECT row_to_json(t)::text AS row FROM agentstudio.${quote(tablename)} t ORDER BY row_to_json(t)::text`)).rows])
  return sha(JSON.stringify(rows))
}
async function zero(db,tables){
  for(const table of tables)assert.equal((await db.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,0)
}
function contained(file,dir){
  const rel=path.relative(dir,file)
  return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)
}
function checkedTemp(candidate=process.env.RUNNER_TEMP,io=fs){
  try{
    const temp=io.realpathSync(candidate)
    if(temp!==candidate||!io.statSync(temp).isDirectory()||io.lstatSync(temp).isSymbolicLink()||
      temp===root||contained(temp,root)||contained(root,temp))throw Error(refusal)
    io.accessSync(temp,fs.constants.W_OK|fs.constants.X_OK)
    return temp
  }catch{throw Error(refusal)}
}
test('fail-closed: real runner temp must be canonical, writable and outside the project',()=>{
  const candidate=path.resolve(root,'..','w23-runner-temp')
  const io={realpathSync:p=>p,statSync:()=>({isDirectory:()=>true}),
    lstatSync:()=>({isSymbolicLink:()=>false}),accessSync:()=>{}}
  assert.equal(checkedTemp(candidate,io),candidate)
  const deny=(p,mock)=>assert.throws(()=>checkedTemp(p,mock),e=>e.message===refusal)
  for(const p of [root,path.join(root,'fixtures'),path.dirname(root)])deny(p,io)
  deny(candidate,{...io,realpathSync:()=>root})
  deny(candidate,{...io,realpathSync:()=>{throw Error('private_path')}})
  deny(candidate,{...io,statSync:()=>({isDirectory:()=>false})})
  deny(candidate,{...io,lstatSync:()=>({isSymbolicLink:()=>true})})
  deny(candidate,{...io,accessSync:()=>{throw Error('private_path')}})
})
function privateFile(file,data){fs.writeFileSync(file,data,{mode:0o600,flag:'wx'})}
function guardSource(){
  return `import net from 'node:net';
import cp from 'node:child_process';
import dns from 'node:dns';import dgram from 'node:dgram';
import http from 'node:http';import https from 'node:https';
import http2 from 'node:http2';import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const x=args[0];const port=typeof x==='object'?x.port:x;
 const host=typeof x==='object'?x.host:args[1];
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W23_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W23_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W23_EXTERNAL_FETCH_REFUSED')};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])
 cp[k]=()=>{throw Error('W23_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W23 guard rejects external networking and arbitrary children',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(guardSource())
  const probe=[
    "import assert from 'node:assert/strict';",
    "import net from 'node:net';import dns from 'node:dns';import dgram from 'node:dgram';",
    "import http from 'node:http';import https from 'node:https';import http2 from 'node:http2';",
    "import tls from 'node:tls';import cp from 'node:child_process';",
    "for(const action of [",
    "()=>net.connect({host:'external.invalid',port:5432}),()=>net.connect({host:'127.0.0.1',port:443}),",
    "()=>net.connect('/tmp/forbidden.sock'),()=>dns.lookup('external.invalid',()=>{}),",
    "()=>dns.promises.resolve('external.invalid'),()=>dgram.createSocket('udp4'),",
    "()=>fetch('https://external.invalid'),()=>http.get('http://external.invalid'),",
    "()=>https.request('https://external.invalid'),()=>http2.connect('https://external.invalid'),",
    "()=>tls.connect({host:'external.invalid',port:443}),()=>cp.spawnSync(process.execPath,['-e','']),",
    "()=>cp.execSync('forbidden'),()=>cp.spawn(process.execPath,[]),()=>cp.fork('forbidden')",
    "])assert.throws(action,/W23_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W23_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W23_GUARD_PASS')
})


// Every source byte is generated here. Never accept external source paths.
function fixture(DatabaseSync,temp,identity,contentHash,change=()=>{},metadata=()=>{}){
  const dir=fs.mkdtempSync(path.join(temp,'w23-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  identity.dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping','idp'].map(k=>
    [k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const key=sha('W23-'+process.env.GITHUB_RUN_ID).slice(0,14)
  const ids={a:'a'+key,b:'b'+key,w:'c'+key,s:'d'+key,r:'e'+key,e:'f'+key}
  const marker='W23_PRIVATE_'+randomBytes(16).toString('hex')
  const run={id:ids.r,rh_user_id:ids.a,workflow_id:ids.w,workflow_name:'合成 '+marker,
    instruction:' 原样\n\t 😀 '+marker,status:'running',graph_snapshot:' \n { \t } ',
    checkpoint:' null \n',result:(' 历史全文\t🙂 '+marker+'\n').repeat(2000),error:'',
    done_nodes:1,total_nodes:3,created:'2026-10-15 00:00:00.000Z',updated:'2026-10-15 01:00:00.000Z'}
  const event={id:ids.e,run_id:ids.r,node_id:'node-1',seq:1,event_type:'synthetic',
    content:' \t[ \n ] ',created:run.created,updated:run.updated}
  const db=new DatabaseSync(files.snapshot)
  try{
    db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE studio_users(id TEXT);'+
      'CREATE TABLE workflows(id TEXT,rh_user_id TEXT,spec_id TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT)')
    for(const owner of [ids.a,ids.b])db.prepare('INSERT INTO studio_users VALUES(?)').run(owner)
    db.prepare('INSERT INTO workflows VALUES(?,?,?)').run(ids.w,ids.a,ids.s)
    db.prepare('INSERT INTO agent_specs VALUES(?,?)').run(ids.s,ids.a)
    for(const [table,raw] of [['workflow_runs',run],['workflow_events',event]]){
      db.exec('CREATE TABLE '+table+'('+Object.keys(raw).map(k=>quote(k)+' '+
        (typeof raw[k]==='number'?'NUMERIC':'TEXT')).join(',')+')')
      db.prepare('INSERT INTO '+table+' VALUES('+Object.keys(raw).map(()=>'?').join(',')+')').run(...Object.values(raw))
    }
    change(db,ids)
  }finally{db.close()}
  const digest=sha(fs.readFileSync(files.snapshot))
  const review={verified_by:'W23 synthetic reviewer '+process.env.GITHUB_RUN_ID,approved_at:stamp}
  const mapping={schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
    records:[[ids.a,identity.owners[0]],[ids.b,identity.owners[1]]].map(([old_id,new_studio_user_id])=>
      ({old_id,new_studio_user_id,...review}))}
  privateFile(files.mapping,JSON.stringify(mapping))
  const read=new DatabaseSync(files.snapshot,{readOnly:true})
  let tables,reviewTables
  try{
    tables=Object.fromEntries(read.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map(({name})=>[name,read.prepare('SELECT count(*) AS n FROM '+quote(name)).get().n]))
    reviewTables=Object.fromEntries(['workflow_runs','workflow_events'].map(t=>
      [t,{row_sha256:read.prepare('SELECT * FROM '+t+' ORDER BY id').all().map(contentHash)}]))
  }finally{read.close()}
  const manifest={format:'agent-studio-sqlite-snapshot-v1',sha256:digest,
    bytes:fs.statSync(files.snapshot).size,tables,workflow_history_archive_review:{
      source_sha256:digest,identity_mapping_sha256:sha(fs.readFileSync(files.mapping)),
      credentials_absent:true,...review,tables:reviewTables}}
  metadata(manifest);privateFile(files.manifest,JSON.stringify(manifest))
  const idp={run_id:process.env.GITHUB_RUN_ID,issuer:'w23-synthetic',
    records:identity.owners.map((target_user_id,i)=>({target_user_id,
      subject:'w23-'+process.env.GITHUB_RUN_ID+'-'+i,status:i?'active':'disabled',...review})),...review}
  privateFile(files.idp,JSON.stringify(idp))
  const frozen=Object.values(files).map(file=>{
    fs.chmodSync(file,0o400);return {file,hash:sha(fs.readFileSync(file)),size:fs.statSync(file).size}
  })
  function verify(){
    assert.equal(fs.statSync(dir).mode&0o077,0)
    for(const f of frozen){
      const st=fs.statSync(f.file)
      assert.equal(st.size,f.size);assert.equal(sha(fs.readFileSync(f.file)),f.hash)
      assert.equal(st.mode&0o222,0);assert.equal(st.mode&0o077,0)
    }
    for(const suffix of ['-wal','-shm','-journal'])assert.equal(fs.existsSync(files.snapshot+suffix),false)
  }
  verify()
  return {files,ids,run,event,marker,digest,verify,idp,
    idpHash:sha(fs.readFileSync(files.idp)),
    prepare:reader=>reader(files.snapshot,files.manifest,files.mapping)}
}
const unused=['jobs','runs','run_steps','approvals','external_effects','run_leases','workflows',
  'agent_specs','schedules','schedule_occurrences','knowledge_bases','knowledge_documents',
  'knowledge_chunks','teams','team_memberships','audit_events','template_invites','legacy_agent_imports']
function reportCheck(actual,imported,replayed){
  assert.deepEqual(actual,{imported,replayed,reconciled:2,execution_enabled:false,
    model_execution_enabled:false,history_verified:false,runtime_jobs_created:0,
    side_effects_created:0,production_cutover_allowed:false})
}

// Run last: guards remain installed until the standalone process exits.
test('PG17 TCP: W23 Workflow history atomic archive, resume, replay, RLS, NO-GO',async()=>{
  const config=requireEphemeral(process.env)
  const temp=checkedTemp()
  const identity={owners:[randomUUID(),randomUUID()],dirs:[]}
  let admin,api,checkpoint='network_guard'
  try{
    await import('data:text/javascript,'+encodeURIComponent(guardSource()))
    const [{default:pg},{DatabaseSync},{prepareWorkflowHistoryImport:prepare,
      importLegacyWorkflowHistoryToStage:archive},{contentHash}]=await Promise.all([
        import('pg'),import('node:sqlite'),import('../src/stage-workflow-history-import.ts'),
        import('../src/stage-agent-import.ts')])
    checkpoint='empty_target_preflight'
    admin=new pg.Pool(config)
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,"+
      "inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super")).rows[0]
    assert.ok(g.db==='agentstudio_stage'&&g.login==='agentstudio_admin'&&g.role===g.login&&g.super===true)
    assert.ok(g.version>=170000&&g.version<180000&&g.address!==null&&g.port===5432)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS schema")).rows[0].schema,null)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_namespace WHERE "+
      "nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_w23_archive_login')")).rows[0].n,0)
    checkpoint='unmodified_schema_001_011_014'
    for(const file of ['db/postgres/001_stage_schema.sql',
      'db/postgres/migrations/pg_v8_011_legacy_user_provision.sql',
      'db/postgres/migrations/pg_v9_014_legacy_workflow_history.sql'])await admin.query(sqlFile(file))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    const f=fixture(DatabaseSync,temp,identity,contentHash)
    for(let i=0;i<2;i++){
      await admin.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'w23-synthetic',$2,$3)",
        [identity.owners[i],f.idp.records[i].subject,f.idp.records[i].status])
      await admin.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,'+
        'target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$6)',
        [f.digest,i?f.ids.b:f.ids.a,identity.owners[i],sha(fs.readFileSync(f.files.mapping)),f.idpHash,
          contentHash(f.idp.records[i])])
    }
    checkpoint='frozen_reader_refusals'
    const before=await fingerprint(admin)
    const plan=f.prepare(prepare)
    assert.equal(plan.rows.length,2)
    for(const [change,metadata,code] of [
      [()=>{},m=>{m.sha256='0'.repeat(64)},'manifest_invalid'],
      [()=>{},m=>{delete m.tables.agent_specs},'manifest_not_complete'],
      [()=>{},m=>{m.workflow_history_archive_review.tables.workflow_events.row_sha256=['0'.repeat(64)]},'review_or_count_mismatch'],
      [(db,ids)=>db.prepare('UPDATE workflows SET rh_user_id=?').run(ids.b),()=>{},'workflow_missing_or_foreign'],
      [(db,ids)=>db.prepare('UPDATE agent_specs SET rh_user_id=?').run(ids.b),()=>{},'spec_missing_or_foreign'],
      [(db,ids)=>db.prepare('UPDATE workflow_events SET run_id=?').run(ids.b),()=>{},'run_missing_or_foreign'],
      [db=>db.prepare('UPDATE workflow_runs SET graph_snapshot=?').run('{"nodes":[]}'),()=>{},'structured_history_not_supported'],
      [db=>db.prepare('UPDATE workflow_runs SET checkpoint=?').run('0'),()=>{},'structured_history_not_supported'],
      [db=>db.prepare('UPDATE workflow_events SET content=?').run('{"text":"opaque"}'),()=>{},'structured_history_not_supported']
    ]){
      const bad=fixture(DatabaseSync,temp,identity,contentHash,change,metadata)
      assert.throws(()=>bad.prepare(prepare),e=>e.message==='workflow_history_'+code);bad.verify()
    }
    for(const mutate of [p=>{p.source_snapshot_sha256='0'.repeat(64)},
      p=>{p.rows[1].owner_user_id=identity.owners[1]},
      p=>{p.rows[1].legacy_run_id=f.ids.b}]){
      const bad=f.prepare(prepare);mutate(bad)
      await assert.rejects(archive(admin,bad),e=>e.message==='workflow_history_unverified_or_mutated_plan')
    }
    assert.equal(await fingerprint(admin),before)
    checkpoint='reviewed_identity_refusal'
    for(const column of ['source_snapshot_sha256','reviewed_mapping_sha256']){
      await admin.query('UPDATE agentstudio.legacy_user_imports SET '+column+'=$1',['0'.repeat(64)])
      await assert.rejects(archive(admin,f.prepare(prepare)),e=>e.message==='workflow_history_target_identity_unverified')
      await admin.query('UPDATE agentstudio.legacy_user_imports SET '+column+'=$1',
        [column==='source_snapshot_sha256'?plan.source_snapshot_sha256:plan.identity_mapping_sha256])
    }
    // Swap only synthetic target bindings; UUID uniqueness stays enforced.
    await admin.query('DELETE FROM agentstudio.legacy_user_imports WHERE legacy_user_id=$1',[f.ids.b])
    await admin.query('UPDATE agentstudio.legacy_user_imports SET target_user_id=$1',[identity.owners[1]])
    await assert.rejects(archive(admin,f.prepare(prepare)),e=>e.message==='workflow_history_target_identity_unverified')
    await admin.query('UPDATE agentstudio.legacy_user_imports SET target_user_id=$1',[identity.owners[0]])
    await admin.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,target_user_id,'+
      'reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$6)',
      [f.digest,f.ids.b,identity.owners[1],plan.identity_mapping_sha256,f.idpHash,contentHash(f.idp.records[1])])
    // Reinserted audit timestamp differs; capture the fully restored baseline.
    const restored=await fingerprint(admin)
    checkpoint='real_sql_fault_after_run_insert'
    const trace=[],seen={inserts:0,sqlstate:null}
    const failing={async connect(){const db=await admin.connect();return {release(){db.release()},async query(sql,values=[]){
      trace.push(sql)
      if(sql.startsWith('INSERT INTO agentstudio.legacy_workflow_history')&&values[3]==='workflow_events'){
        assert.equal((await db.query('SELECT count(*)::int AS n FROM agentstudio.legacy_workflow_history')).rows[0].n,1)
        try{await db.query('SELECT 1 / 0')}catch(error){seen.sqlstate=error.code;throw error}
        throw Error('sql_fault_did_not_fire')
      }
      const result=await db.query(sql,values)
      if(sql.startsWith('INSERT INTO agentstudio.legacy_workflow_history'))seen.inserts++
      return result
    }}}}
    await assert.rejects(archive(failing,plan),e=>e.message==='workflow_history_sql_failed')
    assert.equal(seen.sqlstate,'22012');assert.equal(seen.inserts,1)
    assert.equal(trace[0],'BEGIN');assert.equal(trace.at(-1),'ROLLBACK');assert.ok(!trace.includes('COMMIT'))
    await zero(admin,['legacy_workflow_history']);assert.equal(await fingerprint(admin),restored)
    f.verify()
    checkpoint='resume_and_byte_fidelity'
    reportCheck(await archive(admin,f.prepare(prepare)),2,0)
    const first=await fingerprint(admin)
    const rows=(await admin.query('SELECT * FROM agentstudio.legacy_workflow_history ORDER BY source_table DESC')).rows
    assert.equal(rows.length,2)
    for(let i=0;i<2;i++){
      const row=rows[i],raw=i===0?f.run:f.event
      assert.deepEqual(row.source_record,raw)
      for(const [key,value] of Object.entries(raw))if(typeof value==='string')
        assert.ok(Buffer.from(row.source_record[key],'utf8').equals(Buffer.from(value,'utf8')))
      assert.equal(row.payload_sha256,contentHash(raw))
      for(const key of ['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256'])assert.equal(row[key],plan[key])
      assert.equal(row.owner_user_id,identity.owners[0]);assert.equal(row.legacy_run_id,f.ids.r)
      assert.equal(row.legacy_workflow_id,f.ids.w)
      assert.equal(row.executable,false);assert.equal(row.model_execution_enabled,false)
      assert.equal(row.evidence_status,'historical_unverified')
    }
    assert.equal(rows[0].source_record.status,'running')
    reportCheck(await archive(admin,f.prepare(prepare)),0,2)
    assert.equal(await fingerprint(admin),first)
    checkpoint='foreign_source_and_sql_parent_refused'
    const other=fixture(DatabaseSync,temp,identity,contentHash)
    await assert.rejects(archive(admin,other.prepare(prepare)),e=>e.message==='workflow_history_snapshot_or_review_conflict')
    for(const [owner,runId] of [[identity.owners[1],f.ids.r],[identity.owners[0],f.ids.b]]){
      await assert.rejects(admin.query('INSERT INTO agentstudio.legacy_workflow_history(source_snapshot_sha256,'+
        'identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,'+
        'legacy_workflow_id,source_record,payload_sha256) SELECT source_snapshot_sha256,identity_mapping_sha256,'+
        "manifest_sha256,source_table,$1,$2::uuid,$3,legacy_workflow_id,"+
        "jsonb_set(jsonb_set(source_record,'{id}',to_jsonb($1::text)),'{run_id}',to_jsonb($3::text)),payload_sha256 "+
        "FROM agentstudio.legacy_workflow_history WHERE source_table='workflow_events'",
        ['g'+f.ids.e.slice(1),owner,runId]),e=>e.code==='23503')
    }
    checkpoint='wrong_role_and_force_rls'
    assert.deepEqual((await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class "+
      "WHERE oid='agentstudio.legacy_workflow_history'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true})
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='agentstudio' "+
      "AND tablename='legacy_workflow_history'")).rows[0].n,0)
    const password='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w23_archive_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+password+"'")
    await admin.query('GRANT agentstudio_api,agentstudio_worker TO agentstudio_w23_archive_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w23_archive_login')
    api=new pg.Pool({...config,user:'agentstudio_w23_archive_login',password})
    await assert.rejects(archive(api,f.prepare(prepare)),e=>e.message==='workflow_history_wrong_stage_database_or_version')
    const client=await api.connect()
    try{
      assert.deepEqual((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],
        {rolsuper:false,rolbypassrls:false})
      for(const role of ['agentstudio_api','agentstudio_worker']){
        await client.query('RESET ROLE');await client.query('SET ROLE '+role)
        for(const actor of ['',randomUUID(),...identity.owners]){
          await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
          for(const sql of ['SELECT * FROM agentstudio.legacy_workflow_history',
            'INSERT INTO agentstudio.legacy_workflow_history DEFAULT VALUES',
            'UPDATE agentstudio.legacy_workflow_history SET executable=true',
            'DELETE FROM agentstudio.legacy_workflow_history','TRUNCATE agentstudio.legacy_workflow_history'])
            await assert.rejects(client.query(sql),e=>e.code==='42501')
        }
      }
      try{
        await admin.query('GRANT SELECT ON agentstudio.legacy_workflow_history TO agentstudio_api,agentstudio_worker')
        for(const role of ['agentstudio_api','agentstudio_worker']){
          await client.query('RESET ROLE');await client.query('SET ROLE '+role)
          for(const actor of ['',randomUUID(),...identity.owners]){
            await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
            await zero(client,['legacy_workflow_history'])
          }
        }
      }finally{await admin.query('REVOKE SELECT ON agentstudio.legacy_workflow_history FROM agentstudio_api,agentstudio_worker')}
    }finally{client.release()}
    checkpoint='immutable_and_no_runtime'
    for(const sql of ['UPDATE agentstudio.legacy_workflow_history SET executable=false',
      'DELETE FROM agentstudio.legacy_workflow_history','TRUNCATE agentstudio.legacy_workflow_history'])
      await assert.rejects(admin.query(sql),e=>e.code==='P0001'&&e.message==='legacy_workflow_history_immutable')
    await zero(admin,unused)
    for(const table of ['model_connections','agent_studio_kb_embedding_queue'])
      assert.equal((await admin.query('SELECT to_regclass($1) AS t',['agentstudio.'+table])).rows[0].t,null)
    assert.deepEqual((await admin.query('SELECT status FROM agentstudio.users ORDER BY external_subject')).rows,
      [{status:'disabled'},{status:'active'}])
    assert.equal(await fingerprint(admin),first);f.verify();other.verify()
  }catch{
    throw Error('w23_pg17_workflow_history_failed_redacted checkpoint='+checkpoint)
  }finally{
    try{
      try{if(api)await api.end()}finally{
        try{if(admin)await admin.end()}finally{
          for(const dir of identity.dirs){
            if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('w23-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')||
              fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('w23_cleanup_refused')
            fs.rmSync(dir,{recursive:true,force:true})
          }
        }
      }
    }catch{throw Error('w23_pg17_workflow_history_cleanup_failed_redacted')}
  }
  console.log('W23_PG17_WORKFLOW_HISTORY_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO')
})
