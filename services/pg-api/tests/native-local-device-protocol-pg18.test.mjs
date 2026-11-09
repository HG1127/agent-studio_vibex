// Actual Native HTTPS and PostgreSQL RPC protocol. The client here submits
// synthetic protocol results; this file makes NO local-effect/Office claim.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {requireNativeLocalDeviceGenuineCi} from './helpers/native-local-device-genuine-guard.mjs'
requireNativeLocalDeviceGenuineCi()
test('real PG067 and Native Cookie RPC ownership, claim and original UUID protocol',async t=>{
 const {nativeLocalDeviceGenuineFixture}=await import('./helpers/native-local-device-genuine-fixture.mjs'),f=await nativeLocalDeviceGenuineFixture();t.after(()=>f.close())
 const root='/api/v2/local-devices',catalog=[{name:'synthetic.protocol_probe',description:'CI protocol only; no local implementation or effect',inputSchema:{type:'object',additionalProperties:false,properties:{label:{type:'string'}},required:['label']}}]
 const request=async(who,body,path=root)=>{const r=await f.request(who,path,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body}
 const input={tool:'synthetic.protocol_probe',arguments:{label:'Synthetic RPC fixture only'}}
 let device,token,pairIntent,firstJob,claim,originalRequest,originalCompletion
 await t.test('minimum original independent roles and actual installed auditors precede business access',async()=>{
  assert.equal(await f.audit.inspectNativeLocalDevicePool(f.pool,'agentstudio_api'),true);assert.equal(await f.audit.inspectNativeLocalDevicePool(f.executorPool,'agentstudio_local_executor'),true)
  assert.equal((await f.request('none',root)).status,401);assert.equal((await f.request('alice',root,undefined,{headers:{'X-Rh-User-Id':f.users.bob}})).status,403)
 })
 await t.test('create ACK loss reads immutable original UUID without minting a second device or raw code',async()=>{
  const intent={action:'create',request_id:randomUUID(),name:'Synthetic lost-create protocol'},before=await f.counts();f.mutable.dropNext={method:'POST',path:root};await assert.rejects(()=>f.request('alice',root,intent));const receipt=await request('alice',intent,root+'/confirm');assert.equal(receipt.pairing_code,null);assert.equal(receipt.replayed,true);assert.equal((await f.counts()).devices,before.devices+1);assert.equal((await request('alice',intent)).receipt.id,receipt.receipt.id)
  await request('alice',{action:'revoke',request_id:randomUUID(),id:receipt.receipt.id,confirm:true})
 })
 await t.test('local token is supplied by client, stored hashed, never returned, with exact pair-confirm recovery',async()=>{
  const made=await request('alice',{action:'create',request_id:randomUUID(),name:'Synthetic real RPC device'});device=made.receipt.id;token=randomBytes(32).toString('hex');pairIntent={request_id:randomUUID(),pairing_code:made.pairing_code,device_token:token}
  f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/pair'};await assert.rejects(()=>f.executor(null,'pair',pairIntent));const confirmed=await f.executor(null,'pair-confirm',pairIntent);assert.equal(confirmed.status,200);assert.equal(confirmed.body.id,device);assert.equal(confirmed.body.replayed,true);assert.doesNotMatch(JSON.stringify(confirmed.body),/token|pairing_code/)
  assert.equal((await f.executor(null,'pair',{...pairIntent,request_id:randomUUID(),device_token:randomBytes(32).toString('hex')})).status,403)
  const row=(await f.db.query('SELECT token_hash,pair_hash FROM agentstudio.native_local_devices WHERE id=$1',[device])).rows[0];assert.equal(row.pair_hash,null);assert.equal(row.token_hash,createHash('sha256').update('native-local-device-v1:'+token).digest('hex'))
 })
 await t.test('public executor path refuses browser/employee authority and accepts only matching token catalog',async()=>{
  const body={catalog,claim:randomBytes(32).toString('hex')};for(const headers of [{Cookie:f.cookies.get('alice')},{Origin:f.allowedOrigin},{'X-Rh-User-Id':f.users.alice}])assert.equal((await f.executor(token,'poll',body,{headers})).status,403)
  assert.equal((await f.executor(token,'poll',{...body,catalog:[...catalog,...catalog]})).status,400);assert.equal((await f.executor(token,'poll',body)).status,200)
  assert.equal((await request('bob')).length,0);assert.doesNotMatch(JSON.stringify(await request('alice')),/token_hash|pair_hash|device_token|pairing_code/)
 })
 await t.test('actual Native Office role read/PATCH and queued autonomous admission retain the exact local marker',async()=>{
  const made=await request('alice',{action:'create_office',request_id:randomUUID(),name:'Synthetic Native Office compatibility'}),agentPath='/api/v2/agent-specs/'+made.receipt.id
  const read=await f.request('alice',agentPath);assert.equal(read.status,200);assert.deepEqual(read.body.item.spec.tools,['local_computer']);assert.equal((await f.request('bob',agentPath)).status,404)
  const {require_approval:approval,...spec}=read.body.item.spec;assert.equal(approval,true)
  // The inherited fixture model is catalog/resource data only. No Worker or
  // provider is called; this subtest claims only actual Native RPC admission.
  const patched=await f.request('alice',agentPath,{name:'Synthetic Native Office updated',spec:{...spec,model_binding:f.resources.alice.binding},expected_revision:read.body.item.revision},{method:'PATCH'});assert.equal(patched.status,200,JSON.stringify(patched.body));assert.deepEqual(patched.body.item.spec.tools,['local_computer'])
  const invalid=await f.request('alice',agentPath,{name:'Denied unknown tool',spec:{...spec,tools:['local_computer','unknown']},expected_revision:patched.body.item.revision},{method:'PATCH'});assert.equal(invalid.status,400)
  const reread=await f.request('alice',agentPath);assert.equal(reread.body.item.revision,patched.body.item.revision);assert.deepEqual(reread.body.item.spec.model_binding,f.resources.alice.binding)
  const route=agentPath+'/autonomous-runs',intent={expected_revision:reread.body.item.revision,idempotency_key:'native-office-compat-'+randomUUID(),instruction:'Synthetic protocol-only task; no runtime is started',max_steps:3,require_plan_review:true,local_device_id:device}
  const admitted=await f.request('alice',route,intent);assert.equal(admitted.status,201,JSON.stringify(admitted.body));assert.equal(admitted.body.worker_started_by_api,false);assert.equal(admitted.body.execution_mode,'agent_native_v2');assert.equal(admitted.body.local_device_id,device);assert.equal(admitted.body.run.status,'queued')
  const replayed=await f.request('alice',route,intent);assert.equal(replayed.status,200,JSON.stringify(replayed.body));assert.equal(replayed.body.run.id,admitted.body.run.id);assert.equal(replayed.body.replayed,true)
  assert.equal((await f.request('bob',route,{...intent,idempotency_key:'wrong-owner-'+randomUUID()})).status,404)
 })
 await t.test('one original manual UUID binds exact owner/device/arguments and cannot be repurposed' ,async()=>{
  const intent={action:'enqueue',request_id:randomUUID(),id:device,input,confirm:true},before=await f.counts();originalRequest=intent;assert.equal((await f.request('alice',root,{...intent,confirm:false})).status,400);assert.equal((await f.request('bob',root,intent)).status,409)
  const created=await request('alice',intent);firstJob=created.receipt.id;assert.equal((await request('alice',intent)).receipt.id,firstJob);assert.equal((await f.counts()).jobs,before.jobs+1)
  assert.equal((await f.request('alice',root,{...intent,input:{...input,arguments:{label:'different'}}})).status,409);assert.equal((await f.request('bob',root+'/jobs/'+firstJob)).status,404)
 })
 await t.test('concurrent polls claim one job, same persisted claim recovers lost poll response, other claim stays inactive',async()=>{
  const claims=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],results=await Promise.all(claims.map(c=>f.executor(token,'poll',{catalog,claim:c})));assert.equal(results.filter(x=>x.body.job).length,1);const winner=results.findIndex(x=>x.body.job);claim=claims[winner];assert.equal(results[winner].body.job.id,firstJob);const before=await f.counts();f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/poll'};await assert.rejects(()=>f.executor(token,'poll',{catalog,claim}));assert.equal((await f.executor(token,'poll',{catalog,claim})).body.job.id,firstJob);assert.deepEqual(await f.counts(),before);assert.equal((await f.executor(token,'check',{id:firstJob,claim:claims[1-winner]})).body.active,false)
 })
 await t.test('ambiguous execution stays unknown, exact completion receipt recovers ACK without new execution/requeue',async()=>{
  const completion={request_id:randomUUID(),id:firstJob,claim,ok:false,result:{text:'Synthetic ambiguous protocol outcome; no runtime was called',images:[]}};originalCompletion=completion
  f.mutable.dropNext={method:'POST',path:'/api/public/native-local-executor/complete'};await assert.rejects(()=>f.executor(token,'complete',completion));const confirmed=await f.executor(token,'confirm',completion);assert.equal(confirmed.status,200);assert.equal(confirmed.body.status,'unknown');assert.equal(confirmed.body.request_id,completion.request_id);assert.equal(confirmed.body.replayed,true)
  assert.equal((await f.executor(token,'complete',completion)).status,200);const stored=await request('alice',undefined,root+'/jobs/'+firstJob);assert.equal(stored.status,'unknown');assert.equal(stored.result,null);assert.equal((await f.executor(token,'poll',{catalog,claim:randomBytes(32).toString('hex')})).body.job,null)
  assert.equal((await f.executor(token,'confirm',{...completion,result:{text:'changed',images:[]}})).status,404)
 })
 await t.test('queued cancellation is owner-scoped and repeat confirmation retains original id',async()=>{
  const job=await request('alice',{action:'enqueue',request_id:randomUUID(),id:device,input,confirm:true}),intent={action:'cancel',request_id:randomUUID(),id:job.receipt.id,confirm:true};assert.equal((await f.request('bob',root,intent)).status,404);await request('alice',intent);assert.equal((await request('alice',undefined,root+'/jobs/'+intent.id)).status,'cancelled');assert.equal((await request('alice',intent,root+'/confirm')).receipt.id,intent.id)
 })
 await t.test('new writes off permits pair/request/completion original receipt reads',async()=>{
  const before=await f.counts();f.mutable.writes=false;assert.equal((await f.executor(null,'pair-confirm',pairIntent)).status,200);assert.equal((await request('alice',originalRequest,root+'/confirm')).receipt.id,firstJob);assert.equal((await f.executor(token,'confirm',originalCompletion)).body.request_id,originalCompletion.request_id);assert.equal((await f.request('alice',root,{action:'create',request_id:randomUUID(),name:'disabled'})).status,403);assert.deepEqual(await f.counts(),before);f.mutable.writes=true
 })
 await t.test('revocation invalidates token and cancels work without granting browser any credential',async()=>{
  const job=await request('alice',{action:'enqueue',request_id:randomUUID(),id:device,input,confirm:true}),c=randomBytes(32).toString('hex');assert.equal((await f.executor(token,'poll',{catalog,claim:c})).body.job.id,job.receipt.id);await request('alice',{action:'revoke',request_id:randomUUID(),id:device,confirm:true});assert.equal((await f.executor(token,'check',{id:job.receipt.id,claim:c})).status,403);assert.equal((await request('alice',undefined,root+'/jobs/'+job.receipt.id)).status,'cancelled')
 })
})
