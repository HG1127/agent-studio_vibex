import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {loadKbContentSnapshot,importKbContentArchive} from '../src/stage-kb-content-import.ts'
import {sha,fields} from '../src/stage-kb-content-import-source.ts'
import {normalizeLegacyKb,importLegacyKbsToStage} from '../src/stage-knowledge-base-import.ts'
import {importKbSnapshotAtomic} from '../src/stage-kb-atomic-import.ts'
import {loadKbCombinedSnapshot,importKbCombinedAtomic} from '../src/stage-kb-combined-import.ts'
import {loadKbEmbeddingStateSnapshot} from '../src/stage-kb-embedding-state-import.ts'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const sql=file=>fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const vectorText='[ 1.000, -0.0, 2e-3 ]'
function fixture(change=()=>{}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w18-synthetic-'))
  const snapshot=path.join(dir,'snapshot.db'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'mapping.json')
  const db=new DatabaseSync(snapshot)
  db.exec(`CREATE TABLE studio_users(id TEXT PRIMARY KEY);
    INSERT INTO studio_users VALUES('employee0000001'),('employee0000002');
    CREATE TABLE agent_studio_kb_bases(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,description TEXT,created_ms INTEGER,updated_ms INTEGER);
    INSERT INTO agent_studio_kb_bases VALUES('baseA','employee0000001','Synthetic KB','',1792030400000,1792030400000);
    CREATE TABLE model_connections(id TEXT PRIMARY KEY,rh_user_id TEXT,api_key TEXT);
    INSERT INTO model_connections VALUES('connection00001','employee0000001','SYNTHETIC_SECRET_MUST_NOT_APPEAR');`)
  for(const [kind,cols] of Object.entries(fields)){
    const table='agent_studio_kb_'+({document:'documents',chunk:'chunks',vector:'vectors'})[kind]
    const numeric=new Set(['size_chars','chunk_count','created_ms','chunk_index','dimensions','indexed_ms'])
    db.exec('CREATE TABLE '+table+'('+cols.map(c=>c+' '+(numeric.has(c)?'INTEGER':'TEXT')+(c===cols[0]?' PRIMARY KEY':'')).join(',')+')')
  }
  db.prepare('INSERT INTO agent_studio_kb_documents VALUES(?,?,?,?,?,?,?)').run('docA','baseA','employee0000001','源文档.txt',12,1,1792030400123)
  db.prepare('INSERT INTO agent_studio_kb_chunks VALUES(?,?,?,?,?,?)').run('chunkA','baseA','docA','employee0000001',0,'原文\n[1, 2]  ')
  db.prepare('INSERT INTO agent_studio_kb_vectors VALUES(?,?,?,?,?,?,?,?,?)').run('chunkA','employee0000001','baseA','docA','connection00001','legacy-model',3,vectorText,1792030400456)
  db.exec(`INSERT INTO agent_studio_kb_bases VALUES('baseB','employee0000002','Empty base','',1792030400000,1792030400000);
    CREATE TABLE agent_studio_kb_embedding_settings(rh_user_id TEXT PRIMARY KEY,connection_id TEXT,model_name TEXT,updated_ms INTEGER);
    INSERT INTO agent_studio_kb_embedding_settings VALUES('employee0000001','connection00001','旧模型  ',1792030400123);
    CREATE TABLE agent_studio_kb_embedding_queue(rh_user_id TEXT,base_id TEXT,attempts INTEGER,next_attempt_ms INTEGER,lease_until_ms INTEGER,last_error TEXT,updated_ms INTEGER,PRIMARY KEY(rh_user_id,base_id));
    INSERT INTO agent_studio_kb_embedding_queue VALUES('employee0000001','baseA',7,1792030400456,1792030499999,'历史错误 中文😀',1792030400789);`)
  change(db)
  const counts=Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({name})=>[name,db.prepare('SELECT count(*) AS n FROM '+name).get().n]))
  db.close()
  const bytes=fs.readFileSync(snapshot),hash=sha(bytes)
  fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:hash,bytes:bytes.length,tables:counts}))
  fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:hash,records:[
    {old_id:'employee0000001',new_studio_user_id:owner,verified_by:'synthetic-reviewer',approved_at:'2026-10-15T00:00:00Z'},
    {old_id:'employee0000002',new_studio_user_id:other,verified_by:'synthetic-reviewer',approved_at:'2026-10-15T00:00:00Z'},
  ]}))
  return {snapshot,manifest,mapping,hash,close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}

