// HOSTED ONLY: guarded disposable synthetic embedded PostgreSQL fixtures.
// Authoring/syntax checks are allowed locally; do not execute this file locally.
// No real/company target, listener, provider, new schema or index is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {AgentReviewHistoryRepository} from '../src/agent-review-history-repository.ts'
import {AgentOpinionRepository} from '../src/agent-opinion-repository.ts'
import {parseAgentReviewHistoryCursor} from '../src/agent-review-history-contract.ts'
import {safeAgentSpec} from '../src/contracts.ts'

const serial={concurrency:false},id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const unavailable=e=>e.status===409&&e.code==='agent_review_history_unavailable'
const notFound=e=>e.status===404&&e.code==='agent_review_history_not_found'
const scope=p=>({spec_id:p.role.id,run_id:p.runId,purpose:p.raw.purpose})
function hosted(){
  if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux'||!process.env.GITHUB_REPOSITORY||typeof process.getuid!=='function'||process.getuid()===0)throw Error('agent_review_history_hosted_disposable_sql_only')
}
async function fixture({installed=true}={}){
  hosted()
  const helpers=await import('./helpers/agent-assessment-fixture.mjs'),ledger=await import('./helpers/agent-review-ledger-fixture.mjs'),f=await helpers.agentAssessmentFixture()
  try{
    if(installed)await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    return {...f,h:helpers,l:ledger,history:new AgentReviewHistoryRepository(f.pool),opinions:new AgentOpinionRepository(f.pool)}
  }catch(error){await f.close();throw error}
}
const tables=['agent_specs','runs','model_connections','jobs','external_effects','audit_events','agent_collaboration_revisions','agent_optimization_links',
  'agent_review_requests','agent_review_inputs','agent_review_feedback_sources','agent_review_jobs','agent_review_controls','agent_review_tombstones',
  'agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs']
async function businessSnapshot(f){
  const result={}
  for(const table of tables)result[table]=(await f.db.query('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),\'[]\'::jsonb) AS rows FROM agentstudio.'+table+' r')).rows[0].rows
  return result
}
async function readOnly(f,fn){const before=await businessSnapshot(f);try{return await fn()}finally{assert.deepEqual(await businessSnapshot(f),before,'list/rejection must not insert, update or delete business, private, role/history or audit rows')}}
async function traceList(f,identity,query){
  const connect=f.pool.connect.bind(f.pool),trace=[];let clients=0
  f.pool.connect=async()=>{clients++;const db=await connect();return {release:()=>db.release(),async query(sql,values=[]){
    assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+agentstudio\.(?:agent_review_inputs|agent_assessment_\w+)\b|agent_opinion_(?:anchor|body)\s*\(|\bFOR\s+(?:UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)\b|pg_advisory_xact_lock\([^;]*,(?:540|561|562)\)/i)
    assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|MERGE)\b/i)
    const result=await db.query(sql,values);trace.push({sql,values,rows:result.rows.length});return result
  }}}
  try{return {value:await readOnly(f,()=>f.history.list(identity,query)),trace,clients}}
  finally{f.pool.connect=connect}
}
async function pending(f,options={}){return f.h.assessmentRequest(f,options)}
async function completed(f){
  const p=await pending(f),lease=await f.h.assessmentClaim(f),proof=f.h.assessmentProof(lease)
  assert.equal(proof.request_id,p.raw.request_id)
  await f.h.assessmentReserve(f,proof);await f.h.assessmentFinish(f,proof,{status:'succeeded',result:f.h.assessmentEvaluation()})
  return p
}
const privateFields=/"(?:owner_user_id|owner|choice|recorded|replayed|available|result|execution|outcome|messages|input|model_binding|proof|worker|lease|feedback_sources)"|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback|api_key/

