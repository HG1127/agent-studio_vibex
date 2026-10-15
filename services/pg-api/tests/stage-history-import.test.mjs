import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {prepareHistoryImport,importLegacyHistoryToStage} from '../src/stage-history-import.ts'
import {contentHash} from '../src/stage-agent-import.ts'

const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const oldA='aaaaaaaaaaaaaaa',oldB='bbbbbbbbbbbbbbb',spec='ccccccccccccccc'
const uuidA='11111111-1111-4111-8111-111111111111',uuidB='22222222-2222-4222-8222-222222222222'
const record=(id=oldA,owner=oldA)=>({id,rh_user_id:owner,spec_id:spec,spec_name:'Synthetic Agent',instruction:' 保留全文\n\t instruction ',
  status:'succeeded',current_step:3,max_steps:9,model:'synthetic-model',config:' { } ',spec_snapshot:null,result:' 合成历史\n result '.repeat(2000),
  error:'',checkpoint:'null',evaluation:'[]',feedback:'{}',created:'2026-10-15 00:00:00.000Z',updated:'2026-10-15 01:00:00.000Z'})
function source(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w8-synthetic-'))
  const snapshot=path.join(dir,'frozen.sqlite'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'map.json')
  const db=new DatabaseSync(snapshot),raw=record(),keys=Object.keys(raw)
  db.exec('CREATE TABLE studio_users(id TEXT,password TEXT,tokenKey TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,secret TEXT); '+
    'CREATE TABLE agent_runs('+keys.map(k=>'"'+k+'" '+(typeof raw[k]==='number'?'INTEGER':'TEXT')).join(',')+'); '+
    'CREATE TABLE workflow_runs(id TEXT); CREATE TABLE run_events(id TEXT); CREATE TABLE agent_studio_side_effects(id TEXT)')
  db.prepare('INSERT INTO studio_users VALUES(?,?,?)').run(oldA,'SYNTHETIC-DO-NOT-ARCHIVE','SYNTHETIC-DO-NOT-ARCHIVE')
  db.prepare('INSERT INTO studio_users VALUES(?,?,?)').run(oldB,'SYNTHETIC-DO-NOT-ARCHIVE','SYNTHETIC-DO-NOT-ARCHIVE')
  db.prepare('INSERT INTO agent_specs VALUES(?,?,?)').run(spec,oldA,'SYNTHETIC-DO-NOT-ARCHIVE')
  for(const r of [record(),record(oldB)])db.prepare('INSERT INTO agent_runs VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(r))
  db.close()
  const mutate=fn=>{const sqlite=new DatabaseSync(snapshot);try{fn(sqlite)}finally{sqlite.close()}}
  function refresh(){
    const sqlite=new DatabaseSync(snapshot,{readOnly:true});let rows,tables
    try{
      rows=sqlite.prepare('SELECT * FROM agent_runs ORDER BY id').all()
      tables=Object.fromEntries(['studio_users','agent_specs','agent_runs','workflow_runs','run_events','agent_studio_side_effects'].map(t=>[t,sqlite.prepare('SELECT count(*) AS n FROM '+t).get().n]))
    }finally{sqlite.close()}
    const sha=hash(snapshot)
    fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:sha,bytes:fs.statSync(snapshot).size,tables,
      history_archive_review:{source_sha256:sha,table:'agent_runs',credentials_absent:true,verified_by:'synthetic-reviewer',approved_at:'2026-10-15T00:00:00Z',row_sha256:rows.map(contentHash)}}))
    fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:sha,records:[[oldA,uuidA],[oldB,uuidB]].map(([old_id,new_studio_user_id])=>
      ({old_id,new_studio_user_id,verified_by:'synthetic-reviewer',approved_at:'2026-10-15T00:00:00Z'}))}))
  }
  refresh()
  return {snapshot,manifest,mapping,refresh,mutate,prepare:()=>prepareHistoryImport(snapshot,manifest,mapping),
    close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
async function fixture(){
  const src=source(),pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read('db/postgres/001_stage_schema.sql'))
  const actual=(await pg.query('SELECT current_database() AS db,session_user AS login')).rows[0]
  const migration=read('db/postgres/migrations/pg_v8_012_legacy_run_history.sql')
  await assert.rejects(pg.exec(migration),/history_wrong_stage_database_or_version/);await pg.exec('ROLLBACK')
  const adapted=migration.replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
    .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
    .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999')
  await pg.exec(adapted);await pg.exec(adapted)
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'synthetic','a','active'),($2,'synthetic','b','active')",[uuidA,uuidB])
  const pool=(options={})=>({async connect(){let inserts=0;return {release(){},async query(sql,values=[]){
    if(sql.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',admin:true,version:170004,...options.guard}]}
    if(sql.startsWith('INSERT INTO agentstudio.legacy_run_history')&&++inserts===2&&options.failSecond)throw Error('synthetic SQL failure with sensitive detail')
    const result=await pg.query(sql,values)
    if(options.corrupt&&sql.startsWith('SELECT * FROM agentstudio.legacy_run_history'))result.rows[0].source_record.result='corrupt'
    if(options.extraCount&&sql.startsWith('SELECT count(*)::int'))result.rows[0].n++
    return result
  }}}})
  return {...src,pg,pool,close:async()=>{await pg.close();src.close()}}
}
const count=async(pg,table)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n

