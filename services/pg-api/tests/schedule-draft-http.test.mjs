// Isolated PG18 schedule-draft HTTP tests; never launch scheduler or worker.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {ScheduleDraftRepository} from "../src/schedule-draft-repository.ts"
import {ScheduleInventoryRepository} from "../src/schedule-inventory-repository.ts"
import {createHandler} from "../src/http.ts"
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://schedule-http-synthetic.invalid"
async function fixture(){
  const pg=await PGlite.create({extensions:{vector}})
  await pg.exec(schema)
  const users={},specs={},auth=new Map()
  for(const subject of ["alice","bob"]){
    users[subject]=(await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
    specs[subject]=(await pg.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1::uuid,$2,'{}'::jsonb) RETURNING id",
      [users[subject],"Worker-inert "+subject])).rows[0].id
    auth.set(subject,{issuer,subject})
  }
  const pool={async connect(){return{query:(sql,args=[])=>pg.query(sql,args),release(){}}}}
  const server=createServer(createHandler({
    repository:{},scheduleInventory:new ScheduleInventoryRepository(pool),
    scheduleDraftRepository:new ScheduleDraftRepository(pool),
    verifyToken:async token=>{if(!auth.has(token))throw Error("no auth")
      return auth.get(token)},
    allowedOrigin:"https://isolated-schedule.invalid"
  }))
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
  const base="http://127.0.0.1:"+server.address().port
  const call=async(token,method,pathname,body)=>{
    const result=await fetch(base+pathname,{
      method,
      headers:{...(token?{Authorization:"Bearer "+token}:{}),
        Origin:"https://isolated-schedule.invalid",
        ...(body?{"Content-Type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(7000)
    })
    return {status:result.status,data:await result.json()}
  }
  return {pg,users,specs,call,async close(){
    await new Promise(resolve=>server.close(resolve));await pg.close()
  }}
}
const input=target=>({
  name:"Daily content review",kind:"agent",target_id:target,
  time_zone:"Asia/Shanghai",rule:{kind:"daily",local_time:"08:30"}
})
test("schedule HTTP CRUD is owner-scoped, revision-fenced and never enables dispatch",async()=>{
  const f=await fixture()
  try{
    const base="/api/v2/schedules"
    assert.equal((await f.call(null,"GET",base)).status,401)
    assert.deepEqual((await f.call("alice","GET",base)).data.items,[])
    assert.equal((await f.call("bob","POST",base,input(f.specs.alice))).status,404)
    assert.equal((await f.call("alice","POST",base,{...input(f.specs.alice),enabled:true})).status,400)
    const created=await f.call("alice","POST",base,input(f.specs.alice))
    assert.equal(created.status,201,JSON.stringify(created.data))
    const s=created.data.item
    assert.equal(s.enabled,false);assert.equal(s.next_at,null)
    assert.equal(created.data.scheduler_started,false)
    assert.equal(created.data.execution_enabled,false)
    assert.equal(s.recurrence.execution_supported,false)
    assert.equal(s.revision,1)
    assert.deepEqual((await f.call("bob","GET",base)).data.items,[])
    assert.equal((await f.call("bob","GET",base+"/"+s.id)).status,404)
    assert.equal((await f.call("bob","PATCH",base+"/"+s.id,{
      ...input(f.specs.bob),expected_revision:1
    })).status,404)
    assert.equal((await f.call("alice","PATCH",base+"/"+s.id,{
      ...input(f.specs.alice),name:"Updated content review",expected_revision:1
    })).status,200)
    assert.equal((await f.call("alice","PATCH",base+"/"+s.id,{
      ...input(f.specs.alice),expected_revision:1
    })).status,409)
    const current=await f.call("alice","GET",base+"/"+s.id)
    assert.equal(current.data.item.revision,2)
    assert.equal(current.data.item.name,"Updated content review")
    const disabled=await f.call("alice","POST",base+"/"+s.id+"/run-now",{})
    assert.equal(disabled.status,403);assert.equal(disabled.data.error,"schedule_execution_disabled")
    assert.equal((await f.call("alice","POST",base+"/"+s.id+"/occurrences",{})).status,405)
    assert.equal((await f.call("alice","DELETE",base+"/"+s.id,{expected_revision:1})).status,409)
    assert.equal((await f.call("alice","DELETE",base+"/"+s.id,{expected_revision:2})).status,200)
    assert.equal((await f.call("alice","GET",base+"/"+s.id)).status,404)
    const runCounts=(await f.pg.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.schedule_occurrences) AS occurrences"
    )).rows[0]
    assert.deepEqual(runCounts,{jobs:0,runs:0,occurrences:0})
  }finally{await f.close()}
})
