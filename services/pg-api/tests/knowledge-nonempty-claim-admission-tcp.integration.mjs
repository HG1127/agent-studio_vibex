// Genuine hosted nonempty knowledge claim cases. Fresh service required.
// No provider/embedding/LLM/MCP is called; positive SQL execution is CI-only.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'
const capability=requireWorkerHeartbeatCi()
const {knowledgeNonemptyTcpFixture}=await import('./helpers/knowledge-nonempty-claim-admission-ci.mjs')
const {knowledgeAssessmentCounts:counts,knowledgeAssessmentBounded:bounded,knowledgeAssessmentClaimSql:claimSql}=await import('./helpers/knowledge-assessment-claim-admission-ci.mjs')

test('nonempty knowledge index/query claims preserve original consent, digest and fenced outcomes',{concurrency:false,timeout:480000},async t=>{
 const f=await knowledgeNonemptyTcpFixture(capability)
 const sent=(p,lane)=>p.trace.filter(row=>row.sql===claimSql[lane]).length
 const scenario=async(lane,options,body)=>{
  const s=await f.seed(lane),p=f.probe(lane,options),worker=f.worker(lane,p.pool)
  let work
  const start=()=>{work=worker.claim();work.catch(()=>{});return work}
  let primary
  try{return await body({s,p,worker,start})}
  catch(error){primary=error;throw error}
  finally{
   try{try{await p.settle(work)}finally{await f.cleanup(s)}}
   catch(cleanupError){
    if(primary)throw new AggregateError([primary,cleanupError],'knowledge_nonempty_primary_and_cleanup_failed')
    throw cleanupError
   }
  }
 }
 const noReplay=async(p,lane,worker)=>{const n=sent(p,lane);assert.equal(await worker.claim(),null);assert.equal(sent(p,lane),n)}
 try{
  await t.test('original FULL060 and actual broker LOGIN retain exact narrow membership without API',async()=>{
   await f.full()
   const db=await f.brokerPool.connect()
   try{await f.verifyBroker(db);assert.equal((await db.query("SELECT pg_has_role(session_user,'agentstudio_api','MEMBER') AS api")).rows[0].api,false)}
   finally{db.release()}
  })
  for(const lane of ['index','query']){
   await t.test(lane+': original owner API creates a real eligible queue with profile/consent/digest and private-owner checks',async()=>{
    await scenario(lane,{},async({s,worker,start})=>{
     await f.privateToOwner(s);await f.unchanged(s)
     const dto=await bounded(start(),'actual_nonempty_claim');assert.equal(dto.worker_id,worker.workerId)
     await f.assertClaim(s,dto);worker.closeNewClaims();assert.deepEqual(counts(worker),[true,0,0])
    })
   })
   await t.test(lane+': close after final actual scope await leaves the original nonempty queue unclaimed',async()=>{
    const stage=f.stages(lane).at(-1)
    await scenario(lane,{holds:[stage]},async({s,p,worker,start})=>{
     const work=start();await p.hit(stage);worker.closeNewClaims();p.release(stage)
     assert.equal(await bounded(work,'nonempty_final_scope_gate'),null);assert.equal(sent(p,lane),0)
     await f.unchanged(s);assert.deepEqual(counts(worker),[true,0,0])
    })
   })
   await t.test(lane+': real result/parser and COMMIT ACK barriers retain pending, locks and original DTO',async()=>{
    await scenario(lane,{holds:['claim','COMMIT']},async({s,p,worker,start})=>{
     const work=start(),raw=await p.hit('claim')
     assert.ok(raw.rows[0].value);assert.equal(raw.rows[0].value.worker_id,worker.workerId)
     await f.locked(s);await f.unchanged(s);worker.closeNewClaims();assert.deepEqual(counts(worker),[true,1,0])
     p.release('claim');await p.hit('COMMIT')
     await f.assertClaim(s,raw.rows[0].value);await f.locked(s,false);assert.deepEqual(counts(worker),[true,1,0])
     p.release('COMMIT');assert.deepEqual(await bounded(work,'actual_nonempty_parser_commit'),raw.rows[0].value)
     assert.deepEqual(counts(worker),[true,0,0])
    })
   })
   await t.test(lane+': real pre-COMMIT rollback removes original lease/reservation only after acknowledged delivery',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseClaimAck:true},async({s,p,worker,start})=>{
     const work=start();await p.hit('claim');await f.locked(s);worker.closeNewClaims();p.release('claim')
     await p.hit('ROLLBACK');await f.unchanged(s);await f.locked(s,false)
     assert.deepEqual(counts(worker),[true,1,1]);assert.equal(p.trace.some(row=>row.sql==='COMMIT'),false)
     p.release('ROLLBACK');await assert.rejects(bounded(work,'nonempty_known_rollback'),error=>error===p.lost)
     assert.deepEqual(counts(worker),[true,0,0])
    })
   })
   await t.test(lane+': lost actual rollback ACK stays unknown through a later successful real nonempty claim',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseClaimAck:true,loseRollbackAck:true},async({s,p,worker,start})=>{
     const work=start();await p.hit('claim');p.release('claim');await p.hit('ROLLBACK');await f.unchanged(s)
     p.release('ROLLBACK');await assert.rejects(bounded(work,'nonempty_lost_rollback_ack'),error=>error===p.lost)
     assert.deepEqual(counts(worker),[false,1,1])
     const later=await worker.claim();await f.assertClaim(s,later);assert.equal(sent(p,lane),2)
     assert.deepEqual(counts(worker),[false,1,1]);worker.closeNewClaims();await noReplay(p,lane,worker)
    })
   })
   await t.test(lane+': lost COMMIT persists real token binding and unknown through later empty and separate nonempty successes',async()=>{
    await scenario(lane,{holds:['COMMIT'],loseCommitAck:true},async({s,p,worker,start})=>{
     const work=start();await p.hit('COMMIT');const original=p.trace.find(row=>row.sql===claimSql[lane]).result.rows[0].value
     await f.assertClaim(s,original);p.release('COMMIT');await assert.rejects(bounded(work,'nonempty_lost_commit'),error=>error===p.lost)
     assert.equal(p.trace.find(row=>row.sql==='ROLLBACK').result.command,'ROLLBACK')
     assert.deepEqual(counts(worker),[false,1,1]);assert.equal(await worker.claim(),null)
     assert.deepEqual(counts(worker),[false,1,1])
     const another=await f.seed(lane)
     try{const later=await worker.claim();await f.assertClaim(another,later);assert.deepEqual(counts(worker),[false,1,1]);assert.notEqual(later.attempt_id,original.attempt_id)}
     finally{await f.cleanup(another)}
     worker.closeNewClaims();await noReplay(p,lane,worker)
    })
   })
   for(const after of ['claim','COMMIT']){
    await t.test(lane+': actual socket destruction after '+after+' retains real server outcome and local unknown',async()=>{
     await scenario(lane,{holds:[after],disconnectAt:after},async({s,p,worker,start})=>{
      const work=start();await p.hit(after)
      const raw=p.trace.find(row=>row.sql===claimSql[lane]).result.rows[0].value
      if(after==='claim'){await f.locked(s);await f.unchanged(s)}else await f.assertClaim(s,raw)
      worker.closeNewClaims();p.release(after);await assert.rejects(bounded(work,'nonempty_socket_loss'),error=>error===p.lost)
      await f.gone(await p.pid)
      if(after==='claim')await f.unchanged(s);else await f.assertClaim(s,raw)
      const rollback=p.trace.find(row=>row.sql==='ROLLBACK');assert.equal(rollback.rejected,true);assert.equal(rollback.settled,false)
      assert.deepEqual(counts(worker),[true,1,1]);await noReplay(p,lane,worker)
     })
    })
   }
   await t.test(lane+': original broker fencing and finish(NULL) retain owned unknown without provider or vector publication',async()=>{
    await scenario(lane,{},async({s,worker,start})=>{
     const dto=await bounded(start(),'owned_claim');await f.assertClaim(s,dto);worker.closeNewClaims()
     assert.equal(await f.broker(lane,'finish',dto),null,'finish before reserve must not fabricate completion')
     assert.equal(await f.broker(lane,'reserve',{...dto,worker_id:randomUUID()}),null)
     assert.equal(await f.broker(lane,'reserve',{...dto,lease_token:'f'.repeat(64)}),null)
     await f.assertClaim(s,dto)
     const material=await f.broker(lane,'reserve',dto)
     assert.equal(material.owner_id,s.owner);assert.equal(material.identity.issuer,f.fixture.identities.alice.issuer);assert.ok(material.input.length>0)
     assert.equal(await f.broker(lane,'recheck',dto),true)
     assert.equal(await f.broker(lane,'recheck',{...dto,lease_token:'f'.repeat(64)}),false)
     assert.equal(await f.broker(lane,'finish',dto),null,'original NULL completion produces unknown, not synthetic success')
     const row=(await f.state(s))[0];assert.equal(row.status,'unknown')
     assert.deepEqual(counts(worker),[true,0,0])
     const other=f.worker(lane,f.probe(lane).pool);assert.equal(await other.claim(),null)
     assert.equal((await f.state(s))[0].status,'unknown');assert.equal(await f.broker(lane,'reserve',dto),null)
    })
   })
   await t.test(lane+': original owner API content/revision change invalidates a held lease at real reserve',async()=>{
    await scenario(lane,{},async({s,worker,start})=>{
     const dto=await bounded(start(),'before_source_change');await f.assertClaim(s,dto);worker.closeNewClaims()
     await f.invalidateByOriginalApi(s)
     assert.equal(await f.broker(lane,'reserve',dto),null)
     assert.equal((await f.state(s))[0].status,lane==='index'?'discarded':'rejected')
     assert.deepEqual(counts(worker),[true,0,0])
    })
   })
   await t.test(lane+': original45s server clock reclaims only unreserved prepared work with a new token and stale-token rejection',async()=>{
    await scenario(lane,{},async({s,p,worker,start})=>{
     const first=await bounded(start(),'clock_first_claim');await f.assertClaim(s,first);worker.closeNewClaims()
     // Hosted only: wait the real clock; do not UPDATE lease_until or TTL.
     await f.waitLeaseExpired(s,first)
     const replacement=f.worker(lane,p.pool),next=await bounded(replacement.claim(),'clock_reclaim')
     assert.equal(next.attempt_id,first.attempt_id);assert.notEqual(next.worker_id,first.worker_id);assert.notEqual(next.lease_token,first.lease_token)
     await f.assertClaim(s,next);replacement.closeNewClaims()
     assert.equal(await f.broker(lane,'reserve',first),null)
     assert.ok(await f.broker(lane,'reserve',next));assert.equal(await f.broker(lane,'finish',next),null)
     assert.equal((await f.state(s))[0].status,'unknown');assert.deepEqual(counts(worker),[true,0,0]);assert.deepEqual(counts(replacement),[true,0,0])
    })
   })
  }
  await t.test('final original FULL060, zero dispatch callbacks and retained unknown histories remain independent of local claim counts',async()=>{
   await f.full();assert.deepEqual(f.callbacks,{index:0,query:0,assessment:0})
   const histories=(await f.admin.query("SELECT (SELECT count(*)::integer FROM agentstudio.knowledge_index_attempts WHERE status='unknown') AS index_unknown,(SELECT count(*)::integer FROM agentstudio.knowledge_query_jobs WHERE status='unknown') AS query_unknown,(SELECT count(*)::integer FROM agentstudio.audit_events) AS audits")).rows[0]
   assert.ok(histories.index_unknown>=2);assert.ok(histories.query_unknown>=2);assert.ok(histories.audits>0)
  })
 }finally{await f.close()}
})
