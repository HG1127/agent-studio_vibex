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
import {normalizeLegacyWorkflow} from '../src/stage-workflow-import.ts'
import {normalizeLegacyKb} from '../src/stage-knowledge-base-import.ts'
import {prepareDisabledUserProvision} from '../src/stage-user-import.ts'

const sha=b=>createHash('sha256').update(b).digest('hex')
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
// PG drivers may return Date objects: keep subsecond source timestamps intact.
const stamp='2026-10-15T01:00:00.123Z'
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

// W11 fixtures model the actual W7 identity, W1 skeleton and W2 metadata
// algorithms. No importer/write entry point is called by reconciliation.
const oldB='employee0000002'
const workflows=[a,b].map((target,i)=>({target,raw:{id:`workflow000000${i+1}`,
  rh_user_id:i?oldB:raw.rh_user_id,name:`Synthetic workflow ${i+1}`,
  description:'',source:'',spec_id:'',require_approval:1,
  graph:JSON.stringify({nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
    {id:'end',type:'end',data:{title:'End'},position:{x:10,y:20}}],
    edges:[{id:'e',source:'start',target:'end'}]}),created:stamp,updated:stamp}}))
const bases=[a,b].map((target,i)=>({target,raw:{id:`base${i+1}`,rh_user_id:i?oldB:raw.rh_user_id,
  name:`Synthetic KB ${i+1}`,description:`Metadata ${i+1}`,
  created_ms:Date.parse(stamp),updated_ms:Date.parse(stamp)}}))
