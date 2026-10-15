import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {loadKbContentSnapshot,importKbContentArchive} from '../src/stage-kb-content-import.ts'
import {sha,fields} from '../src/stage-kb-content-import-source.ts'
import {normalizeLegacyKb,importLegacyKbsToStage} from '../src/stage-knowledge-base-import.ts'
import {importKbSnapshotAtomic} from '../src/stage-kb-atomic-import.ts'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')
const sql=file=>fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const vectorText='[ 1.000, -0.0, 2e-3 ]'
function fixture(change=()=>{}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w6-synthetic-'))
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
async function bootstrap(f,{crosswalk=true}={}){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(sql('db/postgres/001_stage_schema.sql'))
  await pg.exec(sql('db/postgres/migrations/pg_v8_007_legacy_kb_import.sql').replace("current_database()<>'agentstudio_stage'","current_database()<>'postgres'"))
  await pg.exec('CREATE ROLE agentstudio_admin SUPERUSER LOGIN; SET SESSION AUTHORIZATION agentstudio_admin')
  // ONLY tests adapt database/version to WASM PG18. Production SQL stays strict PG17.
  const migration=sql('db/postgres/migrations/pg_v8_010_legacy_kb_content.sql')
    .replace("current_database()<>'agentstudio_stage'","current_database()<>'postgres'")
    .replace('NOT BETWEEN 170000 AND 179999','NOT BETWEEN 180000 AND 189999')
  await pg.exec(migration);await pg.exec(migration)
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject) VALUES($1,'fixture','one'),($2,'fixture','two')",[owner,other])
  if(crosswalk){
    // Synthetic future W2 state only: never bypass W2 via its production importer.
    const b=normalizeLegacyKb({id:'baseA',rh_user_id:'employee0000001',name:'Synthetic KB',description:'',created_ms:1792030400000,updated_ms:1792030400000},new Map([['employee0000001',owner]]))
    const target=(await pg.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name,created_at,updated_at) VALUES($1,'Synthetic KB',$2,$2) RETURNING id",[owner,new Date(1792030400000).toISOString()])).rows[0].id
    await pg.query('INSERT INTO agentstudio.legacy_knowledge_base_imports(source_snapshot_sha256,legacy_base_id,owner_user_id,target_base_id,payload_sha256) VALUES($1,$2,$3,$4,$5)',[f.hash,'baseA',owner,target,b.payload_sha256])
  }
  return pg
}
function pool(pg,{guard={},failInsert=false,corruptRead=false,activeJobs=false,trace=[],failMetadata=false,failCommit=false}={}){
  let metadataInserts=0
  return {async connect(){return {release(){},async query(s,v=[]){
    trace.push(s)
    if(s.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',role:'agentstudio_admin',admin:true,version:170005,...guard}]}
    if(activeJobs&&s.includes("status IN ('queued','leased')"))return {rows:[{n:'1'}]}
    if(failInsert&&s.startsWith('INSERT INTO agentstudio.legacy_kb_chunk_archive'))throw Error('synthetic_failure')
    if(failMetadata&&s.startsWith('INSERT INTO agentstudio.knowledge_bases')&&++metadataInserts===2)throw Error('synthetic_metadata_failure')
    if(failCommit&&s==='COMMIT')throw Error('synthetic_commit_failure')
    const result=await pg.query(s,v)
    if(corruptRead&&s.startsWith('SELECT * FROM agentstudio.legacy_kb_vector_archive'))result.rows[0].raw_payload='{}'
    return result
  }}}}
}
async function empty(pg){
  for(const table of ['legacy_kb_content_snapshots','legacy_kb_document_archive','legacy_kb_chunk_archive','legacy_kb_vector_archive'])
    assert.equal((await pg.query('SELECT count(*)::integer AS n FROM agentstudio.'+table)).rows[0].n,0)
}

test('lossless frozen archive, original array text/milliseconds, counts, hashes, replay; no runtime RAG/jobs',async()=>{
  const f=fixture();const pg=await bootstrap(f)
  try{
    const batch=loadKbContentSnapshot(f)
    assert.equal(JSON.stringify(batch).includes('SYNTHETIC_SECRET'),false)
    assert.equal(Object.isFrozen(batch.rows[0]),true)
    const first=await importKbContentArchive(pool(pg),batch)
    assert.deepEqual([first.imported,first.reconciled,first.rag_enabled,first.production_cutover_allowed],[3,3,false,false])
    const raw=JSON.parse((await pg.query('SELECT raw_payload FROM agentstudio.legacy_kb_vector_archive')).rows[0].raw_payload)
    assert.equal(raw.vector_json,vectorText);assert.equal(raw.dimensions,3);assert.equal(raw.indexed_ms,1792030400456)
    assert.equal(JSON.parse((await pg.query('SELECT raw_payload FROM agentstudio.legacy_kb_document_archive')).rows[0].raw_payload).created_ms,1792030400123)
    assert.equal((await importKbContentArchive(pool(pg),loadKbContentSnapshot(f))).replayed,3)
    for(const table of ['knowledge_documents','knowledge_chunks','jobs'])assert.equal((await pg.query('SELECT count(*)::integer AS n FROM agentstudio.'+table)).rows[0].n,0)
    await assert.rejects(importKbContentArchive(pool(pg),{...batch}),/verified_offline_batch_required/)
    const diff=fixture(db=>db.exec("UPDATE agent_studio_kb_chunks SET text_content='different snapshot'"))
    try{await assert.rejects(importKbContentArchive(pool(pg),loadKbContentSnapshot(diff)),/different_W2_snapshot/)}finally{diff.close()}
  }finally{await pg.close();f.close()}
})
test('W2 document gate remains closed, missing crosswalk blocks with zero writes',async()=>{
  const f=fixture();const pg=await bootstrap(f,{crosswalk:false})
  try{
    assert.throws(()=>normalizeLegacyKb({},new Map(),true))
    const raw={id:'baseA',rh_user_id:'employee0000001',name:'Synthetic KB',description:'',created_ms:1792030400000,updated_ms:1792030400000}
    assert.throws(()=>normalizeLegacyKb(raw,new Map([['employee0000001',owner]]),true),/documents_vectors_or_acl_not_migrated/)
    await assert.rejects(importKbContentArchive(pool(pg),loadKbContentSnapshot(f)),/missing_or_cross_tenant_W2_reference/)
    await empty(pg)
  }finally{await pg.close();f.close()}
})
test('transaction rollback on partial insert and failed readback; successful retry',async()=>{
  const f=fixture();const pg=await bootstrap(f)
  try{
    const batch=loadKbContentSnapshot(f)
    await assert.rejects(importKbContentArchive(pool(pg,{failInsert:true}),batch),/sql_failed/);await empty(pg)
    await assert.rejects(importKbContentArchive(pool(pg,{corruptRead:true}),batch),/reconciliation_payload/);await empty(pg)
    assert.equal((await importKbContentArchive(pool(pg),batch)).imported,3)
  }finally{await pg.close();f.close()}
})
test('strict database, login/current role, superuser and PG17 guards',async()=>{
  const f=fixture();const pg=await bootstrap(f)
  try{
    for(const guard of [{database:'company_live'},{login:'postgres'},{role:'agentstudio_api'},{admin:false},{version:180000},{version:160005}])
      await assert.rejects(importKbContentArchive(pool(pg,{guard}),loadKbContentSnapshot(f)),/refuse_nonisolated_pg17_admin/)
    await assert.rejects(importKbContentArchive(pool(pg,{activeJobs:true}),loadKbContentSnapshot(f)),/active_jobs/)
    await empty(pg)
  }finally{await pg.close();f.close()}
})
test('crosswalk tenant, metadata drift and changed approved map cannot replay',async()=>{
  const f=fixture();const pg=await bootstrap(f)
  try{
    const batch=loadKbContentSnapshot(f)
    await pg.exec("UPDATE agentstudio.knowledge_bases SET name='drift'")
    await assert.rejects(importKbContentArchive(pool(pg),batch),/W2_metadata_drift/);await empty(pg)
    await pg.exec("UPDATE agentstudio.knowledge_bases SET name='Synthetic KB'")
    // Move both target and crosswalk owner so all existing SQL FKs remain satisfied.
    await pg.query('INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,$2)',[other,'other tenant'])
    const target=(await pg.query('SELECT id FROM agentstudio.knowledge_bases WHERE owner_user_id=$1',[other])).rows[0].id
    await pg.query('UPDATE agentstudio.legacy_knowledge_base_imports SET owner_user_id=$1,target_base_id=$2',[other,target])
    await assert.rejects(importKbContentArchive(pool(pg),batch),/missing_or_cross_tenant_W2_reference/);await empty(pg)
    const original=(await pg.query('SELECT id FROM agentstudio.knowledge_bases WHERE owner_user_id=$1',[owner])).rows[0].id
    await pg.query('UPDATE agentstudio.legacy_knowledge_base_imports SET owner_user_id=$1,target_base_id=$2',[owner,original])
    await importKbContentArchive(pool(pg),batch)
    const map=JSON.parse(fs.readFileSync(f.mapping));map.records[0].verified_by='different-reviewer'
    fs.writeFileSync(f.mapping,JSON.stringify(map))
    await assert.rejects(importKbContentArchive(pool(pg),loadKbContentSnapshot(f)),/snapshot_or_payload_conflict/)
  }finally{await pg.close();f.close()}
})
test('source fail-closed for cross-tenant, missing references, unknown fields, invalid vectors/counts',()=>{
  for(const [change,code] of [
    [db=>db.exec("UPDATE agent_studio_kb_documents SET rh_user_id='employee0000002'"),'base_or_owner_reference'],
    [db=>db.exec("UPDATE agent_studio_kb_chunks SET document_id='missing'"),'document_reference'],
    [db=>db.exec("UPDATE agent_studio_kb_vectors SET chunk_id='missing'"),'chunk_reference'],
    [db=>db.exec("UPDATE model_connections SET rh_user_id='employee0000002'"),'connection_reference'],
    [db=>db.exec('ALTER TABLE agent_studio_kb_documents ADD COLUMN unexpected TEXT'),'unknown_or_missing_source_field'],
    [db=>db.exec('UPDATE agent_studio_kb_vectors SET dimensions=1536'),'invalid_vector'],
    [db=>db.exec('UPDATE agent_studio_kb_documents SET chunk_count=2'),'document_chunk_count_or_sequence'],
  ]){
    const f=fixture(change)
    try{assert.throws(()=>loadKbContentSnapshot(f),new RegExp(code))}finally{f.close()}
  }
})
test('manifest hash/count, mapping snapshot/approval/identity collisions, sidecars reject',()=>{
  for(const mutate of [
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));m.sha256='0'.repeat(64);fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));delete m.tables.agent_studio_kb_chunks;fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.manifest));m.tables.agent_studio_kb_vectors=0;fs.writeFileSync(f.manifest,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.source_sha256='0'.repeat(64);fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records[0].verified_by='';fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>{const m=JSON.parse(fs.readFileSync(f.mapping));m.records[1].new_studio_user_id=owner;fs.writeFileSync(f.mapping,JSON.stringify(m))},
    f=>fs.writeFileSync(f.snapshot+'-wal','synthetic'),
  ]){
    const f=fixture()
    try{mutate(f);assert.throws(()=>loadKbContentSnapshot(f),/kb_content_/)}finally{f.close()}
  }
})
test('immutable DBA archive, forced RLS and zero API/worker privileges even for owner',async()=>{
  const f=fixture();const pg=await bootstrap(f)
  try{
    await importKbContentArchive(pool(pg),loadKbContentSnapshot(f))
    await assert.rejects(pg.exec("UPDATE agentstudio.legacy_kb_content_snapshots SET inventory_sha256=inventory_sha256"),/immutable_kb_archive/)
    for(const table of ['legacy_kb_content_snapshots','legacy_kb_document_archive','legacy_kb_chunk_archive','legacy_kb_vector_archive']){
      const r=(await pg.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",['agentstudio.'+table])).rows[0]
      assert.deepEqual(r,{relrowsecurity:true,relforcerowsecurity:true})
      for(const action of ['UPDATE '+table+' SET raw_payload=raw_payload','DELETE FROM '+table,'TRUNCATE '+table]){
        if(table==='legacy_kb_content_snapshots'&&action.startsWith('UPDATE'))continue
        await assert.rejects(pg.exec(action.replace(table,'agentstudio.'+table)),/immutable_kb_archive|foreign key/i)
      }
      for(const role of ['agentstudio_api','agentstudio_worker']){
        await pg.exec('BEGIN; SET LOCAL ROLE '+role)
        try{
          await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[owner])
          await assert.rejects(pg.query('SELECT * FROM agentstudio.'+table),/permission denied/)
        }finally{await pg.exec('ROLLBACK')}
        assert.equal((await pg.query("SELECT has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,SELECT') AS granted",[role,'agentstudio.'+table])).rows[0].granted,false)
      }
    }
    // Even if a future accidental grant occurs, forced RLS has no normal-role policy.
    await pg.exec('GRANT SELECT ON agentstudio.legacy_kb_vector_archive TO agentstudio_api; BEGIN; SET LOCAL ROLE agentstudio_api')
    try{assert.equal((await pg.query('SELECT * FROM agentstudio.legacy_kb_vector_archive')).rows.length,0)}finally{await pg.exec('ROLLBACK')}
  }finally{await pg.close();f.close()}
})

