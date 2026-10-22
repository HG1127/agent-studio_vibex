// W31: opt-in GitHub-hosted disposable PG17 only. No production input interface.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import vm from 'node:vm'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const self=fileURLToPath(import.meta.url)
const root=path.resolve(path.dirname(self),'../../..')
const entry=path.join(root,'services/pg-api/src/stage-migration-operator.mjs')
const refusal='refuse_non_ephemeral_pg17_full_operator_fence'
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
    AGENT_STUDIO_PG17_TEST_ENABLED:'true',AGENT_STUDIO_PG17_W31_FULL_OPERATOR_FENCE_TEST_ENABLED:'true',
    AGENT_STUDIO_PG17_W31_SYNTHETIC_REVIEW_CHANNEL_CONFIRMED:'true',
    AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',AGENT_STUDIO_PG17_HOST:'127.0.0.1',
    AGENT_STUDIO_PG17_PORT:'5432',AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
    AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin'}
  if(platform!=='linux'||Object.entries(required).some(([k,v])=>e[k]!==v)||
    !/^[0-9]{1,32}$/.test(run)||run.trim()!==run||!password.startsWith(prefix)||suffix.length!==64||!/^[a-f0-9]{64}$/.test(suffix)||
    new Set(suffix).size<12||!e.RUNNER_TEMP||!path.posix.isAbsolute(e.RUNNER_TEMP)||
    path.posix.normalize(e.RUNNER_TEMP)!==e.RUNNER_TEMP||e.RUNNER_TEMP.endsWith('/')||/[\\\0]/.test(e.RUNNER_TEMP)||
    Object.keys(e).some(k=>/^PG/i.test(k)||
      (/^(?:DATABASE_URL|NODE_OPTIONS|NODE_PATH|AGENT_STUDIO_PG_(?:PASSWORD|IMPORT_PASSWORD|IMPORT_PASSWORD_FILE|HOST|DATABASE|IMPORT_USER))$/.test(k)&&e[k])))
    throw Error(refusal)
  return {host:'127.0.0.1',port:5432,database:'agentstudio_stage',user:'agentstudio_admin',password,
    ssl:false,options:'',max:1,connectionTimeoutMillis:5000,statement_timeout:35000,
    idleTimeoutMillis:1000,application_name:'synthetic_w31_execution_fence'}
}
const validEnv=()=>({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
  GITHUB_RUN_ID:'123456',RUNNER_TEMP:'/tmp/w31',AGENT_STUDIO_PG17_TEST_ENABLED:'true',
  AGENT_STUDIO_PG17_W31_FULL_OPERATOR_FENCE_TEST_ENABLED:'true',AGENT_STUDIO_PG17_W31_SYNTHETIC_REVIEW_CHANNEL_CONFIRMED:'true',AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
  AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
  AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
  AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')})

test('fail-closed: every W31 gate is mandatory before filesystem or TCP',()=>{
  const e=validEnv(),deny=x=>assert.throws(()=>requireEphemeral(x,'linux'),{message:refusal})
  assert.equal(requireEphemeral(e,'linux').port,5432)
  for(const k of Object.keys(e)){
    const absent={...e};delete absent[k];deny(absent);deny({...e,[k]:'invalid'})
  }
  for(const platform of ['win32','darwin'])assert.throws(()=>requireEphemeral(e,platform),{message:refusal})
  for(const h of ['localhost','postgres','::1','production.invalid'])deny({...e,AGENT_STUDIO_PG17_HOST:h})
  for(const d of ['/','relative','/tmp/../tmp/w31','/tmp/w31/'])deny({...e,RUNNER_TEMP:d})
  for(const r of ['1\n','1x','1'.repeat(33)])deny({...e,GITHUB_RUN_ID:r})
  for(const run of ['1\n','1\r','12x'])deny({...e,GITHUB_RUN_ID:run,
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-'+run+'-'+randomBytes(32).toString('hex')})
  deny({...e,AGENT_STUDIO_PG17_ADMIN_PASSWORD:e.AGENT_STUDIO_PG17_ADMIN_PASSWORD+'\n'})
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
    for(const k of ['mkdirSync','mkdtempSync','writeFileSync','appendFileSync','rmSync'])
      fs[k]=()=>{throw Error('W31_FORBIDDEN_FS')};
    net.Socket.prototype.connect=()=>{throw Error('W31_FORBIDDEN_TCP')};syncBuiltinESMExports();});`)
  for(const change of [{AGENT_STUDIO_PG17_W31_FULL_OPERATOR_FENCE_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.invalid'},{AGENT_STUDIO_PG17_ADMIN_PASSWORD:'real-forbidden'},
    {RUNNER_ENVIRONMENT:'self-hosted'},{RUNNER_TEMP:'relative'}]){
    const env={...validEnv(),...change}
    const child=spawnSync(process.execPath,['--import',preload,'--test',
      '--test-name-pattern=^PG17 TCP:',self],{env,encoding:'utf8',timeout:15000,windowsHide:true})
    assert.ok(!child.error&&child.status===1)
    const output=child.stdout+child.stderr
    assert.ok(output.includes(refusal),'isolation refusal must precede I/O')
    assert.ok(!/W31_FORBIDDEN_FS|W31_FORBIDDEN_TCP|ECONNREFUSED|ENOTFOUND/.test(output))
    assert.ok(!output.includes('W31_PG17_FENCE_ARCHIVE_PASS'))
  }
})

test('fail-closed: unchanged fence CLI refuses GitHub Actions without opening inputs',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(`
    import fs from 'node:fs';import net from 'node:net';import {syncBuiltinESMExports} from 'node:module';
    for(const k of ['realpathSync','statSync','lstatSync','readFileSync','openSync']){
      const original=fs[k];fs[k]=function(...args){
        if(String(args[0]).includes('__w31_never_read__'))throw Error('W31_CLI_INPUT_OPENED');
        return original.apply(this,args);
      };
    }
    net.Socket.prototype.connect=()=>{throw Error('W31_CLI_TCP_OPENED')};syncBuiltinESMExports();`)
  const child=spawnSync(process.execPath,['--import',preload,'--experimental-strip-types',
    path.join(root,'services/pg-api/src/stage-execution-fence-import-cli.ts'),'--plan',
    ...['snapshot','manifest','mapping','review'].flatMap(k=>['--'+k,'__w31_never_read__/'+k]),
    '--review-sha256','0'.repeat(64)],{env:{GITHUB_ACTIONS:'true'},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===1)
  assert.equal(child.stdout,'')
  assert.equal(child.stderr.trim().split(/\r?\n/).filter(l=>!l.includes('ExperimentalWarning')&&!l.includes('--trace-warnings')).join('\n'),
    'github_actions_forbidden')
  assert.ok(!/W31_CLI_INPUT_OPENED|W31_CLI_TCP_OPENED/.test(child.stderr))
})

const within=(p,dir)=>{const r=path.relative(dir,p);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)}
function checkedTemp(){
  // This is the FIRST test-body FS access, after the entire pure gate succeeds.
  const temp=process.env.RUNNER_TEMP
  let component=path.parse(temp).root
  for(const part of temp.slice(component.length).split(path.sep)){
    component=path.join(component,part)
    if(fs.lstatSync(component).isSymbolicLink())throw Error('w31_unsafe_runner_temp')
  }
  if(fs.realpathSync(temp)!==temp||!fs.statSync(temp).isDirectory()||temp===root||
    within(temp,root)||within(root,temp))throw Error('w31_unsafe_runner_temp')
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
  const dir=fs.mkdtempSync(path.join(temp,'w31-pg17-synthetic-'))
  dirs.push(dir);fs.chmodSync(dir,0o700)
  const files=Object.fromEntries(['snapshot','manifest','mapping','review','oidc','approval'].map(k=>[k,path.join(dir,k+(k==='snapshot'?'.sqlite':'.json'))]))
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
    db.exec('CREATE TABLE studio_users(id TEXT,password TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT); CREATE TABLE workflows(id TEXT,rh_user_id TEXT,name TEXT,description TEXT,graph TEXT,source TEXT,spec_id TEXT,require_approval INTEGER,created TEXT,updated TEXT)')
    for(const [table,parents] of [['agent_runs',[agent]],['workflow_runs',[flow]]]){
      db.exec('CREATE TABLE '+table+'('+Object.entries(parents[0]).map(([k,v])=>k+' '+(typeof v==='number'?'INTEGER':'TEXT')).join(',')+')')
    }
    db.exec('CREATE TABLE workflow_events(id TEXT,run_id TEXT,node_id TEXT,seq INTEGER,event_type TEXT,content TEXT,created TEXT,updated TEXT)')
    for(const id of old)db.prepare('INSERT INTO studio_users VALUES(?,?)').run(id,'SYNTHETIC-NEVER-ARCHIVE-USER-FIELD')
    const definition={goal:'Synthetic report',task_scope:'Offline only',deliverables:['Report'],task_plan:['Review'],done_criteria:['Done'],tools:[],knowledge_base_ids:[],require_approval:true}
    db.prepare('INSERT INTO agent_specs VALUES(?,?,?,?,?,?,?,?)').run(spec,old[0],'Synthetic agent',JSON.stringify(definition),'','',at,at)
    const graph={nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
      {id:'end',type:'end',data:{title:'End'},position:{x:10,y:20}}],edges:[{id:'e',source:'start',target:'end'}]}
    db.prepare('INSERT INTO workflows VALUES(?,?,?,?,?,?,?,?,?,?)').run(workflow,old[1],'Synthetic workflow','',JSON.stringify(graph),'','',1,at,at)
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
  write(files.oidc,{schema_version:'studio-reviewed-oidc-provision-v1',source_sha256:digest,
    records:old.map((old_id,i)=>({old_id,new_studio_user_id:owners[i],external_issuer:'https://w31.synthetic.invalid',
      external_subject:'synthetic-subject-'+i,reviewed_by:'Synthetic IdP reviewer',reviewed_at:at}))})
  write(files.approval,{source_sha256:digest,approved_by:'Synthetic source auditor',approved_at:at})
  const parentReview={source_sha256:digest,identity_mapping_sha256:fileHash(files.mapping),credentials_absent:true,...identityReview}
  write(files.manifest,{format:'agent-studio-sqlite-snapshot-v1',sha256:digest,bytes:fs.statSync(files.snapshot).size,tables,
    history_archive_review:{...parentReview,table:'agent_runs',row_sha256:rows.agent_runs.map(rawHash)},
    workflow_history_archive_review:{...parentReview,tables:{workflow_runs:{row_sha256:rows.workflow_runs.map(rawHash)},workflow_events:{row_sha256:[]}}}})
  const attest={reviewed_by:'Independent synthetic content reviewer',reviewed_at:at,credentials_absent:true,inert_opaque_text:true}
  // ONLY self-created synthetic bytes are self-attested here. No external file args.
  write(files.review,{format:'studio-execution-fence-source-review-v1',source_sha256:digest,
    identity_mapping_sha256:fileHash(files.mapping),manifest_sha256:fileHash(files.manifest),...attest,
    tables:Object.fromEntries(reviewedTables.map(t=>[t,{...attest,rows:rows[t].map(r=>({...attest,row_sha256:rawHash(r)}))}]))})
  assert.equal(new Set(Object.values(files).map(p=>{const s=fs.statSync(p);return s.dev+':'+s.ino})).size,6)
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

function guardSource(guard=''){
  const allowed=['stage-migration-operator.mjs','stage-user-import-cli.ts','stage-agent-import-cli.ts',
    'stage-reconciliation-cli.ts',
    'stage-domain-import-cli.ts','stage-execution-fence-import-cli.ts'].map(n=>path.join(root,'services/pg-api/src',n))
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
 if(process.argv.includes('--plan')||process.argv[1]===${JSON.stringify(entry)}||
    Number(port)!==5432||host!=='127.0.0.1')throw Error('W31_NETWORK_REFUSED');
 return connect.apply(this,args);
};
const deny=()=>{throw Error('W31_NETWORK_REFUSED')};
for(const key of ['lookup','resolve','resolve4','resolve6','resolveAny','reverse']){
 dns[key]=deny;dns.promises[key]=deny;
}
dgram.createSocket=deny;tls.connect=deny;http2.connect=deny;
for(const mod of [http,https]){mod.request=deny;mod.get=deny;}
globalThis.fetch=()=>{throw Error('W31_EXTERNAL_FETCH_REFUSED')};
const spawn=cp.spawnSync,allowed=new Set(${JSON.stringify(allowed)});
const envKeys=new Set(['PATH','LANG','GITHUB_ACTIONS','NODE_OPTIONS',
 'AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED','AGENT_STUDIO_PG_HOST','AGENT_STUDIO_PG_DATABASE',
 'AGENT_STUDIO_PG_IMPORT_USER','AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE',
 'AGENT_STUDIO_PG_STAGE_USER_IMPORT_ENABLED','AGENT_STUDIO_PG_STAGE_AGENT_IMPORT_ENABLED',
 'AGENT_STUDIO_PG_STAGE_KB_IMPORT_ENABLED','AGENT_STUDIO_PG_STAGE_KB_COMBINED_ENABLED',
 'AGENT_STUDIO_PG_STAGE_KB_ATOMIC_ENABLED','AGENT_STUDIO_PG_STAGE_DOMAIN_IMPORT_ENABLED',
 'AGENT_STUDIO_PG_STAGE_FENCE_IMPORT_ENABLED',
 'AGENT_STUDIO_PG_STAGE_RECONCILIATION_ENABLED','AGENT_STUDIO_PG_RECONCILIATION_USER',
 'AGENT_STUDIO_PG_STAGE_RECONCILIATION_PASSWORD_FILE']);
cp.spawnSync=function(exe,args,options){
 const e=options?.env;
 if(!${JSON.stringify(guard)}||exe!==process.execPath||options?.shell||!Array.isArray(args)||
 args[0]!=='--experimental-strip-types'||!allowed.has(args[1])||!e||
 Object.keys(e).some(k=>!envKeys.has(k))||e.GITHUB_ACTIONS!=='false'||
 e.NODE_OPTIONS!==${JSON.stringify('--import='+pathToFileURL(guard||root).href)}||
 (e.AGENT_STUDIO_PG_STAGE_FENCE_IMPORT_ENABLED==='true'&&
  (!args[1].endsWith('stage-execution-fence-import-cli.ts')||!args.includes('--execute')))||
 e.AGENT_STUDIO_PG_HOST!=='127.0.0.1'||e.AGENT_STUDIO_PG_DATABASE!=='agentstudio_stage'||
 e.AGENT_STUDIO_PG_IMPORT_USER!=='agentstudio_admin')throw Error('W31_NON_OPERATOR_CHILD_REFUSED');
 const result=spawn(exe,args,options);
 let r;try{r=JSON.parse(result.stdout)}catch{}
 if(result.status===0&&!r)throw Error('W31_CHILD_RECEIPT_REFUSED');
 if(r){
  const source=args[args.indexOf('--snapshot')+1];
  const digest=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if((r.source_sha256??r.source_snapshot_sha256)!==digest||r.production_cutover_allowed!==false)
    throw Error('W31_CHILD_RECEIPT_REFUSED');
  if(args[1].endsWith('stage-execution-fence-import-cli.ts')){
   if(r.source_read_only!==true||r.executable!==false||r.execution_enabled!==false||
      r.runtime_jobs_created!==0||r.runtime_runs_created!==0||r.side_effects_created!==0||
      r.counts?.parents!==2||r.counts?.leases!==2||r.counts?.side_effect_records!==3)
     throw Error('W31_CHILD_RECEIPT_REFUSED');
   if(args.includes('--execute')&&(![[5,0,5],[0,5,5]].some(x=>JSON.stringify(x)===JSON.stringify([
     r.counts.imported,r.counts.replayed,r.counts.reconciled]))))throw Error('W31_CHILD_RECEIPT_REFUSED');
  }
  if(args[1].endsWith('stage-reconciliation-cli.ts')&&
    (r.source_read_only!==true||r.target_read_only!==true||r.output_complete_source_coverage!==false))
    throw Error('W31_CHILD_RECEIPT_REFUSED');
 }
 return result;
};
for(const k of ['exec','execSync','execFile','execFileSync','spawn','fork'])
 cp[k]=()=>{throw Error('W31_NON_OPERATOR_CHILD_REFUSED')};
syncBuiltinESMExports();
`
}

// Offline guard probes omit source/PG imports and open no sockets.
test('fail-closed: W31 guard rejects external networking and arbitrary children',()=>{
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
    "])assert.throws(action,/W31_(NETWORK|EXTERNAL_FETCH|NON_OPERATOR_CHILD)_REFUSED/);",
    "console.log('W31_GUARD_PASS');"
  ].join('\n')
  const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'network guard offline probes must pass')
  assert.equal(child.stdout.trim(),'W31_GUARD_PASS')
})


// The digest is provided to the operator from the parent test's sealed fixture.
// This models an independently confirmed external channel ONLY for synthetic bytes.
function childEnvironment(f,guard){
  return {PATH:path.dirname(process.execPath),LANG:'C.UTF-8',GITHUB_ACTIONS:'false',
    NODE_OPTIONS:'--import='+pathToFileURL(guard).href,
    AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:'true',AGENT_STUDIO_PG_HOST:'127.0.0.1',
    AGENT_STUDIO_PG_DATABASE:'agentstudio_stage',AGENT_STUDIO_PG_IMPORT_USER:'agentstudio_admin',
    AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE:path.join(f.dir,'pg-password')}
}
function invoke(f,guard,mode,{review=true,trusted=f.trusted}={}){
  f.verify()
  const env=childEnvironment(f,guard)
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  const flags=['--'+mode,...['snapshot','manifest','mapping','oidc','approval'].flatMap(k=>['--'+k,f.files[k]])]
  if(review)flags.push('--fence-review',f.files.review,'--fence-review-sha256',trusted)
  if(mode==='execute')flags.push('--confirm-isolated-stage','agentstudio_stage','--allow-partial-trial')
  const child=spawnSync(process.execPath,['--experimental-strip-types',entry,...flags],
    {cwd:root,env,encoding:'utf8',timeout:240000,maxBuffer:1024*1024,windowsHide:true})
  f.verify()
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  assert.ok(!child.error&&child.signal===null)
  const output=child.stdout+child.stderr
  for(const secret of [f.password,...f.owners,...old,ar,wr,spec,workflow,...Object.values(f.files),
    'SYNTHETIC-NEVER-ARCHIVE-USER-FIELD','inert opaque','unknown historical result','synthetic-subject-'])
    assert.ok(!output.includes(secret))
  assert.ok(!/W31_(NETWORK|NON_OPERATOR_CHILD|EXTERNAL_FETCH|CHILD_RECEIPT)_REFUSED/.test(output))
  if(child.status===1){
    assert.equal(child.stdout,'')
    assert.ok(child.stderr.includes('Isolated stage operator refused: untrusted_execution_fence_review_sha'))
    return {status:1}
  }
  let report
  try{report=JSON.parse(child.stdout)}catch{throw Error('w31_operator_report_refused')}
  assert.equal(report.production_cutover_allowed,false)
  assert.equal(report.source_sha256,f.digest)
  assert.equal(report.source_snapshot_verified,true)
  assert.equal(report.full_manifest_verified,true)
  assert.equal(report.source_tables,8)
  return {status:child.status,report}
}
const phaseOrder=['identity','agent','workflow','workflow_history','history','fence_history','reconciliation']
function staged(out,replay){
  assert.equal(out.status,2)
  assert.equal(out.report.result,'stage_imported_reconciliation_incomplete')
  assert.deepEqual(out.report.blockers,['unreconciled_business_domains','production_cutover_forbidden'])
  assert.deepEqual(out.report.phase_results.map(r=>r.phase),phaseOrder)
  for(const r of out.report.phase_results.slice(0,-1))assert.equal(r.status,'passed')
  const fence=out.report.phase_results.find(r=>r.phase==='fence_history')
  assert.deepEqual(fence.summary.fence_counts,{leases:2,effects:3})
  // Operator exposes fence counts; guard validates nested imported/replayed receipt.
  assert.equal(out.report.phase_results.at(-1).exit_code,2)
  for(const phase of ['identity','agent','workflow','workflow_history','history']){
    const r=out.report.phase_results.find(r=>r.phase===phase)
    const n=phase==='identity'?2:1
    assert.equal(r.summary.imported,replay?0:n)
    assert.equal(r.summary.replayed,replay?n:0)
  }
}

test('fail-closed: child environment is an explicit synthetic allowlist',()=>{
  const env=childEnvironment({dir:root},path.join(root,'unused-w31-guard.mjs'))
  assert.deepEqual(Object.keys(env).sort(),['PATH','LANG','GITHUB_ACTIONS','NODE_OPTIONS',
    'AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED','AGENT_STUDIO_PG_HOST','AGENT_STUDIO_PG_DATABASE',
    'AGENT_STUDIO_PG_IMPORT_USER','AGENT_STUDIO_PG_IMPORT_PASSWORD_FILE'].sort())
  assert.equal(env.GITHUB_ACTIONS,'false')
  for(const k of ['DATABASE_URL','PGPASSWORD','NODE_PATH','OPENAI_API_KEY','AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN','AGENT_STUDIO_PG17_ADMIN_PASSWORD'])assert.equal(env[k],undefined)
})

async function verifyArchives(db,f){
  for(const [table,sourceTable,owner] of [['legacy_run_history','agent_runs',f.owners[0]],
    ['legacy_workflow_history','workflow_runs',f.owners[1]]]){
    const rows=(await db.query('SELECT * FROM agentstudio.'+table)).rows
    assert.equal(rows.length,1)
    const r=rows[0]
    assert.equal(r.source_table,sourceTable)
    assert.equal(r.source_snapshot_sha256,f.digest)
    assert.equal(r.identity_mapping_sha256,fileHash(f.files.mapping))
    assert.equal(r.manifest_sha256,fileHash(f.files.manifest))
    assert.equal(r.owner_user_id,owner)
    assert.deepEqual(r.source_record,f.rows[sourceTable][0])
    assert.equal(r.payload_sha256,rawHash(r.source_record))
    assert.equal(r.executable,false)
    assert.equal(r.evidence_status,'historical_unverified')
  }
  const rows=(await db.query('SELECT * FROM '+archive)).rows
  assert.equal(rows.length,5)
  for(const r of rows){
    const expected=f.rows[r.source_table]?.find(x=>x.kind===r.kind&&x.run_id===r.legacy_run_id&&
      (x.step_key??'')===r.step_key)
    assert.ok(expected)
    assert.deepEqual(r.source_record,expected)
    assert.equal(r.source_snapshot_sha256,f.digest)
    assert.equal(r.identity_mapping_sha256,fileHash(f.files.mapping))
    assert.equal(r.manifest_sha256,fileHash(f.files.manifest))
    assert.equal(r.source_review_sha256,f.trusted)
    const i=r.kind==='agent'?0:1
    assert.equal(r.legacy_owner_id,old[i]);assert.equal(r.owner_user_id,f.owners[i])
    assert.equal(r.legacy_run_id,i===0?ar:wr)
    assert.equal(r.parent_payload_sha256,rawHash(f.rows[i===0?'agent_runs':'workflow_runs'][0]))
    assert.equal(r.payload_sha256,rawHash(expected))
    assert.equal(r.executable,false);assert.equal(r.evidence_status,'historical_unverified')
  }
  assert.equal(rows.filter(r=>r.source_record.status==='unknown').length,1)
  for(const [table,n] of [['users',2],['legacy_user_imports',2],['agent_specs',1],
    ['legacy_agent_imports',1],['workflows',1],['legacy_workflow_imports',1]])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n,n)
  for(const r of (await db.query('SELECT * FROM agentstudio.users')).rows){
    const i=f.owners.indexOf(r.id);assert.ok(i>=0)
    assert.equal(r.status,'disabled');assert.equal(r.external_issuer,'https://w31.synthetic.invalid')
    assert.equal(r.external_subject,'synthetic-subject-'+i)
  }
  for(const r of (await db.query('SELECT * FROM agentstudio.legacy_user_imports')).rows){
    assert.equal(r.source_snapshot_sha256,f.digest)
    assert.equal(r.target_user_id,f.owners[old.indexOf(r.legacy_user_id)])
    assert.equal(r.reviewed_mapping_sha256,fileHash(f.files.mapping))
    assert.equal(r.reviewed_idp_sha256,fileHash(f.files.oidc))
    assert.equal(r.active_automatically,false)
  }
  for(const table of ['legacy_agent_imports','legacy_workflow_imports']){
    const r=(await db.query('SELECT * FROM agentstudio.'+table)).rows[0]
    assert.equal(r.source_snapshot_sha256,f.digest)
    assert.equal(r.owner_user_id,f.owners[table==='legacy_agent_imports'?0:1])
  }
  await zeroRuntime(db)
}