test('lossless DBA-only archive, idempotent stable crosswalk; no executable state',async()=>{
  const f=await fixture();try{
    const before=hash(f.snapshot),plan=f.prepare()
    const result=await importLegacyHistoryToStage(f.pool(),plan)
    assert.equal(result.imported,2);assert.equal(result.reconciled,2);assert.equal(result.execution_enabled,false)
    const stored=(await f.pg.query('SELECT * FROM agentstudio.legacy_run_history ORDER BY legacy_id')).rows
    assert.deepEqual(stored[0].source_record,record())
    assert.equal(stored[0].source_record.status,'succeeded');assert.equal(stored[0].evidence_status,'historical_unverified')
    assert.equal(stored[0].source_record.result.length,record().result.length)
    assert.equal(JSON.stringify(stored).includes('SYNTHETIC-DO-NOT-ARCHIVE'),false)
    assert.equal((await importLegacyHistoryToStage(f.pool(),f.prepare())).replayed,2)
    assert.deepEqual((await f.pg.query('SELECT archive_id FROM agentstudio.legacy_run_history ORDER BY legacy_id')).rows,stored.map(r=>({archive_id:r.archive_id})))
    for(const table of ['runs','jobs','run_steps','approvals','external_effects','run_leases'])assert.equal(await count(f.pg,table),0)
    assert.equal(hash(f.snapshot),before)
    for(const role of ['agentstudio_api','agentstudio_worker']){
      await f.pg.exec('SET ROLE '+role)
      try{
        for(const sql of ['SELECT * FROM agentstudio.legacy_run_history','INSERT INTO agentstudio.legacy_run_history DEFAULT VALUES',
          'UPDATE agentstudio.legacy_run_history SET executable=true','DELETE FROM agentstudio.legacy_run_history','TRUNCATE agentstudio.legacy_run_history'])
          await assert.rejects(f.pg.query(sql),/permission denied/)
      }finally{await f.pg.exec('RESET ROLE')}
    }
    // Even accidental future SELECT grants remain blocked by forced RLS.
    await f.pg.exec('GRANT SELECT ON agentstudio.legacy_run_history TO agentstudio_api,agentstudio_worker')
    for(const role of ['agentstudio_api','agentstudio_worker']){
      await f.pg.exec('SET ROLE '+role)
      try{assert.equal((await f.pg.query('SELECT * FROM agentstudio.legacy_run_history')).rows.length,0)}finally{await f.pg.exec('RESET ROLE')}
    }
    for(const sql of ['UPDATE agentstudio.legacy_run_history SET executable=false','DELETE FROM agentstudio.legacy_run_history','TRUNCATE agentstudio.legacy_run_history'])
      await assert.rejects(f.pg.query(sql),/legacy_history_immutable/)
  }finally{await f.close()}
})

test('single transaction rolls back SQL crash, corrupted readback and count mismatch; retry works',async()=>{
  const f=await fixture();try{
    for(const opts of [{failSecond:true},{corrupt:true},{extraCount:true}]){
      await assert.rejects(importLegacyHistoryToStage(f.pool(opts),f.prepare()),/history_(sql_failed|reconciliation_mismatch|batch_incomplete)/)
      assert.equal(await count(f.pg,'legacy_run_history'),0)
    }
    assert.equal((await importLegacyHistoryToStage(f.pool(),f.prepare())).imported,2)
  }finally{await f.close()}
})

test('reject non-stage/non-admin/non-PG17, forged/mutated plans, inactive owner',async()=>{
  const f=await fixture();try{
    for(const guard of [{database:'production'},{login:'agentstudio_worker'},{admin:false},{version:180000},{version:160000}])
      await assert.rejects(importLegacyHistoryToStage(f.pool({guard}),f.prepare()),/wrong_stage/)
    const plan=f.prepare()
    await assert.rejects(importLegacyHistoryToStage(f.pool(),structuredClone(plan)),/unverified_or_mutated/)
    plan.rows[0].source_record.result='changed'
    await assert.rejects(importLegacyHistoryToStage(f.pool(),plan),/unverified_or_mutated/)
    await f.pg.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[uuidA])
    await assert.rejects(importLegacyHistoryToStage(f.pool(),f.prepare()),/target_owner_unverified/)
    assert.equal(await count(f.pg,'legacy_run_history'),0)
  }finally{await f.close()}
})