const twoBases=db=>db.exec("INSERT INTO agent_studio_kb_bases VALUES('baseB','employee0000002','Empty KB','空知识库',1792030400000,1792030400000)")
async function atomicEmpty(pg){
  await empty(pg)
  for(const table of ['knowledge_bases','legacy_knowledge_base_imports'])
    assert.equal((await pg.query('SELECT count(*)::integer AS n FROM agentstudio.'+table)).rows[0].n,0)
}

test('real W2/W6 atomic path: two bases, original document/chunk/vector, one transaction, replay and RLS',async()=>{
  const f=fixture(twoBases),pg=await bootstrap(f,{crosswalk:false})
  try{
    const batch=loadKbContentSnapshot(f),trace=[]
    assert.equal(batch.bases.length,2)
    assert.deepEqual(batch.bases.map(b=>b.has_related_data),[true,false])
    const result=await importKbSnapshotAtomic(pool(pg,{trace}),batch)
    assert.deepEqual([result.imported,result.reconciled,result.archive.imported,result.rag_enabled,result.acl_activated],[2,2,3,false,false])
    assert.deepEqual(trace.filter(s=>/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)),['BEGIN','COMMIT'])
    const replay=await importKbSnapshotAtomic(pool(pg),loadKbContentSnapshot(f))
    assert.deepEqual([replay.imported,replay.replayed,replay.archive.imported,replay.archive.replayed],[0,2,0,3])
    const bases=(await pg.query('SELECT b.*,m.legacy_base_id,m.source_snapshot_sha256 FROM agentstudio.knowledge_bases b JOIN agentstudio.legacy_knowledge_base_imports m ON m.target_base_id=b.id ORDER BY m.legacy_base_id')).rows
    assert.deepEqual(bases.map(b=>[b.legacy_base_id,b.owner_user_id,b.visibility,b.team_id,b.source_snapshot_sha256]),[
      ['baseA',owner,'private',null,f.hash],['baseB',other,'private',null,f.hash]])
    for(const [kind,table] of Object.entries({document:'legacy_kb_document_archive',chunk:'legacy_kb_chunk_archive',vector:'legacy_kb_vector_archive'})){
      const persisted=(await pg.query('SELECT * FROM agentstudio.'+table)).rows[0]
      const original=batch.rows.find(r=>r.kind===kind)
      assert.equal(persisted.raw_payload,original.raw)
      assert.equal(persisted.payload_sha256,sha(original.raw))
      assert.equal(persisted.target_base_id,bases[0].id)
      assert.equal(persisted.owner_user_id,owner)
    }
    for(const table of ['knowledge_documents','knowledge_chunks','jobs'])
      assert.equal((await pg.query('SELECT count(*)::integer AS n FROM agentstudio.'+table)).rows[0].n,0)
    await pg.exec('BEGIN; SET LOCAL ROLE agentstudio_api')
    try{
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[other])
      assert.deepEqual((await pg.query('SELECT name FROM agentstudio.knowledge_bases')).rows,[{name:'Empty KB'}])
      await assert.rejects(pg.query('SELECT * FROM agentstudio.legacy_kb_document_archive'),/permission denied/)
    }finally{await pg.exec('ROLLBACK')}
    // An approved-map change on the SAME snapshot cannot reuse the frozen archive.
    const mapping=JSON.parse(fs.readFileSync(f.mapping));mapping.records[0].verified_by='another-synthetic-reviewer'
    fs.writeFileSync(f.mapping,JSON.stringify(mapping))
    await assert.rejects(importKbSnapshotAtomic(pool(pg),loadKbContentSnapshot(f)),/snapshot_or_payload_conflict/)
    const different=fixture(db=>{twoBases(db);db.exec("UPDATE agent_studio_kb_bases SET description='changed' WHERE id='baseB'")})
    try{await assert.rejects(importKbSnapshotAtomic(pool(pg),loadKbContentSnapshot(different)),/source_snapshot_conflict/)}finally{different.close()}
  }finally{await pg.close();f.close()}
})

