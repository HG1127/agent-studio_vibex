// Synthetic PostgreSQL-only disabled schedule configuration; no scheduler.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {ScheduleDraftRepository,safeScheduleDraftInput}
  from "../src/schedule-draft-repository.ts"
import {ScheduleInventoryRepository} from "../src/schedule-inventory-repository.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://schedule-draft-test.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(schema)
  const users={},specs={},workflows={}
  for(const subject of ["alice","bob"]){
    users[subject]=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
    specs[subject]=(await pg.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1::uuid,$2,'{}'::jsonb) RETURNING id",
      [users[subject],"Test Agent "+subject])).rows[0].id
    workflows[subject]=(await pg.query(
      "INSERT INTO agentstudio.workflows(owner_user_id,name,graph) "+
      "VALUES($1::uuid,$2,'{}'::jsonb) RETURNING id",
      [users[subject],"Test Workflow "+subject])).rows[0].id
  }
  const pool={async connect(){return{
    query:(sql,args=[])=>pg.query(sql,args),release(){}
  }}}
  return {pg,users,specs,workflows,
    drafts:new ScheduleDraftRepository(pool),
    inventory:new ScheduleInventoryRepository(pool),
    async close(){await pg.close()}
  }
}
const input=id=>({
  name:"Synthetic daily note",kind:"agent",target_id:id,
  time_zone:"Asia/Shanghai",rule:{kind:"daily",local_time:"09:30"}
})
test("schedule drafts reject unbounded, invalid or executable requests",()=>{
  const good=input("863eb81f-2a04-4147-91d6-b1c71f0e8d38")
  assert.deepEqual(safeScheduleDraftInput(good),good)
  for(const bad of [
    {...good,enabled:true}, {...good,next_at:"2026-12-01T00:00:00Z"},
    {...good,owner_user_id:"someone"}, {...good,kind:"tool"},
    {...good,rule:{kind:"daily",local_time:"25:00"}},
    {...good,rule:{kind:"interval",interval_minutes:1}},
    {...good,rule:{kind:"weekly",local_time:"09:30",weekday:7}},
    {...good,rule:{kind:"once",start_date:"2026-01-01",local_time:"-1:00"}},
    {...good,rule:{kind:"once",start_date:"2026-02-31",local_time:"09:00"}},
    {...good,rule:{kind:"daily",local_time:"09:30",run_now:true}},
    {...good,time_zone:"Invalid/Zone"}, {...good,target_id:"foreign"},
  ])assert.throws(()=>safeScheduleDraftInput(bad),
    e=>e.status===400&&e.code==="invalid_schedule_draft")
})
test("schedule draft fence SQL replays and rejects all enable/due attempts",async()=>{
  const f=await fixture()
  try{
    const migration=readFileSync(path.join(root,
      "db/postgres/migrations/pg_v9_022_schedule_draft_fence.sql"),"utf8")
      .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
    await f.pg.query(
      "INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_021','Synthetic prior tool connection upgrade')")
    await f.pg.exec(migration)
    await f.pg.exec(migration)
    const count=(await f.pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_022'")).rows[0].n
    assert.equal(count,1)
    const item=await f.drafts.create(alice,input(f.specs.alice))
    for(const sql of [
      "UPDATE agentstudio.schedules SET enabled=true WHERE id=$1::uuid",
      "UPDATE agentstudio.schedules SET next_at=clock_timestamp() WHERE id=$1::uuid",
      "UPDATE agentstudio.schedules SET enabled=true,next_at=clock_timestamp() WHERE id=$1::uuid"
    ])await assert.rejects(f.pg.query(sql,[item.id]),/ck_schedule_draft_inert/)
    const after=await f.inventory.get(alice,item.id)
    assert.equal(after.enabled,false)
    assert.equal(after.next_at,null)
  }finally{await f.close()}
})
test("owner-scoped schedule draft creation, revision, archive fencing and no run side effects",async()=>{
  const f=await fixture()
  try{
    await assert.rejects(
      f.drafts.create(bob,input(f.specs.alice)),
      error=>error.status===404&&error.code==="schedule_target_not_found")
    const first=await f.drafts.create(alice,input(f.specs.alice))
    assert.equal(first.owner_user_id,f.users.alice)
    assert.equal(first.revision,1)
    assert.equal(first.enabled,false)
    assert.equal(first.next_at,null)
    assert.equal(first.recurrence.execution_supported,false)
    assert.equal(first.recurrence.config_format,"pg_schedule_draft_v1")
    assert.deepEqual(first.recurrence.rule,{kind:"daily",local_time:"09:30"})
    assert.equal((await f.inventory.list(bob)).length,0)
    assert.equal(await f.inventory.get(bob,first.id),null)
    assert.equal((await f.inventory.list(alice))[0].id,first.id)
    assert.equal((await f.inventory.get(alice,first.id)).id,first.id)
    assert.equal(await f.drafts.update(bob,first.id,input(f.specs.bob),1),null)
    const next=await f.drafts.update(alice,first.id,{
      ...input(f.workflows.alice),kind:"workflow",
      name:"Updated workflow draft",rule:{kind:"weekly",local_time:"10:00",weekday:2}
    },1)
    assert.ok(next)
    assert.equal(next.revision,2)
    assert.equal(next.workflow_id,f.workflows.alice)
    assert.equal(next.agent_spec_id,null)
    assert.equal(next.enabled,false)
    assert.equal(next.next_at,null)
    assert.equal(await f.drafts.update(alice,first.id,input(f.specs.alice),1),null)
    assert.equal(await f.drafts.delete(bob,first.id,2),false)
    assert.equal(await f.drafts.delete(alice,first.id,1),false)
    assert.equal(await f.drafts.delete(alice,first.id,2),true)
    assert.equal(await f.inventory.get(alice,first.id),null)
    const jobs=(await f.pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0]
    assert.equal(jobs.n,0)
    const events=(await f.pg.query(
      "SELECT action FROM agentstudio.audit_events "+
      "WHERE target_kind='schedule' ORDER BY occurred_at")).rows.map(r=>r.action)
    assert.deepEqual(events,["schedule.draft_create",
      "schedule.draft_update","schedule.draft_delete"])
  }finally{await f.close()}
})
test("legacy imported schedules remain quarantined and cannot be changed by new draft API",async()=>{
  const f=await fixture()
  try{
    const id=(await f.pg.query(
      "INSERT INTO agentstudio.schedules"+
      "(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,enabled,next_at) "+
      "VALUES($1::uuid,'agent',$2::uuid,'Old import',$3::jsonb,'UTC',false,NULL) "+
      "RETURNING id",[f.users.alice,f.specs.alice,
        JSON.stringify({legacy_import:"quarantined",execution_supported:false})]
    )).rows[0].id
    assert.equal(await f.drafts.update(alice,id,input(f.specs.alice),1),null)
    assert.equal(await f.drafts.delete(alice,id,1),false)
    assert.equal((await f.inventory.get(alice,id)).name,"Old import")
    assert.equal((await f.pg.query("SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await f.close()}
})
