import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {loadKbEmbeddingStateSnapshot,importKbEmbeddingStateArchive,sha256} from '../src/stage-kb-embedding-state-import.ts'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const archiveTables=['legacy_kb_embedding_snapshots','legacy_kb_embedding_base_refs','legacy_kb_embedding_state_archive']
const source={settings:'agent_studio_kb_embedding_settings',queue:'agent_studio_kb_embedding_queue'}
const sql=f=>fs.readFileSync(path.join(root,f),'utf8').split(/\r?\n/).filter(s=>!s.trim().startsWith('\\')).join('\n')
const migration=sql('db/postgres/migrations/pg_v8_013_legacy_kb_embedding_state.sql')
const inert="历史错误 中文😀\n\t'; DROP TABLE agentstudio.jobs; -- <script>throw Error('execute')</script>  "
function fixture(change=()=>{}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w16-synthetic-'))
  const snapshot=path.join(dir,'snapshot.db'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'mapping.json')
  const db=new DatabaseSync(snapshot)
  db.exec(`CREATE TABLE studio_users(id TEXT PRIMARY KEY); INSERT INTO studio_users VALUES('staffA'),('staffB');
    CREATE TABLE agent_studio_kb_bases(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT);
    INSERT INTO agent_studio_kb_bases VALUES('baseA','staffA','synthetic'),('baseB','staffB','synthetic');
    CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT,base_url TEXT);
    INSERT INTO model_connections VALUES('connA','staffA','SYNTHETIC_SECRET_SENTINEL','https://never-read.invalid');
    CREATE TABLE agent_studio_kb_embedding_settings(rh_user_id TEXT PRIMARY KEY,connection_id TEXT NOT NULL,model_name TEXT NOT NULL,updated_ms INTEGER NOT NULL);
    CREATE TABLE agent_studio_kb_embedding_queue(rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER,PRIMARY KEY(rh_user_id,base_id));
    INSERT INTO agent_studio_kb_embedding_settings VALUES('staffA','connA','旧模型 / model-1  ',1792030400123);`)
  db.prepare('INSERT INTO agent_studio_kb_embedding_queue VALUES(?,?,?,?,?,?,?)').run('staffA','baseA',7,1792030400456,1792030499999,inert,1792030400789)
  change(db)
  const tables=Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({name})=>[name,db.prepare('SELECT count(*) AS n FROM '+name).get().n]))
  db.close()
  const bytes=fs.readFileSync(snapshot),hash=sha256(bytes)
  fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:hash,bytes:bytes.length,tables}))
  fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:hash,records:[
    {old_id:'staffA',new_studio_user_id:owner,verified_by:'synthetic-reviewer',approved_at:'2026-10-15T00:00:00Z'},
    {old_id:'staffB',new_studio_user_id:other,verified_by:'synthetic-reviewer',approved_at:'2026-10-15T00:00:00Z'},
  ]}))
  // Cleanup is limited to the exact mkdtemp directory created by this fixture.
  return {snapshot,manifest,mapping,hash,close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
async function bootstrap(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(sql('db/postgres/001_stage_schema.sql'))
  await pg.exec('CREATE ROLE agentstudio_admin SUPERUSER LOGIN; SET SESSION AUTHORIZATION agentstudio_admin')
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject) VALUES($1,'synthetic','a'),($2,'synthetic','b')",[owner,other])
  // ONLY this WASM test substitutes PG18/database probes. Production remains PG17.
  const adapted=migration.replace("current_database()<>'agentstudio_stage'","current_database()<>'postgres'").replace('NOT BETWEEN 170000 AND 179999','NOT BETWEEN 180000 AND 189999')
  await pg.exec(adapted);await pg.exec(adapted)
  return pg
}
function pool(pg,{guard={},active=false,version=false,failQueue=false,corrupt=false,commit=false,trace=[]}={}){
  return {async connect(){return {release(){},async query(s,v=[]){
    trace.push(s)
    if(s.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',role:'agentstudio_admin',admin:true,version:170005,...guard}]}
    if(active&&s.includes("status IN ('queued','leased')"))return {rows:[{n:'1'}]}
    if(version&&s.includes('FROM agentstudio.schema_migrations'))return {rows:[{n:'1'}]}
    if(failQueue&&s.startsWith('INSERT INTO agentstudio.legacy_kb_embedding_state_archive')&&v[1]===source.queue){
      assert.equal((await pg.query('SELECT count(*)::int AS n FROM agentstudio.legacy_kb_embedding_state_archive')).rows[0].n,1)
      return pg.query('SELECT 1/0')
    }
    if(commit&&s==='COMMIT')throw Error('SYNTHETIC_PRIVATE_DIAGNOSTIC')
    const r=await pg.query(s,v)
    if(corrupt&&s.startsWith('SELECT * FROM agentstudio.legacy_kb_embedding_state_archive'))r.rows[0].raw_payload='{}'
    return r
  }}}}
}
async function empty(pg){for(const t of archiveTables)assert.equal((await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n,0)}
async function fingerprint(pg){return JSON.stringify(await Promise.all(archiveTables.map(t=>pg.query('SELECT * FROM agentstudio.'+t+' ORDER BY 1,2'))))}

test('SQLite readonly + lossless settings/queue archive, history TEXT, replay, no credentials or execution',async()=>{
  const f=fixture(),pg=await bootstrap()
  const originals=[fs.readFileSync(f.snapshot),fs.readFileSync(f.manifest),fs.readFileSync(f.mapping)]
  const originalsNet=[globalThis.fetch,net.Socket.prototype.connect,http.request,https.request]
  const trap=()=>{throw Error('NETWORK_FORBIDDEN')}
  globalThis.fetch=net.Socket.prototype.connect=http.request=https.request=trap
  try{
    const batch=loadKbEmbeddingStateSnapshot(f)
    assert.ok(Object.isFrozen(batch)&&Object.isFrozen(batch.rows)&&Object.isFrozen(batch.rows[0]))
    assert.equal(JSON.stringify(batch).includes('SYNTHETIC_SECRET'),false)
    assert.equal(JSON.stringify(batch).includes('never-read.invalid'),false)
    assert.deepEqual(batch.rows.map(r=>r.id),['["staffA"]','["staffA","baseA"]'])
    assert.equal((await importKbEmbeddingStateArchive(pool(pg),batch)).imported,2)
    const rows=(await pg.query('SELECT * FROM agentstudio.legacy_kb_embedding_state_archive ORDER BY source_table DESC')).rows
    for(let i=0;i<2;i++){
      assert.equal(rows[i].raw_payload,batch.rows[i].raw)
      assert.equal(rows[i].payload_sha256,sha256(batch.rows[i].raw))
      assert.equal(rows[i].source_snapshot_sha256,f.hash)
      assert.equal(rows[i].owner_user_id,owner)
    }
    assert.deepEqual(JSON.parse(rows[0].raw_payload),{rh_user_id:'staffA',connection_id:'connA',model_name:'旧模型 / model-1  ',updated_ms:1792030400123})
    assert.equal(JSON.parse(rows[1].raw_payload).last_error,inert)
    assert.deepEqual([rows[1].historical_attempts,rows[1].historical_next_attempt_ms,rows[1].historical_lease_until_ms],['7','1792030400456','1792030499999'])
    const before=await fingerprint(pg)
    const report=await importKbEmbeddingStateArchive(pool(pg),loadKbEmbeddingStateSnapshot(f))
    assert.deepEqual(report,{stage_only:true,archive_only:true,embedding_enabled:false,jobs_created:0,production_cutover_allowed:false,imported:0,replayed:2})
    assert.equal(await fingerprint(pg),before)
    for(const t of ['jobs','runs','knowledge_bases','knowledge_documents','knowledge_chunks','schedules'])assert.equal((await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n,0)
    for(const [i,p] of [f.snapshot,f.manifest,f.mapping].entries())assert.deepEqual(fs.readFileSync(p),originals[i])
  }finally{
    [globalThis.fetch,net.Socket.prototype.connect,http.request,https.request]=originalsNet
    await pg.close();f.close()
  }
})

test('offline fail-closed: references, cross owner, unsupported/hidden columns, unsafe text, numbers',()=>{
  for(const change of [
    d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET base_id='missing'"),
    d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET base_id='baseB'"),
    d=>d.exec("UPDATE agent_studio_kb_embedding_settings SET connection_id='missing'"),
    d=>d.exec("UPDATE model_connections SET rh_user_id='staffB'"),
    d=>d.exec("UPDATE agent_studio_kb_embedding_settings SET rh_user_id='missing'"),
    d=>d.exec('ALTER TABLE agent_studio_kb_embedding_settings ADD COLUMN api_key TEXT'),
    d=>d.exec('ALTER TABLE agent_studio_kb_embedding_queue ADD COLUMN hidden TEXT GENERATED ALWAYS AS (base_id) VIRTUAL'),
    d=>d.exec("UPDATE agent_studio_kb_embedding_settings SET model_name='https://secret.invalid'"),
    d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET last_error='api_key=secret'"),
    d=>d.exec('UPDATE agent_studio_kb_embedding_queue SET attempts=-1'),
    d=>d.exec('UPDATE agent_studio_kb_embedding_queue SET next_attempt_ms=0.5'),
    d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET lease_until_ms='not-a-number'"),
    d=>d.exec('UPDATE agent_studio_kb_embedding_queue SET lease_until_ms=9007199254740992'),
    d=>d.prepare('UPDATE agent_studio_kb_embedding_queue SET last_error=?').run('bad\0text'),
  ]){
    const f=fixture(change)
    try{assert.throws(()=>loadKbEmbeddingStateSnapshot(f),/^Error: kb_embedding_archive_[a-z_]+$/,String(change))}finally{f.close()}
  }
})

test('offline fail-closed: strict SHA, complete manifest, approved mapping, missing owner, sidecars',()=>{
  for(const change of [
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));m.sha256='0'.repeat(64);fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));delete m.tables.model_connections;fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));m.tables[source.queue]=0;fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.source_sha256='0'.repeat(64);fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records.pop();fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records[0].verified_by='';fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records[1].new_studio_user_id=owner;fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records[0].new_studio_user_id='not-uuid';fs.writeFileSync(f.mapping,JSON.stringify(m))},
    ...['-wal','-shm','-journal'].map(suffix=>f=>fs.writeFileSync(f.snapshot+suffix,'synthetic')),
  ]){
    const f=fixture()
    try{change(f);assert.throws(()=>loadKbEmbeddingStateSnapshot(f),/kb_embedding_archive_/)}finally{f.close()}
  }
})

