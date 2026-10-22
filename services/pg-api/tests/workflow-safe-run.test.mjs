// Isolated PGlite tests for the real queued Start/End-only Workflow worker.
// No provider, tool, PocketBase, production DB or external network.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowSafeRunRepository} from "../src/workflow-safe-run-repository.ts"
import {WorkflowSafeWorker} from "../src/workflow-safe-worker.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {createHandler} from "../src/http.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://workflow-safe-worker-test.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const node=(id,type)=>({id,type,data:{title:id},position:{x:id==="start"?0:100,y:0}})
const safeGraph={nodes:[node("start","start"),node("end","end")],
  edges:[{id:"start-end",source:"start",target:"end"}]}
const unsupported={nodes:[node("start","start"),node("model","model"),node("end","end")],
  edges:[{id:"a",source:"start",target:"model"},{id:"b",source:"model",target:"end"}]}
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  const users={}
  for(const subject of ["alice","bob"]){
    users[subject]=(await db.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  }
  // PGlite exposes one SQL session, unlike node-postgres Pool. Serialize
  // complete client transactions so Promise.all tests do not interleave
  // BEGIN/COMMIT on one shared session.
  let poolTail=Promise.resolve()
  const pool={async connect(){
    let unlock
    const previous=poolTail
    poolTail=new Promise(resolve=>{unlock=resolve})
    await previous
    let released=false
    return {
      query:(sql,args=[])=>db.query(sql,args),
      release(){if(!released){released=true;unlock()}}
    }
  }}
  return {db,pool,users,flows:new WorkflowRepository(pool),
    runs:new WorkflowSafeRunRepository(pool),
    worker:new WorkflowSafeWorker(pool,"workflow-test-worker"),
    async close(){await db.close()}
  }
}
const submit=(runs,owner,flow,key="workflow-safe-key-001",revision=1)=>
  runs.submit(owner,flow,{expected_revision:revision,idempotency_key:key})

test("workflow queue-kind migration is replayable and rejects unrelated job kinds",async()=>{
  const f=await fixture()
  try{
    await f.db.query(
      "INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_022','synthetic reviewed prior baseline') "+
      "ON CONFLICT(version) DO NOTHING")
    const migration=fs.readFileSync(path.join(root,
      "db/postgres/migrations/pg_v9_023_workflow_safe_worker.sql"),"utf8")
      .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
    await f.db.exec(migration)
    await f.db.exec(migration)
    const count=(await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_023'")).rows[0].n
    assert.equal(count,1)
    const definition=(await f.db.query(
      "SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint "+
      "WHERE conrelid='agentstudio.jobs'::regclass AND conname='ck_jobs_kind'"
    )).rows[0].d
    assert.match(definition,/workflow_tick/)
    await assert.rejects(f.db.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key) "+
      "VALUES($1::uuid,'unreviewed_job_kind','bad-kind')",[f.users.alice]),
      /ck_jobs_kind/)
  }finally{await f.close()}
})