async function strictFixture(){
  const f=await fixture()
  try{
    const sqlite=new DatabaseSync(f.input.snapshot)
    sqlite.exec('ALTER TABLE studio_users ADD COLUMN password TEXT; ALTER TABLE studio_users ADD COLUMN tokenKey TEXT; '+
      'DROP TABLE workflows; DROP TABLE agent_studio_kb_bases; '+
      'CREATE TABLE workflows(id TEXT,rh_user_id TEXT,name TEXT,description TEXT,source TEXT,spec_id TEXT,require_approval INTEGER,graph TEXT,created TEXT,updated TEXT); '+
      'CREATE TABLE agent_studio_kb_bases(id TEXT,rh_user_id TEXT,name TEXT,description TEXT,created_ms INTEGER,updated_ms INTEGER)')
    sqlite.prepare('INSERT INTO studio_users(id,password,tokenKey) VALUES (?,?,?)').run(oldB,'SYNTHETIC-PASSWORD-NEVER-READ','SYNTHETIC-TOKEN-NEVER-READ')
    for(const w of workflows)sqlite.prepare('INSERT INTO workflows VALUES (?,?,?,?,?,?,?,?,?,?)').run(...Object.values(w.raw))
    for(const k of bases)sqlite.prepare('INSERT INTO agent_studio_kb_bases VALUES (?,?,?,?,?,?)').run(...Object.values(k.raw))
    sqlite.close()
    const digest=f.seal()
    const mapping=JSON.parse(fs.readFileSync(f.input.mapping))
    mapping.records.push({old_id:oldB,new_studio_user_id:b,verified_by:'Synthetic reviewer',approved_at:stamp})
    fs.writeFileSync(f.input.mapping,JSON.stringify(mapping))
    f.input.reviewed_idp=path.join(path.dirname(f.input.mapping),'reviewed-idp.json')
    fs.writeFileSync(f.input.reviewed_idp,JSON.stringify({schema_version:'studio-reviewed-oidc-provision-v1',source_sha256:digest,
      records:[a,b].map((target,i)=>({old_id:i?oldB:raw.rh_user_id,new_studio_user_id:target,
        external_issuer:'https://synthetic.invalid/tenant',external_subject:`synthetic-subject-${i}`,
        reviewed_by:'Synthetic reviewer',reviewed_at:stamp}))}))
    const plan=prepareDisabledUserProvision(f.input.snapshot,f.input.manifest,f.input.mapping,f.input.reviewed_idp)
    await f.pg.exec(`ALTER TABLE agentstudio.users ADD COLUMN external_issuer text;
      ALTER TABLE agentstudio.users ADD COLUMN external_subject text;
      ALTER TABLE agentstudio.users ADD COLUMN display_name text DEFAULT '';
      INSERT INTO agentstudio.schema_migrations VALUES ('pg_v8_006'),('pg_v8_007');
      CREATE TABLE agentstudio.workflows(id uuid,owner_user_id uuid,name text,graph jsonb,created_at timestamptz,updated_at timestamptz,visibility text,team_id uuid,revision bigint);
      CREATE TABLE agentstudio.legacy_workflow_imports(source_snapshot_sha256 text,legacy_workflow_id text,owner_user_id uuid,target_workflow_id uuid,payload_sha256 text,source_record jsonb,execution_enabled boolean);
      CREATE TABLE agentstudio.knowledge_bases(id uuid,owner_user_id uuid,name text,description text,created_at timestamptz,updated_at timestamptz,visibility text,team_id uuid,revision bigint);
      CREATE TABLE agentstudio.legacy_knowledge_base_imports(source_snapshot_sha256 text,legacy_base_id text,owner_user_id uuid,target_base_id uuid,payload_sha256 text);
      CREATE TABLE agentstudio.runs(workflow_id uuid);
      CREATE TABLE agentstudio.schedules(workflow_id uuid);
      DELETE FROM agentstudio.legacy_user_imports;`)
    for(const r of plan.rows){
      await f.pg.query('UPDATE agentstudio.users SET external_issuer=$1,external_subject=$2 WHERE id=$3',[r.issuer,r.subject,r.target_user_id])
      await f.pg.query('INSERT INTO agentstudio.legacy_user_imports VALUES ($1,$2,$3,$4,$5,$6,false)',
        [digest,r.legacy_id,r.target_user_id,plan.reviewed_mapping_sha256,plan.reviewed_idp_sha256,r.identity_sha256])
    }
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',[digest])
    const owners=new Map([[raw.rh_user_id,a],[oldB,b]])
    for(const w of workflows){
      const r=normalizeLegacyWorkflow(w.raw,owners)
      await f.pg.query("INSERT INTO agentstudio.workflows VALUES ($1,$2,$3,$4,$5,$6,'private',NULL,1)",
        [w.target,r.owner_user_id,r.name,JSON.stringify(r.graph),r.created_at,r.updated_at])
      await f.pg.query('INSERT INTO agentstudio.legacy_workflow_imports VALUES ($1,$2,$3,$4,$5,$6,false)',
        [digest,r.legacy_id,r.owner_user_id,w.target,r.payload_sha256,JSON.stringify(r.source_record)])
    }
    for(const k of bases){
      const r=normalizeLegacyKb(k.raw,owners)
      await f.pg.query("INSERT INTO agentstudio.knowledge_bases VALUES ($1,$2,$3,$4,$5,$6,'private',NULL,1)",
        [k.target,r.owner_user_id,r.name,r.description,r.created_at,r.updated_at])
      await f.pg.query('INSERT INTO agentstudio.legacy_knowledge_base_imports VALUES ($1,$2,$3,$4,$5)',
        [digest,r.legacy_id,r.owner_user_id,k.target,r.payload_sha256])
    }
    f.reseal=async()=>{
      const mapping=JSON.parse(fs.readFileSync(f.input.mapping)),idp=JSON.parse(fs.readFileSync(f.input.reviewed_idp))
      const sha=f.seal()
      mapping.source_sha256=sha;idp.source_sha256=sha
      fs.writeFileSync(f.input.mapping,JSON.stringify(mapping));fs.writeFileSync(f.input.reviewed_idp,JSON.stringify(idp))
      const evidence=prepareDisabledUserProvision(f.input.snapshot,f.input.manifest,f.input.mapping,f.input.reviewed_idp)
      for(const table of ['legacy_user_imports','legacy_agent_imports','legacy_workflow_imports','legacy_knowledge_base_imports'])
        await f.pg.query(`UPDATE agentstudio.${table} SET source_snapshot_sha256=$1`,[sha])
      await f.pg.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1,reviewed_idp_sha256=$2',
        [evidence.reviewed_mapping_sha256,evidence.reviewed_idp_sha256])
    }
    return f
  }catch(e){await f.close();throw e}
}
const domain=(out,name)=>out.find(r=>r.domain===name)
const supported=['studio_users','agent_specs','workflows','agent_studio_kb_bases']

