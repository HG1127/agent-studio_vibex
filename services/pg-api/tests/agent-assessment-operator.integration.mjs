// Dedicated fresh GitHub-only PG18 service. This tests the exported readonly
// pool inspector with an explicit CI target; it does not start the service,
// select the production config, load credential mounts, listen or call models.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireEphemeralPg18Ci} from '../src/pg18-ephemeral-ci-guard.mjs'
import {inspectAgentAssessmentOperatorPool} from '../src/agent-assessment-service.ts'
import {agentAssessmentTcpFixture,assessmentRequest,assessmentCounts} from './helpers/agent-assessment-fixture.mjs'

const workerLogin='synthetic_assessment_worker',dispatchLogin='synthetic_assessment_dispatch'
const groupFor=kind=>kind==='worker'?'agentstudio_review_worker':'agentstudio_review_dispatch'

async function snapshot(f){
  const execution=await assessmentCounts(f)
  const admission=(await f.db.query(`SELECT
    (SELECT count(*)::integer FROM agentstudio.agent_review_requests) AS requests,
    (SELECT count(*)::integer FROM agentstudio.agent_review_feedback_sources) AS sources,
    (SELECT count(*)::integer FROM agentstudio.agent_review_jobs) AS jobs,
    (SELECT count(*)::integer FROM agentstudio.agent_review_controls) AS controls`)).rows[0]
  return {execution,admission}
}
async function cleanSession(pool,login){
  const db=await pool.connect()
  try{
    const row=(await db.query(`SELECT session_user AS login,current_user AS role,rolcanlogin AS can_login,
      rolinherit AS inherit,rolsuper AS superuser,rolbypassrls AS bypass,rolcreatedb AS createdb,
      rolcreaterole AS createrole,rolreplication AS replication FROM pg_catalog.pg_roles WHERE rolname=session_user`)).rows[0]
    assert.deepEqual(row,{login,role:login,can_login:true,inherit:false,superuser:false,bypass:false,createdb:false,createrole:false,replication:false})
    assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'off','fixture pool has no leaked read-only transaction after inspection')
  }finally{db.release()}
}
function observe(pool,login,kind,traces){
  return {async connect(){
    const db=await pool.connect(),trace={queries:[],readonlyChecks:0,roleChecks:0,released:false}
    traces.push(trace)
    return {async query(sql,args=[]){
      trace.queries.push(sql)
      // Every application query executes unchanged on the real authenticated
      // pg connection. Observer queries only inspect actual session settings.
      const result=await db.query(sql,args)
      if(sql==='BEGIN READ ONLY'){
        assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on')
        trace.readonlyChecks++
      }
      if(sql==='SET LOCAL ROLE '+groupFor(kind)){
        const state=(await db.query("SELECT session_user AS login,current_user AS role,current_setting('transaction_read_only') AS readonly")).rows[0]
        assert.deepEqual(state,{login,role:groupFor(kind),readonly:'on'})
        trace.roleChecks++
      }
      return result
    },release(){trace.released=true;db.release()}}
  }}
}
function readonlyTrace(traces,{success}){
  assert.ok(traces.length>=2,'server target probe and readonly audit use real borrowed sessions')
  assert.ok(traces.every(t=>t.released),'every success/refusal releases its sessions')
  const audits=traces.filter(t=>t.queries.includes('BEGIN READ ONLY'))
  assert.equal(audits.length,1);assert.equal(audits[0].readonlyChecks,1)
  assert.equal(audits[0].queries.at(-1),'ROLLBACK','audit transaction always rolls back')
  if(success)assert.equal(audits[0].roleChecks,1)
  for(const {queries} of traces)for(const sql of queries){
    assert.match(sql,/^\s*(?:SELECT\b|WITH\b|BEGIN READ ONLY$|SET LOCAL\b|ROLLBACK$)/i,'inspector requests only readonly SQL/control statements')
    assert.doesNotMatch(sql,/\bSELECT\s+agentstudio\.agent_assessment_(?:claim|context|reserve|finish|pause)\s*\(/i,'preflight must never execute work routines')
    assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+agentstudio(?:_auth)?\.(?!schema_migrations\b)[a-z_]+/i,'preflight must not select employee/input/model-secret rows')
  }
}