test("queued Start/End Workflow is claimed by dedicated Worker and durably completed",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Safe flow",safeGraph)
    const queued=await submit(f.runs,alice,flow.id)
    assert.equal(queued.run.status,"queued")
    assert.equal(queued.job_status,"queued")
    assert.equal(queued.steps.length,0)
    assert.equal(queued.execution_mode,"start_end_only")
    assert.equal(queued.external_effects_executed,false)
    const replay=await submit(f.runs,alice,flow.id)
    assert.equal(replay.replayed,true)
    assert.equal(replay.run.id,queued.run.id)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,1)
    // The Agent preparation Worker must not claim a workflow_tick job.
    const prepare=new AgentPrepareWorker(f.pool,"agent-prepare-isolation")
    assert.equal(await prepare.claim(),null)
    const completed=await f.worker.tick()
    assert.deepEqual(completed,{status:"succeeded",run_id:queued.run.id,steps_completed:2})
    const secondWorker=new WorkflowSafeWorker(f.pool,"workflow-test-worker-2")
    assert.deepEqual(await secondWorker.tick(),{status:"idle"})
    const restored=await f.runs.get(alice,queued.run.id)
    assert.equal(restored.run.status,"succeeded")
    assert.equal(restored.job_status,"succeeded")
    assert.equal(restored.run.step_count,2)
    assert.deepEqual(restored.steps.map(s=>s.metadata.node_id),["start","end"])
    assert.ok(restored.steps.every(s=>s.status==="succeeded"&&
      s.metadata.external_effects_executed===false&&s.metadata.checkpointed===true))
    assert.equal(restored.run.checkpoint.stage,"workflow_safe_succeeded")
    assert.deepEqual(restored.run.checkpoint.completed_node_ids,["start","end"])
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.run_steps) AS steps,"+
      "(SELECT count(*)::int FROM agentstudio.external_effects) AS effects,"+
      "(SELECT count(*)::int FROM agentstudio.approvals) AS approvals"
    )).rows[0]
    assert.deepEqual(counts,{runs:1,jobs:1,steps:2,effects:0,approvals:0})
    const audit=(await f.db.query(
      "SELECT action,metadata FROM agentstudio.audit_events WHERE run_id=$1::uuid "+
      "ORDER BY occurred_at",[queued.run.id])).rows.map(x=>x.action)
    assert.deepEqual(audit,["workflow.run_submit","workflow.safe_run_succeeded"])
  }finally{await f.close()}
})

test("unique-key race loser rolls back its partial run and replays the committed Workflow",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Idempotency race flow",safeGraph)
    const key="workflow_unique_race_001"
    const original=await submit(f.runs,alice,flow.id,key)
    let hidePrior=true
    const racingPool={async connect(){
      const client=await f.pool.connect()
      return {
        async query(sql,args=[]){
          if(hidePrior&&sql.includes("FROM agentstudio.jobs j")&&
             sql.includes("payload->>'phase'='workflow_safe_v1'")){
            hidePrior=false
            return {rows:[]}
          }
          if(sql.includes("INSERT INTO agentstudio.jobs")&&
             sql.includes("'workflow_tick'")){
            throw Object.assign(new Error("synthetic unique-key race"),{
              code:"23505",constraint:"jobs_owner_user_id_kind_dedupe_key_key"
            })
          }
          return client.query(sql,args)
        },
        release(){client.release()}
      }
    }}
    const racingRepo=new WorkflowSafeRunRepository(racingPool)
    const replay=await submit(racingRepo,alice,flow.id,key)
    assert.equal(replay.replayed,true)
    assert.equal(replay.run.id,original.run.id)
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.jobs WHERE kind='workflow_tick') AS jobs"
    )).rows[0]
    assert.deepEqual(counts,{runs:1,jobs:1})
  }finally{await f.close()}
})

test("unsupported nodes, wrong owner and stale revision are rejected before queue writes",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Safe flow",safeGraph)
    await assert.rejects(submit(f.runs,bob,flow.id),
      e=>e.status===404&&e.code==="workflow_not_found")
    await assert.rejects(submit(f.runs,alice,flow.id,"stale-revision-001",2),
      e=>e.status===409&&e.code==="workflow_revision_changed")
    const bad=await f.flows.create(alice,"Model flow",unsupported)
    await assert.rejects(submit(f.runs,alice,bad.id,"unsupported-node-001"),
      e=>e.status===409&&e.code==="workflow_execution_node_not_supported")
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.jobs) AS jobs"
    )).rows[0]
    assert.deepEqual(counts,{runs:0,jobs:0})
  }finally{await f.close()}
})

