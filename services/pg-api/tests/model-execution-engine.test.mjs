// Synthetic PostgreSQL SQL + signed-JWT HTTP test of approval -> fenced
// model invocation -> output/error recovery. NO real network model or BaoTa.
import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from "jose"
import {AgentSpecRepository} from "../src/repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {createStagingOpenAIProvider} from "../src/model-provider.ts"
import {createHandler} from "../src/http.ts"
import {createJwtVerifier} from "../src/auth.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(x=>!x.startsWith("\\")).join("\n")
const spec={goal:"Write a factual, short investment risk summary",
  task_scope:"Use only given facts",deliverables:["Risk summary"],task_plan:[],
  done_criteria:["State uncertainties"],tools:[]}

test("PGlite employee approval, one model call, tenant isolation, ambiguous failure and crash recovery",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  let server
  try{
    await pg.exec(schema)
    const issuer="https://isolated-identity.invalid",audience="isolated-pg"
    const ids={}
    for(const who of ["alice","bob"]){
      const result=await pg.query(
        "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
        "VALUES($1,$2) RETURNING id",[issuer,who])
      ids[who]=result.rows[0].id
    }
    const pool={async connect(){return {
      async query(sql,params=[]){return pg.query(sql,params)},release(){},
    }}}
    const specs=new AgentSpecRepository(pool)
    const runs=new RunRepository(pool)
    const agent=await specs.create({issuer,subject:"alice"},"Reviewed Research",spec)
    const {publicKey,privateKey}=await generateKeyPair("RS256",{extractable:true})
    const jwk=await exportJWK(publicKey)
    jwk.kid="model";jwk.alg="RS256"
    const verifyToken=createJwtVerifier({issuer,audience},
      createLocalJWKSet({keys:[jwk]}))
    const sign=sub=>new SignJWT({sub}).setProtectedHeader({
      kid:"model",alg:"RS256",
    }).setIssuer(issuer).setAudience(audience).setIssuedAt()
      .setExpirationTime("10m").sign(privateKey)
    const alice=await sign("alice"),bob=await sign("bob")
    server=createServer(createHandler({
      repository:specs,runRepository:runs,verifyToken,
      allowedOrigin:"https://isolated.studio.invalid",
    }))
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const url="http://127.0.0.1:"+server.address().port
    const call=async(method,route,token,body)=>{
      const res=await fetch(url+route,{
        method,
        headers:{Authorization:"Bearer "+token,
          ...(body===undefined?{}:{"Content-Type":"application/json"})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(7000),
      })
      return {status:res.status,body:await res.json()}
    }
    const runPath=id=>"/api/v2/runs/"+id
    const approvalPath=id=>runPath(id)+"/model-approval"
    const submit=async(key,instruction)=>{
      const r=await call("POST","/api/v2/agent-specs/"+agent.id+"/runs",
        alice,{instruction,idempotency_key:key})
      assert.equal(r.status,202,JSON.stringify(r.body))
      return r.body.run.id
    }
    const first=await submit("model_success_a1","Analyze internal controls")
    assert.equal((await call("POST",approvalPath(first),alice,
      {decision:"approved"})).status,409,"cannot bypass prepare")
    const prepare=new AgentPrepareWorker(pool,"test-prepare")
    assert.equal((await prepare.tick()).status,"prepared")
    assert.equal((await call("GET",runPath(first),bob)).status,404)
    assert.equal((await call("POST",approvalPath(first),bob,
      {decision:"approved"})).status,404)
    assert.equal((await call("POST",approvalPath(first),alice,
      {decision:"approve"})).status,400)
    assert.equal((await call("POST",approvalPath(first),alice,
      {decision:"approved",owner_user_id:ids.bob})).status,400)
    const approved=await call("POST",approvalPath(first),alice,
      {decision:"approved"})
    assert.equal(approved.status,202)
    assert.equal(approved.body.run.status,"queued")
    assert.equal((await call("POST",approvalPath(first),alice,
      {decision:"approved"})).body.replayed,true)
    assert.equal((await call("POST",approvalPath(first),alice,
      {decision:"rejected"})).status,409)
    let calls=0
    const worker=new AgentModelWorker(pool,"model-first",{
      async generate(input){
        calls++
        assert.equal(input.instruction,"Analyze internal controls")
        return "The evidence is limited; verify controls before investing."
      },
    })
    const firstJob=await worker.claim()
    assert.equal(firstJob.payload.phase,"model")
    const staged=await worker.begin(firstJob)
    assert.equal(staged.status,"ready")
    assert.equal((await call("GET",runPath(first),alice)).body.run.status,"running")
    const result=await worker.succeed(firstJob,await worker.provider.generate(staged.input))
    assert.equal(result.status,"succeeded")
    assert.equal(calls,1)
    const finished=await call("GET",runPath(first),alice)
    assert.equal(finished.body.run.result_text,
      "The evidence is limited; verify controls before investing.")
    assert.equal(finished.body.run.status,"succeeded")
    assert.equal(finished.body.approval.status,"approved")
    assert.equal((await pg.query(
      "SELECT status FROM agentstudio.external_effects WHERE run_id=$1",
      [first])).rows[0].status,"succeeded")
    assert.equal((await pg.query(
      "SELECT status FROM agentstudio.run_steps WHERE run_id=$1 "+
      "AND step_key='model'",[first])).rows[0].status,"succeeded")
    assert.equal((await worker.succeed(firstJob,"Replay")).status,"stale")
    assert.equal((await worker.tick()).status,"idle")

    const rejected=await submit("model_reject_a2","Do not call any model")
    await prepare.tick()
    const rejectedResponse=await call("POST",approvalPath(rejected),
      alice,{decision:"rejected"})
    assert.equal(rejectedResponse.body.run.status,"cancelled")
    assert.equal((await worker.tick()).status,"idle")

    const errored=await submit("model_unknown_a3","Simulate provider timeout")
    await prepare.tick()
    assert.equal((await call("POST",approvalPath(errored),alice,
      {decision:"approved"})).status,202)
    const failWorker=new AgentModelWorker(pool,"model-failure",{
      async generate(){throw Error("synthetic_no_network_failure")},
    })
    assert.equal((await failWorker.tick()).status,"quarantined")
    const paused=await call("GET",runPath(errored),alice)
    assert.equal(paused.body.run.status,"paused")
    assert.equal(paused.body.run.checkpoint.requires_manual_reconciliation,true)
    assert.equal((await pg.query(
      "SELECT status FROM agentstudio.external_effects WHERE run_id=$1",
      [errored])).rows[0].status,"unknown")
    assert.equal((await worker.tick()).status,"idle","no auto retry of billed requests")

    const crash=await submit("model_crash_a4","Simulate worker crash")
    await prepare.tick()
    await call("POST",approvalPath(crash),alice,{decision:"approved"})
    const crashJob=await worker.claim()
    assert.equal((await worker.begin(crashJob)).status,"ready")
    await pg.query(
      "UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-INTERVAL '2 seconds' "+
      "WHERE id=$1",[crashJob.id])
    assert.equal((await failWorker.tick()).status,"quarantined")
    assert.equal((await worker.succeed(crashJob,"Late response")).status,"stale")
    assert.equal((await call("GET",runPath(crash),alice))
      .body.run.last_error_code,"model_lease_expired")
    assert.equal((await failWorker.tick()).status,"idle")

    // Last-attempt lease expires before any model request: terminal cleanup.
    const abandoned=await submit("model_unstarted_exhausted_a6",
      "Simulate crash before contacting provider")
    await prepare.tick()
    await call("POST",approvalPath(abandoned),alice,{decision:"approved"})
    await pg.query(
      "UPDATE agentstudio.jobs SET max_attempts=1 "+
      "WHERE run_id=$1 AND payload->>'phase'='model'",[abandoned])
    const abandonedLease=await worker.claim()
    assert.equal(abandonedLease.run_id,abandoned)
    await pg.query("UPDATE agentstudio.jobs "+
      "SET lease_until=clock_timestamp()-interval '2 seconds' "+
      "WHERE id=$1",[abandonedLease.id])
    const recoveredWithoutRetry=await worker.tick()
    assert.equal(recoveredWithoutRetry.status,"failed")
    assert.equal(recoveredWithoutRetry.run_id,abandoned)
    assert.equal((await call("GET",runPath(abandoned),alice))
      .body.run.last_error_code,"model_lease_exhausted")
    assert.equal((await worker.begin(abandonedLease)).status,"stale")
    assert.equal(calls,1,"no extra model call after final-attempt crash")

    const revision=await submit("model_revision_a5","Prevent spec drift")
    await prepare.tick()
    await call("POST",approvalPath(revision),alice,{decision:"approved"})
    const updated=await specs.update({issuer,subject:"alice"},agent.id,
      "Edited Agent",{...spec,goal:"Different target"},1)
    assert.equal(updated.revision,2)
    assert.equal((await worker.tick()).status,"blocked")
    assert.equal((await call("GET",runPath(revision),alice))
      .body.run.checkpoint.stage,"spec_revision_changed")
    assert.equal(calls,1,"only first run was sent to provider")
    // Simulate a pre-existing/imported approved run whose Agent acquired
    // a user-specific binding without changing its version. The fixed-key
    // Worker must pause it BEFORE recording external effects or billing.
    const boundRun=await submit("model_bound_block_a7",
      "Never bill a different employee-selected provider")
    await prepare.tick()
    assert.equal((await call("POST",approvalPath(boundRun),alice,
      {decision:"approved"})).status,202)
    await pg.query("UPDATE agentstudio.agent_specs SET spec="+
      "jsonb_set(spec,'{model_binding}',$2::jsonb) WHERE id=$1::uuid",
      [agent.id,JSON.stringify({
        connection_id:"863eb81f-2a04-4147-91d6-b1c71f0e8d38",
        connection_revision:1,model_id:"gpt-4.1-mini",
      })])
    assert.equal((await worker.tick()).status,"blocked")
    const blocked=await call("GET",runPath(boundRun),alice)
    assert.equal(blocked.body.run.status,"paused")
    assert.equal(blocked.body.run.last_error_code,"model_binding_runtime_not_enabled")
    const externalCount=await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.external_effects "+
      "WHERE run_id=$1::uuid",[boundRun])
    assert.equal(externalCount.rows[0].n,0)
    assert.equal(calls,1,"selected employee model must never call fixed provider")
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve))
    await pg.close()
  }
})

