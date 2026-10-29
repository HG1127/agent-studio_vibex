import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {optimizationRetestId,optimizationRetestProof} from '../shared/agent-optimization-retest-contract.ts'
import {storedOptimizationRetest} from '../services/pg-api/src/agent-optimization-retest-policy.ts'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const expected={run_id:id(1),spec_id:id(2),spec_revision:4,acceptance_request_id:id(3)}
const proof=()=>({protocol:'agent_optimization_retest_v1',run_id:id(1),acceptance_request_id:id(3),source_run_id:id(4),spec_id:id(2),spec_revision:4,source_sha256:'a'.repeat(64),feedback_id:id(5),feedback_sha256:'b'.repeat(64),after_revision_id:id(6)})
test('closed retest provenance binds the new run, exact accepted revision and original request',()=>{
 const value=optimizationRetestProof(proof(),expected);assert.ok(Object.isFrozen(value));assert.equal(value.source_run_id,id(4));assert.equal(optimizationRetestId(id(3).toUpperCase()),id(3))
 for(const change of[{run_id:id(9)},{spec_id:id(9)},{spec_revision:5},{acceptance_request_id:id(9)},{source_run_id:id(1)},{source_sha256:'x'.repeat(64)},{feedback_id:[]},{spec_revision:'4'},{authority:true}])assert.throws(()=>optimizationRetestProof({...proof(),...change},expected))
 for(const input of[null,undefined,'',id(3)+' ',[id(3)],{toString:()=>id(3)}])assert.throws(()=>optimizationRetestId(input))
})
test('accessors and extra hidden or symbolic authority cannot enter a provenance projection',()=>{
 let reads=0;const value=proof();Object.defineProperty(value,'source_sha256',{enumerable:true,get(){reads++;return 'a'.repeat(64)}})
 assert.throws(()=>optimizationRetestProof(value,expected));assert.equal(reads,0)
 for(const extra of[Symbol('grant'),'private']){const value=proof();Object.defineProperty(value,extra,{value:true});assert.throws(()=>optimizationRetestProof(value,expected))}
 assert.throws(()=>optimizationRetestProof(Object.create(proof()),expected))
})
test('stored association reads only the original Owner-scoped append-only submit event',async()=>{
 const calls=[],run={id:id(1),agent_spec_id:id(2),checkpoint:{spec_revision:4}},owner=id(7)
 const db={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{proof:proof()}]}}}
 assert.deepEqual(await storedOptimizationRetest(db,owner,run),proof());assert.deepEqual(calls[0].args,[owner,id(1)])
 assert.match(calls[0].sql,/owner_user_id=\$1::uuid AND run_id=\$2::uuid AND action='agent\.v2_submit'/);assert.match(calls[0].sql,/LIMIT 2$/)
 assert.doesNotMatch(calls[0].sql,/INSERT|UPDATE|DELETE|set_config|COMMIT|ROLLBACK/)
 assert.equal(await storedOptimizationRetest({query:async()=>({rows:[]})},owner,run),undefined)
 for(const rows of[[{proof:proof()},{proof:proof()}],[{proof:{...proof(),run_id:id(8)}}],[{proof:null}]])await assert.rejects(storedOptimizationRetest({query:async()=>({rows})},owner,run),e=>e.code==='agent_optimization_retest_unavailable')
})
test('the actual F29 PG18 entry refuses an ordinary host before lazy database or provider work',()=>{
 const file=new URL('../services/pg-api/tests/agent-optimization-retest-pg18.test.mjs',import.meta.url)
 const result=spawnSync(process.execPath,['--test',fileURLToPath(file)],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}})
 assert.equal(result.error,undefined);assert.equal(result.status,1);assert.match(result.stdout+result.stderr,/optimization_retest_owned_database_suite_required/);assert.doesNotMatch(result.stdout+result.stderr,/does not provide an export|ERR_MODULE_NOT_FOUND|connection refused|password authentication/)
})
