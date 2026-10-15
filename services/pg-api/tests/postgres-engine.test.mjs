// Embedded PostgreSQL+pgvector ENGINE smoke test. No host ports, Docker,
// browser, external network, real user data or PocketBase interactions.
// PGlite uses PostgreSQL WASM; PostgreSQL 17 container parity remains separate.
import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {PGlite} from "@electric-sql/pglite"
import {vector} from "@electric-sql/pglite-pgvector"

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..")
const sql=fs.readFileSync(path.join(root,"db/postgres/001_stage_schema.sql"),"utf8")
  .split(/\r?\n/).filter(line=>!line.trim().startsWith("\\")).join("\n")

test("real PostgreSQL engine executes V8 empty staging schema with pgvector",async()=>{
  const pg=await PGlite.create({extensions:{vector}})
  try {
    await pg.exec(sql)
    const tables=await pg.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='agentstudio'")
    assert.equal(tables.rows[0].n,20)
    const vectorExt=await pg.query("SELECT extname FROM pg_extension WHERE extname='vector'")
    assert.equal(vectorExt.rows[0].extname,"vector")
    const policies=await pg.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='agentstudio'")
    assert.equal(policies.rows[0].n,22)
    const ownerRls=await pg.query(
      "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='agentstudio' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity",
    )
    assert.equal(ownerRls.rows[0].n,19)

    // Real RLS with two synthetic employees, using a verified issuer/sub pair
    // mapped inside PostgreSQL. The in-memory engine has no TCP listener.
    const issuer="https://id.internal.example"
    const a=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES($1,$2) RETURNING id",
      [issuer,"A"])
    const b=await pg.query(
      "INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES($1,$2) RETURNING id",
      [issuer,"B"])
    const aId=a.rows[0].id,bId=b.rows[0].id
    const connection={async connect(){
      return {async query(sql,params=[]){return pg.query(sql,params)},release(){}}
    }}
    const {AgentSpecRepository,verifyDatabaseRole}=await import("../src/repository.ts")
    const repository=new AgentSpecRepository(connection)
    // Startup gate requires a NON-superuser service login. Administrator-owned
    // PGlite connection must be rejected rather than accepted as a live API.
    await assert.rejects(verifyDatabaseRole(connection),/unsafe_database_role/)

    const identityA={issuer,subject:"A"}
    const identityB={issuer,subject:"B"}
    const spec={goal:"Staging A",task_scope:"Public facts",deliverables:[],
      tools:["summarize"],task_plan:[],done_criteria:[],
      knowledge_base_ids:[],require_approval:true}
    const aSpec=await repository.create(identityA,"Synthetic A",spec)
    const bSpec=await repository.create(identityB,"Synthetic B",{...spec,goal:"Staging B"})
    assert.equal(aSpec.owner_user_id,aId)
    assert.equal(bSpec.owner_user_id,bId)
    assert.deepEqual((await repository.list(identityA)).map(v=>v.id),[aSpec.id])
    assert.deepEqual((await repository.list(identityB)).map(v=>v.id),[bSpec.id])
    assert.equal(await repository.get(identityA,bSpec.id),null)
    assert.equal((await repository.get(identityA,aSpec.id)).name,"Synthetic A")
    assert.equal((await repository.update(identityA,bSpec.id,"Intrusion",spec,1)),null)
    const changed=await repository.update(identityA,aSpec.id,"Renamed",spec,1)
    assert.equal(changed.revision,2)
    assert.equal((await repository.update(identityA,aSpec.id,"Old revision",spec,1)),null)
    await assert.rejects(repository.list({issuer,subject:"unregistered"}),
      /employee_not_provisioned/)

    // Prove policy denies employee B rows even without client WHERE conditions.
    await pg.exec("BEGIN")
    try {
      await pg.exec("SET LOCAL ROLE agentstudio_api")
      await pg.query("SELECT set_config('agentstudio.actor_id',$1,true)",[aId])
      const rows=await pg.query("SELECT name FROM agentstudio.agent_specs ORDER BY name")
      assert.deepEqual(rows.rows.map(x=>x.name),["Renamed"])
    }finally{await pg.exec("ROLLBACK")}

    const invite=await pg.query(
      "INSERT INTO agentstudio.template_invites (owner_user_id,source_spec_id,safe_snapshot,token_hash,expires_at) "+
      "VALUES($1,$2,$3::jsonb,$4,now()+interval '7 days') RETURNING id",
      [aId,aSpec.id,'{"goal":"snapshot"}',"a".repeat(64)])
    assert.equal(invite.rows.length,1)
    await pg.query("DELETE FROM agentstudio.agent_specs WHERE id=$1",[aSpec.id])
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM agentstudio.template_invites WHERE id=$1",[invite.rows[0].id])).rows[0].n,1)

    // Real pgvector operator and the HNSW index from the staging schema.
    const kb=await pg.query("INSERT INTO agentstudio.knowledge_bases(owner_user_id,name) VALUES($1,'synthetic') RETURNING id",[bId])
    const doc=await pg.query(
      "INSERT INTO agentstudio.knowledge_documents(owner_user_id,base_id,filename,object_key,mime_type,sha256) "+
      "VALUES($1,$2,'fixture.txt','isolated/fixture','text/plain',$3) RETURNING id",
      [bId,kb.rows[0].id,"f".repeat(64)])
    const vectorText="["+Array.from({length:1536},(_,i)=>i===0?"1":"0").join(",")+"]"
    await pg.query(
      "INSERT INTO agentstudio.knowledge_chunks(owner_user_id,document_id,chunk_index,text_content,embedding,embedding_model) "+
      "VALUES($1,$2,0,'synthetic only',$3::vector,'synthetic')",
      [bId,doc.rows[0].id,vectorText])
    const similarity=await pg.query(
      "SELECT embedding <=> $1::vector AS distance FROM agentstudio.knowledge_chunks",
      [vectorText])
    assert.equal(Number(similarity.rows[0].distance),0)

    // The future backend's queue contract can execute against real SQL,
    // without connecting any external tool or actually running a model.
    const runner=await pg.query(
      "INSERT INTO agentstudio.runs(owner_user_id,kind,agent_spec_id,status) VALUES($1,'agent',$2,'queued') RETURNING id",
      [bId,bSpec.id])
    await pg.query(
      "INSERT INTO agentstudio.jobs(owner_user_id,run_id,kind,dedupe_key) "+
      "VALUES($1,$2,'run_tick','first')",[bId,runner.rows[0].id])
    const rootSql=path.join(root,"db/postgres")
    const claimSql=fs.readFileSync(path.join(rootSql,"002_claim_job.sql"),"utf8")
    const finishSql=fs.readFileSync(path.join(rootSql,"003_finish_job.sql"),"utf8")
    await pg.exec("BEGIN")
    let claimed
    try {
      await pg.exec("SET LOCAL ROLE agentstudio_worker")
      claimed=await pg.query(claimSql,["w-1",90])
      assert.equal(claimed.rows.length,1)
      assert.equal(Number(claimed.rows[0].lease_version),1)
      await pg.exec("COMMIT")
    }catch(e){await pg.exec("ROLLBACK");throw e}
    await pg.exec("BEGIN")
    try {
      await pg.exec("SET LOCAL ROLE agentstudio_worker")
      const stale=await pg.query(finishSql,[claimed.rows[0].id,claimed.rows[0].lease_token,999,"w-1","succeeded"])
      assert.equal(stale.rows.length,0)
      const done=await pg.query(finishSql,[claimed.rows[0].id,claimed.rows[0].lease_token,1,"w-1","succeeded"])
      assert.equal(done.rows.length,1)
      await pg.exec("COMMIT")
    }catch(e){await pg.exec("ROLLBACK");throw e}
  } finally {
    await pg.close()
  }
})
