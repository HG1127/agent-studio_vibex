import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {prepareScheduleImport,normalizeLegacySchedule,importLegacySchedulesToStage} from '../src/stage-schedule-import.ts'
import {normalizeLegacyAgent,importLegacyAgentsToStage} from '../src/stage-agent-import.ts'
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const oldA='aaaaaaaaaaaaaaa',oldB='bbbbbbbbbbbbbbb'
const raw=(owner=oldA)=>({id:owner,rh_user_id:owner,name:'Synthetic schedule',target_kind:'agent',target_id:owner,
  instruction:'Preserve exactly: 合成测试\n instruction ',recurrence_kind:'weekly',interval_minutes:60,time_zone:'Asia/Shanghai',
  local_time:'09:00',weekday:1,start_at_ms:1792000000000,next_at_ms:1793000000000,model_connection_id:'ccccccccccccccc',
  model_id:'synthetic-model',max_steps:17,enabled:1,deleted:0,revision:3,created_ms:1791900000000,updated_ms:1791950000000,last_due_ms:1792000000000})
const agent=owner=>({id:owner,rh_user_id:owner,name:'Synthetic Agent',spec:JSON.stringify({goal:'Test',task_scope:'Synthetic',
  deliverables:['Report'],task_plan:['Read'],done_criteria:['Checked'],tools:['summarize'],knowledge_base_ids:[],require_approval:true}),
  source:'',template_key:'',created:'2026-10-14 09:00:00.000Z',updated:'2026-10-14 12:00:00.000Z'})
const count=async(pg,table)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read('db/postgres/001_stage_schema.sql'))
  const actual=(await pg.query('SELECT current_database() AS db,session_user AS login')).rows[0]
  const adapt=sql=>sql.replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
    .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
    .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999')
  const migration=read('db/postgres/migrations/pg_v8_008_legacy_schedule_import.sql')
  await assert.rejects(pg.exec(migration),/schedule_wrong_stage_database_or_version/);await pg.exec('ROLLBACK')
  const engine=Number((await pg.query("SELECT current_setting('server_version_num') AS v")).rows[0].v)
  if(engine<170000||engine>=180000){
    const guardVersion=migration.replace("current_database()<>'agentstudio_stage'",`current_database()<>'${actual.db}'`)
      .replace("session_user<>'agentstudio_admin'",`session_user<>'${actual.login}'`)
    await assert.rejects(pg.exec(guardVersion),/schedule_wrong_stage_database_or_version/);await pg.exec('ROLLBACK')
  }
  await pg.exec(adapt(read('db/postgres/migrations/pg_v8_006_legacy_workflow_import.sql')))
  await pg.exec(adapt(migration));await pg.exec(adapt(migration))
  const owners=new Map()
  for(const old of [oldA,oldB])owners.set(old,(await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES('synthetic',$1) RETURNING id",[old])).rows[0].id)
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w3-synthetic-')),snapshot=path.join(dir,'offline.sqlite'),manifest=path.join(dir,'manifest.json'),mapping=path.join(dir,'mapping.json')
  const sqlite=new DatabaseSync(snapshot)
  const record=raw(),fields=Object.keys(record)
  sqlite.exec('CREATE TABLE studio_users(id TEXT); CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT,name TEXT,spec TEXT,source TEXT,template_key TEXT,created TEXT,updated TEXT); '+
    'CREATE TABLE agent_studio_schedules('+fields.map(k=>'"'+k+'" '+(typeof record[k]==='number'?'INTEGER':'TEXT')).join(',')+'); '+
    'CREATE TABLE agent_studio_schedule_occurrences(id TEXT,status TEXT,run_id TEXT)')
  for(const old of [oldA,oldB]){
    sqlite.prepare('INSERT INTO studio_users VALUES(?)').run(old)
    sqlite.prepare('INSERT INTO agent_specs VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(agent(old)))
    sqlite.prepare('INSERT INTO agent_studio_schedules VALUES('+fields.map(()=>'?').join(',')+')').run(...Object.values(raw(old)))
  }
  sqlite.prepare('INSERT INTO agent_studio_schedule_occurrences VALUES(?,?,?)').run('historical','failed_start','never-replay')
  sqlite.close()
  function refresh(){
    fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:hash(snapshot),bytes:fs.statSync(snapshot).size,
      tables:{studio_users:2,agent_specs:2,agent_studio_schedules:2,agent_studio_schedule_occurrences:1}}))
    fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:hash(snapshot),records:[...owners].map(([old_id,new_studio_user_id])=>
      ({old_id,new_studio_user_id,verified_by:'synthetic-reviewer',approved_at:'2026-10-14T00:00:00Z'}))}))
  }
  refresh()
  const pool=(options={})=>({async connect(){let inserts=0;return {release(){},async query(sql,values=[]){
    // Only stage environment identity is mocked; SQL, constraints and RLS are real PGlite.
    if(sql.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',admin:true,version:170004,...options.guard}]}
    if(sql.startsWith('INSERT INTO agentstudio.schedules')&&++inserts===2&&options.failSecond)throw Error('synthetic crash')
    const result=await pg.query(sql,values)
    if(options.corrupt&&sql.startsWith('SELECT s.*,m.source_record'))result.rows[0].source_record.instruction='corrupt'
    return result
  }}}})
  const seed=()=>importLegacyAgentsToStage(pool(),hash(snapshot),[oldA,oldB].map(old=>normalizeLegacyAgent(agent(old),owners)))
  await seed()
  return {pg,owners,snapshot,manifest,mapping,refresh,pool,prepare:()=>prepareScheduleImport(snapshot,manifest,mapping),
    async close(){await pg.close();fs.rmSync(dir,{recursive:true,force:true})}}
}
async function role(pg,name,actor,fn){await pg.exec('BEGIN');try{await pg.exec('SET LOCAL ROLE '+name);if(actor)await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor]);await fn()}finally{await pg.exec('ROLLBACK')}}

