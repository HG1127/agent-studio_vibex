// Hosted genuine TCP only; authored, not locally executed. This matrix member
// requires its own NEW empty PG18 main service beside the original001..060.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'

const capability=requireWorkerHeartbeatCi() // Before all dynamic business/DB imports.
const {knowledgeAssessmentTcpFixture,knowledgeAssessmentLanes,knowledgeAssessmentRoles,knowledgeAssessmentClaimSql,knowledgeAssessmentCounts,knowledgeAssessmentBounded}=await import('./helpers/knowledge-assessment-claim-admission-ci.mjs')

test('knowledge and assessment actual claim admission on independent minimum LOGINs',{concurrency:false,timeout:360000},async t=>{
 const f=await knowledgeAssessmentTcpFixture(capability)
 const countSql=(p,lane)=>p.trace.filter(row=>row.sql===knowledgeAssessmentClaimSql[lane]).length
 const scenario=async(lane,options,body,{seed=false,dispatch}={})=>{
  await f.assertEmpty(lane)
  const s=seed?await f.seedAssessment():null,p=f.probe(lane,options),worker=f.worker(lane,p.pool,dispatch)
  let work
  // Assessment claim is TS-private, not ECMAScript #private. This deliberately
  // calls the actual saved method to isolate claim from paid/owned dispatch.
  const start=()=>{work=worker.claim();work.catch(()=>{});return work}
  try{return await body({s,p,worker,start})}
  finally{try{await p.settle(work)}finally{await f.cleanupAssessment(s)}}
 }
 const noReplay=async(p,lane,worker)=>{const before=countSql(p,lane);assert.equal(await worker.claim(),null);assert.equal(countSql(p,lane),before)}
 const notLeased=async s=>{const row=await f.state(s);assert.equal(row.job_state,'pending');assert.equal(row.lease_state,null);assert.equal(row.claims,0);return row}
 const emptyResult=(result,lane)=>{
  assert.equal(result.rowCount,1);assert.equal(result.rows[0].value,null)
  assert.equal(result.command,'SELECT');assert.ok(knowledgeAssessmentClaimSql[lane])
 }
 try{
  await t.test('original FULL060, actual narrow LOGINs, stage NOLOGIN and genuine assessment full-audit calibration',async()=>{
   await f.full();assert.ok(f.calibration.query_count>10);assert.equal(f.calibration.real_audit_executed,true);assert.equal(f.calibration.no_audit_mock,true)
   for(const lane of knowledgeAssessmentLanes){
    const db=await f.runtimePools[lane].connect()
    try{
     const identity=await f.verifyRuntime(db,lane);assert.deepEqual(identity.direct,[knowledgeAssessmentRoles[lane]])
     assert.equal((await db.query("SELECT pg_has_role(session_user,'agentstudio_api','MEMBER') AS api")).rows[0].api,false)
     await db.query('BEGIN');await assert.rejects(db.query('SET LOCAL ROLE agentstudio_api'),error=>error.code==='42501')
    }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
   }
  })
  const originalEmptyImage=await f.image()
  for(const lane of knowledgeAssessmentLanes){
   await t.test(lane+': closing before claim opens no runtime connection and repeated close cannot reopen it',async()=>{
    await scenario(lane,{},async({p,worker,start})=>{
     worker.closeNewClaims();worker.closeNewClaims();assert.equal(await start(),null)
     assert.equal(p.trace.length,0);assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': actual empty RPC response is held inside its transaction and remains pending after close',async()=>{
    await scenario(lane,{holds:['claim']},async({p,worker,start})=>{
     const work=start(),result=await p.hit('claim');emptyResult(result,lane)
     const activity=await f.activity(await p.pid);assert.equal(activity.login,f.logins[lane]);assert.equal(activity.state,'idle in transaction')
     const receipt=p.trace.find(row=>row.name==='claim');assert.equal(receipt.context.role,knowledgeAssessmentRoles[lane])
     assert.equal(receipt.context.lock_timeout,'3s');assert.equal(receipt.context.statement_timeout,'5s')
     worker.closeNewClaims();assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,0]);p.release('claim')
     assert.equal(await knowledgeAssessmentBounded(work,'empty_rpc_delivery'),null)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0]);assert.equal(f.callbacks[lane],0)
    })
   })
   await t.test(lane+': real empty-claim COMMIT completes server-side while withheld ACK keeps pending',async()=>{
    await scenario(lane,{holds:['COMMIT']},async({p,worker,start})=>{
     const work=start(),commit=await p.hit('COMMIT');assert.equal(commit.command,'COMMIT')
     emptyResult(p.trace.find(row=>row.name==='claim').result,lane)
     assert.equal((await f.activity(await p.pid)).state,'idle')
     worker.closeNewClaims();assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,0]);p.release('COMMIT')
     assert.equal(await knowledgeAssessmentBounded(work,'empty_commit_delivery'),null)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
    })
   })
   for(const stage of f.stages(lane)){
    await t.test(lane+': close after actual '+stage+' completion prevents the final real claim RPC',async()=>{
     await scenario(lane,{holds:[stage]},async({p,worker,start})=>{
      const work=start();await p.hit(stage);worker.closeNewClaims()
      assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0]);p.release(stage)
      assert.equal(await knowledgeAssessmentBounded(work,'close_after_real_prelude'),null)
      assert.equal(countSql(p,lane),0);assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
     })
    })
   }
   await t.test(lane+': actual COMMIT response loss remains unknown after real rollback and a later real empty success',async()=>{
    await scenario(lane,{holds:['COMMIT'],loseCommitAck:true},async({p,worker,start})=>{
     const work=start();await p.hit('COMMIT');assert.equal((await f.activity(await p.pid)).state,'idle');p.release('COMMIT')
     await assert.rejects(knowledgeAssessmentBounded(work,'lost_commit_ack'),error=>error===p.lost)
     const rollback=p.trace.find(row=>row.sql==='ROLLBACK');assert.equal(rollback.settled,true);assert.equal(rollback.result.command,'ROLLBACK')
     assert.deepEqual(knowledgeAssessmentCounts(worker),[false,1,1])
     assert.equal(await worker.claim(),null);assert.equal(countSql(p,lane),2)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[false,1,1]);worker.closeNewClaims();await noReplay(p,lane,worker)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1])
    })
   })
   await t.test(lane+': pre-COMMIT RPC delivery loss settles only after actual rollback ACK delivery',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseClaimAck:true},async({p,worker,start})=>{
     const work=start();emptyResult(await p.hit('claim'),lane);worker.closeNewClaims();p.release('claim')
     const rollback=await p.hit('ROLLBACK');assert.equal(rollback.command,'ROLLBACK')
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1]);assert.equal(p.trace.some(row=>row.sql==='COMMIT'),false)
     p.release('ROLLBACK');await assert.rejects(knowledgeAssessmentBounded(work,'known_rollback_delivery'),error=>error===p.lost)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': actual rollback response loss does not become local confirmation in finally',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseClaimAck:true,loseRollbackAck:true},async({p,worker,start})=>{
     const work=start();await p.hit('claim');worker.closeNewClaims();p.release('claim');await p.hit('ROLLBACK')
     assert.equal((await f.activity(await p.pid)).state,'idle');p.release('ROLLBACK')
     await assert.rejects(knowledgeAssessmentBounded(work,'lost_rollback_ack'),error=>error===p.lost)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1]);await noReplay(p,lane,worker)
    })
   })
   for(const after of ['claim','COMMIT']){
    await t.test(lane+': real socket destruction after '+after+' causes a real failed rollback and sticky unknown',async()=>{
     await scenario(lane,{holds:[after],disconnectAt:after},async({p,worker,start})=>{
      const work=start();await p.hit(after);worker.closeNewClaims();p.release(after)
      await assert.rejects(knowledgeAssessmentBounded(work,'actual_socket_loss'),error=>error===p.lost)
      const rollback=p.trace.find(row=>row.sql==='ROLLBACK');assert.ok(rollback);assert.equal(rollback.rejected,true);assert.equal(rollback.settled,false)
      await f.gone(await p.pid);assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1]);await noReplay(p,lane,worker)
     })
    })
   }
  }
  await t.test('all empty-lane cases preserve the original business/audit row image and full060',async()=>{
   assert.equal(await f.image(),originalEmptyImage)
   await f.full();assert.deepEqual(f.callbacks,{index:0,query:0,assessment:0})
  })
  await t.test('assessment nonempty: original API queue, actual claim row lock, parsed DTO and withheld COMMIT ACK',async()=>{
   await scenario('assessment',{holds:['claim','COMMIT']},async({s,p,worker,start})=>{
    const work=start(),raw=await p.hit('claim')
    assert.equal(raw.rows[0].value.request_id,s.raw.request_id);assert.equal(raw.rows[0].value.worker_id,worker.workerId)
    await f.locked(s);await notLeased(s);worker.closeNewClaims();assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,0])
    p.release('claim');await p.hit('COMMIT')
    const committed=await f.state(s);assert.equal(committed.lease_state,'claimed');assert.equal(committed.worker_id,worker.workerId);assert.equal(committed.claims,1)
    await f.locked(s,false);assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,0])
    p.release('COMMIT');const dto=await knowledgeAssessmentBounded(work,'real_assessment_dto_commit')
    assert.equal(dto.request_id,s.raw.request_id);assert.equal(dto.lease_token,committed.lease_token);assert.equal(dto.lease_version,Number(committed.lease_version))
    assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
   },{seed:true})
  })
  await t.test('assessment nonempty: stop after the real final full-audit query prevents claim and preserves the pending request',async()=>{
   await scenario('assessment',{holds:['full_audit_last']},async({s,p,worker,start})=>{
    const work=start();await p.hit('full_audit_last');worker.closeNewClaims();p.release('full_audit_last')
    assert.equal(await knowledgeAssessmentBounded(work,'nonempty_final_audit_gate'),null)
    assert.equal(countSql(p,'assessment'),0);await notLeased(s);assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
   },{seed:true})
  })
  await t.test('assessment nonempty: actual rollback removes its uncommitted lease/audit while local pending waits for ACK',async()=>{
   await scenario('assessment',{holds:['claim','ROLLBACK'],loseClaimAck:true},async({s,p,worker,start})=>{
    const work=start();await p.hit('claim');await f.locked(s);worker.closeNewClaims();p.release('claim');await p.hit('ROLLBACK')
    await notLeased(s);await f.locked(s,false);assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1])
    p.release('ROLLBACK');await assert.rejects(knowledgeAssessmentBounded(work,'nonempty_rollback_ack'),error=>error===p.lost)
    assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
   },{seed:true})
  })
  await t.test('assessment nonempty: lost COMMIT retains its actual persisted lease and unknown through later actual empty claim',async()=>{
   await scenario('assessment',{holds:['COMMIT'],loseCommitAck:true},async({s,p,worker,start})=>{
    const work=start();await p.hit('COMMIT');assert.equal((await f.state(s)).lease_state,'claimed');p.release('COMMIT')
    await assert.rejects(knowledgeAssessmentBounded(work,'nonempty_lost_commit'),error=>error===p.lost)
    assert.deepEqual(knowledgeAssessmentCounts(worker),[false,1,1]);assert.equal(await worker.claim(),null)
    assert.equal(countSql(p,'assessment'),2);assert.equal((await f.state(s)).claims,1)
    assert.deepEqual(knowledgeAssessmentCounts(worker),[false,1,1]);worker.closeNewClaims();await noReplay(p,'assessment',worker)
   },{seed:true})
  })
  for(const after of ['claim','COMMIT']){
   await t.test('assessment nonempty: actual socket loss after '+after+' preserves independently observed server outcome and local unknown',async()=>{
    await scenario('assessment',{holds:[after],disconnectAt:after},async({s,p,worker,start})=>{
     const work=start();await p.hit(after)
     if(after==='claim'){await f.locked(s);await notLeased(s)}else assert.equal((await f.state(s)).lease_state,'claimed')
     worker.closeNewClaims();p.release(after);await assert.rejects(knowledgeAssessmentBounded(work,'nonempty_socket'),error=>error===p.lost)
     await f.gone(await p.pid)
     if(after==='claim')await notLeased(s);else{const row=await f.state(s);assert.equal(row.lease_state,'claimed');assert.equal(row.claims,1)}
     assert.equal(p.trace.find(row=>row.sql==='ROLLBACK').rejected,true)
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1]);await noReplay(p,'assessment',worker)
    },{seed:true})
   })
  }
  await t.test('assessment owned: memory dispatch throws once after close, original actual full-audit helper pauses without provider outcome',async()=>{
   let activeWorker
   await scenario('assessment',{holds:['pause']},async({s,p,worker})=>{
    activeWorker=worker
    const work=worker.tick();work.catch(()=>{})
    try{
     const reply=await p.hit('pause');assert.equal(reply.rows[0].value.state,'paused')
     assert.deepEqual(knowledgeAssessmentCounts(worker),[true,0,0])
     assert.equal(countSql(p,'assessment'),1);assert.equal(p.trace.filter(row=>row.name==='full_audit_last').length,2)
     p.release('pause');assert.equal((await knowledgeAssessmentBounded(work,'owned_actual_pause')).state,'paused')
     const row=await f.state(s);assert.equal(row.lease_state,'paused');assert.equal(row.pauses,1);assert.equal(row.claims,1)
    }finally{await p.settle(work)}
   },{seed:true,dispatch:async()=>{activeWorker.closeNewClaims();throw Error('synthetic_memory_transport_unknown')}})
  })
  await t.test('assessment owned: later successful claim and actual pause cannot clear an earlier empty-claim COMMIT unknown',async()=>{
   await f.assertEmpty('assessment')
   const p=f.probe('assessment',{loseCommitAck:true});let worker,s,work
   worker=f.worker('assessment',p.pool,async()=>{worker.closeNewClaims();throw Error('synthetic_memory_transport_unknown')})
   try{
    work=worker.claim();work.catch(()=>{});await assert.rejects(knowledgeAssessmentBounded(work,'old_empty_unknown'),error=>error===p.lost)
    assert.deepEqual(knowledgeAssessmentCounts(worker),[false,1,1]);s=await f.seedAssessment()
    work=worker.tick();work.catch(()=>{});assert.equal((await knowledgeAssessmentBounded(work,'owned_pause_after_old_unknown')).state,'paused')
    assert.deepEqual(knowledgeAssessmentCounts(worker),[true,1,1]);assert.equal((await f.state(s)).pauses,1)
    assert.equal(countSql(p,'assessment'),2);await noReplay(p,'assessment',worker)
   }finally{try{await p.settle(work)}finally{await f.cleanupAssessment(s)}}
  })
  await t.test('final original FULL060, minimum identities, stage NOLOGIN and untouched assessment provider ledgers',async()=>{
   await f.full()
   for(const lane of knowledgeAssessmentLanes){
    const db=await f.runtimePools[lane].connect();try{await f.verifyRuntime(db,lane)}finally{db.release()}
    await f.assertEmpty(lane)
   }
   assert.equal(f.callbacks.index,0);assert.equal(f.callbacks.query,0);assert.equal(f.callbacks.assessment,2)
   const rows=(await f.admin.query('SELECT (SELECT count(*)::integer FROM agentstudio.agent_assessment_effects) AS effects,(SELECT count(*)::integer FROM agentstudio.agent_assessment_outcomes) AS outcomes,(SELECT count(*)::integer FROM agentstudio.agent_assessment_outputs) AS outputs')).rows[0]
   assert.deepEqual(rows,{effects:0,outcomes:0,outputs:0})
  })
 }finally{await f.close()}
})
