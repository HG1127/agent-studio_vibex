import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {prepareWorkflowHistoryImport,importLegacyWorkflowHistoryToStage} from '../src/stage-workflow-history-import.ts'
import {contentHash} from '../src/stage-agent-import.ts'

const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const a='aaaaaaaaaaaaaaa',b='bbbbbbbbbbbbbbb',w='ccccccccccccccc',s='ddddddddddddddd',r='eeeeeeeeeeeeeee',e='fffffffffffffff'
const ua='11111111-1111-4111-8111-111111111111',ub='22222222-2222-4222-8222-222222222222'
const review={verified_by:'synthetic reviewer',approved_at:'2026-10-15T00:00:00Z'}
const run=()=>({id:r,rh_user_id:a,workflow_id:w,workflow_name:'合成 Workflow',instruction:' 原样\n\t 😀 ',status:'running',
  graph_snapshot:' { } ',checkpoint:' null ',result:' 历史全文\n\t '.repeat(2000),error:'',done_nodes:1,total_nodes:3,
  created:'2026-10-15 00:00:00.000Z',updated:'2026-10-15 01:00:00.000Z'})
const event=()=>({id:e,run_id:r,node_id:'node-1',seq:1,event_type:'synthetic',content:' [ ] ',created:'2026-10-15 00:01:00.000Z',updated:'2026-10-15 00:01:00.000Z'})
function source(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w22-synthetic-'))
  const snapshot=path.join(dir,'frozen.sqlite'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'mapping.json')
  const db=new DatabaseSync(snapshot)
  db.exec('CREATE TABLE studio_users(id TEXT,password TEXT); CREATE TABLE workflows(id TEXT,rh_user_id TEXT,spec_id TEXT,secret TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,secret TEXT)')
  for(const [table,raw] of [['workflow_runs',run()],['workflow_events',event()]]){
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
      reviewTables=Object.fromEntries(['workflow_runs','workflow_events'].map(t=>[t,{row_sha256:x.prepare('SELECT * FROM '+t+' ORDER BY id').all().map(contentHash)}]))
    }finally{x.close()}
    const sha=hash(snapshot)
    fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:sha,
      records:[[a,ua],[b,ub]].map(([old_id,new_studio_user_id])=>({old_id,new_studio_user_id,...review}))}))
    fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:sha,bytes:fs.statSync(snapshot).size,tables,
      workflow_history_archive_review:{source_sha256:sha,identity_mapping_sha256:hash(mapping),credentials_absent:true,...review,tables:reviewTables}}))
  }
  refresh()
  return {snapshot,manifest,mapping,refresh,mutate,prepare:()=>prepareWorkflowHistoryImport(snapshot,manifest,mapping),close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
const edit=(p,fn)=>{const x=JSON.parse(fs.readFileSync(p,'utf8'));fn(x);fs.writeFileSync(p,JSON.stringify(x))}
const count=async(pg,t)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n
// Synthetic attestation only: production approvals must never be generated.
function structuredApproval(f){
  edit(f.manifest,x=>{x.workflow_history_structured_review={...review,source_sha256:hash(f.snapshot),
    identity_mapping_sha256:hash(f.mapping),credentials_absent:true,tables:{}};
    const db=new DatabaseSync(f.snapshot,{readOnly:true})
    try{for(const [table,keys] of [['workflow_runs',['graph_snapshot','checkpoint']],['workflow_events',['content']]]){
      x.workflow_history_structured_review.tables[table]={row_sha256:db.prepare('SELECT * FROM '+table).all()
        .filter(row=>keys.some(k=>row[k]!==null&&!/^\s*(?:null|\{\s*\}|\[\s*\])\s*$/.test(row[k]))).map(contentHash)}
    }}finally{db.close()}
  })
}
function setJson(f,text,field='graph_snapshot',table='workflow_runs'){
  f.mutate(db=>db.prepare('UPDATE '+table+' SET '+field+'=?').run(text));f.refresh()
}
async function fixture(){
  const src=source(),pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read('db/postgres/001_stage_schema.sql'))
  const actual=(await pg.query('SELECT current_database() AS db,session_user AS login')).rows[0]
  const adapt=sql=>sql.replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
    .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
    .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999')
  const sql=read('db/postgres/migrations/pg_v9_014_legacy_workflow_history.sql')
  await assert.rejects(pg.exec(sql),/workflow_history_wrong_stage/);await pg.exec('ROLLBACK')
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
    if(sql.startsWith('INSERT INTO agentstudio.legacy_workflow_history')&&++inserts===2&&options.failSecond)throw Error('sensitive synthetic SQL detail')
    const result=await pg.query(sql,values)
    if(options.corrupt&&sql.startsWith('SELECT * FROM agentstudio.legacy_workflow_history'))result.rows[0].source_record.result='corrupt'
    if(options.extraCount&&sql.startsWith('SELECT count(*)::int'))result.rows[0].n++
    return result
  }}}})
  return {...src,pg,pool,syncIdentity,close:async()=>{await pg.close();src.close()}}
}