test('W11 reviewed disabled identities, frozen workflows and KB metadata reconcile per row and replay without effects',async(t)=>{
  const f=await strictFixture(),previous=globalThis.fetch
  let external=0
  globalThis.fetch=()=>{external++;throw Error('forbidden')}
  t.mock.method(net.Socket.prototype,'connect',()=>{external++;throw Error('forbidden')})
  t.mock.method(dgram.Socket.prototype,'send',()=>{external++;throw Error('forbidden')})
  try{
    const tables=['users','legacy_user_imports','workflows','legacy_workflow_imports','knowledge_bases','legacy_knowledge_base_imports','jobs','runs','schedules']
    const before=await Promise.all(tables.map(table=>f.pg.query(`SELECT * FROM agentstudio.${table}`)))
    const datePool={async connect(){const db=await f.pool.connect();return {...db,async query(sql,values){
      const result=await db.query(sql,values)
      for(const row of result.rows)for(const field of ['created_at','updated_at'])
        if(row[field]!==undefined)row[field]=new Date(row[field])
      return result
    }}}}
    const first=await reconcileStage(f.input,f.pool),second=await reconcileStage(f.input,datePool)
    assert.deepEqual(second,first)
    for(const name of supported)assert.equal(domain(first,name)?.status,'success',name)
    assert(first.filter(r=>!supported.includes(r.domain)).every(r=>r.status!=='success'))
    assert.deepEqual(await Promise.all(tables.map(table=>f.pg.query(`SELECT * FROM agentstudio.${table}`))),before)
    assert.equal(f.connections,2);assert.equal(f.releases,2);assert.equal(external,0)
    assert.equal(f.statements.filter(s=>s==='ROLLBACK').length,2)
    const output=JSON.stringify(first)
    for(const secret of [a,b,raw.rh_user_id,oldB,workflows[0].raw.id,bases[0].raw.name,
      'synthetic.invalid','synthetic-subject','SYNTHETIC-PASSWORD','SYNTHETIC-TOKEN',f.input.reviewed_idp])assert(!output.includes(secret))
  }finally{globalThis.fetch=previous;await f.close()}
})

test('W11 missing IdP evidence remains unsupported; issuer, subject, disabled status and each approval/hash are independently checked',async()=>{
  const f=await strictFixture()
  try{
    const idp=f.input.reviewed_idp;delete f.input.reviewed_idp
    for(const name of ['studio_users','workflows','agent_studio_kb_bases']){
      const r=domain(await reconcileStage(f.input,f.pool),name)
      assert.equal(r.status,'unsupported');assert.deepEqual(r.blockers,['reviewed_idp_evidence_required'])
    }
    f.input.reviewed_idp=idp
    const cases=[
      ["UPDATE agentstudio.users SET external_issuer='https://synthetic.invalid/other-tenant' WHERE id=$1",'users','external_issuer'],
      ["UPDATE agentstudio.users SET external_subject='changed' WHERE id=$1",'users','external_subject'],
      ["UPDATE agentstudio.users SET status='active' WHERE id=$1",'users','status'],
      ["UPDATE agentstudio.users SET display_name='unreviewed' WHERE id=$1",'users','display_name'],
      ["UPDATE agentstudio.legacy_user_imports SET identity_row_sha256=repeat('f',64) WHERE target_user_id=$1",'legacy_user_imports','identity_row_sha256'],
      ["UPDATE agentstudio.legacy_user_imports SET reviewed_idp_sha256=repeat('f',64) WHERE target_user_id=$1",'legacy_user_imports','reviewed_idp_sha256'],
      ["UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=repeat('f',64) WHERE target_user_id=$1",'legacy_user_imports','reviewed_mapping_sha256'],
      ['UPDATE agentstudio.legacy_user_imports SET active_automatically=true WHERE target_user_id=$1','legacy_user_imports','active_automatically'],
      ["UPDATE agentstudio.legacy_user_imports SET source_snapshot_sha256=repeat('f',64) WHERE target_user_id=$1",'legacy_user_imports','source_snapshot_sha256'],
    ]
    for(const [sql,table,col] of cases){
      const key=table==='users'?'id':'target_user_id'
      const old=(await f.pg.query(`SELECT ${col} AS value FROM agentstudio.${table} WHERE ${key}=$1`,[a])).rows[0].value
      await f.pg.query(sql,[a])
      const out=await reconcileStage(f.input,f.pool)
      for(const name of ['studio_users','workflows','agent_studio_kb_bases'])assert.equal(domain(out,name)?.status,'failed',`${table}.${col}: ${name}`)
      await f.pg.query(`UPDATE agentstudio.${table} SET ${col}=$1 WHERE ${key}=$2`,[old,a])
    }
    assert.equal(domain(await reconcileStage(f.input,f.pool),'studio_users').status,'success')
  }finally{await f.close()}
})