test('transaction rollback after settings INSERT, reconciliation/commit faults; retry and foreign source rejection',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    const batch=loadKbEmbeddingStateSnapshot(f)
    for(const fault of [{failQueue:true},{corrupt:true},{commit:true}]){
      const trace=[]
      await assert.rejects(importKbEmbeddingStateArchive(pool(pg,{...fault,trace}),batch),/kb_embedding_archive_(sql_failed|reconciliation_payload)/)
      assert.equal(trace.at(-1),'ROLLBACK');await empty(pg)
    }
    await importKbEmbeddingStateArchive(pool(pg),batch)
    const before=await fingerprint(pg),different=fixture(d=>d.exec('UPDATE agent_studio_kb_embedding_queue SET attempts=8'))
    try{await assert.rejects(importKbEmbeddingStateArchive(pool(pg),loadKbEmbeddingStateSnapshot(different)),/source_or_payload_conflict/)}finally{different.close()}
    const m=JSON.parse(fs.readFileSync(f.mapping));m.records[0].verified_by='different-reviewer';fs.writeFileSync(f.mapping,JSON.stringify(m))
    await assert.rejects(importKbEmbeddingStateArchive(pool(pg),loadKbEmbeddingStateSnapshot(f)),/source_or_payload_conflict/)
    assert.equal(await fingerprint(pg),before)
  }finally{await pg.close();f.close()}
})

