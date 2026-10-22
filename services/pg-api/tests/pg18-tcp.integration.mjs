// Real PostgreSQL 18 TCP integration, NEVER runnable against BaoTa or a
// developer-supplied database. GitHub Actions-only disposable pgvector image.
// Creates SYNTHETIC roles/rows in agentstudio_pg18_ci (port 5432), exercises
// separate API/Worker logins, parallel SKIP LOCKED claims, RLS/approval,
// fencing, crash recovery, and uncertain model outcome WITHOUT HTTP/providers.
// Invoking locally without the exact CI attestation fails before any socket.
import test from "node:test"
import assert from "node:assert/strict"
import {createHash,randomUUID} from "node:crypto"
import {readFileSync} from "node:fs"
import {execFile} from "node:child_process"
import {promisify} from "node:util"
import {fileURLToPath} from "node:url"
import pgPackage from "pg"
import {loadPg18CiBaseline} from "../src/pg18-ci-schema.mjs"
import {requireEphemeralPg18Ci} from "../src/pg18-ephemeral-ci-guard.mjs"
import {AgentSpecRepository} from "../src/repository.ts"
import {KnowledgeBaseRepository} from "../src/knowledge-repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {BoundLeaseIdentityRepository} from "../src/bound-lease-identity.ts"

const {Pool}=pgPackage
const execFileAsync=promisify(execFile)
const claimScript=fileURLToPath(new URL("./helpers/pg18-ci-claim-worker.mjs",import.meta.url))
const childEnvKeys=[
  "GITHUB_ACTIONS","CI","GITHUB_RUN_ID","AGENT_STUDIO_PG18_CI_EPHEMERAL",
  "AGENT_STUDIO_PG18_CI_WRITE_APPROVED","AGENT_STUDIO_PG18_CI_HOST",
  "AGENT_STUDIO_PG18_CI_PORT","AGENT_STUDIO_PG18_CI_DATABASE",
  "AGENT_STUDIO_PG18_CI_ADMIN_USER","AGENT_STUDIO_PG18_CI_ADMIN_PASSWORD"
]
async function claimInChildProcess(name){
  const env=Object.fromEntries(childEnvKeys.map(key=>[key,process.env[key]])
    .filter(([,value])=>value!==undefined))
  const {stdout}=await execFileAsync(process.execPath,[
    "--experimental-strip-types",claimScript,"--prepare-claim-once",name
  ],{env,timeout:15000,maxBuffer:8192,windowsHide:true})
  const parsed=JSON.parse(stdout.trim())
  assert.equal(parsed.worker,"pg18-ci-prepare-"+name)
  assert.equal(parsed.lease.lease_owner,parsed.worker)
  assert.equal(parsed.lease.payload?.phase,"prepare")
  return parsed.lease
}
const spec={
  goal:"Assess synthetic underwriting controls",task_scope:"No external systems",
  deliverables:["Synthetic risk note"],task_plan:["Review mock facts"],
  done_criteria:["Disclose all assumptions"],tools:[]
}
function adapter(pool){
  return {async connect(){
    const connection=await pool.connect()
    return {
      async query(sql,parameters=[]){
        const response=await connection.query(sql,parameters)
        return {rows:response.rows}
      },
      release(){connection.release()}
    }
  }}
}
function syntheticPassword(admin,purpose){
  return "synthetic-"+createHash("sha256")
    .update(admin+":"+purpose).digest("hex").slice(0,48)
}
async function installLogins(admin,adminPassword){
  const accounts=["agentstudio_stage_login","agentstudio_stage_worker"]
  const preexisting=await admin.query(
    "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])",[accounts])
  assert.equal(preexisting.rowCount,0,"refuse reuse of global login roles")
  const apiPassword=syntheticPassword(adminPassword,"api")
  const workerPassword=syntheticPassword(adminPassword,"worker")
  // Synthetic passwords contain only lowercase hex, hyphen and letters.
  // Never substitute client input or a production credential in SQL.
  await admin.query(
    "CREATE ROLE agentstudio_stage_login LOGIN NOINHERIT "+
    "NOSUPERUSER NOBYPASSRLS PASSWORD '"+apiPassword+"'")
  await admin.query(
    "CREATE ROLE agentstudio_stage_worker LOGIN NOINHERIT "+
    "NOSUPERUSER NOBYPASSRLS PASSWORD '"+workerPassword+"'")
  await admin.query("GRANT agentstudio_api TO agentstudio_stage_login")
  await admin.query(
    "GRANT agentstudio_worker,agentstudio_api TO agentstudio_stage_worker")
  await admin.query(
    "REVOKE CONNECT ON DATABASE agentstudio_pg18_ci FROM PUBLIC")
  await admin.query(
    "GRANT CONNECT ON DATABASE agentstudio_pg18_ci TO "+
    "agentstudio_stage_login,agentstudio_stage_worker")
  return {apiPassword,workerPassword}
}
async function checkWorkerColumnBoundary(workerPool){
  const conn=await workerPool.connect()
  try{
    await conn.query("BEGIN READ ONLY")
    await conn.query("SET LOCAL ROLE agentstudio_worker")
    await assert.rejects(
      conn.query("SELECT instruction FROM agentstudio.runs LIMIT 1"),
      error=>error?.code==="42501")
  }finally{
    await conn.query("ROLLBACK").catch(()=>undefined)
    conn.release()
  }
}

