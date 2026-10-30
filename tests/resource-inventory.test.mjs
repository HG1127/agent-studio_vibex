import test from 'node:test'
import assert from 'node:assert/strict'
import {readResourceInventory} from '../src/lib/resourceInventory.ts'
import {guideResourceAccess} from '../src/lib/resourceAccessGuide.ts'
const device={id:'a'.repeat(24),name:'本机测试',revoked:false,seen_ms:Date.now(),catalog:'[]',paired:true,pairing_expires_ms:0}
const args=()=>({baseUrl:'https://studio.example/__pb',owner:'employee-a',ownerNow:()=> 'employee-a',headers:{Authorization:'test-only'},signal:new AbortController().signal})
const response=(items,status=200)=>new Response(JSON.stringify({items}),{status,headers:{'Content-Type':'application/json'}})
test('resource refresh is GET-only and one failed provider does not hide a valid device',async()=>{
 const calls=[]
 const snapshot=await readResourceInventory({...args(),request:async(url,options)=>{
  calls.push({url,method:options.method,body:options.body})
  return url.endsWith('/api/local-devices')?response([device]):url.endsWith('/api/market/connections')?response([],503):response([])
 }})
 assert.equal(calls.length,3);assert.ok(calls.every(call=>call.method==='GET'&&call.body===undefined))
 assert.deepEqual(snapshot.known,{http:true,market:false,devices:true})
 assert.equal(snapshot.devices.length,1);assert.equal(snapshot.errors.length,1)
 assert.equal(guideResourceAccess('local',[],1,snapshot.known).reuseCount,1)
 assert.equal(guideResourceAccess('local',[],1,snapshot.known).needsLocal,false)
 assert.equal(JSON.stringify(snapshot).includes('test-only'),false)
})
test('malformed or unavailable device inventory is unknown, never an instruction to install again',async()=>{
 const snapshot=await readResourceInventory({...args(),request:async url=>url.endsWith('/api/local-devices')?response([{...device,id:'bad'}]):response([])})
 assert.equal(snapshot.known.devices,false);assert.equal(snapshot.devicesLoaded,false)
 assert.equal(guideResourceAccess('local',[],0,snapshot.known).needsLocal,false)
 assert.match(guideResourceAccess('local',[],0,snapshot.known).reason,/核实/)
})
test('a late response from an old employee cannot become the current employee resource list',async()=>{
 let owner='employee-a'
 await assert.rejects(()=>readResourceInventory({...args(),ownerNow:()=>owner,request:async()=>{owner='employee-b';return response([])}}),/resource_owner_changed/)
 let requests=0
 await assert.rejects(()=>readResourceInventory({...args(),ownerNow:()=> 'employee-b',request:async()=>{requests++;return response([])}}),/resource_owner_changed/)
 assert.equal(requests,0)
})
test('cancellation rejects a late catalog and refresh never performs an execution probe',async()=>{
 const abort=new AbortController()
 await assert.rejects(()=>readResourceInventory({...args(),signal:abort.signal,request:async()=>{abort.abort();return response([])}}),{name:'AbortError'})
})
test('partial known tool catalogs remain reusable without promoting unknown sources to ready',()=>{
 const http={id:'abcdefghijklmno',title:'已测网页工具',kind:'browser',source:'http',state:'tested'}
 const mcp={...http,id:'b'.repeat(15),source:'mcp',state:'discovered'}
 const guide=guideResourceAccess('web',[http,mcp],0,{http:true,market:false,devices:false})
 assert.equal(guide.reuseCount,1);assert.equal(guide.routes.filter(r=>r.label.startsWith('核对')).length,1)
 assert.match(guide.reason,/部分/)
 assert.equal(guideResourceAccess('web',[http],0,false).reuseCount,0)
})
