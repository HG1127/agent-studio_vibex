import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import net from 'node:net'
import dgram from 'node:dgram'
import {PGlite} from '@electric-sql/pglite'
import {reconcileStage} from '../src/stage-reconciliation.ts'
import {normalizeLegacyAgent} from '../src/stage-agent-import.ts'

const sha=b=>createHash('sha256').update(b).digest('hex')
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const stamp='2026-10-15T01:00:00.000Z'
const spec={goal:'Synthetic goal',task_scope:'Synthetic scope',deliverables:['Report'],
  task_plan:['Review'],done_criteria:['Done'],tools:['summarize'],knowledge_base_ids:[],require_approval:true}
const raw={id:'agent0000000001',rh_user_id:'employee0000001',name:'Synthetic agent',
  spec:JSON.stringify(spec),source:'',template_key:'',created:stamp,updated:stamp}
const otherSources=['workflows','agent_studio_kb_bases','agent_studio_kb_documents','agent_studio_kb_chunks',
  'agent_studio_kb_vectors','agent_studio_schedules','agent_studio_spec_access','agent_studio_kb_access',
  'agent_studio_spec_proposals','agent_studio_kb_access_events','agent_studio_spec_collab_audit',
  'agent_studio_spec_revisions','agent_runs']
async function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w9-synthetic-'))
  const input={snapshot:path.join(dir,'frozen.sqlite'),manifest:path.join(dir,'manifest.json'),mapping:path.join(dir,'mapping.json')}
  const sqlite=new DatabaseSync(input.snapshot)
  sqlite.exec('CREATE TABLE studio_users(id TEXT PRIMARY KEY); CREATE TABLE agent_specs(id TEXT PRIMARY KEY,rh_user_id TEXT,name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT)')
  sqlite.prepare('INSERT INTO studio_users VALUES (?)').run(raw.rh_user_id)
  sqlite.prepare('INSERT INTO agent_specs VALUES (?,?,?,?,?,?,?,?)').run(...Object.values(raw))
  for(const name of otherSources)sqlite.exec(`CREATE TABLE ${name}(id TEXT)`)
  sqlite.close()
  function seal(){
    const bytes=fs.readFileSync(input.snapshot),digest=sha(bytes)
    const db=new DatabaseSync(input.snapshot,{readOnly:true}),tables={}
    for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())
      tables[name]=Number(db.prepare(`SELECT count(*) AS n FROM ${name}`).get().n)
    db.close()
    fs.writeFileSync(input.manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:digest,bytes:bytes.length,tables}))
    fs.writeFileSync(input.mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:digest,
      records:[{old_id:raw.rh_user_id,new_studio_user_id:a,verified_by:'Synthetic reviewer',approved_at:stamp}]}))
    input.approval={source_sha256:digest,approved_by:'Synthetic reviewer',approved_at:stamp}
    return digest
  }
  let digest=seal()
  const pg=await PGlite.create()
  // Synthetic schema uses the real v8_005/v8_011 column names. No real data,
  // extension, connection secret, importer or transport is loaded.
  await pg.exec(`CREATE SCHEMA agentstudio;
    CREATE TABLE agentstudio.schema_migrations(version text);
    INSERT INTO agentstudio.schema_migrations VALUES ('pg_v8_005'),('pg_v8_011'),('pg_v8_009');
    CREATE TABLE agentstudio.jobs(status text);
    CREATE TABLE agentstudio.users(id uuid,status text);
    CREATE TABLE agentstudio.agent_specs(id uuid,owner_user_id uuid,name text,spec jsonb,requires_approval boolean,created_at timestamptz,updated_at timestamptz);
    CREATE TABLE agentstudio.legacy_agent_imports(source_snapshot_sha256 text,legacy_spec_id text,owner_user_id uuid,target_spec_id uuid,payload_sha256 text);
    CREATE TABLE agentstudio.legacy_user_imports(source_snapshot_sha256 text,legacy_user_id text,target_user_id uuid,reviewed_mapping_sha256 text,reviewed_idp_sha256 text,identity_row_sha256 text,active_automatically boolean);
    CREATE TABLE agentstudio.audit_events(id uuid,owner_user_id uuid,actor_user_id uuid);
    CREATE TABLE agentstudio.legacy_collaboration_imports(source_table text,legacy_key text,source_snapshot_sha256 text,mapping_sha256 text,owner_user_id uuid,target_spec_id uuid,target_base_id uuid,permissions_enabled boolean,review_status text,archive jsonb,archive_sha256 text);`)
  const row=normalizeLegacyAgent(raw,new Map([[raw.rh_user_id,a]]))
  await pg.query('INSERT INTO agentstudio.users VALUES ($1,\'disabled\'),($2,\'disabled\')',[a,b])
  await pg.query('INSERT INTO agentstudio.agent_specs VALUES ($1,$2,$3,$4,true,$5,$6)',[a,a,row.name,JSON.stringify(row.spec),row.created_at,row.updated_at])
  await pg.query('INSERT INTO agentstudio.legacy_agent_imports VALUES ($1,$2,$3,$4,$5)',[digest,raw.id,a,a,row.payload_sha256])
  await pg.query('INSERT INTO agentstudio.legacy_user_imports VALUES ($1,$2,$3,$4,$5,$6,false)',
    [digest,raw.rh_user_id,a,sha(fs.readFileSync(input.mapping)),'c'.repeat(64),'d'.repeat(64)])
  const statements=[],guard={database:'agentstudio_stage',login:'agentstudio_admin',role:'agentstudio_admin',version:170005,readonly:'on',admin:true}
  let connections=0,releases=0
  const pool={async connect(){connections++;return {
    async query(sql,values=[]){
      statements.push(sql)
      assert.match(sql,/^(SELECT\b|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$|ROLLBACK$)/)
      if(sql.startsWith('SELECT current_database()'))return {rows:[guard]}
      return pg.query(sql,values)
    },release(){releases++},
  }}}
  return {input,pg,pool,guard,statements,seal,get connections(){return connections},get releases(){return releases},
    async close(){await pg.close();fs.rmSync(dir,{recursive:true,force:true})}}
}
const agent=report=>report.find(r=>r.domain==='agent_specs')

