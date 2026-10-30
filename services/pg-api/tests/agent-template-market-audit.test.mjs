// Pure refusal and expression checks only. No pg, SQL engine or authority proof.
import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAgentTemplateMarketCheck as norm,verifyAgentTemplateMarketCore} from '../src/agent-template-market-audit-core.ts'
test('063 CHECK normalization preserves literal bytes and Boolean grouping',()=>{
  assert.equal(norm("state IN('public','unlisted','deleted')"),norm("state=ANY(ARRAY['public'::text,'unlisted'::text,'deleted'::text])"))
  assert.notEqual(norm("a AND (b OR c)"),norm("(a AND b) OR c"))
  assert.notEqual(norm("snapshot_sha256 ~ '^[a-f0-9]{64}$'"),norm("snapshot_sha256 ~ '^[a-f0-9]{6,64}$'"))
  assert.notEqual(norm("name='a b'"),norm("name='ab'"))
})
test('063 CHECK normalization accepts exact numeric casts and NULL branches',()=>{
  assert.equal(norm('revision BETWEEN 1 AND 9007199254740991'),norm("revision>=1 AND revision<='9007199254740991'::bigint"))
  assert.equal(norm('use_count=0'),norm("use_count='0'::bigint"))
  assert.equal(norm('state IS NOT NULL'),norm('((state IS NOT NULL))'))
})
test('063 CHECK normalization refuses unknown/trailing syntax and distinguishes widened checks',()=>{
  for(const value of ["a=b;SELECT true","a=b --hidden","a=","(a=b","a=b) OR true"])assert.throws(()=>norm(value),/unsafe_agent_template_market_privileges/)
  assert.notEqual(norm("state='deleted' OR name IS NOT NULL"),norm("state='deleted' OR name IS NOT NULL OR true"))
})
const absent=(patch={})=>{
  const calls=[]
  return {calls,async query(sql){calls.push(sql);if(sql.includes('template063:stamp'))return {rows:[{installed:false,predecessor:true,server_version:180000,types:0,policies:0,events:0,roles:0,triggers:0,constraints:0,extras:0,...patch}]};if(['inventory','routines'].some(k=>sql.includes('template063:'+k)))return {rows:[]};throw Error('unexpected query')},release(){throw Error('auditor must not release original caller connection')}}
}
test('063 wholly absent family returns false without transaction ownership',async()=>{
  const db=absent();assert.equal(await verifyAgentTemplateMarketCore(db),false);assert.equal(db.calls.length,3)
  assert.ok(db.calls.every(sql=>/^\/\* template063:/.test(sql)&&!/^\s*(BEGIN|SET |COMMIT|ROLLBACK|INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)/.test(sql)))
})
test('063 absent stamp plus any stray family class refuses instead of false success',async()=>{
  for(const key of ['types','policies','events','roles','triggers','constraints','extras'])await assert.rejects(()=>verifyAgentTemplateMarketCore(absent({[key]:1})),/unsafe_agent_template_market_privileges/)
  const db=absent(),query=db.query.bind(db)
  db.query=async sql=>sql.includes('template063:inventory')?{rows:[{id:100,schema:'agentstudio',name:'agent_template_market_stray',kind:'r'}]}:query(sql)
  await assert.rejects(()=>verifyAgentTemplateMarketCore(db),/unsafe_agent_template_market_privileges/)
})
test('063 incomplete installation, missing predecessor and wrong server cannot pass',async()=>{
  for(const patch of [{installed:true},{installed:true,predecessor:false},{installed:true,server_version:170999},{installed:true,server_version:190000}])await assert.rejects(()=>verifyAgentTemplateMarketCore(absent(patch)),/unsafe_agent_template_market_privileges/)
})
test('063 unsafe actual-session predicate refuses before any object is accepted',async()=>{
  const db=absent({installed:true,types:8,triggers:1}),query=db.query.bind(db)
  db.query=async sql=>sql.includes('template063:session')?{rows:[{id:100,safe:false}]}:query(sql)
  await assert.rejects(()=>verifyAgentTemplateMarketCore(db),/unsafe_agent_template_market_privileges/)
  assert.ok(db.calls.every(sql=>!sql.includes('template063:table')))
})