test("a changed Workflow graph fails closed and completes the job as failed",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Safe flow",safeGraph)
    const queued=await submit(f.runs,alice,flow.id,"graph-mutated-001")
    await f.flows.update(alice,flow.id,"Changed after queue",safeGraph,flow.revision)
    const result=await f.worker.tick()
    assert.equal(result.status,"failed")
    assert.equal(result.run_id,queued.run.id)
    const run=await f.runs.get(alice,queued.run.id)
    assert.equal(run.run.status,"failed")
    assert.equal(run.run.last_error_code,"workflow_execution_graph_invalid")
    assert.equal(run.job_status,"failed")
    assert.equal(run.steps.length,0)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{await f.close()}
})

test("worker transaction rollback can be retried after lease expiry without duplicate steps",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Crash-safe flow",safeGraph)
    const queued=await submit(f.runs,alice,flow.id,"crash-retry-key-001")
    let inject=true
    const flaky={async connect(){
      const c=await f.pool.connect()
      return {async query(sql,args=[]){
        if(inject&&/^INSERT INTO agentstudio\.run_steps/.test(sql.trim())){
          inject=false
          throw Error("synthetic_worker_crash")
        }
        return c.query(sql,args)
      },release(){c.release()}}
    }}
    const broken=new WorkflowSafeWorker(flaky,"workflow-crash-worker")
    await assert.rejects(broken.tick(),/synthetic_worker_crash/)
    const before=await f.runs.get(alice,queued.run.id)
    assert.equal(before.run.status,"queued")
    assert.equal(before.steps.length,0)
    assert.equal(before.job_status,"leased")
    await f.db.query(
      "UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '1 second' "+
      "WHERE run_id=$1::uuid",[queued.run.id])
    const retried=await f.worker.tick()
    assert.equal(retried.status,"succeeded")
    const after=await f.runs.get(alice,queued.run.id)
    assert.equal(after.run.status,"succeeded")
    assert.equal(after.steps.length,2)
    assert.equal(after.job_status,"succeeded")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.run_steps WHERE run_id=$1::uuid",
      [queued.run.id])).rows[0].n,2)
  }finally{await f.close()}
})

test("loopback HTTP submission, polling and owner isolation use the native PG repositories",async()=>{
  const f=await fixture()
  let server
  try{
    const flow=await f.flows.create(alice,"HTTP safe flow",safeGraph)
    server=createServer(createHandler({
      repository:{},workflowRepository:f.flows,workflowSafeRunRepository:f.runs,
      verifyToken:async token=>{
        if(!["alice","bob"].includes(token))throw Error("bad_token")
        return {issuer,subject:token}
      },allowedOrigin:"https://workflow-safe-uat.invalid"
    }))
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const base="http://127.0.0.1:"+server.address().port
    const call=async(subject,method,route,body)=>{
      const response=await fetch(base+route,{method,headers:{
        Origin:"https://workflow-safe-uat.invalid",
        ...(subject?{Authorization:"Bearer "+subject}:{}),
        ...(body?{"Content-Type":"application/json"}:{})
      },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)})
      return {status:response.status,data:await response.json()}
    }
    const path="/api/v2/workflows/"+flow.id+"/runs"
    const input={expected_revision:flow.revision,idempotency_key:"http-safe-run-0001"}
    assert.equal((await call(null,"POST",path,input)).status,401)
    assert.equal((await call("bob","POST",path,input)).status,404)
    const created=await call("alice","POST",path,input)
    assert.equal(created.status,202,JSON.stringify(created.data))
    assert.equal(created.data.run.status,"queued")
    assert.equal(created.data.worker_started_by_api,false)
    assert.equal(created.data.external_effects_executed,false)
    const again=await call("alice","POST",path,input)
    assert.equal(again.status,200)
    assert.equal(again.data.replayed,true)
    assert.equal(again.data.run.id,created.data.run.id)
    const detail="/api/v2/workflow-runs/"+created.data.run.id
    assert.equal((await call("bob","GET",detail)).status,404)
    assert.equal((await call("alice","GET",detail)).status,200)
    assert.equal((await call("alice","POST",detail,{})).status,405)
    assert.equal((await call("alice","POST",path,{...input,run_now:true})).status,400)
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve))
    await f.close()
  }
})
