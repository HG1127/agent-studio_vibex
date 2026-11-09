// Pure closed data/refusal tests. No DB, listener, root files or genuine permit.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import * as c from '../src/worker-heartbeat-activation-control-contract.ts'
import * as core from '../src/worker-heartbeat-activation-control.ts'
import * as client from '../src/worker-heartbeat-activation-control-client.ts'
import * as runtime from '../src/worker-heartbeat-activation-control-runtime.mjs'
import {captureWorkerHeartbeatActivationControlSources,assertWorkerHeartbeatActivationControlSources} from '../src/worker-heartbeat-activation-control-source.mjs'

const id='11111111-1111-4111-8111-111111111111',hex='a'.repeat(64),parse=s=>c.parseWorkerHeartbeatControlJson(Buffer.from(s)),refused=error=>error?.code==='untrusted_reference',sha=raw=>createHash('sha256').update(raw).digest('hex')
test('strict JSON rejects duplicate decoded keys, unsafe text, non-integer numbers and depth/size bombs',()=>{
 for(const text of ['{"a":1,"\\u0061":2}','{"__proto__":{}}','{"constructor":{}}','{"prototype":{}}','{"x":9007199254740992}','{"x":-0}','{"x":1.2}','{"x":1e300}','{"x":"\\ud800"}','{"x":"\\u0000"}','\ufeff{}','{}\0','{}junk','[1,]','{"a":}',' '.repeat(16385),'['.repeat(25)+'0'+']'.repeat(25)])assert.throws(()=>parse(text),/invalid_command/,text.slice(0,32))
 assert.throws(()=>c.parseWorkerHeartbeatControlJson(Uint8Array.from([0xc3,0x28])),/invalid_command/)
 for(const max of [0,-1,1.2,4194305,NaN,Infinity])assert.throws(()=>c.parseWorkerHeartbeatControlJson(Buffer.from('{}'),max),/invalid_command/)
 const value=parse('{"x":[true,false,null,"好",1,0,-2]}');assert.deepEqual(value,{x:[true,false,null,'好',1,0,-2]});assert.ok(Object.isFrozen(value.x))
})
test('closed own-data objects never invoke getters and reject symbols, inherited values or extra keys',()=>{
 let calls=0;const bad=Object.defineProperty({},'op',{enumerable:true,get(){calls++;return 'inspect'}})
 for(const raw of [bad,Object.create({op:'inspect'}),{op:'inspect',extra:1},{op:'inspect',[Symbol()]:1},[],null])assert.throws(()=>c.parseWorkerHeartbeatControlCommand(raw),/invalid_command/)
 assert.equal(calls,0)
})
test('operator command grammar has fixed verbs, UUIDs and no SQL, target, path, credentials or PID',()=>{
 for(const op of ['inspect','stop'])assert.deepEqual(c.parseWorkerHeartbeatControlCommand({op}),{op})
 for(const op of ['prepare','apply','recover'])assert.deepEqual(c.parseWorkerHeartbeatControlCommand({op,action_id:id}),{op,action_id:id})
 assert.equal(c.parseWorkerHeartbeatControlCommand({op:'resume_publication',action_id:id,recovered_action_id:id}).op,'resume_publication')
 for(const raw of [{op:'eval',action_id:id},{op:'apply',action_id:'../x'},{op:'inspect',pid:1},{op:'apply',action_id:id,sql:'COMMIT'},{op:'stop',target:'elsewhere'},{op:'prepare',action_id:'A1111111-1111-4111-8111-111111111111'}])assert.throws(()=>c.parseWorkerHeartbeatControlCommand(raw),/invalid_command/)
})
test('read protocol accepts only a private peer lookup key and fixed metadata; all caller identity inputs refused',()=>{
 const request={protocol:'worker_heartbeat_control_v1',request_id:id,op:'prepare_read'}
 assert.deepEqual(c.parseWorkerHeartbeatReadRequest(request),request)
 const finish={...request,op:'finish_read',pending_id:hex,instance_id:id,epoch:'18446744073709551615'};assert.deepEqual(c.parseWorkerHeartbeatReadRequest(finish),finish)
 for(const raw of [{...request,cookie:'secret'},{...request,pid:12},{...request,password:'pw'},{...finish,epoch:'18446744073709551616'},{...finish,epoch:'01'},{...finish,pending_id:'x'},{...finish,instance_id:'x'},{...finish,op:'commit'}])assert.throws(()=>c.parseWorkerHeartbeatReadRequest(raw),/invalid_command/)
})
test('root profile is signed-file data only with closed fields and exact hashes, never authority',()=>{
 const p={protocol:'worker_heartbeat_control_profile_v1',mode:'closed',source_sha256:hex,source_manifest_sha256:hex,runtime_manifest_sha256:hex,admin_password_sha256:hex,reader_password_sha256:hex,native_gid:1234,binding:{},policy:{}}
 assert.ok(Object.isFrozen(c.parseWorkerHeartbeatRootProfile(p)))
 for(const patch of [{mode:'auto'},{native_gid:0},{native_gid:1.2},{admin_password_sha256:'bad'},{target:'elsewhere'}])assert.throws(()=>c.parseWorkerHeartbeatRootProfile({...p,...patch}),/invalid_command/)
 let reads=0;const nested=Object.defineProperty({},'secret',{enumerable:true,get(){reads++;return 'not read'}});assert.throws(()=>c.parseWorkerHeartbeatRootProfile({...p,binding:nested}),/invalid_command/);assert.equal(reads,0)
 assert.throws(()=>core.inspectWorkerHeartbeatActivationControl(p),refused)
})
test('limits keep native whole budget8s, controller read lease5s and actual broker count2 independent',()=>{
 assert.equal(c.controlLimits.nativeBudgetMs,8000);assert.equal(c.controlLimits.leaseMs,5000);assert.equal(c.controlLimits.leases,2);assert.equal(c.controlLimits.frameBytes,16384)
 assert.equal(c.controlPaths.reader,'/run/agentstudio-telemetry-control/reader.sock');assert.equal(c.controlPaths.ops,'/run/agentstudio-telemetry-control/operator.sock');assert.ok(Object.isFrozen(c.controlLimits))
})
test('all control handles, peers, write grants, leases, finished reads and recoveries require original private provenance',async()=>{
 const fake=Object.freeze(Object.create(null)),db={query(){throw Error('query must not run')},release(){throw Error('release must not run')}}
 for(const value of [fake,{},null,undefined,[],parse('{}')]){
  assert.throws(()=>core.inspectWorkerHeartbeatActivationControl(value),refused)
  assert.throws(()=>core.assertWorkerHeartbeatControlDbAccess(db,value,'read'),refused)
  assert.throws(()=>core.assertWorkerHeartbeatControlDbAccess(db,value,'write'),refused)
  assert.throws(()=>core.describeWorkerHeartbeatRecovery(value),refused)
  assert.throws(()=>core.consumeWorkerHeartbeatControlRead(value,fake,fake),refused)
  for(const op of [()=>core.prepareWorkerHeartbeatMutation(value,fake,id),()=>core.authorizeWorkerHeartbeatMutation(value,fake,id),()=>core.applyWorkerHeartbeatMutation(value,fake,fake),()=>core.recoverWorkerHeartbeatMutation(value,fake,id),()=>core.resumeWorkerHeartbeatPublication(value,fake,id,id),()=>core.prepareWorkerHeartbeatControlRead(value,fake),()=>core.finalizeWorkerHeartbeatControlRead(value,fake,fake),()=>core.cancelWorkerHeartbeatControlRead(value,fake,fake),()=>core.serveWorkerHeartbeatActivationControl(value),()=>core.closeWorkerHeartbeatActivationControl(value)])await assert.rejects(op,refused)
 }
})
test('Native private budgets are inert and unforgeable; fake handles cannot open IPC or consume DTOs',async()=>{
 const b=client.beginWorkerHeartbeatNativeReadBudget();assert.deepEqual(Reflect.ownKeys(b),[]);assert.ok(Object.isFrozen(b))
 for(const fake of [{},Object.freeze(Object.create(null)),null,undefined]){
  await assert.rejects(()=>client.connectWorkerHeartbeatReadControl(fake),refused)
  await assert.rejects(()=>client.prepareWorkerHeartbeatSnapshot(fake),refused)
  await assert.rejects(()=>client.finishWorkerHeartbeatSnapshot(fake,fake),refused)
  assert.throws(()=>client.consumeWorkerHeartbeatSnapshot(fake,fake),refused)
  await assert.rejects(()=>client.cancelWorkerHeartbeatSnapshot(fake,fake),refused)
  await assert.rejects(()=>client.closeWorkerHeartbeatReadControl(fake),refused)
 }
})
function manifest(){const p=runtime.workerHeartbeatActivationControlRuntimePolicy,prefix='services/pg-api/node_modules/',names=Object.keys(p.packages).sort(),files=[prefix+'pg/esm/index.mjs',...names.flatMap(name=>[prefix+name+'/package.json',prefix+name+'/'+p.packages[name].entry])];return {format:p.format,lock_sha256:p.lock_sha256,pg_version:p.pg_version,packages:names.map(name=>({name,version:p.packages[name].version})),files:[...new Set(files)].sort().map(path=>({path,sha256:hex,bytes:8}))}}
test('independent runtime manifest parses fixed14-package data but yields no runtime/driver capability',()=>{
 const m=manifest(),raw=JSON.stringify(m),policy=runtime.workerHeartbeatActivationControlRuntimePolicy,parsed=runtime.parseWorkerHeartbeatActivationControlRuntimeManifest(raw,sha(raw),policy.lock_sha256)
 assert.equal(Object.keys(policy.packages).length,14);assert.equal(sha(readFileSync(new URL('../pnpm-lock.yaml',import.meta.url))),policy.lock_sha256)
 for(const fake of [parsed,m,{},Object.freeze(Object.create(null))]){assert.throws(()=>runtime.assertWorkerHeartbeatActivationControlRuntime(fake),/runtime_refused/);assert.throws(()=>runtime.loadWorkerHeartbeatActivationControlPg(fake),/runtime_refused/)}
 for(const mutate of [x=>{x.format='agent_descriptive_patch_operator_runtime_v1'},x=>{x.packages.pop()},x=>{x.files[0].path='../../other.js'},x=>{x.files[0].sha256='bad'},x=>{x.files[0].bytes=0}]){const bad=structuredClone(m);mutate(bad);const text=JSON.stringify(bad);assert.throws(()=>runtime.parseWorkerHeartbeatActivationControlRuntimeManifest(text,sha(text),policy.lock_sha256),/runtime_refused/)}
})
test('runtime metadata, environment and module resolution keep their independent immutable boundary',()=>{
 const good={type:'file',symlink:false,uid:0,gid:0,mode:0o100444,nlink:1,size:8};runtime.assertWorkerHeartbeatActivationControlRuntimeMetadata(good,'code')
 for(const patch of [{symlink:true},{uid:1},{mode:0o100644},{nlink:2}])assert.throws(()=>runtime.assertWorkerHeartbeatActivationControlRuntimeMetadata({...good,...patch},'code'),/runtime_refused/)
 for(const env of [{PGHOST:'localhost'},{PGPASSWORD:'pw'},{NODE_OPTIONS:'--import=other'},{NODE_PATH:'/other'},{DATABASE_URL:'elsewhere'}])assert.throws(()=>runtime.assertWorkerHeartbeatActivationControlRuntimeEnvironment(env,[]),/runtime_refused/)
 assert.throws(()=>runtime.assertWorkerHeartbeatActivationControlRuntimeEnvironment({},['--import=hook']),/runtime_refused/)
 assert.throws(()=>runtime.resolveWorkerHeartbeatActivationControlRuntimeModule(manifest(),'services/pg-api/node_modules/pg/lib/index.js','evil'),/runtime_refused/)
})
test('actual source capture includes its own entry/runtime and frozen registry, provides comparison data only',async()=>{
 const capture=await captureWorkerHeartbeatActivationControlSources();assert.equal(capture.source_sha256,sha(JSON.stringify(capture.manifest)));assert.ok(Object.isFrozen(capture.manifest.sources))
 for(const file of ['worker-heartbeat-activation-control.ts','worker-heartbeat-activation-control-service.ts','worker-heartbeat-activation-control-client.ts','worker-heartbeat-activation-control-runtime.mjs','worker-heartbeat-activation-registry.ts'])assert.ok(capture.manifest.sources.some(s=>s.path==='services/pg-api/src/'+file))
 assert.ok(!capture.manifest.sources.some(s=>s.path.includes('agent-descriptive-patch-operator')))
 assert.throws(()=>assertWorkerHeartbeatActivationControlSources(structuredClone(capture),capture.source_sha256),/source_refused/)
 assert.throws(()=>assertWorkerHeartbeatActivationControlSources(capture,'f'.repeat(64)),/source_refused/)
})
