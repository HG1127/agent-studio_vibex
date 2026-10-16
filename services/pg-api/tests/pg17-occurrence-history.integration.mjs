// W29: synthetic-only, fresh GitHub-hosted PostgreSQL 17 occurrence archive E2E.
// No production DB access; archived occurrences NEVER become live tasks/leases.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import net from "node:net"
import {createHash,randomBytes,randomUUID} from "node:crypto"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
const refusal="refuse_non_ephemeral_pg17_occurrence"
const reviewTime="2026-10-16T00:00:00Z"
const ids={owner:"aaaaaaaaaaaaaaa",schedule:"bbbbbbbbbbbbbbb",
  run:"ccccccccccccccc",occurrence:"ddddddddddddddd"}
function gate(env=process.env,platform=process.platform){
  const run=env.GITHUB_RUN_ID||""
  const key=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||""
  const prefix="synthetic-agentstudio-pg17-ci-"+run+"-"
  if(platform!=="linux"||env.GITHUB_ACTIONS!=="true"||
     env.RUNNER_ENVIRONMENT!=="github-hosted"||env.RUNNER_OS!=="Linux"||
     env.AGENT_STUDIO_PG17_TEST_ENABLED!=="true"||
     env.AGENT_STUDIO_PG17_W29_OCCURRENCE_TEST_ENABLED!=="true"||
     env.AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED!=="true"||
     env.AGENT_STUDIO_PG17_HOST!=="127.0.0.1"||
     env.AGENT_STUDIO_PG17_PORT!=="5432"||
     env.AGENT_STUDIO_PG17_DATABASE!=="agentstudio_stage"||
     env.AGENT_STUDIO_PG17_ADMIN_USER!=="agentstudio_admin"||
     !/^\d{1,32}$/.test(run)||!key.startsWith(prefix)||
     !/^[a-f0-9]{64}$/.test(key.slice(prefix.length))||
     new Set(key.slice(prefix.length)).size<12||
     !env.RUNNER_TEMP||!path.posix.isAbsolute(env.RUNNER_TEMP)||
     path.posix.normalize(env.RUNNER_TEMP)!==env.RUNNER_TEMP||
     env.RUNNER_TEMP==="/")
    throw Error(refusal)
  return {host:"127.0.0.1",port:5432,
    database:"agentstudio_stage",user:"agentstudio_admin",
    password:key,ssl:false,max:1,connectionTimeoutMillis:4500,
    statement_timeout:26000,idleTimeoutMillis:2000,
    application_name:"synthetic_w29_occurrence_archive"}
}
function valid(){
  return {GITHUB_ACTIONS:"true",GITHUB_RUN_ID:"123456",
    RUNNER_ENVIRONMENT:"github-hosted",RUNNER_OS:"Linux",
    RUNNER_TEMP:"/tmp/w29",
    AGENT_STUDIO_PG17_TEST_ENABLED:"true",
    AGENT_STUDIO_PG17_W29_OCCURRENCE_TEST_ENABLED:"true",
    AGENT_STUDIO_PG17_EPHEMERAL_ISOLATED:"true",
    AGENT_STUDIO_PG17_HOST:"127.0.0.1",AGENT_STUDIO_PG17_PORT:"5432",
    AGENT_STUDIO_PG17_DATABASE:"agentstudio_stage",
    AGENT_STUDIO_PG17_ADMIN_USER:"agentstudio_admin",
    AGENT_STUDIO_PG17_ADMIN_PASSWORD:
      "synthetic-agentstudio-pg17-ci-123456-"+randomBytes(32).toString("hex")}
}
test("fail-closed: rejected environment cannot request any PG connection",()=>{
  const env=valid()
  assert.equal(gate(env,"linux").host,"127.0.0.1")
  for(const key of Object.keys(env)){
    const bad={...env};delete bad[key]
    assert.throws(()=>gate(bad,"linux"),new RegExp(refusal),key)
  }
  for(const target of ["production.internal","localhost","postgres","::1"])
    assert.throws(()=>gate({...env,AGENT_STUDIO_PG17_HOST:target},"linux"),
      new RegExp(refusal))
  for(const platform of ["win32","darwin"])
    assert.throws(()=>gate(env,platform),new RegExp(refusal))
})
test("fail-closed: without proper CI gate, invoking TCP test opens no socket",()=>{
  const source="data:text/javascript,"+encodeURIComponent(
    "import net from 'node:net';net.Socket.prototype.connect=function(){throw Error('W29_FORBIDDEN_CONNECT')}")
  for(const override of [
    {AGENT_STUDIO_PG17_W29_OCCURRENCE_TEST_ENABLED:"false"},
    {AGENT_STUDIO_PG17_HOST:"corporate.invalid"},
    {AGENT_STUDIO_PG17_ADMIN_PASSWORD:"not-synthetic"},
  ]){
    const env={...process.env,...override}
    delete env.NODE_TEST_CONTEXT;delete env.NODE_OPTIONS;delete env.NODE_PATH
    const x=spawnSync(process.execPath,["--import",source,
      "--experimental-strip-types","--test",
      "--test-name-pattern=^PG17 TCP:",fileURLToPath(import.meta.url)],
    {env,encoding:"utf8",timeout:15000})
    assert.equal(x.status,1)
    assert.match(x.stdout+x.stderr,new RegExp(refusal))
    assert.doesNotMatch(x.stdout+x.stderr,
      /W29_FORBIDDEN_CONNECT|ECONNREFUSED|ENOTFOUND/)
  }
})
function temp(){
  const real=fs.realpathSync(process.env.RUNNER_TEMP)
  const origin=fs.realpathSync(root)
  const relation=path.relative(origin,real)
  if(real!==process.env.RUNNER_TEMP||!fs.statSync(real).isDirectory()||
     real===origin||relation===""||
     (!relation.startsWith("..")&&!path.isAbsolute(relation)))
    throw Error("unsafe_runner_temp")
  return real
}
function fixture(DatabaseSync,directory,user,contentHash,attempts=2){
  const dir=fs.mkdtempSync(path.join(directory,"w29-synthetic-"))
  fs.chmodSync(dir,0o700)
  const names=["snapshot","manifest","mapping"]
  const files=Object.fromEntries(names.map(k=>[k,path.join(dir,
    k+(k==="snapshot"?".sqlite":".json"))]))
  const row={
    id:ids.occurrence,schedule_id:ids.schedule,rh_user_id:ids.owner,
    scheduled_for_ms:1792090200123,schedule_revision:1,run_id:ids.run,
    status:"running",attempts,locked_until_ms:1792090270000,
    next_retry_ms:1792090299000,error:"SYNTHETIC_INERT_RETRY",
    created_ms:1792090200200,updated_ms:1792090200300,
  }
  const db=new DatabaseSync(files.snapshot)
  db.exec("PRAGMA journal_mode=DELETE;"+
    "CREATE TABLE studio_users(id TEXT PRIMARY KEY);"+
    "CREATE TABLE agent_studio_schedules(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE agent_runs(id TEXT PRIMARY KEY,rh_user_id TEXT);"+
    "CREATE TABLE agent_studio_schedule_occurrences("+
    "id TEXT PRIMARY KEY,schedule_id TEXT,rh_user_id TEXT,"+
    "scheduled_for_ms INTEGER,schedule_revision INTEGER,run_id TEXT,status TEXT,"+
    "attempts INTEGER,locked_until_ms INTEGER,next_retry_ms INTEGER,error TEXT,"+
    "created_ms INTEGER,updated_ms INTEGER)")
  db.prepare("INSERT INTO studio_users VALUES(?)").run(ids.owner)
  db.prepare("INSERT INTO agent_studio_schedules VALUES(?,?)")
    .run(ids.schedule,ids.owner)
  db.prepare("INSERT INTO agent_runs VALUES(?,?)").run(ids.run,ids.owner)
  db.prepare("INSERT INTO agent_studio_schedule_occurrences VALUES("+
    Object.keys(row).map(()=>"?").join(",")+")").run(...Object.values(row))
  const namesFromDb=db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'"
  ).all().map(x=>x.name)
  const tables=Object.fromEntries(namesFromDb.map(n=>[
    n,Number(db.prepare('SELECT COUNT(*) AS n FROM "'+n+'"').get().n)]))
  db.close()
  const data=fs.readFileSync(files.snapshot),digest=sha(data)
  fs.writeFileSync(files.mapping,JSON.stringify({
    schema_version:"studio-approved-identity-map-v2",
    source_sha256:digest,
    records:[{old_id:ids.owner,new_studio_user_id:user,
      verified_by:"Separate synthetic employee reviewer",
      approved_at:reviewTime}],
  }),{mode:0o400,flag:"wx"})
  fs.writeFileSync(files.manifest,JSON.stringify({
    format:"agent-studio-sqlite-snapshot-v1",
    sha256:digest,bytes:data.length,tables,
    schedule_occurrence_archive_review:{
      source_sha256:digest,identity_mapping_sha256:sha(fs.readFileSync(files.mapping)),
      credentials_absent:true,verified_by:"Independent synthetic occurrence reviewer",
      approved_at:reviewTime,tables:{
        agent_studio_schedule_occurrences:{row_sha256:[contentHash(row)]},
      },
    },
  }),{mode:0o400,flag:"wx"})
  fs.chmodSync(files.snapshot,0o400)
  return {dir,files,digest,row,verify:()=>{
    assert.equal(sha(fs.readFileSync(files.snapshot)),digest)
    for(const [key,f] of Object.entries(files)){
      assert.equal(fs.statSync(f).mode&0o222,0,key)
      assert.equal(fs.existsSync(files.snapshot+"-wal"),false)
    }
  }}
}
const read=file=>fs.readFileSync(path.join(root,file),"utf8")
  .split(/\r?\n/).filter(x=>!x.trim().startsWith("\\")).join("\n")