test('PG17 stage/admin, schema, active jobs, missing PG owner guards and unforgeable batch',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    const batch=loadKbEmbeddingStateSnapshot(f),trace=[]
    for(const b of [{...batch},JSON.parse(JSON.stringify(batch))])await assert.rejects(importKbEmbeddingStateArchive(pool(pg,{trace}),b),/verified_offline_batch_required/)
    assert.deepEqual(trace,[])
    for(const guard of [{database:'production'},{login:'postgres'},{role:'agentstudio_api'},{admin:false},{version:160000},{version:180000},{version:NaN}])
      await assert.rejects(importKbEmbeddingStateArchive(pool(pg,{guard}),batch),/pg17_stage_dba_required/)
    await assert.rejects(importKbEmbeddingStateArchive(pool(pg,{active:true}),batch),/active_jobs/)
    await assert.rejects(importKbEmbeddingStateArchive(pool(pg,{version:true}),batch),/schema_version/)
    await pg.query('DELETE FROM agentstudio.users WHERE id=$1',[other])
    await assert.rejects(importKbEmbeddingStateArchive(pool(pg),batch),/owner_not_preprovisioned/)
    await empty(pg)
  }finally{await pg.close();f.close()}
})

test('DBA immutable archive; API/worker denied all privileges even source owner; FORCE RLS isolates accidental grants',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    await importKbEmbeddingStateArchive(pool(pg),loadKbEmbeddingStateSnapshot(f))
    for(const t of archiveTables){
      assert.deepEqual((await pg.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['agentstudio.'+t])).rows[0],{relrowsecurity:true,relforcerowsecurity:true})
      for(const s of ['UPDATE agentstudio.'+t+' SET source_snapshot_sha256=source_snapshot_sha256','DELETE FROM agentstudio.'+t,'TRUNCATE agentstudio.'+t+' CASCADE'])await assert.rejects(pg.exec(s),/immutable_embedding_archive/)
      for(const role of ['agentstudio_api','agentstudio_worker'])for(const actor of [owner,other]){
        assert.equal((await pg.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS granted",[role,'agentstudio.'+t])).rows[0].granted,false)
        for(const s of ['SELECT * FROM ','UPDATE ','DELETE FROM ','TRUNCATE ']){
          await pg.exec('BEGIN; SET LOCAL ROLE '+role)
          try{
            await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor])
            await assert.rejects(pg.query(s+'agentstudio.'+t+(s==='UPDATE '?' SET source_snapshot_sha256=source_snapshot_sha256':'')),/permission denied/)
          }finally{await pg.exec('ROLLBACK')}
        }
      }
      await pg.exec('GRANT SELECT ON agentstudio.'+t+' TO agentstudio_api')
      for(const actor of [owner,other]){
        await pg.exec('BEGIN; SET LOCAL ROLE agentstudio_api')
        try{
          await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor])
          assert.equal((await pg.query('SELECT * FROM agentstudio.'+t)).rows.length,0)
        }finally{await pg.exec('ROLLBACK')}
      }
    }
  }finally{await pg.close();f.close()}
})

