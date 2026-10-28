// Query fixtures below exercise repository guard/order only, never genuine SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import {AgentDesignSourceRepository} from '../src/agent-design-source.ts'
const owner='00000000-0000-4000-8000-000000000001',identity={issuer:'urn:agentstudio:local:v1',subject:'employee'}
test('non-Native identity is refused before a connection is acquired',async()=>{let calls=0;const r=new AgentDesignSourceRepository({connect:async()=>{calls++;throw Error()}});await assert.rejects(()=>r.preview({issuer:'fake',subject:owner},{}),e=>e.status===403);assert.equal(calls,0)})
test('a missing actual auditor fails closed after original-client admission check',async()=>{
  const queries=[],db={query:async sql=>{queries.push(sql);return {rows:[{ok:true}]} }}
  await assert.rejects(()=>new AgentDesignSourceRepository({}).contextOnClient(identity,db,owner),e=>e.code==='agent_design_schema_required')
  assert.equal(queries.length,1);assert.match(queries[0],/current_user='agentstudio_api'/)
})
test('auditor receives exact original client and owner-state RPC does not take browser owner arguments',async()=>{
  const calls=[],db={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('owner_state')?[{value:{owner_user_id:owner,governance_revision:'2',epoch:'2'}}]:[{ok:true}]}}}
  const r=new AgentDesignSourceRepository({},async actual=>{assert.equal(actual,db);return true}),v=await r.contextOnClient(identity,db,owner)
  assert.equal(v.governance_revision,2);assert.equal(calls[1].args,undefined);assert.match(calls[1].sql,/agent_design_owner_state\(\)/)
  db.query=async()=>({rows:[{ok:false}]});await assert.rejects(()=>r.contextOnClient(identity,db,owner),e=>e.status===403)
})
test('v4 source-only paths use row locks without old run540; save starts FOR UPDATE without SHARE upgrade',async()=>{
 for(const mode of ['share','update']){
  const calls=[],db={query:async(sql,args)=>{calls.push(sql);return {rows:sql.includes('AS ok')?[{ok:true}]:sql.includes('owner_state')?[{value:{owner_user_id:owner,governance_revision:2,epoch:2}}]:[]}}},r=new AgentDesignSourceRepository({},async()=>true)
  await assert.rejects(()=>r.currentOnClient(identity,db,owner,{purpose:'revise',model_binding:{connection_id:'00000000-0000-4000-8000-000000000002',connection_revision:1,model_id:'model'},source:{spec_id:'00000000-0000-4000-8000-000000000003',revision:1,source_sha256:'a'.repeat(64)}},mode),e=>e.code==='agent_spec_not_found')
  const role=calls.find(s=>s.includes('FROM agentstudio.agent_specs'));assert.ok(role.endsWith(mode==='update'?'FOR UPDATE':'FOR SHARE'));assert.equal(calls.some(s=>s.includes('540')||s.includes('pg_advisory')),false)
 }
})
test('v4 actual owner epoch is the locked Native governance revision, never an independent scalar epoch',async()=>{
 const db={query:async sql=>({rows:sql.includes('AS ok')?[{ok:true}]:[{value:{owner_user_id:owner,governance_revision:2,epoch:3}}]})}
 await assert.rejects(()=>new AgentDesignSourceRepository({},async()=>true).contextOnClient(identity,db,owner),e=>e.code==='agent_design_source_unavailable')
})
