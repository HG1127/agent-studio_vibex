// Genuine independent PG18 sessions, disposable exact-target GitHub CI only.
// The existing fixture guard runs before pools/SQL. No listener/provider call,
// local skip, ambient DATABASE_URL or weaker fallback target is supplied.
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import pg from 'pg'
import {agentAssessmentTcpFixture,assessmentRequest,assessmentProof,assessmentRows,assessmentCounts,assessmentOutputHash,assessmentEvaluation,assessmentOptimization,
  assessmentErase} from './helpers/agent-assessment-fixture.mjs'
import {reviewLedgerCounts,reviewLedgerFeedbackErase,reviewLedgerRow} from './helpers/agent-review-ledger-fixture.mjs'
import {requireEphemeralPg18Ci} from '../src/pg18-ephemeral-ci-guard.mjs'
import {AgentOpinionRepository} from '../src/agent-opinion-repository.ts'
import {AgentReviewHistoryRepository} from '../src/agent-review-history-repository.ts'
import {AgentReviewLedgerRepository} from '../src/agent-review-ledger.ts'
import {AgentFeedbackRepository} from '../src/agent-feedback-repository.ts'
import {verifyAgentOpinionCredentials,inspectAgentOpinionSchema} from '../src/agent-opinion-audit.ts'
import {canonicalMcpJson} from '../src/mcp-catalog.ts'
import {agentDescriptiveLimits as limits} from '../../../shared/agent-role-limits.mjs'

const anchorSql=/^SELECT agentstudio\.agent_opinion_anchor\(/
const bodySql=/^SELECT agentstudio\.agent_opinion_body\(/
const sourceLockSql=/^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1::text,540\)\)/
const epochSql=/^SELECT agentstudio\.agent_memory_outcome_epoch\(\) AS epoch$/
const privateFields=/"choice"|"messages"|"identity"|"owner_user_id"|"model_binding"|"lease_token"|"worker_id"|api_key|syntheticReviewLedgerTask|syntheticReviewLedgerFeedback/
const unavailable=error=>error.status===409&&error.code==='agent_opinion_source_unavailable'&&error.message===error.code
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
async function bounded(promise,label,ms=7000){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('opinion_pg18_timeout_'+label)),ms)})])}finally{clearTimeout(timer)}}
function observe(promise){const state={done:false};state.promise=promise.then(value=>{state.done=true;return {ok:true,value}},error=>{state.done=true;return {ok:false,error}});return state}
async function success(state,label){const reply=await bounded(state.promise,label);if(!reply.ok)throw reply.error;return reply.value}
async function failure(state,predicate,label){const reply=await bounded(state.promise,label);assert.equal(reply.ok,false,label+' must refuse');assert.ok(predicate(reply.error),label+' must use the exact closed error');return reply.error}