test('1 run + 1 event: full text/hash fidelity, historical running stays inert, same-source replay',async()=>{
  const f=await fixture();try{
    const sha=hash(f.snapshot),plan=f.prepare(),result=await importLegacyWorkflowHistoryToStage(f.pool(),plan)
    assert.equal(result.imported,2);assert.equal(result.reconciled,2)
    for(const k of ['execution_enabled','model_execution_enabled','history_verified','production_cutover_allowed'])assert.equal(result[k],false)
    const rows=(await f.pg.query('SELECT * FROM agentstudio.legacy_workflow_history ORDER BY source_table DESC')).rows
    assert.deepEqual(rows.map(x=>x.source_record),[run(),event()])
    for(const row of rows){
      assert.equal(row.owner_user_id,ua);assert.equal(row.legacy_run_id,r);assert.equal(row.legacy_workflow_id,w)
      assert.equal(row.payload_sha256,contentHash(row.source_record));assert.equal(row.source_snapshot_sha256,sha)
      assert.equal(row.identity_mapping_sha256,hash(f.mapping));assert.equal(row.manifest_sha256,hash(f.manifest))
      assert.equal(row.executable,false);assert.equal(row.model_execution_enabled,false);assert.equal(row.evidence_status,'historical_unverified')
    }
    assert.equal(JSON.stringify(rows).includes('SYNTHETIC-DO-NOT-ARCHIVE'),false)
    assert.equal((await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())).replayed,2)
    assert.deepEqual((await f.pg.query('SELECT archive_id FROM agentstudio.legacy_workflow_history ORDER BY source_table DESC')).rows,rows.map(x=>({archive_id:x.archive_id})))
    for(const t of ['runs','jobs','run_steps','approvals','external_effects','run_leases','workflows','agent_specs','schedules'])assert.equal(await count(f.pg,t),0)
    assert.equal((await f.pg.query('SELECT status FROM agentstudio.users WHERE id=$1',[ua])).rows[0].status,'disabled')
    assert.equal(hash(f.snapshot),sha)
    // Parent relationship is enforced in SQL as well as by the offline reader.
    await assert.rejects(f.pg.query('INSERT INTO agentstudio.legacy_workflow_history(source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_table,legacy_id,owner_user_id,legacy_run_id,legacy_workflow_id,source_record,payload_sha256) '+
      "SELECT source_snapshot_sha256,identity_mapping_sha256,manifest_sha256,source_table,'ggggggggggggggg',$1::uuid,legacy_run_id,legacy_workflow_id,jsonb_set(source_record,'{id}','\"ggggggggggggggg\"'),payload_sha256 FROM agentstudio.legacy_workflow_history WHERE source_table='workflow_events'",[ub]),/foreign key/)
  }finally{await f.close()}
})

