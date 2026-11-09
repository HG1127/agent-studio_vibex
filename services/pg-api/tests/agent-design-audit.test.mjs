// Pure expression and absent/partial catalog response checks only. There is
// no pg/Pool, DB server, Worker, real-login or provider execution in this test.
import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAgentDesignCheck as norm,verifyAgentDesignCore} from '../src/agent-design-audit-core.ts'

test('062 CHECK normalization keeps parentheses and literal bytes meaningful',()=>{
  assert.equal(norm("CHECK (((purpose = 'generate'::text)))"),norm("purpose='generate'"))
  assert.notEqual(norm("a AND (b OR c)"),norm("(a AND b) OR c"))
  assert.notEqual(norm("source_sha256 ~ '^[a-f0-9]{64}$'"),norm("source_sha256 ~ '^[a-f0-9]{6,64}$'"))
  assert.notEqual(norm("goal='a b'"),norm("goal='ab'"))
  assert.notEqual(norm("goal='a''b'"),norm("goal='ab'"))
  assert.notEqual(norm("a = b"),norm("a <> b"))
})
test('062 CHECK normalization accepts exact PostgreSQL IN/ANY and BETWEEN forms',()=>{
  assert.equal(norm("purpose IN('generate','revise')"),norm("(purpose = ANY (ARRAY['generate'::text,'revise'::text]))"))
  assert.equal(norm("output_token_limit IN(4096,8192,16384)"),norm("output_token_limit = ANY ('{4096,8192,16384}'::integer[])"))
  assert.equal(norm("owner_epoch BETWEEN 1 AND 9007199254740989"),norm("((owner_epoch >= 1) AND (owner_epoch <= '9007199254740989'::bigint))"))
  assert.equal(norm("(a IS NULL AND b IS NOT NULL) OR (c IS NULL)"),norm("((a IS NULL) AND (b IS NOT NULL)) OR c IS NULL"))
})
test('062 CHECK normalization rejects unknown or trailing syntax',()=>{
  for(const expression of ["a=b;SELECT true","a=b -- ignored","a=b /* hidden */","a=", "(a=b", "a=b) OR true", "E'a'='a'", "x IN()"])
    assert.throws(()=>norm(expression),/unsafe_agent_design_privileges/)
})
test('062 CHECK normalization rejects permission-widening expression changes',()=>{
  const expected="(purpose='generate' AND before_revision IS NULL AND after_revision=1) OR (purpose='revise' AND before_revision IS NOT NULL AND after_revision=before_revision+1)"
  assert.notEqual(norm(expected),norm(expected+' OR true'))
  assert.notEqual(norm(expected),norm(expected.replace('after_revision=before_revision+1','after_revision>=before_revision')))
  assert.notEqual(norm(expected),norm(expected.replace('before_revision IS NOT NULL','before_revision IS NULL')))
  assert.notEqual(norm("jsonb_typeof(body)='object'"),norm("attacker.jsonb_typeof(body)='object'"))
})

const absent=()=>{
  const calls=[]
  return {calls,async query(sql){calls.push(sql);if(sql.includes('design062:stamp'))return {rows:[{installed:false,predecessor:true,server_version:180000,types:0,policies:0,events:0,role_count:0,extras:0}]};if(['inventory','routines','roles'].some(key=>sql.includes('design062:'+key)))return {rows:[]};throw Error('unexpected query')},release(){throw Error('auditor must not release caller client')}}
}
test('062 wholly absent catalog returns false without transaction ownership',async()=>{
  const db=absent();assert.equal(await verifyAgentDesignCore(db),false)
  assert.equal(db.calls.length,4);assert(db.calls.every(sql=>/^\/\* design062:/.test(sql)&&!/^\s*(BEGIN|COMMIT|ROLLBACK|SET |INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)/.test(sql)))
})
test('062 stray object without installed stamp is refused',async()=>{
  const db=absent(),base=db.query.bind(db)
  db.query=async sql=>sql.includes('design062:inventory')?{rows:[{id:100,schema:'agentstudio',name:'agent_design_unknown',kind:'r'}]}:base(sql)
  await assert.rejects(()=>verifyAgentDesignCore(db),/unsafe_agent_design_privileges/)
})
test('062 partial installed catalog never becomes a successful verifier',async()=>{
  const db=absent(),base=db.query.bind(db)
  db.query=async sql=>sql.includes('design062:stamp')?{rows:[{installed:true,predecessor:true,server_version:180000,types:0,policies:0,events:0,role_count:0,extras:0}]}:base(sql)
  await assert.rejects(()=>verifyAgentDesignCore(db),/unsafe_agent_design_privileges/)
})