test('lossless admin quarantine, disabled schedules, unique crosswalk, hash reconciliation and idempotent replay; zero effects/history',async()=>{
  const f=await fixture();try{
    const before=fs.readFileSync(f.snapshot),plan=f.prepare()
    assert.equal((await importLegacySchedulesToStage(f.pool(),plan)).imported,2)
    const result=await importLegacySchedulesToStage(f.pool(),f.prepare())
    assert.equal(result.replayed,2);assert.equal(result.history_migrated,false);assert.equal(result.execution_enabled,false)
    const rows=(await f.pg.query('SELECT s.*,m.source_record,m.source_snapshot_sha256,m.payload_sha256 FROM agentstudio.schedules s JOIN agentstudio.legacy_schedule_imports m ON s.id=m.target_schedule_id ORDER BY m.legacy_schedule_id')).rows
    assert.deepEqual(rows[0].source_record,raw());assert.equal(rows[0].source_snapshot_sha256,hash(f.snapshot))
    assert.equal(rows[0].enabled,false);assert.equal(rows[0].next_at,null);assert.equal(rows[0].owner_user_id,f.owners.get(oldA))
    assert.match(rows[0].payload_sha256,/^[a-f0-9]{64}$/)
    for(const table of ['jobs','runs','schedule_occurrences','external_effects'])assert.equal(await count(f.pg,table),0)
    assert.deepEqual(fs.readFileSync(f.snapshot),before)
    assert.equal(await count(f.pg,'legacy_schedule_imports'),2)
  }finally{await f.close()}
})
test('RLS tenant isolation, admin-only source; frozen schedules/crosswalk and no occurrences',async()=>{
  const f=await fixture();try{
    await importLegacySchedulesToStage(f.pool(),f.prepare())
    const sid=(await f.pg.query('SELECT id FROM agentstudio.schedules WHERE owner_user_id=$1',[f.owners.get(oldA)])).rows[0].id
    await role(f.pg,'agentstudio_api',f.owners.get(oldA),async()=>assert.equal(await count(f.pg,'schedules'),1))
    await role(f.pg,'agentstudio_api',null,async()=>assert.equal(await count(f.pg,'schedules'),0))
    await role(f.pg,'agentstudio_api',f.owners.get(oldB),async()=>assert.equal((await f.pg.query('SELECT id FROM agentstudio.schedules WHERE id=$1',[sid])).rows.length,0))
    for(const name of ['agentstudio_api','agentstudio_worker'])await role(f.pg,name,f.owners.get(oldA),async()=>
      assert.rejects(f.pg.query('SELECT * FROM agentstudio.legacy_schedule_imports'),/permission denied/))
    for(const sql of ["UPDATE agentstudio.schedules SET enabled=true","UPDATE agentstudio.schedules SET recurrence='{}'","DELETE FROM agentstudio.schedules"])
      await assert.rejects(f.pg.query(sql),/legacy_schedule_immutable/)
    await assert.rejects(f.pg.query('DELETE FROM agentstudio.legacy_schedule_imports'),/crosswalk_immutable/)
    await assert.rejects(f.pg.query('INSERT INTO agentstudio.legacy_schedule_imports SELECT * FROM agentstudio.legacy_schedule_imports'),/duplicate key/)
    await role(f.pg,'agentstudio_api',f.owners.get(oldA),async()=>
      assert.rejects(f.pg.query('UPDATE agentstudio.schedules SET enabled=true WHERE id=$1',[sid]),/immutable/))
    const spec=(await f.pg.query('SELECT agent_spec_id FROM agentstudio.schedules WHERE id=$1',[sid])).rows[0].agent_spec_id
    await role(f.pg,'agentstudio_api',f.owners.get(oldB),async()=>assert.rejects(f.pg.query(
      "INSERT INTO agentstudio.schedules(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone) VALUES($1,'agent',$2,'forbidden','{}','UTC')",
      [f.owners.get(oldA),spec]),/row-level security/))
    await assert.rejects(f.pg.query("INSERT INTO agentstudio.schedule_occurrences(owner_user_id,schedule_id,scheduled_for,status) VALUES($1,$2,now(),'pending')",[f.owners.get(oldA),sid]),/execution_disabled/)
  }finally{await f.close()}
})
test('crash after first insert and hash mismatch roll back every target and crosswalk; retry succeeds',async()=>{
  const f=await fixture();try{
    for(const options of [{failSecond:true},{corrupt:true}]){
      await assert.rejects(importLegacySchedulesToStage(f.pool(options),f.prepare()),/sql_failed|reconciliation_mismatch/)
      assert.equal(await count(f.pg,'schedules'),0);assert.equal(await count(f.pg,'legacy_schedule_imports'),0)
    }
    assert.equal((await importLegacySchedulesToStage(f.pool(),f.prepare())).imported,2)
  }finally{await f.close()}
})
test('forged/mutated plans, unsafe database/login/version, pending jobs and disabled owners fail closed',async()=>{
  const f=await fixture();try{
    const plan=f.prepare();await assert.rejects(importLegacySchedulesToStage(f.pool(),structuredClone(plan)),/unverified/)
    plan.rows[0].source_record.max_steps=1;await assert.rejects(importLegacySchedulesToStage(f.pool(),plan),/unverified/)
    for(const guard of [{database:'production'},{login:'agentstudio_api'},{admin:false},{version:180000},{version:160000}])
      await assert.rejects(importLegacySchedulesToStage(f.pool({guard}),f.prepare()),/nonisolated/)
    await f.pg.query("INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key) VALUES($1,'run_tick','synthetic')",[f.owners.get(oldA)])
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/not_drained/);await f.pg.exec('DELETE FROM agentstudio.jobs')
    await f.pg.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.owners.get(oldB)])
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/owner_not_active/)
    assert.equal(await count(f.pg,'schedules'),0)
  }finally{await f.close()}
})
test('missing/foreign/snapshot-conflicting crosswalk and target payload drift are rejected',async()=>{
  const f=await fixture();try{
    await f.pg.query("UPDATE agentstudio.agent_specs SET name='drift'")
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/target_payload_mismatch/)
    await f.pg.query("UPDATE agentstudio.agent_specs SET name='Synthetic Agent'")
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET legacy_spec_id=$1 WHERE legacy_spec_id=$2',['missing',oldA])
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/crosswalk_missing/)
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET legacy_spec_id=$1 WHERE legacy_spec_id=$2',[oldA,'missing'])
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',['f'.repeat(64)])
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/snapshot_conflict/)
    assert.equal(await count(f.pg,'schedules'),0)
  }finally{await f.close()}
})
test('offline SHA manifest, complete explicitly approved identity mapping, count and sidecar checks',async()=>{
  const f=await fixture();try{
    for(const change of [m=>m.records[0].verified_by='',m=>m.records[0].approved_at='',m=>m.records.pop(),
      m=>m.records[1].new_studio_user_id=m.records[0].new_studio_user_id,m=>m.source_sha256='f'.repeat(64)]){
      const map=JSON.parse(fs.readFileSync(f.mapping));change(map);fs.writeFileSync(f.mapping,JSON.stringify(map))
      assert.throws(f.prepare,/mapping/);f.refresh()
    }
    const info=JSON.parse(fs.readFileSync(f.manifest));info.tables.agent_studio_schedules=3;fs.writeFileSync(f.manifest,JSON.stringify(info))
    assert.throws(f.prepare,/count_mismatch/);f.refresh()
    fs.writeFileSync(f.snapshot+'-wal','synthetic');assert.throws(f.prepare,/sidecar/);fs.unlinkSync(f.snapshot+'-wal')
    fs.appendFileSync(f.snapshot,'changed');assert.throws(f.prepare,/manifest_invalid/)
  }finally{await f.close()}
})
test('unknown/missing fields, unsafe numeric conversion, invalid rule and unmapped identities are blocked',()=>{
  const owners=new Map([[oldA,'11111111-1111-1111-1111-111111111111']])
  for(const change of [{unknown:'must preserve'},{instruction:undefined},{max_steps:31},{created_ms:Number.MAX_SAFE_INTEGER+1},
    {time_zone:'invalid-zone'},{weekday:7},{enabled:2},{target_id:'unmapped'},{recurrence_kind:'cron'}])
    assert.throws(()=>normalizeLegacySchedule({...raw(),...change},owners))
  assert.throws(()=>normalizeLegacySchedule(raw(),new Map()),/identity_not_mapped/)
})
test('new frozen source snapshot is refused after import; source target ownership and schema drift blocked',async()=>{
  const f=await fixture();try{
    await importLegacySchedulesToStage(f.pool(),f.prepare())
    const sqlite=new DatabaseSync(f.snapshot);sqlite.exec("UPDATE agent_studio_schedules SET instruction='changed'");sqlite.close();f.refresh()
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/snapshot_conflict/)
    const sqlite2=new DatabaseSync(f.snapshot);sqlite2.prepare('UPDATE agent_specs SET rh_user_id=? WHERE id=?').run(oldB,oldA);sqlite2.close();f.refresh()
    assert.throws(f.prepare,/source_target_missing_or_foreign/)
    const sqlite3=new DatabaseSync(f.snapshot);sqlite3.exec('ALTER TABLE agent_studio_schedules ADD COLUMN secret_field TEXT');sqlite3.close();f.refresh()
    assert.throws(f.prepare,/schema_unsupported/)
  }finally{await f.close()}
})