test('DBA immutable; API/worker raw access denied, accidental SELECT grants still RLS invisible for either owner',async()=>{
  const f=await fixture();try{
    await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())
    for(const role of ['agentstudio_api','agentstudio_worker']){
      await f.pg.exec('SET ROLE '+role)
      try{for(const sql of ['SELECT * FROM agentstudio.legacy_workflow_history','INSERT INTO agentstudio.legacy_workflow_history DEFAULT VALUES','UPDATE agentstudio.legacy_workflow_history SET executable=true','DELETE FROM agentstudio.legacy_workflow_history','TRUNCATE agentstudio.legacy_workflow_history'])await assert.rejects(f.pg.query(sql),/permission denied/)}finally{await f.pg.exec('RESET ROLE')}
    }
    await f.pg.exec('GRANT SELECT ON agentstudio.legacy_workflow_history TO agentstudio_api,agentstudio_worker')
    for(const role of ['agentstudio_api','agentstudio_worker'])for(const owner of [ua,ub]){
      await f.pg.query("SELECT set_config('app.user_id',$1,false)",[owner]);await f.pg.exec('SET ROLE '+role)
      try{assert.equal((await f.pg.query('SELECT * FROM agentstudio.legacy_workflow_history')).rows.length,0)}finally{await f.pg.exec('RESET ROLE')}
    }
    for(const sql of ['UPDATE agentstudio.legacy_workflow_history SET executable=false','DELETE FROM agentstudio.legacy_workflow_history','TRUNCATE agentstudio.legacy_workflow_history'])await assert.rejects(f.pg.query(sql),/legacy_workflow_history_immutable/)
  }finally{await f.close()}
})

test('atomic rollback on event insert failure, corrupt readback or count mismatch; clean retry',async()=>{
  const f=await fixture();try{
    for(const opts of [{failSecond:true},{corrupt:true},{extraCount:true}]){
      await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(opts),f.prepare()),/workflow_history_(sql_failed|reconciliation_mismatch|batch_incomplete)/)
      assert.equal(await count(f.pg,'legacy_workflow_history'),0);assert.equal(await count(f.pg,'jobs'),0)
    }
    assert.equal((await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())).imported,2)
  }finally{await f.close()}
})

test('stage PG17/admin guard, forged and mutated plans, exact reviewed identity for active/disabled owners',async()=>{
  const f=await fixture();try{
    for(const guard of [{database:'production'},{login:'agentstudio_api'},{admin:false},{version:160000},{version:180000}])await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool({guard}),f.prepare()),/wrong_stage/)
    const p=f.prepare();await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(),structuredClone(p)),/unverified_or_mutated/)
    await assert.rejects(importLegacyWorkflowHistoryToStage({connect:async()=>{throw Error('sensitive connection detail')}},f.prepare()),err=>err.message==='workflow_history_sql_failed')
    p.rows[1].owner_user_id=ub;await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(),p),/unverified_or_mutated/)
    for(const status of ['active','disabled']){
      await f.pg.query('UPDATE agentstudio.users SET status=$1 WHERE id=$2',[status,ua])
      await f.pg.query('UPDATE agentstudio.legacy_user_imports SET reviewed_mapping_sha256=$1',['0'.repeat(64)])
      await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(),f.prepare()),/target_identity_unverified/)
      assert.equal(await count(f.pg,'legacy_workflow_history'),0)
    }
    await f.syncIdentity();await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())
  }finally{await f.close()}
})

test('different source, reviewed mapping or review manifest cannot replace an archive',async()=>{
  const f=await fixture();try{
    await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())
    edit(f.manifest,x=>x.workflow_history_archive_review.verified_by='second reviewer')
    await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    f.refresh();edit(f.mapping,x=>x.records[0].verified_by='second reviewer')
    edit(f.manifest,x=>x.workflow_history_archive_review.identity_mapping_sha256=hash(f.mapping))
    await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    f.mutate(x=>x.prepare('UPDATE workflow_runs SET result=?').run('changed'));f.refresh()
    await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(),f.prepare()),/snapshot_or_review_conflict/)
    assert.equal(await count(f.pg,'legacy_workflow_history'),2)
  }finally{await f.close()}
})