test("PG18 CI: genuine two-connection Prepare/Model lifecycle and RLS fencing",async()=>{
  // Guard FIRST: do not create even a pg Pool unless GitHub Actions certifies
  // the target is a synthetic, distinct database on its disposable service.
  const target=requireEphemeralPg18Ci(process.env)
  const admin=new Pool(target)
  let apiPool,workerPool,boundIdentityPool
  try{
    const identity=(await admin.query(
      "SELECT current_database() AS db,session_user AS login,"+
      "current_setting('server_version_num')::integer AS version,"+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS admin,"
      +"(SELECT count(*)::integer FROM pg_tables WHERE schemaname='agentstudio') AS existing"
    )).rows[0]
    assert.equal(identity.db,"agentstudio_pg18_ci")
    assert.equal(identity.login,"agentstudio_admin")
    assert.equal(identity.admin,true)
    assert.ok(identity.version>=180000&&identity.version<190000,
      "must be genuine PostgreSQL 18 (not 17, PGlite or future PG)")
    assert.equal(identity.existing,0,"refuse non-empty or previously migrated DB")
    const schemas=(await admin.query(
      "SELECT count(*)::integer AS n FROM pg_namespace "+
      "WHERE nspname IN ('agentstudio','agentstudio_auth')")).rows[0]
    assert.equal(schemas.n,0,"refuse preexisting app schemas")
    const roles=(await admin.query(
      "SELECT count(*)::integer AS n FROM pg_roles "+
      "WHERE rolname=ANY($1::text[])",
      [["agentstudio_api","agentstudio_worker",
        "agentstudio_stage_login","agentstudio_stage_worker"]])).rows[0]
    assert.equal(roles.n,0,"refuse reused global roles")
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM pg_available_extensions "+
      "WHERE name='vector'")).rows[0].n,1)
    await admin.query(loadPg18CiBaseline().sql)
    const tables=(await admin.query(
      "SELECT count(*)::integer AS n FROM pg_tables "+
      "WHERE schemaname='agentstudio'")).rows[0].n
    assert.equal(tables,23)
    const forceRls=(await admin.query(
      "SELECT count(*)::integer AS n FROM pg_class c "+
      "JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relkind='r' "+
      "AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n
    assert.equal(forceRls,22)
    const logins=await installLogins(admin,target.password)
    apiPool=new Pool({...target,user:"agentstudio_stage_login",
      password:logins.apiPassword,max:5})
    workerPool=new Pool({...target,user:"agentstudio_stage_worker",
      password:logins.workerPassword,max:5})
    const runRepo=new RunRepository(adapter(apiPool))
    const agents=new AgentSpecRepository(adapter(apiPool))
    const prepAdapter=adapter(workerPool)
    const issuer="https://synthetic-pg18-ci.invalid"
    for(const sub of ["alice","bob"]){
      await admin.query(
        "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
        "VALUES($1,$2)",[issuer,sub])
    }
    const alice={issuer,subject:"alice"},bob={issuer,subject:"bob"}
    const [aliceSpec,bobSpec]=await Promise.all([
      agents.create(alice,"Synthetic Alice",spec),
      agents.create(bob,"Synthetic Bob",spec)
    ])
    assert.equal((await agents.list(alice)).length,1)
    assert.equal((await agents.list(bob)).length,1)
    assert.equal(await agents.get(bob,aliceSpec.id),null)

    // The disposable CI DB holds only synthetic, owner-private evidence.
    const knowledgeRepo=new KnowledgeBaseRepository(adapter(apiPool))
    const ownKb=await knowledgeRepo.create(alice,"Alice synthetic KB","")
    const otherKb=await knowledgeRepo.create(bob,"Bob private KB","")
    await assert.rejects(agents.update(alice,aliceSpec.id,"Wrong owner",{
      ...spec,tools:["knowledge_search"],knowledge_base_ids:[otherKb.id],
      require_approval:true
    },1),error=>error?.status===404&&error?.code==="knowledge_base_not_found")
    const linked=await agents.update(alice,aliceSpec.id,"Synthetic Alice",{
      ...spec,tools:["knowledge_search"],knowledge_base_ids:[ownKb.id],
      require_approval:true
    },1)
    assert.equal(linked.revision,2)
    assert.deepEqual(linked.spec.knowledge_base_ids,[ownKb.id])
    const syntheticDoc=await knowledgeRepo.createTextDocument(alice,ownKb.id,{
      filename:"pg18-ci-evidence.md",
      text:"量子计算合成行业资料，仅用于真实 PG18 CI 验证引用来源。"
    })
    assert.equal(syntheticDoc.status,"indexed")
    assert.equal((await knowledgeRepo.list(bob)).length,1)
    assert.equal(await knowledgeRepo.get(bob,ownKb.id),null)

    // Two requests with one idempotency key can truly race on distinct PG18
    // connections. Exactly one run/job must persist; the other returns a
    // replay after its aborted INSERT transaction has rolled back.
    const [ra,raReplay,rb]=await Promise.all([
      runRepo.submit(alice,aliceSpec.id,{
        instruction:"知识检索：量子计算",idempotency_key:"pg18ci_alice_001"}),
      runRepo.submit(alice,aliceSpec.id,{
        instruction:"知识检索：量子计算",idempotency_key:"pg18ci_alice_001"}),
      runRepo.submit(bob,bobSpec.id,{
        instruction:"Synthetic Bob prep",idempotency_key:"pg18ci_bob_001"})
    ])
    assert.equal(ra.run.id,raReplay.run.id)
    assert.deepEqual([ra.replayed,raReplay.replayed].sort(),[false,true])
    assert.equal(rb.replayed,false)
    await assert.rejects(runRepo.submit(alice,aliceSpec.id,{
      instruction:"Different payload",idempotency_key:"pg18ci_alice_001"
    }),error=>error?.status===409 &&
      error?.code==="idempotency_key_conflict")
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.jobs "+
      "WHERE owner_user_id=$1 AND dedupe_key=$2",
      [ra.run.owner_user_id,"pg18ci_alice_001"])).rows[0].n,1)
    assert.equal(await runRepo.get(bob,ra.run.id),null)
    await assert.rejects(
      runRepo.decideModel(bob,ra.run.id,{decision:"approved"}),
      error=>error?.status===404)
    await checkWorkerColumnBoundary(workerPool)

    const prepareA=new AgentPrepareWorker(prepAdapter,"pg18-ci-prepare-a")
    const prepareB=new AgentPrepareWorker(prepAdapter,"pg18-ci-prepare-b")
    const [leaseA,leaseB]=await Promise.all([
      claimInChildProcess("a"),claimInChildProcess("b")
    ])
    assert.ok(leaseA&&leaseB,"both concurrent Workers must claim one job")
    assert.notEqual(leaseA.id,leaseB.id,
      "SKIP LOCKED must never return duplicate job IDs")
    assert.notEqual(leaseA.lease_token,leaseB.lease_token)
    assert.deepEqual((await Promise.all([
      prepareA.prepare(leaseA),prepareB.prepare(leaseB)
    ])).map(x=>x.status),["prepared","prepared"])
    assert.equal((await runRepo.get(alice,ra.run.id)).status,"awaiting_approval")
    assert.equal((await runRepo.get(bob,rb.run.id)).status,"awaiting_approval")
    assert.equal(await prepareA.claim(),null)

    // Simultaneous approvals are serialized by the run row lock.
    const [approvalOne,approvalTwo]=await Promise.all([
      runRepo.decideModel(alice,ra.run.id,{decision:"approved"}),
      runRepo.decideModel(alice,ra.run.id,{decision:"approved"})
    ])
    assert.deepEqual([approvalOne.replayed,approvalTwo.replayed].sort(),
      [false,true],"repeated decisions must not duplicate model jobs")
    const approvalBob=await runRepo.decideModel(bob,rb.run.id,
      {decision:"approved"})
    assert.equal(approvalBob.replayed,false)
    const count=(await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.jobs "+
      "WHERE run_id=$1 AND payload->>'phase'='model'",[ra.run.id])).rows[0].n
    assert.equal(count,1,"model approval enqueues once")

    let stubCalls=0
    const modelA=new AgentModelWorker(prepAdapter,"pg18-ci-model-a",{
      async generate(){stubCalls++;return "Synthetic locally generated risk note"}
    })
    const modelB=new AgentModelWorker(prepAdapter,"pg18-ci-model-b",{
      async generate(){throw Error("synthetic_model_timeout_no_network")}
    })
    const [modelLeaseA,modelLeaseB]=await Promise.all([
      modelA.claim(),modelB.claim()
    ])
    assert.ok(modelLeaseA&&modelLeaseB)
    assert.notEqual(modelLeaseA.id,modelLeaseB.id)
    const modelInput=await modelA.begin(modelLeaseA)
    assert.equal(modelInput.status,"ready")
    if(modelLeaseA.run_id===ra.run.id){
      assert.deepEqual(modelInput.input.knowledgeEvidence?.map(x=>x.citation),
        ["pg18-ci-evidence.md#chunk-0"])
      assert.doesNotMatch(JSON.stringify(modelInput.input.knowledgeEvidence),
        /documentId|baseId|object_key|embedding/)
    }else assert.equal(modelInput.input.knowledgeEvidence,undefined)
    const result=await modelA.succeed(modelLeaseA,
      await modelA.provider.generate(modelInput.input))
    assert.equal(result.status,"succeeded")
    assert.equal((await modelA.succeed(modelLeaseA,"duplicate")).status,"stale")
    const failingInput=await modelB.begin(modelLeaseB)
    assert.equal(failingInput.status,"ready")
    if(modelLeaseB.run_id===ra.run.id)
      assert.deepEqual(failingInput.input.knowledgeEvidence?.map(x=>x.citation),
        ["pg18-ci-evidence.md#chunk-0"])
    else assert.equal(failingInput.input.knowledgeEvidence,undefined)
    const knowledgeAudit=(await admin.query(
      "SELECT metadata FROM agentstudio.run_steps "+
      "WHERE run_id=$1 AND step_key='model'",[ra.run.id])).rows[0].metadata
    assert.equal(knowledgeAudit.sources.length,1)
    assert.equal(knowledgeAudit.sources[0].base_id,ownKb.id)
    assert.equal(knowledgeAudit.sources[0].document_id,syntheticDoc.id)
    assert.equal(knowledgeAudit.sources[0].chunk_index,0)
    await assert.rejects(modelB.provider.generate(failingInput.input),
      /synthetic_model_timeout_no_network/)
    assert.equal((await modelB.unknown(modelLeaseB)).status,"quarantined")
    assert.equal((await modelB.tick()).status,"idle",
      "uncertain network effects must not be replayed")
    assert.equal(stubCalls,1)
    // A claim does not imply an owner. Resolve each run to its original
    // authenticated identity and require its exact state, never a null pass.
    const owned=new Map([[ra.run.id,alice],[rb.run.id,bob]])
    const succeeded=await runRepo.get(owned.get(modelLeaseA.run_id),modelLeaseA.run_id)
    const quarantined=await runRepo.get(owned.get(modelLeaseB.run_id),modelLeaseB.run_id)
    assert.equal(succeeded?.status,"succeeded")
    assert.equal(quarantined?.status,"paused")
    assert.equal(quarantined?.checkpoint.requires_manual_reconciliation,true)
    const resultStates=(await admin.query(
      "SELECT status FROM agentstudio.runs WHERE id=ANY($1::uuid[])",
      [[modelLeaseA.run_id,modelLeaseB.run_id]])).rows
    assert.deepEqual(resultStates.map(x=>x.status).sort(),["paused","succeeded"])
    const effects=(await admin.query(
      "SELECT status FROM agentstudio.external_effects "+
      "WHERE run_id=ANY($1::uuid[])",
      [[modelLeaseA.run_id,modelLeaseB.run_id]])).rows
    assert.deepEqual(effects.map(x=>x.status).sort(),["succeeded","unknown"])

    // An expired PREPARE lease must be fenced against the original Worker.
    const crash=await runRepo.submit(alice,aliceSpec.id,{
      instruction:"Synthetic prepare crash",idempotency_key:"pg18ci_crash_002"})
    const dead=await prepareA.claim()
    assert.equal(dead?.run_id,crash.run.id)
    await admin.query(
      "UPDATE agentstudio.jobs SET lease_until=clock_timestamp() - "+
      "interval '2 seconds' WHERE id=$1",[dead.id])
    const newLease=await prepareB.claim()
    assert.equal(newLease.run_id,crash.run.id)
    assert.notEqual(newLease.lease_token,dead.lease_token)
    assert.equal(Number(newLease.lease_version),Number(dead.lease_version)+1)
    assert.equal((await prepareA.prepare(dead)).status,"stale")
    assert.equal((await prepareB.prepare(newLease)).status,"prepared")
    assert.equal((await runRepo.get(alice,crash.run.id)).status,"awaiting_approval")
    assert.equal((await runRepo.list(bob)).length,1,
      "other employee cannot see Alice's synthetic crash test")
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.run_steps "+
      "WHERE run_id=$1 AND step_key='prepare'",[crash.run.id])).rows[0].n,1)
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.audit_events "+
      "WHERE run_id=$1 AND action='agent.prepare'",[crash.run.id])).rows[0].n,1)

    // Additional PG18-only review of the actual database roles/security
    // function. The fresh PG18 CI baseline already has the V9 table shapes;
    // the V9.022 predecessor marker below is SYNTHETIC disposable CI setup,
    // not proof that earlier migration/import steps were performed.
    await admin.query(
      "INSERT INTO agentstudio.schema_migrations(version,description) "+
      "VALUES('pg_v9_022','synthetic CI predecessor for real PG18 V9.023/024') "+
      "ON CONFLICT (version) DO NOTHING")
    const loadUpgrade=relative=>readFileSync(
      fileURLToPath(new URL("../../../db/postgres/migrations/"+relative,
        import.meta.url)),"utf8").split(/\r?\n/)
      .filter(line=>!line.trim().startsWith("\\")).join("\n")
    await admin.query(loadUpgrade("pg_v9_023_workflow_safe_worker.sql"))
    await admin.query(loadUpgrade("pg_v9_024_bound_dispatch_identity.sql"))
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.schema_migrations "+
      "WHERE version='pg_v9_024'")).rows[0].n,1)

    const functionName=
      "agentstudio.bound_model_lease_identity(uuid,uuid,uuid,bigint,text)"
    const privilege=(await admin.query(
      "SELECT has_function_privilege('agentstudio_api',$1::text,'EXECUTE') AS api,"+
      "has_function_privilege('agentstudio_worker',$1::text,'EXECUTE') AS worker,"+
      "has_function_privilege('agentstudio_model_broker',$1::text,'EXECUTE') AS broker,"+
      "has_function_privilege('agentstudio_bound_dispatch',$1::text,'EXECUTE') AS gateway",
      [functionName])).rows[0]
    assert.deepEqual(privilege,{api:false,worker:false,broker:false,gateway:true})
    const isolatedRole=(await admin.query(
      "SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls "+
      "FROM pg_roles WHERE rolname='agentstudio_bound_dispatch'")).rows[0]
    assert.deepEqual(isolatedRole,{rolcanlogin:false,rolinherit:false,
      rolsuper:false,rolbypassrls:false})
    // An independent synthetic login has ONLY the dispatch group. Never
    // reuse the regular API/Worker/Broker login or credential.
    const gatewayName="agentstudio_bound_dispatch_ci_login"
    const existingGateways=await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",[gatewayName])
    assert.equal(existingGateways.rowCount,0)
    const gatewayPassword=syntheticPassword(target.password,"bound-dispatch")
    await admin.query(
      "CREATE ROLE agentstudio_bound_dispatch_ci_login LOGIN NOINHERIT "+
      "NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB "+
      "PASSWORD '"+gatewayPassword+"'")
    await admin.query(
      "GRANT agentstudio_bound_dispatch TO agentstudio_bound_dispatch_ci_login")
    await admin.query(
      "GRANT CONNECT ON DATABASE agentstudio_pg18_ci "+
      "TO agentstudio_bound_dispatch_ci_login")
    assert.deepEqual((await admin.query(
      "SELECT pg_has_role($1::name,'agentstudio_api','member') AS api,"+
      "pg_has_role($1::name,'agentstudio_worker','member') AS worker,"+
      "pg_has_role($1::name,'agentstudio_model_broker','member') AS broker",
      [gatewayName])).rows[0],{api:false,worker:false,broker:false})
    boundIdentityPool=new Pool({...target,user:gatewayName,
      password:gatewayPassword,max:2})
    const identities=new BoundLeaseIdentityRepository(adapter(boundIdentityPool))

    const ownerId=ra.run.owner_user_id
    const boundSpec=(await admin.query(
      "INSERT INTO agentstudio.agent_specs(owner_user_id,name,spec) "+
      "VALUES($1::uuid,'PG18 synthetic lease-bound Agent',$2::jsonb) RETURNING id",
      [ownerId,JSON.stringify({goal:"Isolated identity verification",model_binding:{
        connection_id:randomUUID(),connection_revision:1,
        model_id:"gpt-4.1-mini"}})])).rows[0]
    const boundRun=(await admin.query(
      "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,"+
      "status,instruction,checkpoint) VALUES($1::uuid,'agent',$2::uuid,"+
      "'running','Synthetic approved bound model identity check',$3::jsonb) "+
      "RETURNING id",[ownerId,boundSpec.id,
        JSON.stringify({stage:"model_running",spec_revision:1})])).rows[0]
    const leaseToken=randomUUID()
    const boundWorker="pg18-bound-lease-worker"
    const boundJob=(await admin.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key,"+
      "status,lease_owner,lease_token,lease_version,lease_until,payload) "+
      "VALUES($1::uuid,$2::uuid,'run_tick',$3::text,'leased',$4::text,"+
      "$5::uuid,1,clock_timestamp()+interval '3 minutes',$6::jsonb) RETURNING id",
      [ownerId,boundRun.id,"pg18bound:"+boundRun.id,boundWorker,leaseToken,
        JSON.stringify({phase:"model",spec_revision:1})])).rows[0]
    await admin.query(
      "INSERT INTO agentstudio.approvals(owner_user_id,run_id,step_key,"+
      "requested_by,decided_by,status,decided_at) "+
      "VALUES($1::uuid,$2::uuid,'model',$1::uuid,$1::uuid,"+
      "'approved',clock_timestamp())",[ownerId,boundRun.id])
    await admin.query(
      "INSERT INTO agentstudio.external_effects(owner_user_id,run_id,"+
      "step_key,tool_name,arguments_sha256,idempotency_key,status) "+
      "VALUES($1::uuid,$2::uuid,'model','model.generate',$3::text,$4::text,"+
      "'started')",[ownerId,boundRun.id,"a".repeat(64),
        "model:"+boundRun.id])
    const claim={run_id:boundRun.id,job_id:boundJob.id,lease_token:leaseToken,
      lease_version:1,lease_owner:boundWorker}
    assert.deepEqual(await identities.resolve(claim),alice)
    const deny=e=>e?.status===403&&e?.code==="bound_dispatch_lease_invalid"
    await assert.rejects(identities.resolve({...claim,lease_token:randomUUID()}),deny)
    await assert.rejects(identities.resolve({...claim,lease_version:2}),deny)
    await assert.rejects(identities.resolve({...claim,lease_owner:"other-worker"}),deny)
    await assert.rejects(identities.resolve({...claim,run_id:rb.run.id}),deny)
    // Roles are independently logged-in TCP sessions; ordinary API and
    // Worker must receive genuine SQLSTATE 42501 for the definer function.
    const params=[claim.run_id,claim.job_id,claim.lease_token,
      claim.lease_version,claim.lease_owner]
    const lookup="SELECT issuer,subject FROM "+
      "agentstudio.bound_model_lease_identity("+
      "$1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text)"
    for(const [pool,role] of [[apiPool,"agentstudio_api"],
      [workerPool,"agentstudio_worker"]]){
      const client=await pool.connect()
      try{
        await client.query("BEGIN READ ONLY")
        await client.query("SET LOCAL ROLE "+role)
        await assert.rejects(client.query(lookup,params),
          err=>err?.code==="42501")
      }finally{
        await client.query("ROLLBACK").catch(()=>undefined)
        client.release()
      }
    }
    const gatewayClient=await boundIdentityPool.connect()
    try{
      await gatewayClient.query("BEGIN READ ONLY")
      await gatewayClient.query("SET LOCAL ROLE agentstudio_bound_dispatch")
      await assert.rejects(
        gatewayClient.query("SELECT instruction FROM agentstudio.runs LIMIT 1"),
        err=>err?.code==="42501")
      await gatewayClient.query("ROLLBACK")
    }finally{
      await gatewayClient.query("ROLLBACK").catch(()=>undefined)
      gatewayClient.release()
    }
    // Gateway login cannot read encrypted model API keys even if a worker
    // lease ID is known; credentials belong exclusively to the Broker role.
    const secretClient=await boundIdentityPool.connect()
    try{
      await secretClient.query("BEGIN READ ONLY")
      await secretClient.query("SET LOCAL ROLE agentstudio_bound_dispatch")
      await assert.rejects(secretClient.query(
        "SELECT api_key_ciphertext FROM agentstudio.model_connections LIMIT 1"),
        err=>err?.code==="42501")
    }finally{
      await secretClient.query("ROLLBACK").catch(()=>undefined)
      secretClient.release()
    }
    await admin.query("UPDATE agentstudio.approvals SET status='rejected' "+
      "WHERE run_id=$1::uuid",[boundRun.id])
    await assert.rejects(identities.resolve(claim),deny)
    await admin.query("UPDATE agentstudio.approvals SET status='approved' "+
      "WHERE run_id=$1::uuid",[boundRun.id])
    await admin.query("UPDATE agentstudio.jobs SET "+
      "lease_until=clock_timestamp()-interval '2 seconds' "+
      "WHERE id=$1::uuid",[boundJob.id])
    await assert.rejects(identities.resolve(claim),deny)
  }finally{
    // Even failed CI tests must NOT send anything to an external DB.
    await Promise.allSettled([
      apiPool?.end(),workerPool?.end(),boundIdentityPool?.end(),admin.end()
    ].filter(Boolean))
  }
})
