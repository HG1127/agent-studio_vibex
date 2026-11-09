// Genuine hosted TCP cases, authored only. The v2-schedule matrix member must
// get a NEW empty PG18 service; never reuse dormant, prepare or telemetry DBs.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'

// All drivers, fixtures, Workers and side effects stay below this exact gate.
const capability=requireWorkerHeartbeatCi()
const {v2ScheduleClaimTcpFixture,v2ScheduleScopeStages,v2ScheduleCounts,v2ScheduleBounded}=await import('./helpers/workflow-v2-schedule-claim-admission-ci.mjs')

test('workflow008 autonomous009 and schedule actual admission beside unchanged full060',{concurrency:false,timeout:600000},async t=>{
 const f=await v2ScheduleClaimTcpFixture(capability)
 let serial=0
 const scenario=async(lane,options,body,{seed=true,malformed=false}={})=>{
  await f.assertEmpty(lane)
  const s=seed?await f.seed(lane,'case_'+(++serial),{malformed}):null,p=f.probe(lane,options)
  const worker=f.worker(lane,p.pool,lane+'_claim_ci_'+(++serial))
  assert.deepEqual(worker.claimAdmissionSnapshot().lanes.map(x=>x.lane),[lane])
  let work
  const start=(operation=()=>worker.claim())=>{work=operation();work.catch(()=>{});return work}
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
  for(const lane of ['workflow_native_v2','agent_native_v2']){
   const sqlNumber=lane==='agent_native_v2'?'009':'008'
   await t.test(lane+': repeated close prevents new real connections or claim SQL',async()=>{
    await scenario(lane,{},async({p,worker})=>{
     worker.closeNewClaims();worker.closeNewClaims()
     assert.equal(await worker.claim(),null);assert.equal(p.trace.length,0)
     assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    },{seed:false})
   })
   await t.test(lane+': empty real'+sqlNumber+' result remains pending until actual COMMIT ACK delivery',async()=>{
    await scenario(lane,{holds:['COMMIT']},async({p,worker,start})=>{
     const work=start(),commit=await p.hit('COMMIT'),claim=p.trace.find(row=>row.sql===f.claimSql[lane])
     assert.equal(commit.command,'COMMIT');assert.equal(claim.settled,true)
     assert.equal(claim.result.rowCount,0);assert.deepEqual(claim.result.rows,[])
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0])
     p.release('COMMIT');assert.equal(await v2ScheduleBounded(work,'empty_commit'),null)
     assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    },{seed:false})
   })
   const stages=['connect','BEGIN',...v2ScheduleScopeStages,'SET LOCAL ROLE agentstudio_worker']
   for(const stage of stages){
    await t.test(lane+': close after real '+stage+' completion prevents'+sqlNumber+' and leaves the owned synthetic row queued',async()=>{
     await scenario(lane,{holds:[stage]},async({s,p,worker,start})=>{
      const work=start();await p.hit(stage)
      worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,0,0]);p.release(stage)
      assert.equal(await v2ScheduleBounded(work,'final_gate'),null);assert.equal(sent(p,lane),0)
      await queued(s);assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
     })
    })
   }
   await t.test(lane+': real claim row is locked and uncommitted during withheld result delivery after close',async()=>{
    await scenario(lane,{holds:['claim']},async({s,p,worker,start})=>{
     const work=start(),result=await p.hit('claim'),pid=await p.pid
     assert.equal(result.rowCount,1);assert.equal(result.rows[0].id,s.job);assert.equal(result.rows[0].lease_owner,worker.workerId)
     const activity=await f.activity(pid)
     assert.equal(activity.login,f.login);assert.equal(activity.state,'idle in transaction');assert.equal(activity.xid,true)
     await f.rowLock('jobs',s.job,true);await queued(s)
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0])
     p.release('claim');const lease=await v2ScheduleBounded(work,'held_claim_row')
     assert.strictEqual(lease,result.rows[0],'return original real pg row')
     assert.equal((await f.state(s)).status,'leased');assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': COMMIT visible and row unlocked server-side while withheld ACK keeps local pending',async()=>{
    await scenario(lane,{holds:['COMMIT']},async({s,p,worker,start})=>{
     const work=start(),result=await p.hit('COMMIT')
     assert.equal(result.command,'COMMIT');assert.equal((await f.state(s)).status,'leased');await f.rowLock('jobs',s.job,false)
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0])
     p.release('COMMIT');assert.equal((await v2ScheduleBounded(work,'commit_delivery')).id,s.job)
     assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': lost ACK after real COMMIT remains unknown through a real successful subsequent ROLLBACK',async()=>{
    await scenario(lane,{holds:['COMMIT'],loseAckAt:['COMMIT']},async({s,p,worker,start})=>{
     const work=start();await p.hit('COMMIT');assert.equal((await f.state(s)).status,'leased')
     worker.closeNewClaims();p.release('COMMIT')
     await assert.rejects(v2ScheduleBounded(work,'lost_commit_ack'),e=>e===p.lost)
     const rollback=p.trace.find(row=>row.sql==='ROLLBACK')
     assert.equal(rollback.settled,true);assert.equal(rollback.result.command,'ROLLBACK')
     assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);await rejectReplay(p,lane,worker)
     assert.equal((await f.state(s)).attempts,1)
    })
   })
   await t.test(lane+': later confirmed empty claim cannot erase an older lost-COMMIT intent',async()=>{
    await scenario(lane,{loseAckAt:['COMMIT']},async({s,p,worker,start})=>{
     await assert.rejects(v2ScheduleBounded(start(),'first_lost_commit'),e=>e===p.lost)
     assert.equal((await f.state(s)).status,'leased');assert.deepEqual(v2ScheduleCounts(worker),[false,1,1])
     // Same instance, pool and backend contract. The old row is still leased;
     // the original SQL genuinely returns no eligible row on the second call.
     assert.equal(await worker.claim(),null);assert.equal(sent(p,lane),2)
     assert.deepEqual(v2ScheduleCounts(worker),[false,1,1])
     worker.closeNewClaims();await rejectReplay(p,lane,worker)
     assert.deepEqual(v2ScheduleCounts(worker),[true,1,1])
    })
   })
   await t.test(lane+': pre-COMMIT delivery loss settles only after real ROLLBACK ACK delivery',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseAckAt:['claim']},async({s,p,worker,start})=>{
     const work=start();await p.hit('claim');await f.rowLock('jobs',s.job,true)
     worker.closeNewClaims();p.release('claim');const rollback=await p.hit('ROLLBACK')
     assert.equal(rollback.command,'ROLLBACK');await queued(s);await f.rowLock('jobs',s.job,false)
     assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);assert.equal(p.trace.some(row=>row.sql==='COMMIT'),false)
     p.release('ROLLBACK');await assert.rejects(v2ScheduleBounded(work,'known_rollback'),e=>e===p.lost)
     assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    })
   })
   await t.test(lane+': losing actual ROLLBACK ACK leaves unknown even when the observer sees rollback',async()=>{
    await scenario(lane,{holds:['claim','ROLLBACK'],loseAckAt:['claim','ROLLBACK']},async({s,p,worker,start})=>{
     const work=start();await p.hit('claim');worker.closeNewClaims();p.release('claim');await p.hit('ROLLBACK')
     await queued(s);assert.deepEqual(v2ScheduleCounts(worker),[true,1,1])
     p.release('ROLLBACK');await assert.rejects(v2ScheduleBounded(work,'lost_rollback_ack'),e=>e===p.lost)
     assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);await rejectReplay(p,lane,worker)
    })
   })
   for(const after of ['claim','COMMIT']){
    await t.test(lane+': actual socket destruction after '+after+' produces real failed rollback and sticky unknown',async()=>{
     await scenario(lane,{holds:[after],disconnectAt:after},async({s,p,worker,start})=>{
      const work=start();await p.hit(after)
      if(after==='claim'){await f.rowLock('jobs',s.job,true);await queued(s)}else{assert.equal((await f.state(s)).status,'leased');await f.rowLock('jobs',s.job,false)}
      worker.closeNewClaims();p.release(after)
      await assert.rejects(v2ScheduleBounded(work,'actual_socket_loss'),e=>e===p.lost)
      const rollback=p.trace.find(row=>row.sql==='ROLLBACK')
      assert.ok(rollback);assert.equal(rollback.rejected,true);assert.equal(rollback.settled,false)
      const observed=await f.waitDisconnected(await p.pid,()=>f.state(s),after==='claim'?'queued':'leased')
      assert.equal(observed.attempts,after==='claim'?0:1)
      // Independent observer truth is never passed to local confirm().
      assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);await rejectReplay(p,lane,worker)
     })
    })
   }
   await t.test(lane+': minimal actual worker LOGIN retains fenced003 finish for an already held lease after close',async()=>{
    await scenario(lane,{},async({s,worker,start})=>{
     const lease=await v2ScheduleBounded(start(),'minimal_held_claim');worker.closeNewClaims()
     const db=await f.runtimePool.connect()
     try{
      await f.verifyRuntime(db);await db.query('BEGIN');await db.query('SET LOCAL ROLE agentstudio_worker')
      const done=await db.query(f.finishSql,[lease.id,lease.lease_token,lease.lease_version,worker.workerId,'succeeded'])
      assert.equal(done.rows.length,1);assert.equal(done.rows[0].id,s.job);await db.query('COMMIT')
     }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
     assert.equal((await f.state(s)).status,'succeeded');assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    })
   })
  }

  for(const mode of ['workflow_native_v2','agent_native_v2']){
   await t.test(mode+': actual malformed claim row is rejected inside the tracked transaction before COMMIT',async()=>{
    await scenario(mode,{holds:['claim','ROLLBACK']},async({s,p,worker,start})=>{
     const work=start(),result=await p.hit('claim')
     assert.equal(result.rows[0].id,s.job);assert.equal(Object.hasOwn(result.rows[0].payload,'graph_sha256'),false)
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0]);p.release('claim')
     const rollback=await p.hit('ROLLBACK');assert.equal(rollback.command,'ROLLBACK')
     await queued(s);assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);assert.equal(p.trace.some(row=>row.sql==='COMMIT'),false)
     p.release('ROLLBACK');await assert.rejects(v2ScheduleBounded(work,'invalid_claim_row'),/invalid_workflow_v2_claim/)
     assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    },{malformed:true})
   })
   await t.test(mode+': stop during actual empty reconcile transaction prevents the next008/009 claim',async()=>{
    await scenario(mode,{holds:['reconcile']},async({s,p,worker,start})=>{
     const work=start(()=>worker.tick()),result=await p.hit('reconcile')
     assert.equal(result.rowCount,0);assert.deepEqual(result.rows,[])
     worker.closeNewClaims();p.release('reconcile');assert.equal((await v2ScheduleBounded(work,'reconcile_then_stop')).status,'idle')
     assert.equal(sent(p,mode),0);await queued(s);assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
    })
   })
  }
  const scheduleScenario=async(options,body,{seed=true}={})=>{
   await f.assertNoDue()
   const s=seed?await f.seedSchedule('case_'+(++serial)):null,p=f.probe('schedule',options)
   const worker=f.scheduler(p.pool,'schedule_claim_ci_'+(++serial))
   let work
   const start=(operation=()=>worker.tick())=>{work=operation();work.catch(()=>{});return work}
   try{return await body({s,p,worker,start})}
   finally{try{await p.settle(work)}finally{await f.cleanupSchedule(s)}}
  }
  const reserves=p=>p.trace.filter(row=>row.name==='reserve').length
  const pendingSchedule=async s=>{
   const row=await f.scheduleState(s);assert.equal(row.status,'pending');assert.equal(row.attempts,0)
   assert.equal(row.origins,0);assert.equal(row.runs,0);assert.equal(row.jobs,0);return row
  }
  const startedSchedule=async(s,worker)=>{
   const row=await f.scheduleState(s);assert.equal(row.status,'started');assert.equal(row.attempts,1)
   assert.equal(row.id,s.occurrence);assert.equal(row.run_id,s.planned);assert.equal(row.planned_run_id,s.planned)
   assert.equal(row.origins,1);assert.equal(row.runs,1);assert.equal(row.jobs,1)
   if(worker)assert.deepEqual(v2ScheduleCounts(worker),[true,0,0]);return row
  }
  await t.test('scheduler: close before tick prevents even a real peek connection',async()=>{
   await scheduleScenario({},async({p,worker,start})=>{
    worker.closeNewClaims();worker.closeNewClaims();assert.equal((await start()).status,'idle')
    assert.equal(p.connections(),0);assert.equal(reserves(p),0);assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
   },{seed:false})
  })
  await t.test('scheduler: stop after genuine peek result leaves the existing due occurrence pending and never reserves',async()=>{
   await scheduleScenario({holds:['peek']},async({s,p,worker,start})=>{
    const work=start(),result=await p.hit('peek');assert.equal(result.rows[0].item.occurrence_id,s.occurrence)
    worker.closeNewClaims();p.release('peek');assert.equal((await v2ScheduleBounded(work,'peek_stop')).status,'idle')
    assert.equal(reserves(p),0);await pendingSchedule(s);assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
   })
  })
  for(const stage of ['connect:2','BEGIN:2',...v2ScheduleScopeStages.map(name=>name+':2'),'SET LOCAL ROLE agentstudio_worker:2']){
   await t.test('scheduler: stop after actual reserve prelude '+stage+' prevents final reserve dispatch',async()=>{
    await scheduleScenario({holds:[stage]},async({s,p,worker,start})=>{
     const work=start();await p.hit(stage);assert.equal(p.trace.some(row=>row.name==='peek'&&row.settled),true)
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,0,0]);p.release(stage)
     await v2ScheduleBounded(work,'reserve_prelude_stop');assert.equal(reserves(p),0);await pendingSchedule(s)
    })
   })
  }
  await t.test('scheduler: issued real reserve holds occurrence lock and pending, then close still launches the owned work',async()=>{
   await scheduleScenario({owned:true,holds:['reserve']},async({s,p,worker,start})=>{
    const work=start(),result=await p.hit('reserve')
    assert.equal(result.rows[0].claim.occurrence_id,s.occurrence);assert.equal(result.rows[0].claim.worker_id,worker.workerId)
    await pendingSchedule(s);await f.rowLock('schedule_occurrences',s.occurrence,true)
    const activity=await f.activity(p.pids[1]);assert.equal(activity.login,f.ownedLogin);assert.equal(activity.state,'idle in transaction')
    worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0]);p.release('reserve')
    assert.equal((await v2ScheduleBounded(work,'held_reserved_occurrence')).status,'started');await startedSchedule(s,worker)
    assert.equal(reserves(p),1);assert.equal(p.trace.filter(row=>row.name==='register_origin').length,1)
   })
  })
  await t.test('scheduler: reserve COMMIT is visible but cannot settle pending before the original launch commits',async()=>{
   await scheduleScenario({owned:true,holds:['COMMIT:2']},async({s,p,worker,start})=>{
    const work=start(),commit=await p.hit('COMMIT:2');assert.equal(commit.command,'COMMIT')
    const row=await f.scheduleState(s);assert.equal(row.status,'launching');assert.equal(row.attempts,1);assert.equal(row.runs,0)
    await f.rowLock('schedule_occurrences',s.occurrence,false)
    worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0]);p.release('COMMIT:2')
    assert.equal((await v2ScheduleBounded(work,'reserve_commit_then_launch')).status,'started');await startedSchedule(s,worker)
   })
  })
  for(const stage of ['connect:3','BEGIN:3',...v2ScheduleScopeStages.map(name=>name+':3'),'SET LOCAL ROLE agentstudio_worker:3']){
   await t.test('scheduler: stop during real held-launch prelude '+stage+' retains pending and completes the original owned launch',async()=>{
    await scheduleScenario({owned:true,holds:[stage]},async({s,p,worker,start})=>{
     const work=start();await p.hit(stage)
     const row=await f.scheduleState(s);assert.equal(row.status,'launching');assert.equal(row.origins,0);assert.equal(row.runs,0)
     assert.equal(p.trace.some(record=>record.sql==='COMMIT'&&record.connection===2&&record.settled),true)
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0]);p.release(stage)
     assert.equal((await v2ScheduleBounded(work,'held_launch_prelude')).status,'started');await startedSchedule(s,worker)
     assert.equal(reserves(p),1)
    })
   })
  }
  for(const stage of ['admit_run','register_origin','COMMIT:3']){
   await t.test('scheduler: actual owned '+stage+' result barrier retains one intent after reserve commit and stop',async()=>{
    await scheduleScenario({owned:true,holds:[stage]},async({s,p,worker,start})=>{
     const work=start(),result=await p.hit(stage)
     if(stage==='admit_run')assert.equal(result.rows[0].id,s.planned)
     if(stage==='register_origin')assert.equal(result.rows[0].ok,true)
     if(stage==='COMMIT:3'){assert.equal(result.command,'COMMIT');await startedSchedule(s)}
     else{const row=await f.scheduleState(s);assert.equal(row.status,'launching');assert.equal(row.runs,0);assert.equal(row.origins,0);await f.rowLock('schedule_occurrences',s.occurrence,true)}
     worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,0]);p.release(stage)
     const out=await v2ScheduleBounded(work,'owned_launch_barrier');assert.equal(out.status,'started');assert.equal(out.run_id,s.planned)
     await startedSchedule(s,worker);assert.equal(reserves(p),1)
     assert.equal(p.trace.filter(row=>row.name==='admit_run').length,1);assert.equal(p.trace.filter(row=>row.name==='register_origin').length,1)
    })
   })
  }
  await t.test('scheduler: minimal worker-only login still reserves and runs original failure bookkeeping when API SET is denied',async()=>{
   await scheduleScenario({holds:['reserve']},async({s,p,worker,start})=>{
    const work=start();await p.hit('reserve');worker.closeNewClaims();p.release('reserve')
    assert.equal((await v2ScheduleBounded(work,'minimal_no_api_failure')).status,'retryable')
    const rejected=p.trace.find(row=>row.sql==='SET LOCAL ROLE agentstudio_api')
    assert.equal(rejected.rejected,true);assert.equal(rejected.error_code,'42501')
    assert.equal(p.trace.filter(row=>row.name==='launch_failed').length,1)
    const row=await f.scheduleState(s);assert.equal(row.id,s.occurrence);assert.equal(row.status,'retryable');assert.equal(row.runs,0);assert.equal(row.origins,0)
    assert.deepEqual(v2ScheduleCounts(worker),[true,0,0])
   })
  })
  await t.test('scheduler: reserve lost COMMIT remains unknown through idle tick and a later independent held launch after close',async()=>{
   await scheduleScenario({owned:true,loseAckAt:['COMMIT:2']},async({s,p,worker,start})=>{
    await assert.rejects(v2ScheduleBounded(start(),'reserve_commit_lost'),error=>error===p.lost)
    assert.equal((await f.scheduleState(s)).status,'launching');assert.deepEqual(v2ScheduleCounts(worker),[false,1,1])
    assert.equal((await worker.tick()).status,'idle');assert.deepEqual(v2ScheduleCounts(worker),[false,1,1])
    worker.closeNewClaims();await f.cleanupSchedule(s) // Disposal after proof, never a local confirm.
    const next=await f.seedSchedule('independent_held_after_unknown')
    try{
     const held=await f.reserveOwned(next,worker.workerId)
     const result=await worker.launch(held);assert.equal(result.status,'started');assert.equal(result.run_id,next.planned)
     await startedSchedule(next);assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);assert.equal(reserves(p),1)
    }finally{await f.cleanupSchedule(next)}
   })
  })
  await t.test('scheduler: lost launch COMMIT keeps unknown even after real failure RPC confirms already_started',async()=>{
   await scheduleScenario({owned:true,loseAckAt:['COMMIT:3']},async({s,p,worker,start})=>{
    assert.equal((await v2ScheduleBounded(start(),'launch_commit_lost')).status,'already_started')
    await startedSchedule(s);assert.equal(p.trace.filter(row=>row.name==='launch_failed').length,1)
    assert.deepEqual(v2ScheduleCounts(worker),[false,1,1]);assert.equal((await worker.tick()).status,'idle')
    worker.closeNewClaims();assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);assert.equal(reserves(p),1)
   })
  })
  await t.test('scheduler: pre-COMMIT reserve result loss settles only when the actual rollback ACK arrives',async()=>{
   await scheduleScenario({holds:['reserve','ROLLBACK:2'],loseAckAt:['reserve']},async({s,p,worker,start})=>{
    const work=start();await p.hit('reserve');worker.closeNewClaims();p.release('reserve')
    const rollback=await p.hit('ROLLBACK:2');assert.equal(rollback.command,'ROLLBACK');await pendingSchedule(s)
    assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);p.release('ROLLBACK:2')
    await assert.rejects(v2ScheduleBounded(work,'reserve_rollback_ack'),error=>error===p.lost)
    assert.deepEqual(v2ScheduleCounts(worker),[true,0,0]);assert.equal(p.trace.some(row=>row.name==='launch_context'),false)
   })
  })
  for(const lostRollback of [false,true]){
   await t.test('scheduler: register_origin result loss with '+(lostRollback?'lost':'known')+' rollback ACK preserves original failure ledger and certainty boundary',async()=>{
    await scheduleScenario({owned:true,holds:['register_origin','ROLLBACK:3'],loseAckAt:['register_origin',...(lostRollback?['ROLLBACK:3']:[])]},async({s,p,worker,start})=>{
     const work=start(),registered=await p.hit('register_origin');assert.equal(registered.rows[0].ok,true)
     worker.closeNewClaims();p.release('register_origin');await p.hit('ROLLBACK:3')
     const during=await f.scheduleState(s);assert.equal(during.status,'launching');assert.equal(during.origins,0);assert.equal(during.runs,0)
     assert.deepEqual(v2ScheduleCounts(worker),[true,1,1]);p.release('ROLLBACK:3')
     assert.equal((await v2ScheduleBounded(work,'origin_then_failure')).status,'retryable')
     const row=await f.scheduleState(s);assert.equal(row.id,s.occurrence);assert.equal(row.status,'retryable');assert.equal(row.runs,0);assert.equal(row.jobs,0);assert.equal(row.origins,0)
     assert.equal(p.trace.filter(row=>row.name==='launch_failed').length,1)
     assert.deepEqual(v2ScheduleCounts(worker),[true,lostRollback?1:0,lostRollback?1:0])
    })
   })
  }
  await t.test('scheduler: actual socket loss after reserve preserves unknown despite independent rollback observation',async()=>{
   await scheduleScenario({holds:['reserve'],disconnectAt:'reserve'},async({s,p,worker,start})=>{
    const work=start();await p.hit('reserve');await f.rowLock('schedule_occurrences',s.occurrence,true)
    worker.closeNewClaims();p.release('reserve');await assert.rejects(v2ScheduleBounded(work,'schedule_socket_loss'),error=>error===p.lost)
    const rollback=p.trace.find(row=>row.sql==='ROLLBACK');assert.equal(rollback.rejected,true);assert.equal(rollback.settled,false)
    await f.waitDisconnected(p.pids[1],()=>f.scheduleState(s),'pending');assert.deepEqual(v2ScheduleCounts(worker),[true,1,1])
    assert.equal((await worker.tick()).status,'idle');assert.equal(reserves(p),1)
   })
  })
  await t.test('scheduler: direct public held launch registers before pool await and stays usable after close',async()=>{
   await scheduleScenario({owned:true,holds:['connect:1']},async({s,p,worker,start})=>{
    const claim=await f.reserveOwned(s,worker.workerId);worker.closeNewClaims()
    const work=start(()=>worker.launch(claim));await p.hit('connect:1');assert.deepEqual(v2ScheduleCounts(worker),[true,1,0])
    p.release('connect:1');assert.equal((await v2ScheduleBounded(work,'direct_owned_launch')).status,'started')
    await startedSchedule(s,worker);assert.equal(reserves(p),0);assert.equal(p.trace.some(row=>row.name==='peek'),false)
   })
  })
  await t.test('final unchanged FULL060, original disabled stage flags and zero executed external effects',async()=>{
   await f.full();await f.assertEmpty('workflow_native_v2');await f.assertEmpty('agent_native_v2');await f.assertNoDue()
   for(const [pool,login]of [[f.runtimePool,f.login],[f.ownedPool,f.ownedLogin]]){const db=await pool.connect();try{await f.verifyRuntime(db,login)}finally{db.release()}}
   assert.equal((await f.admin.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
   assert.ok((await f.admin.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE action='schedule.dispatched'")).rows[0].n>=1)
  })
 }finally{await f.close()}
})