test('atomic rollback includes BOTH metadata bases and all archives on metadata/content/readback/commit failure',async()=>{
  const f=fixture(twoBases),pg=await bootstrap(f,{crosswalk:false})
  try{
    const batch=loadKbContentSnapshot(f)
    for(const fault of [{failMetadata:true},{failInsert:true},{corruptRead:true},{failCommit:true}]){
      const trace=[]
      await assert.rejects(importKbSnapshotAtomic(pool(pg,{...fault,trace}),batch),/stage_kb_sql_failed|reconciliation_payload/)
      await atomicEmpty(pg)
      assert.equal(trace.filter(s=>s==='BEGIN').length,1)
      assert.equal(trace.at(-1),'ROLLBACK')
    }
    assert.equal((await importKbSnapshotAtomic(pool(pg),batch)).imported,2)
  }finally{await pg.close();f.close()}
})

test('atomic authorization cannot be minted by plain objects or flags; ordinary W2 cannot import verified content metadata',async()=>{
  const f=fixture(twoBases),pg=await bootstrap(f,{crosswalk:false})
  try{
    const batch=loadKbContentSnapshot(f),trace=[]
    for(const forged of [{...batch},JSON.parse(JSON.stringify(batch)),{...batch,verified:true}])
      await assert.rejects(importKbSnapshotAtomic(pool(pg,{trace}),forged),/verified_offline_batch_required/)
    assert.equal(trace.length,0)
    await assert.rejects(importLegacyKbsToStage(pool(pg),batch.snapshot,batch.bases),/documents_vectors_or_acl_not_migrated/)
    for(const stripped of [batch.bases.map(b=>({...b,has_related_data:false})),
      batch.bases.map(({has_related_data,...b})=>b)])
      await assert.rejects(importLegacyKbsToStage(pool(pg),batch.snapshot,stripped),/documents_vectors_or_acl_not_migrated/)
    assert.throws(()=>normalizeLegacyKb({id:'baseA',rh_user_id:'employee0000001',name:'Synthetic KB',description:'',created_ms:1792030400000,updated_ms:1792030400000},new Map([['employee0000001',owner]]),true),/documents_vectors_or_acl_not_migrated/)
    for(const guard of [{database:'company_live'},{login:'postgres'},{role:'agentstudio_api'},{admin:false},{version:180000},{version:160000}]){
      await assert.rejects(importKbSnapshotAtomic(pool(pg,{guard}),batch),/refuse_nonisolated_pg17_target/)
      await atomicEmpty(pg)
    }
    await assert.rejects(importKbSnapshotAtomic(pool(pg,{activeJobs:true}),batch),/active_stage_jobs_must_stop/)
    await atomicEmpty(pg)
  }finally{await pg.close();f.close()}
})