test('Workflow target requires matching W1 crosswalk, then explicitly blocks without weakening W1 execution quarantine',async()=>{
  const f=await fixture();try{
    const graph={nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
      {id:'end',type:'end',data:{title:'End'},position:{x:1,y:1}}],edges:[{id:'e',source:'start',target:'end'}]}
    const sqlite=new DatabaseSync(f.snapshot)
    sqlite.exec('CREATE TABLE workflows(id TEXT,rh_user_id TEXT,name TEXT,graph TEXT,require_approval INTEGER,created TEXT,updated TEXT)')
    sqlite.prepare('INSERT INTO workflows VALUES(?,?,?,?,?,?,?)').run(oldA,oldA,'Synthetic workflow',JSON.stringify(graph),1,'2026-10-14 09:00:00.000Z','2026-10-14 12:00:00.000Z')
    sqlite.prepare("UPDATE agent_studio_schedules SET target_kind='workflow' WHERE id=?").run(oldA);sqlite.close();f.refresh()
    const info=JSON.parse(fs.readFileSync(f.manifest));info.tables.workflows=1;fs.writeFileSync(f.manifest,JSON.stringify(info))
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',[hash(f.snapshot)])
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/target_crosswalk_missing/)
    const {prepareWorkflowImport,importLegacyWorkflowsToStage}=await import('../src/stage-workflow-import.ts')
    await importLegacyWorkflowsToStage(f.pool(),prepareWorkflowImport(f.snapshot,f.manifest,f.mapping))
    await assert.rejects(importLegacySchedulesToStage(f.pool(),f.prepare()),/workflow_quarantine_contract_blocks_schedule/)
    for(const table of ['schedules','legacy_schedule_imports','jobs','runs','schedule_occurrences'])assert.equal(await count(f.pg,table),0)
  }finally{await f.close()}
})
