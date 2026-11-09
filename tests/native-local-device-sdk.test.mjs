import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgNativeLocalDeviceApi,createNativeLocalDeviceIntentState,nativeOfficeRoots} from '../src/lib/pgNativeLocalDevice.ts'
import {PgNativePilotError} from '../src/lib/pgNativePilotApi.ts'
import {localDigest} from '../shared/native-local-device-contract.mjs'
import {requireNativeLocalDeviceGenuineCi} from '../services/pg-api/tests/helpers/native-local-device-genuine-guard.mjs'
const id='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000002'
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
test('SDK uses real Native cookie/CSRF header and original unchanged intent bytes for confirm-only recovery',async()=>{
 const intent={action:'create_office',request_id:id,name:'Office'},receipt={request_id:id,request_sha256:await localDigest(intent),action:'create_office',id:device},calls=[]
 const api=createPgNativeLocalDeviceApi({rootPath:'/__pg_native',transport:async(url,init)=>{calls.push({url,init});return response({receipt,pairing_code:null,replayed:calls.length>1})}})
 assert.equal((await api.record(intent)).receipt.id,device);assert.equal((await api.confirm(intent)).replayed,true)
 assert.equal(calls[0].url,'/__pg_native/api/v2/local-devices');assert.equal(calls[1].url,'/__pg_native/api/v2/local-devices/confirm');for(const {init} of calls){assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('X-AgentStudio-Request'),'1');assert.deepEqual(JSON.parse(init.body),intent);assert.ok(init.signal instanceof AbortSignal)}
 assert.equal(calls[0].init.body,calls[1].init.body)
})
test('lost SDK ACK never creates a second UUID and original pending memory cannot silently change target',async()=>{
 const intent={action:'create',request_id:id,name:'Work'},state=createNativeLocalDeviceIntentState(),pending=state.begin(intent),calls=[]
 const api=createPgNativeLocalDeviceApi({transport:async(url,init)=>{calls.push({url,body:init.body});throw Error('actual-client-transport-unknown')}})
 await assert.rejects(()=>api.record(pending));assert.deepEqual(state.snapshot().pending,intent);assert.throws(()=>state.begin({...intent,name:'Changed'}));await assert.rejects(()=>api.confirm(state.snapshot().pending));assert.equal(calls.length,2);assert.equal(calls[1].url,'/api/v2/local-devices/confirm');assert.equal(calls[0].body,calls[1].body)
})
test('SDK failure and mismatched receipt cannot turn private cached data into current authorized success',async()=>{
 const intent={action:'create',request_id:id,name:'Work'},receipt={request_id:id,request_sha256:await localDigest(intent),action:'create',id:device}
 const denied=createPgNativeLocalDeviceApi({transport:async()=>response({error:'session_required'},401)});await assert.rejects(()=>denied.list(),e=>e instanceof PgNativePilotError&&e.status===401)
 const wrong=createPgNativeLocalDeviceApi({transport:async()=>response({receipt:{...receipt,request_id:device},pairing_code:null,replayed:true})});await assert.rejects(()=>wrong.confirm(intent))
})
test('Office roots match both actual schemas including full original31-character root bound',()=>{
 const root='r'.repeat(31),catalog=['office.table_summary','office.create_report'].map(name=>({name,description:'',inputSchema:{type:'object',properties:{root:{type:'string',enum:[root]}}}})),d={id:device,name:'Office',revoked:false,seen_ms:Date.now(),catalog,catalog_sha256:'a'.repeat(64),version:1};assert.deepEqual(nativeOfficeRoots(d),[root]);assert.deepEqual(nativeOfficeRoots({...d,seen_ms:0}),[]);assert.deepEqual(nativeOfficeRoots({...d,catalog:catalog.slice(0,1)}),[])
})
test('genuine guard refuses this ordinary Windows/Linux environment before any DB/driver operation',()=>{
 for(const platform of ['win32','linux'])assert.throws(()=>requireNativeLocalDeviceGenuineCi({},platform,1001),/refuse_non_ephemeral/)
 assert.throws(()=>requireNativeLocalDeviceGenuineCi({...process.env,AGENT_STUDIO_F20_F21_GENUINE_CI:'YES_DISPOSABLE_F20_F21_ONLY'},'linux',0),/refuse_non_ephemeral/)
})