test('atomic identity conflict rolls back; duplicate mapping and unsupported ACL/config fail offline',async()=>{
  const f=fixture(twoBases),pg=await bootstrap(f,{crosswalk:false})
  try{
    const batch=loadKbContentSnapshot(f)
    await pg.query('DELETE FROM agentstudio.users WHERE id=$1',[other])
    await assert.rejects(importKbSnapshotAtomic(pool(pg),batch),/user_not_preprovisioned/)
    await atomicEmpty(pg)
    const mapping=JSON.parse(fs.readFileSync(f.mapping));mapping.records[1].new_studio_user_id=owner
    fs.writeFileSync(f.mapping,JSON.stringify(mapping))
    assert.throws(()=>loadKbContentSnapshot(f),/ambiguous_identity/)
  }finally{await pg.close();f.close()}
  for(const table of ['agent_studio_kb_access','agent_studio_kb_access_events','agent_studio_kb_embedding_queue','agent_studio_kb_embedding_settings']){
    const unsupported=fixture(db=>db.exec('CREATE TABLE '+table+"(base_id TEXT); INSERT INTO "+table+" VALUES('baseA')"))
    try{assert.throws(()=>loadKbContentSnapshot(unsupported),/unsupported_acl_or_embedding_state/)}finally{unsupported.close()}
  }
})