test('PG18 CI: exported operator pool inspector verifies real readonly dedicated sessions and full057/056 without claiming; bad session/target/schema refuse', {concurrency:false,timeout:180000},async t=>{
  // First effectful boundary: exact existing GitHub CI attestation, before
  // fixture Pool/SQL creation. No local/nonexact target or silent skip.
  const ci=requireEphemeralPg18Ci(process.env)
  const f=await agentAssessmentTcpFixture()
  // This caller-supplied CI parameter is intentionally NOT service config.
  // Production agentAssessmentServiceConfig remains fixed to baota5333 and
  // agent_studio. The inspector itself accepts an exact CI target/PG major.
  const targetFor=login=>({mode:'pg17_stage',host:ci.host,port:ci.port,database:ci.database,user:login,expectedMajor:18})
  try{
    await assessmentRequest(f,{purpose:'evaluate'})
    const initial=await snapshot(f)
    assert.equal(initial.execution.leases,0);assert.equal(initial.execution.effects,0)
    assert.equal(initial.execution.inputs,1);assert.equal(initial.admission.jobs,1,'pending work must exist so an accidental claim cannot pass unnoticed')
    await t.test('real worker and dispatch sessions pass full readonly inspection with no durable state change',async()=>{
      for(const [pool,login,kind] of [[f.workerPool,workerLogin,'worker'],[f.dispatchPool,dispatchLogin,'dispatch']]){
        await cleanSession(pool,login)
        const before=await snapshot(f),traces=[]
        assert.equal(await inspectAgentAssessmentOperatorPool(observe(pool,login,kind,traces),targetFor(login),kind),undefined)
        readonlyTrace(traces,{success:true})
        assert.deepEqual(await snapshot(f),before)
        await cleanSession(pool,login)
      }
    })
    await t.test('correctly authenticated API/secret/opposite review logins cannot masquerade as the requested review kind',async()=>{
      for(const [pool,login,kind] of [
        [f.pool,'synthetic_assessment_api','worker'],
        [f.secretPool,'synthetic_assessment_secret','dispatch'],
        [f.dispatchPool,dispatchLogin,'worker'],
        [f.workerPool,workerLogin,'dispatch']
      ]){
        const before=await snapshot(f),traces=[]
        await assert.rejects(inspectAgentAssessmentOperatorPool(observe(pool,login,kind,traces),targetFor(login),kind),/agent_assessment_session_role_refused/)
        readonlyTrace(traces,{success:false})
        assert.deepEqual(await snapshot(f),before)
        await cleanSession(pool,login)
      }
    })
    await t.test('actual server database/login/port/major mismatches reject before auditing or changing work',async()=>{
      const target=targetFor(workerLogin)
      for(const patch of [{database:ci.database+'_wrong'},{user:dispatchLogin},{port:ci.port+1},{expectedMajor:17}]){
        const before=await snapshot(f),traces=[]
        await assert.rejects(inspectAgentAssessmentOperatorPool(observe(f.workerPool,workerLogin,'worker',traces),{...target,...patch},'worker'),/pg_runtime_target_mismatch/)
        assert.ok(traces.every(v=>v.released));assert.equal(traces.flatMap(v=>v.queries).includes('BEGIN READ ONLY'),false)
        assert.deepEqual(await snapshot(f),before)
        await cleanSession(f.workerPool,workerLogin)
      }
    })
    await t.test('committed fixture-only schema/ACL tampering is visible to independent readonly sessions and strict audit recovers after restoration',async()=>{
      for(const [label,mutate,restore] of [
        ['output FORCE RLS','ALTER TABLE agentstudio.agent_assessment_outputs NO FORCE ROW LEVEL SECURITY','ALTER TABLE agentstudio.agent_assessment_outputs FORCE ROW LEVEL SECURITY'],
        ['API claim EXECUTE','GRANT EXECUTE ON FUNCTION agentstudio.agent_assessment_claim(uuid) TO agentstudio_api','REVOKE EXECUTE ON FUNCTION agentstudio.agent_assessment_claim(uuid) FROM agentstudio_api']
      ]){
        const before=await snapshot(f)
        // The admin fixture mutation must COMMIT: an uncommitted change would
        // be invisible to the separate real service-login inspection session.
        await f.db.exec(mutate)
        try{
          const traces=[]
          await assert.rejects(inspectAgentAssessmentOperatorPool(observe(f.dispatchPool,dispatchLogin,'dispatch',traces),targetFor(dispatchLogin),'dispatch'),/unsafe_agent_assessment_privileges/,label)
          readonlyTrace(traces,{success:true})
          assert.deepEqual(await snapshot(f),before)
        }finally{await f.db.exec(restore)}
        for(const [pool,login,kind] of [[f.workerPool,workerLogin,'worker'],[f.dispatchPool,dispatchLogin,'dispatch']]){
          const traces=[]
          await inspectAgentAssessmentOperatorPool(observe(pool,login,kind,traces),targetFor(login),kind)
          readonlyTrace(traces,{success:true});await cleanSession(pool,login)
        }
        assert.deepEqual(await snapshot(f),before)
      }
    })
    assert.deepEqual(await snapshot(f),initial,'the exported readonly inspector never claims, reserves, finishes, erases, emits audit rows or changes056/057 metadata')
  }finally{await f.close()}
})