const adapter=pool=>({async connect(){
  const conn=await pool.connect()
  return {release(){conn.release()},async query(sql,params=[]){
    const result=await conn.query(sql,params)
    return {rows:result.rows}
  }}
}})
const rows=async(pool,t)=>Number((await pool.query(
  'SELECT COUNT(*)::int AS n FROM agentstudio."'+t+'"')).rows[0].n)
test("PG17 TCP: reviewed occurrence archived inert; transactional recovery, RLS and source conflicts",async(t)=>{
  // Isolate FIRST: no pg/SQLite imports, filesystem mutation or PG networking before gate.
  const cfg=gate()
  const folder=temp(),created=[]
  let admin
  try{
    const connect=net.Socket.prototype.connect
    t.mock.method(net.Socket.prototype,"connect",function(...args){
      const first=args[0]
      const host=typeof first==="object"?first.host:args[1]
      const port=typeof first==="object"?first.port:first
      assert.equal(host,"127.0.0.1");assert.equal(Number(port),5432)
      return connect.apply(this,args)
    })
    t.mock.method(globalThis,"fetch",()=>{throw Error("W29_FORBIDDEN_FETCH")})
    const [{default:pg},{DatabaseSync},{
      prepareScheduleOccurrenceHistory,importLegacyScheduleOccurrenceHistoryToStage,
    },{contentHash}]=await Promise.all([
      import("pg"),import("node:sqlite"),
      import("../src/stage-schedule-occurrence-history-import.ts"),
      import("../src/stage-agent-import.ts"),
    ])
    admin=new pg.Pool(cfg)
    const g=(await admin.query("SELECT current_database() AS db,session_user AS login,"+
      "current_user AS role,current_setting('server_version_num')::int AS version,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS privileged")).rows[0]
    assert.ok(g.db==="agentstudio_stage"&&g.login==="agentstudio_admin"&&
      g.role===g.login&&g.version>=170000&&g.version<180000&&g.privileged===true)
    assert.equal((await admin.query("SELECT to_regnamespace('agentstudio') AS namespace"))
      .rows[0].namespace,null,"must be virgin stage DB")
    const sqls=["db/postgres/001_stage_schema.sql",
      "db/postgres/migrations/pg_v8_008_legacy_schedule_import.sql",
      "db/postgres/migrations/pg_v8_011_legacy_user_provision.sql",
      "db/postgres/migrations/pg_v9_018_legacy_schedule_occurrence_history.sql"]
    for(const sql of sqls)await admin.query(read(sql))
    const user=randomUUID(),f=fixture(DatabaseSync,folder,user,contentHash)
    created.push(f.dir);f.verify()
    await admin.query(
      "INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) "+
      "VALUES($1,'https://synthetic.invalid','synthetic','disabled')",[user])
    const sourceSha=f.digest
    await admin.query(
      "INSERT INTO agentstudio.legacy_user_imports "+
      "(source_snapshot_sha256,legacy_user_id,target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) "+
      "VALUES($1,$2,$3,$4,$5,$5)",
      [sourceSha,ids.owner,user,sha(fs.readFileSync(f.files.mapping)),"c".repeat(64)])
    const plan=prepareScheduleOccurrenceHistory(f.files.snapshot,
      f.files.manifest,f.files.mapping)
    // Fault after SQL INSERT MUST roll back the new immutable history record.
    const broken={async connect(){
      const conn=await admin.connect()
      return {release(){conn.release()},async query(sql,params=[]){
        if(sql.startsWith("SELECT * FROM agentstudio.legacy_schedule_occurrence_history"))
          throw Error("PRIVATE_W29_INJECTED_FAILURE")
        const x=await conn.query(sql,params)
        return {rows:x.rows}
      }}
    }}
    await assert.rejects(
      importLegacyScheduleOccurrenceHistoryToStage(broken,plan),
      /occurrence_history_sql_failed/)
    assert.equal(await rows(admin,"legacy_schedule_occurrence_history"),0)
    const first=await importLegacyScheduleOccurrenceHistoryToStage(adapter(admin),plan)
    assert.deepEqual([first.imported,first.replayed,first.reconciled],[1,0,1])
    const saved=(await admin.query(
      "SELECT * FROM agentstudio.legacy_schedule_occurrence_history")).rows[0]
    assert.deepEqual(saved.source_record,f.row)
    assert.equal(saved.payload_sha256,contentHash(f.row))
    assert.equal(saved.owner_user_id,user)
    assert.equal(saved.evidence_status,"historical_unverified")
    assert.equal(saved.execution_enabled,false)
    assert.equal(saved.lease_reactivated,false)
    assert.equal(await rows(admin,"jobs"),0)
    assert.equal(await rows(admin,"runs"),0)
    assert.equal(await rows(admin,"schedule_occurrences"),0)
    assert.equal(await rows(admin,"external_effects"),0)
    const again=await importLegacyScheduleOccurrenceHistoryToStage(adapter(admin),plan)
    assert.deepEqual([again.imported,again.replayed],[0,1])
    const foreign=fixture(DatabaseSync,folder,user,contentHash,3)
    created.push(foreign.dir)
    await assert.rejects(
      importLegacyScheduleOccurrenceHistoryToStage(adapter(admin),
        prepareScheduleOccurrenceHistory(foreign.files.snapshot,
          foreign.files.manifest,foreign.files.mapping)),
      /occurrence_history_source_or_review_conflict/)
    assert.equal(await rows(admin,"legacy_schedule_occurrence_history"),1)
    await admin.query("SET ROLE agentstudio_api")
    try{
      await assert.rejects(admin.query(
        "SELECT * FROM agentstudio.legacy_schedule_occurrence_history"),
        /permission denied/)
    }finally{await admin.query("RESET ROLE")}
    await admin.query(
      "GRANT SELECT ON agentstudio.legacy_schedule_occurrence_history TO agentstudio_api")
    await admin.query("SET ROLE agentstudio_api")
    try{
      assert.equal((await admin.query(
        "SELECT * FROM agentstudio.legacy_schedule_occurrence_history")).rows.length,0)
    }finally{await admin.query("RESET ROLE")}
    f.verify()
    console.log("W29_PG17_OCCURRENCE_ARCHIVE_PASS real_tcp=true "+
      "source_sha_verified=true zero_live_jobs=true synthetic_only=true cutover=NO-GO")
  }finally{
    if(admin)await admin.end()
    for(const dir of created){
      if(path.dirname(dir)===folder&&path.basename(dir).startsWith("w29-synthetic-"))
        fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100})
    }
  }
})
