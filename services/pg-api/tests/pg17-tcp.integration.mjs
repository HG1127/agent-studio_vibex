// Real PostgreSQL 17 TCP/multiple-connection integration. This test is
// restricted to a dedicated ephemeral GitHub Actions runner database.
// Uses NO PocketBase, BaoTa, production users, real providers, or credentials.
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {createServer} from "node:http"
import path from "node:path"
import {createHash} from "node:crypto"
import pgPackage from "pg"
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from "jose"
import {AgentSpecRepository} from "../src/repository.ts"
import {RunRepository} from "../src/run-repository.ts"
import {AgentPrepareWorker} from "../src/agent-worker.ts"
import {AgentModelWorker} from "../src/model-worker.ts"
import {normalizeLegacyAgent,importLegacyAgentsToStage} from "../src/stage-agent-import.ts"
import {normalizeLegacyKb,importLegacyKbsToStage} from "../src/stage-knowledge-base-import.ts"
import {createHandler} from "../src/http.ts"
import {createJwtVerifier} from "../src/auth.ts"

const {Pool}=pgPackage
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const read=filename=>readFileSync(path.join(root,filename),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")
const env=process.env
function requireEphemeral() {
  const password=env.AGENT_STUDIO_PG17_ADMIN_PASSWORD||""
  const runId=env.GITHUB_RUN_ID||""
  if(env.GITHUB_ACTIONS!=="true" ||
    env.AGENT_STUDIO_PG17_TEST_ENABLED!=="true" ||
    env.AGENT_STUDIO_PG17_HOST!=="127.0.0.1" ||
    env.AGENT_STUDIO_PG17_DATABASE!=="agentstudio_stage" ||
    env.AGENT_STUDIO_PG17_ADMIN_USER!=="agentstudio_admin" ||
    !/^[0-9]{1,32}$/.test(runId) ||
    password!=="synthetic-agentstudio-pg17-ci-"+runId)
    throw Error("refuse_non_ephemeral_pg17")
  return {host:"127.0.0.1",port:5432,database:"agentstudio_stage",
    user:"agentstudio_admin",password,
    max:2,connectionTimeoutMillis:5000,statement_timeout:15000}
}
function poolAdapter(pool) {
  return {async connect(){
    const db=await pool.connect()
    return {
      async query(statement,values=[]){
        const result=await db.query(statement,values)
        return {rows:result.rows}
      },
      release(){db.release()},
    }
  }}
}
function rolesPassword(adminPassword,purpose) {
  return "synthetic-"+createHash("sha256")
    .update(adminPassword+":"+purpose).digest("hex").slice(0,48)
}
async function safeRoleBootstrap(admin,adminPassword) {
  const names=["agentstudio_stage_login","agentstudio_stage_worker"]
  const existing=await admin.query(
    "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])",[names])
  assert.equal(existing.rows.length,0,"ephemeral fixture must not reuse login roles")
  const apiPassword=rolesPassword(adminPassword,"api")
  const workerPassword=rolesPassword(adminPassword,"worker")
  // These two locally generated *synthetic* password strings are fixed-format
  // alphanumeric and have no SQL metacharacters. Never interpolate user input.
  await admin.query("CREATE ROLE agentstudio_stage_login LOGIN NOINHERIT PASSWORD '"+apiPassword+"'")
  await admin.query("CREATE ROLE agentstudio_stage_worker LOGIN NOINHERIT PASSWORD '"+workerPassword+"'")
  await admin.query("GRANT agentstudio_api TO agentstudio_stage_login")
  await admin.query("GRANT agentstudio_worker,agentstudio_api TO agentstudio_stage_worker")
  await admin.query("GRANT CONNECT ON DATABASE agentstudio_stage TO agentstudio_stage_login,agentstudio_stage_worker")
  return {apiPassword,workerPassword}
}
async function signers(){
  const issuer="https://pg17-ci.synthetic.invalid"
  const audience="pg17-ci-test"
  const {publicKey,privateKey}=await generateKeyPair("RS256",{extractable:true})
  const jwk=await exportJWK(publicKey)
  jwk.kid="pg17-ci";jwk.alg="RS256"
  const verifier=createJwtVerifier({issuer,audience},
    createLocalJWKSet({keys:[jwk]}))
  const token=sub=>new SignJWT({sub}).setProtectedHeader({
    alg:"RS256",kid:"pg17-ci",
  }).setIssuer(issuer).setAudience(audience).setIssuedAt()
    .setExpirationTime("5m").sign(privateKey)
  return {issuer,verifyToken:verifier,token}
}
async function request(base,method,route,token,body){
  const res=await fetch(base+route,{
    method,
    headers:{...(token?{Authorization:"Bearer "+token}:{}),
      ...(body===undefined?{}:{"Content-Type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(9000),
  })
  return {status:res.status,data:await res.json()}
}
const spec={
  goal:"Summarize synthetic investment risks",
  task_scope:"No external research",
  deliverables:["Brief risk note"],
  task_plan:["Check uncertainty"],
  done_criteria:["Include risk caveats"],
  tools:[],
}
const isRun=id=>"/api/v2/runs/"+id
const approval=id=>isRun(id)+"/model-approval"

test("PostgreSQL 17 TCP: signed HTTP, true multi-worker locking, RLS, model fencing and no-replay",async()=>{
  // Fail closed BEFORE even opening a socket.
  const connection=requireEphemeral()
  const admin=new Pool(connection)
  let apiPool,workerPool,server
  try{
    const version=await admin.query(
      "SELECT current_setting('server_version_num')::integer AS version,"+
      "current_database() AS name, "+
      "(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS admin")
    assert.equal(version.rows[0].name,"agentstudio_stage")
    assert.equal(version.rows[0].admin,true)
    assert.ok(version.rows[0].version>=170000&&version.rows[0].version<180000,
      "must be PostgreSQL 17, not PGlite or another version")
    const fixture=await admin.query(
      "SELECT to_regclass('agentstudio.runs') AS existing")
    assert.equal(fixture.rows[0].existing,null,
      "refuse to migrate a nonempty or reused staging database")
    // Rebuild the old V8.1 schema from its current source, then execute the
    // actual additive upgrade twice (also covered by PGlite unit tests).
    const oldSchema=read("db/postgres/001_stage_schema.sql")
      .replace(
        "  result_text text NOT NULL DEFAULT '' CHECK (length(result_text)<=20000),\n","")
      .replace(/-- Approved, staging-only migration provenance[\s\S]*?-- One run may reference exactly one agent spec or workflow\./,
        "-- One run may reference exactly one agent spec or workflow.")
      .replace("REVOKE ALL ON agentstudio.legacy_agent_imports FROM agentstudio_api,agentstudio_worker;\n","")
      .replace(/\nINSERT INTO agentstudio\.schema_migrations\(version,description\)\s+VALUES\('pg_v8_004'[^\n]*\);/,"")
      .replace(/\nINSERT INTO agentstudio\.schema_migrations\(version,description\)\s+VALUES\('pg_v8_005'[^\n]*\);/,"")
    await admin.query(oldSchema)
    for(const id of ["004_model_execution","005_legacy_agent_import",
      "006_legacy_workflow_import","007_legacy_kb_import",
      "008_legacy_schedule_import"]){
      const migration=read("db/postgres/migrations/pg_v8_"+
        id+".sql")
      await admin.query(migration)
      await admin.query(migration)
    }
    const ledger=await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.schema_migrations "+
      "WHERE version IN ('pg_v8_004','pg_v8_005','pg_v8_006','pg_v8_007','pg_v8_008')")
    assert.equal(ledger.rows[0].n,5)
    // Independent W1/W2 crosswalk migrations are applied in the same true
    // PostgreSQL 17 database, but are not allowed to execute old workflows.
    const tables=await admin.query(
      "SELECT count(*)::integer AS n FROM pg_tables "+
      "WHERE schemaname='agentstudio'")
    assert.equal(tables.rows[0].n,23)
    const safeguarded=await admin.query(
      "SELECT count(*)::integer AS n FROM pg_class AS c "+
      "JOIN pg_namespace AS n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relkind='r' "+
      "AND c.relrowsecurity AND c.relforcerowsecurity")
    assert.equal(safeguarded.rows[0].n,22)

    const {apiPassword,workerPassword}=await safeRoleBootstrap(
      admin,connection.password)
    const apiLogin={...connection,user:"agentstudio_stage_login",
      password:apiPassword,max:8}
    const workerLogin={...connection,user:"agentstudio_stage_worker",
      password:workerPassword,max:8}
    delete apiLogin.statement_timeout
    delete workerLogin.statement_timeout
    apiPool=new Pool(apiLogin)
    workerPool=new Pool(workerLogin)
    const checkWorker=await workerPool.connect()
    try{
      const role=await checkWorker.query(
        "SELECT current_user AS login,rolsuper,rolbypassrls "+
        "FROM pg_roles WHERE rolname=current_user")
      assert.equal(role.rows[0].login,"agentstudio_stage_worker")
      assert.equal(role.rows[0].rolsuper,false)
      assert.equal(role.rows[0].rolbypassrls,false)
      await assert.rejects(
        checkWorker.query("SELECT instruction FROM agentstudio.runs"),
        /permission denied/i)
    }finally{checkWorker.release()}
    const auth=await signers()
    const ids={}
    for(const name of ["alice","bob"]){
      const created=await admin.query(
        "INSERT INTO agentstudio.users(external_issuer,external_subject) "+
        "VALUES($1::text,$2::text) RETURNING id",[auth.issuer,name])
      ids[name]=created.rows[0].id
    }
    // V8.3: real TCP stage-only idempotent Agent config migration with
    // approved synthetic crosswalk. No SQLite production DB or model network.
    const legacySpec={...spec,knowledge_base_ids:[],require_approval:true}
    const legacyOwnerMap=new Map([
      ["old_alice",ids.alice],["old_bob",ids.bob],
    ])
    const sample=old=>({
      id:"legacy-"+old,rh_user_id:old,name:"Imported "+old,
      spec:JSON.stringify(legacySpec),source:"",template_key:"",
      created:"2026-10-14 09:00:00.000Z",
      updated:"2026-10-14 12:00:00.000Z",
    })
    const legacyRows=[
      normalizeLegacyAgent(sample("old_alice"),legacyOwnerMap),
      normalizeLegacyAgent(sample("old_bob"),legacyOwnerMap),
    ]
    const receipt=await importLegacyAgentsToStage(
      poolAdapter(admin),"d".repeat(64),legacyRows)
    assert.equal(receipt.imported,2)
    assert.equal(receipt.reconciled,2)
    const replayReceipt=await importLegacyAgentsToStage(
      poolAdapter(admin),"d".repeat(64),legacyRows)
    assert.equal(replayReceipt.replayed,2)
    assert.equal((await admin.query(
      "SELECT count(*)::int AS n FROM agentstudio.legacy_agent_imports"))
      .rows[0].n,2)
    // W2 metadata-only migration: source child document/vector rows must
    // be migrated in a different approved phase, not faked as completed.
    const ownerKbMap=new Map([
      ["old_alice",ids.alice],["old_bob",ids.bob],
    ])
    const kbSource=old=>({
      id:"old_kb_"+old,rh_user_id:old,
      name:"Empty source KB "+old,
      description:"Synthetic metadata only",
      created_ms:1792030400000,updated_ms:1792030500000,
    })
    const kbRows=[
      normalizeLegacyKb(kbSource("old_alice"),ownerKbMap),
      normalizeLegacyKb(kbSource("old_bob"),ownerKbMap),
    ]
    const kbReceipt=await importLegacyKbsToStage(
      poolAdapter(admin),"d".repeat(64),kbRows)
    assert.equal(kbReceipt.imported,2)
    assert.equal(kbReceipt.reconciled,2)
    assert.equal((await importLegacyKbsToStage(
      poolAdapter(admin),"d".repeat(64),kbRows)).replayed,2)
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.legacy_knowledge_base_imports"))
      .rows[0].n,2)
    const blockedWorkflow=await admin.query(
      "INSERT INTO agentstudio.workflows(owner_user_id,name,graph) "+
      "VALUES($1::uuid,'Imported disabled workflow',$2::jsonb) "+
      "RETURNING id",
      [ids.alice,JSON.stringify({nodes:[
        {id:"start",type:"start",data:{title:"Start"},position:{x:0,y:0}},
        {id:"end",type:"end",data:{title:"End"},position:{x:100,y:0}},
      ],edges:[{id:"start_end",source:"start",target:"end"}]})])
    await admin.query(
      "INSERT INTO agentstudio.legacy_workflow_imports "+
      "(source_snapshot_sha256,legacy_workflow_id,owner_user_id,"+
      "target_workflow_id,payload_sha256,source_record,execution_enabled) "+
      "VALUES($1::text,$2::text,$3::uuid,$4::uuid,$5::text,$6::jsonb,false)",
      ["d".repeat(64),"workflowtest000",ids.alice,
        blockedWorkflow.rows[0].id,"e".repeat(64),
        JSON.stringify({id:"workflowtest000",graph:"synthetic"})])
    await assert.rejects(admin.query(
      "INSERT INTO agentstudio.runs(owner_user_id,kind,workflow_id) "+
      "VALUES($1::uuid,'workflow',$2::uuid)",
      [ids.alice,blockedWorkflow.rows[0].id]),
      /legacy_workflow_execution_disabled/)
    // W3: preserve an old Agent schedule in quarantined/disabled state only.
    // The imported schedule is never allowed to create occurrences or jobs.
    const importedAgent=(await admin.query(
      "SELECT target_spec_id FROM agentstudio.legacy_agent_imports "+
      "WHERE legacy_spec_id=$1",["legacy-old_alice"])).rows[0]?.target_spec_id
    assert.ok(importedAgent)
    const legacyRecurrence={legacy_import:"quarantined",
      execution_supported:false}
    const safeSchedule=await admin.query(
      "INSERT INTO agentstudio.schedules "+
      "(owner_user_id,kind,agent_spec_id,name,recurrence,time_zone,"+
      "next_at,enabled) "+
      "VALUES($1::uuid,'agent',$2::uuid,'Disabled imported schedule',"+
      "$3::jsonb,'UTC',NULL,false) RETURNING id",
      [ids.alice,importedAgent,JSON.stringify(legacyRecurrence)])
    await admin.query(
      "INSERT INTO agentstudio.legacy_schedule_imports "+
      "(source_snapshot_sha256,legacy_schedule_id,owner_user_id,"+
      "target_schedule_id,payload_sha256,projection_sha256,identity_mapping_sha256,source_record) "+
      "VALUES($1::text,$2::text,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::jsonb)",
      ["d".repeat(64),"scheduletest000",ids.alice,
        safeSchedule.rows[0].id,"e".repeat(64),"f".repeat(64),"a".repeat(64),
        JSON.stringify({kind:"synthetic_quarantine",enabled:0})])
    await assert.rejects(admin.query(
      "INSERT INTO agentstudio.schedule_occurrences "+
      "(owner_user_id,schedule_id,scheduled_for,status) "+
      "VALUES($1::uuid,$2::uuid,now(),'pending')",
      [ids.alice,safeSchedule.rows[0].id]),
      /legacy_schedule_execution_disabled/)
    await assert.rejects(admin.query(
      "UPDATE agentstudio.schedules SET enabled=true WHERE id=$1::uuid",
      [safeSchedule.rows[0].id]),/legacy_schedule_immutable/)
    assert.equal((await admin.query(
      "SELECT COUNT(*)::integer AS n FROM agentstudio.schedule_occurrences"
    )).rows[0].n,0)
    // A real PostgreSQL transaction enters aborted state on a denied SELECT.
    // Check each privilege in an independent transaction.
    for(const table of ["legacy_agent_imports","legacy_workflow_imports",
      "legacy_knowledge_base_imports","legacy_schedule_imports"]){
      const normalRole=await apiPool.connect()
      try{
        await normalRole.query("BEGIN")
        await normalRole.query("SET LOCAL ROLE agentstudio_api")
        await assert.rejects(normalRole.query(
          "SELECT * FROM agentstudio."+table),/permission denied/i)
      }finally{
        await normalRole.query("ROLLBACK").catch(()=>undefined)
        normalRole.release()
      }
    }
    const adapter=poolAdapter(apiPool)
    const workerAdapter=poolAdapter(workerPool)
    server=createServer(createHandler({
      repository:new AgentSpecRepository(adapter),
      runRepository:new RunRepository(adapter),
      verifyToken:auth.verifyToken,
      allowedOrigin:"https://pg17-ci.synthetic.invalid",
    }))
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
    const base="http://127.0.0.1:"+server.address().port
    const tokenA=await auth.token("alice")
    const tokenB=await auth.token("bob")
    assert.equal((await request(base,"GET","/api/v2/runs","")).status,401)
    const [createA,createB]=await Promise.all([
      request(base,"POST","/api/v2/agent-specs",tokenA,{name:"Agent A",spec}),
      request(base,"POST","/api/v2/agent-specs",tokenB,{name:"Agent B",spec}),
    ])
    assert.equal(createA.status,201,JSON.stringify(createA.data))
    assert.equal(createB.status,201,JSON.stringify(createB.data))
    const aSpec=createA.data.item.id
    const bSpec=createB.data.item.id
    assert.equal((await request(base,"GET","/api/v2/agent-specs/"+aSpec,tokenB)).status,404)
    const submit=async (specId,token,code)=>{
      const result=await request(
        base,"POST","/api/v2/agent-specs/"+specId+"/runs",
        token,{instruction:"Synthetic instruction "+code,
          idempotency_key:"pg17_"+code})
      assert.equal(result.status,202,JSON.stringify(result.data))
      return result.data.run.id
    }
    const [aRun,bRun]=await Promise.all([
      submit(aSpec,tokenA,"alice_01"),submit(bSpec,tokenB,"bob_01"),
    ])
    const [prepareA,prepareB]=[
      new AgentPrepareWorker(workerAdapter,"pg17-prepare-one"),
      new AgentPrepareWorker(workerAdapter,"pg17-prepare-two"),
    ]
    const [aPrepareJob,bPrepareJob]=await Promise.all([
      prepareA.claim(),prepareB.claim(),
    ])
    assert.ok(aPrepareJob&&bPrepareJob)
    assert.notEqual(aPrepareJob.id,bPrepareJob.id,
      "SKIP LOCKED must prevent duplicate multi-connection claims")
    const donePrepare=await Promise.all([
      prepareA.prepare(aPrepareJob),prepareB.prepare(bPrepareJob),
    ])
    assert.deepEqual(donePrepare.map(x=>x.status),["prepared","prepared"])
    assert.equal(await prepareA.claim(),null)
    const runA=await request(base,"GET",isRun(aRun),tokenA)
    const runB=await request(base,"GET",isRun(bRun),tokenB)
    assert.equal(runA.data.run.status,"awaiting_approval")
    assert.equal(runB.data.run.status,"awaiting_approval")
    assert.equal((await request(base,"GET",isRun(aRun),tokenB)).status,404)
    assert.equal((await request(base,"POST",approval(aRun),tokenB,{
      decision:"approved"})).status,404)
    const [approvedA,approvedB]=await Promise.all([
      request(base,"POST",approval(aRun),tokenA,{decision:"approved"}),
      request(base,"POST",approval(bRun),tokenB,{decision:"approved"}),
    ])
    assert.equal(approvedA.status,202)
    assert.equal(approvedB.status,202)
    assert.equal((await request(base,"POST",approval(aRun),tokenA,{
      decision:"approved"})).data.replayed,true)

    const modelA=new AgentModelWorker(workerAdapter,"pg17-model-one",{
      async generate(){return "A: synthetic model response, no network"},
    })
    const modelB=new AgentModelWorker(workerAdapter,"pg17-model-two",{
      async generate(){return "B: synthetic model response, no network"},
    })
    const [aModelJob,bModelJob]=await Promise.all([
      modelA.claim(),modelB.claim(),
    ])
    assert.ok(aModelJob&&bModelJob)
    assert.notEqual(aModelJob.id,bModelJob.id,
      "model jobs must never be claimed twice")
    assert.equal(await modelA.claim(),null)
    const [inA,inB]=await Promise.all([
      modelA.begin(aModelJob),modelB.begin(bModelJob),
    ])
    assert.equal(inA.status,"ready")
    assert.equal(inB.status,"ready")
    const [doneA,doneB]=await Promise.all([
      modelA.succeed(aModelJob,await modelA.provider.generate(inA.input)),
      modelB.succeed(bModelJob,await modelB.provider.generate(inB.input)),
    ])
    assert.deepEqual([doneA.status,doneB.status],["succeeded","succeeded"])
    assert.equal((await request(base,"GET",isRun(aRun),tokenA))
      .data.run.status,"succeeded")
    assert.equal((await request(base,"GET",isRun(bRun),tokenB))
      .data.run.status,"succeeded")
    assert.equal((await request(base,"GET",isRun(aRun),tokenB)).status,404)
    assert.equal((await modelA.succeed(aModelJob,"late again")).status,"stale")
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.external_effects "+
      "WHERE status='succeeded'")).rows[0].n,2)

    // A lost lease AFTER an external request starts must NOT send it again.
    const crashId=await submit(aSpec,tokenA,"crash_02")
    assert.equal((await prepareA.tick()).status,"prepared")
    assert.equal((await request(base,"POST",approval(crashId),tokenA,
      {decision:"approved"})).status,202)
    const crashLease=await modelA.claim()
    assert.equal(crashLease.run_id,crashId)
    assert.equal((await modelA.begin(crashLease)).status,"ready")
    await admin.query(
      "UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '2 seconds' "+
      "WHERE id=$1",[crashLease.id])
    assert.equal((await modelB.tick()).status,"quarantined")
    assert.equal((await modelA.succeed(crashLease,"stale write")).status,"stale")
    assert.equal((await request(base,"GET",isRun(crashId),tokenA))
      .data.run.last_error_code,"model_lease_expired")
    assert.equal((await admin.query(
      "SELECT status FROM agentstudio.external_effects WHERE run_id=$1",
      [crashId])).rows[0].status,"unknown")
    assert.equal(await modelA.claim(),null)

    // A last-attempt crash BEFORE making an external request is terminated
    // without creating an external effect or running the model.
    const abandonId=await submit(bSpec,tokenB,"abandoned_03")
    assert.equal((await prepareB.tick()).status,"prepared")
    assert.equal((await request(base,"POST",approval(abandonId),tokenB,
      {decision:"approved"})).status,202)
    await admin.query("UPDATE agentstudio.jobs SET max_attempts=1 "+
      "WHERE run_id=$1 AND payload->>'phase'='model'",[abandonId])
    const abandoned=await modelA.claim()
    assert.equal(abandoned.run_id,abandonId)
    await admin.query("UPDATE agentstudio.jobs SET lease_until=clock_timestamp()-interval '2 seconds' "+
      "WHERE id=$1",[abandoned.id])
    assert.equal((await modelB.tick()).status,"failed")
    assert.equal((await request(base,"GET",isRun(abandonId),tokenB))
      .data.run.last_error_code,"model_lease_exhausted")
    assert.equal((await admin.query(
      "SELECT count(*)::integer AS n FROM agentstudio.external_effects "+
      "WHERE run_id=$1",[abandonId])).rows[0].n,0)
    // Signed JWT no longer authorizes a disabled employee.
    await admin.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1",[ids.bob])
    assert.equal((await request(base,"GET","/api/v2/runs",tokenB)).status,403)
    console.log("PG17_PASS version="+version.rows[0].version+
      " real_tcp=true multi_worker=true owner_rls=true "+
      "crash_no_replay=true model_network_calls=0")
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve))
    if(apiPool)await apiPool.end()
    if(workerPool)await workerPool.end()
    await admin.end()
  }
})