test('Agent checksums and crosswalk succeed; all unimplemented domains and audit remain blocked; no external requests',async(t)=>{
  const f=await fixture(),previous=globalThis.fetch
  let external=0
  globalThis.fetch=()=>{external++;throw Error('forbidden external request')}
  t.mock.method(net.Socket.prototype,'connect',()=>{external++;throw Error('forbidden TCP')})
  t.mock.method(dgram.Socket.prototype,'send',()=>{external++;throw Error('forbidden UDP')})
  try{
    const before=await f.pg.query('SELECT * FROM agentstudio.agent_specs')
    const out=await reconcileStage(f.input,f.pool)
    assert.equal(agent(out)?.status,'success')
    assert.equal(out.length,16)
    assert(out.filter(r=>r.domain!=='agent_specs').every(r=>r.status!=='success'))
    assert.equal(out.find(r=>r.domain==='audit').status,'unsupported')
    assert.deepEqual(await f.pg.query('SELECT * FROM agentstudio.agent_specs'),before)
    assert.equal(external,0);assert.equal(f.connections,1);assert.equal(f.releases,1)
    assert.equal(f.statements.at(-1),'ROLLBACK')
    const serialized=JSON.stringify(out)
    for(const secret of [raw.id,raw.rh_user_id,raw.name,spec.goal,f.input.snapshot,a,'c'.repeat(64)])assert(!serialized.includes(secret))
    for(const r of out)assert.deepEqual(Object.keys(r).sort(),['domain','source_count','target_count','blockers','association_anomalies','status'].sort())
  }finally{globalThis.fetch=previous;await f.close()}
})

test('count mismatch, mixed snapshots, target payload tampering and cross-employee association fail',async()=>{
  const f=await fixture()
  try{
    await f.pg.exec('DELETE FROM agentstudio.legacy_agent_imports')
    assert(agent(await reconcileStage(f.input,f.pool)).blockers.includes('count_mismatch'))
    const row=normalizeLegacyAgent(raw,new Map([[raw.rh_user_id,a]]))
    await f.pg.query('INSERT INTO agentstudio.legacy_agent_imports VALUES ($1,$2,$3,$4,$5)',['f'.repeat(64),raw.id,a,a,row.payload_sha256])
    assert(agent(await reconcileStage(f.input,f.pool)).blockers.includes('mixed_snapshot'))
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',[f.input.approval.source_sha256])
    await f.pg.exec("UPDATE agentstudio.agent_specs SET name='tampered'")
    assert(agent(await reconcileStage(f.input,f.pool)).blockers.includes('checksum_mismatch'))
    await f.pg.query('UPDATE agentstudio.agent_specs SET name=$1,owner_user_id=$2',[raw.name,b])
    assert.equal(agent(await reconcileStage(f.input,f.pool)).association_anomalies,1)
  }finally{await f.close()}
})

