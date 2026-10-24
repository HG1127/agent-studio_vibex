import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {agentCollaborationFixture} from "./helpers/agent-collaboration-fixture.mjs"
import {freshRuntimeSqlBody} from "../src/pg18-fresh-runtime-source.mjs"
import {AgentSpecRepository,withActor} from "../src/repository.ts"
import {safeAgentSpec} from "../src/contracts.ts"
import {parseAgentReleaseStoredSpec} from "../src/agent-release-contract.ts"
import {verifyAgentReleaseCredentials,inspectAgentReleaseSchema} from "../src/agent-release-audit.ts"

test("draft full-version foundation is private, owner-only, immutable and never certifies itself as an installed046",async()=>{
  const f=await agentCollaborationFixture()
  try{
    const sql=readFileSync(new URL("../../../db/postgres/migrations/pg_v9_046_agent_releases.sql",import.meta.url),"utf8")
    await f.db.exec(freshRuntimeSqlBody(sql))
    assert.equal(await verifyAgentReleaseCredentials(f.api),true)
    await assert.rejects(inspectAgentReleaseSchema(f.pool),/agent_release_runtime_incomplete/)
    for(const drift of ["ALTER ROLE agentstudio_releases LOGIN","GRANT agentstudio_releases TO agentstudio_api",
      "GRANT SELECT ON agentstudio.agent_release_versions TO agentstudio_api","GRANT SELECT(password_record) ON agentstudio_auth.accounts TO agentstudio_releases",
      "GRANT UPDATE(revision) ON agentstudio.agent_release_heads TO agentstudio_releases","GRANT EXECUTE ON FUNCTION agentstudio.release_source_sha(uuid) TO agentstudio_api",
      "ALTER TABLE agentstudio.agent_release_versions NO FORCE ROW LEVEL SECURITY","ALTER TABLE agentstudio.agent_release_versions DISABLE TRIGGER native_agent_release_immutable",
      "DROP TRIGGER native_agent_release_immutable ON agentstudio.agent_release_versions","DROP INDEX agentstudio.ux_agent_release_published",
      "CREATE FUNCTION agentstudio.agent_release_unreviewed() RETURNS boolean LANGUAGE sql AS 'SELECT true'",
      "CREATE VIEW agentstudio.agent_release_unreviewed AS SELECT 1 AS n"]){
      await f.rollback(async db=>{await db.query(drift);await assert.rejects(verifyAgentReleaseCredentials(db),/unsafe_agent_release_privileges/)})
    }
    const role=await new AgentSpecRepository(f.pool).create(f.alice,"Owned release role",safeAgentSpec({goal:"Immutable owner goal"}))
    const workspace=who=>withActor(f.pool,who,async db=>(await db.query("SELECT agentstudio.agent_release_workspace($1) AS item",[role.id])).rows[0].item)
    assert.equal(await workspace(f.bob),null)
    const empty=await workspace(f.alice);assert.equal(empty.next_version_no,1);assert.deepEqual(empty.versions,[]);assert.match(empty.source_sha256,/^[a-f0-9]{64}$/)
    const connection=randomUUID(),binding={connection_id:connection,connection_revision:1,model_id:"synthetic-owner-model"}
    await f.db.query("UPDATE agentstudio.agent_specs SET spec=jsonb_set(spec,'{model_binding}',$2::jsonb) WHERE id=$1",[role.id,JSON.stringify(binding)])
    const source=await workspace(f.alice),snapshot=(await f.db.query("SELECT spec FROM agentstudio.agent_specs WHERE id=$1",[role.id])).rows[0].spec,version=randomUUID()
    await f.db.query("INSERT INTO agentstudio.agent_release_heads(spec_id,owner_user_id,next_version_no) VALUES($1,$2,2)",[role.id,f.owner.id])
    await f.db.query("INSERT INTO agentstudio.agent_release_versions(id,owner_user_id,spec_id,version_no,spec_revision,source_sha256,name_snapshot,spec_snapshot,note) VALUES($1,$2,$3,1,$4,$5,$6,$7::jsonb,'Reviewed full role')",
      [version,f.owner.id,role.id,source.spec_revision,source.source_sha256,role.name,JSON.stringify(snapshot)])
    const own=await workspace(f.alice);assert.equal(own.versions.length,1);assert.equal(own.versions[0].test_passed,false)
    assert.equal(own.versions[0].status,"draft");assert.equal(JSON.stringify(own).includes(connection),false)
    const detail=who=>withActor(f.pool,who,async db=>(await db.query("SELECT agentstudio.agent_release_detail($1,$2) AS item",[role.id,version])).rows[0].item)
    assert.equal(await detail(f.bob),null)
    assert.deepEqual(parseAgentReleaseStoredSpec((await detail(f.alice)).spec_snapshot).snapshot,snapshot)
    const grantId=randomUUID()
    await withActor(f.pool,f.alice,db=>db.query("SELECT agentstudio.agent_collaboration_grant($1,$2,'editor',0,$3,$4)",[role.id,f.recipient.id,grantId,"a".repeat(64)]))
    assert.equal(await workspace(f.bob),null);assert.equal(await detail(f.bob),null)
    const hash=own.versions[0].version_sha256
    await f.rollback(async db=>{await db.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");assert.equal((await db.query("SELECT agentstudio.release_version_sha($1) AS sha",[version])).rows[0].sha,hash)})
    for(const query of ["UPDATE agentstudio.agent_release_versions SET note='tampered' WHERE id=$1",
      "UPDATE agentstudio.agent_release_versions SET spec_snapshot=jsonb_set(spec_snapshot,'{goal}','\"Changed\"'::jsonb) WHERE id=$1",
      "UPDATE agentstudio.agent_release_versions SET test_passed=true WHERE id=$1"])
      await assert.rejects(f.db.query(query,[version]),/agent_release_snapshot_immutable/)
    await assert.rejects(f.db.query("DELETE FROM agentstudio.agent_release_versions WHERE id=$1",[version]),/agent_release_version_retained/)
    assert.equal((await detail(f.alice)).version_sha256,hash)
    for(const table of ["agent_release_heads","agent_release_versions","agent_release_acceptance_runs","agent_release_receipts"]){
      assert.equal((await f.db.query("SELECT relrowsecurity AND relforcerowsecurity AS forced FROM pg_class WHERE oid=('agentstudio.'||$1)::regclass",[table])).rows[0].forced,true)
      for(const service of ["agentstudio_api","agentstudio_worker","agentstudio_model_broker","agentstudio_native_auth"])
        assert.equal((await f.db.query("SELECT has_any_column_privilege($1,'agentstudio.'||$2,'SELECT,INSERT,UPDATE,REFERENCES') AS leaked",[service,table])).rows[0].leaked,false)
    }
    assert.equal((await f.db.query("SELECT NOT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls AND NOT rolsuper AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid) AS safe FROM pg_roles r WHERE rolname='agentstudio_releases'")).rows[0].safe,true)
    assert.equal((await f.db.query("SELECT has_column_privilege('agentstudio_releases','agentstudio_auth.accounts','password_record','SELECT') AS leaked")).rows[0].leaked,false)
    await assert.rejects(withActor(f.pool,f.alice,db=>db.query("SELECT agentstudio.release_source_sha($1)",[role.id])),e=>e.code==="42501")
    await f.db.query("UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1",[f.owner.id]);assert.equal(await workspace(f.alice),null)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.schema_migrations WHERE version='pg_v9_046'")).rows[0].n,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.runs")).rows[0].n,0)
  }finally{await f.close()}
})