test('different snapshot, review or approved mapping cannot replace existing archive',async()=>{
  const f=await fixture();try{
    await importLegacyHistoryToStage(f.pool(),f.prepare())
    const json=p=>JSON.parse(fs.readFileSync(p,'utf8'))
    const review=json(f.manifest);review.history_archive_review.verified_by='second synthetic reviewer';fs.writeFileSync(f.manifest,JSON.stringify(review))
    await assert.rejects(importLegacyHistoryToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    f.refresh()
    const mapping=json(f.mapping);mapping.records[0].verified_by='second synthetic reviewer';fs.writeFileSync(f.mapping,JSON.stringify(mapping))
    await assert.rejects(importLegacyHistoryToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    f.mutate(db=>db.prepare('UPDATE agent_runs SET result=? WHERE id=?').run('changed source',oldA));f.refresh()
    await assert.rejects(importLegacyHistoryToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    assert.equal(await count(f.pg,'legacy_run_history'),2)
  }finally{await f.close()}
})

test('disabled employee requires same-snapshot exact reviewed v2 identity crosswalk',async()=>{
  const f=await fixture();try{
    const actual=(await f.pg.query('SELECT current_database() AS db,session_user AS login')).rows[0]
    await f.pg.query("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v8_005','synthetic baseline') ON CONFLICT DO NOTHING")
    await f.pg.exec(read('db/postgres/migrations/pg_v8_011_legacy_user_provision.sql')
      .replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
      .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
      .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999'))
    await f.pg.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[uuidA])
    await f.pg.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) '+
      'VALUES($1,$2,$3,$4,$5,$5)',[hash(f.snapshot),oldA,uuidA,'0'.repeat(64),'1'.repeat(64)])
    await assert.rejects(importLegacyHistoryToStage(f.pool(),f.prepare()),/target_identity_crosswalk_mismatch/)
    assert.equal(await count(f.pg,'legacy_run_history'),0)
    await f.pg.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1',[hash(f.mapping)])
    assert.equal((await importLegacyHistoryToStage(f.pool(),f.prepare())).imported,2)
    assert.equal((await f.pg.query('SELECT status FROM agentstudio.users WHERE id=$1',[uuidA])).rows[0].status,'disabled')
  }finally{await f.close()}
})

test('frozen-source fail closed: SHA, counts, schema, references, nested JSON, credentials, review and mappings',()=>{
  const cases=[
    [f=>fs.appendFileSync(f.snapshot,'changed'),/manifest_invalid/],
    [f=>fs.writeFileSync(f.snapshot+'-wal','synthetic'),/source_not_frozen/],
    [f=>{const x=JSON.parse(fs.readFileSync(f.manifest));x.tables.agent_runs++;fs.writeFileSync(f.manifest,JSON.stringify(x))},/manifest_count_mismatch/],
    [f=>{f.mutate(db=>db.exec('ALTER TABLE agent_runs ADD COLUMN unknown TEXT'));f.refresh()},/unknown_or_missing_field/],
    [f=>{f.mutate(db=>db.exec('ALTER TABLE agent_runs DROP COLUMN spec_snapshot'));f.refresh()},/unknown_or_missing_field/],
    [f=>{f.mutate(db=>db.exec('DELETE FROM agent_specs'));f.refresh()},/spec_missing_or_foreign/],
    [f=>{f.mutate(db=>db.prepare('UPDATE agent_specs SET rh_user_id=?').run(oldB));f.refresh()},/spec_missing_or_foreign/],
    [f=>{f.mutate(db=>db.prepare('UPDATE agent_runs SET rh_user_id=?').run('unknownunknown1'));f.refresh()},/identity_or_reference_invalid/],
    [f=>{f.mutate(db=>db.prepare('UPDATE agent_runs SET config=?').run('{"model_connection_id":"unknown"}'));f.refresh()},/structured_history_not_supported/],
    [f=>{f.mutate(db=>db.prepare('UPDATE agent_runs SET instruction=?').run('api_key=SYNTHETIC'));f.refresh()},/possible_secret/],
    [f=>{const x=JSON.parse(fs.readFileSync(f.manifest));delete x.history_archive_review;fs.writeFileSync(f.manifest,JSON.stringify(x))},/content_review_required/],
    [f=>{const x=JSON.parse(fs.readFileSync(f.manifest));x.history_archive_review.row_sha256[0]='0'.repeat(64);fs.writeFileSync(f.manifest,JSON.stringify(x))},/review_or_count_mismatch/],
    [f=>{const x=JSON.parse(fs.readFileSync(f.mapping));x.records.pop();fs.writeFileSync(f.mapping,JSON.stringify(x))},/mapping_incomplete/],
    [f=>{const x=JSON.parse(fs.readFileSync(f.mapping));x.records[1].new_studio_user_id=uuidA;fs.writeFileSync(f.mapping,JSON.stringify(x))},/mapping_collision/],
  ]
  for(const [change,expected] of cases){const f=source();try{change(f);assert.throws(f.prepare,expected)}finally{f.close()}}
})