test('SQL constraints independently reject wrong hash/source table/key, extra secret columns, cross owner and missing base',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    const batch=loadKbEmbeddingStateSnapshot(f)
    await importKbEmbeddingStateArchive(pool(pg),batch)
    const queue=batch.rows[1]
    const defaults=[batch.snapshot,source.queue,'["staffA","baseA"]','staffA',owner,'baseA',queue.raw,queue.hash]
    const insert='INSERT INTO agentstudio.legacy_kb_embedding_state_archive(source_snapshot_sha256,source_table,legacy_row_id,legacy_owner_id,owner_user_id,legacy_base_id,raw_payload,payload_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)'
    for(const [change,reason] of [
      [v=>{v[7]='0'.repeat(64)},/embedding_archive_payload/],
      [v=>{v[1]='runtime_jobs'},/check constraint/],
      [v=>{v[2]='[]'},/embedding_archive_source_key/],
      [v=>{v[4]=other},/embedding_archive_owner_mapping/],
      [v=>{const r=JSON.parse(queue.raw);r.base_id='missing';v[2]='["staffA","missing"]';v[5]='missing';v[6]=JSON.stringify(r);v[7]=sha256(v[6])},/foreign key constraint/],
      [v=>{const r={...JSON.parse(queue.raw),api_key:'synthetic'};v[6]=JSON.stringify(r);v[7]=sha256(v[6])},/embedding_archive_columns/],
    ]){
      const values=[...defaults];change(values)
      await assert.rejects(pg.query(insert,values),reason)
    }
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM agentstudio.legacy_kb_embedding_state_archive')).rows[0].n,2)
  }finally{await pg.close();f.close()}
})

test('direct script execution blocked; production SQL retains exact PG17/database/DBA guards',()=>{
  const r=spawnSync(process.execPath,['--experimental-strip-types',path.join(root,'services/pg-api/src/stage-kb-embedding-state-import.ts'),'--apply'],{encoding:'utf8',timeout:15000,env:{...process.env,DATABASE_URL:'postgres://never-connect.invalid/live'}})
  assert.equal(r.status,1);assert.match(r.stderr,/kb_embedding_archive_no_cli_execution/);assert.equal(r.stdout,'')
  assert.match(migration,/current_database\(\)<>'agentstudio_stage'/)
  assert.match(migration,/NOT BETWEEN 170000 AND 179999/)
  assert.match(migration,/current_user<>'agentstudio_admin'/)
})

test('migration itself rejects unmodified non-PG17/non-stage target and active jobs',async()=>{
  const pg=await bootstrap()
  try{
    await assert.rejects(pg.exec(migration),/embedding_archive_pg17_stage_dba_required/)
    await pg.exec('ROLLBACK')
    // Adapt only the test version/database guard, leaving active-job guard intact.
    const adapted=migration.replace("current_database()<>'agentstudio_stage'","current_database()<>'postgres'").replace('NOT BETWEEN 170000 AND 179999','NOT BETWEEN 180000 AND 189999')
    // A synthetic queued row only in this disposable WASM instance; no worker.
    await pg.query("INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key) VALUES($1,'knowledge_ingest','w16-synthetic-active-guard')",[owner])
    await assert.rejects(pg.exec(adapted),/embedding_archive_active_jobs/)
    await pg.exec('ROLLBACK')
  }finally{await pg.close()}
})
