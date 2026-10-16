import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {contentHash} from '../src/stage-agent-import.ts'
import {prepareHistoryImport,importLegacyHistoryToStage} from '../src/stage-history-import.ts'
import {prepareWorkflowHistoryImport,importLegacyWorkflowHistoryToStage} from '../src/stage-workflow-history-import.ts'
import {prepareExecutionFenceImport,importLegacyExecutionFenceToStage,executionFenceSqlSha256} from '../src/stage-execution-fence-import.ts'

const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8')
const sql=p=>read(p).split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const migration='db/postgres/migrations/pg_v9_017_legacy_execution_fence_archive.sql'
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const a='aaaaaaaaaaaaaaa',b='bbbbbbbbbbbbbbb',ar='rrrrrrrrrrrrrrr',wr='wwwwwwwwwwwwwww',spec='sssssssssssssss',workflow='vvvvvvvvvvvvvvv'
const ua='11111111-1111-4111-8111-111111111111',ub='22222222-2222-4222-8222-222222222222'
const at='2026-10-16T00:00:00Z'
const identityReview={verified_by:'synthetic identity reviewer',approved_at:at}
const attest={reviewed_by:'independent synthetic content reviewer',reviewed_at:at,credentials_absent:true,inert_opaque_text:true}
const reviewTables=['agent_runs','workflow_runs','agent_studio_run_leases','agent_studio_side_effects']
const agent=()=>({id:ar,rh_user_id:a,spec_id:spec,spec_name:'synthetic agent',instruction:'history',status:'running',current_step:0,max_steps:3,model:'',config:'{}',spec_snapshot:'{}',result:'',error:'',checkpoint:'null',evaluation:'{}',feedback:'{}',created:at,updated:at})
const flow=()=>({id:wr,rh_user_id:b,workflow_id:workflow,workflow_name:'synthetic workflow',instruction:'history',status:'running',graph_snapshot:'{}',checkpoint:'null',result:'',error:'',done_nodes:0,total_nodes:2,created:at,updated:at})
const leases=()=>[
  {kind:'agent',run_id:ar,lease_token:'inert opaque A',acquired_ms:1,expires_ms:2,attempts:1},
  {kind:'workflow',run_id:wr,lease_token:'inert opaque B',acquired_ms:2,expires_ms:9007199254740991,attempts:3},
]
const effects=()=>[
  {kind:'agent',run_id:ar,step_key:'step-1',tool_name:'synthetic',args_hash:'a'.repeat(64),idempotency_key:'inert opaque A',status:'started',result_text:' 原样\n\t 😀 ',created_ms:1,updated_ms:2},
  {kind:'workflow',run_id:wr,step_key:'step-2',tool_name:'synthetic',args_hash:'b'.repeat(64),idempotency_key:'inert opaque B',status:'unknown',result_text:' historical\nopaque ',created_ms:1,updated_ms:3},
]
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x))
const edit=(p,fn)=>{const x=JSON.parse(fs.readFileSync(p,'utf8'));fn(x);write(p,x)}
function source(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w27-synthetic-'))
  const snapshot=path.join(dir,'frozen.sqlite'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'mapping.json'),review=path.join(dir,'review.json')
  const db=new DatabaseSync(snapshot)
  // Execute the application's actual source schema through its journal adapter.
  const context={module:{exports:{}},__hooks:'/synthetic',require:()=>({applySteps(_app,steps){
    for(const step of steps)step.apply({db:()=>({newQuery:s=>({execute:()=>db.exec(s)})})})
  }})}
  vm.runInNewContext(read('pocketbase/pb_hooks/modules/runtime_schema.js'),context)
  context.module.exports.applyExecutionMigrations({})
  db.exec('CREATE TABLE studio_users(id TEXT,password TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT); CREATE TABLE workflows(id TEXT,rh_user_id TEXT,spec_id TEXT)')
  for(const raw of [agent(),flow()]){
    const table=raw.id===ar?'agent_runs':'workflow_runs'
    db.exec('CREATE TABLE '+table+'('+Object.keys(raw).map(k=>k+' '+(typeof raw[k]==='number'?'INTEGER':'TEXT')).join(',')+')')
    db.prepare('INSERT INTO '+table+' VALUES('+Object.keys(raw).map(()=>'?').join(',')+')').run(...Object.values(raw))
  }
  db.exec('CREATE TABLE workflow_events(id TEXT,run_id TEXT,node_id TEXT,seq INTEGER,event_type TEXT,content TEXT,created TEXT,updated TEXT)')
  for(const [old] of [[a],[b]])db.prepare('INSERT INTO studio_users VALUES(?,?)').run(old,'SYNTHETIC-CREDENTIAL-NEVER-ARCHIVED')
  db.prepare('INSERT INTO agent_specs VALUES(?,?)').run(spec,a)
  db.prepare('INSERT INTO workflows VALUES(?,?,?)').run(workflow,b,'')
  for(const [table,rows] of [['agent_studio_run_leases',leases()],['agent_studio_side_effects',effects()]])for(const row of rows)
    db.prepare('INSERT INTO '+table+' VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row))
  db.close()
  const mutate=fn=>{const x=new DatabaseSync(snapshot);try{fn(x)}finally{x.close()}}
  function refresh(){
    const x=new DatabaseSync(snapshot,{readOnly:true})
    try{
      const rawRows=t=>{
        const stmt=x.prepare('SELECT * FROM '+t);stmt.setReadBigInts(true)
        // Synthetic negative tests deliberately include out-of-range integers.
        // The importer must reject those even if a bogus reviewer hashed them.
        return stmt.all().map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v])))
      }
      const sha=hash(snapshot)
      const tables=Object.fromEntries(x.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>[name,x.prepare('SELECT count(*) AS n FROM '+name).get().n]))
      write(mapping,{schema_version:'studio-approved-identity-map-v2',source_sha256:sha,records:[[a,ua],[b,ub]].map(([old_id,new_studio_user_id])=>({old_id,new_studio_user_id,...identityReview}))})
      const historyReview={source_sha256:sha,identity_mapping_sha256:hash(mapping),credentials_absent:true,...identityReview}
      write(manifest,{format:'agent-studio-sqlite-snapshot-v1',sha256:sha,bytes:fs.statSync(snapshot).size,tables,
        history_archive_review:{...historyReview,table:'agent_runs',row_sha256:x.prepare('SELECT * FROM agent_runs').all().map(contentHash)},
        workflow_history_archive_review:{...historyReview,tables:Object.fromEntries(['workflow_runs','workflow_events'].map(t=>[t,{row_sha256:x.prepare('SELECT * FROM '+t).all().map(contentHash)}]))}})
      // Only synthetic tests generate approvals. Real callers supply independently
      // reviewed files and an out-of-band trusted digest; never auto-attest data.
      write(review,{format:'studio-execution-fence-source-review-v1',source_sha256:sha,identity_mapping_sha256:hash(mapping),manifest_sha256:hash(manifest),...attest,
        tables:Object.fromEntries(reviewTables.map(t=>[t,{...attest,rows:rawRows(t).map(row=>({...attest,row_sha256:contentHash(row)}))}]))})
    }finally{x.close()}
  }
  refresh()
  return {snapshot,manifest,mapping,review,refresh,mutate,prepare:()=>prepareExecutionFenceImport(snapshot,manifest,mapping,review,hash(review)),close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
const count=async(pg,t)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n
async function fixture(){
  const src=source(),pg=await PGlite.create({extensions:{vector}})
  await pg.exec(sql('db/postgres/001_stage_schema.sql'))
  const actual=(await pg.query('SELECT current_database() AS db,session_user AS login')).rows[0]
  // Explicit PGlite-only adaptation; no connector or real PG17 claims.
  const adapt=s=>s.replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
    .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
    .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999')
  await pg.exec("INSERT INTO agentstudio.schema_migrations(version,description) VALUES('pg_v8_005','synthetic') ON CONFLICT DO NOTHING")
  for(const file of ['pg_v8_011_legacy_user_provision.sql','pg_v8_012_legacy_run_history.sql','pg_v9_014_legacy_workflow_history.sql'])await pg.exec(adapt(sql('db/postgres/migrations/'+file)))
  await assert.rejects(pg.exec(sql(migration)),/execution_fence_wrong_stage/);await pg.exec('ROLLBACK')
  await pg.exec(adapt(sql(migration)));await pg.exec(adapt(sql(migration)))
  await pg.query("INSERT INTO agentstudio.users(id,external_issuer,external_subject,status) VALUES($1,'synthetic','a','disabled'),($2,'synthetic','b','active')",[ua,ub])
  for(const [old,target] of [[a,ua],[b,ub]])await pg.query('INSERT INTO agentstudio.legacy_user_imports(source_snapshot_sha256,legacy_user_id,target_user_id,reviewed_mapping_sha256,reviewed_idp_sha256,identity_row_sha256) VALUES($1,$2,$3,$4,$5,$5)',[hash(src.snapshot),old,target,hash(src.mapping),'1'.repeat(64)])
  const pool=(options={})=>({async connect(){let inserts=0;return {release(){},async query(s,values=[]){
    if(s.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',role:'agentstudio_admin',admin:true,version:170004,...options.guard}]}
    if(options.failSecond&&s.startsWith('INSERT INTO agentstudio.legacy_execution_fence_archive')&&++inserts===2)throw Error('sensitive synthetic SQL detail')
    if(options.busy&&s.startsWith('SELECT 1 FROM agentstudio.jobs UNION'))return {rows:[{busy:true}]}
    const result=await pg.query(s,values)
    if(options.corrupt&&s.startsWith('SELECT * FROM agentstudio.legacy_execution_fence_archive')&&result.rows.length)result.rows[0].source_record.result_text='corrupt'
    if(options.extraCount&&s.startsWith('SELECT count(*)::int AS n FROM agentstudio.legacy_execution_fence_archive'))result.rows[0].n++
    return result
  }}}})
  // Vertical slice uses existing real parent importers, not fabricated PG rows.
  await importLegacyHistoryToStage(pool(),prepareHistoryImport(src.snapshot,src.manifest,src.mapping))
  await importLegacyWorkflowHistoryToStage(pool(),prepareWorkflowHistoryImport(src.snapshot,src.manifest,src.mapping))
  return {...src,pg,pool,adapt,close:async()=>{await pg.close();src.close()}}
}

test('actual SQLite schema -> existing parent importers -> four inert fence rows; exact preservation and replay',async()=>{
  const f=await fixture();try{
    const before=hash(f.snapshot),result=await importLegacyExecutionFenceToStage(f.pool(),f.prepare())
    assert.deepEqual(result,{imported:4,replayed:0,reconciled:4,execution_enabled:false,runtime_jobs_created:0,side_effects_created:0,production_cutover_allowed:false})
    const stored=(await f.pg.query('SELECT * FROM agentstudio.legacy_execution_fence_archive ORDER BY source_table,kind')).rows
    assert.deepEqual(stored.map(r=>r.source_record),[...leases(),...effects()])
    for(const row of stored){
      assert.equal(row.owner_user_id,row.kind==='agent'?ua:ub)
      assert.equal(row.payload_sha256,contentHash(row.source_record));assert.equal(row.source_snapshot_sha256,before)
      assert.equal(row.source_review_sha256,hash(f.review));assert.equal(row.identity_mapping_sha256,hash(f.mapping));assert.equal(row.manifest_sha256,hash(f.manifest))
      assert.equal(row.executable,false);assert.equal(row.evidence_status,'historical_unverified')
    }
    assert.equal(JSON.stringify(stored).includes('SYNTHETIC-CREDENTIAL'),false)
    assert.equal((await importLegacyExecutionFenceToStage(f.pool(),f.prepare())).replayed,4)
    assert.deepEqual((await f.pg.query('SELECT archive_id FROM agentstudio.legacy_execution_fence_archive ORDER BY source_table,kind')).rows,stored.map(r=>({archive_id:r.archive_id})))
    for(const table of ['jobs','runs','external_effects','run_leases','schedules'])assert.equal(await count(f.pg,table),0)
    assert.equal(hash(f.snapshot),before)
  }finally{await f.close()}
})

test('DBA immutable; API and Worker denied; accidental SELECT grant still FORCE RLS hides both owners',async()=>{
  const f=await fixture();try{
    await importLegacyExecutionFenceToStage(f.pool(),f.prepare())
    const table='agentstudio.legacy_execution_fence_archive'
    for(const role of ['agentstudio_api','agentstudio_worker']){
      await f.pg.exec('SET ROLE '+role)
      try{for(const s of ['SELECT * FROM '+table,'INSERT INTO '+table+' DEFAULT VALUES','UPDATE '+table+' SET executable=true','DELETE FROM '+table,'TRUNCATE '+table])await assert.rejects(f.pg.query(s),/permission denied/)}finally{await f.pg.exec('RESET ROLE')}
    }
    await f.pg.exec('GRANT SELECT ON '+table+' TO agentstudio_api,agentstudio_worker')
    for(const role of ['agentstudio_api','agentstudio_worker'])for(const owner of [ua,ub]){
      await f.pg.query("SELECT set_config('app.user_id',$1,false)",[owner]);await f.pg.exec('SET ROLE '+role)
      try{assert.equal((await f.pg.query('SELECT * FROM '+table)).rows.length,0)}finally{await f.pg.exec('RESET ROLE')}
    }
    for(const s of ['UPDATE '+table+' SET executable=false','DELETE FROM '+table,'TRUNCATE '+table])await assert.rejects(f.pg.query(s),/execution_fence_immutable/)
    const rls=(await f.pg.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='agentstudio.legacy_execution_fence_archive'::regclass")).rows[0]
    assert.deepEqual(rls,{relrowsecurity:true,relforcerowsecurity:true})
    const columns='source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_review_sha256,source_table,kind,legacy_run_id,step_key,legacy_owner_id,owner_user_id,parent_payload_sha256,source_record,payload_sha256'
    const copy=(legacyOwner,owner)=>'INSERT INTO '+table+'('+columns+') SELECT source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_review_sha256,source_table,kind,legacy_run_id,step_key,'+
      "'"+legacyOwner+"','"+owner+"'::uuid,parent_payload_sha256,source_record,payload_sha256 FROM "+table+" WHERE kind='agent' AND source_table='agent_studio_run_leases'"
    // INSERT triggers bind owner/map and actual parent even for direct DBA SQL.
    await assert.rejects(f.pg.query(copy(a,ub)),/execution_fence_identity_mismatch/)
    await assert.rejects(f.pg.query(copy(b,ub)),/execution_fence_parent_mismatch/)
  }finally{await f.close()}
})

test('fail injection, readback tamper and count mismatch roll back entire batch; retry succeeds',async()=>{
  const f=await fixture();try{
    for(const opts of [{failSecond:true},{corrupt:true},{extraCount:true}]){
      await assert.rejects(importLegacyExecutionFenceToStage(f.pool(opts),f.prepare()),e=>/^execution_fence_(sql_failed|reconciliation_mismatch|batch_incomplete)$/.test(e.message))
      assert.equal(await count(f.pg,'legacy_execution_fence_archive'),0)
    }
    assert.equal((await importLegacyExecutionFenceToStage(f.pool(),f.prepare())).imported,4)
  }finally{await f.close()}
})

test('PG17/database/DBA/current role, drained stage, receipt and plan provenance enforced before inserts',async()=>{
  const f=await fixture();try{
    for(const guard of [{version:160004},{version:180000},{database:'production'},{login:'agentstudio_worker'},{admin:false},{role:'agentstudio_api'}])
      await assert.rejects(importLegacyExecutionFenceToStage(f.pool({guard}),f.prepare()),/wrong_stage_database_or_version/)
    await assert.rejects(importLegacyExecutionFenceToStage(f.pool({busy:true}),f.prepare()),/stage_execution_not_drained/)
    await assert.rejects(importLegacyExecutionFenceToStage(f.pool(),structuredClone(f.prepare())),/unverified_or_mutated_plan/)
    const plan=f.prepare();plan.rows[0].owner_user_id=ub
    await assert.rejects(importLegacyExecutionFenceToStage(f.pool(),plan),/unverified_or_mutated_plan/)
    await f.pg.query("UPDATE agentstudio.schema_migrations SET description='wrong' WHERE version='pg_v9_017'")
    await assert.rejects(importLegacyExecutionFenceToStage(f.pool(),f.prepare()),/sql_receipt_mismatch/)
    await assert.rejects(f.pg.exec(f.adapt(sql(migration))),/sql_receipt_conflict/);await f.pg.exec('ROLLBACK')
    assert.equal(await count(f.pg,'legacy_execution_fence_archive'),0)
    await assert.rejects(importLegacyExecutionFenceToStage({connect(){throw Error('SYNTHETIC-PRIVATE connection')}},f.prepare()),/^Error: execution_fence_sql_failed$/)
  }finally{await f.close()}
})

test('actual archived parent must equal reviewed SQLite parent, owner and UUID mapping',async()=>{
  const f=await fixture();try{
    // Corrupt read responses without weakening immutable archive triggers.
    for(const change of [r=>r.owner_user_id=ub,r=>r.source_record.rh_user_id=b,r=>r.source_record.result='different',r=>r.identity_mapping_sha256='0'.repeat(64),r=>r.payload_sha256='0'.repeat(64)]){
      const pool={async connect(){const db=await f.pool().connect();return {...db,async query(s,v){const out=await db.query(s,v);if(s.startsWith('SELECT * FROM agentstudio.legacy_run_history')&&out.rows[0])change(out.rows[0]);return out}}}}
      await assert.rejects(importLegacyExecutionFenceToStage(pool,f.prepare()),/parent_source_or_owner_mismatch/)
    }
    const missingParent={async connect(){const db=await f.pool().connect();return {...db,async query(s,v){if(s.startsWith('SELECT * FROM agentstudio.legacy_workflow_history'))return {rows:[]};return db.query(s,v)}}}}
    await assert.rejects(importLegacyExecutionFenceToStage(missingParent,f.prepare()),/parent_source_or_owner_mismatch/)
    await f.pg.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1 WHERE legacy_user_id=$2',['0'.repeat(64),b])
    await assert.rejects(importLegacyExecutionFenceToStage(f.pool(),f.prepare()),/target_identity_unverified/)
    assert.equal(await count(f.pg,'legacy_execution_fence_archive'),0)
  }finally{await f.close()}
})

test('conflicting independently reviewed source rejected with original evidence unchanged',async()=>{
  const f=await fixture();try{
    await importLegacyExecutionFenceToStage(f.pool(),f.prepare())
    f.mutate(db=>db.prepare('UPDATE agent_studio_side_effects SET result_text=? WHERE kind=?').run('new reviewed inert text','agent'));f.refresh()
    await assert.rejects(importLegacyExecutionFenceToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    assert.equal(await count(f.pg,'legacy_execution_fence_archive'),4)
    assert.equal((await f.pg.query("SELECT source_record->>'result_text' AS text FROM agentstudio.legacy_execution_fence_archive WHERE kind='agent' AND source_table='agent_studio_side_effects'")).rows[0].text,effects()[0].result_text)
  }finally{await f.close()}
})

test('frozen SHA/full inventory/exact schema/row review/secret bounds/orphans fail closed with redacted diagnostics',()=>{
  const manifestEdit=(f,fn)=>{edit(f.manifest,fn);edit(f.review,x=>x.manifest_sha256=hash(f.manifest))}
  const mappingEdit=(f,fn)=>{edit(f.mapping,fn);edit(f.review,x=>x.identity_mapping_sha256=hash(f.mapping))}
  const cases=[
    f=>fs.appendFileSync(f.snapshot,'changed'),
    f=>fs.writeFileSync(f.snapshot+'-wal','synthetic'),
    f=>manifestEdit(f,x=>delete x.tables.studio_users),
    f=>manifestEdit(f,x=>x.tables.agent_studio_run_leases++),
    f=>edit(f.review,x=>delete x.tables.agent_runs),
    f=>edit(f.review,x=>x.credentials_absent=false),
    f=>edit(f.review,x=>x.inert_opaque_text=false),
    f=>edit(f.review,x=>x.reviewed_by=identityReview.verified_by),
    f=>edit(f.review,x=>x.identity_mapping_sha256='0'.repeat(64)),
    f=>edit(f.review,x=>x.tables.agent_studio_side_effects.rows[0].row_sha256='0'.repeat(64)),
    f=>edit(f.review,x=>delete x.tables.agent_studio_run_leases.rows[0].reviewed_at),
    f=>edit(f.review,x=>x.tables.agent_studio_side_effects.rows[0].credentials_absent=false),
    f=>edit(f.review,x=>x.tables.workflow_runs.rows=[]),
    f=>{f.mutate(db=>db.exec('ALTER TABLE agent_studio_side_effects ADD COLUMN extra TEXT'));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_run_leases SET run_id=? WHERE kind=?').run('ooooooooooooooo','agent'));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_runs SET rh_user_id=?').run('ooooooooooooooo'));f.refresh()},
    f=>{f.mutate(db=>db.exec('DELETE FROM workflow_runs'));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_run_leases SET lease_token=?').run('Bearer SYNTHETIC-PRIVATE'));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_side_effects SET idempotency_key=?').run('api_key=SYNTHETIC-PRIVATE'));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_side_effects SET result_text=?').run('password=SYNTHETIC-PRIVATE'));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_side_effects SET result_text=?').run('x'.repeat(8193)));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_run_leases SET lease_token=?').run('x'.repeat(257)));f.refresh()},
    f=>{f.mutate(db=>db.prepare('UPDATE agent_studio_side_effects SET result_text=?').run('before\0SYNTHETIC-PRIVATE'));f.refresh()},
    f=>{f.mutate(db=>db.exec('UPDATE agent_studio_run_leases SET attempts=-1'));f.refresh()},
    f=>{f.mutate(db=>db.exec('UPDATE agent_studio_run_leases SET attempts=1.5'));f.refresh()},
    f=>{f.mutate(db=>db.exec('UPDATE agent_studio_run_leases SET expires_ms=9007199254740992'));f.refresh()},
    f=>mappingEdit(f,x=>x.records[1].new_studio_user_id=ua),
    f=>mappingEdit(f,x=>x.records.pop()),
    f=>fs.writeFileSync(f.review,'{"format":"a","format":"b"}'),
  ]
  for(const change of cases){const f=source();try{
    change(f)
    assert.throws(f.prepare,e=>e.message.startsWith('execution_fence_')&&!e.message.includes('SYNTHETIC-PRIVATE')&&!e.message.includes(f.snapshot))
  }finally{f.close()}}
  const f=source();try{
    assert.throws(()=>prepareExecutionFenceImport(f.snapshot,f.manifest,f.mapping,f.review,'0'.repeat(64)),/untrusted_review/)
    fs.unlinkSync(f.review);assert.throws(f.prepare)
  }finally{f.close()}
})

test('SQL content hash is pinned, migration has no runtime writes or replay hooks',()=>{
  const raw=read(migration).replace(/\r\n/g,'\n'),normalized=raw.replace(/execution_fence_sql_sha256:[a-f0-9]{64}/g,'execution_fence_sql_sha256:'+'0'.repeat(64))
  assert.equal(createHash('sha256').update(normalized).digest('hex'),executionFenceSqlSha256)
  assert.equal(/INSERT INTO agentstudio\.(?:jobs|runs|external_effects|run_leases)\b/i.test(raw),false)
  const lib=read('services/pg-api/src/stage-execution-fence-import.ts')
  assert.equal(/(?:fetch\(|new Pool\(|worker-loop|stage-migration-operator)/.test(lib),false)
})
