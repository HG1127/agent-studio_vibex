// W10: independent, synthetic-only W9 acceptance on an EMPTY GH-hosted PG17.
// Default local execution MUST fail before importing pg or opening any socket.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash, randomBytes, randomUUID} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import net from 'node:net'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const sha=value=>createHash('sha256').update(value).digest('hex')
function requireEphemeral(env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||'',password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||''
  const prefix='synthetic-agentstudio-pg17-ci-'+run+'-'
  if(platform!=='linux'||env.GITHUB_ACTIONS!=='true'||
    env.RUNNER_ENVIRONMENT!=='github-hosted'||env.RUNNER_OS!=='Linux'||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_RECONCILIATION_TEST_ENABLED!=='true'||
    env.AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED!=='true'||
    env.AGENT_STUDIO_PG17_HOST!=='127.0.0.1'||
    env.AGENT_STUDIO_PG17_DATABASE!=='agentstudio_stage'||
    env.AGENT_STUDIO_PG17_ADMIN_USER!=='agentstudio_admin'||
    (env.AGENT_STUDIO_PG17_PORT!==undefined&&env.AGENT_STUDIO_PG17_PORT!=='5432')||
    !/^[0-9]{1,32}$/.test(run)||!password.startsWith(prefix)||
    !/^[a-f0-9]{64}$/.test(password.slice(prefix.length))||
    new Set(password.slice(prefix.length)).size<12||
    !env.RUNNER_TEMP||!path.posix.isAbsolute(env.RUNNER_TEMP))
    throw Error('refuse_non_ephemeral_pg17_reconciliation')
  return {host:'127.0.0.1',port:5432,database:'agentstudio_stage',
    user:'agentstudio_admin',password,ssl:false,options:'',max:1,
    connectionTimeoutMillis:5000,statement_timeout:15000,idleTimeoutMillis:1000,
    application_name:'synthetic_w10_reconciliation'}
}

test('fail-closed: every isolation gate is mandatory, including Windows rejection',()=>{
  // No pg import, TCP, SQLite, fixture directory or environment mutation here.
  const valid={GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456',
    RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_TEMP:'/tmp/w10',
    AGENT_STUDIO_PG17_TEST_ENABLED:'true',
    AGENT_STUDIO_PG17_RECONCILIATION_TEST_ENABLED:'true',
    AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:'true',
    AGENT_STUDIO_PG17_HOST:'127.0.0.1',AGENT_STUDIO_PG17_PORT:'5432',
    AGENT_STUDIO_PG17_DATABASE:'agentstudio_stage',
    AGENT_STUDIO_PG17_ADMIN_USER:'agentstudio_admin',
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456-'+randomBytes(32).toString('hex')}
  assert.equal(requireEphemeral(valid,'linux').host,'127.0.0.1')
  const refused=env=>assert.throws(()=>requireEphemeral(env,'linux'),
    /^Error: refuse_non_ephemeral_pg17_reconciliation$/)
  for(const key of Object.keys(valid)){
    const absent={...valid};delete absent[key]
    // Omitted port is explicitly pinned to 5432, never inherited from PGPORT.
    if(key!=='AGENT_STUDIO_PG17_PORT')refused(absent)
    refused({...valid,[key]:'invalid'})
  }
  for(const platform of ['win32','darwin'])assert.throws(
    ()=>requireEphemeral(valid,platform),/refuse_non_ephemeral/)
  for(const host of ['localhost','postgres','::1','production.invalid'])
    refused({...valid,AGENT_STUDIO_PG17_HOST:host})
  for(const run of ['','12x','1\n','1'.repeat(33)])refused({...valid,GITHUB_RUN_ID:run})
  for(const suffix of ['', 'a'.repeat(64),'0123456789abcdef'.repeat(3)])
    refused({...valid,AGENT_STUDIO_PG17_ADMIN_PASSWORD:
      'synthetic-agentstudio-pg17-ci-123456-'+suffix})
  refused({...valid,RUNNER_ENVIRONMENT:'self-hosted'})
  refused({...valid,AGENT_STUDIO_PG17_ADMIN_PASSWORD:'synthetic-agentstudio-pg17-ci-123456'})
})

test('fail-closed: rejected entry never attempts a socket (child-process tripwire)',()=>{
  const preload='data:text/javascript,'+encodeURIComponent(
    "import net from 'node:net';net.Socket.prototype.connect=function(){throw Error('W10_SOCKET_ATTEMPT_FORBIDDEN')}")
  for(const change of [
    {AGENT_STUDIO_PG17_RECONCILIATION_TEST_ENABLED:'false'},
    {AGENT_STUDIO_PG17_HOST:'production.synthetic.invalid'},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:'not-a-synthetic-random-password'},
  ]){
    const childEnv={...process.env,...change}
    // A nested --test invocation needs its own harness, not the parent's IPC.
    delete childEnv.NODE_TEST_CONTEXT
    const child=spawnSync(process.execPath,['--import',preload,
      '--experimental-strip-types','--test','--test-name-pattern=^PG17 TCP:',
      fileURLToPath(import.meta.url)],{encoding:'utf8',timeout:15000,
      env:childEnv})
    assert.equal(child.error,undefined)
    assert.equal(child.status,1)
    const output=child.stdout+child.stderr
    assert.match(output,/refuse_non_ephemeral_pg17_reconciliation/)
    assert.doesNotMatch(output,/W10_SOCKET_ATTEMPT_FORBIDDEN|ECONNREFUSED|ENOTFOUND/)
  }
})

