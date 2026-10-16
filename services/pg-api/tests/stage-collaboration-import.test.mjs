import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {PGlite} from '@electric-sql/pglite'
import {vector} from '@electric-sql/pglite-pgvector'
import {prepareCollaborationImport,importLegacyCollaborationsToStage as run} from '../src/stage-collaboration-import.ts'
import {contentHash} from '../src/stage-agent-import.ts'
const root=new URL('../../../',import.meta.url)
const read=p=>fs.readFileSync(new URL(p,root),'utf8').split(/\r?\n/).filter(l=>!l.trim().startsWith('\\')).join('\n')
const oldA='aaaaaaaaaaaaaaa',oldB='bbbbbbbbbbbbbbb',spec='sssssssssssssss',base='kkkkkkkkkkkkkkk'
const sourceRows={
  agent_studio_spec_access:{spec_id:spec,owner_uid:oldA,member_uid:oldB,role:'editor',created_ms:1,updated_ms:2},
  agent_studio_kb_access:{base_id:base,owner_uid:oldA,recipient_uid:oldB,role:'viewer',created_ms:1,updated_ms:2,semantic_allowed:1},
  agent_studio_spec_proposals:{id:'ppppppppppppppp',spec_id:spec,owner_uid:oldA,author_uid:oldB,base_hash:'c'.repeat(64),proposed_spec_json:'{ "draft": true }',comment:'synthetic private history',status:'pending',created_ms:3,reviewed_ms:0,reviewer_uid:''},
  agent_studio_kb_access_events:{id:'eeeeeeeeeeeeeee',base_id:base,owner_uid:oldA,recipient_uid:oldB,action:'semantic',role:'semantic_enabled',occurred_ms:4},
  agent_studio_spec_collab_audit:{id:'uuuuuuuuuuuuuuu',spec_id:spec,owner_uid:oldA,actor_uid:oldA,member_uid:'',proposal_id:'missing-historical-proposal',action:'synthetic-future-action',occurred_ms:5},
  agent_studio_spec_revisions:{id:'rrrrrrrrrrrrrrr',spec_id:spec,owner_uid:oldA,actor_uid:oldB,kind:'accepted',proposal_id:'ppppppppppppppp',source_revision_id:'deleted-revision',spec_hash:'d'.repeat(64),safe_spec_json:'{ "old": 1 }',note:'synthetic',occurred_ms:6},
}
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(read('db/postgres/001_stage_schema.sql'))
  const dbname=(await pg.query('SELECT current_database() AS n')).rows[0].n
  const kb=read('db/postgres/migrations/pg_v8_007_legacy_kb_import.sql').replace("current_database()<>'agentstudio_stage'",`current_database()<>'${dbname}'`)
  await pg.exec(kb)
  const sql=read('db/postgres/migrations/pg_v8_009_legacy_collaboration_import.sql')
  await assert.rejects(pg.exec(sql),/wrong_stage_database_version_or_admin/);await pg.exec('ROLLBACK')
  const offline=sql.replace("current_database()<>'agentstudio_stage'",'false')
    .replace("current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999",'false')
    .replace("session_user<>'agentstudio_admin'",'false')
  await pg.exec(offline);await pg.exec(offline)
  const a=(await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES('synthetic','a') RETURNING id")).rows[0].id
  const b=(await pg.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES('synthetic','b') RETURNING id")).rows[0].id
  const targetSpec=(await pg.query("INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) VALUES($1,'Synthetic','{}') RETURNING id",[a])).rows[0].id
  const targetBase=(await pg.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,'Synthetic') RETURNING id",[a])).rows[0].id
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'w5-synthetic-')),snapshot=path.join(temp,'offline.sqlite'),manifest=path.join(temp,'manifest.json'),mapping=path.join(temp,'mapping.json')
  const sqlite=new DatabaseSync(snapshot)
  sqlite.exec('CREATE TABLE studio_users(id TEXT);CREATE TABLE agent_specs(id TEXT,rh_user_id TEXT);CREATE TABLE agent_studio_kb_bases(id TEXT,rh_user_id TEXT)')
  for(const id of [oldA,oldB])sqlite.prepare('INSERT INTO studio_users VALUES(?)').run(id)
  sqlite.prepare('INSERT INTO agent_specs VALUES(?,?)').run(spec,oldA)
  sqlite.prepare('INSERT INTO agent_studio_kb_bases VALUES(?,?)').run(base,oldA)
  for(const [t,row] of Object.entries(sourceRows)){
    sqlite.exec('CREATE TABLE '+t+'('+Object.entries(row).map(([k,v])=>k+' '+(typeof v==='number'?'INTEGER':'TEXT')).join(',')+')')
    sqlite.prepare('INSERT INTO '+t+' VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row))
  }
  sqlite.close()
  function seal(){
    const db=new DatabaseSync(snapshot,{readOnly:true}),tables={}
    for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())tables[name]=db.prepare('SELECT count(*) AS n FROM "'+name+'"').get().n
    db.close()
    fs.writeFileSync(manifest,JSON.stringify({format:'agent-studio-sqlite-snapshot-v1',sha256:hash(snapshot),bytes:fs.statSync(snapshot).size,tables}))
    fs.writeFileSync(mapping,JSON.stringify({schema_version:'studio-approved-identity-map-v2',source_sha256:hash(snapshot),records:[a,b].map((uuid,i)=>({old_id:i?oldB:oldA,new_studio_user_id:uuid,verified_by:'synthetic-reviewer',approved_at:'2026-10-14T00:00:00Z'}))}))
  }
  seal()
  const prepare=()=>prepareCollaborationImport(snapshot,manifest,mapping)
  async function crosswalk(){
    await pg.exec('DELETE FROM agentstudio.legacy_agent_imports;DELETE FROM agentstudio.legacy_knowledge_base_imports')
    for(const [table,cross,legacy,target,key,id] of [['agent_specs','legacy_agent_imports','legacy_spec_id','target_spec_id',spec,targetSpec],['knowledge_bases','legacy_knowledge_base_imports','legacy_base_id','target_base_id',base,targetBase]]){
      const r=(await pg.query('SELECT * FROM agentstudio.'+table+' WHERE id=$1',[id])).rows[0]
      const payload={legacy_id:key,owner_user_id:r.owner_user_id,name:r.name,...(table==='agent_specs'?{spec:r.spec}:{description:r.description}),created_at:new Date(r.created_at).toISOString(),updated_at:new Date(r.updated_at).toISOString()}
      await pg.query(`INSERT INTO agentstudio.${cross}(source_snapshot_sha256,${legacy},owner_user_id,${target},payload_sha256) VALUES($1,$2,$3,$4,$5)`,[hash(snapshot),key,a,id,contentHash(payload)])
    }
  }
  await crosswalk()
  const pool=(options={})=>({async connect(){let inserts=0;return {release(){},async query(sql,values=[]){
    if(sql.startsWith('SELECT current_database() AS database'))return {rows:[{database:'agentstudio_stage',login:'agentstudio_admin',admin:true,version:170004,...options.guard}]}
    if(sql.startsWith('INSERT INTO agentstudio.legacy_collaboration_imports')&&++inserts===3&&options.failThird)throw Error('synthetic failure')
    const result=await pg.query(sql,values)
    if(options.corruptRead&&sql.startsWith('SELECT * FROM agentstudio.legacy_collaboration_imports'))result.rows[0].archive={tampered:true}
    return result
  }}}})
  const edit=sql=>{const db=new DatabaseSync(snapshot);try{db.exec(sql)}finally{db.close()}seal()}
  return {pg,a,b,targetSpec,targetBase,snapshot,manifest,mapping,prepare,pool,seal,edit,crosswalk,async close(){await pg.close();fs.rmSync(temp,{recursive:true,force:true})}}
}
const count=async(pg,t)=>(await pg.query('SELECT count(*)::int AS n FROM agentstudio.'+t)).rows[0].n
test('six history tables preserve exact source values; deterministic crosswalk and replay; zero live grants',async()=>{
  const f=await fixture();try{
    assert.deepEqual(await run(f.pool(),f.prepare()),{stage_only:true,imported:6,replayed:0,reconciled:6,permissions_enabled:false,production_cutover_allowed:false})
    assert.equal((await run(f.pool(),f.prepare())).replayed,6)
    const saved=(await f.pg.query('SELECT * FROM agentstudio.legacy_collaboration_imports')).rows
    for(const r of saved){assert.deepEqual(r.archive.source_record,sourceRows[r.source_table]);assert.equal(r.owner_user_id,f.a);assert.equal(r.permissions_enabled,false);assert.equal(r.review_status,'pending_manual_review');assert.equal(r.source_snapshot_sha256,hash(f.snapshot));assert.equal(r.mapping_sha256,hash(f.mapping));assert.equal(r.archive.identities.owner_uid,f.a)}
    assert.ok(saved.find(r=>r.source_table.endsWith('revisions')).archive.review_reasons.includes('historical_links_require_review'))
    for(const t of ['teams','team_memberships','jobs','runs','schedules'])assert.equal(await count(f.pg,t),0)
    for(const t of ['agent_specs','knowledge_bases'])assert.equal((await f.pg.query('SELECT visibility,team_id FROM agentstudio.'+t)).rows[0].visibility,'private')
  }finally{await f.close()}
})
test('third write failure and corrupt readback roll back the complete batch',async()=>{
  const f=await fixture();try{
    for(const opt of [{failThird:true},{corruptRead:true}]){await assert.rejects(run(f.pool(opt),f.prepare()),/import_sql_failed|reconciliation_mismatch/);assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)}
    assert.equal((await run(f.pool(),f.prepare())).imported,6)
  }finally{await f.close()}
})
test('owner/member missing or disabled in PG blocks atomically; missing crosswalk blocks',async()=>{
  const f=await fixture();try{
    for(const uuid of [f.a,f.b]){
      await f.pg.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[uuid])
      await assert.rejects(run(f.pool(),f.prepare()),/identity_missing_or_disabled/)
      assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)
      await f.pg.query("UPDATE agentstudio.users SET status='active' WHERE id=$1",[uuid])
    }
    await f.pg.exec('DELETE FROM agentstudio.legacy_knowledge_base_imports')
    await assert.rejects(run(f.pool(),f.prepare()),/resource_crosswalk_missing_or_owner_mismatch/)
    assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)
    await f.crosswalk()
    await f.pg.exec('DELETE FROM agentstudio.legacy_knowledge_base_imports;DELETE FROM agentstudio.legacy_agent_imports;DELETE FROM agentstudio.knowledge_bases;DELETE FROM agentstudio.agent_specs')
    await f.pg.query('DELETE FROM agentstudio.users WHERE id=$1',[f.b])
    await assert.rejects(run(f.pool(),f.prepare()),/identity_missing_or_disabled|resource_crosswalk/)
  }finally{await f.close()}
})
test('API and worker cannot read crosswalk; RLS denies with accidental grants; archive cannot activate or mutate',async()=>{
  const f=await fixture();try{
    await run(f.pool(),f.prepare())
    for(const role of ['agentstudio_api','agentstudio_worker']){
      await f.pg.exec('BEGIN;SET LOCAL ROLE '+role)
      await assert.rejects(f.pg.query('SELECT * FROM agentstudio.legacy_collaboration_imports'),/permission denied/)
      await f.pg.exec('ROLLBACK')
      await f.pg.exec('GRANT SELECT ON agentstudio.legacy_collaboration_imports TO '+role)
      for(const actor of [f.a,f.b]){
        await f.pg.exec('BEGIN;SET LOCAL ROLE '+role)
        await f.pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[actor])
        assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)
        if(role==='agentstudio_api')assert.equal((await f.pg.query('SELECT id FROM agentstudio.agent_specs WHERE id=$1',[f.targetSpec])).rows.length,actor===f.a?1:0)
        await f.pg.exec('ROLLBACK')
      }
    }
    for(const sql of ["UPDATE agentstudio.legacy_collaboration_imports SET permissions_enabled=true","UPDATE agentstudio.legacy_collaboration_imports SET archive='{}'",'DELETE FROM agentstudio.legacy_collaboration_imports','TRUNCATE agentstudio.legacy_collaboration_imports'])await assert.rejects(f.pg.exec(sql),/archive_immutable/)
  }finally{await f.close()}
})
test('forged or mutated plans and unsafe database guards reject before archive writes',async()=>{
  const f=await fixture();try{
    const p=f.prepare();await assert.rejects(run(f.pool(),structuredClone(p)),/unverified_or_mutated/)
    p.rows[0].source_record.role='owner';await assert.rejects(run(f.pool(),p),/unverified_or_mutated/)
    for(const guard of [{database:'production'},{login:'agentstudio_api'},{admin:false},{version:180000},{version:160000}])await assert.rejects(run(f.pool({guard}),f.prepare()),/nonisolated/)
    assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)
  }finally{await f.close()}
})
test('snapshot, manifest and identity approvals must be verified; no sidecars',async()=>{
  const f=await fixture();try{
    const map=fs.readFileSync(f.mapping),manifest=fs.readFileSync(f.manifest)
    for(const change of [m=>m.source_sha256='f'.repeat(64),m=>m.records.pop(),m=>m.records[0].verified_by='',m=>m.records[1].new_studio_user_id=m.records[0].new_studio_user_id]){
      const m=JSON.parse(map);change(m);fs.writeFileSync(f.mapping,JSON.stringify(m));assert.throws(f.prepare,/mapping_/);fs.writeFileSync(f.mapping,map)
    }
    const info=JSON.parse(manifest);info.tables.agent_studio_spec_access=2;fs.writeFileSync(f.manifest,JSON.stringify(info));assert.throws(f.prepare,/count_mismatch/);fs.writeFileSync(f.manifest,manifest)
    fs.writeFileSync(f.snapshot+'-wal','synthetic');assert.throws(f.prepare,/sidecar/);fs.unlinkSync(f.snapshot+'-wal')
    fs.appendFileSync(f.snapshot,'synthetic tamper');assert.throws(f.prepare,/manifest_invalid/)
  }finally{await f.close()}
})
test('source owner/member loss, owner mismatch, unknown fields/tables and duplicate keys fail closed',async()=>{
  const f=await fixture();try{
    for(const sql of ["UPDATE agent_studio_spec_access SET owner_uid='missing'","UPDATE agent_studio_spec_access SET member_uid='missing'","UPDATE agent_studio_spec_access SET owner_uid='"+oldB+"'"]){
      const backup=fs.readFileSync(f.snapshot);f.edit(sql);assert.throws(f.prepare,/identity_not_mapped|source_resource_owner_mismatch/);fs.writeFileSync(f.snapshot,backup);f.seal()
    }
    for(const sql of ['ALTER TABLE agent_studio_spec_access ADD COLUMN unexpected TEXT','CREATE TABLE agent_studio_spec_future_history(id TEXT)','INSERT INTO agent_studio_spec_access SELECT * FROM agent_studio_spec_access',"UPDATE agent_studio_spec_access SET role=X'6162'"]){
      const backup=fs.readFileSync(f.snapshot);f.edit(sql);assert.throws(f.prepare,/source_schema_unsupported|unsupported_history_table|duplicate_source_key|source_value_unsupported/);fs.writeFileSync(f.snapshot,backup);f.seal()
    }
  }finally{await f.close()}
})
test('snapshot and approved mapping drift conflict',async()=>{
  const f=await fixture();try{
    await f.pg.query('UPDATE agentstudio.legacy_agent_imports SET source_snapshot_sha256=$1',['f'.repeat(64)])
    await assert.rejects(run(f.pool(),f.prepare()),/snapshot_or_mapping_conflict/);await f.crosswalk()
    await run(f.pool(),f.prepare())
    const map=JSON.parse(fs.readFileSync(f.mapping));map.records[0].verified_by='another-synthetic-reviewer';fs.writeFileSync(f.mapping,JSON.stringify(map))
    await assert.rejects(run(f.pool(),f.prepare()),/snapshot_or_mapping_conflict/)
    assert.equal(await count(f.pg,'legacy_collaboration_imports'),6)
  }finally{await f.close()}
})
test('resource crosswalk payload tampering and cross-owner resource links roll back',async()=>{
  const f=await fixture();try{
    await f.pg.query('UPDATE agentstudio.legacy_knowledge_base_imports SET payload_sha256=$1',['f'.repeat(64)])
    await assert.rejects(run(f.pool(),f.prepare()),/resource_crosswalk_payload_mismatch/)
    assert.equal(await count(f.pg,'legacy_collaboration_imports'),0);await f.crosswalk()
    const other=(await f.pg.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,'Other synthetic owner') RETURNING id",[f.b])).rows[0].id
    await f.pg.query('UPDATE agentstudio.legacy_knowledge_base_imports SET owner_user_id=$1,target_base_id=$2',[f.b,other])
    await assert.rejects(run(f.pool(),f.prepare()),/resource_crosswalk_missing_or_owner_mismatch/)
    assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)
  }finally{await f.close()}
})
test('PG member and owner not provisioned are rejected',async()=>{
  const f=await fixture();try{
    const memberMap=JSON.parse(fs.readFileSync(f.mapping))
    memberMap.records[1].new_studio_user_id='11111111-1111-1111-1111-111111111111'
    fs.writeFileSync(f.mapping,JSON.stringify(memberMap))
    await assert.rejects(run(f.pool(),f.prepare()),/identity_missing_or_disabled/)
    f.seal()
    const ownerMap=JSON.parse(fs.readFileSync(f.mapping))
    ownerMap.records[0].new_studio_user_id='11111111-1111-1111-1111-111111111111'
    fs.writeFileSync(f.mapping,JSON.stringify(ownerMap))
    await assert.rejects(run(f.pool(),f.prepare()),/identity_missing_or_disabled/)
    assert.equal(await count(f.pg,'legacy_collaboration_imports'),0)
  }finally{await f.close()}
})