test('source schema, complete manifest, owner/workflow/spec/run references, JSON, credentials, row reviews fail closed',()=>{
  const changes=[
    [f=>fs.appendFileSync(f.snapshot,'changed'),/manifest_invalid/],
    [f=>fs.writeFileSync(f.snapshot+'-wal','synthetic'),/source_not_frozen/],
    [f=>edit(f.manifest,x=>delete x.tables.agent_specs),/manifest_not_complete/],
    [f=>edit(f.manifest,x=>x.tables.workflow_events++),/manifest_count_mismatch/],
    [f=>{f.mutate(x=>x.exec('ALTER TABLE workflow_runs ADD COLUMN extra TEXT'));f.refresh()},/unknown_or_missing/],
    [f=>{f.mutate(x=>x.exec('ALTER TABLE workflow_events DROP COLUMN content'));f.refresh()},/unknown_or_missing/],
    [f=>{f.mutate(x=>x.prepare('UPDATE workflow_runs SET rh_user_id=?').run(b));f.refresh()},/workflow_missing_or_foreign/],
    [f=>{f.mutate(x=>x.prepare('UPDATE workflows SET rh_user_id=?').run(b));f.refresh()},/workflow_missing_or_foreign/],
    [f=>{f.mutate(x=>x.prepare('UPDATE agent_specs SET rh_user_id=?').run(b));f.refresh()},/spec_missing_or_foreign/],
    [f=>{f.mutate(x=>x.exec('DELETE FROM workflows'));f.refresh()},/workflow_missing_or_foreign/],
    [f=>{f.mutate(x=>x.prepare('UPDATE workflow_events SET run_id=?').run(b));f.refresh()},/run_missing_or_foreign/],
    ...['graph_snapshot','checkpoint'].map(k=>[f=>{f.mutate(x=>x.prepare('UPDATE workflow_runs SET '+k+'=?').run('{"nodes":[{"secret":"opaque"}]}'));f.refresh()},/structured_review_required|possible_secret/]),
    [f=>{f.mutate(x=>x.prepare('UPDATE workflow_events SET content=?').run('{"text":"opaque"}'));f.refresh()},/structured_review_required|possible_secret/],
    [f=>{f.mutate(x=>x.prepare('UPDATE workflow_runs SET instruction=?').run('api_key=SYNTHETIC'));f.refresh()},/possible_secret/],
    [f=>{f.mutate(x=>x.prepare('UPDATE workflow_runs SET done_nodes=?').run(0.5));f.refresh()},/number_not_lossless/],
    [f=>{f.mutate(x=>x.prepare('UPDATE workflow_events SET node_id=?').run('nul\0text'));f.refresh()},/text_not_lossless/],
    [f=>edit(f.manifest,x=>delete x.workflow_history_archive_review),/content_review_required/],
    [f=>edit(f.manifest,x=>x.workflow_history_archive_review.credentials_absent=false),/content_review_required/],
    [f=>edit(f.manifest,x=>x.workflow_history_archive_review.tables.workflow_events.row_sha256[0]='0'.repeat(64)),/review_or_count_mismatch/],
    [f=>{edit(f.mapping,x=>delete x.records[0].verified_by);edit(f.manifest,x=>x.workflow_history_archive_review.identity_mapping_sha256=hash(f.mapping))},/owner_unverified/],
    [f=>{edit(f.mapping,x=>x.records.pop());edit(f.manifest,x=>x.workflow_history_archive_review.identity_mapping_sha256=hash(f.mapping))},/mapping_incomplete/],
    [f=>{edit(f.mapping,x=>x.records[1].new_studio_user_id=ua);edit(f.manifest,x=>x.workflow_history_archive_review.identity_mapping_sha256=hash(f.mapping))},/mapping_collision/],
  ]
  for(const [i,[change,expected]] of changes.entries()){const f=source();try{change(f);assert.throws(f.prepare,expected,'source rejection case '+i)}finally{f.close()}}
})

