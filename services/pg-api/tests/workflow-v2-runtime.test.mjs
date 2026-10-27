// Real embedded SQL/RLS and durable queue/effect ledgers; synthetic adapters
// only. No provider, real employee, installed PostgreSQL or live data.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowV2RunRepository} from "../src/workflow-v2-run-repository.ts"
import {WorkflowV2Worker} from "../src/workflow-v2-worker.ts"
import {WorkflowSafeWorker} from "../src/workflow-safe-worker.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {createWorkflowV2Checkpoint} from "../src/workflow-v2-machine.ts"
const schema=readFileSync(new URL("../../../db/postgres/001_stage_schema.sql",import.meta.url),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://workflow-v2.synthetic.invalid",alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const node=(id,type,data={})=>({id,type,data:{title:id,...data},position:{x:0,y:0}})
const edge=(source,target,sourceHandle)=>({id:source+"-"+target+"-"+(sourceHandle??"default"),source,target,...(sourceHandle?{sourceHandle}:{})})
const pure=()=>({version:2,nodes:[node("start","start"),node("end","end",{output_template:"{{start.output}}"})],edges:[edge("start","end")]})
const operation=()=>({version:2,nodes:[node("start","start"),node("tool","tool",{tool:"calculate",params_template:'{"expression":"2+2"}'}),
  node("end","end",{output_template:"{{tool.output}}"})],edges:[edge("start","tool"),edge("tool","end")]})
async function fixture(){
  const db=await PGlite.create({extensions:{vector}});await db.exec(schema)
  const users={}
  for(const subject of ["alice","bob"])users[subject]=(await db.query("INSERT INTO agentstudio.users(external_issuer,external_subject) "+
    "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  let tail=Promise.resolve()
  const pool={async connect(){const before=tail;let release;tail=new Promise(resolve=>{release=resolve});await before
    return {query:(sql,values=[])=>db.query(sql,values),release}}}
  return {db,pool,users,flows:new WorkflowRepository(pool),runs:new WorkflowV2RunRepository(pool),
    worker:(id="v2-test",options={})=>new WorkflowV2Worker(pool,id,options),close:()=>db.close()}
}
const submit=(f,flow,key="workflow-v2-synthetic-0001",instruction="private synthetic task")=>
  f.runs.submit(alice,flow.id,{expected_revision:flow.revision,idempotency_key:key,instruction})
async function approve(f,id){
  const view=await f.runs.get(alice,id),pending=view.pending_effect
  assert.ok(pending);assert.equal(view.run.status,"awaiting_approval")
  return f.runs.decide(alice,id,{decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256})
}
async function finish(f,id,worker){
  for(let i=0;i<250;i++){
    const result=await worker.tick()
    const view=await f.runs.get(alice,id)
    if(["succeeded","failed","paused","cancelled"].includes(view.run.status))return view
    assert.notEqual(result.status,"idle")
  }
  throw Error("synthetic_workflow_did_not_finish")
}

test("new Workflow admissions persist complete20000-unit final delivery; exact old request recovery keeps its legacy output protocol",async()=>{
  const f=await fixture(),instruction="字".repeat(2000)
  try{
    const graph={version:2,nodes:[node("start","start"),node("end","end",{output_template:"{{input}}".repeat(12)})],edges:[edge("start","end")]}
    const flow=await f.flows.create(alice,"Full synthetic final output",graph)
    const marked=await submit(f,flow,"workflow-full-delivery-new",instruction)
    assert.equal((await f.db.query("SELECT checkpoint->'machine'->>'output_protocol' AS protocol FROM agentstudio.runs WHERE id=$1",[marked.run.id])).rows[0].protocol,"workflow_final_delivery_v1")
    const done=await finish(f,marked.run.id,f.worker("full-output-new"));assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"字".repeat(20000))
    const old=await submit(f,flow,"workflow-full-delivery-legacy",instruction),machine=createWorkflowV2Checkpoint(graph,instruction)
    // Synthetic pre-upgrade persisted journal: its original protocol and job
    // source agree. Replaying the same request must not upgrade that journal.
    await f.db.query("UPDATE agentstudio.runs SET checkpoint=jsonb_set(checkpoint,'{machine}',$2::jsonb) WHERE id=$1",[old.run.id,JSON.stringify(machine)])
    await f.db.query("UPDATE agentstudio.jobs SET payload=jsonb_set(payload,'{graph_sha256}',to_jsonb($2::text)) WHERE run_id=$1",[old.run.id,machine.graph_sha256])
    assert.equal((await submit(f,flow,"workflow-full-delivery-legacy",instruction)).replayed,true)
    assert.equal((await f.db.query("SELECT checkpoint->'machine' ? 'output_protocol' AS present FROM agentstudio.runs WHERE id=$1",[old.run.id])).rows[0].present,false)
    const rejected=await finish(f,old.run.id,f.worker("full-output-old"));assert.equal(rejected.run.status,"failed");assert.equal(rejected.run.last_error_code,"workflow_rendered_input_too_large")
    assert.equal((await f.db.query("SELECT count(*)::integer AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{await f.close()}
})

test("V2 queue resumes pure nested loops beyond 30 leases, isolates old Workers and persists each unique step",async()=>{
  const f=await fixture()
  try{
    const graph={version:2,nodes:[node("start","start"),node("outer","loop",{mode:"count",count:2}),
      node("inner","loop",{mode:"count",count:20,max_iterations:20}),node("test","condition",{ref_title:"start",op:"contains",value:"task"}),
      node("end","end",{output_template:"{{outer.output}}"})],edges:[edge("start","outer"),edge("outer","inner"),edge("outer","end","done"),
        edge("inner","test"),edge("inner","outer","done"),edge("test","inner","true"),edge("test","inner","false")]}
    const flow=await f.flows.create(alice,"Nested",graph),queued=await submit(f,flow)
    assert.equal((await submit(f,flow)).replayed,true)
    await assert.rejects(submit(f,flow,"workflow-v2-synthetic-0001","changed"),e=>e.code==="idempotency_key_conflict")
    assert.equal(await new WorkflowSafeWorker(f.pool,"old-safe").claim(),null)
    assert.equal(await new AgentPrepareWorker(f.pool,"old-agent").claim(),null)
    const done=await finish(f,queued.run.id,f.worker("small-batches",{batchSize:1}))
    assert.equal(done.run.status,"succeeded");assert.match(done.run.result_text,/共执行 2 轮/)
    const job=(await f.db.query("SELECT attempts,lease_version,status FROM agentstudio.jobs WHERE run_id=$1",[queued.run.id])).rows[0]
    assert.equal(job.status,"succeeded");assert.ok(Number(job.lease_version)>30);assert.ok(job.attempts<=1)
    const rows=(await f.db.query("SELECT step_key,status FROM agentstudio.run_steps WHERE run_id=$1",[queued.run.id])).rows
    assert.equal(new Set(rows.map(row=>row.step_key)).size,rows.length)
    assert.equal(rows.every(row=>row.status==="succeeded"),true)
    assert.equal(done.steps.some(step=>step.metadata.branch==="true"),true)
    assert.equal(done.steps.some(step=>step.metadata.total===20),true)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
    assert.equal(Object.hasOwn(done.run.checkpoint,"graph"),false)
    assert.equal(Object.hasOwn(done.run.checkpoint,"machine"),false)
  }finally{await f.close()}
})

test("approved synthetic effect executes once; owner/hash fencing and step metadata protect private data",async()=>{
  const f=await fixture();let calls=0
  try{
    const flow=await f.flows.create(alice,"Effect",operation()),queued=await submit(f,flow)
    const worker=f.worker("effect",{executor:{async execute(request,lease){
      calls++;assert.equal(request.kind,"tool");assert.equal(lease.run_id,queued.run.id)
      assert.equal(Object.hasOwn(lease,"owner_user_id"),false);return "synthetic result"
    }}})
    assert.equal((await worker.tick()).status,"awaiting_approval")
    const pending=(await f.runs.get(alice,queued.run.id)).pending_effect
    assert.equal(calls,0);assert.equal(await f.runs.get(bob,queued.run.id),null)
    const decision={decision:"approved",step_key:pending.step_key,input_sha256:pending.input_sha256}
    await assert.rejects(f.runs.decide(bob,queued.run.id,decision),e=>e.status===404)
    await assert.rejects(f.runs.decide(alice,queued.run.id,{...decision,input_sha256:"a".repeat(64)}),e=>e.status===409)
    await f.runs.decide(alice,queued.run.id,decision)
    assert.equal((await f.runs.decide(alice,queued.run.id,decision)).replayed,true)
    await assert.rejects(f.runs.decide(alice,queued.run.id,{...decision,decision:"rejected"}),e=>e.status===409)
    const done=await finish(f,queued.run.id,worker)
    assert.equal(done.run.result_text,"synthetic result");assert.equal(calls,1)
    assert.equal((await worker.tick()).status,"idle")
    const ledger=(await f.db.query("SELECT status,arguments_sha256 FROM agentstudio.external_effects WHERE run_id=$1",[queued.run.id])).rows
    assert.deepEqual(ledger,[{status:"succeeded",arguments_sha256:pending.input_sha256}])
    assert.equal(done.steps.some(step=>Object.hasOwn(step.metadata,"output_text")),false)
    const audit=JSON.stringify((await f.db.query("SELECT metadata FROM agentstudio.audit_events WHERE run_id=$1",[queued.run.id])).rows)
    assert.equal(audit.includes("synthetic result"),false);assert.equal(audit.includes("private synthetic task"),false)
  }finally{await f.close()}
})

test("rejecting a node continues with an auditable skip and no effect; cancelling a queued run prevents claims",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Reject",operation()),run=await submit(f,flow)
    const worker=f.worker();await worker.tick()
    const pending=(await f.runs.get(alice,run.run.id)).pending_effect
    await f.runs.decide(alice,run.run.id,{decision:"rejected",step_key:pending.step_key,input_sha256:pending.input_sha256})
    const done=await finish(f,run.run.id,worker)
    assert.equal(done.run.status,"succeeded");assert.equal(done.run.result_text,"员工已拒绝该节点操作")
    assert.equal(done.steps.some(step=>step.status==="skipped"),true)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
    const cancelled=await submit(f,flow,"workflow-v2-cancel-0001")
    await assert.rejects(f.runs.cancel(bob,cancelled.run.id),e=>e.status===404)
    assert.equal((await f.runs.cancel(alice,cancelled.run.id)).run.status,"cancelled")
    assert.equal((await f.runs.cancel(alice,cancelled.run.id)).replayed,true)
    assert.equal((await worker.tick()).status,"idle")
  }finally{await f.close()}
})

test("transaction failure rolls back cursor/steps; a new lease resumes and the old token cannot commit",async()=>{
  const f=await fixture()
  try{
    const flow=await f.flows.create(alice,"Rollback",pure()),run=await submit(f,flow),worker=f.worker("before-crash")
    const leased=await worker.claim()
    await f.db.exec("CREATE FUNCTION public.synthetic_v2_step_fault() RETURNS trigger LANGUAGE plpgsql AS $$ "+
      "BEGIN RAISE EXCEPTION 'synthetic_v2_step_fault'; END $$; CREATE TRIGGER synthetic_v2_step_fault "+
      "BEFORE INSERT ON agentstudio.run_steps FOR EACH ROW EXECUTE FUNCTION public.synthetic_v2_step_fault()")
    await assert.rejects(worker.execute(leased),/synthetic_v2_step_fault/)
    assert.equal((await f.runs.get(alice,run.run.id)).run.checkpoint.cursor,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.run_steps")).rows[0].n,0)
    await f.db.exec("DROP TRIGGER synthetic_v2_step_fault ON agentstudio.run_steps")
    await f.db.query("UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[leased.id])
    const done=await finish(f,run.run.id,f.worker("after-crash"))
    assert.equal(done.run.status,"succeeded");assert.equal(done.steps.length,2)
    assert.equal((await worker.execute(leased)).status,"stale")
  }finally{await f.close()}
})

test("uncertain effect response and failed result commit pause without resending after restart",async()=>{
  const f=await fixture();let calls=0
  try{
    const flow=await f.flows.create(alice,"Unknown",operation()),first=await submit(f,flow)
    const lost=f.worker("lost-response",{executor:{async execute(){calls++;throw Error("synthetic_lost_response")}}})
    await lost.tick();await approve(f,first.run.id)
    assert.equal((await lost.tick()).status,"paused");assert.equal(calls,1)
    assert.equal((await lost.tick()).status,"idle")
    const second=await submit(f,flow,"workflow-v2-result-commit-fault")
    const completed=f.worker("result-fault",{executor:{async execute(){calls++;return "synthetic response"}}})
    await completed.tick();await approve(f,second.run.id)
    await f.db.exec("CREATE FUNCTION public.synthetic_v2_result_fault() RETURNS trigger LANGUAGE plpgsql AS $$ "+
      "BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'synthetic_v2_result_fault'; END IF; RETURN NEW; END $$; "+
      "CREATE TRIGGER synthetic_v2_result_fault BEFORE UPDATE ON agentstudio.external_effects "+
      "FOR EACH ROW EXECUTE FUNCTION public.synthetic_v2_result_fault()")
    await assert.rejects(completed.tick(),/synthetic_v2_result_fault/);assert.equal(calls,2)
    await f.db.exec("DROP TRIGGER synthetic_v2_result_fault ON agentstudio.external_effects")
    await f.db.query("UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE run_id=$1",[second.run.id])
    const restarted=f.worker("restarted",{executor:{async execute(){throw Error("must_never_resend")}}})
    assert.equal((await restarted.tick()).status,"paused")
    const view=await f.runs.get(alice,second.run.id)
    assert.equal(view.run.status,"paused");assert.equal(view.run.last_error_code,"workflow_v2_effect_outcome_unknown")
    assert.equal((await restarted.tick()).status,"idle");assert.equal(calls,2)
    assert.deepEqual((await f.db.query("SELECT status FROM agentstudio.external_effects ORDER BY created_at")).rows.map(row=>row.status),["unknown","unknown"])
  }finally{await f.close()}
})

test("missing adapters, timeouts and changed configuration never create a second effect",async()=>{
  const f=await fixture();let calls=0
  try{
    const flow=await f.flows.create(alice,"Unavailable",operation()),first=await submit(f,flow)
    const missing=f.worker();await missing.tick();await approve(f,first.run.id)
    assert.equal((await missing.tick()).status,"paused")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
    const second=await submit(f,flow,"workflow-v2-timeout-0001")
    const timeout=f.worker("timeout",{effectTimeoutMs:15,executor:{execute(_request,lease){calls++;return new Promise((_,reject)=>{
      lease.signal.addEventListener("abort",()=>reject(Error("synthetic_aborted")),{once:true})})}}})
    await timeout.tick();await approve(f,second.run.id)
    assert.equal((await timeout.tick()).status,"paused");assert.equal(calls,1)
    const third=await submit(f,flow,"workflow-v2-drift-0001")
    const drift=f.worker("drift",{executor:{async execute(){calls++;return "must not run"}}})
    await drift.tick();await approve(f,third.run.id)
    await f.flows.update(alice,flow.id,"Changed revision",operation(),1)
    assert.equal((await drift.tick()).status,"failed");assert.equal(calls,1)
    assert.equal((await f.runs.get(alice,third.run.id)).run.last_error_code,"workflow_revision_changed")
  }finally{await f.close()}
})

test("an in-flight effect cannot be falsely reported as cancelled",async()=>{
  const f=await fixture();let started,release,calls=0
  try{
    const ready=new Promise(resolve=>{started=resolve}),result=new Promise(resolve=>{release=resolve})
    const flow=await f.flows.create(alice,"In flight",operation()),run=await submit(f,flow)
    const worker=f.worker("inflight",{executor:{async execute(){calls++;started();return result}}})
    await worker.tick();await approve(f,run.run.id)
    const executing=worker.tick();await ready
    const sameLease=(await f.db.query("SELECT * FROM agentstudio.jobs WHERE run_id=$1",[run.run.id])).rows[0]
    assert.equal((await worker.execute(sameLease)).status,"stale")
    assert.equal(calls,1)
    await assert.rejects(f.runs.cancel(alice,run.run.id),e=>e.code==="workflow_effect_in_flight")
    release("completed synthetic effect");assert.equal((await executing).status,"progressed")
    assert.equal((await finish(f,run.run.id,worker)).run.status,"succeeded")
    assert.equal(calls,1)
  }finally{if(release)release("cleanup");await f.close()}
})
