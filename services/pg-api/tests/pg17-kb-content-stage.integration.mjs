// W14: standalone, destructive-environment REFUSAL by default; never a backup tool.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const self=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(self),'../../..')
const entry=path.join(root,'services/pg-api/src/stage-migration-operator.mjs')
const sha=data=>createHash('sha256').update(data).digest('hex')
const stamp='2026-10-15T01:00:00.000Z'
const refusal='refuse_non_ephemeral_pg17_kb_content_stage'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_KB_CONTENT_TEST_ENABLED!=='true'||
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
    application_name:'synthetic_w14_kb_content'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w14',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_KB_CONTENT_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W14 environment gates are mandatory before imports or I/O',()=>{
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
  for(const temp of ['/','/tmp/../tmp/w14','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W14 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';import fs from 'node:fs';import {registerHooks} from 'node:module';"+
    "net.Socket.prototype.connect=function(){throw Error('W14_FORBIDDEN_SOCKET')};"+
    "for(const key of ['writeFileSync','appendFileSync','mkdtempSync','mkdirSync','chmodSync','rmSync'])"+
    "fs[key]=()=>{throw Error('W14_FORBIDDEN_WRITE')};"+
    "registerHooks({resolve(specifier,context,next){"+
    "if(specifier==='pg'||specifier==='node:sqlite'||specifier.endsWith('/stage-kb-atomic-import.ts'))"+
    "throw Error('W14_FORBIDDEN_IMPORT');return next(specifier,context)}});")
  for(const change of [{AGENT_STUDIO_PG17_KB_CONTENT_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'}]){
    const env={...process.env,...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!/W14_FORBIDDEN_(SOCKET|WRITE|IMPORT)|ECONNREFUSED|ENOTFOUND/.test(out),
      'no socket, filesystem write or database/importer import attempted')
  }
})

test('fail-closed: unchanged operator refuses real GitHub CI before reading source',()=>{
  const env={GITHUB_ACTIONS:'true',AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:'true'}
  const child=spawnSync(process.execPath,[entry,'--execute',
    '--confirm-isolated-stage','agentstudio_stage','--allow-partial-trial',
    ...['snapshot','manifest','mapping','oidc','approval'].flatMap(k=>['--'+k,'__never_read__'])],
  {env,encoding:'utf8',timeout:15000})
  assert.ok(!child.error&&child.status===1,'operator must refuse real CI')
  assert.ok(child.stderr.includes('real_business_snapshot_forbidden_in_github_ci'))
  assert.equal(child.stdout,'')
})

function contained(file,dir){
  const rel=path.relative(dir,file)
  return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)
}
function checkedTemp(){
  const temp=fs.realpathSync(process.env.RUNNER_TEMP)
  if(temp!==process.env.RUNNER_TEMP||!fs.statSync(temp).isDirectory()||
    temp===root||contained(temp,root)||contained(root,temp))throw Error('unsafe_runner_temp')
  return temp
}
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
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W14_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W14_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W14_EXTERNAL_FETCH_REFUSED')};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])
 cp[k]=()=>{throw Error('W14_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W14 guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W14_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W14_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W14_GUARD_PASS')
})
// All source bytes below are generated here; no caller-provided snapshot path.
function fixture(DatabaseSync,temp,identity){
  const dir=fs.mkdtempSync(path.join(temp,'w14-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  identity.dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping'].map(k=>
    [k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const marker='W14_PRIVATE_'+randomBytes(16).toString('hex')
  const vectorText='[ 1.000, -0.0, 2e-3 ]'
  const bases=[],rows={document:[],chunk:[],vector:[]}
  const db=new DatabaseSync(files.snapshot)
  let tables
  try{
    db.exec(`PRAGMA journal_mode=DELETE;
      CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);
      CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT,url TEXT);
      CREATE TABLE agent_studio_kb_bases(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,description TEXT,created_ms INTEGER,updated_ms INTEGER);
      CREATE TABLE agent_studio_kb_documents(id TEXT PRIMARY KEY,base_id TEXT,rh_user_id TEXT,filename TEXT,size_chars INTEGER,chunk_count INTEGER,created_ms INTEGER);
      CREATE TABLE agent_studio_kb_chunks(id TEXT PRIMARY KEY,base_id TEXT,document_id TEXT,rh_user_id TEXT,chunk_index INTEGER,text_content TEXT);
      CREATE TABLE agent_studio_kb_vectors(chunk_id TEXT PRIMARY KEY,rh_user_id TEXT,base_id TEXT,document_id TEXT,connection_id TEXT,model_name TEXT,dimensions INTEGER,vector_json TEXT,indexed_ms INTEGER);
      CREATE TABLE agent_studio_kb_access(id TEXT);
      CREATE TABLE agent_studio_kb_access_events(id TEXT);
      CREATE TABLE agent_studio_kb_embedding_queue(id TEXT);
      CREATE TABLE agent_studio_kb_embedding_settings(id TEXT);`)
    for(let i=0;i<2;i++){
      const uid='employee000000'+(i+1),base='base'+i,doc='doc'+i
      db.prepare('INSERT INTO studio_users VALUES(?,?)').run(uid,marker+' password')
      db.prepare('INSERT INTO model_connections VALUES(?,?,?,?)').run('conn'+i,uid,marker+' api-key','https://never-call.synthetic.invalid')
      const b={id:base,rh_user_id:uid,name:marker+' KB '+i,description:'合成说明\n  ',created_ms:1792030400000+i,updated_ms:1792030401000+i}
      bases.push(b)
      db.prepare('INSERT INTO agent_studio_kb_bases VALUES(?,?,?,?,?,?)').run(...Object.values(b))
      const d={id:doc,base_id:base,rh_user_id:uid,filename:marker+' 源文档 '+i+'.txt',size_chars:42,chunk_count:2,created_ms:1792030400123+i}
      rows.document.push(d)
      db.prepare('INSERT INTO agent_studio_kb_documents VALUES(?,?,?,?,?,?,?)').run(...Object.values(d))
      for(let j=0;j<2;j++){
        const c={id:'chunk'+i+j,base_id:base,document_id:doc,rh_user_id:uid,chunk_index:j,text_content:marker+' 原文🙂\n\t"quoted" \\ [1, 2]  '+j}
        const v={chunk_id:c.id,rh_user_id:uid,base_id:base,document_id:doc,connection_id:'conn'+i,model_name:'legacy-model',dimensions:3,vector_json:vectorText,indexed_ms:1792030400456+i*2+j}
        rows.chunk.push(c);rows.vector.push(v)
        db.prepare('INSERT INTO agent_studio_kb_chunks VALUES(?,?,?,?,?,?)').run(...Object.values(c))
        db.prepare('INSERT INTO agent_studio_kb_vectors VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(v))
      }
    }
    tables=Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all()
      .map(({name})=>[name,Number(db.prepare('SELECT count(*) AS n FROM "'+name+'"').get().n)]))
  }finally{db.close()}
  const bytes=fs.readFileSync(files.snapshot),digest=sha(bytes)
  privateFile(files.manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:digest,bytes:bytes.length,tables}))
  privateFile(files.mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
    records:identity.owners.map((owner,i)=>({old_id:'employee000000'+(i+1),new_studio_user_id:owner,
      verified_by:'Synthetic independent mapping reviewer',approved_at:stamp}))}))
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
  verify();return {dir,files,marker,digest,bases,rows,vectorText,verify}
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
const archives={document:'legacy_kb_document_archive',chunk:'legacy_kb_chunk_archive',vector:'legacy_kb_vector_archive'}
const frozenTables=['legacy_kb_content_snapshots',...Object.values(archives)]
const importedTables=['knowledge_bases','legacy_knowledge_base_imports',...frozenTables]
const unusedTables=['knowledge_documents','knowledge_chunks','jobs','runs','schedules','schedule_occurrences',
  'run_steps','external_effects','teams','team_memberships']
