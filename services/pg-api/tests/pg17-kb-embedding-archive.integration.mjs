// W17: synthetic-only, standalone; refuse before pg/SQLite/importer imports or TCP.
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
const refusal='refuse_non_ephemeral_pg17_kb_embedding_archive'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_W17_EMBEDDING_ARCHIVE_TEST_ENABLED!=='true'||
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
    application_name:'synthetic_w17_embedding_archive'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w17',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W17_EMBEDDING_ARCHIVE_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W17 environment gates are mandatory before imports or I/O',()=>{
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
  for(const temp of ['/','/tmp/../tmp/w17','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W17 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';import fs from 'node:fs';import {registerHooks} from 'node:module';"+
    "Object.defineProperty(process,'platform',{value:'linux'});"+
    "net.Socket.prototype.connect=function(){throw Error('W17_FORBIDDEN_SOCKET')};"+
    "for(const key of ['writeFileSync','appendFileSync','mkdtempSync','mkdirSync','chmodSync','rmSync'])"+
    "fs[key]=()=>{throw Error('W17_FORBIDDEN_WRITE')};"+
    "registerHooks({resolve(specifier,context,next){"+
    "if(specifier==='pg'||specifier==='node:sqlite'||specifier.endsWith('/stage-kb-embedding-state-import.ts'))"+
    "throw Error('W17_FORBIDDEN_IMPORT');return next(specifier,context)}});")
  for(const change of [{AGENT_STUDIO_PG17_W17_EMBEDDING_ARCHIVE_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'},
    {RUNNER_TEMP:'/__w17_nonexistent_runner_temp__'}]){
    const env={...process.env,...validEnv(),...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!out.includes('W17_PG17_EMBEDDING_ARCHIVE_PASS'),'a refused entry cannot report real PG17 success')
    assert.ok(!/W17_FORBIDDEN_(SOCKET|WRITE|IMPORT)|ECONNREFUSED|ENOTFOUND/.test(out),
      'no socket, filesystem write or database/importer import attempted')
  }
})

// Every byte is generated here; no external snapshot, URL, model or Worker input.
const archives=['legacy_kb_embedding_snapshots','legacy_kb_embedding_base_refs','legacy_kb_embedding_state_archive']
const unused=['jobs','runs','knowledge_bases','knowledge_documents','knowledge_chunks','schedules',
  'schedule_occurrences','run_steps','external_effects','teams','team_memberships']
const source={settings:'agent_studio_kb_embedding_settings',queue:'agent_studio_kb_embedding_queue'}
function fixture(DatabaseSync,temp,identity,change=()=>{}){
  const dir=fs.mkdtempSync(path.join(temp,'w17-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  identity.dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping'].map(k=>
    [k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const marker='W17_PRIVATE_'+randomBytes(16).toString('hex')
  const settings={rh_user_id:'staffA',connection_id:'connA',model_name:marker+' 旧模型🙂\n  ',updated_ms:1792030400123}
  const queue={rh_user_id:'staffA',base_id:'baseA',attempts:7,next_attempt_ms:1792030400456,
    lease_until_ms:1792030499999,last_error:marker+" 历史错误🙂\n\t'; DROP TABLE agentstudio.jobs; -- <script>throw Error('execute')</script>  ",updated_ms:1792030400789}
  const db=new DatabaseSync(files.snapshot)
  let tables
  try{
    db.exec(`PRAGMA journal_mode=DELETE;
      CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);
      CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT,base_url TEXT);
      CREATE TABLE agent_studio_kb_bases(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT);
      CREATE TABLE agent_studio_kb_embedding_settings(rh_user_id TEXT PRIMARY KEY,connection_id TEXT NOT NULL,model_name TEXT NOT NULL,updated_ms INTEGER NOT NULL);
      CREATE TABLE agent_studio_kb_embedding_queue(rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER,PRIMARY KEY(rh_user_id,base_id));`)
    for(const suffix of ['A','B']){
      db.prepare('INSERT INTO studio_users VALUES(?,?)').run('staff'+suffix,marker+' password sentinel')
      db.prepare('INSERT INTO model_connections VALUES(?,?,?,?)').run('conn'+suffix,'staff'+suffix,marker+' secret sentinel','https://never-call.synthetic.invalid')
      db.prepare('INSERT INTO agent_studio_kb_bases VALUES(?,?,?)').run('base'+suffix,'staff'+suffix,marker+' unused base')
    }
    db.prepare('INSERT INTO agent_studio_kb_embedding_settings VALUES(?,?,?,?)').run(...Object.values(settings))
    db.prepare('INSERT INTO agent_studio_kb_embedding_queue VALUES(?,?,?,?,?,?,?)').run(...Object.values(queue))
    change(db)
    tables=Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all()
      .map(({name})=>[name,Number(db.prepare('SELECT count(*) AS n FROM "'+name+'"').get().n)]))
  }finally{db.close()}
  fs.chmodSync(files.snapshot,0o600)
  const bytes=fs.readFileSync(files.snapshot),digest=sha(bytes)
  privateFile(files.manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:digest,bytes:bytes.length,tables}))
  privateFile(files.mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
    records:identity.owners.map((owner,i)=>({old_id:i===0?'staffA':'staffB',new_studio_user_id:owner,
      verified_by:'Synthetic independent reviewer',approved_at:stamp}))}))
  for(const file of Object.values(files))fs.chmodSync(file,0o400)
  const seals=Object.values(files).map(file=>({file,hash:sha(fs.readFileSync(file)),stat:fs.statSync(file)}))
  const verify=()=>{
    for(const s of seals){
      const st=fs.statSync(s.file)
      assert.ok(path.dirname(s.file)===dir&&fs.realpathSync(s.file)===s.file&&!fs.lstatSync(s.file).isSymbolicLink())
      assert.ok(st.size===s.stat.size&&st.mtimeMs===s.stat.mtimeMs&&sha(fs.readFileSync(s.file))===s.hash)
      assert.equal(st.mode&0o222,0);assert.equal(st.mode&0o077,0)
    }
    for(const suffix of ['-wal','-shm','-journal'])assert.equal(fs.existsSync(files.snapshot+suffix),false)
  }
  verify();return {files,marker,digest,settings,queue,verify}
}
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
function reportCheck(report,imported,replayed,f,config,identity){
  assert.deepEqual(report,{stage_only:true,archive_only:true,embedding_enabled:false,jobs_created:0,
    production_cutover_allowed:false,imported,replayed})
  const out=JSON.stringify(report)
  for(const value of [config.password,f.marker,f.settings.model_name,f.queue.last_error,...identity.owners,
    ...Object.values(f.files),'staffA','staffB','connA','connB','baseA','baseB'])assert.ok(!out.includes(value))
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
  const candidate=path.resolve(root,'..','w17-runner-temp')
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
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W17_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W17_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W17_EXTERNAL_FETCH_REFUSED')};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])
 cp[k]=()=>{throw Error('W17_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W17 guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W17_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W17_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W17_GUARD_PASS')
})