// Trace a real, independently authenticated API connection. Pausing AFTER a
// real query retains its actual transaction/row/advisory locks; no fake row,
// result, lock success or commit response is injected into the repository.
function tracedPool(base,{after}={}){
  const pid=deferred(),hit=deferred(),gate=deferred(),trace=[]
  let clients=0,matched=false
  return {trace,pid:pid.promise,hit:hit.promise,release:()=>gate.resolve(),pool:{knowledgeSharing:true,async connect(){
    assert.equal(++clients,1,'one operation must use one actual owner transaction')
    const client=await base.connect()
    try{pid.resolve((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)}catch(error){client.release();throw error}
    return {release:()=>client.release(),async query(sql,values=[]){
      trace.push({sql,values})
      const value=await client.query(sql,values)
      if(after?.test(sql)&&!matched){matched=true;hit.resolve(value);await gate.promise}
      return value
    }}
  }}}
}
async function reached(gate,state,label){await bounded(Promise.race([gate.hit,state.promise.then(reply=>{if(!reply.ok)throw reply.error;throw Error('opinion_missing_gate_'+label)})]),label)}
async function blocked(admin,waiter,blocker,label){
  const until=Date.now()+5000
  while(Date.now()<until){
    const row=(await admin.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_catalog.pg_stat_activity WHERE pid=$1',[waiter])).rows[0]
    if(row?.wait_event_type==='Lock'&&row.blockers.includes(blocker))return
    await delay(20)
  }
  assert.fail(label+': PostgreSQL did not report the expected actual blocking backend')
}
function noReadDml(trace){
  assert.equal(trace.some(q=>/^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP)\b/i.test(q.sql)),false)
  assert.equal(trace.some(q=>/\b(?:FROM|JOIN)\s+agentstudio\.(?:agent_review_inputs|agent_assessment_outputs)\b/i.test(q.sql)),false)
}
const snapshotTables=['agent_review_requests','agent_review_inputs','agent_review_feedback_sources','agent_review_jobs','agent_review_controls','agent_review_tombstones',
  'agent_assessment_leases','agent_assessment_effects','agent_assessment_outcomes','agent_assessment_outputs','agent_feedback_receipts','agent_feedback_bodies','agent_feedback_lessons',
  'agent_specs','agent_optimization_links','agent_collaboration_revisions','jobs','external_effects','audit_events']
async function snapshot(f){
  const pairs=snapshotTables.map(name=>"'"+name+"',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM agentstudio."+name+' r)')
  const row=(await f.db.query('SELECT jsonb_build_object('+pairs.join(',')+') AS value')).rows[0].value
  return {review:await reviewLedgerCounts(f),assessment:await assessmentCounts(f),sha256:createHash('sha256').update(canonicalMcpJson(row)).digest('hex')}
}
async function sameAfter(f,before){assert.deepEqual(await snapshot(f),before,'read must not mutate business rows, hashes, role state or audit rows')}
function sealed(value,p,available=true){
  assert.deepEqual(Object.keys(value).sort(),['protocol','request','execution','body_erased','available','result'].sort())
  assert.equal(value.protocol,'agent_paid_review_view_v1');assert.equal(value.request.request_id,p.raw.request_id)
  for(const key of ['spec_id','run_id','purpose','request_sha256','input_sha256','content_sha256','owner_epoch','source_protocol','created_at'])assert.equal(value.request[key],p.receipt[key])
  assert.equal(value.execution.lease_state,'succeeded');assert.equal(value.execution.outcome.status,'succeeded')
  assert.equal(value.execution.outcome.result_sha256,assessmentOutputHash(p,p.result));assert.equal(value.available,available)
  assert.deepEqual(value.result,available?p.result:null);assert.doesNotMatch(JSON.stringify(value),privateFields)
}
async function roleCall(pool,role,sql,args){
  assert.ok(['agentstudio_review_worker','agentstudio_review_dispatch'].includes(role))
  const db=await pool.connect();let begun=false
  try{await db.query('BEGIN');begun=true;await db.query('SET LOCAL ROLE '+role);const value=(await db.query(sql,args)).rows[0].value;await db.query('COMMIT');begun=false;return value}
  finally{if(begun)await db.query('ROLLBACK').catch(()=>{});db.release()}
}
async function completed(f,options={}){
  const p=await assessmentRequest(f,options),lease=await roleCall(f.workerPool,'agentstudio_review_worker','SELECT agentstudio.agent_assessment_claim($1::uuid) AS value',[randomUUID()])
  assert.ok(lease);assert.equal(lease.request_id,p.raw.request_id);const proof=assessmentProof(lease)
  const args=[proof.request_id,proof.lease_token,proof.lease_version,proof.worker_id],result=p.raw.purpose==='evaluate'?assessmentEvaluation():assessmentOptimization()
  if(options.fullCapacity)for(const [key,char] of [['deliverables','交'],['task_plan','计'],['done_criteria','验']])result.descriptive[key]=Array(limits.list_items).fill(char.repeat(limits.list_item))
  await roleCall(f.dispatchPool,'agentstudio_review_dispatch','SELECT agentstudio.agent_assessment_reserve($1::uuid,$2::uuid,$3::bigint,$4::uuid) AS value',args)
  const finish=await roleCall(f.dispatchPool,'agentstudio_review_dispatch','SELECT agentstudio.agent_assessment_finish($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::jsonb) AS value',[...args,JSON.stringify({status:'succeeded',result})])
  assert.equal(finish.state,'succeeded');assert.equal(finish.result_sha256,assessmentOutputHash(p,result))
  return {...p,proof,result}
}
async function current(f,p){const before=await snapshot(f),value=await new AgentOpinionRepository(f.pool).getCurrent(p.identity,p.raw.request_id);await sameAfter(f,before);return value}
async function erased(f,p,original){
  const row=await reviewLedgerRow(f,p,p.raw.request_id),rows=await assessmentRows(f,p.raw.request_id,p.owner)
  assert.equal(row.body,null);assert.equal(row.state,'erased');assert.equal(rows.outputs.length,0)
  assert.deepEqual(rows.effects,original.effects);assert.deepEqual(rows.outcomes,original.outcomes)
  const view=await current(f,p);sealed(view,p,false);assert.equal(view.body_erased,true);assert.equal(view.execution.job_state,'erased')
}
async function adminTransaction(admin){
  const db=await admin.connect()
  try{await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='8s'");return {db,pid:(await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid}}
  catch(error){await db.query('ROLLBACK').catch(()=>{});db.release();throw error}
}

test('disposable PG18 owner opinion reads: real source540/body/epoch lock ordering, both privacy winners and immutable owner isolation', {concurrency:false,timeout:180000},async t=>{
  // First exact-target gate is pure; the frozen fixture repeats it and verifies
  // an empty PG18 service before installing any predecessor or test identity.
  const target=requireEphemeralPg18Ci(),f=await agentAssessmentTcpFixture()
  // A separate guarded admin connection is required ONLY for concurrent Native
  // epoch mutation/lock observation. f.db deliberately exposes no pinned client.
  const admin=new pg.Pool({...target,max:3,statement_timeout:12000,query_timeout:15000})
  try{
    await f.db.exec(f.sql('migrations/pg_v9_058_agent_opinion_read.sql'))
    assert.equal(await verifyAgentOpinionCredentials(f.db),true)

    await t.test('same UUID, separate real Native API connections, exact zero/full result and no read business DML even when audit INSERT is rejected',async()=>{
      const requestId=randomUUID(),alice=await completed(f,{requestId}),bob=await completed(f,{who:'bob',purpose:'optimize',requestId,outputTokenLimit:16384,fullCapacity:true})
      const a=tracedPool(f.pool),b=tracedPool(f.pool)
      await f.db.exec("CREATE FUNCTION agentstudio.synthetic_reject_opinion_tcp_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_opinion_tcp_audit_insert_forbidden'; END$$; REVOKE ALL ON FUNCTION agentstudio.synthetic_reject_opinion_tcp_audit() FROM PUBLIC; CREATE TRIGGER synthetic_opinion_tcp_audit BEFORE INSERT ON agentstudio.audit_events FOR EACH ROW EXECUTE FUNCTION agentstudio.synthetic_reject_opinion_tcp_audit()")
      try{
        const before=await snapshot(f)
        const inspected=tracedPool(f.pool)
        assert.equal(await inspectAgentOpinionSchema(inspected.pool),true,'real API login supports the optional read-only catalog inspector')
        assert.equal(inspected.trace[0].sql,'BEGIN READ ONLY');assert.equal(inspected.trace.at(-1).sql,'ROLLBACK');noReadDml(inspected.trace)
        await sameAfter(f,before)
        const [av,bv]=await Promise.all([new AgentOpinionRepository(a.pool).getCurrent(alice.identity,requestId),new AgentOpinionRepository(b.pool).getCurrent(bob.identity,requestId)])
        assert.notEqual(await a.pid,await b.pid);sealed(av,alice);sealed(bv,bob)
        assert.equal(av.result.score,0);assert.ok(av.result.dimensions.every(d=>d.score===0))
        assert.equal(bv.result.descriptive.goal.length,limits.goal);assert.equal(bv.result.descriptive.task_scope.length,limits.task_scope)
        for(const key of ['deliverables','task_plan','done_criteria']){assert.equal(bv.result.descriptive[key].length,limits.list_items);assert.ok(bv.result.descriptive[key].every(item=>item.length===limits.list_item))}
        noReadDml(a.trace);noReadDml(b.trace);await sameAfter(f,before)
      }finally{await f.db.exec('DROP TRIGGER synthetic_opinion_tcp_audit ON agentstudio.audit_events; DROP FUNCTION agentstudio.synthetic_reject_opinion_tcp_audit()')}
      const unique=await completed(f),before=await snapshot(f)
      await assert.rejects(new AgentOpinionRepository(f.pool).getCurrent(f.identities.bob,unique.raw.request_id),error=>error.status===404&&error.code==='agent_opinion_not_found')
      await sameAfter(f,before)
    })

    await t.test('erase wins after anchor, before source540: control commits without waiting on an anchor request lock and no stale output is returned',async()=>{
      const p=await completed(f,{purpose:'optimize'}),original=await assessmentRows(f,p.raw.request_id,p.owner),g=tracedPool(f.pool,{after:anchorSql})
      const read=observe(new AgentOpinionRepository(g.pool).getCurrent(p.identity,p.raw.request_id))
      try{
        await reached(g,read,'anchor_before_erase')
        assert.equal(g.trace.some(q=>sourceLockSql.test(q.sql)),false)
        await bounded(assessmentErase(f,p),'erase_commits_while_anchor_waits')
        const before=await snapshot(f);assert.equal(read.done,false)
        g.release();await failure(read,unavailable,'body_after_erase');await sameAfter(f,before)
        noReadDml(g.trace);await erased(f,p,original)
      }finally{g.release();await read.promise}
    })

    for(const action of ['erase','feedback_erasure'])await t.test('read wins before '+action+': independent writer really blocks until owner read commits',async()=>{
      const p=await completed(f,{purpose:'optimize'}),original=await assessmentRows(f,p.raw.request_id,p.owner),g=tracedPool(f.pool,{after:bodySql}),w=tracedPool(f.pool)
      const feedbackRaw=action==='feedback_erasure'?await reviewLedgerFeedbackErase(f,p):null
      const read=observe(new AgentOpinionRepository(g.pool).getCurrent(p.identity,p.raw.request_id));let writer
      try{
        await reached(g,read,'body_before_'+action)
        assert.equal(read.done,false)
        if(action==='erase')writer=observe(assessmentErase({...f,closed:new AgentReviewLedgerRepository(w.pool)},p))
        else writer=observe(new AgentFeedbackRepository(w.pool,{allowSubmit:true,allowLessonStorage:true}).change(p.identity,feedbackRaw))
        const [readerPid,writerPid]=await bounded(Promise.all([g.pid,w.pid]),'independent_'+action+'_pids')
        assert.notEqual(readerPid,writerPid);await blocked(admin,writerPid,readerPid,action+'_waits_for_read')
        assert.equal(writer.done,false);assert.equal(read.done,false)
        g.release();sealed(await success(read,'read_commit_before_'+action),p)
        await success(writer,action+'_after_read_commit')
        assert.equal(g.trace.at(-1).sql,'COMMIT');noReadDml(g.trace);await erased(f,p,original)
      }finally{g.release();await Promise.all([read.promise,...(writer?[writer.promise]:[])])}
    })

    await t.test('selected feedback source deletion holds540 first: reader anchor then waits540, actual erasure commits without a reverse request-lock deadlock',async()=>{
      const p=await completed(f,{purpose:'optimize'}),original=await assessmentRows(f,p.raw.request_id,p.owner),raw=await reviewLedgerFeedbackErase(f,p)
      const w=tracedPool(f.pool,{after:sourceLockSql}),g=tracedPool(f.pool)
      const writer=observe(new AgentFeedbackRepository(w.pool,{allowSubmit:true,allowLessonStorage:true}).change(p.identity,raw));let read
      try{
        await reached(w,writer,'source_writer_holds540')
        read=observe(new AgentOpinionRepository(g.pool).getCurrent(p.identity,p.raw.request_id))
        const [readerPid,writerPid]=await bounded(Promise.all([g.pid,w.pid]),'source_race_pids')
        assert.notEqual(readerPid,writerPid);await blocked(admin,readerPid,writerPid,'read_waits_for_selected_source540')
        const anchor=g.trace.findIndex(q=>anchorSql.test(q.sql)),lock=g.trace.findIndex(q=>sourceLockSql.test(q.sql))
        assert.ok(anchor>=0&&lock>anchor);assert.equal(g.trace.some(q=>bodySql.test(q.sql)),false)
        w.release();await success(writer,'source_deletion_commit_without_reverse540')
        const before=await snapshot(f);await failure(read,unavailable,'read_after_source_deletion');await sameAfter(f,before)
        assert.equal(g.trace.some(q=>bodySql.test(q.sql)),false);assert.equal(g.trace.at(-1).sql,'ROLLBACK')
        noReadDml(g.trace);await erased(f,p,original)
      }finally{w.release();await Promise.all([writer.promise,...(read?[read.promise]:[])])}
    })

    await t.test('Native epoch writer wins: old read waits on the account lock, then returns truthful historical metadata without source/body admission',async()=>{
      const p=await completed(f),g=tracedPool(f.pool),writer=await adminTransaction(admin);let read,committed=false
      try{
        await writer.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner])
        read=observe(new AgentOpinionRepository(g.pool).getCurrent(p.identity,p.raw.request_id))
        await blocked(admin,await bounded(g.pid,'epoch_waiting_reader_pid'),writer.pid,'read_waits_for_epoch_writer')
        assert.equal(g.trace.some(q=>epochSql.test(q.sql)),true);assert.equal(g.trace.some(q=>anchorSql.test(q.sql)),false)
        await writer.db.query('COMMIT');committed=true
        const before=await snapshot(f),value=await success(read,'read_after_epoch_commit');sealed(value,p,false)
        assert.equal(value.body_erased,false);assert.equal(value.execution.job_state,'pending')
        assert.equal(g.trace.some(q=>sourceLockSql.test(q.sql)||bodySql.test(q.sql)),false)
        noReadDml(g.trace);await sameAfter(f,before);sealed(await current(f,p),p,false)
      }finally{if(!committed)await writer.db.query('ROLLBACK').catch(()=>{});writer.db.release();if(read)await read.promise}
    })

    await t.test('owner read wins Native epoch race: governance UPDATE actually waits, old body commits once and later reads offer metadata only',async()=>{
      const p=await completed(f,{purpose:'optimize'}),g=tracedPool(f.pool,{after:bodySql}),read=observe(new AgentOpinionRepository(g.pool).getCurrent(p.identity,p.raw.request_id))
      let writer,update,committed=false
      try{
        await reached(g,read,'body_before_epoch_writer');writer=await adminTransaction(admin)
        update=observe(writer.db.query('UPDATE agentstudio_auth.accounts SET governance_revision=governance_revision+2 WHERE user_id=$1',[p.owner]))
        await blocked(admin,writer.pid,await bounded(g.pid,'epoch_winning_reader_pid'),'epoch_update_waits_for_read_commit')
        assert.equal(update.done,false);assert.equal(read.done,false)
        g.release();sealed(await success(read,'read_before_epoch_change'),p);await success(update,'epoch_update_after_read_commit')
        await writer.db.query('COMMIT');committed=true
        assert.equal(g.trace.at(-1).sql,'COMMIT');noReadDml(g.trace)
        const before=await snapshot(f);sealed(await current(f,p),p,false);await sameAfter(f,before)
        const rows=await assessmentRows(f,p.raw.request_id,p.owner);assert.equal(rows.effects.length,1);assert.equal(rows.outcomes.length,1);assert.equal(rows.outputs.length,1)
      }finally{
        g.release();await read.promise;if(update)await update.promise
        if(writer){if(!committed)await writer.db.query('ROLLBACK').catch(()=>{});writer.db.release()}
      }
    })
    await t.test('actual API history uses microsecond keyset metadata only; owner collisions and stale model bodies do not remove original privacy authority',async()=>{
      const finished=await completed(f,{purpose:'optimize'}),originalRows=await assessmentRows(f,finished.raw.request_id,finished.owner)
      // Put pending synthetic admissions last: the preceding Worker proof
      // cases must never accidentally claim this pagination fixture's queue.
      const seed=await assessmentRequest(f),scope={spec_id:seed.role.id,run_id:seed.runId,purpose:'evaluate',limit:4}
      for(let i=0;i<20;i++)await f.ledger.submit(seed.identity,{...seed.raw,request_id:randomUUID()})
      const rows=(await f.db.query("SELECT request_id,pg_catalog.to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS exact_time FROM agentstudio.agent_review_requests WHERE owner_user_id=$1 AND spec_id=$2 AND run_id=$3 AND purpose='evaluate' ORDER BY created_at DESC,request_id DESC",[seed.owner,seed.role.id,seed.runId])).rows
      assert.equal(rows.length,21)
      const before=await snapshot(f),all=[];let cursor
      for(let pageNumber=0;pageNumber<6;pageNumber++){
        const traced=tracedPool(f.pool),page=await new AgentReviewHistoryRepository(traced.pool).list(seed.identity,{...scope,...(cursor?{before:cursor}:{})})
        assert.equal(page.protocol,'agent_paid_review_history_v1');assert.equal(page.limit,4)
        assert.deepEqual(page.items.map(item=>item.request.request_id),rows.slice(pageNumber*4,pageNumber*4+4).map(row=>row.request_id))
        for(const item of page.items){assert.deepEqual(item.control,{job_state:'pending',body_erased:false});assert.equal(item.request.owner_epoch,seed.receipt.owner_epoch)}
        assert.doesNotMatch(JSON.stringify(page),/"(?:result|execution|outcome|choice|messages|recorded|replayed|owner_user_id|lease_token|worker_id)"/)
        noReadDml(traced.trace);assert.equal(traced.trace.some(q=>anchorSql.test(q.sql)||bodySql.test(q.sql)||sourceLockSql.test(q.sql)),false)
        assert.equal(traced.trace.at(-1).sql,'COMMIT');all.push(...page.items.map(item=>item.request.request_id))
        if(pageNumber===5){assert.equal(page.has_more,false);assert.equal(page.next_cursor,null)}
        else{
          assert.equal(page.has_more,true);assert.ok(page.next_cursor.startsWith('v1.'))
          const decoded=JSON.parse(Buffer.from(page.next_cursor.slice(3),'base64url').toString('utf8')),last=rows[all.length-1]
          assert.deepEqual(decoded,{created_at:last.exact_time,request_id:last.request_id},'cursor retains the actual PostgreSQL microseconds, not pg Date milliseconds')
          cursor=page.next_cursor
        }
      }
      assert.equal(new Set(all).size,21);await sameAfter(f,before)
      await assert.rejects(new AgentReviewHistoryRepository(f.pool).list(f.identities.bob,scope),error=>error.status===404&&error.code==='agent_review_history_not_found')
      const bob=await assessmentRequest(f,{who:'bob',requestId:seed.raw.request_id})
      const bobPage=await new AgentReviewHistoryRepository(f.pool).list(bob.identity,{spec_id:bob.role.id,run_id:bob.runId,purpose:'evaluate',limit:20})
      assert.equal(bobPage.items.length,1);assert.equal(bobPage.items[0].request.request_id,seed.raw.request_id)
      assert.equal(bobPage.items[0].request.spec_id,bob.role.id);assert.notEqual(bobPage.items[0].request.input_sha256,seed.receipt.input_sha256)
      // History must retain a genuinely completed original even when its
      // selected current model can no longer authorize body publication.
      await f.db.query('UPDATE agentstudio.model_connections SET enabled=false,revision=revision+1 WHERE id=$1',[finished.choice.model_binding.connection_id])
      await assert.rejects(new AgentOpinionRepository(f.pool).getCurrent(finished.identity,finished.raw.request_id),unavailable)
      const finishedScope={spec_id:finished.role.id,run_id:finished.runId,purpose:'optimize',limit:20},history=new AgentReviewHistoryRepository(f.pool)
      const beforeHistory=await snapshot(f),immutable=await history.list(finished.identity,finishedScope)
      assert.equal(immutable.items[0].request.request_sha256,finished.receipt.request_sha256);await sameAfter(f,beforeHistory)
      await assessmentErase(f,finished)
      const afterErase=await snapshot(f),erasedPage=await history.list(finished.identity,finishedScope)
      assert.deepEqual(erasedPage.items[0].control,{job_state:'erased',body_erased:true})
      assert.equal(erasedPage.items[0].request.request_sha256,finished.receipt.request_sha256);await sameAfter(f,afterErase)
      const erasedRows=await assessmentRows(f,finished.raw.request_id,finished.owner)
      assert.equal(erasedRows.outputs.length,0);assert.deepEqual(erasedRows.effects,originalRows.effects);assert.deepEqual(erasedRows.outcomes,originalRows.outcomes)
    })
  }finally{await admin.end();await f.close()}
})
