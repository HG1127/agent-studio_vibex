import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {prepareAgentRunEventsImport,importLegacyAgentRunEventsToStage} from '../src/stage-agent-run-events-import.ts'
import {prepareHistoryImport,importLegacyHistoryToStage} from '../src/stage-history-import.ts'
import {contentHash} from '../src/stage-agent-import.ts'

const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const a='aaaaaaaaaaaaaaa',b='bbbbbbbbbbbbbbb',w='ccccccccccccccc',s='ddddddddddddddd',r='eeeeeeeeeeeeeee',e='fffffffffffffff'
const ua='11111111-1111-4111-8111-111111111111',ub='22222222-2222-4222-8222-222222222222'
const review={verified_by:'synthetic reviewer',approved_at:'2026-10-15T00:00:00Z'}
const run=()=>({id:r,rh_user_id:a,spec_id:s,spec_name:'Synthetic Agent',instruction:' synthetic historical text ',status:'running',
  current_step:1,max_steps:3,model:'synthetic',config:' { } ',spec_snapshot:null,result:'synthetic result',error:'',checkpoint:' null ',evaluation:'[]',feedback:'{}',
  created:'2026-10-15 00:00:00.000Z',updated:'2026-10-15 01:00:00.000Z'})
const event=()=>({id:e,run_id:r,step_index:0,seq:1,event_type:'synthetic',content:' [ ] ',created:'2026-10-15 00:01:00.000Z',updated:'2026-10-15 00:01:00.000Z'})
function source(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w24-synthetic-'))
  const snapshot=path.join(dir,'frozen.sqlite'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'mapping.json')
  const db=new DatabaseSync(snapshot)
  db.exec('CREATE TABLE studio_users(id TEXT,password TEXT); CREATE TABLE workflows(id TEXT,rh_user_id TEXT,spec_id TEXT,secret TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,secret TEXT)')
  for(const [table,raw] of [['agent_runs',run()],['run_events',event()]]){
    db.exec('CREATE TABLE '+table+'('+Object.keys(raw).map(k=>'"'+k+'" '+(typeof raw[k]==='number'?'NUMERIC':'TEXT')).join(',')+')')
    db.prepare('INSERT INTO '+table+' VALUES('+Object.keys(raw).map(()=>'?').join(',')+')').run(...Object.values(raw))
  }
  for(const owner of [a,b])db.prepare('INSERT INTO studio_users VALUES(?,?)').run(owner,'SYNTHETIC-DO-NOT-ARCHIVE')
  db.prepare('INSERT INTO workflows VALUES(?,?,?,?)').run(w,a,s,'SYNTHETIC-DO-NOT-ARCHIVE')
  db.prepare('INSERT INTO agent_specs VALUES(?,?,?)').run(s,a,'SYNTHETIC-DO-NOT-ARCHIVE')
  db.close()
  const mutate=fn=>{const x=new DatabaseSync(snapshot);try{fn(x)}finally{x.close()}}
  function refresh(){
    const x=new DatabaseSync(snapshot,{readOnly:true});let tables,reviewTables
    try{
      tables=Object.fromEntries(x.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({name})=>[name,x.prepare('SELECT count(*) AS n FROM '+name).get().n]))
      reviewTables=Object.fromEntries(['agent_runs','run_events'].map(t=>[t,{row_sha256:x.prepare('SELECT * FROM '+t+' ORDER BY id').all().map(contentHash)}]))
    }finally{x.close()}
    const sha=hash(snapshot)
    fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:sha,
      records:[[a,ua],[b,ub]].map(([old_id,new_studio_user_id])=>({old_id,new_studio_user_id,...review}))}))
    fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:sha,bytes:fs.statSync(snapshot).size,tables,
      history_archive_review:{source_sha256:sha,table:'agent_runs',credentials_absent:true,...review,row_sha256:reviewTables.agent_runs.row_sha256},
      agent_run_events_archive_review:{source_sha256:sha,identity_mapping_sha256:hash(mapping),credentials_absent:true,...review,tables:{run_events:reviewTables.run_events}}}))
  }
  refresh()
  return {snapshot,manifest,mapping,refresh,mutate,prepare:()=>prepareAgentRunEventsImport(snapshot,manifest,mapping),close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
const edit=(p,fn)=>{const x=JSON.parse(fs.readFileSync(p,'utf8'));fn(x);fs.writeFileSync(p,JSON.stringify(x))}
const count=async(pg,t)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n
async function fixture(){
  const src=source(),pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read('db/postgres/001_stage_schema.sql'))
  const actual=(await pg.query('SELECT current_database() AS db,session_user AS login')).rows[0]
  const adapt=sql=>sql.replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
    .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
    .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999')
  await pg.exec(adapt(read('db/postgres/migrations/pg_v8_012_legacy_run_history.sql')))
  const sql=read('db/postgres/migrations/pg_v9_015_legacy_agent_run_events.sql')
  await assert.rejects(pg.exec(sql),/agent_run_events_wrong_stage/);await pg.exec('ROLLBACK')
  await pg.exec(adapt(sql));await pg.exec(adapt(sql))
  await pg.exec("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v8_005','synthetic') ON CONFLICT DO NOTHING")
  await pg.exec(adapt(read('db/postgres/migrations/pg_v8_011_legacy_user_provision.sql')))
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'synthetic','a','disabled'),($2,'synthetic','b','active')",[ua,ub])
  const syncIdentity=async()=>{
    await pg.query('DELETE FROM agentstudio.legacy_user_imports')
    for(const [old,target] of [[a,ua],[b,ub]])await pg.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$5)',[hash(src.snapshot),old,target,hash(src.mapping),'1'.repeat(64)])
  }
  await syncIdentity()
  const pool=(options={})=>({async connect(){let inserts=0;return {release(){},async query(sql,values=[]){
    if(sql.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',admin:true,version:170004,...options.guard}]}
    if(sql.startsWith('INSERT INTO agentstudio.legacy_agent_run_events')&&++inserts===2&&options.failSecond)return pg.query('SELECT 1/0')
    const result=await pg.query(sql,values)
    if(options.corrupt&&sql.startsWith('SELECT * FROM agentstudio.legacy_agent_run_events'))result.rows[0].source_record.content='corrupt'
    if(options.extraCount&&sql.startsWith('SELECT count(*)::int'))result.rows[0].n++
    return result
  }}}})
  const seedParents=()=>importLegacyHistoryToStage(pool(),prepareHistoryImport(src.snapshot,src.manifest,src.mapping))
  return {...src,pg,pool,syncIdentity,seedParents,close:async()=>{await pg.close();src.close()}}
}

