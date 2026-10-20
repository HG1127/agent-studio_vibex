// Concurrency regression for a PG18 submit race:
// two requests may both see no dedupe row, but a UNIQUE violation on the
// second job insert must not leave a second run or return a false conflict.
// This test simulates SQLSTATE 23505 and verifies the follow-up transaction,
// even on a machine with no PostgreSQL server or company credentials.
import test from "node:test"
import assert from "node:assert/strict"
import {RunRepository} from "../src/run-repository.ts"

const owner="8f00442a-f673-4cb9-ac52-6d78c5e622b3"
const spec="863eb81f-2a04-4147-91d6-b1c71f0e8d38"
const winner={
  id:"616f9368-7e99-4b41-93c1-2483d4843510",
  owner_user_id:owner,agent_spec_id:spec,kind:"agent",
  status:"queued",instruction:"Synthetic safe instruction",
  result_text:"",checkpoint:{},step_count:"0",last_error_code:"",
  created_at:"2026-10-20T00:00:00.000Z",
  updated_at:"2026-10-20T00:00:00.000Z",finished_at:null
}
const identity={issuer:"https://pg18-ci.synthetic.invalid",subject:"alice"}

function fakeRace({secondLookup=winner,sqlError="23505"}={}){
  let lookup=0
  const queries=[]
  const state={connections:0,commits:0,rollbacks:0}
  const pool={
    async connect(){
      state.connections++
      return {
        async query(sql,params=[]){
          queries.push({sql,params})
          if(sql==="BEGIN"||sql==="SET LOCAL ROLE agentstudio_api"||
             sql.startsWith("SELECT set_config("))
            return {rows:[]}
          if(sql.startsWith("SELECT agentstudio.identity_user_id("))
            return {rows:[{id:owner}]}
          if(sql.includes("FROM agentstudio.jobs AS j")&&
             sql.includes("JOIN agentstudio.runs AS r")){
            lookup++
            return {rows:lookup===1?[]:(secondLookup?[secondLookup]:[])}
          }
          if(sql.startsWith("SELECT id,revision FROM agentstudio.agent_specs"))
            return {rows:[{id:spec,revision:1}]}
          if(sql.startsWith("INSERT INTO agentstudio.runs "))
            return {rows:[{...winner,
              id:"a8f14130-cb93-48b4-9e8e-41a49e8c204c"}]}
          if(sql.startsWith("INSERT INTO agentstudio.jobs "))
            throw Object.assign(new Error("masked database constraint"),{code:sqlError})
          if(sql==="ROLLBACK"){state.rollbacks++;return {rows:[]}}
          if(sql==="COMMIT"){state.commits++;return {rows:[]}}
          throw Error("unexpected query: "+sql.slice(0,55))
        },
        release(){}
      }
    }
  }
  return {repo:new RunRepository(pool),state,queries}
}
const request={instruction:"Synthetic safe instruction",
               idempotency_key:"same_request_pg18"}

test("unique-index collision rechecks committed winner AFTER rollback, without leaking duplicate run",async()=>{
  const f=fakeRace()
  const result=await f.repo.submit(identity,spec,request)
  assert.equal(result.replayed,true)
  assert.equal(result.run.id,winner.id)
  assert.equal(result.run.step_count,0)
  assert.equal(f.state.connections,2)
  assert.equal(f.state.rollbacks,1)
  assert.equal(f.state.commits,1)
  const firstRollback=f.queries.findIndex(v=>v.sql==="ROLLBACK")
  const lookups=f.queries.map((v,i)=>v.sql.includes("JOIN agentstudio.runs AS r")?i:-1)
    .filter(i=>i>=0)
  assert.equal(lookups.length,2)
  assert.ok(firstRollback>lookups[0]&&firstRollback<lookups[1],
    "winner lookup must occur only after aborting the losing transaction")
  const roleChecks=f.queries.filter(v=>v.sql==="SET LOCAL ROLE agentstudio_api")
  assert.equal(roleChecks.length,2)
  assert.equal(f.queries.filter(v=>v.sql.startsWith(
    "INSERT INTO agentstudio.jobs ")).length,1)
})

test("different same-key payload and missing winner stay HTTP 409",async()=>{
  for(const other of [{...winner,instruction:"Different private task"},
                      {...winner,agent_spec_id:"fde4ed95-de09-4913-bc28-d0332e5b42de"},
                      null]){
    const f=fakeRace({secondLookup:other})
    await assert.rejects(f.repo.submit(identity,spec,request),error=>
      error?.status===409&&error?.code==="idempotency_key_conflict")
    assert.equal(f.state.connections,2)
    assert.equal(f.state.rollbacks,1)
    assert.equal(f.state.commits,1)
  }
})

test("only SQLSTATE unique violations receive concurrency recovery",async()=>{
  const f=fakeRace({sqlError:"23514"})
  await assert.rejects(f.repo.submit(identity,spec,request),
    error=>error?.code==="23514")
  assert.equal(f.state.connections,1)
  assert.equal(f.state.rollbacks,1)
  assert.equal(f.state.commits,0)
})
