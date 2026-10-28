// Genuine hosted-only prepare claim/transaction admission. Authored, not a
// local SQL test. Each matrix case must have a NEW empty PG18 service.
import test from 'node:test'
import assert from 'node:assert/strict'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'

// All driver, runtime, fixture imports and writes must remain BELOW this gate.
const capability=requireWorkerHeartbeatCi()
const {prepareClaimTcpFixture,prepareScopeStages,prepareCounts,prepareBounded}=await import('./helpers/agent-prepare-claim-admission-ci.mjs')

test('prepare admission on actual independent LOGINs beside unchanged full060',{concurrency:false,timeout:300000},async t=>{
 const f=await prepareClaimTcpFixture(capability)
 let serial=0
 const scenario=async(options,body,{seed=true}={})=>{
  const s=seed?await f.seed('case-'+(++serial)):null,p=f.probe(options)
  const worker=new f.AgentPrepareWorker(p.pool,'prepare_ci_'+(++serial))
  let work
  const start=()=>{work=worker.claim();work.catch(()=>{});return work}
  try{return await body({s,p,worker,start})}
  finally{try{await p.settle(work)}finally{await f.cleanupSeed(s)}}
 }
 try{
  await t.test('full001..060 and exact minimal real LOGIN, with no API role or admin impersonation',async()=>{
   await f.full()
   const db=await f.runtimePool.connect()
   try{
    const identity=await f.verifyRuntime(db)
    assert.equal(identity.login,f.login)
    const rights=(await db.query("SELECT pg_has_role(session_user,'agentstudio_api','MEMBER') AS api,pg_has_role(session_user,'agentstudio_worker','MEMBER') AS worker")).rows[0]
    assert.deepEqual(rights,{api:false,worker:true})
    await db.query('BEGIN')
    await assert.rejects(db.query('SET LOCAL ROLE agentstudio_api'),e=>e.code==='42501')
   }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
  })
  await t.test('actual empty005 result remains pending until withheld real COMMIT ACK is delivered',async()=>{
   await scenario({holds:['COMMIT']},async({p,worker,start})=>{
    const work=start();await p.hit('COMMIT')
    const claim=p.trace.find(r=>r.sql===f.claimSql)
    assert.equal(claim.settled,true);assert.equal(claim.result.rowCount,0);assert.deepEqual(claim.result.rows,[])
    worker.closeNewClaims();assert.deepEqual(prepareCounts(worker),[true,1,0])
    p.release('COMMIT');assert.equal(await prepareBounded(work,'empty_commit'),null)
    assert.deepEqual(prepareCounts(worker),[true,0,0])
   },{seed:false})
  })
  for(const stage of ['connect','BEGIN',...prepareScopeStages,'SET LOCAL ROLE agentstudio_worker']){
   await t.test('close after actual '+stage+' completion prevents005 and leaves the synthetic job queued',async()=>{
    await scenario({holds:[stage]},async({s,p,worker,start})=>{
     const work=start();await p.hit(stage);worker.closeNewClaims()
     assert.deepEqual(prepareCounts(worker),[true,0,0]);p.release(stage)
     assert.equal(await prepareBounded(work,'closed_before_claim'),null)
     assert.equal(p.trace.some(r=>r.sql===f.claimSql),false)
     const row=await f.state(s);assert.equal(row.status,'queued');assert.equal(row.attempts,0);assert.equal(row.lease_token,null)
     assert.deepEqual(prepareCounts(worker),[true,0,0])
    })
   })
  }
  await t.test('real005 lease is uncommitted and row-locked while ACK/validation is delayed after close',async()=>{
   await scenario({holds:['claim']},async({s,p,worker,start})=>{
    const work=start(),result=await p.hit('claim'),pid=await p.pid
    assert.equal(result.rows[0].id,s.job);assert.equal(result.rows[0].lease_owner,worker.workerId)
    const activity=(await f.admin.query('SELECT state,backend_xid IS NOT NULL AS xid FROM pg_catalog.pg_stat_activity WHERE pid=$1',[pid])).rows[0]
    assert.equal(activity.state,'idle in transaction');assert.equal(activity.xid,true)
    await f.locked(s);assert.equal((await f.state(s)).status,'queued')
    worker.closeNewClaims();assert.deepEqual(prepareCounts(worker),[true,1,0])
    p.release('claim');const lease=await prepareBounded(work,'claim_ack_then_commit')
    assert.equal(lease.id,s.job);assert.deepEqual(prepareCounts(worker),[true,0,0])
    assert.equal((await f.state(s)).status,'leased')
   })
  })
  await t.test('real COMMIT is visible to another connection while its withheld ACK keeps pending',async()=>{
   await scenario({holds:['COMMIT']},async({s,p,worker,start})=>{
    const work=start(),commit=await p.hit('COMMIT')
    assert.equal(commit.command,'COMMIT');assert.equal((await f.state(s)).status,'leased')
    worker.closeNewClaims();assert.deepEqual(prepareCounts(worker),[true,1,0])
    p.release('COMMIT');assert.equal((await prepareBounded(work,'commit_ack')).id,s.job)
    assert.deepEqual(prepareCounts(worker),[true,0,0])
   })
  })
  await t.test('lost ACK AFTER actual COMMIT stays uncertain through an actual successful subsequent ROLLBACK',async()=>{
   await scenario({holds:['COMMIT'],loseCommitAck:true},async({s,p,worker,start})=>{
    const work=start();await p.hit('COMMIT')
    assert.equal((await f.state(s)).status,'leased');worker.closeNewClaims();p.release('COMMIT')
    await assert.rejects(prepareBounded(work,'lost_commit_ack'),e=>e===p.lost)
    const rollback=p.trace.find(r=>r.sql==='ROLLBACK')
    assert.equal(rollback.settled,true);assert.equal(rollback.result.command,'ROLLBACK')
    assert.deepEqual(prepareCounts(worker),[true,1,1])
    const sent=p.trace.filter(r=>r.sql===f.claimSql).length
    assert.equal(await worker.claim(),null);assert.equal(p.trace.filter(r=>r.sql===f.claimSql).length,sent)
    assert.equal((await f.state(s)).attempts,1)
   })
  })
  await t.test('pre-COMMIT delivery failure settles only after the actual ROLLBACK ACK is delivered',async()=>{
   await scenario({holds:['claim','ROLLBACK'],loseClaimAck:true},async({s,p,worker,start})=>{
    const work=start();await p.hit('claim');worker.closeNewClaims();p.release('claim')
    const rollback=await p.hit('ROLLBACK')
    assert.equal(rollback.command,'ROLLBACK');assert.deepEqual(prepareCounts(worker),[true,1,1])
    assert.equal((await f.state(s)).status,'queued');assert.equal(p.trace.some(r=>r.sql==='COMMIT'),false)
    p.release('ROLLBACK');await assert.rejects(prepareBounded(work,'rollback_ack'),e=>e===p.lost)
    assert.deepEqual(prepareCounts(worker),[true,0,0])
   })
  })
  await t.test('actual socket loss after005 cannot confirm rollback, clear uncertainty or resend after close',async()=>{
   await scenario({holds:['claim'],disconnectAfterClaim:true},async({s,p,worker,start})=>{
    const work=start();await p.hit('claim');await f.locked(s)
    worker.closeNewClaims();p.release('claim')
    await assert.rejects(prepareBounded(work,'real_socket_loss'))
    assert.deepEqual(prepareCounts(worker),[true,1,1])
    assert.equal(p.trace.some(r=>r.sql==='ROLLBACK'&&r.settled),false)
    const serverRow=await f.waitDisconnected(await p.pid,s);assert.equal(serverRow.attempts,0)
    // Observer knowledge is NOT supplied as caller rollback confirmation.
    assert.deepEqual(prepareCounts(worker),[true,1,1])
    const sent=p.trace.filter(r=>r.sql===f.claimSql).length
    assert.equal(await worker.claim(),null);assert.equal(p.trace.filter(r=>r.sql===f.claimSql).length,sent)
   })
  })
  await t.test('a minimal real worker LOGIN can finish its already owned fenced job after close',async()=>{
   await scenario({},async({s,worker,start})=>{
    const lease=await prepareBounded(start(),'owned_minimal_claim');worker.closeNewClaims()
    const db=await f.runtimePool.connect()
    try{
     await f.verifyRuntime(db);await db.query('BEGIN');await db.query('SET LOCAL ROLE agentstudio_worker')
     const done=await db.query(f.finishSql,[lease.id,lease.lease_token,lease.lease_version,worker.workerId,'succeeded'])
     assert.equal(done.rows.length,1);await db.query('COMMIT')
    }finally{await db.query('ROLLBACK').catch(()=>{});db.release()}
    assert.equal((await f.state(s)).status,'succeeded');assert.deepEqual(prepareCounts(worker),[true,0,0])
   })
  })
  await t.test('existing original stage Worker LOGIN retains authorized held prepare/approval/finish after close',async()=>{
   await scenario({stage:true},async({s,worker,start})=>{
    const lease=await prepareBounded(start(),'owned_stage_claim');worker.closeNewClaims()
    assert.deepEqual(await worker.prepare(lease),{status:'prepared',run_id:s.run})
    const observed=(await f.admin.query("SELECT r.status,(SELECT count(*)::integer FROM agentstudio.run_steps x WHERE x.run_id=r.id AND x.step_key='prepare') AS steps,(SELECT count(*)::integer FROM agentstudio.approvals a WHERE a.run_id=r.id AND a.step_key='model') AS approvals FROM agentstudio.runs r WHERE r.id=$1",[s.run])).rows[0]
    assert.deepEqual(observed,{status:'awaiting_approval',steps:1,approvals:1})
    assert.equal((await f.state(s)).status,'succeeded');assert.deepEqual(prepareCounts(worker),[true,0,0])
   })
  })
  await t.test('final genuine unchanged FULL060, runtime login boundary and audit history remain intact',async()=>{
   await f.full()
   const db=await f.runtimePool.connect();try{await f.verifyRuntime(db)}finally{db.release()}
   assert.equal((await f.admin.query('SELECT count(*)::integer AS n FROM agentstudio.external_effects')).rows[0].n,0)
   assert.ok((await f.admin.query("SELECT count(*)::integer AS n FROM agentstudio.audit_events WHERE action='agent.prepare'")).rows[0].n>=1)
  })
 }finally{await f.close()}
})
