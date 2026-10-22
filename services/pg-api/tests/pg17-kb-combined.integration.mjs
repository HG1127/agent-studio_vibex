// W19: synthetic-only, standalone; refuse before pg/SQLite/importer imports or TCP.
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
const refusal='refuse_non_ephemeral_pg17_kb_combined'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_W19_KB_COMBINED_TEST_ENABLED!=='true'||
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
    application_name:'synthetic_w19_kb_combined'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w19',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W19_KB_COMBINED_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W19 environment gates are mandatory before imports or I/O',()=>{
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
  for(const temp of ['/','/tmp/../tmp/w19','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W19 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';import fs from 'node:fs';import {registerHooks} from 'node:module';"+
    "Object.defineProperty(process,'platform',{value:'linux'});"+
    "net.Socket.prototype.connect=function(){throw Error('W19_FORBIDDEN_SOCKET')};"+
    "for(const key of ['writeFileSync','appendFileSync','mkdtempSync','mkdirSync','chmodSync','rmSync'])"+
    "fs[key]=()=>{throw Error('W19_FORBIDDEN_WRITE')};"+
    "registerHooks({resolve(specifier,context,next){"+
    "if(specifier==='pg'||specifier==='node:sqlite'||specifier.includes('/stage-kb-')||specifier.endsWith('/stage-knowledge-base-import.ts'))"+
    "throw Error('W19_FORBIDDEN_IMPORT');return next(specifier,context)}});")
  for(const change of [{AGENT_STUDIO_PG17_W19_KB_COMBINED_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'},
    {RUNNER_TEMP:'/__w19_nonexistent_runner_temp__'}]){
    const env={...process.env,...validEnv(),...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!out.includes('W19_PG17_KB_COMBINED_PASS'),'a refused entry cannot report real PG17 success')
    assert.ok(!/W19_FORBIDDEN_(SOCKET|WRITE|IMPORT)|ECONNREFUSED|ENOTFOUND/.test(out),
      'no socket, filesystem write or database/importer import attempted')
  }
})

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
  const candidate=path.resolve(root,'..','w19-runner-temp')
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
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W19_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W19_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W19_EXTERNAL_FETCH_REFUSED')};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])
 cp[k]=()=>{throw Error('W19_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W19 guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W19_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W19_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W19_GUARD_PASS')
})