const stamp='2026-10-15T01:00:00.000Z'
const otherSources=['workflows','agent_studio_kb_bases','agent_studio_kb_documents',
  'agent_studio_kb_chunks','agent_studio_kb_vectors','agent_studio_schedules',
  'agent_studio_spec_access','agent_studio_kb_access','agent_studio_spec_proposals',
  'agent_studio_kb_access_events','agent_studio_spec_collab_audit',
  'agent_studio_spec_revisions','agent_runs']
const migrations=['006_legacy_workflow_import','007_legacy_kb_import',
  '008_legacy_schedule_import','009_legacy_collaboration_import',
  '010_legacy_kb_content','011_legacy_user_provision','012_legacy_run_history']
const sqlFile=name=>fs.readFileSync(path.join(root,name),'utf8')
  .split(/\r?\n/).filter(line=>!line.trim().startsWith('\\')).join('\n')
const quote=name=>'"'+name.replaceAll('"','""')+'"'

function frozenFixture(DatabaseSync,tempRoot){
  const dir=fs.mkdtempSync(path.join(tempRoot,'w10-pg17-synthetic-'))
  try{
    const input={snapshot:path.join(dir,'frozen.sqlite'),
      manifest:path.join(dir,'manifest.json'),mapping:path.join(dir,'mapping.json')}
    const marker='SYNTHETIC_PRIVATE_'+randomBytes(16).toString('hex')
    const owner=randomUUID(),target=randomUUID()
    const spec={goal:marker+' prompt',task_scope:'Synthetic offline only',
      deliverables:['Report'],task_plan:['Review'],done_criteria:['Done'],
      tools:[],knowledge_base_ids:[],require_approval:true}
    const raw={id:'agent0000000001',rh_user_id:'employee0000001',name:marker,
      spec:JSON.stringify(spec),source:'',template_key:'',created:stamp,updated:stamp}
    const sqlite=new DatabaseSync(input.snapshot)
    try{
      sqlite.exec('PRAGMA journal_mode=DELETE; CREATE TABLE studio_users(id TEXT PRIMARY KEY,password TEXT); '+
        'CREATE TABLE agent_specs(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT)')
      sqlite.prepare('INSERT INTO studio_users VALUES (?,?)').run(raw.rh_user_id,marker+' password')
      sqlite.prepare('INSERT INTO agent_specs VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(raw))
      for(const name of otherSources)sqlite.exec(`CREATE TABLE ${name}(id TEXT,private_payload TEXT)`)
    }finally{sqlite.close()}
    // Frozen bytes: all SQLite handles closed, no WAL/journal, manifest bound.
    const bytes=fs.readFileSync(input.snapshot),sourceSha=sha(bytes)
    const tables=Object.fromEntries(otherSources.map(name=>[name,0]))
    tables.studio_users=1;tables.agent_specs=1
    fs.writeFileSync(input.manifest,JSON.stringify({
      format:'agent-studio-sqlite-snapshot-v1',sha256:sourceSha,bytes:bytes.length,tables}))
    fs.writeFileSync(input.mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',
      source_sha256:sourceSha,records:[{old_id:raw.rh_user_id,new_studio_user_id:owner,
        verified_by:'Synthetic W10 reviewer',approved_at:stamp}]}))
    input.approval={source_sha256:sourceSha,approved_by:'Synthetic W10 reviewer',approved_at:stamp}
    for(const suffix of ['-wal','-shm','-journal'])assert.equal(fs.existsSync(input.snapshot+suffix),false)
    return {dir,input,marker,owner,target,raw,sourceSha,
      mappingSha:sha(fs.readFileSync(input.mapping)),
      fileHashes:()=>[input.snapshot,input.manifest,input.mapping].map(f=>sha(fs.readFileSync(f)))}
  }catch(error){safeCleanup(dir,tempRoot);throw error}
}
function safeCleanup(dir,tempRoot){
  // Only the exact newly allocated child, verified inside the runner temp root.
  assert.equal(path.dirname(path.resolve(dir)),tempRoot)
  assert.ok(path.basename(dir).startsWith('w10-pg17-synthetic-'))
  assert.equal(fs.lstatSync(dir).isSymbolicLink(),false)
  assert.equal(fs.realpathSync(dir),path.resolve(dir))
  fs.rmSync(dir,{recursive:true,force:true})
}
async function fingerprint(db){
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='agentstudio' ORDER BY tablename")).rows
  const hashes=[]
  for(const {tablename} of tables){
    const rows=(await db.query(`SELECT row_to_json(t)::text AS row FROM agentstudio.${quote(tablename)} AS t ORDER BY row_to_json(t)::text`)).rows
    hashes.push([tablename,sha(JSON.stringify(rows))])
  }
  return sha(JSON.stringify(hashes))
}

