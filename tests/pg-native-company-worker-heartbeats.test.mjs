// Pure transport/contract checks. Response/ReadableStream are real; transport never uses network.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {workerHeartbeatKinds} from '../services/pg-api/src/worker-heartbeat-contract.ts'
import {createPgNativeCompanyWorkerHeartbeatsApi, parsePgNativeCompanyWorkerHeartbeats,
  parseCompanyWorkerHeartbeatsJson, PgNativeCompanyWorkerHeartbeatsError} from '../src/lib/pgNativeCompanyWorkerHeartbeats.ts'

const at='2026-10-29T01:02:03.000Z'
const snapshot=(extra={})=>({protocol:'native_company_worker_heartbeats_v1',scope:'company_worker_metadata_only',as_of:at,stale_after_ms:90000,
  workers:workerHeartbeatKinds.map(kind=>({kind,state:'unknown',last_seen_at:null,reason:'not_observed'})),...extra})
const wire=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const error=(status,code)=>value=>value instanceof PgNativeCompanyWorkerHeartbeatsError&&value.status===status&&(!code||value.code===code)

test('one frozen GET API uses the exact canonical path, opaque cookie and no identity/body/query',async()=>{
  for(const rootPath of ['', '/__pg_native']){
    const seen=[],api=createPgNativeCompanyWorkerHeartbeatsApi({rootPath,transport:async(url,init)=>{seen.push({url,init});return wire(snapshot())}})
    assert.deepEqual(Object.keys(api),['getCompanyWorkerHeartbeats']);assert.equal(Object.isFrozen(api),true)
    const value=await api.getCompanyWorkerHeartbeats();assert.equal(Object.isFrozen(value),true);assert.equal(Object.isFrozen(value.workers),true)
    assert.equal(seen[0].url,rootPath+'/api/v2/company-worker-heartbeats')
    assert.equal(seen[0].init.method,'GET');assert.equal(seen[0].init.body,undefined)
    assert.equal(seen[0].init.credentials,'same-origin');assert.equal(seen[0].init.redirect,'error');assert.equal(seen[0].init.cache,'no-store')
    assert.equal(seen[0].init.referrerPolicy,'no-referrer');assert.deepEqual(seen[0].init.headers,{Accept:'application/json'})
    assert.ok(seen[0].init.signal instanceof AbortSignal)
  }
})
test('arbitrary roots, identity/options, unsafe budgets and accessors fail before transport',async()=>{
  let calls=0,getters=0;const transport=async()=>{calls++;return wire(snapshot())}
  for(const rootPath of ['https://company.invalid','//company.invalid','/','/__pg_native/','?owner=x',null])
    assert.throws(()=>createPgNativeCompanyWorkerHeartbeatsApi({transport,rootPath}),error(400))
  for(const config of [{owner:'PRIVATE'},{headers:{}},{body:{}},{timeoutMs:0},{timeoutMs:8001},{timeoutMs:0.5},{transport:null}])
    assert.throws(()=>createPgNativeCompanyWorkerHeartbeatsApi({transport,...config}),error(400))
  const accessor=Object.defineProperty({},'rootPath',{enumerable:true,get(){getters++;return ''}})
  assert.throws(()=>createPgNativeCompanyWorkerHeartbeatsApi(accessor),error(400))
  const api=createPgNativeCompanyWorkerHeartbeatsApi({transport})
  for(const option of [{owner_id:'PRIVATE'},{headers:{}},{signal:{}},null,[],{query:''}])await assert.rejects(()=>api.getCompanyWorkerHeartbeats(option),error(400))
  assert.equal(calls,0);assert.equal(getters,0)
})
test('already cancelled reads cannot send and cancellation is observed if transport ignores it',async()=>{
  let calls=0;const controller=new AbortController();controller.abort()
  const api=createPgNativeCompanyWorkerHeartbeatsApi({transport:async()=>{calls++;return new Promise(()=>{})}})
  await assert.rejects(()=>api.getCompanyWorkerHeartbeats({signal:controller.signal}),error(0));assert.equal(calls,0)
  const next=new AbortController(),pending=api.getCompanyWorkerHeartbeats({signal:next.signal});next.abort()
  await assert.rejects(()=>pending,error(0));assert.equal(calls,1)
})
test('server time/state rules preserve all eight ordered kinds and unknown/stale/draining',()=>{
  const data=snapshot();data.workers[0]={kind:'prepare',state:'ready',reason:'fresh_ready_report',last_seen_at:at}
  data.workers[1]={kind:'model',state:'draining',reason:'fresh_draining_report',last_seen_at:at}
  data.workers[2]={kind:'workflow_safe',state:'stale',reason:'heartbeat_expired',last_seen_at:'2026-10-29T01:00:33.000Z'}
  const result=parsePgNativeCompanyWorkerHeartbeats(data)
  assert.deepEqual(result.workers.map(row=>row.state),['ready','draining','stale','unknown','unknown','unknown','unknown','unknown'])
  assert.deepEqual(result.workers.map(row=>row.kind),workerHeartbeatKinds)
  const invalid=[]
  invalid.push(snapshot({workers:data.workers.slice(1)}),snapshot({workers:[...data.workers].reverse()}),snapshot({stale_after_ms:90001}),snapshot({owner:'PRIVATE'}))
  invalid.push(snapshot({workers:data.workers.map((r,i)=>i===0?{...r,last_seen_at:'2026-10-29T01:00:33.000Z'}:r)}))
  invalid.push(snapshot({workers:data.workers.map((r,i)=>i===3?{...r,ready:true}:r)}))
  for(const value of invalid)assert.throws(()=>parsePgNativeCompanyWorkerHeartbeats(value),error(503))
  let invoked=false;const accessor=Object.defineProperty(snapshot(),'as_of',{enumerable:true,get(){invoked=true;return at}})
  assert.throws(()=>parsePgNativeCompanyWorkerHeartbeats(accessor),error(503));assert.equal(invoked,false)
})
test('duplicate JSON keys, escaped aliases, private extras and malformed JSON never become a snapshot',()=>{
  for(const text of ['{"protocol":"x","pr\\u006ftocol":"y"}','{"workers":[{"kind":"prepare","kind":"model"}]}',
    '\ufeff'+JSON.stringify(snapshot()),JSON.stringify(snapshot({sql:'PRIVATE'})),'{}{}','not JSON','0'.repeat(16385)])
    assert.throws(()=>parseCompanyWorkerHeartbeatsJson(text),error(503,'invalid_company_worker_heartbeats_response'))
})
test('401/403 survive corrupt unread error bodies; 503 and other failure details remain fixed',async()=>{
  for(const status of [401,403,503,500,404,204]){
    let reads=0;const body=new ReadableStream({pull(){reads++}})
    const response=status===204?new Response(null,{status}):new Response(body,{status})
    const api=createPgNativeCompanyWorkerHeartbeatsApi({transport:async()=>response})
    await assert.rejects(()=>api.getCompanyWorkerHeartbeats(),caught=>error(status===401||status===403?status:503)(caught)&&!caught.message.includes('PRIVATE'))
    assert.ok(reads<=1) // a stream may prefill; no body is consumed for failure interpretation.
  }
})
test('wire rejects wrong MIME, misleading length, redirects, invalid UTF8 and oversized streaming bytes',async()=>{
  const inputs=[new Response(JSON.stringify(snapshot()),{headers:{'Content-Type':'text/plain'}}),
    new Response(JSON.stringify(snapshot()),{headers:{'Content-Type':'application/json','Content-Length':'16385'}}),
    new Response(JSON.stringify(snapshot()),{headers:{'Content-Type':'application/json','Content-Length':'2,3'}}),
    new Response(new Uint8Array([0xff]),{headers:{'Content-Type':'application/json'}}),
    new Response(new Uint8Array([0xef,0xbb,0xbf,...new TextEncoder().encode(JSON.stringify(snapshot()))]),{headers:{'Content-Type':'application/json'}}),
    new Response(' '.repeat(16385),{headers:{'Content-Type':'application/json','Content-Length':'1'}})]
  const redirected=wire(snapshot());Object.defineProperty(redirected,'redirected',{value:true});inputs.push(redirected)
  for(const response of inputs){const api=createPgNativeCompanyWorkerHeartbeatsApi({transport:async()=>response});await assert.rejects(()=>api.getCompanyWorkerHeartbeats(),error(503))}
})
test('deadline covers an ignored fetch, a stalled body and synchronous work, with no late success',async()=>{
  for(const transport of [async()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{})}}),{headers:{'Content-Type':'application/json'}}),
    async()=>{const end=performance.now()+15;while(performance.now()<end){}return wire(snapshot())}]){
    const api=createPgNativeCompanyWorkerHeartbeatsApi({timeoutMs:5,transport}),start=performance.now()
    await assert.rejects(()=>api.getCompanyWorkerHeartbeats(),error(0));assert.ok(performance.now()-start<1000)
  }
})
test('browser imports are value-only contracts/helpers and contain no runtime/credential/storage path',()=>{
  const source=readFileSync(new URL('../src/lib/pgNativeCompanyWorkerHeartbeats.ts',import.meta.url),'utf8')
  assert.deepEqual([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]),
    ['../../services/pg-api/src/worker-heartbeat-contract.ts','./pgNativeCompanyOverview.ts'])
  assert.doesNotMatch(source,/node:|\bBuffer\b|process\.|localStorage|sessionStorage|Bearer|X-Rh|owner_user_id/)
  assert.doesNotMatch(readFileSync(new URL('../services/pg-api/src/worker-heartbeat-contract.ts',import.meta.url),'utf8'),/^import\s/m)
})