test('unapproved identity, active jobs and unsafe database/version/roles block',async()=>{
  const f=await fixture()
  try{
    for(const [key,value] of [['database','production'],['version',180001],['login','agentstudio_api'],['role','agentstudio_worker'],['readonly','off'],['admin',false]]){
      const old=f.guard[key];f.guard[key]=value
      assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['unsafe_target'])
      f.guard[key]=old
    }
    await f.pg.exec("INSERT INTO agentstudio.jobs VALUES ('leased')")
    assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['active_jobs'])
    await f.pg.exec('DELETE FROM agentstudio.jobs; DELETE FROM agentstudio.legacy_user_imports')
    assert.equal(agent(await reconcileStage(f.input,f.pool)).association_anomalies,1)
    const n=f.connections
    const mapping=JSON.parse(fs.readFileSync(f.input.mapping));delete mapping.records[0].verified_by
    fs.writeFileSync(f.input.mapping,JSON.stringify(mapping))
    assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['identity_not_approved'])
    assert.equal(f.connections,n)
  }finally{await f.close()}
})

test('missing source fields, unknown fields, missing target fields and missing source tables never pass',async()=>{
  const f=await fixture()
  try{
    let sqlite=new DatabaseSync(f.input.snapshot)
    sqlite.exec('ALTER TABLE agent_specs ADD COLUMN unexpected TEXT');sqlite.close();f.seal()
    assert(agent(await reconcileStage(f.input,f.pool)).blockers.includes('source_fields_unmapped'))
    sqlite=new DatabaseSync(f.input.snapshot);sqlite.exec('ALTER TABLE agent_specs DROP COLUMN unexpected; ALTER TABLE agent_specs DROP COLUMN spec; DROP TABLE workflows');sqlite.close();f.seal()
    const out=await reconcileStage(f.input,f.pool)
    assert(agent(out).blockers.includes('source_fields_unmapped'))
    assert(out.find(r=>r.domain==='workflows').blockers.includes('source_table_missing'))
    await f.pg.exec('ALTER TABLE agentstudio.legacy_agent_imports DROP COLUMN payload_sha256')
    assert(agent(await reconcileStage(f.input,f.pool)).blockers.includes('target_fields_missing'))
  }finally{await f.close()}
})

test('SHA manifest corruption, count mismatch, WAL and absent approval fail before target acquisition',async()=>{
  const f=await fixture()
  try{
    const original=fs.readFileSync(f.input.manifest)
    const info=JSON.parse(original);info.tables.agent_specs++
    fs.writeFileSync(f.input.manifest,JSON.stringify(info))
    assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['manifest_count_mismatch'])
    fs.writeFileSync(f.input.manifest,original)
    fs.writeFileSync(f.input.snapshot+'-wal','synthetic')
    assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['snapshot_not_frozen'])
    fs.unlinkSync(f.input.snapshot+'-wal')
    const approval=f.input.approval;delete f.input.approval
    assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['snapshot_not_approved'])
    f.input.approval=approval
    fs.appendFileSync(f.input.snapshot,'synthetic corrupt bytes')
    assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['invalid_manifest'])
    assert.equal(f.connections,0)
  }finally{await f.close()}
})

test('cross-tenant team permission archive is an anomaly and never live completion',async()=>{
  const f=await fixture()
  try{
    await f.pg.query("INSERT INTO agentstudio.legacy_collaboration_imports VALUES ('agent_studio_spec_access',$1,$2,$3,$4,$5,NULL,true,'pending_manual_review','{}',$1)",
      ['a'.repeat(64),f.input.approval.source_sha256,'b'.repeat(64),b,a])
    const out=await reconcileStage(f.input,f.pool),access=out.find(r=>r.domain==='agent_studio_spec_access')
    assert.equal(access.status,'failed');assert.equal(access.association_anomalies,1)
    assert(access.blockers.includes('archive_only_live_unsupported'))
    assert.equal(out.find(r=>r.domain==='agent_studio_spec_collab_audit').status,'unsupported')
  }finally{await f.close()}
})

test('driver failures are sanitized and input mutation during PG reads invalidates the whole report',async()=>{
  const f=await fixture()
  try{
    assert.deepEqual((await reconcileStage(f.input,{async connect(){throw Error('secret UID path prompt')}}))[0].blockers,['reconciliation_failed'])
    const pool={async connect(){const db=await f.pool.connect();return {...db,async query(sql,values){
      const r=await db.query(sql,values)
      if(sql.includes('FROM agentstudio.audit_events'))fs.appendFileSync(f.input.mapping,' ')
      return r
    }}}}
    assert.deepEqual((await reconcileStage(f.input,pool))[0].blockers,['input_changed'])
  }finally{await f.close()}
})
