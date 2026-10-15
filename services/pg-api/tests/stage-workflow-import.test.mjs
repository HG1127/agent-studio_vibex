import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {normalizeLegacyWorkflow,importLegacyWorkflowsToStage} from '../src/stage-workflow-import.ts'
import {prepareWorkflowImport} from '../src/stage-workflow-import-source.ts'
const root=new URL('../../../',import.meta.url)
const read=p=>fs.readFileSync(new URL(p,root),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const graph=()=>({nodes:[{id:'start',type:'start',data:{title:'Start'},position:{x:0,y:0}},
  {id:'end',type:'end',data:{title:'End'},position:{x:10,y:20}}],edges:[{id:'e',source:'start',target:'end'}]})
const oldA='aaaaaaaaaaaaaaa',oldB='bbbbbbbbbbbbbbb'
const raw=(id=oldA,owner=oldA)=>({id,rh_user_id:owner,name:'Synthetic workflow',graph:JSON.stringify(graph()),
  description:'',source:'',spec_id:'',require_approval:1,created:'2026-10-14 09:00:00.000Z',updated:'2026-10-14 10:00:00.000Z'})
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read('db/postgres/001_stage_schema.sql'))
  const actual=(await pg.query('SELECT current_database() AS db')).rows[0].db
  const migration=read('db/postgres/migrations/pg_v8_006_legacy_workflow_import.sql').replace("current_database()<>'agentstudio_stage'","current_database()<>'"+actual+"'")
  // PGlite 0.5.9 embeds PG18: test the real guard rejects it, then adapt only
  // environment identity/version literals for offline SQL behavior coverage.
  const engine=Number((await pg.query("SELECT current_setting('server_version_num') AS v")).rows[0].v)
  if(engine<170000||engine>=180000){
    await assert.rejects(pg.exec(migration),/wrong_stage_database_or_version/)
    await pg.exec('ROLLBACK')
  }
  const offlineMigration=migration.replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'170004 NOT BETWEEN 170000 AND 179999')
  await pg.exec(offlineMigration);await pg.exec(offlineMigration)
  const a=(await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES('synthetic','a') RETURNING id")).rows[0].id
  const b=(await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES('synthetic','b') RETURNING id")).rows[0].id
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'w1-synthetic-'))
  const snapshot=path.join(temp,'offline.sqlite'),manifest=path.join(temp,'manifest.json'),mapping=path.join(temp,'mapping.json')
  const sqlite=new DatabaseSync(snapshot)
  sqlite.exec('CREATE TABLE studio_users(id TEXT); CREATE TABLE workflows(id TEXT,rh_user_id TEXT,name TEXT,graph TEXT,require_approval INTEGER,created TEXT,updated TEXT)')
  sqlite.prepare('INSERT INTO studio_users VALUES(?)').run(oldA);sqlite.prepare('INSERT INTO studio_users VALUES(?)').run(oldB)
  // Omitted optional columns must stay absent, not be replaced with empty values.
  for(const r of [raw(),raw(oldB,oldB)])sqlite.prepare('INSERT INTO workflows VALUES(?,?,?,?,?,?,?)').run(r.id,r.rh_user_id,r.name,r.graph,r.require_approval,r.created,r.updated)
  sqlite.close()
  fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:hash(snapshot),bytes:fs.statSync(snapshot).size,tables:{studio_users:2,workflows:2}}))
  fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:hash(snapshot),records:[
    {old_id:oldA,new_studio_user_id:a,verified_by:'synthetic-reviewer',approved_at:'2026-10-14T00:00:00Z'},
    {old_id:oldB,new_studio_user_id:b,verified_by:'synthetic-reviewer',approved_at:'2026-10-14T00:00:00Z'}]}))
  const prepare=()=>prepareWorkflowImport(snapshot,manifest,mapping)
  const pool=(options={})=>({async connect(){let inserts=0;return {release(){},async query(sql,values=[]){
    // Only stage identity guard is simulated. All SQL, RLS and triggers run in PGlite.
    if(sql.startsWith('SELECT current_database() AS database'))return {rows:[{database:options.database??'agentstudio_stage',login:options.login??'agentstudio_admin',admin:options.admin??true,version:options.version??170004}]}
    if(sql.startsWith('INSERT INTO agentstudio.workflows')&&++inserts===2&&options.failSecond)throw Error('synthetic failure')
    const result=await pg.query(sql,values)
    if(options.corruptRead&&sql.startsWith('SELECT w.*,m.source_record'))result.rows[0].graph={nodes:[],edges:[]}
    return result
  }}}})
  return {pg,a,b,snapshot,manifest,mapping,prepare,pool,async close(){await pg.close();fs.rmSync(temp,{recursive:true,force:true})}}
}
const count=async(pg,table)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+table)).rows[0].n
async function asRole(pg,role,actor,fn){await pg.exec('BEGIN');try{await pg.exec('SET LOCAL ROLE '+role);if(actor)await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor]);await fn()}finally{await pg.exec('ROLLBACK')}}
test('verified offline import preserves full graph, original string, absent fields, hashes and IDs; replay is idempotent',async()=>{
  const f=await fixture();try{
    const plan=f.prepare(),result=await importLegacyWorkflowsToStage(f.pool(),plan)
    assert.deepEqual([result.imported,result.replayed,result.reconciled,result.execution_enabled],[2,0,2,false])
    const replay=await importLegacyWorkflowsToStage(f.pool(),f.prepare());assert.equal(replay.replayed,2)
    const stored=(await f.pg.query('SELECT w.graph,m.* FROM agentstudio.workflows w JOIN agentstudio.legacy_workflow_imports m ON m.target_workflow_id=w.id ORDER BY m.legacy_workflow_id')).rows
    assert.deepEqual(stored[0].graph,graph());assert.equal(stored[0].source_record.graph,raw().graph)
    assert.equal(Object.hasOwn(stored[0].source_record,'description'),false)
    assert.equal(stored[0].owner_user_id,f.a);assert.equal(stored[0].source_snapshot_sha256,hash(f.snapshot))
    assert.match(stored[0].payload_sha256,/^[a-f0-9]{64}$/);assert.equal(await count(f.pg,'jobs'),0)
    assert.equal(await count(f.pg,'runs'),0);assert.equal(await count(f.pg,'schedules'),0)
    assert.equal(await count(f.pg,'legacy_workflow_imports'),2)
    assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM agentstudio.schema_migrations WHERE version='pg_v8_006'")).rows[0].n,1)
  }finally{await f.close()}
})
test('RLS isolates tenants, denies crosswalk to API/worker, freezes records and blocks all runs/schedules',async()=>{
  const f=await fixture();try{
    await importLegacyWorkflowsToStage(f.pool(),f.prepare())
    const id=(await f.pg.query('SELECT id FROM agentstudio.workflows WHERE owner_user_id=$1',[f.a])).rows[0].id
    await asRole(f.pg,'agentstudio_api',f.a,async()=>assert.equal(await count(f.pg,'workflows'),1))
    await asRole(f.pg,'agentstudio_api',null,async()=>assert.equal(await count(f.pg,'workflows'),0))
    await asRole(f.pg,'agentstudio_api',f.b,async()=>assert.equal((await f.pg.query('SELECT id FROM agentstudio.workflows WHERE id=$1',[id])).rows.length,0))
    await asRole(f.pg,'agentstudio_api',f.b,async()=>{
      await assert.rejects(f.pg.query('INSERT INTO agentstudio.workflows(owner_user_id,name,graph) VALUES($1,$2,$3::jsonb)',[f.a,'forbidden',JSON.stringify(graph())]),/row-level security/)
    })
    for(const role of ['agentstudio_api','agentstudio_worker'])await asRole(f.pg,role,f.a,async()=>{
      await assert.rejects(f.pg.query('SELECT * FROM agentstudio.legacy_workflow_imports'),/permission denied/i)
    })
    await asRole(f.pg,'agentstudio_api',f.a,async()=>{
      await assert.rejects(f.pg.query("INSERT INTO agentstudio.runs(owner_user_id,kind,workflow_id) VALUES($1,'workflow',$2)",[f.a,id]),/legacy_workflow_execution_disabled/)
    })
    await assert.rejects(f.pg.query("INSERT INTO agentstudio.schedules(owner_user_id,kind,workflow_id,name,recurrence,time_zone) VALUES($1,'workflow',$2,'synthetic','{}','UTC')",[f.a,id]),/legacy_workflow_execution_disabled/)
    await assert.rejects(f.pg.query("UPDATE agentstudio.workflows SET name='changed' WHERE id=$1",[id]),/legacy_workflow_immutable/)
    await assert.rejects(f.pg.query('DELETE FROM agentstudio.legacy_workflow_imports'),/crosswalk_immutable/)
  }finally{await f.close()}
})
test('write error and readback mismatch roll back targets AND crosswalk; retry succeeds',async()=>{
  const f=await fixture();try{
    for(const options of [{failSecond:true},{corruptRead:true}]){
      await assert.rejects(importLegacyWorkflowsToStage(f.pool(options),f.prepare()),/workflow_import_sql_failed|workflow_reconciliation_mismatch/)
      assert.equal(await count(f.pg,'workflows'),0);assert.equal(await count(f.pg,'legacy_workflow_imports'),0)
    }
    assert.equal((await importLegacyWorkflowsToStage(f.pool(),f.prepare())).imported,2)
  }finally{await f.close()}
})
test('rejects metadata, approvals, unknown columns, real node config, missing graph fields and normalization',()=>{
  const owners=new Map([[oldA,'11111111-1111-1111-1111-111111111111']])
  for(const change of [{description:'keep me'},{source:'template'},{spec_id:oldB},{require_approval:0},{require_approval:undefined},
    {unknown:'keep me'},{graph:JSON.stringify({...graph(),viewport:{x:0}})},
    {graph:JSON.stringify({...graph(),nodes:graph().nodes.map(n=>({...n,data:{...n.data,prompt:'real config'}}))})},
    {graph:JSON.stringify({...graph(),nodes:graph().nodes.map(n=>({...n,data:{title:' padded '}}))})},
    {graph:raw().graph.replace('0,','0.0000000000000000000001,')},{graph:raw().graph.replace('"nodes":','"nodes":[],"nodes":')},
    {graph:undefined},{created:'2026-02-30T00:00:00Z'}])assert.throws(()=>normalizeLegacyWorkflow({...raw(),...change},owners))
  assert.throws(()=>normalizeLegacyWorkflow(raw(),new Map()),/identity_not_mapped/)
})
test('rejects forged/mutated plans and unsafe database/version before writes',async()=>{
  const f=await fixture();try{
    const plan=f.prepare();await assert.rejects(importLegacyWorkflowsToStage(f.pool(),structuredClone(plan)),/unverified_or_mutated/)
    plan.rows[0].name='mutated';await assert.rejects(importLegacyWorkflowsToStage(f.pool(),plan),/unverified_or_mutated/)
    for(const options of [{database:'production'},{version:180000},{login:'agentstudio_api'},{admin:false}])await assert.rejects(importLegacyWorkflowsToStage(f.pool(options),f.prepare()),/nonisolated/)
    assert.equal(await count(f.pg,'workflows'),0)
  }finally{await f.close()}
})
test('snapshot hash, manifest table counts and audited identity mapping are mandatory',async()=>{
  const f=await fixture();try{
    const map=fs.readFileSync(f.mapping),manifest=fs.readFileSync(f.manifest)
    const altered=JSON.parse(map);altered.source_sha256='b'.repeat(64);fs.writeFileSync(f.mapping,JSON.stringify(altered))
    assert.throws(f.prepare,/mapping_snapshot/);fs.writeFileSync(f.mapping,map)
    const info=JSON.parse(manifest);info.tables.workflows=3;fs.writeFileSync(f.manifest,JSON.stringify(info))
    assert.throws(f.prepare,/count_mismatch/);fs.writeFileSync(f.manifest,manifest)
    fs.appendFileSync(f.snapshot,'changed');assert.throws(f.prepare,/manifest_invalid/)
  }finally{await f.close()}
})
test('cross-snapshot Agent provenance, untracked workflows and active jobs fail closed',async()=>{
  const f=await fixture();try{
    const spec=(await f.pg.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) VALUES($1,'synthetic','{}') RETURNING id",[f.a])).rows[0].id
    await f.pg.query('INSERT INTO agentstudio.legacy_agent_imports(source_snapshot_sha256,legacy_spec_id,owner_user_id,target_spec_id,payload_sha256) VALUES($1,$2,$3,$4,$5)',['b'.repeat(64),oldA,f.a,spec,'c'.repeat(64)])
    await assert.rejects(importLegacyWorkflowsToStage(f.pool(),f.prepare()),/snapshot_conflict/)
    await f.pg.exec('DELETE FROM agentstudio.legacy_agent_imports')
    await f.pg.query("INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key) VALUES($1,'run_tick','synthetic')",[f.a])
    await assert.rejects(importLegacyWorkflowsToStage(f.pool(),f.prepare()),/execution_not_drained/)
    await f.pg.exec('DELETE FROM agentstudio.jobs')
    await f.pg.query('INSERT INTO agentstudio.workflows(owner_user_id,name,graph) VALUES($1,$2,$3::jsonb)',[f.a,'untracked',JSON.stringify(graph())])
    await assert.rejects(importLegacyWorkflowsToStage(f.pool(),f.prepare()),/untracked_target/)
  }finally{await f.close()}
})