test('1 run + 1 event preserves lexical content, SHA and inert running history; replay',async()=>{
 const f=await fixture();try{
  await f.seedParents();const plan=f.prepare(),before=hash(f.snapshot)
  const result=await importLegacyAgentRunEventsToStage(f.pool(),plan)
  assert.equal(result.imported,1);assert.equal(result.execution_enabled,false);assert.equal(result.production_cutover_allowed,false)
  const row=(await f.pg.query('SELECT * FROM agentstudio.legacy_agent_run_events')).rows[0]
  assert.deepEqual(row.source_record,event());assert.equal(row.payload_sha256,contentHash(event()))
  for(const k of ['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256'])assert.equal(row[k],plan[k])
  assert.equal(row.owner_user_id,ua);assert.equal(row.legacy_run_id,r)
  assert.equal((await importLegacyAgentRunEventsToStage(f.pool(),f.prepare())).replayed,1)
  assert.equal(await count(f.pg,'legacy_run_history'),1);assert.equal(hash(f.snapshot),before)
  for(const t of ['runs','jobs','run_steps','approvals','external_effects','run_leases','schedules'])assert.equal(await count(f.pg,t),0)
 }finally{await f.close()}
})

test('DBA immutable; API/worker raw access denied, accidental SELECT grants still RLS invisible for either owner',async()=>{
  const f=await fixture();try{
    await f.seedParents()
    await importLegacyAgentRunEventsToStage(f.pool(),f.prepare())
    for(const role of ['agentstudio_api','agentstudio_worker']){
      await f.pg.exec('SET ROLE '+role)
      try{for(const sql of ['SELECT * FROM agentstudio.legacy_agent_run_events','INSERT INTO agentstudio.legacy_agent_run_events DEFAULT VALUES','UPDATE agentstudio.legacy_agent_run_events SET executable=true','DELETE FROM agentstudio.legacy_agent_run_events','TRUNCATE agentstudio.legacy_agent_run_events'])await assert.rejects(f.pg.query(sql),/permission denied/)}finally{await f.pg.exec('RESET ROLE')}
    }
    await f.pg.exec('GRANT SELECT ON agentstudio.legacy_agent_run_events TO agentstudio_api,agentstudio_worker')
    for(const role of ['agentstudio_api','agentstudio_worker'])for(const owner of [ua,ub]){
      await f.pg.query("SELECT set_config('app.user_id',$1,false)",[owner]);await f.pg.exec('SET ROLE '+role)
      try{assert.equal((await f.pg.query('SELECT * FROM agentstudio.legacy_agent_run_events')).rows.length,0)}finally{await f.pg.exec('RESET ROLE')}
    }
    for(const sql of ['UPDATE agentstudio.legacy_agent_run_events SET executable=false','DELETE FROM agentstudio.legacy_agent_run_events','TRUNCATE agentstudio.legacy_agent_run_events'])await assert.rejects(f.pg.query(sql),/legacy_agent_run_events_immutable/)
  }finally{await f.close()}
})

