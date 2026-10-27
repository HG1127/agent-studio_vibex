// Pure catalog-result doubles only. No database, SQL engine or network runs.
import test from 'node:test'
import assert from 'node:assert/strict'
import {assertAgentAssessmentSession} from '../src/agent-assessment-role.ts'
import {AgentAssessmentWorker} from '../src/agent-assessment-worker.ts'
import {AgentAssessmentBroker} from '../src/agent-assessment-broker.ts'
import {agentAssessmentApproval} from '../src/agent-assessment-contract.ts'
const worker='agentstudio_review_worker',dispatch='agentstudio_review_dispatch'
const safeLogin={login:true,inherit:false,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false,initial_role:true}
const safeGrant=role=>({name:role,admin:false,inherit:false,set:true})
const refused={message:'agent_assessment_session_role_refused'}
function catalog(role=worker,{login=safeLogin,reachable=[{name:role}],direct=[safeGrant(role)],loginRows}={}){
  const calls=[]
  return {calls,async query(sql){calls.push(sql);assert.doesNotMatch(sql,/SET\s+(?:LOCAL\s+)?ROLE/i);if(sql.includes('rolcanlogin AS login'))return {rows:loginRows??[login]};if(sql.includes('pg_has_role'))return {rows:reachable};if(sql.includes('pg_auth_members'))return {rows:direct};throw Error('unexpected mock catalog query')}}
}
test('session guard accepts only the exact dedicated worker or dispatch login topology without naming a login',async()=>{
  for(const role of [worker,dispatch]){const db=catalog(role);await assertAgentAssessmentSession(db,role);assert.equal(db.calls.length,3);assert.match(db.calls[0],/rolname=session_user/);assert.match(db.calls[1],/pg_has_role\(session_user,r\.oid,'MEMBER'\)/);assert.match(db.calls[2],/member\.rolname=session_user/);assert.doesNotMatch(db.calls.join('\n'),/synthetic_assessment|agentstudio_worker_login/)}
})
test('unsafe session attributes are rejected before any role switch or membership query',async()=>{
  for(const patch of [{superuser:true},{bypassrls:true},{inherit:true},{createdb:true},{createrole:true},{replication:true},{login:false},{initial_role:false},{superuser:null},{login:'true'},{inherit:undefined}]){const db=catalog(worker,{login:{...safeLogin,...patch}});await assert.rejects(assertAgentAssessmentSession(db,worker),refused);assert.equal(db.calls.length,1)}
  for(const loginRows of [[],[safeLogin,safeLogin]])await assert.rejects(assertAgentAssessmentSession(catalog(worker,{loginRows}),worker),refused)
})
test('extra direct or transitive membership, wrong group and missing membership fail closed',async()=>{
  for(const reachable of [[],[{name:dispatch}],[{name:worker},{name:dispatch}],[{name:worker},{name:'pg_read_all_data'}],[{name:worker},{name:'indirect_super_group'}],[{name:worker},{name:worker}]]){const db=catalog(worker,{reachable});await assert.rejects(assertAgentAssessmentSession(db,worker),refused);assert.equal(db.calls.length,2)}
  await assert.rejects(assertAgentAssessmentSession(catalog(dispatch),worker),refused)
})
test('only one exact non-admin non-inheritable SET-capable direct grant is accepted',async()=>{
  for(const direct of [[],[safeGrant(dispatch)],[safeGrant(worker),safeGrant(worker)],[safeGrant(worker),safeGrant(dispatch)],...[{admin:true},{inherit:true},{set:false},{admin:null},{inherit:undefined},{set:'true'}].map(patch=>[{...safeGrant(worker),...patch}])]){const db=catalog(worker,{direct});await assert.rejects(assertAgentAssessmentSession(db,worker),refused);assert.equal(db.calls.length,3)}
})
test('arbitrary requested role names cannot trigger a catalog query or dynamic SET ROLE',async()=>{
  for(const role of ['agentstudio_api','agentstudio_model_broker','worker','dispatch',null,{},'agentstudio_review_worker; RESET ROLE']){let calls=0;await assert.rejects(assertAgentAssessmentSession({async query(){calls++;throw Error()}},role),refused);assert.equal(calls,0)}
})
const active={executionEnabled:true,executionApproval:agentAssessmentApproval}
const proof={request_id:'abcdef01-abcd-4abc-8def-123456789abc',lease_token:'fedcba01-fedc-4fed-8cba-abcdef012345',lease_version:1,worker_id:'11111111-1111-4111-8111-111111111111'}
function unsafePool(patch={superuser:true},reachable){
  const calls=[];let released=0
  const db={async query(sql){calls.push(sql);if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};if(sql.includes('rolcanlogin AS login'))return {rows:[{...safeLogin,...patch}]};if(sql.includes('pg_has_role'))return {rows:reachable??[{name:worker},{name:dispatch}]};throw Error('forbidden role switch/schema audit/effect call')},release(){released++}}
  return {calls,get released(){return released},async connect(){return db}}
}
test('real Worker transaction rejects an unsafe authenticated login before SET ROLE, then rolls back and releases',async()=>{
  for(const pool of [unsafePool(),unsafePool({inherit:true}),unsafePool({},[{name:worker},{name:dispatch}])]){let sent=0;const runtime=new AgentAssessmentWorker(pool,proof.worker_id,async()=>{sent++;throw Error()},active);await assert.rejects(runtime.tick(),refused);assert.equal(sent,0);assert.equal(pool.calls[0],'BEGIN');assert.equal(pool.calls.at(-1),'ROLLBACK');assert.ok(!pool.calls.some(sql=>/SET LOCAL ROLE|agent_assessment_claim|pg_class/.test(sql)));assert.equal(pool.released,1)}
})
test('real Broker dispatch transaction rejects unsafe/cross-group sessions before business source, key load or provider use',async()=>{
  for(const pool of [unsafePool(),unsafePool({bypassrls:true}),unsafePool({},[{name:worker},{name:dispatch}])]){let sensitive=0;const business={async connect(){sensitive++;throw Error()}},secret={async connect(){sensitive++;throw Error()}},broker=new AgentAssessmentBroker(business,pool,secret,Buffer.alloc(32),{...active,executor:async()=>{sensitive++;throw Error()}});await assert.rejects(broker.dispatch(proof),refused);assert.equal(sensitive,0);assert.equal(pool.calls[0],'BEGIN');assert.equal(pool.calls.at(-1),'ROLLBACK');assert.ok(!pool.calls.some(sql=>/SET LOCAL ROLE|agent_assessment_context|pg_class/.test(sql)));assert.equal(pool.released,1)}
})
