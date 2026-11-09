import test from 'node:test'
import assert from 'node:assert/strict'
import {complete069ExecutorPlan,parseComplete069ExecutorArguments,complete069ExecutorActivationSql,complete069ExecutorRefusal} from '../src/pg18-complete-executor-plan.mjs'
import {checkedComplete069ExecutorIntent} from '../src/pg18-complete-executor-journal.mjs'
import {runComplete069Executor} from '../src/pg18-complete-executor-cli.mjs'
const operationId='22222222-2222-4222-8222-222222222222',reviewOperationId='11111111-1111-4111-8111-111111111111',sourceSha256='a'.repeat(64),target={system_identifier:'123',database_oid:'456'}
const args=()=>['--prepare','--profile','complete069','--confirm-database','agent_studio','--expected-source-sha256',sourceSha256,'--expected-system-identifier','123','--expected-database-oid','456','--review-operation-id',reviewOperationId,'--operation-id',operationId]
const cfg=()=>parseComplete069ExecutorArguments(args())
const intent=()=>({format:'complete069_executor_operation_v1',profile:'complete069',database:'agent_studio',operator:'postgres',login:'agentstudio_local_executor_login',group:'agentstudio_local_executor',baseline_catalog_sha256:'b'.repeat(64),ledger_sha256:'c'.repeat(64),business_image_sha256:'d'.repeat(64),review_operation_id:reviewOperationId,review_intent_sha256:'e'.repeat(64),operation_id:operationId,source_sha256:sourceSha256,target,verifier_sha256:'f'.repeat(64),started_at:'2026-10-30T00:00:00.000Z'})
test('new offline plan imports without credentials or PG and retains the separate original operator ABI',async()=>{
 const p=await runComplete069Executor(['--plan'],Object.freeze({}));assert.deepEqual(p,complete069ExecutorPlan());assert.equal(p.abi.login,'agentstudio_local_executor_login');assert.equal(p.connection_limit,3);assert.equal(p.new_group_count,0)
 for(const key of ['credentials_read','network_used','writes_performed','services_started','runtime_authorization','production_cutover_allowed'])assert.equal(p[key],false)
})
test('ordered full069 arguments bind distinct Review and Executor operations and the physical target',()=>{
 assert.equal(cfg().reviewOperationId,reviewOperationId);assert.equal(cfg().operationId,operationId)
 for(const [i,value]of [[2,'050'],[4,'agentstudio_pg18_ci'],[6,'0'],[8,'0'],[10,'-1'],[12,operationId],[14,reviewOperationId],[11,'--skip-review']]){const a=args();a[i]=value;assert.throws(()=>parseComplete069ExecutorArguments(a),/arguments_refused/)}
 for(const a of [[],[...args(),'--retry'],args().slice(0,-2),['--inspect-operation',...args().slice(1,11)]])assert.throws(()=>parseComplete069ExecutorArguments(a),/arguments_refused/)
 assert.equal(parseComplete069ExecutorArguments(['--inspect-operation',...args().slice(1)]).mode,'inspect-operation')
})
test('only canonical independently generated SCRAM activates the one fixed login',()=>{
 const verifier='SCRAM-SHA-256$15000:'+Buffer.alloc(16,1).toString('base64')+'$'+Buffer.alloc(32,2).toString('base64')+':'+Buffer.alloc(32,3).toString('base64')
 assert.match(complete069ExecutorActivationSql(verifier),/^ALTER ROLE agentstudio_local_executor_login LOGIN PASSWORD 'SCRAM-SHA-256\$/)
 for(const bad of [verifier.replace('15000','4096'),verifier+"'; GRANT postgres TO agentstudio_local_executor_login;--",verifier.replace(/=$/,''),'plain-password',null])assert.throws(()=>complete069ExecutorActivationSql(bad),/verifier_refused/)
})
test('external intent cannot be repointed, retagged or detach its prior Review operation and catalog/table state',()=>{
 assert.equal(checkedComplete069ExecutorIntent(intent(),cfg()).format,'complete069_executor_operation_v1')
 const changes={format:'complete069_review_worker_operation_v1',login:'agentstudio_stage_worker',group:'agentstudio_api',profile:'050',database:'other',operator:'other',source_sha256:'0'.repeat(64),operation_id:reviewOperationId,review_operation_id:operationId,review_intent_sha256:'bad',ledger_sha256:'bad',business_image_sha256:'bad',baseline_catalog_sha256:'bad',target:{...target,database_oid:'789'},started_at:'2026-02-30T00:00:00.000Z'}
 for(const[k,v]of Object.entries(changes))assert.throws(()=>checkedComplete069ExecutorIntent({...intent(),[k]:v},cfg()),/private_record_required/)
 assert.throws(()=>checkedComplete069ExecutorIntent({...intent(),automatic_retry_authorized:true},cfg()),/private_record_required/)
 for(const k of ['review_operation_id','review_intent_sha256','ledger_sha256','business_image_sha256']){const v=intent();delete v[k];assert.throws(()=>checkedComplete069ExecutorIntent(v,cfg()),/private_record_required/)}
})
test('refusals expose only a fixed code, SQLSTATE or predecessor category',()=>{
 assert.equal(complete069ExecutorRefusal(Error('password=private sql body')),'complete069_executor_operation_refused')
 assert.equal(complete069ExecutorRefusal(Object.assign(Error('private'),{code:'42501'})),'complete069_executor_sqlstate_42501')
 assert.equal(complete069ExecutorRefusal(Object.defineProperty({},'message',{get(){throw Error('must not invoke')}})),'complete069_executor_operation_refused')
 assert.equal(complete069ExecutorRefusal(Error('complete069_review_worker_baseline_catalog_changed')),'complete069_executor_review_predecessor_refused')
})
