// Actual before/after catalog forms from hosted PG18 job122186005643.
// No SQL engine, pg import, connection, auditor override or fixture is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {matchesAgentMemoryDerivedCheck,matchesAgentMemoryDerivedChecks} from '../src/agent-memory-derived-audit.ts'

const name='agent_memory_derived_entries_fact_check'
const original='(((length(btrim(fact)) >= 1) AND (length(btrim(fact)) <= 500)) AND (octet_length(fact) <= 2000))'
const restored='((length(btrim(fact)) >= 1) AND (length(btrim(fact)) <= 500) AND (octet_length(fact) <= 2000))'

test('the two real PG18 source and restored fact CHECK spellings retain every exact predicate',()=>{
  assert.equal(matchesAgentMemoryDerivedCheck(name,original),true)
  assert.equal(matchesAgentMemoryDerivedCheck(name,restored),true)
  assert.equal(matchesAgentMemoryDerivedCheck(name,restored.replaceAll(' AND ','\nAND\t')),true)
  assert.equal(matchesAgentMemoryDerivedCheck(name,restored+' '),true)
})

test('flattened acceptance never permits weakened bounds, missing terms, another boolean operator or another constraint',()=>{
  for(const expression of [
    restored.replace('>= 1','>= 0'),restored.replace('<= 500','<= 501'),restored.replace('<= 2000','<= 2001'),
    restored.replace(' AND (octet_length(fact) <= 2000)',''),restored.replace(' AND ',' OR '),
    restored.replace('length(btrim(fact))','length(fact)'),restored.replace('fact','tools_used'),
    restored.slice(1,-1),restored+' OR true',
  ]){
    assert.equal(matchesAgentMemoryDerivedCheck(name,expression),false,expression)
  }
  assert.equal(matchesAgentMemoryDerivedCheck('agent_memory_derived_entries_check',restored),false)
  assert.equal(matchesAgentMemoryDerivedCheck('__proto__',restored),false)
  assert.equal(matchesAgentMemoryDerivedCheck(name,null),false)
})

test('existing quoted CHECK literals are exact and do not inherit the fact-only variant',()=>{
  const constraint='agent_memory_derived_entries_tools_used_check'
  const expression="((length(tools_used) <= 300) AND (octet_length(tools_used) <= 1200) AND (tools_used !~ '[[:cntrl:]]'::text))"
  assert.equal(matchesAgentMemoryDerivedCheck(constraint,expression),true)
  for(const changed of [expression.replace('[[:cntrl:]]',' [[:cntrl:]]'),expression.replace('!~','~'),expression.replace('<= 300','<= 301')]){
    assert.equal(matchesAgentMemoryDerivedCheck(constraint,changed),false)
  }
})

test('each table requires its exact complete CHECK-name set; another table cannot supply a replacement fact bound',()=>{
  const row=(name,expression)=>({name,expression,valid:true})
  const checks=[
    row('agent_memory_derived_entries_check',"(content_sha256 = encode(sha256(convert_to(fact, 'UTF8'::name)), 'hex'::text))"),
    row('agent_memory_derived_entries_check1',"(tools_sha256 = encode(sha256(convert_to(tools_used, 'UTF8'::name)), 'hex'::text))"),
    row(name,restored),
    row('agent_memory_derived_entries_tools_used_check',"((length(tools_used) <= 300) AND (octet_length(tools_used) <= 1200) AND (tools_used !~ '[[:cntrl:]]'::text))"),
  ]
  assert.equal(matchesAgentMemoryDerivedChecks('agent_memory_derived_entries',checks),true)
  const replacement=row('agent_memory_derived_receipts_content_sha256_check',"(content_sha256 ~ '^[a-f0-9]{64}$'::text)")
  assert.equal(matchesAgentMemoryDerivedCheck(replacement.name,replacement.expression),true,'the other table has a valid constraint in its own scope')
  assert.equal(matchesAgentMemoryDerivedChecks('agent_memory_derived_entries',[...checks.slice(0,2),replacement,checks[3]]),false)
  assert.equal(matchesAgentMemoryDerivedChecks('agent_memory_derived_entries',[...checks.slice(0,2),checks[3],checks[3]]),false)
  assert.equal(matchesAgentMemoryDerivedChecks('agent_memory_derived_entries',checks.slice(1)),false)
  assert.equal(matchesAgentMemoryDerivedChecks('__proto__',checks),false)
})