test('atomic same-SHA crosswalk owner conflict preserves preexisting state without content writes',async()=>{
  const f=fixture(twoBases),pg=await bootstrap(f)
  try{
    const batch=loadKbContentSnapshot(f)
    const previous=(await pg.query('SELECT target_base_id FROM agentstudio.legacy_knowledge_base_imports')).rows[0].target_base_id
    const target=(await pg.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,'conflicting tenant') RETURNING id",[other])).rows[0].id
    await pg.query('UPDATE agentstudio.legacy_knowledge_base_imports SET owner_user_id=$1,target_base_id=$2',[other,target])
    await pg.query('DELETE FROM agentstudio.knowledge_bases WHERE id=$1',[previous])
    await assert.rejects(importKbSnapshotAtomic(pool(pg),batch),/stage_kb_existing_content_conflict/)
    await empty(pg)
    assert.deepEqual((await pg.query('SELECT legacy_base_id,owner_user_id,target_base_id FROM agentstudio.legacy_knowledge_base_imports')).rows,
      [{legacy_base_id:'baseA',owner_user_id:other,target_base_id:target}])
    assert.equal((await pg.query('SELECT count(*)::integer AS n FROM agentstudio.knowledge_bases')).rows[0].n,1)
  }finally{await pg.close();f.close()}
})
