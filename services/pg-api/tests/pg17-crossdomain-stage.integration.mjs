// W13: standalone, destructive-environment REFUSAL by default; never a backup tool.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import dns from 'node:dns'
import dgram from 'node:dgram'
import http from 'node:http'
import https from 'node:https'
import http2 from 'node:http2'
import tls from 'node:tls'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const self=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(self),'../../..')
const entry=path.join(root,'services/pg-api/src/stage-migration-operator.mjs')
const sha=data=>createHash('sha256').update(data).digest('hex')
const stamp='2026-10-15T01:00:00.000Z'
const refusal='refuse_non_ephemeral_pg17_crossdomain_stage'
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_CROSSDOMAIN_TEST_ENABLED!=='true'||
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
    application_name:'synthetic_w13_stage_operator'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w13',
  AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_CROSSDOMAIN_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
  AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: all W13 environment gates are mandatory before imports or I/O',()=>{
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
  for(const temp of ['/','/tmp/../tmp/w13','relative'])deny({...valid,RUNNER_TEMP:temp})
})

test('fail-closed: rejected W13 entry cannot open sockets',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';net.Socket.prototype.connect=function(){throw Error('W13_FORBIDDEN_SOCKET')}")
  for(const change of [{AGENT_STUDIO_PG17_CROSSDOMAIN_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-synthetic'}]){
    const env={...process.env,...change}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
      '--test','--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000})
    assert.ok(!child.error&&child.status===1,'rejected entry must fail')
    const out=child.stdout+child.stderr
    assert.ok(out.includes(refusal),'entry must reject isolation before any PG access')
    assert.ok(!/W13_FORBIDDEN_SOCKET|ECONNREFUSED|ENOTFOUND/.test(out),'no socket attempted')
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
function fixture(DatabaseSync,temp,identity){
  const dir=fs.mkdtempSync(path.join(temp,'w13-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'))
  fs.chmodSync(dir,0o700)
  // Caller owns cleanup immediately, including partially generated fixtures.
  identity.dirs.push(dir)
  const files=Object.fromEntries(['snapshot','manifest','mapping','oidc','approval']
    .map(k=>[k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
  const marker='W13_PRIVATE_'+randomBytes(16).toString('hex')
  const raw={id:'agent0000000001',rh_user_id:'employee0000001',name:marker,
    spec:JSON.stringify({goal:'Synthetic report',task_scope:'Offline only',
      deliverables:['Report'],task_plan:['Review'],done_criteria:['Done'],
      tools:[],knowledge_base_ids:[],require_approval:true}),
    source:'',template_key:'',created:stamp,updated:stamp}
  const workflow={id:'workflow0000001',rh_user_id:raw.rh_user_id,name:marker+' workflow',
    description:'',source:'',spec_id:'',require_approval:1,
    graph:JSON.stringify({nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
      {id:'end',type:'end',data:{title:'End'},position:{x:10,y:20}}],
      edges:[{id:'e',source:'start',target:'end'}]}),created:stamp,updated:stamp}
  const kb={id:'kb0000000000001',rh_user_id:raw.rh_user_id,name:marker+' KB',
    description:'Synthetic empty private base',created_ms:Date.parse(stamp),updated_ms:Date.parse(stamp)+1000}
  // The schedule depends on Agent. Workflow dependencies are explicitly forbidden by W1/W3.
  const schedule={id:'schedule0000001',rh_user_id:raw.rh_user_id,name:marker+' schedule',
    target_kind:'agent',target_id:raw.id,instruction:'Synthetic offline instruction',
    recurrence_kind:'daily',interval_minutes:60,time_zone:'Asia/Shanghai',local_time:'09:30',
    weekday:2,start_at_ms:Date.parse(stamp),next_at_ms:Date.parse(stamp)+86400000,
    model_connection_id:'',model_id:'synthetic-model',max_steps:7,enabled:1,deleted:0,
    revision:3,created_ms:Date.parse(stamp),updated_ms:Date.parse(stamp)+1000,last_due_ms:0}
  const db=new DatabaseSync(files.snapshot)
  let tables
  try{
    db.exec('PRAGMA journal_mode=DELETE; CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT); '+
      'CREATE TABLE agent_specs(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT)')
    db.prepare('INSERT INTO studio_users VALUES(?,?)').run(raw.rh_user_id,marker+' password')
    db.prepare('INSERT INTO agent_specs VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(raw))
    for(const [table,row] of [['workflows',workflow],['agent_studio_kb_bases',kb],['agent_studio_schedules',schedule]]){
      const keys=Object.keys(row)
      db.exec('CREATE TABLE '+table+' ('+keys.map(k=>k+' '+(typeof row[k]==='number'?'INTEGER':'TEXT')).join(',')+')')
      db.prepare('INSERT INTO '+table+' VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(row))
    }
    tables=Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name")
      .all().map(({name})=>[name,Number(db.prepare('SELECT count(*) AS n FROM "'+name+'"').get().n)]))
  }finally{db.close()}
  const bytes=fs.readFileSync(files.snapshot),digest=sha(bytes)
  privateFile(files.manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',
    sha256:digest,bytes:bytes.length,tables}))
  privateFile(files.mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',
    source_sha256:digest,records:[{old_id:raw.rh_user_id,new_studio_user_id:identity.owner,
      verified_by:'Synthetic mapping reviewer',approved_at:stamp}]}))
  privateFile(files.oidc,JSON.stringify({schema_version:'studio-reviewed-oidc-provision-v1',
    source_sha256:digest,records:[{old_id:raw.rh_user_id,new_studio_user_id:identity.owner,
      external_issuer:identity.issuer,external_subject:identity.subject,
      reviewed_by:'Synthetic independent IdP reviewer',reviewed_at:stamp}]}))
  privateFile(files.approval,JSON.stringify({source_sha256:digest,
    approved_by:'Synthetic source auditor',approved_at:stamp}))
  for(const file of Object.values(files))fs.chmodSync(file,0o400)
  const seals=Object.values(files).map(file=>({file,hash:sha(fs.readFileSync(file)),
    size:fs.statSync(file).size,mtime:fs.statSync(file).mtimeMs}))
  const verify=()=>{
    for(const s of seals){
      assert.ok(fs.realpathSync(s.file)===s.file&&contained(s.file,temp),'source must be in runner temp')
      const st=fs.statSync(s.file)
      assert.ok(st.size===s.size&&st.mtimeMs===s.mtime&&sha(fs.readFileSync(s.file))===s.hash,
        'frozen input must remain byte-identical')
      assert.equal(st.mode&0o222,0)
    }
    for(const suffix of ['-wal','-shm','-journal'])assert.equal(fs.existsSync(files.snapshot+suffix),false)
  }
  verify()
  return {dir,files,raw,workflow,kb,schedule,marker,digest,verify}
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
// Installed only inside the freshly created runner directory, propagated to
// operator descendants. No inherited NODE_OPTIONS/PG*/DATABASE_URL/credentials.
function childEnvironment(f,guard){
  return {PATH:path.dirname(process.execPath),LANG:'C.UTF-8',GITHUB_ACTIONS:'false',
    NODE_OPTIONS:'--import='+pathToFileURL(guard).href,
    AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',
    AGENT_STUDIO_PG_DATABASE:'agentstudio_stage',AGENT_STUDIO_PG_IMPORT_USER:'agentstudio_admin',
    AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:path.join(f.dir,'pg-password')}
}
function guardSource(dirs=[]){
  const allowed=['stage-user-import-cli.ts','stage-agent-import-cli.ts','stage-domain-import-cli.ts',
    'stage-knowledge-base-import-cli.ts','stage-kb-atomic-import-cli.ts','stage-reconciliation-cli.ts']
    .map(name=>path.join(root,'services/pg-api/src',name))
  return `import net from 'node:net';
import fs from 'node:fs';import path from 'node:path';
const dirs=new Set(${JSON.stringify(dirs)});
if(dirs.size){
 const source=process.argv[process.argv.indexOf('--snapshot')+1];
 const dir=path.dirname(source||'');
 if(!dirs.has(dir))throw Error('W13_SOURCE_REFUSED');
 for(const [flag,name] of Object.entries({'--snapshot':'snapshot.sqlite','--manifest':'manifest.json',
   '--mapping':'mapping.json','--oidc':'oidc.json','--reviewed-idp':'oidc.json','--approval':'approval.json'})){
  const index=process.argv.indexOf(flag);if(index<0)continue;
  const file=process.argv[index+1];
  if(file!==path.join(dir,name)||fs.realpathSync(file)!==file||
    !fs.statSync(file).isFile()||(fs.statSync(file).mode&0o222)!==0)throw Error('W13_SOURCE_REFUSED');
 }
 if(process.env.GITHUB_ACTIONS!=='false'||process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE!==path.join(dir,'pg-password'))
  throw Error('W13_SOURCE_REFUSED');
}

import cp from 'node:child_process';
import dns from 'node:dns';import dgram from 'node:dgram';
import http from 'node:http';import https from 'node:https';
import http2 from 'node:http2';import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const x=args[0];const port=typeof x==='object'?x.port:x;
 const host=typeof x==='object'?x.host:args[1];
 if(Number(port)!==5432||host!=='127.0.0.1')throw Error('W13_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W13_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W13_EXTERNAL_FETCH_REFUSED')};
const spawn=cp.spawnSync,allowed=new Set(${JSON.stringify(allowed)});
cp.spawnSync=function(exe,args,options){
 if(exe!==process.execPath||!Array.isArray(args)||args[0]!=='--experimental-strip-types'||!allowed.has(args[1])||
    options?.env?.GITHUB_ACTIONS!=='false'||options.env.NODE_OPTIONS!==process.env.NODE_OPTIONS||
    options.env.AGENT_STUDIO_PG_HOST!=='127.0.0.1'||options.env.AGENT_STUDIO_PG_DATABASE!=='agentstudio_stage'||
    options.env.AGENT_STUDIO_PG_IMPORT_USER!=='agentstudio_admin'||
    options.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE!==process.env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE||options.cwd!==${JSON.stringify(root)})
   throw Error('W13_NON_OPERATOR_CHILD_REFUSED');
 return spawn(exe,args,options);
};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','fork'])
 cp[k]=()=>{throw Error('W13_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}
// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W13 descendant guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W13_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W13_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W13_GUARD_PASS')
})

function invoke(f,guard,password,identity){
  f.verify()
  assert.ok(path.dirname(f.dir)===checkedTemp()&&path.basename(f.dir).startsWith(
    'w13-pg17-synthetic-'+process.env.GITHUB_RUN_ID+'-'),'only owned synthetic runner fixtures')
  const env=childEnvironment(f,guard)
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.equal(env.GITHUB_ACTIONS,'false')
  const child=spawnSync(process.execPath,['--experimental-strip-types',entry,'--execute',
    '--confirm-isolated-stage','agentstudio_stage','--allow-partial-trial',
    ...Object.entries(f.files).flatMap(([key,file])=>['--'+key,file])],
  {cwd:f.dir,env,encoding:'utf8',timeout:180000,maxBuffer:1024*1024,windowsHide:true})
  f.verify()
  assert.equal(process.env.GITHUB_ACTIONS,'true','parent CI fence stays intact')
  assert.ok(!child.error&&child.signal===null,'operator must finish without timeout')
  const out=child.stdout+child.stderr
  for(const secret of [password,f.marker,identity.subject,identity.owner,
    f.raw.id,f.raw.rh_user_id,...Object.values(f.files),env.AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE])
    assert.ok(!out.includes(secret),'operator must redact private values')
  assert.ok(!/W13_NETWORK_REFUSED|W13_NON_OPERATOR_CHILD_REFUSED|W13_EXTERNAL_FETCH_REFUSED|W13_SOURCE_REFUSED/.test(out),
    'operator must use only allowed isolated operations')
  let report
  try{report=JSON.parse(child.stdout)}catch{throw Error('operator_report_not_json')}
  assert.equal(report.production_cutover_allowed,false)
  assert.equal(report.source_snapshot_verified,true)
  assert.equal(report.full_manifest_verified,true)
  assert.equal(report.source_tables,5)
  assert.ok(report.source_sha256===f.digest,'operator SHA must match frozen bytes')
  return {status:child.status,report}
}
function incomplete(out,replayed){
  assert.equal(out.status,2)
  assert.equal(out.report.result,'stage_imported_reconciliation_incomplete')
  assert.deepEqual(out.report.blockers,['unreconciled_business_domains','production_cutover_forbidden'])
  const phases=out.report.phase_results
  assert.deepEqual(phases.map(p=>p.phase),['identity','agent','workflow','knowledge_empty','schedules','reconciliation'])
  assert.deepEqual(phases.map(p=>p.exit_code),[0,0,0,0,0,2])
  for(const phase of phases.slice(0,5)){
    assert.equal(phase.status,'passed')
    assert.equal(phase.summary.imported,replayed?0:1)
    assert.equal(phase.summary.replayed,replayed?1:0)
    assert.equal(phase.summary.reconciled,1)
  }
  assert.equal(phases[5].summary.result,'not_ready_for_cutover')
}

test('PG17 TCP: W13 synthetic stage operator, idempotence, SHA and RLS, NO-GO',async(t)=>{
  // Fail BEFORE pg/SQLite imports, filesystem writes, or any connection.
  const config=requireEphemeral(process.env)
  const temp=checkedTemp()
  const identity={owner:randomUUID(),subject:'w13-'+randomUUID(),
    issuer:'https://w13.synthetic.invalid',dirs:[]}
  let admin,api,checkpoint='isolation'
  const fixtures=[]
  try{
    const connect=net.Socket.prototype.connect
    t.mock.method(net.Socket.prototype,'connect',function(...args){
      const x=args[0],port=typeof x==='object'?x.port:x,host=typeof x==='object'?x.host:args[1]
      assert.ok(Number(port)===5432&&host==='127.0.0.1','only isolated TCP allowed')
      return connect.apply(this,args)
    })
    const deny=()=>{throw Error('W13_NETWORK_REFUSED')}
    for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
      t.mock.method(dns,key,deny);t.mock.method(dns.promises,key,deny)
    }
    t.mock.method(dgram,'createSocket',deny);t.mock.method(tls,'connect',deny)
    t.mock.method(http2,'connect',deny)
    for(const mod of [http,https])for(const key of ['request','get'])t.mock.method(mod,key,deny)
    t.mock.method(globalThis,'fetch',()=>{throw Error('external_fetch_forbidden')})
    const [{default:pg},{DatabaseSync},{normalizeLegacyAgent},{reconcileStage}]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-agent-import.ts'),import('../src/stage-reconciliation.ts')])
    admin=new pg.Pool(config)
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,"+
      "inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super")).rows[0]
    assert.ok(g.db==='agentstudio_stage'&&g.login==='agentstudio_admin'&&g.role===g.login&&g.super===true)
    assert.ok(g.version>=170000&&g.version<180000&&g.address!==null&&g.port===5432)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS schema")).rows[0].schema,null,
      'refuse any reused agentstudio schema before DDL')
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'")).rows[0].n,0,
      'refuse pre-existing user relations anywhere in the target database')
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_namespace WHERE "+
      "nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','public')")).rows[0].n,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_w13_api_login')")).rows[0].n,0)
    checkpoint='schema_initialization'
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    const migrations=['006_legacy_workflow_import','007_legacy_kb_import','008_legacy_schedule_import',
      '009_legacy_collaboration_import','010_legacy_kb_content','011_legacy_user_provision','012_legacy_run_history']
    for(const m of migrations)await admin.query(sqlFile('db/postgres/migrations/pg_v8_'+m+'.sql'))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    const versions=(await admin.query('SELECT version FROM agentstudio.schema_migrations')).rows.map(r=>r.version)
    for(const v of ['005',...migrations.map(m=>m.slice(0,3))])assert.ok(versions.includes('pg_v8_'+v))
    const migrationHash=async()=>sha(JSON.stringify((await admin.query(
      'SELECT row_to_json(t)::text AS row FROM agentstudio.schema_migrations t ORDER BY version')).rows))
    const migrationSeal=await migrationHash()
    // Both snapshots are generated from scratch; neither is a backup of any PB.
    checkpoint='synthetic_fixture'
    const f=fixture(DatabaseSync,temp,identity),different=fixture(DatabaseSync,temp,identity)
    fixtures.push(f,different)
    assert.ok(f.digest!==different.digest,'independent frozen snapshots must differ')
    const guard=path.join(f.dir,'synthetic-guard.mjs')
    privateFile(guard,guardSource(fixtures.map(x=>x.dir)))
    for(const x of fixtures)privateFile(path.join(x.dir,'pg-password'),config.password)
    for(const dir of identity.dirs)for(const name of fs.readdirSync(dir)){
      const file=path.join(dir,name)
      assert.ok(contained(file,temp)&&fs.realpathSync(file)===file&&!fs.lstatSync(file).isSymbolicLink())
      assert.equal(fs.statSync(file).mode&0o077,0,'all generated files must be private')
    }
    checkpoint='sequential_import'
    incomplete(invoke(f,guard,config.password,identity),false)
    checkpoint='field_fidelity_and_execution_blocks'
    const first=await fingerprint(admin)
    const counts=async()=>{
      assert.equal(await migrationHash(),migrationSeal,'migration table must remain identical')
      for(const table of ['users','legacy_user_imports','agent_specs','legacy_agent_imports','workflows','legacy_workflow_imports','knowledge_bases',
        'legacy_knowledge_base_imports','schedules','legacy_schedule_imports'])
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,1)
      for(const table of ['jobs','runs','schedule_occurrences','run_steps','external_effects','knowledge_documents','knowledge_chunks'])
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,0)
    }
    await counts()
    for(const table of ['users','agent_specs','workflows','knowledge_bases','schedules',
      'legacy_user_imports','legacy_agent_imports','legacy_workflow_imports',
      'legacy_knowledge_base_imports','legacy_schedule_imports']){
      const flags=(await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class '+
        'WHERE oid=to_regclass($1)',['agentstudio.'+table])).rows[0]
      assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true})
    }
    const u=(await admin.query('SELECT * FROM agentstudio.users')).rows[0]
    assert.ok(u.id===identity.owner&&u.status==='disabled'&&u.external_issuer===identity.issuer&&
      u.external_subject===identity.subject&&u.display_name==='','disabled identity must match independent review')
    const cross=(await admin.query('SELECT * FROM agentstudio.legacy_user_imports')).rows[0]
    assert.ok(cross.source_snapshot_sha256===f.digest&&cross.target_user_id===identity.owner&&
      cross.legacy_user_id===f.raw.rh_user_id&&cross.active_automatically===false&&
      cross.reviewed_mapping_sha256===sha(fs.readFileSync(f.files.mapping))&&
      cross.reviewed_idp_sha256===sha(fs.readFileSync(f.files.oidc)),'identity evidence must reconcile')
    const expected=normalizeLegacyAgent(f.raw,new Map([[f.raw.rh_user_id,identity.owner]]))
    const spec=(await admin.query('SELECT * FROM agentstudio.agent_specs')).rows[0]
    const legacy=(await admin.query('SELECT * FROM agentstudio.legacy_agent_imports')).rows[0]
    assert.deepEqual(spec.spec,expected.spec)
    assert.equal(spec.visibility,'private');assert.equal(spec.team_id,null)
    assert.ok(spec.owner_user_id===identity.owner&&spec.name===expected.name&&
      sha(JSON.stringify(Object.entries(spec.spec).sort()))===sha(JSON.stringify(Object.entries(expected.spec).sort()))&&
      spec.requires_approval===true&&spec.created_at.toISOString()===expected.created_at&&
      spec.updated_at.toISOString()===expected.updated_at,'Agent payload must reconcile')
    assert.ok(legacy.source_snapshot_sha256===f.digest&&legacy.payload_sha256===expected.payload_sha256&&
      legacy.legacy_spec_id===f.raw.id&&legacy.target_spec_id===spec.id&&legacy.owner_user_id===identity.owner)
    const owners=new Map([[f.raw.rh_user_id,identity.owner]])
    const [{normalizeLegacyWorkflow},{normalizeLegacyKb},{normalizeLegacySchedule},{contentHash}]=await Promise.all([
      import('../src/stage-workflow-import.ts'),import('../src/stage-knowledge-base-import.ts'),
      import('../src/stage-schedule-import.ts'),import('../src/stage-agent-import.ts')])
    const wf=(await admin.query('SELECT * FROM agentstudio.workflows')).rows[0]
    const wm=(await admin.query('SELECT * FROM agentstudio.legacy_workflow_imports')).rows[0]
    const base=(await admin.query('SELECT * FROM agentstudio.knowledge_bases')).rows[0]
    const bm=(await admin.query('SELECT * FROM agentstudio.legacy_knowledge_base_imports')).rows[0]
    const schedule=(await admin.query('SELECT * FROM agentstudio.schedules')).rows[0]
    const sm=(await admin.query('SELECT * FROM agentstudio.legacy_schedule_imports')).rows[0]
    const ew=normalizeLegacyWorkflow(f.workflow,owners),eb=normalizeLegacyKb(f.kb,owners),es=normalizeLegacySchedule(f.schedule,owners)
    for(const [record,expected] of [[wf,ew],[base,eb]]){
      for(const k of ['owner_user_id','name'])assert.equal(record[k],expected[k])
      assert.equal(record.created_at.toISOString(),expected.created_at)
      assert.equal(record.updated_at.toISOString(),expected.updated_at)
      assert.equal(record.visibility,'private');assert.equal(record.team_id,null)
    }
    assert.equal(contentHash(wf.graph),contentHash(ew.graph));assert.equal(Number(wf.revision),1)
    assert.equal(base.description,f.kb.description);assert.equal(Number(base.revision),1)
    assert.deepEqual(wm.source_record,f.workflow);assert.equal(wm.execution_enabled,false)
    assert.equal(bm.legacy_base_id,f.kb.id);assert.equal(bm.target_base_id,base.id)
    assert.equal(wm.legacy_workflow_id,f.workflow.id);assert.equal(wm.target_workflow_id,wf.id)
    for(const [cross,expected] of [[wm,ew],[bm,eb],[sm,es]]){
      assert.equal(cross.owner_user_id,identity.owner);assert.equal(cross.source_snapshot_sha256,f.digest)
      assert.equal(cross.payload_sha256,expected.payload_sha256)
    }
    // Every legacy execution field survives in the admin-only archive, not the live projection.
    assert.deepEqual(sm.source_record,f.schedule)
    assert.equal(sm.identity_mapping_sha256,sha(fs.readFileSync(f.files.mapping)))
    assert.equal(sm.legacy_schedule_id,f.schedule.id);assert.equal(sm.target_schedule_id,schedule.id)
    assert.equal(sm.execution_enabled,false);assert.equal(sm.quarantine_only,true)
    const projection={owner_user_id:identity.owner,kind:'agent',agent_spec_id:spec.id,workflow_id:null,
      name:f.schedule.name,recurrence:{legacy_import:'quarantined',execution_supported:false},
      time_zone:f.schedule.time_zone,next_at:null,enabled:false,revision:f.schedule.revision,
      created_at:new Date(f.schedule.created_ms).toISOString(),updated_at:new Date(f.schedule.updated_ms).toISOString()}
    for(const [k,v] of Object.entries(projection)){
      const actual=['created_at','updated_at'].includes(k)?schedule[k].toISOString():k==='revision'?Number(schedule[k]):schedule[k]
      assert.deepEqual(actual,v)
    }
    assert.equal(sm.projection_sha256,contentHash(projection))
    // Real PG trigger probes: each rejected statement must roll back without creating work.
    await assert.rejects(admin.query(`INSERT INTO agentstudio.runs(owner_user_id,kind,workflow_id) VALUES($1,'workflow',$2)`,
      [identity.owner,wf.id]),e=>e.code==='23514'&&e.message==='legacy_workflow_execution_disabled')
    await assert.rejects(admin.query('INSERT INTO agentstudio.schedules(owner_user_id,kind,workflow_id,name,recurrence,time_zone,enabled) '+
      `VALUES($1,'workflow',$2,'Synthetic denied','{}','UTC',false)`,[identity.owner,wf.id]),
      e=>e.code==='23514'&&e.message==='legacy_workflow_execution_disabled')
    await assert.rejects(admin.query('UPDATE agentstudio.schedules SET enabled=true WHERE id=$1',[schedule.id]),
      e=>e.code==='23514'&&e.message==='legacy_schedule_immutable')
    await assert.rejects(admin.query('INSERT INTO agentstudio.schedule_occurrences(owner_user_id,schedule_id,scheduled_for,status) '+
      `VALUES($1,$2,now(),'pending')`,[identity.owner,schedule.id]),
      e=>e.code==='23514'&&e.message==='legacy_schedule_execution_disabled')
    await assert.rejects(admin.query('INSERT INTO agentstudio.schedules(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone) '+
      `VALUES($1,'agent',$2,'Synthetic missing dependency','{}','UTC')`,[identity.owner,randomUUID()]),
      e=>e.code==='23503')
    await counts();assert.equal(await fingerprint(admin),first)
    // Independent W9 read-only evidence disambiguates the operator's redacted summary.
    const adapter={async connect(){const db=await admin.connect();return {
      async query(sql,values=[]){assert.match(sql,/^(SELECT\b|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/);
        return {rows:(await db.query(sql,values)).rows}},release(){db.release()}}}}
    checkpoint='readonly_w9'
    const report=await reconcileStage({...f.files,approval:JSON.parse(fs.readFileSync(f.files.approval,'utf8')),
      reviewed_idp:f.files.oidc},adapter)
    for(const domain of ['studio_users','agent_specs','workflows','agent_studio_kb_bases']){
      const r=report.find(r=>r.domain===domain)
      assert.ok(r?.status==='success'&&r.source_count===1&&r.target_count===1&&r.association_anomalies===0)
    }
    const sr=report.find(r=>r.domain==='agent_studio_schedules')
    assert.ok(sr?.status==='unsupported'&&sr.source_count===1&&sr.target_count===1&&sr.association_anomalies===0)
    assert.deepEqual(sr.blockers,['field_reconciliation_unsupported'])
    assert.ok(report.every(r=>r.association_anomalies===0))
    assert.ok(await fingerprint(admin)===first,'read-only W9 must not mutate target')
    checkpoint='same_snapshot_replay'
    incomplete(invoke(f,guard,config.password,identity),true)
    await counts();assert.ok(await fingerprint(admin)===first,'same-source replay must change no record')
    checkpoint='different_snapshot_refusal'
    const conflict=invoke(different,guard,config.password,identity)
    assert.equal(conflict.status,2)
    assert.equal(conflict.report.result,'partial_stage_must_not_switch')
    assert.equal(conflict.report.phase_results.length,1)
    assert.equal(conflict.report.phase_results[0].phase,'identity')
    assert.equal(conflict.report.phase_results[0].exit_code,1)
    await counts();assert.ok(await fingerprint(admin)===first,'different snapshot must not change target')
    // Real non-superuser TCP login: owner, other actor, anonymous and write denial.
    checkpoint='private_rls'
    const apiPassword='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w13_api_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+apiPassword+"'")
    await admin.query('GRANT agentstudio_api TO agentstudio_w13_api_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w13_api_login')
    api=new pg.Pool({...config,user:'agentstudio_w13_api_login',password:apiPassword})
    const client=await api.connect()
    try{
      const role=(await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]
      assert.deepEqual(role,{rolsuper:false,rolbypassrls:false})
      await client.query('SET ROLE agentstudio_api')
      for(const [actor,n] of [['',0],[randomUUID(),0],[identity.owner,1]]){
        await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[actor])
        for(const table of ['users','agent_specs','workflows','knowledge_bases','schedules'])
          assert.equal((await client.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,n)
      }
      assert.equal((await client.query('SELECT agentstudio.identity_user_id($1,$2) AS id',
        [identity.issuer,identity.subject])).rows[0].id,null,'disabled user cannot resolve to login')
      for(const table of ['legacy_user_imports','legacy_agent_imports','legacy_workflow_imports','legacy_knowledge_base_imports','legacy_schedule_imports'])
        await assert.rejects(client.query('SELECT * FROM agentstudio.'+table),e=>e.code==='42501')
      await client.query("SELECT set_config('agentstudio.actor_id',$1,false)",[randomUUID()])
      assert.equal((await client.query('UPDATE agentstudio.agent_specs SET name=name RETURNING id')).rowCount,0)
      await assert.rejects(client.query('INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) VALUES($1,$2,$3)',
        [identity.owner,'Synthetic denied',JSON.stringify(expected.spec)]),e=>e.code==='42501')
    }finally{client.release()}
    assert.ok(await fingerprint(admin)===first,'RLS probes must not change business data')
    for(const x of fixtures)x.verify()
    console.log('W13_PG17_STAGE_OPERATOR_PASS real_tcp=true synthetic_only=true operator_exit=2 cutover=NO-GO')
  }catch{
    // Never let pg errors, assertion diffs, child stderr or private rows reach TAP.
    throw Error('w13_pg17_crossdomain_trial_failed_redacted:'+checkpoint)
  }finally{
    try{if(api)await api.end()}finally{
      try{if(admin)await admin.end()}finally{
        for(const dir of identity.dirs){
          assert.ok(path.dirname(dir)===temp&&path.basename(dir).startsWith('w13-pg17-synthetic-')&&
            fs.realpathSync(dir)===dir&&!fs.lstatSync(dir).isSymbolicLink(),'cleanup only owned runner fixture')
          fs.rmSync(dir,{recursive:true,force:true})
        }
      }
    }
    // Never DROP/restore a schema/database. GitHub destroys its own service.
  }
})