test("OpenAI adapter is fixed-host, opt-in, bounded, and testable without network",async()=>{
  const temp=mkdtempSync(path.join(tmpdir(),"pg-model-fixture-"))
  const file=path.join(temp,"model-key")
  writeFileSync(file,"stage-test-only-key-1234567890")
  try{
    const env={
      AGENT_STUDIO_PG_MODEL_WORKER_ENABLED:"true",
      AGENT_STUDIO_MODEL_API_KEY_FILE:file,
      AGENT_STUDIO_MODEL_ID:"gpt-4.1-mini",
    }
    assert.throws(()=>createStagingOpenAIProvider({
      ...env,AGENT_STUDIO_MODEL_ENDPOINT:"http://127.0.0.1/admin",
    }),/unsafe_model_endpoint/)
    assert.throws(()=>createStagingOpenAIProvider({
      ...env,AGENT_STUDIO_PG_MODEL_WORKER_ENABLED:"false",
    }),/model_worker_disabled/)
    let invoked=0
    const fakeFetch=async(url,options)=>{
      invoked++
      assert.equal(url,"https://api.openai.com/v1/chat/completions")
      assert.match(options.headers.Authorization,/^Bearer stage-test-only/)
      assert.equal(options.redirect,"error")
      const body=JSON.parse(options.body)
      assert.equal(body.model,"gpt-4.1-mini")
      assert.equal(body.messages[1].role,"user")
      return {ok:true,json:async()=>({
        choices:[{message:{content:"Verified synthetic output"}}],
      })}
    }
    const provider=createStagingOpenAIProvider(env,fakeFetch)
    assert.equal(await provider.generate({
      goal:"Investment note",instruction:"Summarize",
      taskScope:"synthetic",deliverables:[],doneCriteria:[],
    }),"Verified synthetic output")
    assert.equal(invoked,1)
    await assert.rejects(provider.generate({
      goal:"",instruction:"",taskScope:"",deliverables:[],doneCriteria:[],
    }),/invalid_model_input/)
    assert.equal(invoked,1)
  }finally{rmSync(temp,{recursive:true,force:true})}
})