const domains=['knowledge_bases','legacy_knowledge_base_imports','legacy_kb_content_snapshots',
  'legacy_kb_document_archive','legacy_kb_chunk_archive','legacy_kb_vector_archive',
  'legacy_kb_embedding_snapshots','legacy_kb_embedding_base_refs','legacy_kb_embedding_state_archive']
async function bootstrap(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(sql('db/postgres/001_stage_schema.sql'))
  await pg.exec(sql('db/postgres/migrations/pg_v8_007_legacy_kb_import.sql').replace("current_database()<>'agentstudio_stage'","current_database()<>'postgres'"))
  await pg.exec('CREATE ROLE agentstudio_admin SUPERUSER LOGIN; SET SESSION AUTHORIZATION agentstudio_admin')
  for(const name of ['pg_v8_010_legacy_kb_content.sql','pg_v8_013_legacy_kb_embedding_state.sql']){
    // Test-only PG18/WASM adaptation; production files and guards stay PG17.
    await pg.exec(sql('db/postgres/migrations/'+name)
      .replace("current_database()<>'agentstudio_stage'","current_database()<>'postgres'")
      .replace('NOT BETWEEN 170000 AND 179999','NOT BETWEEN 180000 AND 189999'))
  }
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject) VALUES($1,'synthetic','a'),($2,'synthetic','b')",[owner,other])
  return pg
}
function pool(pg,{trace=[],guard={},fault='',release=()=>{}}={}){
  return {async connect(){return {release,async query(s,v=[]){
    trace.push(s)
    if(s.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',role:'agentstudio_admin',admin:true,version:170005,...guard}]}
    if(fault==='metadata'&&s.startsWith('INSERT INTO agentstudio.knowledge_bases')&&v[0]===other)return pg.query('SELECT 1/0')
    if(fault==='content'&&s.startsWith('INSERT INTO agentstudio.legacy_kb_chunk_archive'))return pg.query('SELECT 1/0')
    if(fault==='queue'&&s.startsWith('INSERT INTO agentstudio.legacy_kb_embedding_state_archive')&&v[1].endsWith('queue')){
      // A real SQL error AFTER W2, W6 and settings writes, not a fake rollback.
      assert.deepEqual(await counts(pg),[2,2,1,1,1,1,1,2,1])
      return pg.query('SELECT 1/0')
    }
    if(fault==='commit'&&s==='COMMIT')throw Error('PRIVATE_SQL_DIAGNOSTIC')
    if(fault==='rollback'&&s==='ROLLBACK')throw Error('PRIVATE_ROLLBACK_DIAGNOSTIC')
    const r=await pg.query(s,v)
    if(fault==='read'&&s.startsWith('SELECT * FROM agentstudio.legacy_kb_embedding_state_archive'))r.rows[0].raw_payload='{}'
    return r
  }}}}
}
async function counts(pg){
  const result=[]
  for(const t of domains)result.push((await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n)
  return result
}
async function inert(pg){
  for(const t of ['jobs','runs','schedules','knowledge_documents','knowledge_chunks'])
    assert.equal((await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n,0)
}
async function fingerprint(pg){
  const result=[]
  for(const t of domains)result.push((await pg.query('SELECT * FROM agentstudio.'+t+' ORDER BY 1')).rows)
  return JSON.stringify(result)
}

test('one transaction imports 2 bases + doc/chunk/vector + settings/queue; lossless hashes, replay, inert runtime',async()=>{
  const f=fixture(),pg=await bootstrap(),trace=[]
  const originals=[f.snapshot,f.manifest,f.mapping].map(p=>fs.readFileSync(p))
  const network=[globalThis.fetch,net.Socket.prototype.connect,http.request,https.request]
  const trap=()=>{throw Error('NETWORK_FORBIDDEN')}
  globalThis.fetch=net.Socket.prototype.connect=http.request=https.request=trap
  try{
    const batch=loadKbCombinedSnapshot(f)
    assert.ok(Object.isFrozen(batch))
    assert.deepEqual(Object.keys(batch),['snapshot'])
    const r=await importKbCombinedAtomic(pool(pg,{trace}),batch)
    assert.deepEqual([r.metadata.imported,r.content.imported,r.embedding.imported],[2,3,2])
    assert.deepEqual(await counts(pg),[2,2,1,1,1,1,1,2,2])
    assert.deepEqual(trace.filter(s=>['BEGIN','COMMIT','ROLLBACK'].includes(s)),['BEGIN','COMMIT'])
    for(const t of ['legacy_kb_document_archive','legacy_kb_chunk_archive','legacy_kb_vector_archive','legacy_kb_embedding_state_archive']){
      for(const row of (await pg.query('SELECT * FROM agentstudio.'+t)).rows){
        assert.equal(row.payload_sha256,sha(row.raw_payload));assert.equal(row.source_snapshot_sha256,f.hash)
        assert.equal(row.owner_user_id,owner)
      }
    }
    const historical=(await pg.query("SELECT * FROM agentstudio.legacy_kb_embedding_state_archive WHERE source_table LIKE '%queue'")).rows[0]
    assert.deepEqual([historical.historical_attempts,historical.historical_next_attempt_ms,historical.historical_lease_until_ms],['7','1792030400456','1792030499999'])
    const before=await fingerprint(pg),again=await importKbCombinedAtomic(pool(pg),loadKbCombinedSnapshot(f))
    assert.deepEqual([again.metadata.imported,again.content.imported,again.embedding.imported],[0,0,0])
    assert.deepEqual([again.metadata.replayed,again.content.replayed,again.embedding.replayed],[2,3,2])
    assert.equal(await fingerprint(pg),before);await inert(pg)
    assert.equal(before.includes('SYNTHETIC_SECRET'),false)
    for(const [i,p] of [f.snapshot,f.manifest,f.mapping].entries())assert.deepEqual(fs.readFileSync(p),originals[i])
  }finally{
    [globalThis.fetch,net.Socket.prototype.connect,http.request,https.request]=network
    await pg.close();f.close()
  }
})

test('last W16 INSERT real SQL failure, readback and commit failures roll back ALL domains; retry succeeds',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    const batch=loadKbCombinedSnapshot(f)
    for(const fault of ['metadata','content','queue','read','commit']){
      const trace=[];let released=0
      await assert.rejects(importKbCombinedAtomic(pool(pg,{fault,trace,release:()=>released++}),batch),/^Error: kb_combined_import_failed$/)
      assert.deepEqual(trace.filter(s=>['BEGIN','COMMIT','ROLLBACK'].includes(s)),fault==='commit'?['BEGIN','COMMIT','ROLLBACK']:['BEGIN','ROLLBACK'])
      assert.equal(released,1);assert.deepEqual(await counts(pg),domains.map(()=>0));await inert(pg)
    }
    await importKbCombinedAtomic(pool(pg),batch)
    assert.deepEqual(await counts(pg),[2,2,1,1,1,1,1,2,2])
  }finally{await pg.close();f.close()}
})

test('ordinary W2/W6 stay closed; forged, copied and different-SHA embedding capabilities rejected',async()=>{
  const f=fixture(),different=fixture(d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET attempts=8"))
  const noConnect={connect(){throw Error('MUST_NOT_CONNECT')}}
  try{
    assert.throws(()=>loadKbContentSnapshot(f),/unsupported_acl_or_embedding_state/)
    const token=loadKbEmbeddingStateSnapshot(f)
    for(const fake of [{...token},JSON.parse(JSON.stringify(token)),true])assert.throws(()=>loadKbContentSnapshot(f,fake),/same_verified_snapshot_required/)
    assert.throws(()=>loadKbContentSnapshot(different,token),/same_verified_snapshot_required/)
    const m=JSON.parse(fs.readFileSync(f.mapping))
    m.records[0].verified_by='another-approved-reviewer'
    fs.writeFileSync(f.mapping,JSON.stringify(m))
    assert.throws(()=>loadKbContentSnapshot(f,token),/same_verified_snapshot_required/)
    m.records[0].verified_by='synthetic-reviewer'
    fs.writeFileSync(f.mapping,JSON.stringify(m))
    const content=loadKbContentSnapshot(f,token)
    await assert.rejects(importKbSnapshotAtomic(noConnect,content),/combined_import_required/)
    // Even removing explicit markers cannot turn known W18 bases into W2 rows.
    await assert.rejects(importLegacyKbsToStage(noConnect,f.hash,content.bases.map(({has_related_data,...r})=>r)),/documents_vectors_or_acl_not_migrated/)
    const batch=loadKbCombinedSnapshot(f)
    for(const fake of [{...batch},JSON.parse(JSON.stringify(batch))])await assert.rejects(importKbCombinedAtomic(noConnect,fake),/verified_offline_batch_required/)
  }finally{f.close();different.close()}
})

test('ACL, wrong owner, unknown relation/field, generated columns, invalid manifest/mapping remain closed',()=>{
  for(const change of [
    d=>d.exec('CREATE TABLE agent_studio_kb_access(id TEXT); INSERT INTO agent_studio_kb_access VALUES(\'acl\')'),
    d=>d.exec('CREATE TABLE agent_studio_kb_access_events(id TEXT); INSERT INTO agent_studio_kb_access_events VALUES(\'audit\')'),
    d=>d.exec("UPDATE agent_studio_kb_embedding_queue SET base_id='baseB'"),
    d=>d.exec("UPDATE agent_studio_kb_chunks SET rh_user_id='employee0000002'"),
    d=>d.exec("UPDATE model_connections SET rh_user_id='employee0000002'"),
    d=>d.exec('CREATE TABLE agent_studio_kb_unknown(id TEXT)'),
    d=>d.exec('ALTER TABLE agent_studio_kb_bases ADD COLUMN unknown TEXT'),
    d=>d.exec('ALTER TABLE agent_studio_kb_chunks ADD COLUMN hidden TEXT GENERATED ALWAYS AS (id) VIRTUAL'),
    d=>d.exec('ALTER TABLE agent_studio_kb_embedding_queue ADD COLUMN unknown TEXT'),
    d=>d.prepare('UPDATE agent_studio_kb_chunks SET text_content=?').run('prefix\0lost'),
    d=>d.prepare('UPDATE agent_studio_kb_bases SET description=?').run('prefix\0lost'),
  ]){
    const f=fixture(change)
    try{assert.throws(()=>loadKbCombinedSnapshot(f),/^Error: kb_combined_source_invalid$/)}finally{f.close()}
  }
  for(const change of [
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));m.sha256='0'.repeat(64);fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));delete m.tables.model_connections;fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records.pop();fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records[0].new_studio_user_id='invalid';fs.writeFileSync(f.mapping,JSON.stringify(m))},
    ...['-wal','-shm','-journal'].map(suffix=>f=>fs.writeFileSync(f.snapshot+suffix,'synthetic')),
  ]){
    const f=fixture()
    try{change(f);assert.throws(()=>loadKbCombinedSnapshot(f),/source_invalid/)}finally{f.close()}
  }
})