function fixture(DatabaseSync,temp,identity,change=()=>{},mapChange=()=>{}){
  const dir=fs.mkdtempSync(path.join(temp,'w19-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  identity.dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping'].map(k=>
    [k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const marker='W19_PRIVATE_'+randomBytes(16).toString('hex')
  const vectorText='[ 1.000, -0.0, 2e-3 ]'
  const bases=[],rows={document:[],chunk:[],vector:[]}
  const settings={rh_user_id:'employee0000001',connection_id:'conn0',model_name:'旧模型  ',updated_ms:1792030400123}
  const queue={rh_user_id:'employee0000001',base_id:'base0',attempts:7,next_attempt_ms:1792030400456,lease_until_ms:1792030499999,last_error:'历史错误 中文😀\n  ',updated_ms:1792030400789}
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
      CREATE TABLE agent_studio_kb_embedding_queue(rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER,PRIMARY KEY(rh_user_id,base_id));
      CREATE TABLE agent_studio_kb_embedding_settings(rh_user_id TEXT PRIMARY KEY,connection_id TEXT,model_name TEXT,updated_ms INTEGER);`)
    for(let i=0;i<2;i++){
      const uid='employee000000'+(i+1),base='base'+i,doc='doc'+i
      db.prepare('INSERT INTO studio_users VALUES(?,?)').run(uid,marker+' password')
      db.prepare('INSERT INTO model_connections VALUES(?,?,?,?)').run('conn'+i,uid,marker+' api-key','https://never-call.synthetic.invalid')
      const b={id:base,rh_user_id:uid,name:marker+' KB '+i,description:'合成说明\n  ',created_ms:1792030400000+i,updated_ms:1792030401000+i}
      bases.push(b)
      db.prepare('INSERT INTO agent_studio_kb_bases VALUES(?,?,?,?,?,?)').run(...Object.values(b))
      if(i===1)continue
      const d={id:doc,base_id:base,rh_user_id:uid,filename:marker+' 源文档 '+i+'.txt',size_chars:42,chunk_count:1,created_ms:1792030400123+i}
      rows.document.push(d)
      db.prepare('INSERT INTO agent_studio_kb_documents VALUES(?,?,?,?,?,?,?)').run(...Object.values(d))
      for(let j=0;j<1;j++){
        const c={id:'chunk'+i+j,base_id:base,document_id:doc,rh_user_id:uid,chunk_index:j,text_content:marker+' 原文🙂\n\t"quoted" \\ [1, 2]  '+j}
        const v={chunk_id:c.id,rh_user_id:uid,base_id:base,document_id:doc,connection_id:'conn'+i,model_name:'legacy-model',dimensions:3,vector_json:vectorText,indexed_ms:1792030400456+i*2+j}
        rows.chunk.push(c);rows.vector.push(v)
        db.prepare('INSERT INTO agent_studio_kb_chunks VALUES(?,?,?,?,?,?)').run(...Object.values(c))
        db.prepare('INSERT INTO agent_studio_kb_vectors VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(v))
      }
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
  const mapping={schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
    records:identity.owners.map((owner,i)=>({old_id:'employee000000'+(i+1),new_studio_user_id:owner,
      verified_by:'Synthetic independent mapping reviewer',approved_at:stamp}))}
  mapChange(mapping);privateFile(files.mapping,JSON.stringify(mapping))
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
  verify();return {dir,files,marker,digest,bases,rows,settings,queue,vectorText,verify}
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
const frozenTables=['legacy_kb_content_snapshots',...Object.values(archives),
  'legacy_kb_embedding_snapshots','legacy_kb_embedding_base_refs','legacy_kb_embedding_state_archive']
const domains=['knowledge_bases','legacy_knowledge_base_imports',...frozenTables]
const unused=['jobs','runs','knowledge_documents','knowledge_chunks','schedules','schedule_occurrences',
  'run_steps','external_effects','teams','team_memberships']
async function counts(db,tables=domains){
  const out=[]
  for(const t of tables)out.push((await db.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n)
  return out
}
async function zero(db,tables){assert.deepEqual(await counts(db,tables),tables.map(()=>0))}
function reportCheck(r,replay,f,config,identity){
  assert.deepEqual(Object.fromEntries(['stage_only','archive_only','production_cutover_allowed','rag_enabled',
    'embedding_enabled','acl_activated','jobs_created'].map(k=>[k,r[k]])),
  {stage_only:true,archive_only:true,production_cutover_allowed:false,rag_enabled:false,
    embedding_enabled:false,acl_activated:false,jobs_created:0})
  const parts=[r.metadata,r.content,r.embedding]
  assert.deepEqual(parts.map(p=>p.imported),replay?[0,0,0]:[2,3,2])
  assert.deepEqual(parts.map(p=>p.replayed),replay?[2,3,2]:[0,0,0])
  for(const p of parts){assert.equal(p.stage_only,true);assert.equal(p.production_cutover_allowed,false)}
  assert.equal(r.content.reconciled,3);assert.equal(r.metadata.reconciled,2)
  assert.equal(r.content.archive_only,true);assert.equal(r.content.rag_enabled,false)
  assert.equal(r.embedding.archive_only,true);assert.equal(r.embedding.embedding_enabled,false)
  assert.equal(r.embedding.jobs_created,0)
  const out=JSON.stringify(r)
  for(const value of [config.password,f.marker,...Object.values(f.files),...identity.owners,
    f.vectorText,...f.rows.chunk.map(c=>c.text_content),'employee0000001','conn0'])assert.ok(!out.includes(value))
}
// A transparent adapter: all queries, including identity/version probes, go to PG17.
// Only the deliberate queue fault inserts an additional real SELECT 1/0.
function tracedPool(admin,trace,{fault=false,seen={}}={}){
  return {async connect(){
    seen.connections=(seen.connections??0)+1
    const db=await admin.connect()
    return {release(){seen.releases=(seen.releases??0)+1;db.release()},async query(sql,values=[]){
      trace.push(sql)
      if(fault&&sql.startsWith('INSERT INTO agentstudio.legacy_kb_embedding_state_archive')&&
        values[1]==='agent_studio_kb_embedding_queue'){
        assert.deepEqual(await counts(db),[2,2,1,1,1,1,1,2,1])
        seen.preFault=true
        try{await db.query('SELECT 1/0')}catch(e){seen.sqlstate=e.code;throw e}
        throw Error('sql_fault_not_fired')
      }
      return db.query(sql,values)
    }}
  }}
}
const tx=trace=>trace.filter(s=>['BEGIN','COMMIT','ROLLBACK'].includes(s))

// Run last: permanent networking/child guards protect this standalone test process.
test('PG17 TCP: W19 W2+W6+W16 combined atomic import, rollback, retry, RLS, NO-GO',async()=>{
  const config=requireEphemeral(process.env)
  const temp=checkedTemp()
  const identity={owners:[randomUUID(),randomUUID()],dirs:[]}
  let admin,api,checkpoint='network_guard'
  try{
    await import('data:text/javascript,'+encodeURIComponent(guardSource()))
    const [{default:pg},{DatabaseSync},combined,content,embedding,metadata,atomic]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-kb-combined-import.ts'),
      import('../src/stage-kb-content-import-source.ts'),import('../src/stage-kb-embedding-state-import.ts'),
      import('../src/stage-knowledge-base-import.ts'),import('../src/stage-kb-atomic-import.ts')])
    const {loadKbCombinedSnapshot,importKbCombinedAtomic}=combined
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
      "('agentstudio_api','agentstudio_worker','agentstudio_w19_archive_login')")).rows[0].n,0)
    checkpoint='unmodified_schema'
    // Strip only psql backslash directives; SQL bodies/guards are unchanged.
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    for(const name of ['007_legacy_kb_import','010_legacy_kb_content','013_legacy_kb_embedding_state'])
      await admin.query(sqlFile('db/postgres/migrations/pg_v8_'+name+'.sql'))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    for(let i=0;i<2;i++)await admin.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'w19-synthetic',$2,'disabled')",
      [identity.owners[i],'synthetic-'+randomUUID()])
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.users WHERE status='disabled'")).rows[0].n,2)
    checkpoint='sealed_source_and_offline_refusals'
    const f=fixture(DatabaseSync,temp,identity)
    const before=await fingerprint(admin)
    const batch=loadKbCombinedSnapshot(f.files)
    assert.deepEqual(Object.keys(batch),['snapshot']);assert.ok(Object.isFrozen(batch))
    assert.equal(batch.snapshot,f.digest)
    const token=embedding.loadKbEmbeddingStateSnapshot(f.files)
    const cb=content.loadKbContentSnapshot(f.files,token)
    assert.equal(cb.mapping,token.mapping)
    const manifest=JSON.parse(fs.readFileSync(f.files.manifest,'utf8'))
    assert.equal(manifest.sha256,f.digest)
    assert.equal(manifest.bytes,fs.statSync(f.files.snapshot).size)
    assert.deepEqual(manifest.tables,{agent_studio_kb_access:0,agent_studio_kb_access_events:0,
      agent_studio_kb_bases:2,agent_studio_kb_chunks:1,agent_studio_kb_documents:1,
      agent_studio_kb_embedding_queue:1,agent_studio_kb_embedding_settings:1,
      agent_studio_kb_vectors:1,model_connections:2,studio_users:2})
    assert.deepEqual(JSON.parse(cb.mapping),JSON.parse(fs.readFileSync(f.files.mapping,'utf8')))
    const secrets=[f.marker+' password',f.marker+' api-key','https://never-call.synthetic.invalid']
    for(const secret of secrets)assert.ok(!JSON.stringify([batch,token,cb]).includes(secret))
    const noConnect={connect(){throw Error('unexpected_connection')}}
    assert.throws(()=>content.loadKbContentSnapshot(f.files),e=>e.message==='kb_content_unsupported_acl_or_embedding_state')
    await assert.rejects(atomic.importKbSnapshotAtomic(noConnect,cb),/combined_import_required/)
    await assert.rejects(metadata.importLegacyKbsToStage(noConnect,f.digest,cb.bases.map(({has_related_data,...r})=>r)),
      /documents_vectors_or_acl_not_migrated/)
    for(const fake of [{...batch},JSON.parse(JSON.stringify(batch))])
      await assert.rejects(importKbCombinedAtomic(noConnect,fake),e=>e.message==='kb_combined_verified_offline_batch_required')
    for(const change of [
      db=>db.exec("INSERT INTO agent_studio_kb_access VALUES('synthetic_acl')"),
      db=>db.exec("INSERT INTO agent_studio_kb_access_events VALUES('synthetic_acl_history')"),
      db=>db.exec("UPDATE agent_studio_kb_embedding_queue SET base_id='base1'"),
      db=>db.exec("UPDATE agent_studio_kb_chunks SET rh_user_id='employee0000002'"),
      db=>db.exec("UPDATE model_connections SET rh_user_id='employee0000002'"),
      db=>db.exec('CREATE TABLE agent_studio_kb_unknown(id TEXT)'),
    ]){
      const bad=fixture(DatabaseSync,temp,identity,change)
      assert.throws(()=>loadKbCombinedSnapshot(bad.files),e=>e.message==='kb_combined_source_invalid');bad.verify()
    }
    for(const change of [m=>m.records.pop(),m=>{m.records[0].new_studio_user_id='invalid'},
      m=>{m.records[1].new_studio_user_id=m.records[0].new_studio_user_id},m=>{m.records[0].verified_by=''}]){
      const bad=fixture(DatabaseSync,temp,identity,()=>{},change)
      assert.throws(()=>loadKbCombinedSnapshot(bad.files),e=>e.message==='kb_combined_source_invalid');bad.verify()
    }
    f.verify();assert.equal(await fingerprint(admin),before)
    checkpoint='real_queue_sql_fault_rollback_all_domains'
    const trace=[],seen={}
    await assert.rejects(importKbCombinedAtomic(tracedPool(admin,trace,{fault:true,seen}),batch),
      e=>e.message==='kb_combined_import_failed')
    assert.equal(seen.preFault,true);assert.equal(seen.sqlstate,'22012')
    assert.deepEqual(tx(trace),['BEGIN','ROLLBACK'])
    assert.deepEqual([seen.connections,seen.releases],[1,1])
    await zero(admin,domains);await zero(admin,unused)
    assert.equal(await fingerprint(admin),before)
    checkpoint='retry_unique_transaction'
    const successTrace=[],successSeen={}
    reportCheck(await importKbCombinedAtomic(tracedPool(admin,successTrace,{seen:successSeen}),batch),false,f,config,identity)
    assert.deepEqual(tx(successTrace),['BEGIN','COMMIT'])
    assert.deepEqual([successSeen.connections,successSeen.releases],[1,1])
    assert.deepEqual(await counts(admin),[2,2,1,1,1,1,1,2,2])
    const first=await fingerprint(admin)
    checkpoint='lossless_metadata_content_and_embedding_reconciliation'
    const cross=(await admin.query('SELECT * FROM agentstudio.legacy_knowledge_base_imports ORDER BY legacy_base_id COLLATE "C"')).rows
    const targets=(await admin.query('SELECT * FROM agentstudio.knowledge_bases ORDER BY owner_user_id')).rows
    for(let i=0;i<2;i++){
      const b=f.bases[i],m=cross[i],t=targets.find(t=>t.id===m.target_base_id)
      assert.equal(m.source_snapshot_sha256,f.digest);assert.equal(m.legacy_base_id,b.id)
      assert.equal(m.owner_user_id,identity.owners[i]);assert.equal(m.payload_sha256,cb.bases[i].payload_sha256)
      assert.equal(t.owner_user_id,identity.owners[i]);assert.equal(t.name,b.name);assert.equal(t.description,b.description)
      assert.equal(t.created_at.getTime(),b.created_ms);assert.equal(t.updated_at.getTime(),b.updated_ms)
      assert.equal(t.visibility,'private');assert.equal(t.team_id,null)
    }
    for(const [kind,table] of Object.entries(archives)){
      const actual=(await admin.query('SELECT * FROM agentstudio.'+table)).rows
      assert.equal(actual.length,1)
      const a=actual[0],expected=f.rows[kind][0],r=cb.rows.find(r=>r.kind===kind)
      assert.equal(a.raw_payload,JSON.stringify(expected));assert.deepEqual(JSON.parse(a.raw_payload),expected)
      assert.equal(a.raw_payload,r.raw);assert.equal(a.payload_sha256,sha(r.raw));assert.equal(a.payload_sha256,r.hash)
      assert.equal(a.owner_user_id,identity.owners[0]);assert.equal(a.source_snapshot_sha256,f.digest)
      assert.equal(a.legacy_id,expected.id??expected.chunk_id);assert.equal(a.legacy_base_id,'base0')
      assert.equal(a.target_base_id,cross[0].target_base_id)
      if(kind!=='document')assert.equal(a.legacy_document_id,expected.document_id)
      if(kind==='vector')assert.equal(JSON.parse(a.raw_payload).vector_json,f.vectorText)
    }
    for(const [table,expected] of [['legacy_kb_content_snapshots',cb],['legacy_kb_embedding_snapshots',token]]){
      const rows=(await admin.query('SELECT * FROM agentstudio.'+table)).rows
      assert.equal(rows.length,1)
      const a=rows[0]
      assert.equal(a.source_snapshot_sha256,f.digest);assert.equal(a.approved_mapping,expected.mapping)
      assert.equal(a.mapping_sha256,sha(expected.mapping));assert.equal(a.inventory_sha256,expected.inventory)
      assert.equal(expected.mappingHash,sha(expected.mapping))
      assert.equal(JSON.parse(a.approved_mapping).records.length,2)
      if(table==='legacy_kb_content_snapshots')assert.deepEqual([a.document_count,a.chunk_count,a.vector_count],['1','1','1'])
    }
    const refs=(await admin.query('SELECT * FROM agentstudio.legacy_kb_embedding_base_refs ORDER BY legacy_base_id COLLATE "C"')).rows
    assert.deepEqual(refs,token.bases.map(b=>({source_snapshot_sha256:f.digest,legacy_base_id:b.id,legacy_owner_id:b.legacyOwner,owner_user_id:b.owner})))
    const states=(await admin.query('SELECT * FROM agentstudio.legacy_kb_embedding_state_archive')).rows
    assert.equal(states.length,2)
    for(const r of token.rows){
      const a=states.find(a=>a.source_table===r.table)
      const expected=r.table.endsWith('queue')?f.queue:f.settings
      assert.equal(a.raw_payload,JSON.stringify(expected))
      assert.equal(a.raw_payload,r.raw);assert.equal(a.payload_sha256,sha(r.raw));assert.equal(a.payload_sha256,r.hash)
      assert.equal(a.owner_user_id,r.owner);assert.equal(a.legacy_owner_id,r.legacyOwner)
      assert.equal(a.legacy_row_id,r.id);assert.equal(a.legacy_base_id,r.base);assert.equal(a.source_snapshot_sha256,f.digest)
      assert.deepEqual(JSON.parse(a.raw_payload),expected)
      assert.deepEqual([a.historical_attempts,a.historical_next_attempt_ms,a.historical_lease_until_ms],
        r.table.endsWith('queue')?['7','1792030400456','1792030499999']:[null,null,null])
    }
    const historicalTypes=(await admin.query("SELECT data_type FROM information_schema.columns WHERE table_schema='agentstudio' "+
      "AND table_name='legacy_kb_embedding_state_archive' AND column_name LIKE 'historical_%'")).rows
    assert.equal(historicalTypes.length,3);assert.ok(historicalTypes.every(t=>t.data_type==='text'))
    assert.equal(sha(JSON.stringify({bases:token.bases,rows:token.rows})),token.inventory)
    assert.equal(content.inventoryHash(cb.rows),cb.inventory)
    for(const table of [...Object.values(archives),'legacy_kb_embedding_state_archive']){
      for(const a of (await admin.query('SELECT raw_payload FROM agentstudio.'+table)).rows)
        for(const secret of secrets)assert.ok(!a.raw_payload.includes(secret))
    }
    checkpoint='same_source_replay_and_foreign_source_refusal'
    const replayTrace=[],replaySeen={}
    reportCheck(await importKbCombinedAtomic(tracedPool(admin,replayTrace,{seen:replaySeen}),loadKbCombinedSnapshot(f.files)),true,f,config,identity)
    assert.deepEqual([replaySeen.connections,replaySeen.releases],[1,1])
    assert.deepEqual(tx(replayTrace),['BEGIN','COMMIT']);assert.equal(await fingerprint(admin),first)
    const different=fixture(DatabaseSync,temp,identity)
    assert.notEqual(different.digest,f.digest)
    await assert.rejects(importKbCombinedAtomic(admin,loadKbCombinedSnapshot(different.files)),e=>e.message==='kb_combined_import_failed')
    assert.equal(await fingerprint(admin),first)
    checkpoint='force_rls_and_owner_isolation'
    const protectedTables=['legacy_knowledge_base_imports',...frozenTables]
    for(const table of domains)assert.deepEqual((await admin.query(
      'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['agentstudio.'+table])).rows[0],
    {relrowsecurity:true,relforcerowsecurity:true})
    for(const table of protectedTables)assert.equal((await admin.query(
      'SELECT count(*)::int AS n FROM pg_policies WHERE schemaname=$1 AND tablename=$2',['agentstudio',table])).rows[0].n,0)
    const password='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w19_archive_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+password+"'")
    await admin.query('GRANT agentstudio_api,agentstudio_worker TO agentstudio_w19_archive_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w19_archive_login')
    api=new pg.Pool({...config,user:'agentstudio_w19_archive_login',password})
    const client=await api.connect()
    try{
      assert.deepEqual((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],{rolsuper:false,rolbypassrls:false})
      for(const role of ['agentstudio_api','agentstudio_worker']){
        await client.query('RESET ROLE');await client.query('SET ROLE '+role)
        for(const actor of ['',randomUUID(),...identity.owners]){
          await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
          for(const table of protectedTables){
            const column=table==='legacy_knowledge_base_imports'?'legacy_base_id':table.endsWith('base_refs')?'legacy_base_id':
              table.endsWith('snapshots')?'approved_mapping':'raw_payload'
            for(const sql of ['SELECT * FROM agentstudio.'+table,'UPDATE agentstudio.'+table+' SET '+column+'='+column,
              'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table,
              'INSERT INTO agentstudio.'+table+'('+column+') SELECT '+column+' FROM agentstudio.'+table+' WHERE false'])
              await assert.rejects(client.query(sql),e=>e.code==='42501')
          }
          if(role==='agentstudio_api'){
            const rows=(await client.query('SELECT owner_user_id FROM agentstudio.knowledge_bases')).rows
            assert.deepEqual(rows,identity.owners.includes(actor)?[{owner_user_id:actor}]:[])
          }
        }
      }
      await client.query('RESET ROLE');await client.query('SET ROLE agentstudio_api')
      await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[identity.owners[1]])
      assert.equal((await client.query('UPDATE agentstudio.knowledge_bases SET name=name WHERE owner_user_id=$1 RETURNING id',[identity.owners[0]])).rowCount,0)
      await assert.rejects(client.query('INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,$2)',[identity.owners[0],'denied']),e=>e.code==='42501')
      try{
        for(const t of protectedTables)await admin.query('GRANT SELECT ON agentstudio.'+t+' TO agentstudio_api,agentstudio_worker')
        for(const role of ['agentstudio_api','agentstudio_worker']){
          await client.query('RESET ROLE');await client.query('SET ROLE '+role)
          for(const actor of ['',randomUUID(),...identity.owners]){
            await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor]);await zero(client,protectedTables)
          }
        }
      }finally{
        for(const t of protectedTables)await admin.query('REVOKE SELECT ON agentstudio.'+t+' FROM agentstudio_api,agentstudio_worker')
      }
    }finally{client.release()}
    checkpoint='immutable_archive_sql_fences'
    for(const table of frozenTables){
      const column=table.endsWith('base_refs')?'legacy_base_id':table.endsWith('snapshots')?'approved_mapping':'raw_payload'
      const message=table.startsWith('legacy_kb_embedding_')?'immutable_embedding_archive':'immutable_kb_archive'
      for(const sql of ['UPDATE agentstudio.'+table+' SET '+column+'='+column,
        'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table])
        await assert.rejects(admin.query(sql),e=>(e.code==='P0001'&&e.message===message)||
          (sql.startsWith('TRUNCATE ')&&['0A000','2BP01'].includes(e.code)&&
            /cannot truncate a table referenced in a foreign key constraint/i.test(e.message)))
    }
    checkpoint='inert_runtime_and_unchanged_source'
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
    for(const table of ['agent_studio_kb_embedding_queue','agent_studio_kb_embedding_settings'])
      assert.equal((await admin.query('SELECT to_regclass($1) AS t',['agentstudio.'+table])).rows[0].t,null)
    assert.equal(await fingerprint(admin),first)
    f.verify();different.verify()
  }catch{
    // Never include SQL diagnostics, payloads, paths, credentials or assertion diffs.
    throw Error('w19_pg17_kb_combined_failed_redacted checkpoint='+checkpoint)
  }finally{
    try{
      try{if(api)await api.end()}finally{
        try{if(admin)await admin.end()}finally{
          for(const dir of identity.dirs){
            if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('w19-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')||
              fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('cleanup_refused')
            fs.rmSync(dir,{recursive:true,force:true})
          }
        }
      }
    }catch{throw Error('w19_pg17_kb_combined_cleanup_failed_redacted')}
    // No DROP/restore; the GitHub job owns disposal of its temporary service.
  }
  console.log('W19_PG17_KB_COMBINED_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO')
})
