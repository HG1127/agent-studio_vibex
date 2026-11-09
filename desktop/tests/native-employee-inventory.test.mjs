import test from 'node:test'
import assert from 'node:assert/strict'
import {createNativeEmployeeInventoryReader,readNativeEmployeeInventory,NativeEmployeeInventoryError} from '../../shared/native-employee-inventory.mjs'
import {localDigest,parseLocalCatalog} from '../../shared/native-local-device-contract.mjs'
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',D='33333333-3333-4333-8333-333333333333',OTHER='44444444-4444-4444-8444-444444444444',now=2000000000000
const catalog=[{name:'files.list',description:'本人授权的文件目录',inputSchema:{type:'object',properties:{root:{type:'string',enum:['work']}}}}],digest=await localDigest(catalog),emptyDigest=await localDigest([])
const device=()=>({id:D,name:'本人电脑',revoked:false,seen_ms:now,catalog:structuredClone(catalog),catalog_sha256:digest,version:1}),pair=()=>({id:D,paired:true,pairing_expires_ms:now+200000})
const response=(body,status=200,headers={})=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}})
function server(options={}){
 let context={owner:A,epoch:0},cookie=A,lists=0,meReads=0;const calls=[]
 const transport=async(url,init)=>{
  calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.referrerPolicy,'no-referrer');assert.equal(init.headers['X-AgentStudio-Expected-Owner'],A);assert.deepEqual(Object.keys(init.headers).sort(),['Accept','X-AgentStudio-Expected-Owner']);assert.ok(init.signal instanceof AbortSignal)
  const route=url.slice('/__pg_native'.length)
  if(route==='/api/native-auth/me'){meReads++;if(options.meFailure&&meReads===2)return response({error:'session_required'},401);return response({authenticated:true,user:{id:cookie,email:'employee@example.test',display_name:'员工',is_admin:false}})}
  if(route==='/api/v2/local-devices'){
   lists++;if(options.onList)await options.onList({lists,setCookie:v=>cookie=v,setContext:v=>context=v})
   if(options.listStatus)return response({error:'native_local_not_found'},options.listStatus)
   return response(options.empty?[]:options.list?options.list(lists):[device()])
  }
  assert.equal(route,'/api/v2/local-device-pairings');if(options.onPairings)await options.onPairings({setCookie:v=>cookie=v,setContext:v=>context=v})
  return response(options.empty?[]:options.pairings??[pair()],options.pairingStatus??200,options.headers)
 }
 const api=createNativeEmployeeInventoryReader({transport,getContext:()=>context})
 return {api,calls,scope:()=>({...context}),context:v=>context=v,cookie:v=>cookie=v}
}
test('verified Cookie owner, both stable inventories and real pairing facts produce fullUUID projection',async()=>{
 const s=server(),snapshot=await s.api.read(),items=readNativeEmployeeInventory(snapshot,s.scope())
 assert.deepEqual(s.calls.map(x=>x.url),['/__pg_native/api/native-auth/me','/__pg_native/api/v2/local-devices','/__pg_native/api/v2/local-device-pairings','/__pg_native/api/v2/local-devices','/__pg_native/api/native-auth/me'])
 assert.deepEqual(items,[{backend:'native_pg',id:D,name:'本人电脑',revoked:false,seen_ms:now,catalog:JSON.stringify(parseLocalCatalog(catalog)),catalog_sha256:digest,version:1,paired:true,pairing_expires_ms:now+200000}])
 assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.items[0]),true);assert.equal('setup_stage'in items[0],false);assert.equal(/pairing_code|device_token|password|authorization/i.test(JSON.stringify(snapshot)),false)
})
test('empty account is returned only after all real empty responses and final identity verification',async()=>{const s=server({empty:true}),v=await s.api.read();assert.deepEqual(readNativeEmployeeInventory(v,s.scope()),[]);assert.equal(s.calls.length,5)})
test('pairing remains false with no heartbeat; expiry never fabricates pairing or readiness',async()=>{const s=server({list:()=>[{...device(),seen_ms:0,catalog:[],catalog_sha256:emptyDigest}],pairings:[{...pair(),paired:false,pairing_expires_ms:now-1}]}),[d]=readNativeEmployeeInventory(await s.api.read(),s.scope());assert.equal(d.paired,false);assert.equal(d.seen_ms,0);assert.equal(d.catalog,'[]');assert.equal(d.pairing_expires_ms,now-1)})
test('Cookie A to B during an in-flight404 wins over the old error and never returns an empty DTO',async()=>{const s=server({listStatus:404,onList:({setCookie})=>setCookie(B)});await assert.rejects(s.api.read(),e=>e instanceof NativeEmployeeInventoryError&&e.code==='native_local_inventory_session_changed');assert.deepEqual(s.calls.map(x=>x.url.split('/').at(-1)),['me','local-devices','me'])})
test('Cookie change after successful device data still rejects before publishing B data to A',async()=>{const s=server({onPairings:({setCookie})=>setCookie(B)});await assert.rejects(s.api.read(),e=>e.code==='native_local_inventory_session_changed');assert.equal(s.calls.at(-1).url,'/__pg_native/api/native-auth/me')})
test('real session rejection after a successful inventory prevents commit',async()=>{const s=server({meFailure:true});await assert.rejects(s.api.read(),e=>e.status===401&&e.code==='session_required')})
test('same owner new epoch and cloned snapshots cannot revive an earlier inventory',async()=>{const s=server(),v=await s.api.read();s.context({owner:A,epoch:1});assert.throws(()=>readNativeEmployeeInventory(v,s.scope()),/native_local_inventory_session_changed/);assert.throws(()=>readNativeEmployeeInventory(structuredClone(v),{owner:A,epoch:0}),/native_local_inventory_session_changed/);await assert.rejects(s.api.read(undefined,{owner:A,epoch:0}),/native_local_inventory_session_changed/)})
test('a false Native pairing flag cannot be inferred from a heartbeat',async()=>{const s=server({pairings:[{...pair(),paired:false}]});await assert.rejects(s.api.read(),/native_local_inventory_unknown/)})
test('a changing inventory remains unknown across revoke, heartbeat, version and catalog changes',async()=>{for(const change of [{revoked:true},{seen_ms:now+1},{version:2},{name:'新名称'},{catalog:[]}]){const s=server({list:n=>[{...device(),...(n===2?change:{})}]});await assert.rejects(s.api.read(),/native_local_inventory_changed/);assert.equal(s.calls.at(-1).url.endsWith('/me'),true)}})
test('missing, duplicate, foreign pairing IDs and malformed fields are rejected',async()=>{for(const pairings of [[],[pair(),pair()],[{...pair(),id:OTHER}],[{...pair(),paired:'true'}],[{...pair(),pairing_expires_ms:0}],[{...pair(),device_token:'a'.repeat(64)}]]){const s=server({pairings});await assert.rejects(s.api.read());assert.equal(s.calls.at(-1).url.endsWith('/me'),true)}})
test('catalog digest, UUID namespace, unknown fields and source credentials cannot enter a Native DTO',async()=>{for(const change of [{catalog_sha256:'0'.repeat(64)},{id:'A'.repeat(24)},{device_token:'a'.repeat(64)},{pairing_code:'b'.repeat(48)},{paired:true}]){const s=server({list:()=>[{...device(),...change}]});await assert.rejects(s.api.read());assert.equal(s.calls.at(-1).url.endsWith('/me'),true)}})
test('missing no-store or JSON headers rejects data without claiming an empty account',async()=>{for(const headers of [{'Cache-Control':'max-age=60'},{'Content-Type':'text/html'}]){const s=server({headers});await assert.rejects(s.api.read(),/native_local_inventory_unknown/);assert.equal(s.calls.at(-1).url.endsWith('/me'),true)}})
test('all non200 responses remain errors after the final owner check',async()=>{for(const listStatus of [401,403,404,409,503]){const s=server({listStatus});await assert.rejects(s.api.read(),e=>e.status===listStatus&&e.code==='native_local_not_found');assert.equal(s.calls.length,3)}})
test('PB-shaped or fabricated Native envelopes never acquire projection provenance',()=>{for(const value of [{items:[{id:'A'.repeat(24),paired:true,seen_ms:now}]},{backend:'native_pg',owner:A,epoch:0,items:[]},null])assert.throws(()=>readNativeEmployeeInventory(value,{owner:A,epoch:0}),/native_local_inventory_session_changed/)})