test('atomic rollback on real SQL failure after first event, corrupt readback and count mismatch; safe retry',async()=>{
  const f=await fixture();try{
    f.mutate(x=>x.prepare('INSERT INTO run_events VALUES(?,?,?,?,?,?,?,?)').run(...Object.values({...event(),id:'ggggggggggggggg',seq:2})))
    f.refresh();await f.syncIdentity();await f.seedParents()
    for(const opts of [{failSecond:true},{corrupt:true},{extraCount:true}]){
      await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(opts),f.prepare()),/agent_run_events_(sql_failed|reconciliation_mismatch|batch_incomplete)/)
      assert.equal(await count(f.pg,'legacy_agent_run_events'),0);assert.equal(await count(f.pg,'jobs'),0)
    }
    assert.equal((await importLegacyAgentRunEventsToStage(f.pool(),f.prepare())).imported,2)
  }finally{await f.close()}
})

test('stage PG17/admin guard, forged and mutated plans, exact reviewed identity for active/disabled owners',async()=>{
  const f=await fixture();try{
    await f.seedParents()
    for(const guard of [{database:'production'},{login:'agentstudio_api'},{admin:false},{version:160000},{version:180000}])await assert.rejects(importLegacyAgentRunEventsToStage(f.pool({guard}),f.prepare()),/wrong_stage/)
    const p=f.prepare();await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),structuredClone(p)),/unverified_or_mutated/)
    await assert.rejects(importLegacyAgentRunEventsToStage({connect:async()=>{throw Error('sensitive connection detail')}},f.prepare()),err=>err.message==='agent_run_events_sql_failed')
    p.rows[0].owner_user_id=ub;await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),p),/unverified_or_mutated/)
    for(const status of ['active','disabled']){
      await f.pg.query('UPDATE agentstudio.users SET status=$1 WHERE id=$2',[status,ua])
      await f.pg.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1',['0'.repeat(64)])
      await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),f.prepare()),/target_identity_unverified/)
      assert.equal(await count(f.pg,'legacy_agent_run_events'),0)
    }
    await f.syncIdentity();await importLegacyAgentRunEventsToStage(f.pool(),f.prepare())
  }finally{await f.close()}
})

