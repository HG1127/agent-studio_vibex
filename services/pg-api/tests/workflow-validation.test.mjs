// Synthetic PostgreSQL owner-only, Start/End Workflow validation UAT.
// NO Web, tools, Agent Worker, provider network, scheduler or production data.
import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {WorkflowRepository} from "../src/workflow-repository.ts"
import {WorkflowValidationRepository,safeWorkflowValidationRequest}
  from "../src/workflow-validation-repository.ts"
import {createHandler} from "../src/http.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://workflow-validation-local.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const node=(id,type)=>({id,type,data:{title:id},position:{x:id==="start"?0:100,y:0}})
const safeGraph={
  nodes:[node("start","start"),node("done_b","end"),node("done_a","end")],
  edges:[{id:"e1",source:"start",target:"done_b"},
    {id:"e2",source:"start",target:"done_a"}]
}
const unsupportedGraph={
  nodes:[node("start","start"),node("model1","model"),node("end","end")],
  edges:[{id:"e1",source:"start",target:"model1"},
    {id:"e2",source:"model1",target:"end"}]
}
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  const owners={}
  for(const subject of ["alice","bob"]){
    owners[subject]=(await db.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
      "VALUES($1,$2) RETURNING id",[issuer,subject])).rows[0].id
  }
  const pool={async connect(){return{
    query:(sql,args=[])=>db.query(sql,args),release(){}
  }}}
  return {db,owners,flows:new WorkflowRepository(pool),
    runs:new WorkflowValidationRepository(pool),async close(){await db.close()}}
}
test("request only allows exact revision + bounded idempotency key",()=>{
  const valid={expected_revision:1,idempotency_key:"stable_wfvalidate_0001"}
  assert.deepEqual(safeWorkflowValidationRequest(valid),valid)
  for(const bad of [
    {...valid,owner_user_id:"alice"},
    {...valid,force_model:true},
    {...valid,expected_revision:0},
    {...valid,expected_revision:1.5},
    {...valid,idempotency_key:"short"},
    {...valid,idempotency_key:"bad/path"},
    {},[],
  ])assert.throws(()=>safeWorkflowValidationRequest(bad),
    e=>e.status===400&&e.code==="invalid_workflow_validation_request")
})
test("durable Start/End workflow validation persists only terminal steps and idempotency ledger",async()=>{
  const f=await fixture()
  try{
    const item=await f.flows.create(alice,"Pure graph",safeGraph)
    const request={expected_revision:item.revision,idempotency_key:"endgraph_same_001"}
    const first=await f.runs.validate(alice,item.id,request)
    assert.equal(first.replayed,false)
    assert.equal(first.mode,"graph_validation_only")
    assert.equal(first.external_effects_executed,false)
    assert.equal(first.run.kind,"workflow")
    assert.equal(first.run.status,"succeeded")
    assert.equal(first.run.workflow_id,item.id)
    assert.equal(first.run.step_count,3)
    assert.equal(first.steps.length,3)
    assert.deepEqual(first.steps.map(x=>x.metadata.node_id),
      ["start","done_a","done_b"])
    assert.ok(first.steps.every(x=>x.status==="succeeded"&&
      x.metadata.validation_only===true&&
      x.metadata.external_effects_executed===false))
    const duplicate=await f.runs.validate(alice,item.id,request)
    assert.equal(duplicate.replayed,true)
    assert.equal(duplicate.run.id,first.run.id)
    assert.equal(await f.runs.get(bob,first.run.id),null)
    const details=await f.runs.get(alice,first.run.id)
    assert.equal(details?.run.id,first.run.id)
    await assert.rejects(f.runs.validate(bob,item.id,request),
      e=>e.status===404&&e.code==="workflow_not_found")
    await assert.rejects(f.runs.validate(alice,item.id,{
      expected_revision:2,idempotency_key:request.idempotency_key
    }),e=>e.status===409&&e.code==="idempotency_key_conflict")
    await assert.rejects(f.runs.validate(alice,item.id,{
      expected_revision:2,idempotency_key:"old_rev_001"
    }),e=>e.status===409&&e.code==="workflow_revision_changed")
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.run_steps) AS steps,"+
      "(SELECT count(*)::int FROM agentstudio.jobs) AS ledger,"+
      "(SELECT count(*)::int FROM agentstudio.external_effects) AS effects,"+
      "(SELECT count(*)::int FROM agentstudio.approvals) AS approvals"
    )).rows[0]
    assert.deepEqual(counts,{runs:1,steps:3,ledger:1,effects:0,approvals:0})
    const jobs=(await f.db.query(
      "SELECT status,attempts,max_attempts,lease_token,payload "+
      "FROM agentstudio.jobs")).rows
    assert.equal(jobs[0].status,"succeeded")
    assert.equal(jobs[0].attempts,0)
    assert.equal(jobs[0].lease_token,null)
    assert.equal(jobs[0].payload.phase,"workflow_graph_validation_only")
    const audits=(await f.db.query(
      "SELECT action,metadata FROM agentstudio.audit_events "+
      "WHERE run_id=$1::uuid",[first.run.id])).rows
    assert.equal(audits.length,1)
    assert.equal(audits[0].action,"workflow.graph_validation")
    assert.equal(audits[0].metadata.external_effects_executed,false)
  }finally{await f.close()}
})
test("unsupported executable model/tool/agent/condition/loop nodes reject without durable work",async()=>{
  const f=await fixture()
  try{
    for(const kind of ["model","tool","agent","condition","loop"]){
      const graph={...unsupportedGraph,nodes:unsupportedGraph.nodes.map(n=>
        n.id==="model1"?{...n,type:kind}:n)}
      const item=await f.flows.create(alice,kind,graph)
      await assert.rejects(f.runs.validate(alice,item.id,{
        expected_revision:1,idempotency_key:"unsupported_"+kind+"_flow"
      }),e=>e.status===409&&e.code==="workflow_validation_node_not_supported")
    }
    const counts=(await f.db.query(
      "SELECT (SELECT count(*)::int FROM agentstudio.runs) AS runs,"+
      "(SELECT count(*)::int FROM agentstudio.jobs) AS jobs,"+
      "(SELECT count(*)::int FROM agentstudio.run_steps) AS steps"
    )).rows[0]
    assert.deepEqual(counts,{runs:0,jobs:0,steps:0})
  }finally{await f.close()}
})
test("HTTP Workflow validation is strictly owner-scoped with completed step replay",async()=>{
  const f=await fixture()
  let server
  try{
    const own=await f.flows.create(alice,"Owned graph",safeGraph)
    server=createServer(createHandler({
      repository:{},workflowRepository:f.flows,
      workflowValidationRepository:f.runs,
      verifyToken:async token=>{
        if(!["alice","bob"].includes(token))throw Error("missing_token")
        return {issuer,subject:token}
      },
      allowedOrigin:"https://workflow-uat.invalid"
    }))
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const addr="http://127.0.0.1:"+server.address().port
    const call=async(subject,method,route,body)=>{
      const result=await fetch(addr+route,{
        method,headers:{
          Origin:"https://workflow-uat.invalid",
          ...(subject?{Authorization:"Bearer "+subject}:{}),
          ...(body?{"Content-Type":"application/json"}:{})
        },
        ...(body?{body:JSON.stringify(body)}:{}),
        signal:AbortSignal.timeout(8000)
      })
      return {status:result.status,data:await result.json()}
    }
    const path="/api/v2/workflows/"+own.id+"/validate"
    const input={expected_revision:1,idempotency_key:"workflow-http-0001"}
    assert.equal((await call(null,"POST",path,input)).status,401)
    assert.equal((await call("bob","POST",path,input)).status,404)
    const created=await call("alice","POST",path,input)
    assert.equal(created.status,201,JSON.stringify(created.data))
    assert.equal(created.data.mode,"graph_validation_only")
    assert.equal(created.data.workflow_worker_started,false)
    assert.equal(created.data.external_effects_executed,false)
    assert.equal(created.data.steps.length,3)
    const again=await call("alice","POST",path,input)
    assert.equal(again.status,200)
    assert.equal(again.data.replayed,true)
    assert.equal(again.data.run.id,created.data.run.id)
    const detail="/api/v2/workflow-validations/"+created.data.run.id
    assert.equal((await call("bob","GET",detail)).status,404)
    assert.equal((await call("alice","GET",detail)).status,200)
    assert.equal((await call("alice","POST",detail,{})).status,405)
    assert.equal((await call("alice","GET",path)).status,405)
    assert.equal((await call("alice","POST",path,
      {...input,run_now:true})).status,400)
    assert.equal((await call("alice","POST",path,
      {...input,idempotency_key:"bad"})).status,400)
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects")).rows[0].n,0)
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve))
    await f.close()
  }
})
