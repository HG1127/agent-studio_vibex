// Isolated end-to-end PG model-binding execution with injected trusted broker.
// All credentials/models are synthetic; NO real provider, network, BaoTa or V7.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {Readable} from "node:stream"
import {TLSSocket} from "node:tls"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {AgentSpecRepository} from "../src/repository.ts"
import {ModelConnectionRepository} from "../src/model-connection-repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {OwnerBoundModelDispatch} from "../src/owner-model-dispatch.ts"
import {BoundLeaseIdentityRepository,createVerifiedBoundDispatchAdapter}
  from "../src/bound-lease-identity.ts"
import {createIsolatedBoundModelInternalHandler}
  from "../src/bound-model-internal-handler.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const identityMigration=readFileSync(path.join(root,
  "db/postgres/migrations/pg_v9_024_bound_dispatch_identity.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const issuer="https://synthetic-bound-worker.invalid"
const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
const key=Buffer.from("0123456789abcdef".repeat(4),"hex")
const apiKey="synthetic-owner-bound-model-credential-12345"
const input={
  name:"Official OpenAI synthetic only",provider:"openai",
  base_url:"https://api.openai.com/v1",
  api_key:apiKey,models:["gpt-4.1-mini"],enabled:true,
}
const agentSpec={
  goal:"Create a fact-bound brief",task_scope:"Synthetic, no external tools",
  deliverables:["Brief"],task_plan:[],done_criteria:["Cite source"],tools:[],
  knowledge_base_ids:[],
}
async function fixture(){
  const db=await PGlite.create({extensions:{vector}})
  await db.exec(schema)
  await db.query("INSERT INTO agentstudio.schema_migrations(version,description) "+
    "VALUES('pg_v9_023','synthetic reviewed predecessor')")
  await db.exec(identityMigration)
  for(const name of ["alice","bob"])await db.query(
    "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
    "VALUES($1,$2)",[issuer,name])
  const pool={async connect(){return {
    query:(sql,args=[])=>db.query(sql,args),release(){},
  }}}
  const models=new ModelConnectionRepository(pool,key)
  const agents=new AgentSpecRepository(pool)
  const runs=new RunRepository(pool,{allowBoundModelRuns:true})
  const identities=new BoundLeaseIdentityRepository(pool)
  const connection=await models.create(alice,input)
  const tested=await models.testConnection(alice,connection.id,connection.revision,
    async()=>({status:"ok",latency_ms:3,error_code:""}))
  const binding={connection_id:tested.id,connection_revision:tested.revision,
    model_id:"gpt-4.1-mini"}
  const spec=await agents.create(alice,"Isolated bound Agent",
    {...agentSpec,model_binding:binding})
  const prepare=new AgentPrepareWorker(pool,"bound-prepare")
  async function approvedRun(keySuffix){
    const request={instruction:"Assess owner-bound facts",
      idempotency_key:"bound-run-"+keySuffix}
    const submitted=await runs.submit(alice,spec.id,request)
    assert.equal(submitted.replayed,false)
    assert.equal((await prepare.tick()).status,"prepared")
    const approved=await runs.decideModel(alice,submitted.run.id,{decision:"approved"})
    assert.equal(approved.approval,"approved")
    return submitted.run.id
  }
  return {db,pool,models,agents,runs,identities,tested,spec,binding,approvedRun,
    async close(){await db.close()}}
}