// Run last: network/child guards stay installed until this standalone process exits.
test('PG17 TCP: W17 inert embedding archive, atomic SQL rollback, retry, RLS and replay, NO-GO',async()=>{
  // All environment/path guards precede pg, SQLite, importer and TCP access.
  const config=requireEphemeral(process.env)
  const temp=checkedTemp()
  const identity={owners:[randomUUID(),randomUUID()],dirs:[]}
  let admin,api,checkpoint='network_guard'
  try{
    await import('data:text/javascript,'+encodeURIComponent(guardSource()))
    const [{default:pg},{DatabaseSync},{loadKbEmbeddingStateSnapshot,importKbEmbeddingStateArchive}]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-kb-embedding-state-import.ts')])
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
      "('agentstudio_api','agentstudio_worker','agentstudio_w17_archive_login')")).rows[0].n,0)
    checkpoint='unmodified_schema'
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    await admin.query(sqlFile('db/postgres/migrations/pg_v8_013_legacy_kb_embedding_state.sql'))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    for(let i=0;i<2;i++)await admin.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'w17-synthetic',$2,'disabled')",
      [identity.owners[i],'synthetic-'+randomUUID()])
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.users WHERE status='disabled'")).rows[0].n,2)
    checkpoint='frozen_fixture_and_cross_owner_refusals'
    const f=fixture(DatabaseSync,temp,identity)
    const before=await fingerprint(admin)
    const batch=loadKbEmbeddingStateSnapshot(f.files)
    assert.equal(batch.snapshot,f.digest)
    assert.deepEqual(batch.bases,[{id:'baseA',legacyOwner:'staffA',owner:identity.owners[0]},
      {id:'baseB',legacyOwner:'staffB',owner:identity.owners[1]}])
    assert.ok(Object.isFrozen(batch)&&Object.isFrozen(batch.rows)&&batch.rows.every(Object.isFrozen))
    const batchText=JSON.stringify(batch)
    for(const secret of [f.marker+' secret sentinel',f.marker+' password sentinel','https://never-call.synthetic.invalid'])
      assert.ok(!batchText.includes(secret))
    for(const [change,code] of [
      [d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET base_id='baseB'"),'base_owner_reference'],
      [d=>d.exec("UPDATE agent_studio_kb_embedding_settings SET connection_id='connB'"),'connection_owner_reference']]){
      const bad=fixture(DatabaseSync,temp,identity,change)
      assert.throws(()=>loadKbEmbeddingStateSnapshot(bad.files),e=>e.message==='kb_embedding_archive_'+code)
      bad.verify()
    }
    f.verify();assert.equal(await fingerprint(admin),before)
    checkpoint='actual_sql_fault_after_first_row'
    const trace=[],seen={inserts:0,sqlstate:null}
    const failing={async connect(){const db=await admin.connect();return {release(){db.release()},async query(sql,values=[]){
      trace.push(sql)
      if(sql.startsWith('INSERT INTO agentstudio.legacy_kb_embedding_state_archive')&&values[1]===source.queue){
        const counts=(await db.query('SELECT (SELECT count(*)::int FROM agentstudio.legacy_kb_embedding_snapshots) AS audit,'+
          '(SELECT count(*)::int FROM agentstudio.legacy_kb_embedding_base_refs) AS bases,'+
          '(SELECT count(*)::int FROM agentstudio.legacy_kb_embedding_state_archive) AS rows')).rows[0]
        assert.deepEqual(counts,{audit:1,bases:2,rows:1})
        try{await db.query('SELECT 1 / 0')}catch(error){seen.sqlstate=error.code;throw error}
        throw Error('sql_fault_did_not_fire')
      }
      const result=await db.query(sql,values)
      if(sql.startsWith('INSERT INTO agentstudio.legacy_kb_embedding_state_archive'))seen.inserts++
      return result
    }}}}
    await assert.rejects(importKbEmbeddingStateArchive(failing,batch),e=>e.message==='kb_embedding_archive_sql_failed')
    assert.equal(seen.sqlstate,'22012');assert.equal(seen.inserts,1)
    assert.equal(trace[0],'BEGIN');assert.equal(trace.at(-1),'ROLLBACK');assert.ok(!trace.includes('COMMIT'))
    await zero(admin,archives);assert.equal(await fingerprint(admin),before)
    checkpoint='resume_retry_and_lossless_reconciliation'
    reportCheck(await importKbEmbeddingStateArchive(admin,batch),2,0,f,config,identity)
    const first=await fingerprint(admin)
    const audit=(await admin.query('SELECT * FROM agentstudio.legacy_kb_embedding_snapshots')).rows
    assert.equal(audit.length,1)
    assert.equal(audit[0].source_snapshot_sha256,batch.snapshot)
    assert.equal(audit[0].inventory_sha256,batch.inventory)
    assert.equal(audit[0].approved_mapping,batch.mapping)
    assert.equal(audit[0].mapping_sha256,sha(batch.mapping))
    assert.equal(batch.mappingHash,sha(batch.mapping))
    const bases=(await admin.query('SELECT * FROM agentstudio.legacy_kb_embedding_base_refs ORDER BY legacy_base_id COLLATE "C"')).rows
    assert.deepEqual(bases,batch.bases.map(b=>({source_snapshot_sha256:batch.snapshot,legacy_base_id:b.id,legacy_owner_id:b.legacyOwner,owner_user_id:b.owner})))
    const actual=(await admin.query('SELECT * FROM agentstudio.legacy_kb_embedding_state_archive ORDER BY source_table DESC')).rows
    assert.equal(actual.length,2)
    for(let i=0;i<2;i++){
      const a=actual[i],r=batch.rows[i],expected=i===0?f.settings:f.queue
      assert.equal(a.source_snapshot_sha256,f.digest);assert.equal(a.source_table,r.table)
      assert.equal(a.legacy_row_id,r.id);assert.equal(a.legacy_owner_id,r.legacyOwner)
      assert.equal(a.owner_user_id,identity.owners[0]);assert.equal(a.legacy_base_id,r.base)
      assert.equal(a.raw_payload,JSON.stringify(expected));assert.equal(a.raw_payload,r.raw)
      assert.equal(a.payload_sha256,sha(a.raw_payload));assert.equal(a.payload_sha256,r.hash)
      assert.deepEqual(JSON.parse(a.raw_payload),expected)
      assert.deepEqual([a.historical_attempts,a.historical_next_attempt_ms,a.historical_lease_until_ms],
        i===0?[null,null,null]:['7','1792030400456','1792030499999'])
    }
    assert.equal(sha(JSON.stringify({bases:batch.bases,rows:batch.rows})),batch.inventory)
    const types=(await admin.query("SELECT data_type FROM information_schema.columns WHERE table_schema='agentstudio' "+
      "AND table_name='legacy_kb_embedding_state_archive' AND column_name LIKE 'historical_%'")).rows
    assert.equal(types.length,3);assert.ok(types.every(t=>t.data_type==='text'))
    checkpoint='replay_and_foreign_conflict'
    reportCheck(await importKbEmbeddingStateArchive(admin,loadKbEmbeddingStateSnapshot(f.files)),0,2,f,config,identity)
    assert.equal(await fingerprint(admin),first)
    await assert.rejects(importKbEmbeddingStateArchive(admin,{...batch}),e=>e.message==='kb_embedding_archive_verified_offline_batch_required')
    const different=fixture(DatabaseSync,temp,identity)
    assert.notEqual(different.digest,f.digest)
    await assert.rejects(importKbEmbeddingStateArchive(admin,loadKbEmbeddingStateSnapshot(different.files)),
      e=>e.message==='kb_embedding_archive_source_or_payload_conflict')
    assert.equal(await fingerprint(admin),first)
    checkpoint='api_worker_denied_and_force_rls'
    for(const table of archives){
      assert.deepEqual((await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
        ['agentstudio.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true})
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_policies WHERE schemaname=$1 AND tablename=$2',
        ['agentstudio',table])).rows[0].n,0)
    }
    const password='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w17_archive_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+password+"'")
    await admin.query('GRANT agentstudio_api,agentstudio_worker TO agentstudio_w17_archive_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w17_archive_login')
    api=new pg.Pool({...config,user:'agentstudio_w17_archive_login',password})
    const client=await api.connect()
    try{
      assert.deepEqual((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{rolsuper:false,rolbypassrls:false})
      for(const role of ['agentstudio_api','agentstudio_worker']){
        await client.query('RESET ROLE');await client.query('SET ROLE '+role)
        for(const actor of ['',randomUUID(),...identity.owners]){
          await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
          for(const table of archives){
            const column=table===archives[0]?'approved_mapping':table===archives[1]?'legacy_base_id':'raw_payload'
            for(const sql of ['SELECT * FROM agentstudio.'+table,'UPDATE agentstudio.'+table+' SET '+column+'='+column,
              'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table,
              'INSERT INTO agentstudio.'+table+'('+column+') SELECT '+column+' FROM agentstudio.'+table+' WHERE false'])
              await assert.rejects(client.query(sql),e=>e.code==='42501')
          }
        }
      }
      // Accidental SELECT grant must still expose zero rows, including to owner A.
      try{
        for(const table of archives)await admin.query('GRANT SELECT ON agentstudio.'+table+' TO agentstudio_api,agentstudio_worker')
        for(const role of ['agentstudio_api','agentstudio_worker']){
          await client.query('RESET ROLE');await client.query('SET ROLE '+role)
          for(const actor of ['',randomUUID(),...identity.owners]){
            await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
            await zero(client,archives)
          }
        }
      }finally{
        for(const table of archives)await admin.query('REVOKE SELECT ON agentstudio.'+table+' FROM agentstudio_api,agentstudio_worker')
      }
    }finally{client.release()}
    checkpoint='immutable_audit_and_zero_runtime'
    for(const table of archives){
      const column=table===archives[0]?'approved_mapping':table===archives[1]?'legacy_base_id':'raw_payload'
      for(const sql of ['UPDATE agentstudio.'+table+' SET '+column+'='+column,'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table])
        await assert.rejects(admin.query(sql),e=>(e.code==='P0001'&&e.message==='immutable_embedding_archive')||
          (sql.startsWith('TRUNCATE ')&&['0A000','2BP01'].includes(e.code)&&/cannot truncate a table referenced in a foreign key constraint/i.test(e.message)))
    }
    await assert.rejects(admin.query('TRUNCATE '+archives.map(t=>'agentstudio.'+t).join(',')),
      e=>e.code==='P0001'&&e.message==='immutable_embedding_archive')
    await zero(admin,unused)
    const modelConfig=(await admin.query(
      "SELECT count(*)::int AS n FROM agentstudio.model_connections")).rows[0]
    assert.equal(modelConfig.n,0,"historical imports must never activate PG model configuration")
    const configRls=(await admin.query(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class "+
      "WHERE oid='agentstudio.model_connections'::regclass")).rows[0]
    assert.deepEqual(configRls,{relrowsecurity:true,relforcerowsecurity:true})
    const secretAcl=(await admin.query(
      "SELECT has_column_privilege('agentstudio_api',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS api,"+
      "has_column_privilege('agentstudio_worker',"+
      "'agentstudio.model_connections','api_key_ciphertext','SELECT') AS worker")).rows[0]
    assert.deepEqual(secretAcl,{api:false,worker:false})
    for(const table of ['agent_studio_kb_embedding_queue'])
      assert.equal((await admin.query('SELECT to_regclass($1) AS t',['agentstudio.'+table])).rows[0].t,null)
    assert.equal(await fingerprint(admin),first)
    f.verify();different.verify()
  }catch{
    // Never print PG diagnostics, source values, credentials, paths, UUIDs or diffs.
    throw Error('w17_pg17_embedding_archive_failed_redacted checkpoint='+checkpoint)
  }finally{
    try{
      try{if(api)await api.end()}finally{
        try{if(admin)await admin.end()}finally{
          for(const dir of identity.dirs){
            if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('w17-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')||
              fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('w17_cleanup_refused')
            fs.rmSync(dir,{recursive:true,force:true})
          }
        }
      }
    }catch{throw Error('w17_pg17_embedding_archive_cleanup_failed_redacted')}
    // Never DROP/restore databases or schemas; GitHub destroys its own service.
  }
  console.log('W17_PG17_EMBEDDING_ARCHIVE_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO')
})
