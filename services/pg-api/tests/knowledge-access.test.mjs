import test from "node:test"
import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {agentFixture,alice,bob} from "./helpers/workflow-v2-agent-fixture.mjs"
import {KnowledgeAccessRepository} from "../src/knowledge-access-repository.ts"
import {withActor} from "../src/repository.ts"

async function fixture(){
  const f=await agentFixture({mcp:true,smithery:true})
  await f.db.exec(f.sql("migrations/pg_v9_032_knowledge_access.sql"))
  const calls=[],recipients=new Map([["bob@example.test",{id:f.users.bob,display_name:"Bob"}],["alice@example.test",{id:f.users.alice,display_name:"Alice"}]])
  const repo=new KnowledgeAccessRepository(f.pool,async(identity,email)=>{calls.push({identity,email});return recipients.get(email)??null})
  return {...f,repo,calls,recipients,base:f.resources.alice.kb.id}
}
const grant=(email="bob@example.test",revision=0,extra={})=>({action:"grant",recipient_email:email,role:"viewer",semantic_allowed:false,expected_revision:revision,request_id:randomUUID(),...extra})
const code=(wanted,status)=>error=>error.code===wanted&&(status===undefined||error.status===status)
test("knowledge sharing foundation grants only active recipient metadata; content and credentials retain private RLS",async()=>{
  const f=await fixture()
  try{
    const saved=await f.repo.change(alice,f.base,grant())
    assert.equal(saved.item.role,"viewer");assert.equal(saved.item.semantic_allowed,false)
    const items=await f.repo.listShared(bob)
    assert.equal(items.length,1);assert.equal(items[0].id,f.base);assert.equal(items[0].access_role,"viewer")
    assert.deepEqual(Object.keys(items[0]).sort(),["id","owner_user_id","owner_name","name","description","access_role","semantic_allowed","access_revision","base_revision"].sort())
    assert.equal((await f.repo.listShared(alice)).length,0)
    await withActor(f.pool,bob,async db=>{
      assert.equal((await db.query("SELECT agentstudio.knowledge_access_mode($1::uuid) AS access",[f.base])).rows[0].access,"viewer")
      assert.equal((await db.query("SELECT id FROM agentstudio.knowledge_bases WHERE id=$1::uuid",[f.base])).rows.length,0)
      assert.equal((await db.query("SELECT id FROM agentstudio.knowledge_documents WHERE base_id=$1::uuid",[f.base])).rows.length,0)
      assert.equal((await db.query("SELECT id FROM agentstudio.knowledge_chunks WHERE owner_user_id=$1::uuid",[f.users.alice])).rows.length,0)
      assert.equal((await db.query("SELECT * FROM agentstudio.knowledge_access WHERE base_id=$1::uuid",[f.base])).rows.length,0)
    })
    const roles=(await f.db.query("SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname='agentstudio_knowledge_acl'")).rows[0]
    assert.deepEqual(Object.values(roles),[false,false,false,false,false,false])
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM pg_auth_members WHERE roleid='agentstudio_knowledge_acl'::regrole")).rows[0].n,0)
    for(const role of ["agentstudio_worker","agentstudio_model_broker","agentstudio_bound_dispatch"]){
      for(const table of ["knowledge_access","knowledge_access_receipts"]){
        assert.equal((await f.db.query("SELECT has_any_column_privilege($1::text,$2::text,'SELECT,INSERT,UPDATE,REFERENCES') AS access",[role,"agentstudio."+table])).rows[0].access,false)
      }
      assert.equal((await f.db.query("SELECT has_function_privilege($1::text,'agentstudio.knowledge_shared_bases()','EXECUTE') AS access",[role])).rows[0].access,false)
    }
    for(const table of ["knowledge_documents","knowledge_chunks","model_connections","mcp_connection_headers","smithery_credentials"])
      assert.equal((await f.db.query("SELECT has_any_column_privilege('agentstudio_knowledge_acl',$1::text,'SELECT,INSERT,UPDATE,REFERENCES') AS access",["agentstudio."+table])).rows[0].access,false)
    const security=(await f.db.query("SELECT p.prosecdef,p.proconfig,r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='agentstudio.knowledge_shared_bases()'::regprocedure")).rows[0]
    assert.equal(security.prosecdef,true);assert.deepEqual(security.proconfig,["search_path=pg_catalog"]);assert.equal(security.rolname,"agentstudio_knowledge_acl")
    const tables=(await f.db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('agentstudio.knowledge_access'::regclass,'agentstudio.knowledge_access_receipts'::regclass)")).rows
    assert.equal(tables.length,2);assert.ok(tables.every(row=>row.relrowsecurity&&row.relforcerowsecurity))
    await f.db.query("UPDATE agentstudio.users SET external_issuer='urn:agentstudio:local:v1' WHERE id=$1",[f.users.bob])
    assert.equal((await f.repo.listShared({issuer:"urn:agentstudio:local:v1",subject:"bob"})).length,0)
  }finally{await f.close()}
})
test("only owner changes grants; semantic consent is separate, CAS protected, audited and removed on revoke",async()=>{
  const f=await fixture()
  try{
    await assert.rejects(f.repo.change(bob,f.base,grant("alice@example.test")),code("knowledge_base_not_found",404))
    await assert.rejects(f.repo.listGrants(bob,f.base),code("knowledge_base_not_found",404))
    assert.equal(f.calls.length,0)
    const saved=await f.repo.change(alice,f.base,grant()),id=saved.item.recipient_id
    assert.equal((await f.repo.listGrants(alice,f.base))[0].revision,1)
    const semantic=await f.repo.change(alice,f.base,{action:"semantic",recipient_id:id,enabled:true,expected_revision:1,request_id:randomUUID()})
    assert.equal(semantic.item.semantic_allowed,true);assert.equal(semantic.item.role,"viewer")
    await assert.rejects(f.repo.change(alice,f.base,grant("bob@example.test",1,{role:"editor"})),code("knowledge_access_revision_conflict",409))
    const editor=await f.repo.change(alice,f.base,grant("bob@example.test",2,{role:"editor"}))
    assert.equal(editor.item.role,"editor");assert.equal(editor.item.semantic_allowed,false)
    const revoked=await f.repo.change(alice,f.base,{action:"revoke",recipient_id:id,expected_revision:3,request_id:randomUUID()})
    assert.equal(revoked.item.revoked,true);assert.equal(revoked.item.semantic_allowed,false);assert.equal((await f.repo.listShared(bob)).length,0)
    assert.equal((await f.repo.listGrants(alice,f.base))[0].revoked,true)
    await withActor(f.pool,bob,async db=>assert.equal((await db.query("SELECT agentstudio.knowledge_access_mode($1::uuid) AS access",[f.base])).rows[0].access,null))
    const audit=(await f.db.query("SELECT action,metadata FROM agentstudio.audit_events WHERE action LIKE 'knowledge_access.%' ORDER BY occurred_at,id")).rows
    assert.equal(audit.length,4);assert.equal(JSON.stringify(audit).includes("bob@example.test"),false)
    const enabled=await f.repo.change(alice,f.base,grant("bob@example.test",4,{role:"editor",semantic_allowed:true}))
    assert.equal(enabled.item.revision,5);assert.equal((await f.repo.listShared(bob))[0].semantic_allowed,true)
  }finally{await f.close()}
})
test("committed response loss is recovered by immutable owner receipt without repeating recipient lookup or mutation",async()=>{
  const f=await fixture()
  try{
    const request=grant(),first=await f.repo.change(alice,f.base,request)
    assert.equal(first.replayed,false)
    const retry=await f.repo.change(alice,f.base,request)
    assert.equal(retry.replayed,true);assert.deepEqual(retry.item,first.item);assert.equal(f.calls.length,1)
    assert.deepEqual(await f.repo.receipt(alice,f.base,request.request_id),first.item)
    await assert.rejects(f.repo.receipt(bob,f.base,request.request_id),code("knowledge_base_not_found",404))
    await assert.rejects(f.repo.change(alice,f.base,{...request,role:"editor"}),code("knowledge_access_request_conflict",409))
    const revoke={action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()}
    const revoked=await f.repo.change(alice,f.base,revoke)
    assert.deepEqual((await f.repo.change(alice,f.base,revoke)).item,revoked.item)
    // Historical grant receipts confirm a past action; they never restore it.
    assert.equal((await f.repo.change(alice,f.base,request)).replayed,true)
    assert.equal((await f.repo.listShared(bob)).length,0)
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM agentstudio.audit_events WHERE action LIKE 'knowledge_access.%'")).rows[0].n,2)
  }finally{await f.close()}
})
test("owner or recipient deactivation immediately hides grants; revoked grants cannot be escalated by another recipient",async()=>{
  const f=await fixture()
  try{
    await f.repo.change(alice,f.base,grant())
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1::uuid",[f.users.alice])
    assert.equal((await f.repo.listShared(bob)).length,0)
    await f.db.query("UPDATE agentstudio.users SET status='active' WHERE id=$1::uuid",[f.users.alice])
    assert.equal((await f.repo.listShared(bob)).length,1)
    await f.db.query("UPDATE agentstudio.users SET status='disabled' WHERE id=$1::uuid",[f.users.bob])
    const list=await f.repo.listGrants(alice,f.base);assert.equal(list[0].recipient_active,false)
    await assert.rejects(f.repo.change(alice,f.base,grant("bob@example.test",1)),code("knowledge_recipient_not_found",404))
    // An inactive recipient can always be revoked by the owner.
    await f.repo.change(alice,f.base,{action:"revoke",recipient_id:f.users.bob,expected_revision:1,request_id:randomUUID()})
    await f.db.query("UPDATE agentstudio.users SET status='active' WHERE id=$1::uuid",[f.users.bob])
    assert.equal((await f.repo.listShared(bob)).length,0)
    await assert.rejects(f.repo.change(alice,f.base,grant("alice@example.test")),code("knowledge_recipient_not_found",404))
    await assert.rejects(f.repo.change(alice,f.base,{...grant(),owner_user_id:f.users.bob}),code("invalid_knowledge_access_change",400))
  }finally{await f.close()}
})
test("fifty active recipient limit is atomic and freed only by revocation; stale or malformed requests leave no receipts",async()=>{
  const f=await fixture()
  try{
    for(let n=0;n<50;n++){
      const id=(await f.db.query("INSERT INTO agentstudio.users(external_issuer,external_subject) VALUES($1,$2) RETURNING id",[alice.issuer,"recipient-"+n])).rows[0].id
      await f.db.query("INSERT INTO agentstudio.knowledge_access(base_id,owner_user_id,recipient_user_id,access_role) VALUES($1,$2,$3,'viewer')",[f.base,f.users.alice,id])
    }
    const request=grant()
    await assert.rejects(f.repo.change(alice,f.base,request),code("knowledge_share_limit",429))
    assert.equal(await f.repo.receipt(alice,f.base,request.request_id),null)
    const old=(await f.repo.listGrants(alice,f.base))[0]
    await f.repo.change(alice,f.base,{action:"revoke",recipient_id:old.recipient_user_id,expected_revision:1,request_id:randomUUID()})
    assert.equal((await f.repo.change(alice,f.base,request)).item.revision,1)
    for(const change of [{...grant(),expected_revision:NaN},{...grant(),expected_revision:Number.MAX_SAFE_INTEGER},{...grant(),semantic_allowed:1},{...grant(),role:"owner"}])
      await assert.rejects(f.repo.change(alice,f.base,change),error=>error.status===400)
    const requests=[grant("bob@example.test",1,{role:"editor"}),grant("bob@example.test",1,{semantic_allowed:true})]
    const settled=await Promise.allSettled(requests.map(value=>f.repo.change(alice,f.base,value)))
    assert.equal(settled.filter(row=>row.status==="fulfilled").length,1)
    assert.equal(settled.filter(row=>row.status==="rejected"&&row.reason.code==="knowledge_access_revision_conflict").length,1)
  }finally{await f.close()}
})
