// W20: synthetic-only, standalone; refuse before pg/SQLite/importer imports or TCP.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const self=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(self),'../../..')
const entry=path.join(root,'services/pg-api/src/stage-migration-operator.mjs')
const sha=data=>createHash('sha256').update(data).digest('hex')
const stamp='2026-10-15T01:00:00.000Z'
const refusal='refuse_non_ephemeral_pg17_full_stage'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_W20_FULL_STAGE_TEST_ENABLED!=='true'||
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
    application_name:'synthetic_w20_full_stage'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w20',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W20_FULL_STAGE_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W20 environment gates are mandatory before imports or I/O',()=>{
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
  for(const temp of ['/','/tmp/../tmp/w20','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W20 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';import fs from 'node:fs';import {registerHooks} from 'node:module';"+
    "Object.defineProperty(process,'platform',{value:'linux'});"+
    "net.Socket.prototype.connect=function(){throw Error('W20_FORBIDDEN_SOCKET')};"+
    "for(const key of ['writeFileSync','appendFileSync','mkdtempSync','mkdirSync','chmodSync','rmSync'])"+
    "fs[key]=()=>{throw Error('W20_FORBIDDEN_WRITE')};"+
    "registerHooks({resolve(specifier,context,next){"+
    "if(specifier==='pg'||specifier==='node:sqlite'||specifier.includes('/src/stage-'))"+
    "throw Error('W20_FORBIDDEN_IMPORT');return next(specifier,context)}});")
  for(const change of [{AGENT_STUDIO_PG17_W20_FULL_STAGE_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'}]){
    const env={...process.env,...validEnv(),...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!out.includes('W20_PG17_FULL_STAGE_PASS'),'a refused entry cannot report real PG17 success')
    assert.ok(!/W20_FORBIDDEN_(SOCKET|WRITE|IMPORT)|ECONNREFUSED|ENOTFOUND/.test(out),
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
  const candidate=path.resolve(root,'..','w20-runner-temp')
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
function guardSource(guard=''){
  const allowed=['stage-migration-operator.mjs','stage-user-import-cli.ts','stage-agent-import-cli.ts',
    'stage-kb-combined-import-cli.ts','stage-reconciliation-cli.ts'].map(n=>path.join(root,'services/pg-api/src',n))
  return `import net from 'node:net';
import cp from 'node:child_process';
import fs from 'node:fs';import {createHash} from 'node:crypto';
import dns from 'node:dns';import dgram from 'node:dgram';
import http from 'node:http';import https from 'node:https';
import http2 from 'node:http2';import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const x=args[0];const port=typeof x==='object'?x.port:x;
 const host=typeof x==='object'?x.host:args[1];
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W20_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W20_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W20_EXTERNAL_FETCH_REFUSED')};
const spawn=cp.spawnSync,allowed=new Set(${JSON.stringify(allowed)});
const envKeys=new Set(['PATH','LANG','GITHUB_ACTIONS','NODE_OPTIONS',
 'AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED','AGENT_STUDIO_PG_HOST','AGENT_STUDIO_PG_DATABASE',
 'AGENT_STUDIO_PG_IMPORT_USER','AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE',
 'AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED','AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED',
 'AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED','AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED',
 'AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED','AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED',
 'AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED','AGENT_STUDIO_PG_RECONCILIATION_USER',
 'AGENT_STUDIO_PG_STAGE_RECONCILIATION_PASSWORD_FILE']);
cp.spawnSync=function(exe,args,options){
 const e=options?.env;
 if(!${JSON.stringify(guard)}||exe!==process.execPath||options?.shell||!Array.isArray(args)||
 args[0]!=='--experimental-strip-types'||!allowed.has(args[1])||!e||
 Object.keys(e).some(k=>!envKeys.has(k))||e.GITHUB_ACTIONS!=='false'||
 e.NODE_OPTIONS!==${JSON.stringify('--import='+pathToFileURL(guard||root).href)}||
 e.AGENT_STUDIO_PG_HOST!=='127.0.0.1'||e.AGENT_STUDIO_PG_DATABASE!=='agentstudio_stage'||
 e.AGENT_STUDIO_PG_IMPORT_USER!=='agentstudio_admin')throw Error('W20_NON_OPERATOR_CHILD_REFUSED');
 const result=spawn(exe,args,options);
 let r;try{r=JSON.parse(result.stdout)}catch{}
 if(result.status===0&&!r)throw Error('W20_CHILD_RECEIPT_REFUSED');
 if(r){
  const source=args[args.indexOf('--snapshot')+1];
  const digest=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if((r.source_sha256??r.source_snapshot_sha256)!==digest||r.production_cutover_allowed!==false)
    throw Error('W20_CHILD_RECEIPT_REFUSED');
  if(args[1].endsWith('stage-kb-combined-import-cli.ts')){
   if(r.source_read_only!==true||r.knowledge_archive_only!==true||r.embedding_enabled!==false||
      r.rag_enabled!==false||r.acl_activated!==false||r.jobs_created!==0)
     throw Error('W20_CHILD_RECEIPT_REFUSED');
   if(args.includes('--execute')&&result.status===0&&
     (![[2,3,2,0,0,0],[0,0,0,2,3,2]].some(x=>JSON.stringify(x)===JSON.stringify([
       r.metadata_imported,r.content_imported,r.embedding_imported,
       r.metadata_replayed,r.content_replayed,r.embedding_replayed]))))
     throw Error('W20_CHILD_RECEIPT_REFUSED');
  }
  if(args[1].endsWith('stage-reconciliation-cli.ts')&&
    (r.source_read_only!==true||r.target_read_only!==true||r.output_complete_source_coverage!==false))
    throw Error('W20_CHILD_RECEIPT_REFUSED');
 }
 return result;
};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','fork'])
 cp[k]=()=>{throw Error('W20_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W20 guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W20_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W20_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W20_GUARD_PASS')
})

function fixture(DatabaseSync,temp,identity,change=()=>{},mapChange=()=>{}){
  const dir=fs.mkdtempSync(path.join(temp,'w20-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  identity.dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping','oidc','approval'].map(k=>
    [k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const marker='W20_PRIVATE_'+randomBytes(16).toString('hex')
  const vectorText='[ 1.000, -0.0, 2e-3 ]'
  const bases=[],rows={document:[],chunk:[],vector:[]}
  const settings={rh_user_id:'employee0000001',connection_id:'conn0',model_name:'旧模型  ',updated_ms:1792030400123}
  const queue={rh_user_id:'employee0000001',base_id:'base0',attempts:7,next_attempt_ms:1792030400456,lease_until_ms:1792030499999,last_error:'历史错误 中文😀\n  ',updated_ms:1792030400789}
  const db=new DatabaseSync(files.snapshot)
  let tables
  try{
    db.exec(`PRAGMA journal_mode=DELETE;
      CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT);
      CREATE TABLE agent_specs(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT);
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
    const raw={id:'agent0000000001',rh_user_id:'employee0000001',name:marker+' Agent',
      spec:JSON.stringify({goal:'Synthetic report',task_scope:'Offline only',deliverables:['Report'],
      task_plan:['Review'],done_criteria:['Done'],tools:[],knowledge_base_ids:[],require_approval:true}),
      source:'',template_key:'',created:stamp,updated:stamp}
    db.prepare('INSERT INTO agent_specs VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(raw))
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
  privateFile(files.oidc,JSON.stringify({schema_version:'studio-reviewed-oidc-provision-v1',source_sha256:digest,
    records:identity.owners.map((owner,i)=>({old_id:'employee000000'+(i+1),new_studio_user_id:owner,
    external_issuer:identity.issuer,external_subject:identity.subjects[i],
    reviewed_by:'Synthetic independent IdP reviewer',reviewed_at:stamp}))}))
  privateFile(files.approval,JSON.stringify({source_sha256:digest,approved_by:'Synthetic source auditor',approved_at:stamp}))
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

function childEnvironment(f,guard){
  return {PATH:path.dirname(process.execPath),LANG:'C.UTF-8',GITHUB_ACTIONS:'false',
    NODE_OPTIONS:'--import='+pathToFileURL(guard).href,
    AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',
    AGENT_STUDIO_PG_DATABASE:'agentstudio_stage',AGENT_STUDIO_PG_IMPORT_USER:'agentstudio_admin',
    AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:path.join(f.dir,'pg-password')}
}
function invoke(f,guard,password,identity){
  f.verify()
  const env=childEnvironment(f,guard)
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(env.GITHUB_ACTIONS,'false')
  const child=spawnSync(process.execPath,['--experimental-strip-types',entry,'--execute',
    '--confirm-isolated-stage','agentstudio_stage','--allow-partial-trial',
    ...Object.entries(f.files).flatMap(([key,file])=>['--'+key,file])],
  {cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,windowsHide:true})
  f.verify()
  assert.equal(process.env.GITHUB_ACTIONS,'true','parent CI fence stays intact')
  assert.ok(!child.error&&child.signal===null,'operator must finish without timeout')
  const out=child.stdout+child.stderr
  for(const secret of [password,f.marker,...identity.subjects,...identity.owners,'agent0000000001','employee0000001','employee0000002','conn0',...Object.values(f.files),env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE])
    assert.ok(!out.includes(secret),'operator must redact private values')
  assert.ok(!/W20_NETWORK_REFUSED|W20_NON_OPERATOR_CHILD_REFUSED|W20_EXTERNAL_FETCH_REFUSED|W20_CHILD_RECEIPT_REFUSED/.test(out),
    'operator must use only allowed isolated operations')
  let report
  try{report=JSON.parse(child.stdout)}catch{throw Error('operator_report_not_json')}
  assert.equal(report.production_cutover_allowed,false)
  assert.equal(report.source_snapshot_verified,true)
  assert.equal(report.full_manifest_verified,true)
  assert.equal(report.source_tables,11)
  assert.ok(report.source_sha256===f.digest,'operator SHA must match frozen bytes')
  return {status:child.status,report}
}
test('fail-closed: child environment excludes inherited production credentials and loaders',()=>{
  const env=childEnvironment({dir:path.resolve(root,'synthetic-unused')},path.join(root,'synthetic-unused-guard.mjs'))
  assert.deepEqual(Object.keys(env).sort(),['PATH','LANG','GITHUB_ACTIONS','NODE_OPTIONS',
    'AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED','AGENT_STUDIO_PG_HOST','AGENT_STUDIO_PG_DATABASE',
    'AGENT_STUDIO_PG_IMPORT_USER','AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE'].sort())
  assert.equal(env.GITHUB_ACTIONS,'false')
  for(const key of ['DATABASE_URL','PGHOST','PGPASSWORD','PGOPTIONS','NODE_PATH','OPENAI_API_KEY',
    'POCKETBASE_ADMIN_PASSWORD','NEON_DATABASE_URL','AWS_SECRET_ACCESS_KEY'])assert.equal(env[key],undefined)
  // Real guard, exact allowed executable/entry, poisoned environment: refuse before spawn.
  const guard=path.join(root,'synthetic-unused-guard.mjs')
  const preload='data:text/javascript,'+encodeURIComponent(guardSource(guard))
  const code="import assert from 'node:assert/strict';import cp from 'node:child_process';"+
    "const base="+JSON.stringify(env)+";"+
    "for(const key of ['DATABASE_URL','PGPASSWORD','NODE_PATH','OPENAI_API_KEY'])"+
    "assert.throws(()=>cp.spawnSync(process.execPath,"+
    JSON.stringify(['--experimental-strip-types',entry])+",{env:{...base,[key]:'synthetic-poison'}}),/W20_NON_OPERATOR_CHILD_REFUSED/);"
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',code],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'poisoned child environment must be refused')
})

test('fail-closed: child receipts require the actual source SHA and inert combined archive flags',()=>{
  const guard=path.join(root,'unused-receipt-guard.mjs')
  const env=childEnvironment({dir:path.join(root,'unused-fixture')},guard)
  const digest=sha('synthetic-offline-bytes')
  const valid={source_snapshot_sha256:digest,production_cutover_allowed:false,source_read_only:true,
    knowledge_archive_only:true,embedding_enabled:false,rag_enabled:false,acl_activated:false,jobs_created:0,
    metadata_imported:2,content_imported:3,embedding_imported:2,
    metadata_replayed:0,content_replayed:0,embedding_replayed:0}
  const setup="import cp from 'node:child_process';import fs from 'node:fs';"+
    "fs.readFileSync=()=>Buffer.from('synthetic-offline-bytes');"+
    "cp.spawnSync=()=>({status:0,stdout:JSON.stringify(globalThis.receipt)});"
  const probe="import assert from 'node:assert/strict';import cp from 'node:child_process';"+
    "const valid="+JSON.stringify(valid)+";const env="+JSON.stringify(env)+";"+
    "const args="+JSON.stringify(['--experimental-strip-types',path.join(root,'services/pg-api/src/stage-kb-combined-import-cli.ts'),
      '--execute','--snapshot','synthetic-unused'])+";"+
    "globalThis.receipt=valid;assert.equal(cp.spawnSync(process.execPath,args,{env}).status,0);"+
    "for(const patch of [{source_snapshot_sha256:'0'.repeat(64)},{source_read_only:false},"+
    "{knowledge_archive_only:false},{rag_enabled:true},{embedding_enabled:true},{acl_activated:true},"+
    "{jobs_created:1},{production_cutover_allowed:true},{content_imported:0}]){"+
    "globalThis.receipt={...valid,...patch};assert.throws(()=>cp.spawnSync(process.execPath,args,{env}),/W20_CHILD_RECEIPT_REFUSED/)}"
  const child=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(setup),
    '--import','data:text/javascript,'+encodeURIComponent(guardSource(guard)),'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'bad receipt must fail closed without real I/O')
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


function incomplete(out,replay){
  assert.equal(out.status,2)
  assert.equal(out.report.result,'stage_imported_reconciliation_incomplete')
  assert.deepEqual(out.report.blockers,['unreconciled_business_domains','production_cutover_forbidden'])
  const p=out.report.phase_results
  assert.deepEqual(p.map(x=>x.phase),['identity','agent','knowledge_combined','reconciliation'])
  assert.deepEqual(p.map(x=>x.exit_code),[0,0,0,2])
  for(const [i,n] of [[0,2],[1,1],[2,2]]){
    assert.equal(p[i].status,'passed');assert.equal(p[i].summary.imported,replay?0:n)
    assert.equal(p[i].summary.replayed,replay?n:0)
  }
  assert.equal(p[2].summary.result,'single_transaction_three_domains_staged')
  assert.equal(p[3].summary.result,'not_ready_for_cutover')
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
// Run last. No production connection string, input path or inherited secret is accepted.
test('PG17 TCP: W20 unified identity + Agent + combined KB + W9, NO-GO',async()=>{
  const config=requireEphemeral(process.env) // BEFORE filesystem/database I/O or source imports
  const temp=checkedTemp()
  const identity={owners:[randomUUID(),randomUUID()],subjects:[randomUUID(),randomUUID()],
    issuer:'https://w20.synthetic.invalid',dirs:[]}
  let admin,api,checkpoint='network_guard'
  try{
    const guardDir=fs.mkdtempSync(path.join(temp,'w20-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
    identity.dirs.push(guardDir);fs.chmodSync(guardDir,0o700)
    const guard=path.join(guardDir,'synthetic-guard.mjs')
    privateFile(guard,guardSource(guard))
    await import(pathToFileURL(guard).href)
    const [{default:pg},{DatabaseSync},content,embedding,{normalizeLegacyAgent},{reconcileStage}]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-kb-content-import-source.ts'),
      import('../src/stage-kb-embedding-state-import.ts'),import('../src/stage-agent-import.ts'),
      import('../src/stage-reconciliation.ts')])
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
      "('agentstudio_api','agentstudio_worker','agentstudio_w20_archive_login')")).rows[0].n,0)
    checkpoint='unmodified_schema'
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    const migrations=['006_legacy_workflow_import','007_legacy_kb_import','008_legacy_schedule_import',
      '009_legacy_collaboration_import','010_legacy_kb_content','011_legacy_user_provision',
      '012_legacy_run_history','013_legacy_kb_embedding_state']
    for(const name of migrations)await admin.query(sqlFile('db/postgres/migrations/pg_v8_'+name+'.sql'))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    const versions=(await admin.query('SELECT version FROM agentstudio.schema_migrations')).rows.map(r=>r.version)
    for(const v of ['005',...migrations.map(m=>m.slice(0,3))])assert.ok(versions.includes('pg_v8_'+v))
    checkpoint='sealed_source_first_fixture'
    const f=fixture(DatabaseSync,temp,identity)
    checkpoint='sealed_source_second_fixture'
    const different=fixture(DatabaseSync,temp,identity)
    assert.notEqual(f.digest,different.digest)
    checkpoint='sealed_source_password_file'
    for(const x of [f,different])privateFile(path.join(x.dir,'pg-password'),config.password)
    checkpoint='sealed_source_embedding_reader'
    const token=embedding.loadKbEmbeddingStateSnapshot(f.files)
    checkpoint='sealed_source_content_reader'
    const cb=content.loadKbContentSnapshot(f.files,token)
    checkpoint='sealed_source_manifest_assertions'
    const manifest=JSON.parse(fs.readFileSync(f.files.manifest,'utf8'))
    assert.equal(Object.keys(manifest.tables).length,11)
    assert.equal(manifest.sha256,f.digest);assert.equal(manifest.bytes,fs.statSync(f.files.snapshot).size)
    assert.equal(cb.snapshot,f.digest);assert.equal(token.snapshot,f.digest)
    assert.equal(cb.mapping,token.mapping)
    // Preflight must reject incompatible business data before ANY phase writes.
    checkpoint='sealed_source_preflight_fingerprint'
    const before=await fingerprint(admin)
    let preflightProbe=0
    for(const change of [
      db=>db.exec("UPDATE agent_studio_kb_embedding_queue SET base_id='base1'"),
      db=>db.exec("UPDATE agent_studio_kb_chunks SET rh_user_id='employee0000002'"),
      db=>db.exec("INSERT INTO agent_studio_kb_access VALUES('synthetic_acl')"),
      db=>db.exec(`UPDATE agent_specs SET spec=json_set(spec,'$.knowledge_base_ids',json('["base0"]'))`),
    ]){
      checkpoint='sealed_source_invalid_fixture_'+preflightProbe
      const bad=fixture(DatabaseSync,temp,identity,change)
      privateFile(path.join(bad.dir,'pg-password'),config.password)
      checkpoint='sealed_source_invalid_operator_'+preflightProbe
      const out=invoke(bad,guard,config.password,identity)
      checkpoint='sealed_source_invalid_report_'+preflightProbe
      assert.equal(out.status,2);assert.equal(out.report.result,'preflight_blocked')
      assert.deepEqual(out.report.blockers,['unverified_or_incompatible_source_domain'])
      assert.ok(out.report.phase_results.some(p=>p.status==='blocked'))
      checkpoint='sealed_source_invalid_unchanged_'+preflightProbe
      assert.equal(await fingerprint(admin),before);bad.verify()
      preflightProbe++
    }
    checkpoint='unified_operator_first_run'
    incomplete(invoke(f,guard,config.password,identity),false)
    assert.deepEqual(await counts(admin),[2,2,1,1,1,1,1,2,2])
    const first=await fingerprint(admin)
    for(const [table,n] of [['users',2],['legacy_user_imports',2],['agent_specs',1],['legacy_agent_imports',1]])
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,n)
    const users=(await admin.query('SELECT * FROM agentstudio.users')).rows
    for(let i=0;i<2;i++){
      const u=users.find(u=>u.id===identity.owners[i])
      assert.ok(u&&u.status==='disabled'&&u.external_issuer===identity.issuer&&
        u.external_subject===identity.subjects[i]&&u.display_name==='')
    }
    for(const r of (await admin.query('SELECT * FROM agentstudio.legacy_user_imports')).rows){
      const i=Number(r.legacy_user_id.slice(-1))-1
      assert.equal(r.target_user_id,identity.owners[i]);assert.equal(r.source_snapshot_sha256,f.digest)
      assert.equal(r.active_automatically,false)
      assert.equal(r.reviewed_mapping_sha256,sha(fs.readFileSync(f.files.mapping)))
      assert.equal(r.reviewed_idp_sha256,sha(fs.readFileSync(f.files.oidc)))
    }
    const sqlite=new DatabaseSync(f.files.snapshot,{readOnly:true})
    let raw
    try{raw=sqlite.prepare('SELECT * FROM agent_specs').get()}finally{sqlite.close()}
    const expected=normalizeLegacyAgent(raw,new Map([['employee0000001',identity.owners[0]]]))
    const spec=(await admin.query('SELECT * FROM agentstudio.agent_specs')).rows[0]
    const legacy=(await admin.query('SELECT * FROM agentstudio.legacy_agent_imports')).rows[0]
    assert.equal(spec.owner_user_id,identity.owners[0]);assert.equal(spec.name,expected.name)
    assert.deepEqual(spec.spec,expected.spec);assert.equal(spec.requires_approval,true)
    assert.equal(spec.created_at.toISOString(),expected.created_at);assert.equal(spec.updated_at.toISOString(),expected.updated_at)
    assert.equal(legacy.source_snapshot_sha256,f.digest);assert.equal(legacy.payload_sha256,expected.payload_sha256)
    assert.equal(legacy.target_spec_id,spec.id);assert.equal(legacy.owner_user_id,identity.owners[0])
    const secrets=[f.marker+' password',f.marker+' api-key','https://never-call.synthetic.invalid']
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
    checkpoint='W9_real_read_only_NO_GO'
    const trace=[]
    const readonly={async connect(){const db=await admin.connect();return {
      async query(sql,values=[]){
        assert.match(sql,/^(SELECT\b|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/)
        trace.push(sql)
        if(sql.startsWith('SELECT'))assert.equal((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only,'on')
        return {rows:(await db.query(sql,values)).rows}
      },release(){db.release()}}}}
    const report=await reconcileStage({...f.files,reviewed_idp:f.files.oidc,
      approval:JSON.parse(fs.readFileSync(f.files.approval,'utf8'))},readonly)
    for(const [domain,n] of [['studio_users',2],['agent_specs',1],['agent_studio_kb_bases',2]]){
      const r=report.find(r=>r.domain===domain)
      assert.ok(r?.status==='success'&&r.source_count===n&&r.target_count===n&&r.association_anomalies===0)
    }
    for(const domain of ['agent_studio_kb_documents','agent_studio_kb_chunks','agent_studio_kb_vectors']){
      const r=report.find(r=>r.domain===domain)
      assert.ok(r?.status==='unsupported'&&r.source_count===1&&r.target_count===1&&r.association_anomalies===0)
      assert.deepEqual(r.blockers,['archive_only_live_unsupported'])
    }
    assert.ok(report.some(r=>r.domain==='audit'&&r.status!=='success'))
    // W9 currently has NO embedding settings/queue domain: no invented success.
    assert.ok(!report.some(r=>r.domain.includes('embedding')))
    assert.deepEqual(trace.filter(sql=>!sql.startsWith('SELECT')),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK'])
    const ro=await admin.connect()
    try{
      await ro.query('BEGIN READ ONLY')
      assert.equal((await ro.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on')
      await assert.rejects(ro.query('UPDATE agentstudio.agent_specs SET name=name'),e=>e.code==='25006')
    }finally{await ro.query('ROLLBACK');ro.release()}
    assert.equal(await fingerprint(admin),first)
    checkpoint='same_source_replay_and_foreign_source_refusal'
    incomplete(invoke(f,guard,config.password,identity),true)
    assert.equal(await fingerprint(admin),first)
    const conflict=invoke(different,guard,config.password,identity)
    assert.equal(conflict.status,2);assert.equal(conflict.report.result,'partial_stage_must_not_switch')
    assert.deepEqual(conflict.report.phase_results.map(p=>[p.phase,p.exit_code]),[['identity',1]])
    assert.equal(await fingerprint(admin),first)
    checkpoint='cross_domain_FK_owner_fences'
    for(const [table,patch,where] of [
      ['legacy_kb_document_archive',{legacy_id:'w20_denied_document',owner_user_id:identity.owners[1]},'true'],
      ['legacy_kb_chunk_archive',{legacy_id:'w20_denied_chunk',legacy_document_id:'missing_document'},'true'],
      ['legacy_kb_vector_archive',{legacy_id:'missing_chunk'},'true'],
      ['legacy_kb_embedding_state_archive',{legacy_row_id:'w20_denied_queue',owner_user_id:identity.owners[1]},
        "source_table='agent_studio_kb_embedding_queue'"],
    ]){
      await assert.rejects(admin.query('INSERT INTO agentstudio.'+table+
        ' SELECT (jsonb_populate_record(NULL::agentstudio.'+table+',to_jsonb(t)||$1::jsonb)).* FROM agentstudio.'+
        table+' t WHERE '+where,[JSON.stringify(patch)]),
        e=>e.code==='23503'||(e.code==='P0001'&&e.message===(table==='legacy_kb_embedding_state_archive'?
          'embedding_archive_owner_mapping':'kb_archive_crosswalk_mismatch')))
      assert.equal(await fingerprint(admin),first)
    }
    checkpoint='force_rls_and_owner_isolation'
    const protectedTables=['legacy_knowledge_base_imports',...frozenTables]
    for(const table of domains)assert.deepEqual((await admin.query(
      'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['agentstudio.'+table])).rows[0],
    {relrowsecurity:true,relforcerowsecurity:true})
    for(const table of protectedTables)assert.equal((await admin.query(
      'SELECT count(*)::int AS n FROM pg_policies WHERE schemaname=$1 AND tablename=$2',['agentstudio',table])).rows[0].n,0)
    const password='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w20_archive_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+password+"'")
    await admin.query('GRANT agentstudio_api,agentstudio_worker TO agentstudio_w20_archive_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w20_archive_login')
    api=new pg.Pool({...config,user:'agentstudio_w20_archive_login',password})
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
            assert.equal((await client.query('SELECT count(*)::int AS n FROM agentstudio.users')).rows[0].n,
              identity.owners.includes(actor)?1:0)
            assert.equal((await client.query('SELECT count(*)::int AS n FROM agentstudio.agent_specs')).rows[0].n,
              actor===identity.owners[0]?1:0)
            assert.equal((await client.query('SELECT agentstudio.identity_user_id($1,$2) AS id',
              [identity.issuer,identity.subjects[0]])).rows[0].id,null)
            const rows=(await client.query('SELECT owner_user_id FROM agentstudio.knowledge_bases')).rows
            assert.deepEqual(rows,identity.owners.includes(actor)?[{owner_user_id:actor}]:[])
          }
        }
      }
      await client.query('RESET ROLE');await client.query('SET ROLE agentstudio_api')
      for(const table of ['legacy_user_imports','legacy_agent_imports'])
        await assert.rejects(client.query('SELECT * FROM agentstudio.'+table),e=>e.code==='42501')
      await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[identity.owners[1]])
      assert.equal((await client.query('UPDATE agentstudio.agent_specs SET name=name RETURNING id')).rowCount,0)
      await assert.rejects(client.query('INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) VALUES($1,$2,$3)',
        [identity.owners[0],'Synthetic denied',JSON.stringify(expected.spec)]),e=>e.code==='42501')
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
    for(const table of ['model_connections','agent_studio_kb_embedding_queue','agent_studio_kb_embedding_settings'])
      assert.equal((await admin.query('SELECT to_regclass($1) AS t',['agentstudio.'+table])).rows[0].t,null)
    assert.equal(await fingerprint(admin),first)
    f.verify();different.verify()
  }catch{
    // Never include SQL diagnostics, payloads, paths, credentials or assertion diffs.
    throw Error('w20_pg17_full_stage_failed_redacted checkpoint='+checkpoint)
  }finally{
    try{
      try{if(api)await api.end()}finally{
        try{if(admin)await admin.end()}finally{
          for(const dir of identity.dirs){
            if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('w20-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')||
              fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('cleanup_refused')
            fs.rmSync(dir,{recursive:true,force:true})
          }
        }
      }
    }catch{throw Error('w20_pg17_full_stage_cleanup_failed_redacted')}
    // No DROP/restore; the GitHub job owns disposal of its temporary service.
  }
  console.log('W20_PG17_FULL_STAGE_PASS real_tcp=true synthetic_only=true cutover=NO-GO')
})