test('different source, reviewed mapping or review manifest cannot replace an archive',async()=>{
  const f=await fixture();try{
    await f.seedParents()
    await importLegacyAgentRunEventsToStage(f.pool(),f.prepare())
    edit(f.manifest,x=>x.agent_run_events_archive_review.verified_by='second reviewer')
    await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    f.refresh();edit(f.mapping,x=>x.records[0].verified_by='second reviewer')
    edit(f.manifest,x=>x.agent_run_events_archive_review.identity_mapping_sha256=hash(f.mapping))
    await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    f.mutate(x=>x.prepare('UPDATE agent_runs SET result=?').run('changed'));f.refresh()
    await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    assert.equal(await count(f.pg,'legacy_agent_run_events'),1)
  }finally{await f.close()}
})

test('source schema, complete manifest, owner/workflow/spec/run references, JSON, credentials, row reviews fail closed',()=>{
  const changes=[
    [f=>fs.appendFileSync(f.snapshot,'changed'),/manifest_invalid/],
    [f=>fs.writeFileSync(f.snapshot+'-wal','synthetic'),/source_not_frozen/],
    [f=>edit(f.manifest,x=>delete x.tables.agent_specs),/manifest_(not_complete|missing_table)/],
    [f=>edit(f.manifest,x=>x.tables.run_events++),/manifest_count_mismatch/],
    [f=>{f.mutate(x=>x.exec('ALTER TABLE agent_runs ADD COLUMN extra TEXT'));f.refresh()},/unknown_or_missing/],
    [f=>{f.mutate(x=>x.exec('ALTER TABLE run_events DROP COLUMN content'));f.refresh()},/unknown_or_missing/],
    [f=>{f.mutate(x=>x.prepare('UPDATE run_events SET run_id=?').run(b));f.refresh()},/run_missing_or_foreign/],
    [f=>{f.mutate(x=>x.prepare('UPDATE run_events SET content=?').run('{"text":"opaque"}'));f.refresh()},/structured_history_not_supported/],
    [f=>{f.mutate(x=>x.prepare('UPDATE run_events SET seq=?').run(0.5));f.refresh()},/number_not_lossless/],
    [f=>{f.mutate(x=>x.prepare('UPDATE run_events SET event_type=?').run('nul\0text'));f.refresh()},/text_not_lossless/],
    [f=>edit(f.manifest,x=>delete x.agent_run_events_archive_review),/content_review_required/],
    [f=>edit(f.manifest,x=>x.agent_run_events_archive_review.credentials_absent=false),/content_review_required/],
    [f=>edit(f.manifest,x=>x.agent_run_events_archive_review.tables.run_events.row_sha256[0]='0'.repeat(64)),/review_or_count_mismatch/],
    [f=>{edit(f.mapping,x=>delete x.records[0].verified_by);edit(f.manifest,x=>x.agent_run_events_archive_review.identity_mapping_sha256=hash(f.mapping))},/owner_unverified/],
    [f=>{edit(f.mapping,x=>x.records.pop());edit(f.manifest,x=>x.agent_run_events_archive_review.identity_mapping_sha256=hash(f.mapping))},/mapping_incomplete/],
    [f=>{edit(f.mapping,x=>x.records[1].new_studio_user_id=ua);edit(f.manifest,x=>x.agent_run_events_archive_review.identity_mapping_sha256=hash(f.mapping))},/mapping_collision/],
  ]
  for(const [i,[change,expected]] of changes.entries()){const f=source();try{change(f);assert.throws(f.prepare,expected,'source rejection case '+i)}finally{f.close()}}
})