test('Native and closed input are checked before connection, including malformed cursor',serial,async()=>{
  hosted();let clients=0
  const repo=new AgentReviewHistoryRepository({async connect(){clients++;throw Error('invalid_history_reached_sql')}}),identity={issuer:'urn:agentstudio:local:v1',subject:'synthetic'}
  for(const invalid of [null,{}, {...identity,issuer:'https://foreign.invalid'}])await assert.rejects(repo.list(invalid,{spec_id:id(1),run_id:id(2),purpose:'evaluate'}),e=>e.status===403)
  for(const query of [{},{spec_id:id(1),run_id:id(2),purpose:'evaluate',owner_user_id:id(3)},{spec_id:id(1),run_id:id(2),purpose:'evaluate',limit:'20'},{spec_id:id(1),run_id:id(2),purpose:'evaluate',before:'v1.invalid'}])await assert.rejects(repo.list(identity,query),e=>e.status===400)
  assert.equal(clients,0)
})
test('real bounded21 candidate SQL and microsecond+UUID keyset cross a20-row page without duplicates or omitted ties; plan evidence is measured, not inferred',serial,async t=>{
  const f=await fixture()
  try{
    const s=await f.l.reviewLedgerSource(f),prepared=await f.l.reviewLedgerSubmission(f,s,'evaluate'),requests=[]
    for(let i=0;i<24;i++){
      const raw={...prepared.raw,request_id:id(100+i)},receipt=await f.ledger.submit(s.identity,raw)
      // Synthetic admin fixture establishes deterministic sub-millisecond ties;
      // runtime API has no UPDATE permission on these immutable receipts.
      const stamp='2026-10-27T01:02:03.123'+String(100+Math.floor(i/2)).padStart(3,'0')+'Z'
      await f.db.query('UPDATE agentstudio.agent_review_requests SET created_at=$1::timestamptz WHERE owner_user_id=$2 AND request_id=$3',[stamp,s.owner,raw.request_id])
      requests.push({...receipt,stamp})
    }
    const query={spec_id:s.role.id,run_id:s.runId,purpose:'evaluate'},expected=(await f.db.query("SELECT request_id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stamp FROM agentstudio.agent_review_requests WHERE owner_user_id=$1 AND spec_id=$2 AND run_id=$3 AND purpose='evaluate' ORDER BY created_at DESC,request_id DESC",[s.owner,s.role.id,s.runId])).rows
    const first=await traceList(f,s.identity,query),page=first.value
    assert.equal(first.clients,1);assert.equal(first.trace[0].sql,'BEGIN');assert.equal(first.trace.at(-1).sql,'COMMIT')
    assert.equal(page.items.length,20);assert.equal(page.has_more,true);assert.deepEqual(page.items.map(v=>v.request.request_id),expected.slice(0,20).map(v=>v.request_id))
    assert.deepEqual(parseAgentReviewHistoryCursor(page.next_cursor),{created_at:expected[19].stamp,request_id:expected[19].request_id})
    assert.ok(page.items.every(v=>v.request.created_at==='2026-10-27T01:02:03.123Z'));assert.doesNotMatch(JSON.stringify(page),privateFields)
    const sql=first.trace.filter(q=>/FROM agentstudio\.agent_review_requests r/.test(q.sql));assert.equal(sql.length,1);assert.equal(sql[0].rows,21);assert.deepEqual(sql[0].values,[s.owner,s.role.id,s.runId,'evaluate',21])
    assert.match(sql[0].sql,/ORDER BY r\.created_at DESC,r\.request_id DESC LIMIT \$5::integer/);assert.doesNotMatch(sql[0].sql,/COUNT\(|OFFSET|owner_epoch\s*=/i)
    const second=await traceList(f,s.identity,{...query,before:page.next_cursor}),old=second.value
    assert.equal(old.has_more,false);assert.equal(old.next_cursor,null);assert.equal(old.items.length,4)
    assert.deepEqual([...page.items,...old.items].map(v=>v.request.request_id),expected.map(v=>v.request_id))
    const secondSql=second.trace.find(q=>/FROM agentstudio\.agent_review_requests r/.test(q.sql));assert.match(secondSql.sql,/\(r.created_at,r.request_id\)<\(\$5::timestamptz,\$6::uuid\)/)
    assert.deepEqual(secondSql.values,[s.owner,s.role.id,s.runId,'evaluate',expected[19].stamp,expected[19].request_id,21])
    const explained=(await f.db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql[0].sql,sql[0].values)).rows[0]['QUERY PLAN']
    const root=explained[0].Plan
    assert.equal(root['Node Type'],'Limit');assert.equal(root['Actual Rows'],21)
    t.diagnostic('history_synthetic24_explain='+JSON.stringify(explained))
    t.diagnostic('No additional index is installed; LIMIT bounds candidates returned, not company-size scan/sort cost. Hosted realPG18 plans remain parent evidence.')
    // The real21st row is outside the returned20. It must still be validated.
    const lookahead=expected[20].request_id
    await f.db.query('UPDATE agentstudio.agent_review_jobs SET state=\'erased\' WHERE owner_user_id=$1 AND request_id=$2',[s.owner,lookahead])
    await assert.rejects(readOnly(f,()=>f.history.list(s.identity,query)),unavailable)
    await f.db.query('UPDATE agentstudio.agent_review_jobs SET state=\'pending\' WHERE owner_user_id=$1 AND request_id=$2',[s.owner,lookahead])
    assert.equal((await f.history.list(s.identity,query)).items.length,20)
  }finally{await f.close()}
})
test('actual active actor/spec/run/purpose isolate same request UUID across owners; foreign and unknown targets share404',serial,async()=>{
  const f=await fixture()
  try{
    const requestId=randomUUID(),alice=await pending(f,{requestId}),bob=await pending(f,{requestId,who:'bob'})
    const a=(await traceList(f,alice.identity,scope(alice))).value,b=(await traceList(f,bob.identity,scope(bob))).value
    assert.equal(a.items[0].request.request_id,requestId);assert.equal(b.items[0].request.request_id,requestId);assert.notEqual(a.items[0].request.input_sha256,b.items[0].request.input_sha256)
    for(const query of [scope(alice),{...scope(bob),run_id:randomUUID()},{...scope(bob),spec_id:alice.role.id}])await assert.rejects(readOnly(f,()=>f.history.list(bob.identity,query)),notFound)
    assert.deepEqual((await f.history.list(alice.identity,{...scope(alice),purpose:'optimize'})).items,[])
    const other=await pending(f);assert.deepEqual((await f.history.list(alice.identity,scope(alice))).items.map(v=>v.request.request_id),[requestId]);assert.notEqual(other.runId,alice.runId)
    await f.db.query('UPDATE agentstudio_auth.accounts SET enabled=false WHERE user_id=$1',[alice.owner])
    await assert.rejects(readOnly(f,()=>f.history.list(alice.identity,scope(alice))),e=>e.status===403)
  }finally{await f.close()}
})
test('source/model/epoch invalidation does not hide immutable metadata; closed admission still permits exact original cancel/erase and058 keeps zero/outcome truth',serial,async()=>{
  const f=await fixture()
  try{
    const p=await completed(f),current=await f.opinions.getCurrent(p.identity,p.raw.request_id)
    assert.equal(current.available,true);assert.equal(current.result.score,0)
    const first=(await traceList(f,p.identity,scope(p))).value.items[0],metadata=structuredClone(first.request)
    await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[p.choice.model_binding.connection_id])
    await assert.rejects(f.opinions.getCurrent(p.identity,p.raw.request_id),e=>e.status===409&&e.code==='agent_opinion_source_unavailable')
    assert.deepEqual((await traceList(f,p.identity,scope(p))).value.items[0].request,metadata)
    const role=await f.agents.get(p.identity,p.role.id),{require_approval:_,...spec}=role.spec
    await f.agents.update(p.identity,role.id,role.name,safeAgentSpec({...spec,goal:'Synthetic current role changed after review'}),role.revision)
    assert.deepEqual((await traceList(f,p.identity,scope(p))).value.items[0].request,metadata)
    await f.h.assessmentCancel(f,p)
    assert.deepEqual((await traceList(f,p.identity,scope(p))).value.items[0],{request:metadata,control:{job_state:'cancelled',body_erased:false}})
    await f.h.assessmentErase(f,p)
    assert.deepEqual((await traceList(f,p.identity,scope(p))).value.items[0],{request:metadata,control:{job_state:'erased',body_erased:true}})
    const erased=await f.opinions.getCurrent(p.identity,p.raw.request_id)
    assert.equal(erased.available,false);assert.equal(erased.result,null);assert.deepEqual(erased.execution.outcome,current.execution.outcome)
    assert.equal((await f.closed.submit(p.identity,p.raw)).body_erased,true);assert.equal((await f.closed.confirm(p.identity,p.raw)).body_erased,true)
    const rows=await f.h.assessmentRows(f,p.raw.request_id,p.owner);assert.equal(rows.outputs.length,0);assert.equal(rows.outcomes.length,1)
    await f.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
    assert.deepEqual((await traceList(f,p.identity,scope(p))).value.items[0].request,metadata,'old owner_epoch remains a historical fact after current epoch changes')
  }finally{await f.close()}
})
test('missing jobs, contradictory tombstones and corrupted immutable metadata fail409 instead of silently disappearing',serial,async()=>{
  const f=await fixture()
  try{
    const p=await pending(f),query=scope(p)
    await f.db.query('DELETE FROM agentstudio.agent_review_jobs WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])
    await assert.rejects(readOnly(f,()=>f.history.list(p.identity,query)),unavailable)
    await f.db.query("INSERT INTO agentstudio.agent_review_jobs(owner_user_id,request_id,state) VALUES($1,$2,'pending')",[p.owner,p.raw.request_id])
    await f.db.query("INSERT INTO agentstudio.agent_review_tombstones(owner_user_id,request_id,reason) VALUES($1,$2,'synthetic_contradiction')",[p.owner,p.raw.request_id])
    await assert.rejects(readOnly(f,()=>f.history.list(p.identity,query)),unavailable)
    await f.db.query('DELETE FROM agentstudio.agent_review_tombstones WHERE owner_user_id=$1 AND request_id=$2',[p.owner,p.raw.request_id])
    for(const [column,bad,good] of [['input_sha256','not_a_digest',p.receipt.input_sha256],['source_protocol','other',p.receipt.source_protocol],['owner_epoch','0',String(p.receipt.owner_epoch)]]){
      await f.db.query('UPDATE agentstudio.agent_review_requests SET '+column+'=$1 WHERE owner_user_id=$2 AND request_id=$3',[bad,p.owner,p.raw.request_id])
      try{await assert.rejects(readOnly(f,()=>f.history.list(p.identity,query)),unavailable)}finally{await f.db.query('UPDATE agentstudio.agent_review_requests SET '+column+'=$1 WHERE owner_user_id=$2 AND request_id=$3',[good,p.owner,p.raw.request_id])}
    }
  }finally{await f.close()}
})
test('complete058 audit is mandatory, exact056 index inventory is retained, and failed COMMIT publishes nothing',serial,async()=>{
  const f=await fixture({installed:false})
  try{
    const p=await pending(f),query=scope(p)
    await assert.rejects(readOnly(f,()=>f.history.list(p.identity,query)),unavailable)
    await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    await f.db.exec('REVOKE EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) FROM agentstudio_api')
    try{await assert.rejects(readOnly(f,()=>f.history.list(p.identity,query)),/unsafe_agent_opinion_privileges/)}finally{await f.db.exec('GRANT EXECUTE ON FUNCTION agentstudio.agent_opinion_body(uuid,text,text) TO agentstudio_api')}
    const indexes=(await f.db.query("SELECT t.relname AS table_name,i.relname AS index_name FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class t ON t.oid=x.indrelid JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='agentstudio' AND left(t.relname,13)='agent_review_' ORDER BY t.relname,i.relname")).rows
    assert.equal(indexes.length,6)
    for(const row of indexes)assert.equal(row.index_name,row.table_name+'_pkey','unchanged exact056 PK inventory; no history index/prefix bypass')
    const connect=f.pool.connect.bind(f.pool);let finish,releaseGate
    const reached=new Promise(resolve=>{finish=resolve}),gate=new Promise(resolve=>{releaseGate=resolve});let published=false,pendingRead
    f.pool.connect=async()=>{const db=await connect();return {release:()=>db.release(),async query(sql,args=[]){if(sql==='COMMIT'){finish();await gate}return db.query(sql,args)}}}
    try{
      pendingRead=f.history.list(p.identity,query);pendingRead.then(()=>{published=true},()=>{})
      await Promise.race([reached,pendingRead.then(()=>{throw Error('history_escaped_before_commit')})]);assert.equal(published,false)
      releaseGate();assert.equal((await pendingRead).items[0].request.request_id,p.raw.request_id)
    }finally{releaseGate();await pendingRead?.catch(()=>{});f.pool.connect=connect}
    f.setFault(sql=>{if(sql==='COMMIT')throw Error('synthetic_history_commit_failure')})
    try{await assert.rejects(readOnly(f,()=>f.history.list(p.identity,query)),/synthetic_history_commit_failure/)}finally{f.setFault(undefined)}
    assert.equal((await traceList(f,p.identity,query)).value.items.length,1)
  }finally{f.setFault(undefined);await f.close()}
})
