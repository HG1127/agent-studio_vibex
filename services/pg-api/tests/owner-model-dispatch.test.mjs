// PostgreSQL-only, offline, synthetic owner-credential dispatch reservation.
// No BaoTa, live provider calls, Worker or external network.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {safeAgentSpec} from "../src/contracts.ts"
import {AgentSpecRepository} from "../src/repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {OwnerBoundModelDispatch,safeBoundModelClaim,boundModelFingerprint}
  from "../src/owner-model-dispatch.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const key=Buffer.from("0123456789abcdef".repeat(4),"hex")
const issuer="https://isolated-dispatch.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const fakeCredential="synthetic-owner-api-key-not-for-network-123"
const input={
  goal:"Analyze research evidence",
  instruction:"Summarize",taskScope:"Synthetic only",
  deliverables:["Brief"],doneCriteria:["Cited"],knowledgeEvidence:[],
}
const spec={goal:input.goal,task_scope:input.taskScope,
  deliverables:["Brief"],done_criteria:["Cited"],task_plan:[],tools:[]}
const workerId="synthetic-model-worker"
const leaseToken="bc7c4dce-7a0d-448f-a058-e8f75cdf6f67"
function fingerprint(binding){return boundModelFingerprint(input,binding)}
async function fixture({approval="approved",status="running",
  effect="started",badFingerprint=false}={}){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  const userIds={}
  for(const name of ["alice","bob"]){
    userIds[name]=(await db.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,name])).rows[0].id
  }
  const pool={async connect(){return{
    query:(sql,args=[])=>db.query(sql,args),release(){}
  }}}
  const models=new ModelConnectionRepository(pool,key)
  const agents=new AgentSpecRepository(pool)
  const c=await models.create(alice,{
    name:"One owner connection",provider:"openai",
    base_url:"https://api.openai.com/v1",
    api_key:fakeCredential,models:["gpt-4.1-mini"],enabled:true,
  })
  const tested=await models.testConnection(alice,c.id,c.revision,async()=>({
    status:"ok",latency_ms:11,error_code:"",
  }))
  const binding={connection_id:tested.id,
    connection_revision:tested.revision,model_id:"gpt-4.1-mini"}
  const agent=await agents.create(alice,"Owned research Agent",
    safeAgentSpec({...spec,model_binding:binding}))
  const run=(await db.query(
    "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,"+
    "status,instruction,checkpoint) VALUES($1::uuid,'agent',$2::uuid,"+
    "$3::text,$4::text,$5::jsonb) RETURNING id",
    [userIds.alice,agent.id,status,input.instruction,
      JSON.stringify({stage:"model_running",spec_revision:agent.revision})],
  )).rows[0]
  const job=(await db.query(
    "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,"+
    "status,lease_owner,lease_token,lease_version,lease_until,payload) "+
    "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,'leased',$4::text,"+
    "$5::uuid,1,clock_timestamp()+interval '4 minutes',$6::jsonb) RETURNING id",
    [userIds.alice,run.id,"model:"+run.id,workerId,leaseToken,
      JSON.stringify({phase:"model",spec_revision:agent.revision})],
  )).rows[0]
  await db.query(
    "INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,"+
    "requested_by,decided_by,status,decided_at) "+
    "VALUES($1::uuid,$2::uuid,'model',$1::uuid,$1::uuid,"+
    "$3::text,clock_timestamp())",
    [userIds.alice,run.id,approval],
  )
  await db.query(
    "INSERT INTO agentstudio.external_effects(owner_user_id,run_id,"+
    "step_key,tool_name,arguments_sha256,idempotency_key,status) "+
    "VALUES($1::uuid,$2::uuid,'model','model.generate',$3::text,$4::text,$5::text)",
    [userIds.alice,run.id,
      badFingerprint?"0".repeat(64):fingerprint(binding),"model:"+run.id,effect],
  )
  return {
    db,models,agents,pool,agent,run,job,binding,userIds,
    claim:{run_id:run.id,job_id:job.id,lease_token:leaseToken,
      lease_version:1,lease_owner:workerId},
    async close(){await db.close()}
  }
}
test("bound paid executor and broker have no public HTTP or Worker registration",()=>{
  const native=readFileSync(path.join(root,
    "services/pg-api/src/native-server.ts"),"utf8")
  const handler=readFileSync(path.join(root,
    "services/pg-api/src/http.ts"),"utf8")
  const worker=readFileSync(path.join(root,
    "services/pg-api/src/model-worker-loop.ts"),"utf8")
  for(const source of [native,handler,worker]){
    assert.doesNotMatch(source,/OwnerBoundModelDispatch/)
    assert.doesNotMatch(source,/createIsolatedBoundModelExecutor/)
    assert.doesNotMatch(source,/model_bound_dispatch/)
  }
})