test('PG17 TCP: W9 reconciliation, real read-only transaction, origin and ACL fences',async(t)=>{
  // All network-capable imports/pools/fixtures are AFTER this guard.
  const config=requireEphemeral(process.env)
  const connect=net.Socket.prototype.connect
  t.mock.method(net.Socket.prototype,'connect',function(...args){
    const [port,host]=typeof args[0]==='object'?
      [args[0].port,args[0].host]:args
    assert.equal(Number(port),5432,'only isolated PG17 TCP is allowed')
    assert.equal(host,'127.0.0.1','no DNS, external provider or existing database')
    return connect.apply(this,args)
  })
  const [{default:pg},{DatabaseSync},{reconcileStage},{normalizeLegacyAgent}]=await Promise.all([
    import('pg'),import('node:sqlite'),import('../src/stage-reconciliation.ts'),
    import('../src/stage-agent-import.ts')])
  t.mock.method(globalThis,'fetch',()=>{throw Error('external_fetch_forbidden')})
  const admin=new pg.Pool(config)
  let readonly,api,f
  const tempRoot=fs.realpathSync(process.env.RUNNER_TEMP)
  try{
    const guard=(await admin.query("SELECT current_database() AS name,session_user AS login,current_user AS role,"+
      "current_setting('server_version_num')::int AS version,inet_server_addr()::text AS address,"+
      "inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS admin")).rows[0]
    assert.equal(guard.name,'agentstudio_stage');assert.equal(guard.login,'agentstudio_admin')
    assert.equal(guard.role,guard.login);assert.equal(guard.admin,true)
    assert.ok(guard.version>=170000&&guard.version<180000)
    assert.ok(guard.address!==null,'must be real TCP, not an embedded engine or Unix socket')
    assert.equal(guard.port,5432)
    // Stronger than checking runs alone: refuse ANY existing schema/relation.
    const fresh=(await admin.query("SELECT to_regnamespace('agentstudio') AS schema,"+
      "(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agentstudio') AS relations")).rows[0]
    assert.equal(fresh.schema,null,'refuse reused database before any DDL')
    assert.equal(fresh.relations,0)
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN "+
      "('agentstudio_api','agentstudio_worker','agentstudio_w10_api_login')")).rows[0].n,0,
      'refuse a reused test cluster')
    await admin.query(sqlFile('db/postgres/001_stage_schema.sql'))
    for(const migration of migrations)await admin.query(sqlFile('db/postgres/migrations/pg_v8_'+migration+'.sql'))
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_extension WHERE extname='vector'")).rows[0].n,1)
    const ledger=(await admin.query('SELECT version FROM agentstudio.schema_migrations')).rows.map(r=>r.version)
    for(const version of ['005',...migrations.map(m=>m.slice(0,3))])assert.ok(ledger.includes('pg_v8_'+version))
    f=frozenFixture(DatabaseSync,tempRoot)
    const row=normalizeLegacyAgent(f.raw,new Map([[f.raw.rh_user_id,f.owner]]))
    await admin.query('BEGIN')
    try{
      await admin.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'https://w10.synthetic.invalid',$2,'disabled')",[f.owner,f.marker])
      await admin.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256,active_automatically) VALUES($1,$2,$3,$4,$5,$6,false)',
        [f.sourceSha,f.raw.rh_user_id,f.owner,f.mappingSha,sha('synthetic reviewed IdP'),sha('synthetic identity row')])
      await admin.query('INSERT INTO agentstudio.agent_specs(id,owner_user_id,name,spec,requires_approval,created_at,updated_at) VALUES($1,$2,$3,$4,true,$5,$6)',
        [f.target,f.owner,row.name,JSON.stringify(row.spec),row.created_at,row.updated_at])
      await admin.query('INSERT INTO agentstudio.legacy_agent_imports(source_snapshot_sha256,legacy_spec_id,owner_user_id,target_spec_id,payload_sha256) VALUES($1,$2,$3,$4,$5)',
        [f.sourceSha,f.raw.id,f.owner,f.target,row.payload_sha256])
      await admin.query('COMMIT')
    }catch(error){await admin.query('ROLLBACK');throw error}

    readonly=new pg.Pool({...config,options:'-c default_transaction_read_only=on'})
    // PostgreSQL itself must reject writes, including outside BEGIN READ ONLY.
    const probe=await readonly.connect()
    try{
      assert.equal((await probe.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on')
      await assert.rejects(probe.query('UPDATE agentstudio.users SET status=status'),e=>e.code==='25006')
      await probe.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      assert.equal((await probe.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on')
      await assert.rejects(probe.query('DELETE FROM agentstudio.agent_specs'),e=>e.code==='25006')
    }finally{await probe.query('ROLLBACK');probe.release()}
    let connections=0,releases=0,readOnlyBegins=0
    const statements=[]
    const adapter={async connect(){
      connections++
      const client=await readonly.connect()
      return {async query(sql,values=[]){
        statements.push(sql)
        // Also detect an attempted mutation even if it would be rolled back.
        assert.match(sql,/^(SELECT\b|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/)
        const result=await client.query(sql,values)
        if(sql.startsWith('BEGIN')){
          const state=(await client.query("SELECT current_setting('transaction_read_only') AS ro,current_setting('transaction_isolation') AS isolation")).rows[0]
          assert.equal(state.ro,'on');assert.equal(state.isolation,'repeatable read');readOnlyBegins++
        }
        return {rows:result.rows}
      },release(){releases++;client.release()}}
    }}
    const filesBefore=f.fileHashes(),before=await fingerprint(admin)
    const checkPrivate=report=>{
      const output=JSON.stringify(report)
      for(const prohibited of [f.marker,f.raw.id,f.raw.rh_user_id,f.owner,f.target,
        f.input.snapshot,f.input.mapping,f.sourceSha,f.mappingSha,config.password])
        assert.ok(!output.includes(prohibited),'report must contain only counts and status codes')
      for(const item of report)assert.deepEqual(Object.keys(item).sort(),
        ['domain','source_count','target_count','blockers','association_anomalies','status'].sort())
    }
    const run=async(input=f.input)=>{
      const prior=await fingerprint(admin),source=f.fileHashes()
      const report=await reconcileStage(input,adapter)
      checkPrivate(report)
      assert.equal(await fingerprint(admin),prior,'reconciliation must not mutate any fixture table')
      assert.deepEqual(f.fileHashes(),source)
      return report
    }
    const report=await run(),agent=report.find(r=>r.domain==='agent_specs')
    assert.equal(report.length,16)
    assert.deepEqual(agent,{domain:'agent_specs',source_count:1,target_count:1,
      blockers:[],association_anomalies:0,status:'success'})
    // A domain absent from the frozen source manifest has UNKNOWN source
    // count (null), never a verified empty table (zero). Match the actual
    // complete manifest instead of assuming all synthetic domains exist.
    const frozenCounts=JSON.parse(fs.readFileSync(f.input.manifest,"utf8")).tables
    for(const item of report.filter(r=>r.domain!=='agent_specs')){
      // W11 added real field-level validation: the intentionally skeletal
      // source fixtures for Workflow/KB metadata are now INVALID, not merely
      // unsupported. This stronger failure is expected and must remain.
      const malformedSource=['workflows','agent_studio_kb_bases'].includes(item.domain)
      assert.equal(item.status,malformedSource?'failed':'unsupported',item.domain)
      assert.equal(item.association_anomalies,0)
      assert.equal(item.source_count,
        Object.hasOwn(frozenCounts,item.domain)?frozenCounts[item.domain]:null,
        item.domain)
      if(malformedSource){
        // A target count of null explicitly means reconciliation could not
        // safely inspect this invalid-source domain. It is NOT equivalent to
        // a verified zero. Both must remain failed, never unsupported/success.
        assert.ok(item.target_count===null||item.target_count===0,item.domain)
        assert.ok(item.blockers.some(code=>[
          'source_fields_unmapped','source_table_missing','target_fields_missing',
          'target_schema_missing',
        ].includes(code)),item.domain)
      }else{
        assert.equal(item.target_count,item.domain==='studio_users'?1:0,item.domain)
        assert.equal(item.blockers.length,1)
      }
    }
    assert.deepEqual(await run(),report,'read-only rerun must be stable')
    assert.equal(await fingerprint(admin),before);assert.deepEqual(f.fileHashes(),filesBefore)

    // Source approval/map origin mismatches must fail BEFORE pool acquisition.
    const n=connections
    assert.deepEqual((await run({...f.input,approval:{...f.input.approval,source_sha256:'0'.repeat(64)}}))[0].blockers,['snapshot_not_approved'])
    const mapping=fs.readFileSync(f.input.mapping)
    try{
      fs.writeFileSync(f.input.mapping,JSON.stringify({...JSON.parse(mapping),source_sha256:'0'.repeat(64)}))
      assert.deepEqual((await run())[0].blockers,['identity_not_approved'])
    }finally{fs.writeFileSync(f.input.mapping,mapping)}
    assert.equal(connections,n)
    await admin.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',['0'.repeat(64)])
    const mixed=(await run()).find(r=>r.domain==='agent_specs')
    assert.equal(mixed.status,'failed');assert.ok(mixed.blockers.includes('mixed_snapshot'))
    await admin.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',[f.sourceSha])
    await admin.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1',['0'.repeat(64)])
    const unapproved=(await run()).find(r=>r.domain==='agent_specs')
    assert.equal(unapproved.status,'failed');assert.equal(unapproved.association_anomalies,1)
    await admin.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1',[f.mappingSha])
    for(const status of ['queued','leased']){
      const job=(await admin.query("INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key,status,lease_owner,lease_token,lease_until) VALUES($1,'run_tick',$2,$3,'synthetic',gen_random_uuid(),now()+interval '1 minute') RETURNING id",
        [f.owner,'w10-'+status,status])).rows[0].id
      try{assert.deepEqual((await run())[0].blockers,['active_jobs'])}
      finally{await admin.query('DELETE FROM agentstudio.jobs WHERE id=$1',[job])}
    }
    assert.deepEqual(await run(),report)
    assert.equal(connections,releases);assert.equal(connections,readOnlyBegins)
    assert.equal(statements.at(-1),'ROLLBACK')
    assert.equal(await fingerprint(admin),before);assert.deepEqual(f.fileHashes(),filesBefore)

    // Separate non-superuser TCP login: SET ROLE on an admin alone is weaker.
    const apiPassword='synthetic-'+randomBytes(32).toString('hex')
    await admin.query("CREATE ROLE agentstudio_w10_api_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '"+apiPassword+"'")
    await admin.query('GRANT agentstudio_api TO agentstudio_w10_api_login')
    await admin.query('GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_w10_api_login')
    api=new pg.Pool({...config,user:'agentstudio_w10_api_login',password:apiPassword})
    const apiClient=await api.connect()
    try{
      const role=(await apiClient.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]
      assert.deepEqual(role,{rolsuper:false,rolbypassrls:false})
      await apiClient.query('SET ROLE agentstudio_api')
      assert.equal((await apiClient.query('SELECT current_user AS role')).rows[0].role,'agentstudio_api')
      // Positive control: API SELECT on an ordinary table is allowed (RLS
      // returns no employees without an actor), unlike migration evidence.
      await apiClient.query('SELECT id,status FROM agentstudio.users')
      for(const {tablename} of (await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='agentstudio' AND tablename LIKE 'legacy\\_%' ESCAPE '\\'")).rows)
        await assert.rejects(apiClient.query('SELECT * FROM agentstudio.'+quote(tablename)),e=>e.code==='42501')
    }finally{apiClient.release()}
    assert.equal(await fingerprint(admin),before)
    assert.deepEqual(f.fileHashes(),filesBefore)
    console.log('W10_PG17_RECONCILIATION_PASS real_tcp=true readonly=true synthetic_only=true cutover=false')
  }finally{
    // Never DROP a database/schema or touch external source directories.
    try{if(api)await api.end()}
    finally{try{if(readonly)await readonly.end()}
      finally{try{await admin.end()}finally{if(f)safeCleanup(f.dir,tempRoot)}}}
  }
})
