// Author-only until the dedicated fresh hosted telemetry-runtime matrix runs.
// No Worker, provider, Native authorization or production activation is tested.
import test from 'node:test'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'

// Original real-host capability before runtime/fixture import, SQL or sockets.
const capability=requireWorkerHeartbeatCi()
const {workerHeartbeatRuntimeFixture,heartbeatRuntimeSafeError}=await import('./helpers/worker-heartbeat-runtime-ci.mjs')

test('actual restricted telemetry RPCs beside unchanged full060/full061',{concurrency:false,timeout:600000},async t=>{
 let f
 const scenario=(name,fn)=>t.test(name,{concurrency:false,timeout:60000},async()=>{try{await fn()}catch(error){throw heartbeatRuntimeSafeError('case_failed',error)}})
 try{
  f=await workerHeartbeatRuntimeFixture(capability)
  const row=(snapshot,kind='prepare')=>snapshot.workers.find(value=>value.kind===kind)
  const expect=(value,state,reason,seen)=>{f.check(value.state===state&&value.reason===reason,'projection_state_reason');if(seen===null)f.check(value.last_seen_at===null,'projection_null_time');else if(seen!==undefined)f.check(value.last_seen_at===seen,'projection_selected_time')}
  await scenario('17 actual independent LOGINs retain fixed role/OID/slot/flags and connection limits',async()=>{await f.openActors();await f.connectionLimits()})
  await scenario('notinstrumented and activated-but-notobserved projections keep all eight ordered null timestamps',async()=>{
   for(const value of (await f.snapshot()).workers)expect(value,'unknown','not_instrumented',null)
   for(const kind of f.kinds)await f.reset(kind)
   for(const value of (await f.snapshot()).workers)expect(value,'unknown','not_observed',null)
   await f.expectActiveAuditRefused()
  })
  await scenario('real five-primitive RPC rejects malformed protocol/generation/sequence/state/reason and extra identity fields',async()=>{
   const a=f.actor('prepare',1)
   for(const value of [null,'wrong_protocol',{}])await f.rejectReport(a,1,'ready','startup_checks_complete',{protocol:value})
   for(const value of [null,'not_uuid','ABCDEFAB-0000-4000-8000-000000000001','10000000-0000-1000-8000-000000000001',{}])await f.rejectReport(a,1,'ready','startup_checks_complete',{generation:value})
   for(const value of [null,0,-1,'9007199254740992'])await f.rejectReport(a,value)
   await f.rejectReport(a,'1.5','ready','startup_checks_complete',{},'22P02')
   for(const [state,reason]of [[null,'startup_checks_complete'],['ready',null],['unknown','startup_checks_complete'],['ready','loop_unavailable'],['draining','startup_checks_pending'],['READY','startup_checks_complete'],['ready','arbitrary_reason']])await f.rejectReport(a,1,state,reason)
   await f.wrongArity()
  })
  await scenario('accepted observation is bounded by actual database clock samples and safe integer sequence',async()=>{
   const before=await f.databaseNow(),accepted=await f.send(f.actor('prepare',1),1),after=await f.databaseNow()
   f.check(Date.parse(before)<=Date.parse(accepted.observed_at)&&Date.parse(accepted.observed_at)<=Date.parse(after),'actual_db_clock_bounds')
   await f.send(f.actor('assessment',2),9007199254740991)
   await f.rejectReport(f.actor('assessment',2),'9007199254740992')
  })
  await scenario('latest exact replay preserves ACK, observed_at, xmin and ctid; aged replay cannot refresh TTL',async()=>{
   await f.reset('prepare');const a=f.actor('prepare',1),first=await f.send(a,1),before=await f.row('prepare',1)
   const repeated=await f.send(a,1);f.equal(repeated,first,'identical_latest_ack');f.equal(await f.row('prepare',1),before,'replay_no_update')
   await f.age('prepare',[90000,90000]);const aged=await f.row('prepare',1),replay=await f.send(a,1)
   f.check(replay.observed_at===aged.observed_at,'no_ttl_clock_refresh');f.equal(await f.row('prepare',1),aged,'aged_replay_no_update')
   expect(row(await f.snapshot()),'stale','heartbeat_expired',aged.observed_at)
  })
  await scenario('changed equal/lower/old-generation reports refuse without rewriting the slot',async()=>{
   await f.reset('prepare');const a=f.actor('prepare',1);await f.send(a,2)
   await f.rejectReport(a,2,'unknown','loop_unavailable');await f.rejectReport(a,1)
   await f.reset('prepare');await f.rejectReport(a,1,'ready','startup_checks_complete',{generation:'previous'});await f.send(a,1)
  })
  await scenario('draining is irreversible for the generation; higher draining sequence remains valid',async()=>{
   await f.reset('prepare');const a=f.actor('prepare',1);await f.send(a,1,'draining','new_claims_closed')
   await f.rejectReport(a,2);await f.rejectReport(a,2,'unknown','loop_unavailable')
   await f.send(a,2,'draining','new_claims_closed');f.check((await f.row('prepare',1)).draining===true,'drain_latch_retained')
   expect(row(await f.snapshot()),'draining','fresh_draining_report')
  })
  await scenario('all sixteen writers report real unknown observations while the DTO keeps unknown last_seen null',async()=>{
   for(const kind of f.kinds){await f.reset(kind);for(const slot of [1,2])await f.send(f.actor(kind,slot),1,'unknown',slot===1?'startup_checks_pending':'loop_unavailable')}
   for(const value of (await f.snapshot()).workers)expect(value,'unknown','loop_unavailable',null)
  })
  await scenario('kind and slot disable do not invent liveness; notinstrumented, disabled and no observation stay null',async()=>{
   await f.setKind('prepare',false,false);expect(row(await f.snapshot()),'unknown','not_instrumented',null)
   await f.setKind('prepare',true,false);expect(row(await f.snapshot()),'unknown','component_disabled',null);await f.rejectReport(f.actor('prepare',1),2)
   await f.setKind('prepare',true,true);await f.setSlotEnabled('prepare',1,false);await f.setSlotEnabled('prepare',2,false)
   expect(row(await f.snapshot()),'unknown','not_observed',null);await f.rejectReport(f.actor('prepare',1),2)
   await f.reset('prepare');expect(row(await f.snapshot()),'unknown','not_observed',null)
  })
  await scenario('two-slot priority is fresh ready above drain above unknown above stale, regardless of newer inferior state',async()=>{
   for(const pair of [
    {states:['ready','draining'],reasons:['startup_checks_complete','new_claims_closed'],ages:[10000,1000],state:'ready',reason:'fresh_ready_report',slot:1},
    {states:['draining','unknown'],reasons:['new_claims_closed','loop_unavailable'],ages:[10000,1000],state:'draining',reason:'fresh_draining_report',slot:1},
    {states:['unknown','ready'],reasons:['loop_unavailable','startup_checks_complete'],ages:[10000,100000],state:'unknown',reason:'loop_unavailable',slot:null},
    {states:['ready','draining'],reasons:['startup_checks_complete','new_claims_closed'],ages:[150000,95000],state:'stale',reason:'heartbeat_expired',slot:2},
   ]){
    await f.reset('prepare');for(const slot of [1,2])await f.send(f.actor('prepare',slot),1,pair.states[slot-1],pair.reasons[slot-1])
    await f.age('prepare',pair.ages)
    const seen=pair.slot===null?null:(await f.row('prepare',pair.slot)).observed_at
    expect(row(await f.snapshot()),pair.state,pair.reason,seen)
   }
  })
  await scenario('90-second threshold uses DB-stamped age: just inside is fresh and exact aged boundary is stale',async()=>{
   await f.reset('prepare');await f.send(f.actor('prepare',1),1)
   await f.age('prepare',[89000,89000]);const near=await f.row('prepare',1),fresh=await f.snapshot(),freshAge=Date.parse(fresh.as_of)-Date.parse(near.observed_at)
   f.check(freshAge>=89000&&freshAge<90000,'observed_inside_ttl');expect(row(fresh),'ready','fresh_ready_report',near.observed_at)
   await f.age('prepare',[90000,90000]);const boundary=await f.row('prepare',1),stale=await f.snapshot()
   f.check(Date.parse(stale.as_of)-Date.parse(boundary.observed_at)>=90000,'observed_at_or_after_exact_boundary');expect(row(stale),'stale','heartbeat_expired',boundary.observed_at)
  })
  await scenario('future, nonfinite and out-of-range persisted clocks refuse snapshot and regressing record clock',async()=>{
   await f.reset('prepare');const a=f.actor('prepare',1);await f.send(a,1)
   try{for(const mode of ['future','infinity','year10000']){await f.injectTime('prepare',1,mode);await f.rejectSnapshot();await f.rejectReport(a,2)}}
   finally{await f.injectTime('prepare',1,'restore')}
   await f.send(a,2);expect(row(await f.snapshot()),'ready','fresh_ready_report')
  })
  await scenario('reader requires READ ONLY; direct tables, other RPCs, reset/boot and old API/Worker access stay denied',async()=>{await f.permissions()})
  await scenario('existing sessions still enforce exact LOGIN/connection-limit attributes on every RPC',async()=>{await f.reset('prepare');await f.attributes()})
  for(const mode of ['rotate','disable_slot','disable_kind'])await scenario('actual advisory handshake and observed row-lock queue fence '+mode,async()=>{await f.fenced(mode)})
  await scenario('active domain still fails dormant audit; unchanged full060/full061 and main business/auth row image survive',async()=>{await f.finish()})
 }catch(error){throw heartbeatRuntimeSafeError('suite_failed',error)}
 finally{if(f)try{await f.close()}catch(error){throw heartbeatRuntimeSafeError('cleanup_failed',error)}}
})
