// Genuine isolated Native authority only. No telemetry mount/activation/lease,
// ready/drain receipt, Worker, provider, billing or arbitrary database adapter.
import test from 'node:test'
import assert from 'node:assert/strict'
import {performance} from 'node:perf_hooks'
import {requireWorkerHeartbeatCi} from './helpers/worker-heartbeat-ci-guard.mjs'
const capability=requireWorkerHeartbeatCi() // BEFORE helper/files/pg/business.
const {nativeCurrentAdminTcpFixture,nativeAdminDeferred:deferred,nativeAdminBounded:bounded,nativeAdminElapsed:elapsed}=await import('./helpers/native-current-company-admin-ci.mjs')

test('original fresh050 Native current-admin pre/post authorization on a genuine isolated database',{concurrency:false,timeout:360000},async t=>{
 const f=await nativeCurrentAdminTcpFixture(capability)
 const reject=(promise,status)=>assert.rejects(promise,error=>error instanceof f.guardModule.NativeCompanyAdminError&&error.status===status&&error.code===(status===401?'session_required':status===403?'admin_required':'company_admin_authorization_unavailable'))
 const until=async check=>{const start=performance.now();while(!check()&&performance.now()-start<5000)await new Promise(done=>setTimeout(done,20));assert.equal(check(),true)}
 const scenario=(name,body)=>t.test(name,{concurrency:false,timeout:60000},async()=>{
  const owned=[],errors=[]
  const probe=options=>{const p=f.probe(options);owned.push(p);return p}
  try{await body(probe)}catch(error){errors.push(error)}
  for(const p of owned.reverse())try{await p.close()}catch(error){errors.push(error)}
  try{await f.unchangedSchema()}catch(error){errors.push(error)}
  if(errors.length===1)throw errors[0]
  if(errors.length)throw new AggregateError(errors,'native_admin_ci_scenario_and_cleanup_failed')
 })
 const accepts=async(p,token)=>{const context=await p.guard.authorize(token);p.guard.assertBeforeRead(token,context);await p.guard.confirmAfterRead(token,context);return context}
 try{
  await scenario('original fresh membership/grants and actual A/B admin versus C employee; post is a new real read-only transaction',async probe=>{
   const p=probe(),B=await f.login('B'),C=await f.login('C')
   await f.readOnly(async()=>{
    await accepts(p,f.A.token)
    const first=p.trace.filter(row=>row.observation).map(row=>row.observation.began)
    assert.equal(first.length,2);assert.notEqual(first[0],first[1])
    assert.equal(p.trace.filter(row=>row.sql==='COMMIT').length,2)
    await accepts(p,B.token);await reject(p.guard.authorize(C.token),403)
   })
   assert.equal(p.connections,5);assert.ok(p.releases.every(row=>row.destroy===false))
   assert.ok(p.trace.every(row=>!row.sql||!row.sql.includes('schema_migrations')&&!row.sql.includes('telemetry')))
  })
  await scenario('malformed/browser cookies refuse before connect; another genuine admin cookie cannot replace the original bound cookie',async probe=>{
   const p=probe(),B=await f.login('B')
   await f.readOnly(async()=>{
    for(const token of ['',null,undefined,{issuer:'browser',subject:'admin'},'X-Rh-User-Id:admin','eyJhbGciOiJIUzI1NiJ9.payload.signature'])await reject(p.guard.authorize(token),401)
    assert.equal(p.connections,0)
    const context=await p.guard.authorize(f.A.token)
    assert.throws(()=>p.guard.assertBeforeRead(B.token,context),error=>error.status===503)
    await reject(p.guard.confirmAfterRead(f.A.token,context),503);assert.equal(p.connections,1)
   })
  })
  await scenario('opaque references reject forged, cloned, cross-instance and consumed contexts without an extra auth read',async probe=>{
   const p=probe(),other=probe()
   await f.readOnly(async()=>{
    const context=await p.guard.authorize(f.A.token)
    assert.equal(Object.getPrototypeOf(context),null);assert.equal(Object.isFrozen(context),true);assert.deepEqual(Reflect.ownKeys(context),[])
    for(const fake of [{},Object.freeze({is_admin:true}),Object.create(context),JSON.parse(JSON.stringify(context)),undefined])await reject(p.guard.confirmAfterRead(f.A.token,fake),503)
    await reject(other.guard.confirmAfterRead(f.A.token,context),503);assert.equal(other.connections,0)
    p.guard.assertBeforeRead(f.A.token,context);await p.guard.confirmAfterRead(f.A.token,context)
    await reject(p.guard.confirmAfterRead(f.A.token,context),503);assert.equal(p.connections,2)
   })
  })
  await scenario('original revokeSession committed after pre makes the fresh postcheck reject the old cookie',async probe=>{
   const p=probe(),B=await f.login('B'),context=await p.guard.authorize(B.token)
   p.guard.assertBeforeRead(B.token,context);assert.equal(await f.repo.revokeSession(B.token),true)
   await f.readOnly(async()=>{await reject(p.guard.confirmAfterRead(B.token,context),401);await reject(p.guard.confirmAfterRead(B.token,context),503);await reject(p.guard.authorize(B.token),401)})
  })
  await scenario('original governance demotion and restoration never revive old cookies or their request context',async probe=>{
   const p=probe(),B=await f.login('B'),context=await p.guard.authorize(B.token)
   p.guard.assertBeforeRead(B.token,context)
   try{
    const demoted=await f.changeB({is_admin:false});assert.equal(demoted.is_admin,false);assert.equal(demoted.replayed,false)
    await f.readOnly(async()=>{await reject(p.guard.confirmAfterRead(B.token,context),401);await reject(p.guard.authorize(B.token),401)})
    const nonadmin=await f.login('B');await f.readOnly(()=>reject(p.guard.authorize(nonadmin.token),403))
    const restored=await f.changeB({is_admin:true});assert.equal(restored.revision,demoted.revision+1)
    await f.readOnly(()=>reject(p.guard.authorize(nonadmin.token),401))
    const fresh=await f.login('B');assert.notEqual(fresh.token,B.token)
    await f.readOnly(async()=>{await accepts(p,fresh.token);await reject(p.guard.authorize(B.token),401);await reject(p.guard.confirmAfterRead(B.token,context),503)})
   }finally{await f.changeB({is_admin:true,enabled:true,share_enabled:true})}
  })
  await scenario('original disable/re-enable invalidates the real session; only a fresh enabled admin cookie can pass',async probe=>{
   const p=probe(),B=await f.login('B'),context=await p.guard.authorize(B.token)
   p.guard.assertBeforeRead(B.token,context)
   try{
    const disabled=await f.changeB({enabled:false});assert.equal(disabled.enabled,false)
    await f.readOnly(async()=>{await reject(p.guard.confirmAfterRead(B.token,context),401);await reject(p.guard.authorize(B.token),401)})
    await assert.rejects(f.login('B'),/invalid_employee_credentials/)
    const restored=await f.changeB({enabled:true});assert.equal(restored.revision,disabled.revision+1)
    const fresh=await f.login('B');await f.readOnly(async()=>{await accepts(p,fresh.token);await reject(p.guard.authorize(B.token),401)})
   }finally{await f.changeB({is_admin:true,enabled:true,share_enabled:true})}
  })
  await scenario('a genuine revision-only sharing change preserves its cookie but invalidates the earlier admin context',async probe=>{
   const p=probe(),B=await f.login('B'),context=await p.guard.authorize(B.token)
   p.guard.assertBeforeRead(B.token,context)
   try{
    const changed=await f.changeB({share_enabled:false});assert.equal(changed.share_enabled,false)
    await f.readOnly(async()=>{await reject(p.guard.confirmAfterRead(B.token,context),503);await accepts(p,B.token);await reject(p.guard.confirmAfterRead(B.token,context),503)})
   }finally{await f.changeB({share_enabled:true,is_admin:true,enabled:true})}
  })
  await scenario('READ COMMITTED post transaction observes actual revocation committed while its session SELECT is held',async probe=>{
   const entered=deferred(),release=deferred(),p=probe({onQuery:async({ordinal,sql})=>{if(ordinal===2&&sql.startsWith('SELECT a.user_id::text')){entered.resolve();await release.promise}}})
   const B=await f.login('B'),context=await p.guard.authorize(B.token);p.guard.assertBeforeRead(B.token,context)
   const post=p.guard.confirmAfterRead(B.token,context);post.catch(()=>{})
   try{await bounded(entered.promise,'post_session_barrier');assert.equal(await f.repo.revokeSession(B.token),true);const before=await f.image();release.resolve();await reject(post,401);assert.equal(await f.image(),before);await reject(p.guard.confirmAfterRead(B.token,context),503)}
   finally{release.resolve();await post.catch(()=>{})}
  })
  await scenario('two actual acquired auth clients count in-flight; the third request refuses without another pool acquisition',async probe=>{
   const first=deferred(),second=deferred(),release=deferred(),p=probe({onConnect:async({ordinal})=>{if(ordinal<=2){(ordinal===1?first:second).resolve();await release.promise}}})
   const a=p.guard.authorize(f.A.token),b=p.guard.authorize(f.A.token);a.catch(()=>{});b.catch(()=>{})
   try{await bounded(Promise.all([first.promise,second.promise]),'two_actual_clients');await reject(p.guard.authorize(f.A.token),503);assert.equal(p.connections,2);release.resolve();const [ca,cb]=await bounded(Promise.all([a,b]),'admitted_contexts');await f.readOnly(async()=>{await p.guard.confirmAfterRead(f.A.token,ca);await p.guard.confirmAfterRead(f.A.token,cb)})}
   finally{release.resolve();await Promise.allSettled([a,b])}
  })
  await scenario('actual pool queue time expires initial authorization after the unchanged10s monotonic budget',async probe=>{
   const p=probe({max:1}),release=await p.hold(),pending=p.guard.authorize(f.A.token);pending.catch(()=>{})
   try{await until(()=>p.waiting===1);const before=await f.image();await elapsed();release();await reject(pending,503);assert.equal(await f.image(),before);assert.equal(p.connections,1);assert.equal(p.trace.filter(row=>row.sql==='COMMIT').length,1)}
   finally{release();await pending.catch(()=>{})}
  })
  await scenario('postcheck consumes synchronously and includes actual queued auth time in the original10s lifetime',async probe=>{
   const p=probe({max:1}),context=await p.guard.authorize(f.A.token);p.guard.assertBeforeRead(f.A.token,context)
   const release=await p.hold(),post=p.guard.confirmAfterRead(f.A.token,context);post.catch(()=>{})
   try{await until(()=>p.waiting===1);await reject(p.guard.confirmAfterRead(f.A.token,context),503);assert.equal(p.connections,2);const before=await f.image();await elapsed();release();await reject(post,503);assert.equal(await f.image(),before);await reject(p.guard.confirmAfterRead(f.A.token,context),503);assert.equal(p.connections,2)}
   finally{release();await post.catch(()=>{})}
  })
  await scenario('real elapsed pre-read expiry refuses synchronously and cannot start another auth transaction',async probe=>{
   const p=probe(),context=await p.guard.authorize(f.A.token)
   await f.readOnly(async()=>{await elapsed();assert.throws(()=>p.guard.assertBeforeRead(f.A.token,context),error=>error.status===503);await reject(p.guard.confirmAfterRead(f.A.token,context),503);assert.equal(p.connections,1)})
  })
  await scenario('terminating only the held owned Native backend makes post fail closed and destroys its failed client',async probe=>{
   const entered=deferred(),release=deferred();let backend
   const p=probe({onQuery:async info=>{if(info.ordinal===2&&info.sql.startsWith('SELECT a.user_id::text')){backend=info.backend;entered.resolve();await release.promise}}})
   const context=await p.guard.authorize(f.A.token);p.guard.assertBeforeRead(f.A.token,context)
   const post=p.guard.confirmAfterRead(f.A.token,context);post.catch(()=>{})
   try{await bounded(entered.promise,'owned_backend_barrier');await p.terminate(backend);const before=await f.image();release.resolve();await reject(post,503);assert.equal(await f.image(),before);assert.ok(p.releases.some(row=>row.ordinal===2&&row.destroy));await reject(p.guard.confirmAfterRead(f.A.token,context),503)}
   finally{release.resolve();await post.catch(()=>{})}
  })
  await scenario('original050 schema/receipt and Native membership stay fixed; no business jobs/runs or telemetry database exist',async()=>{await f.final()})
 }finally{await f.close()}
})