test("untrusted dispatch claim permits no forged owner, lease or unexpected fields",()=>{
  const request={run_id:"863eb81f-2a04-4147-91d6-b1c71f0e8d38",
    job_id:"aa96ec0b-a4c9-427d-b13b-0fe6b721b320",
    lease_token:leaseToken,lease_version:1,lease_owner:workerId}
  assert.deepEqual(safeBoundModelClaim(request),request)
  for(const bad of [
    {...request,owner_user_id:"other"},
    {...request,api_key:"fake"},
    {...request,lease_version:0},
    {...request,lease_owner:"../../wrong"},
    {...request,lease_token:"fake"},
    {...request,run_id:"bad"},
    {},
  ])assert.throws(()=>safeBoundModelClaim(bad),
    error=>error.status===400&&error.code==="invalid_bound_model_claim")
})
test("durable model fingerprint is invariant to JSONB object-key ordering",()=>{
  const a={model_id:"gpt-4.1-mini",connection_revision:2,
    connection_id:"a94a565c-9134-486e-adf7-2f33918843a5"}
  const b={connection_id:a.connection_id,connection_revision:2,
    model_id:"gpt-4.1-mini"}
  assert.equal(boundModelFingerprint(input,a),boundModelFingerprint({
    instruction:input.instruction,goal:input.goal,
    knowledgeEvidence:input.knowledgeEvidence,
    doneCriteria:input.doneCriteria,
    taskScope:input.taskScope,deliverables:input.deliverables,
  },b))
  assert.notEqual(boundModelFingerprint(input,a),
    boundModelFingerprint({...input,instruction:"Different prompt"},b))
})
test("one-time owner-validated lease, approval and source fingerprint reserve exactly one bound paid POST",async()=>{
  const f=await fixture()
  let invocations=0
  try{
    const broker=new OwnerBoundModelDispatch(f.pool,key,async(material,actual)=>{
      invocations++
      assert.equal(material.api_key,fakeCredential)
      assert.equal(material.provider,"openai")
      assert.equal(material.base_url,"https://api.openai.com/v1")
      assert.equal(material.model_id,f.binding.model_id)
      assert.deepEqual(actual,input)
      return "Synthetic successful analysis"
    })
    await assert.rejects(broker.dispatch(bob,f.claim,input),
      error=>error.status===409&&error.code==="bound_model_lease_invalid")
    assert.equal(invocations,0)
    await assert.rejects(broker.dispatch(alice,{...f.claim,lease_version:2},input),
      error=>error.status===409&&error.code==="bound_model_lease_invalid")
    await assert.rejects(broker.dispatch(alice,f.claim,{
      ...input,instruction:"Injected prompt"
    }),error=>error.status===409&&
      error.code==="bound_model_input_fingerprint_mismatch")
    assert.equal(invocations,0)
    const ok=await broker.dispatch(alice,f.claim,input)
    assert.deepEqual(ok,{status:"succeeded",text:"Synthetic successful analysis"})
    assert.equal(JSON.stringify(ok).includes(fakeCredential),false)
    assert.equal(invocations,1)
    const statuses=(await f.db.query(
      "SELECT step_key,status,arguments_sha256 FROM agentstudio.external_effects "+
      "WHERE run_id=$1::uuid ORDER BY step_key",[f.run.id])).rows
    assert.equal(statuses.length,2)
    assert.equal(statuses.find(x=>x.step_key==="model_bound_dispatch").status,
      "succeeded")
    const audit=(await f.db.query(
      "SELECT result,metadata FROM agentstudio.audit_events "+
      "WHERE run_id=$1::uuid AND action='agent.bound_model_dispatch'",[f.run.id]
    )).rows
    assert.equal(audit.length,1)
    assert.equal(audit[0].result,"succeeded")
    assert.equal(JSON.stringify(audit).includes(fakeCredential),false)
    await assert.rejects(broker.dispatch(alice,f.claim,input),
      error=>error.status===409&&error.code==="bound_model_already_dispatched")
    assert.equal(invocations,1)
  }finally{await f.close()}
})
test("missing approval, stale input, expired lease or changed connection prevent all generation",async()=>{
  for(const settings of [
    {approval:"rejected"},{status:"paused"},
    {effect:"unknown"},{badFingerprint:true},
    {},
  ]){
    const f=await fixture(settings)
    let calls=0
    try{
      const broker=new OwnerBoundModelDispatch(f.pool,key,async()=>{
        calls++;return "should never run"
      })
      if(Object.keys(settings).length===0){
        await f.db.query("UPDATE agentstudio.jobs "+
          "SET lease_until=clock_timestamp()-interval '2 seconds' WHERE id=$1::uuid",
          [f.job.id])
      }
      await assert.rejects(broker.dispatch(alice,f.claim,input),
        error=>error.status===409)
      assert.equal(calls,0)
      const reservations=(await f.db.query(
        "SELECT count(*)::int AS n FROM agentstudio.external_effects "+
        "WHERE step_key='model_bound_dispatch'")).rows[0].n
      assert.equal(reservations,0)
    }finally{await f.close()}
  }
  const f=await fixture()
  try{
    await f.models.update(alice,f.binding.connection_id,{
      name:"Changed while pending",provider:"openai",
      base_url:"https://api.openai.com/v1",api_key:"",
      models:["gpt-4.1-mini"],enabled:true,
    },f.binding.connection_revision)
    let called=0
    const broker=new OwnerBoundModelDispatch(f.pool,key,async()=>{
      called++;return "wrong"
    })
    await assert.rejects(broker.dispatch(alice,f.claim,input),
      error=>error.status===409&&error.code==="bound_model_connection_changed")
    assert.equal(called,0)
  }finally{await f.close()}
})
test("ambiguous provider failure is quarantined and never retried",async()=>{
  const f=await fixture()
  let attempted=0
  try{
    const broker=new OwnerBoundModelDispatch(f.pool,key,async()=>{
      attempted++
      throw Error("confidential provider exception with secret")
    })
    await assert.rejects(broker.dispatch(alice,f.claim,input),
      error=>error.status===503&&error.code==="bound_model_outcome_unknown")
    assert.equal(attempted,1)
    const outcome=(await f.db.query(
      "SELECT status FROM agentstudio.external_effects "+
      "WHERE run_id=$1::uuid AND step_key='model_bound_dispatch'",
      [f.run.id])).rows[0]
    assert.equal(outcome.status,"unknown")
    await assert.rejects(broker.dispatch(alice,f.claim,input),
      error=>error.status===409&&error.code==="bound_model_already_dispatched")
    assert.equal(attempted,1)
    const log=(await f.db.query(
      "SELECT metadata FROM agentstudio.audit_events WHERE run_id=$1::uuid "+
      "AND action='agent.bound_model_dispatch'",[f.run.id])).rows
    assert.equal(log.length,1)
    assert.equal(log[0].metadata.outcome,"unknown")
    assert.equal(JSON.stringify(log).includes(fakeCredential),false)
  }finally{await f.close()}
})
