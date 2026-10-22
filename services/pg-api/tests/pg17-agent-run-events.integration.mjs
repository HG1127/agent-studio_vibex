// W25: synthetic-only, standalone; refuse before pg/SQLite/importer imports or TCP.
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
const refusal='refuse_non_ephemeral_pg17_agent_run_events'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_W25_AGENT_EVENTS_TEST_ENABLED!=='true'||
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
    application_name:'synthetic_w25_agent_run_events'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w25',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W25_AGENT_EVENTS_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W25 environment gates are mandatory before imports or I/O',()=>{
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
  deny({...valid,RUNNER_ENVIRONMENT:'self-hosted'})
  for(const run of ['1\n','1\r','1\t'])deny({...valid,GITHUB_RUN_ID:run,
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-'+run+'-'+randomBytes(32).toString('hex')})
  deny({...valid,AGENT_STUDIO_PG17_ADMIN_PASSWORD:valid.AGENT_STUDIO_PG17_ADMIN_PASSWORD+'\n'})
  for(const temp of ['/','/tmp/../tmp/w25','/tmp//w25','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W25 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';import fs from 'node:fs';import {registerHooks} from 'node:module';"+
    "Object.defineProperty(process,'platform',{value:'linux'});"+
    "net.Socket.prototype.connect=function(){throw Error('W25_FORBIDDEN_SOCKET')};"+
    "for(const key of ['writeFileSync','appendFileSync','mkdtempSync','mkdirSync','chmodSync','rmSync'])"+
    "fs[key]=()=>{throw Error('W25_FORBIDDEN_WRITE')};"+
    "registerHooks({resolve(specifier,context,next){"+
    "if(specifier==='pg'||specifier==='node:sqlite'||specifier.endsWith('/stage-agent-run-events-import.ts')||specifier.endsWith('/stage-agent-import.ts')||specifier.endsWith('/stage-history-import.ts'))"+
    "throw Error('W25_FORBIDDEN_IMPORT');return next(specifier,context)}});")
  for(const change of [{AGENT_STUDIO_PG17_W25_AGENT_EVENTS_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'},
    {RUNNER_TEMP:'/__w25_nonexistent_runner_temp__'}]){
    const env={...process.env,...validEnv(),...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!out.includes('W25_PG17_AGENT_EVENTS_PASS'),'a refused entry cannot report real PG17 success')
    assert.ok(!/W25_FORBIDDEN_(SOCKET|WRITE|IMPORT)|ECONNREFUSED|ENOTFOUND/.test(out),
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
  const candidate=path.resolve(root,'..','w25-runner-temp')
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
// Installed only after pure env validation and canonical RUNNER_TEMP validation.
// Application fs operations may write only this process's synthetic directories.
function guardFiles(temp,dirs){
  const readFiles=new Set([
    'db/postgres/001_stage_schema.sql',
    'db/postgres/migrations/pg_v8_011_legacy_user_provision.sql',
    'db/postgres/migrations/pg_v8_012_legacy_run_history.sql',
    'db/postgres/migrations/pg_v9_015_legacy_agent_run_events.sql'
  ].map(p=>path.join(root,p)))
  const original={lstat:fs.lstatSync}
  // Existing readers check this directory's existence to reject live sources.
  // Permit only directory metadata; never open or read anything inside it.
  const liveDirectory=path.join(root,'pocketbase/pb_data')
  const synthetic=p=>dirs.some(d=>p===d||contained(p,d))
  const check=(p,write=false)=>{
    if(p instanceof URL)p=fileURLToPath(p)
    if(typeof p!=='string')throw Error('W25_FILE_REFUSED')
    const absolute=path.resolve(p)
    const mkdir=write&&path.dirname(absolute)===temp&&
      path.basename(absolute).startsWith('w25-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')
    if(!(synthetic(absolute)||mkdir||(!write&&readFiles.has(absolute))))throw Error('W25_FILE_REFUSED')
    // No path component may redirect into PB, another checkout or external data.
    let cursor=absolute
    while(cursor!==path.dirname(cursor)){
      try{if(original.lstat(cursor).isSymbolicLink())throw Error('W25_FILE_REFUSED')}
      catch(e){if(e.code!=='ENOENT')throw e}
      cursor=path.dirname(cursor)
    }
    return absolute
  }
  for(const key of ['readFileSync','writeFileSync','appendFileSync','chmodSync','rmSync','mkdtempSync',
    'mkdirSync','unlinkSync','rmdirSync','truncateSync','utimesSync','chownSync']){
    const fn=fs[key]
    fs[key]=function(p,...args){check(p,key!=='readFileSync');return fn.call(this,p,...args)}
  }
  const open=fs.openSync
  fs.openSync=function(p,flags,...args){check(p,flags!=='r');return open.call(this,p,flags,...args)}
  for(const key of ['existsSync','realpathSync','statSync','lstatSync','accessSync','readdirSync']){
    const fn=fs[key]
    fs[key]=function(p,...args){
      if(!(typeof p==='string'&&path.resolve(p)===liveDirectory&&['existsSync','realpathSync'].includes(key)))check(p)
      return fn.call(this,p,...args)
    }
  }
  for(const key of ['renameSync','copyFileSync','cpSync','symlinkSync','linkSync'])
    fs[key]=()=>{throw Error('W25_FILE_REFUSED')}
  // Async filesystem APIs are unnecessary in this standalone harness.
  for(const key of ['readFile','writeFile','appendFile','open','mkdir','mkdtemp','rm','unlink',
    'rename','copyFile','cp','symlink','link','truncate','createReadStream','createWriteStream',
    'readdir','opendir','watch','watchFile','stat','lstat','realpath','access','chmod','chown','utimes']){
    if(typeof fs[key]==='function')fs[key]=()=>{throw Error('W25_FILE_REFUSED')}
    if(typeof fs.promises[key]==='function')fs.promises[key]=()=>{throw Error('W25_FILE_REFUSED')}
  }
  return check
}
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
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W25_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W25_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W25_EXTERNAL_FETCH_REFUSED')};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])
 cp[k]=()=>{throw Error('W25_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W25 guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W25_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W25_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W25_GUARD_PASS')
})

test('fail-closed: W25 filesystem guard rejects unrelated reads and every external write',()=>{
  const probe="import assert from 'node:assert/strict';import fs from 'node:fs';"+
    "import path from 'node:path';import {fileURLToPath} from 'node:url';"+
    "const root=path.resolve('.');const contained="+contained.toString()+";"+
    "const guardFiles="+guardFiles.toString()+";"+
    "const check=guardFiles(path.resolve('runner-temp'),[]);"+
    "for(const action of [()=>fs.readFileSync('/production/data.sqlite'),"+
    "()=>fs.writeFileSync('/production/output','x'),()=>fs.openSync('/production/data','r'),"+
    "()=>fs.statSync('/production/data'),()=>fs.readdirSync('/production'),"+
    "()=>fs.renameSync('/production/a','/production/b'),"+
    "()=>fs.promises.readFile('/production/data'),"+
    "()=>check(path.join(root,'pocketbase/pb_data/data.db'))])"+
    "assert.throws(action,/W25_FILE_REFUSED/);console.log('W25_FILE_GUARD_PASS');"
  const child=spawnSync(process.execPath,['--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'filesystem guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W25_FILE_GUARD_PASS')
})

// Exactly four SQLite tables; no live source paths, credentials or external input.
function fixture(DatabaseSync,temp,identity,contentHash,content=' \t[ \n ] ',change=()=>{},metadata=()=>{}){
  const dir=fs.mkdtempSync(path.join(temp,'w25-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  identity.dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping','idp'].map(k=>
    [k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const key=sha('W25-'+process.env.GITHUB_RUN_ID).slice(0,14)
  const ids={a:'a'+key,b:'b'+key,s:'d'+key,r:'e'+key,e:'f'+key}
  const marker='W25_PRIVATE_'+randomBytes(16).toString('hex')
  const run={id:ids.r,rh_user_id:ids.a,spec_id:ids.s,spec_name:'合成 '+marker,
    instruction:' 原样\n\t 😀 '+marker,status:'running',current_step:1,max_steps:3,model:'synthetic',
    config:' \n { \t } ',spec_snapshot:null,result:(' 历史全文\t🙂 '+marker+'\n').repeat(2000),
    error:'',checkpoint:' null \n',evaluation:' \t[ \n ] ',feedback:' { } ',
    created:'2026-10-15 00:00:00.000Z',updated:'2026-10-15 01:00:00.000Z'}
  const event={id:ids.e,run_id:ids.r,step_index:0,seq:1,event_type:'synthetic',
    content,created:run.created,updated:run.updated}
  const db=new DatabaseSync(files.snapshot)
  try{
    db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE studio_users(id TEXT);'+
      'CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT)')
    for(const owner of [ids.a,ids.b])db.prepare('INSERT INTO studio_users VALUES(?)').run(owner)
    db.prepare('INSERT INTO agent_specs VALUES(?,?)').run(ids.s,ids.a)
    for(const [table,raw] of [['agent_runs',run],['run_events',event]]){
      db.exec('CREATE TABLE '+table+'('+Object.keys(raw).map(k=>quote(k)+' '+
        (typeof raw[k]==='number'?'NUMERIC':'TEXT')).join(',')+')')
      db.prepare('INSERT INTO '+table+' VALUES('+Object.keys(raw).map(()=>'?').join(',')+')').run(...Object.values(raw))
    }
    change(db,ids)
  }finally{db.close()}
  const digest=sha(fs.readFileSync(files.snapshot))
  const review={verified_by:'W25 synthetic reviewer '+process.env.GITHUB_RUN_ID,approved_at:stamp}
  privateFile(files.mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
    records:[[ids.a,identity.owners[0]],[ids.b,identity.owners[1]]].map(([old_id,new_studio_user_id])=>
      ({old_id,new_studio_user_id,...review}))}))
  const read=new DatabaseSync(files.snapshot,{readOnly:true})
  let tables,reviewTables
  try{
    tables=Object.fromEntries(read.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      .map(({name})=>[name,read.prepare('SELECT count(*) AS n FROM '+quote(name)).get().n]))
    reviewTables=Object.fromEntries(['agent_runs','run_events'].map(t=>
      [t,{row_sha256:read.prepare('SELECT * FROM '+t+' ORDER BY id').all().map(contentHash)}]))
  }finally{read.close()}
  const manifest={format:'agent-studio-sqlite-snapshot-v1',sha256:digest,
    bytes:fs.statSync(files.snapshot).size,tables,
    history_archive_review:{source_sha256:digest,table:'agent_runs',credentials_absent:true,
      ...review,row_sha256:reviewTables.agent_runs.row_sha256},
    agent_run_events_archive_review:{source_sha256:digest,identity_mapping_sha256:sha(fs.readFileSync(files.mapping)),
      credentials_absent:true,...review,tables:{run_events:reviewTables.run_events}}}
  metadata(manifest);privateFile(files.manifest,JSON.stringify(manifest))
  const idp={run_id:process.env.GITHUB_RUN_ID,issuer:'w25-synthetic',...review,
    records:identity.owners.map((target_user_id,i)=>({target_user_id,
      subject:'w25-'+process.env.GITHUB_RUN_ID+'-'+i,status:'disabled',...review}))}
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
  return {files,ids,run,event,digest,verify,idp,idpHash:sha(fs.readFileSync(files.idp)),
    prepare:reader=>reader(files.snapshot,files.manifest,files.mapping)}
}
const unused=['jobs','runs','run_steps','approvals','external_effects','run_leases','workflows',
  'agent_specs','schedules','schedule_occurrences','knowledge_bases','knowledge_documents',
  'knowledge_chunks','teams','team_memberships','audit_events','template_invites','legacy_agent_imports']
function reportCheck(actual,imported,replayed){
  assert.deepEqual(actual,{imported,replayed,reconciled:1,execution_enabled:false,
    model_execution_enabled:false,history_verified:false,runtime_jobs_created:0,
    side_effects_created:0,production_cutover_allowed:false})
}
function parentReport(actual,imported,replayed){
  assert.deepEqual(actual,{imported,replayed,reconciled:1,source_table:'agent_runs',
    execution_enabled:false,history_verified:false,production_cutover_allowed:false})
}
// Forward all real SQL unchanged. Only inject 22012 AFTER a successful INSERT.
function faultPool(admin,table){
  const seen={inserts:0,sqlstate:null,trace:[]}
  const pool={async connect(){const db=await admin.connect();return {
    release(){db.release()},async query(sql,values=[]){
      seen.trace.push(sql)
      const result=await db.query(sql,values)
      if(sql.startsWith('INSERT INTO agentstudio.'+table+'(')){
        seen.inserts++
        assert.equal((await db.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,1)
        try{await db.query('SELECT 1 / 0')}catch(e){seen.sqlstate=e.code;throw e}
        throw Error('sql_fault_did_not_fire')
      }
      return result
    }
  }}}
  return {pool,seen}
}
function checkFault(seen){
  assert.equal(seen.inserts,1);assert.equal(seen.sqlstate,'22012')
  assert.equal(seen.trace[0],'BEGIN');assert.equal(seen.trace.at(-1),'ROLLBACK')
  assert.ok(!seen.trace.includes('COMMIT'))
}

// Run last: guards persist until this dedicated test process exits.
function archiveMutationBlocked(error,table,sql){
  if(error?.code==='P0001'&&/immutable$/.test(error.message))return true
  // PostgreSQL checks the archived child FOREIGN KEY before its parent
  // statement-level TRUNCATE trigger in some plans. Either is a true
  // database refusal; a successful mutation must never pass this test.
  return table==='legacy_run_history'&&sql.startsWith('TRUNCATE ')&&
    ['0A000','2BP01'].includes(error?.code)&&
    /cannot truncate a table referenced in a foreign key constraint/i.test(error.message)
}
test('PG17 TCP: W25 Agent events parent/child archive, rollback, FK, RLS, NO-GO',async()=>{
  const config=requireEphemeral(process.env)
  const temp=checkedTemp()
  const identity={owners:[randomUUID(),randomUUID()],dirs:[]}
  let admin,api,checkpoint='network_guard'
  try{
    await import('data:text/javascript,'+encodeURIComponent(guardSource()))
    const [{default:pg},{DatabaseSync},{prepareAgentRunEventsImport:prepare,
      importLegacyAgentRunEventsToStage:archive},{prepareHistoryImport:prepareParent,
      importLegacyHistoryToStage:archiveParent},{contentHash}]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-agent-run-events-import.ts'),
      import('../src/stage-history-import.ts'),import('../src/stage-agent-import.ts')])
    const checkFile=guardFiles(temp,identity.dirs)
    checkpoint='empty_target_preflight'
    admin=new pg.Pool(config)
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,"+
      "inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super")).rows[0]
    assert.ok(g.db==='agentstudio_stage'&&g.login==='agentstudio_admin'&&g.role===g.login&&g.super===true)
    // Service containers have a bridge address on the server; TCP endpoint is guarded loopback.
    assert.ok(g.version>=170000&&g.version<180000&&g.address!==null&&g.port===5432)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS schema")).rows[0].schema,null)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_namespace WHERE "+
      "nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_w25_archive_login')")).rows[0].n,0)
    checkpoint='unmodified_schema_001_011_012_015'
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    // The unmodified base already includes 005, required by 011.
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM agentstudio.schema_migrations WHERE version='pg_v8_005'")).rows[0].n,1)
    for(const file of ['db/postgres/migrations/pg_v8_011_legacy_user_provision.sql',
      'db/postgres/migrations/pg_v8_012_legacy_run_history.sql',
      'db/postgres/migrations/pg_v9_015_legacy_agent_run_events.sql'])await admin.query(sqlFile(file))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    // Every fixture always contains exactly one running parent and one child.
    const f=fixture(DatabaseSync,temp,identity,contentHash)
    for(let i=0;i<2;i++){
      const record=f.idp.records[i]
      assert.equal(record.status,'disabled');assert.equal(f.idp.run_id,process.env.GITHUB_RUN_ID)
      assert.equal(record.target_user_id,identity.owners[i])
      await admin.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,$2,$3,'disabled')",
        [record.target_user_id,f.idp.issuer,record.subject])
      await admin.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,'+
        'target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$6)',
        [f.digest,i?f.ids.b:f.ids.a,identity.owners[i],sha(fs.readFileSync(f.files.mapping)),f.idpHash,contentHash(record)])
    }
    checkpoint='reader_compatibility_and_refusals'
    const before=await fingerprint(admin)
    const plan=f.prepare(prepare)
    assert.equal(plan.rows.length,1);assert.equal(plan.parents.length,1)
    for(const content of [null,' \t null\r\n',' \n{ \t}\r',' \t[ \n ] ']){
      const lexical=fixture(DatabaseSync,temp,identity,contentHash,content)
      assert.equal(lexical.prepare(prepare).rows[0].source_record.content,content);lexical.verify()
    }
    for(const [change,metadata,code] of [
      [()=>{},m=>{m.sha256='0'.repeat(64)},'manifest_invalid'],
      [()=>{},m=>{delete m.tables.agent_specs},'manifest_missing_table'],
      [()=>{},m=>{m.history_archive_review.row_sha256=['0'.repeat(64)]},'review_or_count_mismatch'],
      [()=>{},m=>{m.agent_run_events_archive_review.tables.run_events.row_sha256=['0'.repeat(64)]},'review_or_count_mismatch'],
      [(db,ids)=>db.prepare('UPDATE agent_specs SET rh_user_id=?').run(ids.b),()=>{},'spec_missing_or_foreign'],
      [(db,ids)=>db.prepare('UPDATE run_events SET run_id=?').run(ids.b),()=>{},'run_missing_or_foreign'],
      [db=>db.exec('ALTER TABLE run_events ADD COLUMN extra TEXT'),()=>{},'unknown_or_missing_field'],
      [db=>db.exec('ALTER TABLE run_events ADD COLUMN hidden TEXT GENERATED ALWAYS AS (id) VIRTUAL'),()=>{},'unknown_or_missing_field'],
      [db=>db.prepare('UPDATE run_events SET content=?').run('{"text":"opaque"}'),()=>{},'structured_history_not_supported'],
      [db=>db.prepare('UPDATE agent_runs SET result=?').run('before\0after'),()=>{},'text_not_lossless']
    ]){
      const bad=fixture(DatabaseSync,temp,identity,contentHash,undefined,change,metadata)
      assert.throws(()=>bad.prepare(prepare),e=>e.message==='agent_run_events_'+code);bad.verify()
    }
    for(const mutate of [p=>{p.source_snapshot_sha256='0'.repeat(64)},
      p=>{p.rows[0].owner_user_id=identity.owners[1]},p=>{p.rows[0].legacy_run_id=f.ids.b}]){
      const bad=f.prepare(prepare);mutate(bad)
      await assert.rejects(archive(admin,bad),e=>e.message==='agent_run_events_unverified_or_mutated_plan')
    }
    await assert.rejects(archive(admin,f.prepare(prepare)),e=>e.message==='agent_run_events_parent_missing_or_foreign')
    assert.equal(await fingerprint(admin),before)
    checkpoint='real_sql_fault_after_parent_insert'
    const parentFault=faultPool(admin,'legacy_run_history')
    await assert.rejects(archiveParent(parentFault.pool,f.prepare(prepareParent)),e=>e.message==='history_sql_failed')
    checkFault(parentFault.seen)
    await zero(admin,['legacy_run_history','legacy_agent_run_events',...unused])
    assert.equal(await fingerprint(admin),before)
    parentReport(await archiveParent(admin,f.prepare(prepareParent)),1,0)
    const parentOnly=await fingerprint(admin)
    checkpoint='reviewed_identity_refusals'
    for(const column of ['source_snapshot_sha256','reviewed_mapping_sha256']){
      await admin.query('UPDATE agentstudio.legacy_user_imports SET '+column+'=$1',['0'.repeat(64)])
      await assert.rejects(archive(admin,f.prepare(prepare)),e=>e.message==='agent_run_events_target_identity_unverified')
      await admin.query('UPDATE agentstudio.legacy_user_imports SET '+column+'=$1',
        [column==='source_snapshot_sha256'?plan.source_snapshot_sha256:plan.identity_mapping_sha256])
    }
    await admin.query('DELETE FROM agentstudio.legacy_user_imports WHERE legacy_user_id=$1',[f.ids.a])
    await assert.rejects(archive(admin,f.prepare(prepare)),e=>e.message==='agent_run_events_target_identity_unverified')
    await admin.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,'+
      'target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$6)',
      [f.digest,f.ids.a,identity.owners[0],plan.identity_mapping_sha256,f.idpHash,contentHash(f.idp.records[0])])
    const restored=await fingerprint(admin)
    assert.notEqual(restored,parentOnly) // the re-created review has a new audit timestamp
    checkpoint='real_sql_fault_after_child_insert'
    const childFault=faultPool(admin,'legacy_agent_run_events')
    await assert.rejects(archive(childFault.pool,f.prepare(prepare)),e=>e.message==='agent_run_events_sql_failed')
    checkFault(childFault.seen);await zero(admin,['legacy_agent_run_events',...unused])
    assert.equal(await fingerprint(admin),restored)
    checkpoint='resume_and_readback'
    reportCheck(await archive(admin,f.prepare(prepare)),1,0)
    const first=await fingerprint(admin)
    const parent=(await admin.query('SELECT * FROM agentstudio.legacy_run_history')).rows[0]
    const row=(await admin.query('SELECT * FROM agentstudio.legacy_agent_run_events')).rows[0]
    for(const [stored,raw] of [[parent,f.run],[row,f.event]]){
      assert.deepEqual(stored.source_record,raw)
      for(const [key,value] of Object.entries(raw))if(typeof value==='string')
        assert.ok(Buffer.from(stored.source_record[key],'utf8').equals(Buffer.from(value,'utf8')))
      assert.equal(stored.payload_sha256,contentHash(raw))
      assert.equal(contentHash(stored.source_record),stored.payload_sha256)
      for(const key of ['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256'])assert.equal(stored[key],plan[key])
      assert.equal(stored.owner_user_id,identity.owners[0]);assert.equal(stored.executable,false)
      assert.equal(stored.evidence_status,'historical_unverified')
    }
    assert.equal(parent.source_record.status,'running');assert.equal(row.run_source_table,'agent_runs')
    assert.equal(row.legacy_run_id,f.ids.r);assert.equal(row.source_table,'run_events')
    assert.equal(row.model_execution_enabled,false)
    parentReport(await archiveParent(admin,f.prepare(prepareParent)),0,1)
    reportCheck(await archive(admin,f.prepare(prepare)),0,1)
    assert.equal(await fingerprint(admin),first)
    checkpoint='foreign_source_and_composite_fk'
    const other=fixture(DatabaseSync,temp,identity,contentHash)
    await assert.rejects(archive(admin,other.prepare(prepare)),e=>e.message==='agent_run_events_snapshot_or_review_conflict')
    await assert.rejects(archiveParent(admin,other.prepare(prepareParent)),e=>e.message==='history_snapshot_or_review_conflict')
    for(const column of ['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256','owner_user_id','legacy_run_id']){
      const clone={...row,legacy_id:'g'+f.ids.e.slice(1),[column]:
        column==='owner_user_id'?identity.owners[1]:column==='legacy_run_id'?f.ids.b:'0'.repeat(64)}
      clone.source_record={...f.event,id:clone.legacy_id,run_id:clone.legacy_run_id}
      await assert.rejects(admin.query('INSERT INTO agentstudio.legacy_agent_run_events(source_snapshot_sha256,'+
        'identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,source_record,payload_sha256) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
        [clone.source_snapshot_sha256,clone.identity_mapping_sha256,clone.manifest_sha256,'run_events',clone.legacy_id,
          clone.owner_user_id,clone.legacy_run_id,JSON.stringify(clone.source_record),contentHash(clone.source_record)]),e=>e.code==='23503')
    }
    await assert.rejects(admin.query('INSERT INTO agentstudio.legacy_agent_run_events(run_source_table) VALUES($1)',
      ['workflow_runs']),e=>e.code==='428C9')
    assert.equal((await admin.query("SELECT attgenerated FROM pg_attribute WHERE "+
      "attrelid='agentstudio.legacy_agent_run_events'::regclass AND attname='run_source_table'")).rows[0].attgenerated,'s')
    checkpoint='pg17_lexical_empty_content'
    // Probe each accepted representation against the real SQL CHECK in a rolled
    // back transaction; the frozen source and final archive still have one event.
    const lexicalClient=await admin.connect()
    try{
      for(const content of [null,' \t null\r\n',' \n{ \t}\r',' \t[ \n ] ']){
        await lexicalClient.query('BEGIN')
        try{
          const raw={...f.event,id:'h'+f.ids.e.slice(1),content}
          await lexicalClient.query('INSERT INTO agentstudio.legacy_agent_run_events(source_snapshot_sha256,'+
            'identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,source_record,payload_sha256) '+
            'VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',[plan.source_snapshot_sha256,plan.identity_mapping_sha256,
              plan.manifest_sha256,'run_events',raw.id,identity.owners[0],f.ids.r,JSON.stringify(raw),contentHash(raw)])
          const stored=(await lexicalClient.query('SELECT source_record,payload_sha256 FROM agentstudio.legacy_agent_run_events WHERE legacy_id=$1',[raw.id])).rows[0]
          assert.deepEqual(stored.source_record,raw);assert.equal(contentHash(stored.source_record),stored.payload_sha256)
        }finally{await lexicalClient.query('ROLLBACK')}
      }
    }finally{lexicalClient.release()}
    assert.equal(await fingerprint(admin),first)
    checkpoint='wrong_role_and_force_rls'
    const tables=['legacy_run_history','legacy_agent_run_events']
    for(const table of tables){
      assert.deepEqual((await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
        ['agentstudio.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true})
      assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='agentstudio' AND tablename=$1",
        [table])).rows[0].n,0)
    }
    checkpoint='wrong_role_and_force_rls_role_creation'
    const password='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w25_archive_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+password+"'")
    await admin.query('GRANT agentstudio_api,agentstudio_worker TO agentstudio_w25_archive_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w25_archive_login')
    api=new pg.Pool({...config,user:'agentstudio_w25_archive_login',password})
    checkpoint='wrong_role_and_force_rls_importer_denial'
    await assert.rejects(archive(api,f.prepare(prepare)),e=>e.message==='agent_run_events_wrong_stage_database_or_version')
    checkpoint='wrong_role_and_force_rls_role_switch'
    const client=await api.connect()
    try{
      assert.deepEqual((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],
        {rolsuper:false,rolbypassrls:false})
      for(const role of ['agentstudio_api','agentstudio_worker']){
        await client.query('RESET ROLE');await client.query('SET ROLE '+role)
        assert.deepEqual((await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0],
          {rolsuper:false,rolbypassrls:false})
        for(const actor of ['',randomUUID(),...identity.owners]){
          await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
          for(const table of tables)for(const sql of ['SELECT * FROM ','INSERT INTO ','UPDATE ','DELETE FROM ','TRUNCATE ']){
            const tail=sql==='INSERT INTO '?' DEFAULT VALUES':sql==='UPDATE '?' SET executable=true':''
            await assert.rejects(client.query(sql+'agentstudio.'+table+tail),e=>e.code==='42501')
          }
        }
      }
      checkpoint='wrong_role_and_force_rls_accidental_grants'
      // Test accidental CRUD grants, not just SELECT. FORCE RLS hides rows;
      // statement-level immutable triggers also deny UPDATE/DELETE/TRUNCATE.
      try{
        for(const table of tables)await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON agentstudio.'+table+
          ' TO agentstudio_api,agentstudio_worker')
        for(const role of ['agentstudio_api','agentstudio_worker']){
          await client.query('RESET ROLE');await client.query('SET ROLE '+role)
          for(const actor of ['',randomUUID(),...identity.owners]){
            await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
            await zero(client,tables)
            await assert.rejects(client.query('INSERT INTO agentstudio.legacy_agent_run_events(source_snapshot_sha256,'+
              'identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,source_record,payload_sha256) '+
              'VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',[plan.source_snapshot_sha256,plan.identity_mapping_sha256,
                plan.manifest_sha256,'run_events','g'+f.ids.e.slice(1),identity.owners[0],f.ids.r,
                JSON.stringify({...f.event,id:'g'+f.ids.e.slice(1)}),contentHash(f.event)]),e=>e.code==='42501')
            await assert.rejects(client.query('INSERT INTO agentstudio.legacy_run_history(source_snapshot_sha256,'+
              'identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,source_record,payload_sha256) '+
              'VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[plan.source_snapshot_sha256,plan.identity_mapping_sha256,
                plan.manifest_sha256,'agent_runs','i'+f.ids.r.slice(1),identity.owners[0],
                JSON.stringify({...f.run,id:'i'+f.ids.r.slice(1)}),contentHash(f.run)]),e=>e.code==='42501')
            for(const table of tables)for(const sql of ['UPDATE agentstudio.'+table+' SET executable=false',
              'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table])
              await assert.rejects(client.query(sql),e=>archiveMutationBlocked(e,table,sql))
          }
        }
      }finally{
        for(const table of tables)await admin.query('REVOKE ALL ON agentstudio.'+table+' FROM agentstudio_api,agentstudio_worker')
      }
    }finally{client.release()}
    checkpoint='immutable_and_no_runtime'
    for(const table of tables)for(const sql of ['UPDATE agentstudio.'+table+' SET executable=false',
      'DELETE FROM agentstudio.'+table,'TRUNCATE agentstudio.'+table])
      await assert.rejects(admin.query(sql),e=>archiveMutationBlocked(e,table,sql))
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
    assert.deepEqual((await admin.query('SELECT status FROM agentstudio.users ORDER BY external_subject')).rows,
      [{status:'disabled'},{status:'disabled'}])
    assert.equal(await fingerprint(admin),first);f.verify();other.verify()
    assert.throws(()=>checkFile(path.join(root,'pocketbase/pb_data/data.db')),/W25_FILE_REFUSED/)
    assert.throws(()=>checkFile(path.join(root,'forbidden-write'),true),/W25_FILE_REFUSED/)
  }catch{
    throw Error('w25_pg17_agent_events_failed_redacted checkpoint='+checkpoint)
  }finally{
    try{
      try{if(api)await api.end()}finally{
        try{if(admin)await admin.end()}finally{
          for(const dir of identity.dirs){
            if(path.dirname(dir)!==temp||!path.basename(dir).startsWith('w25-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-')||
              fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('w25_cleanup_refused')
            fs.rmSync(dir,{recursive:true,force:true})
          }
        }
      }
    }catch{throw Error('w25_pg17_agent_events_cleanup_failed_redacted')}
  }
  console.log('W25_PG17_AGENT_EVENTS_PASS real_tcp=true synthetic_only=true archive_only=true cutover=NO-GO')
})