test('W11 same counts cannot hide workflow graph/original-record/hash/owner/ID changes or execution references',async()=>{
  const f=await strictFixture()
  try{
    const cases=[
      ["UPDATE agentstudio.workflows SET graph='{\"nodes\":[],\"edges\":[],\"extra\":true}' WHERE id=$1",'workflows','graph'],
      ["UPDATE agentstudio.workflows SET name='tampered' WHERE id=$1",'workflows','name'],
      ["UPDATE agentstudio.workflows SET created_at=created_at+interval '1 second' WHERE id=$1",'workflows','created_at'],
      ["UPDATE agentstudio.workflows SET visibility='team' WHERE id=$1",'workflows','visibility'],
      ['UPDATE agentstudio.workflows SET revision=2 WHERE id=$1','workflows','revision'],
      ['UPDATE agentstudio.workflows SET owner_user_id=$2 WHERE id=$1','workflows','owner_user_id'],
      ["UPDATE agentstudio.legacy_workflow_imports SET source_record=jsonb_set(source_record,'{source}','\"altered\"') WHERE target_workflow_id=$1",'legacy_workflow_imports','source_record'],
      ["UPDATE agentstudio.legacy_workflow_imports SET payload_sha256=repeat('f',64) WHERE target_workflow_id=$1",'legacy_workflow_imports','payload_sha256'],
      ['UPDATE agentstudio.legacy_workflow_imports SET execution_enabled=true WHERE target_workflow_id=$1','legacy_workflow_imports','execution_enabled'],
      ["UPDATE agentstudio.legacy_workflow_imports SET legacy_workflow_id='workflow9999999' WHERE target_workflow_id=$1",'legacy_workflow_imports','legacy_workflow_id'],
      ["UPDATE agentstudio.legacy_workflow_imports SET source_snapshot_sha256=repeat('f',64) WHERE target_workflow_id=$1",'legacy_workflow_imports','source_snapshot_sha256'],
    ]
    for(const [sql,table,col] of cases){
      const key=table==='workflows'?'id':'target_workflow_id'
      const old=(await f.pg.query(`SELECT ${col} AS value FROM agentstudio.${table} WHERE ${key}=$1`,[a])).rows[0].value
      await f.pg.query(sql,col==='owner_user_id'?[a,b]:[a])
      assert.equal(domain(await reconcileStage(f.input,f.pool),'workflows')?.status,'failed',col)
      await f.pg.query(`UPDATE agentstudio.${table} SET ${col}=$1 WHERE ${key}=$2`,[col==='graph'||col==='source_record'?JSON.stringify(old):old,a])
    }
    for(const table of ['runs','schedules']){
      await f.pg.query(`INSERT INTO agentstudio.${table} VALUES ($1)`,[a])
      assert.equal(domain(await reconcileStage(f.input,f.pool),'workflows').status,'failed')
      await f.pg.exec(`DELETE FROM agentstudio.${table}`)
    }
    await f.pg.exec('UPDATE agentstudio.legacy_workflow_imports SET target_workflow_id=owner_user_id')
    assert.equal(domain(await reconcileStage(f.input,f.pool),'workflows').status,'success')
    await f.pg.query('UPDATE agentstudio.legacy_workflow_imports SET target_workflow_id=$1',[a])
    assert(domain(await reconcileStage(f.input,f.pool),'workflows').blockers.includes('duplicate_target'))
  }finally{await f.close()}
})

