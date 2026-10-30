// Genuine hosted TCP cases, authored only. The model-safe matrix member must
// get a NEW empty PG18 service; never reuse dormant, prepare or telemetry DBs.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'

// All drivers, fixtures, Workers and side effects stay below this exact gate.
const capability=requireWorkerHeartbeatCi()
const {modelSafeClaimTcpFixture,modelSafeScopeStages,modelSafeCounts,modelSafeBounded}=await import('./helpers/model-safe-claim-admission-ci.mjs')

test('model006 and safe007 actual claim admission beside unchanged full060',{concurrency:false,timeout:300000},async t=>{
 const f=await modelSafeClaimTcpFixture(capability)
 let serial=0
 const scenario=async(lane,options,body,{seed=true,malformed=false}={})=>{
  await f.assertEmpty(lane)
  const s=seed?await f.seed(lane,'case_'+(++serial),{malformed}):null,p=f.probe(lane,options)
  const worker=f.worker(lane,p.pool,lane+'_claim_ci_'+(++serial))
  let work
  const start=()=>{work=worker.claim();work.catch(()=>{});return work}
  try{return await body({s,p,worker,start})}
  finally{try{await p.settle(work)}finally{await f.cleanupSeed(s)}}
 }
 const sent=(p,lane)=>p.trace.filter(row=>row.sql===f.claimSql[lane]).length
 const queued=async s=>{const row=await f.state(s);assert.equal(row.status,'queued');assert.equal(row.attempts,0);assert.equal(row.lease_token,null);return row}
 const rejectReplay=async(p,lane,worker)=>{const n=sent(p,lane);assert.equal(await worker.claim(),null);assert.equal(sent(p,lane),n)}
 try{
  await t.test('genuine FULL001..060 and minimal actual LOGIN with only worker SET membership',async()=>{
   await f.full()
   const db=await f.runtimePool.connect()
   try{
    await f.verifyRuntime(db)
    assert.deepEqual((await db.query("SELECT pg_has_role(session_user,'agentstudio_api','MEMBER') AS api,pg_has_role(session_user,'agentstudio_worker','MEMBER') AS worker")).rows[0],{api:false,worker:true})
    await db.query('BEGIN')
    await assert.rejects(db.query('SET LOCAL ROLE agentstudio_api'),e=>e.code==='42501')
   }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  })
  for(const lane of ['model','safe']){
   const sqlNumber=lane==='model'?'006':'007'
   await t.test(lane+': repeated close prevents new real connections or claim SQL',async()=>{
    await scenario(lane,{},async({p,worker})=>{
     worker.closeNewClaims();worker.closeNewClaims()
     assert.equal(await worker.claim(),null);assert.equal(p.trace.length,0)
     assert.deepEqual(modelSafeCounts(worker),[true,0,0])
    },{seed:false})
   })
   await t.test(lane+': empty real'+sqlNumber+' result remains pending until actual COMMIT ACK delivery',async()=>{
    await scenario(lane,{holds:['COMMIT']},async({p,worker,start})=>{
     const work=start(),commit=await p.hit('COMMIT'),claim=p.trace.find(row=>row.sql===f.claimSql[lane])
     assert.equal(commit.command,'COMMIT');assert.equal(claim.settled,true)
     assert.equal(claim.result.rowCount,0);assert.deepEqual(claim.result.rows,[])
     worker.closeNewClaims();assert.deepEqual(modelSafeCounts(worker),[true,1,0])
     p.release('COMMIT');assert.equal(await modelSafeBounded(work,'empty_commit'),null)
     assert.deepEqual(modelSafeCounts(worker),[true,0,0])
    },{seed:false})
   })
   const stages=['connect','BEGIN',...(lane==='model'?modelSafeScopeStages:[]),'SET LOCAL ROLE agentstudio_worker']
   for(const stage of stages){
    await t.test(lane+': close after real '+stage+' completion prevents'+sqlNumber+' and leaves the owned synthetic row queued',async()=>{
     await scenario(lane,{holds:[stage]},async({s,p,worker,start})=>{
      const work=start();await p.hit(stage)
      worker.closeNewClaims();assert.deepEqual(modelSafeCounts(worker),[true,0,0]);p.release(stage)
      assert.equal(await modelSafeBounded(work,'final_gate'),null);assert.equal(sent(p,lane),0)
      await queued(s);assert.deepEqual(modelSafeCounts(worker),[true,0,0])
     })
    })
   }
   await t.test(lane+': real claim row is locked and uncommitted during withheld result delivery after close',async()=>{
    await scenario(lane,{holds:['claim']},async({s,p,worker,start})=>{
     const work=start(),result=await p.hit('claim'),pid=await p.pid
     assert.equal(result.rowCount,1);assert.equal(result.rows[0].id,s.job);assert.equal(result.rows[0].lease_owner,worker.workerId)
     const activity=await f.activity(pid)
     assert.equal(activity.login,f.login);assert.equal(activity.state,'idle in transaction');assert.equal(activity.xid,true)
     await f.locked(s);await queued(s)
     worker.closeNewClaims();assert.deepEqual(modelSafeCounts(worker),[true,1,0])
     p.release('claim');const lease=await modelSafeBounded(work,'held_claim_row')
     assert.strictEqual(lease,result.rows[0],'return original real pg row')
     assert.equal((await f.state(s)).status,'leased');assert.deepEqual(modelSafeCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': COMMIT visible and row unlocked server-side while withheld ACK keeps local pending',async()=>{
    await scenario(lane,{holds:['COMMIT']},async({s,p,worker,start})=>{
     const work=start(),result=await p.hit('COMMIT')
     assert.equal(result.command,'COMMIT');assert.equal((await f.state(s)).status,'leased');await f.unlocked(s)
     worker.closeNewClaims();assert.deepEqual(modelSafeCounts(worker),[true,1,0])
     p.release('COMMIT');assert.equal((await modelSafeBounded(work,'commit_delivery')).id,s.job)
     assert.deepEqual(modelSafeCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': lost ACK after real COMMIT remains unknown through a real successful subsequent ROLLBACK',async()=>{
    await scenario(lane,{holds:['COMMIT'],loseCommitAck:true},async({s,p,worker,start})=>{
     const work=start();await p.hit('COMMIT');assert.equal((await f.state(s)).status,'leased')
     worker.closeNewClaims();p.release('COMMIT')
     await assert.rejects(modelSafeBounded(work,'lost_commit_ack'),e=>e===p.lost)
     const rollback=p.trace.find(row=>row.sql==='ROLLBACK')
     assert.equal(rollback.settled,true);assert.equal(rollback.result.command,'ROLLBACK')
     assert.deepEqual(modelSafeCounts(worker),[true,1,1]);await rejectReplay(p,lane,worker)
     assert.equal((await f.state(s)).attempts,1)
    })
   })
   await t.test(lane+': later confirmed empty claim cannot erase an older lost-COMMIT intent',async()=>{
    await scenario(lane,{loseCommitAck:true},async({s,p,worker,start})=>{
     await assert.rejects(modelSafeBounded(start(),'first_lost_commit'),e=>e===p.lost)
     assert.equal((await f.state(s)).status,'leased');assert.deepEqual(modelSafeCounts(worker),[false,1,1])
     // Same instance, pool and backend contract. The old row is still leased;
     // the original SQL genuinely returns no eligible row on the second call.
     assert.equal(await worker.claim(),null);assert.equal(sent(p,lane),2)
     assert.deepEqual(modelSafeCounts(worker),[false,1,1])
     worker.closeNewClaims();await rejectReplay(p,lane,worker)
     assert.deepEqual(modelSafeCounts(worker),[true,1,1])
    })
   })
   await t.test(lane+': pre-COMMIT delivery loss settles only after real ROLLBACK ACK delivery',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseClaimAck:true},async({s,p,worker,start})=>{
     const work=start();await p.hit('claim');await f.locked(s)
     worker.closeNewClaims();p.release('claim');const rollback=await p.hit('ROLLBACK')
     assert.equal(rollback.command,'ROLLBACK');await queued(s);await f.unlocked(s)
     assert.deepEqual(modelSafeCounts(worker),[true,1,1]);assert.equal(p.trace.some(row=>row.sql==='COMMIT'),false)
     p.release('ROLLBACK');await assert.rejects(modelSafeBounded(work,'known_rollback'),e=>e===p.lost)
     assert.deepEqual(modelSafeCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': losing actual ROLLBACK ACK leaves unknown even when the observer sees rollback',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseClaimAck:true,loseRollbackAck:true},async({s,p,worker,start})=>{
     const work=start();await p.hit('claim');worker.closeNewClaims();p.release('claim');await p.hit('ROLLBACK')
     await queued(s);assert.deepEqual(modelSafeCounts(worker),[true,1,1])
     p.release('ROLLBACK');await assert.rejects(modelSafeBounded(work,'lost_rollback_ack'),e=>e===p.lost)
     assert.deepEqual(modelSafeCounts(worker),[true,1,1]);await rejectReplay(p,lane,worker)
    })
   })
   for(const after of ['claim','COMMIT']){
    await t.test(lane+': actual socket destruction after '+after+' produces real failed rollback and sticky unknown',async()=>{
     await scenario(lane,{holds:[after],disconnectAt:after},async({s,p,worker,start})=>{
      const work=start();await p.hit(after)
      if(after==='claim'){await f.locked(s);await queued(s)}else{assert.equal((await f.state(s)).status,'leased');await f.unlocked(s)}
      worker.closeNewClaims();p.release(after)
      await assert.rejects(modelSafeBounded(work,'actual_socket_loss'),e=>e===p.lost)
      const rollback=p.trace.find(row=>row.sql==='ROLLBACK')
      assert.ok(rollback);assert.equal(rollback.rejected,true);assert.equal(rollback.settled,false)
      const observed=await f.waitDisconnected(await p.pid,s,after==='claim'?'queued':'leased')
      assert.equal(observed.attempts,after==='claim'?0:1)
      // Independent observer truth is never passed to local confirm().
      assert.deepEqual(modelSafeCounts(worker),[true,1,1]);await rejectReplay(p,lane,worker)
     })
    })
   }
   await t.test(lane+': minimal actual worker LOGIN retains fenced003 finish for an already held lease after close',async()=>{
    await scenario(lane,{},async({s,worker,start})=>{
     const lease=await modelSafeBounded(start(),'minimal_held_claim');worker.closeNewClaims()
     const db=await f.runtimePool.connect()
     try{
      await f.verifyRuntime(db);await db.query('BEGIN');await db.query('SET LOCAL ROLE agentstudio_worker')
      const done=await db.query(f.finishSql,[lease.id,lease.lease_token,lease.lease_version,worker.workerId,'succeeded'])
      assert.equal(done.rows.length,1);assert.equal(done.rows[0].id,s.job);await db.query('COMMIT')
     }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
     assert.equal((await f.state(s)).status,'succeeded');assert.deepEqual(modelSafeCounts(worker),[true,0,0])
    })
   })
  }
  await t.test('safe: malformed payload comes from real007 rows and validation retains pending through acknowledged rollback',async()=>{
   await scenario('safe',{holds:['claim','ROLLBACK']},async({s,p,worker,start})=>{
    const work=start(),result=await p.hit('claim')
    assert.equal(result.rows[0].id,s.job);assert.equal(Object.hasOwn(result.rows[0].payload,'graph_sha256'),false)
    await f.locked(s);worker.closeNewClaims();assert.deepEqual(modelSafeCounts(worker),[true,1,0]);p.release('claim')
    const rollback=await p.hit('ROLLBACK');assert.equal(rollback.command,'ROLLBACK')
    await queued(s);assert.deepEqual(modelSafeCounts(worker),[true,1,1]);assert.equal(p.trace.some(row=>row.sql==='COMMIT'),false)
    p.release('ROLLBACK');await assert.rejects(modelSafeBounded(work,'malformed_real_safe_row'),/invalid_workflow_claim/)
    assert.deepEqual(modelSafeCounts(worker),[true,0,0])
   },{malformed:true})
  })
  await t.test('model: real malformed spec_revision is returned unchanged, then held preflight fails and original failPreflight finishes without provider',async()=>{
   await scenario('model',{owned:true},async({s,worker,start})=>{
    const lease=await modelSafeBounded(start(),'malformed_real_model_payload')
    assert.equal(lease.payload.spec_revision,'synthetic_invalid_revision');worker.closeNewClaims()
    // Model claim validates lease identity/kind/phase, not spec_revision. Do not
    // pretend this malformed payload failed claim validation.
    await assert.rejects(worker.begin(lease),/model_preflight_rejected/)
    assert.deepEqual(await worker.failPreflight(lease),{status:'failed',run_id:s.run})
    assert.equal((await f.state(s)).status,'failed')
    const run=(await f.admin.query('SELECT status,last_error_code FROM agentstudio.runs WHERE id=$1 AND owner_user_id=$2',[s.run,s.owner])).rows[0]
    assert.deepEqual(run,{status:'failed',last_error_code:'model_preflight_failed'})
    assert.equal(f.providerCalls(),0);assert.deepEqual(modelSafeCounts(worker),[true,0,0])
   },{malformed:true})
  })
  await t.test('safe: separate owned-test LOGIN executes original deterministic held Start/End and finishes after close',async()=>{
   await scenario('safe',{owned:true},async({s,worker,start})=>{
    const lease=await modelSafeBounded(start(),'held_safe_start_end');worker.closeNewClaims()
    // TS-private existing method is invoked on the actual saved class. It has
    // no provider/tool/MCP path and is not replaced or monkey-patched.
    assert.deepEqual(await worker.execute(lease),{status:'succeeded',run_id:s.run,steps_completed:2})
    const run=(await f.admin.query('SELECT status,step_count,checkpoint FROM agentstudio.runs WHERE id=$1 AND owner_user_id=$2',[s.run,s.owner])).rows[0]
    assert.equal(run.status,'succeeded');assert.equal(run.step_count,2);assert.equal(run.checkpoint.stage,'workflow_safe_succeeded')
    const steps=(await f.admin.query("SELECT step_key,status,metadata->>'external_effects_executed' AS effects FROM agentstudio.run_steps WHERE run_id=$1 AND owner_user_id=$2 ORDER BY step_key",[s.run,s.owner])).rows
    assert.deepEqual(steps,[{step_key:'workflow:end',status:'succeeded',effects:'false'},{step_key:'workflow:start',status:'succeeded',effects:'false'}])
    assert.equal((await f.state(s)).status,'succeeded');assert.equal(f.providerCalls(),0)
    assert.deepEqual(modelSafeCounts(worker),[true,0,0])
   })
  })
  await t.test('final original FULL060 and restricted actual LOGIN remain intact with zero model/external calls',async()=>{
   await f.full()
   const db=await f.runtimePool.connect();try{await f.verifyRuntime(db)}finally{db.release()}
   assert.equal(f.providerCalls(),0)
   assert.equal((await f.admin.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
   assert.ok((await f.admin.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE action='workflow.safe_run_succeeded'")).rows[0].n>=1)
   await f.assertEmpty('model');await f.assertEmpty('safe')
  })
 }finally{await f.close()}
})
