import test from 'node:test'
import assert from 'node:assert/strict'
import {localObject,localCanonical,localDigest,parseLocalIntent,parseLocalInput,parseLocalCatalog,parseLocalResult,parseLocalDevice,parseLocalJob,matchLocalReply} from '../shared/native-local-device-contract.mjs'
import {nativeServer,pairReply,completionReply} from '../local-executor/native-connection.mjs'
const id='10000000-0000-4000-8000-000000000001',id2='20000000-0000-4000-8000-000000000002',sha='a'.repeat(64)
const input={tool:'files.write',arguments:{root:'work',path:'new.txt',text:'已批准'}}
const catalog=[{name:'files.write',description:'Create new file',inputSchema:{type:'object',properties:{root:{type:'string',enum:['work']}}}}]
test('original intent UUID is canonical and cannot carry owner, run, claims or device tokens',()=>{
 const v={action:'enqueue',request_id:id,id:id2,input,confirm:true};assert.deepEqual(parseLocalIntent(v),v)
 for(const k of ['owner_user_id','local_device_token','run_id','claim'])assert.throws(()=>parseLocalIntent({...v,[k]:id}))
 assert.throws(()=>parseLocalIntent({...v,confirm:false}));assert.throws(()=>parseLocalIntent({...v,request_id:'new'}))
})
test('closed objects reject arrays, getters and extra fields without evaluating authority getters',()=>{
 let called=false;const v={get action(){called=true;return 'create'},request_id:id,name:'Computer'};assert.throws(()=>parseLocalIntent(v));assert.equal(called,false)
 assert.throws(()=>localObject([],[]));assert.throws(()=>parseLocalInput({...input,shell:'cmd'}))
})
test('canonical hash retains nested arguments and rejects prototype/depth/nonfinite inputs',async()=>{
 assert.equal(localCanonical({z:1,a:{c:'中文',b:true}}),'{"a":{"b":true,"c":"中文"},"z":1}')
 assert.equal(await localDigest({b:2,a:1}),await localDigest({a:1,b:2}))
 for(const v of [JSON.parse('{"__proto__":{}}'),{x:Infinity},{x:NaN}])assert.throws(()=>localCanonical(v))
 let v={};for(let i=0;i<14;i++)v={x:v};assert.throws(()=>localCanonical(v))
})
test('catalog is bounded, unique and data only; no caller credentials enter it',()=>{
 assert.deepEqual(parseLocalCatalog(catalog),catalog);assert.throws(()=>parseLocalCatalog([...catalog,...catalog]));assert.throws(()=>parseLocalCatalog([{...catalog[0],inputSchema:{type:'string'}}]));assert.throws(()=>parseLocalCatalog([{...catalog[0],token:sha}]))
})
test('raw PNG/JPEG result bytes require canonical base64 and matching signatures',()=>{
 const data=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64'),r={text:'实际屏幕',images:[{mimeType:'image/png',data}]};assert.deepEqual(parseLocalResult(r),r)
 for(const bad of [{mimeType:'image/svg+xml',data},{mimeType:'image/jpeg',data},{mimeType:'image/png',data:'https://private.invalid/image'}])assert.throws(()=>parseLocalResult({text:'',images:[bad]}))
 assert.throws(()=>parseLocalResult({...r,images:[...r.images,...r.images]}));assert.throws(()=>parseLocalResult({...r,owner:id}))
})
test('confirmed terminal state and result presence correlate; unknown has no claimed result',()=>{
 const job={id,device_id:id2,run_id:null,step_key:'',status:'unknown',input,input_sha256:sha,created_ms:100,deadline_ms:120100,result:null,error:'executor_outcome_unknown'};assert.deepEqual(parseLocalJob(job),job)
 assert.throws(()=>parseLocalJob({...job,status:'succeeded'}));assert.throws(()=>parseLocalJob({...job,result:{text:'Done',images:[]}}));assert.throws(()=>parseLocalJob({...job,deadline_ms:120101}))
})
test('device public projection excludes pairing and device token material',()=>{
 const v={id,name:'Work',revoked:false,seen_ms:0,catalog,catalog_sha256:sha,version:1};assert.deepEqual(parseLocalDevice(v),v);for(const key of ['token_hash','pair_hash','device_token','pairing_code'])assert.throws(()=>parseLocalDevice({...v,[key]:sha}))
})
test('original UUID confirmation compares full intent hash and cannot remint pairing code',async()=>{
 const intent={action:'create',request_id:id,name:'Work'},receipt={request_id:id,request_sha256:await localDigest(intent),action:'create',id:id2};assert.equal((await matchLocalReply({receipt,pairing_code:null,replayed:true},intent)).receipt.id,id2)
 await assert.rejects(matchLocalReply({receipt,pairing_code:null,replayed:true},{...intent,name:'Other'}));await assert.rejects(matchLocalReply({receipt,pairing_code:'b'.repeat(48),replayed:true},intent))
})
test('CLI URL accepts Native prefix and rejects credentials, arbitrary routes and non-loopback HTTP',()=>{
 assert.equal(nativeServer('https://studio.example/__pg_native/'),'https://studio.example/__pg_native');assert.equal(nativeServer('http://127.0.0.1:7402'),'http://127.0.0.1:7402')
 for(const x of ['http://studio.example','https://u:p@studio.example','https://studio.example/__pb','https://studio.example/?secret=x'])assert.throws(()=>nativeServer(x))
})
test('pair/completion acknowledgements must correlate original UUID, job and actual outcome',()=>{
 assert.equal(pairReply({id:id2,request_id:id,paired:true,replayed:true},id).id,id2)
 assert.throws(()=>pairReply({id:id2,request_id:id2,paired:true,replayed:true},id))
 const c={id:id2,request_id:id,ok:false};assert.equal(completionReply({id:id2,request_id:id,status:'unknown',replayed:true},c).status,'unknown');assert.throws(()=>completionReply({id:id2,request_id:id,status:'succeeded',replayed:true},c))
})