test('W11 KB metadata checks every source field, private projection, crosswalk and ownership; RAG stays blocked',async()=>{
  const f=await strictFixture()
  try{
    const cases=[
      ["UPDATE agentstudio.knowledge_bases SET description='changed' WHERE id=$1",'knowledge_bases','description'],
      ["UPDATE agentstudio.knowledge_bases SET name='changed' WHERE id=$1",'knowledge_bases','name'],
      ["UPDATE agentstudio.knowledge_bases SET updated_at=updated_at+interval '1 second' WHERE id=$1",'knowledge_bases','updated_at'],
      ["UPDATE agentstudio.knowledge_bases SET visibility='team' WHERE id=$1",'knowledge_bases','visibility'],
      ['UPDATE agentstudio.knowledge_bases SET team_id=$2 WHERE id=$1','knowledge_bases','team_id'],
      ['UPDATE agentstudio.knowledge_bases SET owner_user_id=$2 WHERE id=$1','knowledge_bases','owner_user_id'],
      ['UPDATE agentstudio.knowledge_bases SET revision=2 WHERE id=$1','knowledge_bases','revision'],
      ["UPDATE agentstudio.legacy_knowledge_base_imports SET payload_sha256=repeat('f',64) WHERE target_base_id=$1",'legacy_knowledge_base_imports','payload_sha256'],
      ["UPDATE agentstudio.legacy_knowledge_base_imports SET legacy_base_id='missing' WHERE target_base_id=$1",'legacy_knowledge_base_imports','legacy_base_id'],
      ["UPDATE agentstudio.legacy_knowledge_base_imports SET source_snapshot_sha256=repeat('f',64) WHERE target_base_id=$1",'legacy_knowledge_base_imports','source_snapshot_sha256'],
    ]
    for(const [sql,table,col] of cases){
      const key=table==='knowledge_bases'?'id':'target_base_id'
      const old=(await f.pg.query(`SELECT ${col} AS value FROM agentstudio.${table} WHERE ${key}=$1`,[a])).rows[0].value
      await f.pg.query(sql,['owner_user_id','team_id'].includes(col)?[a,b]:[a])
      assert.equal(domain(await reconcileStage(f.input,f.pool),'agent_studio_kb_bases')?.status,'failed',col)
      await f.pg.query(`UPDATE agentstudio.${table} SET ${col}=$1 WHERE ${key}=$2`,[old,a])
    }
    const out=await reconcileStage(f.input,f.pool)
    assert.equal(domain(out,'agent_studio_kb_bases').status,'success')
    for(const name of ['agent_studio_kb_documents','agent_studio_kb_chunks','agent_studio_kb_vectors','agent_studio_kb_access','agent_runs','agent_studio_schedules'])
      assert.notEqual(domain(out,name).status,'success')
  }finally{await f.close()}
})

test('W11 IdP evidence is frozen, hash-bound and complete; sanitized failures occur before connecting',async()=>{
  const f=await strictFixture()
  try{
    const original=fs.readFileSync(f.input.reviewed_idp),evidence=JSON.parse(original)
    const mutations=[v=>v.source_sha256='f'.repeat(64),v=>v.records.pop(),
      v=>v.records.push(v.records[0]),v=>v.records[0].external_issuer='http://synthetic.invalid',
      v=>v.records[0].new_studio_user_id=b,v=>delete v.records[0].reviewed_by]
    for(const mutate of mutations){
      const value=structuredClone(evidence);mutate(value)
      fs.writeFileSync(f.input.reviewed_idp,JSON.stringify(value))
      assert.deepEqual((await reconcileStage(f.input,f.pool))[0].blockers,['identity_evidence_invalid'])
    }
    assert.equal(f.connections,0)
    fs.writeFileSync(f.input.reviewed_idp,original)
    const pool={async connect(){const db=await f.pool.connect();return {...db,async query(sql,values){
      const r=await db.query(sql,values)
      if(sql.includes('FROM agentstudio.audit_events'))fs.appendFileSync(f.input.reviewed_idp,' ')
      return r
    }}}}
    assert.deepEqual((await reconcileStage(f.input,pool))[0].blockers,['input_changed'])
    assert.equal(f.statements.at(-1),'ROLLBACK')
  }finally{await f.close()}
})