test('PG17 TCP: W31 unified operator with approved synthetic fence, NO-GO',async()=>{
  // First operation in the real trial: pure environment gate, before ALL fixture I/O.
  const config=requireEphemeral(process.env)
  let temp,admin,phase='TEMP',failure=null
  const dirs=[]
  try{
    temp=checkedTemp()
    phase='GUARD'
    const control=fs.mkdtempSync(path.join(temp,'w31-pg17-synthetic-'))
    dirs.push(control);fs.chmodSync(control,0o700)
    const guard=path.join(control,'guard.mjs')
    write(guard,guardSource(guard));fs.chmodSync(guard,0o400)
    // The same network restrictions apply to the parent. No driver/SQL substitution.
    await import(pathToFileURL(guard).href)
    const [{default:pg},{DatabaseSync},{reconcileStage}]=await Promise.all([
      import('pg'),import('node:sqlite'),import('../src/stage-reconciliation.ts')])
    phase='EMPTY_TARGET'
    admin=new pg.Pool(config);admin.on('error',()=>{})
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,inet_server_port() AS port,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS super")).rows[0]
    assert.ok(g.db===config.database&&g.login===config.user&&g.role===g.login&&g.super===true&&
      g.version>=170000&&g.version<180000&&g.address!==null&&g.port===5432)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS n")).rows[0].n,null)
    for(const query of [
      "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'",
      "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'",
      "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')",
      "SELECT count(*)::int AS n FROM pg_extension WHERE extname<>'plpgsql'",
      "SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('agentstudio_api','agentstudio_worker')"])
      assert.equal((await admin.query(query)).rows[0].n,0)
    phase='SCHEMA'
    await admin.query(sql('db/postgres/001_stage_schema.sql'))
    for(const name of ['pg_v8_006_legacy_workflow_import.sql','pg_v8_007_legacy_kb_import.sql',
      'pg_v8_008_legacy_schedule_import.sql','pg_v8_009_legacy_collaboration_import.sql',
      'pg_v8_010_legacy_kb_content.sql','pg_v8_011_legacy_user_provision.sql',
      'pg_v8_012_legacy_run_history.sql','pg_v8_013_legacy_kb_embedding_state.sql',
      'pg_v9_014_legacy_workflow_history.sql','pg_v9_017_legacy_execution_fence_archive.sql'])
      await admin.query(sql('db/postgres/migrations/'+name))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    phase='SOURCE'
    const f=source(DatabaseSync,temp,dirs,[randomUUID(),randomUUID()])
    f.owners=JSON.parse(fs.readFileSync(f.files.mapping,'utf8')).records.map(r=>r.new_studio_user_id)
    f.password=config.password
    const passwordFile=path.join(f.dir,'pg-password')
    write(passwordFile,config.password);fs.chmodSync(passwordFile,0o400)
    const extraSeals=[guard,passwordFile].map(p=>({p,hash:fileHash(p),st:fs.statSync(p)}))
    const verify=f.verify
    f.verify=()=>{verify();for(const {p,hash,st} of extraSeals){
      const now=fs.lstatSync(p)
      assert.ok(!now.isSymbolicLink()&&now.isFile()&&now.mode===st.mode&&now.mode%512===0o400&&
        now.ino===st.ino&&now.mtimeMs===st.mtimeMs&&now.size===st.size&&fileHash(p)===hash)
    }}
    phase='PREFLIGHT_REFUSALS'
    const empty=await fingerprint(admin)
    // Offline plan must never attempt TCP, not merely leave DB rows unchanged.
    // The guard refuses sockets from operator and every --plan child.
    for(const mode of ['plan','execute']){
      const missing=invoke(f,guard,mode,{review:false})
      assert.equal(missing.status,2);assert.equal(missing.report.result,'preflight_blocked')
      assert.deepEqual(missing.report.phase_results,[])
      assert.deepEqual(missing.report.blockers,['independent_execution_fence_review_required'])
      assert.equal(invoke(f,guard,mode,{trusted:'0'.repeat(64)}).status,1)
      assert.equal(await fingerprint(admin),empty)
    }
    phase='PLAN'
    const planned=invoke(f,guard,'plan')
    assert.equal(planned.status,0);assert.equal(planned.report.result,'preflight_verified')
    assert.deepEqual(planned.report.phase_results.map(r=>r.phase),phaseOrder)
    assert.ok(planned.report.phase_results.every(r=>r.status==='passed'))
    assert.equal(await fingerprint(admin),empty)
    phase='EXECUTE'
    staged(invoke(f,guard,'execute'),false)
    await verifyArchives(admin,f)
    const first=await fingerprint(admin)
    phase='REPLAY'
    staged(invoke(f,guard,'execute'),true)
    await verifyArchives(admin,f);assert.equal(await fingerprint(admin),first)
    phase='PROVENANCE_FENCES'
    const r=(await admin.query('SELECT * FROM '+archive+' ORDER BY source_table,kind,legacy_run_id,step_key')).rows[0]
    const columns=['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256','source_review_sha256',
      'source_table','kind','legacy_run_id','step_key','legacy_owner_id','owner_user_id','parent_payload_sha256',
      'source_record','payload_sha256','executable','evidence_status']
    const values=columns.map(k=>k==='source_record'?JSON.stringify(r[k]):r[k])
    const insert='INSERT INTO '+archive+'('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')'
    // Real BEFORE INSERT provenance triggers must reject prior to duplicate-key checks.
    for(const [key,value] of [['source_snapshot_sha256','0'.repeat(64)],['manifest_sha256','0'.repeat(64)],
      ['owner_user_id',f.owners.find(x=>x!==r.owner_user_id)],['parent_payload_sha256','0'.repeat(64)],
      ['legacy_run_id','zzzzzzzzzzzzzzz']]){
      const bad=[...values];bad[columns.indexOf(key)]=value
      await assert.rejects(admin.query(insert,bad),e=>e.code==='P0001')
      assert.equal(await fingerprint(admin),first)
    }
    for(const statement of ['UPDATE '+archive+' SET executable=true','DELETE FROM '+archive,'TRUNCATE '+archive])
      await assert.rejects(admin.query(statement),e=>e.code==='P0001'&&e.message==='execution_fence_immutable')
    assert.equal(await fingerprint(admin),first)
    phase='READ_ONLY_RECONCILE'
    const trace=[]
    const readOnly={async connect(){const c=await admin.connect();return {
      async query(statement,values=[]){
        assert.match(statement,/^(SELECT\b|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/)
        trace.push(statement)
        if(statement.startsWith('SELECT'))assert.equal((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on')
        return {rows:(await c.query(statement,values)).rows}
      },release(){c.release()}}}}
    const report=await reconcileStage({...f.files,reviewed_idp:f.files.oidc,
      approval:JSON.parse(fs.readFileSync(f.files.approval,'utf8'))},readOnly)
    for(const domain of ['studio_users','agent_specs','workflows']){
      const r=report.find(x=>x.domain===domain)
      assert.equal(r.status,'success');assert.equal(r.association_anomalies,0)
    }
    const historical=report.find(r=>r.domain==='agent_runs')
    assert.equal(historical.status,'unsupported')
    // W9 counts/owner checks alone do not establish archive payload fidelity.
    // verifyArchives above independently checks every parent/fence raw row.
    assert.deepEqual(historical.blockers,['archive_only_live_unsupported'])
    assert.ok(report.some(r=>r.status!=='success'))
    assert.deepEqual(trace.filter(s=>!s.startsWith('SELECT')),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK'])
    // Independently confirm PG enforces read-only, rather than trusting the adapter.
    const c=await admin.connect()
    try{await c.query('BEGIN READ ONLY');await assert.rejects(c.query('UPDATE agentstudio.agent_specs SET name=name'),e=>e.code==='25006')}
    finally{await c.query('ROLLBACK');c.release()}
    await zeroRuntime(admin);assert.equal(await fingerprint(admin),first);f.verify()
  }catch{failure='W31_PG17_OPERATOR_FENCE_FAIL_'+phase}
  finally{
    try{if(admin)await admin.end()}catch{failure='W31_PG17_OPERATOR_FENCE_FAIL_CLEANUP'}
    try{for(const dir of dirs){
      if(!temp||path.dirname(dir)!==temp||!path.basename(dir).startsWith('w31-pg17-synthetic-')||
        fs.realpathSync(dir)!==dir||fs.lstatSync(dir).isSymbolicLink())throw Error('refused')
      fs.rmSync(dir,{recursive:true,force:true})
    }}catch{failure='W31_PG17_OPERATOR_FENCE_FAIL_CLEANUP'}
    // No DROP or restore: only GitHub may dispose of the ephemeral PG service.
  }
  if(failure)throw Error(failure)
  console.log('W31_PG17_OPERATOR_FENCE_PASS real_tcp=true synthetic_only=true cutover=NO-GO')
})

test('fail-closed: poisoned child environments and forged fence receipts are refused offline',()=>{
  const guard=path.join(root,'unused-w31-guard.mjs')
  const env=childEnvironment({dir:path.join(root,'unused-synthetic')},guard)
  const digest=sha('synthetic-offline-bytes')
  const receipt={source_sha256:digest,source_read_only:true,production_cutover_allowed:false,
    executable:false,execution_enabled:false,runtime_jobs_created:0,runtime_runs_created:0,side_effects_created:0,
    counts:{parents:2,leases:2,side_effect_records:3,imported:5,replayed:0,reconciled:5}}
  const args=['--experimental-strip-types',path.join(root,'services/pg-api/src/stage-execution-fence-import-cli.ts'),
    '--execute','--snapshot','synthetic-unused']
  // Stub only this OFFLINE guard probe; the PG17 trial uses untouched pg/SQL/importers.
  const setup="import cp from 'node:child_process';import fs from 'node:fs';"+
    "fs.readFileSync=()=>Buffer.from('synthetic-offline-bytes');"+
    "cp.spawnSync=()=>({status:0,stdout:JSON.stringify(globalThis.receipt)});"
  const probe="import assert from 'node:assert/strict';import cp from 'node:child_process';"+
    'const env='+JSON.stringify(env)+';const args='+JSON.stringify(args)+';const good='+JSON.stringify(receipt)+';'+
    'globalThis.receipt=good;assert.equal(cp.spawnSync(process.execPath,args,{env}).status,0);'+
    "for(const key of ['DATABASE_URL','PGPASSWORD','NODE_PATH','GITHUB_TOKEN','OPENAI_API_KEY'])"+
    "assert.throws(()=>cp.spawnSync(process.execPath,args,{env:{...env,[key]:'synthetic-poison'}}),/W31_NON_OPERATOR_CHILD_REFUSED/);"+
    "for(const patch of [{source_sha256:'0'.repeat(64)},{production_cutover_allowed:true},{executable:true},"+
    "{execution_enabled:true},{runtime_jobs_created:1},{runtime_runs_created:1},{side_effects_created:1},"+
    "{counts:{...good.counts,imported:0}},{counts:{...good.counts,leases:0}}]){"+
    "globalThis.receipt={...good,...patch};assert.throws(()=>cp.spawnSync(process.execPath,args,{env}),/W31_CHILD_RECEIPT_REFUSED/)}"
  const child=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(setup),
    '--import','data:text/javascript,'+encodeURIComponent(guardSource(guard)),'--input-type=module','-e',probe],
    {env:{},encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===0,'w31_offline_receipt_guard_refused')
})

test('fail-closed: unchanged operator retains its real GitHub Actions prohibition',()=>{
  const child=spawnSync(process.execPath,['--experimental-strip-types',entry,'--execute',
    '--confirm-isolated-stage','agentstudio_stage','--allow-partial-trial',
    ...['snapshot','manifest','mapping','oidc','approval'].flatMap(k=>['--'+k,'__never_read_w31__'])],
    {env:{GITHUB_ACTIONS:'true',AGENT_STUDIO_PG_STAGE_OPERATOR_ENABLED:'true'},
      encoding:'utf8',timeout:15000,windowsHide:true})
  assert.ok(!child.error&&child.status===1)
  assert.equal(child.stdout,'')
  assert.ok(child.stderr.includes('real_business_snapshot_forbidden_in_github_ci'))
  assert.ok(!child.stderr.includes('__never_read_w31__'))
})