async function zero(db,tables){
  for(const table of tables)assert.equal((await db.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,0)
}
function safeReport(report,f,config,identity){
  const out=JSON.stringify(report)
  for(const secret of [config.password,f.marker,...identity.owners,...Object.values(f.files),
    ...f.rows.chunk.map(r=>r.text_content),f.vectorText,'employee0000001','employee0000002','conn0','conn1'])
    assert.ok(!out.includes(secret),'reports must contain no private source values')
  assert.equal(report.stage_only,true);assert.equal(report.production_cutover_allowed,false)
  assert.equal(report.archive_only,true);assert.equal(report.rag_enabled,false);assert.equal(report.acl_activated,false)
  assert.equal(report.reconciled,2)
  assert.equal(report.archive.reconciled,10)
  assert.equal(report.archive.archive_only,true);assert.equal(report.archive.rag_enabled,false)
  assert.equal(report.archive.production_cutover_allowed,false)
}

test('PG17 TCP: W14 nonempty W2+W6 atomic content, RLS, rollback and replay, NO-GO',async()=>{
  // Refuse BEFORE dynamic pg/SQLite/importer imports, file reads/writes or sockets.
  const config=requireEphemeral(process.env)
  const temp=checkedTemp()
  const identity={owners:[randomUUID(),randomUUID()],dirs:[]}
  let admin,api,checkpoint='network_guard'
  try{
    // The same guard probed offline also protects the real importer process.
    // This standalone node:test file runs in its own process; keep guards active
    // through connection shutdown and cleanup. No importer descendants are allowed.
    const guard=await import('data:text/javascript,'+encodeURIComponent(guardSource()))
    void guard
    const [{default:pg},{DatabaseSync},{loadKbContentSnapshot,importKbSnapshotAtomic}]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-kb-atomic-import.ts')])
    checkpoint='target_preflight'
    admin=new pg.Pool(config)
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,"+
      "inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super")).rows[0]
    assert.ok(g.db==='agentstudio_stage'&&g.login==='agentstudio_admin'&&g.role===g.login&&g.super===true)
    // A GitHub service can report its container-side address here. Socket guard
    // and explicit Pool config enforce client-side 127.0.0.1:5432 without DNS.
    assert.ok(g.version>=170000&&g.version<180000&&g.address!==null&&g.port===5432)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS schema")).rows[0].schema,null)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_namespace WHERE "+
      "nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_w14_api_login')")).rows[0].n,0)
    checkpoint='unmodified_schema'
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    for(const migration of ['007_legacy_kb_import','010_legacy_kb_content'])
      await admin.query(sqlFile('db/postgres/migrations/pg_v8_'+migration+'.sql'))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    for(let i=0;i<2;i++)await admin.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'https://w14.synthetic.invalid',$2,'disabled')",
      [identity.owners[i],'synthetic-'+randomUUID()])
    checkpoint='frozen_fixture'
    const f=fixture(DatabaseSync,temp,identity)
    const beforeLoad=await fingerprint(admin)
    const batch=loadKbContentSnapshot(f.files)
    f.verify()
    assert.equal(batch.snapshot,f.digest)
    assert.ok(!JSON.stringify(batch).includes(f.marker+' api-key'))
    assert.ok(!JSON.stringify(batch).includes(f.marker+' password'))
    assert.ok(!JSON.stringify(batch).includes('https://never-call.synthetic.invalid'))
    assert.ok(await fingerprint(admin)===beforeLoad,'offline reader cannot write PG')
    checkpoint='sql_abort_atomic_rollback'
    // Delegate every importer statement to REAL PG17. On the first vector INSERT,
    // execute a real divide-by-zero SELECT inside its transaction (no JS fake error).
    const trace=[],writes={metadata:0,snapshot:0,document:0,chunk:0},seen={sqlstate:null}
    const failing={async connect(){const db=await admin.connect();return {release(){db.release()},async query(sql,values=[]){
      trace.push(sql)
      if(sql.startsWith('INSERT INTO agentstudio.legacy_kb_vector_archive')){
        const counts=(await db.query('SELECT (SELECT count(*)::int FROM agentstudio.knowledge_bases) AS metadata,'+
          '(SELECT count(*)::int FROM agentstudio.legacy_knowledge_base_imports) AS crosswalk,'+
          '(SELECT count(*)::int FROM agentstudio.legacy_kb_content_snapshots) AS snapshot,'+
          '(SELECT count(*)::int FROM agentstudio.legacy_kb_document_archive) AS document,'+
          '(SELECT count(*)::int FROM agentstudio.legacy_kb_chunk_archive) AS chunk')).rows[0]
        assert.deepEqual(counts,{metadata:2,crosswalk:2,snapshot:1,document:2,chunk:4})
        try{await db.query('SELECT 1 / 0')}catch(error){seen.sqlstate=error.code;throw error}
        throw Error('sql_fault_did_not_fire')
      }
      const result=await db.query(sql,values)
      if(sql.startsWith('INSERT INTO agentstudio.knowledge_bases'))writes.metadata++
      if(sql.startsWith('INSERT INTO agentstudio.legacy_kb_content_snapshots'))writes.snapshot++
      if(sql.startsWith('INSERT INTO agentstudio.legacy_kb_document_archive'))writes.document++
      if(sql.startsWith('INSERT INTO agentstudio.legacy_kb_chunk_archive'))writes.chunk++
      return result
    }}}}
    await assert.rejects(importKbSnapshotAtomic(failing,batch),error=>error.message==='stage_kb_sql_failed')
    assert.equal(seen.sqlstate,'22012')
    assert.deepEqual(writes,{metadata:2,snapshot:1,document:2,chunk:4})
    assert.equal(trace[0],'BEGIN');assert.equal(trace.at(-1),'ROLLBACK');assert.ok(!trace.includes('COMMIT'))
    await zero(admin,importedTables)
    assert.ok(await fingerprint(admin)===beforeLoad,'SQL abort must roll back metadata AND all archive rows')
    checkpoint='atomic_import'
    const report=await importKbSnapshotAtomic(admin,batch)
    safeReport(report,f,config,identity)
    assert.equal(report.imported,2);assert.equal(report.replayed,0)
    assert.equal(report.archive.imported,10);assert.equal(report.archive.replayed,0)
    const first=await fingerprint(admin)
    checkpoint='raw_content_reconciliation'
    const cross=(await admin.query('SELECT * FROM agentstudio.legacy_knowledge_base_imports ORDER BY legacy_base_id')).rows
    assert.equal(cross.length,2)
    for(let i=0;i<2;i++){
      const b=f.bases[i],m=cross[i]
      const target=(await admin.query('SELECT * FROM agentstudio.knowledge_bases WHERE id=$1',[m.target_base_id])).rows[0]
      assert.ok(m.source_snapshot_sha256===f.digest&&m.legacy_base_id===b.id&&m.owner_user_id===identity.owners[i])
      assert.ok(target.owner_user_id===m.owner_user_id&&target.name===b.name&&target.description===b.description&&
        target.created_at.getTime()===b.created_ms&&target.updated_at.getTime()===b.updated_ms&&
        target.visibility==='private'&&target.team_id===null&&Number(target.revision)===1)
      assert.equal(m.payload_sha256,batch.bases[i].payload_sha256)
    }
    for(const [kind,table] of Object.entries(archives)){
      const actual=(await admin.query('SELECT * FROM agentstudio.'+table+' ORDER BY legacy_id COLLATE "C"')).rows
      assert.equal(actual.length,f.rows[kind].length)
      for(let i=0;i<actual.length;i++){
        const a=actual[i],expected=f.rows[kind][i],owner=identity.owners[Number(expected.base_id.slice(-1))]
        assert.equal(a.raw_payload,JSON.stringify(expected));assert.deepEqual(JSON.parse(a.raw_payload),expected)
        assert.equal(a.payload_sha256,sha(JSON.stringify(expected)))
        assert.equal(a.source_snapshot_sha256,f.digest);assert.equal(a.owner_user_id,owner)
        assert.equal(a.legacy_id,expected.id??expected.chunk_id);assert.equal(a.legacy_base_id,expected.base_id)
        assert.equal(a.target_base_id,cross.find(m=>m.legacy_base_id===expected.base_id).target_base_id)
        if(kind!=='document')assert.equal(a.legacy_document_id,expected.document_id)
        if(kind==='vector')assert.equal(JSON.parse(a.raw_payload).vector_json,f.vectorText)
      }
    }
    const audit=(await admin.query('SELECT * FROM agentstudio.legacy_kb_content_snapshots')).rows
    assert.equal(audit.length,1)
    assert.ok(audit[0].source_snapshot_sha256===f.digest&&audit[0].inventory_sha256===batch.inventory&&
      audit[0].approved_mapping===batch.mapping&&audit[0].mapping_sha256===sha(batch.mapping))
    assert.deepEqual([audit[0].document_count,audit[0].chunk_count,audit[0].vector_count].map(Number),[2,4,4])
    checkpoint='replay_and_conflict'
    const replay=await importKbSnapshotAtomic(admin,loadKbContentSnapshot(f.files))
    safeReport(replay,f,config,identity)
    assert.deepEqual([replay.imported,replay.replayed,replay.archive.imported,replay.archive.replayed],[0,2,0,10])
    assert.ok(await fingerprint(admin)===first)
    await assert.rejects(importKbSnapshotAtomic(admin,{...batch}),/verified_offline_batch_required/)
    const different=fixture(DatabaseSync,temp,identity)
    assert.notEqual(different.digest,f.digest)
    await assert.rejects(importKbSnapshotAtomic(admin,loadKbContentSnapshot(different.files)),/stage_kb_source_snapshot_conflict/)
    assert.ok(await fingerprint(admin)===first)
    checkpoint='rls_and_archive_secrecy'
    for(const table of importedTables){
      const flags=(await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['agentstudio.'+table])).rows[0]
      assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true})
    }
    const password='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w14_api_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+password+"'")
    await admin.query('GRANT agentstudio_api,agentstudio_worker TO agentstudio_w14_api_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w14_api_login')
    api=new pg.Pool({...config,user:'agentstudio_w14_api_login',password})
    const client=await api.connect()
    try{
      assert.deepEqual((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{rolsuper:false,rolbypassrls:false})
      await client.query('SET ROLE agentstudio_api')
      for(const [actor,n] of [['',0],[randomUUID(),0],...identity.owners.map(owner=>[owner,1])]){
        await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
        const visible=(await client.query('SELECT owner_user_id FROM agentstudio.knowledge_bases')).rows
        assert.equal(visible.length,n)
        if(n)assert.equal(visible[0].owner_user_id,actor)
        for(const table of ['legacy_knowledge_base_imports',...frozenTables])
          await assert.rejects(client.query('SELECT * FROM agentstudio.'+table),e=>e.code==='42501')
      }
      await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[randomUUID()])
      assert.equal((await client.query('UPDATE agentstudio.knowledge_bases SET name=name RETURNING id')).rowCount,0)
      await assert.rejects(client.query('INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,$2)',[identity.owners[0],'denied']),e=>e.code==='42501')
      for(const role of ['agentstudio_api','agentstudio_worker']){
        await client.query('RESET ROLE');await client.query('SET ROLE '+role)
        await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[identity.owners[0]])
        for(const table of frozenTables){
          for(const sql of ['SELECT * FROM ','UPDATE ','DELETE FROM ','TRUNCATE ']){
            const suffix=sql==='UPDATE '?' SET raw_payload=raw_payload':''
            // Snapshot lacks raw_payload: use its own real immutable column.
            const statement=(sql+'agentstudio.'+table+suffix).replaceAll('raw_payload',table==='legacy_kb_content_snapshots'?'approved_mapping':'raw_payload')
            await assert.rejects(client.query(statement),e=>e.code==='42501')
          }
        }
      }
    }finally{client.release()}
    checkpoint='immutable_read_only'
    for(const table of frozenTables){
      const column=table==='legacy_kb_content_snapshots'?'approved_mapping':'raw_payload'
      for(const sql of ['UPDATE agentstudio.'+table+' SET '+column+'='+column,'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table])
        await assert.rejects(admin.query(sql),error=>{
          // PG17 may enforce FK referential integrity before firing the
          // custom immutable trigger on a parent table TRUNCATE. Both are
          // strict DB-side refusals; a successful mutation is never accepted.
          const immutableTrigger=error.code==='P0001'&&
            error.message==='immutable_kb_archive'
          const foreignKeyFence=table==='legacy_kb_content_snapshots'&&
            sql.startsWith('TRUNCATE ')&&
            ['0A000','2BP01'].includes(error.code)&&
            /cannot truncate a table referenced in a foreign key constraint/i.test(error.message)
          return immutableTrigger||foreignKeyFence
        })
    }
    const readonly=await admin.connect()
    try{
      await readonly.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      for(const table of frozenTables)assert.ok((await readonly.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n>0)
      await assert.rejects(readonly.query('INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,$2)',[identity.owners[0],'denied']),e=>e.code==='25006')
    }finally{await readonly.query('ROLLBACK');readonly.release()}
    await zero(admin,unusedTables)
    assert.ok(await fingerprint(admin)===first,'permissions/read-only/immutable probes leave all rows unchanged')
    f.verify();different.verify()
    console.log('W14_PG17_KB_CONTENT_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO')
  }catch{
    // No pg diagnostics, source text, assertion diff, UUID, file path or secret in TAP.
    throw Error('w14_pg17_kb_content_failed_redacted checkpoint='+checkpoint)
  }finally{
    try{if(api)await api.end()}finally{
      try{if(admin)await admin.end()}finally{
        for(const dir of identity.dirs){
          assert.ok(path.dirname(dir)===temp&&path.basename(dir).startsWith('w14-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')&&
            fs.realpathSync(dir)===dir&&!fs.lstatSync(dir).isSymbolicLink(),'cleanup only owned synthetic runner fixture')
          fs.rmSync(dir,{recursive:true,force:true})
        }
      }
    }
    // Never DROP/restore a database/schema; GitHub destroys its isolated service.
  }
})