test('reviewed empty tables archive zero records; orphan event cannot be silently omitted',async()=>{
  const f=await fixture();try{
    f.mutate(x=>x.exec('DELETE FROM workflow_runs'));f.refresh();assert.throws(f.prepare,/run_missing_or_foreign/)
    f.mutate(x=>x.exec('DELETE FROM workflow_events'));f.refresh();await f.syncIdentity()
    assert.equal((await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())).reconciled,0)
    assert.equal(await count(f.pg,'legacy_workflow_history'),0)
  }finally{await f.close()}
})

test('W26 nested graph/checkpoint/event archive exact lexical JSON, replay and inert runtime',async()=>{
  const f=await fixture();try{
    const graph=' { "nodes": [{"id":"n1","data":{"label":"合成 😀","values":[true,null,1.00,1e999]}}], "edges": [] }\n'
    const checkpoint='{"outputs":{"n1":[{"text":"done","escaped":"\\u4e2d"}]},"completed":["n1"]}'
    const content='[{"message":{"text":"historical","tags":[1,false]}}]'
    setJson(f,graph);setJson(f,checkpoint,'checkpoint');setJson(f,content,'content','workflow_events')
    structuredApproval(f);await f.syncIdentity()
    const plan=f.prepare();assert.equal((await importLegacyWorkflowHistoryToStage(f.pool(),plan)).imported,2)
    const rows=(await f.pg.query('SELECT source_record FROM agentstudio.legacy_workflow_history ORDER BY source_table DESC')).rows
    assert.equal(rows[0].source_record.graph_snapshot,graph);assert.equal(rows[0].source_record.checkpoint,checkpoint)
    assert.equal(rows[1].source_record.content,content)
    assert.equal((await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())).replayed,2)
    for(const t of ['runs','jobs','run_steps','approvals','external_effects','run_leases','workflows','schedules'])assert.equal(await count(f.pg,t),0)
  }finally{await f.close()}
})

test('W26 independent approval binds source, mapping, every complex row and reviewer UTC',()=>{
  for(const change of [
    x=>delete x.workflow_history_structured_review,
    x=>x.workflow_history_structured_review.source_sha256='0'.repeat(64),
    x=>x.workflow_history_structured_review.identity_mapping_sha256='0'.repeat(64),
    x=>x.workflow_history_structured_review.tables.workflow_runs.row_sha256=[],
    x=>x.workflow_history_structured_review.tables.workflow_runs.row_sha256=['0'.repeat(64)],
    x=>x.workflow_history_structured_review.tables.workflow_runs.row_sha256.push(x.workflow_history_structured_review.tables.workflow_runs.row_sha256[0]),
    x=>x.workflow_history_structured_review.tables.workflow_events.row_sha256=['0'.repeat(64)],
    x=>delete x.workflow_history_structured_review.verified_by,
    x=>x.workflow_history_structured_review.approved_at='2026-10-15T00:00:00+08:00',
    x=>x.workflow_history_structured_review.approved_at='2026-02-30T00:00:00Z',
    x=>x.workflow_history_structured_review.verified_by=' reviewer ',
    x=>x.workflow_history_structured_review.credentials_absent=false,
  ]){const f=source();try{
    setJson(f,'{"nodes":[{"id":"n1"}]}');structuredApproval(f);edit(f.manifest,change)
    assert.throws(f.prepare,/structured_review_(required|hash_mismatch)/)
  }finally{f.close()}}
})

test('W26 decoded deep property names and string values reject embedded credentials',()=>{
  for(const text of [
    '{"nested":[{"deeper":{"api\\u005fkey":"synthetic"}}]}',
    '{"nested":[{"value":"prefix sk-abcdefghijklmnop suffix"}]}',
    '{"nested":[{"value":"eyJhbGciOiJub25lIn0.eyJzdWIiOiJzeW50aGV0aWMifQ.synthetic"}]}',
    '{"nested":[{"value":"Bearer synthetic"}]}',
    '{"nested":[{"value":"-----BEGIN PRIVATE KEY-----"}]}',
    '{"nested":[{"refreshToken":"synthetic"}]}',
    '{"nested":[{"privateKey":"synthetic"}]}',
    '{"nested":[{"value":"AKIAABCDEFGHIJKLMNOP"}]}',
    '{"nested":[{"value":"\\u0061uthorization"}]}',
  ]){const f=source();try{setJson(f,text);structuredApproval(f);assert.throws(f.prepare,/possible_secret/)}finally{f.close()}}
})