test('missing PG parent and foreign owner/snapshot/review are rejected by readback and composite FK',async()=>{
 const f=await fixture();try{
  const plan=f.prepare()
  await assert.rejects(importLegacyAgentRunEventsToStage(f.pool(),plan),/parent_missing_or_foreign/)
  await f.seedParents()
  const insert=async(overrides={})=>{
   const base={source_snapshot_sha256:plan.source_snapshot_sha256,identity_mapping_sha256:plan.identity_mapping_sha256,manifest_sha256:plan.manifest_sha256,owner_user_id:ua,legacy_run_id:r,...overrides}
   return f.pg.query("INSERT INTO agentstudio.legacy_agent_run_events(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,source_record,payload_sha256) VALUES($1,$2,$3,'run_events',$4,$5,$6,$7::jsonb,$8)",
    [base.source_snapshot_sha256,base.identity_mapping_sha256,base.manifest_sha256,e,base.owner_user_id,base.legacy_run_id,JSON.stringify({...event(),run_id:base.legacy_run_id}),contentHash(event())])
  }
  for(const change of [{owner_user_id:ub},{legacy_run_id:b},...['source_snapshot_sha256','identity_mapping_sha256','manifest_sha256'].map(k=>({[k]:'0'.repeat(64)}))])await assert.rejects(insert(change),/foreign key/)
  for(const k of ['owner_user_id','source_snapshot_sha256','identity_mapping_sha256','manifest_sha256','payload_sha256','source_record']){
   const pool={async connect(){const db=await f.pool().connect();return {...db,async query(sql,v){const result=await db.query(sql,v);if(sql.startsWith('SELECT * FROM agentstudio.legacy_run_history'))result.rows[0][k]=k==='owner_user_id'?ub:k==='source_record'?{}:'0'.repeat(64);return result}}}}
   await assert.rejects(importLegacyAgentRunEventsToStage(pool,plan),/parent_missing_or_foreign/)
  }
  assert.equal(await count(f.pg,'legacy_agent_run_events'),0)
  const rls=(await f.pg.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='agentstudio.legacy_agent_run_events'::regclass")).rows[0]
  assert.deepEqual(rls,{relrowsecurity:true,relforcerowsecurity:true})
  assert.equal((await f.pg.query("SELECT * FROM pg_policies WHERE schemaname='agentstudio' AND tablename='legacy_agent_run_events'")).rows.length,0)
  await importLegacyAgentRunEventsToStage(f.pool(),plan)
 }finally{await f.close()}
})

test('all four audited empty representations retain lexical whitespace; empty event table is explicit',async()=>{
 const f=await fixture();try{
  const values=[' \t{ \r\n } ',' [ ] ',' null ',null]
  f.mutate(x=>{x.exec('DELETE FROM run_events');for(const [i,content] of values.entries())x.prepare('INSERT INTO run_events VALUES(?,?,?,?,?,?,?,?)').run(...Object.values({...event(),id:String(i).repeat(15),content}))})
  f.refresh();await f.syncIdentity();await f.seedParents()
  assert.equal((await importLegacyAgentRunEventsToStage(f.pool(),f.prepare())).imported,4)
  const stored=(await f.pg.query('SELECT source_record FROM agentstudio.legacy_agent_run_events ORDER BY legacy_id')).rows
  assert.deepEqual(stored.map(r=>r.source_record.content),values)
 }finally{await f.close()}
 const s=await fixture();try{
  s.mutate(x=>x.exec('DELETE FROM run_events'));s.refresh();await s.syncIdentity();await s.seedParents()
  assert.equal((await importLegacyAgentRunEventsToStage(s.pool(),s.prepare())).reconciled,0)
 }finally{await s.close()}
})

test('orphan, hidden/generated, extra fields, unsupported JSON and unsafe text never skipped',()=>{
 const changes=[
  x=>x.exec('DELETE FROM agent_runs'),
  x=>x.exec('ALTER TABLE run_events ADD COLUMN hidden TEXT GENERATED ALWAYS AS (id) VIRTUAL'),
  x=>x.exec('ALTER TABLE run_events ADD COLUMN extra TEXT'),
  x=>x.exec('DELETE FROM studio_users'),
  ...['{"reply":"synthetic"}','{"tool_calls":[]}','"scalar"','true','0','\u00a0{}'].map(v=>x=>x.prepare('UPDATE run_events SET content=?').run(v)),
  x=>x.prepare('UPDATE run_events SET event_type=?').run('api_key=SYNTHETIC'),
  x=>x.prepare('UPDATE agent_runs SET result=?').run('prefix\0suffix')
 ]
 for(const change of changes){const f=source();try{f.mutate(change);f.refresh();assert.throws(f.prepare,/agent_run_events_/)}finally{f.close()}}
})