test("bound-only Worker pauses an unbound Agent before either gateway or fixed-provider effects",async()=>{
  const f=await fixture()
  try{
    const plain=await f.agents.create(alice,"Unbound synthetic Agent",agentSpec)
    const submitted=await f.runs.submit(alice,plain.id,{
      instruction:"No shared-provider fallback",idempotency_key:"unbound-no-fallback-0001"})
    const prepare=new AgentPrepareWorker(f.pool,"no-fallback-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    await f.runs.decideModel(alice,submitted.run.id,{decision:"approved"})
    let fixed=0,bound=0
    const worker=new AgentModelWorker(f.pool,"no-fallback-model",{
      async generate(){fixed++;return "must never execute"}
    },{boundOnly:true,boundExecutionApproved:true,
      boundModelDispatch:async()=>{bound++;return {status:"succeeded",text:"must never execute"}}})
    assert.equal((await worker.tick()).status,"blocked")
    const run=await f.runs.get(alice,submitted.run.id)
    assert.equal(run.status,"paused")
    assert.equal(run.last_error_code,"model_binding_required")
    assert.equal((await f.db.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects WHERE run_id=$1",
      [submitted.run.id])).rows[0].n,0)
    assert.equal(fixed,0);assert.equal(bound,0)
  }finally{await f.close()}
})
test("no separate runtime permission means bound model runs remain denied without a job",async()=>{
  const f=await fixture()
  try{
    const denied=new RunRepository(f.pool)
    await assert.rejects(
      denied.submit(alice,f.spec.id,{instruction:"deny paid call",idempotency_key:"bound-deny-0001"}),
      e=>e.status===409&&e.code==="model_binding_runtime_not_enabled")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
    const fixed={async generate(){throw Error("fixed_provider_must_never_run")}}
    assert.throws(()=>new AgentModelWorker(f.pool,"denied-worker",fixed,
      {boundExecutionApproved:true}),/bound_model_execution_disabled/)
    assert.throws(()=>new AgentModelWorker(f.pool,"denied-worker",fixed,
      {boundModelDispatch:async()=>({status:"succeeded",text:"forbidden"})}),
    /bound_model_execution_disabled/)
  }finally{await f.close()}
})
test("approved bound model runs use only owner credentials and one durable broker POST",async()=>{
  const f=await fixture()
  let paid=0,fixed=0
  try{
    const runId=await f.approvedRun("successful-0001")
    const broker=new OwnerBoundModelDispatch(f.pool,key,
      async(material,actual)=>{
        paid++
        assert.equal(material.provider,"openai")
        assert.equal(material.model_id,f.binding.model_id)
        assert.equal(material.api_key,apiKey)
        assert.equal(actual.instruction,"Assess owner-bound facts")
        return "Synthetic answer using owner-selected model"
      })
    const worker=new AgentModelWorker(f.pool,"bound-model-worker",{
      async generate(){fixed++;throw Error("wrong_provider")}
    },{
      boundExecutionApproved:true,
      boundModelDispatch:createVerifiedBoundDispatchAdapter(f.identities,broker)
    })
    assert.equal((await worker.tick()).status,"succeeded")
    assert.equal(paid,1)
    assert.equal(fixed,0)
    const run=(await f.db.query(
      "SELECT status,result_text FROM agentstudio.runs WHERE id=$1::uuid",[runId])).rows[0]
    assert.equal(run.status,"succeeded")
    assert.equal(run.result_text,"Synthetic answer using owner-selected model")
    const effects=(await f.db.query(
      "SELECT step_key,status FROM agentstudio.external_effects "+
      "WHERE run_id=$1::uuid ORDER BY step_key",[runId])).rows
    assert.deepEqual(effects.map(x=>[x.step_key,x.status]),[
      ["model","succeeded"],["model_bound_dispatch","succeeded"]])
    assert.equal((await worker.tick()).status,"idle")
    assert.equal(paid,1,"no repeat paid POST after lease acknowledgement")
    assert.equal(JSON.stringify(await f.runs.get(bob,runId)), "null")
    assert.equal(JSON.stringify(run).includes(apiKey),false)
  }finally{await f.close()}
})
test("stale and disabled owner model connections cannot enqueue any bound run",async()=>{
  const f=await fixture()
  try{
    await f.models.update(alice,f.tested.id,{
      ...input,name:"Rotated after the agent saved",api_key:"",
    },f.tested.revision)
    await assert.rejects(
      f.runs.submit(alice,f.spec.id,{
        instruction:"No silent provider fallback",idempotency_key:"bound-stale-0001"
      }),e=>e.status===409&&e.code==="model_connection_revision_changed")
    await assert.rejects(
      f.runs.submit(bob,f.spec.id,{
        instruction:"No cross-employee use",idempotency_key:"bound-bob-0001"
      }),e=>e.status===404&&e.code==="spec_not_found")
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.jobs")).rows[0].n,0)
  }finally{await f.close()}
})
test("ambiguous provider outcome quarantines a bound run without another POST",async()=>{
  const f=await fixture()
  let paid=0,fixed=0
  try{
    const runId=await f.approvedRun("ambiguous-0001")
    const broker=new OwnerBoundModelDispatch(f.pool,key,async()=>{
      paid++
      throw Error("private synthetic transport failed")
    })
    const worker=new AgentModelWorker(f.pool,"bound-error-worker",{
      async generate(){fixed++;throw Error("wrong_provider")}
    },{
      boundExecutionApproved:true,
      boundModelDispatch:createVerifiedBoundDispatchAdapter(f.identities,broker)
    })
    assert.equal((await worker.tick()).status,"quarantined")
    assert.equal(paid,1)
    assert.equal(fixed,0)
    const run=(await f.runs.get(alice,runId))
    assert.equal(run.status,"paused")
    assert.equal(run.checkpoint.requires_manual_reconciliation,true)
    const effects=(await f.db.query(
      "SELECT step_key,status FROM agentstudio.external_effects "+
      "WHERE run_id=$1::uuid ORDER BY step_key",[runId])).rows
    assert.deepEqual(effects.map(x=>[x.step_key,x.status]),[
      ["model","unknown"],["model_bound_dispatch","unknown"]])
    assert.equal((await worker.tick()).status,"idle")
    assert.equal(paid,1)
  }finally{await f.close()}
})
test("synthetic mTLS request -> PG lease identity -> Broker -> Worker result closes the chain",async()=>{
  const f=await fixture()
  let paid=0,fixed=0
  try{
    const runId=await f.approvedRun("synthetic-tls-0001")
    const broker=new OwnerBoundModelDispatch(f.pool,key,async()=>{
      paid++;return "mTLS verified synthetic output"
    })
    const dispatch=createVerifiedBoundDispatchAdapter(f.identities,broker)
    const pin="DC".repeat(32)
    const certFingerprint=new Array(32).fill("DC").join(":")
    const handler=createIsolatedBoundModelInternalHandler({
      approvedForIsolatedUat:true,
      reviewedClientFingerprint256:pin,
      dispatch,
    })
    const transported=async(claim,input)=>{
      // Synthetic TLSSocket attribute fixture only. No real certificate,
      // TLS handshake, socket listener, provider or company data.
      const socket=Object.create(TLSSocket.prototype)
      Object.defineProperties(socket,{
        authorized:{value:true},encrypted:{value:true},
        getPeerCertificate:{value:()=>({
          raw:Buffer.alloc(32,2),fingerprint256:certFingerprint,
        })}
      })
      const data=Buffer.from(JSON.stringify({claim,input}))
      const req=Readable.from([data])
      Object.assign(req,{socket,method:"POST",
        url:"/__internal/v1/bound-model/dispatch",
        headers:{"content-type":"application/json",
          "content-length":String(data.length)}
      })
      const response={status:null,body:null,
        writeHead(code){this.status=code},
        end(result){this.body=JSON.parse(String(result))}
      }
      await handler(req,response)
      if(response.status!==200)throw Error("synthetic_bound_dispatch_rejected")
      return response.body
    }
    const worker=new AgentModelWorker(f.pool,"synthetic-mtls-worker",{
      async generate(){fixed++;throw Error("never_use_fixed_provider")}
    },{boundExecutionApproved:true,boundModelDispatch:transported})
    assert.equal((await worker.tick()).status,"succeeded")
    assert.equal(paid,1)
    assert.equal(fixed,0)
    const run=await f.runs.get(alice,runId)
    assert.equal(run.status,"succeeded")
    assert.equal(run.result_text,"mTLS verified synthetic output")
    assert.equal((await worker.tick()).status,"idle")
    assert.equal(paid,1,"transport retry must not trigger a second model POST")
  }finally{await f.close()}
})
