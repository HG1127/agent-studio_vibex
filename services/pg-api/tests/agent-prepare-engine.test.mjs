// V8 native PostgreSQL Agent preparation lifecycle: signed JWT HTTP -> run
// and durable queue -> fenced Worker -> checkpoint + audit -> owner-only API.
// No real model, external POST, PocketBase, Docker, or company data.
import test from "node:test"
import assert from "node:assert/strict"
import {createServer} from "node:http"
import {readFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from "jose"
import {AgentSpecRepository} from "../src/repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {createHandler} from "../src/http.ts"
import {createJwtVerifier} from "../src/auth.ts"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const schema=readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(l=>!l.trim().startsWith("\\")).join("\n")
const agent={goal:"Prepare due diligence checklist",
  task_scope:"Public sources",tools:[],deliverables:["A review plan"],
  task_plan:["List evidence gaps"],done_criteria:["Evidence log"]}

test("signed employee submits fenced, idempotent Agent preparation and recovers leases",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  let server
  try{
    await pg.exec(schema)
    const issuer="https://synthetic-identity.invalid",audience="agent-studio-pg"
    const userIds={}
    for(const sub of ["A","B"]){
      const created=await pg.query(
        "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
        "VALUES($1,$2) RETURNING id",[issuer,sub])
      userIds[sub]=created.rows[0].id
    }
    // Only sequential calls use this PGlite single-connection adapter.
    const pool={async connect(){return {
      async query(sql,params=[]){return pg.query(sql,params)},
      release(){},
    }}}
    const repo=new AgentSpecRepository(pool)
    const runs=new RunRepository(pool)
    const idA={issuer,subject:"A"},idB={issuer,subject:"B"}
    const a=await repo.create(idA,"Agent A",agent)
    const b=await repo.create(idB,"Agent B",agent)
    const {publicKey,privateKey}=await generateKeyPair("RS256",{extractable:true})
    const jwk=await exportJWK(publicKey)
    jwk.kid="prepare";jwk.alg="RS256"
    const verifyToken=createJwtVerifier({issuer,audience},
      createLocalJWKSet({keys:[jwk]}))
    const sign=sub=>new SignJWT({sub}).setProtectedHeader({
      alg:"RS256",kid:"prepare",
    }).setIssuer(issuer).setAudience(audience).setIssuedAt()
      .setExpirationTime("10m").sign(privateKey)
    const tokenA=await sign("A"),tokenB=await sign("B")
    server=createServer(createHandler({
      repository:repo,runRepository:runs,
      verifyToken,allowedOrigin:"https://studio.staging.invalid",
    }))
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const base="http://127.0.0.1:"+server.address().port
    const invoke=async(method,url,token,body,extra={})=>{
      const response=await fetch(base+url,{method,
        headers:{"Accept":"application/json",
          ...(token?{Authorization:"Bearer "+token}:{}),
          ...(body===undefined?{}:{"Content-Type":"application/json"}),
          ...extra},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(8000),
      })
      return {status:response.status,data:await response.json()}
    }
    const postA="/api/v2/agent-specs/"+a.id+"/runs"
    const postB="/api/v2/agent-specs/"+b.id+"/runs"
    const payload={instruction:"Only prepare, do not execute a model",
      idempotency_key:"userA_prepare_001"}
    assert.equal((await invoke("POST",postA,undefined,payload,
      {"X-Rh-User-Id":"A"})).status,401)
    assert.equal((await invoke("POST",postA,tokenB,payload)).status,404)
    assert.equal((await invoke("POST",postA,tokenA,{
      ...payload,model_api_key:"forbidden",
    })).status,400)
    assert.equal((await invoke("POST",postA,tokenA,{
      ...payload,idempotency_key:"bad",
    })).status,400)
    const submitted=await invoke("POST",postA,tokenA,payload)
    assert.equal(submitted.status,202,JSON.stringify(submitted.data))
    assert.equal(submitted.data.run.status,"queued")
    assert.equal(submitted.data.mode,"model_pilot")
    assert.equal(submitted.data.run.owner_user_id,userIds.A)
    const replay=await invoke("POST",postA,tokenA,payload)
    assert.equal(replay.status,200)
    assert.equal(replay.data.replayed,true)
    assert.equal(replay.data.run.id,submitted.data.run.id)
    assert.equal((await invoke("POST",postA,tokenA,{
      ...payload,instruction:"different",
    })).status,409)
    const listing=await invoke("GET","/api/v2/runs",tokenA,
      undefined,{"X-Rh-User-Id":"B"})
    assert.equal(listing.status,200)
    assert.deepEqual(listing.data.runs.map(r=>r.id),[submitted.data.run.id])
    assert.equal((await invoke("GET","/api/v2/runs/"+submitted.data.run.id,tokenB)).status,404)

    // A second run is intentionally blocked by an ambiguous external effect:
    // Worker must see that audit event even under row-level security.
    const blocked=await invoke("POST",postA,tokenA,{
      instruction:"Blocked by external write uncertainty",
      idempotency_key:"userA_blocked_002",
    })
    assert.equal(blocked.status,202)
    await pg.query(
      "INSERT INTO agentstudio.external_effects "+
      "(owner_user_id,run_id,step_key,tool_name,arguments_sha256,"+
      "idempotency_key,status) "+
      "VALUES($1,$2,'unknown','external_write',$3,'audit-key','unknown')",
      [userIds.A,blocked.data.run.id,"f".repeat(64)])
    const other=await invoke("POST",postB,tokenB,{
      instruction:"Another employee's run",
      idempotency_key:"userB_prepare_003",
    })
    assert.equal(other.status,202)
    // Never claim a schedule or knowledge-ingest job as an Agent prepare job.
    await pg.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,kind,dedupe_key,payload) "+
      "VALUES($1,'knowledge_ingest','fake_ingest','{}'::jsonb)",
      [userIds.A])

    const worker1=new AgentPrepareWorker(pool,"prepare-one")
    const worker2=new AgentPrepareWorker(pool,"prepare-two")
    let lease=await worker1.claim()
    assert.equal(lease.run_id,submitted.data.run.id)
    assert.equal(lease.kind,"run_tick")
    assert.equal(lease.payload.phase,"prepare")
    assert.deepEqual(await worker1.prepare(lease),
      {status:"prepared",run_id:submitted.data.run.id})
    const finished=await invoke("GET","/api/v2/runs/"+submitted.data.run.id,tokenA)
    assert.equal(finished.status,200)
    assert.equal(finished.data.run.status,"awaiting_approval")
    assert.equal(finished.data.run.step_count,1)
    assert.equal(finished.data.run.checkpoint.stage,"awaiting_model_approval")
    assert.equal(finished.data.approval.status,"pending")
    assert.equal(finished.data.run.checkpoint.external_effects_executed,false)
    assert.equal(await worker1.prepare(lease).then(x=>x.status),"stale")
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.run_steps "+
      "WHERE run_id=$1",[lease.run_id])).rows[0].n,1)
    assert.equal((await pg.query(
      "SELECT count(*)::int AS n FROM agentstudio.audit_events "+
      "WHERE run_id=$1 AND action='agent.prepare'",[lease.run_id])).rows[0].n,1)

    const crashedLease=await worker1.claim()
    assert.equal(crashedLease.run_id,other.data.run.id)
    assert.equal(crashedLease.attempts,1)
    await pg.query(
      "UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '3 seconds' "+
      "WHERE id=$1",[crashedLease.id])
    const recovered=await worker2.claim()
    assert.equal(recovered.run_id,other.data.run.id)
    assert.notEqual(recovered.lease_token,crashedLease.lease_token)
    assert.equal(Number(recovered.lease_version),2)
    assert.deepEqual(await worker1.prepare(crashedLease),
      {status:"stale",run_id:other.data.run.id})
    assert.equal((await worker2.prepare(recovered)).status,"prepared")
    assert.equal((await invoke("GET","/api/v2/runs/"+other.data.run.id,tokenB)).data.run.status,"awaiting_approval")
    assert.equal((await worker1.claim()),null,"ambiguous external write blocks replay")

    await pg.query(
      "UPDATE agentstudio.external_effects SET status='succeeded' "+
      "WHERE run_id=$1",[blocked.data.run.id])
    const nowAllowed=await worker1.claim()
    assert.equal(nowAllowed.run_id,blocked.data.run.id)
    assert.equal((await worker1.prepare(nowAllowed)).status,"prepared")

    // Edited specs do not silently change the version captured at enqueue.
    const staleVersion=await invoke("POST",postA,tokenA,{
      instruction:"Revision pinned",
      idempotency_key:"userA_prepare_004",
    })
    const changedSpec=await repo.update(idA,a.id,"Edited spec",
      {...agent,goal:"Revised company due diligence"},1)
    assert.equal(changedSpec.revision,2)
    const staleRevisionLease=await worker1.claim()
    assert.equal(staleRevisionLease.run_id,staleVersion.data.run.id)
    await worker1.prepare(staleRevisionLease)
    assert.equal((await invoke("GET","/api/v2/runs/"+staleVersion.data.run.id,tokenA))
      .data.run.checkpoint.stage,"spec_revision_changed")

    // Invalid preparation payload automatically retries, then fails at max.
    const corrupted=await invoke("POST",postB,tokenB,{
      instruction:"Simulate malformed queued payload",
      idempotency_key:"userB_corrupt_005",
    })
    await pg.query("UPDATE agentstudio.jobs SET payload='{\"phase\":\"prepare\"}'::jsonb "+
      "WHERE run_id=$1",[corrupted.data.run.id])
    for(let attempt=1;attempt<=3;attempt++){
      const result=await worker1.tick()
      assert.equal(result.status,attempt<3?"retry_scheduled":"failed")
      if(attempt<3)await pg.query(
        "UPDATE agentstudio.jobs SET scheduled_at=clock_timestamp()-interval '2 seconds' "+
        "WHERE run_id=$1",[corrupted.data.run.id])
    }
    const failure=await invoke("GET","/api/v2/runs/"+corrupted.data.run.id,tokenB)
    assert.equal(failure.data.run.status,"failed")
    assert.equal(failure.data.run.last_error_code,"prepare_failed")
    assert.equal((await worker1.tick()).status,"idle")

    // Last-attempt crash: expired lease is explicitly marked failed instead
    // of remaining forever unclaimable after max_attempts is reached.
    const exhausted=await invoke("POST",postA,tokenA,{
      instruction:"final attempt may crash",
      idempotency_key:"userA_exhausted_007",
    })
    assert.equal(exhausted.status,202)
    await pg.query("UPDATE agentstudio.jobs SET max_attempts=1 "+
      "WHERE run_id=$1",[exhausted.data.run.id])
    const lastClaim=await worker2.claim()
    assert.equal(lastClaim.run_id,exhausted.data.run.id)
    await pg.query("UPDATE agentstudio.jobs "+
      "SET lease_until=clock_timestamp()-interval '2 seconds' "+
      "WHERE id=$1",[lastClaim.id])
    const swept=await worker1.tick()
    assert.equal(swept.status,"failed")
    assert.equal(swept.run_id,exhausted.data.run.id)
    assert.equal((await invoke("GET","/api/v2/runs/"+exhausted.data.run.id,
      tokenA)).data.run.last_error_code,"prepare_lease_exhausted")
    assert.equal((await pg.query("SELECT status FROM agentstudio.jobs "+
      "WHERE run_id=$1",[exhausted.data.run.id])).rows[0].status,"failed")
    assert.equal((await worker2.tick()).status,"idle")

    // A disabled user's queued run cannot be claimed by any Worker.
    const deactivated=await invoke("POST",postB,tokenB,{
      instruction:"must not prepare after suspension",
      idempotency_key:"userB_deactivated_006",
    })
    assert.equal(deactivated.status,202)
    await pg.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[userIds.B])
    assert.equal((await worker1.tick()).status,"idle")
    assert.equal((await invoke("GET","/api/v2/runs",tokenB)).status,403)

    // No actual model calls, no external tool calls or web browsing.
    const unrelated=await pg.query(
      "SELECT kind,status FROM agentstudio.jobs WHERE kind='knowledge_ingest'")
    assert.equal(unrelated.rows[0].status,"queued")
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve))
    await pg.close()
  }
})