test('W11 unknown/missing source and target fields, lossful source records, and untracked rows never succeed',async()=>{
  const f=await strictFixture()
  const change=sql=>{const db=new DatabaseSync(f.input.snapshot);try{db.exec(sql)}finally{db.close()}}
  try{
    for(const [table,name] of [['workflows','workflows'],['agent_studio_kb_bases','agent_studio_kb_bases']]){
      change(`ALTER TABLE ${table} ADD COLUMN unknown_even_when_null TEXT`);await f.reseal()
      assert(domain(await reconcileStage(f.input,f.pool),name).blockers.includes('source_fields_unmapped'))
      change(`ALTER TABLE ${table} DROP COLUMN unknown_even_when_null`);await f.reseal()
    }
    for(const [col,value] of [['description','unsupported'],['source','legacy'],['spec_id',raw.id],
      ['graph','{"nodes":[],"nodes":[],"edges":[]}'],['require_approval',0],['created','invalid timestamp']]){
      const db=new DatabaseSync(f.input.snapshot)
      db.prepare(`UPDATE workflows SET ${col}=? WHERE id=?`).run(value,workflows[0].raw.id);db.close();await f.reseal()
      assert.equal(domain(await reconcileStage(f.input,f.pool),'workflows').status,'failed',col)
      const restore=new DatabaseSync(f.input.snapshot)
      restore.prepare(`UPDATE workflows SET ${col}=? WHERE id=?`).run(workflows[0].raw[col],workflows[0].raw.id);restore.close();await f.reseal()
    }
    for(const col of Object.keys(bases[0].raw)){
      const old=bases[0].raw[col]
      const value=col==='rh_user_id'?oldB:typeof old==='number'?old+1:old+'changed'
      const db=new DatabaseSync(f.input.snapshot)
      db.prepare(`UPDATE agent_studio_kb_bases SET ${col}=? WHERE id=?`).run(value,bases[0].raw.id);db.close();await f.reseal()
      assert.equal(domain(await reconcileStage(f.input,f.pool),'agent_studio_kb_bases').status,'failed',col)
      const restore=new DatabaseSync(f.input.snapshot)
      restore.prepare(`UPDATE agent_studio_kb_bases SET ${col}=? WHERE id=?`).run(old,col==='id'?value:bases[0].raw.id);restore.close();await f.reseal()
    }
    assert.equal(domain(await reconcileStage(f.input,f.pool),'workflows').status,'success')
    assert.equal(domain(await reconcileStage(f.input,f.pool),'agent_studio_kb_bases').status,'success')
    await f.pg.exec('INSERT INTO agentstudio.users SELECT gen_random_uuid(),status,external_issuer,external_subject,display_name FROM agentstudio.users LIMIT 1')
    assert.equal(domain(await reconcileStage(f.input,f.pool),'studio_users').status,'failed')
    await f.pg.query('DELETE FROM agentstudio.users WHERE id NOT IN ($1,$2)',[a,b])
    await f.pg.exec('INSERT INTO agentstudio.workflows SELECT gen_random_uuid(),owner_user_id,name,graph,created_at,updated_at,visibility,team_id,revision FROM agentstudio.workflows LIMIT 1')
    assert(domain(await reconcileStage(f.input,f.pool),'workflows').blockers.includes('untracked_targets'))
    await f.pg.query('DELETE FROM agentstudio.workflows WHERE id NOT IN ($1,$2)',[a,b])
    await f.pg.exec('ALTER TABLE agentstudio.legacy_workflow_imports DROP COLUMN source_record')
    assert(domain(await reconcileStage(f.input,f.pool),'workflows').blockers.includes('target_fields_missing'))
    await f.pg.exec('ALTER TABLE agentstudio.knowledge_bases DROP COLUMN description')
    assert(domain(await reconcileStage(f.input,f.pool),'agent_studio_kb_bases').blockers.includes('target_fields_missing'))
    change('ALTER TABLE workflows DROP COLUMN graph; ALTER TABLE agent_studio_kb_bases DROP COLUMN description');await f.reseal()
    const out=await reconcileStage(f.input,f.pool)
    for(const name of ['workflows','agent_studio_kb_bases'])assert(domain(out,name).blockers.includes('source_fields_unmapped'))
  }finally{await f.close()}
})