test('W26 duplicate decoded keys in every object fail before overwrite; separate objects allowed',()=>{
  for(const text of ['{"a":1,"a":2}','{"nested":[{"a":1,"\\u0061":2}]}','{"x":{"__proto__":1,"__proto__":2}}']){
    const f=source();try{setJson(f,text);structuredApproval(f);assert.throws(f.prepare,/json_duplicate_key/)}finally{f.close()}
  }
  const f=source();try{setJson(f,'[{"a":1},{"a":2}]');structuredApproval(f);assert.equal(f.prepare().rows.length,2)}finally{f.close()}
})

test('W26 bounded tokenizer rejects invalid syntax, NUL, Unicode, depth, elements and UTF8 bytes',()=>{
  for(const [text,expected] of [
    ['{"x":"\\u0000"}',/json_unicode/],['{"x":"\\ud800"}',/json_unicode/],['{"x":"\\udc00"}',/json_unicode/],
    ['{"x":1,}',/json_invalid/],['[1,]',/json_invalid/],['{"x":01}',/json_invalid/],
    ['{"x":"\\q"}',/json_invalid/],['{"x":true} trailing',/json_invalid/],['{"x":NaN}',/json_invalid/],
    ['\u00a0{"x":1}',/json_invalid/],['42',/json_root_unsupported/],
    ['['.repeat(33)+']'.repeat(33),/json_depth_limit/],
    ['['+Array(10000).fill('0').join(',')+']',/json_element_limit/],
    [JSON.stringify({text:'中'.repeat(90000)}),/json_byte_limit/],
  ]){const f=source();try{setJson(f,text);structuredApproval(f);assert.throws(f.prepare,expected)}finally{f.close()}}
  const f=source();try{
    f.mutate(db=>db.exec("UPDATE workflow_runs SET graph_snapshot=CAST(X'7B2278223A22FF227D' AS TEXT)"));f.refresh()
    assert.throws(f.prepare,/text_not_lossless/)
  }finally{f.close()}
})

test('W26 legacy SQL NULL, lexical null/empty structures need no structured approval',()=>{
  for(const text of [null,' null \n',' { }\t',' [ ]\r\n']){const f=source();try{
    setJson(f,text);assert.equal(f.prepare().rows[0].source_record.graph_snapshot,text)
  }finally{f.close()}}
})

test('W26 structured insert/readback/count failures rollback whole archive then retry',async()=>{
  const f=await fixture();try{
    setJson(f,'{"nodes":[{"data":{"label":"synthetic"}}]}');structuredApproval(f);await f.syncIdentity()
    for(const options of [{failSecond:true},{corrupt:true},{extraCount:true}]){
      await assert.rejects(importLegacyWorkflowHistoryToStage(f.pool(options),f.prepare()),/workflow_history_(sql_failed|reconciliation_mismatch|batch_incomplete)/)
      assert.equal(await count(f.pg,'legacy_workflow_history'),0);assert.equal(await count(f.pg,'jobs'),0)
    }
    assert.equal((await importLegacyWorkflowHistoryToStage(f.pool(),f.prepare())).imported,2)
  }finally{await f.close()}
})

test('W26 duplicate manifest approval keys cannot silently replace receipts',()=>{
  const f=source();try{
    setJson(f,'{"nodes":[1]}');structuredApproval(f)
    const text=fs.readFileSync(f.manifest,'utf8')
    fs.writeFileSync(f.manifest,text.replace('"workflow_history_structured_review":','"workflow_history_structured_review":null,"workflow_history_structured_review":'))
    assert.throws(f.prepare,/json_duplicate_key/)
  }finally{f.close()}
})