test('PG17 DBA guard, real active job, missing owner, partial state; rollback failure reported',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    const batch=loadKbCombinedSnapshot(f)
    for(const guard of [{database:'production'},{login:'postgres'},{role:'agentstudio_api'},{admin:false},{version:160000},{version:180000},{version:NaN}])
      await assert.rejects(importKbCombinedAtomic(pool(pg,{guard}),batch),/import_failed/)
    await assert.rejects(importKbCombinedAtomic(pool(pg,{guard:{admin:false},fault:'rollback'}),batch),/rollback_failed/)
    await pg.exec('ROLLBACK') // Test-only cleanup of intentionally failed rollback.
    await pg.query("INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key) VALUES($1,'knowledge_ingest','synthetic-active')",[owner])
    await assert.rejects(importKbCombinedAtomic(pool(pg),batch),/import_failed/)
    assert.deepEqual(await counts(pg),domains.map(()=>0))
    await pg.exec('DELETE FROM agentstudio.jobs')
    await pg.query('DELETE FROM agentstudio.users WHERE id=$1',[other])
    await assert.rejects(importKbCombinedAtomic(pool(pg),batch),/import_failed/)
    await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject) VALUES($1,'synthetic','b')",[other])
    const target=(await pg.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,'partial') RETURNING id",[owner])).rows[0].id
    await pg.query('INSERT INTO agentstudio.legacy_knowledge_base_imports(source_snapshot_sha256,legacy_base_id,owner_user_id,target_base_id,payload_sha256) VALUES($1,$2,$3,$4,$5)',[f.hash,'partial',owner,target,'0'.repeat(64)])
    const before=await fingerprint(pg)
    await assert.rejects(importKbCombinedAtomic(pool(pg),batch),/import_failed/)
    assert.equal(await fingerprint(pg),before)
  }finally{await pg.close();f.close()}
})