test('new verified snapshot is refused; disabled owner rolls back whole batch',async()=>{
  const f=await fixture();try{
    await f.pg.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[f.b])
    await assert.rejects(importLegacyWorkflowsToStage(f.pool(),f.prepare()),/owner_not_active/)
    assert.equal(await count(f.pg,'workflows'),0)
    await f.pg.query("UPDATE agentstudio.users SET status='active' WHERE id=$1",[f.b])
    await importLegacyWorkflowsToStage(f.pool(),f.prepare())
    const sqlite=new DatabaseSync(f.snapshot)
    sqlite.prepare('UPDATE workflows SET name=? WHERE id=?').run('Changed source',oldA);sqlite.close()
    const info=JSON.parse(fs.readFileSync(f.manifest));info.sha256=hash(f.snapshot);info.bytes=fs.statSync(f.snapshot).size
    fs.writeFileSync(f.manifest,JSON.stringify(info))
    const mapping=JSON.parse(fs.readFileSync(f.mapping));mapping.source_sha256=info.sha256;fs.writeFileSync(f.mapping,JSON.stringify(mapping))
    await assert.rejects(importLegacyWorkflowsToStage(f.pool(),f.prepare()),/snapshot_conflict/)
    assert.equal(await count(f.pg,'workflows'),2)
  }finally{await f.close()}
})