test('different snapshot or reviewed mapping rejected across all domains; persisted fingerprint unchanged',async()=>{
  const f=fixture(),different=fixture(d=>d.exec('UPDATE agent_studio_kb_embedding_queue SET attempts=8')),pg=await bootstrap()
  try{
    await importKbCombinedAtomic(pool(pg),loadKbCombinedSnapshot(f))
    const before=await fingerprint(pg)
    await assert.rejects(importKbCombinedAtomic(pool(pg),loadKbCombinedSnapshot(different)),/import_failed/)
    const m=JSON.parse(fs.readFileSync(f.mapping));m.records[0].verified_by='new-reviewer';fs.writeFileSync(f.mapping,JSON.stringify(m))
    await assert.rejects(importKbCombinedAtomic(pool(pg),loadKbCombinedSnapshot(f)),/import_failed/)
    assert.equal(await fingerprint(pg),before)
  }finally{await pg.close();f.close();different.close()}
})

test('owner RLS on metadata and archive isolation for API/worker, even accidental archive SELECT grant',async()=>{
  const f=fixture(),pg=await bootstrap()
  try{
    await importKbCombinedAtomic(pool(pg),loadKbCombinedSnapshot(f))
    for(const t of domains.filter(t=>t!=='knowledge_bases')){
      const flags=(await pg.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['agentstudio.'+t])).rows[0]
      assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true})
    }
    for(const role of ['agentstudio_api','agentstudio_worker']){
      for(const t of domains.filter(t=>t.startsWith('legacy_kb_'))){
        assert.equal((await pg.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS granted",[role,'agentstudio.'+t])).rows[0].granted,false)
        await pg.exec('GRANT SELECT ON agentstudio.'+t+' TO '+role)
      }
      for(const actor of [owner,other]){
        await pg.exec('BEGIN; SET LOCAL ROLE '+role)
        try{
          await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor])
          for(const t of domains.filter(t=>t.startsWith('legacy_kb_')))assert.equal((await pg.query('SELECT * FROM agentstudio.'+t)).rows.length,0)
          if(role==='agentstudio_api')assert.deepEqual((await pg.query('SELECT owner_user_id FROM agentstudio.knowledge_bases')).rows,[{owner_user_id:actor}])
        }finally{await pg.exec('ROLLBACK')}
      }
    }
    await inert(pg)
  }finally{await pg.close();f.close()}
})
